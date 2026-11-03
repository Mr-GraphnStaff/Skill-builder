const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const boundary = require('../out/workbench-boundary.js');
const guided = require('../out/guided-workspace.js');
const publisher = require('../out/repository-publisher.js');
const managed = require('../out/managed-repository.js');

const scratch = require('./working-fixture.cjs').workingFixture('boundary');
function fixture(t) {
  fs.mkdirSync(scratch, { recursive: true });
  const base = fs.mkdtempSync(path.join(scratch, 'boundary-test-'));
  const root = path.join(base, 'workbench'); fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, boundary.WORKBENCH_MARKER), '{"format":1}');
  assert.equal(boundary.isManagedWorkbench(root), true);
  t.after(() => { assert.equal(path.dirname(base), scratch); fs.rmSync(base, { recursive: true, force: true }); });
  return { root, base };
}

async function linkSubcase(t, name, target, link, verify) {
  await t.test(name, sub => {
    try { fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) {
      if (['EISDIR', 'EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { sub.skip('Filesystem does not support this link fixture: ' + error.code); return; }
      throw error;
    }
    verify();
  });
}

test('managed drafts, scratch and recovery remain inside the selected workbench', t => {
  const { root } = fixture(t);
  const skill = guided.createGuidedSkill(root, { name: 'notes', description: 'Summarize notes when asked.', instructions: 'Preserve supplied facts.' });
  assert.equal(skill.sourcePath, path.join(root, 'skills', 'notes'));
  assert.deepEqual(fs.readdirSync(path.join(root, 'scratch')), []);
  const recovery = guided.saveGuidedRecovery(root, skill, 'SKILL.md', 'Earlier text');
  assert.equal(path.relative(path.join(root, 'recovery'), recovery).startsWith('..'), false);
  const previous = guided.listGuidedHistory(root, skill, 'SKILL.md');
  guided.restoreGuidedEdit(root, skill, 'SKILL.md', previous[0].id);
  assert.equal(guided.readGuidedFile(skill, 'SKILL.md'), 'Earlier text');
});

test('outside repo, sibling-prefix, traversal, local remote and junction destinations fail before writes', async t => {
  const { root, base } = fixture(t);
  const outside = path.join(base, 'workbench-other'); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'sentinel'), 'keep');
  for (const target of [outside, path.join(root, '..', 'workbench-other', 'new'), path.join(root, 'skills', 'repo')]) {
    assert.throws(() => boundary.assertWorkbenchRepository(root, target), /workbench/);
  }
  fs.mkdirSync(path.join(root, 'repositories'));
  await linkSubcase(t, 'junction destination', outside, path.join(root, 'repositories', 'escape'), () => assert.throws(() => boundary.assertWorkbenchRepository(root, path.join(root, 'repositories', 'escape', 'new')), /junction|symbolic/));
  for (const remote of [outside, `file://${outside}`, 'ext::anything', 'https://name:password@example.test/skills.git']) {
    assert.throws(() => boundary.assertRemoteDestination(remote), /remote|HTTPS/);
  }
  await assert.rejects(managed.pullProjectRepository(root, 'https://example.test/skills.git', outside), /workbench/);
  assert.deepEqual(fs.readdirSync(outside), ['sentinel']);
  assert.equal(fs.readFileSync(path.join(outside, 'sentinel'), 'utf8'), 'keep');
});

test('a linked root ancestor and hardlinked file are rejected', async t => {
  const { root, base } = fixture(t);
  await linkSubcase(t, 'linked root ancestor', root, path.join(base, 'linked-parent'), () => assert.throws(() => boundary.assertWorkbenchPath(path.join(base, 'linked-parent', 'child'), path.join(base, 'linked-parent', 'child', 'file')), /junction|symbolic/));
  const sentinel = path.join(base, 'outside-file'); fs.writeFileSync(sentinel, 'keep');
  const linked = path.join(root, 'linked-file');
  await t.test('hardlink destination', sub => {
    try { fs.linkSync(sentinel, linked); } catch (error) { if (['EISDIR', 'EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { sub.skip('Filesystem does not support hardlink fixture: ' + error.code); return; } throw error; }
    assert.throws(() => boundary.assertWorkbenchPath(root, linked), /hard links/);
  });
  // Detection still has a unit probe where this filesystem cannot create links.
  const ordinary = path.join(root, 'ordinary-file'); fs.writeFileSync(ordinary, 'ordinary');
  const originalLstat = fs.lstatSync;
  fs.lstatSync = function(target, ...args) { const value = originalLstat.call(this, target, ...args); if (path.resolve(target) === ordinary) return new Proxy(value, { get(object, key) { return key === 'nlink' ? 2 : typeof object[key] === 'function' ? object[key].bind(object) : object[key]; } }); return value; };
  try { assert.throws(() => boundary.assertWorkbenchPath(root, ordinary), /hard links/); } finally { fs.lstatSync = originalLstat; }
  const directoryLstat = fs.lstatSync;
  fs.lstatSync = function(target, ...args) { const value = directoryLstat.call(this, target, ...args); if (path.resolve(target) === root) return new Proxy(value, { get(object, key) { return key === 'isSymbolicLink' ? () => true : typeof object[key] === 'function' ? object[key].bind(object) : object[key]; } }); return value; };
  try { assert.throws(() => boundary.assertWorkbenchPath(root, path.join(root, 'nested', 'new')), /symbolic|junction/); } finally { fs.lstatSync = directoryLstat; }
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep');
});

test('removing a recognized setup record cannot downgrade lower-level enforcement', t => {
  const { root } = fixture(t);
  fs.unlinkSync(path.join(root, boundary.WORKBENCH_MARKER));
  assert.throws(() => boundary.assertWorkbenchPath(root, path.join(root, 'skills', 'new')), /setup record/);
  assert.throws(() => guided.createGuidedSkill(root, { name: 'notes', description: 'Use when asked.', instructions: 'Retain facts.' }), /setup record/);
  assert.equal(fs.existsSync(path.join(root, 'skills')), false);
});

test('Git environment redirects cannot create metadata outside the selected repository', async t => {
  const { root, base } = fixture(t);
  const checkout = path.join(root, 'repositories', 'skills'); fs.mkdirSync(checkout, { recursive: true });
  const redirected = path.join(base, 'outside.git');
  const before = process.env.GIT_DIR;
  process.env.GIT_DIR = redirected;
  try { await publisher.repositoryGit(checkout, ['init', '-b', 'main']); }
  finally { if (before === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = before; }
  assert.equal(fs.existsSync(redirected), false);
  assert.equal(fs.statSync(path.join(checkout, '.git')).isDirectory(), true);
  fs.appendFileSync(path.join(checkout, '.git', 'config'), '\n[core]\n worktree = ' + base.replace(/\\/g, '/') + '\n');
  await assert.rejects(publisher.repositoryGit(checkout, ['status']), /configuration redirects/);
});

test('Git common metadata, alternates, local helpers and symlink redirects are rejected', async t => {
  const { root, base } = fixture(t);
  const checkout = path.join(root, 'repositories', 'skills'), metadata = path.join(checkout, '.git');
  fs.mkdirSync(path.join(metadata, 'objects', 'info'), { recursive: true });
  for (const name of ['commondir', 'gitdir', 'objects/info/alternates']) {
    const target = path.join(metadata, name); fs.writeFileSync(target, base);
    assert.throws(() => boundary.assertWorkbenchGitMetadata(root, checkout), /metadata redirects/);
    fs.unlinkSync(target);
  }
  fs.writeFileSync(path.join(metadata, 'config'), '[credential]\n helper = !write-outside\n');
  assert.throws(() => boundary.assertWorkbenchGitMetadata(root, checkout), /configuration redirects/);
  fs.unlinkSync(path.join(metadata, 'config'));
  await linkSubcase(t, 'linked Git object storage', base, path.join(metadata, 'objects', 'redirect'), () => assert.throws(() => boundary.assertWorkbenchGitMetadata(root, checkout), /junction|symbolic/));
});

test('Git credentials stay in memory and the askpass helper handles shell-special folder names', async t => {
  const { root } = fixture(t);
  const auth = require('../out/workbench-git-auth.js');
  const { spawnSync } = require('node:child_process');
  const unusual = path.join(root, 'spaces & percent%PATH% $(touch injection)');
  fs.mkdirSync(unusual); fs.writeFileSync(path.join(unusual, boundary.WORKBENCH_MARKER), '{"format":1}');
  boundary.isManagedWorkbench(unusual);
  await auth.withWorkbenchGitCredentials('synthetic-unit-token', async () => {
    const helper = auth.workbenchGitAskpass(unusual);
    try {
      for (const file of fs.readdirSync(helper.directory)) assert.equal(fs.readFileSync(path.join(helper.directory, file), 'utf8').includes('synthetic-unit-token'), false);
      const result = spawnSync('git', ['-c', 'credential.helper=', 'credential', 'fill'], {
        cwd: unusual, env: { ...boundary.workbenchGitEnvironment(unusual), ...helper.environment },
        input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', windowsHide: true, timeout: 15000
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /password=synthetic-unit-token/);
      assert.equal(fs.existsSync(path.join(unusual, 'injection')), false);
    } finally { auth.disposeWorkbenchGitAskpass(unusual, helper.directory); }
    assert.equal(fs.existsSync(helper.directory), false);
  });
  assert.equal(auth.currentWorkbenchGitToken(), undefined);
});
