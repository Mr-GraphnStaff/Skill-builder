const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { spawnSync } = require('node:child_process');
const { sha256, inspectBetaVsix, verifyBetaArtifact } = require('../scripts/ci/beta-release.cjs');
function archive({ name = 'skill-builder-beta', xmlName = name, flag = '<Property Id="Microsoft.VisualStudio.Code.PreRelease" Value="true"/>', extra = {} } = {}) {
  const zip = new AdmZip();
  zip.addFile('extension/package.json', Buffer.from(JSON.stringify({ publisher: 'DavidFarris', name, version: '0.11.4' })));
  zip.addFile('extension.vsixmanifest', Buffer.from(`<PackageManifest><Identity Publisher="DavidFarris" Id="${xmlName}" Version="0.11.4"/>${flag}</PackageManifest>`));
  for (const [file, text] of Object.entries(extra)) zip.addFile(file, Buffer.from(text));
  return zip.toBuffer();
}
test('beta verifier requires separate matching identity and explicit pre-release flag', () => {
  assert.equal(inspectBetaVsix(archive()).name, 'skill-builder-beta');
  assert.equal(inspectBetaVsix(archive({ flag: '<Property Value="true" Id="Microsoft.VisualStudio.Code.PreRelease"/>' })).version, '0.11.4');
  assert.throws(() => inspectBetaVsix(archive({ name: 'skill-builder' })), /separate local-UAT identity/);
  assert.throws(() => inspectBetaVsix(archive({ xmlName: 'skill-builder' })), /identities disagree/);
  assert.throws(() => inspectBetaVsix(archive({ flag: '' })), /pre-release flag/);
  assert.throws(() => inspectBetaVsix(archive({ flag: '<Property Id="Microsoft.VisualStudio.Code.PreRelease" Value="false"/>' })), /pre-release flag/);
});
test('beta packages cannot include development or local work state', () => {
  for (const file of ['extension/.skilljetty-beta/draft.json', 'extension/azure-pipelines-beta.yml', 'extension/scripts/ci/release.cjs', 'extension/scripts/benchmark-startup.cjs', 'extension/docs/software-team/project-context.md', 'extension/workbench/state.json', 'extension/private.log']) {
    assert.throws(() => inspectBetaVsix(archive({ extra: { [file]: 'not for the package' } })), /development|log file/);
  }
});
test('beta receipt rejects tampering, another build, and production receipt substitution', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skilljetty-beta-release-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bytes = archive();
  const receipt = { schema: 1, purpose: 'local-beta-uat', identity: 'DavidFarris.skill-builder-beta', preRelease: true, version: '0.11.4', file: 'skill-builder-beta-0.11.4.vsix', sha256: sha256(bytes), sourceRevision: 'a'.repeat(40), sourceBranch: 'refs/heads/codex/human-workbench-beta', buildId: '52' };
  const save = () => fs.writeFileSync(path.join(directory, 'beta-release.json'), JSON.stringify(receipt));
  fs.writeFileSync(path.join(directory, receipt.file), bytes); save();
  assert.equal(verifyBetaArtifact(directory, { buildId: '52' }).receipt.identity, receipt.identity);
  assert.throws(() => verifyBetaArtifact(directory, { buildId: '53' }), /buildId mismatch/);
  assert.throws(() => verifyBetaArtifact(directory, { sourceRevision: 'b'.repeat(40) }), /sourceRevision mismatch/);
  receipt.identity = 'DavidFarris.skill-builder'; save();
  assert.throws(() => verifyBetaArtifact(directory), /Invalid beta receipt/);
  receipt.identity = 'DavidFarris.skill-builder-beta'; save();
  fs.appendFileSync(path.join(directory, receipt.file), 'tamper');
  assert.throws(() => verifyBetaArtifact(directory), /SHA-256/);
});
test('beta CLI rejects publishing and CI packaging on the production branch', () => {
  const script = path.resolve(__dirname, '../scripts/ci/beta-release.cjs');
  const publish = spawnSync(process.execPath, [script, 'publish'], { encoding: 'utf8' });
  assert.equal(publish.status, 1);
  assert.match(publish.stderr, /no publishing command/);
  const wrongBranch = spawnSync(process.execPath, [script, 'prepare'], { encoding: 'utf8', env: { ...process.env, TF_BUILD: 'True', BUILD_SOURCEBRANCH: 'refs/heads/main' } });
  assert.equal(wrongBranch.status, 1);
  assert.match(wrongBranch.stderr, /dedicated beta branch/);
});
