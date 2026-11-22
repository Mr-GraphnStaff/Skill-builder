const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const promises = require('node:fs/promises');
const path = require('node:path');
const { workingFixture } = require('./working-fixture.cjs');
const { captureSkillFiles, replaceSkillDirectory, readSkillAnalysisFiles } = require('../out/legacy-skill-files.js');
const AdmZip = require('adm-zip');
const { SECRET_PATTERNS } = require('../out/secret-patterns.js');
const { analyzeSkill } = require('../out/skill-analysis.js');

function fixture(t) {
  const base = workingFixture('legacy-skill-files'); fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'case-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), target = path.join(root, 'installed');
  fs.mkdirSync(source); fs.mkdirSync(target); fs.mkdirSync(path.join(source, 'empty'));
  fs.writeFileSync(path.join(source, 'SKILL.md'), 'new skill');
  fs.writeFileSync(path.join(target, 'SKILL.md'), 'old skill');
  return { root, source, target };
}

test('sync preserves the old installation when staging or promotion fails', async t => {
  const { root, source, target } = fixture(t);
  const rename = promises.rename;
  promises.rename = async (from, to) => {
    if (path.basename(from).startsWith('.skilljetty-sync-')) throw new Error('injected promotion failure');
    return rename(from, to);
  };
  try { await assert.rejects(replaceSkillDirectory(root, source, target), /promotion failure/); }
  finally { promises.rename = rename; }
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), 'old skill');
  const write = promises.writeFile;
  promises.writeFile = async () => { throw new Error('injected staging failure'); };
  try { await assert.rejects(replaceSkillDirectory(root, source, target), /staging failure/); }
  finally { promises.writeFile = write; }
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), 'old skill');
  await replaceSkillDirectory(root, source, target);
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), 'new skill');
  assert.ok(fs.statSync(path.join(target, 'empty')).isDirectory());
});

test('sync rejects outside destinations and overlapping paths', async t => {
  const { root, source, target } = fixture(t);
  await assert.rejects(replaceSkillDirectory(root, source, path.join(root, '..', 'outside')), /inside/);
  await assert.rejects(replaceSkillDirectory(root, source, path.join(source, 'nested')), /separate/);
});

test('sync rejects hard-linked skill files without changing the installation', async t => {
  const { root, source, target } = fixture(t);
  try { fs.linkSync(path.join(target, 'SKILL.md'), path.join(source, 'linked.md')); }
  catch (error) {
    if (['EISDIR', 'ENOTSUP', 'EPERM', 'EXDEV'].includes(error.code)) { t.skip(`This volume cannot create the hard-link fixture (${error.code}).`); return; }
    throw error;
  }
  await assert.rejects(captureSkillFiles(source), /hard links/);
  await assert.rejects(replaceSkillDirectory(root, source, target), /hard links/);
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), 'old skill');
});

test('trust and legacy checks use the same credential rules without exposing matches', () => {
  const samples = ['AKIA' + 'A'.repeat(16), 'password=12345678', 'sk-' + 'a'.repeat(25), 'ghp_' + 'a'.repeat(36), 'github_pat_' + 'a'.repeat(40), '-----BEGIN OPENSSH PRIVATE KEY-----'];
  for (const content of samples) {
    assert.ok(SECRET_PATTERNS.some(([pattern]) => pattern.test(content)));
    const result = analyzeSkill('---\nname: sample\ndescription: Sample instructions for testing.\n---\n# Sample', [{ relativePath: 'config', size: content.length, content }], 'sample');
    assert.ok(result.findings.some(f => f.category === 'security' && f.severity === 'error'));
    assert.ok(!JSON.stringify(result).includes(content));
  }
});

test('text scanning includes extensionless credentials and skips oversized and binary content', async t => {
  const { source } = fixture(t);
  fs.writeFileSync(path.join(source, '.env'), 'password=12345678');
  fs.writeFileSync(path.join(source, 'credentials'), 'ghp_' + 'a'.repeat(36));
  fs.writeFileSync(path.join(source, 'large.db'), Buffer.alloc(2 * 1024 * 1024, 'a'));
  fs.writeFileSync(path.join(source, 'binary'), Buffer.from([0xff, 0xfe]));
  const files = await readSkillAnalysisFiles(source);
  assert.equal(files.find(file => file.relativePath === '.env').content, 'password=12345678');
  assert.ok(files.find(file => file.relativePath === 'credentials').content.startsWith('ghp_'));
  assert.equal(files.find(file => file.relativePath === 'large.db').content, undefined);
  assert.equal(files.find(file => file.relativePath === 'binary').content, undefined);
});

test('export rejects oversized files before reading their contents', async t => {
  const { source } = fixture(t);
  const file = path.join(source, 'huge.db'); fs.writeFileSync(file, ''); fs.truncateSync(file, 17 * 1024 * 1024);
  await assert.rejects(captureSkillFiles(source), /export size limits/);
});

test('captured file modes survive ZIP packaging and sync', { skip: process.platform === 'win32' && 'Unix executable permissions require a Unix filesystem.' }, async t => {
  const { root, source, target } = fixture(t);
  const script = path.join(source, 'run.sh'); fs.writeFileSync(script, '#!/bin/sh\nexit 0\n'); fs.chmodSync(script, 0o755);
  fs.chmodSync(source, 0o700);
  const files = await captureSkillFiles(source), zip = new AdmZip();
  for (const file of files) zip.addFile(file.relativePath, file.bytes, '', file.mode);
  assert.equal((zip.getEntry('run.sh').attr >>> 16) & 0o777, 0o755);
  await replaceSkillDirectory(root, source, target);
  assert.equal(fs.statSync(path.join(target, 'run.sh')).mode & 0o777, 0o755);
  assert.equal(fs.statSync(target).mode & 0o777, 0o700);
});
