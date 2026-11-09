import * as path from 'node:path';

export type RepositoryConnectionChoice = {
  repository: string; localPath: string; workbenchFolder: string; clone: boolean;
};
export type RepositoryConnectionHooks = {
  workbenchFolder: string;
  currentRepository?: string;
  currentLocalRepository?: string;
  assertCurrent(): void;
  inputRepository(current?: string): Promise<string | undefined>;
  chooseLocalMode(): Promise<'existing' | 'clone' | undefined>;
  chooseFolder(mode: 'existing' | 'clone', suggested?: string): Promise<string | undefined>;
  confirm(choice: RepositoryConnectionChoice): Promise<boolean>;
  validateExisting(repository: string, localPath: string): Promise<void>;
  clone(repository: string, localPath: string): Promise<void>;
  activate(repository: string, localPath: string): Promise<void>;
};

/** Accept repository addresses, never individual files, credentials or transport options. */
export function normalizeGitHubRepository(input: string): string {
  const value = input.trim();
  const match = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9_.-]+)\/?$/i.exec(value);
  const name = match?.[2].replace(/\.git$/i, '');
  if (!match || !name || name === '.' || name === '..' || /[\r\n\0]/.test(value)) {
    throw new Error('Enter a GitHub repository such as https://github.com/your-org/your-repo or your-org/your-repo. Use the repository address, without a file or folder path.');
  }
  return `https://github.com/${match[1]}/${name}.git`;
}

/** Nothing is persisted until the complete user-confirmed pair has been prepared. */
export async function connectRepositoryFlow(hooks: RepositoryConnectionHooks): Promise<boolean> {
  hooks.assertCurrent();
  const input = await hooks.inputRepository(hooks.currentRepository);
  hooks.assertCurrent();
  if (input === undefined || !input.trim()) return false;
  const repository = normalizeGitHubRepository(input);
  const mode = await hooks.chooseLocalMode();
  hooks.assertCurrent();
  if (!mode) return false;
  const folder = await hooks.chooseFolder(mode, hooks.currentLocalRepository);
  hooks.assertCurrent();
  if (!folder) return false;
  if (!path.isAbsolute(folder)) throw new Error('Choose an absolute local folder. Your existing connection is unchanged.');
  const localPath = mode === 'clone' ? path.join(folder, repository.split('/').at(-1)!.replace(/\.git$/, '')) : path.resolve(folder);
  if (mode === 'existing') {
    await hooks.validateExisting(repository, localPath);
    hooks.assertCurrent();
  }
  if (!await hooks.confirm({ repository, localPath, workbenchFolder: hooks.workbenchFolder, clone: mode === 'clone' })) return false;
  hooks.assertCurrent();
  if (mode === 'clone') {
    await hooks.clone(repository, localPath);
    hooks.assertCurrent();
  }
  await hooks.activate(repository, localPath);
  return true;
}


