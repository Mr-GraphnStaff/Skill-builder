import { AsyncLocalStorage } from 'node:async_hooks';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertWorkbenchPath, workbenchScratch } from './workbench-boundary.js';

const credentials = new AsyncLocalStorage<string>();
export function withWorkbenchGitCredentials<T>(token: string, operation: () => Promise<T>): Promise<T> {
  if (!token || /[\r\n\0]/.test(token)) throw new Error('GitHub sign-in is unavailable. Connect your GitHub account before retrying.');
  return credentials.run(token, operation);
}
export function currentWorkbenchGitToken(): string | undefined { return credentials.getStore(); }

/** Fixed helper code contains no credential; its token exists only in child memory. */
export function workbenchGitAskpass(root: string): { directory: string; environment: NodeJS.ProcessEnv } | undefined {
  const token = credentials.getStore();
  if (!token) return undefined;
  const directory = workbenchScratch(root, 'git-auth-');
  const script = assertWorkbenchPath(root, path.join(directory, 'askpass.cjs'));
  fs.writeFileSync(script, "process.stdout.write(/username/i.test(process.argv.slice(2).join(' ')) ? 'x-access-token\\n' : (process.env.SKILLJETTY_GIT_TOKEN || '') + '\\n');\n", { flag: 'wx', mode: 0o600 });
  // Git for Windows honors executable shebang helpers. Using sh avoids CMD's
  // expansion of ampersands and percent names in a user-selected folder.
  const launcher = assertWorkbenchPath(root, path.join(directory, 'askpass'));
  fs.writeFileSync(launcher, '#!/bin/sh\nexec "$SKILLJETTY_NODE" "$(dirname "$0")/askpass.cjs" "$@"\n', { flag: 'wx', mode: 0o700 });
  return { directory, environment: { SKILLJETTY_GIT_TOKEN: token, SKILLJETTY_NODE: process.execPath, ELECTRON_RUN_AS_NODE: '1', GIT_ASKPASS: launcher, GIT_TERMINAL_PROMPT: '0' } };
}

export function disposeWorkbenchGitAskpass(root: string, directory: string): void {
  assertWorkbenchPath(root, directory);
  if (path.dirname(directory) !== path.join(path.resolve(root), 'scratch') || !path.basename(directory).startsWith('git-auth-')) throw new Error('Unexpected Git credential helper path.');
  fs.rmSync(directory, { recursive: true, force: true });
}
