import * as fs from 'node:fs/promises';
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
    vscode.commands.registerCommand('skillBuilder.packageSkill', async (item?: SkillItem) => {
      const skill = item?.skill ?? await pickSkill(provider);
      if (!skill) {
        return;
      }
      const outputPath = await packageSkill(skill);
      if (outputPath) {
        const action = await vscode.window.showInformationMessage(
          `Packaged ${skill.name} to ${outputPath}.`,
          'Reveal',
          'Copy Path'
        );

        if (action === 'Reveal') {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputPath));
        } else if (action === 'Copy Path') {
          await vscode.env.clipboard.writeText(outputPath);
        }
      }
    }),
    vscode.commands.registerCommand('skillBuilder.validateSkill', async (item?: SkillItem) => {
      const skill = item?.skill ?? await pickSkill(provider);
      if (!skill) {
        return;
      }
      validateSkill(skill);
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
    const root = getWorkspaceRoot();
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
  if (items.length === 0) {
    vscode.window.showInformationMessage('No skills found in the configured skills directory.');
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    items.map((item) => ({
      label: item.skill.name,
      description: item.skill.directoryName,
      detail: item.skill.description,
      skill: item.skill
    })),
    { placeHolder: 'Select a skill' }
  );

  return picked?.skill;
}

async function createSkill(): Promise<SkillSummary | undefined> {
  const root = getWorkspaceRoot();
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

  const description = await vscode.window.showInputBox({
    title: 'Skill Description',
    prompt: 'Describe what the skill does and when Claude should use it.',
    placeHolder: 'Create executive customer briefings. Use when the user asks for concise account, stakeholder, or meeting prep briefings.'
  });

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
  await fs.writeFile(manifestPath, buildSkillTemplate(skillName, description), 'utf8');
  await fs.writeFile(path.join(skillPath, 'evals', 'evals.json'), buildEvalTemplate(skillName), 'utf8');

  return readSkill(skillPath);
}

async function packageSkill(skill: SkillSummary): Promise<string | undefined> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Open a workspace folder before packaging a skill.');
    return undefined;
  }

  const distDirectory = getDistDirectory(root);
  const outputPath = path.join(distDirectory, `${skill.directoryName}.skill`);

  await fs.mkdir(distDirectory, { recursive: true });

  const zip = new AdmZip();
  zip.addLocalFolder(skill.skillPath, skill.directoryName);
  zip.writeZip(outputPath);

  return outputPath;
}

function validateSkill(skill: SkillSummary) {
  const terminal = vscode.window.createTerminal({ name: `Validate ${skill.name}` });
  terminal.show();
  terminal.sendText(`skills-ref validate "${skill.skillPath}"`);
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

function getSkillsDirectory(root: string): string {
  const configured = vscode.workspace.getConfiguration('skillBuilder').get<string>('skillsDirectory', 'skills');
  return path.resolve(root, configured);
}

function getDistDirectory(root: string): string {
  const configured = vscode.workspace.getConfiguration('skillBuilder').get<string>('distDirectory', 'dist');
  return path.resolve(root, configured);
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

function buildSkillTemplate(name: string, description?: string): string {
  const safeDescription = description?.trim() || `Describe ${name}. Use when the user asks for this repeatable Claude skill workflow.`;

  return `---
name: ${name}
description: ${safeDescription}
---

# ${name}

## Purpose

Use this skill for one repeatable Claude workflow. Keep the source skill portable unless a specific Claude surface requires otherwise.

## Workflow

1. Confirm the user's target outcome and any runtime assumptions.
2. Follow the task-specific procedure for this skill.
3. Use supporting files only when they are directly relevant:
   - references/ for detailed guidance
   - scripts/ for deterministic helpers
   - assets/ for templates and static resources
4. Validate the output against the user's request before finalizing.

## Notes

- Do not hardcode secrets.
- Prefer MCP-oriented instructions for external systems.
- Keep product-specific assumptions explicit.
`;
}

function buildEvalTemplate(name: string): string {
  return `${JSON.stringify({
    skill: name,
    cases: [
      {
        id: 'basic-trigger',
        type: 'task',
        prompt: `Use the ${name} skill for a representative user request.`,
        expected: [
          'The response follows the skill workflow.',
          'The response states any important assumptions.'
        ]
      },
      {
        id: 'edge-case',
        type: 'task',
        prompt: `Handle an incomplete request that might need the ${name} skill.`,
        expected: [
          'The response asks only necessary clarifying questions or chooses a conservative default.'
        ]
      }
    ],
    triggerEvals: {
      shouldTrigger: [
        `Help me with ${name}.`
      ],
      shouldNotTrigger: [
        'Answer a general question unrelated to this skill.'
      ]
    }
  }, null, 2)}
`;
}
