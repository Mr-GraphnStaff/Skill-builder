import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { repositoryGit } from './repository-publisher.js';

export type RepositoryVerification = {
  status: 'verified' | 'outOfSync' | 'setupRequired' | 'error'; message: string;
  localPath?: string; repository?: string; branch?: string; localCommit?: string;
  remoteCommit?: string; dirty?: boolean; trustRequired?: boolean;
};
const controls = new Set(['.skill-workbench', '.skilljetty-prerelease', '.skilljetty-beta', '.vscode']);
const isControl = (name: string) => controls.has(name.replace(/\\/g, '/').split('/')[0].toLowerCase());
function projectPath(localPath?: string): string {
  if (!localPath?.trim() || !path.isAbsolute(localPath)) throw new Error('Setup required: choose an explicit absolute local Skills repository folder.');
  const resolved = path.resolve(localPath);
  if (resolved.split(/[\\/]/).some(part => ['.codex', '.skill-workbench', '.skilljetty-prerelease', '.skilljetty-beta'].includes(part.toLowerCase()))) throw new Error('Setup required: choose a visible project folder outside Codex and private workbench storage.');
  return resolved;
}
async function guard(target: string): Promise<void> {
  const resolved = path.resolve(target); let current = path.parse(resolved).root;
  for (const part of path.relative(current, resolved).split(path.sep)) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Repository folders cannot use linked paths.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
async function renameCloneEntry(source: string, destination: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try { await fs.rename(source, destination); return; }
    catch (error) {
      if (process.platform !== 'win32' || attempt >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}
function remoteIdentity(repository: string): string {
  if (!repository.trim() || repository.startsWith('-') || /[\r\n\0]/.test(repository) || /^(?:ext|fd)::/i.test(repository) || /https?:\/\/[^/\s]*@/.test(repository)) throw new Error('Choose a repository without embedded credentials or executable transports.');
  const github = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)\/?$/i.exec(repository);
  if (github) return `github.com/${github[1]}/${github[2].replace(/\.git$/i, '')}`.toLowerCase();
  try { if (new URL(repository).password) throw new Error('Repository credentials must not be embedded in its URL.'); } catch (error) { if (error instanceof Error && error.message.startsWith('Repository credentials')) throw error; }
  return repository.replace(/[\\/]$/, '');
}
async function git(cwd: string, args: string[], hooks = path.join(cwd, `.skilljetty-disabled-hooks-${randomUUID()}`)): Promise<string> {
  const base = ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${hooks}`, '-c', 'submodule.recurse=false'];
  // Even a read-only status can invoke clean filters; neutralize configured drivers first.
  let configuration = '';
  try { configuration = await repositoryGit(cwd, [...base, 'config', '--name-only', '--get-regexp', '^filter\\.']); } catch (error) {
    if (/spawn git.*ENOENT/i.test(String(error))) throw new Error('Setup required: Git is not installed or is unavailable on PATH. The selected folder was preserved.');
    if (/dubious ownership|safe\.directory|spawn git/i.test(String(error))) throw error;
  }
  for (const key of new Set(configuration.trim().split(/\r?\n/).filter(Boolean).map(key => key.slice(0, key.lastIndexOf('.'))))) base.push('-c', `${key}.process=`, '-c', `${key}.smudge=`, '-c', `${key}.clean=`, '-c', `${key}.required=false`);
  return repositoryGit(cwd, [...base, ...args]);
}
async function advertised(cwd: string, repository: string): Promise<{ branch: string; commit: string }> {
  remoteIdentity(repository);
  const output = await git(cwd, ['ls-remote', '--symref', '--', repository, 'HEAD']);
  const branch = /^ref:\s+refs\/heads\/(.+)\s+HEAD$/m.exec(output)?.[1];
  const commit = /^([a-f0-9]{40,64})\s+HEAD$/m.exec(output)?.[1];
  if (!branch || !commit) throw new Error('The registered repository has no readable default branch and commit.');
  return { branch, commit };
}
async function identity(checkout: string, repository: string): Promise<void> {
  await guard(path.join(checkout, '.git'));
  if (!(await fs.lstat(path.join(checkout, '.git'))).isDirectory()) throw new Error('Setup required: the selected folder needs its own Git metadata directory.');
  const top = (await git(checkout, ['rev-parse', '--show-toplevel'])).trim();
  if (path.relative(await fs.realpath(checkout), await fs.realpath(top)) !== '') throw new Error('Setup required: select the Git repository root.');
  if (remoteIdentity((await git(checkout, ['remote', 'get-url', 'origin'])).trim()) !== remoteIdentity(repository)) throw new Error('Setup required: the local origin does not match the registered repository.');
}
async function dirty(checkout: string): Promise<boolean> {
  const rows = (await git(checkout, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored'])).split('\0');
  for (const row of rows) {
    if (!row) continue;
    if ((row.startsWith('?? ') || row.startsWith('!! ')) && isControl(row.slice(3))) continue;
    return true;
  }
  return false;
}
/** Read-only: no fetch, checkout, lock refresh, trust changes, or filesystem writes. */
export async function verifyProjectRepository(repository: string, localPath?: string): Promise<RepositoryVerification> {
  const result: RepositoryVerification = { status: 'setupRequired', message: '', repository, localPath };
  try {
    const checkout = projectPath(localPath); result.localPath = checkout;
    remoteIdentity(repository); await guard(checkout); await identity(checkout, repository);
    result.branch = (await git(checkout, ['branch', '--show-current'])).trim();
    result.localCommit = (await git(checkout, ['rev-parse', 'HEAD'])).trim();
    result.dirty = await dirty(checkout);
    const remote = await advertised(checkout, repository); result.remoteCommit = remote.commit;
    const upstream = (await git(checkout, ['for-each-ref', '--format=%(upstream)', `refs/heads/${result.branch}`])).trim();
    const aligned = result.branch === remote.branch && upstream === `refs/remotes/origin/${remote.branch}` && result.localCommit === remote.commit && !result.dirty;
    result.status = aligned ? 'verified' : 'outOfSync';
    result.message = aligned ? 'The local Skills repository is verified and up to date.' : result.dirty ? 'The local repository has changes or ignored files; your files are preserved.' : 'The local branch, upstream or commit differs from the registered default branch.';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.trustRequired = /dubious ownership|safe\.directory/i.test(message) || undefined;
    result.status = result.trustRequired || /Setup required|ENOENT|not a git repository|spawn git/i.test(message) ? 'setupRequired' : 'error';
    result.message = result.trustRequired ? 'Git requires your trust decision for this local repository before it can be verified or changed.' : message;
  }
  return result;
}
async function rejectControlPaths(checkout: string, ref: string, run = git): Promise<void> {
  const files = (await run(checkout, ['ls-tree', '-r', '-z', '--name-only', ref])).split('\0').filter(Boolean);
  if (files.some(isControl)) throw new Error('The remote contains private workbench control paths. Pull stopped to preserve local controls.');
}
/** Only the explicit user-selected project folder receives a checkout. */
export async function pullProjectRepository(workspaceRoot: string, repository: string, localPath: string, progress?: (message: string) => void): Promise<{ path: string; branch: string; commit: string }> {
  const checkout = projectPath(localPath); remoteIdentity(repository); await guard(checkout);
  const runtime = path.join(path.resolve(workspaceRoot), '.skill-workbench', 'git-control'); await guard(runtime);
  const hooks = path.join(runtime, `disabled-hooks-${randomUUID()}`);
  const run = (cwd: string, args: string[]) => git(cwd, args, hooks);
  let entries: string[] = [];
  try { entries = await fs.readdir(checkout); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (entries.length && !entries.includes('.git')) throw new Error('Setup required: this nonempty folder is not a Git repository. Its files were preserved.');
  // Identity and trust checks precede writes to any existing checkout.
  if (entries.length) await identity(checkout, repository);
  await fs.mkdir(hooks, { recursive: true });
  try {
    const remote = await advertised(workspaceRoot, repository);
    if (!entries.length) {
      const staging = path.join(runtime, `clone-${randomUUID()}`);
      const template = path.join(hooks, 'empty-template'); await fs.mkdir(template);
      try {
        progress?.('Downloading the registered Skills repository into the selected project folder…');
        await run(runtime, ['clone', '--no-checkout', '--no-hardlinks', `--template=${template}`, '--single-branch', '--branch', remote.branch, '--', repository, staging]);
        await rejectControlPaths(staging, 'HEAD', run);
        await fs.mkdir(path.join(staging, '.git', 'info'), { recursive: true });
        await fs.writeFile(path.join(staging, '.git', 'info', 'attributes'), '* merge -text -filter -ident -working-tree-encoding\n');
        await run(staging, ['reset', '--hard', 'HEAD']);
        await fs.mkdir(checkout, { recursive: true });
        if ((await fs.readdir(checkout)).length) throw new Error('The chosen folder changed while cloning; no files were overwritten.');
        for (const entry of await fs.readdir(staging)) await renameCloneEntry(path.join(staging, entry), path.join(checkout, entry));
      } finally { await fs.rm(staging, { recursive: true, force: true }); }
    }
    await identity(checkout, repository);
    const branch = (await run(checkout, ['branch', '--show-current'])).trim();
    if (branch !== remote.branch) throw new Error('The local checkout is on a different branch. Preserve changes and switch to the default branch before pulling.');
    if (await dirty(checkout)) throw new Error('The local checkout has local changes or ignored files. Preserve, commit or move them before pulling; your files were kept.');
    progress?.('Checking incoming changes before pulling the selected Skills repository…');
    await run(checkout, ['fetch', '--no-tags', '--refmap=', 'origin', `refs/heads/${branch}`]);
    await rejectControlPaths(checkout, 'FETCH_HEAD', run);
    await run(checkout, ['merge', '--ff-only', '--no-edit', 'FETCH_HEAD']);
    return { path: checkout, branch, commit: (await run(checkout, ['rev-parse', 'HEAD'])).trim() };
  } finally { await fs.rm(hooks, { recursive: true, force: true }); }
}
/** Legacy callers must now supply an explicit selected project folder. */
export function managedRepositoryPath(_root: string, _repository: string, localPath?: string): string { return projectPath(localPath); }
export function pullManagedRepository(root: string, repository: string, progress?: (message: string) => void, localPath?: string): Promise<{ path: string; branch: string; commit: string }> {
  return pullProjectRepository(root, repository, projectPath(localPath), progress);
}
