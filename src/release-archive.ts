import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assertWorkbenchPath, workbenchRecovery, workbenchGitEnvironment } from './workbench-boundary.js';
import { requireWorkbench } from './workbench-setup.js';
import { listLibraryReleases } from './workbench-library.js';
import { compareReleaseVersions, semanticVersion } from './skill-identity.js';
import { verifyExportRelease } from './plugin-release.js';

type Digest = { path: string; size: number; sha256: string };
type ArchiveEntry = { kind: 'skill' | 'plugin'; name: string; version: string; directory: string; label: string; bytes: number; fileCount: number; inventory: Digest[] };
export type ReleaseArchivePlan = { root: string; entries: ArchiveEntry[]; skipped: string[] };
type ArchiveRecord = { format: 1; id: string; state: 'preparing' | 'archived' | 'restored' | 'failed'; createdAt: string; entries: Array<Pick<ArchiveEntry, 'kind' | 'name' | 'version' | 'inventory'>> };
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function rejectTracked(root: string, directory: string): void {
  let parent = directory;
  while (true) {
    const metadata = path.join(parent, '.git');
    if (fs.existsSync(metadata)) {
      if (!fs.lstatSync(metadata).isDirectory() || fs.lstatSync(metadata).isSymbolicLink()) throw new Error('Archive cannot relocate a linked worktree.');
      const relative = path.relative(parent, directory).split(path.sep).join('/');
      if (!relative) throw new Error('Archive cannot relocate an active repository.');
      let tracked: Buffer;
      try { tracked = execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', `safe.directory=${parent.split(path.sep).join('/')}`, '-C', parent, 'ls-files', '-z', '--', relative],
        { env: workbenchGitEnvironment(root), windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 }); }
      catch { throw new Error('Archive could not verify Git tracking status. Nothing was moved.'); }
      if (tracked.length) throw new Error('Archive candidate contains tracked files. Preserve it and review a separate repository migration.');
      return;
    }
    const next = path.dirname(parent); if (next === parent) return; parent = next;
  }
}
function inventory(root: string, directory: string): Digest[] {
  const files: Digest[] = [];
  function visit(folder: string): void {
    assertWorkbenchPath(root, folder);
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const target = assertWorkbenchPath(root, path.join(folder, entry.name));
      if (entry.name.toLowerCase() === '.git') throw new Error('An archive candidate contains a repository. It was not moved.');
      if (entry.isDirectory()) { files.push({ path: path.relative(directory, target).split(path.sep).join('/') + '/', size: 0, sha256: hash(Buffer.alloc(0)) }); visit(target); }
      else if (entry.isFile()) { const bytes = fs.readFileSync(target); files.push({ path: path.relative(directory, target).split(path.sep).join('/'), size: bytes.length, sha256: hash(bytes) }); }
      else throw new Error('Archive candidates must contain regular files and folders only.');
      if (files.length > 20000) throw new Error('Archive inventory exceeds the supported limit.');
    }
  }
  visit(directory); return files.sort((a, b) => a.path.localeCompare(b.path));
}
function original(root: string, entry: Pick<ArchiveEntry, 'kind' | 'name' | 'version'>): string {
  if (!['skill', 'plugin'].includes(entry.kind) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name) || !semanticVersion.test(entry.version)) throw new Error('Invalid archived release identity.');
  return assertWorkbenchPath(root, path.join(root, entry.kind === 'plugin' ? 'plugin-releases' : 'releases', entry.name, entry.version));
}
function base(root: string): string { requireWorkbench(root); return assertWorkbenchPath(root, path.join(workbenchRecovery(root), 'archived-releases')); }
function archiveRoot(root: string, id: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(id)) throw new Error('Choose a recorded archive.');
  return assertWorkbenchPath(root, path.join(base(root), id));
}
function destination(root: string, id: string, entry: Pick<ArchiveEntry, 'kind' | 'name' | 'version'>): string {
  original(root, entry);
  return assertWorkbenchPath(root, path.join(archiveRoot(root, id), entry.kind, entry.name, entry.version));
}
function saveRecord(root: string, record: ArchiveRecord): void {
  const file = assertWorkbenchPath(root, path.join(archiveRoot(root, record.id), 'receipt.json'));
  const temporary = assertWorkbenchPath(root, file + `.${randomUUID()}.tmp`);
  fs.writeFileSync(temporary, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  try { fs.renameSync(temporary, file); } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function readRecord(root: string, id: string): ArchiveRecord {
  const file = assertWorkbenchPath(root, path.join(archiveRoot(root, id), 'receipt.json'));
  const record = JSON.parse(fs.readFileSync(file, 'utf8')) as ArchiveRecord;
  if (record.format !== 1 || record.id !== id || !['preparing', 'archived', 'restored', 'failed'].includes(record.state) || !Array.isArray(record.entries) || record.entries.length > 1000) throw new Error('Archive recovery receipt is invalid.');
  const identities = new Set<string>();
  for (const entry of record.entries) {
    const key = original(root, entry); if (identities.has(key) || !Array.isArray(entry.inventory)) throw new Error('Invalid archive inventory.'); identities.add(key);
  }
  return record;
}

/** Read-only plan. Runtime data, drafts, the newest release and open PRs are never candidates. */
export function previewReleaseArchive(root: string): ReleaseArchivePlan {
  requireWorkbench(root);
  const releases = listLibraryReleases(root), entries: ArchiveEntry[] = [], skipped: string[] = [];
  for (const release of releases) {
    const kind = release.kind === 'plugin' ? 'plugin' : 'skill';
    const label = `${kind === 'plugin' ? 'Plugin' : 'Skill'} ${release.skillName} ${release.version}`;
    const latest = releases.filter(item => item.skillName === release.skillName && (item.kind === 'plugin') === (kind === 'plugin'))
      .sort((a, b) => compareReleaseVersions(b.version, a.version))[0];
    if (release.directory === latest.directory) { skipped.push(`${label}: newest saved release is retained.`); continue; }
    if (release.status === 'uploaded' && !(release.pr?.status === 'merged' && release.pr.identityVerified && release.pr.branchDeleted)) {
      skipped.push(`${label}: upload/PR remains active or cleanup is not verified. Use Check PRs first.`); continue;
    }
    const files = inventory(root, release.directory);
    rejectTracked(root, release.directory);
    entries.push({ kind, name: release.skillName, version: release.version, directory: release.directory, label,
      inventory: files, fileCount: files.filter(file => !file.path.endsWith('/')).length, bytes: files.reduce((total, file) => total + file.size, 0) });
  }
  return { root: path.resolve(root), entries, skipped };
}

/** Execute only the host-held reviewed plan, retaining a hash receipt and rollback. */
export function archiveReviewedReleases(root: string, plan: ReleaseArchivePlan): string {
  requireWorkbench(root);
  if (path.resolve(root) !== plan.root || !plan.entries.length) throw new Error('Review an eligible release archive plan first.');
  const fresh = previewReleaseArchive(root);
  if (!same(fresh.entries, plan.entries)) throw new Error('Saved releases changed after the archive preview. Review a fresh inventory; nothing was moved.');
  const id = randomUUID(), target = archiveRoot(root, id); fs.mkdirSync(target, { recursive: true });
  const record: ArchiveRecord = { format: 1, id, state: 'preparing', createdAt: new Date().toISOString(), entries: plan.entries.map(({ kind, name, version, inventory }) => ({ kind, name, version, inventory })) };
  saveRecord(root, record); const moved: ArchiveEntry[] = [];
  try {
    for (const entry of plan.entries) {
      const source = original(root, entry), archived = destination(root, id, entry);
      rejectTracked(root, source);
      if (!same(inventory(root, source), entry.inventory)) throw new Error('A release changed before archiving.');
      assertWorkbenchPath(root, source); fs.mkdirSync(path.dirname(archived), { recursive: true });
      fs.renameSync(source, archived); moved.push(entry);
      if (!same(inventory(root, archived), entry.inventory)) throw new Error('Archived bytes differ from the reviewed inventory.');
      verifyExportRelease(archived);
    }
    record.state = 'archived'; saveRecord(root, record); return id;
  } catch (error) {
    for (const entry of moved.reverse()) {
      const source = original(root, entry), archived = destination(root, id, entry);
      if (fs.existsSync(source)) throw new Error('Archive rollback needs manual recovery; both paths are preserved in the receipt.');
      assertWorkbenchPath(root, archived); fs.mkdirSync(path.dirname(source), { recursive: true }); fs.renameSync(archived, source);
    }
    record.state = 'failed'; saveRecord(root, record); throw error;
  }
}

export function listReleaseArchives(root: string): { id: string; label: string }[] {
  const folder = base(root); if (!fs.existsSync(folder)) return [];
  const results: { id: string; label: string }[] = [];
  for (const id of fs.readdirSync(folder)) {
    try {
      const record = readRecord(root, id);
      if (record.state !== 'restored') results.push({ id, label: `${record.state === 'archived' ? 'Archived' : 'Recovery needed'}: ${record.entries.length} release(s), ${record.createdAt}` });
    } catch {
      // An interrupted first receipt write or damaged record must remain visible.
      // Restore will refuse it without a valid manifest; nothing is guessed/deleted.
      archiveRoot(root, id);
      results.push({ id, label: 'Recovery receipt needs attention. Inspect this archive before moving any files.' });
    }
  }
  return results;
}

/** Restore refuses every collision before moving any archived release. */
export function restoreReleaseArchive(root: string, id: string): void {
  const record = readRecord(root, id); if (record.state === 'restored') throw new Error('This archive was already restored.');
  const pending: typeof record.entries = [];
  for (const entry of record.entries) {
    const source = original(root, entry), archived = destination(root, id, entry);
    rejectTracked(root, source);
    const sourceExists = fs.existsSync(source), archivedExists = fs.existsSync(archived);
    if (sourceExists) {
      if (!same(inventory(root, source), entry.inventory)) throw new Error('A release already occupies an original path. Both copies are preserved; restore cannot overwrite it.');
      verifyExportRelease(source);
    }
    if (archivedExists) {
      if (!same(inventory(root, archived), entry.inventory)) throw new Error('Archive integrity check failed. Nothing was restored.');
      verifyExportRelease(archived);
    }
    if (!sourceExists && !archivedExists) throw new Error('A recorded release is missing from both original and archive paths. Inspect the recovery receipt.');
    if (!sourceExists) pending.push(entry);
  }
  const restored: typeof record.entries = [];
  try {
    for (const entry of pending) {
      const source = original(root, entry), archived = destination(root, id, entry);
      assertWorkbenchPath(root, source); fs.mkdirSync(path.dirname(source), { recursive: true }); fs.renameSync(archived, source); restored.push(entry);
    }
    record.state = 'restored'; saveRecord(root, record);
  } catch (error) {
    for (const entry of restored.reverse()) fs.renameSync(original(root, entry), destination(root, id, entry));
    throw error;
  }
}
