const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const core = require('../out/skill-workbench.js');

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-acceptance-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'workspace'); fs.mkdirSync(root);
  const controller = new GuidedWorkbenchController(root);
  return { root, temporary, controller };
}
const input = { name: 'acceptance-notes', description: 'Create evidence-backed notes. Use when asked to turn supplied notes into an action record.', instructions: '# Action notes\nPreserve supplied facts, distinguish proposals from decisions, and mark missing owners as unknown.' };

test('guided controller preserves create errors and rejects publication before check/review without changing source', async t => {
  const f = fixture(t);
  await f.controller.dispatch({ action: 'showCreate' });
  await f.controller.dispatch({ action: 'createSkill', payload: { ...input, name: '../unsafe' } });
  assert.equal(f.controller.state.step, 'start');
  assert.equal(f.controller.state.form.mode, 'create');
  assert.ok(f.controller.state.error);
  await f.controller.dispatch({ action: 'createSkill', payload: input });
  const source = path.join(f.root, 'skills', input.name, 'SKILL.md');
  const before = fs.readFileSync(source);
  await f.controller.dispatch({ action: 'publish', payload: { version: '1.0.0', changelog: 'No implicit upload.' } });
  assert.match(f.controller.state.error, /Check.*review/i);
  assert.deepEqual(fs.readFileSync(source), before);
  assert.equal(core.listWorkbenchSkills(f.root).length, 1);
});

test('concurrent desktop edits are not overwritten by an older guided editor buffer', async t => {
  const f = fixture(t);
  await f.controller.dispatch({ action: 'createSkill', payload: input });
  const source = path.join(f.root, 'skills', input.name, 'SKILL.md');
  const original = f.controller.state.editor.content;
  const external = original + '\nNewer desktop editor change.\n';
  const pending = original + '\nPending webview change.\n';
  fs.writeFileSync(source, external);
  await f.controller.dispatch({ action: 'save', editorSkillId: f.controller.state.active.id, editorPath: 'SKILL.md', editorContent: pending });
  assert.equal(fs.readFileSync(source, 'utf8'), external, 'newer on-disk work must not be silently replaced');
  assert.match(f.controller.state.error, /changed in another editor/, 'the conflict must be detected rather than failing draft identity validation');
  const recoveryFolder = path.join(f.root, '.skill-workbench', 'recovery', input.name);
  const recoveries = fs.readdirSync(recoveryFolder).map(file => JSON.parse(fs.readFileSync(path.join(recoveryFolder, file), 'utf8')));
  assert.ok(recoveries.some(record => record.content === pending), 'pending webview content is recoverable');
});

test('guided controller completes a real local-repository version without asking for a branch or touching unrelated files', async t => {
  const f = fixture(t);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const target = path.join(f.temporary, 'target'); fs.mkdirSync(target);
  git(target, 'init', '-b', 'release-baseline');
  git(target, 'config', 'user.name', 'Acceptance Fixture'); git(target, 'config', 'user.email', 'acceptance@example.invalid');
  fs.writeFileSync(path.join(target, 'README.md'), '# Local acceptance repository\n');
  git(target, 'add', '.'); git(target, 'commit', '-m', 'Fixture baseline');
  const remote = path.join(f.temporary, 'target.git'); git(f.temporary, 'clone', '--bare', target, remote);
  const identity = { GIT_AUTHOR_NAME: 'Acceptance Fixture', GIT_AUTHOR_EMAIL: 'acceptance@example.invalid', GIT_COMMITTER_NAME: 'Acceptance Fixture', GIT_COMMITTER_EMAIL: 'acceptance@example.invalid' };
  const before = Object.fromEntries(Object.keys(identity).map(key => [key, process.env[key]])); Object.assign(process.env, identity);
  t.after(() => { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  await f.controller.dispatch({ action: 'connectRepository', payload: { repository: remote } });
  assert.equal(f.controller.state.connection.baseBranch, 'release-baseline');
  await f.controller.dispatch({ action: 'createSkill', payload: input });
  const outside = path.join(f.temporary, 'unrelated.txt'); fs.writeFileSync(outside, 'Retain unrelated work.\n');
  await f.controller.dispatch({ action: 'createFile', payload: { path: 'references/deep/rules.md' } });
  await f.controller.dispatch({ action: 'save', editorSkillId: f.controller.state.active.id, editorPath: 'references/deep/rules.md', editorContent: '# Rules\nUse supplied evidence.\n' });
  assert.equal(f.controller.state.error, undefined);
  await f.controller.dispatch({ action: 'check' });
  assert.equal(f.controller.state.check.valid, true);
  assert.match(f.controller.state.check.behaviorNote, /not|no/i);
  await f.controller.dispatch({ action: 'preparePublish' });
  assert.equal(f.controller.state.step, 'publish');
  assert.equal(f.controller.state.publish.version, '1.0.0');
  await f.controller.dispatch({ action: 'publish', payload: { version: '1.0.0', changelog: 'Initial local acceptance version with nested evidence rules.' } });
  assert.equal(f.controller.state.error, undefined);
  assert.equal(f.controller.state.step, 'done');
  assert.match(f.controller.state.receipt.note, /review|merge/i);
  assert.equal(core.listWorkbenchSkills(f.root).length, 0);
  const release = core.verifySkillRelease(path.join(f.root, 'releases', input.name, '1.0.0'));
  const files = git(remote, 'ls-tree', '-r', '--name-only', f.controller.state.receipt.commit);
  assert.ok(files.includes(`${input.name}/1.0.0/${path.basename(release.packagePath)}`));
  assert.ok(files.includes(`${input.name}/1.0.0/source/${input.name}/references/deep/rules.md`));
  assert.equal(git(remote, 'show', `${f.controller.state.receipt.commit}:${input.name}/1.0.0/source/${input.name}/references/deep/rules.md`), '# Rules\nUse supplied evidence.\n');
  assert.ok(files.includes(`${input.name}/1.0.0/CHANGELOG.md`));
  assert.equal(fs.readFileSync(outside, 'utf8'), 'Retain unrelated work.\n');
  await f.controller.dispatch({ action: 'startAnother' });
  assert.equal(f.controller.state.step, 'start'); assert.equal(f.controller.state.active, undefined);
  assert.equal(f.controller.state.connection.baseBranch, 'release-baseline');
  assert.equal(f.controller.state.library.length, 1);
});
