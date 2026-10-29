const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const wb = require('../out/skill-workbench.js');

const manifest = `---\nname: nested-tool\ndescription: >\n  Process nested inputs and files.\n  Use when the user asks for the nested workflow.\nmetadata:\n  version: 3\n  custom:\n    - preserved\n---\n# Nested Tool\nRead references/deep/rules.md.\n`;
function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-workbench-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const workspace = path.join(temp, 'workspace'); fs.mkdirSync(workspace);
  return { temp, workspace };
}
function archive(files = {}) {
  const zip = new AdmZip(); zip.addFile('nested-tool/SKILL.md', Buffer.from(manifest));
  for (const [name, bytes] of Object.entries(files)) zip.addFile(name, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
  return zip;
}
function input(temp, zip) { const file = path.join(temp, 'original.skill'); zip.writeZip(file); return file; }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

test('complex .skill roundtrip preserves original, nested binary/metadata, empty folders, edits and previous versions', t => {
  const { temp, workspace } = fixture(t);
  const bytes = Buffer.from([0, 255, 16, 13, 10]);
  const packagePath = input(temp, archive({ 'nested-tool/assets/deep/image.bin': bytes, 'nested-tool/references/deep/rules.md': '# Rules', 'nested-tool/arbitrary/empty/': '', 'nested-tool/templates/SKILL.md': '# embedded template' }));
  const original = fs.readFileSync(packagePath);
  const record = wb.importSkillPackage(packagePath, workspace);
  assert.equal(record.id, 'nested-tool');
  assert.equal(sha(fs.readFileSync(record.originalPackagePath)), sha(original));
  assert.deepEqual(fs.readFileSync(path.join(record.sourcePath, 'assets/deep/image.bin')), bytes);
  assert.equal(fs.readFileSync(path.join(record.sourcePath, 'SKILL.md'), 'utf8'), manifest);
  assert.ok(fs.statSync(path.join(record.sourcePath, 'arbitrary/empty')).isDirectory());
  fs.writeFileSync(path.join(record.sourcePath, 'references/deep/rules.md'), '# Revised rules');
  fs.writeFileSync(path.join(record.sourcePath, 'arbitrary/new.json'), '{"added":true}');
  assert.equal(wb.validateWorkbenchSkill(record).valid, true);
  const release = wb.prepareSkillRelease(workspace, record.id, '1.2.0', '# 1.2.0\n\nChanged nested rules.');
  const packed = new AdmZip(release.packagePath);
  assert.deepEqual(packed.readFile('nested-tool/assets/deep/image.bin'), bytes);
  assert.equal(packed.readAsText('nested-tool/references/deep/rules.md'), '# Revised rules');
  assert.ok(packed.getEntry('nested-tool/arbitrary/empty/'));
  assert.deepEqual(fs.readFileSync(path.join(release.directory, 'original.skill')), original);
  assert.equal(release.manifest.packageSha256, sha(fs.readFileSync(release.packagePath)));
  const releaseHash = sha(fs.readFileSync(release.packagePath));
  assert.throws(() => wb.prepareSkillRelease(workspace, record.id, '1.2.0', 'Again'), /already exists/);
  wb.prepareSkillRelease(workspace, record.id, '1.2.1', '# New version');
  assert.equal(sha(fs.readFileSync(release.packagePath)), releaseHash);
  assert.equal(wb.listSkillReleases(workspace, record.id).length, 2);
  wb.updateSkillRepository(workspace, record.id, 'https://github.com/example/skills.git', 'main');
  assert.equal(wb.listWorkbenchSkills(workspace)[0].repository, 'https://github.com/example/skills.git');
});

test('folder registration preserves user files; collisions and invalid releases are rejected', t => {
  const { temp, workspace } = fixture(t);
  const source = path.join(workspace, 'skills/nested-tool'); fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'SKILL.md'), manifest);
  const record = wb.registerSkillFolder(workspace, source);
  assert.equal(record.sourcePath, source);
  const packagePath = input(temp, archive());
  assert.throws(() => wb.importSkillPackage(packagePath, workspace), /already exists/);
  assert.equal(fs.readFileSync(path.join(source, 'SKILL.md'), 'utf8'), manifest);
  for (const version of ['../x', '01.2.3', '1.0', '1.2.3-01']) assert.throws(() => wb.prepareSkillRelease(workspace, record.id, version, 'Changes'), /semantic/);
  assert.throws(() => wb.prepareSkillRelease(workspace, record.id, '1.0.0', '  '), /changelog/);
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: nested-tool\ndescription: [\n---\n');
  assert.equal(wb.validateWorkbenchSkill(record).valid, false);
  assert.throws(() => wb.prepareSkillRelease(workspace, record.id, '1.0.0', 'Changes'));
  assert.equal(fs.existsSync(path.join(workspace, 'releases/nested-tool/1.0.0')), false);
});

test('malicious archive paths, links, collisions and ambiguous roots fail before extraction', t => {
  const { temp, workspace } = fixture(t);
  const attacks = [
    ['nested-tool/../outside.txt', /Unsafe/],
    ['/absolute.txt', /Unsafe/],
    ['C:/escape.txt', /Unsafe/],
    ['\\\\server\\escape', /Unsafe/],
    ['nested-tool/CON.txt', /Unsafe/],
    ['nested-tool/file.', /Unsafe/],
    ['other/SKILL.md', /unambiguous/],
    ['unrelated-empty/', /unambiguous/]
  ];
  // Write unsafe names by patching equally sized local and central ZIP names;
  // archive libraries may sanitize names passed through addFile.
  for (const [bad, expected] of attacks) {
    const safe = 'x'.repeat(Buffer.byteLength(bad));
    const zip = archive({ [safe]: 'attack' });
    let raw = zip.toBuffer(); raw = Buffer.from(raw.toString('latin1').split(safe).join(bad), 'latin1');
    const file = path.join(temp, 'attack.skill'); fs.writeFileSync(file, raw);
    assert.throws(() => wb.importSkillPackage(file, workspace), expected, bad);
    assert.equal(fs.existsSync(path.join(workspace, 'skills')), false);
  }
  for (const entries of [
    { 'nested-tool/Foo/a.txt': 'a', 'nested-tool/foo/b.txt': 'b' },
    { 'nested-tool/file': 'a', 'nested-tool/file/sub.txt': 'b' }
  ]) assert.throws(() => wb.importSkillPackage(input(temp, archive(entries)), workspace), /collision/);
  const linked = archive({ 'nested-tool/link': 'target' }); linked.getEntry('nested-tool/link').attr = (0xa1ff << 16) >>> 0;
  assert.throws(() => wb.importSkillPackage(input(temp, linked), workspace), /links/);
  assert.equal(fs.existsSync(path.join(workspace, 'skills')), false);
});

test('expanded archive limits and immutable original tampering fail safely', t => {
  const { temp, workspace } = fixture(t);
  const large = archive({ 'nested-tool/large.bin': Buffer.alloc(16 * 1024 * 1024 + 1) });
  assert.throws(() => wb.importSkillPackage(input(temp, large), workspace), /size exceeds/);
  assert.equal(fs.existsSync(path.join(workspace, 'skills')), false);
  const record = wb.importSkillPackage(input(temp, archive()), workspace);
  fs.appendFileSync(record.originalPackagePath, 'modified');
  assert.throws(() => wb.prepareSkillRelease(workspace, record.id, '1.0.0', 'Changes'), /modified/);
  assert.equal(fs.existsSync(path.join(workspace, 'releases/nested-tool/1.0.0')), false);
  assert.ok(fs.existsSync(path.join(record.sourcePath, 'SKILL.md')));
});

test('duplicate paths, CRC corruption and excessive entry count never create editable source', t => {
  const { temp, workspace } = fixture(t);
  const duplicate = archive({ 'nested-tool/aa.txt': 'a', 'nested-tool/bb.txt': 'b' }).toBuffer();
  const patched = Buffer.from(duplicate.toString('latin1').split('nested-tool/bb.txt').join('nested-tool/aa.txt'), 'latin1');
  const file = path.join(temp, 'duplicate.skill'); fs.writeFileSync(file, patched);
  assert.throws(() => wb.importSkillPackage(file, workspace), /Duplicate/);
  const badCrc = archive();
  badCrc.getEntry('nested-tool/SKILL.md').header.crc ^= 1;
  assert.throws(() => wb.importSkillPackage(input(temp, badCrc), workspace), /integrity/);
  const tooMany = archive();
  for (let index = 0; index < 4096; index++) tooMany.addFile(`nested-tool/files/${index}`, Buffer.alloc(0));
  assert.throws(() => wb.importSkillPackage(input(temp, tooMany), workspace), /count/);
  assert.equal(fs.existsSync(path.join(workspace, 'skills')), false);
});

test('source symlinks and catalog paths outside workspace cannot enter releases', t => {
  const { temp, workspace } = fixture(t);
  const source = path.join(workspace, 'skills/nested-tool'); fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'SKILL.md'), manifest);
  const record = wb.registerSkillFolder(workspace, source);
  const external = path.join(temp, 'external'); fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, 'private.txt'), 'outside-workspace');
  try { fs.symlinkSync(external, path.join(source, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('Host does not permit test links.'); return; } throw error; }
  assert.equal(wb.validateWorkbenchSkill(record).valid, false);
  assert.throws(() => wb.prepareSkillRelease(workspace, record.id, '1.0.0', 'Changes'), /links/);
  const catalogPath = path.join(workspace, '.skill-workbench/catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')); catalog.skills[0].sourcePath = external;
  fs.writeFileSync(catalogPath, JSON.stringify(catalog));
  assert.throws(() => wb.listWorkbenchSkills(workspace), /outside/);
});

test('verified publish completion archives recoverable source, clears catalog and admits next same-name import', t => {
  const { temp, workspace } = fixture(t);
  const packagePath = input(temp, archive({ 'nested-tool/deep/file.bin': Buffer.from([255, 0, 3]) }));
  const record = wb.importSkillPackage(packagePath, workspace);
  const session = path.join(workspace, 'workbench/nested-tool'); fs.mkdirSync(session, { recursive: true });
  fs.writeFileSync(path.join(session, 'playground.json'), '{"previous":"session"}');
  const release = wb.prepareSkillRelease(workspace, record.id, '1.0.0', 'First release');
  const completed = wb.completeWorkbenchSkill(workspace, record.id, release.directory);
  assert.equal(completed.sourceRetained, false);
  assert.ok(fs.existsSync(path.join(completed.archivedPath, 'source/SKILL.md')));
  assert.ok(fs.existsSync(path.join(completed.archivedPath, 'record.json')));
  assert.equal(fs.readFileSync(path.join(completed.archivedPath, 'session/playground.json'), 'utf8'), '{"previous":"session"}');
  assert.equal(fs.existsSync(session), false);
  assert.ok(fs.existsSync(record.originalPackagePath));
  assert.ok(fs.existsSync(release.packagePath));
  assert.equal(fs.existsSync(record.sourcePath), false);
  assert.deepEqual(wb.listWorkbenchSkills(workspace), []);
  const next = wb.importSkillPackage(packagePath, workspace);
  assert.equal(next.id, record.id);
  assert.equal(fs.readFileSync(path.join(next.sourcePath, 'SKILL.md'), 'utf8'), manifest);
});

test('completion retains newer edits and rejects unrelated release IDs', t => {
  const { temp, workspace } = fixture(t);
  const record = wb.importSkillPackage(input(temp, archive()), workspace);
  const release = wb.prepareSkillRelease(workspace, record.id, '1.0.0', 'First release');
  fs.writeFileSync(path.join(record.sourcePath, 'new.txt'), 'Unreleased local edits');
  assert.throws(() => wb.completeWorkbenchSkill(workspace, record.id, release.directory), /Published, but local edits.*retained/);
  assert.equal(wb.listWorkbenchSkills(workspace).length, 1);
  assert.equal(fs.readFileSync(path.join(record.sourcePath, 'new.txt'), 'utf8'), 'Unreleased local edits');
  assert.throws(() => wb.completeWorkbenchSkill(workspace, record.id, path.join(workspace, 'releases/another-skill/1.0.0')), /does not belong/);
  assert.equal(wb.listWorkbenchSkills(workspace).length, 1);
});

test('completion rolls source back when final catalog update fails', t => {
  const { temp, workspace } = fixture(t);
  const record = wb.importSkillPackage(input(temp, archive()), workspace);
  const release = wb.prepareSkillRelease(workspace, record.id, '1.0.0', 'First release');
  const session = path.join(workspace, 'workbench/nested-tool'); fs.mkdirSync(session, { recursive: true });
  fs.writeFileSync(path.join(session, 'playground.json'), '{"unsent":true}');
  const rename = fs.renameSync;
  fs.renameSync = function (from, to) {
    if (path.basename(to) === 'catalog.json') throw new Error('Simulated catalog rename failure');
    return rename.apply(this, arguments);
  };
  try { assert.throws(() => wb.completeWorkbenchSkill(workspace, record.id, release.directory), /Simulated catalog/); }
  finally { fs.renameSync = rename; }
  assert.equal(wb.listWorkbenchSkills(workspace).length, 1);
  assert.equal(fs.readFileSync(path.join(record.sourcePath, 'SKILL.md'), 'utf8'), manifest);
  assert.equal(fs.readFileSync(path.join(session, 'playground.json'), 'utf8'), '{"unsent":true}');
  assert.equal(fs.existsSync(path.join(workspace, '.skill-workbench/completed/nested-tool/1.0.0')), false);
});

test('registering an external folder keeps original user folder untouched through completion', t => {
  const { temp, workspace } = fixture(t);
  const external = path.join(temp, 'user-original'); fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, 'SKILL.md'), manifest);
  fs.writeFileSync(path.join(external, 'preserve.bin'), Buffer.from([12, 0, 255]));
  const record = wb.registerSkillFolder(workspace, external);
  assert.notEqual(record.sourcePath, external);
  const release = wb.prepareSkillRelease(workspace, record.id, '1.0.0', 'Registered folder release');
  wb.completeWorkbenchSkill(workspace, record.id, release.directory);
  assert.equal(fs.readFileSync(path.join(external, 'SKILL.md'), 'utf8'), manifest);
  assert.deepEqual(fs.readFileSync(path.join(external, 'preserve.bin')), Buffer.from([12, 0, 255]));
  assert.deepEqual(wb.listWorkbenchSkills(workspace), []);
});

test('intended dotfile credentials block releases without leaking values, ordinary dotfiles and binary files survive', t => {
  const { temp, workspace } = fixture(t);
  const record = wb.importSkillPackage(input(temp, archive({ 'nested-tool/.ordinary': 'keep this text', 'nested-tool/raw.data': Buffer.from([255, 0]) })), workspace);
  const fakeCredential = 'fake-test-key-12345678901234567890';
  fs.writeFileSync(path.join(record.sourcePath, '.env'), `API_KEY=${fakeCredential}\n`);
  const blocked = wb.validateWorkbenchSkill(record);
  assert.equal(blocked.valid, false);
  assert.ok(blocked.errors.some(message => message.includes('.env') && /credential/.test(message)));
  assert.equal(JSON.stringify(blocked).includes(fakeCredential), false);
  assert.throws(() => wb.prepareSkillRelease(workspace, record.id, '1.0.0', 'Changes'), /credential/);
  fs.writeFileSync(path.join(record.sourcePath, '.env'), '# Runtime configuration uses external credentials\n');
  fs.writeFileSync(path.join(record.sourcePath, 'runner.custom'), 'const { spawnSync } = require("node:child_process");\n');
  const reviewed = wb.validateWorkbenchSkill(record);
  assert.equal(reviewed.valid, true);
  assert.ok(reviewed.warnings.some(message => message.includes('runner.custom') && /Process execution/.test(message)));
  assert.ok(reviewed.warnings.some(message => message.includes('raw.data') && /not scanned/.test(message)));
  const release = wb.prepareSkillRelease(workspace, record.id, '1.0.0', 'Reviewed capabilities');
  const zip = new AdmZip(release.packagePath);
  assert.equal(zip.readAsText('nested-tool/.ordinary'), 'keep this text');
  assert.ok(zip.getEntry('nested-tool/.env'));
  assert.deepEqual(zip.readFile('nested-tool/raw.data'), Buffer.from([255, 0]));
});

test('release verification rejects changed package, source, changelog, original and extra content', t => {
  const { temp, workspace } = fixture(t);
  const record = wb.importSkillPackage(input(temp, archive()), workspace);
  for (const [index, relative] of ['nested-tool-1.0.0.skill', 'source/nested-tool/SKILL.md', 'CHANGELOG.md', 'original.skill', 'unexpected.txt'].entries()) {
    const version = `1.0.${index}`;
    const release = wb.prepareSkillRelease(workspace, record.id, version, 'Valid changelog');
    assert.equal(wb.verifySkillRelease(release.directory).version, version);
    const target = path.join(release.directory, relative.replace('1.0.0', version));
    fs.appendFileSync(target, 'tampered');
    assert.throws(() => wb.verifySkillRelease(release.directory), /mismatch|inventory|Unexpected/);
  }
});

test('redacting editable secrets does not silently publish credential-bearing immutable original', t => {
  const { temp, workspace } = fixture(t);
  const record = wb.importSkillPackage(input(temp, archive({ 'nested-tool/.env': 'API_KEY=fake-credential-12345678901234567890' })), workspace);
  fs.writeFileSync(path.join(record.sourcePath, '.env'), '# removed credential');
  assert.equal(wb.validateWorkbenchSkill(record).valid, true);
  assert.throws(() => wb.prepareSkillRelease(workspace, record.id, '1.0.0', 'Redact credential'), /Original package validation failed/);
  assert.equal(fs.existsSync(path.join(workspace, 'releases/nested-tool/1.0.0')), false);
});

test('failed import catalog write rolls back new source, preserves original and permits clean retry', t => {
  const { temp, workspace } = fixture(t);
  const packagePath = input(temp, archive({ 'nested-tool/deep/file.bin': Buffer.from([0, 255]) }));
  const originalHash = sha(fs.readFileSync(packagePath));
  const rename = fs.renameSync;
  fs.renameSync = function (from, to) { if (path.basename(to) === 'catalog.json') throw new Error('Simulated import catalog failure'); return rename.apply(this, arguments); };
  try { assert.throws(() => wb.importSkillPackage(packagePath, workspace), /Simulated import catalog failure/); }
  finally { fs.renameSync = rename; }
  assert.equal(fs.existsSync(path.join(workspace, 'skills/nested-tool')), false);
  assert.deepEqual(wb.listWorkbenchSkills(workspace), []);
  assert.equal(sha(fs.readFileSync(packagePath)), originalHash);
  assert.equal(sha(fs.readFileSync(path.join(workspace, '.skill-workbench/nested-tool/originals', `${originalHash}.skill`))), originalHash);
  assert.equal(wb.importSkillPackage(packagePath, workspace).name, 'nested-tool');
});

test('failed folder-registration catalog write preserves external and canonical user source', t => {
  const { temp, workspace } = fixture(t);
  const external = path.join(temp, 'external'); fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, 'SKILL.md'), manifest);
  const rename = fs.renameSync;
  fs.renameSync = function (from, to) { if (path.basename(to) === 'catalog.json') throw new Error('Simulated registration catalog failure'); return rename.apply(this, arguments); };
  try { assert.throws(() => wb.registerSkillFolder(workspace, external), /Simulated registration/); }
  finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(path.join(external, 'SKILL.md'), 'utf8'), manifest);
  const canonical = path.join(workspace, 'skills/nested-tool');
  assert.equal(fs.existsSync(canonical), false);
  fs.mkdirSync(canonical, { recursive: true }); fs.writeFileSync(path.join(canonical, 'SKILL.md'), manifest);
  fs.renameSync = function (from, to) { if (path.basename(to) === 'catalog.json') throw new Error('Simulated registration catalog failure'); return rename.apply(this, arguments); };
  try { assert.throws(() => wb.registerSkillFolder(workspace, canonical), /Simulated registration/); }
  finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(path.join(canonical, 'SKILL.md'), 'utf8'), manifest);
  assert.deepEqual(wb.listWorkbenchSkills(workspace), []);
  assert.equal(wb.registerSkillFolder(workspace, canonical).name, 'nested-tool');
});

test('folded description validates trimmed 1024 characters while preserving exact bytes; 1025 rejects before extraction', t => {
  const { temp, workspace } = fixture(t);
  const description = 'a'.repeat(1024);
  const sourceManifest = `---\nname: nested-tool\ndescription: >\n  ${description}\n---\n# Nested Tool\n`;
  const zip = new AdmZip(); zip.addFile('nested-tool/SKILL.md', Buffer.from(sourceManifest));
  const record = wb.importSkillPackage(input(temp, zip), workspace);
  assert.equal(fs.readFileSync(path.join(record.sourcePath, 'SKILL.md'), 'utf8'), sourceManifest);
  const release = wb.prepareSkillRelease(workspace, record.id, '1.0.0', 'Folded description boundary');
  assert.equal(new AdmZip(release.packagePath).readAsText('nested-tool/SKILL.md'), sourceManifest);
  assert.equal(wb.verifySkillRelease(release.directory).version, '1.0.0');
  const rejectedWorkspace = path.join(temp, 'rejected-workspace'); fs.mkdirSync(rejectedWorkspace);
  const tooLong = new AdmZip(); tooLong.addFile('nested-tool/SKILL.md', Buffer.from(sourceManifest.replace(description, `${description}b`)));
  assert.throws(() => wb.importSkillPackage(input(temp, tooLong), rejectedWorkspace), /at most 1024/);
  assert.equal(fs.existsSync(path.join(rejectedWorkspace, 'skills')), false);
});


test('explicit replacement keeps the selected version, removes obsolete files and preserves recovery copies', t => {
  const { temp, workspace } = fixture(t);
  const file = input(temp, archive({ 'nested-tool/old.txt': 'old' }));
  const first = wb.importSkillPackage(file, workspace);
  const original = fs.readFileSync(first.originalPackagePath);
  wb.updateSkillRepository(workspace, first.id, 'https://github.com/example/skills.git', 'main');
  const old = wb.prepareSkillRelease(workspace, first.id, '2.0.0', 'Old release');
  const oldPackage = fs.readFileSync(old.packagePath);
  input(temp, archive({ 'nested-tool/new.bin': Buffer.from([0, 255]) }));
  const second = wb.importSkillPackage(file, workspace, true);
  assert.equal(second.repository, 'https://github.com/example/skills.git');
  assert.equal(fs.existsSync(path.join(second.sourcePath, 'old.txt')), false);
  assert.deepEqual(fs.readFileSync(path.join(second.sourcePath, 'new.bin')), Buffer.from([0, 255]));
  assert.deepEqual(fs.readFileSync(first.originalPackagePath), original);
  const updated = wb.prepareSkillRelease(workspace, second.id, '2.0.0', 'Replacement', true);
  assert.equal(updated.version, '2.0.0');
  assert.equal(wb.listSkillReleases(workspace, second.id).length, 1);
  const backups = path.join(workspace, '.skill-workbench/replaced');
  const saved = fs.readdirSync(backups, { recursive: true }).map(file => path.join(backups, file));
  assert.ok(saved.some(file => file.endsWith('old.txt')));
  assert.ok(saved.some(file => file.endsWith('nested-tool-2.0.0.skill') && fs.readFileSync(file).equals(oldPackage)));
});


test('failed replacement registration restores the prior draft and catalog', t => {
  const { temp, workspace } = fixture(t);
  const file = input(temp, archive({ 'nested-tool/old.txt': 'recover me' }));
  const first = wb.importSkillPackage(file, workspace);
  input(temp, archive({ 'nested-tool/new.txt': 'replacement' }));
  const rename = fs.renameSync;
  fs.renameSync = function (from, to) {
    if (path.basename(to) === 'catalog.json') throw new Error('Catalog failure');
    return rename.apply(this, arguments);
  };
  try { assert.throws(() => wb.importSkillPackage(file, workspace, true), /Catalog failure/); }
  finally { fs.renameSync = rename; }
  assert.deepEqual(wb.listWorkbenchSkills(workspace), [first]);
  assert.equal(fs.readFileSync(path.join(first.sourcePath, 'old.txt'), 'utf8'), 'recover me');
  assert.equal(fs.existsSync(path.join(first.sourcePath, 'new.txt')), false);
});
