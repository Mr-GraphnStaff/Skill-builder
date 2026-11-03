import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { managedRepositoryPath, validateProjectRepositoryForPublish } from './managed-repository.js';
import type { WorkspaceConnection } from './guided-workspace.js';

export type RepositorySettings = { repositoryUrl?: string; localRepositoryPath?: string };
export type RepositorySelection = { repository?: string; localPath?: string; explicit: boolean };
export class RepositoryConfigurationChangedError extends Error {
  constructor(message = 'SkillJetty settings changed during this action. Review the current settings and prepare a fresh submission before retrying.') {
    super(message); this.name = 'RepositoryConfigurationChangedError';
  }
}

export function repositoryIdentity(value: string): string {
  const github = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)\/?$/i.exec(value);
  return github ? `github.com/${github[1]}/${github[2].replace(/\.git$/i, '')}`.toLowerCase() : value.replace(/\.git\/?$/, '').replace(/[\\/]$/, '');
}

/** Pure selection: undefined preserves the per-root association; empty clears it. */
export function selectRepositorySettings(settings: RepositorySettings, saved?: WorkspaceConnection): RepositorySelection {
  for (const value of [settings.repositoryUrl, settings.localRepositoryPath]) {
    if (value !== undefined && typeof value !== 'string') throw new Error('Repository settings must be text. Open SkillJetty Settings to correct them.');
  }
  const repository = settings.repositoryUrl === undefined ? saved?.repository : settings.repositoryUrl.trim() || undefined;
  const localPath = settings.localRepositoryPath === undefined
    ? repository && saved && repositoryIdentity(repository) === repositoryIdentity(saved.repository) ? saved.localPath : undefined
    : settings.localRepositoryPath.trim() || undefined;
  if (repository) {
    let password = false;
    try { password = !!new URL(repository).password; } catch { /* Local Git paths and SCP-style SSH are supported. */ }
    if (repository.startsWith('-') || /[\r\n\0]/.test(repository) || /^(?:ext|fd)::/i.test(repository)
        || /https?:\/\/[^/\s]*@/.test(repository) || password) throw new Error('The configured repository address is unsafe or contains embedded credentials. Correct it in SkillJetty Settings.');
    if (/^https?:\/\/github\.com\//i.test(repository)
        && !/^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/i.test(repository)) {
      throw new Error('Use the GitHub repository address, such as https://github.com/owner/repository, rather than a skill folder, file, or tree URL. Import individual skills from Start.');
    }
  }
  if (localPath) {
    if (/[\r\n\0]/.test(localPath)) throw new Error('The configured local repository path contains invalid characters.');
    managedRepositoryPath('', repository ?? '', localPath);
  }
  return { repository, localPath, explicit: settings.repositoryUrl !== undefined || settings.localRepositoryPath !== undefined };
}

/** Explicit actions only: validate links and any existing repository identity. */
export async function validateLocalRepositorySelection(repository: string, localPath?: string): Promise<void> {
  if (!localPath) return;
  const selected = managedRepositoryPath('', repository, localPath);
  let current = path.parse(selected).root;
  for (const part of path.relative(current, selected).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('The configured local repository cannot use linked paths.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') break; throw error; }
  }
  let entries: string[];
  try { entries = await fs.readdir(selected); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  // A missing or empty path is a valid explicit clone destination for Pull.
  if (entries.length) {
    try { await fs.lstat(path.join(selected, '.git')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Select the Git repository root containing .git, rather than an individual skill or version folder. Existing files were not changed.');
      throw error;
    }
    await validateProjectRepositoryForPublish(repository, selected);
  }
}
