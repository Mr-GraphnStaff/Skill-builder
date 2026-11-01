const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const wb = require('../out/skill-workbench.js');

const manifest = '---\nname: sanity-sample\ndescription: Useful notes.\ncustom-vendor-option: preserved\n---\n# Notes\n';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const dist = path.resolve(__dirname, '../dist'); fs.mkdirSync(dist, { recursive: true });
  const root = fs.mkdtempSync(path.join(dist, 'sanity-check-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(root)), dist); fs.rmSync(root, { recursive: true, force: true }); });
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
  const source = path.join(workspace, 'skills/sanity-sample'); fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'SKILL.md'), manifest);
  return { root, workspace, source, record: { id: 'sanity-sample', name: 'sanity-sample', sourcePath: source } };
}
function archive(root, additions = {}) {
  const zip = new AdmZip(); zip.addFile('sanity-sample/SKILL.md', Buffer.from(manifest));
  for (const [relative, content] of Object.entries(additions)) zip.addFile(`sanity-sample/${relative}`, Buffer.isBuffer(content) ? content : Buffer.from(content));
  const file = path.join(root, 'original.skill'); zip.writeZip(file); return file;
}

test('complex portable files, custom evals and illustrative content pass structural sanity without scanner noise', t => {
  const { source, record } = fixture(t);
  for (const directory of ['references/deep', 'assets', 'scripts', 'evals', 'agents']) fs.mkdirSync(path.join(source, directory), { recursive: true });
  fs.appendFileSync(path.join(source, 'SKILL.md'), '\n' + 'TODO: illustrative scaffold language.\n'.repeat(510));
  fs.writeFileSync(path.join(source, 'references/deep/example.md'), '# Example\n\npassword=synthetic-example-value-0123456789\n');
  fs.writeFileSync(path.join(source, 'assets/image.bin'), Buffer.from([0, 255, 80, 78, 71]));
  fs.writeFileSync(path.join(source, 'scripts/example.custom'), 'const { exec } = require("node:child_process"); // example only\n');
  fs.writeFileSync(path.join(source, 'evals/custom-suite.yaml'), 'tests:\n  - prompt: Example\n');
  fs.writeFileSync(path.join(source, 'agents/openai.yaml'), 'display_name: Example\n');
  const result = wb.validateWorkbenchSkill(record);
  assert.equal(result.valid, true); assert.deepEqual(result.errors, []); assert.deepEqual(result.warnings, []);
  assert.equal(result.files.filter(file => !file.path.endsWith('/')).length, 6);
  assert.ok(result.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256)));
});

test('immutable original receives structural/integrity checks without an additional content-scanner gate', t => {
  const { root } = fixture(t), workspace = path.join(root, 'import-workspace'); fs.mkdirSync(workspace);
  const originalFile = archive(root, { 'references/example.md': 'API_KEY=synthetic-example-01234567890123456789\n', 'assets/data.bin': Buffer.from([0, 255, 1]) });
  const original = fs.readFileSync(originalFile), record = wb.importSkillPackage(originalFile, workspace);
  const validation = wb.validateWorkbenchSkill(record);
  assert.equal(validation.valid, true); assert.deepEqual(validation.warnings, []);
  const release = wb.prepareSkillRelease(workspace, record.id, '1.0.0', 'Preserve illustrative examples.');
  assert.equal(wb.verifySkillRelease(release.directory).version, '1.0.0');
  assert.equal(sha(fs.readFileSync(path.join(release.directory, 'original.skill'))), sha(original));
  assert.equal(sha(fs.readFileSync(originalFile)), sha(original));
  fs.appendFileSync(record.originalPackagePath, 'tamper');
  assert.throws(() => wb.prepareSkillRelease(workspace, record.id, '1.0.1', 'Check original integrity.'), /modified|integrity|mismatch/);
});

test('manifest presence, UTF-8, YAML mapping, required values, portable limits and identity still reject invalid drafts', t => {
  const { source, record } = fixture(t), target = path.join(source, 'SKILL.md');
  const cases = [
    [Buffer.from([0xff, 0]), /UTF-8/],
    ['# Missing frontmatter', /frontmatter/],
    ['---\nname: [broken\n---\n', /invalid YAML/],
    ['---\n- list\n---\n', /mapping/],
    ['---\nname: sanity-sample\n---\n', /description/],
    ['---\nname: sanity-sample\ndescription: 123\n---\n', /description/],
    ['---\nname: sanity-sample\ndescription: " "\n---\n', /description/],
    [`---\nname: sanity-sample\ndescription: ${'x'.repeat(1025)}\n---\n`, /1024/],
    ['---\nname: Invalid_Name\ndescription: Example\n---\n', /kebab-case/],
    [`---\nname: ${'a'.repeat(65)}\ndescription: Example\n---\n`, /64/],
    ['---\nname: con\ndescription: Example\n---\n', /reserved/],
    ['---\nname: other-name\ndescription: Example\n---\n', /identity|match/]
  ];
  for (const [content, expected] of cases) {
    fs.writeFileSync(target, content); const report = wb.validateWorkbenchSkill(record);
    assert.equal(report.valid, false); assert.match(report.errors.join('\n'), expected); assert.deepEqual(report.warnings, []);
  }
  fs.unlinkSync(target); assert.match(wb.validateWorkbenchSkill(record).errors.join('\n'), /SKILL.md is missing/);
});

test('archive traversal, special files and expansion limits remain rejected before import writes', t => {
  const { root } = fixture(t), workspace = path.join(root, 'guarded-workspace'); fs.mkdirSync(workspace);
  const badName = 'sanity-sample/../escape.txt', placeholder = 'x'.repeat(badName.length);
  const traversal = new AdmZip(); traversal.addFile('sanity-sample/SKILL.md', Buffer.from(manifest)); traversal.addFile(placeholder, Buffer.from('do not write'));
  const malformed = Buffer.from(traversal.toBuffer().toString('latin1').split(placeholder).join(badName), 'latin1');
  const file = path.join(root, 'unsafe.skill'); fs.writeFileSync(file, malformed);
  assert.throws(() => wb.importSkillPackage(file, workspace), /Unsafe archive path/);
  const linked = new AdmZip(); linked.addFile('sanity-sample/SKILL.md', Buffer.from(manifest)); linked.addFile('sanity-sample/link', Buffer.from('target')); linked.getEntry('sanity-sample/link').attr = (0xa1ff << 16) >>> 0; linked.writeZip(file);
  assert.throws(() => wb.importSkillPackage(file, workspace), /links or special/);
  archive(root, { 'large.bin': Buffer.alloc(16 * 1024 * 1024 + 1) });
  assert.throws(() => wb.importSkillPackage(path.join(root, 'original.skill'), workspace), /expanded size/);
  assert.equal(fs.existsSync(path.join(workspace, 'skills')), false);
});

test('source directory links remain rejected by structural sanity', t => {
  const { root, source, record } = fixture(t), target = path.join(root, 'linked-target'); fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'preserve.txt'), 'Preserve this source.');
  try { fs.symlinkSync(target, path.join(source, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'EISDIR', 'ENOTSUP'].includes(error.code)) { t.skip('Host filesystem did not permit creating a directory-link fixture.'); return; } throw error; }
  const report = wb.validateWorkbenchSkill(record); assert.equal(report.valid, false); assert.match(report.errors.join('\n'), /links/);
  assert.equal(fs.readFileSync(path.join(target, 'preserve.txt'), 'utf8'), 'Preserve this source.');
});
