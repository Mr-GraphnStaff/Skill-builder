const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const AdmZip = require('adm-zip');
const { sha256 } = require('../scripts/ci/release.cjs');
const { inspectPrerelease, verifyArtifact, publicVersion, verifyPublicPayload, ReconciliationError, reconcilePublication, validateReconcileRequest, verifyOriginalBuild } = require('../scripts/ci/prerelease-release.cjs');
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
  assert.throws(() => publicVersion(metadata, '0.12.0'), error => error.code === 'pending-public-visibility' && error.retryable);
  assert.throws(() => publicVersion({ ...metadata, versions: [{ version: '0.11.4' }] }, '0.11.4'), /as pre-release/);
  assert.throws(() => publicVersion({ ...metadata, versions: [...metadata.versions, ...metadata.versions] }, '0.11.4'), /ambiguous/);
  assert.throws(() => publicVersion({ ...metadata, versions: [{ ...metadata.versions[0], flags: 0 }] }, '0.11.4'), error => error.code === 'pending-validation' && error.retryable);
  assert.throws(() => publicVersion({ ...metadata, versions: [{ ...metadata.versions[0], validationResultMessage: 'Package failed validation' }] }, '0.11.4'), error => error.code === 'validation-rejected' && !error.retryable);
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
test('read reconciliation waits for visibility but never hides an integrity failure', async () => {
  let reads = 0; const waits = []; const logs = [];
  const result = await reconcilePublication({}, { attempts: 3, interval: 30, sleep: async delay => waits.push(delay), log: message => logs.push(JSON.parse(message)), verify: async () => {
    reads++;
    if (reads < 3) throw new ReconciliationError('Catalog validation is pending', 'pending-validation', true);
    return { installedPayloadMatches: true };
  } });
  assert.equal(result.installedPayloadMatches, true);
  assert.equal(reads, 3); assert.deepEqual(waits, [30, 30]);
  assert(logs.every(value => value.uploadRepeated === false));
  reads = 0;
  await assert.rejects(() => reconcilePublication({}, { attempts: 3, log() {}, sleep: async () => {}, verify: async () => { reads++; throw new Error('Downloaded public extension payload differs from approved VSIX'); } }), /payload differs/);
  assert.equal(reads, 1);
  await assert.rejects(() => reconcilePublication({}, { attempts: 2, log() {}, sleep: async () => {}, verify: async () => { throw new ReconciliationError('Still pending', 'pending-validation', true); } }), /still pending after 2 reads/);
});
test('read-only reconciliation binds the original artifact to its exact Azure pipeline, source and successful build stage', async () => {
  const context = { BUILD_SOURCEBRANCH: 'refs/heads/codex/public-prerelease', BUILD_REASON: 'Manual', SYSTEM_DEFINITIONID: '12', SYSTEM_TEAMPROJECTID: 'project-id' };
  assert.equal(validateReconcileRequest('905', context), '905');
  assert.throws(() => validateReconcileRequest('905;echo bad', context), /numeric/);
  assert.throws(() => validateReconcileRequest('905', { ...context, SYSTEM_DEFINITIONID: '11' }), /pipeline 12/);
  const artifact = { receipt: { sourceRevision: 'a'.repeat(40), sourceBranch: context.BUILD_SOURCEBRANCH, buildId: '905' } };
  const build = { id: 905, definition: { id: 12 }, project: { id: 'project-id' }, repository: { id: 'Mr-GraphnStaff/Skill-builder', name: null, type: 'GitHub' }, status: 'completed', sourceBranch: context.BUILD_SOURCEBRANCH, sourceVersion: 'a'.repeat(40), result: 'failed' };
  const get = async route => route.includes('/timeline?') ? { records: [{ type: 'Stage', name: 'Build', result: 'succeeded' }] } : build;
  const result = await verifyOriginalBuild(artifact, '905', get, context);
  assert.equal(result.originalBuildResult, 'failed'); // Publication verification failure is preserved, never rewritten.
  await assert.rejects(() => verifyOriginalBuild(artifact, '905', async route => route.includes('/timeline?') ? await get(route) : { ...build, definition: { id: 11 } }, context), /another pipeline/);
  await assert.rejects(() => verifyOriginalBuild(artifact, '905', async route => route.includes('/timeline?') ? await get(route) : { ...build, repository: { id: 'Other/Repository', type: 'GitHub' } }, context), /another repository/);
  await assert.rejects(() => verifyOriginalBuild(artifact, '905', async route => route.includes('/timeline?') ? await get(route) : { ...build, sourceVersion: 'b'.repeat(40) }, context), /receipt binding/);
  await assert.rejects(() => verifyOriginalBuild(artifact, '905', async route => route.includes('/timeline?') ? { records: [{ type: 'Stage', name: 'Build', result: 'failed' }] } : build, context), /build stage did not pass/);
});
