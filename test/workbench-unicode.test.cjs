const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const wb = require('../out/skill-workbench.js');

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-unicode-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const workspace = path.join(temp, '작업 공간_日本語');
  fs.mkdirSync(workspace);
  return { temp, workspace };
}

test('Unicode workspace, nested paths, Korean/Japanese YAML and binary assets survive import, edit and repackaging', t => {
  const { temp, workspace } = fixture(t);
  const manifest = Buffer.from('---\nname: language-tool\ndescription: >-\n  한국어와日本語の資料を整理します。\n  Use when organizing multilingual reference material.\nmetadata:\n  display_name: "다국어 도구 / 多言語ツール"\n  reviewers:\n    - "검토 담당자"\n    - "日本語の担当者"\n---\n# 다국어 도구 / 多言語ツール\n\nRead `references/한국어/사용법.md` and `references/日本語/説明.md`.\n', 'utf8');
  const korean = Buffer.from('# 사용법\r\n\r\n원문과 줄바꿈을 그대로 보존합니다.\r\n', 'utf8');
  const japanese = Buffer.from('# 説明\n\n原文と改行をそのまま保持します。\n', 'utf8');
  const binary = Buffer.from([0, 255, 16, 128, 13, 10, 0, 254]);
  const originalEntries = new Map([
    ['SKILL.md', manifest],
    ['references/한국어/사용법.md', korean],
    ['references/日本語/説明.md', japanese],
    ['assets/画像/견본-📦.bin', binary]
  ]);
  const zip = new AdmZip();
  for (const [name, bytes] of originalEntries) zip.addFile(`language-tool/${name}`, bytes);
  const packagePath = path.join(temp, '원본_日本語.skill');
  zip.writeZip(packagePath);
  const original = fs.readFileSync(packagePath);
  const record = wb.importSkillPackage(packagePath, workspace);
  assert.deepEqual(fs.readFileSync(record.originalPackagePath), original);
  for (const [name, bytes] of originalEntries) {
    assert.deepEqual(fs.readFileSync(path.join(record.sourcePath, name)), bytes, name);
  }
  const edited = Buffer.concat([korean, Buffer.from('\r\n추가된 수정 내용.\r\n', 'utf8')]);
  fs.writeFileSync(path.join(record.sourcePath, 'references/한국어/사용법.md'), edited);
  const extraPath = 'assets/画像/추가-資料.json';
  const extra = Buffer.from('{"제목":"追加資料","설명":"수정 후 보존"}\n', 'utf8');
  fs.writeFileSync(path.join(record.sourcePath, extraPath), extra);
  const report = wb.validateWorkbenchSkill(record);
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  const release = wb.prepareSkillRelease(workspace, record.id, '1.0.0', '# 1.0.0\n\n한국어 자료 수정 및日本語資料の追加。');
  const repacked = new AdmZip(release.packagePath);
  for (const [name, bytes] of originalEntries) {
    const expected = name === 'references/한국어/사용법.md' ? edited : bytes;
    assert.deepEqual(repacked.readFile(`language-tool/${name}`), expected, name);
    assert.deepEqual(fs.readFileSync(path.join(release.directory, 'source/language-tool', name)), expected, name);
  }
  assert.deepEqual(repacked.readFile(`language-tool/${extraPath}`), extra);
  assert.deepEqual(fs.readFileSync(path.join(release.directory, 'original.skill')), original);
  assert.match(fs.readFileSync(path.join(release.directory, 'CHANGELOG.md'), 'utf8'), /한국어 자료 수정 및日本語資料の追加/);
});

test('distinct NFC and NFD filenames are preserved without silent Unicode normalization', t => {
  const { temp, workspace } = fixture(t);
  const manifest = '---\nname: unicode-paths\ndescription: Preserve source text. Use when checking Unicode paths and payloads.\n---\n# Unicode paths\n';
  const nfc = 'references/café.md';
  const nfd = 'references/cafe\u0301.md';
  assert.notEqual(nfc, nfd);
  const zip = new AdmZip();
  zip.addFile('unicode-paths/SKILL.md', Buffer.from(manifest));
  zip.addFile(`unicode-paths/${nfc}`, Buffer.from('NFC 원문'));
  zip.addFile(`unicode-paths/${nfd}`, Buffer.from('NFD 原文'));
  const input = path.join(temp, 'normalization.skill'); zip.writeZip(input);
  const record = wb.importSkillPackage(input, workspace);
  const names = fs.readdirSync(path.join(record.sourcePath, 'references'));
  assert.equal(names.length, 2);
  assert.ok(names.includes('café.md'));
  assert.ok(names.includes('cafe\u0301.md'));
  const release = wb.prepareSkillRelease(workspace, record.id, '1.0.0', 'Preserve original filename encodings.');
  const packed = new AdmZip(release.packagePath);
  assert.equal(packed.readAsText(`unicode-paths/${nfc}`), 'NFC 원문');
  assert.equal(packed.readAsText(`unicode-paths/${nfd}`), 'NFD 原文');
});
