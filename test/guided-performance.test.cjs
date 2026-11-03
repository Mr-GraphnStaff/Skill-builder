const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const core = require('../out/skill-workbench.js');
const jobs = require('../out/workbench-jobs.js');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-performance-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'input'); fs.mkdirSync(source);
  const original = '---\nname: quick-notes\ndescription: Summarize supplied facts. Use when someone needs useful notes.\nmetadata:\n  version: 1.0.0\n---\n\n# Notes\nKeep supplied facts.\n';
  fs.writeFileSync(path.join(source, 'SKILL.md'), original);
  const skill = core.registerSkillFolder(root, source);
  const controller = new GuidedWorkbenchController(root);
  await controller.dispatch({ action: 'resume', payload: { id: skill.id } });
  return { root, skill, original, controller, manifest: path.join(skill.sourcePath, 'SKILL.md') };
}

test('no-op and edited autosaves do not reopen release packages, start heavy jobs or rescan all skill files', async t => {
  const f = await fixture(t);
  core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Initial saved package.');
  fs.writeFileSync(path.join(f.skill.sourcePath, 'large-asset.bin'), Buffer.alloc(128 * 1024, 42));
  let archives = 0, assetReads = 0, heavyJobs = 0;
  const read = fs.readFileSync, run = jobs.runWorkbenchJob;
  fs.readFileSync = function(file, ...args) { if (String(file).endsWith('.skill')) archives++; if (String(file).endsWith('large-asset.bin')) assetReads++; return read.call(this, file, ...args); };
  jobs.runWorkbenchJob = function(...args) { heavyJobs++; return run(...args); };
  try {
    await f.controller.dispatch({ action: 'save' });
    await f.controller.dispatch({ action: 'save', editorSkillId: f.skill.id, editorPath: 'SKILL.md', editorContent: f.original + '\nUse a clear title.\n' });
    assert.equal(f.controller.state.error, undefined);
    assert.equal(archives, 0); assert.equal(assetReads, 0); assert.equal(heavyJobs, 0);
    assert.equal(f.controller.state.history.length, 1);
    assert.equal(f.controller.state.files.find(file => file.path === 'SKILL.md').size, Buffer.byteLength(f.original + '\nUse a clear title.\n'));
  } finally { fs.readFileSync = read; jobs.runWorkbenchJob = run; }
});

test('saving still works with damaged history, but sharing cannot trust the damaged release', async t => {
  const f = await fixture(t);
  const release = core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Original package.');
  fs.writeFileSync(release.packagePath, 'Damaged package.');
  await f.controller.dispatch({ action: 'save', editorSkillId: f.skill.id, editorPath: 'SKILL.md', editorContent: f.original + '\nNew draft text.\n' });
  assert.equal(f.controller.state.error, undefined);
  await f.controller.dispatch({ action: 'preparePublish' });
  assert.match(f.controller.state.error, /hash mismatch|integrity|ZIP/i);
  assert.match(fs.readFileSync(f.manifest, 'utf8'), /New draft text/);
});

test('the preview fingerprint belongs to the exact snapshot shown, even if a file changes as the worker returns', async t => {
  const f = await fixture(t);
  const run = jobs.runWorkbenchJob; let changed = false;
  jobs.runWorkbenchJob = async function(job, ...args) {
    const result = await run(job, ...args);
    if (job.kind === 'snapshot' && !changed) { changed = true; fs.appendFileSync(f.manifest, '\nA different editor changed this file.\n'); }
    return result;
  };
  try {
    await f.controller.dispatch({ action: 'preparePublish' });
    assert.equal(f.controller.state.error, undefined);
    await f.controller.dispatch({ action: 'savePackage' });
    assert.match(f.controller.state.error, /summary has been updated/);
    assert.equal(f.controller.state.receipt, undefined);
    assert.equal(fs.existsSync(path.join(f.root, 'releases')), false);
  } finally { jobs.runWorkbenchJob = run; }
});

test('a draft changed during asynchronous package preparation cannot become the accepted reviewed package', async t => {
  const f = await fixture(t);
  await f.controller.dispatch({ action: 'preparePublish' });
  const run = jobs.runWorkbenchJob;
  jobs.runWorkbenchJob = async function(job, ...args) {
    if (job.kind === 'prepareRelease') fs.appendFileSync(f.manifest, '\nExternal edit during preparation.\n');
    return run(job, ...args);
  };
  try {
    await f.controller.dispatch({ action: 'savePackage' });
    assert.match(f.controller.state.error, /draft changed while/);
    assert.equal(f.controller.state.receipt, undefined);
    assert.equal(f.controller.state.step, 'publish');
    assert.match(fs.readFileSync(f.manifest, 'utf8'), /External edit during preparation/);
  } finally { jobs.runWorkbenchJob = run; }
});

test('canceling a native package picker reports cancellation without scanning the release library', async t => {
  const f = await fixture(t);
  await f.controller.dispatch({ action: 'back' });
  const run = jobs.runWorkbenchJob; let calls = 0;
  jobs.runWorkbenchJob = (...args) => { calls++; return run(...args); };
  try {
    await f.controller.dispatch({ action: 'openPackage' });
    assert.equal(f.controller.state.error, undefined);
    assert.match(f.controller.state.notice, /canceled/);
    assert.equal(calls, 0);
    assert.equal(f.controller.state.busy, false);
  } finally { jobs.runWorkbenchJob = run; }
});

test('Home reads only its draft catalogue before first paint, without package reads or workers', async t => {
  const f = await fixture(t);
  core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Initial package.');
  const controller = new GuidedWorkbenchController(f.root);
  const read = fs.readFileSync, list = core.listWorkbenchSkills, run = jobs.runWorkbenchJob;
  let dataReads = 0, listings = 0, workers = 0;
  fs.readFileSync = function(file, ...args) {
    if (/SKILL\.md$|\.skill$|release\.json$/.test(String(file))) dataReads++;
    return read.call(this, file, ...args);
  };
  core.listWorkbenchSkills = (...args) => { listings++; return list(...args); };
  jobs.runWorkbenchJob = (...args) => { workers++; return run(...args); };
  try {
    await controller.dispatch({ action: 'ready' });
    await controller.dispatch({ action: 'showCreate' });
    await controller.dispatch({ action: 'startAnother' });
    assert.equal(controller.state.error, undefined);
    assert.equal(dataReads, 0); assert.equal(listings, 2); assert.equal(workers, 0);
    assert.deepEqual(controller.state.drafts, [{ id: f.skill.id, name: f.skill.name }]); assert.deepEqual(controller.state.library, []);
    assert.equal(controller.state.skillsLoaded, true);
    assert.notEqual(controller.state.releasesLoaded, true);
  } finally { fs.readFileSync = read; core.listWorkbenchSkills = list; jobs.runWorkbenchJob = run; }
});

test('saved metadata loads in the background without changing an active editor or form', async t => {
  const f = await fixture(t);
  core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Initial package.');
  const controller = new GuidedWorkbenchController(f.root);
  await controller.dispatch({ action: 'ready' });
  const run = jobs.runWorkbenchJob;
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  jobs.runWorkbenchJob = async (...args) => {
    if (args[0].kind !== 'library') return run(...args);
    const result = await run(...args);
    entered();
    await new Promise(resolve => { release = resolve; });
    return result;
  };
  try {
    const loading = controller.loadHome();
    await waiting;
    await controller.dispatch({ action: 'resume', payload: { id: f.skill.id } });
    controller.state.form = { pluginName: 'unsaved-name' };
    const editor = { ...controller.state.editor };
    release(); await loading;
    assert.equal(controller.state.step, 'edit');
    assert.deepEqual(controller.state.editor, editor);
    assert.deepEqual(controller.state.form, { pluginName: 'unsaved-name' });
    assert.equal(controller.state.library.length, 1);
    assert.equal(controller.state.releasesLoaded, true);
    assert.equal(controller.state.busy, false);
  } finally { release?.(); jobs.runWorkbenchJob = run; }
});

test('saved metadata refresh uses one library job and unload does not reread it', async t => {
  const f = await fixture(t);
  core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Initial package.');
  const controller = new GuidedWorkbenchController(f.root);
  const run = jobs.runWorkbenchJob; let libraryJobs = 0;
  jobs.runWorkbenchJob = (...args) => { if (args[0].kind === 'library') libraryJobs++; return run(...args); };
  try {
    await controller.dispatch({ action: 'ready' });
    assert.equal(libraryJobs, 0);
    await controller.dispatch({ action: 'loadSkills' });
    assert.equal(controller.state.error, undefined);
    assert.equal(controller.state.skillsLoaded, true);
    assert.equal(controller.state.drafts.length, 1); assert.equal(controller.state.library.length, 1);
    assert.equal(libraryJobs, 1);
    await controller.dispatch({ action: 'startAnother' });
    assert.equal(libraryJobs, 1);
    await controller.dispatch({ action: 'unloadSkills' });
    assert.equal(controller.state.skillsLoaded, false);
    assert.deepEqual(controller.state.drafts, []); assert.deepEqual(controller.state.library, []);
    assert.equal(controller.state.reviewQueue, undefined); assert.equal(libraryJobs, 1);
    await controller.dispatch({ action: 'refresh' });
    assert.equal(libraryJobs, 2); assert.equal(controller.state.library.length, 1);
  } finally { jobs.runWorkbenchJob = run; }
});

test('opening a package by explicit path bypasses the native picker and preserves original bytes', async t => {
  const f = await fixture(t);
  const release = core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Initial package.');
  const root = path.join(f.root, 'second-workspace');
  let nativeCalls = 0;
  const controller = new GuidedWorkbenchController(root, { pickPackage: async () => { nativeCalls++; throw new Error('Native dialog unavailable'); } });
  await controller.dispatch({ action: 'openPackagePath', payload: { path: release.packagePath } });
  assert.equal(controller.state.error, undefined); assert.equal(nativeCalls, 0);
  assert.equal(controller.state.active.name, f.skill.name);
  const imported = core.listWorkbenchSkills(root)[0];
  assert.deepEqual(fs.readFileSync(imported.originalPackagePath), fs.readFileSync(release.packagePath));
  assert.equal(controller.state.skillsLoaded, undefined);
  await controller.dispatch({ action: 'openPackagePath', payload: { path: 'relative.skill' } });
  assert.match(controller.state.error, /full path/);
});

test('native selection waits for input then reports actual processing separately', async t => {
  const f = await fixture(t);
  const phases = [];
  const controller = new GuidedWorkbenchController(path.join(f.root, 'another-workspace'), {
    pickFolder: async () => f.skill.sourcePath,
    onState: state => phases.push({ waiting: state.waitingForInput, message: state.progress })
  });
  await controller.dispatch({ action: 'openFolder' });
  assert.equal(controller.state.error, undefined);
  assert.equal(phases[0].waiting, true);
  assert.ok(phases.some(phase => phase.waiting === false && /Copying/.test(phase.message)));
  assert.equal(controller.state.waitingForInput, false);
});
