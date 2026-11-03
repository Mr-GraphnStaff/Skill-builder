const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const Module = require('node:module');
const { resolveExistingRepositoryWorkspace, assertWorkspaceSelection, assertWorkspaceRepository, existingWorkspaceForPath, allowsExistingGitTrust } = require('../out/workspace-selection.js');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const { runWorkbenchJob } = require('../out/workbench-jobs.js');
const { createWorkbench } = require('../out/workbench-setup.js');
const scratch = require('./working-fixture.cjs').workingFixture('existing-workspace');
fs.mkdirSync(scratch, { recursive: true });
const roots = [];
const remote = 'https://github.com/example/skills';
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
Object.assign(env, { GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' });
function directory(prefix) { const root = fs.mkdtempSync(path.join(scratch, prefix)); roots.push(root); return root; }
function git(root, ...args) {
  return cp.execFileSync('git', ['--no-optional-locks', '-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, env, windowsHide: true, encoding: 'utf8', stdio: 'pipe' }).trim();
}
function fixture() {
  const root = directory('repository-'), dataRoot = path.join(root, '.skilljetty-prerelease');
  git(root, 'init', '-b', 'main'); git(root, 'remote', 'add', 'origin', `${remote}.git`);
  fs.mkdirSync(path.join(dataRoot, '.skill-workbench'), { recursive: true });
  const connection = path.join(dataRoot, '.skill-workbench', 'connection.json');
  fs.writeFileSync(connection, JSON.stringify({ format: 1, repository: remote, baseBranch: 'main', localPath: root }));
  fs.writeFileSync(path.join(root, 'preserved-user-file.txt'), 'unchanged\n');
  return { root, dataRoot, connection };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function hostFixture(selection, options = {}) {
  const events = [], panels = [], commands = new Map(), controllers = [];
  const disposable = () => ({ dispose() {} });
  class Controller {
    constructor(root, hooks) {
      this.hooks = hooks;
      this.state = { step: 'start', hasWorkspace: !!root, workFolder: root, workspaceMode: hooks.workspaceSelection?.kind,
        repositoryRoot: hooks.workspaceSelection?.repositoryRoot, repositories: [], drafts: [], library: [], files: [], target: 'portable' };
      controllers.push(this);
    }
    async dispatch(message) { await options.dispatch?.(message, this); }
    async verifyRepository() {}
    async loadHome() { return false; }
    refreshRepositorySettings() {}
  }
  const vscode = {
    ViewColumn: { One: 1 }, Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
    ConfigurationTarget: { Workspace: 2 },
    authentication: { async getSession() {} },
    commands: { registerCommand(id, handler) { commands.set(id, handler); return disposable(); }, async executeCommand() {} },
    workspace: { textDocuments: [], workspaceFolders: [], onDidSaveTextDocument: disposable, onDidChangeConfiguration: disposable,
      getConfiguration() { return { get: () => '', inspect: () => ({ defaultValue: '' }) }; } },
    window: {
      showOpenDialog() { events.push({ type: 'picker' }); return options.pick?.(); },
      async showInformationMessage() {},
      async showErrorMessage() { return options.errorNotice?.(); },
      registerWebviewViewProvider: disposable,
      createWebviewPanel() {
        const panel = { messages: [], reveal() {}, onDidDispose(callback) { this.closed = callback; return disposable(); }, dispose() { this.closed?.(); },
          webview: { async postMessage(message) { panel.messages.push(message); events.push({ type: 'message', message }); await options.postMessage?.(message); return true; }, onDidReceiveMessage(callback) { panel.receive = callback; return disposable(); } } };
        panels.push(panel); return panel;
      }
    }
  };
  const filename = require.resolve('../out/guided-workbench.js'), load = Module._load;
  delete require.cache[filename];
  try {
    Module._load = function(id, parent, main) {
      if (parent?.filename === filename && id === 'vscode') return vscode;
      if (parent?.filename === filename && id === './guided-controller.js') return { GuidedWorkbenchController: Controller };
      return load.call(this, id, parent, main);
    };
    require(filename).activateGuidedWorkbench({ subscriptions: [], extensionPath: path.resolve(__dirname, '..'), extension: { packageJSON: { version: '0.15.2' } } }, {
      getRoot: async () => undefined, getWorkspace: async () => selection
    });
  } finally { Module._load = load; delete require.cache[filename]; }
  return { events, panels, controllers, async open() { await commands.get('skillBuilder.openWorkbench')(); return panels.at(-1); } };
}
test.after(() => { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); });

test('existing Git trust retains exact and descendant grants and honors empty resets', () => {
  const root = path.join(scratch, 'trusted', 'repository'), parent = path.dirname(root);
  assert.equal(allowsExistingGitTrust([root], root), true);
  assert.equal(allowsExistingGitTrust([`${parent.replaceAll('\\', '/')}/*`], root), true);
  assert.equal(allowsExistingGitTrust([`${root.replaceAll('\\', '/')}/*`], root), false, 'a descendant grant does not grant its named parent');
  assert.equal(allowsExistingGitTrust(['*', ''], root), false);
  assert.equal(allowsExistingGitTrust([root, ''], root), false);
  assert.equal(allowsExistingGitTrust(['*', '', root], root), true);
  assert.equal(allowsExistingGitTrust([`${parent}-other/*`], root), false);
});

test('explicit existing repository restores saved connection and local editing without a managed marker or migration', async () => {
  const f = fixture(), config = fs.readFileSync(path.join(f.root, '.git/config'));
  const selection = await resolveExistingRepositoryWorkspace(f.root);
  assert.equal(selection.kind, 'existing-repository');
  assert.equal(selection.dataRoot, f.dataRoot); assert.equal(selection.repositoryRoot, f.root);
  assert.equal(existingWorkspaceForPath(f.root), selection);
  assert.equal(existingWorkspaceForPath(path.join(f.root, 'unrelated-folder')), undefined);
  const controller = new GuidedWorkbenchController(f.dataRoot, { workspaceSelection: selection, enforceWorkbench: false });
  await controller.dispatch({ action: 'ready' });
  assert.equal(controller.state.workspaceMode, 'existing-repository');
  assert.equal(controller.state.connection.repository, remote);
  assert.equal(controller.state.connection.localPath, f.root);
  assert.equal(controller.state.connection.baseBranch, 'main');
  await controller.dispatch({ action: 'createSkill', payload: { name: 'legacy-draft', description: 'A retained local workflow.', instructions: '# Instructions\nPreserve files.' } });
  assert.equal(controller.state.error, undefined);
  assert(controller.state.active);
  await controller.dispatch({ action: 'check' });
  assert.equal(controller.state.error, undefined);
  assert.equal(controller.state.check.valid, true, 'the bounded worker accepts the explicitly restored legacy data root');
  assert.equal(fs.existsSync(path.join(f.dataRoot, '.skilljetty-workbench.json')), false);
  assert.equal(fs.existsSync(path.join(f.root, 'repositories')), false);
  assert.equal(fs.readFileSync(path.join(f.root, 'preserved-user-file.txt'), 'utf8'), 'unchanged\n');
  assert(fs.readFileSync(path.join(f.root, '.git/config')).equals(config), 'resolution and editing do not mutate Git configuration');
});

test('a folder without a saved matching repository mapping is not adopted', async () => {
  const root = directory('unconfigured-');
  assert.equal(await resolveExistingRepositoryWorkspace(root), undefined);
  assert.deepEqual(fs.readdirSync(root), []);
  const f = fixture();
  const saved = JSON.parse(fs.readFileSync(f.connection)); saved.localPath = path.join(f.root, 'skill-subfolder');
  fs.writeFileSync(f.connection, JSON.stringify(saved));
  await assert.rejects(resolveExistingRepositoryWorkspace(f.root), /does not identify this repository root/);
  assert.equal(fs.existsSync(path.join(f.dataRoot, '.skilljetty-workbench.json')), false);
});

test('saved remote mismatch or changed Git configuration blocks the existing workspace without writes', async () => {
  const f = fixture();
  git(f.root, 'remote', 'set-url', 'origin', 'https://github.com/example/other.git');
  await assert.rejects(resolveExistingRepositoryWorkspace(f.root), /origin differs/);
  git(f.root, 'remote', 'set-url', 'origin', `${remote}.git`);
  const selection = await resolveExistingRepositoryWorkspace(f.root);
  const controller = new GuidedWorkbenchController(f.dataRoot, { workspaceSelection: selection, enforceWorkbench: false });
  git(f.root, 'remote', 'set-url', 'origin', 'https://github.com/example/other.git');
  assert.throws(() => assertWorkspaceSelection(selection), /configuration changed/);
  await controller.dispatch({ action: 'createSkill', payload: { name: 'blocked-draft', description: 'Must not be created.', instructions: 'Never write.' } });
  assert.match(controller.state.error, /configuration changed/);
  assert.equal(fs.existsSync(path.join(f.dataRoot, 'skills')), false);
});

test('existing mapping permits only its exact repository root and canonical remote', async () => {
  const f = fixture(), selection = await resolveExistingRepositoryWorkspace(f.root);
  assert.doesNotThrow(() => assertWorkspaceRepository(selection, `${remote}.git`, f.root));
  assert.throws(() => assertWorkspaceRepository(selection, remote, path.join(f.root, 'skill-subfolder')), /saved repository root and remote/);
  assert.throws(() => assertWorkspaceRepository(selection, 'https://github.com/example/other', f.root), /saved repository root and remote/);
  assert.throws(() => assertWorkspaceRepository(selection, 'file:///outside', f.root), /GitHub HTTPS/);
});

test('legacy workers retain a data boundary and managed workers still require their marker by default', async () => {
  const f = fixture(), outside = directory('outside-'), source = directory('source-');
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: boundary-test\ndescription: Boundary test\n---\nInstructions.\n');
  await assert.rejects(runWorkbenchJob({ kind: 'registerFolder', root: outside, folder: source }, { boundaryRoot: f.dataRoot, requireManaged: false }), /destination must remain inside/);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.throws(() => runWorkbenchJob({ kind: 'library', root: f.dataRoot }, { boundaryRoot: f.dataRoot }), /Create Workbench or Open Existing Workbench/);
  const managed = directory('managed-'); createWorkbench(managed);
  fs.unlinkSync(path.join(managed, '.skilljetty-workbench.json'));
  assert.throws(() => runWorkbenchJob({ kind: 'library', root: managed }, { boundaryRoot: managed }), /missing or damaged/);
});

test('actual host accepts the existing selection without a marker and only announces picker waiting after invocation', async () => {
  const f = fixture(), selection = await resolveExistingRepositoryWorkspace(f.root);
  const checking = deferred(), releaseCheck = deferred(), picker = deferred(), errorNotice = deferred();
  const host = hostFixture(selection, {
    dispatch: async message => { if (message.action === 'check') { checking.resolve(); await releaseCheck.promise; } },
    pick: () => picker.promise, errorNotice: () => errorNotice.promise
  });
  const panel = await host.open();
  assert.equal(host.controllers[0].hooks.workspaceSelection, selection);
  assert.equal(host.controllers[0].hooks.enforceWorkbench, false);
  const check = panel.receive({ action: 'check' }); await checking.promise;
  const setup = panel.receive({ action: 'openWorkbenchFolder' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(host.events.some(event => event.type === 'picker'), false, 'queued setup has not invoked a picker');
  assert.equal(panel.messages.some(message => message.type === 'progress' && message.waitingForInput), false, 'queued setup must not claim to wait for selection');
  releaseCheck.resolve(); await check;
  await new Promise(resolve => setImmediate(resolve));
  const pickerIndex = host.events.findIndex(event => event.type === 'picker');
  const waitingIndex = host.events.findIndex(event => event.type === 'message' && event.message.waitingForInput === true);
  assert(pickerIndex >= 0 && waitingIndex > pickerIndex);
  picker.resolve([{ fsPath: f.root }]);
  await setup;
  const checkingIndex = host.events.findIndex((event, index) => index > waitingIndex && event.type === 'message' && event.message.type === 'progress' && event.message.waitingForInput === false);
  assert(checkingIndex > waitingIndex, 'returned selection switches to checking rather than retaining picker wait');
  const current = host.panels.at(-1);
  assert.notEqual(current, panel, 'the explicitly selected saved project is opened');
  assert.equal(host.controllers.at(-1).hooks.workspaceSelection.kind, 'existing-repository');
  await current.receive({ action: 'save' });
  assert.equal(current.messages.at(-1).type, 'saved', 'the selected project remains ready for editing');
  errorNotice.resolve();
  assert.equal(fs.existsSync(path.join(f.dataRoot, '.skilljetty-workbench.json')), false);
});

test('immediate picker rejection is handled while the waiting feedback IPC is still pending', async () => {
  const root = directory('picker-error-'); createWorkbench(root);
  const waiting = deferred(), feedback = deferred();
  const host = hostFixture({ kind: 'managed', dataRoot: root }, {
    pick: () => Promise.reject(new Error('Native folder picker rejected immediately.')),
    postMessage: async message => { if (message.waitingForInput) { waiting.resolve(); await feedback.promise; } }
  });
  const panel = await host.open(), setup = panel.receive({ action: 'openWorkbenchFolder' });
  await waiting.promise;
  await new Promise(resolve => setImmediate(resolve));
  feedback.resolve();
  await setup;
  assert.match(panel.messages.at(-1).error, /Native folder picker rejected immediately/);
  await panel.receive({ action: 'save' });
  assert.equal(panel.messages.at(-1).type, 'saved');
});
