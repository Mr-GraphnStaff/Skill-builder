import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { currentWorkbenchMetrics, emitWorkbenchMetric } from './workbench-metrics.js';
import { verifySkillRelease } from './skill-workbench.js';

const execute = promisify(execFile);
const previews = new Map<string, { inventory: Map<string, string>; indexTree: string }>();
type Progress = (message: string) => void;
function report(progress: Progress | undefined, message: string): void { try { progress?.(message); } catch { /* A display callback cannot change a publication outcome. */ } }

/** Internal runtime boundary, exported for process-lifecycle regression tests.
 * The deadline belongs to the returned process, never a matching process name. */
export function runPublisherProcess(command: string, args: string[], options: { cwd: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; input?: string }): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? 120_000;
    const child = spawn(command, args, { cwd: options.cwd, windowsHide: true, detached: process.platform !== 'win32', env: options.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.on('error', () => { /* Process exit/error owns the outcome, including a closed stdin. */ });
    child.stdin.end(options.input);
    const stdout: Buffer[] = []; const stderr: Buffer[] = [];
    let outputBytes = 0; let stopReason: string | undefined; let finished = false;
    let termination: Promise<void> = Promise.resolve(); let lastResort: NodeJS.Timeout | undefined;
    const done = (error?: Error) => {
      if (finished) return; finished = true; clearTimeout(deadline); if (lastResort) clearTimeout(lastResort);
      const out = Buffer.concat(stdout).toString('utf8'); const err = Buffer.concat(stderr).toString('utf8');
      if (error) { Object.assign(error, { stdout: out, stderr: err }); reject(error); }
      else resolve({ stdout: out, stderr: err });
    };
    const stop = (reason: string) => {
      if (stopReason || finished) return; stopReason = reason;
      termination = (async () => {
        const pid = child.pid;
        if (!pid || child.exitCode !== null || child.signalCode !== null) return;
        if (process.platform === 'win32') {
          const taskkill = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe');
          try { await execute(taskkill, ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5_000 }); }
          catch { if (child.exitCode === null && child.signalCode === null) throw new Error('Owned process tree termination could not be confirmed.'); }
        } else {
          try { process.kill(-pid, 'SIGKILL'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
        }
      })();
      // A failed termination must not become an unhandled rejection or erase
      // the deadline error. Leave its temporary checkout for diagnosis/recovery.
      termination = termination.catch(error => { stopReason = `${reason} ${error instanceof Error ? error.message : String(error)}`; });
      lastResort = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); done(new Error(`${stopReason} Process close was not confirmed; temporary checkout may still be in use.`)); }, 7_000);
    };
    const deadline = setTimeout(() => stop(`Command timed out after ${timeoutMs} ms.`), timeoutMs);
    const collect = (target: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 8 * 1024 * 1024) { stop('Command exceeded its output limit.'); return; }
      target.push(Buffer.from(chunk));
    };
    child.stdout.on('data', (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on('data', (chunk: Buffer) => collect(stderr, chunk));
    child.on('error', error => done(error));
    child.on('close', (code, signal) => {
      void termination.then(() => {
        if (stopReason) done(new Error(stopReason));
        else if (code !== 0) done(Object.assign(new Error(`Command exited with code ${String(code)}${signal ? ` (${signal})` : ''}.`), { exitCode: code }));
        else done();
      });
    });
  });
}

export type RepositoryChoice = { label: string; repository: string };
export type CreatedRepository = { repository: string; baseBranch: string; nameWithOwner: string; visibility: 'private' | 'public' };

/** Discover the repository's actual default branch rather than asking a skill
 * author to invent a Git branch name. An unborn/ambiguous HEAD is not guessed. */
export async function resolveRepositoryDefaultBranch(repository: string): Promise<string> {
  validateRepository(repository);
  const advertised = await git(os.tmpdir(), ['ls-remote', '--symref', repository, 'HEAD']);
  const branch = /^ref:\s+refs\/heads\/(.+)\s+HEAD$/m.exec(advertised)?.[1];
  const head = /^([a-f0-9]{40,64})\s+HEAD$/m.exec(advertised)?.[1];
  if (!branch || !head) throw new Error('The repository has no readable default branch. Choose an initialized repository with an initial commit.');
  await git(os.tmpdir(), ['check-ref-format', '--branch', branch]);
  const ref = `refs/heads/${branch}`;
  const verified = await git(os.tmpdir(), ['ls-remote', '--exit-code', '--heads', repository, ref]);
  if (!verified.split(/\r?\n/).some(row => row.trim() === `${head}\t${ref}`)) {
    throw new Error('The repository default branch changed while connecting. Connect again to refresh it.');
  }
  return branch;
}

/** Read-only confirmation used to finish local cleanup after an interrupted,
 * already-recorded upload. Never retries a remote write. */
export async function verifyRepositoryBranchCommit(repository: string, branch: string, commit: string): Promise<boolean> {
  validateRepository(repository);
  if (!/^[a-f0-9]{40,64}$/i.test(commit)) throw new Error('The recorded upload commit is invalid.');
  await git(os.tmpdir(), ['check-ref-format', '--branch', branch]);
  const ref = `refs/heads/${branch}`;
  const advertised = await git(os.tmpdir(), ['ls-remote', '--heads', repository, ref]);
  return advertised.split(/\r?\n/).some(row => row.trim() === `${commit}\t${ref}`);
}
export type PublishPreview = {
  checkoutPath: string; repository: string; branch: string; relativePath: string;
  files: string[]; changedFiles?: string[]; skillName: string; version: string;
};

async function git(cwd: string, args: string[]): Promise<string> {
  const started = performance.now();
  let outcome: 'ok' | 'error' = 'error', timedOut = false, exitCode: number | undefined;
  // Skip Git global options and their values. Never log arguments, URLs or output.
  let index = 0;
  while (index < args.length && args[index].startsWith('-')) index += ['-c', '-C', '--git-dir', '--work-tree'].includes(args[index]) ? 2 : 1;
  const operation = args[index] ?? 'other';
  try {
    const result = await runPublisherProcess('git', ['-c', 'protocol.ext.allow=never', '-c', 'core.fsmonitor=false', '-c', 'core.longpaths=true', ...args], {
      cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });
    outcome = 'ok'; exitCode = 0; return result.stdout;
  } catch (error) {
    const detail = error as Error & { stderr?: string; exitCode?: number };
    exitCode = detail.exitCode;
    timedOut = /timed out/i.test(detail.message);
    // Git errors can include remote URLs containing credentials.
    const message = `${detail.message}${detail.stderr ? `\n${detail.stderr}` : ''}`.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[redacted]@');
    throw new Error(`Git operation failed: ${message.trim()}`);
  } finally {
    emitWorkbenchMetric(currentWorkbenchMetrics(), { stage: ['ls-remote', 'fetch', 'pull', 'push', 'clone'].includes(operation) ? 'gitRemote' : 'gitLocal', operation, durationMs: performance.now() - started, outcome, timedOut, exitCode });
  }
}

async function githubCli(args: string[], options: { cwd: string; encoding: 'utf8'; windowsHide: boolean; timeout: number; maxBuffer: number }) {
  const started = performance.now(); let outcome: 'ok' | 'error' = 'error', exitCode: number | undefined, timedOut = false;
  const operation = args[0] === 'api' ? 'account' : args[1] === 'list' ? 'repositoryList' : args[1] === 'create' ? 'repositoryCreate' : 'repositoryView';
  try { const result = await execute('gh', args, options); outcome = 'ok'; exitCode = 0; return result; }
  catch (error) { const detail = error as { code?: unknown; killed?: boolean }; if (typeof detail.code === 'number') exitCode = detail.code; timedOut = detail.killed === true; throw error; }
  finally { emitWorkbenchMetric(currentWorkbenchMetrics(), { stage: 'githubCli', operation, durationMs: performance.now() - started, outcome, exitCode, timedOut }); }
}

export async function listRepositoryChoices(workspaceRoot: string): Promise<RepositoryChoice[]> {
  const choices: RepositoryChoice[] = [];
  try {
    const names = (await git(workspaceRoot, ['remote'])).trim().split(/\r?\n/).filter(Boolean);
    for (const name of names) {
      const url = (await git(workspaceRoot, ['remote', 'get-url', '--', name])).trim();
      // Stored associations use resolved URLs, not names meaningful only in one checkout.
      if (!/https?:\/\/[^/\s]*@/.test(url)) choices.push({ label: `${name} — ${url}`, repository: url });
    }
  } catch { /* A new workbench need not already be a Git repository. */ }
  try {
    const result = await githubCli(['repo', 'list', '--limit', '100', '--json', 'nameWithOwner,url'], {
      cwd: workspaceRoot, encoding: 'utf8', windowsHide: true, timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024
    });
    for (const repo of JSON.parse(result.stdout)) {
      if (typeof repo.url === 'string' && typeof repo.nameWithOwner === 'string') {
        if (!choices.some(choice => choice.repository.replace(/\.git$/, '') === repo.url)) {
          choices.push({ label: repo.nameWithOwner, repository: repo.url });
        }
      }
    }
  } catch { /* CLI sign-in is optional; remote and manual selection remain available. */ }
  return choices;
}

/** Creates only the repository selected and confirmed by the UI; never overwrites one. */
export async function createGitHubRepository(
  workspaceRoot: string, name: string, visibility: 'private' | 'public' = 'private'
): Promise<CreatedRepository> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(name) || name === '.' || name === '..') {
    throw new Error('Enter a repository name using letters, numbers, dots, underscores and hyphens.');
  }
  if (visibility !== 'private' && visibility !== 'public') throw new Error('Choose private or public repository visibility.');
  const options = { cwd: workspaceRoot, encoding: 'utf8' as const, windowsHide: true, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 };
  const account = await githubCli(['api', 'user', '--jq', '.login'], options);
  const owner = account.stdout.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(owner)) throw new Error('GitHub CLI did not return a signed-in account. Sign in using your normal GitHub CLI setup.');
  const nameWithOwner = `${owner}/${name}`;
  try {
    await githubCli(['repo', 'create', nameWithOwner, `--${visibility}`, '--add-readme', '--description', 'Versioned skill packages, editable source and changelogs.'], options);
  } catch {
    // Do not retry a possibly completed external creation automatically.
    throw new Error(`Repository creation did not confirm success. Check ${nameWithOwner} in GitHub before retrying, or select it from existing repositories.`);
  }
  const metadata = await githubCli(['repo', 'view', nameWithOwner, '--json', 'nameWithOwner,url,visibility,defaultBranchRef'], options);
  const repo = JSON.parse(metadata.stdout);
  if (repo.nameWithOwner?.toLowerCase() !== nameWithOwner.toLowerCase()
      || typeof repo.url !== 'string' || repo.visibility?.toLowerCase() !== visibility
      || typeof repo.defaultBranchRef?.name !== 'string') {
    throw new Error(`Repository was created, but its identity, visibility or initialized base branch could not be verified. Select ${nameWithOwner} after checking it in GitHub.`);
  }
  return { repository: repo.url, baseBranch: repo.defaultBranchRef.name, nameWithOwner: repo.nameWithOwner, visibility };
}

function validateRepository(repository: string): void {
  let embeddedPassword = false;
  try { embeddedPassword = !!new URL(repository).password; } catch { /* Local paths and SCP-style SSH locations are not URLs. */ }
  if (!repository.trim() || repository.startsWith('-') || /[\r\n\0]/.test(repository)
      || /^(?:ext|fd)::/i.test(repository) || /https?:\/\/[^/\s]*@/.test(repository) || embeddedPassword) {
    throw new Error('Choose a repository URL or local repository path without embedded credentials.');
  }
}

async function inventory(root: string, prefix = ''): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Release contains a symbolic link: ${relative}`);
    if (entry.name.toLowerCase() === '.git') throw new Error('A release cannot contain Git metadata.');
    if (entry.isDirectory()) {
      for (const [name, hash] of await inventory(root, relative)) result.set(name, hash);
    } else if (entry.isFile()) {
      result.set(relative, createHash('sha256').update(await fs.readFile(path.join(root, relative))).digest('hex'));
    } else throw new Error(`Unsupported release entry: ${relative}`);
  }
  return result;
}

function equalInventory(left: Map<string, string>, right: Map<string, string>): boolean {
  return left.size === right.size && [...left].every(([file, hash]) => right.get(file) === hash);
}

async function verifyGitBlobs(preview: PublishPreview, committed = false): Promise<void> {
  const format = (await git(preview.checkoutPath, ['rev-parse', '--show-object-format'])).trim();
  if (format !== 'sha1' && format !== 'sha256') throw new Error('Unsupported Git object format.');
  const output = committed
    ? await git(preview.checkoutPath, ['ls-tree', '-r', '-z', 'HEAD', '--', preview.relativePath])
    : await git(preview.checkoutPath, ['ls-files', '--stage', '-z', '--', preview.relativePath]);
  const objects = new Map<string, string>();
  for (const row of output.split('\0').filter(Boolean)) {
    const match = /^(\d+) (?:blob )?([a-f0-9]+)(?: 0)?\t(.+)$/.exec(row);
    if (!match || match[1] !== '100644') throw new Error('Unexpected release index mode or object.');
    objects.set(match[3], match[2]);
  }
  if (objects.size !== preview.files.length) throw new Error('Git release inventory changed.');
  for (const file of preview.files) {
    const bytes = await fs.readFile(path.join(preview.checkoutPath, file));
    const expected = createHash(format).update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
    if (objects.get(file) !== expected) throw new Error(`Git changed release bytes: ${file}`);
  }
}

/** Prepare a reviewable commit in the destination repository's own history. */
export async function prepareRepositoryPublish(
  releaseDirectory: string, repository: string, baseBranch = 'main', onProgress?: Progress, replaceExisting = false,
  options: { localPath?: string } = {}
): Promise<PublishPreview> {
  report(onProgress, 'Validating the prepared release.');
  validateRepository(repository);
  const root = path.resolve(releaseDirectory);
  const manifest = verifySkillRelease(root).manifest;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.skillName)
      || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(manifest.version)) {
    throw new Error('Release manifest must contain a valid skill name and version.');
  }
  const sourceInventory = await inventory(root);
  if (!sourceInventory.has('CHANGELOG.md') || !sourceInventory.has('release.json')
      || ![...sourceInventory.keys()].some(file => file.endsWith('.skill'))) {
    throw new Error('Release must include its package, CHANGELOG.md, and release.json.');
  }
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-workbench-publish-'));
  const checkoutPath = path.join(temp, 'repository');
  try {
    const emptyTemplate = path.join(temp, 'empty-template');
    const emptyHooks = path.join(temp, 'empty-hooks');
    await fs.mkdir(emptyTemplate); await fs.mkdir(emptyHooks);
    await git(temp, ['check-ref-format', '--branch', baseBranch]);
    if (options.localPath) {
      // Reuse downloaded objects without changing the author's files, index,
      // branch, configuration or hooks. No alternates/hardlinks tie the owned
      // publication checkout to subsequent GC or edits in the selected repo.
      const { validateProjectRepositoryForPublish } = await import('./managed-repository.js');
      const local = await validateProjectRepositoryForPublish(repository, options.localPath);
      report(onProgress, 'Reusing your local repository to prepare an isolated submission…');
      await git(temp, ['-c', `core.hooksPath=${emptyHooks}`, 'clone', '--no-checkout', `--template=${emptyTemplate}`, '--no-hardlinks', '--', local, checkoutPath]);
      await git(checkoutPath, ['remote', 'set-url', 'origin', repository]);
      report(onProgress, 'Fetching the latest destination branch; existing downloaded data is reused…');
      await git(checkoutPath, ['fetch', '--no-tags', '--refmap=', 'origin', `+refs/heads/${baseBranch}:refs/remotes/origin/${baseBranch}`]);
      // Point HEAD at the fetched base without checking out content before
      // the conversion/filter overrides below have been installed.
      await git(checkoutPath, ['update-ref', '--no-deref', 'HEAD', `refs/remotes/origin/${baseBranch}`]);
    } else {
      report(onProgress, 'Downloading the destination repository for this submission…');
      await git(temp, ['-c', `core.hooksPath=${emptyHooks}`, 'clone', '--no-checkout', `--template=${emptyTemplate}`, '--no-hardlinks', ...(replaceExisting ? [] : ['--depth', '1']), '--single-branch', '--branch', baseBranch, '--', repository, checkoutPath]);
    }
    report(onProgress, 'Preparing the destination checkout.');
    // Prevent user/repository filters and line-ending conversions from running or
    // altering a release. info/attributes takes precedence over tracked attributes.
    await fs.mkdir(path.join(checkoutPath, '.git', 'info'), { recursive: true });
    await fs.writeFile(path.join(checkoutPath, '.git', 'info', 'attributes'), '* merge -text -filter -ident -working-tree-encoding\n');
    await git(checkoutPath, ['config', '--local', 'core.hooksPath', emptyHooks]);
    await git(checkoutPath, ['reset', '--hard', 'HEAD']);
    const branch = `skills/${manifest.skillName}/${manifest.version}`;
    const relativePath = `${manifest.skillName}/${manifest.version}`;
    let pulledPaths: string[] = [];
    if (replaceExisting) {
      report(onProgress, 'Fetching the latest registered repository branches.');
      const advertised = await git(checkoutPath, ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]);
      if (advertised.trim()) {
        await git(checkoutPath, ['fetch', '--no-tags', 'origin', `refs/heads/${branch}:refs/remotes/origin/skilljetty-upload`]);
        await git(checkoutPath, ['switch', '-C', branch, 'refs/remotes/origin/skilljetty-upload']);
        // Pull the latest base into an existing review branch before replacing
        // the selected version. A conflict stops before any remote write.
        await git(checkoutPath, ['fetch', '--no-tags', 'origin', `refs/heads/${baseBranch}`]);
        try {
          await git(checkoutPath, ['-c', 'merge.autostash=false', '-c', 'merge.renormalize=false', 'merge', '--no-commit', '--no-ff', 'FETCH_HEAD']);
        } catch (error) {
          const conflicts = (await git(checkoutPath, ['diff', '--name-only', '--diff-filter=U', '-z'])).split('\0').filter(Boolean);
          if (!conflicts.length || conflicts.some(file => !file.startsWith(`${relativePath}/`))) throw error;
          // The user selected this whole version for replacement. Only its
          // conflicts are resolved by the incoming copy; other conflicts stop.
        }
        pulledPaths = (await git(checkoutPath, ['diff', '--cached', '--name-only', '-z'])).split('\0').filter(file => file && !file.startsWith(`${relativePath}/`)).sort();
      } else await git(checkoutPath, ['switch', '-C', branch]);
    } else await git(checkoutPath, ['switch', '-C', branch]);
    const destination = path.join(checkoutPath, relativePath);
    // The target path must not traverse a symlink already present in the target repository.
    for (const part of [manifest.skillName]) {
      try {
        const stat = await fs.lstat(path.join(checkoutPath, part));
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe repository destination: ${part}`);
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    try {
      const stat = await fs.lstat(destination);
      if (!replaceExisting) throw new Error(`Version ${manifest.version} already exists in this repository.`);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Unsafe repository version destination.');
      await fs.rm(destination, { recursive: true });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    report(onProgress, 'Copying and checking the complete release.');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(root, destination, { recursive: true, errorOnExist: true, force: false });
    const copied = await inventory(destination);
    if (!equalInventory(sourceInventory, copied)) throw new Error('Release changed while preparing publication; prepare it again.');
    await git(checkoutPath, ['add', '-f', '--', relativePath]);
    const files = (await git(checkoutPath, ['diff', '--cached', '--name-only', '-z'])).split('\0').filter(Boolean).sort();
    const expected = [...copied.keys()].map(file => `${relativePath}/${file}`).sort();
    const outside = files.filter(file => !file.startsWith(`${relativePath}/`));
    if (replaceExisting ? JSON.stringify(outside) !== JSON.stringify(pulledPaths) : JSON.stringify(files) !== JSON.stringify(expected)) throw new Error('Staged files do not match the complete release.');
    const preview: PublishPreview = { checkoutPath, repository, branch, relativePath, files: expected, changedFiles: files,
      skillName: manifest.skillName, version: manifest.version };
    await verifyGitBlobs(preview);
    previews.set(checkoutPath, { inventory: copied, indexTree: (await git(checkoutPath, ['write-tree'])).trim() });
    report(onProgress, 'Publication preview is ready for review.');
    return preview;
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    try { await fs.rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
    catch (cleanupError) {
      const code = (cleanupError as NodeJS.ErrnoException).code ?? 'cleanup failed';
      failure.message += `\nTemporary checkout retained at ${temp} (${code}).`;
      report(onProgress, `Temporary checkout retained at ${temp}; the original publication failure is preserved.`);
    }
    throw failure;
  }
}

/** Commit/push only after the caller has shown the preview and obtained the user's action. */
export async function pushPreparedRelease(preview: PublishPreview, onProgress?: Progress): Promise<{ commit: string; branch: string; repository: string }> {
  report(onProgress, 'Verifying the reviewed release before publication.');
  const expected = previews.get(preview.checkoutPath);
  if (!expected) throw new Error('Publication preview expired; prepare it again.');
  const current = await inventory(path.join(preview.checkoutPath, preview.relativePath));
  if (!equalInventory(expected.inventory, current)) throw new Error('Prepared files changed; review a new publication preview.');
  if ((await git(preview.checkoutPath, ['write-tree'])).trim() !== expected.indexTree) throw new Error('Unexpected staged files or changed Git index; publication stopped.');
  const staged = (await git(preview.checkoutPath, ['diff', '--cached', '--name-only', '-z'])).split('\0').filter(Boolean).sort();
  // Retrying an unsuccessful push reuses the existing commit instead of duplicating it.
  if (staged.length > 0) {
    if (JSON.stringify(staged) !== JSON.stringify(preview.changedFiles ?? preview.files)) throw new Error('Unexpected staged files; publication stopped.');
    // This exact index tree was byte-verified during preparation. Its immutable
    // identity above plus the fresh file inventory avoids rereading every file
    // merely to prove the same indexed blob identities.
    const emptyHooks = path.join(path.dirname(preview.checkoutPath), 'empty-hooks');
    await fs.mkdir(emptyHooks, { recursive: true });
    report(onProgress, 'Creating the release commit.');
    await git(preview.checkoutPath, ['-c', `core.hooksPath=${emptyHooks}`, 'commit', '-m', `Release ${preview.skillName} ${preview.version}`]);
  }
  const commit = (await git(preview.checkoutPath, ['rev-parse', 'HEAD'])).trim();
  const actual = preview.changedFiles?.length === 0 ? [] : (await git(preview.checkoutPath, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', `${commit}^`, commit])).split('\0').filter(Boolean).sort();
  if (preview.changedFiles?.length !== 0 && JSON.stringify(actual) !== JSON.stringify(preview.changedFiles ?? preview.files)) throw new Error('Commit contents differ from the reviewed release.');
  if ((await git(preview.checkoutPath, ['rev-parse', 'HEAD^{tree}'])).trim() !== expected.indexTree) throw new Error('Committed tree differs from the reviewed release.');
  report(onProgress, 'Pushing the release branch to the selected repository.');
  await git(preview.checkoutPath, ['push', '--porcelain', 'origin', `HEAD:refs/heads/${preview.branch}`]);
  report(onProgress, 'Confirming the published commit on the remote repository.');
  const remote = await git(preview.checkoutPath, ['ls-remote', '--heads', 'origin', `refs/heads/${preview.branch}`]);
  if (remote.split(/\s/)[0] !== commit) throw new Error('Push returned without confirming the expected remote commit.');
  report(onProgress, 'The remote repository confirms the published release.');
  return { commit, branch: preview.branch, repository: preview.repository };
}

export async function disposePublishPreview(preview: PublishPreview, onProgress?: Progress): Promise<void> {
  if (!previews.has(preview.checkoutPath)) return;
  const parent = path.dirname(path.resolve(preview.checkoutPath));
  if (path.dirname(parent) !== path.resolve(os.tmpdir()) || !path.basename(parent).startsWith('skill-workbench-publish-')) {
    throw new Error('Unexpected publication temporary directory.');
  }
  try {
    await fs.rm(parent, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    previews.delete(preview.checkoutPath);
  } catch (error) {
    const message = `Temporary publication checkout retained at ${parent} (${(error as NodeJS.ErrnoException).code ?? 'cleanup failed'}). Publication status is unchanged.`;
    report(onProgress, message);
    console.warn(message);
  }
}

// Shared process boundary for the explicit managed repository pull action.
export { git as repositoryGit };
