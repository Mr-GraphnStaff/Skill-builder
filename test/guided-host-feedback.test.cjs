const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  const panels = [], controllers = [], commands = new Map(), events = [], dispatchHooks = new Map();
  const disposable = () => ({ dispose() {} });
  class Controller {
    constructor(root, hooks) {
      this.root = root; this.hooks = hooks;
      this.state = { step: 'start', hasWorkspace: true, repositories: [], drafts: [], library: [], files: [], target: 'portable' };
      controllers.push(this);
    }
    async dispatch(message) {
      events.push({ type: 'dispatch', action: message.action, controller: this });
      return dispatchHooks.has(message.action) ? dispatchHooks.get(message.action)(this, message) : this.state;
    }
  }
  const vscode = {
    ViewColumn: { One: 1 },
    commands: { registerCommand(id, handler) { commands.set(id, handler); return disposable(); }, async executeCommand() {} },
    workspace: { textDocuments: [], workspaceFolders: [], onDidSaveTextDocument: disposable },
    window: {
      createOutputChannel() { return { appendLine: line => events.push({ type: 'log', line }), dispose() {} }; },
      registerWebviewViewProvider: disposable,
      createWebviewPanel() {
        const panel = { htmlWrites: 0, messages: [], reveal() {}, onDidDispose(handler) { this.closed = handler; return disposable(); },
          close() { this.closed(); },
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
      if (parent?.filename === file && id === './guided-controller.js') return { GuidedWorkbenchController: Controller };
      return originalLoad.call(this, id, parent, main);
    };
    require(file).activateGuidedWorkbench({ subscriptions: [], extensionPath: path.resolve(__dirname, '..'),
      extension: { packageJSON: { displayName: 'SkillJetty Beta — UAT' } } }, { getRoot: async () => path.resolve('fake-beta-data') });
  } finally { Module._load = originalLoad; delete require.cache[file]; }
  return { panels, controllers, commands, events, dispatchHooks,
    async open() { await commands.get('skillJettyBeta.openWorkbench')(); return panels.at(-1); } };
}

test('actual host delivers activity before dispatch and sends stage updates without replacing the page', async () => {
  const f = fixture(), panel = await f.open();
  const entered = deferred(), release = deferred();
  f.dispatchHooks.set('check', async controller => {
    controller.state.progress = 'Reading and checking the selected skill…'; controller.hooks.onState(controller.state);
    entered.resolve(); await release.promise;
  });
  f.events.length = 0; panel.messages.length = 0;
  const baselineRenders = panel.htmlWrites;
  const operation = panel.receive({ action: 'check' });
  await entered.promise;
  const firstDispatch = f.events.findIndex(event => event.type === 'dispatch');
  assert(firstDispatch > 0);
  assert.equal(f.events[0].type, 'message'); assert.equal(f.events[0].message.type, 'progress');
  assert.match(f.events[0].message.message, /checking/i);
  assert(panel.messages.some(message => message.type === 'progress' && message.message === 'Reading and checking the selected skill…'));
  assert.equal(panel.htmlWrites, baselineRenders, 'no page replacement while work is pending');
  assert.equal(panel.messages.some(message => message.type === 'operationComplete'), false);
  release.resolve(); await operation;
  assert.equal(panel.messages.at(-1).type, 'operationComplete');
  assert.equal(panel.htmlWrites, baselineRenders + 1, 'one final page replacement');
  const completion = f.events.findIndex(event => event.type === 'message' && event.message.type === 'operationComplete');
  assert(f.events.findIndex(event => event.type === 'render') > completion);
});

test('opening initializes before a single document render and emits no startup progress race', async () => {
  const f = fixture(), panel = await f.open();
  assert.equal(panel.htmlWrites, 1);
  assert.deepEqual(panel.messages, []);
  const initialized = f.events.findIndex(event => event.type === 'dispatch' && event.action === 'ready');
  const rendered = f.events.findIndex(event => event.type === 'render');
  assert(initialized >= 0 && rendered > initialized);
  assert(panel.html.indexOf('Load skills') < panel.html.indexOf('Choose how to start'));
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
  assert(f.events.some(event => event.type === 'log' && /action=OpenWorkbench durationMs=\d+ hostHeapUsedBytes=\d+/.test(event.line)));
  assert(f.events.some(event => event.type === 'log' && /hostHeapDeltaBytes=-?\d+ hostExternalBytes=\d+/.test(event.line)));
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
