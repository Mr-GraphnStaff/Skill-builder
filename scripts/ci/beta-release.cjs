'use strict';

// This is a build-only local-UAT packager. There is deliberately no store command.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const AdmZip = require('adm-zip');
const ROOT = path.resolve(__dirname, '../..');
const ID = 'DavidFarris.skill-builder-beta';
const BRANCH = 'refs/heads/codex/human-workbench-beta';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function assert(value, message) { if (!value) throw new Error(message); }
function attributes(text) {
  const values = {};
  for (const match of text.matchAll(/([\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    assert(!Object.hasOwn(values, match[1]), 'Ambiguous VSIX XML attribute');
    values[match[1]] = match[2] ?? match[3];
  }
  return values;
}
function betaIdentity(manifest) {
  assert(`${manifest.publisher}.${manifest.name}` === ID, 'Beta builds require the separate local-UAT identity');
  assert(/^\d+\.\d+\.\d+$/.test(manifest.version), 'Beta package requires a numeric version');
  return manifest;
}
function inspectBetaVsix(bytes) {
  const zip = new AdmZip(bytes);
  const entry = zip.getEntry('extension/package.json');
  assert(entry, 'Beta VSIX is missing package.json');
  const manifest = betaIdentity(JSON.parse(entry.getData().toString('utf8')));
  const xml = zip.readAsText('extension.vsixmanifest');
  assert(xml, 'Beta VSIX is missing its XML manifest');
  const identities = [...xml.matchAll(/<Identity\b([^>]*?)\/?\s*>/g)];
  assert(identities.length === 1, 'Beta VSIX requires one XML identity');
  const identity = attributes(identities[0][1]);
  assert(identity.Publisher === manifest.publisher && identity.Id === manifest.name && identity.Version === manifest.version, 'Beta VSIX XML and package identities disagree');
  const flags = [...xml.matchAll(/<Property\b([^>]*?)\/?\s*>/g)].map(item => attributes(item[1])).filter(item => item.Id === 'Microsoft.VisualStudio.Code.PreRelease');
  assert(flags.length === 1 && flags[0].Value?.toLowerCase() === 'true', 'Beta VSIX must have one true pre-release flag');
  for (const item of zip.getEntries()) {
    assert(!/^extension\/(?:\.git\/|\.vscode\/|\.vscode-test\/|\.skilljetty-beta\/|\.skill-workbench\/|workbench\/|releases\/|dist\/|src\/|test\/|AGENTS\.md$|azure-pipelines(?:-beta)?\.yml$|scripts\/ci\/|scripts\/benchmark-|docs\/software-team\/|docs\/(?:beta-)?delivery\.md$)/i.test(item.entryName), 'Beta VSIX contains development, pipeline or user state');
    assert(!/\.log$/i.test(item.entryName), 'Beta VSIX contains a log file');
  }
  return manifest;
}
function verifyBetaArtifact(directory, expected = {}) {
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'beta-release.json'), 'utf8'));
  assert(receipt.schema === 1 && receipt.identity === ID && receipt.purpose === 'local-beta-uat' && receipt.preRelease === true, 'Invalid beta receipt');
  assert(/^skill-builder-beta-\d+\.\d+\.\d+\.vsix$/.test(receipt.file), 'Invalid beta artifact filename');
  assert(/^[a-f0-9]{40}$/.test(receipt.sourceRevision), 'Beta receipt requires a source revision');
  const bytes = fs.readFileSync(path.join(directory, receipt.file));
  assert(sha256(bytes) === receipt.sha256, 'Beta VSIX SHA-256 differs from receipt');
  const manifest = inspectBetaVsix(bytes);
  assert(manifest.version === receipt.version, 'Beta package and receipt versions disagree');
  for (const key of ['sourceRevision', 'buildId', 'sourceBranch']) {
    if (expected[key] !== undefined) assert(receipt[key] === expected[key], `Beta ${key} mismatch`);
  }
  return { receipt, manifest, packagePath: path.join(directory, receipt.file) };
}
function main() {
  const directory = process.env.BETA_ARTIFACT_DIR || path.join(ROOT, 'dist/beta-ci');
  const command = process.argv[2];
  if (command === 'prepare') {
    if (process.env.TF_BUILD || process.env.BUILD_BUILDID) assert(process.env.BUILD_SOURCEBRANCH === BRANCH, 'Beta CI packaging requires the dedicated beta branch');
    const manifest = betaIdentity(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')));
    fs.mkdirSync(directory, { recursive: true });
    assert(fs.readdirSync(directory).length === 0, 'Beta artifact directory must be empty before packaging');
    const file = `skill-builder-beta-${manifest.version}.vsix`;
    const executable = path.join(path.dirname(require.resolve('@vscode/vsce/package.json')), 'vsce');
    const result = spawnSync(process.execPath, [executable, 'package', '--pre-release', '--out', path.join(directory, file)], { cwd: ROOT, shell: false, stdio: 'inherit', timeout: 240000 });
    assert(!result.error && result.status === 0, 'Beta VSIX packaging failed');
    const bytes = fs.readFileSync(path.join(directory, file));
    inspectBetaVsix(bytes);
    const revision = process.env.BUILD_SOURCEVERSION || spawnSync('git', ['-c', `safe.directory=${ROOT.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
    const receipt = { schema: 1, identity: ID, purpose: 'local-beta-uat', preRelease: true, version: manifest.version, file,
      sha256: sha256(bytes), sourceRevision: revision, sourceBranch: process.env.BUILD_SOURCEBRANCH || 'local', buildId: process.env.BUILD_BUILDID || 'local' };
    fs.writeFileSync(path.join(directory, 'beta-release.json'), JSON.stringify(receipt, null, 2) + '\n');
    verifyBetaArtifact(directory, { sourceRevision: revision, buildId: receipt.buildId, sourceBranch: receipt.sourceBranch });
    console.log(`Verified local-UAT ${file}; SHA-256 ${receipt.sha256}. No Marketplace publication.`);
  } else if (command === 'verify') {
    console.log(JSON.stringify(verifyBetaArtifact(directory).receipt, null, 2));
  } else throw new Error('Expected prepare or verify; beta pipeline has no publishing command');
}
module.exports = { sha256, inspectBetaVsix, verifyBetaArtifact };
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
