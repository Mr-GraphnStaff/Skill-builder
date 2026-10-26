import * as fs from 'node:fs';
import * as path from 'node:path';
import { importSkillPackage, registerSkillFolder, listWorkbenchSkills, validateWorkbenchSkill, WorkbenchSkill } from './skill-workbench.js';
import { listLibraryReleases, restoreLibraryRelease, suggestReleaseVersion } from './workbench-library.js';
import { listRepositoryChoices, createGitHubRepository } from './repository-publisher.js';
import { connectWorkspaceRepository, getWorkspaceConnection, migrateAssociation, createGuidedSkill, listGuidedFiles, readGuidedFile, writeGuidedFile, copyGuidedFile, saveGuidedRecovery, publishGuidedSkill } from './guided-workspace.js';
import { checkSkillCompatibility } from './skill-compatibility.js';
import { GuidedState, GuidedMessage, SkillTarget } from './guided-contract.js';

export type GuidedHooks = {
  pickPackage?(): Promise<string | undefined>;
  pickFolder?(): Promise<string | undefined>;
  pickFile?(): Promise<string | undefined>;
  chooseWorkspace?(): Promise<string | undefined>;
  openLink?(url: string): Promise<void>;
  onState?(state: GuidedState): void;
};

export class GuidedWorkbenchController {
  private pending: Promise<void> = Promise.resolve();
  state: GuidedState = { step: 'start', hasWorkspace: false, repositories: [], drafts: [], library: [], files: [], target: 'portable' };
  constructor(private root: string | undefined, private hooks: GuidedHooks = {}) { this.state.hasWorkspace = !!root; }
  private workspace(): string { if (!this.root) throw new Error('Choose a local folder for your skill work before continuing.'); return this.root; }
  private active(): WorkbenchSkill {
    const skill = listWorkbenchSkills(this.workspace()).find(item => item.id === this.state.active?.id);
    if (!skill) throw new Error('Choose a draft to continue editing. Your saved files have not been removed.');
    return skill;
  }
  private refresh() {
    if (!this.root) return;
    this.state.hasWorkspace = true;
    try { this.state.connection = getWorkspaceConnection(this.root); }
    catch { this.state.connection = undefined; this.state.notice = 'Your repository connection needs reconnecting. Saved drafts are still available.'; }
    this.state.drafts = listWorkbenchSkills(this.root).map(({ id, name }) => ({ id, name }));
    try {
      this.state.library = listLibraryReleases(this.root).map(({ skillName, version, directory, status }) => ({ skillName, version, directory, status }));
      this.state.libraryError = undefined;
    } catch { this.state.libraryError = 'A saved version could not be verified. Your drafts are still available.'; this.state.library = []; }
  }
  private select(skill: WorkbenchSkill) {
    this.state.active = { id: skill.id, name: skill.name };
    this.state.files = listGuidedFiles(skill);
    this.state.editor = { path: 'SKILL.md', content: readGuidedFile(skill, 'SKILL.md') };
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
        this.state.files = listGuidedFiles(skill);
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
      writeGuidedFile(skill, message.editorPath, content);
      this.state.check = undefined;
      this.state.editor.content = content;
      this.state.files = listGuidedFiles(skill);
    }
  }
  private check() {
    const skill = this.active();
    const result = validateWorkbenchSkill(skill);
    const fileFinding = (message: string) => {
      const file = this.state.files.find(entry => message.startsWith(`${entry.path}:`))?.path;
      return { message, ...(file ? { file } : {}) };
    };
    let compatibility: ReturnType<typeof checkSkillCompatibility>;
    try { compatibility = checkSkillCompatibility(skill, this.state.target); }
    catch { compatibility = { warnings: [], compatibility: 'Correct the file errors before compatibility can be checked.', behaviorNote: 'No AI model was run.' }; }
    this.state.check = { valid: result.valid, errors: result.errors.map(fileFinding), warnings: [...result.warnings.map(fileFinding), ...compatibility.warnings], compatibility: compatibility.compatibility, behaviorNote: compatibility.behaviorNote };
    this.state.step = 'check';
    return result.valid;
  }
  private progress(message: string) { this.state.progress = message; this.hooks.onState?.(this.state); }
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
    const string = (key: string, fallback = '') => typeof payload[key] === 'string' ? payload[key] as string : fallback;
    this.state.error = undefined; this.state.notice = undefined;
    try {
      if (message.action !== 'reloadFile') this.buffer(message);
      this.state.form = Object.fromEntries(Object.entries(payload).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
      switch (message.action) {
        case 'ready': case 'refresh': {
          this.refresh();
          if (this.root && !this.state.connection) {
            this.state.busy = true; this.progress('Checking your existing repository connection…');
            await migrateAssociation(this.root);
          }
          break;
        }
        case 'chooseWorkspace': {
          const root = await this.hooks.chooseWorkspace?.(); if (root) { this.root = root; this.refresh(); }
          break;
        }
        case 'discoverRepositories':
          this.state.busy = true; this.progress('Finding repositories you can connect…');
          this.state.repositories = await listRepositoryChoices(this.workspace()); break;
        case 'connectRepository':
          this.state.busy = true; this.progress('Connecting and checking the repository’s default branch…');
          this.state.connection = await connectWorkspaceRepository(this.workspace(), string('repository'));
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
          const file = await this.hooks.pickPackage?.(); if (file) this.select(importSkillPackage(file, this.workspace())); break;
        }
        case 'openFolder': {
          const folder = await this.hooks.pickFolder?.(); if (folder) this.select(registerSkillFolder(this.workspace(), folder)); break;
        }
        case 'resume': {
          const skill = listWorkbenchSkills(this.workspace()).find(item => item.id === string('id'));
          if (!skill) throw new Error('That draft is no longer active. Refresh to see saved drafts.');
          this.select(skill); break;
        }
        case 'restoreVersion': this.select(restoreLibraryRelease(this.workspace(), string('directory'))); break;
        case 'openFile': {
          const skill = this.active(); const relative = string('path');
          const file = listGuidedFiles(skill).find(item => item.path === relative);
          if (!file) throw new Error('Choose a file belonging to this skill.');
          this.state.editor = { path: relative, content: file.text ? readGuidedFile(skill, relative) : 'This binary file is preserved in full. Use your normal desktop application to edit it.', readOnly: !file.text };
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
          const relative = string('path', `references/${path.basename(file)}`);
          const skill = this.active();
          copyGuidedFile(skill, relative, file);
          this.state.files = listGuidedFiles(skill); break;
        }
        case 'save': this.state.notice = 'Saved locally.'; break;
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
        case 'check': this.check(); break;
        case 'edit': this.state.step = 'edit'; break;
        case 'preparePublish': {
          if (!this.check()) break;
          if (!this.state.connection) { this.state.error = 'Connect your repository below before publishing.'; this.state.step = 'publish'; }
          else this.state.step = 'publish';
          const skill = this.active();
          const versions = listLibraryReleases(this.workspace(), skill.name);
          const inventory = validateWorkbenchSkill(skill).files;
          const matching = versions.find(item => {
            if (item.status !== 'prepared') return false;
            const manifest = JSON.parse(fs.readFileSync(path.join(item.directory, 'release.json'), 'utf8'));
            return JSON.stringify(manifest.files) === JSON.stringify(inventory);
          });
          this.state.publish = { version: matching?.version ?? suggestReleaseVersion(skill, versions.map(item => item.version)), changelog: matching ? fs.readFileSync(path.join(matching.directory, 'CHANGELOG.md'), 'utf8').trim() : '', repository: this.state.connection?.repository, fileCount: listGuidedFiles(skill).length };
          break;
        }
        case 'publish': {
          if (this.state.step !== 'publish') throw new Error('Check this skill and review the publication screen first.');
          const version = string('version', this.state.publish?.version ?? '');
          const changelog = string('changelog');
          this.state.publish = { version, changelog, repository: this.state.connection?.repository, fileCount: this.state.files.length };
          if (!this.state.connection) throw new Error('Connect your repository before publishing.');
          if (!this.check()) break;
          this.state.step = 'publish';
          this.state.busy = true; this.progress('Checking and packaging this version…');
          const result = await publishGuidedSkill(this.workspace(), this.active().id, version, changelog, message => this.progress(message));
          this.state.receipt = receiptFor(result);
          this.state.step = 'done'; this.state.editor = undefined; this.state.files = []; this.state.active = undefined; break;
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
      this.state.busy = false; this.state.progress = undefined;
      try { this.refresh(); } catch { this.state.error ??= 'Saved work could not be listed. Keep the workspace and try reopening the workbench.'; }
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
  const receipt: NonNullable<GuidedState['receipt']> = { name: release.skillName, version: release.version, commit: publication.commit, branch: publication.branch, cleanupError: result.cleanupError, note: 'Uploaded for repository review. The source, package and changelog are on the review branch; merge status is not tracked by this workbench.' };
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
