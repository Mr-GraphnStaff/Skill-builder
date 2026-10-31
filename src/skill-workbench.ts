import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import AdmZip from 'adm-zip';
import { isUtf8 } from 'node:buffer';
import { measureWorkbenchPhase, type WorkbenchMetricSink } from './workbench-metrics.js';

const yaml: { load(value: string): unknown } = require('js-yaml');
const LIMITS = { entries: 4096, file: 16 * 1024 * 1024, total: 128 * 1024 * 1024, archive: 64 * 1024 * 1024 };
export type FileDigest = { path: string; size: number; sha256: string };
export type WorkbenchSkill = { id: string; name: string; sourcePath: string; originalPackagePath?: string; repository?: string; baseBranch?: string };
export type ValidationReport = { valid: boolean; errors: string[]; warnings: string[]; files: FileDigest[] };
export type ReleaseManifest = { version: string; skillName: string; createdAt: string; files: FileDigest[]; originalSha256?: string; packageSha256: string; changelogSha256: string };
export type WorkbenchRelease = { directory: string; version: string; skillName: string; packagePath: string; manifest: ReleaseManifest };
export type OpenedSkillPackage = { skill: WorkbenchSkill; manifestContent: string; files: Array<{ path: string; size: number; text: boolean }> };
type Payload = { relative: string; bytes: Buffer; directory?: boolean };

function hash(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function renameWithRetry(source: string, destination: string): void {
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(source, destination); return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== 'win32' || attempt >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '')) throw error;
      // Windows indexers/antivirus can briefly hold freshly written folders.
      // Keep the retry bounded to 250ms; persistent failures retain data.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
    }
  }
}
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function skillName(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 64) throw new Error('Skill name must be lowercase kebab-case, at most 64 characters.');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)) throw new Error('Skill name is reserved by the filesystem.');
  return value;
}
function safeRelative(value: string): string {
  if (!value || value.includes('\\') || value.startsWith('/') || value.includes(':') || /[\x00-\x1f]/.test(value)) throw new Error(`Unsafe archive path: ${value}`);
  const clean = value.replace(/\/$/, '');
  const parts = clean.split('/');
  if (value.length > 1024 || parts.length > 64) throw new Error('Archive path exceeds depth or length limits.');
  if (parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /[<>"|?*]/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error(`Unsafe archive path: ${value}`);
  return clean;
}
function inside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}
function guarded(root: string, target: string): void {
  if (!inside(root, target)) throw new Error('Path leaves the workbench workspace.');
  let current = path.resolve(root);
  const relative = path.relative(current, path.resolve(target));
  for (const piece of ['', ...relative.split(path.sep).filter(Boolean)]) {
    if (piece) current = path.join(current, piece);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`Links are not allowed: ${current}`);
  }
}
function control(root: string): string { return path.join(path.resolve(root), '.skill-workbench'); }
function readCatalog(root: string): WorkbenchSkill[] {
  const file = path.join(control(root), 'catalog.json');
  guarded(root, file);
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { version: number; skills: WorkbenchSkill[] };
  if (parsed.version !== 1 || !Array.isArray(parsed.skills)) throw new Error('Unsupported workbench catalog.');
  for (const record of parsed.skills) { skillName(record.id); skillName(record.name); if (!inside(root, record.sourcePath)) throw new Error('Catalog source is outside the workspace.'); }
  return parsed.skills;
}
function saveCatalog(root: string, skills: WorkbenchSkill[]): void {
  const folder = control(root); guarded(root, folder); fs.mkdirSync(folder, { recursive: true });
  const target = path.join(folder, 'catalog.json'); guarded(root, target);
  const temp = path.join(folder, `catalog-${randomUUID()}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify({ version: 1, skills }, null, 2)}\n`, { flag: 'wx' });
  try { renameWithRetry(temp, target); } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function metadata(bytes: Buffer): { name: string; description: string } {
  if (!isUtf8(bytes) || bytes.includes(0)) throw new Error('SKILL.md must contain valid UTF-8 text.');
  const text = bytes.toString('utf8');
  const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!frontmatter) throw new Error('SKILL.md must begin with YAML frontmatter.');
  let data: unknown;
  try { data = yaml.load(frontmatter[1]); } catch { throw new Error('SKILL.md contains invalid YAML frontmatter.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Skill frontmatter must be a YAML mapping.');
  const values = data as Record<string, unknown>;
  const name = skillName(values.name);
  if (typeof values.description !== 'string' || !values.description.trim() || values.description.trim().length > 1024) throw new Error('Skill description must be a nonempty string of at most 1024 characters.');
  return { name, description: values.description };
}
function checkPaths(entries: Array<{ relative: string; directory: boolean }>): void {
  const names = new Map<string, { spelling: string; directory: boolean }>();
  const explicit = new Set<string>();
  for (const entry of entries) {
    const relative = safeRelative(entry.relative);
    const key = relative.toLowerCase();
    if (explicit.has(key)) throw new Error(`Duplicate archive path: ${relative}`);
    explicit.add(key);
    const parts = relative.split('/');
    for (let index = 0; index < parts.length; index++) {
      const spelling = parts.slice(0, index + 1).join('/');
      const directory = index < parts.length - 1 || entry.directory;
      const existing = names.get(spelling.toLowerCase());
      if (existing && (existing.spelling !== spelling || existing.directory !== directory)) throw new Error(`Case or file/directory collision: ${spelling}`);
      names.set(spelling.toLowerCase(), { spelling, directory });
    }
  }
}
function readArchive(bytes: Buffer, onMetric?: WorkbenchMetricSink): Payload[] {
  return measureWorkbenchPhase('archiveValidation', onMetric, () => decodeArchive(bytes, onMetric), { byteCount: bytes.length });
}
function decodeArchive(bytes: Buffer, onMetric?: WorkbenchMetricSink): Payload[] {
  if (bytes.length > LIMITS.archive) throw new Error('Archive exceeds the compressed-size limit.');
  const zip = new AdmZip(bytes);
  const entries = zip.getEntries();
  if (!entries.length || entries.length > LIMITS.entries) throw new Error('Archive entry count exceeds limits or is empty.');
  const paths = entries.map(entry => ({ relative: entry.entryName, directory: entry.isDirectory }));
  checkPaths(paths);
  let declared = 0;
  for (const entry of entries) {
    const unixType = (entry.attr >>> 16) & 0xf000;
    if (unixType && unixType !== 0x8000 && unixType !== 0x4000) throw new Error(`Archive links or special files are forbidden: ${entry.entryName}`);
    if (entry.header.flags & 1) throw new Error('Encrypted archives are not supported.');
    declared += entry.header.size;
    if (entry.header.size > LIMITS.file || declared > LIMITS.total) throw new Error('Archive expanded size exceeds limits.');
  }
  const files: Payload[] = [];
  let actual = 0;
  measureWorkbenchPhase('archiveDecode', onMetric, () => { for (const entry of entries.filter(item => !item.isDirectory)) {
    if (entry.header.method !== 0 && entry.header.method !== 8) throw new Error('Only stored and deflated ZIP entries are supported.');
    const compressed = entry.getCompressedData();
    const data = entry.header.method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: LIMITS.file });
    actual += data.length;
    if (data.length !== entry.header.size || data.length > LIMITS.file || actual > LIMITS.total) throw new Error('Archive size does not match its manifest or exceeds limits.');
    if (crc32(data) !== (entry.header.crc >>> 0)) throw new Error(`Archive integrity check failed: ${entry.entryName}`);
    files.push({ relative: entry.entryName, bytes: data });
  } }, { fileCount: entries.filter(item => !item.isDirectory).length });
  const rootManifest = files.find(file => file.relative === 'SKILL.md');
  let prefix = '';
  if (!rootManifest) {
    const top = new Set(files.map(file => file.relative.split('/')[0]));
    if (top.size !== 1) throw new Error('Archive must contain one unambiguous skill root.');
    prefix = `${[...top][0]}/`;
  }
  const manifest = files.find(file => file.relative === `${prefix}SKILL.md`);
  if (!manifest || (prefix && entries.some(entry => !entry.entryName.startsWith(prefix)))) throw new Error('Archive must contain one canonical SKILL.md at an unambiguous skill root.');
  const meta = metadata(manifest.bytes);
  if (prefix && prefix !== `${meta.name}/`) throw new Error('Archive skill folder must match the frontmatter name.');
  const payload = files.map(file => ({ relative: file.relative.slice(prefix.length), bytes: file.bytes }));
  const directories = entries.filter(entry => entry.isDirectory && entry.entryName !== prefix)
    .map(entry => ({ relative: entry.entryName.slice(prefix.length), bytes: Buffer.alloc(0), directory: true }));
  return [...payload, ...directories].sort((a, b) => a.relative.localeCompare(b.relative));
}
function sourceFiles(source: string): Payload[] {
  const files: Payload[] = [];
  let total = 0;
  let count = 0;
  function visit(directory: string): void {
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Source links are not allowed.');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.toLowerCase() === '.git') continue;
      if (++count > LIMITS.entries) throw new Error('Source entries exceed packaging limits.');
      const full = path.join(directory, entry.name);
      const relative = path.relative(source, full).split(path.sep).join('/');
      safeRelative(relative);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`Source links or special files are forbidden: ${relative}`);
      if (stat.isDirectory()) { files.push({ relative: `${relative}/`, bytes: Buffer.alloc(0), directory: true }); visit(full); }
      else {
        total += stat.size;
        if (stat.size > LIMITS.file || total > LIMITS.total || files.length >= LIMITS.entries) throw new Error('Source files exceed packaging limits.');
        files.push({ relative, bytes: fs.readFileSync(full) });
      }
    }
  }
  visit(source);
  if (files.length > LIMITS.entries) throw new Error('Source entries exceed packaging limits.');
  checkPaths(files.map(file => ({ relative: file.relative, directory: !!file.directory })));
  return files.sort((a, b) => a.relative.localeCompare(b.relative));
}
function digests(files: Payload[]): FileDigest[] { return files.map(file => ({ path: file.relative, size: file.bytes.length, sha256: hash(file.bytes) })); }
function writeFiles(target: string, files: Payload[], onMetric?: WorkbenchMetricSink): void {
  measureWorkbenchPhase('extractWrite', onMetric, () => {
  const created = new Set<string>();
  const directory = (folder: string) => {
    const full = path.resolve(folder);
    if (!created.has(full)) { fs.mkdirSync(full, { recursive: true }); created.add(full); }
  };
  directory(target);
  for (const file of files) {
    const destination = path.join(target, ...file.relative.split('/'));
    if (file.directory) directory(destination);
    else { directory(path.dirname(destination)); fs.writeFileSync(destination, file.bytes, { flag: 'wx' }); }
  }
  }, { fileCount: files.filter(file => !file.directory).length, byteCount: files.reduce((sum, file) => sum + file.bytes.length, 0) });
}
function insertSkill(root: string, files: Payload[], original?: Buffer, replaceExisting = false, onMetric?: WorkbenchMetricSink): WorkbenchSkill {
  const manifest = files.find(file => file.relative === 'SKILL.md');
  if (!manifest) throw new Error('No canonical SKILL.md found.');
  const name = metadata(manifest.bytes).name;
  const catalog = readCatalog(root);
  const sourcePath = path.join(path.resolve(root), 'skills', name);
  guarded(root, sourcePath);
  const existing = catalog.find(record => record.id === name);
  if (!replaceExisting && (existing || fs.existsSync(sourcePath))) throw new Error(`Skill already exists: ${name}. Existing files were preserved.`);
  const state = control(root); guarded(root, state); fs.mkdirSync(state, { recursive: true });
  const staging = fs.mkdtempSync(path.join(state, 'import-'));
  let sourceMoved = false;
  let backup: string | undefined;
  let importedInventory: FileDigest[] = [];
  try {
    writeFiles(path.join(staging, name), files, onMetric);
    importedInventory = measureWorkbenchPhase('extractedReadback', onMetric, () => digests(sourceFiles(path.join(staging, name))), { fileCount: files.filter(file => !file.directory).length });
    const record: WorkbenchSkill = { ...existing, id: name, name, sourcePath };
    delete record.originalPackagePath;
    if (original) {
      measureWorkbenchPhase('originalPreservation', onMetric, () => {
      const originalPath = path.join(state, name, 'originals', `${hash(original)}.skill`);
      guarded(root, originalPath); fs.mkdirSync(path.dirname(originalPath), { recursive: true });
      if (fs.existsSync(originalPath)) { if (hash(fs.readFileSync(originalPath)) !== hash(original)) throw new Error('Stored original hash mismatch.'); }
      else fs.writeFileSync(originalPath, original, { flag: 'wx' });
      record.originalPackagePath = originalPath;
      }, { byteCount: original.length });
    }
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    if (fs.existsSync(sourcePath)) {
      backup = path.join(state, 'replaced', randomUUID(), 'skills', name);
      guarded(root, backup); fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.writeFileSync(path.join(path.dirname(backup), 'catalog-record.json'), JSON.stringify(existing ?? null));
      renameWithRetry(sourcePath, backup);
    }
    renameWithRetry(path.join(staging, name), sourcePath);
    sourceMoved = true;
    measureWorkbenchPhase('catalogWrite', onMetric, () => saveCatalog(root, [...catalog.filter(item => item.id !== name), record]));
    return record;
  } catch (error) {
    if (sourceMoved) {
      try {
        if (JSON.stringify(digests(sourceFiles(sourcePath))) !== JSON.stringify(importedInventory)) {
          throw new Error('The extracted source changed after import.');
        }
        renameWithRetry(sourcePath, path.join(staging, name));
      } catch (rollbackError) {
        throw new Error(`Import registration failed. The extracted copy was retained at ${sourcePath}; use Manage Skill Folder to recover it. Original input was preserved. Rollback: ${String(rollbackError)}. Initial failure: ${String(error)}`);
      }
    }
    if (backup) renameWithRetry(backup, sourcePath);
    throw error;
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}
function importPackageData(packagePath: string, workspaceRoot: string, replaceExisting: boolean, onMetric?: WorkbenchMetricSink): { skill: WorkbenchSkill; files: Payload[] } {
  if (path.extname(packagePath).toLowerCase() !== '.skill') throw new Error('Select a .skill package.');
  const packageSize = fs.statSync(packagePath).size;
  if (packageSize > LIMITS.archive) throw new Error('Archive exceeds the compressed-size limit.');
  const bytes = measureWorkbenchPhase('archiveRead', onMetric, () => fs.readFileSync(packagePath), { byteCount: packageSize });
  const files = readArchive(bytes, onMetric);
  return { skill: insertSkill(workspaceRoot, files, bytes, replaceExisting, onMetric), files };
}
export function importSkillPackage(packagePath: string, workspaceRoot: string, replaceExisting = false): WorkbenchSkill {
  return importPackageData(packagePath, workspaceRoot, replaceExisting).skill;
}
/** Reuse already validated package bytes for the first editor frame only.
 * Editing and publication still recheck the current saved source independently. */
export function openSkillPackage(packagePath: string, workspaceRoot: string, replaceExisting = false, onMetric?: WorkbenchMetricSink): OpenedSkillPackage {
  const { skill, files } = importPackageData(packagePath, workspaceRoot, replaceExisting, onMetric);
  return measureWorkbenchPhase('editorPreview', onMetric, () => ({ skill, manifestContent: files.find(file => file.relative === 'SKILL.md')!.bytes.toString('utf8'),
    files: files.filter(file => !file.directory && !file.relative.split('/').some(part => part === '.git' || part === 'node_modules'))
      .map(file => ({ path: file.relative, size: file.bytes.length, text: isUtf8(file.bytes) && !file.bytes.includes(0) }))
      .sort((a, b) => a.path === 'SKILL.md' ? -1 : b.path === 'SKILL.md' ? 1 : a.path.localeCompare(b.path)) }), { fileCount: files.filter(file => !file.directory).length });
}
export function registerSkillFolder(workspaceRoot: string, sourcePath: string, replaceExisting = false): WorkbenchSkill {
  sourcePath = path.resolve(sourcePath);
  const files = sourceFiles(sourcePath);
  const manifest = files.find(file => file.relative === 'SKILL.md');
  if (!manifest) throw new Error('Folder must contain SKILL.md.');
  const name = metadata(manifest.bytes).name;
  const canonical = path.join(path.resolve(workspaceRoot), 'skills', name);
  if (path.relative(canonical, sourcePath) !== '') return insertSkill(workspaceRoot, files, undefined, replaceExisting);
  guarded(workspaceRoot, sourcePath);
  const catalog = readCatalog(workspaceRoot);
  const existing = catalog.find(record => record.id === name);
  if (existing) return existing;
  const record = { id: name, name, sourcePath };
  saveCatalog(workspaceRoot, [...catalog, record]); return record;
}
export function listWorkbenchSkills(workspaceRoot: string): WorkbenchSkill[] { return readCatalog(workspaceRoot); }

/** Start a new editable draft from a verified local release without changing
 * the immutable release or replacing the originally imported archive. */
export function restoreSkillRelease(workspaceRoot: string, directory: string): WorkbenchSkill {
  guarded(workspaceRoot, directory);
  const release = verifySkillRelease(directory);
  const expected = path.join(path.resolve(workspaceRoot), 'releases', release.skillName, release.version);
  if (path.relative(expected, path.resolve(directory)) !== '') throw new Error('Choose a release from this workspace library.');
  const original = release.manifest.originalSha256 ? fs.readFileSync(path.join(directory, 'original.skill')) : undefined;
  return insertSkill(workspaceRoot, sourceFiles(path.join(directory, 'source', release.skillName)), original);
}
export function updateSkillRepository(workspaceRoot: string, id: string, repository: string, branch: string): WorkbenchSkill {
  if (!repository.trim() || /[\r\n\x00]/.test(repository) || repository.startsWith('-')) throw new Error('Repository is required.');
  if (!branch.trim() || /[\s~^:?*\[\\]/.test(branch) || branch.startsWith('-') || branch.includes('..') || branch.includes('@{')) throw new Error('A valid base branch is required.');
  const catalog = readCatalog(workspaceRoot); const record = catalog.find(item => item.id === id);
  if (!record) throw new Error('Unknown workbench skill.');
  record.repository = repository.trim(); record.baseBranch = branch.trim(); saveCatalog(workspaceRoot, catalog); return record;
}
export function validateWorkbenchSkill(record: WorkbenchSkill): ValidationReport {
  const errors: string[] = []; const warnings: string[] = []; let files: Payload[] = [];
  try {
    files = sourceFiles(record.sourcePath);
    const manifest = files.find(file => file.relative === 'SKILL.md');
    if (!manifest) throw new Error('SKILL.md is missing.');
    if (metadata(manifest.bytes).name !== record.name || path.basename(record.sourcePath) !== record.name) throw new Error('Skill name, catalog identity and source folder must match.');
    // This is a structural sanity check, not a content/security scanner.
    // sourceFiles and metadata enforce the file, path, size and identity
    // contracts. Supporting files need no prescribed names or direct links.
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return { valid: errors.length === 0, errors, warnings, files: digests(files) };
}
function checkVersion(version: string): void {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)) throw new Error('Version must be strict semantic versioning, for example 1.2.0.');
}
function validateOriginalArchive(original: Buffer, name: string): void {
  const originalFiles = readArchive(original);
  const originalManifest = originalFiles.find(file => file.relative === 'SKILL.md');
  if (!originalManifest || metadata(originalManifest.bytes).name !== name) throw new Error('Original package skill identity mismatch.');
  // Immutable originals retain the same archive and metadata boundaries as
  // imports. Their illustrative text must not introduce a separate scanner gate.
}
export function prepareSkillRelease(workspaceRoot: string, id: string, version: string, changelog: string, replaceExisting = false): WorkbenchRelease {
  checkVersion(version);
  if (!changelog.trim()) throw new Error('A per-version changelog is required.');
  const record = readCatalog(workspaceRoot).find(item => item.id === id);
  if (!record) throw new Error('Unknown workbench skill.');
  guarded(workspaceRoot, record.sourcePath);
  const validation = validateWorkbenchSkill(record);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const files = sourceFiles(record.sourcePath);
  if (JSON.stringify(digests(files)) !== JSON.stringify(validation.files)) throw new Error('Source changed during validation. Save your files and prepare the release again.');
  const directory = path.join(path.resolve(workspaceRoot), 'releases', record.name, version);
  guarded(workspaceRoot, directory);
  if (fs.existsSync(directory)) {
    if (!replaceExisting) throw new Error(`Version ${version} already exists. Past releases are immutable.`);
    const backup = path.join(control(workspaceRoot), 'replaced', randomUUID(), record.name, version);
    guarded(workspaceRoot, backup); fs.mkdirSync(path.dirname(backup), { recursive: true });
    const moved: Array<[string, string]> = [];
    try {
      for (const [source, target] of [
        [directory, backup],
        ...['publications', 'pull-requests'].map(kind => [path.join(control(workspaceRoot), kind, record.name, `${version}.json`), path.join(path.dirname(backup), `${version}-${kind}.json`)]),
        [path.join(control(workspaceRoot), 'completed', record.name, version), path.join(path.dirname(backup), `${version}-completed`)]
      ]) {
        guarded(workspaceRoot, source); guarded(workspaceRoot, target);
        if (fs.existsSync(source)) { renameWithRetry(source, target); moved.push([source, target]); }
      }
      return prepareSkillRelease(workspaceRoot, id, version, changelog);
    } catch (error) {
      for (const [source, target] of moved.reverse()) renameWithRetry(target, source);
      throw error;
    }
  }
  const parent = path.dirname(directory); fs.mkdirSync(parent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(parent, '.preparing-'));
  try {
    const packageName = `${record.name}-${version}.skill`;
    const packagePath = path.join(staging, packageName);
    const zip = new AdmZip();
    for (const file of files) zip.addFile(`${record.name}/${file.relative}`, file.bytes);
    zip.writeZip(packagePath);
    const packed = fs.readFileSync(packagePath);
    const reopened = readArchive(packed).sort((a, b) => a.relative.localeCompare(b.relative));
    if (JSON.stringify(digests(reopened)) !== JSON.stringify(digests(files))) throw new Error('Repacked archive failed byte-for-byte roundtrip verification.');
    writeFiles(path.join(staging, 'source', record.name), files);
    const changelogBytes = Buffer.from(`${changelog.trim()}\n`, 'utf8');
    const manifest: ReleaseManifest = { version, skillName: record.name, createdAt: new Date().toISOString(), files: digests(files), packageSha256: hash(packed), changelogSha256: hash(changelogBytes) };
    if (record.originalPackagePath) {
      guarded(workspaceRoot, record.originalPackagePath);
      const original = fs.readFileSync(record.originalPackagePath);
      const expected = path.basename(record.originalPackagePath, '.skill');
      if (hash(original) !== expected) throw new Error('Immutable original package was modified.');
      validateOriginalArchive(original, record.name);
      fs.writeFileSync(path.join(staging, 'original.skill'), original, { flag: 'wx' }); manifest.originalSha256 = hash(original);
    }
    fs.writeFileSync(path.join(staging, 'CHANGELOG.md'), changelogBytes, { flag: 'wx' });
    fs.writeFileSync(path.join(staging, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    renameWithRetry(staging, directory);
    return { directory, version, skillName: record.name, packagePath: path.join(directory, packageName), manifest };
  } finally { if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true }); }
}
export function listSkillReleases(workspaceRoot: string, id: string): WorkbenchRelease[] {
  const record = readCatalog(workspaceRoot).find(item => item.id === id);
  if (!record) throw new Error('Unknown workbench skill.');
  const folder = path.join(path.resolve(workspaceRoot), 'releases', record.name); guarded(workspaceRoot, folder);
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => {
    checkVersion(entry.name); const directory = path.join(folder, entry.name); guarded(workspaceRoot, directory);
    return verifySkillRelease(directory);
  });
}

export function verifySkillRelease(directory: string): WorkbenchRelease {
  directory = path.resolve(directory); guarded(directory, directory);
  const manifestPath = path.join(directory, 'release.json'); guarded(directory, manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ReleaseManifest;
  const name = skillName(manifest.skillName); checkVersion(manifest.version);
  if (path.basename(directory) !== manifest.version || path.basename(path.dirname(directory)) !== name) throw new Error('Release identity does not match its directory.');
  if (!Array.isArray(manifest.files) || !/^[a-f0-9]{64}$/.test(manifest.packageSha256) || !/^[a-f0-9]{64}$/.test(manifest.changelogSha256)) throw new Error('Release manifest is missing valid content hashes.');
  const source = path.join(directory, 'source', name); guarded(directory, source);
  const record = { id: name, name, sourcePath: source };
  const validation = validateWorkbenchSkill(record);
  if (!validation.valid) throw new Error(`Release validation failed: ${validation.errors.join('; ')}`);
  if (JSON.stringify(validation.files) !== JSON.stringify(manifest.files)) throw new Error('Release source inventory does not match its manifest.');
  const packagePath = path.join(directory, `${name}-${manifest.version}.skill`); guarded(directory, packagePath);
  if (fs.statSync(packagePath).size > LIMITS.archive) throw new Error('Release package exceeds archive size limits.');
  const packageBytes = fs.readFileSync(packagePath);
  if (hash(packageBytes) !== manifest.packageSha256) throw new Error('Release package hash mismatch.');
  if (JSON.stringify(digests(readArchive(packageBytes))) !== JSON.stringify(manifest.files)) throw new Error('Release package differs from its source snapshot.');
  const changelogPath = path.join(directory, 'CHANGELOG.md'); guarded(directory, changelogPath);
  if (hash(fs.readFileSync(changelogPath)) !== manifest.changelogSha256) throw new Error('Release changelog hash mismatch.');
  const originalPath = path.join(directory, 'original.skill'); guarded(directory, originalPath);
  if (manifest.originalSha256) {
    if (fs.statSync(originalPath).size > LIMITS.archive) throw new Error('Original package exceeds archive size limits.');
    const original = fs.readFileSync(originalPath);
    if (hash(original) !== manifest.originalSha256) throw new Error('Original package hash mismatch.');
    validateOriginalArchive(original, name);
  } else if (fs.existsSync(originalPath)) throw new Error('Unexpected original package is absent from the release manifest.');
  const expectedEntries = new Set(['source', 'release.json', 'CHANGELOG.md', path.basename(packagePath), ...(manifest.originalSha256 ? ['original.skill'] : [])]);
  if (fs.readdirSync(directory).some(entry => !expectedEntries.has(entry))) throw new Error('Unexpected file in prepared release.');
  const sourceEntries = fs.readdirSync(path.join(directory, 'source'));
  if (sourceEntries.length !== 1 || sourceEntries[0] !== name) throw new Error('Unexpected content beside the release source snapshot.');
  return { directory, version: manifest.version, skillName: name, packagePath, manifest };
}

/** Call only after the publisher has verified the remote commit. This method
 * checks the published snapshot and retains newer local edits instead of
 * treating a successful push as permission to discard them. */
export function completeWorkbenchSkill(workspaceRoot: string, id: string, releaseDirectory: string): { archivedPath: string; sourceRetained: boolean } {
  const catalog = readCatalog(workspaceRoot);
  const record = catalog.find(item => item.id === id);
  if (!record) throw new Error('Unknown active workbench skill.');
  const release = path.resolve(releaseDirectory);
  const version = path.basename(release); checkVersion(version);
  const expected = path.join(path.resolve(workspaceRoot), 'releases', record.name, version);
  if (path.relative(expected, release) !== '') throw new Error('Release does not belong to this workbench skill.');
  guarded(workspaceRoot, release);
  const { manifest } = verifySkillRelease(release);
  if (manifest.skillName !== record.name || manifest.version !== version) throw new Error('Release identity mismatch.');
  guarded(workspaceRoot, record.sourcePath);
  if (JSON.stringify(digests(sourceFiles(record.sourcePath))) !== JSON.stringify(manifest.files)) {
    throw new Error('Published, but local edits made since release preparation were retained. The skill remains active; prepare a new version before completing it.');
  }
  const canonicalSource = path.join(path.resolve(workspaceRoot), 'skills', record.name);
  const sourceRetained = path.relative(canonicalSource, path.resolve(record.sourcePath)) !== '';
  const archivedPath = path.join(control(workspaceRoot), 'completed', record.id, version);
  guarded(workspaceRoot, archivedPath);
  // Repeated use of a chosen version creates another recoverable session.
  const parent = path.dirname(archivedPath); fs.mkdirSync(parent, { recursive: true });
  const sessionPath = path.join(path.resolve(workspaceRoot), 'workbench', record.id); guarded(workspaceRoot, sessionPath);
  const staging = fs.mkdtempSync(path.join(parent, '.completing-'));
  let sourceMoved = false;
  let backup: string | undefined;
  let sessionMoved = false;
  let archiveMoved = false;
  try {
    fs.writeFileSync(path.join(staging, 'record.json'), `${JSON.stringify({ completedAt: new Date().toISOString(), record, releaseDirectory: release, sourceRetained }, null, 2)}\n`, { flag: 'wx' });
    fs.writeFileSync(path.join(staging, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    if (fs.existsSync(sessionPath)) { renameWithRetry(sessionPath, path.join(staging, 'session')); sessionMoved = true; }
    if (!sourceRetained) { renameWithRetry(record.sourcePath, path.join(staging, 'source')); sourceMoved = true; }
    if (fs.existsSync(archivedPath)) {
      backup = path.join(control(workspaceRoot), 'replaced', randomUUID(), 'completed', record.id, version);
      guarded(workspaceRoot, backup); fs.mkdirSync(path.dirname(backup), { recursive: true });
      renameWithRetry(archivedPath, backup);
    }
    renameWithRetry(staging, archivedPath); archiveMoved = true;
    // Catalog removal is the final mutation; any earlier failure leaves the
    // session discoverable, and a failed catalog write restores moved source.
    saveCatalog(workspaceRoot, catalog.filter(item => item.id !== id));
    return { archivedPath, sourceRetained };
  } catch (error) {
    const archiveRoot = archiveMoved ? archivedPath : staging;
    try {
      if (sourceMoved) { renameWithRetry(path.join(archiveRoot, 'source'), record.sourcePath); sourceMoved = false; }
      if (sessionMoved) { renameWithRetry(path.join(archiveRoot, 'session'), sessionPath); sessionMoved = false; }
    } catch (restoreError) { throw new Error(`Completion failed; the active catalog was retained. Work is recoverable at ${archiveRoot}. Restore failed: ${String(restoreError)}. Original error: ${String(error)}`); }
    if (fs.existsSync(archiveRoot)) { guarded(workspaceRoot, archiveRoot); fs.rmSync(archiveRoot, { recursive: true, force: true }); }
    if (backup && fs.existsSync(backup)) renameWithRetry(backup, archivedPath);
    throw error;
  } finally {
    if (!sourceMoved && !sessionMoved && fs.existsSync(staging)) { guarded(workspaceRoot, staging); fs.rmSync(staging, { recursive: true, force: true }); }
  }
}
