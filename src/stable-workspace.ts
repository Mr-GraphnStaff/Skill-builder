import * as path from 'node:path';
import * as fs from 'node:fs';

function checkedPath(candidate: string): string {
  const absolute = path.resolve(candidate);
  if (absolute.split(/[\\/]/).some(segment => ['.codex', '.skilljetty-prerelease', '.skilljetty-beta', '.skill-workbench'].includes(segment.toLowerCase()))) {
    throw new Error('Choose a stable project folder outside Codex, preview, and private workbench storage.');
  }
  let current = path.parse(absolute).root;
  for (const part of path.relative(current, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Stable work paths cannot contain symbolic links or junctions.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
  return absolute;
}

/** Preserve the stable workspace choice; never discover or migrate preview data. */
export function stableWorkspaceRoot(workspace: string, configured = ''): string {
  return checkedPath(path.resolve(workspace, configured.trim() || '.'));
}

/** Stable settings retain their explicit directories, including absolute paths. */
export function stableDataDirectory(root: string, configured: string, _fallback: 'skills' | 'dist'): string {
  // The settings reader supplies its default. An explicitly empty setting
  // historically selects root, and whitespace can be a real directory name.
  return checkedPath(path.resolve(root, configured));
}
