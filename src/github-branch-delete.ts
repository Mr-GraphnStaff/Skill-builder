import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { githubRepository, type ReviewContext } from './github-review.js';
import { runPublisherProcess } from './repository-publisher.js';

export type BranchDeleteRunner = typeof runPublisherProcess;
function safeBranch(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 && !['HEAD', '@'].includes(value) && !/[\x00-\x20~^:?*\[\\]/.test(value) && !value.startsWith('-') && !value.includes('..') && !value.includes('@{')
    && !value.endsWith('.') && value.split('/').every(part => !!part && !part.startsWith('.') && !part.endsWith('.lock'));
}
async function noLinks(target: string): Promise<void> {
  let current = path.parse(path.resolve(target)).root;
  for (const part of path.relative(current, path.resolve(target)).split(path.sep)) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Git control folders cannot use linked paths.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
/** Only the recorded head may be deleted. Git compares the lease atomically on
 * the server; an intervening push is retained even after the final metadata read. */
export async function deleteBranchWithLease(workspaceRoot: string, context: ReviewContext, runner: BranchDeleteRunner = runPublisherProcess): Promise<void> {
  const repo = githubRepository(context.repository);
  if (!repo || !safeBranch(context.branch) || !safeBranch(context.baseBranch) || context.branch === context.baseBranch || typeof context.commit !== 'string' || !/^[a-f0-9]{40,64}$/i.test(context.commit)
      || typeof workspaceRoot !== 'string' || !path.isAbsolute(workspaceRoot)) throw new Error('The exact repository, upload branch and commit must be verified before branch cleanup.');
  const control = path.join(path.resolve(workspaceRoot), '.skill-workbench'); await noLinks(control); await fs.mkdir(control, { recursive: true });
  const temporary = await fs.mkdtemp(path.join(control, 'branch-delete-'));
  const bare = path.join(temporary, 'bare.git'), hooks = path.join(temporary, 'disabled-hooks'), template = path.join(temporary, 'empty-template');
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) if (!key.toUpperCase().startsWith('GIT_')) environment[key] = value;
  Object.assign(environment, { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' });
  const args = ['--no-optional-locks', '-c', 'protocol.ext.allow=never', '-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${hooks}`, '-c', `safe.directory=${bare.replace(/\\/g, '/')}`];
  try {
    await fs.mkdir(hooks); await fs.mkdir(template);
    await runner('git', [...args, 'init', '--bare', `--template=${template}`, bare], { cwd: temporary, timeoutMs: 30_000, env: environment });
    const ref = `refs/heads/${context.branch}`;
    // Canonical HTTPS URL has no credentials, executable transport, remote alias
    // or repository-configured push URL. Never add a force flag without this lease.
    await runner('git', [...args, 'push', '--porcelain', `--force-with-lease=${ref}:${context.commit}`, '--', `https://github.com/${repo.fullName}.git`, `:${ref}`], { cwd: bare, timeoutMs: 30_000, env: environment });
  } finally {
    const relative = path.relative(control, path.resolve(temporary));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !path.basename(temporary).startsWith('branch-delete-')) throw new Error('Git cleanup target left its private workspace. Temporary metadata was retained.');
    await noLinks(temporary);
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  }
}
