import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { GuidedWorkbenchController } from './guided-controller.js';
import { renderGuidedWorkbench, renderGuidedLauncher } from './guided-workbench-html.js';
import { GuidedMessage } from './guided-contract.js';

export function activateGuidedWorkbench(context: vscode.ExtensionContext, hooks: { getRoot(): Promise<string | undefined> }) {
  const brand = {
    productName: String(context.extension.packageJSON.displayName ?? 'SkillJetty').split(' — ')[0],
    descriptor: 'Agent Skills Studio',
    tagline: 'Build it. Version it. Ship it.',
    logoDataUri: `data:image/png;base64,${readFileSync(path.join(context.extensionPath, 'images', 'icon.png')).toString('base64')}`
  };
  let panel: vscode.WebviewPanel | undefined;
  let controller: GuidedWorkbenchController | undefined;
  let opening: Promise<void> | undefined;
  const nonce = () => randomBytes(24).toString('base64');
  const render = () => { if (panel && controller) panel.webview.html = renderGuidedWorkbench(controller.state, nonce(), brand); };
  const pick = async (kind: 'package' | 'folder' | 'file') => (await vscode.window.showOpenDialog({
    title: kind === 'package' ? 'Open a .skill package' : kind === 'folder' ? 'Open a skill folder' : 'Add a supporting file',
    canSelectMany: false, canSelectFiles: kind !== 'folder', canSelectFolders: kind === 'folder',
    ...(kind === 'package' ? { filters: { 'Skill packages': ['skill'] } } : {})
  }))?.[0]?.fsPath;

  const saveExternalEdits = async () => {
    const root = await hooks.getRoot(); if (!root) return;
    for (const document of vscode.workspace.textDocuments) {
      const relative = path.relative(path.join(root, 'skills'), document.uri.fsPath);
      if (document.isDirty && document.uri.scheme === 'file' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
        if (!await document.save()) throw new Error('A skill file could not be saved. Keep your editor open and save it before continuing.');
      }
    }
  };
  const handle = async (input: unknown) => {
    if (!controller || !panel || !input || typeof input !== 'object') return;
    const message = input as GuidedMessage;
    if (typeof message.action !== 'string' || (message.payload !== undefined && (!message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)))) return;
    if (message.action === 'ready') return; // Initial loading is owned by the host.
    try {
      if (['check', 'preparePublish', 'publish', 'openFolder', 'openPackage'].includes(message.action)) await saveExternalEdits();
      await controller.dispatch(message);
    } catch (error) { controller.state.error = error instanceof Error ? error.message : String(error); }
    if (!panel || !controller) return;
    if (message.action === 'save') {
      await panel.webview.postMessage({ type: 'saved', notice: controller.state.notice, error: controller.state.error });
    } else render();
  };
  const open = async () => {
    if (panel) { panel.reveal(vscode.ViewColumn.One); return; }
    if (opening) return opening;
    opening = (async () => {
      const root = await hooks.getRoot();
      panel = vscode.window.createWebviewPanel('skillBuilder.guidedWorkbench', brand.productName, vscode.ViewColumn.One, {
        enableScripts: true, retainContextWhenHidden: true, localResourceRoots: []
      });
      controller = new GuidedWorkbenchController(root, {
        pickPackage: () => pick('package'), pickFolder: () => pick('folder'), pickFile: () => pick('file'),
        chooseWorkspace: async () => {
          const folder = (await vscode.window.showOpenDialog({ title: 'Choose your local skill work folder', canSelectFiles: false, canSelectFolders: true, canSelectMany: false }))?.[0];
          if (folder) {
            if (vscode.workspace.workspaceFolders?.length) await vscode.workspace.getConfiguration('skillBuilder').update('projectRoot', folder.fsPath, vscode.ConfigurationTarget.Workspace);
            else void vscode.commands.executeCommand('vscode.openFolder', folder, false);
          }
          return folder?.fsPath;
        },
        openLink: async url => { await vscode.env.openExternal(vscode.Uri.parse(url)); },
        onState: () => render()
      });
      context.subscriptions.push(panel.webview.onDidReceiveMessage(handle), panel.onDidDispose(() => { panel = undefined; controller = undefined; }));
      render(); await controller.dispatch({ action: 'ready' }); render();
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
