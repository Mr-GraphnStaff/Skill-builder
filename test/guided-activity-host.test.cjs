const test = require('node:test');
const assert = require('node:assert/strict');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../out/skill-workbench.js');

test('activity retains actual waiting and errors without upgrading superseded work to success', async () => {
  const snapshots = [];
  const controller = new GuidedWorkbenchController(undefined, {
    chooseWorkspace: async () => { throw new Error('Picker unavailable'); },
    onState: state => snapshots.push(structuredClone(state.activity))
  });
  await controller.dispatch({ action: 'chooseWorkspace' });
  assert.ok(snapshots.some(entries => entries?.some(item => item.status === 'waiting')));
  assert.equal(controller.state.activity[0].status, 'failed');
  assert.equal(controller.state.activity.at(-1).status, 'failed');
  assert.ok(!controller.state.activity.some(item => item.status === 'succeeded'));
  assert.match(controller.state.error, /Picker unavailable/);
});

test('activity remains bounded across actions and autosave does not replace activity', async () => {
  const controller = new GuidedWorkbenchController(undefined);
  for (let i = 0; i < 55; i++) await controller.dispatch({ action: 'showCreate' });
  assert.equal(controller.state.activity.length, 100);
  assert.equal(new Set(controller.state.activity.map(item => item.id)).size, 100);
  const earlier = structuredClone(controller.state.activity);
  await controller.dispatch({ action: 'save' });
  assert.deepEqual(controller.state.activity, earlier);
});

test('an invalid structural check reports findings without a successful action or phase', async t => {
  const qa = path.resolve(__dirname, '../dist'); fs.mkdirSync(qa, { recursive: true });
  const root = fs.mkdtempSync(path.join(qa, 'activity-invalid-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, 'input'); fs.mkdirSync(input);
  fs.writeFileSync(path.join(input, 'SKILL.md'), '---\nname: activity-notes\ndescription: Summarize supplied notes. Use when preparing notes.\n---\n\n# Notes\nKeep facts.\n');
  const skill = core.registerSkillFolder(root, input);
  const controller = new GuidedWorkbenchController(root);
  await controller.dispatch({ action: 'resume', payload: { id: skill.id } });
  fs.unlinkSync(path.join(skill.sourcePath, 'SKILL.md'));
  // Clear the prior successful open so only this check is evaluated.
  controller.state.activity = [];
  await controller.dispatch({ action: 'check' });
  assert.equal(controller.state.check.valid, false);
  assert.ok(controller.state.activity.some(item => item.status === 'failed'));
  assert.ok(!controller.state.activity.some(item => item.status === 'succeeded'));
  controller.state.activity = [];
  await controller.dispatch({ action: 'preparePublish' });
  assert.equal(controller.state.check.valid, false);
  assert.ok(controller.state.activity.some(item => item.status === 'failed'));
  assert.ok(!controller.state.activity.some(item => item.status === 'succeeded'));
});
