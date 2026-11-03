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

test('fresh managed project prepares one persistent local repo then builds and uploads without a separate Pull (local Git transport fixture)', async t => {
  const root = fixture(t), guided = require('../out/guided-workspace.js');
  const cp = require('node:child_process'), { pathToFileURL } = require('node:url');
  const { GitHubReviewService } = require('../out/github-review.js');
  const originals = { connect: guided.connectWorkspaceRepository, publish: guided.publishPreparedGuidedRelease,
    review: guided.reviewLibraryRelease, preflight: GitHubReviewService.prototype.preflight, spawn: cp.spawn };
  t.after(() => { guided.connectWorkspaceRepository = originals.connect; guided.publishPreparedGuidedRelease = originals.publish;
    guided.reviewLibraryRelease = originals.review; GitHubReviewService.prototype.preflight = originals.preflight; cp.spawn = originals.spawn; });
  const repository = 'https://github.com/example/skills.git', calls = [];
  const remote = path.join(root, 'scratch', 'fixture-remote'); fs.mkdirSync(remote);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const git = args => cp.execFileSync('git', ['-c', `safe.directory=${remote.replaceAll('\\', '/')}`, ...args], { cwd: remote, env, windowsHide: true, encoding: 'utf8', stdio: 'pipe' }).trim();
  git(['init', '-b', 'main']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--allow-empty', '-m', 'Initial']);
  const transportConfig = path.join(root, 'scratch', 'fixture-transport.gitconfig');
  fs.writeFileSync(transportConfig, `[safe]\n directory = ${remote.replaceAll('\\', '/')}\n directory = ${remote.replaceAll('\\', '/')}/.git\n`);
  // Redirect only this known test destination through real local Git. Origin
  // remains the reviewed HTTPS identity; no GitHub/network success is invented.
  const transport = ['-c', `url.${pathToFileURL(remote).href}.insteadOf=${repository}`, '-c', 'protocol.file.allow=always',
    '-c', `safe.directory=${remote.replaceAll('\\', '/')}`, '-c', `safe.directory=${remote.replaceAll('\\', '/')}/.git`];
  cp.spawn = (command, args, spawnOptions) => originals.spawn(command,
    command === 'git' && args.some(value => ['clone', 'fetch', 'push', 'ls-remote'].includes(value)) ? [...transport, ...args] : args,
    command === 'git' ? { ...spawnOptions, env: { ...spawnOptions.env, GIT_CONFIG_GLOBAL: transportConfig, GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' } } : spawnOptions);
  guided.connectWorkspaceRepository = async (_root, remote, selection) => {
    selection.beforeSave(); calls.push({ stage: 'connect', localPath: selection.localPath });
    return originals.connect(_root, remote, selection);
  };
  GitHubReviewService.prototype.preflight = async () => undefined;
  guided.reviewLibraryRelease = async () => ({ pr: { supported: true, status: 'awaiting_review', number: 24, identityVerified: true } });
  guided.publishPreparedGuidedRelease = async (_root, directory, connection, _progress, guard) => {
    guard(); calls.push({ stage: 'publish', localPath: connection.localPath });
    return originals.publish(_root, directory, connection, _progress, guard);
  };
  const controller = new GuidedWorkbenchController(root, { enforceWorkbench: true, getRepositorySettings: () => ({ repositoryUrl: repository }) });
  const id = await create(controller, 'fresh-notes'); await summary(controller);
  assert.equal(controller.state.localRepositoryAvailable, false);
  assert.equal(controller.state.localRepositorySetupPending, true);
  const payload = options([id], { exportMode: 'plugin', geminiZip: false });
  await controller.dispatch({ action: 'updateExportOptions', payload });
  await controller.dispatch({ action: 'publish', payload });
  assert.equal(controller.state.error, undefined, JSON.stringify(controller.state.receipt?.artifacts));
  const local = path.join(root, 'repositories', 'skills');
  assert.deepEqual(calls, [{ stage: 'connect', localPath: local }, { stage: 'publish', localPath: local }]);
  assert.equal(controller.state.receipt.local, false);
  assert.equal(controller.state.receipt.artifacts[0].status, 'uploaded');
  assert(fs.statSync(path.join(local, '.git')).isDirectory(), 'one persistent local repository was prepared');
  assert.equal(controller.state.localRepositoryAvailable, true);
  assert.equal(controller.state.localRepositorySetupPending, false);
  assert.equal(git(['rev-parse', 'refs/heads/plugins/team-notes/1.0.0']), controller.state.receipt.commit, 'the actual local fixture remote received the Git upload');
  assert(fs.statSync(controller.state.receipt.packagePath).isFile(), 'package generation and Git operations are real; GitHub review API is a fixture');
});

test('publication keeps explicit missing paths, existing defaults and Pull selections instead of bypassing identity checks', async t => {
  const root = fixture(t), guided = require('../out/guided-workspace.js'), original = guided.connectWorkspaceRepository;
  const repository = 'https://github.com/example/skills.git', expected = [];
  t.after(() => { guided.connectWorkspaceRepository = original; });
  guided.connectWorkspaceRepository = async (_root, remote, selection) => {
    expected.push(selection.localPath);
    return { repository: remote, baseBranch: 'main', localPath: selection.localPath };
  };
  const implicit = path.join(root, 'repositories', 'skills'), custom = path.join(root, 'repositories', 'custom');
  for (const localRepositoryPath of [implicit, custom]) {
    const controller = new GuidedWorkbenchController(root, { enforceWorkbench: true, getRepositorySettings: () => ({ repositoryUrl: repository, localRepositoryPath }) });
    await controller.resolveRepositoryConnection(() => {}, false, true);
  }
  const controller = new GuidedWorkbenchController(root, { enforceWorkbench: true, getRepositorySettings: () => ({ repositoryUrl: repository }) });
  await controller.resolveRepositoryConnection(() => {}, true, false);
  fs.mkdirSync(implicit);
  await controller.resolveRepositoryConnection(() => {}, false, true);
  assert.deepEqual(expected, [implicit, custom, implicit, implicit]);
});

function savedPlugin(t) {
  const root = fixture(t), releases = [], drafts = [];
  for (const name of ['alpha-notes', 'beta-notes']) {
    const source = path.join(root, 'scratch', name);
    fs.mkdirSync(path.join(source, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(source, 'SKILL.md'), `---\nname: ${name}\ndescription: Summarize notes when requested.\n---\n# Notes\nKeep the evidence.\n`);
    fs.writeFileSync(path.join(source, 'assets', 'sample.bin'), Buffer.from([0, 255, 1, 200]));
    const draft = core.registerSkillFolder(root, source);
    drafts.push(draft);
    releases.push(core.prepareSkillRelease(root, draft.id, '1.0.0', 'First version.'));
  }
  const plugin = require('../out/plugin-release.js').preparePluginRelease(root, {
    name: 'team-notes', description: 'Team notes bundle.', version: '2.0.0', author: 'DAF-TECH',
    license: 'MIT', documentationUrl: 'https://example.com/notes', changelog: 'Team release.',
    members: releases.map(release => ({ directory: release.directory }))
  });
  return { root, drafts, releases, plugin };
}

test('Home reopens a plugin as editable work, preserving newer drafts and restoring missing members', async t => {
  const f = savedPlugin(t);
  const newer = fs.readFileSync(path.join(f.drafts[0].sourcePath, 'SKILL.md'), 'utf8') + '\nNewer local instructions.\n';
  fs.writeFileSync(path.join(f.drafts[0].sourcePath, 'SKILL.md'), newer);
  core.completeWorkbenchSkill(f.root, f.drafts[1].id, f.releases[1].directory);
  const packed = fs.readFileSync(f.plugin.packagePath);
  const controller = new GuidedWorkbenchController(f.root, { enforceWorkbench: true });
  await controller.dispatch({ action: 'ready' }); await controller.loadHome();
  await controller.dispatch({ action: 'openPlugin', payload: { directory: f.plugin.directory } });
  assert.equal(controller.state.error, undefined);
  assert.equal(controller.state.step, 'edit'); assert.equal(controller.state.workflowIntent, 'plugin');
  assert.equal(controller.state.exportOptions.pluginName, 'team-notes');
  assert.equal(controller.state.exportOptions.pluginVersion, '2.0.1');
  assert.equal(controller.state.exportOptions.pluginAuthor, 'DAF-TECH');
  assert.equal(controller.state.exportOptions.pluginDocumentationUrl, 'https://example.com/notes');
  assert.equal(controller.state.exportOptions.members.filter(member => member.selected).length, 2);
  assert.equal(fs.readFileSync(path.join(f.drafts[0].sourcePath, 'SKILL.md'), 'utf8'), newer);
  const restored = core.listWorkbenchSkills(f.root).find(skill => skill.id === 'beta-notes');
  assert.deepEqual(fs.readFileSync(path.join(restored.sourcePath, 'assets/sample.bin')), Buffer.from([0, 255, 1, 200]));
  await summary(controller);
  assert.equal(controller.state.exportOptions.pluginName, 'team-notes');
  assert.equal(controller.state.exportOptions.pluginVersion, '2.0.1');
  assert.equal(controller.state.exportOptions.members.filter(member => member.selected).length, 2);
  await controller.dispatch({ action: 'savePackage', payload: { exportMode: 'plugin' } });
  assert.equal(controller.state.error, undefined);
  assert.equal(controller.state.receipt.version, '2.0.1');
  assert.deepEqual(fs.readFileSync(f.plugin.packagePath), packed);
});

test('Home refuses a corrupt or foreign plugin before restoring any draft', async t => {
  const f = savedPlugin(t);
  for (let index = 0; index < f.drafts.length; index++) core.completeWorkbenchSkill(f.root, f.drafts[index].id, f.releases[index].directory);
  const controller = new GuidedWorkbenchController(f.root, { enforceWorkbench: true });
  await controller.dispatch({ action: 'ready' }); await controller.loadHome();
  await controller.dispatch({ action: 'openPlugin', payload: { directory: path.join(f.root, 'scratch') } });
  assert.match(controller.state.error, /plugin saved in this project/);
  assert.deepEqual(core.listWorkbenchSkills(f.root), []);
  fs.appendFileSync(f.plugin.packagePath, 'tampered');
  await controller.dispatch({ action: 'openPlugin', payload: { directory: f.plugin.directory } });
  assert.match(controller.state.error, /hash mismatch/);
  assert.deepEqual(core.listWorkbenchSkills(f.root), []);
});

test('project settings changed after plugin verification stop restoration before writes', async t => {
  const f = savedPlugin(t);
  for (let index = 0; index < f.drafts.length; index++) core.completeWorkbenchSkill(f.root, f.drafts[index].id, f.releases[index].directory);
  const jobs = require('../out/workbench-jobs.js'), original = jobs.runWorkbenchJob;
  let generation = 0;
  const controller = new GuidedWorkbenchController(f.root, { enforceWorkbench: true,
    captureConfigurationGeneration: () => generation,
    assertConfigurationGeneration: expected => { if (expected !== generation) throw new Error('Project settings changed.'); }
  });
  await controller.dispatch({ action: 'ready' }); await controller.loadHome();
  jobs.runWorkbenchJob = async (...args) => { const result = await original(...args); if (args[0].kind === 'verifyExport') generation++; return result; };
  try {
    await controller.dispatch({ action: 'openPlugin', payload: { directory: f.plugin.directory } });
    assert.match(controller.state.error, /Project settings changed/);
    assert.deepEqual(core.listWorkbenchSkills(f.root), []);
  } finally { jobs.runWorkbenchJob = original; }
});

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
  assert.equal(receipt.sourceUrl, `${base}/tree/${commit}/Plugins/team-notes/source`);
  assert.equal(receipt.packageUrl, `${base}/blob/${commit}/Plugins/team-notes/team-notes-1.0.0.zip`);
  assert.equal(receipt.changelogUrl, `${base}/blob/${commit}/Plugins/team-notes/CHANGELOG.md`);
  assert.equal(receipt.artifacts[0].reviewUrl, `${base}/pull/23`);
});
