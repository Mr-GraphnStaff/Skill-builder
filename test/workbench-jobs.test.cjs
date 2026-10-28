const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { runWorkbenchJob } = require('../out/workbench-jobs.js');
const { registerSkillFolder } = require('../out/skill-workbench.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-jobs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, 'input'); fs.mkdirSync(input);
  const manifest = '---\nname: worker-notes\ndescription: Summarize supplied notes. Use when a user requests a concise report.\n---\n\n# Instructions\nKeep facts.\n';
  fs.writeFileSync(path.join(input, 'SKILL.md'), manifest);
  return { root, input, manifest };
}

test('trusted worker jobs retain guarded import, validation, packaging and comparison behavior', async t => {
  const f = fixture(t), workspace = path.join(f.root, 'workspace'); fs.mkdirSync(workspace);
  const skill = await runWorkbenchJob({ kind: 'registerFolder', root: workspace, folder: f.input });
  assert.equal(skill.name, 'worker-notes');
  assert.equal((await runWorkbenchJob({ kind: 'validate', skill })).valid, true);
  const release = await runWorkbenchJob({ kind: 'prepareRelease', root: workspace, id: skill.id, version: '1.0.0', changelog: 'Initial worker test.' });
  assert.ok(fs.existsSync(release.packagePath));
  assert.equal((await runWorkbenchJob({ kind: 'verifyRelease', directory: release.directory })).version, '1.0.0');
  await assert.rejects(runWorkbenchJob({ kind: 'restoreRelease', root: path.join(f.root, 'another-workspace'), directory: release.directory }), /leaves|outside|workspace/i);
  const library = await runWorkbenchJob({ kind: 'library', root: workspace }); assert.equal(library.length, 1);
  assert.deepEqual(await runWorkbenchJob({ kind: 'reviews', root: workspace }), []);
  const snapshot = await runWorkbenchJob({ kind: 'snapshot', root: workspace, skill });
  assert.equal(snapshot.validation.valid, true); assert.equal(snapshot.releases.length, 1);
  assert.equal(snapshot.summary.hasChanges, false); assert.equal(snapshot.summary.unchanged, 1);
  fs.appendFileSync(path.join(skill.sourcePath, 'SKILL.md'), '\nChanged facts.\n');
  assert.deepEqual((await runWorkbenchJob({ kind: 'snapshot', root: workspace, skill })).summary.changed, ['SKILL.md']);
});

test('imported script contents remain inert while archive identity guards reject mismatched roots', async t => {
  const f = fixture(t), workspace = path.join(f.root, 'workspace'); fs.mkdirSync(workspace);
  const sentinel = path.join(f.root, 'executed.txt');
  const zip = new AdmZip(); zip.addFile('worker-notes/SKILL.md', Buffer.from(f.manifest));
  zip.addFile('worker-notes/scripts/run.cjs', Buffer.from(`require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'executed')`));
  const file = path.join(f.root, 'input.skill'); zip.writeZip(file);
  const skill = await runWorkbenchJob({ kind: 'importPackage', root: workspace, file });
  assert.equal(skill.name, 'worker-notes'); assert.equal(fs.existsSync(sentinel), false);
  const badFile = path.join(f.root, 'bad.skill');
  const wrong = new AdmZip(); wrong.addFile('wrong-root/SKILL.md', Buffer.from(f.manifest)); wrong.writeZip(badFile);
  await assert.rejects(runWorkbenchJob({ kind: 'importPackage', root: workspace, file: badFile }), /folder must match/);
});

test('unknown jobs cannot select code and operation errors retain existing release bytes', async t => {
  const f = fixture(t), skill = registerSkillFolder(f.root, f.input);
  await assert.rejects(runWorkbenchJob({ kind: 'execute', source: 'process.exit(0)' }), /supported local operation/);
  const release = await runWorkbenchJob({ kind: 'prepareRelease', root: f.root, id: skill.id, version: '1.0.0', changelog: 'Initial.' });
  const bytes = fs.readFileSync(release.packagePath);
  await assert.rejects(runWorkbenchJob({ kind: 'prepareRelease', root: f.root, id: skill.id, version: '1.0.0', changelog: 'Try overwrite.' }), /already exists/);
  assert.deepEqual(fs.readFileSync(release.packagePath), bytes);
});

test('workers let the host service timers and timeouts distinguish uncertain writes', async t => {
  const f = fixture(t), skill = registerSkillFolder(f.root, f.input);
  let ticks = 0;
  const timer = setInterval(() => ticks++, 1);
  try { await runWorkbenchJob({ kind: 'validate', skill }); } finally { clearInterval(timer); }
  assert.ok(ticks > 0, 'the main host event loop must run while worker starts and validates');
  await assert.rejects(runWorkbenchJob({ kind: 'validate', skill }, { timeoutMs: 1 }), /No upload was attempted/);
  await assert.rejects(runWorkbenchJob({ kind: 'prepareRelease', root: f.root, id: skill.id, version: '2.0.0', changelog: 'Timeout sample.' }, { timeoutMs: 1 }), /write may already have completed/);
});
