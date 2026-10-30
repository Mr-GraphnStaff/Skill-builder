import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { verifySkillRelease, restoreSkillRelease, updateSkillRepository, validateWorkbenchSkill, WorkbenchSkill, type FileDigest } from './skill-workbench.js';
import { readSkillIdentity, semanticVersion, compareReleaseVersions, nextReleaseVersion } from './skill-identity.js';
import { githubRepository, reviewRecord } from './github-review.js';
import type { PullRequestRecord } from './guided-contract.js';

type Publication = { repository: string; branch: string; commit: string; baseBranch?: string; publishedAt?: string };
export type LibraryRelease = {
  skillName: string; version: string; directory: string; packagePath: string;
  status: 'uploaded' | 'archived' | 'prepared';
  repository?: string; baseBranch?: string; branch?: string; commit?: string; publishedAt?: string;
  pr?: PullRequestRecord;
};
const semver = semanticVersion;

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
function reviewPath(root: string, name: string, version: string) {
  const target = path.join(path.resolve(root), '.skill-workbench', 'pull-requests', name, `${version}.json`);
  safe(root, target); return target;
}
function readReview(root: string, name: string, version: string, upload: Publication): PullRequestRecord | undefined {
  const file = reviewPath(root, name, version); if (!fs.existsSync(file)) return undefined;
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (saved.format !== 1 || saved.repository !== upload.repository || saved.branch !== upload.branch || saved.commit !== upload.commit) throw new Error('The saved PR metadata does not match this upload.');
  return reviewRecord(saved.pr, upload.repository);
}

/** Mutable review metadata is deliberately outside immutable release bytes. */
export function recordLibraryReview(root: string, directory: string, result: PullRequestRecord, options: { repairHistoricalNumber?: number } = {}): PullRequestRecord {
  const release = localRelease(root, directory);
  const receipt = receiptPath(root, release.skillName, release.version);
  if (!fs.existsSync(receipt)) throw new Error('A verified upload receipt is required before recording a PR.');
  const upload = publication(JSON.parse(fs.readFileSync(receipt, 'utf8')));
  let previous: PullRequestRecord | undefined;
  try { previous = readReview(root, release.skillName, release.version, upload); } catch { /* A fresh server check can repair invalid metadata. */ }
  let pr = reviewRecord(result, upload.repository);
  if (previous?.number && pr.number && previous.number !== pr.number) {
    const repair = options.repairHistoricalNumber === previous.number
      && ((previous.identityVerified === false && !!previous.headCommit && previous.headCommit !== upload.commit)
        || previous.status === 'closed' || previous.status === 'merged')
      && pr.identityVerified === true && pr.headCommit === upload.commit
      && pr.head === upload.branch && pr.base === upload.baseBranch;
    if (!repair) throw new Error('A different PR is already recorded for this version; inspect its repository state.');
    const oldTarget = reviewPath(root, release.skillName, release.version);
    const history = `${oldTarget}.superseded-${previous.number}-${randomUUID()}.json`; safe(root, history);
    fs.copyFileSync(oldTarget, history, fs.constants.COPYFILE_EXCL);
    previous = undefined; // Old approvals, reviewer notifications and errors belong to the old PR.
  }
  if (previous && pr.error) pr = { ...previous, ...pr, status: pr.number && pr.identityVerified && !previous.number ? pr.status : previous.status,
    checkedAt: previous.checkedAt, number: pr.number ?? previous.number, creationUncertain: pr.creationUncertain ?? previous.creationUncertain };
  const target = reviewPath(root, release.skillName, release.version);
  fs.mkdirSync(path.dirname(target), { recursive: true }); safe(root, target);
  const temporary = `${target}.${randomUUID()}.tmp`; safe(root, temporary);
  fs.writeFileSync(temporary, JSON.stringify({ format: 1, ...upload, pr }, null, 2) + '\n', { flag: 'wx' });
  try { fs.renameSync(temporary, target); }
  finally { if (fs.existsSync(temporary)) { safe(root, temporary); fs.unlinkSync(temporary); } }
  return pr;
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
      let pr: PullRequestRecord | undefined;
      if (fs.existsSync(receipt)) {
        const upload = publication(JSON.parse(fs.readFileSync(receipt, 'utf8')));
        data = { ...data, ...upload }; status = 'uploaded';
        try { pr = readReview(root, release.skillName, release.version, upload); }
        catch { pr = { supported: !!githubRepository(upload.repository), status: 'unknown', error: 'Saved PR metadata could not be verified. Use Check PRs to repair it; the upload remains recorded.' }; }
      }
      items.push({ skillName: release.skillName, version: release.version, directory: release.directory, packagePath: release.packagePath, status, ...data, ...(pr ? { pr } : {}) });
    }
  }
  return items.sort((a, b) => a.skillName.localeCompare(b.skillName) || compareReleaseVersions(b.version, a.version) || b.version.localeCompare(a.version));
}

export function restoreLibraryRelease(root: string, directory: string): WorkbenchSkill {
  const release = localRelease(root, directory);
  const item = listLibraryReleases(root, release.skillName).find(release => path.resolve(release.directory) === path.resolve(directory));
  const draft = restoreSkillRelease(root, directory);
  if (item?.repository && item.baseBranch) return updateSkillRepository(root, draft.id, item.repository, item.baseBranch);
  return draft;
}

/** Allocate the next immutable release identity without asking the user to do bookkeeping. */
export function suggestReleaseVersion(skill: WorkbenchSkill, versions: string[]): string {
  let declared: string | undefined;
  try {
    safe(skill.sourcePath, path.join(skill.sourcePath, 'SKILL.md'));
    const text = fs.readFileSync(path.join(skill.sourcePath, 'SKILL.md'), 'utf8');
    declared = readSkillIdentity(text).declaredVersion;
  } catch { /* Normal validation reports metadata errors before packaging. */ }
  const previous = versions.filter(value => semver.test(value)).sort(compareReleaseVersions).at(-1);
  if (!previous) return declared ?? '1.0.0';
  if (declared && compareReleaseVersions(declared, previous) > 0) return declared;
  let next = nextReleaseVersion(previous);
  while (versions.includes(next)) next = nextReleaseVersion(next);
  return next;
}

export type SkillChangeSummary = {
  baselineVersion?: string;
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: number;
  hasChanges: boolean;
  note: string;
};

/** Compare verified bytes, not guessed semantic changes or generated claims. */
export function summarizeSkillChanges(root: string, skill: WorkbenchSkill): SkillChangeSummary {
  safe(root, skill.sourcePath);
  const validation = validateWorkbenchSkill(skill);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const baseline = listLibraryReleases(root, skill.name)[0];
  const prior = baseline ? localRelease(root, baseline.directory).manifest.files : undefined;
  return summarizeFileChanges(validation.files, baseline && prior ? { version: baseline.version, files: prior } : undefined);
}

/** Pure comparison of inventories already obtained through guarded validation.
 * This does not itself establish file or package integrity. */
export function summarizeFileChanges(files: FileDigest[], baseline?: { version: string; files: FileDigest[] }): SkillChangeSummary {
  const current = new Map(files.filter(file => !file.path.endsWith('/')).map(file => [file.path, file]));
  const result: SkillChangeSummary = {
    ...(baseline ? { baselineVersion: baseline.version } : {}),
    added: [], changed: [], removed: [], unchanged: 0, hasChanges: false,
    note: baseline ? `Compared with the saved release ${baseline.version}. This lists file changes, not a claim about behavior.` : 'First saved release in this workspace. Original imported packages remain preserved.'
  };
  const prior = new Map((baseline ? baseline.files : [])
    .filter(file => !file.path.endsWith('/')).map(file => [file.path, file]));
  for (const [name, file] of current) {
    const previous = prior.get(name);
    if (!previous) result.added.push(name);
    else if (previous.sha256 !== file.sha256 || previous.size !== file.size) result.changed.push(name);
    else result.unchanged++;
  }
  for (const name of prior.keys()) if (!current.has(name)) result.removed.push(name);
  result.added.sort(); result.changed.sort(); result.removed.sort();
  result.hasChanges = result.added.length + result.changed.length + result.removed.length > 0;
  return result;
}
