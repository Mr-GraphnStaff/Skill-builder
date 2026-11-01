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
import { prereleaseWorkspaceRoot } from './prerelease-workspace.js';
import { activityForAction, actionNeedsInput } from './guided-activity.js';
import { isExplicitSetting, readNativeRepositorySettings, PREVIEW_REPOSITORY_KEY, PREVIEW_LOCAL_REPOSITORY_KEY } from './native-settings.js';
import { selectRepositorySettings } from './repository-settings.js';

export function activateGuidedWorkbench(context: vscode.ExtensionContext, hooks: { getRoot(): Promise<string | undefined> }) {
  const brand = {
    productName: String(context.extension.packageJSON.displayName ?? 'SkillJetty').split(' — ')[0],
    descriptor: `Public pre-release ${String(context.extension.packageJSON.version ?? '')} · isolated .skilljetty-prerelease workspace`,
    tagline: 'Build it. Improve it. Share it.',
    logoDataUri: `data:image/png;base64,${readFileSync(path.join(context.extensionPath, 'images', 'icon.png')).toString('base64')}`
  };
  let panel: vscode.WebviewPanel | undefined;
  let controller: GuidedWorkbenchController | undefined;
  let opening: Promise<void> | undefined;
  let handling: Promise<void> = Promise.resolve();
  let configurationGeneration = 0;
  let workFolderGeneration = 0;
  let rootNeedsReopen = false;
  type EditorBuffer = Pick<GuidedMessage, 'editorSkillId' | 'editorPath' | 'editorContent'>;
  const bufferRequests = new Map<string, { panel: vscode.WebviewPanel; controller: GuidedWorkbenchController; resolve(value: EditorBuffer): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  let operationTiming: { waitMs: number; waitingSince?: number } | undefined;
  const activityLog = vscode.window.createOutputChannel('SkillJetty — Pre-release Performance');
  context.subscriptions.push(activityLog);
  type MetricContext = { action: string; operationId: string };
  const metricContexts = new WeakMap<GuidedWorkbenchController, MetricContext>();
  const logMetric = (metric: WorkbenchMetric, context: MetricContext) => emitWorkbenchMetric(clean => {
    activityLog.appendLine(JSON.stringify({ time: new Date().toISOString(), ...context, ...clean }));
  }, metric);
  context.subscriptions.push(vscode.commands.registerCommand('skillBuilder.showPerformanceLog', () => activityLog.show(true)));
  const nonce = () => randomBytes(24).toString('base64');
  const openSettings = () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:DavidFarris.skill-builder');
  context.subscriptions.push(vscode.commands.registerCommand('skillBuilder.openSettings', openSettings));
  const render = () => {
    if (panel && controller) {
      const started = performance.now();
      panel.webview.html = renderGuidedWorkbench(controller.state, nonce(), brand);
      logMetric({ stage: 'webviewRender', durationMs: performance.now() - started, outcome: 'ok' }, metricContexts.get(controller)!);
    }
  };
  const updateConfigurationDisplay = () => {
    if (!controller || !panel) return;
    const state = controller.state, invalid = rootNeedsReopen || !!state.configurationError;
    const repository = invalid ? state.connection?.repository : state.configuredRepository ?? state.connection?.repository;
    const localRepository = invalid ? state.connection?.localPath : state.configuredLocalRepository ?? state.connection?.localPath;
    void panel.webview.postMessage({ type: 'configurationChanged', display: {
      workFolder: state.workFolder ?? 'Not selected', repository: repository || 'Not configured', localRepository: localRepository || 'Not configured', invalid,
      notice: rootNeedsReopen ? 'Work-folder settings changed. Save your current draft, then close and reopen SkillJetty to use the new folder. Existing files have not moved.' : invalid ? 'Settings need attention. Open the gear to correct them; your draft stays available for local work.' : 'Settings changed. Review a fresh sharing summary before uploading. Your current edits are preserved.'
    } }).then(() => undefined, () => undefined);
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
    const root = controller?.state.workFolder ?? await hooks.getRoot(); if (!root) return;
    let localRepository: string | undefined;
    let saved: ReturnType<typeof getWorkspaceConnection>;
    try { saved = getWorkspaceConnection(root); } catch { /* A damaged optional association must not block local draft saving. */ }
    try { localRepository = selectRepositorySettings(readNativeRepositorySettings(vscode.workspace.getConfiguration('skillBuilder')), saved).localPath; }
    catch { /* Explicit invalid sharing settings are blocked by repository actions; local draft saving remains available. */ }
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
  const processMessage = async (input: unknown, nativeCommand = false) => {
    if (!controller || !panel || !input || typeof input !== 'object') return;
    const message = input as GuidedMessage;
    if (typeof message.action !== 'string' || (message.payload !== undefined && (!message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)))) return;
    if (message.action === 'ready') return; // Initial loading is owned by the host.
    if (!nativeCommand && ['chooseWorkspace', 'connectRepository', 'setRepositoryFolder', 'discoverRepositories', 'createRepository', 'connectGitHub'].includes(message.action)) {
      controller.state.error = 'Configure sharing through the settings gear. Repository creation and GitHub sign-in use the explicit SkillJetty commands.';
      render(); return;
    }
    const activePanel = panel;
    const activeController = controller;
    const entryGeneration = configurationGeneration;
    let dispatched = false;
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
      if (['pullRepository', 'check', 'preparePublish', 'publish', 'savePackage', 'openRepositorySkill', 'openFolder', 'openPackage', 'openPackagePath'].includes(message.action)) await saveExternalEdits();
      if (panel !== activePanel || controller !== activeController) return;
      if (['publish', 'verifyRepository', 'pullRepository', 'openRepositorySkill', 'createRepository', 'connectRepository', 'connectGitHub', 'mergePullRequest', 'createPullRequest', 'requestReviewer'].includes(message.action) && entryGeneration !== configurationGeneration) {
        throw new Error('Settings changed while preparing this repository action. Your draft is preserved; review the current configuration before trying again.');
      }
      const operationContext = { ...metricContext };
      dispatched = true;
      await withWorkbenchMetrics(metric => logMetric(metric, operationContext), () => activeController.dispatch(message));
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
      // A pre-dispatch failure has not yet persisted the editor buffer carried
      // by this message. Keep that document intact and show the client error.
      if (dispatched) render();
    }
  };
  const handle = (input: unknown) => {
    if (input && typeof input === 'object' && (input as { action?: unknown }).action === 'editorBufferCaptured') {
      const response = input as Record<string, unknown>;
      const pending = typeof response.requestId === 'string' ? bufferRequests.get(response.requestId) : undefined;
      if (!pending || panel !== pending.panel || controller !== pending.controller) return Promise.resolve();
      bufferRequests.delete(response.requestId as string); clearTimeout(pending.timer);
      const fields = ['editorSkillId', 'editorPath', 'editorContent'] as const;
      if (fields.every(key => response[key] === undefined)) pending.resolve({});
      else if (fields.every(key => typeof response[key] === 'string') && Buffer.byteLength(response.editorContent as string, 'utf8') <= 16 * 1024 * 1024) {
        pending.resolve({ editorSkillId: response.editorSkillId as string, editorPath: response.editorPath as string, editorContent: response.editorContent as string });
      } else pending.reject(new Error('The current editor buffer could not be read safely. Your draft was kept; no repository action ran.'));
      return Promise.resolve();
    }
    if (input && typeof input === 'object' && (input as { action?: unknown }).action === 'openPerformanceLog') { activityLog.show(true); return Promise.resolve(); }
    if (input && typeof input === 'object' && (input as { action?: unknown }).action === 'openSettings') return openSettings().then(() => undefined);
    const operation = handling.then(() => processMessage(input));
    handling = operation.then(() => undefined, () => undefined);
    return operation;
  };
  const open = async () => {
    if (panel) {
      if (rootNeedsReopen && controller && !controller.state.active && !controller.state.busy) {
        const previousPanel = panel;
        panel = undefined; controller = undefined;
        previousPanel.dispose();
      } else {
        panel.reveal(vscode.ViewColumn.One);
        if (rootNeedsReopen && controller && !controller.state.busy) {
          controller.state.notice = 'The work-folder setting changed. Your current draft stays here. Save your work, then close and reopen this workbench to use the new folder.';
          updateConfigurationDisplay();
        }
        return;
      }
    }
    if (opening) return opening;
    opening = (async () => {
      const started = Date.now();
      const memoryBefore = process.memoryUsage().heapUsed;
      const rootGeneration = workFolderGeneration;
      const root = await hooks.getRoot();
      const assertOpeningRoot = () => {
        if (rootGeneration !== workFolderGeneration) throw new Error('The work-folder setting changed while opening SkillJetty. Reopen the workbench to use the selected folder. No draft was moved.');
      };
      assertOpeningRoot();
      // Preserve the existing preview association in channel-specific Workspace
      // settings before starting any operation. Never write Global/User settings
      // or seed another channel, and never overwrite an explicit native choice.
      if (root && vscode.workspace.workspaceFolders?.length) {
        const seeded: Array<{ key: string; value: string }> = [];
        try {
          const saved = getWorkspaceConnection(root);
          if (saved) {
            const seed = async (key: string, value: string) => {
              assertOpeningRoot();
              const configuration = vscode.workspace.getConfiguration('skillBuilder');
              if (isExplicitSetting(configuration, key)) return;
              seeded.push({ key, value });
              await configuration.update(key, value, vscode.ConfigurationTarget.Workspace);
              assertOpeningRoot();
            };
            await seed(PREVIEW_REPOSITORY_KEY, saved.repository);
            if (saved.localPath && vscode.workspace.getConfiguration('skillBuilder').get<string>(PREVIEW_REPOSITORY_KEY) === saved.repository) await seed(PREVIEW_LOCAL_REPOSITORY_KEY, saved.localPath);
          }
        } catch {
          if (rootGeneration !== workFolderGeneration) {
            // Undo only our still-matching provisional values. Never overwrite
            // an explicit value the user changed while opening the workbench.
            for (const item of seeded.reverse()) {
              const configuration = vscode.workspace.getConfiguration('skillBuilder');
              if (configuration.inspect<string>(item.key)?.workspaceValue === item.value) await configuration.update(item.key, undefined, vscode.ConfigurationTarget.Workspace);
            }
            assertOpeningRoot();
          }
          // Existing records remain untouched; invalid explicit settings are
          // reported by the configuration reader rather than falling back.
        }
      }
      assertOpeningRoot();
      rootNeedsReopen = false;
      panel = vscode.window.createWebviewPanel('skillBuilder.guidedWorkbench', brand.productName, vscode.ViewColumn.One, {
        enableScripts: true, retainContextWhenHidden: true, localResourceRoots: []
      });
      const createdPanel = panel;
      const createdMetrics: MetricContext = { action: 'startup', operationId: randomUUID() };
      const createdController = new GuidedWorkbenchController(root, {
        getRepositorySettings: () => readNativeRepositorySettings(vscode.workspace.getConfiguration('skillBuilder')),
        captureConfigurationGeneration: () => configurationGeneration,
        assertConfigurationGeneration: generation => {
          if (rootNeedsReopen) throw new Error('The work-folder setting changed. Save your draft and reopen the workbench before sharing or changing a repository.');
          if (generation !== configurationGeneration) throw new Error('Settings changed during this action. Your draft is preserved. Review the current settings and submission before trying again.');
        },
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
          const folder = (await vscode.window.showOpenDialog({ title: 'Choose your local skill work folder', defaultUri: vscode.Uri.file(await pickerRoot()), canSelectFiles: false, canSelectFolders: true, canSelectMany: false }))?.[0];
          if (folder) {
            const betaRoot = prereleaseWorkspaceRoot(folder.fsPath);
            if (vscode.workspace.workspaceFolders?.length) await vscode.workspace.getConfiguration('skillBuilder').update('projectRoot', betaRoot, vscode.ConfigurationTarget.Workspace);
            else void vscode.commands.executeCommand('vscode.openFolder', folder, false);
          }
          return folder ? prereleaseWorkspaceRoot(folder.fsPath) : undefined;
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
      context.subscriptions.push(panel.webview.onDidReceiveMessage(handle), panel.onDidDispose(() => { if (panel === createdPanel) { panel = undefined; controller = undefined; } }));
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
  const nativeAction = async (action: GuidedMessage['action'], payload?: Record<string, unknown>) => {
    await open();
    if (!panel || !controller) return;
    const activePanel = panel, activeController = controller, generation = configurationGeneration;
    const requestId = randomUUID();
    const buffer = await new Promise<EditorBuffer>((resolve, reject) => {
      const timer = setTimeout(() => { bufferRequests.delete(requestId); reject(new Error('The workbench did not return its current editor buffer. Your draft is preserved; retry the repository action when it is ready.')); }, 5000);
      bufferRequests.set(requestId, { panel: activePanel, controller: activeController, resolve, reject, timer });
      void activePanel.webview.postMessage({ type: 'captureEditorBuffer', requestId }).then(sent => {
        if (!sent) { clearTimeout(timer); bufferRequests.delete(requestId); reject(new Error('The workbench is not ready. No repository action ran.')); }
      }, () => { clearTimeout(timer); bufferRequests.delete(requestId); reject(new Error('The workbench is unavailable. No repository action ran.')); });
    });
    const operation = handling.then(() => {
      if (panel !== activePanel || controller !== activeController || generation !== configurationGeneration) throw new Error('The workbench or settings changed before the action began. Your draft is preserved; review the current settings before trying again.');
      return processMessage({ action, ...(payload ? { payload } : {}), ...buffer }, true);
    });
    handling = operation.then(() => undefined, () => undefined);
    return operation;
  };
  for (const action of ['connectGitHub', 'verifyRepository', 'pullRepository', 'openRepositorySkill'] as const) {
    context.subscriptions.push(vscode.commands.registerCommand(`skillBuilder.${action}`, () => nativeAction(action)));
  }
  context.subscriptions.push(vscode.commands.registerCommand('skillBuilder.createRepository', async () => {
    await open();
    const name = await vscode.window.showInputBox({ title: 'Create a GitHub skills repository', prompt: 'New repository name in your signed-in GitHub CLI account', placeHolder: 'Skills',
      validateInput: value => /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/.test(value) && value !== '..' ? undefined : 'Use a repository name with letters, digits, dots, hyphens or underscores.' });
    if (!name) return;
    const choice = await vscode.window.showQuickPick([{ label: 'Private', visibility: 'private' as const, description: 'Only authorized collaborators can see this repository.' }, { label: 'Public', visibility: 'public' as const, description: 'Anyone can see the repository and submitted skills.' }], { title: 'Repository visibility', placeHolder: 'Choose who can see this new repository' });
    if (!choice) return;
    const confirmation = `Create ${choice.visibility} repository`;
    if (await vscode.window.showWarningMessage(`Create ${name} as a ${choice.visibility} GitHub repository?`, { modal: true }, confirmation) !== confirmation) return;
    await nativeAction('createRepository', { name, visibility: choice.visibility, confirmed: true });
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    const rootChanged = event.affectsConfiguration('skillBuilder.projectRoot');
    if (!rootChanged && !event.affectsConfiguration(`skillBuilder.${PREVIEW_REPOSITORY_KEY}`) && !event.affectsConfiguration(`skillBuilder.${PREVIEW_LOCAL_REPOSITORY_KEY}`)) return;
    // Invalidate synchronously, including an operation currently awaiting Git or
    // GitHub. Refresh the display later through the same ordered host queue.
    ++configurationGeneration;
    if (rootChanged) { ++workFolderGeneration; if (controller || opening) rootNeedsReopen = true; }
    if (!controller) return;
    const operation = handling.then(() => {
      if (!controller || !panel) return;
      controller.refreshRepositorySettings();
      if (rootNeedsReopen) controller.state.notice = 'Work-folder settings changed. Save your current draft, then close and reopen SkillJetty to use the new folder. Existing files have not moved.';
      // Updating settings must not replace an editor document containing a newer
      // in-panel edit than its last autosave. Only update read-only summary nodes.
      updateConfigurationDisplay();
    });
    handling = operation.then(() => undefined, () => undefined);
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
