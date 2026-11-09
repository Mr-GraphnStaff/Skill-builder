const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const boundary = require('../out/repository-connection-security.js');
const setup = { createWorkbench(root) { fs.mkdirSync(path.join(root, '.skill-workbench'), { recursive: true }); return root; } };
const managed = require('../out/managed-repository.js');
const guided = require('../out/guided-workspace.js');
const publisher = require('../out/repository-publisher.js');
const checkout = path.resolve(__dirname, '..');
const working = path.join(checkout, 'working');
const runRoot = path.resolve(process.env.AGENT_WORKING_DIR || path.join(working, 'test-fixtures'));
const runRelative = path.relative(working, runRoot);
if (runRelative === '..' || runRelative.startsWith('..' + path.sep) || path.isAbsolute(runRelative)) throw new Error('Security fixture must stay inside working/');
const scratch = path.join(runRoot, 'selected-repository-security');
const fixtureEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
cp.execFileSync('git', ['--no-optional-locks', '-C', checkout, 'check-ignore', '--quiet', '--', path.relative(checkout, scratch).replaceAll('\\', '/')], { env: fixtureEnv, windowsHide: true });
if (cp.execFileSync('git', ['--no-optional-locks', '-C', checkout, 'ls-files', '-z', '--', path.relative(checkout, scratch)], { env: fixtureEnv, windowsHide: true }).length) throw new Error('Tracked files cannot be security fixtures');
const remote = 'https://github.com/example/skills.git';

function fixture(t) {
  fs.mkdirSync(scratch, { recursive: true });
  const base = fs.mkdtempSync(path.join(scratch, 'case-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = setup.createWorkbench(path.join(base, 'workbench'));
  const local = path.join(base, 'repository'); fs.mkdirSync(local);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  Object.assign(env, { GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
  const git = (args, cwd = local) => cp.execFileSync('git', ['-c', `safe.directory=${cwd.replaceAll('\\', '/')}`, ...args], { cwd, env, windowsHide: true, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git(['init', '-b', 'main']);
  git(['-c', 'user.name=Security QA', '-c', 'user.email=qa@example.invalid', 'commit', '--allow-empty', '-m', 'Initial']);
  git(['remote', 'add', 'origin', remote]);
  fs.writeFileSync(path.join(local, 'author-work.txt'), 'Uncommitted author work stays intact.');
  const config = path.join(local, '.git', 'config');
  const configBytes = fs.readFileSync(config);
  const connection = path.join(root, '.skill-workbench', 'connection.json');
  const record = { format: 1, repository: remote, baseBranch: 'main', localPath: local, separateRepository: true, gitConfigDigest: boundary.selectedRepositoryConfigDigest(local) };
  return { base, root, local, config, configBytes, connection, record, git };
}

test('only the exact explicitly selected external checkout receives a grant; dirty source is preserved', async t => {
  const f = fixture(t);
  assert.throws(() => boundary.assertSelectedRepository(f.root, f.local), /pair changed/);
  const head = f.git(['rev-parse', 'HEAD']);
  await managed.validateSelectedRepository(f.root, remote, f.local);
  assert.equal(f.git(['rev-parse', 'HEAD']), head);
  assert(fs.readFileSync(f.config).equals(f.configBytes));
  assert.equal(fs.readFileSync(path.join(f.local, 'author-work.txt'), 'utf8'), 'Uncommitted author work stays intact.');
  assert.equal(fs.existsSync(f.connection), false, 'validation does not activate or save a connection');
  assert.equal(boundary.selectedRepositoryForPath(f.local), undefined, 'temporary grant expires after validation');
});

test('a mismatched existing origin is refused without repointing or activating it', async t => {
  const f = fixture(t);
  await assert.rejects(managed.validateSelectedRepository(f.root, 'https://github.com/example/another.git', f.local), /origin does not match/);
  assert(fs.readFileSync(f.config).equals(f.configBytes));
  assert.equal(fs.existsSync(f.connection), false);
});

for (const [name, payload] of [
  ['include', '\n[include]\n path = ../untrusted-config\n'],
  ['URL rewrite', '\n[url "https://attacker.invalid/"]\n insteadOf = https://github.com/\n'],
  ['push URL', '\n[remote "origin"]\n pushurl = https://attacker.invalid/skills.git\n'],
  ['worktree redirect', '\n[core]\n worktree = ../outside\n'],
  ['credential helper', '\n[credential]\n helper = !echo untrusted\n'],
  ['fsmonitor', '\n[core]\n fsmonitor = node untrusted.cjs\n'],
  ['HTTP TLS/proxy override', '\n[http]\n sslVerify = false\n proxy = https://attacker.invalid\n'],
  ['protocol override', '\n[protocol "file"]\n allow = always\n']
]) {
  test(`explicit selection does not bypass the ${name} execution/transport guard`, async t => {
    const f = fixture(t); fs.appendFileSync(f.config, payload);
    const expected = fs.readFileSync(f.config);
    await assert.rejects(managed.validateSelectedRepository(f.root, remote, f.local), /configuration redirects|redirects/);
    assert(fs.readFileSync(f.config).equals(expected));
    assert.equal(fs.existsSync(f.connection), false);
  });
}

test('Git alternates metadata remains forbidden in an explicitly selected external source', async t => {
  const f = fixture(t), alternates = path.join(f.local, '.git', 'objects', 'info', 'alternates');
  fs.writeFileSync(alternates, path.join(f.base, 'outside-objects'));
  await assert.rejects(managed.validateSelectedRepository(f.root, remote, f.local), /metadata redirects/);
  assert(fs.existsSync(alternates));
  assert.equal(fs.existsSync(f.connection), false);
});

test('an origin change after selection is refused before any credential-bearing transport starts', async t => {
  const f = fixture(t), spawn = cp.spawn; let transportCalls = 0;
  cp.spawn = function(command, args, options) {
    if (command === 'git' && args.includes('fetch')) { transportCalls++; throw new Error('UNSAFE_TRANSPORT_WAS_REACHED'); }
    return spawn(command, args, options);
  };
  try {
    await boundary.withSelectedRepository(f.root, remote, f.local, async () => {
      await publisher.repositoryGit(f.local, ['rev-parse', '--show-toplevel']);
      fs.writeFileSync(f.config, f.configBytes.toString('utf8').replace(remote, 'https://attacker.invalid/skills.git'));
      await assert.rejects(publisher.repositoryGit(f.local, ['fetch', 'origin']), /configuration changed/);
    });
    assert.equal(transportCalls, 0);
    assert.equal(fs.existsSync(f.connection), false);
  } finally { cp.spawn = spawn; }
});

test('failed replacement expires its pending grant and preserves the previous saved pair', async t => {
  const f = fixture(t);
  fs.writeFileSync(f.connection, JSON.stringify(f.record));
  boundary.recognizeSelectedRepository(f.root);
  const before = fs.readFileSync(f.connection), other = path.join(f.base, 'new-repository');
  await assert.rejects(boundary.withSelectedRepository(f.root, 'https://github.com/example/another.git', other, async () => { throw new Error('CANCELED_DURING_PREPARATION'); }), /CANCELED_DURING_PREPARATION/);
  assert(fs.readFileSync(f.connection).equals(before));
  assert.equal(boundary.selectedRepositoryForPath(other), undefined);
  assert.equal(boundary.selectedRepositoryForPath(f.local).repository, remote);
  assert.equal(guided.getWorkspaceConnection(f.root).localPath, f.local);
});

test('saved external pair fails closed after local Git configuration changes', t => {
  const f = fixture(t);
  fs.writeFileSync(f.connection, JSON.stringify(f.record));
  boundary.recognizeSelectedRepository(f.root);
  const before = fs.readFileSync(f.connection);
  fs.appendFileSync(f.config, '\n# External process changed configuration.\n');
  assert.throws(() => guided.getWorkspaceConnection(f.root), /configuration changed/);
  assert(fs.readFileSync(f.connection).equals(before));
});

test('clone never replaces a pre-existing destination or the active connection', async t => {
  const f = fixture(t);
  fs.writeFileSync(f.connection, JSON.stringify(f.record));
  const before = fs.readFileSync(f.connection), destination = path.join(f.base, 'chosen-destination');
  fs.mkdirSync(destination); fs.writeFileSync(path.join(destination, 'keep.txt'), 'keep');
  await assert.rejects(managed.cloneSelectedRepository(f.root, 'https://github.com/example/another.git', destination), /Existing folders and files were preserved/);
  assert.equal(fs.readFileSync(path.join(destination, 'keep.txt'), 'utf8'), 'keep');
  assert(fs.readFileSync(f.connection).equals(before));
});

test('a retired or temporarily superseded local source never falls back to unsanitized Git', async t => {
  const f = fixture(t);
  fs.writeFileSync(f.connection, JSON.stringify(f.record));
  boundary.recognizeSelectedRepository(f.root);
  const before = fs.readFileSync(f.connection), next = path.join(f.base, 'next-local');
  await boundary.withSelectedRepository(f.root, 'https://github.com/example/next.git', next, async () => {
    assert.throws(() => boundary.selectedRepositoryForPath(f.local), /no longer the connected/);
    if (process.platform === 'win32') assert.throws(() => boundary.selectedRepositoryForPath(f.local.toUpperCase()), /no longer the connected/);
  });
  assert(fs.readFileSync(f.connection).equals(before));
  assert.equal(boundary.selectedRepositoryForPath(f.local).repository, remote);
});

test('invalid or malformed saved external connections never remain active in stable', async t => {
  const f = fixture(t);
  fs.writeFileSync(f.connection, JSON.stringify(f.record));
  boundary.recognizeSelectedRepository(f.root);
  fs.appendFileSync(f.config, '\n# User changed local Git configuration.\n');
  const { GuidedWorkbenchController } = require('../out/guided-controller.js');
  const controller = new GuidedWorkbenchController(f.root);
  await controller.dispatch({ action: 'ready' });
  assert.equal(controller.state.connection, undefined);
  assert.match(controller.state.notice || '', /reconnect/i);
  assert.equal(JSON.parse(fs.readFileSync(f.connection)).repository, remote);
  fs.writeFileSync(f.connection, '{"format":1,"separateRepository":true,');
  await controller.dispatch({ action: 'ready' });
  assert.equal(controller.state.connection, undefined);
  assert.match(controller.state.notice || '', /reconnect/i);
});
test('the stable credential scope refuses changed connection records before creating an askpass helper', async t => {
  const f = fixture(t);
  fs.writeFileSync(f.connection, JSON.stringify(f.record));
  const credentials = require('../out/repository-credentials.js');
  await credentials.withWorkbenchGitCredentials(f.root, 'DUMMY_TEST_TOKEN_NEVER_SENT', async () => {
    assert.equal(credentials.currentWorkbenchGitRoot(), f.root);
    fs.writeFileSync(f.connection, JSON.stringify({ format: 1, repository: 'https://attacker.invalid/repository', baseBranch: 'main' }));
    assert.throws(() => credentials.currentWorkbenchGitRoot(), /changed/i);
    assert.throws(() => credentials.workbenchGitAskpass(f.root), /changed/i);
    assert.equal(fs.existsSync(path.join(f.root, '.skill-workbench', 'scratch')), false, 'no helper is created after authority changes');
  });
});

test('the actual stable host cancels a Git action when its saved connection changes during sign-in', { timeout: 60000 }, async t => {
  const f = fixture(t);
  fs.writeFileSync(f.connection, JSON.stringify(f.record));
  const Module = require('node:module'), commands = new Map(), panels = [], controllers = [], dispatched = [];
  let enteredResolve, sessionResolve;
  const entered = new Promise(resolve => { enteredResolve = resolve; });
  const session = new Promise(resolve => { sessionResolve = resolve; });
  const disposable = () => ({ dispose() {} });
  class Controller {
    constructor(root) {
      this.state = { step: 'start', hasWorkspace: true, workFolder: root, repositories: [], drafts: [], library: [], files: [], target: 'portable', connection: { ...f.record } };
      controllers.push(this);
    }
    async dispatch(message) { dispatched.push(message.action); return this.state; }
    async verifyRepository() {}
  }
  const vscode = {
    ViewColumn: { One: 1 }, ConfigurationTarget: { Workspace: 'workspace' }, Uri: { file: fsPath => ({ fsPath }) },
    authentication: { async getSession() { enteredResolve(); return session; } },
    commands: { registerCommand(id, handler) { commands.set(id, handler); return disposable(); }, async executeCommand() {} },
    workspace: { textDocuments: [], workspaceFolders: [], onDidSaveTextDocument: disposable, onDidChangeConfiguration: disposable },
    window: {
      createOutputChannel() { return { appendLine() {}, show() {}, dispose() {} }; }, registerWebviewViewProvider: disposable,
      createWebviewPanel() {
        const panel = { reveal() {}, onDidDispose: disposable, webview: { html: '', async postMessage() { return true; }, onDidReceiveMessage(handler) { panel.receive = handler; return disposable(); } } };
        panels.push(panel); return panel;
      }
    }
  };
  const modulePath = require.resolve('../out/guided-workbench.js'), originalLoad = Module._load;
  delete require.cache[modulePath];
  try {
    Module._load = function(id, parent, main) {
      if (parent?.filename === modulePath && id === 'vscode') return vscode;
      if (parent?.filename === modulePath && id === './guided-controller.js') return { GuidedWorkbenchController: Controller };
      return originalLoad.call(this, id, parent, main);
    };
    require(modulePath).activateGuidedWorkbench({ subscriptions: [], extensionPath: checkout, extension: { packageJSON: { displayName: 'SkillJetty', version: '0.12.3' } } }, { getRoot: async () => f.root });
  } finally { Module._load = originalLoad; delete require.cache[modulePath]; }
  await commands.get('skillBuilder.openWorkbench')();
  const action = panels[0].receive({ action: 'verifyRepository' });
  await entered;
  fs.writeFileSync(f.connection, JSON.stringify({ format: 1, repository: 'https://attacker.invalid/repository', baseBranch: 'main' }));
  sessionResolve({ accessToken: 'DUMMY_TEST_TOKEN_NEVER_SENT', account: { label: 'Test account' } });
  await action;
  assert.equal(dispatched.includes('verifyRepository'), false, 'the Git action must not inherit credentials for a replaced destination');
  assert.match(controllers[0].state.error || '', /changed/i);
});

test('explicit connection grants reject non-GitHub transports, credentials and tree URLs before any operation', async () => {
  let performed = 0;
  for (const value of ['https://github.com@attacker.invalid/team/repo', 'https://name:password@github.com/team/repo', 'https://github.com/team/repo/tree/main', 'http://github.com/team/repo', 'git@github.com:team/repo', 'file:///tmp/repo', 'ext::untrusted', 'https://github.com/team/repo.git\n-c']) {
    await assert.rejects(boundary.withSelectedRepository(path.join(scratch, 'unused-workbench'), value, path.join(scratch, 'unused-repository'), async () => { performed++; }), /GitHub|HTTPS/i);
  }
  assert.equal(performed, 0);
});
