import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertWorkbenchPath, isManagedWorkbench, WORKBENCH_MARKER } from './workbench-boundary.js';

export const WORKBENCH_FOLDERS = {
  skills: 'Editable drafts. Imports are copied here; their original files stay untouched.',
  repositories: 'Local Git repositories. Connect a remote address in Settings, then use Pull to clone or update here.',
  releases: 'Saved version packages and upload receipts. A saved package is not proof of a remote upload.',
  'plugin-releases': 'Claude plugin bundles with their own versions, member hashes and marketplace handoff files.',
  'gemini-releases': 'Gemini App ZIP exports and compatibility reports for manual import.',
  scratch: 'Temporary work used during creation and sharing. Never use this folder for your only copy.',
  recovery: 'Earlier edits, completed draft archives and recovery copies. Keep these when recovering work.',
  logs: 'Local performance diagnostics. Skill contents and repository credentials are excluded.',
  '.skill-workbench': 'Internal draft catalog and connection records. Let SkillJetty manage these files.'
} as const;

/** Setup creates only a new or empty, explicitly reviewed directory. */
export function createWorkbench(root: string): string {
  const absolute = assertWorkbenchPath(root, root);
  if (fs.existsSync(absolute) && fs.readdirSync(absolute).length) {
    throw new Error('This folder already contains files. Choose a new or empty workbench folder. Existing work has not been moved or changed.');
  }
  fs.mkdirSync(absolute, { recursive: true });
  for (const folder of Object.keys(WORKBENCH_FOLDERS)) {
    const target = assertWorkbenchPath(absolute, path.join(absolute, folder));
    fs.mkdirSync(target);
  }
  const guide = '# Your SkillJetty workbench\n\nSkillJetty by DAF-TECH keeps its local work inside this folder.\n\n'
    + Object.entries(WORKBENCH_FOLDERS).map(([name, purpose]) => `- **${name}/** — ${purpose}`).join('\n')
    + '\n\nLocal and remote are separate: repositories/ contains local copies; the remote address and detected target branch appear in Configuration and the sharing summary. Creating this folder does not clone, pull, upload, or move existing work.\n\nTo connect: open the settings gear, enter your GitHub HTTPS repository address, and use Pull Skills Repository. The default local copy is repositories/skills. An optional custom local path must remain inside repositories/.\n\nExternal folders and packages can be imported as read-only sources; SkillJetty edits the copied draft inside skills/. AI tools must use files inside this workbench; outside-folder installation is unavailable.\n\nVS Code manages its own application settings, authentication and session data. This boundary covers SkillJetty-owned work files and Git operations; it is not an operating-system sandbox.\n';
  fs.writeFileSync(assertWorkbenchPath(absolute, path.join(absolute, 'README.md')), guide, { flag: 'wx' });
  // Write the acceptance record last; interrupted setup cannot become active.
  fs.writeFileSync(assertWorkbenchPath(absolute, path.join(absolute, WORKBENCH_MARKER)), JSON.stringify({ format: 1 }, null, 2) + '\n', { flag: 'wx' });
  requireWorkbench(absolute);
  return absolute;
}

export function requireWorkbench(root: string): string {
  if (!isManagedWorkbench(root)) throw new Error('Choose Create Workbench or Open Existing Workbench before saving. Existing folders are not adopted automatically.');
  assertWorkbenchPath(root, root);
  return path.resolve(root);
}
