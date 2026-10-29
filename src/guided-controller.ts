import { managedRepositoryPath, pullManagedRepository } from './managed-repository.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { listWorkbenchSkills, WorkbenchSkill } from './skill-workbench.js';
import { suggestReleaseVersion } from './workbench-library.js';
import { readSkillIdentity } from './skill-identity.js';
import { listRepositoryChoices, createGitHubRepository } from './repository-publisher.js';
import { connectWorkspaceRepository, getWorkspaceConnection, migrateAssociation, createGuidedSkill, listGuidedFiles, readGuidedFile, writeGuidedFile, copyGuidedFile, saveGuidedRecovery, listGuidedHistory, restoreGuidedEdit, publishGuidedSkill, reviewLibraryRelease, libraryReviewContext } from './guided-workspace.js';
import { GitHubReviewService, githubRepository, pullRequestUrl, githubError, type GitHubRunner } from './github-review.js';
import { checkSkillCompatibility } from './skill-compatibility.js';
import { GuidedState, GuidedMessage, SkillTarget } from './guided-contract.js';
import { runWorkbenchJob } from './workbench-jobs.js';
import type { ValidationReport } from './skill-workbench.js';
import { activityForAction, actionNeedsInput } from './guided-activity.js';

export type GuidedHooks = {
  pickPackage?(): Promise<string | undefined>;
  pickFolder?(initialPath?: string): Promise<string | undefined>;
  pickFile?(): Promise<string | undefined>;
  chooseWorkspace?(): Promise<string | undefined>;
  openLink?(url: string): Promise<void>;
  revealFile?(file: string): Promise<void>;
  onState?(state: GuidedState): void;
  github?: GitHubRunner;
  connectGitHub?(): Promise<string | undefined>;
};

export class GuidedWorkbenchController {
  private pending: Promise<void> = Promise.resolve();
  private previewInventory?: string;
  state: GuidedState = { step: 'start', hasWorkspace: false, repositories: [], drafts: [], library: [], files: [], target: 'portable' };
  constructor(private root: string | undefined, private hooks: GuidedHooks = {}) { this.state.hasWorkspace = !!root; }
  private workspace(): string { if (!this.root) throw new Error('Choose a local folder for your skill work before continuing.'); return this.root; }
  private active(): WorkbenchSkill {
    const skill = listWorkbenchSkills(this.workspace()).find(item => item.id === this.state.active?.id);
    if (!skill) throw new Error('Choose a draft to continue editing. Your saved files have not been removed.');
    return skill;
  }
  private refreshConnection() {
    if (!this.root) return;
    this.state.hasWorkspace = true;
    try { this.state.connection = getWorkspaceConnection(this.root); }
    catch { this.state.connection = undefined; this.state.notice = 'Your repository connection needs reconnecting. Saved drafts are still available.'; }
  }
  private async loadSkills() {
    if (!this.root) return;
    this.refreshConnection();
    this.state.drafts = listWorkbenchSkills(this.root).map(({ id, name }) => ({ id, name }));
    try {
      const releases = await runWorkbenchJob({ kind: 'library', root: this.root });
      if (!this.state.connection) this.state.connection = await migrateAssociation(this.root, releases);
      this.state.library = releases.map(({ skillName, version, directory, status, pr }) => ({ skillName, version, directory, status, ...(pr ? { pr } : {}) }));
      if (this.state.reviewQueue !== undefined) await this.refreshReviews();
      this.state.libraryError = undefined;
    } catch { this.state.libraryError = 'A saved version could not be verified. Your drafts are still available.'; this.state.library = []; }
    this.state.skillsLoaded = true;
    this.state.skillsStale = false;
  }
  private async refreshReviews() {
    this.state.reviewQueue = (await runWorkbenchJob({ kind: 'reviews', root: this.workspace() })).map(({ directory, skillName, version, repository, pr }) => ({ directory, skillName, version, repository, ...(pr ? { pr } : {}) }));
    if (this.state.receipt?.directory) {
      const current = this.state.reviewQueue.find(item => item.directory === this.state.receipt!.directory);
      if (current?.pr) this.state.receipt.pr = current.pr;
    }
  }
  private select(skill: WorkbenchSkill) {
    const identity = readSkillIdentity(readGuidedFile(skill, 'SKILL.md'));
    this.state.active = { id: skill.id, name: skill.name, version: identity.declaredVersion,
      versionNote: identity.warnings.join(' ') || (identity.declaredVersion ? `Declared in SKILL.md → ${identity.versionSource}.` : 'No version declared. SkillJetty will manage the release number when you share.') };
    this.state.files = listGuidedFiles(skill);
    this.state.editor = { path: 'SKILL.md', content: readGuidedFile(skill, 'SKILL.md') };
    this.state.history = listGuidedHistory(this.workspace(), skill, 'SKILL.md');
    this.previewInventory = undefined;
    this.state.step = 'edit'; this.state.check = undefined; this.state.publish = undefined; this.state.receipt = undefined; this.state.form = undefined;
  }
  private buffer(message: GuidedMessage) {
    if (message.editorContent === undefined && message.editorPath === undefined) return;
    if (typeof message.editorContent !== 'string' || typeof message.editorPath !== 'string') throw new Error('The edit could not be saved. Keep this screen open and try Save again.');
    const skill = this.active();
    if (message.editorSkillId !== skill.id) throw new Error('This edit belongs to a different draft. Reopen that draft before saving; no other skill was changed.');
    if (!this.state.editor || message.editorPath !== this.state.editor.path) throw new Error('The edited file is no longer selected. Reopen it before saving.');
    if (this.state.editor.readOnly) {
      if (message.editorContent === this.state.editor.content) return;
      throw new Error('This file is preserved as binary data and cannot be edited as text.');
    }
    // A textarea exposes CRLF/CR as LF, including when the user has not typed.
    // Compare against the displayed snapshot, never against a newer disk copy.
    const browserText = (value: string) => value.replace(/\r\n?/g, '\n');
    const unchanged = browserText(message.editorContent) === browserText(this.state.editor.content);
    const saved = readGuidedFile(skill, message.editorPath);
    if (saved !== this.state.editor.content) {
      if (unchanged) {
        this.state.editor.content = saved;
        this.state.files = this.state.files.map(file => file.path === message.editorPath ? { ...file, size: Buffer.byteLength(saved, 'utf8') } : file);
        this.state.check = undefined;
        return;
      }
      const recovery = saveGuidedRecovery(this.workspace(), skill, message.editorPath, message.editorContent);
      throw new Error(`This file changed in another editor. The saved file was kept, and your workbench edits were preserved at ${recovery}. Choose Reload saved file to continue from the current saved version.`);
    }
    if (!unchanged) {
      const original = this.state.editor.content;
      const uniformCrlf = original.includes('\r\n') && !/[\r\n]/.test(original.replace(/\r\n/g, ''));
      const content = uniformCrlf ? browserText(message.editorContent).replace(/\n/g, '\r\n') : message.editorContent;
      const earlierEdit = saveGuidedRecovery(this.workspace(), skill, message.editorPath, original);
      writeGuidedFile(skill, message.editorPath, content);
      this.state.check = undefined;
      this.state.editor.content = content;
      // The other files and release archives did not change. Avoid reading
      // every binary asset and earlier edit on each debounced text save.
      this.state.files = this.state.files.map(file => file.path === message.editorPath ? { ...file, size: Buffer.byteLength(content, 'utf8') } : file);
      this.state.history = [{ id: path.basename(earlierEdit, '.json'), path: message.editorPath, at: new Date().toISOString() }, ...(this.state.history ?? [])].slice(0, 50);
      if (message.editorPath === 'SKILL.md' && this.state.active) {
        const identity = readSkillIdentity(content);
        this.state.active.version = identity.declaredVersion;
        this.state.active.versionNote = identity.warnings.join(' ') || (identity.declaredVersion ? `Declared in SKILL.md → ${identity.versionSource}.` : 'No version declared. Release numbering is automatic.');
      }
    }
  }
  private async publicationDetails(suppliedNotes?: string): Promise<{ details: NonNullable<GuidedState['publish']>; inventory: ValidationReport['files'] }> {
    const skill = this.active();
    const snapshot = await runWorkbenchJob({ kind: 'snapshot', root: this.workspace(), skill });
    if (!snapshot.validation.valid) throw new Error(snapshot.validation.errors.join('\n'));
    const versions = snapshot.releases;
    const inventory = snapshot.validation.files;
    const matching = versions.find(item => {
      const manifest = JSON.parse(fs.readFileSync(path.join(item.directory, 'release.json'), 'utf8'));
      return JSON.stringify(manifest.files) === JSON.stringify(inventory)
        && (!suppliedNotes || fs.readFileSync(path.join(item.directory, 'CHANGELOG.md'), 'utf8').trim() === suppliedNotes);
    });
    const identity = readSkillIdentity(readGuidedFile(skill, 'SKILL.md'));
    const summary = snapshot.summary;
    const section = (label: string, values: string[]) => values.length ? `${label} (${values.length}): ${values.slice(0, 12).join(', ')}${values.length > 12 ? ', …' : ''}.` : '';
    const notes = [summary.baselineVersion ? `File changes since saved release ${summary.baselineVersion}.` : `First saved release of ${skill.name}.`,
      section('Added', summary.added), section('Updated', summary.changed), section('Removed', summary.removed),
      !summary.hasChanges ? 'No skill file changes.' : '', 'Generated from file comparisons; skill behavior has not been tested.'].filter(Boolean).join('\n');
    const version = identity.declaredVersion ?? matching?.version ?? suggestReleaseVersion(skill, versions.map(item => item.version));
    return { details: { version, changelog: matching ? fs.readFileSync(path.join(matching.directory, 'CHANGELOG.md'), 'utf8').trim() : '',
      repository: this.state.connection?.repository, fileCount: inventory.length,
      reviewSupported: !!githubRepository(this.state.connection?.repository ?? ''),
      versionSource: matching ? 'Reusing this exact saved release; no duplicate is needed.' : identity.declaredVersion && version === identity.declaredVersion
        ? `From SKILL.md → ${identity.versionSource}.` : identity.declaredVersion
          ? `Managed release number. The skill itself declares ${identity.declaredVersion}; its metadata is preserved.`
          : 'Managed automatically by SkillJetty.',
      versionWarning: identity.warnings.join(' ') || undefined, changeSummary: summary, suggestedChangelog: notes }, inventory };
  }
  private async check() {
    const skill = this.active();
    const result = await runWorkbenchJob({ kind: 'validate', skill });
    const fileFinding = (message: string) => {
      const file = this.state.files.find(entry => message.startsWith(`${entry.path}:`))?.path;
      return { message, ...(file ? { file } : {}) };
    };
    let compatibility: ReturnType<typeof checkSkillCompatibility>;
    try { compatibility = checkSkillCompatibility(skill, this.state.target, result.files.map(file => file.path)); }
    catch { compatibility = { warnings: [], compatibility: 'Correct the file errors before compatibility can be checked.', behaviorNote: 'No AI model was run.' }; }
    this.state.check = { valid: result.valid, errors: result.errors.map(fileFinding), warnings: [...result.warnings.map(fileFinding), ...compatibility.warnings], compatibility: compatibility.compatibility, behaviorNote: compatibility.behaviorNote };
    this.state.step = 'check';
    return result.valid;
  }
  private progress(message: string, waitingForInput = false) { this.state.progress = message; this.state.waitingForInput = waitingForInput; this.hooks.onState?.(this.state); }
  dispatch(message: GuidedMessage): Promise<GuidedState> {
    // Pickers and network calls can yield while another message arrives. Keep
    // their complete transitions ordered instead of changing the active skill
    // underneath an outstanding file selection or publication.
    const operation = this.pending.then(() => this.execute(message));
    this.pending = operation.then(() => undefined, () => undefined);
    return operation;
  }
  private async execute(message: GuidedMessage): Promise<GuidedState> {
    if (this.state.busy) return this.state;
    const payload = message.payload ?? {};
    const reviewMode = this.state.form?.mode === 'reviews';
    const string = (key: string, fallback = '') => typeof payload[key] === 'string' ? payload[key] as string : fallback;
    this.state.error = undefined; this.state.notice = undefined;
    try {
      if (message.action !== 'save' && message.action !== 'ready') {
        this.state.busy = true;
        this.progress(activityForAction(message.action), actionNeedsInput(message.action));
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      if (message.action !== 'reloadFile') this.buffer(message);
      this.state.form = Object.fromEntries(Object.entries(payload).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
      switch (message.action) {
        case 'ready': this.refreshConnection(); break;
        case 'loadSkills': case 'refresh': this.workspace(); await this.loadSkills(); break;
        case 'unloadSkills':
          this.state.drafts = []; this.state.library = []; this.state.reviewQueue = undefined;
          this.state.libraryError = undefined; this.state.reviewQueueError = undefined;
          this.state.skillsLoaded = false; this.state.skillsStale = false; break;
        case 'chooseWorkspace': {
          const root = await this.hooks.chooseWorkspace?.();
          if (root) {
            this.progress('Opening your selected work folder…'); this.root = root;
            this.state.drafts = []; this.state.library = []; this.state.reviewQueue = undefined;
            this.state.skillsLoaded = false; this.state.skillsStale = false;
            this.state.active = undefined; this.state.editor = undefined; this.state.files = []; this.state.history = undefined;
            this.state.check = undefined; this.state.publish = undefined; this.state.receipt = undefined;
            this.state.libraryError = undefined; this.state.reviewQueueError = undefined; this.state.step = 'start';
            this.refreshConnection();
          }
          else this.state.notice = 'Folder selection canceled. Your saved work is still available.';
          break;
        }
        case 'pullRepository': {
          this.refreshConnection();
          const connection = this.state.connection;
          if (!connection) throw new Error('Connect a repository before Git pull.');
          this.state.repositoryCheckout = await pullManagedRepository(this.workspace(), connection.repository, message => this.progress(message));
          this.state.notice = 'Git pull complete. Open a skill folder from the managed checkout to begin working.';
          break;
        }
        case 'openRepositorySkill': {
          this.refreshConnection();
          const connection = this.state.connection;
          if (!connection) throw new Error('Connect a repository before opening its skills.');
          const checkout = managedRepositoryPath(this.workspace(), connection.repository);
          if (!fs.existsSync(path.join(checkout, '.git'))) throw new Error('Use Git pull to download the registered repository first.');
          const folder = await this.hooks.pickFolder?.(checkout);
          if (folder) {
            this.select(await runWorkbenchJob({ kind: 'registerFolder', root: this.workspace(), folder, replaceExisting: true }));
          }
          break;
        }
        case 'discoverRepositories':
          this.state.busy = true; this.progress('Finding repositories you can connect…');
          this.state.repositories = await listRepositoryChoices(this.workspace()); break;
        case 'connectRepository':
          this.state.busy = true; this.progress('Connecting and checking the repository’s default branch…');
          this.state.connection = await connectWorkspaceRepository(this.workspace(), string('repository'));
          this.state.reviewers = []; this.state.reviewersLoaded = false; this.state.reviewersError = undefined;
          this.state.notice = 'Repository connected. Future versions will use this destination automatically.'; break;
        case 'createRepository': {
          if (payload.confirmed !== true) throw new Error('Confirm the repository name and visibility before creating it.');
          const visibility = payload.visibility === 'public' ? 'public' : 'private';
          this.state.busy = true; this.progress('Creating your repository…');
          const created = await createGitHubRepository(this.workspace(), string('name'), visibility);
          this.state.connection = await connectWorkspaceRepository(this.workspace(), created.repository);
          this.state.notice = 'Repository created and connected. No skill has been uploaded yet.'; break;
        }
        case 'showCreate': this.workspace(); this.state.step = 'start'; this.state.form = { mode: 'create' }; break;
        case 'createSkill': {
          this.state.form.mode = 'create';
          const skill = createGuidedSkill(this.workspace(), { name: string('name'), description: string('description'), instructions: string('instructions') });
          this.select(skill); break;
        }
        case 'openPackage': {
          const file = await this.hooks.pickPackage?.();
          if (file) { this.progress('Opening and checking the selected skill package…'); this.select(await runWorkbenchJob({ kind: 'importPackage', root: this.workspace(), file, replaceExisting: true })); }
          else this.state.notice = 'Opening canceled. No package was imported.';
          break;
        }
        case 'openPackagePath': {
          const file = string('path').trim();
          if (!file || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.skill') throw new Error('Enter the full path to a .skill package.');
          this.select(await runWorkbenchJob({ kind: 'importPackage', root: this.workspace(), file, replaceExisting: true })); break;
        }
        case 'openFolder': {
          const folder = await this.hooks.pickFolder?.();
          if (folder) { this.progress('Copying the selected skill folder into your beta workspace…'); this.select(await runWorkbenchJob({ kind: 'registerFolder', root: this.workspace(), folder, replaceExisting: true })); }
          else this.state.notice = 'Opening canceled. No folder was imported.';
          break;
        }
        case 'resume': {
          const skill = listWorkbenchSkills(this.workspace()).find(item => item.id === string('id'));
          if (!skill) throw new Error('That draft is no longer active. Refresh to see saved drafts.');
          this.select(skill); break;
        }
        case 'restoreVersion': this.select(await runWorkbenchJob({ kind: 'restoreRelease', root: this.workspace(), directory: string('directory') })); break;
        case 'openFile': {
          const skill = this.active(); const relative = string('path');
          const file = listGuidedFiles(skill).find(item => item.path === relative);
          if (!file) throw new Error('Choose a file belonging to this skill.');
          this.state.editor = { path: relative, content: file.text ? readGuidedFile(skill, relative) : 'This binary file is preserved in full. Use your normal desktop application to edit it.', readOnly: !file.text };
          this.state.history = file.text ? listGuidedHistory(this.workspace(), skill, relative) : [];
          this.state.step = 'edit'; break;
        }
        case 'createFile': {
          const skill = this.active(); const relative = string('path');
          if (listGuidedFiles(skill).some(file => file.path === relative)) throw new Error('That file already exists. Choose it from the file list.');
          writeGuidedFile(skill, relative, ''); this.state.files = listGuidedFiles(skill);
          this.state.editor = { path: relative, content: '' }; break;
        }
        case 'addFile': {
          const file = await this.hooks.pickFile?.(); if (!file) break;
          this.progress('Adding the selected supporting file…');
          const relative = string('path', `references/${path.basename(file)}`);
          const skill = this.active();
          copyGuidedFile(skill, relative, file);
          this.state.files = listGuidedFiles(skill); break;
        }
        case 'save': this.state.notice = 'Saved on this computer. Use Refresh earlier edits below the editor to see saved history.'; break;
        case 'refreshHistory': {
          const skill = this.active();
          this.state.history = this.state.editor && !this.state.editor.readOnly ? listGuidedHistory(this.workspace(), skill, this.state.editor.path) : [];
          this.state.form = { ...this.state.form, historyOpen: 'true' };
          this.state.notice = 'Earlier edits refreshed. Your current work is saved.'; break;
        }
        case 'restoreEdit': {
          const skill = this.active();
          if (!this.state.editor || this.state.editor.readOnly) throw new Error('Select an editable text file first.');
          const relative = this.state.editor.path;
          restoreGuidedEdit(this.workspace(), skill, relative, string('id'));
          this.state.editor.content = readGuidedFile(skill, relative);
          this.state.history = listGuidedHistory(this.workspace(), skill, relative);
          this.state.form = { ...this.state.form, historyOpen: 'true' };
          this.state.files = listGuidedFiles(skill); this.state.check = undefined; this.state.publish = undefined;
          this.state.notice = 'Earlier edit restored. The content it replaced is also kept in Earlier edits.'; break;
        }
        case 'reloadFile': {
          const skill = this.active();
          const relative = this.state.editor?.path ?? 'SKILL.md';
          this.state.editor = { path: relative, content: readGuidedFile(skill, relative) };
          this.state.files = listGuidedFiles(skill); this.state.check = undefined; this.state.notice = 'Loaded the saved file. Conflicting edits remain in local recovery records.'; break;
        }
        case 'setTarget': {
          const target = string('target');
          if (!['portable', 'claude', 'codex', 'gemini', 'copilot'].includes(target)) throw new Error('Choose a supported compatibility target.');
          this.state.target = target as SkillTarget; this.state.check = undefined; break;
        }
        case 'check': await this.check(); break;
        case 'edit': this.state.step = 'edit'; break;
        case 'preparePublish': {
          if (!await this.check()) break;
          this.state.step = 'publish';
          const preview = await this.publicationDetails();
          this.state.publish = preview.details;
          this.previewInventory = JSON.stringify(preview.inventory);
          break;
        }
        case 'savePackage': case 'publish': {
          if (this.state.step !== 'publish') throw new Error('Check this skill and review the publication screen first.');
          const preview = await this.publicationDetails(string('changelog').trim() || undefined);
          const details = preview.details;
          const override = string('version').trim();
          const version = override || details.version;
          const changelog = string('changelog').trim() || details.changelog || details.suggestedChangelog || `Saved release of ${this.active().name}.`;
          const currentInventory = JSON.stringify(preview.inventory);
          if (this.previewInventory !== currentInventory || (!override && this.state.publish?.version !== details.version)) {
            this.state.publish = details; this.previewInventory = currentInventory;
            throw new Error('Your skill or saved release history changed since this summary was shown. The summary has been updated; review it before submitting. Nothing was uploaded.');
          }
          if (string('reviewer') && payload.confirmed !== true) throw new Error('Select a reviewer and explicitly confirm the review request when submitting.');
          this.state.publish = { ...details, changelog };
          if (message.action === 'savePackage') {
            this.state.step = 'publish';
            const skill = this.active();
            const existing = (await runWorkbenchJob({ kind: 'library', root: this.workspace(), skillName: skill.name })).find(item => item.version === version);
            let release = existing ? await runWorkbenchJob({ kind: 'verifyRelease', directory: existing.directory }) : undefined;
            if (!release || JSON.stringify(release.manifest.files) !== currentInventory
                || fs.readFileSync(path.join(release.directory, 'CHANGELOG.md'), 'utf8').trim() !== changelog.trim()) {
              release = await runWorkbenchJob({ kind: 'prepareRelease', root: this.workspace(), id: skill.id, version, changelog, replaceExisting: true });
            }
            if (JSON.stringify(release.manifest.files) !== currentInventory) throw new Error('The draft changed while the local package was being prepared. The prepared package is preserved, but it has not been accepted as the reviewed release. Check the draft and review a fresh summary. Nothing was uploaded.');
            this.state.receipt = { name: skill.name, version, directory: release.directory, packagePath: release.packagePath, local: true,
              note: 'Package saved on this computer. No repository was contacted and nothing was uploaded. Your editable draft and earlier edits are retained.' };
            this.state.step = 'done'; break;
          }
          if (!this.state.connection) throw new Error('Connect your repository before publishing.');
          this.state.step = 'publish';
          this.state.busy = true; this.progress('Checking and packaging this version…');
          const supported = !!githubRepository(this.state.connection.repository);
          const priorUpload = (await runWorkbenchJob({ kind: 'library', root: this.workspace(), skillName: this.active().name })).find(item => item.version === version && item.status === 'uploaded');
          if (supported && !priorUpload) { this.progress('Confirming GitHub pull request access before uploading…'); await new GitHubReviewService(this.workspace(), this.hooks.github).preflight(this.state.connection.repository); }
          const result = await publishGuidedSkill(this.workspace(), this.active().id, version, changelog, message => this.progress(message), { deferCleanup: supported, expectedFiles: preview.inventory });
          this.state.receipt = receiptFor(result);
          if (supported) {
            this.progress('Upload verified. Creating or finding its pull request…');
            try {
              const reviewed = await reviewLibraryRelease(this.workspace(), result.release.directory, 'create', string('reviewer'), this.hooks.github);
              this.state.receipt.pr = reviewed.pr; this.state.receipt.cleanupError = reviewed.cleanupError ?? result.cleanupError;
              this.state.receipt.note = reviewed.pr.error ? reviewed.pr.number && reviewed.pr.identityVerified ? 'PR created; the latest review status is unavailable. Open or check the recorded PR; the upload is retained.' : 'Uploaded — PR not created or verified. The uploaded version and draft remain recoverable; retry from Check PRs.' : reviewed.pr.reviewRequestError ? 'PR created — review request failed or remains uncertain. Check the recorded PR without uploading another version.' : 'Uploaded with a recorded PR. Review, checks and merge are separate actions; SkillJetty does not merge.';
            } catch {
              this.state.receipt.pr = { supported: true, status: 'uploaded', error: 'Upload is verified, but PR metadata could not be saved. Use Check PRs before retrying; the draft and release remain recoverable.' };
              this.state.receipt.note = 'Uploaded — PR receipt not confirmed. No further upload is needed to retry PR creation.';
            }
          } else this.state.receipt.pr = { supported: false, status: 'unsupported', warning: 'Uploaded to a review branch. Automatic PR review is available for GitHub.com only; no PR was created for this provider.' };
          this.state.step = 'done'; this.state.editor = undefined; this.state.files = []; this.state.active = undefined; break;
        }
        case 'revealPackage': {
          const receipt = this.state.receipt;
          const saved = (await runWorkbenchJob({ kind: 'library', root: this.workspace(), skillName: receipt?.name })).find(item => item.directory === receipt?.directory && item.version === receipt?.version);
          if (!receipt?.local || !saved) throw new Error('Save a local package first.');
          const release = await runWorkbenchJob({ kind: 'verifyRelease', directory: saved.directory });
          await this.hooks.revealFile?.(release.packagePath); break;
        }
        case 'loadReviewers': {
          this.state.busy = true; this.progress('Finding eligible collaborator reviewers…');
          const connection = getWorkspaceConnection(this.workspace());
          this.state.reviewers = []; this.state.reviewersLoaded = false; this.state.reviewersError = undefined;
          try {
            if (!connection || !githubRepository(connection.repository)) throw new Error('unsupported');
            this.state.reviewers = await new GitHubReviewService(this.workspace(), this.hooks.github).reviewers(connection.repository);
            this.state.reviewersLoaded = true;
          } catch (error) { this.state.reviewersError = connection && githubRepository(connection.repository) ? githubError(error) : 'Reviewer selection is available for GitHub.com only. No reviewer was selected.'; }
          break;
        }
        case 'connectGitHub': {
          this.state.busy = true; this.progress('Choose your GitHub account in VS Code. Cancelling keeps your draft unchanged.', true);
          this.state.reviewers = []; this.state.reviewersLoaded = false; this.state.reviewersError = undefined;
          const account = await this.hooks.connectGitHub?.();
          if (!account) throw new Error('GitHub sign-in was cancelled. No upload or review request was made.');
          this.state.githubAccount = account;
          this.state.notice = 'GitHub account selected. Recheck this repository and choose a reviewer again before requesting review.'; break;
        }
        case 'checkPullRequests': {
          this.state.step = 'start'; this.state.form = { mode: 'reviews' }; this.state.busy = true; this.state.reviewQueueError = undefined;
          this.progress('Checking PRs for recorded uploads in the connected repository…');
          const items = await runWorkbenchJob({ kind: 'reviews', root: this.workspace() });
          for (const item of items.slice(0, 50)) {
            try { await reviewLibraryRelease(this.workspace(), item.directory, 'check', undefined, this.hooks.github); }
            catch { this.state.reviewQueueError = 'Some saved upload metadata could not be checked. Inspect the affected version and reconnect its recorded repository; known statuses are retained.'; }
          }
          if (items.length > 50) this.state.reviewQueueError = 'The first 50 versions were checked. Check additional versions individually to keep requests bounded.';
          await this.refreshReviews(); break;
        }
        case 'checkPullRequest': case 'createPullRequest': case 'requestReviewer': {
          if (message.action === 'requestReviewer' && payload.confirmed !== true) throw new Error('Select a reviewer and explicitly confirm the review request first.');
          if (message.action === 'createPullRequest' && string('reviewer') && payload.confirmed !== true) throw new Error('Explicitly confirm the selected reviewer before creating a PR with a review request.');
          this.state.busy = true; this.progress(message.action === 'checkPullRequest' ? 'Checking this recorded PR…' : message.action === 'createPullRequest' ? 'Finding or creating the PR for the existing upload…' : 'Requesting the selected eligible reviewer…');
          const reviewed = await reviewLibraryRelease(this.workspace(), string('directory'), message.action === 'checkPullRequest' ? 'check' : message.action === 'createPullRequest' ? 'create' : 'reviewer', string('reviewer'), this.hooks.github);
          if (this.state.receipt?.directory === string('directory')) { this.state.receipt.pr = reviewed.pr; this.state.receipt.cleanupError = reviewed.cleanupError; }
          await this.refreshReviews(); break;
        }
        case 'openPullRequest': {
          const { item, context } = libraryReviewContext(this.workspace(), string('directory'));
          if (!item.pr?.number) throw new Error('Check or create the recorded PR first.');
          await this.hooks.openLink?.(pullRequestUrl(context.repository, item.pr.number)); break;
        }
        case 'back':
          this.state.step = this.state.step === 'publish' ? 'check' : this.state.step === 'check' ? 'edit' : 'start'; this.state.form = undefined; break;
        case 'startAnother':
          this.state.step = 'start'; this.state.active = undefined; this.state.editor = undefined; this.state.files = []; this.state.form = undefined; this.state.check = undefined; this.state.publish = undefined; this.state.receipt = undefined; break;
        case 'openLink': {
          const url = string('url');
          const allowed = this.state.receipt && ['sourceUrl', 'packageUrl', 'changelogUrl', 'reviewUrl'].some(key => (this.state.receipt as Record<string, unknown>)[key] === url);
          if (!allowed || !/^https:\/\//.test(url)) throw new Error('Only verified publication links can be opened here.');
          await this.hooks.openLink?.(url); break;
        }
        default: throw new Error('This action is unavailable. Reopen the workbench to continue.');
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.state.error = friendlyError(detail);
    } finally {
      if (reviewMode && ['loadReviewers', 'checkPullRequest', 'createPullRequest', 'requestReviewer', 'openPullRequest', 'connectGitHub'].includes(message.action)) this.state.form = { mode: 'reviews' };
      this.state.busy = false; this.state.progress = undefined; this.state.waitingForInput = false;
      if (this.state.skillsLoaded && ['openRepositorySkill', 'createSkill', 'openPackage', 'openPackagePath', 'openFolder', 'restoreVersion', 'savePackage', 'publish', 'checkPullRequests', 'checkPullRequest', 'createPullRequest', 'requestReviewer'].includes(message.action)) this.state.skillsStale = true;
    }
    return this.state;
  }
}

function friendlyError(detail: string): string {
  if (/Remote branch .*not found|could not determine.*default|default branch/i.test(detail)) return 'The repository’s starting branch could not be confirmed. Reconnect this repository below; you do not need to enter a branch name. Your draft is safe.';
  if (/timed out|timeout/i.test(detail)) return 'Git did not finish in time. Your draft and prepared files are safe. Check your connection, then retry publishing.';
  if (/authentication|permission denied|could not read Username|repository not found/i.test(detail)) return 'Git could not access this repository. Check that your GitHub account has access, then reconnect and retry. Your draft is safe.';
  return detail.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[redacted]@').slice(0, 1800);
}

function receiptFor(result: Awaited<ReturnType<typeof publishGuidedSkill>>): NonNullable<GuidedState['receipt']> {
  const { release, publication } = result;
  const receipt: NonNullable<GuidedState['receipt']> = { name: release.skillName, version: release.version, directory: release.directory, commit: publication.commit, branch: publication.branch, cleanupError: result.cleanupError, note: 'Uploaded for repository review. The source, package and changelog are on the review branch; merge status is not tracked by this workbench.' };
  try {
    const ssh = /^git@([^:]+):(.+)$/.exec(publication.repository);
    const repo = new URL(ssh ? `https://${ssh[1]}/${ssh[2]}` : publication.repository);
    if (repo.protocol !== 'https:' || repo.username || repo.password) return receipt;
    const base = `${repo.origin}${repo.pathname.replace(/\.git\/?$/, '').replace(/\/$/, '')}`;
    const ref = encodeURIComponent(publication.branch), prefix = `${encodeURIComponent(release.skillName)}/${encodeURIComponent(release.version)}`;
    receipt.sourceUrl = `${base}/tree/${ref}/${prefix}/source/${encodeURIComponent(release.skillName)}`;
    receipt.packageUrl = `${base}/blob/${ref}/${prefix}/${encodeURIComponent(path.basename(release.packagePath))}`;
    receipt.changelogUrl = `${base}/blob/${ref}/${prefix}/CHANGELOG.md`;
    receipt.reviewUrl = `${base}/tree/${ref}`;
  } catch { /* Local bare repositories have no web links. */ }
  return receipt;
}
