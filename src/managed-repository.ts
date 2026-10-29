import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { repositoryGit, resolveRepositoryDefaultBranch } from './repository-publisher.js';

export function managedRepositoryPath(root: string, repository: string): string {
  return path.join(path.resolve(root), '.skill-workbench', 'repositories', createHash('sha256').update(repository).digest('hex'));
}

async function guard(target: string): Promise<void> {
  const resolved = path.resolve(target);
  let current = path.parse(resolved).root;
  for (const part of path.relative(current, resolved).split(path.sep)) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('The managed repository cannot use linked folders.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

/** User-selected, local-only pull. Existing drafts are separate from this checkout. */
export async function pullManagedRepository(root: string, repository: string, progress?: (message: string) => void): Promise<{ path: string; branch: string; commit: string }> {
  const branch = await resolveRepositoryDefaultBranch(repository);
  const checkout = managedRepositoryPath(root, repository);
  const parent = path.dirname(checkout);
  const hooks = path.join(parent, 'disabled-hooks');
  await guard(checkout); await guard(hooks);
  await fs.mkdir(hooks, { recursive: true });
  const git = (cwd: string, args: string[]) => repositoryGit(cwd, ['-c', `safe.directory=${cwd.replace(/\\/g, '/')}`, '-c', `core.hooksPath=${hooks}`, ...args]);
  let exists = true;
  try { await fs.lstat(checkout); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; exists = false; }
  if (!exists) {
    progress?.('Downloading the registered repository into your managed local checkout…');
    const staging = path.join(parent, `.pull-${randomUUID()}`);
    const template = path.join(hooks, 'empty-template'); await fs.mkdir(template, { recursive: true });
    try {
      await git(parent, ['clone', '--no-checkout', '--no-hardlinks', `--template=${template}`, '--single-branch', '--branch', branch, '--', repository, staging]);
      await fs.mkdir(path.join(staging, '.git', 'info'), { recursive: true });
      await fs.writeFile(path.join(staging, '.git', 'info', 'attributes'), '* merge -text -filter -ident -working-tree-encoding\n');
      await git(staging, ['reset', '--hard', 'HEAD']);
      await fs.rename(staging, checkout);
    } catch (error) {
      // This staging path is generated inside the guarded managed repository parent.
      await fs.rm(staging, { recursive: true, force: true });
      throw error;
    }
  }
  await guard(path.join(checkout, '.git'));
  if (!(await fs.lstat(path.join(checkout, '.git'))).isDirectory()) throw new Error('The managed checkout has invalid Git metadata.');
  if (path.relative(checkout, (await git(checkout, ['rev-parse', '--show-toplevel'])).trim()) !== '') throw new Error('The managed repository identity changed.');
  if ((await git(checkout, ['remote', 'get-url', 'origin'])).trim() !== repository) throw new Error('The managed checkout points to a different repository. Reconnect the intended repository.');
  if ((await git(checkout, ['branch', '--show-current'])).trim() !== branch) throw new Error('The managed checkout is on a different branch. Preserve your changes and switch to the repository default branch before pulling.');
  if ((await git(checkout, ['status', '--porcelain', '--untracked-files=all', '--ignored'])).trim()) throw new Error('The managed checkout has local changes or ignored files. Preserve, commit or move them before Git pull; your files were kept.');
  progress?.('Pulling the latest registered repository changes…');
  await git(checkout, ['pull', '--ff-only', '--no-tags', 'origin', branch]);
  return { path: checkout, branch, commit: (await git(checkout, ['rev-parse', 'HEAD'])).trim() };
}
