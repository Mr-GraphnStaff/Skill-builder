const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const { verifySkillRelease } = require('../out/skill-workbench.js');

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'human-skill-workflow-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = '---\nname: useful-notes\ndescription: Summarize supplied notes. Use when someone needs a clear summary.\nmetadata:\n  version: 2.13.0\n  custom: keep-me\n---\n\n# Instructions\nKeep supplied facts.\n';
  const archive = new AdmZip(); archive.addFile('useful-notes/SKILL.md', Buffer.from(original));
  archive.addFile('useful-notes/assets/data.bin', Buffer.from([0, 255, 13, 10]));
  const input = path.join(root, 'input.skill'); archive.writeZip(input);
  const inputBytes = fs.readFileSync(input), revealed = [];
  const controller = new GuidedWorkbenchController(root, { pickPackage: async () => input, revealFile: async file => revealed.push(file) });
  await controller.dispatch({ action: 'openPackage' });
  assert.equal(controller.state.error, undefined);
  return { root, original, input, inputBytes, controller, revealed };
}

test('a submitted skill identifies itself, generates notes and saves a usable package without Git or version entry', async t => {
  const f = await fixture(t), c = f.controller;
  assert.equal(c.state.active.version, '2.13.0');
  await c.dispatch({ action: 'preparePublish' });
  assert.equal(c.state.error, undefined);
  assert.equal(c.state.publish.version, '2.13.0');
  assert.equal(c.state.publish.changeSummary.added.length, 2);
  await c.dispatch({ action: 'savePackage' });
  assert.equal(c.state.error, undefined);
  assert.equal(c.state.receipt.local, true);
  assert.equal(c.state.receipt.version, '2.13.0');
  const release = verifySkillRelease(c.state.receipt.directory);
  assert.deepEqual(fs.readFileSync(f.input), f.inputBytes);
  assert.equal(new AdmZip(release.packagePath).readAsText('useful-notes/SKILL.md'), f.original);
  assert.match(fs.readFileSync(path.join(release.directory, 'CHANGELOG.md'), 'utf8'), /First saved release/);
  assert.ok(c.state.active, 'local saving keeps the editable draft');
  await c.dispatch({ action: 'revealPackage', payload: { path: '../../outside.skill' } });
  assert.deepEqual(f.revealed, [release.packagePath]);
});

test('changed work gets a new release automatically; identical work reuses its immutable saved package', async t => {
  const f = await fixture(t), c = f.controller;
  await c.dispatch({ action: 'preparePublish' }); await c.dispatch({ action: 'savePackage' });
  const first = c.state.receipt, bytes = fs.readFileSync(first.packagePath), id = c.state.active.id;
  await c.dispatch({ action: 'resume', payload: { id } });
  await c.dispatch({ action: 'preparePublish' });
  assert.equal(c.state.publish.version, '2.13.0');
  await c.dispatch({ action: 'savePackage' }); assert.equal(c.state.receipt.directory, first.directory);
  await c.dispatch({ action: 'resume', payload: { id } });
  await c.dispatch({ action: 'save', editorSkillId: id, editorPath: 'SKILL.md', editorContent: f.original + '\nUse concise sentences.\n' });
  await c.dispatch({ action: 'preparePublish' });
  assert.equal(c.state.publish.version, '2.13.1');
  assert.deepEqual(c.state.publish.changeSummary.changed, ['SKILL.md']);
  assert.match(c.state.publish.versionSource, /skill itself declares 2.13.0/);
  await c.dispatch({ action: 'savePackage', payload: { version: '', changelog: '' } });
  assert.equal(c.state.error, undefined); assert.equal(c.state.receipt.version, '2.13.1');
  assert.deepEqual(fs.readFileSync(first.packagePath), bytes);
});

test('earlier edits restore locally and preserve the replaced content; stale paths and forged records cannot write elsewhere', async t => {
  const f = await fixture(t), c = f.controller, id = c.state.active.id;
  const changed = f.original + '\nChanged instructions.\n';
  await c.dispatch({ action: 'save', editorSkillId: id, editorPath: 'SKILL.md', editorContent: changed });
  assert.equal(c.state.error, undefined);
  const history = c.state.history[0]; assert.equal(history.path, 'SKILL.md');
  await c.dispatch({ action: 'restoreEdit', payload: { id: history.id } });
  assert.equal(c.state.editor.content, f.original); assert.equal(c.state.history.length, 2);
  const restored = c.state.history.find(item => item.id !== history.id);
  await c.dispatch({ action: 'restoreEdit', payload: { id: restored.id } });
  assert.equal(c.state.editor.content, changed);
  await c.dispatch({ action: 'restoreEdit', payload: { id: '../../sentinel' } });
  assert.ok(c.state.error); assert.equal(c.state.editor.content, changed);
  const record = path.join(f.root, '.skill-workbench', 'recovery', id, `${history.id}.json`);
  const data = JSON.parse(fs.readFileSync(record, 'utf8')); data.path = '../sentinel'; fs.writeFileSync(record, JSON.stringify(data));
  await c.dispatch({ action: 'restoreEdit', payload: { id: history.id } });
  assert.match(c.state.error, /does not belong/); assert.equal(c.state.editor.content, changed);
});

test('no-op saves do not make history; changed files invalidate a stale sharing summary before any package is prepared', async t => {
  const f = await fixture(t), c = f.controller, id = c.state.active.id;
  await c.dispatch({ action: 'save', editorSkillId: id, editorPath: 'SKILL.md', editorContent: f.original });
  assert.deepEqual(c.state.history, []);
  await c.dispatch({ action: 'preparePublish' });
  fs.appendFileSync(path.join(f.root, 'skills', 'useful-notes', 'SKILL.md'), '\nAn external change.\n');
  await c.dispatch({ action: 'savePackage' });
  assert.match(c.state.error, /summary has been updated/);
  assert.equal(fs.existsSync(path.join(f.root, 'releases')), false);
  await c.dispatch({ action: 'savePackage' }); assert.equal(c.state.error, undefined);
  assert.equal(c.state.receipt.local, true);
});

test('new notes for preserved content receive a new managed release after reviewing the updated summary', async t => {
  const f = await fixture(t), c = f.controller;
  await c.dispatch({ action: 'preparePublish' }); await c.dispatch({ action: 'savePackage' });
  await c.dispatch({ action: 'resume', payload: { id: c.state.active.id } });
  await c.dispatch({ action: 'preparePublish' });
  const payload = { changelog: 'Verified manually with a fresh example.' };
  await c.dispatch({ action: 'savePackage', payload });
  assert.match(c.state.error, /summary has been updated/);
  assert.equal(c.state.publish.version, '2.13.1');
  await c.dispatch({ action: 'savePackage', payload });
  assert.equal(c.state.error, undefined); assert.equal(c.state.receipt.version, '2.13.1');
  assert.equal(fs.readFileSync(path.join(c.state.receipt.directory, 'CHANGELOG.md'), 'utf8').trim(), payload.changelog);
});

test('an invalid advanced number keeps the sharing form available and preserves the draft', async t => {
  const f = await fixture(t), c = f.controller;
  await c.dispatch({ action: 'preparePublish' });
  await c.dispatch({ action: 'savePackage', payload: { version: '../outside' } });
  assert.ok(c.state.error); assert.equal(c.state.step, 'publish');
  assert.equal(c.state.active.name, 'useful-notes');
  await c.dispatch({ action: 'savePackage', payload: { version: '' } });
  assert.equal(c.state.error, undefined); assert.equal(c.state.receipt.version, '2.13.0');
});
