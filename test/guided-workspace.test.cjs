const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const core = require('../out/skill-workbench.js');
const library = require('../out/workbench-library.js');
const guided = require('../out/guided-workspace.js');
const publisher = require('../out/repository-publisher.js');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
}
function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-workspace-test-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'library'); fs.mkdirSync(root);
  const source = path.join(temporary, 'target'); fs.mkdirSync(source);
  git(source, 'init', '-b', 'trunk');
  git(source, 'config', 'user.name', 'Guided Test'); git(source, 'config', 'user.email', 'guided@example.invalid');
  fs.writeFileSync(path.join(source, 'README.md'), 'Shared skill library\n');
  git(source, 'add', '.'); git(source, 'commit', '-m', 'Initial library');
  const remote = path.join(temporary, 'target.git'); git(temporary, 'clone', '--bare', source, remote);
  const identity = { GIT_AUTHOR_NAME: 'Guided Test', GIT_AUTHOR_EMAIL: 'guided@example.invalid', GIT_COMMITTER_NAME: 'Guided Test', GIT_COMMITTER_EMAIL: 'guided@example.invalid' };
  const saved = Object.fromEntries(Object.keys(identity).map(key => [key, process.env[key]]));
  Object.assign(process.env, identity);
  t.after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const skill = guided.createGuidedSkill(root, { name: 'meeting-notes', description: 'Summarize meeting decisions and actions. Use when asked to process meeting notes.', instructions: '# Meeting notes\nRetain supplied decisions and identify unknown owners.' });
  return { temporary, root, source, remote, skill };
}

test('connect detects the actual non-main default, repairs old branch choices and persists one workspace connection', async t => {
  const f = fixture(t);
  core.updateSkillRepository(f.root, f.skill.id, f.remote, 'makeitfire');
  assert.equal(await publisher.resolveRepositoryDefaultBranch(f.remote), 'trunk');
  const connected = await guided.migrateAssociation(f.root);
  assert.deepEqual(connected, { repository: f.remote, baseBranch: 'trunk' });
  assert.deepEqual(guided.getWorkspaceConnection(f.root), connected);
  assert.equal(core.listWorkbenchSkills(f.root)[0].baseBranch, 'trunk');
  assert.equal(core.listWorkbenchSkills(f.root)[0].name, 'meeting-notes');
});

test('ambiguous associations are not silently connected; uninitialized repositories are not guessed as main', async t => {
  const f = fixture(t);
  const second = guided.createGuidedSkill(f.root, { name: 'decision-notes', description: 'Record decisions. Use when the user supplies a decision.', instructions: 'Retain the decision and identify missing information.' });
  core.updateSkillRepository(f.root, f.skill.id, f.remote, 'bad');
  core.updateSkillRepository(f.root, second.id, path.join(f.temporary, 'other.git'), 'bad');
  assert.equal(await guided.migrateAssociation(f.root), undefined);
  assert.equal(guided.getWorkspaceConnection(f.root), undefined);
  const empty = path.join(f.temporary, 'empty.git'); git(f.temporary, 'init', '--bare', empty);
  await assert.rejects(guided.connectWorkspaceRepository(f.root, empty), /no readable default branch/);
  assert.equal(guided.getWorkspaceConnection(f.root), undefined);
});

test('fresh portable skill creation preserves YAML strings and does not invent an original archive', t => {
  const f = fixture(t);
  assert.equal(core.validateWorkbenchSkill(f.skill).valid, true);
  const release = core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Initial version.');
  assert.equal(fs.existsSync(path.join(release.directory, 'original.skill')), false);
  assert.match(guided.readGuidedFile(f.skill, 'SKILL.md'), /version: ['"]1\.0\.0['"]|version: 1\.0\.0/);
  const another = guided.createGuidedSkill(f.root, { name: 'unicode-notes', description: 'Use when notes include colons: retain "quoted" names and 日本語.', instructions: '# Notes\nKeep Unicode → 日本語 and quotes.' });
  assert.equal(core.validateWorkbenchSkill(another).valid, true);
  assert.match(guided.readGuidedFile(another, 'SKILL.md'), /日本語/);
  assert.throws(() => guided.createGuidedSkill(f.root, { name: 'meeting-notes', description: 'Use when needed.', instructions: 'Replacement' }), /already exists/);
});

test('guided text edits and binary copies preserve nested paths and reject traversal, binary overwrite, symlinks and collisions', t => {
  const f = fixture(t);
  guided.writeGuidedFile(f.skill, 'references/deep/日本語.md', '# Rules\nRetain Unicode ✓\n');
  assert.match(guided.readGuidedFile(f.skill, 'references/deep/日本語.md'), /Unicode ✓/);
  const binary = path.join(f.temporary, 'input.bin'); fs.writeFileSync(binary, Buffer.from([0, 255, 13, 10]));
  guided.copyGuidedFile(f.skill, 'assets/deep/input.bin', binary);
  assert.deepEqual(fs.readFileSync(path.join(f.skill.sourcePath, 'assets/deep/input.bin')), fs.readFileSync(binary));
  assert.equal(guided.listGuidedFiles(f.skill).find(file => file.path === 'assets/deep/input.bin').text, false);
  assert.throws(() => guided.readGuidedFile(f.skill, 'assets/deep/input.bin'), /binary/);
  assert.throws(() => guided.writeGuidedFile(f.skill, 'assets/deep/input.bin', 'destructive replacement'), /binary/);
  assert.throws(() => guided.copyGuidedFile(f.skill, 'assets/deep/input.bin', binary), /already exists/);
  for (const unsafe of ['../outside.md', 'refs/../../escape.md', '.git/config', 'C:/escape.md', 'refs/CON.md']) assert.throws(() => guided.writeGuidedFile(f.skill, unsafe, 'No'), /relative|safe/);
  const outside = path.join(f.temporary, 'outside'); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(f.skill.sourcePath, 'redirect'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => guided.writeGuidedFile(f.skill, 'redirect/outside.md', 'No'), /links|junctions/);
  assert.equal(fs.existsSync(path.join(outside, 'outside.md')), false);
});

test('guided publish uploads complete version to local bare repository, clears only its draft and preserves prior history through v2', async t => {
  const f = fixture(t);
  await guided.connectWorkspaceRepository(f.root, f.remote);
  guided.writeGuidedFile(f.skill, 'references/rules.md', 'Use the supplied notes.\n');
  const unrelated = path.join(f.root, 'UNRELATED.txt'); fs.writeFileSync(unrelated, 'Keep this user file.\n');
  const progress = [];
  const result = await guided.publishGuidedSkill(f.root, f.skill.id, '1.0.0', 'Initial version.', message => progress.push(message));
  assert.ok(result.cleanup); assert.equal(result.cleanupError, undefined);
  assert.equal(core.listWorkbenchSkills(f.root).length, 0);
  assert.match(result.publication.branch, /^skills\/meeting-notes\/1\.0\.0$/);
  const paths = git(f.remote, 'ls-tree', '-r', '--name-only', result.publication.commit);
  assert.match(paths, /meeting-notes\/1\.0\.0\/source\/meeting-notes\/SKILL.md/);
  assert.match(paths, /meeting-notes-1\.0\.0.skill/); assert.match(paths, /CHANGELOG.md/);
  assert.equal(library.listLibraryReleases(f.root)[0].status, 'uploaded');
  assert.ok(progress.some(message => /remote repository confirms/.test(message)));
  const firstPackage = fs.readFileSync(result.release.packagePath);
  const restored = library.restoreLibraryRelease(f.root, result.release.directory);
  guided.writeGuidedFile(restored, 'references/rules.md', 'Use the supplied notes and mark unknown owners.\n');
  const second = await guided.publishGuidedSkill(f.root, restored.id, '1.0.1', 'Clarified unknown owners.');
  assert.ok(second.cleanup);
  assert.deepEqual(fs.readFileSync(result.release.packagePath), firstPackage);
  assert.equal(git(f.remote, 'rev-parse', `refs/heads/${result.publication.branch}`).trim(), result.publication.commit);
  assert.equal(fs.readFileSync(unrelated, 'utf8'), 'Keep this user file.\n');
});

test('changed remote HEAD fails before publication without deleting draft, source, or existing prepared version', async t => {
  const f = fixture(t);
  await guided.connectWorkspaceRepository(f.root, f.remote);
  const prepared = core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Initial version.');
  const bytes = fs.readFileSync(prepared.packagePath);
  git(f.remote, 'symbolic-ref', 'HEAD', 'refs/heads/missing');
  await assert.rejects(guided.publishGuidedSkill(f.root, f.skill.id, '1.0.0', 'Initial version.'), /no readable default branch/);
  assert.ok(fs.existsSync(f.skill.sourcePath));
  assert.equal(core.listWorkbenchSkills(f.root).length, 1);
  assert.deepEqual(fs.readFileSync(prepared.packagePath), bytes);
  assert.equal(git(f.remote, 'for-each-ref', '--format=%(refname)', 'refs/heads/skills/').trim(), '');
});

test('prepared version conflicts retain immutable snapshot and never silently publish new files or ignore edited notes', async t => {
  const f = fixture(t);
  await guided.connectWorkspaceRepository(f.root, f.remote);
  const prepared = core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Initial version.');
  await assert.rejects(guided.publishGuidedSkill(f.root, f.skill.id, '1.0.0', 'Different notes.'), /different change notes/);
  guided.writeGuidedFile(f.skill, 'SKILL.md', guided.readGuidedFile(f.skill, 'SKILL.md') + '\nNew unpublished detail.\n');
  await assert.rejects(guided.publishGuidedSkill(f.root, f.skill.id, '1.0.0', 'Initial version.'), /different files/);
  assert.ok(fs.existsSync(f.skill.sourcePath)); core.verifySkillRelease(prepared.directory);
});

test('retry after a recorded upload verifies remote commit and finishes local completion without another push', async t => {
  const f = fixture(t);
  await guided.connectWorkspaceRepository(f.root, f.remote);
  const release = core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Initial version.');
  const preview = await publisher.prepareRepositoryPublish(release.directory, f.remote, 'trunk');
  let upload;
  try { upload = await publisher.pushPreparedRelease(preview); }
  finally { await publisher.disposePublishPreview(preview); }
  library.recordLibraryPublication(f.root, release.directory, { ...upload, baseBranch: 'trunk' });
  assert.equal(core.listWorkbenchSkills(f.root).length, 1, 'simulates interruption after receipt but before cleanup');
  const progress = [];
  const retried = await guided.publishGuidedSkill(f.root, f.skill.id, '1.0.0', 'Initial version.', message => progress.push(message));
  assert.equal(retried.publication.commit, upload.commit);
  assert.ok(retried.cleanup); assert.equal(core.listWorkbenchSkills(f.root).length, 0);
  assert.ok(progress.some(message => /previously uploaded/.test(message)));
  assert.equal(progress.some(message => /Pushing|Downloading/.test(message)), false);
  assert.equal(git(f.remote, 'rev-parse', `refs/heads/${upload.branch}`).trim(), upload.commit);
});

test('connection paths reject redirected workspace junctions without writing outside the selected workspace', async t => {
  const f = fixture(t);
  const outside = path.join(f.temporary, 'outside'); fs.mkdirSync(outside);
  const linked = path.join(f.temporary, 'workspace-link');
  fs.symlinkSync(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => guided.getWorkspaceConnection(linked), /links|junctions/);
  await assert.rejects(guided.connectWorkspaceRepository(linked, f.remote), /links|junctions/);
  assert.deepEqual(fs.readdirSync(outside), []);
});
