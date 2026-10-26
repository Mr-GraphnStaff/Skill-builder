// Independent security regression probes; no remote writes or model execution.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const wb = require('../out/skill-workbench.js');
const library = require('../out/workbench-library.js');

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'library-security-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'workspace');
  const source = path.join(root, 'skills', 'review-sample');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: review-sample\ndescription: Prepare review notes. Use when asked to prepare review notes.\n---\n# Review notes\nKeep supplied facts.\n');
  const skill = wb.registerSkillFolder(root, source);
  const release = wb.prepareSkillRelease(root, skill.id, '1.0.0', 'Initial version.');
  const receipt = path.join(root, '.skill-workbench', 'publications', skill.id, '1.0.0.json');
  const publication = { repository: 'https://github.com/example/skills', branch: 'skills/review-sample/1.0.0', baseBranch: 'main', commit: 'a'.repeat(40) };
  return { temp, root, source, skill, release, receipt, publication };
}

test('untrusted receipt fields cannot replace verified release identity, file paths or lifecycle state', t => {
  const f = fixture(t);
  library.recordLibraryPublication(f.root, f.release.directory, f.publication);
  const saved = JSON.parse(fs.readFileSync(f.receipt, 'utf8'));
  Object.assign(saved, { skillName: 'spoofed', version: '99.0.0', directory: path.join(f.temp, 'outside'), packagePath: path.join(f.temp, 'outside.skill'), status: 'merged' });
  fs.writeFileSync(f.receipt, JSON.stringify(saved));
  const entry = library.listLibraryReleases(f.root)[0];
  assert.equal(entry.skillName, f.skill.name);
  assert.equal(entry.version, f.release.version);
  assert.equal(entry.directory, f.release.directory);
  assert.equal(entry.packagePath, f.release.packagePath);
  assert.equal(entry.status, 'uploaded');
  wb.verifySkillRelease(f.release.directory);
});

test('receipt directory junctions cannot redirect writes outside the workspace', t => {
  const f = fixture(t);
  const outside = path.join(f.temp, 'outside'); fs.mkdirSync(outside);
  const parent = path.join(f.root, '.skill-workbench', 'publications');
  fs.mkdirSync(path.dirname(parent), { recursive: true });
  fs.symlinkSync(outside, parent, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => library.recordLibraryPublication(f.root, f.release.directory, f.publication), /symbolic links/);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(wb.listWorkbenchSkills(f.root).length, 1);
});
