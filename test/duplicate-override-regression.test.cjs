const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const core = require('../out/skill-workbench.js');
const publisher = require('../out/repository-publisher.js');
const { pullManagedRepository } = require('../out/managed-repository.js');

const skillText = '---\nname: sample\ndescription: Create summaries. Use when asked for a summary.\n---\nWrite the requested summary.\n';
function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'protocol.ext.allow=never', ...args], { cwd, encoding: 'utf8', windowsHide: true }).trim();
}
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicate-override-regression-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace'); fs.mkdirSync(root);
  const source = path.join(base, 'external'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'SKILL.md'), skillText);
  const skill = core.registerSkillFolder(root, source);
  const release = core.prepareSkillRelease(root, skill.id, '1.0.0', 'User selected replacement.');
  return { base, root, source, skill, release };
}
function commitIdentity(t) {
  const keys = ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) process.env[key] = key.endsWith('EMAIL') ? 'qa@example.invalid' : 'Independent SkillJetty QA';
  t.after(() => { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
}
function divergentRepository(f, conflictOutside = false) {
  const target = path.join(f.base, 'target'); fs.mkdirSync(target);
  git(target, 'init', '-b', 'main');
  git(target, 'config', 'user.name', 'Independent QA'); git(target, 'config', 'user.email', 'qa@example.invalid');
  fs.mkdirSync(path.join(target, 'sample/1.0.0'), { recursive: true });
  fs.writeFileSync(path.join(target, 'sample/1.0.0/CHANGELOG.md'), 'Common version baseline.\n');
  fs.writeFileSync(path.join(target, 'outside.txt'), 'Common unrelated baseline.\n');
  git(target, 'add', '.'); git(target, 'commit', '-m', 'Common baseline');
  const branch = 'skills/sample/1.0.0';
  git(target, 'switch', '-c', branch);
  fs.writeFileSync(path.join(target, 'sample/1.0.0/CHANGELOG.md'), 'Review branch version edit.\n');
  if (conflictOutside) fs.writeFileSync(path.join(target, 'outside.txt'), 'Review branch unrelated edit.\n');
  git(target, 'add', '.'); git(target, 'commit', '-m', 'Existing review edits');
  const reviewHead = git(target, 'rev-parse', 'HEAD');
  git(target, 'switch', 'main');
  fs.writeFileSync(path.join(target, 'sample/1.0.0/CHANGELOG.md'), 'Base branch version edit.\n');
  fs.writeFileSync(path.join(target, 'LATEST.txt'), 'Latest unrelated base content.\n');
  if (conflictOutside) fs.writeFileSync(path.join(target, 'outside.txt'), 'Base branch unrelated edit.\n');
  git(target, 'add', '.'); git(target, 'commit', '-m', 'Latest base edits');
  const baseHead = git(target, 'rev-parse', 'HEAD');
  const remote = path.join(f.base, 'target.git'); git(f.base, 'clone', '--bare', target, remote);
  return { remote, branch, reviewHead, baseHead };
}

test('authoritative version replacement resolves conflicts in its selected folder and keeps both histories and unrelated base files', async t => {
  const f = fixture(t); commitIdentity(t);
  const repo = divergentRepository(f);
  let preview;
  try {
    preview = await publisher.prepareRepositoryPublish(f.release.directory, repo.remote, 'main', undefined, true);
    const result = await publisher.pushPreparedRelease(preview);
    assert.equal(result.branch, repo.branch);
    assert.equal(git(repo.remote, 'show', `${result.commit}:sample/1.0.0/CHANGELOG.md`), 'User selected replacement.');
    assert.equal(git(repo.remote, 'show', `${result.commit}:sample/1.0.0/source/sample/SKILL.md`), skillText.trim());
    assert.equal(git(repo.remote, 'show', `${result.commit}:LATEST.txt`), 'Latest unrelated base content.');
    assert.equal(git(repo.remote, 'show', `${result.commit}:outside.txt`), 'Common unrelated baseline.');
    git(repo.remote, 'merge-base', '--is-ancestor', repo.reviewHead, result.commit);
    git(repo.remote, 'merge-base', '--is-ancestor', repo.baseHead, result.commit);
  } finally { if (preview) await publisher.disposePublishPreview(preview); }
});

test('replacement does not resolve conflicts outside the selected version or mutate the remote', async t => {
  const f = fixture(t); commitIdentity(t);
  const repo = divergentRepository(f, true);
  const packageBytes = fs.readFileSync(f.release.packagePath);
  await assert.rejects(publisher.prepareRepositoryPublish(f.release.directory, repo.remote, 'main', undefined, true), /Git operation failed/);
  assert.equal(git(repo.remote, 'rev-parse', `refs/heads/${repo.branch}`), repo.reviewHead);
  assert.equal(git(repo.remote, 'rev-parse', 'refs/heads/main'), repo.baseHead);
  assert.deepEqual(fs.readFileSync(f.release.packagePath), packageBytes);
  assert.equal(fs.readFileSync(path.join(f.skill.sourcePath, 'SKILL.md'), 'utf8'), skillText);
});

function session(root, content) {
  const folder = path.join(root, 'workbench/sample'); fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'session-note.txt'), content);
}
function completedRecovery(root) {
  const parent = path.join(root, '.skill-workbench/replaced');
  return fs.readdirSync(parent).map(id => path.join(parent, id, 'completed/sample/1.0.0')).filter(candidate => fs.existsSync(candidate));
}
test('completing another identical chosen version preserves the prior session and clears the new active draft', t => {
  const f = fixture(t);
  session(f.root, 'First session.');
  const first = core.completeWorkbenchSkill(f.root, f.skill.id, f.release.directory);
  const originalRecord = fs.readFileSync(path.join(first.archivedPath, 'record.json'));
  core.registerSkillFolder(f.root, f.source, true);
  session(f.root, 'Second session.');
  const second = core.completeWorkbenchSkill(f.root, f.skill.id, f.release.directory);
  assert.equal(second.archivedPath, first.archivedPath);
  assert.equal(core.listWorkbenchSkills(f.root).length, 0);
  assert.equal(fs.readFileSync(path.join(second.archivedPath, 'session/session-note.txt'), 'utf8'), 'Second session.');
  const preserved = completedRecovery(f.root);
  assert.equal(preserved.length, 1);
  assert.deepEqual(fs.readFileSync(path.join(preserved[0], 'record.json')), originalRecord);
  assert.equal(fs.readFileSync(path.join(preserved[0], 'session/session-note.txt'), 'utf8'), 'First session.');
});

test('failed repeated-session catalog update restores active files and the previous completed session', t => {
  const f = fixture(t);
  session(f.root, 'First session.');
  const first = core.completeWorkbenchSkill(f.root, f.skill.id, f.release.directory);
  const originalRecord = fs.readFileSync(path.join(first.archivedPath, 'record.json'));
  const active = core.registerSkillFolder(f.root, f.source, true);
  session(f.root, 'Unsaved completion session.');
  const catalog = fs.readFileSync(path.join(f.root, '.skill-workbench/catalog.json'));
  const rename = fs.renameSync;
  fs.renameSync = function (from, to) {
    if (path.basename(to) === 'catalog.json') throw new Error('Injected completion catalog failure');
    return rename.apply(this, arguments);
  };
  try { assert.throws(() => core.completeWorkbenchSkill(f.root, active.id, f.release.directory), /Injected completion catalog failure/); }
  finally { fs.renameSync = rename; }
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.skill-workbench/catalog.json')), catalog);
  assert.deepEqual(core.listWorkbenchSkills(f.root), [active]);
  assert.equal(fs.readFileSync(path.join(active.sourcePath, 'SKILL.md'), 'utf8'), skillText);
  assert.equal(fs.readFileSync(path.join(f.root, 'workbench/sample/session-note.txt'), 'utf8'), 'Unsaved completion session.');
  assert.deepEqual(fs.readFileSync(path.join(first.archivedPath, 'record.json')), originalRecord);
  assert.equal(fs.readFileSync(path.join(first.archivedPath, 'session/session-note.txt'), 'utf8'), 'First session.');
});

test('managed pull preserves an ignored local file when the remote starts tracking that path', async t => {
  const f = fixture(t);
  const remote = path.join(f.base, 'remote'); fs.mkdirSync(remote);
  git(remote, 'init', '-b', 'main');
  git(remote, 'config', 'user.name', 'Independent QA'); git(remote, 'config', 'user.email', 'qa@example.invalid');
  fs.mkdirSync(path.join(remote, 'notes'));
  fs.writeFileSync(path.join(remote, '.gitignore'), 'notes/personal.local\n');
  fs.writeFileSync(path.join(remote, 'notes/SKILL.md'), skillText);
  git(remote, 'add', '.'); git(remote, 'commit', '-m', 'Ignore local work');
  const checkout = await pullManagedRepository(f.root, remote);
  const localFile = path.join(checkout.path, 'notes/personal.local');
  fs.writeFileSync(localFile, 'Only local content.');
  fs.writeFileSync(path.join(remote, 'notes/personal.local'), 'Remote content.');
  git(remote, 'add', '-f', 'notes/personal.local'); git(remote, 'commit', '-m', 'Track formerly ignored path');
  await assert.rejects(pullManagedRepository(f.root, remote), /local changes|ignored/);
  assert.equal(fs.readFileSync(localFile, 'utf8'), 'Only local content.');
  assert.equal(git(checkout.path, 'rev-parse', 'HEAD'), checkout.commit);
});
