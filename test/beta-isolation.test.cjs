const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prereleaseWorkspaceRoot, prereleaseDataDirectory } = require('../out/prerelease-workspace.js');
const manifest = require('../package.json');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const Module = require('node:module');

test('public prerelease roots never autodetect production or local beta data', () => {
  const root = path.resolve('workspace');
  assert.equal(prereleaseWorkspaceRoot(root), path.join(root, '.skilljetty-prerelease'));
  assert.equal(prereleaseWorkspaceRoot(root, 'custom'), path.join(root, 'custom', '.skilljetty-prerelease'));
  assert.equal(prereleaseWorkspaceRoot(path.join(root, '.skilljetty-prerelease')), path.join(root, '.skilljetty-prerelease'));
  assert.equal(prereleaseWorkspaceRoot(root, path.join(root, '.skilljetty-prerelease')), path.join(root, '.skilljetty-prerelease'));
  assert.equal(prereleaseWorkspaceRoot(root, '.skilljetty-beta'), path.join(root, '.skilljetty-prerelease'));
  assert.equal(prereleaseWorkspaceRoot(root, '.skill-workbench'), path.join(root, '.skilljetty-prerelease'));
  assert.equal(prereleaseWorkspaceRoot(root, '.skilljetty-beta/drafts/existing'), path.join(root, '.skilljetty-prerelease'));
  assert.equal(prereleaseWorkspaceRoot(root, '.skill-workbench/drafts/existing'), path.join(root, '.skilljetty-prerelease'));
  assert.equal(prereleaseWorkspaceRoot(root, '.skilljetty-prerelease/skills/existing'), path.join(root, '.skilljetty-prerelease'));
});

test('public prerelease contributions use production command, setting and view names', () => {
  assert.equal(manifest.name, 'skill-builder');
  assert.equal(manifest.contributes.commands[0].command, 'skillBuilder.openWorkbench');
  for (const key of Object.keys(manifest.contributes.configuration.properties)) assert(key.startsWith('skillBuilder.'));
  assert.equal(manifest.contributes.viewsContainers.activitybar[0].id, 'skillBuilder');
  assert.equal(manifest.contributes.views.skillBuilder[0].id, 'skillBuilder.guidedLauncher');
  for (const name of fs.readdirSync(path.join(__dirname, '../src')).filter(name => name.endsWith('.ts'))) {
    const source = fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
    assert.doesNotMatch(source, /['"`]skillJettyBeta(?:\.|['"`])/, name);
  }
});

test('public prerelease creation preserves production and local beta data', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beta-isolation-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  fs.mkdirSync(path.join(root, '.skill-workbench'));
  const sentinel = path.join(root, '.skill-workbench', 'catalog.json');
  const production = JSON.stringify({version:1,skills:[]}); fs.writeFileSync(sentinel, production);
  const stableConnection = path.join(root, '.skill-workbench', 'connection.json');
  fs.writeFileSync(stableConnection, '{"repository":"private-stable-sentinel"}');
  fs.mkdirSync(path.join(root, '.skilljetty-beta'));
  const localBeta = path.join(root, '.skilljetty-beta', 'sentinel.json');
  fs.writeFileSync(localBeta, 'local-beta-preserved');
  const controller = new GuidedWorkbenchController(prereleaseWorkspaceRoot(root));
  await controller.dispatch({action:'createSkill',payload:{name:'beta-test',description:'Summarize supplied notes. Use when asked for a brief summary.',instructions:'# Instructions\nKeep the supplied facts.'}});
  assert.equal(controller.state.error, undefined);
  assert.equal(controller.state.active.name, 'beta-test');
  assert.equal(fs.readFileSync(sentinel,'utf8'), production);
  assert.equal(fs.readFileSync(stableConnection,'utf8'), '{"repository":"private-stable-sentinel"}');
  assert.equal(fs.readFileSync(localBeta,'utf8'), 'local-beta-preserved');
  assert.equal(fs.existsSync(path.join(root,'skills')), false);
  assert.equal(fs.existsSync(path.join(root,'.skilljetty-prerelease','skills','beta-test','SKILL.md')), true);
  assert.equal(controller.state.connection, undefined);
});

test('inherited absolute and escaping directory settings use channel-local defaults', () => {
  const root = prereleaseWorkspaceRoot(path.resolve('workspace'));
  for (const value of [path.resolve('stable-skills'), '../skills', '../../dist', 'C:\\stable\\skills', '.', '']) {
    assert.equal(prereleaseDataDirectory(root, value, 'skills'), path.join(root, 'skills'));
    assert.equal(prereleaseDataDirectory(root, value, 'dist'), path.join(root, 'dist'));
  }
  assert.equal(prereleaseDataDirectory(root, 'optional/skills', 'skills'), path.join(root, 'optional', 'skills'));
});

test('linked channel roots, directory overrides and safe defaults fail closed', t => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'prerelease-links-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const stable = path.join(workspace, 'stable'); fs.mkdirSync(stable);
  const root = prereleaseWorkspaceRoot(workspace); fs.mkdirSync(root);
  const link = (target, destination) => fs.symlinkSync(target, destination, process.platform === 'win32' ? 'junction' : 'dir');
  try { link(stable, path.join(root, 'linked')); }
  catch (error) { if (['EPERM', 'ENOTSUP'].includes(error.code)) { t.skip('Host cannot create a directory link.'); return; } throw error; }
  assert.throws(() => prereleaseDataDirectory(root, 'linked/subfolder', 'skills'), /links or junctions/);
  link(stable, path.join(root, 'skills'));
  assert.throws(() => prereleaseDataDirectory(root, '../stable', 'skills'), /links or junctions/);
  const selected = path.join(workspace, 'separate'); fs.mkdirSync(selected);
  link(stable, path.join(selected, '.skilljetty-prerelease'));
  assert.throws(() => prereleaseWorkspaceRoot(selected), /links or junctions/);
  assert.deepEqual(fs.readdirSync(stable), []);
});

test('actual extension activation wires both guided and legacy roots through isolation', async () => {
  const workspace = path.resolve('ordinary-production-workspace');
  const captured = {}, requestedSettings = [];
  let configured = '';
  const sentinel = new Error('Captured activation hooks');
  const vscode = {
    TreeItem: class {}, EventEmitter: class { event() {} },
    workspace: { workspaceFolders:[{uri:{fsPath:workspace}}], getConfiguration(namespace) {
      requestedSettings.push(namespace); return {get(_key, fallback) {return configured || fallback;}};
    } }
  };
  const file = require.resolve('../out/extension.js'), originalLoad = Module._load;
  delete require.cache[file];
  try {
    Module._load = function(id, parent, main) {
      if (id === 'vscode') return vscode;
      if (parent?.filename === file && id === './workbench-view.js') return {activateWorkbench(_context, hooks) {captured.legacy = hooks.getRoot;}};
      if (parent?.filename === file && id === './guided-workbench.js') return {activateGuidedWorkbench(_context, hooks) {captured.guided = hooks.getRoot; throw sentinel;}};
      return originalLoad.call(this,id,parent,main);
    };
    assert.throws(() => require(file).activate({subscriptions:[]}), error => error === sentinel);
    for (const readRoot of [captured.legacy,captured.guided]) {
      assert.equal(await readRoot(), path.join(workspace,'.skilljetty-prerelease'));
      configured = 'explicit-work';
      assert.equal(await readRoot(),path.join(workspace,'explicit-work','.skilljetty-prerelease'));
      configured = '';
    }
    assert(requestedSettings.every(namespace => namespace === 'skillBuilder'));
  } finally {Module._load = originalLoad; delete require.cache[file];}
});
