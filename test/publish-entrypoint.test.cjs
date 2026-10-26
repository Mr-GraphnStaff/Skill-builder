const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const AdmZip = require('adm-zip');
const core = require('../out/skill-workbench.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-entrypoint-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'skills', 'sample');
  fs.mkdirSync(source, { recursive: true });
  const manifest = '---\nname: sample\ndescription: Prepare sample reports. Use when asked for a sample report.\n---\n\n# Sample\n\nInspect inputs and prepare the requested report.\n';
  fs.writeFileSync(path.join(source, 'SKILL.md'), manifest);
  const skill = { name: 'sample', directoryName: 'sample', skillPath: source, manifestPath: path.join(source, 'SKILL.md') };
  const commands = new Map(); const errors = []; const warnings = []; const choices = []; const inputs = [];
  const panels = []; const executions = [];
  const documents = []; const openDialogs = [];
  const counters = { repositories: 0, create: 0, prepare: 0, push: 0, terminal: 0 };
  class Uri { constructor(file) { this.fsPath = file; this.scheme = 'file'; } static file(file) { return new Uri(file); } }
  const vscode = {
    Uri, TreeItem: class { constructor(label) { this.label = label; } },
    TreeItemCollapsibleState: { Collapsed: 1, None: 0 }, ThemeIcon: class {}, ViewColumn: { One: 1 },
    EventEmitter: class { event() {} fire() {} dispose() {} }, ProgressLocation: { Notification: 1 },
    commands: {
      registerCommand(id, fn) { commands.set(id, fn); return { dispose() {} }; },
      async executeCommand(id, ...args) { executions.push({ id, args }); return commands.get(id)?.(...args); }
    },
    workspace: {
      workspaceFolders: [{ uri: Uri.file(root) }], textDocuments: documents,
      getConfiguration() { return { get(key, fallback) { return fallback; } }; },
      onDidSaveTextDocument() { return { dispose() {} }; }, async openTextDocument(value) { return value; }
    },
    window: {
      registerTreeDataProvider() { return { dispose() {} }; }, createTreeView() { return { dispose() {} }; },
      createWebviewPanel() {
        const panel = { title: '', webview: { cspSource: 'mock', html: '', onDidReceiveMessage(fn) { panel.receive = fn; } } };
        panels.push(panel); return panel;
      },
      createTerminal() { counters.terminal++; throw new Error('Legacy terminal publisher must not be used.'); },
      async showErrorMessage(message) { errors.push(message); }, async showInformationMessage() {},
      async showWarningMessage(message) { warnings.push(message); return undefined; }, async showTextDocument() {},
      async showQuickPick(items, options) { const choice = choices.shift(); return typeof choice === 'function' ? choice(items, options) : choice; },
      async showInputBox() { return inputs.shift(); }, async withProgress(options, run) { return run(); },
      async showOpenDialog() { return openDialogs.shift(); }
    }, env: { clipboard: { async writeText() {} } }
  };
  const publisher = {
    async listRepositoryChoices() { counters.repositories++; return [{ label: 'Existing skill repository', repository: 'https://github.com/example/Skills.git' }]; },
    async createGitHubRepository() { counters.create++; throw new Error('No repository should be created in these tests.'); },
    async prepareRepositoryPublish() { counters.prepare++; return { repository: 'https://github.com/example/Skills.git', branch: 'skill/sample/1.0.0', relativePath: 'sample/1.0.0', files: [] }; },
    async pushPreparedRelease() { counters.push++; throw new Error('No push should occur in these tests.'); },
    async disposePublishPreview() {}
  };
  const extensionPath = require.resolve('../out/extension.js');
  const viewPath = require.resolve('../out/workbench-view.js');
  const originalLoad = Module._load;
  delete require.cache[extensionPath]; delete require.cache[viewPath];
  try {
    Module._load = function(id, parent, main) {
      if (id === 'vscode') return vscode;
      // These regressions exercise retained legacy entry points. The new
      // guided panel has its own controller/rendered acceptance suite.
      if (id === './guided-workbench.js' && parent?.filename === extensionPath) return { activateGuidedWorkbench() {} };
      if (id === './repository-publisher.js' && parent?.filename === viewPath) return publisher;
      return originalLoad.call(this, id, parent, main);
    };
    require(extensionPath).activate({ subscriptions: [], extensionUri: Uri.file(root) });
  } finally { Module._load = originalLoad; }
  return { root, source, manifest, skill, commands, errors, warnings, choices, inputs, panels, executions, counters, documents, openDialogs, Uri };
}

test('legacy Publish to Git command delegates to guided publishing without a config or terminal', async t => {
  const f = fixture(t);
  await f.commands.get('skillBuilder.publishSkillToGit')({ skill: f.skill });
  assert.deepEqual(f.errors, []);
  assert(f.executions.some(item => item.id === 'skillBuilder.workbenchPublishSource' && item.args[0] === f.source));
  assert.equal(f.counters.repositories, 1, 'native repository chooser must be reached');
  assert.equal(f.counters.terminal, 0);
  assert.equal(f.counters.create, 0); assert.equal(f.counters.push, 0);
  assert.equal(fs.existsSync(path.join(f.root, 'skill-builder.config.json')), false);
  assert.equal(fs.readFileSync(f.skill.manifestPath, 'utf8'), f.manifest);
});

test('legacy editor publish button routes to the same native flow and offers the new label', async t => {
  const f = fixture(t);
  await f.commands.get('skillBuilder.openSkillEditor')({ skill: f.skill });
  assert.equal(f.panels.length, 1);
  assert.match(f.panels[0].webview.html, /Publish Skill Version…/);
  await f.panels[0].receive({ command: 'publishSkillToGit' });
  assert.deepEqual(f.errors, []);
  assert(f.executions.some(item => item.id === 'skillBuilder.workbenchPublishSource'));
  assert.equal(f.counters.repositories, 1);
  assert.equal(f.counters.terminal, 0);
  assert.equal(fs.existsSync(path.join(f.root, 'skill-builder.config.json')), false);
});

test('external legacy editor publish saves the original dirty document before making its managed copy', async t => {
  const f = fixture(t);
  const external = path.join(f.root, 'external-input'); fs.mkdirSync(external);
  const manifestPath = path.join(external, 'SKILL.md');
  const initial = f.manifest.replace('name: sample', 'name: external-sample');
  const latest = `${initial}\nLatest unsaved author edit.\n`;
  fs.writeFileSync(manifestPath, initial);
  const externalSkill = { name: 'external-sample', directoryName: 'external-input', skillPath: external, manifestPath };
  let saves = 0;
  f.documents.push({ uri: f.Uri.file(manifestPath), isDirty: true, async save() { saves++; fs.writeFileSync(manifestPath, latest); this.isDirty = false; return true; } });
  await f.commands.get('skillBuilder.openSkillEditor')({ skill: externalSkill });
  await f.panels[0].receive({ command: 'publishSkillToGit' });
  assert.deepEqual(f.errors, []);
  assert.equal(saves, 1);
  assert.equal(fs.readFileSync(path.join(f.root, 'skills', 'external-sample', 'SKILL.md'), 'utf8'), latest);
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), latest);
  assert.equal(f.counters.repositories, 1);
  assert.equal(f.counters.push, 0);
});

test('failed original document save aborts external legacy editor publish before copying or repository selection', async t => {
  const f = fixture(t);
  const external = path.join(f.root, 'external-input'); fs.mkdirSync(external);
  const manifestPath = path.join(external, 'SKILL.md');
  const original = f.manifest.replace('name: sample', 'name: external-sample');
  fs.writeFileSync(manifestPath, original);
  const externalSkill = { name: 'external-sample', directoryName: 'external-input', skillPath: external, manifestPath };
  f.documents.push({ uri: f.Uri.file(manifestPath), isDirty: true, async save() { return false; } });
  await f.commands.get('skillBuilder.openSkillEditor')({ skill: externalSkill });
  await f.panels[0].receive({ command: 'publishSkillToGit' });
  assert.match(f.errors.join('\n'), /Save the skill files/);
  assert.equal(fs.existsSync(path.join(f.root, 'skills', 'external-sample')), false);
  assert.deepEqual(core.listWorkbenchSkills(f.root), []);
  assert.equal(f.counters.repositories, 0); assert.equal(f.counters.create, 0); assert.equal(f.counters.push, 0);
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), original);
});

test('Manage Folder also aborts before registration when an original document cannot be saved', async t => {
  const f = fixture(t);
  const external = path.join(f.root, 'external-input'); fs.mkdirSync(external);
  const manifestPath = path.join(external, 'SKILL.md');
  fs.writeFileSync(manifestPath, f.manifest.replace('name: sample', 'name: external-sample'));
  f.documents.push({ uri: f.Uri.file(manifestPath), isDirty: true, async save() { return false; } });
  f.openDialogs.push([f.Uri.file(external)]);
  await f.commands.get('skillBuilder.manageFolder')();
  assert.match(f.errors.join('\n'), /Save the skill files/);
  assert.equal(fs.existsSync(path.join(f.root, 'skills', 'external-sample')), false);
  assert.deepEqual(core.listWorkbenchSkills(f.root), []);
  assert.equal(f.counters.repositories, 0);
});

test('selected SKILL.md reuses its managed folder and cancellation stops before preparing a release', async t => {
  const f = fixture(t);
  core.registerSkillFolder(f.root, f.source);
  await f.commands.get('skillBuilder.workbenchPublishSource')(f.skill.manifestPath);
  assert.deepEqual(f.errors, []);
  assert.equal(core.listWorkbenchSkills(f.root).length, 1);
  assert.equal(f.counters.repositories, 1);
  assert.equal(fs.existsSync(path.join(f.root, 'releases')), false);
  assert.equal(f.counters.create, 0); assert.equal(f.counters.prepare, 0); assert.equal(f.counters.push, 0);
});

test('missing release prompts for preparation after association and stops safely when version entry is cancelled', async t => {
  const f = fixture(t);
  f.choices.push(items => items.find(item => item.repository));
  f.inputs.push('main', undefined);
  await f.commands.get('skillBuilder.workbenchPublishSource')(f.source);
  assert.deepEqual(f.errors, []);
  assert(f.executions.some(item => item.id === 'skillBuilder.workbenchPrepareRelease'));
  assert.equal(core.listWorkbenchSkills(f.root)[0].repository, 'https://github.com/example/Skills.git');
  assert.equal(fs.existsSync(path.join(f.root, 'releases')), false);
  assert.equal(f.counters.prepare, 0); assert.equal(f.counters.push, 0); assert.equal(f.counters.create, 0);
});

test('guided legacy publish reaches review after association and preparation but never pushes without explicit confirmation', async t => {
  const f = fixture(t);
  f.choices.push(items => items.find(item => item.repository), items => items[0]);
  f.inputs.push('main', '1.0.0', 'Initial test release.');
  await f.commands.get('skillBuilder.publishSkillToGit')({ skill: f.skill });
  assert.deepEqual(f.errors, []);
  assert.equal(core.listSkillReleases(f.root, 'sample').length, 1);
  assert.equal(f.counters.prepare, 1);
  assert.equal(f.counters.push, 0);
  assert.equal(f.counters.create, 0);
  assert.match(f.warnings.join('\n'), /Push sample 1\.0\.0 to https:\/\/github.com\/example\/Skills.git/);
  assert.doesNotMatch(f.warnings.join('\n'), /skill-builder\.config\.json/);
  assert.equal(core.listWorkbenchSkills(f.root).length, 1, 'cancelled publish retains the active skill');
});

test('.skill publish import preserves original bytes and never overwrites a colliding working draft', async t => {
  const f = fixture(t);
  const archive = path.join(f.root, 'incoming.skill');
  const zip = new AdmZip();
  zip.addFile('sample/SKILL.md', Buffer.from(f.manifest)); zip.writeZip(archive);
  const original = fs.readFileSync(archive);
  core.registerSkillFolder(f.root, f.source);
  await f.commands.get('skillBuilder.workbenchPublishSource')(archive);
  assert.match(f.errors.join('\n'), /No existing draft was replaced/);
  assert.match(f.errors.join('\n'), /Open SkillJetty/);
  assert.deepEqual(fs.readFileSync(archive), original);
  assert.equal(fs.readFileSync(f.skill.manifestPath, 'utf8'), f.manifest);
  assert.equal(f.counters.repositories, 0); assert.equal(f.counters.push, 0);
});

test('a standalone .skill publish selection imports reversibly before the repository chooser and cancels without external effects', async t => {
  const f = fixture(t);
  const archive = path.join(f.root, 'incoming.skill');
  const zip = new AdmZip();
  zip.addFile('imported/SKILL.md', Buffer.from(f.manifest.replace('name: sample', 'name: imported'))); zip.writeZip(archive);
  const original = fs.readFileSync(archive);
  await f.commands.get('skillBuilder.workbenchPublishSource')(archive);
  assert.deepEqual(f.errors, []);
  const managed = core.listWorkbenchSkills(f.root);
  assert.equal(managed.length, 1); assert.equal(managed[0].name, 'imported');
  assert.deepEqual(fs.readFileSync(archive), original);
  assert.equal(f.counters.repositories, 1);
  assert.equal(f.counters.create, 0); assert.equal(f.counters.prepare, 0); assert.equal(f.counters.push, 0);
  assert.equal(fs.existsSync(path.join(f.root, 'skill-builder.config.json')), false);
});
