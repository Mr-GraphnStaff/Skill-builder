const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const AdmZip = require('adm-zip');
const { createWorkbench } = require('../out/workbench-setup.js');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const { resolveExistingRepositoryWorkspace } = require('../out/workspace-selection.js');
const { initialExportOptions, readExportOptions, suggestPluginVersion } = require('../out/guided-exports.js');
const core = require('../out/skill-workbench.js');
const { preparePluginRelease } = require('../out/plugin-release.js');
const publisher = require('../out/repository-publisher.js');
const scratch = require('./working-fixture.cjs').workingFixture('local-workflow-intent');
fs.mkdirSync(scratch, { recursive: true });

function fixture(t) {
  const base = fs.mkdtempSync(path.join(scratch, 'case-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return base;
}
async function create(controller, name) {
  await controller.dispatch({ action: 'createSkill', payload: { name, description: 'Summarize local notes when requested.', instructions: '# Notes\nPreserve the original files.' } });
  assert.equal(controller.state.error, undefined);
  return controller.state.active.id;
}
async function packagePlugin(controller) {
  await controller.dispatch({ action: 'preparePublish' }); assert.equal(controller.state.error, undefined);
  assert.equal(controller.state.exportOptions.mode, 'plugin');
  await controller.dispatch({ action: 'savePackage', payload: {} }); assert.equal(controller.state.error, undefined);
  const artifact = controller.state.receipt.artifacts.find(item => item.kind === 'plugin');
  assert(artifact); return artifact;
}

test('a fresh local work location can build a plugin despite foreign inherited sharing settings', async t => {
  const base = fixture(t), root = createWorkbench(path.join(base, '.skilljetty-prerelease'));
  const foreign = path.join(base, 'another-repository'); fs.mkdirSync(foreign); fs.writeFileSync(path.join(foreign, 'keep.txt'), 'Retained.');
  let gitCalls = 0, githubCalls = 0;
  const originalGit = publisher.repositoryGit;
  publisher.repositoryGit = async () => { gitCalls++; throw new Error('This local workflow must not call Git.'); };
  t.after(() => { publisher.repositoryGit = originalGit; });
  const controller = new GuidedWorkbenchController(root, {
    enforceWorkbench: true, workspaceSelection: { kind: 'managed', dataRoot: root },
    getRepositorySettings: () => ({ repositoryUrl: 'https://github.com/example/skills', localRepositoryPath: foreign }),
    github: async () => { githubCalls++; throw new Error('This local workflow must not contact GitHub.'); }
  });
  assert.match(controller.state.configurationError, /another work location/);
  await controller.verifyRepository();
  assert.equal(controller.state.repositoryVerification.message, controller.state.configurationError, 'verification retains the specific optional sharing problem');
  await controller.dispatch({ action: 'showPlugin' });
  await controller.dispatch({ action: 'showCreate', payload: { intent: 'plugin' } });
  const id = await create(controller, 'local-notes');
  assert.equal(controller.state.workflowIntent, 'plugin');
  const skill = core.listWorkbenchSkills(root).find(item => item.id === id), originalSkill = fs.readFileSync(path.join(skill.sourcePath, 'SKILL.md'));
  await controller.dispatch({ action: 'preparePublish' }); assert.equal(controller.state.error, undefined);
  assert.equal(controller.state.exportOptions.mode, 'plugin');
  await controller.dispatch({ action: 'updateExportOptions', payload: { pluginName: 'user-named-bundle', pluginVersion: '2.4.0', pluginAuthor: 'DAF-TECH' } }); assert.equal(controller.state.error, undefined);
  await controller.dispatch({ action: 'back' }); await controller.dispatch({ action: 'edit' });
  await controller.dispatch({ action: 'check' }); await controller.dispatch({ action: 'preparePublish' });
  assert.equal(controller.state.exportOptions.mode, 'plugin');
  assert.equal(controller.state.exportOptions.pluginVersion, '2.4.0');
  assert.equal(controller.state.exportOptions.pluginAuthor, 'DAF-TECH');
  assert.equal(controller.state.exportOptions.pluginName, 'user-named-bundle');
  await controller.dispatch({ action: 'savePackage', payload: {} }); assert.equal(controller.state.error, undefined);
  const artifact = controller.state.receipt.artifacts.find(item => item.kind === 'plugin'), zip = new AdmZip(artifact.path);
  assert.equal(JSON.parse(zip.readAsText('.claude-plugin/plugin.json')).version, '2.4.0');
  assert(zip.getEntry('skills/local-notes/SKILL.md').getData().equals(originalSkill));
  assert.equal(controller.state.receipt.local, true);
  assert.equal(gitCalls, 0); assert.equal(githubCalls, 0);
  assert.equal(fs.existsSync(path.join(root, '.skill-workbench/connection.json')), false);
  assert.deepEqual(fs.readdirSync(foreign), ['keep.txt']);
  assert.equal(fs.readFileSync(path.join(foreign, 'keep.txt'), 'utf8'), 'Retained.');
  await controller.dispatch({ action: 'edit' }); await controller.dispatch({ action: 'preparePublish' });
  assert.equal(controller.state.exportOptions.pluginVersion, '2.4.1', 'a new completed-export edit suggests the next plugin identity');
  assert.equal(controller.state.exportOptions.pluginName, 'user-named-bundle');
  assert.equal(controller.state.exportOptions.pluginAuthor, 'DAF-TECH');
  await controller.dispatch({ action: 'showSkillStart' });
  assert.equal(controller.state.workflowIntent, 'skill'); assert(fs.existsSync(artifact.path));
  await controller.dispatch({ action: 'showCreate' }); await create(controller, 'plain-skill');
  await controller.dispatch({ action: 'preparePublish' }); assert.equal(controller.state.exportOptions.mode, 'portable');
  assert.equal(gitCalls, 0); assert.equal(githubCalls, 0);
});

test('local plugin export continues the registered existing repository without adopting its legacy data folder', async t => {
  const root = fixture(t), dataRoot = path.join(root, '.skilljetty-prerelease'), remote = 'https://github.com/example/skills';
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  Object.assign(env, { GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
  const git = (...args) => cp.execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, env, encoding: 'utf8', windowsHide: true, stdio: 'pipe' }).trim();
  git('init', '-b', 'main'); git('remote', 'add', 'origin', `${remote}.git`);
  fs.mkdirSync(path.join(dataRoot, '.skill-workbench'), { recursive: true });
  fs.writeFileSync(path.join(dataRoot, '.skill-workbench/connection.json'), JSON.stringify({ format: 1, repository: remote, baseBranch: 'main', localPath: root }));
  const config = fs.readFileSync(path.join(root, '.git/config'));
  const selection = await resolveExistingRepositoryWorkspace(root);
  const controller = new GuidedWorkbenchController(dataRoot, { workspaceSelection: selection, enforceWorkbench: false });
  await controller.dispatch({ action: 'showPlugin' }); await controller.dispatch({ action: 'showCreate', payload: { intent: 'plugin' } });
  const id = await create(controller, 'existing-notes');
  const source = core.listWorkbenchSkills(dataRoot).find(item => item.id === id);
  const bytes = fs.readFileSync(path.join(source.sourcePath, 'SKILL.md'));
  const artifact = await packagePlugin(controller), zip = new AdmZip(artifact.path);
  assert(zip.getEntry('skills/existing-notes/SKILL.md').getData().equals(bytes));
  assert.equal(fs.existsSync(path.join(dataRoot, '.skilljetty-workbench.json')), false);
  assert(fs.readFileSync(path.join(root, '.git/config')).equals(config));
});

test('plugin version suggestions use only the selected plugin history and preserve explicit overrides', t => {
  const base = fixture(t), root = createWorkbench(path.join(base, 'workbench')), source = path.join(base, 'source'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: source-notes\ndescription: Summarize notes when requested.\n---\nPreserve notes.\n');
  const skill = core.registerSkillFolder(root, source), release = core.prepareSkillRelease(root, skill.id, '1.0.0', 'Member snapshot.');
  for (const [name, version] of [['source-notes', '1.0.0'], ['other-bundle', '7.2.0']]) {
    preparePluginRelease(root, { name, version, description: 'Local plugin.', members: [{ directory: release.directory }], changelog: 'Saved plugin.' });
  }
  const initial = initialExportOptions(root, skill.id, '1.0.0', 'plugin');
  assert.equal(initial.pluginVersion, '1.0.1');
  const renamed = readExportOptions(root, skill.id, initial, { pluginName: 'other-bundle', pluginVersion: initial.pluginVersion });
  assert.equal(renamed.pluginVersion, '7.2.1');
  const explicit = readExportOptions(root, skill.id, renamed, { pluginName: 'new-bundle', pluginVersion: '9.0.0' });
  assert.equal(explicit.pluginVersionSource, 'explicit');
  const retained = readExportOptions(root, skill.id, explicit, { pluginName: 'source-notes', pluginVersionSource: 'suggested' });
  assert.equal(retained.pluginVersion, '9.0.0'); assert.equal(retained.pluginVersionSource, 'explicit');
  assert.throws(() => readExportOptions(root, skill.id, initial, { pluginName: '../outside' }), /safe kebab-case/);
  const receipt = path.join(root, 'plugin-releases/source-notes/1.0.0/release.json'), original = fs.readFileSync(receipt);
  const badIdentity = JSON.parse(original); badIdentity.plugin.name = 'wrong-plugin';
  fs.writeFileSync(receipt, JSON.stringify(badIdentity));
  assert.throws(() => suggestPluginVersion(root, 'source-notes'), /identity does not match/);
  fs.writeFileSync(receipt, original);
  fs.renameSync(receipt, `${receipt}.retained`); fs.mkdirSync(receipt);
  assert.throws(() => suggestPluginVersion(root, 'source-notes'), /regular file|EISDIR|illegal operation/i);
  fs.rmdirSync(receipt); fs.renameSync(`${receipt}.retained`, receipt);
  const open = fs.openSync, fstat = fs.fstatSync, read = fs.readSync;
  const cap = 8 * 1024 * 1024;
  let target, grew = false, readBytes = 0;
  fs.openSync = function(file, ...args) { const fd = open.call(this, file, ...args); if (target === undefined && path.resolve(String(file)) === receipt) target = fd; return fd; };
  fs.fstatSync = function(fd, ...args) {
    const stat = fstat.call(this, fd, ...args);
    if (fd === target && !grew) { fs.truncateSync(receipt, cap + 1); grew = true; }
    return stat;
  };
  fs.readSync = function(fd, ...args) { const count = read.call(this, fd, ...args); if (fd === target) readBytes += count; return count; };
  try { assert.throws(() => suggestPluginVersion(root, 'source-notes'), /exceeds the safe suggestion limit/); }
  finally { fs.openSync = open; fs.fstatSync = fstat; fs.readSync = read; fs.writeFileSync(receipt, original); }
  assert.equal(grew, true); assert.equal(readBytes, cap + 1, 'a receipt growing after stat is still read through a hard byte cap');
});

test('passive plugin metadata updates preserve review bytes and cannot change export permissions or provenance', async t => {
  const root = createWorkbench(path.join(fixture(t), 'workbench'));
  let stateUpdates = 0;
  const controller = new GuidedWorkbenchController(root, { enforceWorkbench: true, onState: () => { stateUpdates++; } });
  assert.throws(() => controller.updatePluginMetadata({ pluginName: 'not-ready' }), /Review the plugin/);
  await controller.dispatch({ action: 'showPlugin' }); await create(controller, 'passive-notes');
  await controller.dispatch({ action: 'preparePublish' }); assert.equal(controller.state.error, undefined);
  const previous = controller.state.exportOptions, previousMembers = previous.members;
  const memberBytes = controller.exportPreview.members;
  const inventory = directory => {
    const entries = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) entries.push(...inventory(file));
      else entries.push([path.relative(root, file), fs.readFileSync(file).toString('base64')]);
    }
    return entries;
  };
  const beforeFiles = inventory(root), beforeActivity = JSON.stringify(controller.state.activity), beforeUpdates = stateUpdates;
  const jobs = require('../out/workbench-jobs.js'), run = jobs.runWorkbenchJob;
  jobs.runWorkbenchJob = () => { throw new Error('Passive metadata must not start a worker.'); };
  try {
    const first = controller.updatePluginMetadata({ pluginName: 'first-bundle', pluginVersion: previous.pluginVersion,
      pluginVersionSource: 'explicit', exportMode: 'both', pluginMembers: [], pluginAuthor: 'Injected', geminiZip: true });
    assert.equal(typeof first.then, 'undefined', 'the passive method is synchronous');
    assert.equal(first.pluginName, 'first-bundle');
    assert.equal(controller.state.exportOptions.pluginVersionSource, 'suggested', 'browser input cannot manufacture provenance');
    controller.updatePluginMetadata({ pluginVersion: '3.1.0', pluginVersionSource: 'suggested' });
    const last = controller.updatePluginMetadata({ pluginName: 'second-bundle', pluginVersionSource: 'suggested' });
    assert.deepEqual(last, { pluginName: 'second-bundle', pluginVersion: '3.1.0' });
    assert.equal(controller.state.exportOptions.pluginVersionSource, 'explicit');
    assert.equal(controller.state.exportOptions.mode, 'plugin');
    assert.equal(controller.state.exportOptions.geminiZip, false);
    assert.equal(controller.state.exportOptions.pluginAuthor, previous.pluginAuthor);
    assert.equal(controller.state.exportOptions.members, previousMembers);
    assert.equal(controller.exportPreview.members, memberBytes);
    assert.equal(controller.exportPreview.options, controller.state.exportOptions);
    assert.throws(() => controller.updatePluginMetadata({ pluginName: '\ninvalid' }), /Invalid pluginName/);
  } finally { jobs.runWorkbenchJob = run; }
  assert.equal(JSON.stringify(controller.state.activity), beforeActivity);
  assert.equal(stateUpdates, beforeUpdates);
  assert.deepEqual(inventory(root), beforeFiles);
  await controller.dispatch({ action: 'savePackage', payload: {} }); assert.equal(controller.state.error, undefined, 'unchanged member review saves on the first click after metadata updates');
  const artifact = controller.state.receipt.artifacts.find(item => item.kind === 'plugin'), zip = new AdmZip(artifact.path);
  const manifest = JSON.parse(zip.readAsText('.claude-plugin/plugin.json'));
  assert.equal(manifest.name, 'second-bundle'); assert.equal(manifest.version, '3.1.0');
  await controller.dispatch({ action: 'edit' }); await controller.dispatch({ action: 'preparePublish' });
  controller.updatePluginMetadata({ pluginName: 'drifted-bundle' });
  const active = core.listWorkbenchSkills(root).find(item => item.id === controller.state.active.id);
  fs.appendFileSync(path.join(active.sourcePath, 'SKILL.md'), '\nChanged after review.');
  await controller.dispatch({ action: 'savePackage', payload: {} });
  assert.match(controller.state.error, /changed since this summary|Review.*selected skill versions/i);
  assert.equal(fs.existsSync(path.join(root, 'plugin-releases/drifted-bundle')), false, 'metadata updates do not refresh away the reviewed-source drift guard');
});
