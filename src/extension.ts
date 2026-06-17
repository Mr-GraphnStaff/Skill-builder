import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import * as vscode from 'vscode';

type SkillSummary = {
  directoryName: string;
  skillPath: string;
  manifestPath: string;
  name: string;
  description?: string;
};

type TargetSurface = 'portable' | 'claude-ai' | 'claude-code' | 'claude-api';

type InteractiveSkillInput = {
  name?: string;
  description?: string;
  targetSurface?: TargetSurface;
  skillType?: string;
  idea?: string;
  triggerContexts?: string;
  shouldNotTrigger?: string;
  inputsToGather?: string;
  workflowSteps?: string;
  workflowModules?: string;
  edgeCases?: string;
  qualityChecks?: string;
  outputStandard?: string;
  examplesAndMaterials?: string;
  supportingFilesPlan?: string;
  referenceFiles?: string;
  referenceUploadPaths?: string[];
  scriptPlan?: string;
  scriptFiles?: string;
  scriptUploadPaths?: string[];
  assetFiles?: string;
  assetUploadPaths?: string[];
  evalPrompts?: string;
  targetNotes?: string;
  externalSystems?: string;
  securityNotes?: string;
  createCreationPlan?: boolean;
  createPromptFile?: boolean;
};

type SupportingFileTarget = 'references' | 'scripts' | 'assets';

type WorkflowModuleSpec = {
  order: number;
  slug: string;
  title: string;
  description: string;
  fileName: string;
};

type CreatedSupportingFiles = {
  workflowModules: WorkflowModuleSpec[];
  uploadedReferences: string[];
  uploadedScripts: string[];
  uploadedAssets: string[];
};

type SkillHealthSeverity = 'pass' | 'warn' | 'fail';

type SkillHealthFinding = {
  severity: SkillHealthSeverity;
  message: string;
  detail?: string;
};

type SkillFileSummary = {
  name: string;
  relativePath: string;
  size: number;
};

type SkillEditorData = {
  manifest: string;
  frontmatter: Record<string, string>;
  modules: WorkflowModuleSpec[];
  references: SkillFileSummary[];
  scripts: SkillFileSummary[];
  assets: SkillFileSummary[];
  evalsRaw?: string;
  evalsSummary: string;
};

type SkillQuickPickItem = vscode.QuickPickItem & {
  skill?: SkillSummary;
  browse?: boolean;
};

const RESERVED_SKILL_NAMES = new Set(['anthropic', 'claude']);

export function activate(context: vscode.ExtensionContext) {
  const provider = new SkillTreeProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('skillBuilder.skillsView', provider),
    vscode.commands.registerCommand('skillBuilder.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('skillBuilder.openSkill', async (item?: SkillItem) => {
      const skill = item?.skill ?? await pickSkill(provider);
      if (!skill) {
        return;
      }
      await vscode.window.showTextDocument(vscode.Uri.file(skill.manifestPath));
    }),
    vscode.commands.registerCommand('skillBuilder.createSkill', async () => {
      const skill = await createSkill();
      if (!skill) {
        return;
      }
      provider.refresh();
      await vscode.window.showTextDocument(vscode.Uri.file(skill.manifestPath));
    }),
    vscode.commands.registerCommand('skillBuilder.openInteractiveBuilder', async () => {
      await openInteractiveBuilder(context, provider);
    }),
    vscode.commands.registerCommand('skillBuilder.openSkillEditor', async (item?: SkillItem) => {
      const skill = item?.skill ?? await pickSkill(provider);
      if (!skill) {
        return;
      }

      await openSkillEditor(context, provider, skill);
    }),
    vscode.commands.registerCommand('skillBuilder.copyChatPrompt', async (item?: SkillItem) => {
      const skill = item?.skill;
      const prompt = buildChatPrompt(skill);
      await vscode.env.clipboard.writeText(prompt);

      const action = await vscode.window.showInformationMessage(
        skill
          ? `Copied a skill revision chat prompt for ${skill.name}.`
          : 'Copied a free-form Claude skill authoring prompt.',
        'Open Prompt'
      );

      if (action === 'Open Prompt') {
        const document = await vscode.workspace.openTextDocument({
          content: prompt,
          language: 'markdown'
        });
        await vscode.window.showTextDocument(document);
      }
    }),
    vscode.commands.registerCommand('skillBuilder.packageSkill', async (item?: SkillItem) => {
      const skill = item?.skill ?? await pickSkill(provider);
      if (!skill) {
        return;
      }
      const zipPath = await packageSkill(skill);
      if (zipPath) {
        const action = await vscode.window.showInformationMessage(
          `Packaged ${skill.name} to ${zipPath} for Claude upload.`,
          'Reveal ZIP',
          'Copy ZIP Path'
        );

        if (action === 'Reveal ZIP') {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(zipPath));
        } else if (action === 'Copy ZIP Path') {
          await vscode.env.clipboard.writeText(zipPath);
        }
      }
    }),
    vscode.commands.registerCommand('skillBuilder.addSupportingFiles', async (item?: SkillItem) => {
      const skill = item?.skill ?? await pickSkill(provider);
      if (!skill) {
        return;
      }

      const copiedFiles = await addSupportingFiles(skill);
      if (copiedFiles.length > 0) {
        provider.refresh();
        const action = await vscode.window.showInformationMessage(
          `Added ${copiedFiles.length} supporting file${copiedFiles.length === 1 ? '' : 's'} to ${skill.name}.`,
          'Open Folder'
        );

        if (action === 'Open Folder') {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(copiedFiles[0]));
        }
      }
    }),
    vscode.commands.registerCommand('skillBuilder.syncToClaudeCode', async (item?: SkillItem) => {
      const skill = item?.skill ?? await pickSkill(provider);
      if (!skill) {
        return;
      }

      const syncedPath = await syncToClaudeCode(skill);
      if (syncedPath) {
        const action = await vscode.window.showInformationMessage(
          `Synced ${skill.name} to Claude Code at ${syncedPath}.`,
          'Reveal Folder',
          'Copy Path'
        );

        if (action === 'Reveal Folder') {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(syncedPath));
        } else if (action === 'Copy Path') {
          await vscode.env.clipboard.writeText(syncedPath);
        }
      }
    }),
    vscode.commands.registerCommand('skillBuilder.importSkillFromGit', async (item?: SkillItem) => {
      await importSkillFromGit(context, provider, item?.skill);
    }),
    vscode.commands.registerCommand('skillBuilder.publishSkillToGit', async (item?: SkillItem) => {
      const skill = item?.skill ?? await pickSkill(provider);
      if (!skill) {
        return;
      }

      await publishSkillToGit(context, skill);
    }),
    vscode.commands.registerCommand('skillBuilder.validateSkill', async (item?: SkillItem) => {
      const skill = item?.skill ?? await pickSkill(provider);
      if (!skill) {
        return;
      }
      validateSkill(skill);
    }),
    vscode.commands.registerCommand('skillBuilder.healthCheck', async (item?: SkillItem) => {
      const skill = item?.skill ?? await pickSkill(provider);
      if (!skill) {
        return;
      }

      await showSkillHealthCheck(skill);
    })
  );
}

export function deactivate() {
  // VS Code disposes registered commands and providers through context subscriptions.
}

class SkillTreeProvider implements vscode.TreeDataProvider<SkillItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<SkillItem | undefined | void>();

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  refresh() {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: SkillItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<SkillItem[]> {
    const root = await getProjectRoot();
    if (!root) {
      return [];
    }

    const skills = await readSkills(root);
    return skills.map((skill) => new SkillItem(skill));
  }
}

class SkillItem extends vscode.TreeItem {
  constructor(readonly skill: SkillSummary) {
    super(skill.name, vscode.TreeItemCollapsibleState.None);

    this.id = skill.skillPath;
    this.description = skill.directoryName === skill.name ? undefined : skill.directoryName;
    this.tooltip = skill.description ? `${skill.name}\n${skill.description}` : skill.manifestPath;
    this.contextValue = 'skill';
    this.resourceUri = vscode.Uri.file(skill.manifestPath);
    this.command = {
      command: 'skillBuilder.openSkill',
      title: 'Open Skill',
      arguments: [this]
    };
  }
}

async function pickSkill(provider: SkillTreeProvider): Promise<SkillSummary | undefined> {
  const items = await provider.getChildren();
  const browsePick: SkillQuickPickItem = {
    label: '$(folder-opened) Browse for SKILL.md or skill folder...',
    description: 'Open any Claude skill on this machine',
    detail: 'Use this when the skill is outside the configured workspace skills directory.',
    browse: true
  };

  if (items.length === 0) {
    const action = await vscode.window.showQuickPick<SkillQuickPickItem>(
      [browsePick],
      { placeHolder: 'No configured workspace skills found. Browse for an existing skill.' }
    );

    return action?.browse ? browseForSkill() : undefined;
  }

  const skillPicks: SkillQuickPickItem[] = items.map((item) => ({
    label: item.skill.name,
    description: item.skill.directoryName,
    detail: item.skill.description,
    skill: item.skill
  }));

  const picked = await vscode.window.showQuickPick<SkillQuickPickItem>(
    [
      ...skillPicks,
      browsePick
    ],
    { placeHolder: 'Select a skill or browse for one' }
  );

  if (!picked) {
    return undefined;
  }

  return picked.browse ? browseForSkill() : picked.skill;
}

async function browseForSkill(): Promise<SkillSummary | undefined> {
  const picked = await vscode.window.showOpenDialog({
    title: 'Open Claude Skill',
    canSelectFiles: true,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Open Skill'
  });

  if (!picked || picked.length === 0) {
    return undefined;
  }

  const selectedPath = picked[0].fsPath;
  const selectedName = path.basename(selectedPath);
  const skillPath = selectedName.toLowerCase() === 'skill.md'
    ? path.dirname(selectedPath)
    : selectedPath;

  const skill = await readSkill(skillPath);
  if (!skill) {
    vscode.window.showErrorMessage('Selected path is not a Claude skill folder. Choose a folder containing SKILL.md or choose SKILL.md directly.');
    return undefined;
  }

  return skill;
}

async function openInteractiveBuilder(context: vscode.ExtensionContext, provider: SkillTreeProvider) {
  const selectedFiles: Record<SupportingFileTarget, string[]> = {
    references: [],
    scripts: [],
    assets: []
  };

  const panel = vscode.window.createWebviewPanel(
    'skillBuilder.interactiveBuilder',
    'Claude Skill Builder',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  panel.webview.html = buildInteractiveBuilderHtml(panel.webview, context.extensionUri);

  panel.webview.onDidReceiveMessage(async (message: {
    command?: string;
    payload?: InteractiveSkillInput;
    target?: SupportingFileTarget;
  }) => {
    if (message.command === 'pickSupportingFiles') {
      if (!isSupportingFileTarget(message.target)) {
        await panel.webview.postMessage({
          command: 'createError',
          message: 'Choose references, scripts, or assets before adding files.'
        });
        return;
      }

      const files = await vscode.window.showOpenDialog({
        title: `Add files to ${message.target}`,
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
        openLabel: `Add to ${message.target}`
      });

      if (!files || files.length === 0) {
        return;
      }

      selectedFiles[message.target] = [
        ...selectedFiles[message.target],
        ...files.map((file) => file.fsPath)
      ];

      await panel.webview.postMessage({
        command: 'supportingFilesPicked',
        target: message.target,
        files: selectedFiles[message.target].map((filePath) => path.basename(filePath))
      });
      return;
    }

    if (message.command !== 'createSkill') {
      return;
    }

    const root = await getProjectRoot();
    if (!root) {
      await panel.webview.postMessage({
        command: 'createError',
        message: 'Open a workspace folder before creating a skill.'
      });
      vscode.window.showErrorMessage('Open a workspace folder before creating a skill.');
      return;
    }

    try {
      const skill = await createSkillFromOptions(root, {
        ...(message.payload ?? {}),
        referenceUploadPaths: selectedFiles.references,
        scriptUploadPaths: selectedFiles.scripts,
        assetUploadPaths: selectedFiles.assets
      });
      if (!skill) {
        await panel.webview.postMessage({
          command: 'createError',
          message: 'Skill creation was cancelled or failed validation.'
        });
        return;
      }

      provider.refresh();
      await panel.webview.postMessage({
        command: 'created',
        skillName: skill.name,
        skillPath: skill.skillPath,
        manifestPath: skill.manifestPath
      });

      const action = await vscode.window.showInformationMessage(
        `Created ${skill.name} from the interactive builder.`,
        'Open SKILL.md',
        'Package ZIP',
        'Sync to Claude Code'
      );

      if (action === 'Open SKILL.md') {
        await vscode.window.showTextDocument(vscode.Uri.file(skill.manifestPath));
      } else if (action === 'Package ZIP') {
        const zipPath = await packageSkill(skill);
        if (zipPath) {
          vscode.window.showInformationMessage(`Packaged ${skill.name} to ${zipPath}.`);
        }
      } else if (action === 'Sync to Claude Code') {
        const syncedPath = await syncToClaudeCode(skill);
        if (syncedPath) {
          vscode.window.showInformationMessage(`Synced ${skill.name} to ${syncedPath}.`);
        }
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      await panel.webview.postMessage({ command: 'createError', message: messageText });
      vscode.window.showErrorMessage(messageText);
    }
  });
}

function buildInteractiveBuilderHtml(webview: vscode.Webview, _extensionUri: vscode.Uri): string {
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Claude Skill Builder</title>
  <style>
    :root {
      color-scheme: light dark;
      --gap: 14px;
    }

    body {
      margin: 0;
      padding: 24px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    main {
      max-width: 980px;
      margin: 0 auto;
    }

    h1 {
      margin: 0 0 8px;
      font-size: 24px;
      font-weight: 650;
    }

    .subtle {
      margin: 0 0 22px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
    }

    form {
      display: grid;
      gap: 18px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--gap);
    }

    .field {
      display: grid;
      gap: 6px;
    }

    label {
      font-weight: 600;
    }

    input,
    select,
    textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--vscode-input-border, transparent);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border-radius: 4px;
      padding: 8px 10px;
      font: inherit;
    }

    textarea {
      min-height: 84px;
      resize: vertical;
      line-height: 1.45;
    }

    textarea.large {
      min-height: 180px;
    }

    .hint,
    .counter {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.35;
    }

    .picker-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .file-list {
      min-height: 20px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.45;
    }

    .file-list span {
      display: inline-block;
      margin: 0 6px 6px 0;
      padding: 2px 6px;
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      color: var(--vscode-foreground);
      background: var(--vscode-editorWidget-background);
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      padding-top: 4px;
    }

    button {
      border: 0;
      border-radius: 4px;
      padding: 8px 12px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      font: inherit;
      cursor: pointer;
    }

    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .status {
      min-height: 20px;
      color: var(--vscode-descriptionForeground);
    }

    .status.error {
      color: var(--vscode-errorForeground);
    }

    .status.success {
      color: var(--vscode-terminal-ansiGreen);
    }

    @media (max-width: 760px) {
      body {
        padding: 16px;
      }

      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>Interactive Claude Skill Builder</h1>
    <p class="subtle">Describe the workflow naturally, add only the structure you already know, and the extension will create a workbench brief plus a starter Anthropic-compatible skill folder.</p>

    <form id="builder-form">
      <div class="field">
        <label for="idea">Free-form skill idea</label>
        <textarea id="idea" class="large" required placeholder="Example: I need a skill that turns messy Jira security architecture updates into a weekly executive-ready status report. It should use our preferred sections, flag blockers, and create copy I can paste into Confluence."></textarea>
        <div class="hint">This is the main input. Write it like chat, not like a form.</div>
      </div>

      <div class="grid">
        <div class="field">
          <label for="name">Skill name</label>
          <input id="name" placeholder="auto-generated-kebab-case">
          <div class="hint">Lowercase kebab-case. Leave blank to infer from the idea.</div>
        </div>

        <div class="field">
          <label for="targetSurface">Target surface</label>
          <select id="targetSurface">
            <option value="portable">Portable Anthropic skill</option>
            <option value="claude-ai">Claude.ai</option>
            <option value="claude-code">Claude Code</option>
            <option value="claude-api">Claude API</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label for="description">Trigger description</label>
        <input id="description" maxlength="1024" placeholder="What it does. Use when the user asks for...">
        <div class="counter" id="descriptionCounter">0 / 1024</div>
      </div>

      <div class="grid">
        <div class="field">
          <label for="skillType">Skill type</label>
          <select id="skillType">
            <option value="">Not sure yet</option>
            <option value="task">Task workflow</option>
            <option value="reference">Reference / standards</option>
            <option value="tool/MCP">Tool or MCP workflow</option>
            <option value="file production">File production</option>
            <option value="reviewer/evaluator">Reviewer / evaluator</option>
          </select>
        </div>

        <div class="field">
          <label for="triggerContexts">Should trigger when</label>
          <textarea id="triggerContexts" placeholder="One per line: weekly status report, WSR, Jira sprint update, executive summary"></textarea>
        </div>
      </div>

      <div class="grid">
        <div class="field">
          <label for="shouldNotTrigger">Should not trigger when</label>
          <textarea id="shouldNotTrigger" placeholder="One per line: generic Jira questions, unrelated status reports"></textarea>
        </div>

        <div class="field">
          <label for="inputsToGather">Inputs to gather</label>
          <textarea id="inputsToGather" placeholder="One per line: source tickets, target audience, reporting period, output format"></textarea>
        </div>
      </div>

      <div class="field">
        <label for="workflowSteps">Workflow steps Claude should follow</label>
        <textarea id="workflowSteps" placeholder="One per line: inspect source material, identify gaps, draft output, validate against rubric, package result"></textarea>
        <div class="hint">This becomes the core procedure in SKILL.md instead of generic placeholder steps.</div>
      </div>

      <div class="field">
        <label for="workflowModules">Workflow modules / ordered callout docs</label>
        <textarea id="workflowModules" placeholder="One per line: intake: gather source files and assumptions&#10;analysis-rules: inspect references and classify issues&#10;output-format: apply final structure and quality bar"></textarea>
        <div class="hint">Creates ordered <code>references/01-*.md</code> files and adds ordered callouts to <code>SKILL.md</code>.</div>
      </div>

      <div class="grid">
        <div class="field">
          <label for="edgeCases">Edge cases and decision points</label>
          <textarea id="edgeCases" placeholder="One per line: missing inputs, conflicting examples, unsafe external access, ambiguous target audience"></textarea>
        </div>

        <div class="field">
          <label for="qualityChecks">Quality checks</label>
          <textarea id="qualityChecks" placeholder="One per line: description is trigger-specific, output follows template, no secrets, all file references exist"></textarea>
        </div>
      </div>

      <div class="field">
        <label for="outputStandard">Output standard</label>
        <textarea id="outputStandard" placeholder="What a good result looks like, including structure, tone, files, validation checks, or examples of success."></textarea>
      </div>

      <div class="field">
        <label for="examplesAndMaterials">Examples and source materials</label>
        <textarea id="examplesAndMaterials" placeholder="Mention templates, examples, assets, policies, schemas, or files you plan to add later."></textarea>
      </div>

      <div class="grid">
        <div class="field">
          <label for="supportingFilesPlan">References, assets, and progressive disclosure plan</label>
          <textarea id="supportingFilesPlan" placeholder="One per line: references/brand-rules.md for style, assets/template.docx for output, scripts/validate.py for deterministic checks"></textarea>
        </div>

        <div class="field">
          <label for="scriptPlan">Script plan</label>
          <textarea id="scriptPlan" placeholder="One per line: no scripts needed, or scripts must be non-interactive, expose --help, output JSON/CSV/TSV, and avoid runtime installs"></textarea>
        </div>
      </div>

      <div class="grid">
        <div class="field">
          <label for="referenceFiles">Reference files to create</label>
          <textarea id="referenceFiles" placeholder="One per line: brand-rules.md: style rules Claude should read only when needed"></textarea>
          <div class="hint">Creates Markdown files under <code>references/</code>.</div>
        </div>

        <div class="field">
          <label for="scriptFiles">Script stubs to create</label>
          <textarea id="scriptFiles" placeholder="One per line: validate-output.py: validate required sections and output JSON"></textarea>
          <div class="hint">Creates non-interactive starter scripts under <code>scripts/</code>.</div>
        </div>
      </div>

      <div class="field">
        <label for="assetFiles">Asset placeholders to create</label>
        <textarea id="assetFiles" placeholder="One per line: WSR_Template_Blank.docx: user will replace this placeholder with the real template"></textarea>
        <div class="hint">Creates asset notes under <code>assets/</code>. Binary files still need to be copied in manually.</div>
      </div>

      <div class="field">
        <label>Import existing supporting files</label>
        <div class="picker-row">
          <button class="secondary" type="button" data-pick-target="references">Add Reference Files</button>
          <button class="secondary" type="button" data-pick-target="scripts">Add Script Files</button>
          <button class="secondary" type="button" data-pick-target="assets">Add Asset Files</button>
        </div>
        <div class="file-list" id="referencesUploadList"></div>
        <div class="file-list" id="scriptsUploadList"></div>
        <div class="file-list" id="assetsUploadList"></div>
      </div>

      <div class="field">
        <label for="evalPrompts">Evaluation prompts</label>
        <textarea id="evalPrompts" placeholder="One per line: happy path prompt, incomplete input prompt, should-not-trigger prompt, edge case prompt"></textarea>
      </div>

      <div class="field">
        <label for="targetNotes">Target-surface notes</label>
        <textarea id="targetNotes" placeholder="Claude.ai: keep description under 200 chars and ZIP skill folder. Claude Code: optional allowed-tools/context fields. API: no network or runtime installs."></textarea>
      </div>

      <div class="field">
        <label for="externalSystems">External systems or MCP dependencies</label>
        <textarea id="externalSystems" placeholder="Example: Jira MCP required for ticket reads and comments; no direct API keys in the skill."></textarea>
      </div>

      <div class="field">
        <label for="securityNotes">Security and trust notes</label>
        <textarea id="securityNotes" placeholder="Example: never hardcode tokens, review third-party scripts, prefer MCP permissions, avoid fetching untrusted remote content."></textarea>
      </div>

      <label>
        <input id="createCreationPlan" type="checkbox" checked>
        Also write <code>workbench/&lt;skill-name&gt;/creation-plan.md</code> with an Anthropic-aligned authoring checklist
      </label>

      <label>
        <input id="createPromptFile" type="checkbox" checked>
        Also write <code>workbench/&lt;skill-name&gt;/authoring-prompt.md</code>
      </label>

      <div class="actions">
        <button type="submit">Create Skill Draft</button>
        <button class="secondary" id="fillDescription" type="button">Infer Name And Description</button>
        <span class="status" id="status"></span>
      </div>
    </form>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const form = document.getElementById('builder-form');
    const status = document.getElementById('status');
    const idea = document.getElementById('idea');
    const nameInput = document.getElementById('name');
    const description = document.getElementById('description');
    const targetSurface = document.getElementById('targetSurface');
    const descriptionCounter = document.getElementById('descriptionCounter');
    let nameTouched = false;
    let descriptionTouched = false;

    function slugify(value) {
      return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
        .split('-')
        .slice(0, 6)
        .join('-')
        .slice(0, 64)
        .replace(/-+$/g, '');
    }

    function compact(value) {
      return value.replace(/\\s+/g, ' ').trim();
    }

    function shorten(value, max) {
      if (value.length <= max) {
        return value;
      }
      return value.slice(0, Math.max(0, max - 3)).trimEnd() + '...';
    }

    function inferredDescription() {
      const max = targetSurface.value === 'claude-ai' ? 200 : 1024;
      const slug = nameInput.value || slugify(idea.value) || 'this workflow';
      const title = slug.replace(/-/g, ' ');
      const base = compact(idea.value);
      if (!base) {
        return '';
      }
      return shorten('Support ' + title + ' workflows. Use when the user asks for ' + base, max);
    }

    function updateInferredFields(force = false) {
      if ((force || !nameTouched) && idea.value.trim()) {
        nameInput.value = slugify(idea.value);
      }

      if ((force || !descriptionTouched) && idea.value.trim()) {
        description.value = inferredDescription();
      }

      updateCounter();
    }

    function updateCounter() {
      const max = targetSurface.value === 'claude-ai' ? 200 : 1024;
      description.maxLength = max;
      descriptionCounter.textContent = description.value.length + ' / ' + max;
      descriptionCounter.style.color = description.value.length > max ? 'var(--vscode-errorForeground)' : '';
    }

    idea.addEventListener('input', () => updateInferredFields(false));
    nameInput.addEventListener('input', () => { nameTouched = true; });
    description.addEventListener('input', () => { descriptionTouched = true; updateCounter(); });
    targetSurface.addEventListener('change', () => {
      if (!descriptionTouched) {
        description.value = inferredDescription();
      }
      updateCounter();
    });

    document.getElementById('fillDescription').addEventListener('click', () => {
      updateInferredFields(true);
      nameTouched = true;
      descriptionTouched = true;
    });

    document.querySelectorAll('[data-pick-target]').forEach((button) => {
      button.addEventListener('click', () => {
        vscode.postMessage({
          command: 'pickSupportingFiles',
          target: button.dataset.pickTarget
        });
      });
    });

    function renderPickedFiles(target, files) {
      const list = document.getElementById(target + 'UploadList');
      if (!list) {
        return;
      }

      if (!files || files.length === 0) {
        list.textContent = '';
        return;
      }

      list.innerHTML = '<strong>' + target + ':</strong> ' + files
        .map((file) => '<span>' + file.replace(/[&<>"']/g, (character) => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[character])) + '</span>')
        .join('');
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      status.className = 'status';

      if (!idea.value.trim()) {
        status.textContent = 'Describe the skill idea before creating a draft.';
        status.classList.add('error');
        return;
      }

      updateInferredFields(false);

      status.textContent = 'Creating skill draft...';
      vscode.postMessage({
        command: 'createSkill',
        payload: {
          name: nameInput.value,
          description: description.value,
          targetSurface: targetSurface.value,
          skillType: document.getElementById('skillType').value,
          idea: idea.value,
          triggerContexts: document.getElementById('triggerContexts').value,
          shouldNotTrigger: document.getElementById('shouldNotTrigger').value,
          inputsToGather: document.getElementById('inputsToGather').value,
          workflowSteps: document.getElementById('workflowSteps').value,
          workflowModules: document.getElementById('workflowModules').value,
          edgeCases: document.getElementById('edgeCases').value,
          qualityChecks: document.getElementById('qualityChecks').value,
          outputStandard: document.getElementById('outputStandard').value,
          examplesAndMaterials: document.getElementById('examplesAndMaterials').value,
          supportingFilesPlan: document.getElementById('supportingFilesPlan').value,
          referenceFiles: document.getElementById('referenceFiles').value,
          scriptPlan: document.getElementById('scriptPlan').value,
          scriptFiles: document.getElementById('scriptFiles').value,
          assetFiles: document.getElementById('assetFiles').value,
          evalPrompts: document.getElementById('evalPrompts').value,
          targetNotes: document.getElementById('targetNotes').value,
          externalSystems: document.getElementById('externalSystems').value,
          securityNotes: document.getElementById('securityNotes').value,
          createCreationPlan: document.getElementById('createCreationPlan').checked,
          createPromptFile: document.getElementById('createPromptFile').checked
        }
      });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.command === 'created') {
        status.className = 'status success';
        status.textContent = 'Created ' + message.skillName + '.';
      } else if (message.command === 'createError') {
        status.className = 'status error';
        status.textContent = message.message;
      } else if (message.command === 'supportingFilesPicked') {
        renderPickedFiles(message.target, message.files);
      }
    });

    updateCounter();
  </script>
</body>
</html>`;
}

async function createSkill(): Promise<SkillSummary | undefined> {
  const root = await getProjectRoot();
  if (!root) {
    vscode.window.showErrorMessage('Open a workspace folder before creating a skill.');
    return undefined;
  }

  const skillName = await vscode.window.showInputBox({
    title: 'Create Claude Skill',
    prompt: 'Enter a kebab-case skill name.',
    placeHolder: 'customer-briefing',
    validateInput: validateSkillName
  });

  if (!skillName) {
    return undefined;
  }

  const targetSurface = await pickTargetSurface();
  if (!targetSurface) {
    return undefined;
  }

  const description = await vscode.window.showInputBox({
    title: 'Skill Description',
    prompt: targetSurface === 'claude-ai'
      ? 'Describe what the skill does and when Claude should use it. Keep this under 200 characters for Claude.ai.'
      : 'Describe what the skill does and when Claude should use it.',
    placeHolder: 'Create executive customer briefings. Use when the user asks for concise account, stakeholder, or meeting prep briefings.',
    validateInput: (value) => validateDescription(value, targetSurface)
  });

  return createSkillFromOptions(root, {
    name: skillName,
    description,
    targetSurface
  });
}

async function createSkillFromOptions(root: string, input: InteractiveSkillInput): Promise<SkillSummary | undefined> {
  const skillName = normalizeSkillName(input.name) || deriveSkillName(input.idea);
  const nameError = validateSkillName(skillName);
  if (nameError) {
    vscode.window.showErrorMessage(nameError);
    return undefined;
  }

  const targetSurface = normalizeTargetSurface(input.targetSurface);
  const description = normalizeDescription(input.description, skillName, input.idea, targetSurface);
  const descriptionError = validateDescription(description, targetSurface);
  if (descriptionError) {
    vscode.window.showErrorMessage(descriptionError);
    return undefined;
  }

  const skillPath = path.join(getSkillsDirectory(root), skillName);
  const manifestPath = path.join(skillPath, 'SKILL.md');

  if (await pathExists(skillPath)) {
    vscode.window.showErrorMessage(`Skill already exists: ${skillName}`);
    return undefined;
  }

  await fs.mkdir(path.join(skillPath, 'references'), { recursive: true });
  await fs.mkdir(path.join(skillPath, 'scripts'), { recursive: true });
  await fs.mkdir(path.join(skillPath, 'assets'), { recursive: true });
  await fs.mkdir(path.join(skillPath, 'evals'), { recursive: true });
  const createdSupportingFiles = await createSupportingFiles(skillPath, skillName, input);
  await fs.writeFile(manifestPath, buildSkillTemplate(skillName, description, targetSurface, input, createdSupportingFiles), 'utf8');
  await fs.writeFile(path.join(skillPath, 'evals', 'evals.json'), buildEvalTemplate(skillName, input), 'utf8');
  await writeBriefTemplate(root, skillName, description, targetSurface, input);

  if (input.createCreationPlan !== false) {
    const planPath = path.join(root, 'workbench', skillName, 'creation-plan.md');
    await fs.writeFile(planPath, buildCreationPlan(skillName, description, targetSurface, input), 'utf8');
  }

  if (input.createPromptFile) {
    const promptPath = path.join(root, 'workbench', skillName, 'authoring-prompt.md');
    await fs.writeFile(promptPath, buildChatPromptForInput(skillName, input), 'utf8');
  }

  return readSkill(skillPath);
}

async function createSupportingFiles(
  skillPath: string,
  skillName: string,
  input: InteractiveSkillInput
): Promise<CreatedSupportingFiles> {
  const created: CreatedSupportingFiles = {
    workflowModules: await createWorkflowModules(skillPath, input),
    uploadedReferences: [],
    uploadedScripts: [],
    uploadedAssets: []
  };

  for (const spec of parseSupportingFileSpecs(input.referenceFiles, '.md')) {
    const fileName = ensureExtension(spec.fileName, '.md');
    await fs.writeFile(
      path.join(skillPath, 'references', fileName),
      buildReferenceStub(fileName, spec.description),
      'utf8'
    );
  }

  for (const spec of parseSupportingFileSpecs(input.scriptFiles, '.py')) {
    const fileName = ensureScriptExtension(spec.fileName);
    await fs.writeFile(
      path.join(skillPath, 'scripts', fileName),
      buildScriptStub(fileName, spec.description),
      'utf8'
    );
  }

  const assetSpecs = parseSupportingFileSpecs(input.assetFiles, '.md');
  if (assetSpecs.length > 0) {
    await fs.writeFile(
      path.join(skillPath, 'assets', 'README.md'),
      buildAssetsReadme(skillName, assetSpecs),
      'utf8'
    );
  }

  created.uploadedReferences = await copyUploadedSupportingFiles(skillPath, 'references', input.referenceUploadPaths);
  created.uploadedScripts = await copyUploadedSupportingFiles(skillPath, 'scripts', input.scriptUploadPaths);
  created.uploadedAssets = await copyUploadedSupportingFiles(skillPath, 'assets', input.assetUploadPaths);

  if (created.uploadedReferences.length > 0) {
    await appendSupportingFileNotesForPath(skillPath, skillName, 'references', created.uploadedReferences);
  }

  if (created.uploadedScripts.length > 0) {
    await appendSupportingFileNotesForPath(skillPath, skillName, 'scripts', created.uploadedScripts);
  }

  if (created.uploadedAssets.length > 0) {
    await appendSupportingFileNotesForPath(skillPath, skillName, 'assets', created.uploadedAssets);
  }

  return created;
}

async function createWorkflowModules(
  skillPath: string,
  input: InteractiveSkillInput
): Promise<WorkflowModuleSpec[]> {
  const modules = parseWorkflowModules(input.workflowModules);

  for (const module of modules) {
    await fs.writeFile(
      path.join(skillPath, 'references', module.fileName),
      buildWorkflowModuleStub(module),
      'utf8'
    );
  }

  return modules;
}

async function copyUploadedSupportingFiles(
  skillPath: string,
  target: SupportingFileTarget,
  sourcePaths: string[] | undefined
): Promise<string[]> {
  const uniqueSourcePaths = Array.from(new Set(sourcePaths ?? []));
  if (uniqueSourcePaths.length === 0) {
    return [];
  }

  const targetDirectory = path.join(skillPath, target);
  await fs.mkdir(targetDirectory, { recursive: true });

  const copiedRelativePaths: string[] = [];
  for (const sourcePath of uniqueSourcePaths) {
    if (!await pathExists(sourcePath)) {
      continue;
    }

    const targetPath = await getUniqueChildPath(targetDirectory, path.basename(sourcePath));
    await fs.copyFile(sourcePath, targetPath);
    copiedRelativePaths.push(`${target}/${path.basename(targetPath)}`);
  }

  return copiedRelativePaths;
}

async function getUniqueChildPath(directory: string, fileName: string): Promise<string> {
  const parsed = path.parse(fileName);
  let candidate = path.join(directory, fileName);
  let counter = 2;

  while (await pathExists(candidate)) {
    candidate = path.join(directory, `${parsed.name}-${counter}${parsed.ext}`);
    counter += 1;
  }

  return candidate;
}

async function pickTargetSurface(): Promise<TargetSurface | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: 'portable Anthropic skill',
        description: 'Default',
        detail: 'No runtime network, package install, or product-specific frontmatter assumptions.',
        value: 'portable' as TargetSurface
      },
      {
        label: 'Claude.ai',
        detail: 'Use short descriptions and package as ZIP for upload.',
        value: 'claude-ai' as TargetSurface
      },
      {
        label: 'Claude Code',
        detail: 'Prepare for local filesystem discovery and optional /skill-name invocation.',
        value: 'claude-code' as TargetSurface
      },
      {
        label: 'Claude API',
        detail: 'Use conservative code execution assumptions; no network or runtime package install.',
        value: 'claude-api' as TargetSurface
      }
    ],
    { placeHolder: 'Choose the target surface for this skill' }
  );

  return picked?.value;
}

async function packageSkill(skill: SkillSummary): Promise<string | undefined> {
  const root = await getProjectRoot();
  if (!root) {
    vscode.window.showErrorMessage('Open a workspace folder before packaging a skill.');
    return undefined;
  }

  const distDirectory = getDistDirectory(root);
  const zipPath = path.join(distDirectory, `${skill.directoryName}.zip`);

  await fs.mkdir(distDirectory, { recursive: true });

  const zip = new AdmZip();
  zip.addLocalFolder(skill.skillPath, skill.directoryName);
  zip.writeZip(zipPath);

  return zipPath;
}

async function addSupportingFiles(skill: SkillSummary): Promise<string[]> {
  const target = await pickSupportingFileTarget();
  if (!target) {
    return [];
  }

  const files = await vscode.window.showOpenDialog({
    title: `Add files to ${skill.name}/${target}`,
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: true,
    openLabel: `Add to ${target}`
  });

  if (!files || files.length === 0) {
    return [];
  }

  const targetDirectory = path.join(skill.skillPath, target);
  await fs.mkdir(targetDirectory, { recursive: true });

  const copiedFiles: string[] = [];
  for (const file of files) {
    const sourcePath = file.fsPath;
    const targetPath = path.join(targetDirectory, path.basename(sourcePath));
    if (await pathExists(targetPath)) {
      const action = await vscode.window.showWarningMessage(
        `${path.basename(targetPath)} already exists in ${target}. Replace it?`,
        { modal: true },
        'Replace',
        'Skip'
      );

      if (action !== 'Replace') {
        continue;
      }
    }

    await fs.copyFile(sourcePath, targetPath);
    copiedFiles.push(targetPath);
  }

  if (copiedFiles.length > 0) {
    await appendSupportingFileNotes(skill, target, copiedFiles);
  }

  return copiedFiles;
}

async function pickSupportingFileTarget(): Promise<SupportingFileTarget | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: 'references',
        description: 'Docs, policies, examples, schemas, and style guides Claude reads on demand',
        target: 'references' as SupportingFileTarget
      },
      {
        label: 'scripts',
        description: 'Deterministic helpers that should be non-interactive and document --help',
        target: 'scripts' as SupportingFileTarget
      },
      {
        label: 'assets',
        description: 'Templates, images, sample files, and static resources',
        target: 'assets' as SupportingFileTarget
      }
    ],
    { placeHolder: 'Where should these files go?' }
  );

  return picked?.target;
}

function isSupportingFileTarget(value: unknown): value is SupportingFileTarget {
  return value === 'references' || value === 'scripts' || value === 'assets';
}

async function appendSupportingFileNotes(
  skill: SkillSummary,
  target: SupportingFileTarget,
  copiedFiles: string[]
) {
  await appendSupportingFileNotesForPath(skill.skillPath, skill.name, target, copiedFiles);
}

async function appendSupportingFileNotesForPath(
  skillPath: string,
  skillName: string,
  target: SupportingFileTarget,
  copiedFiles: string[]
) {
  const notesPath = path.join(skillPath, target, 'README.md');
  const lines = [
    `# ${titleFromName(target)}`,
    '',
    `Files in this directory are supporting ${target} for the \`${skillName}\` skill.`,
    '',
    '## Added Files',
    '',
    ...copiedFiles.map((file) => `- \`${path.basename(file)}\``),
    ''
  ];

  if (await pathExists(notesPath)) {
    await fs.appendFile(notesPath, `\n${lines.slice(4).join('\n')}`, 'utf8');
    return;
  }

  await fs.writeFile(notesPath, lines.join('\n'), 'utf8');
}

async function syncToClaudeCode(skill: SkillSummary): Promise<string | undefined> {
  const root = await getProjectRoot();
  if (!root) {
    vscode.window.showErrorMessage('Open a workspace folder before syncing a skill.');
    return undefined;
  }

  const claudeCodeSkillsDirectory = getClaudeCodeSkillsDirectory(root);
  const targetPath = path.join(claudeCodeSkillsDirectory, skill.directoryName);
  const targetExists = await pathExists(targetPath);

  if (targetExists) {
    const action = await vscode.window.showWarningMessage(
      `Syncing will replace the existing Claude Code skill at ${targetPath}.`,
      { modal: true },
      'Replace'
    );

    if (action !== 'Replace') {
      return undefined;
    }

    await fs.rm(targetPath, { recursive: true, force: true });
  }

  await fs.mkdir(claudeCodeSkillsDirectory, { recursive: true });
  await fs.cp(skill.skillPath, targetPath, { recursive: true, force: true });

  return targetPath;
}

async function importSkillFromGit(
  context: vscode.ExtensionContext,
  provider: SkillTreeProvider,
  skill?: SkillSummary
): Promise<void> {
  const root = await getProjectRoot();
  if (!root) {
    vscode.window.showErrorMessage('Open a workspace folder before importing a skill from Git.');
    return;
  }

  const skillName = skill?.directoryName ?? await vscode.window.showInputBox({
    title: 'Import/Update Skill from Git',
    prompt: 'Skill folder name to import or update',
    placeHolder: 'my-skill',
    validateInput: validateSkillName
  });

  if (!skillName) {
    return;
  }

  const repository = await vscode.window.showInputBox({
    title: 'Import/Update Skill from Git',
    prompt: 'Optional Git repository URL or local path. Leave blank to use skill-builder.config.json git.remote, or origin.',
    placeHolder: 'https://github.com/owner/repo.git'
  });

  if (repository === undefined) {
    return;
  }

  const branch = await vscode.window.showInputBox({
    title: 'Import/Update Skill from Git',
    prompt: 'Optional branch, tag, or ref. Leave blank to use git.baseBranch, or main.',
    placeHolder: 'main'
  });

  if (branch === undefined) {
    return;
  }

  const scriptPath = path.join(context.extensionUri.fsPath, 'scripts', 'import-skill.mjs');
  if (!await pathExists(scriptPath)) {
    vscode.window.showErrorMessage('scripts/import-skill.mjs is missing from this extension installation.');
    return;
  }

  const commandParts = [
    'node',
    quoteTerminalArg(scriptPath),
    quoteTerminalArg(skillName),
    '--root',
    quoteTerminalArg(root)
  ];

  if (repository.trim()) {
    commandParts.push('--repo', quoteTerminalArg(repository.trim()));
  }

  if (branch.trim()) {
    commandParts.push('--branch', quoteTerminalArg(branch.trim()));
  }

  const terminal = vscode.window.createTerminal({
    name: `Import ${skillName}`,
    cwd: root
  });
  terminal.show();
  terminal.sendText(commandParts.join(' '));
  provider.refresh();
}

async function publishSkillToGit(context: vscode.ExtensionContext, skill: SkillSummary): Promise<void> {
  const root = await getProjectRoot();
  if (!root) {
    vscode.window.showErrorMessage('Open a workspace folder before publishing a skill.');
    return;
  }

  const configPath = path.join(root, 'skill-builder.config.json');
  if (!await pathExists(configPath)) {
    const action = await vscode.window.showWarningMessage(
      'Git publishing needs skill-builder.config.json. Create it from the example, then fill in the remote and branch policy.',
      'Create Config',
      'Cancel'
    );

    if (action !== 'Create Config') {
      return;
    }

    const examplePath = path.join(context.extensionUri.fsPath, 'skill-builder.config.example.json');
    if (!await pathExists(examplePath)) {
      vscode.window.showErrorMessage('skill-builder.config.example.json is missing from this extension installation.');
      return;
    }

    await fs.copyFile(examplePath, configPath);
    await vscode.window.showTextDocument(vscode.Uri.file(configPath));
    vscode.window.showInformationMessage('Created skill-builder.config.json. Set git.enabled to true before publishing.');
    return;
  }

  const scriptPath = path.join(context.extensionUri.fsPath, 'scripts', 'publish-skill.mjs');
  if (!await pathExists(scriptPath)) {
    vscode.window.showErrorMessage('scripts/publish-skill.mjs is missing from this extension installation.');
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: `Publish ${skill.name}`,
    cwd: root
  });
  terminal.show();
  terminal.sendText(`node ${quoteTerminalArg(scriptPath)} ${quoteTerminalArg(skill.directoryName)} --root ${quoteTerminalArg(root)}`);
}

function validateSkill(skill: SkillSummary) {
  const terminal = vscode.window.createTerminal({ name: `Validate ${skill.name}` });
  terminal.show();
  terminal.sendText(`skills-ref validate "${skill.skillPath}"`);
}

async function showSkillHealthCheck(skill: SkillSummary) {
  const report = await buildSkillHealthReport(skill);
  const document = await vscode.workspace.openTextDocument({
    content: report,
    language: 'markdown'
  });
  await vscode.window.showTextDocument(document);
}

async function openSkillEditor(
  context: vscode.ExtensionContext,
  provider: SkillTreeProvider,
  skill: SkillSummary
) {
  const panel = vscode.window.createWebviewPanel(
    'skillBuilder.skillEditor',
    `Skill Editor: ${skill.name}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  const refresh = async () => {
    const freshSkill = await readSkill(skill.skillPath) ?? skill;
    panel.title = `Skill Editor: ${freshSkill.name}`;
    panel.webview.html = await buildSkillEditorHtml(panel.webview, context.extensionUri, freshSkill);
  };

  await refresh();

  panel.webview.onDidReceiveMessage(async (message: {
    command?: string;
    relativePath?: string;
    target?: SupportingFileTarget;
    description?: string;
    title?: string;
  }) => {
    const freshSkill = await readSkill(skill.skillPath) ?? skill;

    try {
      switch (message.command) {
        case 'openFile': {
          const filePath = resolveSkillRelativePath(freshSkill, message.relativePath);
          if (filePath) {
            await vscode.window.showTextDocument(vscode.Uri.file(filePath));
          }
          break;
        }
        case 'saveMetadata': {
          await updateSkillDescription(freshSkill, message.description ?? '');
          provider.refresh();
          await refresh();
          vscode.window.showInformationMessage(`Updated metadata for ${freshSkill.name}.`);
          break;
        }
        case 'addModule': {
          const title = compactWhitespace(message.title ?? '');
          if (!title) {
            vscode.window.showErrorMessage('Module title is required.');
            return;
          }

          await addWorkflowModuleToSkill(freshSkill, title, message.description ?? '');
          provider.refresh();
          await refresh();
          vscode.window.showInformationMessage(`Added workflow module to ${freshSkill.name}.`);
          break;
        }
        case 'addSupportingFiles': {
          if (!isSupportingFileTarget(message.target)) {
            return;
          }

          const copied = await pickAndAddSupportingFiles(freshSkill, message.target);
          if (copied.length > 0) {
            provider.refresh();
            await refresh();
            vscode.window.showInformationMessage(`Added ${copied.length} file${copied.length === 1 ? '' : 's'} to ${message.target}.`);
          }
          break;
        }
        case 'packageSkill': {
          const zipPath = await packageSkill(freshSkill);
          if (zipPath) {
            vscode.window.showInformationMessage(`Packaged ${freshSkill.name} to ${zipPath}.`);
          }
          break;
        }
        case 'syncToClaudeCode': {
          const syncedPath = await syncToClaudeCode(freshSkill);
          if (syncedPath) {
            vscode.window.showInformationMessage(`Synced ${freshSkill.name} to ${syncedPath}.`);
          }
          break;
        }
        case 'importSkillFromGit':
          await importSkillFromGit(context, provider, freshSkill);
          break;
        case 'publishSkillToGit':
          await publishSkillToGit(context, freshSkill);
          break;
        case 'validateSkill':
          validateSkill(freshSkill);
          break;
        case 'healthCheck':
          await showSkillHealthCheck(freshSkill);
          break;
        case 'copyChatPrompt':
          await vscode.env.clipboard.writeText(buildChatPrompt(freshSkill));
          vscode.window.showInformationMessage(`Copied a skill revision prompt for ${freshSkill.name}.`);
          break;
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(messageText);
    }
  });
}

async function buildSkillEditorHtml(
  webview: vscode.Webview,
  _extensionUri: vscode.Uri,
  skill: SkillSummary
): Promise<string> {
  const nonce = getNonce();
  const data = await readSkillEditorData(skill);
  const description = data.frontmatter.description ?? '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Skill Editor</title>
  <style>
    :root {
      color-scheme: light dark;
      --gap: 14px;
    }

    body {
      margin: 0;
      padding: 20px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    main {
      max-width: 1060px;
      margin: 0 auto;
    }

    h1 {
      margin: 0 0 6px;
      font-size: 22px;
      font-weight: 650;
    }

    h2 {
      margin: 0 0 12px;
      font-size: 16px;
    }

    .subtle {
      margin: 0 0 18px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
    }

    .tabs {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      border-bottom: 1px solid var(--vscode-panel-border);
      margin-bottom: 18px;
    }

    .tab {
      border: 0;
      border-radius: 4px 4px 0 0;
      padding: 8px 12px;
      color: var(--vscode-foreground);
      background: transparent;
      cursor: pointer;
      font: inherit;
    }

    .tab.active {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }

    .panel {
      display: none;
    }

    .panel.active {
      display: grid;
      gap: var(--gap);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--gap);
    }

    .field {
      display: grid;
      gap: 6px;
    }

    label {
      font-weight: 600;
    }

    input,
    textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      padding: 8px 10px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      font: inherit;
    }

    textarea {
      min-height: 90px;
      resize: vertical;
      line-height: 1.45;
    }

    button {
      border: 0;
      border-radius: 4px;
      padding: 8px 12px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      font: inherit;
      cursor: pointer;
    }

    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }

    button.link {
      padding: 0;
      color: var(--vscode-textLink-foreground);
      background: transparent;
      text-align: left;
    }

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }

    .file-table {
      width: 100%;
      border-collapse: collapse;
    }

    .file-table th,
    .file-table td {
      padding: 7px 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
      text-align: left;
      vertical-align: top;
    }

    .file-table th {
      color: var(--vscode-descriptionForeground);
      font-weight: 600;
    }

    .module-list {
      display: grid;
      gap: 8px;
    }

    .module-item {
      display: grid;
      gap: 4px;
      padding: 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      background: var(--vscode-editorWidget-background);
    }

    pre {
      overflow: auto;
      max-height: 360px;
      padding: 12px;
      border-radius: 4px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-textCodeBlock-background);
    }

    @media (max-width: 760px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(skill.name)}</h1>
    <p class="subtle">${escapeHtml(skill.skillPath)}</p>

    <nav class="tabs" aria-label="Skill editor sections">
      <button class="tab active" data-tab="metadata" type="button">Metadata</button>
      <button class="tab" data-tab="modules" type="button">Modules</button>
      <button class="tab" data-tab="files" type="button">Files</button>
      <button class="tab" data-tab="evals" type="button">Evals</button>
      <button class="tab" data-tab="package" type="button">Package</button>
    </nav>

    <section class="panel active" id="metadata">
      <h2>Metadata</h2>
      <div class="grid">
        <div class="field">
          <label for="metaName">Name</label>
          <input id="metaName" value="${escapeAttribute(data.frontmatter.name ?? skill.name)}" readonly>
        </div>
        <div class="field">
          <label>Folder</label>
          <input value="${escapeAttribute(skill.directoryName)}" readonly>
        </div>
      </div>
      <div class="field">
        <label for="metaDescription">Description</label>
        <textarea id="metaDescription" maxlength="1024">${escapeHtml(description)}</textarea>
      </div>
      <div class="actions">
        <button type="button" data-action="saveMetadata">Save Metadata</button>
        <button class="secondary" type="button" data-action="openSkill">Open SKILL.md</button>
        <button class="secondary" type="button" data-action="healthCheck">Health Check</button>
      </div>
    </section>

    <section class="panel" id="modules">
      <h2>Workflow Modules</h2>
      ${renderEditorModules(data.modules)}
      <div class="grid">
        <div class="field">
          <label for="moduleTitle">New module title</label>
          <input id="moduleTitle" placeholder="intake">
        </div>
        <div class="field">
          <label for="moduleDescription">When to read</label>
          <textarea id="moduleDescription" placeholder="Read this module when Claude needs to gather inputs and assumptions."></textarea>
        </div>
      </div>
      <div class="actions">
        <button type="button" data-action="addModule">Add Module</button>
      </div>
    </section>

    <section class="panel" id="files">
      <h2>Files</h2>
      <div class="actions">
        <button class="secondary" type="button" data-action="addFiles" data-target="references">Add References</button>
        <button class="secondary" type="button" data-action="addFiles" data-target="scripts">Add Scripts</button>
        <button class="secondary" type="button" data-action="addFiles" data-target="assets">Add Assets</button>
      </div>
      ${renderEditorFileTable('References', data.references)}
      ${renderEditorFileTable('Scripts', data.scripts)}
      ${renderEditorFileTable('Assets', data.assets)}
    </section>

    <section class="panel" id="evals">
      <h2>Evals</h2>
      <p class="subtle">${escapeHtml(data.evalsSummary)}</p>
      <div class="actions">
        <button class="secondary" type="button" data-action="openEvals">Open evals.json</button>
      </div>
      <pre>${escapeHtml(data.evalsRaw ?? 'No evals/evals.json found.')}</pre>
    </section>

    <section class="panel" id="package">
      <h2>Package</h2>
      <div class="actions">
        <button type="button" data-action="packageSkill">Package ZIP</button>
        <button class="secondary" type="button" data-action="syncToClaudeCode">Sync to Claude Code</button>
        <button class="secondary" type="button" data-action="importSkillFromGit">Import/Update from Git</button>
        <button class="secondary" type="button" data-action="publishSkillToGit">Publish to Git</button>
        <button class="secondary" type="button" data-action="validateSkill">Run skills-ref Validate</button>
        <button class="secondary" type="button" data-action="copyChatPrompt">Copy Revision Prompt</button>
      </div>
    </section>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
        document.querySelectorAll('.panel').forEach((item) => item.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
      });
    });

    document.body.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) {
        return;
      }

      const action = button.dataset.action;
      if (!action) {
        return;
      }

      if (action === 'saveMetadata') {
        vscode.postMessage({
          command: 'saveMetadata',
          description: document.getElementById('metaDescription').value
        });
      } else if (action === 'openSkill') {
        vscode.postMessage({ command: 'openFile', relativePath: 'SKILL.md' });
      } else if (action === 'openEvals') {
        vscode.postMessage({ command: 'openFile', relativePath: 'evals/evals.json' });
      } else if (action === 'openFile') {
        vscode.postMessage({ command: 'openFile', relativePath: button.dataset.path });
      } else if (action === 'addModule') {
        vscode.postMessage({
          command: 'addModule',
          title: document.getElementById('moduleTitle').value,
          description: document.getElementById('moduleDescription').value
        });
      } else if (action === 'addFiles') {
        vscode.postMessage({ command: 'addSupportingFiles', target: button.dataset.target });
      } else {
        vscode.postMessage({ command: action });
      }
    });
  </script>
</body>
</html>`;
}

async function readSkillEditorData(skill: SkillSummary): Promise<SkillEditorData> {
  const manifest = await fs.readFile(skill.manifestPath, 'utf8');
  const frontmatter = parseFrontmatter(manifest);
  const modules = await readWorkflowModules(skill.skillPath);
  const references = await listSkillFiles(skill.skillPath, 'references');
  const scripts = await listSkillFiles(skill.skillPath, 'scripts');
  const assets = await listSkillFiles(skill.skillPath, 'assets');
  const evalsPath = path.join(skill.skillPath, 'evals', 'evals.json');
  const evalsRaw = await pathExists(evalsPath) ? await fs.readFile(evalsPath, 'utf8') : undefined;
  const evalsSummary = summarizeEvals(evalsRaw);

  return {
    manifest,
    frontmatter,
    modules,
    references,
    scripts,
    assets,
    evalsRaw,
    evalsSummary
  };
}

async function buildSkillHealthReport(skill: SkillSummary): Promise<string> {
  const findings = await collectSkillHealthFindings(skill);
  const passCount = findings.filter((finding) => finding.severity === 'pass').length;
  const warnCount = findings.filter((finding) => finding.severity === 'warn').length;
  const failCount = findings.filter((finding) => finding.severity === 'fail').length;

  return `# Skill Health Check: ${skill.name}

Path: \`${skill.skillPath}\`

Summary: ${passCount} pass, ${warnCount} warning${warnCount === 1 ? '' : 's'}, ${failCount} failure${failCount === 1 ? '' : 's'}

## Findings

${findings.map((finding) => {
  const prefix = finding.severity.toUpperCase();
  return `- [${prefix}] ${finding.message}${finding.detail ? `\n  ${finding.detail}` : ''}`;
}).join('\n')}
`;
}

async function collectSkillHealthFindings(skill: SkillSummary): Promise<SkillHealthFinding[]> {
  const findings: SkillHealthFinding[] = [];

  if (!await pathExists(skill.manifestPath)) {
    return [{
      severity: 'fail',
      message: 'SKILL.md is missing.',
      detail: 'Every Anthropic skill folder must contain SKILL.md.'
    }];
  }

  const manifest = await fs.readFile(skill.manifestPath, 'utf8');
  const frontmatter = parseFrontmatter(manifest);
  const manifestLines = manifest.split(/\r?\n/).length;

  if (/^---\r?\n[\s\S]*?\r?\n---/.test(manifest)) {
    findings.push({ severity: 'pass', message: 'SKILL.md has YAML frontmatter.' });
  } else {
    findings.push({ severity: 'fail', message: 'SKILL.md does not start with YAML frontmatter.' });
  }

  if (frontmatter.name) {
    findings.push({ severity: 'pass', message: `Frontmatter name is \`${frontmatter.name}\`.` });
    if (frontmatter.name !== skill.directoryName) {
      findings.push({
        severity: 'fail',
        message: 'Frontmatter name does not match the skill folder name.',
        detail: `Expected \`${skill.directoryName}\`, found \`${frontmatter.name}\`.`
      });
    }
  } else {
    findings.push({ severity: 'fail', message: 'Frontmatter is missing required `name`.' });
  }

  if (frontmatter.description) {
    findings.push({ severity: 'pass', message: 'Frontmatter description is present.' });
    if (frontmatter.description.length < 60) {
      findings.push({
        severity: 'warn',
        message: 'Description may be too short to trigger reliably.',
        detail: 'Best descriptions say what the skill does and when Claude should use it.'
      });
    }
    if (frontmatter.description.length > 1024) {
      findings.push({ severity: 'fail', message: 'Description exceeds the portable 1024-character limit.' });
    }
  } else {
    findings.push({ severity: 'fail', message: 'Frontmatter is missing required `description`.' });
  }

  if (manifestLines <= 500) {
    findings.push({ severity: 'pass', message: `SKILL.md is ${manifestLines} lines.` });
  } else {
    findings.push({
      severity: 'warn',
      message: `SKILL.md is ${manifestLines} lines.`,
      detail: 'Move detailed procedures, examples, schemas, and long policies into references/.'
    });
  }

  if (/^## Workflow\b/m.test(manifest)) {
    findings.push({ severity: 'pass', message: 'Workflow section found.' });
  } else {
    findings.push({ severity: 'warn', message: 'No `## Workflow` section found.' });
  }

  if (/^## Quality Checks\b/m.test(manifest)) {
    findings.push({ severity: 'pass', message: 'Quality Checks section found.' });
  } else {
    findings.push({ severity: 'warn', message: 'No `## Quality Checks` section found.' });
  }

  const referencedFiles = extractRelativeSkillReferences(manifest);
  for (const relativePath of referencedFiles) {
    const filePath = resolveSkillRelativePath(skill, relativePath);
    if (!filePath) {
      findings.push({ severity: 'fail', message: `Invalid relative file reference: \`${relativePath}\`.` });
    } else if (!await pathExists(filePath)) {
      findings.push({ severity: 'fail', message: `Referenced file does not exist: \`${relativePath}\`.` });
    }
  }

  if (referencedFiles.length > 0) {
    findings.push({ severity: 'pass', message: `Checked ${referencedFiles.length} relative supporting-file reference${referencedFiles.length === 1 ? '' : 's'}.` });
  }

  const modules = await readWorkflowModules(skill.skillPath);
  if (modules.length > 0) {
    const moduleCallouts = modules.filter((module) => manifest.includes(`references/${module.fileName}`));
    if (moduleCallouts.length === modules.length) {
      findings.push({ severity: 'pass', message: 'Workflow module files are called out from SKILL.md.' });
    } else {
      findings.push({
        severity: 'warn',
        message: 'Some ordered workflow modules are not called out from SKILL.md.',
        detail: modules
          .filter((module) => !manifest.includes(`references/${module.fileName}`))
          .map((module) => `Missing callout: references/${module.fileName}`)
          .join('; ')
      });
    }
  }

  const evalsPath = path.join(skill.skillPath, 'evals', 'evals.json');
  if (await pathExists(evalsPath)) {
    try {
      const parsed = JSON.parse(await fs.readFile(evalsPath, 'utf8')) as { evals?: unknown };
      const count = Array.isArray(parsed.evals) ? parsed.evals.length : 0;
      findings.push({ severity: 'pass', message: `evals/evals.json parses with ${count} task eval${count === 1 ? '' : 's'}.` });
      if (count < 3) {
        findings.push({ severity: 'warn', message: 'Consider at least three evals: happy path, incomplete input, and edge case.' });
      }
    } catch (error) {
      findings.push({
        severity: 'fail',
        message: 'evals/evals.json is not valid JSON.',
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  } else {
    findings.push({ severity: 'warn', message: 'evals/evals.json is missing.' });
  }

  const scripts = await listSkillFiles(skill.skillPath, 'scripts');
  for (const script of scripts.filter((file) => /\.(?:py|js|mjs|cjs|ps1|sh)$/i.test(file.name))) {
    const scriptPath = path.join(skill.skillPath, script.relativePath);
    const content = await readTextFileIfSmall(scriptPath);
    if (content && (/--help/.test(content) || /argparse|commander|process\.argv|param\s*\(/i.test(content))) {
      findings.push({ severity: 'pass', message: `Script documents command-line usage: \`${script.relativePath}\`.` });
    } else {
      findings.push({
        severity: 'warn',
        message: `Script may not expose --help or clear CLI arguments: \`${script.relativePath}\`.`
      });
    }
  }

  const secretHits = await findPotentialSecrets(skill.skillPath);
  for (const hit of secretHits) {
    findings.push({
      severity: 'fail',
      message: `Potential secret-like value found in \`${hit}\`.`,
      detail: 'Review before packaging or publishing this skill.'
    });
  }

  if (secretHits.length === 0) {
    findings.push({ severity: 'pass', message: 'No obvious secret-like values found in scanned text files.' });
  }

  return findings;
}

async function updateSkillDescription(skill: SkillSummary, description: string) {
  const normalized = compactWhitespace(description);
  if (!normalized) {
    throw new Error('Description is required.');
  }

  const validationError = validateDescription(normalized, 'portable');
  if (validationError) {
    throw new Error(validationError);
  }

  const manifest = await fs.readFile(skill.manifestPath, 'utf8');
  await fs.writeFile(
    skill.manifestPath,
    updateFrontmatterField(manifest, 'description', quoteYamlString(normalized)),
    'utf8'
  );
}

async function addWorkflowModuleToSkill(
  skill: SkillSummary,
  title: string,
  description: string
): Promise<WorkflowModuleSpec> {
  const existingModules = await readWorkflowModules(skill.skillPath);
  const order = existingModules.reduce((max, module) => Math.max(max, module.order), 0) + 1;
  const slug = slugify(title).slice(0, 48).replace(/-+$/g, '') || `module-${order}`;
  const module: WorkflowModuleSpec = {
    order,
    slug,
    title: titleFromName(slug),
    description: compactWhitespace(description) || `Use this module when the ${titleFromName(slug).toLowerCase()} stage is relevant.`,
    fileName: `${String(order).padStart(2, '0')}-${slug}.md`
  };

  await fs.mkdir(path.join(skill.skillPath, 'references'), { recursive: true });
  await fs.writeFile(
    path.join(skill.skillPath, 'references', module.fileName),
    buildWorkflowModuleStub(module),
    'utf8'
  );

  const modules = [...existingModules, module].sort((left, right) => left.order - right.order);
  const manifest = await fs.readFile(skill.manifestPath, 'utf8');
  await fs.writeFile(skill.manifestPath, upsertWorkflowModuleCallouts(manifest, modules), 'utf8');

  return module;
}

async function pickAndAddSupportingFiles(
  skill: SkillSummary,
  target: SupportingFileTarget
): Promise<string[]> {
  const files = await vscode.window.showOpenDialog({
    title: `Add files to ${skill.name}/${target}`,
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: true,
    openLabel: `Add to ${target}`
  });

  if (!files || files.length === 0) {
    return [];
  }

  const targetDirectory = path.join(skill.skillPath, target);
  await fs.mkdir(targetDirectory, { recursive: true });

  const copiedFiles: string[] = [];
  for (const file of files) {
    const sourcePath = file.fsPath;
    const targetPath = path.join(targetDirectory, path.basename(sourcePath));
    if (await pathExists(targetPath)) {
      const action = await vscode.window.showWarningMessage(
        `${path.basename(targetPath)} already exists in ${target}. Replace it?`,
        { modal: true },
        'Replace',
        'Skip'
      );

      if (action !== 'Replace') {
        continue;
      }
    }

    await fs.copyFile(sourcePath, targetPath);
    copiedFiles.push(targetPath);
  }

  if (copiedFiles.length > 0) {
    await appendSupportingFileNotes(skill, target, copiedFiles);
  }

  return copiedFiles;
}

async function readWorkflowModules(skillPath: string): Promise<WorkflowModuleSpec[]> {
  const referencesPath = path.join(skillPath, 'references');
  if (!await pathExists(referencesPath)) {
    return [];
  }

  const entries = await fs.readdir(referencesPath, { withFileTypes: true });
  const modules: WorkflowModuleSpec[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !/^\d{2}-.+\.md$/i.test(entry.name)) {
      continue;
    }

    const order = Number.parseInt(entry.name.slice(0, 2), 10);
    const slug = path.basename(entry.name, '.md').replace(/^\d{2}-/, '');
    const content = await fs.readFile(path.join(referencesPath, entry.name), 'utf8');
    modules.push({
      order: Number.isFinite(order) ? order : modules.length + 1,
      slug,
      title: extractMarkdownTitle(content) ?? titleFromName(slug),
      description: extractMarkdownSectionFirstParagraph(content, 'When To Read')
        ?? `Use this module when the ${titleFromName(slug).toLowerCase()} stage is relevant.`,
      fileName: entry.name
    });
  }

  return modules.sort((left, right) => left.order - right.order);
}

async function listSkillFiles(skillPath: string, target: SupportingFileTarget): Promise<SkillFileSummary[]> {
  const directory = path.join(skillPath, target);
  if (!await pathExists(directory)) {
    return [];
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: SkillFileSummary[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const filePath = path.join(directory, entry.name);
    const stat = await fs.stat(filePath);
    files.push({
      name: entry.name,
      relativePath: `${target}/${entry.name}`,
      size: stat.size
    });
  }

  return files.sort((left, right) => left.name.localeCompare(right.name));
}

function renderEditorModules(modules: WorkflowModuleSpec[]): string {
  if (modules.length === 0) {
    return '<p class="subtle">No ordered workflow modules yet.</p>';
  }

  return `<div class="module-list">
${modules.map((module) => `<div class="module-item">
  <strong>${module.order}. ${escapeHtml(module.title)}</strong>
  <button class="link" type="button" data-action="openFile" data-path="references/${escapeAttribute(module.fileName)}">${escapeHtml(`references/${module.fileName}`)}</button>
  <span>${escapeHtml(module.description)}</span>
</div>`).join('\n')}
</div>`;
}

function renderEditorFileTable(title: string, files: SkillFileSummary[]): string {
  if (files.length === 0) {
    return `<h2>${escapeHtml(title)}</h2><p class="subtle">No files.</p>`;
  }

  return `<h2>${escapeHtml(title)}</h2>
<table class="file-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>Size</th>
    </tr>
  </thead>
  <tbody>
    ${files.map((file) => `<tr>
      <td><button class="link" type="button" data-action="openFile" data-path="${escapeAttribute(file.relativePath)}">${escapeHtml(file.relativePath)}</button></td>
      <td>${formatBytes(file.size)}</td>
    </tr>`).join('\n')}
  </tbody>
</table>`;
}

function summarizeEvals(evalsRaw: string | undefined): string {
  if (!evalsRaw) {
    return 'No evals/evals.json found.';
  }

  try {
    const parsed = JSON.parse(evalsRaw) as {
      evals?: unknown[];
      trigger_evals?: {
        should_trigger?: unknown[];
        should_not_trigger?: unknown[];
      };
    };
    const evalCount = Array.isArray(parsed.evals) ? parsed.evals.length : 0;
    const shouldTriggerCount = Array.isArray(parsed.trigger_evals?.should_trigger)
      ? parsed.trigger_evals.should_trigger.length
      : 0;
    const shouldNotTriggerCount = Array.isArray(parsed.trigger_evals?.should_not_trigger)
      ? parsed.trigger_evals.should_not_trigger.length
      : 0;
    return `${evalCount} task eval${evalCount === 1 ? '' : 's'}, ${shouldTriggerCount} should-trigger prompt${shouldTriggerCount === 1 ? '' : 's'}, ${shouldNotTriggerCount} should-not-trigger prompt${shouldNotTriggerCount === 1 ? '' : 's'}.`;
  } catch (error) {
    return `evals/evals.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function resolveSkillRelativePath(skill: SkillSummary, relativePath: string | undefined): string | undefined {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('\0')) {
    return undefined;
  }

  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.split('/').some((part) => part === '..')) {
    return undefined;
  }

  const root = path.resolve(skill.skillPath);
  const resolved = path.resolve(root, normalized);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return undefined;
  }

  return resolved;
}

function upsertWorkflowModuleCallouts(markdown: string, modules: WorkflowModuleSpec[]): string {
  const section = renderWorkflowModuleCallouts(modules).trimEnd();
  if (!section) {
    return markdown;
  }

  const existingSection = /\r?\n## Workflow Modules\r?\n[\s\S]*?(?=\r?\n## |\s*$)/;
  if (existingSection.test(markdown)) {
    return markdown.replace(existingSection, `\n${section}\n`);
  }

  const workflowSection = /(\r?\n## Workflow\r?\n[\s\S]*?)(?=\r?\n## |\s*$)/;
  if (workflowSection.test(markdown)) {
    return markdown.replace(workflowSection, `$1\n\n${section}\n`);
  }

  return `${markdown.trimEnd()}\n\n${section}\n`;
}

function updateFrontmatterField(markdown: string, field: string, value: string): string {
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---)([\s\S]*)$/.exec(markdown);
  if (!match) {
    return `---\n${field}: ${value}\n---\n\n${markdown.trimStart()}`;
  }

  const lines = match[2].split(/\r?\n/);
  const fieldPattern = new RegExp(`^${escapeRegExp(field)}\\s*:`);
  const index = lines.findIndex((line) => fieldPattern.test(line));
  if (index >= 0) {
    lines[index] = `${field}: ${value}`;
  } else {
    lines.push(`${field}: ${value}`);
  }

  return `${match[1]}${lines.join('\n')}${match[3]}${match[4]}`;
}

function extractRelativeSkillReferences(markdown: string): string[] {
  const references = new Set<string>();
  const patterns = [
    /`((?:references|scripts|assets)\/[^`\s)]+)`/g,
    /\b((?:references|scripts|assets)\/[A-Za-z0-9._/-]+)/g
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(markdown)) !== null) {
      references.add(match[1].replace(/[.,;:]+$/g, ''));
    }
  }

  return Array.from(references).sort();
}

async function findPotentialSecrets(skillPath: string): Promise<string[]> {
  const files = await listTextFilesRecursively(skillPath);
  const hits: string[] = [];
  const secretPatterns = [
    /\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9_\-.]{8,}/i,
    /\bsk-[A-Za-z0-9]{20,}\b/
  ];

  for (const file of files) {
    const content = await readTextFileIfSmall(file);
    if (!content) {
      continue;
    }

    if (secretPatterns.some((pattern) => pattern.test(content))) {
      hits.push(path.relative(skillPath, file).replace(/\\/g, '/'));
    }
  }

  return hits;
}

async function listTextFilesRecursively(root: string): Promise<string[]> {
  const files: string[] = [];
  const textExtensions = new Set([
    '.md',
    '.txt',
    '.json',
    '.yaml',
    '.yml',
    '.py',
    '.js',
    '.mjs',
    '.cjs',
    '.ts',
    '.sh',
    '.ps1'
  ]);

  async function visit(directory: string) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && textExtensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(entryPath);
      }
    }
  }

  await visit(root);
  return files;
}

async function readTextFileIfSmall(filePath: string, maxBytes = 250_000): Promise<string | undefined> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > maxBytes) {
      return undefined;
    }

    return await fs.readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

function extractMarkdownTitle(markdown: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match?.[1]?.trim();
}

function extractMarkdownSectionFirstParagraph(markdown: string, heading: string): string | undefined {
  const pattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^##\\s+|\\s*$)`, 'm');
  const match = pattern.exec(markdown);
  if (!match) {
    return undefined;
  }

  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('-'))[0];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function readSkills(root: string): Promise<SkillSummary[]> {
  const skillsDirectory = getSkillsDirectory(root);
  if (!await pathExists(skillsDirectory)) {
    return [];
  }

  const entries = await fs.readdir(skillsDirectory, { withFileTypes: true });
  const skills = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readSkill(path.join(skillsDirectory, entry.name)))
  );

  return skills
    .filter((skill): skill is SkillSummary => skill !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function readSkill(skillPath: string): Promise<SkillSummary | undefined> {
  const manifestPath = path.join(skillPath, 'SKILL.md');
  if (!await pathExists(manifestPath)) {
    return undefined;
  }

  const directoryName = path.basename(skillPath);
  const manifest = await fs.readFile(manifestPath, 'utf8');
  const frontmatter = parseFrontmatter(manifest);

  return {
    directoryName,
    skillPath,
    manifestPath,
    name: frontmatter.name ?? directoryName,
    description: frontmatter.description
  };
}

function parseFrontmatter(markdown: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match) {
    return {};
  }

  const values: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!field) {
      continue;
    }

    values[field[1]] = unquoteYamlScalar(field[2].trim());
  }

  return values;
}

function unquoteYamlScalar(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function getProjectRoot(): Promise<string | undefined> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return undefined;
  }

  const configured = vscode.workspace.getConfiguration('skillBuilder').get<string>('projectRoot', '').trim();
  if (configured) {
    return path.resolve(workspaceRoot, configured);
  }

  if (await looksLikeSkillBuilderRoot(workspaceRoot)) {
    return workspaceRoot;
  }

  const childRoot = await findChildSkillBuilderRoot(workspaceRoot);
  return childRoot ?? workspaceRoot;
}

async function findChildSkillBuilderRoot(workspaceRoot: string): Promise<string | undefined> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  } catch {
    return undefined;
  }

  const candidates: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }

    const candidate = path.join(workspaceRoot, entry.name);
    if (await looksLikeSkillBuilderRoot(candidate)) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  return candidates.find((candidate) => path.basename(candidate).toLowerCase() === 'skill-builder');
}

async function looksLikeSkillBuilderRoot(candidate: string): Promise<boolean> {
  const packageName = await readPackageName(candidate);
  if (packageName === 'skill-builder') {
    return true;
  }

  return await pathExists(path.join(candidate, 'AGENTS.md')) && await pathExists(path.join(candidate, 'skills'));
}

async function readPackageName(candidate: string): Promise<string | undefined> {
  try {
    const packageJson = await fs.readFile(path.join(candidate, 'package.json'), 'utf8');
    const parsed = JSON.parse(packageJson) as { name?: unknown };
    return typeof parsed.name === 'string' ? parsed.name : undefined;
  } catch {
    return undefined;
  }
}

function getSkillsDirectory(root: string): string {
  const configured = vscode.workspace.getConfiguration('skillBuilder').get<string>('skillsDirectory', 'skills');
  return path.resolve(root, configured);
}

function getDistDirectory(root: string): string {
  const configured = vscode.workspace.getConfiguration('skillBuilder').get<string>('distDirectory', 'dist');
  return path.resolve(root, configured);
}

function getClaudeCodeSkillsDirectory(root: string): string {
  const configured = vscode.workspace.getConfiguration('skillBuilder').get<string>('claudeCodeSkillsDirectory', '').trim();
  if (!configured) {
    return path.join(os.homedir(), '.claude', 'skills');
  }

  const expanded = expandHome(configured);
  return path.isAbsolute(expanded) ? expanded : path.resolve(root, expanded);
}

function expandHome(value: string): string {
  if (value === '~') {
    return os.homedir();
  }

  if (value.startsWith(`~${path.sep}`) || value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }

  return value;
}

function quoteTerminalArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function validateSkillName(value: string): string | undefined {
  if (!value) {
    return 'Skill name is required.';
  }

  if (value.length > 64) {
    return 'Skill name must be 64 characters or fewer.';
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    return 'Use lowercase kebab-case with letters, numbers, and hyphens only.';
  }

  if (RESERVED_SKILL_NAMES.has(value)) {
    return 'Choose a non-reserved skill name.';
  }

  return undefined;
}

function normalizeSkillName(value: string | undefined): string {
  return slugify(value ?? '');
}

function deriveSkillName(idea: string | undefined): string {
  const compactIdea = compactWhitespace(idea ?? '');
  if (!compactIdea) {
    return '';
  }

  return slugify(compactIdea.split(/\s+/).slice(0, 6).join('-')).slice(0, 64).replace(/-+$/, '');
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeTargetSurface(value: TargetSurface | undefined): TargetSurface {
  if (value === 'claude-ai' || value === 'claude-code' || value === 'claude-api') {
    return value;
  }

  return 'portable';
}

function normalizeDescription(
  value: string | undefined,
  skillName: string,
  idea: string | undefined,
  targetSurface: TargetSurface
): string {
  const explicit = compactWhitespace(value ?? '');
  if (explicit) {
    return explicit;
  }

  const title = titleFromName(skillName).toLowerCase();
  const compactIdea = compactWhitespace(idea ?? '');
  const maxLength = targetSurface === 'claude-ai' ? 200 : 1024;
  const fallback = compactIdea
    ? `Support ${title} workflows. Use when the user asks for ${shorten(compactIdea, maxLength - 56)}`
    : `Support ${title} workflows. Use when the user asks for this repeatable Claude skill workflow.`;

  return shorten(fallback, maxLength);
}

function validateDescription(value: string, targetSurface: TargetSurface): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const maxLength = targetSurface === 'claude-ai' ? 200 : 1024;
  if (trimmed.length > maxLength) {
    return `Description must be ${maxLength} characters or fewer for this target.`;
  }

  if (/<[^>]+>/.test(trimmed)) {
    return 'Avoid XML/HTML tags in skill descriptions.';
  }

  return undefined;
}

async function writeBriefTemplate(
  root: string,
  name: string,
  description: string | undefined,
  targetSurface: TargetSurface,
  input: InteractiveSkillInput = {}
) {
  const briefDirectory = path.join(root, 'workbench', name);
  await fs.mkdir(briefDirectory, { recursive: true });
  await fs.writeFile(
    path.join(briefDirectory, 'brief.md'),
    buildBriefTemplate(name, description, targetSurface, input),
    'utf8'
  );
}

function buildBriefTemplate(
  name: string,
  description: string | undefined,
  targetSurface: TargetSurface,
  input: InteractiveSkillInput = {}
): string {
  return `# Skill Brief

## Working Name

\`${name}\`

## Target Surface

${targetSurfaceLabel(targetSurface)}

## User's Free-Form Request

${markdownValue(input.idea)}

## Draft Description

${description?.trim() || `Describe ${name}. Use when the user asks for this repeatable Claude skill workflow.`}

## Repeated Workflow

${markdownValue(input.idea)}

## Skill Type

${markdownValue(input.skillType)}

## Intended Users

-

## Trigger Contexts

${markdownList(input.triggerContexts)}

## Should Not Trigger

${markdownList(input.shouldNotTrigger)}

## Inputs To Gather

${markdownList(input.inputsToGather)}

## Workflow Steps

${markdownList(input.workflowSteps)}

## Workflow Modules

${markdownList(input.workflowModules)}

## Edge Cases And Decision Points

${markdownList(input.edgeCases)}

## Quality Checks

${markdownList(input.qualityChecks)}

## Output Standard

${markdownValue(input.outputStandard)}

## Examples And Source Materials

${markdownValue(input.examplesAndMaterials)}

## Supporting Files Plan

${markdownValue(input.supportingFilesPlan)}

## Reference Files To Create

${markdownList(input.referenceFiles)}

## Script Plan

${markdownValue(input.scriptPlan)}

## Script Stubs To Create

${markdownList(input.scriptFiles)}

## Asset Placeholders To Create

${markdownList(input.assetFiles)}

## Evaluation Prompts

${markdownList(input.evalPrompts)}

## Target-Surface Notes

${markdownValue(input.targetNotes)}

## External Systems

${markdownValue(input.externalSystems)}

## Security Notes

${markdownValue(input.securityNotes)}

## Runtime Assumptions

${surfaceGuidance(targetSurface)}

## Evaluation Ideas

### Should Trigger

-

### Should Not Trigger

-

### Task Evals

- happy path:
- incomplete input:
- edge case:

## Open Questions

-
`;
}

function buildCreationPlan(
  name: string,
  description: string,
  targetSurface: TargetSurface,
  input: InteractiveSkillInput
): string {
  return `# Skill Creation Plan

## Skill

- name: \`${name}\`
- target surface: ${targetSurfaceLabel(targetSurface)}
- description: ${description}
- skill type: ${markdownValue(input.skillType)}

## Official Authoring Loop

Use this plan to iterate the skill before considering it production-ready:

1. Confirm the user intent and repeated workflow.
2. Tune the description for triggering: what it does plus when Claude should use it.
3. Keep \`SKILL.md\` as the concise operating guide.
4. Move long procedures, schemas, examples, and policies into \`references/\`.
5. Use scripts only for deterministic, non-interactive operations with \`--help\`.
6. Add evals that cover happy path, incomplete input, edge cases, and trigger boundaries.
7. Validate structure and package or sync for the target surface.

## Intake Summary

${markdownValue(input.idea)}

## Trigger Design

### Should Trigger

${markdownList(input.triggerContexts)}

### Should Not Trigger

${markdownList(input.shouldNotTrigger)}

### Description Check

- Specific enough to distinguish this skill from neighboring skills.
- Includes the user's real trigger terms.
- Avoids broad phrases like "help with anything".
- Claude.ai target stays under the shorter description limit.

## Workflow Design

### Inputs To Gather

${markdownList(input.inputsToGather)}

### Procedure

${markdownList(input.workflowSteps)}

### Workflow Modules

${markdownList(input.workflowModules)}

### Edge Cases

${markdownList(input.edgeCases)}

### Quality Checks

${markdownList(input.qualityChecks)}

### Output Standard

${markdownValue(input.outputStandard)}

## Progressive Disclosure

### Source Materials

${markdownValue(input.examplesAndMaterials)}

### References, Assets, Scripts

${markdownValue(input.supportingFilesPlan)}

### Reference Files To Create

${markdownList(input.referenceFiles)}

### Script Rules

${markdownValue(input.scriptPlan)}

### Script Stubs To Create

${markdownList(input.scriptFiles)}

### Asset Placeholders To Create

${markdownList(input.assetFiles)}

Any script added later should be non-interactive, document \`--help\`, write structured stdout when possible, write diagnostics to stderr, and avoid hidden network/package-install assumptions.

## Evaluation Plan

${markdownList(input.evalPrompts)}

Minimum eval set to add or refine:

- happy path task
- incomplete input task
- edge case task
- should-trigger prompts
- should-not-trigger prompts

## Target-Surface Constraints

${surfaceGuidance(targetSurface)}

${markdownValue(input.targetNotes)}

## External Systems And Security

${markdownValue(input.externalSystems)}

${markdownValue(input.securityNotes)}

Never hardcode secrets. Prefer MCP/tool dependencies with explicit permissions and failure handling.

## Done Checklist

- \`SKILL.md\` has valid YAML frontmatter.
- \`name\` matches the folder name.
- \`description\` is trigger-specific.
- Workflow is focused and repeatable.
- Supporting files are referenced only when useful.
- Scripts are non-interactive and documented.
- Evals cover task quality and trigger behavior.
- Target-surface assumptions are explicit.
- \`skills-ref validate ./skills/${name}\` runs or the limitation is recorded.
`;
}

function buildChatPrompt(skill?: SkillSummary): string {
  if (skill) {
    return `I want to revise an existing Anthropic / Claude Agent Skill through free-form chat.

Use the current official Anthropic skill guidance as the source of truth, especially the conversation-based skill creation flow, custom Skills guidance, Claude Code skills docs, Claude API Skills guide, and the anthropics/skills examples.

Existing skill:
- name: ${skill.name}
- folder: ${skill.skillPath}
- SKILL.md: ${skill.manifestPath}
- current description: ${skill.description ?? '(none)'}

Please work in this repo's intended flow:
1. Read AGENTS.md, docs/skill-chat-workflow.md, and the existing skill.
2. Ask at most 1-2 clarifying questions only if needed.
3. Convert my free-form change request into workbench/${skill.directoryName}/brief.md.
4. Update skills/${skill.directoryName}/SKILL.md and any useful references, scripts, assets, or evals.
5. Keep the skill Claude-compatible, not Codex-native.
6. Validate structure and tell me what could not be validated.

My free-form change request:

\`\`\`text
Paste the desired change, examples, source material, or workflow notes here.
\`\`\`
`;
  }

  return `I want to create a new Anthropic / Claude Agent Skill through free-form chat.

Use the current official Anthropic skill guidance as the source of truth, especially the conversation-based skill creation flow, custom Skills guidance, Claude Code skills docs, Claude API Skills guide, and the anthropics/skills examples.

Please work in this repo's intended flow:
1. Read AGENTS.md and docs/skill-chat-workflow.md.
2. Start from my natural-language idea instead of forcing a rigid form.
3. Ask at most 1-2 clarifying questions only if needed.
4. Choose the safest portable default if I do not specify a target surface.
5. Create workbench/<skill-name>/brief.md from my idea.
6. Create skills/<skill-name>/SKILL.md plus only useful references, scripts, assets, and evals.
7. Keep the output Claude-compatible, not Codex-native.
8. Validate structure and tell me what could not be validated.

My free-form skill idea:

\`\`\`text
Paste the skill idea, workflow, examples, templates, or source materials here.
\`\`\`
`;
}

function buildChatPromptForInput(skillName: string, input: InteractiveSkillInput): string {
  return `I want to create or refine an Anthropic / Claude Agent Skill from this interactive intake.

Use the current official Anthropic skill guidance as the source of truth, especially conversation-based skill creation, custom Skills, Claude Code skills, Claude API Skills, and the anthropics/skills examples.

Skill name: ${skillName}
Target surface: ${targetSurfaceLabel(normalizeTargetSurface(input.targetSurface))}
Skill type: ${input.skillType || 'not specified'}
Description: ${input.description || 'not specified'}

Free-form idea:

\`\`\`text
${input.idea || ''}
\`\`\`

Trigger contexts:

\`\`\`text
${input.triggerContexts || ''}
\`\`\`

Inputs to gather:

\`\`\`text
${input.inputsToGather || ''}
\`\`\`

Workflow steps:

\`\`\`text
${input.workflowSteps || ''}
\`\`\`

Workflow modules:

\`\`\`text
${input.workflowModules || ''}
\`\`\`

Edge cases:

\`\`\`text
${input.edgeCases || ''}
\`\`\`

Quality checks:

\`\`\`text
${input.qualityChecks || ''}
\`\`\`

Output standard:

\`\`\`text
${input.outputStandard || ''}
\`\`\`

Examples and materials:

\`\`\`text
${input.examplesAndMaterials || ''}
\`\`\`

Supporting files plan:

\`\`\`text
${input.supportingFilesPlan || ''}
\`\`\`

Reference files to create:

\`\`\`text
${input.referenceFiles || ''}
\`\`\`

Script plan:

\`\`\`text
${input.scriptPlan || ''}
\`\`\`

Script stubs to create:

\`\`\`text
${input.scriptFiles || ''}
\`\`\`

Asset placeholders to create:

\`\`\`text
${input.assetFiles || ''}
\`\`\`

Evaluation prompts:

\`\`\`text
${input.evalPrompts || ''}
\`\`\`

Target-surface notes:

\`\`\`text
${input.targetNotes || ''}
\`\`\`

External systems:

\`\`\`text
${input.externalSystems || ''}
\`\`\`

Security notes:

\`\`\`text
${input.securityNotes || ''}
\`\`\`

Please update workbench/${skillName}/brief.md, workbench/${skillName}/creation-plan.md, skills/${skillName}/SKILL.md, and any useful references, scripts, assets, or evals. Keep the result Claude-compatible rather than Codex-native.
`;
}

function buildSkillTemplate(
  name: string,
  description: string | undefined,
  targetSurface: TargetSurface,
  input: InteractiveSkillInput = {},
  createdSupportingFiles: CreatedSupportingFiles = {
    workflowModules: parseWorkflowModules(input.workflowModules),
    uploadedReferences: [],
    uploadedScripts: [],
    uploadedAssets: []
  }
): string {
  const safeDescription = description?.trim() || `Describe ${name}. Use when the user asks for this repeatable Claude skill workflow.`;
  const purpose = compactWhitespace(input.idea ?? '')
    || 'Use this skill for one repeatable Claude workflow. Replace this section with the specific outcome and quality bar.';
  const outputStandard = compactWhitespace(input.outputStandard ?? '');
  const externalSystems = compactWhitespace(input.externalSystems ?? '');
  const workflow = markdownNumberedList(input.workflowSteps)
    || '1. Confirm only the missing details that materially change the output.\n2. Follow the task-specific procedure for this skill.\n3. Use supporting files only when directly relevant.\n4. Validate the output against the quality checks before finalizing.';
  const extraQualityChecks = markdownList(input.qualityChecks, false);
  const edgeCases = markdownList(input.edgeCases, false);
  const supportingFilesPlan = markdownList(input.supportingFilesPlan, false);
  const referenceFiles = markdownList(prefixSupportingFiles(input.referenceFiles, 'references'), false);
  const scriptPlan = markdownList(input.scriptPlan, false);
  const scriptFiles = markdownList(prefixSupportingFiles(input.scriptFiles, 'scripts'), false);
  const assetFiles = markdownList(prefixSupportingFiles(input.assetFiles, 'assets'), false);
  const securityNotes = markdownList(input.securityNotes, false);
  const workflowModuleCallouts = renderWorkflowModuleCallouts(createdSupportingFiles.workflowModules);
  const uploadedReferences = markdownList(markdownFileList(createdSupportingFiles.uploadedReferences, 'imported reference file'), false);
  const uploadedScripts = markdownList(markdownFileList(createdSupportingFiles.uploadedScripts, 'imported script or helper'), false);
  const uploadedAssets = markdownList(markdownFileList(createdSupportingFiles.uploadedAssets, 'imported asset or template'), false);

  return `---
name: ${name}
description: ${quoteYamlString(safeDescription)}
---

# ${titleFromName(name)}

## Purpose

${purpose}

## Use This Skill When

- The user asks for this workflow by name or describes the same repeated task.
- The request matches the trigger contexts in the description.
${markdownList(input.triggerContexts, false)}

## Inputs To Gather

- User's target outcome
- Required source files, examples, templates, or constraints
- Target surface and runtime assumptions when they matter
${markdownList(input.inputsToGather, false)}

## Workflow

${workflow}

${workflowModuleCallouts ? `${workflowModuleCallouts}\n` : ''}
## Quality Checks

- The response follows the skill's repeatable workflow.
- Assumptions and external dependencies are explicit.
- Any generated files match the requested format and constraints.
${extraQualityChecks}
${outputStandard ? `- Output standard: ${outputStandard}\n` : ''}

${edgeCases ? `## Edge Cases\n\n${edgeCases}\n\n` : ''}
${externalSystems ? `## External Systems\n\n${externalSystems}\n\nPrefer documented MCP/tool access for external systems. Do not hardcode secrets or invent unsupported network behavior.\n\n` : ''}
${securityNotes ? `## Security Notes\n\n${securityNotes}\n\n` : ''}

## Supporting Files

- Read \`references/\` files only when their topic is relevant.
- Run \`scripts/\` only for deterministic operations they document.
- Use \`assets/\` only when producing outputs that need those files.
${supportingFilesPlan}
${referenceFiles}
${uploadedReferences}
${scriptFiles}
${uploadedScripts}
${assetFiles}
${uploadedAssets}
${scriptPlan ? `\n\n## Script Rules\n\n${scriptPlan}\n\nScripts should be non-interactive, expose \`--help\`, write structured stdout when useful, and explain failures on stderr.` : ''}

## Runtime Notes

Target surface: ${targetSurfaceLabel(targetSurface)}

${surfaceGuidance(targetSurface)}
`;
}

function buildEvalTemplate(name: string, input: InteractiveSkillInput = {}): string {
  const customPrompts = splitLines(input.evalPrompts);
  const triggerPrompts = splitLines(input.triggerContexts);
  const nonTriggerPrompts = splitLines(input.shouldNotTrigger);
  const evals = [
    {
      id: 'happy-path',
      prompt: customPrompts[0] ?? `Use the ${name} skill for a representative user request.`,
      expected_output: 'The response follows the skill workflow and states important assumptions.',
      files: [],
      assertions: []
    },
    {
      id: 'incomplete-input',
      prompt: customPrompts[1] ?? `Handle an incomplete request that might need the ${name} skill.`,
      expected_output: 'The response asks only necessary clarifying questions or chooses a documented conservative default.',
      files: [],
      assertions: []
    },
    {
      id: 'edge-case',
      prompt: customPrompts[2] ?? `Handle an edge case for the ${name} skill without over-triggering unrelated workflows.`,
      expected_output: 'The response handles edge cases according to the skill and avoids unsupported assumptions.',
      files: [],
      assertions: []
    }
  ];

  return `${JSON.stringify({
    skill_name: name,
    evals,
    trigger_evals: {
      should_trigger: triggerPrompts.length > 0 ? triggerPrompts : [
        `Help me with ${name}.`
      ],
      should_not_trigger: nonTriggerPrompts.length > 0 ? nonTriggerPrompts : [
        'Answer a general question unrelated to this skill.'
      ]
    }
  }, null, 2)}
`;
}

function markdownValue(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed || '-';
}

function splitLines(value: string | undefined): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

type SupportingFileSpec = {
  fileName: string;
  description: string;
};

function parseWorkflowModules(value: string | undefined): WorkflowModuleSpec[] {
  return splitLines(value)
    .map((line, index) => {
      const cleaned = line
        .replace(/^\d+\.\s*/, '')
        .replace(/^-+\s*/, '')
        .trim();
      const separatorIndex = cleaned.indexOf(':');
      const rawTitle = separatorIndex >= 0 ? cleaned.slice(0, separatorIndex).trim() : cleaned;
      const description = separatorIndex >= 0 ? cleaned.slice(separatorIndex + 1).trim() : '';
      const slug = slugify(rawTitle).slice(0, 48).replace(/-+$/g, '') || `module-${index + 1}`;
      const order = index + 1;

      return {
        order,
        slug,
        title: titleFromName(slug),
        description: description || `Use this module when the ${titleFromName(slug).toLowerCase()} stage is relevant.`,
        fileName: `${String(order).padStart(2, '0')}-${slug}.md`
      };
    });
}

function parseSupportingFileSpecs(value: string | undefined, defaultExtension: string): SupportingFileSpec[] {
  return splitLines(value)
    .map((line) => {
      const separatorIndex = line.indexOf(':');
      const rawName = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
      const description = separatorIndex >= 0 ? line.slice(separatorIndex + 1).trim() : '';
      const fileName = sanitizeRelativeFileName(rawName.trim(), defaultExtension);
      return fileName ? { fileName, description } : undefined;
    })
    .filter((spec): spec is SupportingFileSpec => spec !== undefined);
}

function sanitizeRelativeFileName(value: string, defaultExtension: string): string | undefined {
  const cleaned = value
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/\.{2,}/g, '.');

  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return undefined;
  }

  return ensureExtension(cleaned, defaultExtension);
}

function ensureExtension(fileName: string, extension: string): string {
  return path.extname(fileName) ? fileName : `${fileName}${extension}`;
}

function ensureScriptExtension(fileName: string): string {
  const extension = path.extname(fileName);
  return extension ? fileName : `${fileName}.py`;
}

function buildReferenceStub(fileName: string, description: string): string {
  return `# ${titleFromName(path.basename(fileName, path.extname(fileName)))}

## Purpose

${description || 'Describe what Claude should learn from this reference file and when to read it.'}

## Use When

-

## Reference Notes

-
`;
}

function buildWorkflowModuleStub(module: WorkflowModuleSpec): string {
  return `# ${module.title}

## When To Read

${module.description}

## Instructions

- Use this module for the \`${module.slug}\` stage of the workflow.
- Apply only the guidance that is relevant to the user's current request.
- Return to \`SKILL.md\` after completing this module.

## Procedure

-

## Output Checks

-
`;
}

function renderWorkflowModuleCallouts(modules: WorkflowModuleSpec[]): string {
  if (modules.length === 0) {
    return '';
  }

  return `## Workflow Modules

Use these ordered modules for progressive disclosure. Read a module only when its stage is relevant.

${modules
  .sort((left, right) => left.order - right.order)
  .map((module) => `${module.order}. Read \`references/${module.fileName}\` when ${module.description}`)
  .join('\n')}
`;
}

function buildScriptStub(fileName: string, description: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === '.js' || extension === '.mjs') {
    return `#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log(JSON.stringify({
    name: '${fileName}',
    description: '${escapeForSingleQuotedJs(description || 'Deterministic helper for this Claude skill.')}',
    usage: 'node ${fileName} --input <path>'
  }, null, 2));
  process.exit(0);
}

console.error('Not implemented. Add deterministic, non-interactive behavior before using this script.');
process.exit(2);
`;
  }

  return `#!/usr/bin/env python3
"""${escapeTripleQuotedPython(description || 'Deterministic helper for this Claude skill.')}"""

import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", help="Optional input file path.")
    args = parser.parse_args()

    print(json.dumps({
        "status": "not_implemented",
        "input": args.input,
        "message": "Add deterministic, non-interactive behavior before using this script."
    }, indent=2))
    return 2


if __name__ == "__main__":
    sys.exit(main())
`;
}

function buildAssetsReadme(skillName: string, specs: SupportingFileSpec[]): string {
  return `# Assets For ${titleFromName(skillName)}

Binary or template assets should be copied into this directory manually.

${specs.map((spec) => `## ${spec.fileName}\n\n${spec.description || 'Describe the asset and how Claude should use it.'}`).join('\n\n')}
`;
}

function prefixSupportingFiles(value: string | undefined, folder: string): string {
  return parseSupportingFileSpecs(value, '.md')
    .map((spec) => `${folder}/${spec.fileName}: ${spec.description || 'planned supporting file'}`)
    .join('\n');
}

function markdownFileList(files: string[], note: string): string {
  return files.map((file) => `${file}: ${note}`).join('\n');
}

function markdownList(value: string | undefined, placeholder = true): string {
  const lines = splitLines(value);

  if (lines.length === 0) {
    return placeholder ? '-' : '';
  }

  return lines
    .map((line) => line.startsWith('- ') ? line : `- ${line.replace(/^-+/, '').trim()}`)
    .join('\n');
}

function markdownNumberedList(value: string | undefined): string {
  const lines = (value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return '';
  }

  return lines
    .map((line, index) => `${index + 1}. ${line.replace(/^\d+\.\s*/, '').replace(/^-+/, '').trim()}`)
    .join('\n');
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function shorten(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const clipped = value.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  return `${clipped}...`.slice(0, maxLength);
}

function titleFromName(name: string): string {
  return name
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function targetSurfaceLabel(targetSurface: TargetSurface): string {
  switch (targetSurface) {
    case 'claude-ai':
      return 'Claude.ai';
    case 'claude-code':
      return 'Claude Code';
    case 'claude-api':
      return 'Claude API';
    case 'portable':
    default:
      return 'portable Anthropic skill';
  }
}

function surfaceGuidance(targetSurface: TargetSurface): string {
  switch (targetSurface) {
    case 'claude-ai':
      return '- Package as a ZIP with the skill folder preserved inside the archive.\n- Keep the description short enough for Claude.ai upload.\n- Clearly label any package-install assumptions as Claude.ai-specific.\n- Test several prompts after upload.';
    case 'claude-code':
      return '- Sync to ~/.claude/skills/<skill-name>/ for personal testing or .claude/skills/<skill-name>/ for project testing.\n- Direct invocation is /skill-name.\n- Use Claude Code-specific frontmatter only when intentionally needed.';
    case 'claude-api':
      return '- Skills run through code execution and container.skills.\n- Verify current beta headers and API request shape before deployment.\n- Do not assume network access or runtime package installation.\n- Pin specific skill versions for production stability.';
    case 'portable':
    default:
      return '- Keep the skill portable by default.\n- Do not assume network access, runtime package installation, or MCP availability unless requested.\n- Avoid product-specific frontmatter unless a target surface requires it.';
  }
}

function quoteYamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function escapeForSingleQuotedJs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapeTripleQuotedPython(value: string): string {
  return value.replace(/"""/g, '\\"\\"\\"');
}

function getNonce(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index++) {
    nonce += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return nonce;
}
