const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const { renderGuidedWorkbench, renderGuidedLauncher } = require('../out/guided-workbench-html.js');
const { activityForAction } = require('../out/guided-activity.js');

const base = { step: 'check', hasWorkspace: true, target: 'portable', repositories: [], drafts: [], library: [], files: [] };
const nonce = 'sanityCheckUiNonce';

test('guided Sanity check keeps application advice outside structural findings', async t => {
  const dist = require('./working-fixture.cjs').workingFixture('sanity-ui'); fs.mkdirSync(dist, { recursive: true });
  const root = fs.mkdtempSync(path.join(dist, 'sanity-ui-'));
  t.after(() => { assert.equal(path.dirname(root), dist); fs.rmSync(root, { recursive: true, force: true }); });
  const controller = new GuidedWorkbenchController(root);
  await controller.dispatch({ action: 'createSkill', payload: { name: 'sanity-only', description: 'Preserve application metadata.', instructions: '# Instructions\nRead the supplied notes.' } });
  assert.equal(controller.state.error, undefined);
  const skillRoot = path.join(root, 'skills', 'sanity-only');
  const manifest = path.join(skillRoot, 'SKILL.md');
  fs.writeFileSync(manifest, fs.readFileSync(manifest, 'utf8').replace('---\n', '---\ncontext: fork\nallowed-tools: ApplicationSpecificTool\n'));
  fs.mkdirSync(path.join(skillRoot, 'agents'));
  fs.writeFileSync(path.join(skillRoot, 'agents/openai.yaml'), 'interface: [application-specific, malformed');
  const before = fs.readFileSync(manifest);
  for (const target of ['portable', 'claude', 'codex']) {
    await controller.dispatch({ action: 'setTarget', payload: { target } });
    await controller.dispatch({ action: 'check' });
    assert.equal(controller.state.error, undefined);
    assert.equal(controller.state.check.valid, true);
    assert.deepEqual(controller.state.check.errors, []);
    assert.deepEqual(controller.state.check.warnings, []);
    assert.match(controller.state.check.compatibility, /Application compatibility was not tested/);
    assert.doesNotMatch(controller.state.check.compatibility, /structure checked|compatible with/i);
  }
  assert.deepEqual(fs.readFileSync(manifest), before);
});

test('Sanity check explains its scope and never gives informational notes a Fix action', () => {
  const html = renderGuidedWorkbench({ ...base, check: { valid: true, errors: [], warnings: [{ message: 'Informational structural note.', file: 'SKILL.md' }], compatibility: 'Application compatibility was not tested.', behaviorNote: 'No AI model was run.' } }, nonce);
  assert.match(html, /Ready to build/);
  assert.match(html, /files passed the structural check/);
  assert.match(html, /does not run an assistant or scan for security threats/);
  assert.match(html, /Notes \(1\)/);
  assert.doesNotMatch(html, /data-action="openFile" data-path="SKILL.md"/);
  assert.doesNotMatch(html, /Compatibility and manual testing|Passed — local checks/);
  assert.match(html, /data-action="preparePublish"/);
  const error = renderGuidedWorkbench({ ...base, check: { valid: false, errors: [{ message: 'Name is required.', file: 'SKILL.md' }], warnings: [], compatibility: '', behaviorNote: '' } }, nonce);
  assert.match(error, /data-action="openFile" data-path="SKILL.md"/);
  assert.match(error, /id="primary-action"[^>]*data-action="edit"/);
});

test('Editor offers Build Share directly while structural validation still runs before review', async t => {
  const html = renderGuidedWorkbench({ ...base, step: 'edit', active: { id: 'draft', name: 'draft' } }, nonce);
  assert.match(html, /id="primary-action"[^>]*data-action="preparePublish"[^>]*>Build \/ Share/);
  assert.doesNotMatch(html, /Step 3:|aria-current="step"/);
  assert.doesNotMatch(html, /Check and continue|Changing the target updates local compatibility checks/);
  assert.equal(activityForAction('check'), 'Running a structural sanity check…');
  assert.match(renderGuidedLauncher(nonce), /id="open-workbench">Open SkillJetty/);
  assert.doesNotMatch(renderGuidedLauncher(nonce), /Edit and run Sanity check/);
  const scratchBase = require('./working-fixture.cjs').workingFixture('direct-build-check');
  fs.mkdirSync(scratchBase, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratchBase, 'project-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const controller = new GuidedWorkbenchController(root);
  await controller.dispatch({ action: 'createSkill', payload: { name: 'direct-check', description: 'Summarize notes when asked.', instructions: '# Notes\nKeep facts.' } });
  await controller.dispatch({ action: 'preparePublish' });
  assert.equal(controller.state.error, undefined);
  assert.equal(controller.state.check.valid, true);
  assert.equal(controller.state.step, 'publish');
});
