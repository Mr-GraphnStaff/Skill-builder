const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { betaWorkspaceRoot } = require('../out/beta-workspace.js');
const manifest = require('../package.json');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const Module = require('node:module');

test('beta roots never autodetect production data and explicit selections do not double-nest', () => {
  const root = path.resolve('workspace');
  assert.equal(betaWorkspaceRoot(root), path.join(root, '.skilljetty-beta'));
  assert.equal(betaWorkspaceRoot(root, 'custom'), path.join(root, 'custom', '.skilljetty-beta'));
  assert.equal(betaWorkspaceRoot(path.join(root, '.skilljetty-beta')), path.join(root, '.skilljetty-beta'));
  assert.equal(betaWorkspaceRoot(root, path.join(root, '.skilljetty-beta')), path.join(root, '.skilljetty-beta'));
});

test('beta contribution namespaces are disjoint from production commands, settings and views', () => {
  assert.equal(manifest.name, 'skill-builder-beta');
  assert.equal(manifest.contributes.commands[0].command, 'skillJettyBeta.openWorkbench');
  for (const key of Object.keys(manifest.contributes.configuration.properties)) assert(key.startsWith('skillJettyBeta.'));
  assert.equal(manifest.contributes.viewsContainers.activitybar[0].id, 'skillJettyBeta');
  assert.equal(manifest.contributes.views.skillJettyBeta[0].id, 'skillJettyBeta.guidedLauncher');
  for (const name of fs.readdirSync(path.join(__dirname, '../src')).filter(name => name.endsWith('.ts'))) {
    const source = fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
    assert.doesNotMatch(source, /['"`]skillBuilder(?:\.|['"`])/, name);
  }
});

test('normal beta creation does not read or alter production workspace state', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beta-isolation-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  fs.mkdirSync(path.join(root, '.skill-workbench'));
  const sentinel = path.join(root, '.skill-workbench', 'catalog.json');
  const production = JSON.stringify({version:1,skills:[]}); fs.writeFileSync(sentinel, production);
  const controller = new GuidedWorkbenchController(betaWorkspaceRoot(root));
  await controller.dispatch({action:'createSkill',payload:{name:'beta-test',description:'Summarize supplied notes. Use when asked for a brief summary.',instructions:'# Instructions\nKeep the supplied facts.'}});
  assert.equal(controller.state.error, undefined);
  assert.equal(controller.state.active.name, 'beta-test');
  assert.equal(fs.readFileSync(sentinel,'utf8'), production);
  assert.equal(fs.existsSync(path.join(root,'skills')), false);
  assert.equal(fs.existsSync(path.join(root,'.skilljetty-beta','skills','beta-test','SKILL.md')), true);
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
      assert.equal(await readRoot(), path.join(workspace,'.skilljetty-beta'));
      configured = 'explicit-work';
      assert.equal(await readRoot(),path.join(workspace,'explicit-work','.skilljetty-beta'));
      configured = '';
    }
    assert(requestedSettings.every(namespace => namespace === 'skillJettyBeta'));
  } finally {Module._load = originalLoad; delete require.cache[file];}
});
