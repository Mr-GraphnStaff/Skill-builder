'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const AdmZip = require('adm-zip');
const { sha256, hasApproval, marketplaceVersions } = require('./release.cjs');
const ROOT = path.resolve(__dirname, '../..');
const ID = 'DavidFarris.skill-builder';
const BRANCH = 'refs/heads/codex/public-prerelease';
const ENVIRONMENT = 'skilljetty-marketplace-prerelease';
function assert(value, message) { if (!value) throw new Error(message); }
function required(name) { const value = process.env[name]; assert(value && !/^\$\(.+\)$/.test(value), `Missing ${name}`); return value; }
function attributes(text) {
  const values = {};
  for (const match of text.matchAll(/([\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    assert(!Object.hasOwn(values, match[1]), 'Ambiguous VSIX XML attribute');
    values[match[1]] = match[2] ?? match[3];
  }
  return values;
}
function identity(manifest) {
  assert(`${manifest.publisher}.${manifest.name}` === ID, 'Public pre-release requires the established public identity');
  assert(/^\d+\.\d+\.\d+$/.test(manifest.version), 'Public pre-release requires a numeric version');
  return manifest;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function payloadInventory(bytes) {
  const files = new AdmZip(bytes).getEntries().filter(entry => !entry.isDirectory && entry.entryName.startsWith('extension/'));
  const names = new Set();
  return files.map(entry => {
    assert(!names.has(entry.entryName), 'Duplicate installed payload path'); names.add(entry.entryName);
    let content = entry.getData();
    if (entry.entryName === 'extension/package.json') {
      const manifest = JSON.parse(content.toString('utf8'));
      delete manifest.__metadata; // VS Code/Marketplace metadata is not authored extension content.
      content = Buffer.from(JSON.stringify(canonical(manifest)));
    }
    return { path: entry.entryName, sha256: sha256(content) };
  }).sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
function inspectPrerelease(bytes) {
  const zip = new AdmZip(bytes);
  const entry = zip.getEntry('extension/package.json');
  assert(entry, 'Public pre-release VSIX is missing package.json');
  const manifest = identity(JSON.parse(entry.getData().toString('utf8')));
  const xml = zip.readAsText('extension.vsixmanifest');
  assert(xml, 'Public pre-release VSIX is missing XML manifest');
  const identities = [...xml.matchAll(/<Identity\b([^>]*?)\/?\s*>/g)];
  assert(identities.length === 1, 'Public pre-release requires one XML identity');
  const value = attributes(identities[0][1]);
  assert(value.Publisher === manifest.publisher && value.Id === manifest.name && value.Version === manifest.version, 'Public pre-release XML/package identity mismatch');
  const flags = [...xml.matchAll(/<Property\b([^>]*?)\/?\s*>/g)].map(item => attributes(item[1])).filter(item => item.Id === 'Microsoft.VisualStudio.Code.PreRelease');
  assert(flags.length === 1 && flags[0].Value?.toLowerCase() === 'true', 'Public pre-release requires one true pre-release flag');
  for (const item of zip.getEntries()) {
    assert(!/^extension\/(?:\.git\/|\.vscode\/|\.vscode-test\/|\.skilljetty-(?:beta|prerelease)\/|\.skill-workbench\/|workbench\/|releases\/|dist\/|src\/|test\/|AGENTS\.md$|azure-pipelines(?:-beta)?\.yml$|scripts\/ci\/|scripts\/benchmark-|docs\/software-team\/|docs\/(?:beta-|prerelease-)?delivery\.md$)/i.test(item.entryName), 'Public pre-release contains development, pipeline or user state');
    assert(!/\.log$/i.test(item.entryName), 'Public pre-release contains a log file');
  }
  payloadInventory(bytes);
  return manifest;
}
function verifyArtifact(directory, expected = {}) {
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'prerelease-release.json'), 'utf8'));
  assert(receipt.schema === 1 && receipt.identity === ID && receipt.channel === 'marketplace-prerelease' && receipt.preRelease === true, 'Invalid public pre-release receipt');
  assert(/^skill-builder-prerelease-\d+\.\d+\.\d+\.vsix$/.test(receipt.file), 'Invalid public pre-release filename');
  assert(/^[a-f0-9]{40}$/.test(receipt.sourceRevision), 'Public pre-release receipt requires a source revision');
  const bytes = fs.readFileSync(path.join(directory, receipt.file));
  assert(sha256(bytes) === receipt.sha256, 'Public pre-release SHA-256 mismatch');
  const manifest = inspectPrerelease(bytes);
  assert(manifest.version === receipt.version, 'Public pre-release version mismatch');
  for (const key of ['sourceRevision', 'buildId', 'sourceBranch']) if (expected[key] !== undefined) assert(receipt[key] === expected[key], `Public pre-release ${key} mismatch`);
  return { receipt, manifest, bytes, packagePath: path.join(directory, receipt.file) };
}
function runVsce(args, capture = false) {
  const executable = path.join(path.dirname(require.resolve('@vscode/vsce/package.json')), 'vsce');
  const result = spawnSync(process.execPath, [executable, ...args], { cwd: ROOT, shell: false, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', timeout: 240000, maxBuffer: 8 * 1024 * 1024 });
  assert(!result.error && result.status === 0, `vsce ${args[0]} did not complete successfully`);
  return result.stdout;
}
async function azureGet(relative) {
  const collection = required('SYSTEM_COLLECTIONURI');
  assert(new URL(collection).hostname.toLowerCase() === 'dev.azure.com', 'Unexpected Azure collection host');
  const url = `${collection.replace(/\/$/, '')}/${encodeURIComponent(required('SYSTEM_TEAMPROJECTID'))}/_apis/${relative}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${required('SYSTEM_ACCESSTOKEN')}` }, signal: AbortSignal.timeout(30000) });
  assert(response.ok, `Cannot verify public pre-release gate (${response.status})`);
  return response.json();
}
async function verifyGate() {
  const environments = await azureGet(`distributedtask/environments?name=${encodeURIComponent(ENVIRONMENT)}&api-version=7.1-preview.1`);
  const matches = (environments.value || []).filter(value => value.name === ENVIRONMENT);
  assert(matches.length === 1, 'Public pre-release approval environment is missing or ambiguous');
  const checks = await azureGet(`pipelines/checks/configurations?resourceType=environment&resourceId=${matches[0].id}&$expand=settings&api-version=7.1-preview.1`);
  assert(hasApproval(checks.value || []), 'Enabled configured approval is required for public pre-release');
}
function publicVersion(metadata, version) {
  assert(metadata.extensionName === 'skill-builder' && metadata.publisher?.publisherName === 'DavidFarris', 'Unexpected public Marketplace identity');
  marketplaceVersions(metadata);
  const matches = metadata.versions.filter(value => value.version === version);
  assert(matches.length === 1, 'Public pre-release version is missing or ambiguous');
  assert(Array.isArray(matches[0].properties) && matches[0].properties.some(property => property.key === 'Microsoft.VisualStudio.Code.PreRelease' && String(property.value).toLowerCase() === 'true'), 'Marketplace does not identify the version as pre-release');
  return matches[0];
}
function verifyPublicPayload(expectedBytes, publicBytes) {
  const expectedManifest = inspectPrerelease(expectedBytes);
  const publicManifest = inspectPrerelease(publicBytes);
  assert(expectedManifest.version === publicManifest.version, 'Downloaded public version differs from approved version');
  assert(JSON.stringify(payloadInventory(expectedBytes)) === JSON.stringify(payloadInventory(publicBytes)), 'Downloaded public extension payload differs from approved VSIX');
  return { publicSha256: sha256(publicBytes), exactPackageBytesMatch: sha256(expectedBytes) === sha256(publicBytes), installedPayloadMatches: true };
}
async function verifyPublic(artifact) {
  const metadata = JSON.parse(runVsce(['show', ID, '--json'], true));
  publicVersion(metadata, artifact.receipt.version);
  const url = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/DavidFarris/vsextensions/skill-builder/${encodeURIComponent(artifact.receipt.version)}/vspackage`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  assert(response.ok, `Cannot download public VSIX (${response.status})`);
  assert(Number(response.headers.get('content-length') || 0) <= 32 * 1024 * 1024, 'Unexpected public VSIX size');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length <= 32 * 1024 * 1024, 'Unexpected public VSIX size');
  return verifyPublicPayload(artifact.bytes, bytes);
}
async function reconcilePublication(artifact) {
  for (const delay of [0, 5000, 10000, 20000]) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    try { return await verifyPublic(artifact); } catch { /* Index/asset propagation may lag; never upload again here. */ }
  }
  throw new Error('Publication outcome remains unverified; reconcile this version and payload before any further upload');
}
async function main() {
  const command = process.argv[2];
  const directory = process.env.PRERELEASE_ARTIFACT_DIR || path.join(ROOT, 'dist/prerelease-ci');
  if (command === 'prepare') {
    if (process.env.TF_BUILD || process.env.BUILD_BUILDID) assert(process.env.BUILD_SOURCEBRANCH === BRANCH, 'Public pre-release packaging requires its dedicated branch');
    const manifest = identity(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')));
    fs.mkdirSync(directory, { recursive: true });
    assert(fs.readdirSync(directory).length === 0, 'Public pre-release artifact directory must be empty');
    const file = `skill-builder-prerelease-${manifest.version}.vsix`;
    runVsce(['package', '--pre-release', '--out', path.join(directory, file)]);
    const bytes = fs.readFileSync(path.join(directory, file)); inspectPrerelease(bytes);
    const revision = process.env.BUILD_SOURCEVERSION || spawnSync('git', ['-c', `safe.directory=${ROOT.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
    const receipt = { schema: 1, identity: ID, channel: 'marketplace-prerelease', preRelease: true, version: manifest.version, file,
      sha256: sha256(bytes), sourceRevision: revision, sourceBranch: process.env.BUILD_SOURCEBRANCH || 'local', buildId: process.env.BUILD_BUILDID || 'local' };
    fs.writeFileSync(path.join(directory, 'prerelease-release.json'), JSON.stringify(receipt, null, 2) + '\n');
    verifyArtifact(directory); console.log(`Verified ${ID}@${manifest.version} public pre-release; SHA-256 ${receipt.sha256}`);
  } else if (command === 'verify') console.log(JSON.stringify(verifyArtifact(directory).receipt, null, 2));
  else if (command === 'check-gate') { await verifyGate(); console.log('Public pre-release approval configuration is readable and enabled; approver identity is an administrative check.'); }
  else if (command === 'verify-public') console.log(JSON.stringify(await verifyPublic(verifyArtifact(directory)), null, 2));
  else if (command === 'publish') {
    assert(required('BUILD_SOURCEBRANCH') === BRANCH && required('BUILD_REASON') === 'Manual', 'Public pre-release publishing requires a manual dedicated-branch build');
    const artifact = verifyArtifact(directory, { sourceRevision: required('BUILD_SOURCEVERSION'), sourceBranch: BRANCH, buildId: required('BUILD_BUILDID') });
    required('VSCE_PAT'); await verifyGate();
    const metadata = JSON.parse(runVsce(['show', ID, '--json'], true));
    if (marketplaceVersions(metadata).includes(artifact.receipt.version)) {
      console.log(JSON.stringify({ alreadyPublished: true, ...await verifyPublic(artifact) })); return;
    }
    let uploadCommandSucceeded = false;
    try { runVsce(['publish', '--packagePath', artifact.packagePath, '--pre-release']); uploadCommandSucceeded = true; }
    catch { console.log('Upload command did not confirm success; reconciling public state without another upload.'); }
    const verification = await reconcilePublication(artifact);
    console.log(JSON.stringify({ identity: ID, version: artifact.receipt.version, preRelease: true, uploadCommandSucceeded, ...verification }));
  } else throw new Error('Expected prepare, verify, check-gate, verify-public or publish');
}
module.exports = { inspectPrerelease, payloadInventory, verifyArtifact, publicVersion, verifyPublicPayload };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
