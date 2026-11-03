import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { assertRemoteDestination, assertWorkbenchPath } from './workbench-boundary.js';
import { requireWorkbench } from './workbench-setup.js';

export type WorkspaceSelection =
  | { kind: 'managed'; dataRoot: string }
  | { kind: 'existing-repository'; dataRoot: string; repositoryRoot: string; repository: string; gitConfigDigest: string;
      trustedRepositoryRoot: boolean; gitTrustEvidence?: Array<{ path: string; sha256?: string }> };

const existingSelections = new Map<string, Extract<WorkspaceSelection, { kind: 'existing-repository' }>>();
const execute = promisify(execFile);
const samePath = (a: string, b: string) => path.relative(path.resolve(a), path.resolve(b)) === '';
const identity = (repository: string) => repository.replace(/\.git$/i, '').replace(/\/$/, '').toLowerCase();
const fileDigest = (file: string) => fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : undefined;

/** These are existing user grants, not trust decisions made by SkillJetty.
 * An empty multivar value revokes all preceding safe.directory entries. */
export function allowsExistingGitTrust(values: string[], repositoryRoot: string): boolean {
  let allowed = false;
  for (const value of values) {
    if (!value) { allowed = false; continue; }
    if (value === '*') { allowed = true; continue; }
    if (value.replaceAll('\\', '/').endsWith('/*')) {
      const base = value.slice(0, -2);
      if (!path.isAbsolute(base)) continue;
      const relative = path.relative(path.resolve(base), repositoryRoot);
      if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) allowed = true;
    } else if (path.isAbsolute(value) && samePath(value, repositoryRoot)) allowed = true;
  }
  return allowed;
}

async function existingGitTrust(repositoryRoot: string, env: NodeJS.ProcessEnv): Promise<{ trustedRepositoryRoot: boolean; gitTrustEvidence?: Array<{ path: string; sha256?: string }> }> {
  let stdout = '';
  try {
    stdout = (await execute('git', ['config', '--global', '--no-includes', '--null', '--show-origin', '--type=path', '--get-all', 'safe.directory'], {
      cwd: repositoryRoot, env, windowsHide: true, timeout: 15_000, maxBuffer: 64 * 1024
    })).stdout;
  } catch (error) {
    if ((error as { code?: unknown }).code !== 1) throw error;
  }
  const pieces = stdout.split('\0'), values: string[] = [], origins: string[] = [];
  for (let i = 0; i + 1 < pieces.length; i += 2) {
    const origin = pieces[i];
    if (!origin.startsWith('file:') || !path.isAbsolute(origin.slice(5))) throw new Error('Git trust settings did not identify a user configuration file.');
    origins.push(origin.slice(5)); values.push(pieces[i + 1]);
  }
  if (!allowsExistingGitTrust(values, repositoryRoot)) return { trustedRepositoryRoot: false };
  const home = process.env.HOME || homedir();
  const files = new Set([path.join(home, '.gitconfig'), path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'git', 'config'), ...origins]);
  return { trustedRepositoryRoot: true, gitTrustEvidence: [...files].map(file => ({ path: file, sha256: fileDigest(file) })) };
}

function recordedRepository(dataRoot: string, repositoryRoot: string): { repository: string; gitConfigDigest: string } {
  assertWorkbenchPath(repositoryRoot, dataRoot);
  const control = assertWorkbenchPath(dataRoot, path.join(dataRoot, '.skill-workbench', 'connection.json'));
  const saved = JSON.parse(fs.readFileSync(control, 'utf8'));
  if (saved.format !== 1 || typeof saved.repository !== 'string' || typeof saved.localPath !== 'string' || !path.isAbsolute(saved.localPath)
    || !samePath(saved.localPath, repositoryRoot) || typeof saved.baseBranch !== 'string' || !saved.baseBranch
    || /[\s~^:?*\[\\\0]/.test(saved.baseBranch) || saved.baseBranch.startsWith('-') || saved.baseBranch.includes('..') || saved.baseBranch.includes('@{')) {
    throw new Error('The saved workspace connection does not identify this repository root. Existing work was not changed.');
  }
  assertRemoteDestination(saved.repository);
  const git = assertWorkbenchPath(repositoryRoot, path.join(repositoryRoot, '.git'));
  if (!fs.lstatSync(git).isDirectory()) throw new Error('The existing workspace needs its own Git repository root; linked worktrees are not adopted.');
  for (const name of ['commondir', 'gitdir', 'objects/info/alternates', 'objects/info/http-alternates', 'config.worktree']) {
    if (fs.existsSync(assertWorkbenchPath(repositoryRoot, path.join(git, name)))) throw new Error('The existing repository redirects its Git metadata. No workspace was adopted.');
  }
  const config = fs.readFileSync(assertWorkbenchPath(repositoryRoot, path.join(git, 'config')), 'utf8');
  if (/^\s*\[\s*(?:include(?:if)?|url|extensions)\b/im.test(config)
    || /^\s*(?:worktree|pushurl|sshcommand|gitproxy|alternaterefscommand)\s*=/im.test(config)) {
    throw new Error('The existing repository redirects its paths or transport. Existing files were preserved.');
  }
  return { repository: saved.repository, gitConfigDigest: createHash('sha256').update(config).digest('hex') };
}

/** Continue an explicitly configured, previously connected repository. No writes,
 * marker creation, inferred parent selection, cloning, or layout conversion. */
export async function resolveExistingRepositoryWorkspace(projectRoot: string): Promise<WorkspaceSelection | undefined> {
  if (!projectRoot.trim() || !path.isAbsolute(projectRoot)) return undefined;
  const repositoryRoot = path.resolve(projectRoot), dataRoot = path.join(repositoryRoot, '.skilljetty-prerelease');
  assertWorkbenchPath(repositoryRoot, dataRoot);
  if (!fs.existsSync(path.join(dataRoot, '.skill-workbench', 'connection.json'))) return undefined;
  // An existing managed setup must never downgrade to the compatibility mode.
  if (fs.existsSync(path.join(dataRoot, '.skilljetty-workbench.json'))) return undefined;
  const recorded = recordedRepository(dataRoot, repositoryRoot);
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) if (/^GIT_/i.test(key)) delete env[key];
  Object.assign(env, { GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' });
  const trust = await existingGitTrust(repositoryRoot, env);
  env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const git = async (args: string[]) => (await execute('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...(trust.trustedRepositoryRoot ? ['-c', `safe.directory=${repositoryRoot.replaceAll('\\', '/')}`] : []), ...args], {
    cwd: repositoryRoot, env, windowsHide: true, timeout: 15_000, maxBuffer: 64 * 1024
  })).stdout.trim();
  const top = await git(['rev-parse', '--show-toplevel']);
  if (!samePath(top, repositoryRoot)) throw new Error('Select the actual repository root before continuing the saved workspace.');
  const origin = await git(['remote', 'get-url', 'origin']);
  if (identity(origin) !== identity(recorded.repository)) throw new Error('The repository origin differs from the saved workspace connection. Existing work was preserved.');
  const selection: Extract<WorkspaceSelection, { kind: 'existing-repository' }> = { kind: 'existing-repository', dataRoot, repositoryRoot, ...recorded, ...trust };
  assertWorkspaceSelection(selection);
  existingSelections.set(dataRoot, selection);
  return selection;
}

export function assertWorkspaceSelection(selection: WorkspaceSelection): string {
  if (selection.kind === 'managed') return requireWorkbench(selection.dataRoot);
  if (!samePath(selection.dataRoot, path.join(selection.repositoryRoot, '.skilljetty-prerelease'))) throw new Error('The existing workspace data folder changed. Reopen SkillJetty.');
  if (fs.existsSync(path.join(selection.dataRoot, '.skilljetty-workbench.json'))) throw new Error('The workspace setup changed. Reopen SkillJetty before continuing.');
  if (selection.trustedRepositoryRoot && (!selection.gitTrustEvidence?.length || selection.gitTrustEvidence.some(file => fileDigest(file.path) !== file.sha256))) {
    throw new Error('Your existing Git trust settings changed. Reopen SkillJetty to verify the repository again. No trust settings were changed.');
  }
  const current = recordedRepository(selection.dataRoot, selection.repositoryRoot);
  if (identity(current.repository) !== identity(selection.repository) || current.gitConfigDigest !== selection.gitConfigDigest) {
    throw new Error('The existing repository configuration changed. Reopen SkillJetty to verify its saved connection before continuing.');
  }
  return selection.dataRoot;
}

/** Only the accepted Git root and its private data tree share this mapping. */
export function existingWorkspaceForPath(target: string): Extract<WorkspaceSelection, { kind: 'existing-repository' }> | undefined {
  for (const selection of [...existingSelections.values()].sort((a, b) => b.repositoryRoot.length - a.repositoryRoot.length)) {
    const relative = path.relative(selection.dataRoot, path.resolve(target));
    if (samePath(target, selection.repositoryRoot) || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
      assertWorkspaceSelection(selection); return selection;
    }
  }
  return undefined;
}

export function assertWorkspaceRepository(selection: WorkspaceSelection, repository: string, localPath?: string): void {
  assertWorkspaceSelection(selection);
  assertRemoteDestination(repository);
  if (selection.kind !== 'existing-repository') return;
  if (identity(repository) !== identity(selection.repository) || (localPath && !samePath(localPath, selection.repositoryRoot))) {
    throw new Error('This existing workspace uses its saved repository root and remote. Correct the repository settings before sharing; local drafts remain available.');
  }
}
