const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../out/skill-workbench.js');
const library = require('../out/workbench-library.js');
const { runWorkbenchJob } = require('../out/workbench-jobs.js');

function fixture(t) {
  const qa = path.resolve(__dirname, '../dist'); fs.mkdirSync(qa, { recursive: true });
  const root = fs.mkdtempSync(path.join(qa, 'release-metadata-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, 'input'); fs.mkdirSync(input);
  fs.writeFileSync(path.join(input, 'SKILL.md'), '---\nname: metadata-notes\ndescription: Summarize facts. Use when preparing notes.\n---\n\n# Notes\nKeep facts.\n');
  const skill = core.registerSkillFolder(root, input);
  const old = core.prepareSkillRelease(root, skill.id, '1.0.0', 'First version.');
  const latest = core.prepareSkillRelease(root, skill.id, '1.1.0', 'Second version.');
  return { root, skill, old, latest };
}

test('metadata listings avoid archive reads and disclose that payload integrity is unverified', t => {
  const f = fixture(t);
  fs.writeFileSync(f.old.packagePath, 'damaged old archive');
  const reads = [], original = fs.readFileSync;
  try {
    fs.readFileSync = function(file, ...args) { reads.push(String(file)); return original.call(this, file, ...args); };
    const listed = library.listLibraryReleases(f.root, f.skill.name, { verifyPayload: false });
    assert.equal(listed.length, 2);
    assert.ok(listed.every(item => item.verification === 'metadata'));
    assert.ok(!reads.some(file => file.endsWith('.skill')));
    const selected = core.findSkillRelease(f.root, f.skill.id, '1.1.0');
    assert.equal(selected.directory, f.latest.directory);
  } finally { fs.readFileSync = original; }
  assert.throws(() => core.verifySkillRelease(f.old.directory), /hash mismatch/);
  assert.equal(core.verifySkillRelease(f.latest.directory).version, '1.1.0');
});

test('comparison verifies the selected latest baseline, without decoding unrelated history', async t => {
  const f = fixture(t);
  fs.writeFileSync(f.old.packagePath, 'damaged old archive');
  const result = await runWorkbenchJob({ kind: 'snapshot', root: f.root, skill: f.skill });
  assert.equal(result.summary.baselineVersion, '1.1.0');
  fs.writeFileSync(f.latest.packagePath, 'damaged current baseline');
  await assert.rejects(runWorkbenchJob({ kind: 'snapshot', root: f.root, skill: f.skill }), /hash mismatch/);
});
