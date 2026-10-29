import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import {
  registerSkillFolder, listWorkbenchSkills, updateSkillRepository, validateWorkbenchSkill,
  prepareSkillRelease, listSkillReleases, verifySkillRelease, completeWorkbenchSkill,
  type WorkbenchSkill, type WorkbenchRelease, type FileDigest
} from './skill-workbench.js';
import { listLibraryReleases, recordLibraryPublication, recordLibraryReview, type LibraryRelease } from './workbench-library.js';
import { githubRepository, GitHubReviewService, type GitHubRunner, type ReviewContext } from './github-review.js';
import type { PullRequestRecord } from './guided-contract.js';
import { resolveRepositoryDefaultBranch, verifyRepositoryBranchCommit, prepareRepositoryPublish, pushPreparedRelease, disposePublishPreview } from './repository-publisher.js';

const yaml: { dump(value: unknown): string } = require('js-yaml');
const MAX_TEXT = 16 * 1024 * 1024;
export type WorkspaceConnection = { repository: string; baseBranch: string };
export type GuidedFile = { path: string; size: number; text: boolean };
export type GuidedPublication = {
  release: WorkbenchRelease;
  publication: { repository: string; branch: string; commit: string };
  cleanup?: { archivedPath: string; sourceRetained: boolean };
  cleanupError?: string;
};

function ensureSafe(root: string, target: string): void {
  root = path.resolve(root); target = path.resolve(target);
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('The file must remain inside this skill workspace.');
  // Include ancestors of the declared root: a junction must not turn an
  // apparently local skill/connection into an outside write.
  const parsed = path.parse(target);
  let current = parsed.root;
  for (const part of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Symbolic links and junctions are not supported in editable skill paths.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
function validateRepository(repository: string): string {
  let embeddedPassword = false;
  try { embeddedPassword = !!new URL(repository).password; } catch { /* Local paths and username-only SCP-style SSH locations are supported. */ }
  if (typeof repository !== 'string' || !repository.trim() || repository.startsWith('-') || /[\r\n\0]/.test(repository)
    || /^(?:ext|fd)::/i.test(repository) || /https?:\/\/[^/\s]*@/.test(repository) || embeddedPassword) throw new Error('Choose a repository URL or local Git repository without embedded credentials.');
  return repository.trim();
}
function connectionPath(root: string): string {
  const file = path.join(path.resolve(root), '.skill-workbench', 'connection.json'); ensureSafe(root, file); return file;
}
function sameRepository(left: string, right: string): boolean { return left.replace(/\.git\/?$/, '').replace(/\/$/, '') === right.replace(/\.git\/?$/, '').replace(/\/$/, ''); }

export function getWorkspaceConnection(root: string): WorkspaceConnection | undefined {
  const file = connectionPath(root);
  if (!fs.existsSync(file)) return undefined;
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value.format !== 1 || typeof value.repository !== 'string' || typeof value.baseBranch !== 'string'
    || !value.baseBranch || /[\s~^:?*\[\\\0]/.test(value.baseBranch) || value.baseBranch.startsWith('-')
    || value.baseBranch.includes('..') || value.baseBranch.includes('@{')) throw new Error('The saved repository connection needs reconnecting.');
  return { repository: validateRepository(value.repository), baseBranch: value.baseBranch };
}

/** Preserve conflicting webview edits outside distributable skill contents. */
export function saveGuidedRecovery(root: string, skill: WorkbenchSkill, relative: string, content: string): string {
  const active = listWorkbenchSkills(root).find(item => item.id === skill.id && path.resolve(item.sourcePath) === path.resolve(skill.sourcePath));
  if (!active) throw new Error('The draft is no longer active; the edit was not written.');
  fileTarget(active, relative);
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_TEXT) throw new Error('The edit exceeds the recovery text limit.');
  const directory = path.join(path.resolve(root), '.skill-workbench', 'recovery', active.id);
  ensureSafe(root, directory); fs.mkdirSync(directory, { recursive: true }); ensureSafe(root, directory);
  const file = path.join(directory, `${randomUUID()}.json`); ensureSafe(root, file);
  fs.writeFileSync(file, JSON.stringify({ skillId: active.id, path: relative, content, at: new Date().toISOString() }, null, 2), { flag: 'wx' });
  return file;
}

/** Earlier file contents live outside the skill; they are never packaged or uploaded. */
export function listGuidedHistory(root: string, skill: WorkbenchSkill, relative: string): { id: string; path: string; at: string }[] {
  fileTarget(skill, relative);
  const directory = path.join(path.resolve(root), '.skill-workbench', 'recovery', skill.id);
  ensureSafe(root, directory);
  if (!fs.existsSync(directory)) return [];
  const history: { id: string; path: string; at: string }[] = [];
  const candidates = fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^[a-f0-9-]{36}\.json$/i.test(entry.name))
    .map(entry => { const file = path.join(directory, entry.name); ensureSafe(root, file); return { name: entry.name, file, stat: fs.statSync(file) }; })
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs).slice(0, 200);
  let bytesRead = 0;
  for (const entry of candidates) {
    const file = entry.file;
    if (entry.stat.size > MAX_TEXT * 6 + 4096) continue;
    bytesRead += entry.stat.size;
    if (bytesRead > MAX_TEXT * 6 + 4096) break;
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (saved.skillId === skill.id && saved.path === relative && typeof saved.content === 'string'
        && Buffer.byteLength(saved.content, 'utf8') <= MAX_TEXT && typeof saved.at === 'string' && Number.isFinite(Date.parse(saved.at))) {
        history.push({ id: entry.name.slice(0, -5), path: relative, at: saved.at });
      }
    } catch { /* One damaged history record must not hide the editable draft. */ }
  }
  return history.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
}

export function restoreGuidedEdit(root: string, skill: WorkbenchSkill, relative: string, id: string): void {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Choose an earlier edit from this file’s history.');
  const active = listWorkbenchSkills(root).find(item => item.id === skill.id && path.resolve(item.sourcePath) === path.resolve(skill.sourcePath));
  if (!active) throw new Error('This draft is no longer active. No file was changed.');
  fileTarget(active, relative);
  const file = path.join(path.resolve(root), '.skill-workbench', 'recovery', active.id, `${id}.json`);
  ensureSafe(root, file);
  if (fs.statSync(file).size > MAX_TEXT * 6 + 4096) throw new Error('The earlier edit exceeds the recovery limit.');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (saved.skillId !== active.id || saved.path !== relative || typeof saved.content !== 'string'
    || Buffer.byteLength(saved.content, 'utf8') > MAX_TEXT) throw new Error('This earlier edit does not belong to the selected skill file.');
  const current = readGuidedFile(active, relative);
  if (current === saved.content) return;
  saveGuidedRecovery(root, active, relative, current);
  writeGuidedFile(active, relative, saved.content);
}

export async function connectWorkspaceRepository(root: string, repository: string): Promise<WorkspaceConnection> {
  repository = validateRepository(repository);
  const baseBranch = await resolveRepositoryDefaultBranch(repository);
  const file = connectionPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true }); ensureSafe(root, file);
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ format: 1, repository, baseBranch }, null, 2) + '\n', { flag: 'wx' });
  try { fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) { ensureSafe(root, temporary); fs.unlinkSync(temporary); } }
  // Repair matching old per-skill branch selections such as "makeitfire".
  // Other associated destinations are left alone until that draft is published
  // through this workspace's explicitly selected single repository.
  for (const skill of listWorkbenchSkills(root)) {
    if (skill.repository && sameRepository(skill.repository, repository)) updateSkillRepository(root, skill.id, repository, baseBranch);
  }
  return { repository, baseBranch };
}

export async function migrateAssociation(root: string, verifiedReleases?: LibraryRelease[]): Promise<WorkspaceConnection | undefined> {
  const saved = getWorkspaceConnection(root);
  if (saved) return saved;
  const repositories = listWorkbenchSkills(root).flatMap(skill => skill.repository ? [skill.repository] : []);
  try { repositories.push(...(verifiedReleases ?? listLibraryReleases(root)).flatMap(release => release.repository ? [release.repository] : [])); }
  catch { /* A corrupt historic snapshot must not prevent editing active drafts. */ }
  const unique = repositories.filter((repository, index) => repositories.findIndex(other => sameRepository(repository, other)) === index);
  return unique.length === 1 ? connectWorkspaceRepository(root, unique[0]) : undefined;
}

export function createGuidedSkill(root: string, input: { name: string; description: string; instructions: string }): WorkbenchSkill {
  if (typeof input.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.name) || input.name.length > 64) throw new Error('Give the skill a lowercase name such as meeting-notes.');
  if (typeof input.description !== 'string' || !input.description.trim() || input.description.trim().length > 1024) throw new Error('Describe what the skill does and when it should be used, using at most 1,024 characters.');
  if (typeof input.instructions !== 'string' || !input.instructions.trim()) throw new Error('Add the instructions the skill should follow.');
  if (Buffer.byteLength(input.instructions, 'utf8') > MAX_TEXT) throw new Error('The skill instructions exceed the editable text limit.');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-skill-create-'));
  try {
    const source = path.join(temporary, input.name); fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'SKILL.md'), `---\n${yaml.dump({ name: input.name, description: input.description.trim(), metadata: { version: '1.0.0' } })}---\n\n${input.instructions.trim()}\n`, { flag: 'wx' });
    return registerSkillFolder(root, source);
  } finally {
    if (path.dirname(path.resolve(temporary)) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith('guided-skill-create-')) throw new Error('Unexpected temporary draft path.');
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function fileTarget(skill: WorkbenchSkill, relative: string): string {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || /[<>:"|?*\x00-\x1f]/.test(relative)) throw new Error('Use a relative file path inside this skill.');
  const parts = relative.split(/[\\/]/);
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || part.toLowerCase() === '.git'
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Use a safe file path inside this skill.');
  const target = path.join(path.resolve(skill.sourcePath), ...parts); ensureSafe(skill.sourcePath, target); return target;
}

export function listGuidedFiles(skill: WorkbenchSkill): GuidedFile[] {
  ensureSafe(skill.sourcePath, skill.sourcePath);
  const output: GuidedFile[] = [];
  const visit = (folder: string, prefix: string) => {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      if (['.git', 'node_modules'].includes(item.name)) continue;
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      const target = fileTarget(skill, relative);
      if (item.isSymbolicLink()) throw new Error('A skill contains a symbolic link; remove it before continuing.');
      if (item.isDirectory()) visit(target, relative);
      else if (item.isFile()) {
        const size = fs.statSync(target).size;
        const content = size <= MAX_TEXT ? fs.readFileSync(target) : undefined;
        output.push({ path: relative, size, text: !!content && isUtf8(content) && !content.includes(0) });
      } else throw new Error('A skill contains an unsupported special file.');
    }
  };
  visit(skill.sourcePath, '');
  return output.sort((a, b) => (a.path === 'SKILL.md' ? -1 : b.path === 'SKILL.md' ? 1 : a.path.localeCompare(b.path)));
}
export function readGuidedFile(skill: WorkbenchSkill, relative: string): string {
  const target = fileTarget(skill, relative); const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.size > MAX_TEXT) throw new Error('This file is not editable text. Its bytes remain preserved in the skill.');
  const content = fs.readFileSync(target);
  if (!isUtf8(content) || content.includes(0)) throw new Error('This is a binary file. Its bytes remain preserved in the skill.');
  return content.toString('utf8');
}
export function writeGuidedFile(skill: WorkbenchSkill, relative: string, content: string): void {
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_TEXT || content.includes('\0')) throw new Error('Use text within the 16 MB editing limit.');
  const target = fileTarget(skill, relative);
  if (fs.existsSync(target) && !fs.lstatSync(target).isFile()) throw new Error('Choose a regular text file.');
  // Reject attempts to overwrite a known binary file through the text editor.
  if (fs.existsSync(target)) readGuidedFile(skill, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true }); ensureSafe(skill.sourcePath, target);
  const temporary = path.join(path.dirname(target), `.guided-save-${randomUUID()}.tmp`);
  fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
  try { fs.renameSync(temporary, target); }
  finally { if (fs.existsSync(temporary)) { ensureSafe(skill.sourcePath, temporary); fs.unlinkSync(temporary); } }
}

/** Copy a user-selected supporting file without treating binary bytes as text. */
export function copyGuidedFile(skill: WorkbenchSkill, relative: string, sourcePath: string): void {
  ensureSafe(sourcePath, sourcePath);
  const source = fs.lstatSync(sourcePath);
  if (!source.isFile() || source.size > MAX_TEXT) throw new Error('Choose a regular supporting file no larger than 16 MB.');
  const target = fileTarget(skill, relative);
  if (fs.existsSync(target)) throw new Error('That file already exists. Open it to edit, or choose another file name.');
  const content = fs.readFileSync(sourcePath);
  if (content.length > MAX_TEXT) throw new Error('The selected file exceeds the 16 MB limit.');
  fs.mkdirSync(path.dirname(target), { recursive: true }); ensureSafe(skill.sourcePath, target);
  const temporary = path.join(path.dirname(target), `.guided-copy-${randomUUID()}.tmp`);
  fs.writeFileSync(temporary, content, { flag: 'wx' });
  try { fs.linkSync(temporary, target); }
  finally { if (fs.existsSync(temporary)) { ensureSafe(skill.sourcePath, temporary); fs.unlinkSync(temporary); } }
}

function sameFiles(left: { path: string; size: number; sha256: string }[], right: typeof left): boolean {
  const normalized = (items: typeof left) => items.map(file => `${file.path}\0${file.size}\0${file.sha256}`).sort();
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

/** Called only from the guided screen's explicit Publish version action. */
export async function publishGuidedSkill(root: string, id: string, version: string, changelog: string, onProgress?: (message: string) => void, options: { deferCleanup?: boolean; expectedFiles?: FileDigest[] } = {}): Promise<GuidedPublication> {
  const saved = getWorkspaceConnection(root);
  if (!saved) throw new Error('Connect your skill repository first.');
  const skill = listWorkbenchSkills(root).find(item => item.id === id);
  if (!skill) throw new Error('Choose an active draft before publishing.');
  onProgress?.('Checking your connected repository.');
  // Resolve again immediately before publishing. A saved base branch is not
  // trusted after remote configuration changes, and never comes from a name box.
  const connection = await connectWorkspaceRepository(root, saved.repository);
  updateSkillRepository(root, skill.id, connection.repository, connection.baseBranch);
  const validation = validateWorkbenchSkill(skill);
  if (!validation.valid) throw new Error(`Fix the skill check errors before publishing: ${validation.errors.join('; ')}`);
  if (options.expectedFiles && !sameFiles(validation.files, options.expectedFiles)) throw new Error('The draft changed after the sharing summary was reviewed. Check it and review a fresh summary before submitting. Nothing was uploaded.');
  const previous = listSkillReleases(root, skill.id).find(item => item.version === version);
  let release: WorkbenchRelease;
  if (previous) {
    release = verifySkillRelease(previous.directory);
    const changed = !sameFiles(validation.files, release.manifest.files)
      || fs.readFileSync(path.join(release.directory, 'CHANGELOG.md'), 'utf8').trim() !== changelog.trim();
    if (changed) release = prepareSkillRelease(root, skill.id, version, changelog, true);
    const receipt = listLibraryReleases(root, skill.name).find(item => item.directory === release.directory && item.status === 'uploaded');
    if (!changed && receipt?.commit && receipt.branch && receipt.repository) {
      onProgress?.('Checking the previously uploaded version.');
      if (sameRepository(receipt.repository, connection.repository)
          && await verifyRepositoryBranchCommit(receipt.repository, receipt.branch, receipt.commit)) {
        let cleanup: GuidedPublication['cleanup']; let cleanupError: string | undefined;
        try { if (!options.deferCleanup) cleanup = completeWorkbenchSkill(root, skill.id, release.directory); }
        catch (error) { cleanupError = error instanceof Error ? error.message : String(error); }
        return { release, publication: { repository: receipt.repository, branch: receipt.branch, commit: receipt.commit }, ...(cleanup ? { cleanup } : {}), ...(cleanupError ? { cleanupError } : {}) };
      }
      // A removed/replaced branch or a different selected repository is a
      // fresh upload of the user's chosen version, with prior receipts retained.
      release = prepareSkillRelease(root, skill.id, version, changelog, true);
    }
  } else release = prepareSkillRelease(root, skill.id, version, changelog);
  if (options.expectedFiles && !sameFiles(release.manifest.files, options.expectedFiles)) throw new Error('The prepared release differs from the reviewed sharing summary. The local files are preserved and nothing was uploaded. Review a fresh summary.');
  const preview = await prepareRepositoryPublish(release.directory, connection.repository, connection.baseBranch, onProgress, true);
  try {
    const publication = await pushPreparedRelease(preview, onProgress);
    let cleanup: GuidedPublication['cleanup']; let cleanupError: string | undefined;
    try {
      recordLibraryPublication(root, release.directory, { ...publication, baseBranch: connection.baseBranch });
      if (!options.deferCleanup) cleanup = completeWorkbenchSkill(root, skill.id, release.directory);
    } catch (error) { cleanupError = error instanceof Error ? error.message : String(error); }
    return { release, publication, ...(cleanup ? { cleanup } : {}), ...(cleanupError ? { cleanupError } : {}) };
  } finally { await disposePublishPreview(preview, onProgress); }
}

function connectedRepository(root: string, repository: string): boolean {
  const connection = getWorkspaceConnection(root); if (!connection) return false;
  const left = githubRepository(connection.repository), right = githubRepository(repository);
  return left && right ? left.fullName.toLowerCase() === right.fullName.toLowerCase() : sameRepository(connection.repository, repository);
}

export function connectedReviewReleases(root: string): LibraryRelease[] {
  return listLibraryReleases(root).filter(item => item.status === 'uploaded' && !!item.repository && connectedRepository(root, item.repository));
}

export function libraryReviewContext(root: string, directory: string): { item: LibraryRelease; context: ReviewContext } {
  if (typeof directory !== 'string') throw new Error('Choose a recorded uploaded version.');
  const item = connectedReviewReleases(root).find(release => path.resolve(release.directory) === path.resolve(directory));
  const connection = getWorkspaceConnection(root);
  if (!item?.repository || !item.branch || !item.commit || !connection) throw new Error('This version has no verified upload in the connected repository. Connect its recorded repository before checking or creating its PR.');
  return { item, context: { repository: item.repository, baseBranch: item.baseBranch ?? connection.baseBranch, branch: item.branch, commit: item.commit, skillName: item.skillName, version: item.version } };
}

export async function reviewLibraryRelease(root: string, directory: string, action: 'check' | 'create' | 'reviewer', reviewer?: string, runner?: GitHubRunner): Promise<{ pr: PullRequestRecord; cleanupError?: string }> {
  const { item, context } = libraryReviewContext(root, directory);
  const service = new GitHubReviewService(root, runner);
  let pr = action === 'create' ? await service.ensure(context, item.pr) : action === 'reviewer'
    ? item.pr ? await service.requestReviewer(context, item.pr, reviewer ?? '') : { supported: !!githubRepository(context.repository), status: 'uploaded' as const, reviewRequestError: 'Create the PR before requesting a reviewer.' }
    : await service.check(context, item.pr);
  // Confirm the PR receipt on disk before any optional notification or cleanup.
  pr = recordLibraryReview(root, item.directory, pr);
  if (action === 'create' && reviewer && pr.number && pr.identityVerified) {
    pr = recordLibraryReview(root, item.directory, await service.requestReviewer(context, pr, reviewer));
  }
  let cleanupError: string | undefined;
  if (action !== 'check' && pr.number && pr.identityVerified) {
    const draft = listWorkbenchSkills(root).find(skill => skill.name === item.skillName);
    if (draft) { try { completeWorkbenchSkill(root, draft.id, item.directory); } catch (error) { cleanupError = error instanceof Error ? error.message : String(error); } }
  }
  return { pr, ...(cleanupError ? { cleanupError } : {}) };
}
