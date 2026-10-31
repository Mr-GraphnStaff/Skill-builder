import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vscode from 'vscode';
import {
  importSkillPackage, registerSkillFolder, listWorkbenchSkills, updateSkillRepository,
  prepareSkillRelease, listSkillReleases, validateWorkbenchSkill, completeWorkbenchSkill
} from './skill-workbench.js';
import { listRepositoryChoices, createGitHubRepository, prepareRepositoryPublish, pushPreparedRelease, disposePublishPreview } from './repository-publisher.js';
import { listLibraryReleases, restoreLibraryRelease, suggestReleaseVersion, recordLibraryPublication, type LibraryRelease } from './workbench-library.js';

type ManagedSkill = ReturnType<typeof registerSkillFolder>;
type Release = ReturnType<typeof prepareSkillRelease>;
type Hooks = {
  getRoot(): Promise<string | undefined>;
  createSkill(): Promise<string | undefined>;
  guided?: boolean;
};
type ManualCase = { id: string; prompt: string; expected: string; runs: { at: string; result: string; actual: string; method: 'manual' }[] };
type Playground = { format: 1; note: string; cases: ManualCase[] };
type RepositoryDefault = { repository: string; baseBranch: string };
const DEFAULT_REPOSITORY_KEY = 'skillBuilder.prerelease.defaultRepository';

class WorkbenchNode extends vscode.TreeItem {
  group?: 'drafts' | 'library';
  libraryEntry?: LibraryRelease;
  constructor(
    label: string,
    readonly kind: 'action' | 'skill' | 'directory' | 'file' | 'release' | 'group' | 'tools' | 'library',
    readonly skill?: ManagedSkill,
    readonly filePath?: string,
    readonly release?: Release,
    command?: vscode.Command
  ) {
    super(label, ['skill', 'directory', 'group', 'tools', 'library'].includes(kind) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.contextValue = `workbench-${kind}`;
    this.command = command;
    if (filePath) {
      this.resourceUri = vscode.Uri.file(filePath);
      if (kind === 'file') this.command = { command: 'vscode.open', title: 'Open File', arguments: [this.resourceUri] };
    }
    if (kind === 'skill') {
      this.iconPath = new vscode.ThemeIcon('package');
      this.description = 'draft';
      this.tooltip = `${skill?.sourcePath}\n${skill?.repository ?? 'No repository selected'}`;
    }
  }
}

function action(label: string, command: string, skill?: ManagedSkill): WorkbenchNode {
  const node = new WorkbenchNode(label, 'action', skill);
  node.command = { command, title: label, arguments: [node] };
  return node;
}

export function activateWorkbench(context: vscode.ExtensionContext, hooks: Hooks) {
  const change = new vscode.EventEmitter<WorkbenchNode | undefined>();
  const refresh = () => change.fire(undefined);
  const rememberedRepository = (): RepositoryDefault | undefined => {
    const value = context.workspaceState?.get<RepositoryDefault>(DEFAULT_REPOSITORY_KEY);
    return value && typeof value.repository === 'string' && value.repository.trim()
      && typeof value.baseBranch === 'string' && value.baseBranch.trim() ? value : undefined;
  };
  const associate = async (root: string, skill: ManagedSkill, repository: string, branch: string) => {
    const updated = updateSkillRepository(root, skill.id, repository, branch);
    try { await context.workspaceState?.update(DEFAULT_REPOSITORY_KEY, { repository, baseBranch: branch }); }
    catch { void vscode.window.showWarningMessage('The skill repository was saved, but its workspace default could not be remembered.'); }
    return updated;
  };
  const provider: vscode.TreeDataProvider<WorkbenchNode> = {
    onDidChangeTreeData: change.event,
    getTreeItem: node => node,
    async getChildren(node) {
      if (!node) {
        const actions = [
          action('Create a new skill…', 'skillBuilder.newManagedSkill'),
          action('Open a .skill package…', 'skillBuilder.importPackage'),
          action('Open a skill folder…', 'skillBuilder.manageFolder')
        ];
        const root = await hooks.getRoot();
        if (!root) return actions;
        const drafts = new WorkbenchNode('Drafts', 'group');
        drafts.group = 'drafts'; drafts.id = 'workbench-drafts';
        drafts.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        drafts.description = String(listWorkbenchSkills(root).length);
        const library = new WorkbenchNode('Published / library', 'group');
        library.group = 'library'; library.id = 'workbench-library';
        const scan = scanLibrary(root);
        library.description = scan.error ? 'needs attention' : String(scan.entries.length);
        return [...actions, drafts, library];
      }
      if (node.kind === 'group') {
        const root = await hooks.getRoot();
        if (!root) return [];
        if (node.group === 'drafts') {
          const drafts = listWorkbenchSkills(root).map(skill => new WorkbenchNode(skill.name, 'skill', skill));
          return drafts.length ? drafts : [action('Create your first draft…', 'skillBuilder.newManagedSkill')];
        }
        const scan = scanLibrary(root);
        if (scan.error) {
          const issue = new WorkbenchNode('Library needs attention — view details', 'action');
          issue.tooltip = scan.error;
          issue.command = { command: 'skillBuilder.workbenchLibraryIssue', title: 'View Library Issue', arguments: [scan.error] };
          return [issue];
        }
        return scan.entries.map(entry => {
          const item = new WorkbenchNode(`${entry.skillName} ${entry.version}`, 'library');
          item.libraryEntry = entry;
          item.id = `workbench-library:${entry.skillName}:${entry.version}`;
          item.description = entry.status === 'uploaded' ? 'uploaded · awaiting merge' : entry.status === 'archived' ? 'archived · upload unverified' : 'prepared locally';
          item.tooltip = `${item.description}\n${entry.repository ?? entry.directory}`;
          item.command = { command: 'skillBuilder.workbenchOpenLibraryEntry', title: 'View Version', arguments: [item] };
          return item;
        });
      }
      if (node.kind === 'library' && node.libraryEntry) {
        const open = action('View files and publication receipt', 'skillBuilder.workbenchOpenLibraryEntry');
        const restore = action('Edit next version…', 'skillBuilder.workbenchRestoreRelease');
        open.libraryEntry = node.libraryEntry; restore.libraryEntry = node.libraryEntry;
        return [open, restore];
      }
      if (node.kind === 'skill' && node.skill) {
        const actions = [
          action('Edit skill', 'skillBuilder.workbenchEditSkill', node.skill),
          action('Sanity check', 'skillBuilder.workbenchValidate', node.skill),
          action('Publish…', 'skillBuilder.workbenchPublishRelease', node.skill)
        ];
        const tools = new WorkbenchNode('Files, tests, and publishing options', 'tools', node.skill);
        return [...actions, tools, ...await fileNodes(node.skill, node.skill.sourcePath)];
      }
      if (node.kind === 'tools' && node.skill) {
        return [
          action('Add or create a file…', 'skillBuilder.workbenchAddFile', node.skill),
          action('Playground — manual test cases', 'skillBuilder.workbenchPlayground', node.skill),
          action('Change repository and base branch…', 'skillBuilder.workbenchAssociateRepository', node.skill),
          action('Prepare a version without uploading…', 'skillBuilder.workbenchPrepareRelease', node.skill)
        ];
      }
      if (node.kind === 'directory' && node.filePath && node.skill) return fileNodes(node.skill, node.filePath);
      return [];
    }
  };
  const tree = hooks.guided ? { dispose() {} } : vscode.window.createTreeView('skillBuilder.workbenchView', { treeDataProvider: provider, showCollapseAll: true });
  context.subscriptions.push(change, tree);
  const requireRoot = async () => {
    const root = await hooks.getRoot();
    if (!root) throw new Error('Open a workspace folder to store your SkillJetty records and releases.');
    return root;
  };
  const select = async (node?: WorkbenchNode): Promise<ManagedSkill | undefined> => {
    const root = await requireRoot();
    if (node?.skill) return listWorkbenchSkills(root).find(skill => skill.id === node.skill!.id) ?? node.skill;
    const items = listWorkbenchSkills(root).map(skill => ({ label: skill.name, description: skill.sourcePath, skill }));
    if (!items.length) { void vscode.window.showInformationMessage('Import a .skill package, create a skill, or manage an existing folder first.'); return; }
    return (await vscode.window.showQuickPick(items, { placeHolder: 'Choose a managed skill' }))?.skill;
  };
  function command(id: string, run: (...args: any[]) => Promise<unknown>) {
    context.subscriptions.push(vscode.commands.registerCommand(id, async (...args: any[]) => {
      try { return await run(...args); }
      catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error)); }
      finally { refresh(); }
    }));
  }
  if (!hooks.guided) command('skillBuilder.openWorkbench', async () => {
    await vscode.commands.executeCommand('workbench.view.extension.skillBuilder');
    await vscode.commands.executeCommand('skillBuilder.workbenchView.focus');
  });
  command('skillBuilder.workbenchRefresh', async () => refresh());
  command('skillBuilder.workbenchLibraryIssue', async (detail: string) => {
    await showMarkdown(`# Library needs attention\n\nA saved version or publication receipt could not be verified. It has not been restored or labelled as a verified upload.\n\n${escapeMarkdown(String(detail))}\n\nYour **Drafts**, editing, and local checks remain available. Recover the affected saved version from a known good copy before using that version again.\n`);
  });
  command('skillBuilder.workbenchEditSkill', async (node?: WorkbenchNode) => {
    const skill = await select(node);
    if (skill) await vscode.window.showTextDocument(vscode.Uri.file(path.join(skill.sourcePath, 'SKILL.md')));
  });
  command('skillBuilder.workbenchOpenLibraryEntry', async (node?: WorkbenchNode) => {
    const root = await requireRoot();
    const entry = await selectLibraryEntry(root, node?.libraryEntry);
    if (entry) await showLibraryReceipt(entry);
  });
  command('skillBuilder.workbenchRestoreRelease', async (node?: WorkbenchNode) => {
    const root = await requireRoot();
    const entry = await selectLibraryEntry(root, node?.libraryEntry);
    if (!entry) return;
    const skill = restoreLibraryRelease(root, entry.directory);
    await vscode.window.showTextDocument(vscode.Uri.file(path.join(skill.sourcePath, 'SKILL.md')));
    void vscode.window.showInformationMessage(`Restored ${skill.name} ${entry.version} as an editable draft. The published version and original package remain preserved.`);
  });
  command('skillBuilder.importPackage', async (uri?: vscode.Uri) => {
    const root = await requireRoot();
    const selected = uri instanceof vscode.Uri ? uri : (await vscode.window.showOpenDialog({
      title: 'Import an Agent Skill package', canSelectMany: false, filters: { 'Agent Skill packages': ['skill'] }
    }))?.[0];
    if (!selected) return;
    const skill = importSkillPackage(selected.fsPath, root, true);
    await vscode.window.showTextDocument(vscode.Uri.file(path.join(skill.sourcePath, 'SKILL.md')));
    void vscode.window.showInformationMessage(`Imported ${skill.name}. Your original package is preserved; edit the files under ${skill.sourcePath}.`);
  });
  command('skillBuilder.manageFolder', async () => {
    const root = await requireRoot();
    const selected = (await vscode.window.showOpenDialog({ title: 'Choose a folder containing SKILL.md', canSelectFiles: false, canSelectFolders: true, canSelectMany: false }))?.[0];
    if (!selected) return;
    if (!await saveDocumentsUnder(selected.fsPath)) return;
    const skill = registerSkillFolder(root, selected.fsPath, true);
    await vscode.window.showTextDocument(vscode.Uri.file(path.join(skill.sourcePath, 'SKILL.md')));
  });
  command('skillBuilder.newManagedSkill', async () => {
    const root = await requireRoot();
    const created = await hooks.createSkill();
    if (!created) return;
    const skill = registerSkillFolder(root, created);
    await vscode.window.showTextDocument(vscode.Uri.file(path.join(skill.sourcePath, 'SKILL.md')));
  });
  command('skillBuilder.workbenchPublishSource', async (sourceInput?: string | vscode.Uri) => {
    const root = await requireRoot();
    const selected = sourceInput ?? (await vscode.window.showOpenDialog({
      title: 'Select a .skill package, SKILL.md, or skill folder to publish',
      canSelectFiles: true, canSelectFolders: true, canSelectMany: false
    }))?.[0];
    if (!selected) return;
    const source = path.resolve(typeof selected === 'string' ? selected : selected.fsPath);
    const sourceStat = await fs.lstat(source);
    if (sourceStat.isSymbolicLink()) throw new Error('Select a regular skill package, SKILL.md, or skill folder, not a symbolic link.');
    let skill: ManagedSkill;
    if (sourceStat.isFile() && path.extname(source).toLowerCase() === '.skill') {
      skill = importSkillPackage(source, root, true);
    } else {
      if (!sourceStat.isDirectory() && (!sourceStat.isFile() || path.basename(source).toLowerCase() !== 'skill.md')) {
        throw new Error('Select a .skill package, the SKILL.md manifest, or the folder containing SKILL.md.');
      }
      const folder = sourceStat.isDirectory() ? source : path.dirname(source);
      if (!await saveDocumentsUnder(folder)) return;
      skill = listWorkbenchSkills(root).find(record => path.relative(path.resolve(record.sourcePath), folder) === '')
        ?? registerSkillFolder(root, folder, true);
    }
    await vscode.commands.executeCommand('skillBuilder.workbenchPublishRelease', { skill });
  });
  command('skillBuilder.workbenchAddFile', async (node?: WorkbenchNode) => {
    const skill = await select(node);
    if (!skill) return;
    const choice = await vscode.window.showQuickPick(['Create an empty text file', 'Copy an existing file'], { placeHolder: 'Add a file to this skill' });
    if (!choice) return;
    let source: vscode.Uri | undefined;
    if (choice === 'Copy an existing file') {
      source = (await vscode.window.showOpenDialog({ title: 'Select a supporting file', canSelectMany: false }))?.[0];
      if (!source) return;
      const stat = await fs.lstat(source.fsPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Select a regular file, not a directory or symbolic link.');
    }
    const relative = await vscode.window.showInputBox({
      title: 'File path inside the skill', prompt: 'For example references/rules.md or assets/templates/report.docx. Existing files are never overwritten.',
      value: source ? `references/${path.basename(source.fsPath)}` : 'references/notes.md',
      validateInput: value => validRelativePath(value) ? undefined : 'Use a relative path without empty, dot, parent, drive, or reserved path segments.'
    });
    if (!relative) return;
    const target = await safeNewFile(skill.sourcePath, relative);
    const content = source ? await fs.readFile(source.fsPath) : Buffer.from('');
    await fs.writeFile(target, content, { flag: 'wx' });
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(target));
  });
  command('skillBuilder.workbenchAssociateRepository', async (node?: WorkbenchNode) => {
    const root = await requireRoot();
    const skill = await select(node);
    if (!skill) return;
    const remembered = rememberedRepository();
    const detected = await listRepositoryChoices(root);
    const picked = await vscode.window.showQuickPick([
      ...(remembered ? [{ label: 'Use workspace repository', description: `${remembered.repository} · ${remembered.baseBranch}`, repository: remembered.repository, create: false, defaultBranch: remembered.baseBranch }] : []),
      ...detected.filter(item => item.repository !== remembered?.repository).map(item => ({ label: item.label, description: item.repository, repository: item.repository, create: false, defaultBranch: undefined as string | undefined })),
      { label: 'Enter a repository URL or local path…', description: '', repository: '', create: false, defaultBranch: undefined as string | undefined },
      { label: 'Create a GitHub repository…', description: 'Choose a name and visibility; private by default', repository: '', create: true, defaultBranch: undefined as string | undefined }
    ], { title: 'Choose this skill’s Git repository', placeHolder: 'No push occurs during association' });
    if (!picked) return;
    if (picked.create) {
      const name = await vscode.window.showInputBox({
        title: 'New GitHub repository name', value: skill.name,
        prompt: 'For example Skills. The repository will be created for your signed-in GitHub account. The skill is published separately.',
        ignoreFocusOut: true,
        validateInput: value => /^[A-Za-z0-9_.-]+$/.test(value.trim()) && !['.', '..'].includes(value.trim())
          ? undefined : 'Use a repository name with letters, numbers, dots, underscores, or hyphens.'
      });
      if (!name?.trim()) return;
      const visibility = await vscode.window.showQuickPick([
        { label: 'Private', description: 'Recommended — only people you grant access can see it', visibility: 'private' as const },
        { label: 'Public', description: 'Anyone can see this repository and the skill files you later publish', visibility: 'public' as const }
      ], { title: 'New repository visibility', placeHolder: 'Private is recommended; select visibility explicitly' });
      if (!visibility) return;
      const confirmed = await vscode.window.showWarningMessage(
        `Create GitHub repository "${name.trim()}" with ${visibility.visibility.toUpperCase()} visibility? This creates the repository with an initial README and links it to ${skill.name}. The skill will not be published yet.`,
        { modal: true }, 'Create Repository'
      );
      if (confirmed !== 'Create Repository') return;
      const created = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Create ${visibility.visibility} GitHub repository ${name.trim()}`, cancellable: false },
        () => createGitHubRepository(root, name.trim(), visibility.visibility));
      try { await associate(root, skill, created.repository, created.baseBranch); }
      catch (error) {
        throw new Error(`Created ${created.nameWithOwner}, but its association could not be saved. Choose the existing repository to connect it; do not create it again. ${error instanceof Error ? error.message : String(error)}`);
      }
      void vscode.window.showInformationMessage(`Created ${created.visibility} repository ${created.nameWithOwner} and linked ${skill.name} to ${created.baseBranch}. The skill has not been published.`);
      return;
    }
    if (picked.defaultBranch) {
      await associate(root, skill, picked.repository, picked.defaultBranch);
      void vscode.window.showInformationMessage(`Workspace repository selected for ${skill.name}. Nothing was uploaded.`);
      return;
    }
    const repository = picked.repository || await vscode.window.showInputBox({ title: 'Skill Git repository', prompt: 'HTTPS or SSH repository URL, or an absolute local Git repository path. This does not push anything.', value: skill.repository ?? remembered?.repository ?? '', ignoreFocusOut: true });
    if (!repository?.trim()) return;
    const branch = await vscode.window.showInputBox({ title: 'Repository base branch', prompt: 'Existing branch to base the isolated release branch on. Enter the actual branch name.', value: skill.baseBranch ?? remembered?.baseBranch ?? 'main', ignoreFocusOut: true });
    if (!branch?.trim()) return;
    await associate(root, skill, repository.trim(), branch.trim());
    void vscode.window.showInformationMessage(`Repository and base branch saved for ${skill.name}. Nothing was pushed.`);
  });
  command('skillBuilder.workbenchValidate', async (node?: WorkbenchNode) => {
    const skill = await select(node);
    if (!skill) return;
    if (!await saveSkillDocuments(skill)) return;
    await showSkillCheck(skill, validateWorkbenchSkill(skill));
  });
  command('skillBuilder.workbenchPrepareRelease', async (node?: WorkbenchNode) => {
    const root = await requireRoot();
    const skill = await select(node);
    if (!skill) return;
    if (!await saveSkillDocuments(skill)) return;
    const versions = listSkillReleases(root, skill.id).map(entry => entry.version);
    const version = await vscode.window.showInputBox({ title: `Release version for ${skill.name}`, value: suggestReleaseVersion(skill, versions), prompt: 'Confirm the version to publish. Existing versions remain unchanged.', validateInput: value => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value) ? undefined : 'Enter a semantic version, for example 1.0.0.' });
    if (!version) return;
    const changelog = await vscode.window.showInputBox({ title: 'Release changes', prompt: 'Describe what changed and why. Required for the release record.', validateInput: value => value.trim() ? undefined : 'Describe the changes.' });
    if (!changelog) return;
    const release = prepareSkillRelease(root, skill.id, version, changelog.trim(), true);
    void vscode.window.showInformationMessage(`Prepared ${skill.name} ${release.version}. Review the package and manifest before publishing.`, 'Reveal Release')
      .then(result => result ? vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(release.directory)) : undefined);
    return release;
  });
  command('skillBuilder.workbenchPublishRelease', async (node?: WorkbenchNode) => {
    const root = await requireRoot();
    let skill = await select(node);
    if (!skill) return;
    if (!await saveSkillDocuments(skill)) return;
    const validation = validateWorkbenchSkill(skill);
    if (!validation.valid) { await showSkillCheck(skill, validation); return; }
    if (!skill.repository || !skill.baseBranch) {
      const remembered = rememberedRepository();
      if (remembered) updateSkillRepository(root, skill.id, remembered.repository, remembered.baseBranch);
      else await vscode.commands.executeCommand('skillBuilder.workbenchAssociateRepository', { skill });
      skill = listWorkbenchSkills(root).find(record => record.id === skill!.id);
      if (!skill?.repository || !skill.baseBranch) return;
    }
    const library = scanLibrary(root).entries;
    const releases = listSkillReleases(root, skill.id).filter(release =>
      library.find(entry => entry.directory === release.directory)?.status === 'prepared'
      && sameInventory(validation.files, release.manifest.files));
    let release: Release | undefined;
    if (!releases.length) {
      release = await vscode.commands.executeCommand<Release | undefined>('skillBuilder.workbenchPrepareRelease', { skill });
    } else if (releases.length === 1) {
      release = releases[0];
    } else {
      release = (await vscode.window.showQuickPick(releases.map(release => ({ label: release.version, description: release.directory, release })), { placeHolder: 'Choose the prepared version to publish' }))?.release;
    }
    if (!release) return;
    if (!await saveSkillDocuments(skill)) return;
    const selectedRelease = release;
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Publish ${skill.name} ${selectedRelease.version}`, cancellable: false }, async progress => {
      const report = (message: string) => progress?.report({ message });
      const preview = await prepareRepositoryPublish(selectedRelease.directory, skill.repository!, skill.baseBranch!, report, true);
      try {
        await showPublishPreview(preview, selectedRelease, skill.baseBranch!);
        const confirmed = await vscode.window.showWarningMessage(
          `Push ${skill.name} ${selectedRelease.version} to ${preview.repository}, branch ${preview.branch}? Review the opened file list first.`,
          { modal: true }, 'Push Release Branch'
        );
        if (confirmed !== 'Push Release Branch') return;
        const result = await pushPreparedRelease(preview, report);
        let cleanup: { archivedPath: string; sourceRetained: boolean } | undefined;
        let cleanupError: string | undefined;
        try {
          recordLibraryPublication(root, selectedRelease.directory, { ...result, baseBranch: skill.baseBranch! });
          if (!await saveSkillDocuments(skill)) throw new Error('Pending skill edits could not be saved. The active skill was retained.');
          cleanup = completeWorkbenchSkill(root, skill.id, selectedRelease.directory);
        } catch (error) {
          cleanupError = error instanceof Error ? error.message : String(error);
        }
        await showLibraryReceipt({ ...selectedRelease, status: 'uploaded', repository: result.repository, branch: result.branch, commit: result.commit, baseBranch: skill.baseBranch },
          cleanup ? `The completed draft was archived recoverably at ${localLink(cleanup.archivedPath, 'the local archive')}. Use **Published / library → Edit next version** to make a new draft.`
            : `The upload succeeded, but local completion is not finished: ${escapeMarkdown(cleanupError ?? 'Local draft retained.')}. Your draft is retained. Do not retry the upload to fix local completion.`);
        if (cleanupError) {
          void vscode.window.showWarningMessage(`Published ${result.commit} on ${result.branch}; local cleanup is not complete. ${cleanupError}`);
        } else {
          void vscode.window.showInformationMessage(`Uploaded ${skill.name} ${selectedRelease.version}; awaiting merge verification. Find the version in Published / library, or restore it to edit a new draft.`);
        }
      } finally { await disposePublishPreview(preview, report); }
    });
  });
  command('skillBuilder.workbenchPlayground', async (node?: WorkbenchNode) => {
    const root = await requireRoot();
    const skill = await select(node);
    if (skill && await saveSkillDocuments(skill)) await openPlayground(root, skill);
  });
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(() => refresh()));
}

async function fileNodes(skill: ManagedSkill, folder: string): Promise<WorkbenchNode[]> {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  return entries.filter(entry => !entry.isSymbolicLink() && !['.git', 'node_modules'].includes(entry.name))
    .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name))
    .map(entry => new WorkbenchNode(entry.name, entry.isDirectory() ? 'directory' : 'file', skill, path.join(folder, entry.name)));
}

function validRelativePath(value: string): boolean {
  if (!value || path.isAbsolute(value) || /[<>:"|?*\x00-\x1f]/.test(value)) return false;
  return value.split(/[\\/]/).every(part => part && part !== '.' && part !== '..' && !/[. ]$/.test(part)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) && part.toLowerCase() !== '.git');
}

async function safeNewFile(root: string, relative: string): Promise<string> {
  if (!validRelativePath(relative)) throw new Error('Unsafe file path. Use a relative path inside the skill.');
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('The skill root must be a regular directory.');
  const actualRoot = await fs.realpath(root);
  const parts = relative.split(/[\\/]/);
  let parent = actualRoot;
  for (const part of parts.slice(0, -1)) {
    parent = path.join(parent, part);
    try {
      const stat = await fs.lstat(parent);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe parent directory: ${part}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await fs.mkdir(parent);
    }
  }
  const target = path.join(parent, parts[parts.length - 1]);
  try { await fs.lstat(target); throw new Error('That file already exists. Open it in the tree to edit it.'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return target;
}

async function saveSkillDocuments(skill: ManagedSkill): Promise<boolean> {
  return saveDocumentsUnder(skill.sourcePath);
}

async function saveDocumentsUnder(sourcePath: string): Promise<boolean> {
  for (const document of vscode.workspace.textDocuments) {
    const relative = path.relative(sourcePath, document.uri.fsPath);
    if (document.isDirty && document.uri.scheme === 'file' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
      if (!await document.save()) { void vscode.window.showErrorMessage('Save the skill files before continuing.'); return false; }
    }
  }
  return true;
}

function sameInventory(left: { path: string; size: number; sha256: string }[], right: { path: string; size: number; sha256: string }[]): boolean {
  const normalized = (files: typeof left) => files.map(file => `${file.path}\0${file.size}\0${file.sha256}`).sort();
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

function scanLibrary(root: string): { entries: LibraryRelease[]; error?: string } {
  try { return { entries: listLibraryReleases(root) }; }
  catch (error) { return { entries: [], error: error instanceof Error ? error.message : String(error) }; }
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}\[\]()<>!|]/g, '\\$&');
}

function localLink(filePath: string, label: string): string {
  return `[${escapeMarkdown(label)}](${markdownUrl(pathToFileURL(filePath).href)})`;
}

function markdownUrl(value: string): string {
  return value.replace(/[()]/g, character => character === '(' ? '%28' : '%29');
}

async function showMarkdown(content: string) {
  const document = await vscode.workspace.openTextDocument({ language: 'markdown', content });
  await vscode.window.showTextDocument(document);
  if (document.uri) await vscode.commands.executeCommand('markdown.showPreview', document.uri);
}

async function showSkillCheck(skill: ManagedSkill, report: ReturnType<typeof validateWorkbenchSkill>) {
  const list = (values: string[]) => values.length ? values.map(value => `- ${escapeMarkdown(value)}`).join('\n') : '- None.';
  await showMarkdown(`# Sanity check: ${escapeMarkdown(skill.name)}\n\n**Structural checks ${report.valid ? 'passed' : 'need attention'}.** ${report.files.length} files inspected.\n\nSecurity scanning was not performed by SkillJetty.\n\n${localLink(path.join(skill.sourcePath, 'SKILL.md'), 'Edit the skill')}\n\n## Errors\n\n${list(report.errors)}\n\n## Structural notes\n\n${list(report.warnings)}\n\n## Next step\n\n${report.valid ? 'Review any structural notes, then choose **Publish**. You can also use the manual playground before publishing.' : 'Fix the errors in your draft and choose **Sanity check** again.'}\n\nSanity check covers required metadata, skill identity and package structure. Application compatibility and model behavior were not tested.\n`);
}

async function selectLibraryEntry(root: string, requested?: LibraryRelease): Promise<LibraryRelease | undefined> {
  const entries = listLibraryReleases(root);
  if (requested) {
    const current = entries.find(entry => path.resolve(entry.directory) === path.resolve(requested.directory));
    if (!current) throw new Error('That version is no longer available in this workspace library. Refresh the workbench.');
    return current;
  }
  if (!entries.length) { void vscode.window.showInformationMessage('No versions are in the library yet. Create or open a draft, then choose Publish.'); return; }
  return (await vscode.window.showQuickPick(entries.map(entry => ({ label: `${entry.skillName} ${entry.version}`, description: entry.status, entry })), { placeHolder: 'Choose a version from the library' }))?.entry;
}

function repositoryWebUrl(repository: string): string | undefined {
  const ssh = /^git@([^:]+):(.+)$/.exec(repository);
  try {
    const url = new URL(ssh ? `https://${ssh[1]}/${ssh[2]}` : repository);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    return `${url.origin}${url.pathname.replace(/\.git\/?$/, '').replace(/\/$/, '')}`;
  } catch { return undefined; }
}

function repositoryFiles(entry: LibraryRelease): string {
  const web = entry.repository && repositoryWebUrl(entry.repository);
  if (!web || !entry.branch) return '';
  const ref = markdownUrl(encodeURIComponent(entry.branch));
  const relative = `${entry.skillName}/${entry.version}`;
  const encodedPath = (value: string) => value.split('/').map(segment => markdownUrl(encodeURIComponent(segment))).join('/');
  const tree = `${markdownUrl(web)}/tree/${ref}`;
  const blob = `${markdownUrl(web)}/blob/${ref}`;
  const packageName = path.basename(entry.packagePath);
  return `## Files in the recorded upload branch\n\n- [Editable source](${tree}/${encodedPath(`${relative}/source/${entry.skillName}`)})\n- [${escapeMarkdown(packageName)}](${blob}/${encodedPath(`${relative}/${packageName}`)})\n- [CHANGELOG.md](${blob}/${encodedPath(`${relative}/CHANGELOG.md`)})\n- [Review branch](${tree})\n${entry.commit ? `- [Verified upload commit](${markdownUrl(web)}/commit/${encodeURIComponent(entry.commit)})\n` : ''}${entry.baseBranch ? `- [Compare with ${escapeMarkdown(entry.baseBranch)}](${markdownUrl(web)}/compare/${markdownUrl(encodeURIComponent(entry.baseBranch))}...${ref})\n` : ''}\n`;
}

async function showLibraryReceipt(entry: LibraryRelease, completionNote = '') {
  const uploaded = entry.status === 'uploaded' && !!entry.commit && !!entry.branch;
  const state = uploaded ? 'Uploaded — awaiting merge verification' : entry.status === 'archived' ? 'Archived locally — upload unverified' : 'Prepared locally — no upload receipt';
  const note = uploaded
    ? 'The branch upload was verified when this receipt was recorded. Merge status is not tracked here; the branch may have been merged outside the workbench.'
    : 'This library entry does not establish a verified remote upload or merge.';
  await showMarkdown(`# ${escapeMarkdown(entry.skillName)} ${escapeMarkdown(entry.version)}\n\n**${state}.**\n\n${note}\n\n${entry.repository ? `Repository: ${escapeMarkdown(entry.repository)}\n\n` : ''}${entry.branch ? `Branch: ${escapeMarkdown(entry.branch)}\n\n` : ''}${entry.commit ? `Commit: ${escapeMarkdown(entry.commit)}\n\n` : ''}${uploaded ? repositoryFiles(entry) : ''}## Preserved local files\n\n- ${localLink(path.join(entry.directory, 'source', entry.skillName), 'Editable source snapshot')}\n- ${localLink(entry.packagePath, path.basename(entry.packagePath))}\n- ${localLink(path.join(entry.directory, 'CHANGELOG.md'), 'CHANGELOG.md')}\n\n${completionNote || 'Choose **Edit next version** in the library to restore an editable draft. This version and any original imported package remain preserved.'}\n`);
}

async function showPublishPreview(preview: Awaited<ReturnType<typeof prepareRepositoryPublish>>, release: Release, baseBranch: string) {
  await showMarkdown(`# Review upload: ${escapeMarkdown(release.skillName)} ${escapeMarkdown(release.version)}\n\n**Nothing has been uploaded yet.**\n\n- Repository: ${escapeMarkdown(preview.repository)}\n- Review branch: ${escapeMarkdown(preview.branch)}\n- Base branch: ${escapeMarkdown(baseBranch)}\n- Repository folder: ${escapeMarkdown(preview.relativePath)}\n\n## Review this version\n\n- ${localLink(path.join(release.directory, 'source', release.skillName), 'Source snapshot')}\n- ${localLink(release.packagePath, path.basename(release.packagePath))}\n- ${localLink(path.join(release.directory, 'CHANGELOG.md'), 'CHANGELOG.md')}\n\nThe source snapshot, package, and changelog are checked before upload. Confirm **Push Release Branch** to upload this version for review. Cancel keeps your local draft and prepared version.\n\n## Files to upload (${preview.files.length})\n\n${preview.files.map(file => `- ${escapeMarkdown(file)}`).join('\n')}\n`);
}

async function openPlayground(root: string, skill: ManagedSkill) {
  const directory = path.join(root, 'workbench', encodeURIComponent(skill.id), 'playground');
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, 'cases.json');
  const openDocument = vscode.workspace.textDocuments.find(document => document.uri.scheme === 'file' && document.uri.fsPath === filePath);
  if (openDocument?.isDirty && !await openDocument.save()) throw new Error('Save the playground cases before continuing.');
  let data: Playground;
  try { data = JSON.parse(await fs.readFile(filePath, 'utf8')) as Playground; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Playground cases could not be read. Open and fix the saved JSON before adding a case.');
    data = { format: 1, note: 'Manual test records. This playground does not call an AI model or automatically prove skill behavior. Run the prompt in your chosen Claude environment, then record the actual result.', cases: [] };
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), { flag: 'wx' });
  }
  if (!Array.isArray(data.cases)) throw new Error('Playground cases.json must contain a cases array.');
  const choice = await vscode.window.showQuickPick([
    { label: 'Add a test case', id: 'add', detail: 'Save a prompt and expected result for your chosen Claude environment.' },
    { label: 'Copy a test prompt for Claude', id: 'copy', detail: 'Run the prompt in your own Claude environment, then record the result here.' },
    { label: 'Record a manual result', id: 'record', detail: 'Record what actually happened; no model is invoked.' },
    { label: 'Open all cases and recorded results', id: 'open' },
    { label: 'Open evals/evals.json', id: 'evals', detail: 'Edit the skill’s distributable evaluation cases separately.' }
  ], { title: `Manual Playground: ${skill.name}`, placeHolder: 'No model calls, credentials, or automatic pass claims' });
  if (!choice) return;
  if (choice.id === 'evals') {
    await vscode.window.showTextDocument(vscode.Uri.file(path.join(skill.sourcePath, 'evals', 'evals.json'))); return;
  }
  if (choice.id === 'add') {
    const prompt = await vscode.window.showInputBox({ title: 'Test prompt', prompt: 'Enter a realistic request. You can edit longer prompts in cases.json afterward.', validateInput: value => value.trim() ? undefined : 'Enter a prompt.' });
    if (!prompt) return;
    const expected = await vscode.window.showInputBox({ title: 'Expected result', prompt: 'Describe a result you can inspect, including failure behavior where relevant.', validateInput: value => value.trim() ? undefined : 'Enter an expected result.' });
    if (!expected) return;
    data.cases.push({ id: `case-${Date.now()}`, prompt, expected, runs: [] });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } else if (choice.id === 'copy') {
    const selected = await vscode.window.showQuickPick(data.cases.map(test => ({ label: test.prompt, description: test.id, test })), { placeHolder: 'Choose a prompt to run in your Claude environment' });
    if (!selected) return;
    await vscode.env.clipboard.writeText(selected.test.prompt);
    void vscode.window.showInformationMessage('Test prompt copied. Run it in your chosen Claude environment, then use Record a manual result.');
    return;
  } else if (choice.id === 'record') {
    const selected = await vscode.window.showQuickPick(data.cases.map(test => ({ label: test.prompt, description: test.id, test })), { placeHolder: 'Choose the case you actually ran in Claude' });
    if (!selected) return;
    const result = await vscode.window.showQuickPick(['Pass', 'Fail', 'Needs review'], { placeHolder: 'Your manual assessment against the expected result' });
    if (!result) return;
    const actual = await vscode.window.showInputBox({ title: 'Actual observation', prompt: 'Record the observed behavior or output location. This is your manual result, not an automated evaluation.', validateInput: value => value.trim() ? undefined : 'Record what actually happened.' });
    if (!actual) return;
    selected.test.runs ??= [];
    selected.test.runs.push({ at: new Date().toISOString(), result, actual, method: 'manual' });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }
  await vscode.window.showTextDocument(vscode.Uri.file(filePath));
}
