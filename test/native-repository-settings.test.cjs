const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const settings = require('../out/repository-settings.js');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const core = require('../out/skill-workbench.js');
const workspace = require('../out/guided-workspace.js');
const publisher = require('../out/repository-publisher.js');
const managed = require('../out/managed-repository.js');
const { createGitHubSessionRunner } = require('../out/github-session.js');
function fixture(t) {
  const base = require('./working-fixture.cjs').workingFixture('native-settings-qa'); fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'case-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root;
}
function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim(); }
test('native tuple distinguishes unset, disconnect, cleared local and a changed destination', () => {
  const saved = { repository: 'https://github.com/example/a.git', baseBranch: 'main', localPath: path.resolve('dist/local-a') };
  assert.equal(settings.selectRepositorySettings({}, saved).localPath, saved.localPath);
  assert.equal(settings.selectRepositorySettings({ repositoryUrl: '' }, saved).repository, undefined);
  assert.equal(settings.selectRepositorySettings({ localRepositoryPath: '' }, saved).localPath, undefined);
  assert.equal(settings.selectRepositorySettings({ repositoryUrl: 'https://github.com/example/b' }, saved).localPath, undefined);
  assert.throws(() => settings.selectRepositorySettings({ repositoryUrl: 3 }, saved), /must be text/);
  assert.throws(() => settings.selectRepositorySettings({ repositoryUrl: 'https://secret@example.com/repo' }, saved), /unsafe|credentials/);
  for (const repositoryUrl of ['https://github.com/example/a/tree/main/notes/1.0.0', 'https://github.com/example/a/blob/main/SKILL.md']) {
    assert.throws(() => settings.selectRepositorySettings({ repositoryUrl }, saved), /repository address.*rather than/i);
  }
});

test('a skill folder is rejected as a repository root with an actionable error and no changes', async t => {
  const root = fixture(t), skill = path.join(root, 'notes'); fs.mkdirSync(skill);
  const bytes = '# Existing skill\n'; fs.writeFileSync(path.join(skill, 'SKILL.md'), bytes);
  await assert.rejects(settings.validateLocalRepositorySelection('https://github.com/example/a', skill), /repository root containing \.git/);
  assert.deepEqual(fs.readdirSync(skill), ['SKILL.md']);
  assert.equal(fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8'), bytes);
});
test('malformed native getter renders attention while ready, local edits and packaging remain usable', async t => {
  const root = fixture(t), source = path.join(root, 'input'); fs.mkdirSync(source);
  const content = '---\nname: notes\ndescription: Summarize supplied notes when asked.\nmetadata:\n  version: 1.0.0\n---\n# Notes\nKeep facts.\n';
  fs.writeFileSync(path.join(source, 'SKILL.md'), content);
  const skill = core.registerSkillFolder(root, source);
  const controller = new GuidedWorkbenchController(root, { getRepositorySettings() { throw new Error('Repository settings must be text.'); } });
  await controller.dispatch({ action: 'ready' }); assert.equal(controller.state.error, undefined);
  assert.match(controller.state.configurationError, /must be text/);
  await controller.dispatch({ action: 'resume', payload: { id: skill.id } });
  await controller.dispatch({ action: 'save', editorSkillId: skill.id, editorPath: 'SKILL.md', editorContent: content + '\nPreserved edit.\n' });
  assert.equal(controller.state.error, undefined); assert.match(fs.readFileSync(path.join(skill.sourcePath, 'SKILL.md'), 'utf8'), /Preserved edit/);
  await controller.dispatch({ action: 'preparePublish' }); assert.equal(controller.state.error, undefined);
  await controller.dispatch({ action: 'savePackage' }); assert.equal(controller.state.error, undefined); assert.equal(controller.state.receipt.local, true);
  await controller.dispatch({ action: 'pullRepository' }); assert.match(controller.state.error, /must be text/);
});
test('settings changed during remote-head resolution leave the old association untouched', async t => {
  const root = fixture(t); const original = publisher.resolveRepositoryDefaultBranch;
  publisher.resolveRepositoryDefaultBranch = async () => 'main';
  try {
    await workspace.connectWorkspaceRepository(root, 'https://github.com/example/a');
    await assert.rejects(workspace.connectWorkspaceRepository(root, 'https://github.com/example/b', { beforeSave() { throw new Error('settings changed'); } }), /settings changed/);
    assert.equal(workspace.getWorkspaceConnection(root).repository, 'https://github.com/example/a');
  } finally { publisher.resolveRepositoryDefaultBranch = original; }
});
test('GitHub write checks configuration after asynchronous authentication and starts no HTTP request', async () => {
  let release; const token = new Promise(resolve => { release = resolve; }); let requests = 0, changed = false;
  const run = createGitHubSessionRunner(() => token, () => { requests++; throw new Error('unexpected request'); });
  const pending = run({ method: 'POST', endpoint: 'repos/example/a/pulls', beforeWrite() { if (changed) throw new Error('settings changed'); } });
  changed = true; release('fixture-token'); await assert.rejects(pending, /settings changed/); assert.equal(requests, 0);
});
test('settings changed after real Git fetch preserve the selected worktree and HEAD', async t => {
  const root = fixture(t), remote = path.join(root, 'remote'), checkout = path.join(root, 'checkout'); fs.mkdirSync(remote);
  git(remote, 'init', '-b', 'main'); git(remote, 'config', 'user.name', 'Fixture'); git(remote, 'config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(remote, 'notes.txt'), 'old'); git(remote, 'add', '.'); git(remote, 'commit', '-m', 'initial');
  await managed.pullProjectRepository(root, remote, checkout);
  const head = git(checkout, 'rev-parse', 'HEAD');
  const fetchHead = path.join(checkout, '.git', 'FETCH_HEAD');
  const sharedFetchBefore = fs.existsSync(fetchHead) ? fs.readFileSync(fetchHead) : undefined;
  fs.writeFileSync(path.join(remote, 'notes.txt'), 'new'); git(remote, 'add', '.'); git(remote, 'commit', '-m', 'update');
  const original = publisher.repositoryGit; let fetched = false;
  publisher.repositoryGit = async (...args) => { const result = await original(...args); if (args[1].includes('fetch')) fetched = true; return result; };
  try { await assert.rejects(managed.pullProjectRepository(root, remote, checkout, undefined, () => { if (fetched) throw new Error('settings changed after fetch'); }), /settings changed after fetch/); }
  finally { publisher.repositoryGit = original; }
  assert.equal(fetched, true); assert.equal(git(checkout, 'rev-parse', 'HEAD'), head); assert.equal(fs.readFileSync(path.join(checkout, 'notes.txt'), 'utf8'), 'old');
  assert.equal(git(checkout, 'cat-file', '-t', git(remote, 'rev-parse', 'HEAD')), 'commit', 'fetch downloaded the incoming object');
  if (sharedFetchBefore) assert.deepEqual(fs.readFileSync(fetchHead), sharedFetchBefore);
  else assert.equal(fs.existsSync(fetchHead), false, 'the shared fetch record is not created');
  assert.equal(git(checkout, 'for-each-ref', '--format=%(refname)', 'refs/skilljetty/pull/'), '', 'only the owned temporary ref was cleaned');
  // A content command discovers filter settings asynchronously before spawning.
  // Changing configuration during that read must still prevent the merge itself.
  let changedDuringDiscovery = false, secondFetch = false, merges = 0;
  publisher.repositoryGit = async (...args) => {
    if (args[1].includes('merge')) merges++;
    try { return await original(...args); }
    finally {
      if (args[1].includes('fetch')) secondFetch = true;
      if (secondFetch && args[1].includes('config') && args[1].includes('--get-regexp')) changedDuringDiscovery = true;
    }
  };
  try { await assert.rejects(managed.pullProjectRepository(root, remote, checkout, undefined, () => { if (changedDuringDiscovery) throw new Error('settings changed during filter discovery'); }), /settings changed during filter discovery/); }
  finally { publisher.repositoryGit = original; }
  assert.equal(changedDuringDiscovery, true); assert.equal(merges, 0);
  assert.equal(git(checkout, 'rev-parse', 'HEAD'), head); assert.equal(fs.readFileSync(path.join(checkout, 'notes.txt'), 'utf8'), 'old');
});
