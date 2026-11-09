const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const fs = require('node:fs');
const { createWorkbench } = require('../out/workbench-setup.js');
const scratch = require('./working-fixture.cjs').workingFixture('host-feedback');
fs.mkdirSync(scratch, { recursive: true });
const fixtureRoots = [];
function managedRoot() { const root = fs.mkdtempSync(path.join(scratch, 'workbench-')); fixtureRoots.push(root); return createWorkbench(root); }
test.after(() => { for (const root of fixtureRoots) fs.rmSync(root, { recursive: true, force: true }); });

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(options = {}) {
  const root = options.root ?? managedRoot();
  const panels = [], controllers = [], commands = new Map(), events = [], dispatchHooks = new Map(), settings = new Map(options.initialSettings), updates = [];
  const rememberedState = options.rememberedState ?? new Map(), rememberedUpdates = [];
  let configurationListener;
  const disposable = () => ({ dispose() {} });
  class Controller {
    constructor(root, hooks) {
      this.root = root; this.hooks = hooks;
      this.state = { step: 'start', hasWorkspace: !!root, workFolder: root, repositories: [], drafts: [], library: [], files: [], target: 'portable' };
      controllers.push(this);
    }
    async verifyRepository() { events.push({ type: 'repository-check', controller: this }); }
    async loadHome() { events.push({ type: 'home-catalogue', controller: this }); return options.loadHome ? options.loadHome(this) : false; }
    updatePluginMetadata(input) {
      events.push({ type: 'plugin-metadata', input, controller: this });
      return options.metadataResult ?? input;
    }
    refreshRepositorySettings() { events.push({ type: 'settings-refresh', controller: this }); }
    async acceptRepositoryConnection(repository, localPath, beforeSave) {
      beforeSave?.(); events.push({ type: 'connection-accepted', repository, localPath });
      this.state.connection = { repository, localPath, baseBranch: 'main' };
    }
    async dispatch(message) {
      events.push({ type: 'dispatch', action: message.action, message, controller: this });
      return dispatchHooks.has(message.action) ? dispatchHooks.get(message.action)(this, message) : this.state;
    }
  }
  const vscode = {
    ViewColumn: { One: 1 },
    Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
    ConfigurationTarget: { Workspace: 2 },
    authentication: { async getSession(...args) { events.push({ type: 'authentication', args }); return options.getSession?.(...args); } },
    commands: { registerCommand(id, handler) { commands.set(id, handler); return disposable(); }, async executeCommand(...args) { events.push({ type: 'native-command', args }); } },
    workspace: { async openTextDocument(uri) { return { uri }; }, textDocuments: [], workspaceFolders: [], onDidSaveTextDocument: disposable,
      onDidChangeConfiguration(listener) { configurationListener = listener; return disposable(); },
      getConfiguration() { const snapshot = options.configurationSnapshots ? new Map(settings) : settings; return { inspect: key => snapshot.has(key) ? { workspaceValue: snapshot.get(key) } : { defaultValue: '' }, get: key => snapshot.get(key) ?? '', async update(key, value, target) { if (value === undefined) settings.delete(key); else settings.set(key, value); updates.push({ key, value, target }); configurationListener?.({ affectsConfiguration: candidate => candidate === `skillBuilder.${key}` }); await options.onUpdate?.(key, value); } }; } },
    window: {
      async showInputBox(...args) { events.push({ type: 'repository-input', args }); return options.showInputBox?.(...args); },
      async showQuickPick(...args) { events.push({ type: 'repository-mode', args }); return options.showQuickPick?.(...args); },
      async showOpenDialog(...args) { events.push({ type: 'folder-picker', args }); return options.showOpenDialog?.(...args); },
      async showInformationMessage(...args) { events.push({ type: 'information', args }); return options.showInformationMessage?.(...args); },
      async showErrorMessage(...args) { events.push({ type: 'error-dialog', args }); return options.showErrorMessage?.(...args); },
      async showTextDocument(document) { events.push({ type: 'log-opened', document }); },
      createOutputChannel() { return { appendLine: line => events.push({ type: 'log', line }), show() { events.push({ type: 'log-opened' }); }, dispose() {} }; },
      registerWebviewViewProvider: disposable,
      createWebviewPanel() {
        const panel = { htmlWrites: 0, messages: [], reveal() {}, onDidDispose(handler) { this.closed = handler; return disposable(); },
          close() { this.closed(); }, dispose() { this.closed(); },
          webview: { async postMessage(message) { panel.messages.push(message); events.push({ type: 'message', message, panel }); return true; },
            onDidReceiveMessage(handler) { panel.receive = handler; return disposable(); } } };
        Object.defineProperty(panel.webview, 'html', { set(value) { panel.htmlWrites++; panel.html = value; events.push({ type: 'render', panel }); } });
        panels.push(panel); return panel;
      }
    }
  };
  const file = require.resolve('../out/guided-workbench.js'), originalLoad = Module._load;
  delete require.cache[file];
  try {
    Module._load = function(id, parent, main) {
      if (parent?.filename === file && id === 'vscode') return vscode;
      if (parent?.filename === file && id === './managed-repository.js' && options.repositoryFlow) return {
        async validateSelectedRepository(...args) { events.push({ type: 'local-validated', args }); await options.repositoryFlow.validate?.(...args); },
        async cloneSelectedRepository(...args) { events.push({ type: 'local-cloned', args }); await options.repositoryFlow.clone?.(...args); }
      };
      if (parent?.filename === file && id === './workspace-selection.js' && options.resolveExistingWorkspace) return { ...originalLoad.call(this, id, parent, main), resolveExistingRepositoryWorkspace: options.resolveExistingWorkspace };
      if (parent?.filename === file && id === './guided-workspace.js' && options.connection) return { getWorkspaceConnection: () => { if (options.connection instanceof Error) throw options.connection; return options.connection; } };
      if (parent?.filename === file && id === './guided-controller.js') return { GuidedWorkbenchController: Controller };
      return originalLoad.call(this, id, parent, main);
    };
    require(file).activateGuidedWorkbench({ subscriptions: [], extensionPath: path.resolve(__dirname, '..'),
      workspaceState: { get(key) { return structuredClone(rememberedState.get(key)); }, async update(key, value) {
        rememberedUpdates.push({ key, value }); await options.onRemember?.(key, value);
        if (value === undefined) rememberedState.delete(key); else rememberedState.set(key, structuredClone(value));
      } },
      extension: { packageJSON: { displayName: 'SkillJetty — Public pre-release', version: '0.11.4' } } }, { getRoot: options.getRoot ?? (async () => root) });
  } finally { Module._load = originalLoad; delete require.cache[file]; }
  return { root, panels, controllers, commands, events, dispatchHooks, vscode, settings, updates, rememberedState, rememberedUpdates,
    logs() { const file = path.join(root, 'logs/performance.log'); return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n') : []; },
    changeConfiguration(key, value) { settings.set(key, value); configurationListener({ affectsConfiguration: target => target === `skillBuilder.${key}` }); },
    async open() { await commands.get('skillBuilder.openWorkbench')(); return panels.at(-1); } };
}

test('late remembered project resolution cannot restore a root invalidated by changed settings', async () => {
  const previous = managedRoot(), current = managedRoot(), entered = deferred(), release = deferred();
  const rememberedState = new Map([['skillBuilder.selectedWorkbench.v1', {
    format: 1, dataRoot: previous, repositoryRoot: previous,
    rootSettingsFingerprint: JSON.stringify(['', undefined, undefined, undefined])
  }]]);
  const f = fixture({ root: current, rememberedState, resolveExistingWorkspace: async () => {
    entered.resolve(); await release.promise;
    // A delayed accepted descriptor isolates host selection caching from Git.
    // Real legacy resolver/chooser identity is covered separately below.
    return { kind: 'managed', dataRoot: previous };
  } });
  const opening = f.open().catch(error => error);
  await entered.promise;
  f.changeConfiguration('projectRoot', current);
  release.resolve();
  await opening;
  await f.open();
  assert.equal(f.controllers.at(-1).root, current, 'the late old descriptor must not be cached for the next opening');
});

test('late home metadata cannot replace an active create form', async () => {
  const loaded = deferred(), f = fixture({ loadHome: () => loaded.promise });
  const panel = await f.open(), controller = f.controllers.at(-1);
  controller.state.form = { mode: 'create' };
  const renders = panel.htmlWrites;
  loaded.resolve(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(panel.htmlWrites, renders, 'background metadata must not replace the input document');
});

test('late home metadata cannot rerender after a later user action returns home', async () => {
  const loaded = deferred(), f = fixture({ loadHome: () => loaded.promise });
  const panel = await f.open();
  await panel.receive({ action: 'showSkillStart' });
  const renders = panel.htmlWrites;
  loaded.resolve(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(panel.htmlWrites, renders, 'an unchanged home step does not erase later interaction provenance');
});

test('actual host delivers activity before dispatch and sends stage updates without replacing the page', async () => {
  const f = fixture(), panel = await f.open();
  assert.match(panel.html, /Installed pre-release 0\.11\.4/);
  assert.doesNotMatch(panel.html, /UAT only/);
  const entered = deferred(), release = deferred();
  f.dispatchHooks.set('check', async controller => {
    controller.state.progress = 'Reading and checking the selected skill…'; controller.hooks.onState(controller.state);
    entered.resolve(); await release.promise;
  });
  f.events.length = 0; panel.messages.length = 0;
  const baselineRenders = panel.htmlWrites;
  const operation = panel.receive({ action: 'check' });
  await entered.promise;
  try {
    const firstDispatch = f.events.findIndex(event => event.type === 'dispatch');
    assert(firstDispatch > 0);
    assert.equal(f.events[0].type, 'message'); assert.equal(f.events[0].message.type, 'progress');
    assert.match(f.events[0].message.message, /sanity check/i);
    assert(panel.messages.some(message => message.type === 'progress' && message.message === 'Reading and checking the selected skill…'));
    assert.equal(panel.htmlWrites, baselineRenders, 'no page replacement while work is pending');
    assert.equal(panel.messages.some(message => message.type === 'operationComplete'), false);
  } finally {
    // An assertion must not strand the simulated operation's real heartbeat.
    release.resolve(); await operation;
  }
  assert.equal(panel.messages.at(-1).type, 'operationComplete');
  assert.equal(panel.htmlWrites, baselineRenders + 1, 'one final page replacement');
  const completion = f.events.findIndex(event => event.type === 'message' && event.message.type === 'operationComplete');
  assert(f.events.findIndex(event => event.type === 'render') > completion);
});

test('opening paints Home before background saved metadata and emits no progress race', async () => {
  const f = fixture(), panel = await f.open();
  assert.equal(panel.htmlWrites, 1);
  assert.deepEqual(panel.messages, []);
  const initialized = f.events.findIndex(event => event.type === 'dispatch' && event.action === 'ready');
  const rendered = f.events.findIndex(event => event.type === 'render');
  assert(initialized >= 0 && rendered > initialized);
  assert(f.events.findIndex(event => event.type === 'home-catalogue') > rendered);
});

test('autosave receives only its acknowledgement and keeps the rendered editor intact', async () => {
  const f = fixture(), panel = await f.open(), baselineRenders = panel.htmlWrites;
  panel.messages.length = 0;
  f.dispatchHooks.set('save', controller => { controller.state.notice = 'Saved locally.'; });
  await panel.receive({ action: 'save' });
  assert.equal(panel.htmlWrites, baselineRenders);
  assert.equal(panel.messages.length, 1);
  assert.equal(panel.messages[0].type, 'saved');
  assert.equal(panel.messages[0].notice, 'Saved locally.');
});

test('host sends real responses during pending work and stops after completion', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture(), panel = await f.open(), entered = deferred(), release = deferred();
  f.dispatchHooks.set('check', async () => { entered.resolve(); await release.promise; });
  const operation = panel.receive({ action: 'check' }); await entered.promise;
  t.mock.timers.tick(2000);
  assert(panel.messages.some(message => message.type === 'heartbeat'));
  release.resolve(); await operation;
  const count = panel.messages.length;
  t.mock.timers.tick(4000);
  assert.equal(panel.messages.length, count);
  assert.match(panel.html, /Finished in [\d.]+ seconds/);
});

test('host separates waiting for input from processing and records bounded memory diagnostics', async () => {
  const f = fixture(), panel = await f.open();
  panel.messages.length = 0;
  f.dispatchHooks.set('openPackage', controller => {
    controller.state.progress = 'Checking the selected package…';
    controller.state.waitingForInput = false;
    controller.hooks.onState(controller.state);
  });
  await panel.receive({ action: 'openPackage' });
  assert.equal(panel.messages[0].waitingForInput, true);
  assert(panel.messages.some(message => message.message === 'Checking the selected package…' && message.waitingForInput === false));
  assert(f.logs().some(line => /action=OpenWorkbench durationMs=\d+ hostHeapUsedBytes=\d+/.test(line)));
  assert(f.logs().some(line => /hostHeapDeltaBytes=-?\d+ hostExternalBytes=\d+/.test(line)));
});

test('a disposed controller cannot send progress, completion or page content to its replacement panel', async () => {
  const f = fixture(), first = await f.open(), entered = deferred(), release = deferred();
  f.dispatchHooks.set('check', async controller => { entered.resolve(); await release.promise; controller.state.progress = 'Late old progress'; controller.hooks.onState(controller.state); });
  const operation = first.receive({ action: 'check' }); await entered.promise;
  first.close();
  const replacement = await f.open(), newRenders = replacement.htmlWrites, newMessages = replacement.messages.length;
  release.resolve(); await operation;
  assert.equal(replacement.htmlWrites, newRenders);
  assert.equal(replacement.messages.length, newMessages);
  assert.equal(first.messages.some(message => message.message === 'Late old progress' || message.type === 'operationComplete'), false);
});

test('a host-side action failure sends a terminal error and renders the recoverable error state', async () => {
  const f = fixture(), panel = await f.open(), baselineRenders = panel.htmlWrites;
  panel.messages.length = 0;
  f.dispatchHooks.set('check', () => { throw new Error('The selected file changed.'); });
  await panel.receive({ action: 'check' });
  assert.equal(panel.messages.at(-1).type, 'operationComplete');
  assert.equal(panel.messages.at(-1).error, 'The selected file changed.');
  assert.equal(panel.htmlWrites, baselineRenders + 1);
  assert.match(panel.html, /The selected file changed\./);
});


test('diagnostics can open immediately while a serialized task is pending', async () => {
  const f = fixture(), panel = await f.open(), entered = deferred(), release = deferred();
  f.dispatchHooks.set('check', async () => { entered.resolve(); await release.promise; });
  const operation = panel.receive({ action: 'check' }); await entered.promise;
  await panel.receive({ action: 'openPerformanceLog' });
  assert(f.events.some(event => event.type === 'log-opened'));
  assert.equal(panel.messages.some(message => message.type === 'operationComplete'), false);
  assert.equal(f.events.some(event => event.type === 'dispatch' && event.action === 'openPerformanceLog'), false);
  release.resolve(); await operation;
  const metrics = f.logs().filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  const total = metrics.find(metric => metric.stage === 'operationTotal');
  assert(total && /^[a-f0-9-]{36}$/.test(total.operationId));
  assert(metrics.some(metric => metric.stage === 'pickerWait' && metric.operationId === total.operationId));
  assert(f.commands.has('skillBuilder.showPerformanceLog'));
});


test('reopened panel starts a separate diagnostics context while an old task finishes', async () => {
  const f = fixture(), first = await f.open(), entered = deferred(), release = deferred();
  f.dispatchHooks.set('check', async controller => { entered.resolve(); await release.promise; controller.hooks.onMetric({ stage: 'editorPreparation', durationMs: 1 }); });
  const operation = first.receive({ action: 'check' }); await entered.promise;
  first.close(); const replacement = await f.open();
  const metrics = () => f.logs().filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  const startup = metrics().filter(metric => metric.stage === 'webviewRender').at(-1);
  assert.equal(startup.action, 'startup');
  release.resolve(); await operation;
  const old = metrics().find(metric => metric.stage === 'operationTotal');
  assert.notEqual(startup.operationId, old.operationId);
  assert.equal(metrics().find(metric => metric.stage === 'editorPreparation').operationId, old.operationId);
  assert.equal(replacement.htmlWrites, 1);
});


test('pull protects unsaved documents only inside the selected local repository', async () => {
  const root = managedRoot(), localPath = path.join(root, 'repositories/selected-skills-project');
  const f = fixture({ root, connection: { repository: 'https://github.com/example/skills', localPath } }), panel = await f.open();
  let saved = 0, unrelated = 0;
  f.vscode.workspace.textDocuments.push(
    { isDirty: true, uri: { scheme: 'file', fsPath: path.join(localPath, 'notes/SKILL.md') }, async save() { saved++; return false; } },
    { isDirty: true, uri: { scheme: 'file', fsPath: path.resolve('unrelated-project/notes.md') }, async save() { unrelated++; return true; } }
  );
  await panel.receive({ action: 'pullRepository' });
  assert.equal(saved, 1); assert.equal(unrelated, 0);
  assert.equal(f.events.some(event => event.type === 'dispatch' && event.action === 'pullRepository'), false);
  assert.match(f.controllers[0].state.error, /could not be saved/);
});


test('invalid optional repository metadata does not block local package opening', async () => {
  const f = fixture({ connection: new Error('Invalid connection metadata') }), panel = await f.open();
  await panel.receive({ action: 'openPackage' });
  assert(f.events.some(event => event.type === 'dispatch' && event.action === 'openPackage'));
  assert.equal(f.controllers[0].state.error, undefined);
});

test('gear opens one fixed native settings destination while an action is pending', async () => {
  const f = fixture(), panel = await f.open(), entered = deferred(), release = deferred();
  f.dispatchHooks.set('check', async () => { entered.resolve(); await release.promise; });
  const action = panel.receive({ action: 'check' }); await entered.promise;
  const before = panel.htmlWrites;
  await panel.receive({ action: 'openSettings', payload: { command: 'untrusted.command', url: 'https://example.invalid' } });
  assert.deepEqual(f.events.filter(event => event.type === 'native-command').at(-1).args, ['workbench.action.openSettings', '@ext:DavidFarris.skill-builder']);
  assert.equal(panel.htmlWrites, before);
  assert(!f.events.some(event => event.type === 'dispatch' && event.action === 'openSettings'));
  release.resolve(); await action;
});

test('settings invalidate the active operation synchronously without network work on save', async () => {
  const f = fixture(), panel = await f.open(), entered = deferred(), release = deferred();
  const hooks = f.controllers[0].hooks;
  const captured = hooks.captureConfigurationGeneration();
  f.dispatchHooks.set('check', async () => { entered.resolve(); await release.promise; });
  const action = panel.receive({ action: 'check' }); await entered.promise;
  const checks = f.events.filter(event => event.type === 'repository-check').length;
  f.changeConfiguration('prerelease.repositoryUrl', 'https://github.com/new/skills');
  assert.throws(() => hooks.assertConfigurationGeneration(captured), /Settings changed/);
  assert.equal(f.events.filter(event => event.type === 'repository-check').length, checks);
  release.resolve(); await action; await new Promise(resolve => setImmediate(resolve));
  assert(f.events.some(event => event.type === 'settings-refresh'));
  assert(panel.messages.some(message => message.type === 'configurationChanged'));
  assert.equal(panel.htmlWrites, 2, 'one action-completion render; settings themselves must not replace the editor page');
});

test('a work-folder change during asynchronous opening never creates a stale controller', async () => {
  const root = deferred(), f = fixture({ getRoot: () => root.promise });
  const opening = f.open();
  f.changeConfiguration('projectRoot', path.resolve('new-work-folder'));
  root.resolve(path.resolve('previous-work-folder'));
  await assert.rejects(opening, /work-folder setting changed while opening/);
  assert.equal(f.controllers.length, 0); assert.equal(f.panels.length, 0); assert.equal(f.updates.length, 0);
});

test('startup preserves saved connection without writing settings into the ambient project', async () => {
  const root = managedRoot();
  const saved = { repository: 'https://github.com/example/skills', localPath: path.join(root, 'repositories/skills') };
  const f = fixture({ root, connection: saved, configurationSnapshots: true });
  f.vscode.workspace.workspaceFolders.push({ uri: { fsPath: path.resolve('unrelated-open-project') } });
  await f.open();
  assert.equal(f.settings.has('prerelease.repositoryUrl'), false);
  assert.equal(f.settings.has('prerelease.localRepositoryPath'), false);
  assert.deepEqual(f.updates, []);
  assert.equal(f.controllers[0].hooks.getRepositorySettings().repositoryUrl, undefined);
});

test('Palette repository actions capture the current in-panel edit before dispatch', async () => {
  const f = fixture(), panel = await f.open(); f.events.length = 0;
  const action = f.commands.get('skillBuilder.openRepositorySkill')();
  await new Promise(resolve => setImmediate(resolve));
  const request = panel.messages.find(message => message.type === 'captureEditorBuffer');
  assert(request?.requestId);
  assert(!f.events.some(event => event.type === 'dispatch'));
  await panel.receive({ action: 'editorBufferCaptured', requestId: request.requestId, editorSkillId: 'meeting-notes', editorPath: 'SKILL.md', editorContent: 'Latest unsaved edit' });
  await action;
  const message = f.events.find(event => event.type === 'dispatch' && event.action === 'openRepositorySkill').message;
  assert.equal(message.editorContent, 'Latest unsaved edit'); assert.equal(message.editorSkillId, 'meeting-notes');
});

test('Palette actions stop if settings change before the editor capture returns', async () => {
  const f = fixture(), panel = await f.open(); f.events.length = 0;
  const action = f.commands.get('skillBuilder.pullRepository')();
  await new Promise(resolve => setImmediate(resolve));
  const request = panel.messages.find(message => message.type === 'captureEditorBuffer');
  f.changeConfiguration('prerelease.repositoryUrl', 'https://github.com/new/skills');
  await panel.receive({ action: 'editorBufferCaptured', requestId: request.requestId });
  await assert.rejects(action, /settings changed before the action began/);
  assert(!f.events.some(event => event.type === 'dispatch' && event.action === 'pullRepository'));
});

test('obsolete webview setup messages cannot create repositories or overwrite native choices', async () => {
  const f = fixture(), panel = await f.open(); f.events.length = 0;
  for (const action of ['chooseWorkspace', 'connectRepository', 'setRepositoryFolder', 'discoverRepositories', 'createRepository', 'connectGitHub']) {
    await panel.receive({ action, payload: { confirmed: true, repository: 'https://github.com/unreviewed/destination', nativeCommand: true } });
  }
  assert(!f.events.some(event => event.type === 'dispatch'));
  assert.equal(f.updates.length, 0);
  assert.match(f.controllers[0].state.error, /settings gear/);
});

test('Pull protects unsaved documents in newly configured B instead of cached repository A', async () => {
  const root = managedRoot(), oldPath = path.join(root, 'repositories/a'), newPath = path.join(root, 'repositories/b');
  const f = fixture({ root, connection: { repository: 'https://github.com/example/a', localPath: oldPath } }), panel = await f.open();
  f.settings.set('prerelease.repositoryUrl', 'https://github.com/example/b');
  f.settings.set('prerelease.localRepositoryPath', newPath);
  let savedOld = 0, savedNew = 0;
  f.vscode.workspace.textDocuments.push(
    { isDirty: true, uri: { scheme: 'file', fsPath: path.join(oldPath, 'notes/SKILL.md') }, async save() { savedOld++; return true; } },
    { isDirty: true, uri: { scheme: 'file', fsPath: path.join(newPath, 'notes/SKILL.md') }, async save() { savedNew++; return false; } }
  );
  f.events.length = 0;
  await panel.receive({ action: 'pullRepository' });
  assert.equal(savedNew, 1); assert.equal(savedOld, 0);
  assert(!f.events.some(event => event.type === 'dispatch' && event.action === 'pullRepository'));
  assert.match(f.controllers[0].state.error, /could not be saved/);
});

test('settings changed during an external save cannot hand Pull a newer unchecked destination', async () => {
  const root = managedRoot(), localPath = path.join(root, 'repositories/b'), entered = deferred(), release = deferred();
  const f = fixture({ root }), panel = await f.open();
  f.settings.set('prerelease.repositoryUrl', 'https://github.com/example/b');
  f.settings.set('prerelease.localRepositoryPath', localPath);
  f.vscode.workspace.textDocuments.push({ isDirty: true, uri: { scheme: 'file', fsPath: path.join(localPath, 'SKILL.md') }, async save() { entered.resolve(); await release.promise; return true; } });
  f.events.length = 0; const before = panel.htmlWrites;
  const action = panel.receive({ action: 'pullRepository', editorSkillId: 'sample', editorPath: 'SKILL.md', editorContent: 'Newer in-panel edit' });
  await entered.promise;
  f.changeConfiguration('prerelease.repositoryUrl', 'https://github.com/example/c');
  f.changeConfiguration('prerelease.localRepositoryPath', path.join(root, 'repositories/c'));
  release.resolve(); await action; await new Promise(resolve => setImmediate(resolve));
  assert(!f.events.some(event => event.type === 'dispatch' && event.action === 'pullRepository'));
  assert.match(f.controllers[0].state.error, /Settings changed while preparing/);
  assert.equal(panel.htmlWrites, before, 'a pre-dispatch failure must not replace the unsaved editor document');
  assert(panel.messages.some(message => message.type === 'operationComplete' && message.error));
});

test('reopening the command after a root change preserves the active editor document', async () => {
  const f = fixture(), panel = await f.open();
  f.controllers[0].state.active = { id: 'sample', name: 'sample' };
  const before = panel.htmlWrites;
  f.changeConfiguration('projectRoot', path.resolve('another-work-folder'));
  await new Promise(resolve => setImmediate(resolve));
  await f.commands.get('skillBuilder.openWorkbench')();
  assert.equal(f.panels.length, 1); assert.equal(panel.htmlWrites, before);
  assert(panel.messages.some(message => message.type === 'configurationChanged' && message.display.invalid));
  assert.equal(f.controllers[0].state.active.id, 'sample');
});


test('cancelled workbench setup releases the original panel without creating folders', async () => {
  const f = fixture(), panel = await f.open();
  const before = fs.readdirSync(path.join(f.root, 'scratch'));
  await panel.receive({ action: 'createWorkbench' });
  assert.equal(f.panels.length, 1);
  assert.equal(panel.messages.at(-1).type, 'operationComplete');
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'scratch')), before);
  await panel.receive({ action: 'check' });
  assert(f.events.some(event => event.type === 'dispatch' && event.action === 'check'));
});

test('an active draft refuses a workbench switch and releases the panel controls', async () => {
  const f = fixture(), panel = await f.open();
  f.controllers[0].state.active = { id: 'preserved-draft', name: 'preserved-draft' };
  const before = fs.readdirSync(path.join(f.root, 'scratch'));
  await panel.receive({ action: 'openWorkbenchFolder' });
  assert.equal(f.events.filter(event => event.type === 'folder-picker').length, 0);
  assert(f.events.some(event => event.type === 'information' && /close the workbench panel/.test(event.args[0])));
  assert.equal(panel.messages.at(-1).type, 'operationComplete');
  assert.equal(f.controllers[0].state.active.id, 'preserved-draft');
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'scratch')), before);
  await panel.receive({ action: 'save' });
  assert(f.events.some(event => event.type === 'dispatch' && event.action === 'save'));
});

test('changing settings while the setup picker is open prevents folder creation', async () => {
  const entered = deferred(), release = deferred();
  const f = fixture({ showOpenDialog: async () => { entered.resolve(); return release.promise; } }), panel = await f.open();
  const destination = path.join(f.root, 'scratch', '.skilljetty-prerelease');
  const action = panel.receive({ action: 'createWorkbench' }); await entered.promise;
  f.changeConfiguration('prerelease.repositoryUrl', 'https://github.com/new/skills');
  release.resolve([{ fsPath: path.join(f.root, 'scratch') }]); await action;
  assert.equal(fs.existsSync(destination), false);
  assert(f.events.some(event => event.type === 'error-dialog' && /changed while setup was open/.test(event.args[0])));
  assert(panel.messages.some(message => message.type === 'operationComplete'));
  assert.equal(f.panels.length, 1);
});

test('changing settings during the setup confirmation prevents folder creation', async () => {
  const entered = deferred(), release = deferred();
  let root;
  const f = fixture({ showOpenDialog: async () => [{ fsPath: path.join(root, 'scratch') }],
    showInformationMessage: async (_message, details) => { if (details?.modal) { entered.resolve(); return release.promise; } } });
  root = f.root; const panel = await f.open();
  const destination = path.join(root, 'scratch', '.skilljetty-prerelease');
  const action = panel.receive({ action: 'createWorkbench' }); await entered.promise;
  f.changeConfiguration('projectRoot', path.join(root, 'different-selection'));
  release.resolve('Use this location'); await action;
  assert.equal(fs.existsSync(destination), false);
  assert(f.events.some(event => event.type === 'error-dialog' && /changed while setup was open/.test(event.args[0])));
  assert(panel.messages.some(message => message.type === 'operationComplete'));
  assert.equal(f.panels.length, 1);
});

test('concurrent native setup commands serialize their folder pickers', async () => {
  const entered = deferred(), release = deferred(); let pickers = 0;
  const f = fixture({ showOpenDialog: async () => { if (++pickers === 1) { entered.resolve(); return release.promise; } } }), panel = await f.open();
  const first = f.commands.get('skillBuilder.createWorkbench')(); await entered.promise;
  const second = f.commands.get('skillBuilder.openWorkbenchFolder')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pickers, 1, 'the second setup must not open a competing picker');
  release.resolve(undefined); await first; await second;
  assert.equal(pickers, 2);
  assert.equal(f.panels.length, 1);
  assert.equal(panel.messages.filter(message => message.type === 'operationComplete').length, 2);
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'scratch')), []);
});

test('invalid workbench selection releases controls while its error notification remains unanswered', async () => {
  const notificationAnswer = deferred();
  let root;
  const f = fixture({
    showOpenDialog: async () => [{ fsPath: path.join(root, 'scratch') }],
    showErrorMessage: async () => notificationAnswer.promise
  });
  root = f.root;
  const panel = await f.open();
  let timer;
  const selection = panel.receive({ action: 'openWorkbenchFolder' });
  try {
    const finished = await Promise.race([
      selection.then(() => true),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), 1500); })
    ]);
    assert.equal(finished, true, 'an unanswered error notification must not hold setup');
    const completion = panel.messages.find(message => message.type === 'operationComplete');
    assert.match(completion.error, /not adopted automatically/);
    assert.equal(f.panels.length, 1, 'invalid selection must preserve the current panel');
    await panel.receive({ action: 'save' });
    assert.equal(panel.messages.at(-1).type, 'saved', 'the setup queue must be released');
    assert.deepEqual(fs.readdirSync(path.join(root, 'scratch')), []);
  } finally {
    clearTimeout(timer);
    notificationAnswer.resolve(undefined);
    await selection;
  }
});

test('a rejected workbench picker reports its actual error and releases controls', async () => {
  const f = fixture({ showOpenDialog: async () => { throw new Error('Folder picker unavailable.'); } });
  const panel = await f.open();
  await panel.receive({ action: 'openWorkbenchFolder' });
  assert.equal(panel.messages.at(-1).type, 'operationComplete');
  assert.equal(panel.messages.at(-1).error, 'Folder picker unavailable.');
  await panel.receive({ action: 'save' });
  assert.equal(panel.messages.at(-1).type, 'saved');
});

test('choosing an existing project reuses its marked storage without another location or window', async () => {
  const parent = fs.mkdtempSync(path.join(scratch, 'project-parent-'));
  fixtureRoots.push(parent);
  const selectedRoot = createWorkbench(path.join(parent, '.skilljetty-prerelease'));
  const f = fixture({ showOpenDialog: async () => [{ fsPath: parent }] });
  const panel = await f.open();
  const before = fs.readdirSync(selectedRoot).sort();
  await panel.receive({ action: 'createWorkbench' });
  assert.equal(f.controllers.at(-1).root, selectedRoot);
  assert.deepEqual(fs.readdirSync(selectedRoot).sort(), before);
  assert.equal(f.events.some(event => event.type === 'information'), false);
  assert.equal(f.events.some(event => event.type === 'native-command' && event.args[0] === 'vscode.openFolder'), false);
  assert.equal(f.rememberedState.get('skillBuilder.selectedWorkbench.v1').dataRoot, selectedRoot);
});

test('choosing a previously connected repository opens and remembers its existing data without conversion', async () => {
  const { execFileSync } = require('node:child_process');
  const project = fs.mkdtempSync(path.join(scratch, 'existing-project-'));
  fixtureRoots.push(project);
  const git = (...args) => execFileSync('git', args, { cwd: project, windowsHide: true, stdio: 'pipe' });
  git('init', '--initial-branch=main');
  git('remote', 'add', 'origin', 'https://github.com/example/project.git');
  const config = fs.readFileSync(path.join(project, '.git/config'));
  const dataRoot = path.join(project, '.skilljetty-prerelease');
  fs.mkdirSync(path.join(dataRoot, '.skill-workbench'), { recursive: true });
  const connection = Buffer.from(JSON.stringify({ format: 1, repository: 'https://github.com/example/project.git', localPath: project, baseBranch: 'main' }));
  fs.writeFileSync(path.join(dataRoot, '.skill-workbench/connection.json'), connection);
  const rememberedState = new Map();
  const first = fixture({ rememberedState, showOpenDialog: async () => [{ fsPath: project }] });
  const panel = await first.open();
  await panel.receive({ action: 'createWorkbench' });
  assert.equal(first.controllers.at(-1).root, dataRoot);
  assert.equal(first.controllers.at(-1).hooks.workspaceSelection.kind, 'existing-repository');
  assert.equal(fs.existsSync(path.join(dataRoot, '.skilljetty-workbench.json')), false);
  assert.equal(first.events.some(event => event.type === 'information'), false);
  assert.equal(rememberedState.get('skillBuilder.selectedWorkbench.v1').repositoryRoot, project);
  const reopened = fixture({ rememberedState });
  await reopened.open();
  assert.equal(reopened.controllers.at(-1).root, dataRoot);
  assert.deepEqual(fs.readFileSync(path.join(project, '.git/config')), config);
  assert.deepEqual(fs.readFileSync(path.join(dataRoot, '.skill-workbench/connection.json')), connection);
});

for (const outcome of ['selected', 'canceled', 'failed']) {
  test(`project opens in the same window without another folder notification: ${outcome}`, async () => {
    const pickerEntered = deferred();
    const selectedRoot = managedRoot();
    const selectedPackage = path.join(selectedRoot, 'scratch', 'example.skill');
    const f = fixture({
      showOpenDialog: async options => {
        if (options.canSelectFolders) return [{ fsPath: selectedRoot }];
        pickerEntered.resolve(options);
        if (outcome === 'failed') throw new Error('Native picker unavailable.');
        return outcome === 'selected' ? [{ fsPath: selectedPackage }] : undefined;
      }
    });
    const originalPanel = await f.open();
    await originalPanel.receive({ action: 'openWorkbenchFolder' });
    const panel = f.panels.at(-1);
    assert.notEqual(panel, originalPanel, 'setup renders the usable project');
    assert.equal(f.events.some(event => event.type === 'information'), false);
    assert.equal(f.events.some(event => event.type === 'native-command' && event.args[0] === 'vscode.openFolder'), false);
    let selected;
    f.dispatchHooks.set('openPackage', async controller => {
      // Exercise the actual host hook, including pickerRoot and showOpenDialog.
      selected = await controller.hooks.pickPackage();
      controller.state.notice = selected ? 'Selected package.' : 'Opening canceled.';
    });
    const opening = panel.receive({ action: 'openPackage' });
    let timer;
    try {
      const options = await Promise.race([
        pickerEntered.promise,
        new Promise(resolve => { timer = setTimeout(() => resolve(undefined), 1500); })
      ]);
      assert(options, 'the project must be ready for opening content');
      assert.equal(options.title, 'Open a .skill package');
      assert.deepEqual(options.filters, { 'Skill packages': ['skill'] });
      assert.equal(options.canSelectFiles, true);
      assert.equal(options.canSelectFolders, false);
      await opening;
      assert.equal(selected, outcome === 'selected' ? selectedPackage : undefined);
      const completion = panel.messages.find(message => message.type === 'operationComplete');
      assert(completion, 'selection, cancellation and picker failure must all terminate the operation');
      assert.equal(completion.error, outcome === 'failed' ? 'Native picker unavailable.' : undefined);
      await panel.receive({ action: 'save' });
      assert.equal(panel.messages.at(-1).type, 'saved', 'a completed picker must release the host queue');
    } finally {
      clearTimeout(timer);
      await opening;
    }
  });
}

test('settings changed during GitHub sign-in prevent dispatch to a newer destination', async () => {
  const entered = deferred(), release = deferred();
  const f = fixture({ getSession: async () => { entered.resolve(); return release.promise; } }), panel = await f.open();
  f.controllers[0].state.configuredRepository = 'https://github.com/example/original';
  f.events.length = 0;
  const action = panel.receive({ action: 'verifyRepository' }); await entered.promise;
  f.changeConfiguration('prerelease.repositoryUrl', 'https://github.com/example/new-destination');
  release.resolve({ accessToken: 'test-session-token' }); await action;
  assert.equal(f.events.some(event => event.type === 'dispatch' && event.action === 'verifyRepository'), false);
  assert.match(f.controllers[0].state.error, /changed during GitHub sign-in/);
  assert(panel.messages.some(message => message.type === 'operationComplete' && message.error));
});


test('an invalid external repository setting never autosaves its documents or blocks local Check', async () => {
  const f = fixture(), panel = await f.open();
  const outsideRepository = path.join(scratch, 'unrelated-repository');
  f.settings.set('prerelease.repositoryUrl', 'https://github.com/example/skills');
  f.settings.set('prerelease.localRepositoryPath', outsideRepository);
  let outsideSaves = 0, draftSaves = 0;
  f.vscode.workspace.textDocuments.push(
    { isDirty: true, uri: { scheme: 'file', fsPath: path.join(outsideRepository, 'SKILL.md') }, async save() { outsideSaves++; return true; } },
    { isDirty: true, uri: { scheme: 'file', fsPath: path.join(f.root, 'skills/local-draft/SKILL.md') }, async save() { draftSaves++; return true; } }
  );
  f.events.length = 0;
  await panel.receive({ action: 'check' });
  assert.equal(outsideSaves, 0, 'an invalid configured repository cannot authorize saving an outside document');
  assert.equal(draftSaves, 1, 'the legitimate local draft remains saveable');
  assert(f.events.some(event => event.type === 'dispatch' && event.action === 'check'));
  assert.equal(f.controllers[0].state.error, undefined);
  assert(panel.messages.some(message => message.type === 'operationComplete' && !message.error));
});

test('an explicit root setting supersedes a workbench selected earlier through setup', async () => {
  const workbenchA = managedRoot(), workbenchB = managedRoot();
  let configuredRoot;
  const f = fixture({ getRoot: async () => configuredRoot, showOpenDialog: async () => [{ fsPath: workbenchA }] });
  const initialPanel = await f.open();
  assert.equal(f.controllers.at(-1).root, undefined);
  await initialPanel.receive({ action: 'openWorkbenchFolder' });
  const selectedPanel = f.panels.at(-1);
  assert.equal(f.controllers.at(-1).root, workbenchA);
  assert.notEqual(selectedPanel, initialPanel);
  configuredRoot = workbenchB;
  f.changeConfiguration('projectRoot', workbenchB);
  await new Promise(resolve => setImmediate(resolve));
  selectedPanel.close();
  const reopened = await f.open();
  assert.notEqual(reopened, selectedPanel);
  assert.equal(f.controllers.at(-1).root, workbenchB, 'the old in-memory setup selection must not override a later explicit setting');
  assert.equal(f.controllers.at(-1).state.workFolder, workbenchB);
  assert(fs.existsSync(path.join(workbenchA, '.skilljetty-workbench.json')), 'the former workbench stays intact');
  assert(fs.existsSync(path.join(workbenchB, '.skilljetty-workbench.json')));
  assert.deepEqual(f.updates, [], 'switching does not write ambient project settings');
});


test('a missing workbench marker sends a terminal error without dispatch, autosave or replacing unsaved edits', async () => {
  const f = fixture(), panel = await f.open();
  const baselineRenders = panel.htmlWrites;
  let internalSaves = 0, outsideSaves = 0;
  f.vscode.workspace.textDocuments.push(
    { isDirty: true, uri: { scheme: 'file', fsPath: path.join(f.root, 'skills/sample/SKILL.md') }, async save() { internalSaves++; return true; } },
    { isDirty: true, uri: { scheme: 'file', fsPath: path.join(scratch, 'unrelated-project/SKILL.md') }, async save() { outsideSaves++; return true; } }
  );
  fs.unlinkSync(path.join(f.root, '.skilljetty-workbench.json'));
  f.events.length = 0; panel.messages.length = 0;
  await panel.receive({ action: 'check', editorSkillId: 'sample', editorPath: 'SKILL.md', editorContent: 'Latest unsaved work must stay in the editor.' });
  assert.equal(f.events.some(event => event.type === 'dispatch'), false);
  assert.equal(internalSaves, 0); assert.equal(outsideSaves, 0);
  const completion = panel.messages.find(message => message.type === 'operationComplete');
  assert(completion, 'a rejected write boundary must release the client action lock');
  assert.match(completion.error, /missing|damaged/i);
  assert.equal(panel.htmlWrites, baselineRenders, 'a boundary failure must not replace the document containing the unpersisted editor buffer');
});

test('explicitly chosen workbench survives reactivation without changing project settings', async () => {
  const fallback = managedRoot(), selected = managedRoot(), rememberedState = new Map();
  const first = fixture({ root: fallback, rememberedState, showOpenDialog: async () => [{ fsPath: selected }] });
  await (await first.open()).receive({ action: 'openWorkbenchFolder' });
  assert.equal(first.controllers.at(-1).root, selected);
  assert.equal(rememberedState.get('skillBuilder.selectedWorkbench.v1').dataRoot, selected);
  const second = fixture({ root: fallback, rememberedState });
  await second.open();
  assert.equal(second.controllers.at(-1).root, selected, 'restoring the explicit choice must not revert to a global fallback');
  assert.deepEqual(first.updates, []); assert.deepEqual(second.updates, []);
  assert.equal(second.events.some(event => event.type === 'folder-picker'), false);
});

test('a root setting changed while inactive supersedes the remembered workbench', async () => {
  const former = managedRoot(), later = managedRoot(), rememberedState = new Map();
  const first = fixture({ rememberedState, showOpenDialog: async () => [{ fsPath: former }] });
  await (await first.open()).receive({ action: 'openWorkbenchFolder' });
  const second = fixture({ root: later, rememberedState, initialSettings: [['projectRoot', later]] });
  await second.open();
  assert.equal(second.controllers.at(-1).root, later);
  assert(fs.existsSync(path.join(former, '.skilljetty-workbench.json')));
});

for (const saved of ['corrupt', { format: 99, dataRoot: '/unknown', rootSettingsFingerprint: 'newer-format' }]) {
  test(`invalid remembered selection fails closed: ${typeof saved === 'string' ? saved : 'unknown format'}`, async () => {
    const rememberedState = new Map([['skillBuilder.selectedWorkbench.v1', saved]]);
    let fallbackCalls = 0;
    const f = fixture({ rememberedState, getRoot: async () => { fallbackCalls++; return managedRoot(); } });
    await f.open();
    assert.equal(fallbackCalls, 0, 'corrupt state cannot silently select a different writable folder');
    assert.equal(f.controllers.at(-1).root, undefined);
    assert.match(f.controllers.at(-1).state.error, /saved work location is invalid/i);
    assert.deepEqual(f.rememberedUpdates, [], 'keep corrupt state as recovery evidence until an explicit choice');
  });
}

test('remembered workbench with a removed marker cannot fall back to another workbench', async () => {
  const selected = managedRoot(), rememberedState = new Map();
  const first = fixture({ rememberedState, showOpenDialog: async () => [{ fsPath: selected }] });
  await (await first.open()).receive({ action: 'openWorkbenchFolder' });
  fs.unlinkSync(path.join(selected, '.skilljetty-workbench.json'));
  let fallbackCalls = 0;
  const second = fixture({ rememberedState, getRoot: async () => { fallbackCalls++; return managedRoot(); } });
  await second.open();
  assert.equal(fallbackCalls, 0); assert.equal(second.controllers.at(-1).root, undefined);
  assert.match(second.controllers.at(-1).state.error, /saved workbench is unavailable/i);
});

test('root change during selection persistence does not clear invalidation or reopen a different folder', async () => {
  const original = managedRoot(), selected = managedRoot(), replacement = managedRoot(), entered = deferred(), release = deferred();
  let configuredRoot = original;
  const f = fixture({ getRoot: async () => configuredRoot, showOpenDialog: async () => [{ fsPath: selected }],
    onRemember: async (_key, value) => { if (value?.dataRoot === selected) { entered.resolve(); await release.promise; } } });
  const panel = await f.open(), selecting = panel.receive({ action: 'openWorkbenchFolder' });
  await entered.promise;
  configuredRoot = replacement; f.changeConfiguration('projectRoot', replacement);
  release.resolve(); await selecting;
  assert.equal(f.panels.length, 1, 'late persistence must not dispose/reopen the current panel');
  assert.equal(f.controllers.at(-1).root, original);
  assert(panel.messages.some(message => message.type === 'operationComplete' && /workbench changed/i.test(message.error ?? '')));
  panel.close(); await f.open();
  assert.equal(f.controllers.at(-1).root, replacement, 'the later setting remains authoritative');
  for (const root of [original, selected, replacement]) assert(fs.existsSync(path.join(root, '.skilljetty-workbench.json')));
});

test('failed selection persistence keeps the selected workbench usable and explains resumption', async () => {
  const selected = managedRoot();
  const f = fixture({ showOpenDialog: async () => [{ fsPath: selected }], onRemember: async () => { throw new Error('Memento unavailable'); } });
  await (await f.open()).receive({ action: 'openWorkbenchFolder' });
  assert.equal(f.controllers.at(-1).root, selected);
  assert.match(f.controllers.at(-1).state.notice, /location could not be remembered/);
  assert.equal(f.panels.at(-1).messages.some(message => message.type === 'operationComplete' && message.error), false);
});

function activationSelection(opened, inspection) {
  const file = require.resolve('../out/extension.js'), originalLoad = Module._load;
  let hooks;
  const configured = inspection.workspaceFolderValue ?? inspection.workspaceValue ?? inspection.globalValue ?? '';
  const vscode = { EventEmitter: class { event() {} }, TreeItem: class {},
    workspace: { workspaceFolders: [{ uri: { fsPath: opened } }], getConfiguration: () => ({ get: () => configured, inspect: () => inspection }) } };
  delete require.cache[file];
  try {
    Module._load = function(id, parent, main) {
      if (id === 'vscode') return vscode;
      if (parent?.filename === file && id === './guided-workbench.js') return { activateGuidedWorkbench(_context, value) { hooks = value; } };
      return originalLoad.call(this, id, parent, main);
    };
    require(file).activate({});
  } finally { Module._load = originalLoad; delete require.cache[file]; }
  assert(hooks); return hooks.getWorkspace();
}

test('opening an exact initialized workbench supersedes only the global root fallback', async () => {
  const globalParent = fs.mkdtempSync(path.join(scratch, 'global-')); fixtureRoots.push(globalParent);
  const globalRoot = createWorkbench(path.join(globalParent, '.skilljetty-prerelease')), opened = managedRoot();
  assert.equal((await activationSelection(opened, { globalValue: globalRoot })).dataRoot, opened);
  for (const scope of ['workspaceValue', 'workspaceFolderValue']) {
    assert.equal((await activationSelection(opened, { globalValue: opened, [scope]: globalRoot })).dataRoot, globalRoot, `${scope} remains authoritative`);
  }
});

test('ordinary opened folders with a managed child are not adopted over a configured root', async () => {
  const globalParent = fs.mkdtempSync(path.join(scratch, 'global-')); fixtureRoots.push(globalParent);
  const globalRoot = createWorkbench(path.join(globalParent, '.skilljetty-prerelease')), ordinary = fs.mkdtempSync(path.join(scratch, 'ordinary-'));
  fixtureRoots.push(ordinary); createWorkbench(path.join(ordinary, '.skilljetty-prerelease'));
  assert.equal((await activationSelection(ordinary, { globalValue: globalRoot })).dataRoot, globalRoot);
});

test('passive plugin metadata replies without activity locks, page replacement or unrelated payload fields', async () => {
  const f = fixture({ metadataResult: { pluginName: 'team-tools', pluginVersion: '1.0.2' } }), panel = await f.open();
  const baseline = panel.htmlWrites; f.events.length = 0; panel.messages.length = 0;
  await panel.receive({ action: 'updatePluginMetadata', requestId: 'plugin-meta:1', payload: {
    pluginName: 'team-tools', pluginVersion: '1.0.0', pluginVersionSource: 'suggested', pluginMembers: ['unreviewed'], repositoryUrl: 'https://github.com/unrelated/other' } });
  assert.deepEqual(f.events.find(event => event.type === 'plugin-metadata').input, { pluginName: 'team-tools', pluginVersion: '1.0.0' });
  assert.equal(panel.htmlWrites, baseline);
  assert.deepEqual(panel.messages, [{ type: 'pluginMetadataUpdated', requestId: 'plugin-meta:1', pluginName: 'team-tools', pluginVersion: '1.0.2' }]);
  assert.equal(f.events.some(event => event.type === 'dispatch'), false);
  assert.deepEqual(f.updates, []);
});

test('oversized passive metadata is rejected without invoking the controller or replacing the form', async () => {
  const f = fixture(), panel = await f.open(), baseline = panel.htmlWrites; f.events.length = 0; panel.messages.length = 0;
  await panel.receive({ action: 'updatePluginMetadata', requestId: 'plugin-meta:bad', payload: { pluginName: 'x'.repeat(257), pluginVersion: '1.0.0' } });
  assert.equal(f.events.some(event => event.type === 'plugin-metadata'), false);
  assert.equal(panel.htmlWrites, baseline);
  assert.match(panel.messages[0].error, /short text/);
  assert.equal(panel.messages[0].requestId, 'plugin-meta:bad');
});

test('passive metadata cannot read a workbench whose marker changed', async () => {
  const f = fixture(), panel = await f.open(), baseline = panel.htmlWrites; f.events.length = 0; panel.messages.length = 0;
  fs.unlinkSync(path.join(f.root, '.skilljetty-workbench.json'));
  await panel.receive({ action: 'updatePluginMetadata', requestId: 'plugin-meta:marker', payload: { pluginName: 'team-tools', pluginVersion: '1.0.0' } });
  assert.equal(f.events.some(event => event.type === 'plugin-metadata'), false);
  assert.equal(panel.htmlWrites, baseline);
  assert.match(panel.messages[0].error, /missing|damaged/i);
});

test('a late message from a disposed panel cannot act on the replacement workbench', async () => {
  const selected = managedRoot(), f = fixture({ showOpenDialog: async () => [{ fsPath: selected }] });
  const oldPanel = await f.open(); await oldPanel.receive({ action: 'openWorkbenchFolder' });
  const current = f.panels.at(-1); assert.notEqual(current, oldPanel);
  const writes = current.htmlWrites; f.events.length = 0; current.messages.length = 0;
  await oldPanel.receive({ action: 'updatePluginMetadata', requestId: 'late-old-panel', payload: { pluginName: 'wrong-workbench', pluginVersion: '9.0.0' } });
  await oldPanel.receive({ action: 'publish', payload: { reviewer: 'someone', confirmed: true } });
  assert.equal(f.events.some(event => event.type === 'plugin-metadata' || event.type === 'dispatch'), false);
  assert.equal(current.htmlWrites, writes); assert.deepEqual(current.messages, []);
  assert.equal(f.controllers.at(-1).root, selected);
});

test('Connect repository opens the guided native flow, preserves editor buffer and saves one complete pair', async () => {
  const f = fixture({ repositoryFlow: {},
    showInputBox: async () => 'example/next',
    showQuickPick: async () => ({ mode: 'existing' }),
    showOpenDialog: async () => [{ fsPath: path.join(scratch, 'separate-next') }],
    showInformationMessage: async (_message, _options, action) => action,
    getSession: async () => ({ accessToken: 'test-fixture-only', account: { label: 'fixture' } })
  });
  const panel = await f.open();
  await panel.receive({ action: 'configureRepository', editorSkillId: 'draft', editorPath: 'SKILL.md', editorContent: 'current unsaved text' });
  assert.equal(f.events.filter(event => event.type === 'connection-accepted').length, 1);
  assert.equal(f.controllers[0].state.connection.repository, 'https://github.com/example/next.git');
  assert.equal(f.controllers[0].state.connection.localPath, path.join(scratch, 'separate-next'));
  assert.ok(f.events.find(event => event.type === 'dispatch' && event.action === 'save' && event.message.editorContent === 'current unsaved text'));
  assert.equal(f.events.some(event => event.type === 'native-command' && event.args[0] === 'workbench.action.openSettings'), false);
  assert.equal(f.updates.length, 0, 'connection does not partially rewrite native settings');
});

test('canceling guided repository setup keeps the current connection and never opens Settings', async () => {
  const f = fixture({ repositoryFlow: {}, showInputBox: async () => undefined });
  const panel = await f.open();
  const previous = { repository: 'https://github.com/example/old.git', localPath: path.join(scratch, 'old'), baseBranch: 'main' };
  f.controllers[0].state.connection = previous;
  await panel.receive({ action: 'configureRepository' });
  assert.deepEqual(f.controllers[0].state.connection, previous);
  assert.equal(f.events.some(event => event.type === 'connection-accepted' || event.type === 'local-cloned'), false);
  assert.equal(f.events.some(event => event.type === 'native-command'), false);
  assert.match(f.controllers[0].state.notice, /canceled/);
});

test('another window changing the saved connection while the URL prompt is open cancels activation', async () => {
  let f;
  const replacement = JSON.stringify({ format: 1, repository: 'https://github.com/example/other.git', baseBranch: 'main' });
  f = fixture({ repositoryFlow: {}, showInputBox: async () => {
    fs.writeFileSync(path.join(f.root, '.skill-workbench', 'connection.json'), replacement);
    return 'example/next';
  } });
  const panel = await f.open();
  await panel.receive({ action: 'configureRepository' });
  assert.match(f.controllers[0].state.error, /Another window changed/);
  assert.equal(fs.readFileSync(path.join(f.root, '.skill-workbench', 'connection.json'), 'utf8'), replacement);
  assert.equal(f.events.some(event => event.type === 'connection-accepted' || event.type === 'local-cloned'), false);
});
