import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

export const WORKBENCH_MARKER = '.skilljetty-workbench.json';
const recognized = new Set<string>();
const ownedRepositories = new Set<string>();
type SelectedRepository = { root: string; repository: string; localPath: string; gitConfigDigest?: string };
const selectedRepositoryRoots = new Map<string, string>();
const knownSelectedPaths = new Map<string, string>();
const pendingRepositories = new Map<string, SelectedRepository>();
const repositoryIdentity = (value: string) => value.replace(/\.git$/i, '').replace(/\/$/, '').toLowerCase();
const selectedPathKey = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);

export function selectedRepositoryConfigDigest(localPath: string): string | undefined {
  const config = assertWorkbenchPath(localPath, path.join(localPath, '.git', 'config'));
  return fs.existsSync(config) ? createHash('sha256').update(fs.readFileSync(config)).digest('hex') : undefined;
}

/** An external checkout is an explicit, exact pair, never another workbench. */
export function validateSeparateRepositoryPath(root: string, localPath: string): string {
  if (!path.isAbsolute(localPath)) throw new Error('Choose an absolute local repository folder.');
  const selected = assertWorkbenchPath(localPath, localPath), workbench = path.resolve(root);
  const inside = (base: string, target: string) => { const rel = path.relative(base, target); return !rel || rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); };
  if (inside(selected, workbench) || inside(workbench, selected)) throw new Error('Choose a local repository separate from the workbench folder. Your workbench is for drafts and background files.');
  if (selected.split(/[\\/]/).some(part => ['.git', '.codex', '.skill-workbench', '.skilljetty-prerelease', '.skilljetty-beta'].includes(part.toLowerCase()))) throw new Error('Choose a visible local repository outside private application storage.');
  return selected;
}

function selectedRepository(root: string): SelectedRepository | undefined {
  const absolute = path.resolve(root), pending = pendingRepositories.get(absolute);
  if (pending) {
    validateSeparateRepositoryPath(absolute, pending.localPath);
    const digest = selectedRepositoryConfigDigest(pending.localPath);
    if (pending.gitConfigDigest && digest !== pending.gitConfigDigest) throw new Error('The selected repository configuration changed during connection. No further Git operation ran.');
    // A new clone acquires its immutable configuration pin once promoted.
    if (!pending.gitConfigDigest && digest) pending.gitConfigDigest = digest;
    return pending;
  }
  const file = assertWorkbenchPath(absolute, path.join(absolute, '.skill-workbench', 'connection.json'));
  if (!fs.existsSync(file)) return undefined;
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value.format !== 1 || value.separateRepository !== true) return undefined;
  assertRemoteDestination(value.repository);
  const localPath = validateSeparateRepositoryPath(absolute, value.localPath);
  if (typeof value.gitConfigDigest !== 'string' || selectedRepositoryConfigDigest(localPath) !== value.gitConfigDigest) throw new Error('The connected repository configuration changed. Connect it again before syncing or sharing.');
  return { root: absolute, repository: value.repository, localPath, gitConfigDigest: value.gitConfigDigest };
}

/** Register only a validated saved record; the record is re-read for every use. */
export function recognizeSelectedRepository(root: string): void {
  const selected = selectedRepository(root);
  if (selected) { selectedRepositoryRoots.set(path.resolve(root), selected.localPath); knownSelectedPaths.set(selectedPathKey(selected.localPath), path.resolve(root)); }
}

export function selectedRepositoryForPath(target: string): SelectedRepository | undefined {
  const absolute = path.resolve(target);
  const candidates = new Map([...selectedRepositoryRoots, ...[...pendingRepositories].map(([root, value]) => [root, value.localPath] as const)]);
  for (const [root, localPath] of candidates) {
    if (path.relative(localPath, absolute)) continue;
    const selected = selectedRepository(root);
    if (selected && !path.relative(selected.localPath, absolute)) return selected;
  }
  if (knownSelectedPaths.has(selectedPathKey(absolute))) throw new Error('This local repository is no longer the connected destination. Review the current connection before continuing.');
  return undefined;
}

export function assertSelectedRepository(root: string, localPath: string, repository?: string): string {
  const selected = selectedRepository(root);
  if (!selected || path.relative(selected.localPath, path.resolve(localPath)) || repository && repositoryIdentity(selected.repository) !== repositoryIdentity(repository)) throw new Error('The workbench selected local and remote repository pair changed. Connect the repository again before continuing.');
  return selected.localPath;
}

/** Native connection preparation only. Grant expires if validation/clone fails. */
export async function withSelectedRepository<T>(root: string, repository: string, localPath: string, perform: () => Promise<T>): Promise<T> {
  assertRemoteDestination(repository);
  const absolute = path.resolve(root), selected = validateSeparateRepositoryPath(root, localPath);
  if (pendingRepositories.has(absolute)) throw new Error('A repository connection is already being prepared.');
  pendingRepositories.set(absolute, { root: absolute, repository, localPath: selected, gitConfigDigest: selectedRepositoryConfigDigest(selected) });
  try { return await perform(); } finally { pendingRepositories.delete(absolute); }
}

/** Validate every existing ancestor, including ancestors above the selected root. */
export function assertWorkbenchPath(root: string, target: string): string {
  const absolute = path.resolve(target), base = path.resolve(root);
  for (const known of recognized) {
    const child = path.relative(known, absolute);
    if (child === '' || (!child.startsWith(`..${path.sep}`) && child !== '..' && !path.isAbsolute(child))) {
      try {
        const marker = path.join(known, WORKBENCH_MARKER);
        if (fs.lstatSync(marker).isSymbolicLink() || JSON.parse(fs.readFileSync(marker, 'utf8')).format !== 1) throw new Error();
      } catch { throw new Error('Your workbench setup record is missing or damaged. Reopen workbench setup before writing.'); }
    }
  }
  const relative = path.relative(base, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Write blocked: the destination must remain inside your SkillJetty workbench.');
  }
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    if (/[. ]$/.test(part) || /[\x00-\x1f]/.test(part) || (process.platform === 'win32' && part.includes(':'))) {
      throw new Error('Workbench paths cannot use ambiguous names or alternate data streams.');
    }
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error('Write blocked: workbench paths cannot contain symbolic links or junctions.');
      if (stat.isFile() && stat.nlink > 1) throw new Error('Write blocked: workbench files cannot be hard links to another location.');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return absolute;
}

/** Once recognized, removing/damaging a marker fails closed in this runtime. */
export function isManagedWorkbench(root: string): boolean {
  const absolute = path.resolve(root), marker = path.join(absolute, WORKBENCH_MARKER);
  assertWorkbenchPath(absolute, marker);
  if (!fs.existsSync(marker) && !recognized.has(absolute)) return false;
  let value: unknown;
  try { value = JSON.parse(fs.readFileSync(marker, 'utf8')); }
  catch { throw new Error('Your workbench setup record is missing or damaged. Reopen workbench setup; no destination was changed.'); }
  if (!value || (value as { format?: unknown }).format !== 1) throw new Error('This workbench setup format is unsupported.');
  recognized.add(absolute);
  return true;
}

export function workbenchScratch(root: string, prefix?: string): string {
  if (recognized.has(path.resolve(root))) isManagedWorkbench(root);
  const directory = assertWorkbenchPath(root, path.join(root, 'scratch'));
  fs.mkdirSync(directory, { recursive: true });
  assertWorkbenchPath(root, directory);
  if (!prefix) return directory;
  if (!/^[a-z0-9-]+$/i.test(prefix)) throw new Error('Invalid workbench scratch prefix.');
  const created = fs.mkdtempSync(path.join(directory, prefix));
  assertWorkbenchPath(root, created);
  return created;
}

export function assertWorkbenchRepository(root: string, localPath: string): string {
  const relative = path.relative(path.resolve(root), path.resolve(localPath));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return assertSelectedRepository(root, localPath);
  const selected = assertWorkbenchPath(root, localPath);
  const repositories = path.join(path.resolve(root), 'repositories');
  if (isManagedWorkbench(root)) {
    assertWorkbenchPath(repositories, selected);
    if (!path.relative(repositories, selected)) throw new Error('Choose a repository folder inside workbench/repositories, such as repositories/skills.');
  }
  return selected;
}

/** A local-file push would write outside the workbench just like a file save. */
export function assertRemoteDestination(repository: string): void {
  if (/^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+(?:\.git)?$/i.test(repository)) return;
  throw new Error('Managed workbenches currently support GitHub HTTPS remote addresses, such as https://github.com/your-org/skills.git. Local paths, file URLs and SSH destinations are blocked.');
}

/** Find an already configured boundary for internal Git/scratch paths. */
export function containingWorkbench(target: string): string | undefined {
  let current = path.resolve(target);
  while (true) {
    if (fs.existsSync(path.join(current, WORKBENCH_MARKER)) || recognized.has(current)) {
      isManagedWorkbench(current); assertWorkbenchPath(current, target); return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function workbenchRecovery(root: string): string {
  return isManagedWorkbench(root) ? path.join(root, 'recovery') : path.join(root, '.skill-workbench', 'recovery');
}

/** Git can redirect metadata independently of its working directory. */
export function assertWorkbenchGitMetadata(root: string, checkout: string, bare = false, selectedTransport = false): void {
  assertWorkbenchPath(root, checkout);
  const metadata = bare ? checkout : path.join(checkout, '.git');
  if (!fs.existsSync(metadata)) return;
  assertWorkbenchPath(root, metadata);
  if (!fs.lstatSync(metadata).isDirectory()) throw new Error('A workbench repository must have its own .git directory; linked worktrees are unsupported.');
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      assertWorkbenchPath(root, target);
      if (entry.isDirectory()) walk(target);
      else if (!entry.isFile()) throw new Error('Unsupported Git metadata entry.');
    }
  };
  walk(metadata);
  for (const relative of ['commondir', 'gitdir', 'objects/info/alternates', 'objects/info/http-alternates', 'config.worktree']) {
    if (fs.existsSync(path.join(metadata, relative))) throw new Error('Git metadata redirects outside a self-contained repository; use a fresh clone inside this workbench.');
  }
  const config = path.join(metadata, 'config');
  if (fs.existsSync(config)) {
    const text = fs.readFileSync(config, 'utf8');
    if ((selectedTransport && /^\s*\[\s*(?:http|protocol)\b/im.test(text))
        || /^\s*\[\s*(?:include(?:if)?|url|extensions|credential|filter|diff|merge)\b/im.test(text)
        || /^\s*(?:worktree|pushurl|fsmonitor|sshcommand|gitproxy|credentialhelper|alternaterefscommand|gpgsign|signingkey)\s*=/im.test(text)) {
      throw new Error('Git configuration redirects paths or transport. Use a fresh clone inside this workbench.');
    }
  }
}

export function workbenchGitEnvironment(root: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(environment)) if (/^GIT_/i.test(key) || /^(?:SKILLJETTY_GIT_TOKEN|SKILLJETTY_NODE|ELECTRON_RUN_AS_NODE)$/i.test(key)) delete environment[key];
  return { ...environment, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CEILING_DIRECTORIES: path.resolve(root), GIT_DISCOVERY_ACROSS_FILESYSTEM: '0',
    TMPDIR: workbenchScratch(root), TMP: workbenchScratch(root), TEMP: workbenchScratch(root) };
}

/** Record only a checkout created by SkillJetty, never a pre-existing selection. */
export function recordOwnedWorkbenchRepository(root: string, checkout: string, persistent = false): void {
  const selected = assertWorkbenchPath(root, checkout);
  assertWorkbenchGitMetadata(root, selected);
  ownedRepositories.add(selected);
  if (!persistent) return;
  const file = assertWorkbenchPath(root, path.join(root, '.skill-workbench', 'owned-repositories.json'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let entries: string[] = [];
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved.format !== 1 || !Array.isArray(saved.paths)) throw new Error('The workbench repository ownership record needs attention.');
    entries = saved.paths;
  }
  if (!entries.includes(selected)) entries.push(selected);
  fs.writeFileSync(file, JSON.stringify({ format: 1, paths: entries }, null, 2) + '\n');
}

export function isOwnedWorkbenchRepository(root: string, checkout: string): boolean {
  const selected = assertWorkbenchPath(root, checkout);
  if (ownedRepositories.has(selected)) return true;
  const file = assertWorkbenchPath(root, path.join(root, '.skill-workbench', 'owned-repositories.json'));
  if (!fs.existsSync(file)) return false;
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (saved.format !== 1 || !Array.isArray(saved.paths)) throw new Error('The workbench repository ownership record needs attention.');
  return saved.paths.some((entry: unknown) => typeof entry === 'string' && !path.relative(selected, path.resolve(entry)));
}
