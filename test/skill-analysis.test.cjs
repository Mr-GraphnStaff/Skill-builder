const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeSkill, parseEvalSuite, runEvalPreflight } = require('../out/skill-analysis.js');

test('analyzeSkill accepts a focused, referenced skill', () => {
  const manifest = `---
name: report-writer
description: Create concise status reports. Use when the user asks to turn project updates into an executive report.
---

# Report Writer

## Workflow

Read \`references/style.md\` and draft the report.

## Quality Checks

- Keep claims grounded.
`;
  const result = analyzeSkill(manifest, [
    { relativePath: 'SKILL.md', content: manifest, size: manifest.length },
    { relativePath: 'references/style.md', content: '# Style\n\nUse plain language.\n', size: 30 },
    { relativePath: 'evals/evals.json', content: '{}', size: 2 }
  ], 'report-writer');

  assert.equal(result.counts.error, 0);
  assert.equal(result.findings.some((finding) => finding.code === 'unreferenced-supporting-file'), false);
});

test('analyzeSkill detects trust and quality problems', () => {
  const manifest = `---
name: wrong-name
description: Does things
---

# Draft

TODO replace this section.
`;
  const result = analyzeSkill(manifest, [
    { relativePath: 'SKILL.md', content: manifest, size: manifest.length },
    { relativePath: 'scripts/run.py', content: 'import os\nos.system("curl https://example.test")\n', size: 50 }
  ], 'safe-name');
  const codes = new Set(result.findings.map((finding) => finding.code));

  assert.ok(codes.has('name-directory-mismatch'));
  assert.ok(codes.has('weak-trigger-description'));
  assert.ok(codes.has('unfinished-placeholder'));
  assert.ok(codes.has('network-call'));
  assert.ok(codes.has('process-execution'));
  assert.ok(codes.has('missing-evals'));
});

test('parseEvalSuite rejects non-object JSON', () => {
  assert.throws(() => parseEvalSuite('[]'), /JSON object/);
});

test('runEvalPreflight persists honest readiness and trigger results', () => {
  const run = runEvalPreflight('status-report', 'Create executive status reports. Use when asked for weekly project reporting.', {
    evals: [
      { id: 'happy', prompt: 'Create a weekly project status report from these updates.', expected_output: 'A concise executive report.', assertions: ['Has blockers'] },
      { id: 'bad', prompt: '', expected_output: '' }
    ],
    trigger_evals: {
      should_trigger: ['Write a weekly project status report.'],
      should_not_trigger: ['Explain how photosynthesis works.']
    }
  }, new Date('2026-09-03T12:00:00.000Z'));

  assert.deepEqual(run.summary, { ready: 1, needsWork: 1, total: 2 });
  assert.equal(run.createdAt, '2026-09-03T12:00:00.000Z');
  assert.equal(run.triggerChecks.every((check) => check.passed), true);
  assert.match(run.note, /does not execute Claude/);
});
