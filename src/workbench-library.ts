import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { verifySkillRelease, restoreSkillRelease, updateSkillRepository, WorkbenchSkill } from './skill-workbench.js';

type Publication = { repository: string; branch: string; commit: string; baseBranch?: string; publishedAt?: string };
export type LibraryRelease = {
  skillName: string; version: string; directory: string; packagePath: string;
  status: 'uploaded' | 'archived' | 'prepared';
  repository?: string; baseBranch?: string; branch?: string; commit?: string; publishedAt?: string;
};
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function safe(root: string, target: string): void {
  root = path.resolve(root); target = path.resolve(target);
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Library path leaves this workspace.');
  let current = root;
  for (const part of ['', ...relative.split(path.sep).filter(Boolean)]) {
    if (part) current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Library paths cannot contain symbolic links.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
function localRelease(root: string, directory: string) {
  safe(root, directory);
  const release = verifySkillRelease(directory);
  if (path.relative(path.join(path.resolve(root), 'releases', release.skillName, release.version), path.resolve(directory)) !== '') throw new Error('Release is outside this workspace library.');
  return release;
}
function receiptPath(root: string, name: string, version: string) {
  const target = path.join(path.resolve(root), '.skill-workbench', 'publications', name, `${version}.json`);
  safe(root, target); return target;
}
function publication(value: unknown): Publication {
  const p = value as Publication;
  if (!p || typeof p.repository !== 'string' || !p.repository.trim() || /[\r\n\0]/.test(p.repository)
    || typeof p.branch !== 'string' || !p.branch.trim() || /[\r\n\0]/.test(p.branch)
    || typeof p.commit !== 'string' || !/^[a-f0-9]{40,64}$/i.test(p.commit)
    || (p.baseBranch !== undefined && (typeof p.baseBranch !== 'string' || !p.baseBranch.trim() || /[\r\n\0]/.test(p.baseBranch)))
    || (p.publishedAt !== undefined && (typeof p.publishedAt !== 'string' || !Number.isFinite(Date.parse(p.publishedAt))))) throw new Error('Invalid publication receipt.');
  // Local receipts are data: unknown fields cannot replace the verified
  // release identity, paths, or status when incorporated into the library.
  return { repository: p.repository, branch: p.branch, commit: p.commit,
    ...(p.baseBranch === undefined ? {} : { baseBranch: p.baseBranch }),
    ...(p.publishedAt === undefined ? {} : { publishedAt: p.publishedAt }) };
}

/** Persist only after the publisher confirms the exact remote commit. Kept
 * outside the immutable release, so publishing never changes release bytes. */
export function recordLibraryPublication(root: string, directory: string, result: Publication): void {
  const release = localRelease(root, directory);
  const data = publication(result);
  const target = receiptPath(root, release.skillName, release.version);
  if (fs.existsSync(target)) {
    const previous = publication(JSON.parse(fs.readFileSync(target, 'utf8')));
    if (previous.commit !== data.commit || previous.repository !== data.repository || previous.branch !== data.branch) throw new Error('A different publication is already recorded for this version.');
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ ...data, publishedAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
  try { fs.renameSync(temporary, target); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

export function listLibraryReleases(root: string, skillFilter?: string): LibraryRelease[] {
  const base = path.join(path.resolve(root), 'releases'); safe(root, base);
  if (!fs.existsSync(base)) return [];
  const items: LibraryRelease[] = [];
  for (const name of fs.readdirSync(base, { withFileTypes: true })) {
    if (skillFilter !== undefined && name.name !== skillFilter) continue;
    if (!name.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name.name)) continue;
    const folder = path.join(base, name.name); safe(root, folder);
    for (const version of fs.readdirSync(folder, { withFileTypes: true })) {
      if (!version.isDirectory() || !semver.test(version.name)) continue;
      const release = localRelease(root, path.join(folder, version.name));
      const receipt = receiptPath(root, release.skillName, release.version);
      const archiveRecord = path.join(path.resolve(root), '.skill-workbench', 'completed', release.skillName, release.version, 'record.json'); safe(root, archiveRecord);
      let data: Partial<Publication> = {};
      let status: LibraryRelease['status'] = 'prepared';
      if (fs.existsSync(archiveRecord)) {
        const archived = JSON.parse(fs.readFileSync(archiveRecord, 'utf8'));
        data = { repository: archived.record?.repository, baseBranch: archived.record?.baseBranch };
        status = 'archived';
      }
      if (fs.existsSync(receipt)) { data = publication(JSON.parse(fs.readFileSync(receipt, 'utf8'))); status = 'uploaded'; }
      items.push({ skillName: release.skillName, version: release.version, directory: release.directory, packagePath: release.packagePath, status, ...data });
    }
  }
  return items.sort((a, b) => a.skillName.localeCompare(b.skillName) || b.version.localeCompare(a.version, undefined, { numeric: true }));
}

export function restoreLibraryRelease(root: string, directory: string): WorkbenchSkill {
  const release = localRelease(root, directory);
  const item = listLibraryReleases(root, release.skillName).find(release => path.resolve(release.directory) === path.resolve(directory));
  const draft = restoreSkillRelease(root, directory);
  if (item?.repository && item.baseBranch) return updateSkillRepository(root, draft.id, item.repository, item.baseBranch);
  return draft;
}

/** Suggest a new immutable version; the publisher still validates user input. */
export function suggestReleaseVersion(skill: WorkbenchSkill, versions: string[]): string {
  let declared = '1.0.0';
  try {
    const text = fs.readFileSync(path.join(skill.sourcePath, 'SKILL.md'), 'utf8');
    const block = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    const parsed = block ? require('js-yaml').load(block[1]) : undefined;
    if (typeof parsed?.metadata?.version === 'string' && semver.test(parsed.metadata.version)) declared = parsed.metadata.version;
  } catch { /* Normal validation reports metadata errors before packaging. */ }
  const compare = (a: string, b: string) => {
    const left = a.split(/[.+-]/).slice(0, 3).map(BigInt), right = b.split(/[.+-]/).slice(0, 3).map(BigInt);
    for (let i = 0; i < 3; i++) { if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1; }
    return 0;
  };
  const previous = versions.filter(value => semver.test(value)).sort(compare).at(-1);
  if (!previous || compare(declared, previous) > 0) return declared;
  const parts = previous.split(/[.+-]/).slice(0, 3);
  return `${parts[0]}.${parts[1]}.${BigInt(parts[2]) + 1n}`;
}
