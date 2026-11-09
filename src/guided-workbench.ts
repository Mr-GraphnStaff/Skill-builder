import * as vscode from 'vscode';
import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { currentWorkbenchMetrics, emitWorkbenchMetric, withWorkbenchMetrics, type WorkbenchMetric } from './workbench-metrics.js';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { getWorkspaceConnection } from './guided-workspace.js';
import { readFileSync } from 'node:fs';
import { GuidedWorkbenchController } from './guided-controller.js';
import { renderGuidedWorkbench, renderGuidedLauncher } from './guided-workbench-html.js';
import { GuidedMessage } from './guided-contract.js';
import { createGitHubSessionRunner } from './github-session.js';
import { stableWorkspaceRoot } from './stable-workspace.js';
import { activityForAction, actionNeedsInput } from './guided-activity.js';
import { connectRepositoryFlow, normalizeGitHubRepository } from './repository-connection-flow.js';
import { cloneSelectedRepository, validateSelectedRepository } from './managed-repository.js';
import { assertWorkbenchPath } from './repository-connection-security.js';
import { withWorkbenchGitCredentials } from './repository-credentials.js';

export function activateGuidedWorkbench(context: vscode.ExtensionContext, hooks: { getRoot(): Promise<string | undefined> }) {
  const brand = {
    productName: String(context.extension.packageJSON.displayName ?? 'SkillJetty').split(' — ')[0],
    descriptor: `Release ${String(context.extension.packageJSON.version ?? '')}`,
    tagline: 'Build it. Improve it. Share it.',
    logoDataUri: `data:image/png;base64,${readFileSync(path.join(context.extensionPath, 'images', 'icon.png')).toString('base64')}`
  };
  let panel: vscode.WebviewPanel | undefined;
  let controller: GuidedWorkbenchController | undefined;
  let opening: Promise<void> | undefined;
  let handling: Promise<void> = Promise.resolve();
  let configurationGeneration = 0;
  type EditorBuffer = Pick<GuidedMessage, 'editorSkillId' | 'editorPath' | 'editorContent'>;
  const bufferRequests = new Map<string, { panel: vscode.WebviewPanel; controller: GuidedWorkbenchController; resolve(value: EditorBuffer): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  const configChange = vscode.workspace.onDidChangeConfiguration?.(event => { if (event.affectsConfiguration('skillBuilder')) ++configurationGeneration; });
  if (configChange) context.subscriptions.push(configChange);
  let operationTiming: { waitMs: number; waitingSince?: number } | undefined;
  const activityLog = vscode.window.createOutputChannel('SkillJetty — Performance');
  context.subscriptions.push(activityLog);
  type MetricContext = { action: string; operationId: string };
  const metricContexts = new WeakMap<GuidedWorkbenchController, MetricContext>();
  const logMetric = (metric: WorkbenchMetric, context: MetricContext) => emitWorkbenchMetric(clean => {
    activityLog.appendLine(JSON.stringify({ time: new Date().toISOString(), ...context, ...clean }));
  }, metric);
  context.subscriptions.push(vscode.commands.registerCommand('skillBuilder.showPerformanceLog', () => activityLog.show(true)));
  const nonce = () => randomBytes(24).toString('base64');
  const render = () => {
    if (panel && controller) {
      const started = performance.now();
      panel.webview.html = renderGuidedWorkbench(controller.state, nonce(), brand);
      logMetric({ stage: 'webviewRender', durationMs: performance.now() - started, outcome: 'ok' }, metricContexts.get(controller)!);
    }
  };
  const pickerRoot = async (requested?: string): Promise<string> => {
    let selected = requested;
    if (!selected) {
      const root = await hooks.getRoot();
      try { selected = root ? getWorkspaceConnection(root)?.localPath : undefined; } catch { /* Setup UI reports invalid connection metadata. */ }
    }
    selected ??= vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return selected && !selected.split(/[\\/]/).some(part => part.toLowerCase() === '.codex') ? selected : homedir();
  };
  const pick = async (kind: 'package' | 'folder' | 'file', initialPath?: string) => (await vscode.window.showOpenDialog({
    title: kind === 'package' ? 'Open a .skill package' : kind === 'folder' ? 'Open a skill folder' : 'Add a supporting file',
    defaultUri: vscode.Uri.file(await pickerRoot(initialPath)),
    canSelectMany: false, canSelectFiles: kind !== 'folder', canSelectFolders: kind === 'folder',
    ...(kind === 'package' ? { filters: { 'Skill packages': ['skill'] } } : {})
  }))?.[0]?.fsPath;

  const saveExternalEdits = async () => {
    const root = await hooks.getRoot(); if (!root) return;
    let localRepository: string | undefined;
    try { localRepository = getWorkspaceConnection(root)?.localPath; } catch { /* Invalid optional repository metadata must not block local editing. Pull validates it separately. */ }
    const managedRoots = [path.join(root, 'skills'), ...(localRepository ? [localRepository] : [])];
    for (const document of vscode.workspace.textDocuments) {
      const managedDocument = managedRoots.some(folder => {
        const relative = path.relative(folder, document.uri.fsPath);
        return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
      });
      if (document.isDirty && document.uri.scheme === 'file' && managedDocument) {
        if (!await document.save()) throw new Error('A skill file could not be saved. Keep your editor open and save it before continuing.');
      }
    }
  };
  const processMessage = async (input: unknown) => {
    if (!controller || !panel || !input || typeof input !== 'object') return;
    const message = input as GuidedMessage;
    if (typeof message.action !== 'string' || (message.payload !== undefined && (!message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)))) return;
    if (message.action === 'ready') return; // Initial loading is owned by the host.
    const activePanel = panel;
    const activeController = controller;
    const generation = configurationGeneration;
    const started = Date.now();
    operationTiming = { waitMs: 0 };
    const metricContext = metricContexts.get(activeController)!;
    metricContext.action = activityForAction(message.action); metricContext.operationId = randomUUID();
    const memoryBefore = process.memoryUsage();
    const heartbeat = message.action === 'save' ? undefined : setInterval(() => {
      if (panel === activePanel && controller === activeController) {
        void activePanel.webview.postMessage({ type: 'heartbeat' }).then(() => undefined, () => undefined);
      }
    }, 2000);
    try {
      if (message.action !== 'save') {
        await activePanel.webview.postMessage({ type: 'progress', message: activityForAction(message.action), waitingForInput: actionNeedsInput(message.action) });
        // Deliver feedback before synchronous local work can occupy this host.
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      if (['configureRepository', 'pullRepository', 'check', 'preparePublish', 'publish', 'savePackage', 'openRepositorySkill', 'openFolder', 'openPackage', 'openPackagePath'].includes(message.action)) await saveExternalEdits();
      if (panel !== activePanel || controller !== activeController) return;
      const operationContext = { ...metricContext };
      if (message.action === 'configureRepository' || message.action === 'connectRepository' || message.action === 'setRepositoryFolder') {
        await configureConnection(activeController, activePanel, generation, message);
      } else {
        const needsGit = ['verifyRepository', 'pullRepository', 'publish'].includes(message.action);
        await withWorkbenchMetrics(metric => logMetric(metric, operationContext), async () => {
          if (!needsGit || !activeController.state.connection || !/^https:\/\/github\.com\//i.test(activeController.state.connection.repository)) return activeController.dispatch(message);
          const connectionFile = assertWorkbenchPath(activeController.state.workFolder!, path.join(activeController.state.workFolder!, '.skill-workbench', 'connection.json'));
          const connectionBeforeSignIn = readFileSync(connectionFile, 'utf8');
          const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
          if (!session || generation !== configurationGeneration || panel !== activePanel || controller !== activeController) throw new Error('The connection or workbench changed during GitHub sign-in. Your draft was preserved.');
          if (readFileSync(connectionFile, 'utf8') !== connectionBeforeSignIn) throw new Error('Another window changed the repository during GitHub sign-in. That connection was preserved; retry the action.');
          return withWorkbenchGitCredentials(activeController.state.workFolder!, session.accessToken, () => activeController.dispatch(message));
        });
      }
    } catch (error) { activeController.state.error = error instanceof Error ? error.message : String(error); }
    finally { clearInterval(heartbeat); }
    const elapsed = Date.now() - started;
    const waitingMs = operationTiming.waitMs + (operationTiming.waitingSince === undefined ? 0 : Date.now() - operationTiming.waitingSince);
    const processingMs = Math.max(0, elapsed - waitingMs);
    operationTiming = undefined;
    logMetric({ stage: 'pickerWait', durationMs: waitingMs, outcome: 'ok' }, metricContext);
    logMetric({ stage: 'operationTotal', durationMs: elapsed, outcome: activeController.state.error ? 'error' : 'ok' }, metricContext);
    // No skill names, contents, file paths, repository URLs or credentials.
    const memoryAfter = process.memoryUsage();
    activityLog.appendLine(`${new Date().toISOString()} action=${activityForAction(message.action)} durationMs=${processingMs} hostHeapUsedBytes=${memoryAfter.heapUsed} hostHeapDeltaBytes=${memoryAfter.heapUsed - memoryBefore.heapUsed} hostExternalBytes=${memoryAfter.external} outcome=${activeController.state.error ? 'error' : 'completed'} totalDurationMs=${elapsed} inputWaitMs=${waitingMs}`);
    if (panel !== activePanel || controller !== activeController) return;
    if (message.action === 'save') {
      await activePanel.webview.postMessage({ type: 'saved', notice: activeController.state.notice, error: activeController.state.error });
    } else {
      const completion = activeController.state.error ? 'Needs attention. See the details below.' : `Finished in ${(processingMs / 1000).toFixed(1)} seconds.`;
      activeController.state.progress = completion;
      await activePanel.webview.postMessage({ type: 'operationComplete', error: activeController.state.error, message: completion, activity: activeController.state.activity, activityGeneration: activeController.state.activityGeneration });
      render();
    }
  };
  const configureConnection = async (owner: GuidedWorkbenchController, ownerPanel: vscode.WebviewPanel, generation: number, message: GuidedMessage) => {
    const root = owner.state.workFolder;
    if (!root) throw new Error('Choose your workbench folder first, then connect a repository. Your workbench holds SkillJetty drafts, builds and recovery; your Git repository is chosen separately.');
    const readConnectionRecord = () => {
      try { return readFileSync(assertWorkbenchPath(root, path.join(root, '.skill-workbench', 'connection.json')), 'utf8'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
    };
    let expectedRecord = readConnectionRecord();
    const assertCurrent = () => {
      if (panel !== ownerPanel || controller !== owner || configurationGeneration !== generation) {
        throw new Error('The workbench or settings changed during connection setup. Your previous connection and drafts are preserved. Start Connect repository again.');
      }
      stableWorkspaceRoot(root);
      if (readConnectionRecord() !== expectedRecord) throw new Error('Another window changed the repository connection during setup. That connection and your drafts are preserved. Start Change connection again.');
    };
    assertCurrent();
    // Persist the carried editor buffer before a modal picker can hide the webview.
    if (message.editorSkillId && message.editorPath && typeof message.editorContent === 'string') {
      await owner.dispatch({ ...message, action: 'save' });
      if (owner.state.error) throw new Error(owner.state.error);
    }
    owner.state.error = undefined;
    let token: string | undefined;
    const authenticated = async <T>(operation: () => Promise<T>) => {
      assertCurrent();
      if (!token) {
        const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
        assertCurrent();
        if (!session) throw new Error('GitHub sign-in was canceled. Your previous connection is unchanged.');
        token = session.accessToken;
      }
      return withWorkbenchGitCredentials(root, token, async () => { assertCurrent(); return operation(); });
    };
    const progress = async (text: string, waitingForInput: boolean) => {
      assertCurrent();
      await ownerPanel.webview.postMessage({ type: 'progress', message: text, waitingForInput });
    };
    const connected = await connectRepositoryFlow({
      workbenchFolder: root,
      currentRepository: typeof message.payload?.repository === 'string' ? message.payload.repository : owner.state.form?.repository ?? owner.state.connection?.repository,
      currentLocalRepository: owner.state.connection?.localPath,
      assertCurrent,
      inputRepository: async current => {
        await progress('Enter the GitHub repository in the VS Code input box.', true);
        return vscode.window.showInputBox({ title: 'Connect repository · 1 of 3', prompt: 'GitHub repository URL or owner/repository',
          placeHolder: 'https://github.com/your-org/your-repo', value: current,
          validateInput: value => { if (!value.trim()) return 'Enter the repository you want to connect.'; try { normalizeGitHubRepository(value); return undefined; } catch (error) { return (error as Error).message; } } });
      },
      chooseLocalMode: async () => {
        await progress('Choose an existing local repository or create a local copy.', true);
        return (await vscode.window.showQuickPick([
          { label: 'Use an existing local repository', description: 'Choose its folder. SkillJetty checks that it matches GitHub.', mode: 'existing' as const },
          { label: 'Create a local copy', description: 'Choose a parent folder. SkillJetty downloads the repository for you.', mode: 'clone' as const }
        ], { title: 'Connect repository · 2 of 3', placeHolder: 'Where will your skills and ZIP files live?' }))?.mode;
      },
      chooseFolder: async (mode, suggested) => {
        await progress(mode === 'clone' ? 'Choose the parent folder for your new local repository.' : 'Choose the local Git repository folder.', true);
        return (await vscode.window.showOpenDialog({ title: mode === 'clone' ? 'Create local copy — choose a parent folder' : 'Choose existing local Git repository',
          defaultUri: vscode.Uri.file(await pickerRoot(suggested ? mode === 'clone' ? path.dirname(suggested) : suggested : path.dirname(root))),
          canSelectFiles: false, canSelectFolders: true, canSelectMany: false }))?.[0]?.fsPath;
      },
      validateExisting: async (repository, localPath) => {
        await progress('Checking the local repository. Existing files will not be changed.', false);
        await authenticated(() => validateSelectedRepository(root, repository, localPath));
      },
      confirm: async choice => {
        await progress('Review the connection in the VS Code confirmation dialog.', true);
        const action = choice.clone ? 'Create local copy and connect' : 'Connect repository';
        return await vscode.window.showInformationMessage('Connect this repository?', { modal: true,
          detail: `Workbench folder (drafts, builds and recovery):\n${choice.workbenchFolder}\n\nLocal repository (skills and ZIPs):\n${choice.localPath}\n\nRemote repository:\n${choice.repository}\n\n${choice.clone ? 'A new local copy will be downloaded into the displayed folder.' : 'The existing local repository will be connected without pulling or changing its files.'}\nYour existing drafts and earlier uploads stay where they are. Nothing is uploaded.` }, action) === action;
      },
      clone: async (repository, localPath) => {
        await progress('Creating your local repository copy…', false);
        await authenticated(() => cloneSelectedRepository(root, repository, localPath, text => { void progress(text, false).catch(() => undefined); }, assertCurrent));
      },
      activate: async (repository, localPath) => {
        await progress('Verifying and saving the complete repository connection…', false);
        await authenticated(() => owner.acceptRepositoryConnection(repository, localPath, assertCurrent));
        expectedRecord = readConnectionRecord();
      }
    });
    assertCurrent();
    if (connected) {
      ++configurationGeneration;
      owner.state.notice = 'Repository connected. Your workbench stays in its folder; your local repository is ready to sync with GitHub.';
    } else owner.state.notice = 'Connection setup canceled. Your previous connection and files are unchanged.';
  };

  const handle = (input: unknown) => {
    if (input && typeof input === 'object' && (input as { action?: unknown }).action === 'editorBufferCaptured') {
      const response = input as Record<string, unknown>, requestId = response.requestId;
      if (typeof requestId !== 'string') return Promise.resolve();
      const pending = bufferRequests.get(requestId); if (!pending) return Promise.resolve();
      clearTimeout(pending.timer); bufferRequests.delete(requestId);
      if (panel !== pending.panel || controller !== pending.controller) { pending.reject(new Error('The workbench changed before its editor buffer was captured.')); return Promise.resolve(); }
      const fields = ['editorSkillId', 'editorPath', 'editorContent'] as const;
      if (fields.every(key => response[key] === undefined)) pending.resolve({});
      else if (fields.every(key => typeof response[key] === 'string') && Buffer.byteLength(response.editorContent as string, 'utf8') <= 16 * 1024 * 1024) pending.resolve({ editorSkillId: response.editorSkillId as string, editorPath: response.editorPath as string, editorContent: response.editorContent as string });
      else pending.reject(new Error('The editor buffer could not be read safely. Your draft was preserved.'));
      return Promise.resolve();
    }
    const operation = handling.then(() => processMessage(input));
    handling = operation.then(() => undefined, () => undefined);
    return operation;
  };
  const open = async () => {
    if (panel) { panel.reveal(vscode.ViewColumn.One); return; }
    if (opening) return opening;
    opening = (async () => {
      const started = Date.now();
      const memoryBefore = process.memoryUsage().heapUsed;
      const root = await hooks.getRoot();
      panel = vscode.window.createWebviewPanel('skillBuilder.guidedWorkbench', brand.productName, vscode.ViewColumn.One, {
        enableScripts: true, retainContextWhenHidden: true, localResourceRoots: []
      });
      const createdPanel = panel;
      const createdMetrics: MetricContext = { action: 'startup', operationId: randomUUID() };
      const createdController = new GuidedWorkbenchController(root, {
        onMetric: metric => logMetric(metric, createdMetrics),
        github: createGitHubSessionRunner(async () => {
          const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
          return session.accessToken;
        }),
        connectGitHub: async () => {
          const started = performance.now(); let outcome: 'ok' | 'error' = 'error';
          try {
            const session = await vscode.authentication.getSession('github', ['repo'], { forceNewSession: { detail: 'Choose the GitHub account with access to your connected skill repository. This account is managed by VS Code.' }, clearSessionPreference: true });
            outcome = 'ok'; return session.account.label;
          } finally { emitWorkbenchMetric(currentWorkbenchMetrics(), { stage: 'authentication', operation: 'switchSession', durationMs: performance.now() - started, outcome }); }
        },
        chooseRepositoryFolder: async current => (await vscode.window.showOpenDialog({
          title: 'Choose the actual local skills repository folder', defaultUri: vscode.Uri.file(await pickerRoot(current)),
          canSelectFiles: false, canSelectFolders: true, canSelectMany: false
        }))?.[0]?.fsPath,
        onRepositoryVerification: verification => {
          if (panel === createdPanel && controller === createdController) void createdPanel.webview.postMessage({ type: 'repositoryVerification', verification }).then(() => undefined, () => undefined);
        },
        pickPackage: () => pick('package'), pickFolder: initialPath => pick('folder', initialPath), pickFile: () => pick('file'),
        chooseWorkspace: async () => {
          const folder = (await vscode.window.showOpenDialog({ title: 'Choose the workbench folder for SkillJetty background work', defaultUri: vscode.Uri.file(await pickerRoot(controller?.state.workFolder)), canSelectFiles: false, canSelectFolders: true, canSelectMany: false }))?.[0];
          if (folder) {
            const selectedRoot = stableWorkspaceRoot(folder.fsPath);
            if (vscode.workspace.workspaceFolders?.length) await vscode.workspace.getConfiguration('skillBuilder').update('projectRoot', selectedRoot, vscode.ConfigurationTarget.Workspace);
            else void vscode.commands.executeCommand('vscode.openFolder', folder, false);
          }
          return folder ? stableWorkspaceRoot(folder.fsPath) : undefined;
        },
        openLink: async url => { await vscode.env.openExternal(vscode.Uri.parse(url)); },
        revealFile: async file => { await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(file)); },
        onState: state => {
          if (operationTiming) {
            if (state.waitingForInput && operationTiming.waitingSince === undefined) operationTiming.waitingSince = Date.now();
            else if (!state.waitingForInput && operationTiming.waitingSince !== undefined) {
              operationTiming.waitMs += Date.now() - operationTiming.waitingSince;
              operationTiming.waitingSince = undefined;
            }
          }
          if (panel === createdPanel && controller === createdController) {
            void createdPanel.webview.postMessage({ type: 'progress', message: state.progress ?? '', waitingForInput: state.waitingForInput === true, activity: state.activity, activityGeneration: state.activityGeneration }).then(() => undefined, () => undefined);
          }
        }
      });
      metricContexts.set(createdController, createdMetrics);
      controller = createdController;
      context.subscriptions.push(createdPanel.webview.onDidReceiveMessage(message => { if (panel !== createdPanel || controller !== createdController) return Promise.resolve(); return handle(message); }), createdPanel.onDidDispose(() => { if (panel === createdPanel) { panel = undefined; controller = undefined; } }));
      // Initialize connection metadata before the first document. Startup has
      // no scan and must not send progress that can arrive in a later document.
      await createdController.dispatch({ action: 'ready' });
      if (panel === createdPanel && controller === createdController) {
        render();
        // Initial repository verification runs after first paint and does not
        // serialize or block local file opening/editing.
        const verificationContext = { action: 'startupRepositoryVerification', operationId: randomUUID() };
        void withWorkbenchMetrics(metric => logMetric(metric, verificationContext), () => createdController.verifyRepository());
      }
      const memory = process.memoryUsage();
      activityLog.appendLine(`${new Date().toISOString()} action=OpenWorkbench durationMs=${Date.now() - started} hostHeapUsedBytes=${memory.heapUsed} hostHeapDeltaBytes=${memory.heapUsed - memoryBefore} hostExternalBytes=${memory.external} outcome=${createdController.state.error ? 'error' : 'completed'}`);
    })();
    try { await opening; } finally { opening = undefined; }
  };
  context.subscriptions.push(vscode.commands.registerCommand('skillBuilder.openWorkbench', open));
  context.subscriptions.push(vscode.commands.registerCommand('skillBuilder.configureRepository', async () => {
    await open(); if (!panel || !controller) return;
    const activePanel = panel, activeController = controller;
    const requestId = randomUUID();
    const buffer = await new Promise<EditorBuffer>((resolve, reject) => {
      const timer = setTimeout(() => { bufferRequests.delete(requestId); reject(new Error('The workbench did not return its current edit. Your draft is preserved. Retry when the workbench is ready.')); }, 5000);
      bufferRequests.set(requestId, { panel: activePanel, controller: activeController, resolve, reject, timer });
      void activePanel.webview.postMessage({ type: 'captureEditorBuffer', requestId }).then(sent => {
        if (!sent) { clearTimeout(timer); bufferRequests.delete(requestId); reject(new Error('The workbench is not ready. No connection changed.')); }
      }, () => { clearTimeout(timer); bufferRequests.delete(requestId); reject(new Error('The workbench is unavailable. No connection changed.')); });
    });
    if (panel !== activePanel || controller !== activeController) throw new Error('The workbench changed. No connection changed.');
    return handle({ action: 'configureRepository', ...buffer });
  }));
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('skillBuilder.guidedLauncher', {
    resolveWebviewView(view) {
      view.webview.options = { enableScripts: true, localResourceRoots: [] };
      view.webview.html = renderGuidedLauncher(nonce(), brand);
      context.subscriptions.push(view.webview.onDidReceiveMessage(async message => { if (message?.action === 'openWorkbench') await open(); }));
      // Selecting the activity icon is a second visible entry point. Reopening
      // an existing panel reveals it instead of spawning duplicate sessions.
      void open();
      context.subscriptions.push(view.onDidChangeVisibility(() => { if (view.visible) void open(); }));
    }
  }));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
    if (!controller?.state.active || !controller.state.editor || controller.state.busy) return;
    const root = controller.state.editor.path;
    if (document.uri.scheme === 'file' && document.uri.fsPath.endsWith(path.join(controller.state.active.name, root))) {
      // A desktop editor's saved content should become visible on the next
      // explicit check/refresh; never overwrite an active webview buffer here.
      controller.state.notice = 'A file was saved in another editor. Refresh before continuing to load external changes.';
    }
  }));
}
