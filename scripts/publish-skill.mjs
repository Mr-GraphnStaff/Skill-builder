#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG = 'skill-builder.config.json';
const EXAMPLE_CONFIG = 'skill-builder.config.example.json';
const SKILLS_REF_VERSION = '0.1.5';
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_SKILLS_REF_CLI = path.resolve(SCRIPT_DIRECTORY, '..', 'node_modules', 'skills-ref', 'dist', 'cli.js');

const defaults = {
  skillsDirectory: 'skills',
  workbenchDirectory: 'workbench',
  distDirectory: 'dist',
  git: {
    enabled: false,
    remote: '',
    baseBranch: 'main',
    branchPrefix: 'skills/',
    publishMode: 'branch',
    requireValidation: false,
    fetchBeforePush: true,
    includeWorkbench: false,
    includeDist: false,
    createPullRequest: false
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
  const skillSource = args.source ?? args.skill ?? args._[0];

  if (!skillSource) {
    throw new Error('Missing skill source. Run with --help for usage.');
  }

  if (!existsSync(configPath)) {
    throw new Error(
      `Missing ${path.relative(root, configPath) || DEFAULT_CONFIG}. Copy ${EXAMPLE_CONFIG} to ${DEFAULT_CONFIG}, set git.enabled to true, and configure the remote.`
    );
  }

  const config = mergeConfig(defaults, readJson(configPath));
  const gitConfig = {
    ...config.git,
    remote: args.remote ?? config.git.remote,
    includeWorkbench: args.includeWorkbench ?? config.git.includeWorkbench,
    includeDist: args.includeDist ?? config.git.includeDist,
    createPullRequest: args.createPullRequest ?? config.git.createPullRequest,
    requireValidation: resolveValidationFlag(args, config.git.requireValidation),
    validationCommand: normalizeValidationCommand(config.git.validationCommand)
  };

  if (!gitConfig.enabled) {
    throw new Error('Git publishing is disabled. Set git.enabled to true in skill-builder.config.json before publishing.');
  }

  if (!gitConfig.remote) {
    throw new Error('Git publishing needs git.remote in skill-builder.config.json, for example "origin".');
  }

  ensureGitWorktree(root);
  ensureRemote(root, gitConfig.remote);

  const publishTarget = resolvePublishTarget(root, config, skillSource);

  const selectedPaths = [path.relative(root, publishTarget.selectedPath)];
  if (gitConfig.includeWorkbench) {
    pushOptionalPath(selectedPaths, root, path.resolve(root, config.workbenchDirectory, publishTarget.skillName), 'workbench path');
  }
  if (gitConfig.includeDist) {
    pushOptionalPath(selectedPaths, root, path.resolve(root, config.distDirectory, `${publishTarget.skillName}.zip`), 'dist ZIP');
  }
  const selectedGitPaths = selectedPaths.map(toGitPath);

  if (gitConfig.requireValidation) {
    if (!publishTarget.validationPath) {
      throw new Error('Validation requires an extracted skill folder. Publish the extracted folder, or rerun with --skip-validation for a .skill package file.');
    }

    runValidation(publishTarget.validationPath, gitConfig.validationCommand);
  }

  if (gitConfig.fetchBeforePush) {
    runGit(root, ['fetch', gitConfig.remote], { mutates: true });
  }

  const currentBranch = runGit(root, ['branch', '--show-current']).trim();
  const targetBranch = resolveTargetBranch(publishTarget.skillName, currentBranch, args.branch, gitConfig);
  if (targetBranch && targetBranch !== currentBranch) {
    switchToBranch(root, targetBranch);
  }

  runGit(root, ['add', '-A', '--', ...selectedGitPaths], { mutates: true });

  const staged = runGit(root, ['diff', '--cached', '--name-status', '--', ...selectedGitPaths]).trim();
  if (!staged) {
    console.log(`No staged changes for ${skillName}. Nothing to publish.`);
    return;
  }

  const stagedFiles = runGit(root, ['diff', '--cached', '--name-only', '--', ...selectedGitPaths])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const secretWarnings = findPotentialSecrets(root, stagedFiles);
  if (secretWarnings.length > 0 && !args.allowSecretWarnings) {
    console.error('Potential secret-like values were found in files selected for publishing:');
    for (const warning of secretWarnings) {
      console.error(`- ${warning}`);
    }
    throw new Error('Review the files or rerun with --allow-secret-warnings if these are false positives.');
  }

  const outsideChanges = listChangesOutsideSelectedPaths(root, selectedGitPaths);
  if (outsideChanges.length > 0) {
    console.log('Unpublished changes outside this skill were left untouched:');
    for (const file of outsideChanges.slice(0, 25)) {
      console.log(`- ${file}`);
    }
    if (outsideChanges.length > 25) {
      console.log(`- ...and ${outsideChanges.length - 25} more`);
    }
    console.log('');
  }

  console.log('Files selected for publish:');
  console.log(staged);
  console.log('');
  console.log(`Remote: ${gitConfig.remote}`);
  console.log(`Branch: ${targetBranch || currentBranch}`);

  if (!args.yes) {
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question('Type "publish" to commit and push these staged changes: ');
    rl.close();
    if (answer.trim().toLowerCase() !== 'publish') {
      runGit(root, ['restore', '--staged', '--', ...selectedGitPaths], { mutates: true });
      console.log('Publish cancelled. Staged skill changes were unstaged.');
      return;
    }
  }

  const message = args.message ?? `Publish ${publishTarget.displayName} skill`;
  runGit(root, ['commit', '-m', message], { stdio: 'inherit', mutates: true });
  runGit(root, ['push', '-u', gitConfig.remote, targetBranch || currentBranch], { stdio: 'inherit', mutates: true });

  if (gitConfig.createPullRequest) {
    createPullRequest(root, publishTarget.displayName, gitConfig.baseBranch, targetBranch || currentBranch);
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
      case '--source':
        parsed.source = requireValue(argv, ++index, value);
        break;
      case '--remote':
        parsed.remote = requireValue(argv, ++index, value);
        break;
      case '--branch':
        parsed.branch = requireValue(argv, ++index, value);
        break;
      case '--message':
      case '-m':
        parsed.message = requireValue(argv, ++index, value);
        break;
      case '--yes':
      case '-y':
        parsed.yes = true;
        break;
      case '--skip-validation':
        parsed.skipValidation = true;
        break;
      case '--validate':
        parsed.validate = true;
        break;
      case '--include-workbench':
        parsed.includeWorkbench = true;
        break;
      case '--include-dist':
        parsed.includeDist = true;
        break;
      case '--create-pr':
        parsed.createPullRequest = true;
        break;
      case '--allow-secret-warnings':
        parsed.allowSecretWarnings = true;
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
  console.log(`Publish one Claude skill source to git.

Usage:
  node scripts/publish-skill.mjs <skill-name|path-to-SKILL.md|path-to-folder|path-to-file.skill> [options]

Options:
  --root <path>                  Skill Builder project root. Defaults to cwd.
  --config <path>                Config file path. Defaults to skill-builder.config.json.
  --source <path-or-name>        Skill name, SKILL.md path, skill folder, or Anthropic .skill package file.
  --remote <name>                Override git.remote from config.
  --branch <name>                Override the target branch.
  -m, --message <message>        Commit message.
  -y, --yes                      Skip the interactive publish confirmation.
  --validate                     Run the configured validator before publishing.
  --skip-validation              Do not run validation, even when configured.
  --include-workbench            Include workbench/<skill-name>.
  --include-dist                 Include dist/<skill-name>.zip.
  --create-pr                    Create a pull request with gh after pushing.
  --allow-secret-warnings        Continue when the simple secret scan finds matches.
  -h, --help                     Show this help.

For folders and SKILL.md files, the script stages the containing extracted skill folder.
For .skill package files, it stages the package file itself.
The script only stages the selected skill paths. It leaves unrelated workspace changes unstaged.`);
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

function resolveValidationFlag(parsedArgs, configuredValue) {
  if (parsedArgs.validate && parsedArgs.skipValidation) {
    throw new Error('Use either --validate or --skip-validation, not both.');
  }

  if (parsedArgs.validate) {
    return true;
  }

  if (parsedArgs.skipValidation) {
    return false;
  }

  return Boolean(configuredValue);
}

function normalizeValidationCommand(value) {
  if (value === undefined) {
    return defaultValidationCommand();
  }

  if (!Array.isArray(value) || value.length === 0 || value.some((part) => typeof part !== 'string' || !part.trim())) {
    throw new Error('git.validationCommand must be a non-empty string array, for example ["npx", "--yes", "skills-ref@0.1.5", "validate"].');
  }

  return value;
}

function defaultValidationCommand() {
  if (existsSync(BUNDLED_SKILLS_REF_CLI)) {
    return ['node', BUNDLED_SKILLS_REF_CLI, 'validate'];
  }

  return ['npx', '--yes', `skills-ref@${SKILLS_REF_VERSION}`, 'validate'];
}

function resolvePublishTarget(root, config, source) {
  const trimmedSource = source.trim();
  if (!trimmedSource) {
    throw new Error('Skill source is required.');
  }

  if (looksLikePathSource(root, trimmedSource)) {
    return resolvePublishPathTarget(root, trimmedSource);
  }

  validateSkillName(trimmedSource);
  const skillPath = path.resolve(root, config.skillsDirectory, trimmedSource);
  const manifestPath = findSkillManifestPath(skillPath);
  if (!manifestPath) {
    throw new Error(`Skill not found: ${path.relative(root, path.join(skillPath, 'SKILL.md'))}. Publish accepts a configured skill name, SKILL.md, a skill folder, or a .skill package file.`);
  }

  return buildSkillFolderTarget(root, skillPath, manifestPath, trimmedSource);
}

function looksLikePathSource(root, value) {
  return path.isAbsolute(value)
    || value.includes('/')
    || value.includes('\\')
    || value.startsWith('.')
    || /\.(?:md|skill)$/i.test(value)
    || existsSync(path.resolve(root, value));
}

function resolvePublishPathTarget(root, source) {
  const absoluteSource = path.isAbsolute(source) ? path.resolve(source) : path.resolve(root, source);
  if (!existsSync(absoluteSource)) {
    throw new Error(`Skill source not found: ${absoluteSource}`);
  }

  const stat = statSync(absoluteSource);
  if (stat.isFile()) {
    if (isSkillPackagePath(absoluteSource)) {
      ensureInside(root, absoluteSource, 'selected .skill package file');
      const displayName = path.basename(absoluteSource, path.extname(absoluteSource));
      return {
        displayName,
        skillName: normalizePublishName(displayName),
        selectedPath: absoluteSource,
        validationPath: undefined
      };
    }

    if (isSkillManifestName(path.basename(absoluteSource))) {
      const skillPath = path.dirname(absoluteSource);
      return buildSkillFolderTarget(root, skillPath, absoluteSource);
    }

    throw new Error('Selected file is not publishable. Choose SKILL.md or an Anthropic .skill package file.');
  }

  if (!stat.isDirectory()) {
    throw new Error('Selected path is not publishable. Choose SKILL.md, a .skill package file, or an extracted skill folder.');
  }

  const resolvedFolder = resolveSkillFolderFromDirectory(absoluteSource);
  return buildSkillFolderTarget(root, resolvedFolder.skillPath, resolvedFolder.manifestPath);
}

function resolveSkillFolderFromDirectory(directory) {
  const manifestPath = findSkillManifestPath(directory);
  if (manifestPath) {
    return { skillPath: directory, manifestPath };
  }

  const childSkills = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const skillPath = path.join(directory, entry.name);
      const childManifestPath = findSkillManifestPath(skillPath);
      return childManifestPath ? { skillPath, manifestPath: childManifestPath } : undefined;
    })
    .filter(Boolean);

  if (childSkills.length === 1) {
    return childSkills[0];
  }

  if (childSkills.length > 1) {
    throw new Error('Selected folder contains multiple extracted skill folders. Choose the specific folder that contains SKILL.md.');
  }

  throw new Error('No SKILL.md found. Choose SKILL.md directly, a folder containing SKILL.md, or a folder with one extracted skill folder inside.');
}

function buildSkillFolderTarget(root, skillPath, manifestPath, explicitSkillName) {
  ensureInside(root, skillPath, 'selected skill folder');

  const directoryName = path.basename(skillPath);
  const manifestName = readSkillName(manifestPath);
  const skillName = explicitSkillName ?? normalizePublishName(directoryName || manifestName);

  return {
    displayName: manifestName ?? directoryName,
    skillName,
    selectedPath: skillPath,
    validationPath: skillPath
  };
}

function findSkillManifestPath(skillPath) {
  const canonicalPath = path.join(skillPath, 'SKILL.md');
  if (existsSync(canonicalPath)) {
    return canonicalPath;
  }

  const lowercasePath = path.join(skillPath, 'skill.md');
  if (existsSync(lowercasePath)) {
    return lowercasePath;
  }

  if (!existsSync(skillPath) || !statSync(skillPath).isDirectory()) {
    return undefined;
  }

  const manifest = readdirSync(skillPath, { withFileTypes: true })
    .find((entry) => entry.isFile() && isSkillManifestName(entry.name));
  return manifest ? path.join(skillPath, manifest.name) : undefined;
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

function validateSkillName(value) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error('Skill name must be lowercase kebab-case.');
  }
}

function normalizePublishName(value) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');

  if (!normalized) {
    throw new Error(`Could not derive a publish name from "${value}". Rename the file or folder to lowercase kebab-case.`);
  }

  return normalized;
}

function isSkillPackagePath(filePath) {
  return path.extname(filePath).toLowerCase() === '.skill';
}

function isSkillManifestName(fileName) {
  return fileName.toLowerCase() === 'skill.md';
}

function ensureInside(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return;
  }

  throw new Error(`${label} must be inside ${parent} so Git can publish it. Move or copy it into this workspace first.`);
}

function pushOptionalPath(paths, root, absolutePath, label) {
  if (existsSync(absolutePath)) {
    paths.push(path.relative(root, absolutePath));
    return;
  }

  console.warn(`Skipping missing ${label}: ${path.relative(root, absolutePath)}`);
}

function ensureGitWorktree(root) {
  runGit(root, ['rev-parse', '--show-toplevel']);
}

function ensureRemote(root, remote) {
  runGit(root, ['remote', 'get-url', remote]);
}

function resolveTargetBranch(skillName, currentBranch, branchOverride, gitConfig) {
  if (branchOverride) {
    return branchOverride;
  }

  if (gitConfig.publishMode === 'current-branch') {
    return currentBranch;
  }

  const prefix = gitConfig.branchPrefix ?? '';
  return `${prefix}${skillName}`;
}

function switchToBranch(root, branch) {
  const branches = runGit(root, ['branch', '--list', branch]).trim();
  if (branches) {
    runGit(root, ['switch', branch], { stdio: 'inherit', mutates: true });
    return;
  }

  runGit(root, ['switch', '-c', branch], { stdio: 'inherit', mutates: true });
}

function runValidation(skillPath, validationCommand) {
  const [command, ...baseArgs] = validationCommand;
  const validationArgs = [...baseArgs, skillPath];
  console.log(`Running validation: ${formatCommandForDisplay([command, ...validationArgs])}`);

  const result = runExternalCommand(command, validationArgs, {
    encoding: 'utf8',
    stdio: 'inherit'
  });

  if (result.error) {
    throw new Error(`Validation failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Validation failed with exit code ${result.status}.`);
  }
}

function runExternalCommand(command, commandArgs, options) {
  const result = spawnSync(command, commandArgs, options);
  if (!isMissingCommand(result)) {
    return result;
  }

  const windowsCommand = resolveWindowsCommand(command);
  if (!windowsCommand || windowsCommand === command) {
    return result;
  }

  return spawnSync(windowsCommand, commandArgs, options);
}

function isMissingCommand(result) {
  return result.error && result.error.code === 'ENOENT';
}

function resolveWindowsCommand(command) {
  if (process.platform !== 'win32' || path.extname(command) || command.includes('/') || command.includes('\\')) {
    return undefined;
  }

  return `${command}.cmd`;
}

function formatCommandForDisplay(parts) {
  return parts
    .map((part) => (/[\s"]/u.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part))
    .join(' ');
}

function runGit(root, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe'
  });

  if (result.error) {
    throw new Error(`git ${args.join(' ')} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(stderr || `git ${args.join(' ')} failed with exit code ${result.status}.`);
  }

  return result.stdout ?? '';
}

function createPullRequest(root, skillName, baseBranch, headBranch) {
  const result = spawnSync('gh', [
    'pr',
    'create',
    '--base',
    baseBranch,
    '--head',
    headBranch,
    '--title',
    `Publish ${skillName} skill`,
    '--body',
    `Publishes updates for the ${skillName} Claude skill.`
  ], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit'
  });

  if (result.error) {
    throw new Error(`gh pr create failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`gh pr create failed with exit code ${result.status}.`);
  }
}

function listChangesOutsideSelectedPaths(root, selectedPaths) {
  const files = new Set([
    ...splitLines(runGit(root, ['diff', '--name-only'])),
    ...splitLines(runGit(root, ['diff', '--cached', '--name-only'])),
    ...splitLines(runGit(root, ['ls-files', '--others', '--exclude-standard']))
  ]);

  return [...files]
    .filter((file) => !isUnderAny(file, selectedPaths))
    .sort();
}

function findPotentialSecrets(root, files) {
  const warnings = [];
  const textFile = /\.(?:md|txt|json|ya?ml|toml|ini|env|js|mjs|cjs|ts|tsx|py|sh|ps1|csv|tsv)$/i;
  const secretPatterns = [
    /AKIA[0-9A-Z]{16}/,
    /(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i
  ];

  for (const file of files) {
    if (!textFile.test(file)) {
      continue;
    }

    const absolute = path.resolve(root, file);
    if (!existsSync(absolute)) {
      continue;
    }

    const stat = statSync(absolute);
    if (stat.size > 1024 * 1024) {
      continue;
    }

    const content = readFileSync(absolute, 'utf8');
    if (secretPatterns.some((pattern) => pattern.test(content))) {
      warnings.push(file);
    }
  }

  return warnings;
}

function splitLines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isUnderAny(file, prefixes) {
  const normalized = toGitPath(file);
  return prefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function toGitPath(value) {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}
