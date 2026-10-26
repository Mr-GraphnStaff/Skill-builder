// Longitudinal lifecycle acceptance using actual local modules. These tests do
// not claim live UI accessibility or remote publication: receipt hashes below
// are deliberately synthetic, and no Git/network process is invoked.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const core = require('../out/skill-workbench.js');
const library = require('../out/workbench-library.js');

function fixture(t, imported = false) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-acceptance-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'workspace'); fs.mkdirSync(root);
  const manifest = '---\nname: cycle-sample\ndescription: Prepare traceable sample notes. Use when asked for the sample notes workflow.\nmetadata:\n  version: "1.0.0"\n---\n# Cycle sample\nRead references/nested/rules.md.\n';
  const input = path.join(temp, 'input.skill');
  const zip = new AdmZip();
  zip.addFile('cycle-sample/SKILL.md', Buffer.from(manifest));
  zip.addFile('cycle-sample/references/nested/rules.md', Buffer.from('# Rules\nKeep supplied evidence.\n'));
  zip.addFile('cycle-sample/assets/nested/image.bin', Buffer.from([0, 255, 13, 10]));
  zip.writeZip(input);
  let skill;
  if (imported) skill = core.importSkillPackage(input, root);
  else {
    const source = path.join(root, 'skills', 'cycle-sample');
    fs.mkdirSync(source, { recursive: true });
    zip.extractAllTo(path.join(temp, 'seed'));
    fs.cpSync(path.join(temp, 'seed', 'cycle-sample'), source, { recursive: true });
    skill = core.registerSkillFolder(root, source);
  }
  const outside = path.join(temp, 'outside.txt'); fs.writeFileSync(outside, 'Unrelated user data\n');
  return { root, temp, skill, input, outside };
}
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const publication = { repository: 'https://github.com/example/skills', baseBranch: 'main', branch: 'skills/cycle-sample/1.0.0', commit: 'a'.repeat(40) };

test('v1 preparation, recorded upload, clean completion, library restore and v2 preserve the immutable prior release', t => {
  const f = fixture(t);
  core.updateSkillRepository(f.root, f.skill.id, publication.repository, publication.baseBranch);
  const first = core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Initial cycle version.');
  const firstHash = digest(first.packagePath);
  assert.equal(library.listLibraryReleases(f.root)[0].status, 'prepared');
  library.recordLibraryPublication(f.root, first.directory, publication);
  core.completeWorkbenchSkill(f.root, f.skill.id, first.directory);
  assert.deepEqual(core.listWorkbenchSkills(f.root), []);
  assert.equal(fs.existsSync(f.skill.sourcePath), false);
  const persisted = library.listLibraryReleases(f.root)[0];
  assert.equal(persisted.status, 'uploaded');
  assert.equal(persisted.commit, publication.commit);
  assert.equal(persisted.branch, publication.branch, 'upload receipt retains the review branch, not a merge claim');
  const restored = library.restoreLibraryRelease(f.root, first.directory);
  assert.equal(restored.repository, publication.repository);
  assert.equal(restored.baseBranch, 'main');
  assert.equal(library.suggestReleaseVersion(restored, ['1.0.0']), '1.0.1');
  fs.writeFileSync(path.join(restored.sourcePath, 'references', 'nested', 'rules.md'), '# Rules\nRevised evidence guidance.\n');
  const second = core.prepareSkillRelease(f.root, restored.id, '1.0.1', 'Clarify nested evidence guidance.');
  core.verifySkillRelease(second.directory);
  assert.equal(digest(first.packagePath), firstHash);
  core.verifySkillRelease(first.directory);
  assert.equal(fs.existsSync(path.join(second.directory, 'original.skill')), false);
  assert.equal(library.listLibraryReleases(f.root).length, 2);
  assert.equal(fs.readFileSync(f.outside, 'utf8'), 'Unrelated user data\n');
});

test('restoring an imported release preserves both immutable original bytes and nested binary source', t => {
  const f = fixture(t, true);
  const originalHash = digest(f.input);
  const first = core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Import cycle version.');
  library.recordLibraryPublication(f.root, first.directory, publication);
  core.completeWorkbenchSkill(f.root, f.skill.id, first.directory);
  const restored = library.restoreLibraryRelease(f.root, first.directory);
  assert.equal(digest(restored.originalPackagePath), originalHash);
  assert.deepEqual(fs.readFileSync(path.join(restored.sourcePath, 'assets', 'nested', 'image.bin')), Buffer.from([0, 255, 13, 10]));
  const second = core.prepareSkillRelease(f.root, restored.id, '1.0.1', 'Second imported cycle version.');
  assert.equal(digest(path.join(second.directory, 'original.skill')), originalHash);
  assert.equal(digest(f.input), originalHash);
});

test('restore collisions and foreign workspace releases fail without replacing active work or external files', t => {
  const f = fixture(t);
  const release = core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Initial version.');
  fs.appendFileSync(path.join(f.skill.sourcePath, 'SKILL.md'), '\nUnsaved-for-release newer work.\n');
  const currentHash = digest(path.join(f.skill.sourcePath, 'SKILL.md'));
  assert.throws(() => library.restoreLibraryRelease(f.root, release.directory), /already exists/);
  assert.equal(digest(path.join(f.skill.sourcePath, 'SKILL.md')), currentHash);
  const foreign = path.join(f.temp, 'foreign'); fs.mkdirSync(foreign);
  assert.throws(() => library.restoreLibraryRelease(foreign, release.directory), /leaves|outside/);
  assert.equal(fs.readFileSync(f.outside, 'utf8'), 'Unrelated user data\n');
});

test('publication receipts stay outside immutable releases and conflicting receipts never replace the first result', t => {
  const f = fixture(t);
  const release = core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Initial version.');
  const before = fs.readdirSync(release.directory).sort();
  const packageHash = digest(release.packagePath);
  library.recordLibraryPublication(f.root, release.directory, publication);
  library.recordLibraryPublication(f.root, release.directory, publication);
  assert.throws(() => library.recordLibraryPublication(f.root, release.directory, { ...publication, commit: 'b'.repeat(40) }), /different publication/);
  assert.equal(library.listLibraryReleases(f.root)[0].commit, publication.commit);
  assert.deepEqual(fs.readdirSync(release.directory).sort(), before);
  assert.equal(digest(release.packagePath), packageHash);
  core.verifySkillRelease(release.directory);
});
