import * as vscode from 'vscode';
import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { emitWorkbenchMetric, type WorkbenchMetric } from './workbench-metrics.js';
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
    for (const document of vscode.workspace.textDocuments) {
      const managedDocument = ['skills', path.join('.skill-workbench', 'repositories')].some(folder => {
        const relative = path.relative(path.join(root, folder), document.uri.fsPath);
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
      await activeController.dispatch(message);
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
      await activePanel.webview.postMessage({ type: 'operationComplete', error: activeController.state.error, message: completion });
      render();
    }
  };
  const handle = (input: unknown) => {
    if (input && typeof input === 'object' && (input as { action?: unknown }).action === 'openPerformanceLog') { activityLog.show(true); return Promise.resolve(); }
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
          const session = await vscode.authentication.getSession('github', ['repo'], { forceNewSession: { detail: 'Choose the GitHub account with access to your connected skill repository. This account is managed by VS Code.' }, clearSessionPreference: true });
          return session.account.label;
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
            void createdPanel.webview.postMessage({ type: 'progress', message: state.progress ?? '', waitingForInput: state.waitingForInput === true }).then(() => undefined, () => undefined);
          }
        }
      });
      metricContexts.set(createdController, createdMetrics);
      controller = createdController;
      context.subscriptions.push(panel.webview.onDidReceiveMessage(handle), panel.onDidDispose(() => { panel = undefined; controller = undefined; }));
      // Initialize connection metadata before the first document. Startup has
      // no scan and must not send progress that can arrive in a later document.
      await createdController.dispatch({ action: 'ready' });
      if (panel === createdPanel && controller === createdController) {
        render();
        // Initial repository verification runs after first paint and does not
        // serialize or block local file opening/editing.
        void createdController.verifyRepository();
      }
      const memory = process.memoryUsage();
      activityLog.appendLine(`${new Date().toISOString()} action=OpenWorkbench durationMs=${Date.now() - started} hostHeapUsedBytes=${memory.heapUsed} hostHeapDeltaBytes=${memory.heapUsed - memoryBefore} hostExternalBytes=${memory.external} outcome=${createdController.state.error ? 'error' : 'completed'}`);
    })();
    try { await opening; } finally { opening = undefined; }
  };
  context.subscriptions.push(vscode.commands.registerCommand('skillBuilder.openWorkbench', open));
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
