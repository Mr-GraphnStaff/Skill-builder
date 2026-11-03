const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createWorkbench, requireWorkbench, WORKBENCH_FOLDERS } = require('../out/workbench-setup.js');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const { runWorkbenchJob } = require('../out/workbench-jobs.js');

function fixture(t) {
  const scratch = require('./working-fixture.cjs').workingFixture('setup-tests');
  fs.mkdirSync(scratch, { recursive: true });
  const directory = fs.mkdtempSync(path.join(scratch, 'case-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('setup creates a complete guide and structure only in a new or empty reviewed location', t => {
  const directory = fixture(t), root = path.join(directory, '.skilljetty-prerelease');
  createWorkbench(root);
  assert.equal(requireWorkbench(root), root);
  const guide = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  for (const folder of Object.keys(WORKBENCH_FOLDERS)) {
    assert(fs.statSync(path.join(root, folder)).isDirectory());
    assert(guide.includes(`**${folder}/**`));
  }
  assert.match(guide, /does not clone, pull, upload, or move/);
  const before = fs.readFileSync(path.join(root, 'README.md'));
  assert.throws(() => createWorkbench(root), /already contains files/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'README.md')), before);
  const unrelated = path.join(directory, 'unrelated'); fs.mkdirSync(unrelated);
  fs.writeFileSync(path.join(unrelated, 'keep.txt'), 'preserve');
  assert.throws(() => createWorkbench(unrelated), /already contains files/);
  assert.deepEqual(fs.readdirSync(unrelated), ['keep.txt']);
  assert.throws(() => requireWorkbench(unrelated), /not adopted automatically/);
});

test('managed controller edits a copied draft and packages locally without touching outside source', async t => {
  const directory = fixture(t), root = createWorkbench(path.join(directory, 'workbench'));
  const source = path.join(directory, 'original'); fs.mkdirSync(source);
  const original = '---\nname: notes\ndescription: Summarize supplied notes.\n---\n# Notes\n';
  fs.writeFileSync(path.join(source, 'SKILL.md'), original);
  const controller = new GuidedWorkbenchController(root, { enforceWorkbench: true, getRepositorySettings: () => ({}), pickFolder: async () => source });
  for (const action of ['openFolder', 'check', 'preparePublish', 'savePackage']) {
    await controller.dispatch({ action }); assert.equal(controller.state.error, undefined, action);
  }
  assert.equal(controller.state.receipt.local, true);
  assert(controller.state.receipt.packagePath.startsWith(path.join(root, 'releases')));
  assert.equal(fs.readFileSync(path.join(source, 'SKILL.md'), 'utf8'), original);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['original', 'workbench']);
});

test('managed selection defaults locally and blocks external destinations before any connection write', async t => {
  const directory = fixture(t), root = createWorkbench(path.join(directory, 'workbench'));
  let settings = { repositoryUrl: 'https://github.com/example/skills' };
  const controller = new GuidedWorkbenchController(root, { enforceWorkbench: true, getRepositorySettings: () => settings });
  assert.equal(controller.state.configuredLocalRepository, path.join(root, 'repositories', 'skills'));
  settings = { ...settings, localRepositoryPath: path.join(directory, 'other-repository') };
  controller.refreshRepositorySettings(); assert.match(controller.state.configurationError, /inside your SkillJetty workbench/);
  await controller.dispatch({ action: 'pullRepository' }); assert.match(controller.state.error, /inside your SkillJetty workbench/);
  assert(!fs.existsSync(path.join(root, '.skill-workbench', 'connection.json')));
  settings = { repositoryUrl: path.join(directory, 'outside.git') };
  controller.refreshRepositorySettings(); assert.match(controller.state.configurationError, /HTTPS|remote/);
});

test('missing setup record fails closed in controller and worker without recreating work', async t => {
  const directory = fixture(t), root = createWorkbench(path.join(directory, 'workbench'));
  const controller = new GuidedWorkbenchController(root, { enforceWorkbench: true });
  fs.unlinkSync(path.join(root, '.skilljetty-workbench.json'));
  await controller.dispatch({ action: 'createSkill', payload: { name: 'blocked', description: 'Notes', instructions: 'Summarize.' } });
  assert.match(controller.state.error, /missing or damaged/);
  assert.deepEqual(fs.readdirSync(path.join(root, 'skills')), []);
  await assert.rejects(async () => runWorkbenchJob({ kind: 'library', root }, { boundaryRoot: root }), /missing or damaged/);
});

test('current native remote blocks a historical review destination even when the saved connection is older', async t => {
  const directory = fixture(t), root = createWorkbench(path.join(directory, 'workbench'));
  const { createGuidedSkill } = require('../out/guided-workspace.js');
  const { prepareSkillRelease } = require('../out/skill-workbench.js');
  const { recordLibraryPublication } = require('../out/workbench-library.js');
  const oldRemote = 'https://github.com/example/old-skills';
  const skill = createGuidedSkill(root, { name: 'notes', description: 'Summarize notes.', instructions: 'Summarize supplied notes.' });
  const release = prepareSkillRelease(root, skill.id, '1.0.0', 'Initial version.');
  // Synthetic saved receipt; no network publication is performed by this test.
  recordLibraryPublication(root, release.directory, { repository: oldRemote, baseBranch: 'main', branch: 'skills/notes/1.0.0', commit: 'a'.repeat(40) });
  fs.writeFileSync(path.join(root, '.skill-workbench', 'connection.json'), JSON.stringify({ format: 1, repository: oldRemote, baseBranch: 'main' }));
  let requests = 0;
  const controller = new GuidedWorkbenchController(root, { enforceWorkbench: true,
    getRepositorySettings: () => ({ repositoryUrl: 'https://github.com/example/new-skills' }),
    github: async () => { requests++; throw new Error('Unexpected request'); } });
  await controller.dispatch({ action: 'createPullRequest', payload: { directory: release.directory } });
  assert.match(controller.state.error, /different remote repository/);
  assert.equal(requests, 0);
});
