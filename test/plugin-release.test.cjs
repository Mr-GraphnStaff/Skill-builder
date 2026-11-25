const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { createHash } = require('node:crypto');
const { workingFixture } = require('./working-fixture.cjs');
const { registerSkillFolder, prepareSkillRelease, verifySkillRelease } = require('../out/skill-workbench.js');
const { preparePluginRelease, preparePluginFolderRelease, importPluginFolder, exportPluginFolder, verifyPluginRelease, verifyExportRelease, exportRelativePath, listPluginReleaseMetadata, assessGeminiCompatibility, prepareGeminiRelease, assessPluginDirectoryReadiness } = require('../out/plugin-release.js');

function fixture() {
  const base = workingFixture('plugin-release'); fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'case-'));
  const add = (name, files = {}) => {
    const source = path.join(root, 'input', name); fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'SKILL.md'), `---\r\nname: ${name}\r\ndescription: A useful ${name} skill.\r\n---\r\n\r\n# Instructions\r\n`);
    for (const [relative, bytes] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(source, relative)), { recursive: true }); fs.writeFileSync(path.join(source, relative), bytes); }
    const skill = registerSkillFolder(root, source); return prepareSkillRelease(root, skill.id, '1.0.0', 'First skill release.');
  };
  return { root, add, clean: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const options = (members, extra = {}) => ({ name: 'team-bundle', description: 'Team workflows', version: '2.1.0', author: 'DAF-TECH', license: 'MIT', members: members.map(release => ({ directory: release.directory })), changelog: 'Bundle existing skills.', ...extra });

test('imports third-party .plugin and ZIP archives with exact original bytes and complete editable components', () => {
  const { importPluginArchive } = require('../out/plugin-release.js');
  const f = fixture();
  try {
    const zip = new AdmZip();
    const manifest = Buffer.from('{ "name": "anthropic-tools", "version": "1.0.0", "author": { "name": "Anthropic" }, "custom": true }\r\n');
    zip.addFile('.claude-plugin/plugin.json', manifest);
    zip.addFile('hooks/hooks.json', Buffer.from('{"hooks":{}}'));
    zip.addFile('commands/status.md', Buffer.from('# Status\r\n'));
    zip.addFile('assets/input.bin', Buffer.from([0, 255, 31]));
    const bytes = zip.toBuffer();
    for (const extension of ['plugin', 'zip']) {
      const file = path.join(f.root, `input.${extension}`); fs.writeFileSync(file, bytes);
      const draft = importPluginArchive(f.root, file);
      assert.equal(draft.name, 'anthropic-tools');
      assert.deepEqual(fs.readFileSync(path.join(draft.directory, '.claude-plugin/plugin.json')), manifest);
      const exported = exportPluginFolder(f.root, draft.directory, 'plugin');
      const reopened = new AdmZip(fs.readFileSync(exported.packagePath));
      for (const entry of zip.getEntries()) assert.deepEqual(reopened.readFile(entry.entryName), entry.getData());
      assert.equal(preparePluginFolderRelease(f.root, draft.directory).manifest.plugin.name, 'anthropic-tools');
    }
    const originals = fs.readdirSync(path.join(f.root, 'plugin-imports')).map(id => path.join(f.root, 'plugin-imports', id));
    assert.equal(originals.length, 2);
    for (const directory of originals) {
      const original = fs.readdirSync(directory).find(name => name.startsWith('original.'));
      assert.deepEqual(fs.readFileSync(path.join(directory, original)), bytes);
    }
    for (const bad of ['.git/config', '.env.local', 'CON.txt']) {
      const unsafe = new AdmZip(bytes); unsafe.addFile(bad, Buffer.from('Do not extract'));
      const file = path.join(f.root, 'unsafe.plugin'); fs.writeFileSync(file, unsafe.toBuffer());
      assert.throws(() => importPluginArchive(f.root, file), /private|Unsafe|manifest/i);
    }
  } finally { f.clean(); }
});

test('explicit plugin replacement preserves the prior package and its publication and review receipts', () => {
  const f = fixture();
  try {
    const skill = f.add('alpha');
    const first = preparePluginRelease(f.root, options([skill]));
    const packed = fs.readFileSync(first.packagePath);
    const paths = ['publications', 'pull-requests'].map(kind => path.join(f.root, '.skill-workbench', kind, 'plugins', first.skillName, `${first.version}.json`));
    for (const file of paths) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'prior receipt'); }
    assert.throws(() => preparePluginRelease(f.root, options([skill], { changelog: 'Updated' })), /already exists/);
    const next = preparePluginRelease(f.root, options([skill], { changelog: 'Updated', replaceExisting: true }));
    assert.equal(next.version, first.version);
    assert.equal(fs.readFileSync(path.join(next.directory, 'CHANGELOG.md'), 'utf8'), 'Updated\n');
    for (const file of paths) assert.equal(fs.existsSync(file), false, 'old receipts cannot mark replacement bytes as uploaded');
    const backups = path.join(f.root, '.skill-workbench', 'replaced');
    const backup = path.join(backups, fs.readdirSync(backups)[0], 'plugins', first.skillName);
    assert.deepEqual(fs.readFileSync(path.join(backup, first.version, path.basename(first.packagePath))), packed);
    assert.equal(fs.readFileSync(path.join(backup, `${first.version}-publications.json`), 'utf8'), 'prior receipt');
    assert.equal(fs.readFileSync(path.join(backup, `${first.version}-pull-requests.json`), 'utf8'), 'prior receipt');
    verifyPluginRelease(path.join(backup, first.version));
    const currentPackage = fs.readFileSync(next.packagePath);
    assert.throws(() => preparePluginRelease(f.root, options([skill], { replaceExisting: true, icon: './skills/alpha/assets/missing.png' })), /icon must refer/);
    assert.deepEqual(fs.readFileSync(next.packagePath), currentPackage, 'failed replacement restores the previous verified package');
    verifyPluginRelease(next.directory);
  } finally { f.clean(); }
});

test('selected plugin folder keeps manifest bytes and non-skill components in the draft and both archives', () => {
  const f = fixture();
  try {
    const folder = path.join(f.root, 'local-plugin');
    const files = {
      '.claude-plugin/plugin.json': Buffer.from('{ "name": "local-tools", "version": "1.2.0", "agents": ["./agents/review.md"] }\r\n'),
      'agents/review.md': Buffer.from('# Review agent\r\n'),
      'assets/image.bin': Buffer.from([0, 255, 18, 27]),
      '.mcp.json': Buffer.from('{ "mcpServers": {} }')
    };
    for (const [relative, bytes] of Object.entries({ ...files, '.git/config': 'Private repository metadata' })) {
      fs.mkdirSync(path.dirname(path.join(folder, relative)), { recursive: true });
      fs.writeFileSync(path.join(folder, relative), bytes);
    }
    const draft = importPluginFolder(f.root, folder);
    assert.equal(importPluginFolder(f.root, draft.directory).directory, draft.directory);
    const release = preparePluginFolderRelease(f.root, folder);
    assert.equal(verifyPluginRelease(release.directory).manifest.format, 2);
    assert.equal(preparePluginFolderRelease(f.root, folder).directory, release.directory);
    for (const extension of ['zip', 'plugin']) {
      const exported = exportPluginFolder(f.root, folder, extension);
      assert.equal(path.basename(exported.packagePath), `local-tools.${extension}`);
      const zip = new AdmZip(fs.readFileSync(exported.packagePath));
      assert.equal(zip.getEntry('.git/config'), null);
      for (const [relative, bytes] of Object.entries(files)) {
        assert.deepEqual(zip.readFile(relative), bytes);
        assert.deepEqual(fs.readFileSync(path.join(draft.directory, relative)), bytes);
        assert.deepEqual(fs.readFileSync(path.join(release.directory, 'source', relative)), bytes);
      }
    }
    fs.appendFileSync(path.join(draft.directory, 'agents/review.md'), 'Edited draft');
    assert.deepEqual(fs.readFileSync(path.join(folder, 'agents/review.md')), files['agents/review.md']);
    assert.throws(() => preparePluginFolderRelease(f.root, draft.directory), /already exists.*different content/);
    fs.writeFileSync(path.join(folder, '.env.local'), 'PRIVATE=example');
    assert.throws(() => exportPluginFolder(f.root, folder, 'zip'), /Remove private.*environment data/);
  } finally { f.clean(); }
});

test('plugin bundles preserve each snapshot byte-for-byte, independent versions and root ZIP layout', () => {
  const f = fixture();
  try {
    const one = f.add('alpha', { 'references/MixedCase.md': Buffer.from('Exact\r\nbytes\r\n'), 'assets/logo.png': Buffer.from([0, 255, 30, 0]) });
    const two = f.add('bravo', { 'scripts/run.py': 'print("example")\n' });
    const result = preparePluginRelease(f.root, options([two, one]));
    assert.equal(result.version, '2.1.0'); assert.equal(result.manifest.kind, 'plugin');
    assert.deepEqual(result.manifest.plugin.author, { name: 'DAF-TECH' });
    assert.deepEqual(result.manifest.members.map(m => [m.name, m.version]), [['alpha', '1.0.0'], ['bravo', '1.0.0']]);
    const zip = new AdmZip(result.packagePath);
    assert.ok(zip.getEntry('.claude-plugin/plugin.json')); assert.ok(zip.getEntry('skills/alpha/SKILL.md'));
    assert.ok(zip.getEntry('README.md')); assert.match(zip.readAsText('README.md'), /alpha, version 1\.0\.0/);
    for (const member of [one, two]) for (const file of member.manifest.files.filter(file => !file.path.endsWith('/'))) {
      const original = fs.readFileSync(path.join(member.directory, 'source', member.skillName, file.path));
      assert.deepEqual(zip.readFile(`skills/${member.skillName}/${file.path}`), original);
      assert.deepEqual(fs.readFileSync(path.join(result.directory, 'source', 'skills', member.skillName, file.path)), original);
    }
    assert.equal(verifyPluginRelease(result.directory).manifest.packageSha256, result.manifest.packageSha256);
    assert.equal(exportRelativePath(result), 'Plugins/team-bundle');
    assert.equal(verifyExportRelease(one.directory).packagePath, one.packagePath);
    assert.equal(listPluginReleaseMetadata(f.root).length, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.directory, 'marketplace-entry.json'))).source, './Plugins/team-bundle/source');
    assert.equal(preparePluginRelease(f.root, options([one, two])).directory, result.directory, 'retry reuses identical prepared output');
    assert.throws(() => preparePluginRelease(f.root, options([one], { changelog: 'Different content' })), /already exists/);
    assert.equal(verifySkillRelease(one.directory).manifest.packageSha256, one.manifest.packageSha256, 'portable artifact untouched');
  } finally { f.clean(); }
});

test('directory readiness reports exact oversized database paths while preserving a valid private plugin', () => {
  const f = fixture();
  try {
    const database = Buffer.alloc(5 * 1024 * 1024);
    const one = f.add('alpha', { 'data/hub_users.db': database, 'references/policy.txt': Buffer.alloc(256 * 1024, 'a'), 'assets/.DS_Store': 'OS metadata', 'assets/favicon.ico': Buffer.from([0, 0, 1, 0]) });
    const result = preparePluginRelease(f.root, options([one], { name: 'plugin', license: undefined }));
    const before = fs.readFileSync(result.packagePath), report = assessPluginDirectoryReadiness(result.directory);
    assert.equal(report.portalRequired, true);
    const find = code => report.checks.filter(check => check.code === code);
    assert.equal(find('readme')[0].result, 'pass'); assert.equal(find('license')[0].result, 'block');
    assert.equal(find('directory-name')[0].result, 'block'); assert.equal(find('directory-icon')[0].result, 'warning');
    const size = find('file-size').find(check => check.paths?.includes('skills/alpha/data/hub_users.db'));
    assert.equal(size.result, 'block'); assert.match(size.message, /5\.00 MiB \(5242880 bytes\)/);
    assert.ok(find('review-size').some(check => check.paths?.includes('skills/alpha/references/policy.txt') && check.result === 'hold'));
    assert.equal(find('os-junk')[0].result, 'block'); assert.equal(find('binary-content')[0].result, 'hold');
    assert.equal(find('repository-context')[0].result, 'unknown'); assert.match(find('repository-context')[0].message, /not performed.*50 MiB.*256 MiB.*10,000/);
    assert.equal(find('security-and-policy')[0].result, 'unknown'); assert.match(find('security-and-policy')[0].message, /not implemented/);
    assert.deepEqual(fs.readFileSync(result.packagePath), before, 'advice never changes the export');
    assert.deepEqual(new AdmZip(result.packagePath).readFile('skills/alpha/data/hub_users.db'), database, 'database bytes preserved');
    assert.equal(verifyPluginRelease(result.directory).skillName, 'plugin', 'directory restrictions do not reject private export');
  } finally { f.clean(); }
});

test('directory metadata uses bundled image paths and credential-free HTTPS URLs', () => {
  const f = fixture();
  try {
    const one = f.add('alpha', { 'assets/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>' });
    const extra = { icon: './skills/alpha/assets/logo.svg', privacyPolicyUrl: 'https://example.invalid/privacy', documentationUrl: 'https://example.invalid/docs', supportUrl: 'https://example.invalid/support', termsOfServiceUrl: 'https://example.invalid/terms' };
    const result = preparePluginRelease(f.root, options([one], extra));
    for (const [key, value] of Object.entries(extra)) assert.equal(result.manifest.plugin[key], value);
    assert.equal(assessPluginDirectoryReadiness(result.directory).checks.find(check => check.code === 'directory-icon').result, 'pass');
    for (const icon of ['https://example.invalid/icon.png', '../outside.png', './missing.png', './skills/alpha/SKILL.md']) assert.throws(() => preparePluginRelease(f.root, options([one], { ...extra, version: '2.2.0', icon })), /icon/);
    assert.throws(() => preparePluginRelease(f.root, options([one], { ...extra, supportUrl: 'https://user:secret@example.invalid/help' })), /credentials/);
  } finally { f.clean(); }
});

test('directory README count excludes fenced code words', () => {
  const f = fixture();
  try {
    const result = preparePluginRelease(f.root, options([f.add('alpha')]));
    const bytes = Buffer.from(`# Readme\n\n~~~text\n${'example '.repeat(60)}\n~~~\n\nShort prose.\n`);
    fs.writeFileSync(path.join(result.directory, 'source', 'README.md'), bytes);
    const zip = new AdmZip(result.packagePath); zip.updateFile('README.md', bytes); const packed = zip.toBuffer(); fs.writeFileSync(result.packagePath, packed);
    const receipt = JSON.parse(fs.readFileSync(path.join(result.directory, 'release.json')));
    const digest = receipt.files.find(file => file.path === 'README.md'); digest.size = bytes.length; digest.sha256 = createHash('sha256').update(bytes).digest('hex');
    receipt.packageSha256 = createHash('sha256').update(packed).digest('hex'); fs.writeFileSync(path.join(result.directory, 'release.json'), JSON.stringify(receipt));
    assert.equal(assessPluginDirectoryReadiness(result.directory).checks.find(check => check.code === 'readme').result, 'block');
  } finally { f.clean(); }
});

test('plugin validates member snapshots, names, duplicate identities and traversal before writing', () => {
  const f = fixture();
  try {
    const one = f.add('alpha');
    assert.throws(() => preparePluginRelease(f.root, options([one, one])), /duplicate/);
    for (const name of ['../outside', 'UpperCase', 'con', 'claude-official', 'official-claude-tools', 'official-anthropic-tools', 'a/b']) assert.throws(() => preparePluginRelease(f.root, options([one], { name })), /name|kebab|Anthropic/);
    assert.throws(() => preparePluginRelease(f.root, options([one], { version: '../outside' })), /version/);
    assert.throws(() => preparePluginRelease(f.root, options([one], { repository: 'https://user:secret@github.com/org/repo' })), /credentials/);
    fs.appendFileSync(path.join(one.directory, 'source', 'alpha', 'SKILL.md'), '\nChanged after release\n');
    assert.throws(() => preparePluginRelease(f.root, options([one])), /inventory/);
    assert.equal(fs.existsSync(path.join(f.root, 'plugin-releases')), false);
  } finally { f.clean(); }
});

test('plugin verification catches source, archive and handoff tampering', () => {
  const f = fixture();
  try {
    const one = f.add('alpha'), result = preparePluginRelease(f.root, options([one]));
    const source = path.join(result.directory, 'source', 'skills', 'alpha', 'SKILL.md'), original = fs.readFileSync(source);
    fs.writeFileSync(source, 'tampered'); assert.throws(() => verifyPluginRelease(result.directory), /inventory/); fs.writeFileSync(source, original);
    const archive = fs.readFileSync(result.packagePath); fs.writeFileSync(result.packagePath, 'tampered'); assert.throws(() => verifyPluginRelease(result.directory), /hash/); fs.writeFileSync(result.packagePath, archive);
    fs.appendFileSync(path.join(result.directory, 'marketplace-entry.json'), 'tampered'); assert.throws(() => verifyPluginRelease(result.directory), /handoff/);
  } finally { f.clean(); }
});

test('plugin staging rejects linked ancestors and linked member content', (t) => {
  const f = fixture();
  try {
    const one = f.add('alpha'), alias = path.join(one.directory, 'source', 'alpha', 'alias.md');
    try {
      fs.linkSync(path.join(one.directory, 'source', 'alpha', 'SKILL.md'), alias);
      assert.throws(() => preparePluginRelease(f.root, options([one])), /hard links|inventory/);
      fs.unlinkSync(alias);
    } catch (error) {
      if (!['EPERM', 'EACCES', 'EISDIR', 'ENOTSUP', 'EXDEV'].includes(error.code)) throw error;
      t.diagnostic(`Physical hard-link fixture unavailable on this filesystem: ${error.code}`);
    }
    const target = path.join(f.root, 'other'); fs.mkdirSync(target);
    try { fs.symlinkSync(target, path.join(f.root, 'plugin-releases'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) { if (!['EPERM', 'EACCES', 'EISDIR', 'ENOTSUP'].includes(error.code)) throw error; t.skip(`Physical junction fixture unavailable: ${error.code}`); return; }
    assert.throws(() => preparePluginRelease(f.root, options([one])), /links|junctions/);
  } finally { f.clean(); }
});

test('plugin rejects ZIP symlink metadata even if the local receipt package hash is updated', () => {
  const f = fixture();
  try {
    const result = preparePluginRelease(f.root, options([f.add('alpha')]));
    const zip = new AdmZip(result.packagePath), entry = zip.getEntry('skills/alpha/SKILL.md');
    entry.attr = (0xa000 << 16) >>> 0;
    const bytes = zip.toBuffer(); fs.writeFileSync(result.packagePath, bytes);
    const receipt = JSON.parse(fs.readFileSync(path.join(result.directory, 'release.json')));
    receipt.packageSha256 = createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(path.join(result.directory, 'release.json'), JSON.stringify(receipt));
    assert.throws(() => verifyPluginRelease(result.directory), /links or special/);
  } finally { f.clean(); }
});

test('Gemini export uses a root SKILL.md and preserves bytes without mutating the portable release', () => {
  const f = fixture();
  try {
    const one = f.add('alpha', { 'references/guide.md': 'Guide\r\n', 'scripts/run.py': 'print("offline")\n' });
    const portableBytes = fs.readFileSync(one.packagePath);
    const report = assessGeminiCompatibility(one.directory); assert.equal(report.valid, true); assert.match(report.warnings.join(' '), /external website/);
    const result = prepareGeminiRelease(f.root, one.directory), zip = new AdmZip(result.packagePath);
    assert.ok(zip.getEntry('SKILL.md')); assert.equal(zip.getEntry('alpha/SKILL.md'), null);
    assert.deepEqual(zip.readFile('references/guide.md'), Buffer.from('Guide\r\n'));
    assert.deepEqual(fs.readFileSync(one.packagePath), portableBytes);
    assert.equal(result.sha256, createHash('sha256').update(fs.readFileSync(result.packagePath)).digest('hex'));
    assert.equal(prepareGeminiRelease(f.root, one.directory).sha256, result.sha256);
  } finally { f.clean(); }
});

test('Gemini reports unsupported files and refuses export without dropping them', () => {
  const f = fixture();
  try {
    const one = f.add('alpha', { 'scripts/example.ts': 'export const a = 1;\n', 'assets/nested.zip': Buffer.from([1, 2]) });
    const report = assessGeminiCompatibility(one.directory); assert.equal(report.valid, false); assert.equal(report.errors.length, 2);
    assert.throws(() => prepareGeminiRelease(f.root, one.directory), /Unsupported.*No file was removed/s);
    assert.equal(fs.existsSync(path.join(f.root, 'gemini-releases')), false);
    assert.equal(verifySkillRelease(one.directory).manifest.packageSha256, one.manifest.packageSha256);
  } finally { f.clean(); }
});
