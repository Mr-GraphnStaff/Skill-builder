import path from 'node:path';

export type FindingSeverity = 'error' | 'warning' | 'info';

export type SkillFinding = {
  severity: FindingSeverity;
  category: 'structure' | 'quality' | 'security' | 'evaluation';
  code: string;
  message: string;
  file?: string;
};

export type SkillFile = {
  relativePath: string;
  content?: string;
  size: number;
};

export type SkillAnalysis = {
  score: number;
  findings: SkillFinding[];
  counts: Record<FindingSeverity, number>;
};

export type EvalCase = {
  id: string | number;
  prompt: string;
  expected_output?: string;
  files?: string[];
  assertions?: unknown[];
};

export type EvalSuite = {
  skill_name?: string;
  evals?: EvalCase[];
  trigger_evals?: {
    should_trigger?: string[];
    should_not_trigger?: string[];
  };
};

export type EvalCaseResult = {
  id: string;
  status: 'ready' | 'needs-work';
  checks: Array<{ name: string; passed: boolean; detail: string }>;
};

export type EvalRun = {
  version: 1;
  skillName: string;
  createdAt: string;
  kind: 'deterministic-preflight';
  summary: { ready: number; needsWork: number; total: number };
  cases: EvalCaseResult[];
  triggerChecks: Array<{ prompt: string; expectation: 'should-trigger' | 'should-not-trigger'; passed: boolean; detail: string }>;
  note: string;
};

const PORTABLE_FRONTMATTER = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const CLAUDE_CODE_ONLY_FRONTMATTER = new Set([
  'argument-hint', 'arguments', 'context', 'agent', 'disable-model-invocation', 'user-invocable', 'disallowed-tools', 'hooks', 'model'
]);
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.ini', '.env', '.js', '.mjs', '.cjs', '.ts', '.py', '.sh', '.ps1', '.csv', '.tsv']);

export function analyzeSkill(manifest: string, files: SkillFile[], directoryName: string): SkillAnalysis {
  const findings: SkillFinding[] = [];
  const frontmatter = parseFrontmatter(manifest);
  const name = unquote(frontmatter.get('name') ?? '');
  const description = unquote(frontmatter.get('description') ?? '');
  const lines = manifest.split(/\r?\n/).length;

  if (!name) {
    findings.push(finding('error', 'structure', 'missing-name', 'SKILL.md is missing the required name field.', 'SKILL.md'));
  } else if (name !== directoryName) {
    findings.push(finding('error', 'structure', 'name-directory-mismatch', `The frontmatter name "${name}" does not match the folder "${directoryName}".`, 'SKILL.md'));
  }

  if (!description) {
    findings.push(finding('error', 'structure', 'missing-description', 'SKILL.md is missing the required description field.', 'SKILL.md'));
  } else {
    if (description.length > 1024) {
      findings.push(finding('error', 'quality', 'description-too-long', 'The description exceeds the portable 1,024-character baseline.', 'SKILL.md'));
    }
    if (description.length < 35 || !/\b(use when|use for|trigger|when the user)\b/i.test(description)) {
      findings.push(finding('warning', 'quality', 'weak-trigger-description', 'The description should state both what the skill does and when it should be used.', 'SKILL.md'));
    }
  }

  if (lines > 500) {
    findings.push(finding('warning', 'quality', 'large-manifest', `SKILL.md is ${lines} lines; move conditional detail into referenced files.`, 'SKILL.md'));
  }

  for (const key of frontmatter.keys()) {
    if (!PORTABLE_FRONTMATTER.has(key) && !CLAUDE_CODE_ONLY_FRONTMATTER.has(key)) {
      findings.push(finding('warning', 'structure', 'unknown-frontmatter', `Frontmatter field "${key}" may not be accepted by Anthropic upload surfaces.`, 'SKILL.md'));
    }
  }

  const placeholders = /\b(TODO|TBD|FIXME|not implemented|replace this section|describe what claude should learn)\b/i;
  const referencedPaths = new Set([...manifest.matchAll(/(?:`|\()((?:references|scripts|assets)\/[A-Za-z0-9_./-]+)(?:`|\))/g)].map((match) => normalizePath(match[1])));

  for (const file of files) {
    const normalized = normalizePath(file.relativePath);
    const content = file.content ?? '';
    const extension = path.extname(normalized).toLowerCase();

    if (file.size > 25 * 1024 * 1024) {
      findings.push(finding('warning', 'security', 'large-file', `${normalized} is larger than 25 MB and may make packaging or upload unreliable.`, normalized));
    }
    if (content && placeholders.test(content)) {
      findings.push(finding('warning', 'quality', 'unfinished-placeholder', `${normalized} contains unfinished scaffold language.`, normalized));
    }
    if (/^(references|scripts|assets)\//.test(normalized) && !referencedPaths.has(normalized) && normalized !== 'assets/README.md') {
      findings.push(finding('info', 'quality', 'unreferenced-supporting-file', `${normalized} is not referenced from SKILL.md.`, normalized));
    }
    if (content && TEXT_EXTENSIONS.has(extension)) {
      scanTextFile(normalized, content, findings);
    }
  }

  const hasEvals = files.some((file) => normalizePath(file.relativePath) === 'evals/evals.json');
  if (!hasEvals) {
    findings.push(finding('warning', 'evaluation', 'missing-evals', 'Add evals/evals.json with realistic, edge-case, and trigger prompts.'));
  }

  const counts = {
    error: findings.filter((item) => item.severity === 'error').length,
    warning: findings.filter((item) => item.severity === 'warning').length,
    info: findings.filter((item) => item.severity === 'info').length
  };
  return { score: Math.max(0, 100 - counts.error * 25 - counts.warning * 8 - counts.info * 2), findings, counts };
}

export function parseEvalSuite(content: string): EvalSuite {
  const parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('evals/evals.json must contain a JSON object.');
  }
  return parsed as EvalSuite;
}

export function runEvalPreflight(skillName: string, description: string, suite: EvalSuite, now = new Date()): EvalRun {
  const cases = (suite.evals ?? []).map((test, index): EvalCaseResult => {
    const prompt = typeof test.prompt === 'string' ? test.prompt.trim() : '';
    const expected = typeof test.expected_output === 'string' ? test.expected_output.trim() : '';
    const assertions = Array.isArray(test.assertions) ? test.assertions : [];
    const checks = [
      { name: 'prompt', passed: prompt.length >= 12, detail: prompt.length >= 12 ? 'Prompt is present and specific enough to run.' : 'Add a realistic user prompt.' },
      { name: 'expected-output', passed: expected.length >= 12, detail: expected.length >= 12 ? 'Expected behavior is described.' : 'Describe the expected behavior or artifact.' },
      { name: 'assertions', passed: assertions.length > 0, detail: assertions.length > 0 ? `${assertions.length} assertion(s) supplied.` : 'Add objective assertions where the outcome can be measured.' }
    ];
    return {
      id: String(test.id ?? `eval-${index + 1}`),
      status: checks.slice(0, 2).every((check) => check.passed) ? 'ready' : 'needs-work',
      checks
    };
  });

  const triggerChecks = [
    ...(suite.trigger_evals?.should_trigger ?? []).map((prompt) => triggerCheck(description, prompt, 'should-trigger')),
    ...(suite.trigger_evals?.should_not_trigger ?? []).map((prompt) => triggerCheck(description, prompt, 'should-not-trigger'))
  ];
  const ready = cases.filter((item) => item.status === 'ready').length;

  return {
    version: 1,
    skillName,
    createdAt: now.toISOString(),
    kind: 'deterministic-preflight',
    summary: { ready, needsWork: cases.length - ready, total: cases.length },
    cases,
    triggerChecks,
    note: 'This preflight verifies evaluation readiness and approximate trigger separation. It does not execute Claude or claim behavioral improvement.'
  };
}

function triggerCheck(description: string, prompt: string, expectation: 'should-trigger' | 'should-not-trigger') {
  const descriptionWords = significantWords(description);
  const promptWords = [...significantWords(prompt)];
  const overlap = promptWords.filter((word) => descriptionWords.has(word));
  const likelyMatch = overlap.length >= Math.min(2, Math.max(1, Math.floor(promptWords.length / 4)));
  const passed = expectation === 'should-trigger' ? likelyMatch : !likelyMatch;
  return {
    prompt,
    expectation,
    passed,
    detail: `${overlap.length} meaningful description term(s) overlap: ${overlap.slice(0, 6).join(', ') || 'none'}. This is a heuristic, not a model invocation.`
  };
}

function scanTextFile(file: string, content: string, findings: SkillFinding[]): void {
  const patterns: Array<[RegExp, FindingSeverity, string, string]> = [
    [/AKIA[0-9A-Z]{16}/, 'error', 'aws-access-key', 'Possible AWS access key detected.'],
    [/(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i, 'error', 'possible-secret', 'Possible hardcoded credential detected.'],
    [/\b(?:Invoke-WebRequest|curl|wget|fetch\s*\(|axios\.|requests\.(?:get|post)|https?\.request)\b/i, 'warning', 'network-call', 'Network-capable code requires explicit trust and runtime documentation.'],
    [/\b(?:child_process|execSync|spawnSync|subprocess\.|os\.system|Start-Process)\b/i, 'warning', 'process-execution', 'Process execution requires explicit documentation and review.'],
    [/\b(?:rm\s+-rf|Remove-Item\s+.*-Recurse|rmtree\s*\(|fs\.rmSync?\s*\().*/i, 'warning', 'destructive-operation', 'Potentially destructive filesystem operation detected.'],
    [/allowed-tools:\s*[^\n]*(?:Bash\(\*|Bash\s*$)/im, 'warning', 'broad-tool-grant', 'Broad Claude Code tool pre-approval should be narrowed before use.']
  ];
  for (const [pattern, severity, code, message] of patterns) {
    if (pattern.test(content)) {
      findings.push(finding(severity, 'security', code, message, file));
    }
  }
}

function parseFrontmatter(markdown: string): Map<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  const values = new Map<string, string>();
  if (!match) return values;
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (field) values.set(field[1], field[2].trim());
  }
  return values;
}

function significantWords(value: string): Set<string> {
  const stop = new Set(['this', 'that', 'with', 'from', 'when', 'user', 'skill', 'help', 'create', 'asks', 'should', 'into', 'your', 'about', 'general']);
  return new Set((value.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter((word) => !stop.has(word)));
}

function unquote(value: string): string {
  return value.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2').trim();
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function finding(severity: FindingSeverity, category: SkillFinding['category'], code: string, message: string, file?: string): SkillFinding {
  return { severity, category, code, message, file };
}
