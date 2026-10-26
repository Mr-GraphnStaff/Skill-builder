import { readGuidedFile, listGuidedFiles } from './guided-workspace.js';
import type { WorkbenchSkill } from './skill-workbench.js';
import type { SkillTarget } from './guided-contract.js';

const yaml: { load(value: string): unknown } = require('js-yaml');
const common = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const claude = new Set(['argument-hint', 'arguments', 'context', 'agent', 'disable-model-invocation', 'user-invocable', 'disallowed-tools', 'hooks', 'model']);
export function checkSkillCompatibility(skill: WorkbenchSkill, target: SkillTarget) {
  const warnings: { message: string; file?: string }[] = [];
  const text = readGuidedFile(skill, 'SKILL.md');
  const block = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  const frontmatter = block ? yaml.load(block[1]) as Record<string, unknown> : {};
  for (const key of Object.keys(frontmatter ?? {})) {
    if (!common.has(key) && !(target === 'claude' && claude.has(key))) warnings.push({ message: `“${key}” is an application-specific setting. Confirm support in your selected application before using this skill.`, file: 'SKILL.md' });
  }
  const files = listGuidedFiles(skill);
  if (files.some(file => file.path === 'agents/openai.yaml')) {
    try {
      const data = yaml.load(readGuidedFile(skill, 'agents/openai.yaml'));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected a YAML mapping.');
    } catch { warnings.push({ message: 'agents/openai.yaml could not be read as a YAML mapping. Correct the OpenAI metadata before using that integration.', file: 'agents/openai.yaml' }); }
    if (target !== 'codex') warnings.push({ message: 'OpenAI-specific UI and dependency metadata is preserved in agents/openai.yaml; other applications may ignore it.', file: 'agents/openai.yaml' });
  }
  if (frontmatter?.['allowed-tools']) warnings.push({ message: 'Tool names and permission settings depend on the application. This check does not establish tool availability or grant permissions.', file: 'SKILL.md' });
  const names: Record<SkillTarget, string> = { portable: 'Portable Agent Skills', claude: 'Claude', codex: 'ChatGPT / Codex', gemini: 'Gemini CLI', copilot: 'GitHub Copilot' };
  return { warnings, compatibility: `${names[target]}: structure checked; application-specific settings require review.`, behaviorNote: 'No model was run. Format checks do not prove behavior, tool availability, or successful installation in any AI application.' };
}
