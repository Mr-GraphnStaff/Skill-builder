const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { sha256, inspectVsix, verifyArtifact, hasApproval, marketplaceVersions } = require('../scripts/ci/release.cjs');

function archive(manifest = {}, extra = {}) {
  const zip = new AdmZip();
  zip.addFile('extension/package.json', Buffer.from(JSON.stringify({ publisher: 'DavidFarris', name: 'skill-builder', version: '0.12.0', ...manifest })));
  zip.addFile('extension.vsixmanifest', Buffer.from('<PackageManifest><Metadata><Identity Publisher="DavidFarris" Id="skill-builder" Version="0.12.0"/></Metadata></PackageManifest>'));
  for (const [name, value] of Object.entries(extra)) zip.addFile(name, Buffer.from(value));
  return zip.toBuffer();
}
test('release verifier rejects beta identity and hidden work state', () => {
  assert.equal(inspectVsix(archive()).version, '0.12.0');
  assert.throws(() => inspectVsix(archive({ name: 'skill-builder-beta' })), /production Marketplace identity/);
  assert.throws(() => inspectVsix(archive({}, { 'extension/.skill-workbench/draft.json': '{}' })), /excluded/);
  assert.throws(() => inspectVsix(archive({}, { 'extension/azure-pipelines.yml': 'secret: nope' })), /excluded/);
  const identity = '<Identity Publisher="DavidFarris" Id="skill-builder" Version="0.12.0"/>';
  assert.throws(() => inspectVsix(archive({}, { 'extension.vsixmanifest': `${identity}<Property Id="Microsoft.VisualStudio.Code.PreRelease" Value="true"/>` })), /pre-release/);
  assert.throws(() => inspectVsix(archive({}, { 'extension.vsixmanifest': `${identity}<Property Value="true" Id="Microsoft.VisualStudio.Code.PreRelease"/>` })), /pre-release/);
  assert.throws(() => inspectVsix(archive({}, { 'extension.vsixmanifest': identity.replace('DavidFarris', 'OtherPublisher') })), /XML identity differs/);
  assert.throws(() => inspectVsix(archive({}, { 'extension.vsixmanifest': identity + identity })), /unambiguous/);
  assert.throws(() => inspectVsix(archive({}, { 'extension.vsixmanifest': '<PackageManifest/>' })), /unambiguous/);
});
test('release receipt binds package bytes and originating build', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skilljetty-release-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bytes = archive();
  const receipt = { schema: 1, identity: 'DavidFarris.skill-builder', version: '0.12.0', file: 'skill-builder-0.12.0.vsix', sha256: sha256(bytes), sourceRevision: 'a'.repeat(40), sourceBranch: 'refs/heads/main', buildId: '42' };
  fs.writeFileSync(path.join(directory, receipt.file), bytes);
  fs.writeFileSync(path.join(directory, 'release.json'), JSON.stringify(receipt));
  assert.equal(verifyArtifact(directory, { buildId: '42' }).receipt.sha256, receipt.sha256);
  assert.throws(() => verifyArtifact(directory, { buildId: '43' }), /buildId mismatch/);
  assert.throws(() => verifyArtifact(directory, { sourceRevision: 'b'.repeat(40) }), /sourceRevision mismatch/);
  fs.appendFileSync(path.join(directory, receipt.file), 'tamper');
  assert.throws(() => verifyArtifact(directory), /SHA-256/);
});
test('publication requires enabled configured approval and usable registry metadata', () => {
  const check = { type: { name: 'Approval' }, settings: { minRequiredApprovers: 1, approvers: [{ id: '11111111-2222-3333-4444-555555555555' }] } };
  assert.equal(hasApproval([check]), true);
  assert.equal(hasApproval([]), false);
  assert.equal(hasApproval([{ ...check, isDisabled: true }]), false);
  assert.equal(hasApproval([{ ...check, settings: { ...check.settings, approvers: [] } }]), false);
  assert.equal(hasApproval([{ ...check, settings: { ...check.settings, minRequiredApprovers: 0 } }]), false);
  assert.equal(hasApproval([{ ...check, settings: { ...check.settings, approvers: [{}] } }]), false);
  assert.equal(hasApproval([{ ...check, settings: { ...check.settings, approvers: [{ id: 'not-an-identity' }] } }]), false);
  assert.throws(() => marketplaceVersions({}), /unavailable/);
  assert.throws(() => marketplaceVersions({ versions: [{}] }), /invalid/);
  assert.throws(() => marketplaceVersions({ versions: [''] }), /invalid/);
  assert.throws(() => marketplaceVersions({ versions: [null] }), /invalid/);
  assert.deepEqual(marketplaceVersions({ versions: [{ version: '0.9.0' }] }), ['0.9.0']);
});


test('Marketplace verification tolerates propagation delay using reads only', async () => {
  const { waitForPublishedVersion } = require('../scripts/ci/release.cjs');
  let reads = 0, pauses = 0;
  await waitForPublishedVersion('0.9.2', async () => ({ versions: ++reads < 3 ? ['0.9.1'] : ['0.9.2', '0.9.1'] }), async () => { pauses++; });
  assert.equal(reads, 3); assert.equal(pauses, 2);
});

test('unconfirmed Marketplace propagation is bounded and never authorizes a repeat publication', async () => {
  const { waitForPublishedVersion } = require('../scripts/ci/release.cjs');
  let reads = 0;
  await assert.rejects(waitForPublishedVersion('0.9.2', async () => { reads++; return { versions: ['0.9.1'] }; }, async () => {}), /do not republish/);
  assert.equal(reads, 12);
});
