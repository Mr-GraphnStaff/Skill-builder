import * as path from 'node:path';

/** Local UAT always uses a separate data tree, including explicit folder picks. */
export function betaWorkspaceRoot(workspace: string, configured = ''): string {
  const selected = path.resolve(workspace, configured.trim() || '.');
  return path.basename(selected).toLowerCase() === '.skilljetty-beta' ? selected : path.join(selected, '.skilljetty-beta');
}
