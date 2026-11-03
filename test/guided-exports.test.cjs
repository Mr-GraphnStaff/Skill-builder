const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { workingFixture } = require('./working-fixture.cjs');
const { createWorkbench } = require('../out/workbench-setup.js');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const core = require('../out/skill-workbench.js');
const library = require('../out/workbench-library.js');
const exportsCore = require('../out/guided-exports.js');

function fixture(t) {
  const base = workingFixture('guided-exports'); fs.mkdirSync(base, { recursive: true });
  const root = createWorkbench(fs.mkdtempSync(path.join(base, 'case-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
async function create(controller, name) {
  await controller.dispatch({ action: 'createSkill', payload: { name, description: `Summarize ${name} notes when requested.`, instructions: '# Notes\nPreserve evidence.' } });
  assert.equal(controller.state.error, undefined);
  return controller.state.active.id;
}
async function summary(controller) {
  await controller.dispatch({ action: 'preparePublish' });
  assert.equal(controller.state.error, undefined);
}
const options = (ids, extra = {}) => ({ exportMode: 'both', pluginName: 'team-notes', pluginVersion: '1.0.0', pluginDescription: 'Team note skills.', pluginAuthor: 'DAF-TECH', pluginMembers: ids, geminiZip: true, ...extra });

test('managed controller prepares Both and Gemini from two reviewed skill snapshots without network', async t => {
  const root = fixture(t); const controller = new GuidedWorkbenchController(root, { enforceWorkbench: true, getRepositorySettings: () => ({}) });
  const first = await create(controller, 'first-notes'), second = await create(controller, 'second-notes');
  await summary(controller);
  const payload = options([first, second]);
  await controller.dispatch({ action: 'updateExportOptions', payload }); assert.equal(controller.state.error, undefined);
  assert.equal(controller.state.exportOptions.members.filter(item => item.selected).length, 2);
  await controller.dispatch({ action: 'savePackage', payload }); assert.equal(controller.state.error, undefined);
  assert.equal(controller.state.step, 'done');
  assert.equal(controller.state.receipt.artifacts.length, 5);
  for (const artifact of controller.state.receipt.artifacts) assert(fs.statSync(artifact.path).isFile());
  assert.equal(controller.state.receipt.compatibility[0].tested, false);
  const plugin = controller.state.receipt.artifacts.find(item => item.kind === 'plugin');
  const zip = new AdmZip(plugin.path);
  const manifest = JSON.parse(zip.readAsText('.claude-plugin/plugin.json'));
  assert.deepEqual(manifest.author, { name: 'DAF-TECH' });
  for (const name of ['first-notes', 'second-notes']) {
    assert.deepEqual(zip.getEntry(`skills/${name}/SKILL.md`).getData(), fs.readFileSync(path.join(root, 'releases', name, '1.0.0', 'source', name, 'SKILL.md')));
  }
  assert.equal(core.listWorkbenchSkills(root).length, 2);
  assert.equal(library.listLibraryReleases(root).filter(item => item.kind === 'plugin').length, 1);
});

test('selected secondary draft changed after review stops export before any upload', async t => {
  const root = fixture(t), controller = new GuidedWorkbenchController(root, { enforceWorkbench: true });
  const first = await create(controller, 'first-notes'), second = await create(controller, 'second-notes');
  await summary(controller); const payload = options([first, second], { geminiZip: false });
  await controller.dispatch({ action: 'updateExportOptions', payload }); assert.equal(controller.state.error, undefined);
  const draft = core.listWorkbenchSkills(root).find(item => item.id === first);
  fs.appendFileSync(path.join(draft.sourcePath, 'SKILL.md'), '\nChanged after review.');
  await controller.dispatch({ action: 'savePackage', payload });
  assert.match(controller.state.error, /Review.*selected skill versions|changed/i);
  assert.equal(controller.state.step, 'publish');
  assert.equal(controller.state.receipt, undefined);
});

test('host rejects invented bundle members and unsafe metadata; incomplete edit remains editable', async t => {
  const root = fixture(t), controller = new GuidedWorkbenchController(root, { enforceWorkbench: true });
  const id = await create(controller, 'safe-notes'); await summary(controller);
  await controller.dispatch({ action: 'updateExportOptions', payload: options([id], { pluginDescription: '', pluginName: '' }) });
  assert.equal(controller.state.error, undefined);
  await controller.dispatch({ action: 'savePackage', payload: options([id], { pluginName: '../escape' }) });
  assert.match(controller.state.error, /safe kebab-case/);
  await controller.dispatch({ action: 'updateExportOptions', payload: options([id, 'outside-id']) });
  assert.match(controller.state.error, /existing drafts/);
});

test('Gemini rejects unsupported files without stripping source or uploading', async t => {
  const root = fixture(t), controller = new GuidedWorkbenchController(root, { enforceWorkbench: true });
  const id = await create(controller, 'safe-notes');
  const skill = core.listWorkbenchSkills(root)[0]; fs.writeFileSync(path.join(skill.sourcePath, 'helper.ts'), 'export const value = 1;');
  await summary(controller); const payload = options([id], { exportMode: 'portable' });
  await controller.dispatch({ action: 'updateExportOptions', payload });
  assert(controller.state.publish.compatibility[0].issues.some(item => item.includes('helper.ts')));
  await controller.dispatch({ action: 'savePackage', payload });
  assert.match(controller.state.error, /Gemini|supported|unsupported/i);
  assert(fs.existsSync(path.join(skill.sourcePath, 'helper.ts')));
  assert.equal(controller.state.step, 'publish');
});

test('artifact reveal accepts only the current receipt path', async t => {
  const root = fixture(t), revealed = [];
  const controller = new GuidedWorkbenchController(root, { enforceWorkbench: true, revealFile: async file => revealed.push(file) });
  const id = await create(controller, 'safe-notes'); await summary(controller);
  const payload = options([id], { exportMode: 'plugin', geminiZip: false });
  await controller.dispatch({ action: 'updateExportOptions', payload });
  await controller.dispatch({ action: 'savePackage', payload }); assert.equal(controller.state.error, undefined);
  const artifact = controller.state.receipt.artifacts[0];
  await controller.dispatch({ action: 'revealPackage', payload: { path: artifact.path } }); assert.equal(controller.state.error, undefined);
  await controller.dispatch({ action: 'revealPackage', payload: { path: path.join(root, 'README.md') } });
  assert.match(controller.state.error, /export receipt/);
  assert.deepEqual(revealed, [artifact.path]);
});

test('fault injection: partial Both preserves results and never claims all uploads succeeded', async t => {
  const root = fixture(t), guided = require('../out/guided-workspace.js');
  const original = guided.publishPreparedGuidedRelease, calls = [];
  t.after(() => { guided.publishPreparedGuidedRelease = original; });
  guided.publishPreparedGuidedRelease = async (_root, directory, connection, _progress, guard) => {
    guard?.(); calls.push(directory);
    if (calls.length === 2) throw new Error('Injected second-artifact transport failure');
    return { release: core.verifySkillRelease(directory), publication: { repository: connection.repository, branch: 'skills/safe-notes/1.0.0', commit: 'a'.repeat(40) } };
  };
  const controller = new GuidedWorkbenchController(root, { getRepositorySettings: () => ({ repositoryUrl: 'https://example.invalid/team/skills.git', localRepositoryPath: '' }) });
  // Fault injection bypasses connection IO, not release preparation or integrity.
  controller.resolveRepositoryConnection = async () => ({ repository: 'https://example.invalid/team/skills.git', baseBranch: 'main' });
  const id = await create(controller, 'safe-notes'); await summary(controller);
  const payload = options([id], { geminiZip: false });
  await controller.dispatch({ action: 'updateExportOptions', payload }); assert.equal(controller.state.error, undefined);
  await controller.dispatch({ action: 'publish', payload });
  assert.equal(calls.length, 2);
  assert.equal(controller.state.step, 'done');
  assert.match(controller.state.error, /need attention/);
  assert.match(controller.state.receipt.note, /not a completed Both/);
  assert.deepEqual(controller.state.receipt.artifacts.map(item => item.status), ['uploaded', 'failed']);
  assert.match(controller.state.receipt.artifacts[1].error, /Injected second-artifact/);
  for (const artifact of controller.state.receipt.artifacts) assert(fs.statSync(artifact.path).isFile());
  assert.equal(core.listWorkbenchSkills(root).length, 1);
});

test('settings generation changed after review stops plugin submission before publish boundary', async t => {
  const root = fixture(t); let generation = 1, uploads = 0;
  const guided = require('../out/guided-workspace.js'), original = guided.publishPreparedGuidedRelease;
  t.after(() => { guided.publishPreparedGuidedRelease = original; });
  guided.publishPreparedGuidedRelease = async () => { ++uploads; throw new Error('Must not upload'); };
  const controller = new GuidedWorkbenchController(root, { captureConfigurationGeneration: () => generation,
    assertConfigurationGeneration: expected => { if (expected !== generation) throw new Error('changed'); },
    getRepositorySettings: () => ({ repositoryUrl: 'https://example.invalid/team/skills.git', localRepositoryPath: '' }) });
  const id = await create(controller, 'safe-notes'); await summary(controller);
  const payload = options([id], { exportMode: 'plugin', geminiZip: false });
  await controller.dispatch({ action: 'updateExportOptions', payload }); assert.equal(controller.state.error, undefined);
  ++generation;
  await controller.dispatch({ action: 'publish', payload });
  assert.match(controller.state.error, /Repository settings changed/);
  assert.equal(uploads, 0); assert.equal(controller.state.step, 'publish');
  assert.equal(controller.state.receipt, undefined);
});

test('plugin-only submission receipt links use the plugin tree and exact uploaded commit', async t => {
  const root = fixture(t), guided = require('../out/guided-workspace.js');
  const plugin = require('../out/plugin-release.js');
  const { GitHubReviewService } = require('../out/github-review.js');
  const originalPublish = guided.publishPreparedGuidedRelease, originalReview = guided.reviewLibraryRelease;
  const originalPreflight = GitHubReviewService.prototype.preflight;
  t.after(() => { guided.publishPreparedGuidedRelease = originalPublish; guided.reviewLibraryRelease = originalReview; GitHubReviewService.prototype.preflight = originalPreflight; });
  GitHubReviewService.prototype.preflight = async () => undefined;
  guided.reviewLibraryRelease = async () => ({ pr: { supported: true, status: 'awaiting_review', number: 23, identityVerified: true } });
  guided.publishPreparedGuidedRelease = async (_root, directory, connection, _progress, guard) => {
    guard?.();
    return { release: plugin.verifyPluginRelease(directory), publication: { repository: connection.repository, branch: 'plugins/team-notes/1.0.0', commit: 'b'.repeat(40) } };
  };
  const repository = 'https://github.com/example/skills.git';
  const controller = new GuidedWorkbenchController(root, { getRepositorySettings: () => ({ repositoryUrl: repository, localRepositoryPath: '' }) });
  controller.resolveRepositoryConnection = async () => ({ repository, baseBranch: 'main' });
  const id = await create(controller, 'safe-notes'); await summary(controller);
  const payload = options([id], { exportMode: 'plugin', geminiZip: false });
  await controller.dispatch({ action: 'updateExportOptions', payload });
  await controller.dispatch({ action: 'publish', payload }); assert.equal(controller.state.error, undefined);
  const receipt = controller.state.receipt, base = `https://github.com/example/skills`, commit = 'b'.repeat(40);
  assert.equal(receipt.sourceUrl, `${base}/tree/${commit}/Plugins/team-notes/1.0.0/source`);
  assert.equal(receipt.packageUrl, `${base}/blob/${commit}/Plugins/team-notes/1.0.0/team-notes-1.0.0.zip`);
  assert.equal(receipt.changelogUrl, `${base}/blob/${commit}/Plugins/team-notes/1.0.0/CHANGELOG.md`);
  assert.equal(receipt.artifacts[0].reviewUrl, `${base}/pull/23`);
});
