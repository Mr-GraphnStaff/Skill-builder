'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const AdmZip = require('adm-zip');

const ID = 'DavidFarris.skill-builder';
const ENVIRONMENT = 'skilljetty-marketplace-production';
const root = path.resolve(__dirname, '../..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function assert(value, message) { if (!value) throw new Error(message); }
function required(name) {
  const value = process.env[name];
  assert(value && !/^\$\(.+\)$/.test(value), `Missing ${name}`);
  return value;
}
function manifestIdentity(manifest) {
  assert(`${manifest.publisher}.${manifest.name}` === ID, 'Only the production Marketplace identity may be released');
  assert(/^\d+\.\d+\.\d+$/.test(manifest.version), 'Release version must be numeric major.minor.patch');
  return manifest;
}
function runVsce(args, capture = false) {
  const executable = path.join(path.dirname(require.resolve('@vscode/vsce/package.json')), 'vsce');
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: root, shell: false, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', timeout: 240000, maxBuffer: 8 * 1024 * 1024
  });
  assert(!result.error && result.status === 0, `vsce ${args[0]} failed`);
  return result.stdout;
}
function attributes(text) {
  const values = {};
  for (const match of text.matchAll(/([\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    assert(!Object.hasOwn(values, match[1]), 'Duplicate VSIX identity/property attribute');
    values[match[1]] = match[2] ?? match[3];
  }
  return values;
}
function inspectVsix(bytes) {
  const zip = new AdmZip(bytes);
  const entry = zip.getEntry('extension/package.json');
  assert(entry, 'VSIX is missing its extension manifest');
  const manifest = manifestIdentity(JSON.parse(entry.getData().toString('utf8')));
  const xml = zip.readAsText('extension.vsixmanifest');
  assert(xml, 'VSIX XML manifest is missing');
  const identities = [...xml.matchAll(/<Identity\b([^>]*?)\/?\s*>/g)];
  assert(identities.length === 1, 'VSIX must contain one unambiguous XML identity');
  const identity = attributes(identities[0][1]);
  assert(identity.Publisher === manifest.publisher && identity.Id === manifest.name && identity.Version === manifest.version, 'VSIX XML identity differs from production package manifest');
  for (const property of xml.matchAll(/<Property\b([^>]*?)\/?\s*>/g)) {
    const value = attributes(property[1]);
    assert(!(value.Id === 'Microsoft.VisualStudio.Code.PreRelease' && value.Value?.toLowerCase() === 'true'), 'Local beta/pre-release VSIX cannot use the stable publisher');
  }
  for (const item of zip.getEntries()) {
    assert(!/^extension\/(?:\.git\/|\.vscode\/|\.skilljetty-beta\/|\.skill-workbench\/|workbench\/|releases\/|AGENTS\.md$|azure-pipelines\.yml$|scripts\/ci\/|docs\/delivery\.md$)/i.test(item.entryName), 'VSIX contains excluded development or user state');
  }
  return manifest;
}
function verifyArtifact(directory, expected = {}) {
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'release.json'), 'utf8'));
  assert(receipt.schema === 1 && receipt.identity === ID, 'Invalid release receipt');
  assert(/^skill-builder-\d+\.\d+\.\d+\.vsix$/.test(receipt.file), 'Invalid artifact filename');
  assert(/^[a-f0-9]{40}$/.test(receipt.sourceRevision), 'Missing source revision');
  const bytes = fs.readFileSync(path.join(directory, receipt.file));
  assert(sha256(bytes) === receipt.sha256, 'VSIX SHA-256 differs from the build receipt');
  const manifest = inspectVsix(bytes);
  assert(manifest.version === receipt.version, 'VSIX version differs from receipt');
  for (const key of ['sourceRevision', 'buildId', 'sourceBranch']) {
    if (expected[key] !== undefined) assert(receipt[key] === expected[key], `Release ${key} mismatch`);
  }
  return { receipt, manifest, packagePath: path.join(directory, receipt.file) };
}
async function azureGet(relative) {
  const collection = required('SYSTEM_COLLECTIONURI');
  assert(new URL(collection).hostname.toLowerCase() === 'dev.azure.com', 'Unexpected Azure collection host');
  const project = encodeURIComponent(required('SYSTEM_TEAMPROJECTID'));
  const response = await fetch(`${collection.replace(/\/$/, '')}/${project}/_apis/${relative}`, {
    headers: { Authorization: `Bearer ${required('SYSTEM_ACCESSTOKEN')}` }, signal: AbortSignal.timeout(30000)
  });
  assert(response.ok, `Cannot verify Azure release gate (${response.status})`);
  return response.json();
}
function hasApproval(checks) {
  return checks.some(check => check.type?.name === 'Approval' && check.isDisabled !== true &&
    check.settings?.minRequiredApprovers === 1 && Array.isArray(check.settings?.approvers) && check.settings.approvers.length > 0 &&
    check.settings.approvers.every(approver => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(approver?.id || '')));
}
async function verifyApprovalGate() {
  const environments = await azureGet(`distributedtask/environments?name=${encodeURIComponent(ENVIRONMENT)}&api-version=7.1-preview.1`);
  const matching = environments.value.filter(environment => environment.name === ENVIRONMENT);
  assert(matching.length === 1, 'Protected production environment is missing or ambiguous');
  const checks = await azureGet(`pipelines/checks/configurations?resourceType=environment&resourceId=${matching[0].id}&$expand=settings&api-version=7.1-preview.1`);
  assert(hasApproval(checks.value || []), 'Enabled approval check with one required approver is required before publication');
}
function marketplaceVersions(metadata) {
  assert(Array.isArray(metadata.versions) && metadata.versions.length > 0, 'Marketplace version response is unavailable');
  const versions = metadata.versions.map(item => typeof item === 'string' ? item : item?.version);
  assert(versions.every(version => typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)), 'Marketplace version response contains invalid versions');
  return versions;
}
async function main() {
  const command = process.argv[2];
  const directory = process.env.RELEASE_ARTIFACT_DIR || path.join(root, 'dist/marketplace');
  if (command === 'prepare') {
    const manifest = manifestIdentity(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')));
    fs.mkdirSync(directory, { recursive: true });
    assert(fs.readdirSync(directory).length === 0, 'Artifact directory must be empty before packaging');
    const file = `skill-builder-${manifest.version}.vsix`;
    runVsce(['package', '--out', path.join(directory, file)]);
    const bytes = fs.readFileSync(path.join(directory, file));
    inspectVsix(bytes);
    const revision = process.env.BUILD_SOURCEVERSION || spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const receipt = { schema: 1, identity: ID, version: manifest.version, file, sha256: sha256(bytes),
      sourceRevision: revision, sourceBranch: process.env.BUILD_SOURCEBRANCH || 'local', buildId: process.env.BUILD_BUILDID || 'local' };
    fs.writeFileSync(path.join(directory, 'release.json'), JSON.stringify(receipt, null, 2) + '\n');
    verifyArtifact(directory);
    console.log(`Verified ${file}; SHA-256 ${receipt.sha256}`);
  } else if (command === 'verify') {
    console.log(JSON.stringify(verifyArtifact(directory).receipt, null, 2));
  } else if (command === 'check-gate') {
    await verifyApprovalGate();
    console.log('Enabled approval configuration verified with this pipeline identity; maintainer identity is an administrative configuration check.');
  } else if (command === 'publish') {
    assert(required('BUILD_SOURCEBRANCH') === 'refs/heads/main' && required('BUILD_REASON') === 'Manual', 'Publishing requires a manual main build');
    required('VSCE_PAT');
    const artifact = verifyArtifact(directory, { sourceRevision: required('BUILD_SOURCEVERSION'), sourceBranch: 'refs/heads/main', buildId: required('BUILD_BUILDID') });
    await verifyApprovalGate();
    const metadata = JSON.parse(runVsce(['show', ID, '--json'], true));
    assert(!marketplaceVersions(metadata).includes(artifact.receipt.version), 'Version is already public; select a new reviewed release version');
    runVsce(['publish', '--packagePath', artifact.packagePath]);
    const after = JSON.parse(runVsce(['show', ID, '--json'], true));
    assert(marketplaceVersions(after).includes(artifact.receipt.version), 'Publication command completed but version is not verified publicly');
    console.log(`Marketplace reports ${ID}@${artifact.receipt.version}. Native critical-action UAT remains a separate acceptance check.`);
  } else throw new Error('Expected prepare, verify, check-gate or publish');
}
module.exports = { sha256, inspectVsix, verifyArtifact, hasApproval, marketplaceVersions };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
