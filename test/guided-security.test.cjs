// Independent host-boundary probes. These use actual controller/backend code,
// disposable local files, no remote repository, and no model execution.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const guided = require('../out/guided-workspace.js');
const publisher = require('../out/repository-publisher.js');

async function fixture(t, hooks = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-security-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const make = name => guided.createGuidedSkill(root, { name, description: 'Summarize supplied notes. Use when asked to summarize notes.', instructions: '# Notes\nRetain supplied facts and mark unknown information.' });
  const first = make('first-notes'), second = make('second-notes');
  const controller = new GuidedWorkbenchController(root, hooks);
  await controller.dispatch({ action: 'resume', payload: { id: first.id } });
  return { root, first, second, controller };
}

test('forged webview messages cannot overwrite paths outside the selected draft or invoke arbitrary links', async t => {
  const opened = [];
  const f = await fixture(t, { openLink: async value => opened.push(value) });
  const sentinel = path.join(f.root, 'sentinel.md'); fs.writeFileSync(sentinel, 'Keep this file.');
  const original = fs.readFileSync(path.join(f.first.sourcePath, 'SKILL.md'), 'utf8');
  for (const message of [
    { action: 'createFile', payload: { path: '../../sentinel.md' } },
    { action: 'openFile', payload: { path: sentinel } },
    { action: 'save', editorSkillId: f.first.id, editorPath: '../../sentinel.md', editorContent: 'overwrite' },
    { action: 'openLink', payload: { url: 'command:workbench.action.terminal.new' } },
    { action: 'openLink', payload: { url: 'https://attacker.invalid/' } },
    { action: 'publish', payload: { version: '1.0.0', changelog: 'Forged early publish.' } },
    { action: 'executeCommand', payload: { command: 'workbench.action.terminal.new' } }
  ]) {
    await f.controller.dispatch(message);
    assert.ok(f.controller.state.error, JSON.stringify(message));
  }
  assert.deepEqual(opened, []);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'Keep this file.');
  assert.equal(fs.readFileSync(path.join(f.first.sourcePath, 'SKILL.md'), 'utf8'), original);
  assert.equal(fs.existsSync(path.join(f.root, 'releases')), false);
});

test('queued native file selection cannot change the active destination underneath the picker', async t => {
  let select;
  const fileSelection = new Promise(resolve => { select = resolve; });
  let entered;
  const pickerEntered = new Promise(resolve => { entered = resolve; });
  const f = await fixture(t, { pickFile: async () => { entered(); return fileSelection; } });
  const input = path.join(f.root, 'input.txt'); fs.writeFileSync(input, 'Supporting facts.');
  const add = f.controller.dispatch({ action: 'addFile', payload: { path: 'references/input.txt' } });
  await pickerEntered;
  const change = f.controller.dispatch({ action: 'resume', payload: { id: f.second.id } });
  assert.equal(f.controller.state.active.id, f.first.id);
  select(input);
  await Promise.all([add, change]);
  assert.equal(fs.readFileSync(path.join(f.first.sourcePath, 'references/input.txt'), 'utf8'), 'Supporting facts.');
  assert.equal(fs.existsSync(path.join(f.second.sourcePath, 'references/input.txt')), false);
  assert.equal(f.controller.state.active.id, f.second.id);
});

test('stale same-path editor buffers cannot overwrite another active skill', async t => {
  const f = await fixture(t);
  await f.controller.dispatch({ action: 'resume', payload: { id: f.second.id } });
  const file = path.join(f.second.sourcePath, 'SKILL.md');
  const before = fs.readFileSync(file, 'utf8');
  await f.controller.dispatch({ action: 'save', editorSkillId: f.first.id, editorPath: 'SKILL.md', editorContent: 'Stale first skill buffer.' });
  assert.match(f.controller.state.error, /different draft/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('controller supporting-file import enforces the host size limit before copying', async t => {
  let input;
  const f = await fixture(t, { pickFile: async () => input });
  input = path.join(f.root, 'large.bin');
  const fd = fs.openSync(input, 'w'); fs.ftruncateSync(fd, 16 * 1024 * 1024 + 1); fs.closeSync(fd);
  await f.controller.dispatch({ action: 'addFile', payload: { path: 'assets/large.bin' } });
  assert.match(f.controller.state.error, /16 MB/);
  assert.equal(fs.existsSync(path.join(f.first.sourcePath, 'assets/large.bin')), false);
});

test('credential-bearing SSH URLs are rejected by saved connections and publisher before any Git call', async t => {
  const f = await fixture(t);
  const credentialUrl = 'ssh://user:synthetic-secret@localhost/example.git';
  const connection = path.join(f.root, '.skill-workbench', 'connection.json');
  fs.writeFileSync(connection, JSON.stringify({ format: 1, repository: credentialUrl, baseBranch: 'main' }));
  assert.throws(() => guided.getWorkspaceConnection(f.root), /credentials/);
  // The release deliberately does not exist. Credential rejection must happen
  // before release access, and neither success nor failure invokes Git/network.
  await assert.rejects(publisher.prepareRepositoryPublish(path.join(f.root, 'missing-release'), credentialUrl), /credentials/);
});
