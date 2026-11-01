const test = require('node:test');
const assert = require('node:assert/strict');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../out/skill-workbench.js');
const AdmZip = require('adm-zip');

function workflowFixture(t) {
  const qa = path.resolve(__dirname, '../dist'); fs.mkdirSync(qa, { recursive: true });
  const root = fs.mkdtempSync(path.join(qa, 'activity-workflows-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
async function createDraft(controller, name) {
  await controller.dispatch({ action: 'createSkill', payload: { name, description: 'Summarize supplied notes.', instructions: '# Notes\nKeep facts.' } });
  assert.equal(controller.state.error, undefined);
}

test('new skill workflows reset activity, while checks and autosave retain the current skill steps', async t => {
  const controller = new GuidedWorkbenchController(workflowFixture(t));
  await createDraft(controller, 'activity-first');
  await controller.dispatch({ action: 'check' });
  assert.ok(controller.state.activity.some(entry => entry.message === 'Structural check finished.'));
  await controller.dispatch({ action: 'startAnother' });
  assert.equal(controller.state.activity[0].id, 1);
  assert.equal(controller.state.activity[0].message, 'Opening your skills…');
  assert.ok(!controller.state.activity.some(entry => entry.message === 'Structural check finished.'));
  await controller.dispatch({ action: 'showCreate' });
  await createDraft(controller, 'activity-second');
  assert.equal(controller.state.active.id, 'activity-second');
  assert.deepEqual(controller.state.activity.map(entry => entry.id), [1, 2, 3]);
  assert.equal(controller.state.activity[0].message, 'Creating your local draft…');
  assert.equal(controller.state.activity[0].status, 'succeeded', 'completion follows the rebased operation');
  const firstSteps = structuredClone(controller.state.activity);
  const generation = controller.state.activityGeneration;
  await controller.dispatch({ action: 'check' });
  assert.deepEqual(controller.state.activity.slice(0, firstSteps.length), firstSteps);
  assert.ok(controller.state.activity.at(-1).id > firstSteps.at(-1).id);
  const checked = structuredClone(controller.state.activity);
  await controller.dispatch({ action: 'save' });
  assert.deepEqual(controller.state.activity, checked);
  await controller.dispatch({ action: 'preparePublish' });
  await controller.dispatch({ action: 'savePackage' });
  assert.equal(controller.state.error, undefined);
  const packaged = structuredClone(controller.state.activity);
  await controller.dispatch({ action: 'resume', payload: { id: 'activity-second' } });
  assert.equal(controller.state.error, undefined);
  assert.deepEqual(controller.state.activity.slice(0, packaged.length), packaged, 'continuing the same skill keeps its earlier steps');
  assert.equal(controller.state.activityGeneration, generation);
  await createDraft(controller, 'activity-third');
  assert.deepEqual(controller.state.activity.map(entry => entry.id), [1, 2, 3]);
  assert.ok(controller.state.activityGeneration > generation);
});

test('cancelled and failed openings preserve history; a successful import retains only its own real phases', async t => {
  const root = workflowFixture(t);
  let selected;
  const controller = new GuidedWorkbenchController(root, { pickPackage: async () => selected });
  await createDraft(controller, 'activity-existing');
  const generation = controller.state.activityGeneration;
  const earlier = structuredClone(controller.state.activity);
  await controller.dispatch({ action: 'openPackage' });
  assert.deepEqual(controller.state.activity.slice(0, earlier.length), earlier);
  assert.equal(controller.state.active.id, 'activity-existing');
  assert.equal(controller.state.activityGeneration, generation);
  const cancelled = structuredClone(controller.state.activity);
  await controller.dispatch({ action: 'openPackagePath', payload: { path: path.join(root, 'missing.skill') } });
  assert.ok(controller.state.error);
  assert.deepEqual(controller.state.activity.slice(0, cancelled.length), cancelled);
  assert.equal(controller.state.active.id, 'activity-existing');
  assert.equal(controller.state.activityGeneration, generation);
  const zip = new AdmZip();
  zip.addFile('activity-imported/SKILL.md', Buffer.from('---\nname: activity-imported\ndescription: Summarize supplied notes.\n---\n# Notes\n'));
  selected = path.join(root, 'import.skill'); zip.writeZip(selected);
  await controller.dispatch({ action: 'openPackage' });
  assert.equal(controller.state.error, undefined);
  assert.equal(controller.state.active.id, 'activity-imported');
  assert.ok(controller.state.activityGeneration > generation);
  assert.equal(controller.state.activity[0].id, 1);
  assert.equal(controller.state.activity[0].message, 'Choose a skill package in the VS Code dialog…');
  assert.equal(controller.state.activity[0].status, 'succeeded');
  assert.ok(controller.state.activity.some(entry => entry.message === 'Package bytes read.'));
  assert.ok(controller.state.activity.some(entry => entry.message === 'Extracted files written.'));
  assert.ok(!controller.state.activity.some(entry => entry.status === 'failed'));
  assert.deepEqual(controller.state.activity.map(entry => entry.id), controller.state.activity.map((_, index) => index + 1));
});

test('workspace cancellation and reselection keep history, while a changed workspace resets it', async t => {
  const root = workflowFixture(t), other = path.join(root, 'other-workspace');
  fs.mkdirSync(other);
  let selected;
  const controller = new GuidedWorkbenchController(root, { chooseWorkspace: async () => selected });
  await createDraft(controller, 'activity-workspace');
  const earlier = structuredClone(controller.state.activity);
  await controller.dispatch({ action: 'chooseWorkspace' });
  assert.deepEqual(controller.state.activity.slice(0, earlier.length), earlier);
  selected = root;
  const cancelled = structuredClone(controller.state.activity);
  await controller.dispatch({ action: 'chooseWorkspace' });
  assert.deepEqual(controller.state.activity.slice(0, cancelled.length), cancelled);
  selected = other;
  await controller.dispatch({ action: 'chooseWorkspace' });
  assert.equal(controller.state.error, undefined);
  assert.equal(controller.state.activity[0].id, 1);
  assert.equal(controller.state.activity[0].message, 'Choose a folder in the VS Code dialog…');
  assert.ok(!controller.state.activity.some(entry => entry.message === 'Creating your local draft…'));
});

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
