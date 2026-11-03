import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { isUtf8 } from 'node:buffer';
import AdmZip from 'adm-zip';
import { assertWorkbenchPath } from './workbench-boundary.js';
import { verifySkillRelease, readSkillReleaseMetadata, validateWorkbenchSkill, type FileDigest, type WorkbenchRelease, type ReleaseManifest } from './skill-workbench.js';

const MAX_FILES = 5000, MAX_TOTAL = 128 * 1024 * 1024, MAX_ARCHIVE = 64 * 1024 * 1024;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
type CapturedFile = { path: string; bytes: Buffer };
export type PluginMember = { name: string; version: string; files: FileDigest[]; sourceSha256: string; packageSha256: string };
type DirectoryMetadata = { icon?: string; privacyPolicyUrl?: string; documentationUrl?: string; supportUrl?: string; termsOfServiceUrl?: string };
export type PluginDescriptor = DirectoryMetadata & { name: string; description: string; version: string; author?: { name: string }; repository?: string; license?: string };
export type PluginManifest = ReleaseManifest & { kind: 'plugin'; format: 1; plugin: PluginDescriptor; members: PluginMember[]; marketplaceSha256: string };
export type PluginRelease = WorkbenchRelease & { manifest: PluginManifest };
export type PluginReleaseOptions = DirectoryMetadata & { name: string; description: string; version: string; author?: string; repository?: string; license?: string; members: Array<{ directory: string }>; changelog: string };
export type DirectoryReadinessCheck = { code: string; result: 'block' | 'hold' | 'warning' | 'unknown' | 'pass'; message: string; paths?: string[] };
export type PluginDirectoryReadiness = { checkedAgainst: string; portalRequired: true; checks: DirectoryReadinessCheck[] };
export type CompatibilityReport = { target: 'gemini-app'; valid: boolean; errors: string[]; warnings: string[]; fileCount: number; byteCount: number; checkedAgainst: string };
export type GeminiRelease = { directory: string; packagePath: string; reportPath: string; report: CompatibilityReport; sha256: string };

const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const fingerprint = (files: FileDigest[]) => hash(JSON.stringify(files));
function finalize(source: string, destination: string): void {
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(source, destination); return; }
    catch (error) {
      if (process.platform !== 'win32' || attempt >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
    }
  }
}
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || value.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)) throw new Error('Plugin and skill names must be filesystem-safe lowercase kebab-case, at most 64 characters.');
  return value;
}
function version(value: unknown): string { if (typeof value !== 'string' || value.length > 120 || !SEMVER.test(value)) throw new Error('Choose a valid semantic release version.'); return value; }
function text(value: unknown, label: string, max = 1024): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error(`Choose a valid ${label}.`);
  return value.trim();
}
function safeRelative(value: string): void {
  if (!value || value.length > 1024 || value.includes('\\') || /[\x00-\x1f:]/.test(value)) throw new Error('Unsafe export path.');
  const parts = value.replace(/\/$/, '').split('/');
  if (parts.length > 64 || parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /[<>"|?*]/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Unsafe export path.');
}
function inventory(root: string): CapturedFile[] {
  const files: CapturedFile[] = []; let total = 0;
  const visit = (folder: string) => {
    assertWorkbenchPath(root, folder);
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const target = assertWorkbenchPath(root, path.join(folder, entry.name));
      const relative = path.relative(root, target).split(path.sep).join('/'); safeRelative(relative);
      const stat = fs.lstatSync(target);
      if (files.length >= MAX_FILES || stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error('Export contains too many entries, links or special files.');
      if (stat.isDirectory()) { files.push({ path: relative + '/', bytes: Buffer.alloc(0) }); visit(target); }
      else {
        total += stat.size; if (total > MAX_TOTAL) throw new Error('Export exceeds SkillJetty packaging size limits.');
        const bytes = fs.readFileSync(target); if (bytes.length !== stat.size) throw new Error('Export changed during capture.');
        files.push({ path: relative, bytes });
      }
    }
  };
  visit(root); return files.sort((a, b) => a.path.localeCompare(b.path));
}
const digests = (files: CapturedFile[]): FileDigest[] => files.map(file => ({ path: file.path, size: file.bytes.length, sha256: hash(file.bytes) }));
function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function writeFiles(root: string, files: CapturedFile[]): void {
  for (const file of files) {
    safeRelative(file.path); const target = assertWorkbenchPath(root, path.join(root, ...file.path.split('/')));
    if (file.path.endsWith('/')) fs.mkdirSync(target, { recursive: true });
    else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, file.bytes, { flag: 'wx' }); }
  }
}
function zipBytes(files: CapturedFile[]): Buffer {
  const zip = new AdmZip(); for (const file of files) zip.addFile(file.path, file.bytes);
  const bytes = zip.toBuffer(); if (bytes.length > MAX_ARCHIVE) throw new Error('Export exceeds SkillJetty archive size limits.');
  verifyZip(bytes, digests(files)); return bytes;
}
function verifyZip(bytes: Buffer, expected: FileDigest[]): void {
  if (bytes.length > MAX_ARCHIVE) throw new Error('Export archive exceeds size limits.');
  const entries = new AdmZip(bytes).getEntries(); const seen = new Set<string>(); let total = 0;
  if (entries.length > MAX_FILES) throw new Error('Export archive has too many entries.');
  const actual: FileDigest[] = entries.map(entry => {
    safeRelative(entry.entryName); const key = entry.entryName.replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) throw new Error('Export archive contains duplicate paths.'); seen.add(key);
    const unixType = (entry.attr >>> 16) & 0xf000;
    if (unixType && (entry.isDirectory ? unixType !== 0x4000 : unixType !== 0x8000)) throw new Error('Export archive links or special files are forbidden.');
    if (entry.header.flags & 1) throw new Error('Encrypted export archives are unsupported.');
    if (entry.header.method !== 0 && entry.header.method !== 8) throw new Error('Unsupported export ZIP compression.');
    total += entry.header.size; if (total > MAX_TOTAL || entry.header.size < 0) throw new Error('Export archive exceeds expanded size limits.');
    if (entry.header.size > 16 * 1024 * 1024) throw new Error('Export archive file exceeds size limits.');
    if (entry.isDirectory && entry.header.size !== 0) throw new Error('Invalid export directory.');
    const compressed = entry.getCompressedData();
    const content = entry.header.method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: 16 * 1024 * 1024 });
    if (content.length !== entry.header.size || crc32(content) !== (entry.header.crc >>> 0)) throw new Error('Export archive entry length or integrity changed.');
    return { path: entry.entryName, size: content.length, sha256: hash(content) };
  }).sort((a, b) => a.path.localeCompare(b.path));
  if (!same(actual, expected)) throw new Error('Export archive differs from the captured source inventory.');
}
function descriptor(options: PluginReleaseOptions): PluginDescriptor {
  const plugin: PluginDescriptor = { name: identifier(options.name), description: text(options.description, 'plugin description'), version: version(options.version) };
  if (/^(?:claude|anthropic|anthropics|cc-plugin)(?:-|$)/.test(plugin.name) || /(?:^|-)(?:official-(?:claude|anthropic|anthropics)|(?:claude|anthropic|anthropics)-official)(?:-|$)/.test(plugin.name)) throw new Error('Choose a plugin name that does not impersonate Anthropic.');
  if (options.author?.trim()) plugin.author = { name: text(options.author, 'plugin author', 200) };
  if (options.license?.trim()) plugin.license = text(options.license, 'plugin license', 200);
  if (options.repository?.trim()) {
    const url = new URL(options.repository);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port) throw new Error('Plugin repository metadata must be an HTTPS URL without credentials.');
    plugin.repository = url.toString();
  }
  for (const key of ['privacyPolicyUrl', 'documentationUrl', 'supportUrl', 'termsOfServiceUrl'] as const) {
    if (!options[key]?.trim()) continue;
    const url = new URL(text(options[key], key, 2048));
    if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error(`${key} must be an HTTPS URL without credentials.`);
    plugin[key] = url.toString();
  }
  if (options.icon?.trim()) {
    const icon = text(options.icon, 'plugin icon path', 1024);
    if (!icon.startsWith('./')) throw new Error('Plugin icon must be a relative path inside the plugin, such as ./skills/my-skill/assets/logo.png.');
    safeRelative(icon.slice(2)); plugin.icon = icon;
  }
  return plugin;
}
function bundleReadme(plugin: PluginDescriptor, members: PluginMember[]): Buffer {
  return Buffer.from(`# ${plugin.name}\n\nThis skills-only plugin was exported with SkillJetty by DAF-TECH. It contains the selected skill snapshots listed below. Skill instructions and supporting files are preserved without rewriting their contents. The bundle version identifies this collection independently of the versions assigned to its member skills.\n\n## Included skills\n\n${members.map(member => `- ${member.name}, version ${member.version}`).join('\n')}\n\n## Installation and review\n\nThe manifest in .claude-plugin describes this bundle. The skills folder contains each member's SKILL.md and supporting files. Review those files, scripts, data and requirements before using the plugin. Import, discovery, invocation and functional results require verification in the Claude surface where the plugin will be used. Organization access and distribution are configured separately by an administrator. Human review and the developer portal determine suitability for public directory submission. Generated packaging metadata does not establish the behavior or security of the included skills.\n`, 'utf8');
}
function capturedSkill(root: string, directory: string): { release: WorkbenchRelease; files: CapturedFile[] } {
  assertWorkbenchPath(root, directory); const release = verifySkillRelease(directory);
  const files = inventory(assertWorkbenchPath(root, path.join(release.directory, 'source', release.skillName)));
  if (!same(digests(files), release.manifest.files)) throw new Error('Skill source changed during export capture.');
  return { release, files };
}
export function preparePluginRelease(workspaceRoot: string, options: PluginReleaseOptions): PluginRelease {
  const plugin = descriptor(options), notes = text(options.changelog, 'plugin release notes', 200_000);
  if (!Array.isArray(options.members) || !options.members.length || options.members.length > 100) throw new Error('Select between one and 100 skills for the plugin.');
  const snapshots = options.members.map(member => capturedSkill(workspaceRoot, member.directory));
  snapshots.sort((a, b) => a.release.skillName.localeCompare(b.release.skillName));
  const names = snapshots.map(item => item.release.skillName);
  if (new Set(names.map(name => name.toLowerCase())).size !== names.length) throw new Error('A plugin cannot contain duplicate skill names.');
  const members: PluginMember[] = snapshots.map(({ release }) => ({ name: release.skillName, version: release.version, files: release.manifest.files, sourceSha256: fingerprint(release.manifest.files), packageSha256: release.manifest.packageSha256 }));
  const readme = bundleReadme(plugin, members);
  const directory = assertWorkbenchPath(workspaceRoot, path.join(workspaceRoot, 'plugin-releases', plugin.name, plugin.version));
  const changelog = Buffer.from(notes + '\n', 'utf8');
  const marketplace = json({ name: plugin.name, source: `./Plugins/${plugin.name}/source`, description: plugin.description });
  if (fs.existsSync(directory)) {
    const existing = verifyPluginRelease(directory);
    if (!same(existing.manifest.plugin, plugin) || !same(existing.manifest.members, members) || existing.manifest.changelogSha256 !== hash(changelog) || existing.manifest.marketplaceSha256 !== hash(marketplace) || existing.manifest.files.find(file => file.path === 'README.md')?.sha256 !== hash(readme)) throw new Error('Plugin version already exists with different content. Choose a new bundle version.');
    return existing;
  }
  const files: CapturedFile[] = [{ path: '.claude-plugin/', bytes: Buffer.alloc(0) }, { path: '.claude-plugin/plugin.json', bytes: json(plugin) }, { path: 'README.md', bytes: readme }, { path: 'skills/', bytes: Buffer.alloc(0) }];
  for (const snapshot of snapshots) {
    files.push({ path: `skills/${snapshot.release.skillName}/`, bytes: Buffer.alloc(0) });
    files.push(...snapshot.files.map(file => ({ path: `skills/${snapshot.release.skillName}/${file.path}`, bytes: file.bytes })));
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  if (plugin.icon) {
    const iconFile = files.find(file => !file.path.endsWith('/') && file.path === plugin.icon!.slice(2));
    if (!iconFile || !/\.(?:png|jpe?g|gif|webp|svg)$/i.test(iconFile.path) || !recognizedMedia(iconFile)) throw new Error('Plugin icon must refer to an existing bundled PNG, JPEG, GIF, WebP or SVG image with a recognized file signature. The selected files were preserved.');
  }
  if (files.length > MAX_FILES || files.reduce((sum, file) => sum + file.bytes.length, 0) > MAX_TOTAL) throw new Error('Plugin bundle exceeds SkillJetty packaging limits.');
  const packed = zipBytes(files);
  const manifest: PluginManifest = { kind: 'plugin', format: 1, plugin, members, skillName: plugin.name, version: plugin.version, createdAt: new Date().toISOString(), files: digests(files), packageSha256: hash(packed), changelogSha256: hash(changelog), marketplaceSha256: hash(marketplace) };
  const parent = assertWorkbenchPath(workspaceRoot, path.dirname(directory)); fs.mkdirSync(parent, { recursive: true });
  const staging = assertWorkbenchPath(workspaceRoot, path.join(parent, `.preparing-${randomUUID()}`)); fs.mkdirSync(staging);
  try {
    writeFiles(path.join(staging, 'source'), files);
    fs.writeFileSync(path.join(staging, `${plugin.name}-${plugin.version}.zip`), packed, { flag: 'wx' });
    fs.writeFileSync(path.join(staging, 'CHANGELOG.md'), changelog, { flag: 'wx' });
    fs.writeFileSync(path.join(staging, 'marketplace-entry.json'), marketplace, { flag: 'wx' });
    fs.writeFileSync(path.join(staging, 'release.json'), json(manifest), { flag: 'wx' });
    assertWorkbenchPath(workspaceRoot, directory); finalize(staging, directory);
  } finally { if (fs.existsSync(staging)) { assertWorkbenchPath(workspaceRoot, staging); fs.rmSync(staging, { recursive: true }); } }
  return verifyPluginRelease(directory);
}
export function readPluginReleaseMetadata(directory: string, activeDirectory = false, maxMetadataBytes?: number): PluginRelease {
  directory = path.resolve(directory); assertWorkbenchPath(directory, directory);
  const file = assertWorkbenchPath(directory, path.join(directory, 'release.json'));
  let metadata: string;
  if (maxMetadataBytes === undefined) metadata = fs.readFileSync(file, 'utf8');
  else {
    if (!Number.isSafeInteger(maxMetadataBytes) || maxMetadataBytes < 1 || maxMetadataBytes > MAX_ARCHIVE) throw new Error('Invalid plugin metadata read limit.');
    const fd = fs.openSync(file, 'r');
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.nlink > 1 || stat.size > maxMetadataBytes) throw new Error('Saved plugin version metadata exceeds the safe suggestion limit or is not a regular file.');
      const chunks: Buffer[] = [];
      let total = 0;
      while (total <= maxMetadataBytes) {
        const chunk = Buffer.alloc(Math.min(64 * 1024, maxMetadataBytes + 1 - total));
        const read = fs.readSync(fd, chunk, 0, chunk.length, null);
        if (!read) break;
        chunks.push(chunk.subarray(0, read)); total += read;
      }
      if (total > maxMetadataBytes) throw new Error('Saved plugin version metadata exceeds the safe suggestion limit.');
      metadata = Buffer.concat(chunks, total).toString('utf8');
    } finally { fs.closeSync(fd); }
  }
  const manifest = JSON.parse(metadata) as PluginManifest;
  if (manifest.kind !== 'plugin' || manifest.format !== 1 || !manifest.plugin || !Array.isArray(manifest.members) || !manifest.members.length || !Array.isArray(manifest.files)) throw new Error('Invalid plugin release receipt.');
  identifier(manifest.skillName); version(manifest.version);
  const matchesDirectory = activeDirectory
    ? path.basename(directory) === manifest.skillName && path.basename(path.dirname(directory)) === 'Plugins'
    : path.basename(directory) === manifest.version && path.basename(path.dirname(directory)) === manifest.skillName;
  if (manifest.plugin.name !== manifest.skillName || manifest.plugin.version !== manifest.version || !matchesDirectory) throw new Error('Plugin release identity does not match its directory.');
  for (const key of ['packageSha256', 'changelogSha256', 'marketplaceSha256'] as const) if (!/^[a-f0-9]{64}$/.test(manifest[key])) throw new Error('Plugin receipt is missing valid hashes.');
  return { directory, version: manifest.version, skillName: manifest.skillName, packagePath: assertWorkbenchPath(directory, path.join(directory, `${manifest.skillName}-${manifest.version}.zip`)), manifest };
}
export function verifyPluginRelease(directory: string, activeDirectory = false): PluginRelease {
  const release = readPluginReleaseMetadata(directory, activeDirectory), manifest = release.manifest;
  const source = assertWorkbenchPath(directory, path.join(directory, 'source'));
  const actual = inventory(source); if (!same(digests(actual), manifest.files)) throw new Error('Plugin source inventory does not match its receipt.');
  const plugin = descriptor({ ...manifest.plugin, author: manifest.plugin.author?.name, members: [], changelog: 'verification' });
  if (!same(plugin, manifest.plugin) || !same(JSON.parse(fs.readFileSync(path.join(source, '.claude-plugin', 'plugin.json'), 'utf8')), plugin)) throw new Error('Plugin manifest does not match its receipt.');
  if (plugin.icon) {
    const iconFile = actual.find(file => file.path === plugin.icon!.slice(2));
    if (!iconFile || !/\.(?:png|jpe?g|gif|webp|svg)$/i.test(iconFile.path) || !recognizedMedia(iconFile)) throw new Error('Plugin icon is missing or has an unsupported image type.');
  }
  const memberNames = manifest.members.map(member => identifier(member.name));
  if (new Set(memberNames).size !== memberNames.length || manifest.members.length > 100) throw new Error('Invalid plugin members.');
  for (const member of manifest.members) {
    version(member.version); const memberRoot = assertWorkbenchPath(directory, path.join(source, 'skills', member.name));
    const validation = validateWorkbenchSkill({ id: member.name, name: member.name, sourcePath: memberRoot });
    if (!validation.valid || !same(validation.files, member.files) || fingerprint(member.files) !== member.sourceSha256 || !/^[a-f0-9]{64}$/.test(member.packageSha256)) throw new Error('Plugin member does not match its recorded skill snapshot.');
  }
  const allowedRoot = new Set(['.claude-plugin', 'skills', 'README.md', 'README', 'LICENSE']);
  if (!same(fs.readdirSync(path.join(source, 'skills')).sort(), [...memberNames].sort()) || fs.readdirSync(source).some(name => !allowedRoot.has(name))) throw new Error('Unexpected plugin component.');
  if (fs.statSync(release.packagePath).size > MAX_ARCHIVE) throw new Error('Plugin archive exceeds size limits.');
  const packed = fs.readFileSync(release.packagePath);
  if (hash(packed) !== manifest.packageSha256) throw new Error('Plugin package hash mismatch.'); verifyZip(packed, manifest.files);
  for (const [filename, expected] of [['CHANGELOG.md', manifest.changelogSha256], ['marketplace-entry.json', manifest.marketplaceSha256]]) {
    if (hash(fs.readFileSync(assertWorkbenchPath(directory, path.join(directory, filename)))) !== expected) throw new Error('Plugin release notes or marketplace handoff hash mismatch.');
  }
  const expected = ['source', 'release.json', 'CHANGELOG.md', 'marketplace-entry.json', path.basename(release.packagePath)].sort();
  if (!same(fs.readdirSync(directory).sort(), expected)) throw new Error('Unexpected file in plugin release.');
  return release;
}
export function readExportReleaseMetadata(directory: string): WorkbenchRelease {
  const file = assertWorkbenchPath(directory, path.join(directory, 'release.json'));
  const kind = JSON.parse(fs.readFileSync(file, 'utf8')).kind;
  if (kind !== undefined && kind !== 'plugin') throw new Error('Unsupported export release type.');
  return kind === 'plugin' ? readPluginReleaseMetadata(directory) : readSkillReleaseMetadata(directory);
}
export function verifyExportRelease(directory: string): WorkbenchRelease {
  const release = readExportReleaseMetadata(directory);
  return (release.manifest as Partial<PluginManifest>).kind === 'plugin' ? verifyPluginRelease(directory) : verifySkillRelease(directory);
}
export function exportRelativePath(release: WorkbenchRelease): string {
  identifier(release.skillName); version(release.version);
  return (release.manifest as Partial<PluginManifest>).kind === 'plugin' ? `Plugins/${release.skillName}` : `${release.skillName}/${release.version}`;
}
export function listPluginReleaseMetadata(workspaceRoot: string): PluginRelease[] {
  const base = assertWorkbenchPath(workspaceRoot, path.join(workspaceRoot, 'plugin-releases')); if (!fs.existsSync(base)) return [];
  const releases: PluginRelease[] = [];
  for (const name of fs.readdirSync(base)) {
    if (name.startsWith('.')) continue; identifier(name); const folder = assertWorkbenchPath(workspaceRoot, path.join(base, name));
    if (!fs.lstatSync(folder).isDirectory()) throw new Error('Invalid plugin release folder.');
    for (const number of fs.readdirSync(folder)) {
      if (number.startsWith('.')) continue; version(number); releases.push(readPluginReleaseMetadata(assertWorkbenchPath(workspaceRoot, path.join(folder, number))));
    }
  }
  return releases;
}

/** Directory-only advice. Findings never remove bytes or prohibit valid private organization exports. */
export function assessPluginDirectoryReadiness(directory: string): PluginDirectoryReadiness {
  const release = verifyPluginRelease(directory), source = path.join(release.directory, 'source');
  const files = inventory(source), content = files.filter(file => !file.path.endsWith('/'));
  const checks: DirectoryReadinessCheck[] = [];
  const add = (code: string, result: DirectoryReadinessCheck['result'], message: string, paths?: string[]) => checks.push({ code, result, message, ...(paths?.length ? { paths } : {}) });
  const readme = content.find(file => /^readme(?:\.md)?$/i.test(file.path));
  const words = readme ? readmeWords(readme.bytes.toString('utf8')) : 0;
  add('readme', words >= 40 ? 'pass' : 'block', readme ? `README has ${words} words outside code blocks; public directory submissions require at least 40.` : 'Public directory submission requires a README with at least 40 words outside code blocks.');
  const licensed = !!release.manifest.plugin.license || content.some(file => file.path === 'LICENSE');
  add('license', licensed ? 'pass' : 'block', licensed ? 'A manifest license or root LICENSE is present. Human review must confirm the license covers the bundled content.' : 'Public directory submission requires a manifest license or root LICENSE. Private export remains available without inventing a license grant.');
  const reserved = new Set(['claude', 'anthropic', 'anthropics', 'official', 'plugin', 'plugins', 'mcp', 'test']);
  const name = release.skillName, generic = new Set(['test', 'tests', 'plugin', 'plugins', 'mcp', 'server', 'servers', 'skill', 'skills', 'tool', 'tools', 'example', 'demo', 'utility', 'utilities']);
  add('directory-name', reserved.has(name) ? 'block' : name.split('-').every(word => generic.has(word)) ? 'hold' : 'pass', reserved.has(name) ? `The whole plugin name "${name}" is reserved for public directory submission. It has not been renamed.` : name.split('-').every(word => generic.has(word)) ? `The generic name "${name}" may be held for an Anthropic reviewer.` : 'The plugin name passes the locally known reserved/generic-name checks; availability and look-alikes remain portal checks.');
  const junk = files.filter(file => file.path.split('/').some(part => ['.ds_store', 'thumbs.db', 'desktop.ini', '__macosx'].includes(part.toLowerCase()))).map(file => file.path);
  add('os-junk', junk.length ? 'block' : 'pass', junk.length ? `Public directory blocker: operating-system metadata is preserved at ${junk.join(', ')}. Review the source before preparing a separate revised version.` : 'No known macOS or Windows junk paths were found.', junk);
  const tooLarge = content.filter(file => file.bytes.length >= 5 * 1024 * 1024);
  for (const file of tooLarge) add('file-size', 'block', `${file.path}: ${(file.bytes.length / (1024 * 1024)).toFixed(2)} MiB (${file.bytes.length} bytes). Directory validation requires every plugin file to be smaller than 5 MiB. No bytes were removed or reduced.`, [file.path]);
  if (!tooLarge.length) add('file-size', 'pass', 'Every file in this plugin is smaller than 5 MiB. This does not check files elsewhere in its repository.');
  const largeNonMedia = content.filter(file => file.bytes.length >= 256 * 1024 && !recognizedMedia(file));
  for (const file of largeNonMedia) add('review-size', 'hold', `${file.path}: ${(file.bytes.length / 1024).toFixed(2)} KiB (${file.bytes.length} bytes). A non-image/font file at or above 256 KiB may be held for an Anthropic reviewer.`, [file.path]);
  if (!largeNonMedia.length) add('review-size', 'pass', 'No locally recognized non-image/font file reaches the 256 KiB policy-hold threshold.');
  add('file-count', content.length > 512 ? 'hold' : 'pass', `${content.length} plugin files; more than 512 may be held for an Anthropic reviewer.`);
  const binaries = content.filter(file => !recognizedMedia(file) && (!isUtf8(file.bytes) || file.bytes.includes(0) || /\.(?:pdf|ico|zip|gz|tgz|7z|rar|exe|dll|db|sqlite|sqlite3)$/i.test(file.path))).map(file => file.path);
  add('binary-content', binaries.length ? 'hold' : 'pass', binaries.length ? `Binary or opaque document/data content may be held for an Anthropic reviewer: ${binaries.join(', ')}. All files remain unchanged.` : 'No unrecognized binary content was identified by the local file-type check.', binaries);
  add('image-font-integrity', 'unknown', 'The portal must verify complete image/font integrity and whether scripts or instructions refer to media in restricted ways. Local file signatures are not a full media validator.');
  add('directory-icon', release.manifest.plugin.icon ? 'pass' : 'warning', release.manifest.plugin.icon ? `Manifest icon points inside the plugin: ${release.manifest.plugin.icon}. The portal must validate its image and listing requirements.` : 'The submission portal requests a listing icon in plugin.json. Choose an existing bundled image path and confirm the requirement during portal validation. Local checks do not establish whether omission blocks submission. Private organization export remains available.');
  add('privacy-and-remote-actions', 'unknown', release.manifest.plugin.privacyPolicyUrl ? 'A privacy policy URL is configured; human and portal review must confirm it covers any remote actions or data handling.' : 'Privacy-policy applicability and remote actions require human/portal review. Included scripts were not analyzed for data handling, package launchers or network access.');
  add('repository-context', 'unknown', 'Whole-repository checks were not performed: GitHub archive must be under 50 MiB, unpacked repository under 256 MiB, and repository entries fewer than 10,000. Review .gitattributes and package-manager files at and above the plugin, including their sizes and rewrite/source settings. Plugin-only checks cannot establish these conditions.');
  add('launchers-and-dependencies', 'unknown', 'Human/portal review must inspect npx/uvx and other launchers for exact version pins, uv run --locked/--frozen, package-source configuration, lockfile installs and script execution. This local report does not parse or certify executable behavior.');
  add('name-ownership', 'unknown', 'The portal must check directory name availability, look-alikes, brand ownership, author identity and fork naming.');
  add('security-and-policy', 'unknown', 'Sensitive-content scanning is not implemented here. Human review, portal validation, the post-submission security scan and directory policy review remain required for each submitted version.');
  return { checkedAgainst: 'Anthropic plugin pre-submission checklist, checked November 3, 2026: https://claude.com/docs/plugins/pre-submission-checklist', portalRequired: true, checks };
}
function readmeWords(markdown: string): number {
  let fence: { character: string; length: number } | undefined; const prose: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence.character && close[1].length >= fence.length) fence = undefined;
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (open) { fence = { character: open[1][0], length: open[1].length }; continue; }
    if (!/^(?: {4}|\t)/.test(line)) prose.push(line);
  }
  return (prose.join('\n').match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) ?? []).length;
}
function recognizedMedia(file: CapturedFile): boolean {
  const b = file.bytes, extension = path.posix.extname(file.path).toLowerCase();
  if (extension === '.svg') return isUtf8(b) && !b.includes(0) && /<svg[\s>]/i.test(b.toString('utf8'));
  if (extension === '.png') return b.length >= 20 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && b.subarray(-8, -4).toString('ascii') === 'IEND';
  if (extension === '.jpg' || extension === '.jpeg') return b.length >= 4 && b[0] === 255 && b[1] === 216 && b[b.length - 2] === 255 && b[b.length - 1] === 217;
  if (extension === '.gif') return b.length >= 7 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString('ascii')) && b[b.length - 1] === 59;
  if (extension === '.webp') return b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' && b.readUInt32LE(4) + 8 === b.length;
  if (['.woff', '.woff2', '.ttf', '.otf', '.ttc'].includes(extension)) return b.length >= 12 && (['wOFF', 'wOF2', 'OTTO', 'ttcf'].includes(b.subarray(0, 4).toString('ascii')) || b.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])));
  return false;
}

const GEMINI_TYPES = new Set(['.docx', '.pdf', '.rtf', '.tex', '.log', '.md', '.rst', '.txt', '.markdown', '.odt', '.csv', '.ods', '.xlsx', '.odp', '.pptx', '.jpg', '.png', '.svg', '.gif', '.heic', '.ico', '.jpeg', '.tif', '.webp', '.py', '.sh', '.ipynb', '.js', '.css', '.html', '.htm', '.env', '.json', '.toml', '.xml', '.yaml', '.yml']);
function assess(files: CapturedFile[]): CompatibilityReport {
  const errors: string[] = [], warnings = ['Gemini App import and task execution require verification in your eligible account. Structural checks do not prove runtime compatibility.', 'Scripts requiring external website requests are unsupported by Gemini App. Review script behavior before importing.'];
  const content = files.filter(file => !file.path.endsWith('/')), bytes = content.reduce((sum, file) => sum + file.bytes.length, 0);
  if (bytes > 100 * 1024 * 1024) errors.push('Gemini App skills must not exceed 100 MB of uploaded files.');
  for (const file of content) {
    const extension = path.posix.extname(file.path).toLowerCase() || (path.posix.basename(file.path) === '.env' ? '.env' : '');
    if (!GEMINI_TYPES.has(extension)) errors.push(`Unsupported Gemini App file type: ${file.path}. No file was removed.`);
  }
  return { target: 'gemini-app', valid: errors.length === 0, errors, warnings, fileCount: content.length, byteCount: bytes, checkedAgainst: 'Google Gemini App import requirements, checked November 3, 2026: https://support.google.com/gemini/answer/17094296?hl=en' };
}
export function assessGeminiCompatibility(releaseDirectory: string): CompatibilityReport {
  const release = verifySkillRelease(releaseDirectory); return assess(inventory(path.join(release.directory, 'source', release.skillName)));
}
export function prepareGeminiRelease(workspaceRoot: string, releaseDirectory: string): GeminiRelease {
  const { release, files } = capturedSkill(workspaceRoot, releaseDirectory), report = assess(files);
  if (!report.valid) throw new Error(report.errors.join('\n'));
  const directory = assertWorkbenchPath(workspaceRoot, path.join(workspaceRoot, 'gemini-releases', release.skillName, release.version));
  const packageName = `${release.skillName}-${release.version}-gemini.zip`, reportName = 'compatibility.json';
  const packagePath = assertWorkbenchPath(workspaceRoot, path.join(directory, packageName)), reportPath = assertWorkbenchPath(workspaceRoot, path.join(directory, reportName));
  if (fs.existsSync(directory)) {
    const bytes = fs.readFileSync(packagePath); verifyZip(bytes, release.manifest.files);
    if (!same(JSON.parse(fs.readFileSync(reportPath, 'utf8')), report) || !same(fs.readdirSync(directory).sort(), [packageName, reportName].sort())) throw new Error('Gemini export changed. Preserve it and choose a new source version.');
    return { directory, packagePath, reportPath, report, sha256: hash(bytes) };
  }
  const packed = zipBytes(files), parent = assertWorkbenchPath(workspaceRoot, path.dirname(directory)); fs.mkdirSync(parent, { recursive: true });
  const staging = assertWorkbenchPath(workspaceRoot, path.join(parent, `.preparing-${randomUUID()}`)); fs.mkdirSync(staging);
  try {
    fs.writeFileSync(path.join(staging, packageName), packed, { flag: 'wx' }); fs.writeFileSync(path.join(staging, reportName), json(report), { flag: 'wx' });
    assertWorkbenchPath(workspaceRoot, directory); finalize(staging, directory);
  } finally { if (fs.existsSync(staging)) { assertWorkbenchPath(workspaceRoot, staging); fs.rmSync(staging, { recursive: true }); } }
  return { directory, packagePath, reportPath, report, sha256: hash(packed) };
}
