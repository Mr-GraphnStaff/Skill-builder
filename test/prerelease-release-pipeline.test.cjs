const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const AdmZip = require('adm-zip');
const { sha256 } = require('../scripts/ci/release.cjs');
const { inspectPrerelease, verifyArtifact, publicVersion, verifyPublicPayload } = require('../scripts/ci/prerelease-release.cjs');
const FLAG = '<Property Id="Microsoft.VisualStudio.Code.PreRelease" Value="true"/>';
function archive({ name = 'skill-builder', xmlName = name, flag = FLAG, manifest = {}, extra = {} } = {}) {
  const zip = new AdmZip();
  zip.addFile('extension/package.json', Buffer.from(JSON.stringify({ publisher: 'DavidFarris', name, version: '0.11.4', displayName: 'SkillJetty', ...manifest })));
  zip.addFile('extension.vsixmanifest', Buffer.from(`<PackageManifest><Identity Publisher="DavidFarris" Id="${xmlName}" Version="0.11.4"/>${flag}</PackageManifest>`));
  zip.addFile('extension/out/extension.js', Buffer.from('reviewed extension bytes'));
  for (const [file, value] of Object.entries(extra)) zip.addFile(file, Buffer.from(value));
  return zip.toBuffer();
}
test('public pre-release accepts established identity and rejects local beta, stable and conflicting XML', () => {
  assert.equal(inspectPrerelease(archive()).name, 'skill-builder');
  assert.equal(inspectPrerelease(archive({ flag: '<Property Value="true" Id="Microsoft.VisualStudio.Code.PreRelease"/>' })).version, '0.11.4');
  assert.throws(() => inspectPrerelease(archive({ name: 'skill-builder-beta' })), /established public identity/);
  assert.throws(() => inspectPrerelease(archive({ flag: '' })), /true pre-release flag/);
  assert.throws(() => inspectPrerelease(archive({ flag: FLAG + FLAG })), /true pre-release flag/);
  assert.throws(() => inspectPrerelease(archive({ xmlName: 'another-extension' })), /identity mismatch/);
  assert.throws(() => inspectPrerelease(archive({ extra: { 'extension/.skilljetty-prerelease/private.json': '{}' } })), /user state/);
});
test('public pre-release receipt binds exact artifact to source, branch and current build', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skilljetty-public-release-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bytes = archive();
  const receipt = { schema: 1, identity: 'DavidFarris.skill-builder', channel: 'marketplace-prerelease', preRelease: true, version: '0.11.4', file: 'skill-builder-prerelease-0.11.4.vsix', sha256: sha256(bytes), sourceRevision: 'a'.repeat(40), sourceBranch: 'refs/heads/codex/public-prerelease', buildId: '62' };
  fs.writeFileSync(path.join(directory, receipt.file), bytes);
  fs.writeFileSync(path.join(directory, 'prerelease-release.json'), JSON.stringify(receipt));
  assert.equal(verifyArtifact(directory, { buildId: '62' }).receipt.version, '0.11.4');
  assert.throws(() => verifyArtifact(directory, { buildId: '63' }), /buildId mismatch/);
  assert.throws(() => verifyArtifact(directory, { sourceRevision: 'b'.repeat(40) }), /sourceRevision mismatch/);
  assert.throws(() => verifyArtifact(directory, { sourceBranch: 'refs/heads/main' }), /sourceBranch mismatch/);
  fs.appendFileSync(path.join(directory, receipt.file), 'changed');
  assert.throws(() => verifyArtifact(directory), /SHA-256 mismatch/);
});
test('public metadata must identify exact publisher, version and pre-release channel', () => {
  const metadata = { extensionName: 'skill-builder', publisher: { publisherName: 'DavidFarris' }, versions: [{ version: '0.11.4', properties: [{ key: 'Microsoft.VisualStudio.Code.PreRelease', value: 'true' }] }] };
  assert.equal(publicVersion(metadata, '0.11.4').version, '0.11.4');
  assert.throws(() => publicVersion({ ...metadata, publisher: { publisherName: 'Other' } }, '0.11.4'), /Marketplace identity/);
  assert.throws(() => publicVersion(metadata, '0.12.0'), /missing or ambiguous/);
  assert.throws(() => publicVersion({ ...metadata, versions: [{ version: '0.11.4' }] }, '0.11.4'), /as pre-release/);
  assert.throws(() => publicVersion({ ...metadata, versions: [...metadata.versions, ...metadata.versions] }, '0.11.4'), /ambiguous/);
});
test('public download must preserve every installed file; only external signing and optional __metadata may differ', () => {
  const approved = archive();
  assert.equal(verifyPublicPayload(approved, approved).exactPackageBytesMatch, true);
  const signed = archive({ manifest: { __metadata: { installedTimestamp: 1 } }, extra: { 'signature.p7s': 'service signature metadata' } });
  assert.equal(verifyPublicPayload(approved, signed).installedPayloadMatches, true);
  assert.equal(verifyPublicPayload(approved, signed).exactPackageBytesMatch, false);
  assert.throws(() => verifyPublicPayload(approved, archive({ manifest: { displayName: 'Altered product' } })), /payload differs/);
  assert.throws(() => verifyPublicPayload(approved, archive({ extra: { 'extension/out/extension.js': 'different executable bytes' } })), /payload differs/);
  assert.throws(() => verifyPublicPayload(approved, archive({ extra: { 'extension/extra.json': '{}' } })), /payload differs/);
});
test('public publisher CLI fails before artifact or credential access on other branches', () => {
  const script = path.resolve(__dirname, '../scripts/ci/prerelease-release.cjs');
  const result = spawnSync(process.execPath, [script, 'publish'], { encoding: 'utf8', env: { ...process.env, BUILD_SOURCEBRANCH: 'refs/heads/codex/human-workbench-beta', BUILD_REASON: 'Manual' } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /manual dedicated-branch build/);
});
