const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const core = require('../out/skill-workbench.js');
const { readSkillIdentity, compareReleaseVersions, nextReleaseVersion } = require('../out/skill-identity.js');
const { suggestReleaseVersion, summarizeSkillChanges, listLibraryReleases } = require('../out/workbench-library.js');

function manifest(version = '2.13.0', extra = '') {
  return `---\nname: human-notes\ndescription: Create evidence-backed notes. Use when the user asks to summarize supplied notes.\n${version === null ? '' : `metadata:\n  version: "${version}"\n`}${extra}---\n\n# Notes\nWrite a useful summary.\n`;
}
function fixture(t, version = '2.13.0') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'human-workbench-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'skills', 'human-notes');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'SKILL.md'), manifest(version));
  const skill = core.registerSkillFolder(root, source);
  return { root, source, skill };
}

test('identity uses declared metadata and reports its provenance without scanning incidental numbers', () => {
  const identity = readSkillIdentity(manifest() + '\nUse library 8.0.0; examples mention 99.0.0.');
  assert.equal(identity.name, 'human-notes');
  assert.equal(identity.declaredVersion, '2.13.0');
  assert.equal(identity.versionSource, 'metadata.version');
  assert.equal(identity.conflict, false);
  assert.deepEqual(identity.warnings, []);
  const noVersion = readSkillIdentity(manifest(null) + '\nCurrent dependency: 6.0.0');
  assert.equal(noVersion.declaredVersion, undefined);
});

test('legacy version declaration is recognized, agreement accepted and conflicting declarations visible', () => {
  const legacy = readSkillIdentity(manifest(null, 'version: "4.1.0"\n'));
  assert.equal(legacy.declaredVersion, '4.1.0');
  assert.equal(legacy.versionSource, 'version');
  const agreeing = readSkillIdentity(manifest('2.13.0', 'version: "2.13.0"\n'));
  assert.equal(agreeing.conflict, false);
  assert.equal(agreeing.declaredVersion, '2.13.0');
  const conflict = readSkillIdentity(manifest('2.13.0', 'version: "3.0.2"\n'));
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.declaredVersion, undefined);
  assert.equal(conflict.declarations.length, 2);
  assert.match(conflict.warnings.join(' '), /disagree/);
});

test('malformed or nonsemantic declarations remain diagnostic data', () => {
  const invalid = readSkillIdentity(manifest('latest'));
  assert.equal(invalid.declaredVersion, undefined);
  assert.match(invalid.warnings.join(' '), /not a semantic version/);
  assert.equal(readSkillIdentity('---\nname: [\n---\n').declaredVersion, undefined);
  assert.equal(readSkillIdentity('---\n- list\n---\n').warnings.length, 1);
  assert.equal(readSkillIdentity('# no frontmatter\nversion: 8.0.0').declarations.length, 0);
});

test('automatic release number adopts package declaration, then preserves saved identities', t => {
  const { skill, source } = fixture(t);
  assert.equal(suggestReleaseVersion(skill, []), '2.13.0');
  assert.equal(suggestReleaseVersion(skill, ['2.13.0']), '2.13.1');
  assert.equal(suggestReleaseVersion(skill, ['2.13.1', '2.13.0']), '2.13.2');
  assert.equal(suggestReleaseVersion(skill, ['2.13.0+other-build']), '2.13.1');
  fs.writeFileSync(path.join(source, 'SKILL.md'), manifest('4.0.0'));
  assert.equal(suggestReleaseVersion(skill, ['2.13.0']), '4.0.0');
  fs.writeFileSync(path.join(source, 'SKILL.md'), manifest(null));
  assert.equal(suggestReleaseVersion(skill, []), '1.0.0');
  assert.equal(suggestReleaseVersion(skill, ['0.4.2']), '0.4.3');
  fs.writeFileSync(path.join(source, 'SKILL.md'), manifest('2.13.0', 'version: "3.0.2"\n'));
  assert.equal(readSkillIdentity(fs.readFileSync(path.join(source, 'SKILL.md'), 'utf8')).conflict, true);
  assert.equal(suggestReleaseVersion(skill, []), '1.0.0');
});

test('SemVer precedence and allocation preserve prerelease intent and integer precision', t => {
  const { skill, source } = fixture(t, '2.0.0-rc.9');
  assert.equal(suggestReleaseVersion(skill, ['2.0.0-rc.9', '2.0.0-rc.8']), '2.0.0-rc.10');
  assert.equal(nextReleaseVersion('2.0.0-beta'), '2.0.0-beta.1');
  assert.equal(compareReleaseVersions('2.0.0', '2.0.0-rc.999'), 1);
  assert.equal(compareReleaseVersions('2.0.0-rc.10', '2.0.0-rc.9'), 1);
  assert.equal(compareReleaseVersions('2.0.0+source', '2.0.0+other'), 0);
  assert.equal(nextReleaseVersion('99999999999999999.2.9007199254740993+build'), '99999999999999999.2.9007199254740994');
  fs.writeFileSync(path.join(source, 'SKILL.md'), manifest(null));
  assert.equal(suggestReleaseVersion(skill, ['2.0.0-rc.9']), '2.0.0-rc.10');
  assert.throws(() => compareReleaseVersions('latest', '1.0.0'), /invalid/);
});

test('human change summary reports actual added, modified, removed and unchanged file bytes', t => {
  const { root, source, skill } = fixture(t);
  fs.mkdirSync(path.join(source, 'references'));
  fs.writeFileSync(path.join(source, 'references', 'remove.md'), 'old');
  fs.writeFileSync(path.join(source, 'references', 'change.md'), 'old');
  fs.writeFileSync(path.join(source, 'references', 'keep.md'), 'same');
  const first = summarizeSkillChanges(root, skill);
  assert.equal(first.baselineVersion, undefined);
  assert.equal(first.added.length, 4);
  core.prepareSkillRelease(root, skill.id, '2.13.0', 'Initial notes.');
  assert.equal(summarizeSkillChanges(root, skill).hasChanges, false);
  fs.unlinkSync(path.join(source, 'references', 'remove.md'));
  fs.writeFileSync(path.join(source, 'references', 'change.md'), 'new');
  fs.writeFileSync(path.join(source, 'references', 'add.bin'), Buffer.from([0, 255, 11]));
  const summary = summarizeSkillChanges(root, skill);
  assert.equal(summary.baselineVersion, '2.13.0');
  assert.deepEqual(summary.added, ['references/add.bin']);
  assert.deepEqual(summary.changed, ['references/change.md']);
  assert.deepEqual(summary.removed, ['references/remove.md']);
  assert.equal(summary.unchanged, 2);
  assert.equal(summary.hasChanges, true);
  assert.match(summary.note, /not a claim about behavior/);
});

test('change summary selects latest release by SemVer and refuses unverified baselines', t => {
  const { root, source, skill } = fixture(t, '2.0.0-rc.9');
  core.prepareSkillRelease(root, skill.id, '2.0.0', 'Stable saved release.');
  core.prepareSkillRelease(root, skill.id, '2.0.0-rc.9', 'Older prerelease saved later.');
  assert.equal(listLibraryReleases(root)[0].version, '2.0.0');
  assert.equal(summarizeSkillChanges(root, skill).baselineVersion, '2.0.0');
  fs.writeFileSync(path.join(root, 'releases', 'human-notes', '2.0.0', 'CHANGELOG.md'), 'changed behind our back');
  assert.throws(() => summarizeSkillChanges(root, skill), /changelog|hash|match/i);
  fs.writeFileSync(path.join(source, 'SKILL.md'), 'invalid');
  assert.throws(() => summarizeSkillChanges(root, skill), /frontmatter/i);
});

test('change summaries cannot read a source outside the selected workspace', t => {
  const { root, skill } = fixture(t);
  assert.throws(() => summarizeSkillChanges(root, { ...skill, sourcePath: path.resolve(root, '..') }), /leaves this workspace/);
});
