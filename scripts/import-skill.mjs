#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const DEFAULT_CONFIG = 'skill-builder.config.json';

const defaults = {
  skillsDirectory: 'skills',
  workbenchDirectory: 'workbench',
  git: {
    remote: 'origin',
    baseBranch: 'main'
  }
};

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const root = path.resolve(args.root ?? process.cwd());
  const configPath = path.resolve(root, args.config ?? DEFAULT_CONFIG);
  const skillName = args.skill ?? args._[0];

  if (!skillName) {
    throw new Error('Missing skill name. Run with --help for usage.');
  }

  validateSkillName(skillName);

  const config = existsSync(configPath)
    ? mergeConfig(defaults, readJson(configPath))
    : defaults;

  const branch = args.branch ?? config.git.baseBranch ?? 'main';
  const repository = args.repo ?? resolveRepository(root, args.remote ?? config.git.remote ?? 'origin');
  const sourceRelativePath = normalizeRelativePath(
    args.source ?? path.posix.join(toGitPath(config.skillsDirectory), skillName),
    'source path'
  );
  const targetSkillName = args.target ?? skillName;
  validateSkillName(targetSkillName);

  const targetSkillsDirectory = path.resolve(root, config.skillsDirectory);
  const targetPath = path.resolve(targetSkillsDirectory, targetSkillName);
  ensureInside(targetSkillsDirectory, targetPath, 'target skill path');

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'skill-builder-import-'));
  try {
    cloneRepository(repository, branch, tempRoot);

    const sourcePath = path.resolve(tempRoot, sourceRelativePath);
    ensureInside(tempRoot, sourcePath, 'source skill path');

    const manifestPath = path.join(sourcePath, 'SKILL.md');
    if (!existsSync(manifestPath)) {
      throw new Error(`No SKILL.md found at ${sourceRelativePath} in ${repository}.`);
    }

    const sourceName = readSkillName(manifestPath);
    if (sourceName && sourceName !== skillName) {
      console.warn(`Warning: source SKILL.md name is "${sourceName}", but the requested skill is "${skillName}".`);
    }

    if (existsSync(targetPath)) {
      await confirmOverwrite(root, targetPath, targetSkillName);
      backupExistingSkill(root, config.workbenchDirectory, targetPath, targetSkillName);
      rmSync(targetPath, { recursive: true, force: true });
    }

    mkdirSync(targetSkillsDirectory, { recursive: true });
    cpSync(sourcePath, targetPath, { recursive: true });

    if (args.validate) {
      runValidation(targetPath);
    }

    console.log(`Imported ${skillName} from ${repository} (${branch}) to ${path.relative(root, targetPath)}.`);
    console.log('Edit the skill locally, then publish it back with npm run publish-skill -- <skill-name>.');
  } finally {
    if (!args.keepTemp) {
      rmSync(tempRoot, { recursive: true, force: true });
    } else {
      console.log(`Kept temporary clone at ${tempRoot}`);
    }
  }
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    switch (value) {
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      case '--root':
        parsed.root = requireValue(argv, ++index, value);
        break;
      case '--config':
        parsed.config = requireValue(argv, ++index, value);
        break;
      case '--skill':
        parsed.skill = requireValue(argv, ++index, value);
        break;
      case '--repo':
        parsed.repo = requireValue(argv, ++index, value);
        break;
      case '--remote':
        parsed.remote = requireValue(argv, ++index, value);
        break;
      case '--branch':
        parsed.branch = requireValue(argv, ++index, value);
        break;
      case '--source':
        parsed.source = requireValue(argv, ++index, value);
        break;
      case '--target':
        parsed.target = requireValue(argv, ++index, value);
        break;
      case '--overwrite':
        parsed.overwrite = true;
        break;
      case '--yes':
      case '-y':
        parsed.yes = true;
        break;
      case '--validate':
        parsed.validate = true;
        break;
      case '--keep-temp':
        parsed.keepTemp = true;
        break;
      default:
        if (value.startsWith('-')) {
          throw new Error(`Unknown option: ${value}`);
        }
        parsed._.push(value);
    }
  }
  return parsed;
}

function requireValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith('-')) {
    throw new Error(`${option} needs a value.`);
  }
  return value;
}

function printHelp() {
  console.log(`Import or update one Agent Skill folder from git.

Usage:
  node scripts/import-skill.mjs <skill-name> [options]

Options:
  --root <path>                  SkillJetty project root. Defaults to cwd.
  --config <path>                Config file path. Defaults to skill-builder.config.json.
  --repo <url-or-path>           Git repository URL or local path. Defaults to configured git.remote.
  --remote <name>                Use a local git remote name when --repo is omitted. Defaults to origin.
  --branch <name>                Branch, tag, or ref to clone. Defaults to git.baseBranch or main.
  --source <path>                Repo-relative source folder. Defaults to skills/<skill-name>.
  --target <skill-name>          Local target skill folder name. Defaults to <skill-name>.
  --overwrite                    Allow replacing an existing local skill folder.
  -y, --yes                      Skip interactive overwrite confirmation. Requires --overwrite.
  --validate                     Run skills-ref validate after import.
  --keep-temp                    Keep the temporary clone for debugging.
  -h, --help                     Show this help.

The importer copies only one skill folder into the configured skills directory.
Existing local skill folders are backed up under workbench/.skill-import-backups before replacement.`);
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function mergeConfig(base, override) {
  return {
    ...base,
    ...override,
    git: {
      ...base.git,
      ...(override.git ?? {})
    }
  };
}

function validateSkillName(value) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error('Skill name must be lowercase kebab-case.');
  }
}

function resolveRepository(root, remote) {
  if (!remote) {
    throw new Error('Import needs --repo or a configured git.remote.');
  }

  ensureGitWorktree(root);
  return runGit(root, ['remote', 'get-url', remote]).trim();
}

function cloneRepository(repository, branch, targetPath) {
  const args = ['clone', '--depth', '1'];
  if (branch) {
    args.push('--branch', branch);
  }
  args.push(repository, targetPath);

  runCommand('git', args, { stdio: 'inherit' });
}

async function confirmOverwrite(root, targetPath, targetSkillName) {
  const dirtyChanges = listChangesForPath(root, targetPath);
  if (dirtyChanges.length > 0) {
    console.log('Local changes currently touch this skill:');
    for (const change of dirtyChanges.slice(0, 25)) {
      console.log(`- ${change}`);
    }
    if (dirtyChanges.length > 25) {
      console.log(`- ...and ${dirtyChanges.length - 25} more`);
    }
    console.log('');
  }

  if (!args.overwrite) {
    throw new Error(`Local skill ${targetSkillName} already exists. Rerun with --overwrite to replace it.`);
  }

  if (args.yes) {
    return;
  }

  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(`Type "overwrite" to replace ${targetSkillName}: `);
  rl.close();
  if (answer.trim().toLowerCase() !== 'overwrite') {
    throw new Error('Import cancelled.');
  }
}

function backupExistingSkill(root, workbenchDirectory, targetPath, targetSkillName) {
  if (!existsSync(targetPath)) {
    return;
  }

  const backupRoot = path.resolve(root, workbenchDirectory, '.skill-import-backups');
  const backupPath = path.join(backupRoot, `${targetSkillName}-${timestamp()}`);
  mkdirSync(backupRoot, { recursive: true });
  cpSync(targetPath, backupPath, { recursive: true });
  console.log(`Backed up existing skill to ${path.relative(root, backupPath)}.`);
}

function listChangesForPath(root, targetPath) {
  try {
    ensureGitWorktree(root);
    const relative = toGitPath(path.relative(root, targetPath));
    return splitLines(runGit(root, ['status', '--porcelain', '--', relative]));
  } catch {
    return [];
  }
}

function readSkillName(manifestPath) {
  const stat = statSync(manifestPath);
  if (stat.size > 1024 * 1024) {
    return undefined;
  }

  const manifest = readFileSync(manifestPath, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(manifest);
  if (!match) {
    return undefined;
  }

  for (const line of match[1].split(/\r?\n/)) {
    const name = /^name:\s*["']?([^"'\r\n]+)["']?\s*$/.exec(line);
    if (name) {
      return name[1].trim();
    }
  }

  return undefined;
}

function normalizeRelativePath(value, label) {
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  if (/^[A-Za-z]:/.test(normalized)) {
    throw new Error(`${label} must be relative to the repository root.`);
  }

  const parts = normalized.split('/').filter(Boolean);
  if (parts.includes('..')) {
    throw new Error(`${label} cannot contain '..'.`);
  }

  return parts.join(path.sep);
}

function ensureInside(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return;
  }

  throw new Error(`${label} must stay inside ${parent}.`);
}

function ensureGitWorktree(root) {
  runGit(root, ['rev-parse', '--show-toplevel']);
}

function runValidation(skillPath) {
  runCommand('skills-ref', ['validate', skillPath], { stdio: 'inherit' });
}

function runGit(root, args) {
  const result = runCommand('git', args, { cwd: root });
  return result.stdout ?? '';
}

function runCommand(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe'
  });

  if (result.error) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(stderr || `${command} ${commandArgs.join(' ')} failed with exit code ${result.status}.`);
  }

  return result;
}

function splitLines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-');
}

function toGitPath(value) {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}
