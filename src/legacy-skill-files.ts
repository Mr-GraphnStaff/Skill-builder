import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import { assertWorkbenchPath } from './workbench-boundary.js';

type SkillEntry = { relativePath: string; absolute: string; size: number; mode: number; directory: boolean; ino: number; dev: number };
const MAX_ENTRIES = 5000, MAX_FILE = 16 * 1024 * 1024, MAX_TOTAL = 128 * 1024 * 1024, MAX_TEXT = 1024 * 1024;

async function listSkillEntries(root: string): Promise<SkillEntry[]> {
  const files: SkillEntry[] = [];
  async function visit(directory: string): Promise<void> {
    assertWorkbenchPath(root, directory);
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = assertWorkbenchPath(root, path.join(directory, entry.name));
      const stat = await fs.lstat(file);
      if (files.length >= MAX_ENTRIES) throw new Error('Skill contains too many entries.');
      const relativePath = path.relative(root, file).split(path.sep).join('/');
      if (stat.isDirectory()) {
        files.push({ relativePath: relativePath + '/', absolute: file, size: 0, mode: stat.mode & 0o777, directory: true, ino: stat.ino, dev: stat.dev });
        await visit(file);
      }
      else if (stat.isFile() && stat.nlink === 1) {
        files.push({ relativePath, absolute: file, size: stat.size, mode: stat.mode & 0o777, directory: false, ino: stat.ino, dev: stat.dev });
      } else throw new Error('Skill export cannot contain links or special files.');
    }
  }
  await visit(root);
  return files;
}

/** A bounded read detects replacement/growth instead of allocating from a raced file size. */
async function readEntry(root: string, entry: SkillEntry): Promise<Buffer> {
  const handle = await fs.open(assertWorkbenchPath(root, entry.absolute), 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.ino !== entry.ino || stat.dev !== entry.dev || stat.size !== entry.size) throw new Error('Skill file changed during capture.');
    const bytes = Buffer.alloc(entry.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, null);
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    if (offset !== entry.size) throw new Error('Skill file changed during capture.');
    return bytes.subarray(0, offset);
  } finally { await handle.close(); }
}

/** Capture bounded regular files only; never let an archive library follow a link. */
export async function captureSkillFiles(root: string): Promise<Array<{ relativePath: string; bytes: Buffer; mode: number }>> {
  const entries = await listSkillEntries(root);
  if (entries.some(entry => entry.size > MAX_FILE) || entries.reduce((sum, entry) => sum + entry.size, 0) > MAX_TOTAL) throw new Error('Skill exceeds export size limits (16 MiB per file, 128 MiB total).');
  const files = [];
  for (const entry of entries) files.push({ relativePath: entry.relativePath, bytes: entry.directory ? Buffer.alloc(0) : await readEntry(root, entry), mode: entry.mode });
  return files;
}

/** Both health surfaces scan the same bounded UTF-8 inputs, including extensionless files. */
export async function readSkillAnalysisFiles(root: string): Promise<Array<{ relativePath: string; size: number; content?: string }>> {
  const entries = await listSkillEntries(root);
  if (entries.reduce((sum, entry) => sum + (entry.size <= MAX_TEXT ? entry.size : 0), 0) > MAX_TOTAL) throw new Error('Skill exceeds the 128 MiB text scan limit.');
  const files = [];
  for (const entry of entries) {
    if (entry.directory) continue;
    const bytes = entry.size <= MAX_TEXT ? await readEntry(root, entry) : undefined;
    files.push({ relativePath: entry.relativePath, size: entry.size, content: bytes && isUtf8(bytes) ? bytes.toString('utf8') : undefined });
  }
  return files;
}

/** Stage first, retain the old directory until promotion succeeds, roll back on failure. */
export async function replaceSkillDirectory(root: string, source: string, target: string): Promise<void> {
  assertWorkbenchPath(root, target);
  const relative = path.relative(source, target), reverse = path.relative(target, source);
  const contains = (value: string) => !value || value !== '..' && !value.startsWith(`..${path.sep}`) && !path.isAbsolute(value);
  if (contains(relative) || contains(reverse)) throw new Error('The sync source and destination must be separate folders.');
  const sourceMode = (await fs.lstat(assertWorkbenchPath(source, source))).mode & 0o777;
  const files = await captureSkillFiles(source);
  const parent = path.dirname(target), id = randomUUID();
  const staged = assertWorkbenchPath(root, path.join(parent, `.skilljetty-sync-${id}`));
  const backup = assertWorkbenchPath(root, path.join(parent, `.skilljetty-backup-${id}`));
  await fs.mkdir(parent, { recursive: true });
  await fs.mkdir(staged, { mode: 0o700 });
  let backedUp = false;
  try {
    for (const file of files) {
      const destination = assertWorkbenchPath(root, path.join(staged, file.relativePath));
      if (file.relativePath.endsWith('/')) { await fs.mkdir(destination, { recursive: true }); continue; }
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, file.bytes, { flag: 'wx', mode: file.mode });
      await fs.chmod(destination, file.mode);
    }
    for (const file of [...files].reverse()) {
      if (file.relativePath.endsWith('/')) await fs.chmod(assertWorkbenchPath(root, path.join(staged, file.relativePath)), file.mode);
    }
    await fs.chmod(staged, sourceMode);
    assertWorkbenchPath(root, target);
    try { await fs.rename(target, backup); backedUp = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    try { await fs.rename(staged, target); }
    catch (error) {
      if (backedUp) await fs.rename(backup, target);
      throw error;
    }
  } finally {
    assertWorkbenchPath(root, staged);
    await fs.rm(staged, { recursive: true, force: true });
  }
  // A cleanup failure preserves the backup; the successfully installed skill remains.
  if (backedUp) { assertWorkbenchPath(root, backup); await fs.rm(backup, { recursive: true, force: true }); }
}
