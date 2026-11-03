const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { workingFixture } = require('./working-fixture.cjs');
const { createWorkbench } = require('../out/workbench-setup.js');
const { createGuidedSkill } = require('../out/guided-workspace.js');
const { prepareSkillRelease, verifySkillRelease } = require('../out/skill-workbench.js');
const { recordLibraryPublication } = require('../out/workbench-library.js');
const archive = require('../out/release-archive.js');
function fixture(t) {
  const base = workingFixture('release-archive'); fs.mkdirSync(base, { recursive: true });
  const root = createWorkbench(fs.mkdtempSync(path.join(base, 'case-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const skill = createGuidedSkill(root, { name: 'archive-notes', description: 'Preserve notes.', instructions: '# Notes\nPreserve evidence.' });
  const older = prepareSkillRelease(root, skill.id, '1.0.0', 'First snapshot.'), latest = prepareSkillRelease(root, skill.id, '1.0.1', 'Next snapshot.');
  return { root, skill, older, latest };
}
test('reviewed local archive protects newest and draft, preserves bytes and restores without remote operations', t => {
  const f = fixture(t), bytes = fs.readFileSync(f.older.packagePath), plan = archive.previewReleaseArchive(f.root);
  assert.equal(plan.entries.length, 1); assert.equal(plan.entries[0].version, '1.0.0');
  assert(plan.skipped.some(reason => reason.includes('1.0.1')));
  const id = archive.archiveReviewedReleases(f.root, plan);
  assert.equal(fs.existsSync(f.older.directory), false); assert(fs.existsSync(f.latest.packagePath)); assert(fs.existsSync(f.skill.sourcePath));
  assert.equal(archive.listReleaseArchives(f.root)[0].id, id);
  archive.restoreReleaseArchive(f.root, id);
  assert.deepEqual(fs.readFileSync(f.older.packagePath), bytes); verifySkillRelease(f.older.directory);
  assert.deepEqual(archive.listReleaseArchives(f.root), []);
});
test('active upload is excluded and a changed preview cannot move release bytes', t => {
  const f = fixture(t);
  recordLibraryPublication(f.root, f.older.directory, { repository: 'https://github.com/example/skills.git', branch: 'skills/archive-notes/1.0.0', commit: 'a'.repeat(40), baseBranch: 'main' });
  const protectedPlan = archive.previewReleaseArchive(f.root); assert.equal(protectedPlan.entries.length, 0);
  assert(protectedPlan.skipped.some(reason => reason.includes('PR')));
  const other = fixture(t), plan = archive.previewReleaseArchive(other.root);
  fs.appendFileSync(path.join(other.older.directory, 'CHANGELOG.md'), 'changed');
  assert.throws(() => archive.archiveReviewedReleases(other.root, plan), /hash|changed|integrity/i);
  assert(fs.existsSync(other.older.packagePath));
});
test('restore refuses collisions and tampered archive IDs without overwriting either copy', t => {
  const f = fixture(t), id = archive.archiveReviewedReleases(f.root, archive.previewReleaseArchive(f.root));
  fs.mkdirSync(f.older.directory); fs.writeFileSync(path.join(f.older.directory, 'keep.txt'), 'Keep this newer local work.');
  assert.throws(() => archive.restoreReleaseArchive(f.root, id), /occupies/);
  assert.equal(fs.readFileSync(path.join(f.older.directory, 'keep.txt'), 'utf8'), 'Keep this newer local work.');
  assert.equal(archive.listReleaseArchives(f.root).length, 1);
  assert.throws(() => archive.restoreReleaseArchive(f.root, '../outside'), /recorded archive/);
});

test('interrupted archive and partial restore stay visible and recover idempotently', t => {
  const f = fixture(t), plan = archive.previewReleaseArchive(f.root);
  const id = archive.archiveReviewedReleases(f.root, plan);
  const receiptFile = path.join(f.root, 'recovery', 'archived-releases', id, 'receipt.json');
  const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  receipt.state = 'preparing'; fs.writeFileSync(receiptFile, JSON.stringify(receipt));
  fs.writeFileSync(receiptFile + '.orphan.tmp', 'Interrupted journal write evidence.');
  assert.match(archive.listReleaseArchives(f.root)[0].label, /Recovery needed/);
  // Simulate a prior restore reaching its rename but not its final journal save.
  const saved = path.join(f.root, 'recovery', 'archived-releases', id, 'skill', 'archive-notes', '1.0.0');
  fs.renameSync(saved, f.older.directory);
  archive.restoreReleaseArchive(f.root, id);
  verifySkillRelease(f.older.directory);
  assert.deepEqual(archive.listReleaseArchives(f.root), []);
  assert.equal(fs.readFileSync(receiptFile + '.orphan.tmp', 'utf8'), 'Interrupted journal write evidence.');
});
