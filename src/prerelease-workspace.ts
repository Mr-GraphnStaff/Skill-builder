import * as path from 'node:path';
import * as fs from 'node:fs';

const CHANNEL_DIRECTORY = '.skilljetty-prerelease';

function rejectLinkedAncestors(candidate: string): void {
  const absolute = path.resolve(candidate);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Prerelease work paths cannot contain symbolic links or junctions.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
}

/** Public identity and settings are shared; work data is never auto-migrated. */
export function prereleaseWorkspaceRoot(workspace: string, configured = ''): string {
  const selected = path.resolve(workspace, configured.trim() || '.');
  // Resolve the outermost channel/control ancestor, including nested inherited
  // selections, so preview work cannot be created inside another channel.
  let cursor = selected;
  let boundary: { directory: string; channel: string } | undefined;
  while (true) {
    const channel = path.basename(cursor).toLowerCase();
    if ([CHANNEL_DIRECTORY, '.skilljetty-beta', '.skill-workbench'].includes(channel)) boundary = { directory: cursor, channel };
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  const result = boundary ? boundary.channel === CHANNEL_DIRECTORY ? boundary.directory : path.join(path.dirname(boundary.directory), CHANNEL_DIRECTORY) : path.join(selected, CHANNEL_DIRECTORY);
  rejectLinkedAncestors(result);
  return result;
}

/** Stable absolute/traversal overrides cannot redirect prerelease work data. */
export function prereleaseDataDirectory(root: string, configured: string, fallback: 'skills' | 'dist'): string {
  const value = configured.trim();
  const safeDefault = path.join(root, fallback);
  const candidate = !value || path.isAbsolute(value) || path.win32.isAbsolute(value) ? safeDefault : path.resolve(root, value);
  const relative = path.relative(root, candidate);
  const result = !relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ? safeDefault : candidate;
  rejectLinkedAncestors(result);
  return result;
}
