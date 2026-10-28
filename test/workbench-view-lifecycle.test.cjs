const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const core = require('../out/skill-workbench.js');
const library = require('../out/workbench-library.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-lifecycle-(round)-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  function draft(name = 'sample') {
    const source = path.join(root, 'skills', name);
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'SKILL.md'), `---\nname: ${name}\ndescription: Prepare project reports. Use when asked to turn project notes into a report.\nmetadata:\n  version: "1.0.0"\n---\n\n# Project report\n\nSummarize supplied facts and retain unknowns.\n`);
    return core.registerSkillFolder(root, source);
  }
  const skill = draft();
  const commands = new Map(); const memory = new Map(); const memoryReads = []; const executions = [];
  const picks = []; const inputs = []; const confirmations = [];
  const pickOptions = []; const inputOptions = []; const documents = []; const errors = []; const progress = [];
  const counts = { repositories: 0, prepared: 0, pushed: 0, disposed: 0 };
  let provider;
  class Uri { constructor(file) { this.fsPath = file; this.scheme = 'file'; } static file(file) { return new Uri(file); } }
  const vscode = {
    Uri, TreeItem: class { constructor(label) { this.label = label; } }, ThemeIcon: class {},
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    EventEmitter: class { event() {} fire() {} dispose() {} }, ProgressLocation: { Notification: 1 },
    commands: {
      registerCommand(id, fn) { commands.set(id, fn); return { dispose() {} }; },
      async executeCommand(id, ...args) { executions.push(id); return commands.get(id)?.(...args); }
    },
    workspace: {
      textDocuments: [], onDidSaveTextDocument() { return { dispose() {} }; },
      async openTextDocument(value) { documents.push(value); return value; }
    },
    window: {
      createTreeView(id, options) { provider = options.treeDataProvider; return { dispose() {} }; },
      async showQuickPick(items, options) { pickOptions.push({ items, options }); const next = picks.shift(); return typeof next === 'function' ? next(items) : next; },
      async showInputBox(options) { inputOptions.push(options); return inputs.shift(); },
      async showWarningMessage() { return confirmations.shift(); }, async showInformationMessage() {},
      async showErrorMessage(message) { errors.push(message); }, async showTextDocument() {},
      async withProgress(options, run) { return run({ report(value) { progress.push(value.message); } }); }
    }
  };
  const repository = 'https://github.com/example/Skills.git';
  const publisher = {
    async listRepositoryChoices() { counts.repositories++; return [{ label: 'Skills repository', repository }]; },
    async prepareRepositoryPublish(directory, target, base, report) {
      counts.prepared++; report?.('Preparing checked upload preview');
      const release = core.verifySkillRelease(directory);
      return { checkoutPath: root, repository: target, branch: `skills/${release.skillName}/${release.version}`, relativePath: `${release.skillName}/${release.version}`, skillName: release.skillName, version: release.version, files: [`${release.skillName}/${release.version}/CHANGELOG.md`] };
    },
    async pushPreparedRelease(preview, report) { counts.pushed++; report?.('Confirmed exact remote commit'); return { repository: preview.repository, branch: preview.branch, commit: 'a'.repeat(40) }; },
    async disposePublishPreview() { counts.disposed++; }
  };
  const modulePath = require.resolve('../out/workbench-view.js');
  delete require.cache[modulePath];
  const load = Module._load;
  try {
    Module._load = function(id, parent, main) {
      if (id === 'vscode') return vscode;
      if (id === './repository-publisher.js' && parent?.filename === modulePath) return publisher;
      return load.call(this, id, parent, main);
    };
    require(modulePath).activateWorkbench({ subscriptions: [], workspaceState: {
      get(key) { memoryReads.push(key); return memory.get(key); }, async update(key, value) { memory.set(key, value); }
    } }, { getRoot: async () => root, createSkill: async () => undefined });
  } finally { Module._load = load; }
  return { root, skill, draft, commands, memory, memoryReads, picks, inputs, confirmations, pickOptions, inputOptions, documents, errors, progress, counts, repository, provider, executions };
}

test('public prerelease does not read or reuse the stable repository preference', async t => {
  const f = fixture(t);
  const stable = { repository: 'https://github.com/example/StableOnly.git', baseBranch: 'stable' };
  f.memory.set('skillBuilder.defaultRepository', stable);
  await f.commands.get('skillBuilder.workbenchAssociateRepository')({ skill: f.skill });
  assert(f.memoryReads.includes('skillBuilder.prerelease.defaultRepository'));
  assert(!f.memoryReads.includes('skillBuilder.defaultRepository'));
  assert.deepEqual(f.memory.get('skillBuilder.defaultRepository'), stable);
  assert(!f.pickOptions[0].items.some(item => item.repository === stable.repository));
});

test('guided workbench owns its activity container while retained native commands remain internal', async t => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const container = manifest.contributes.viewsContainers.activitybar.find(item => item.id === 'skillBuilder');
  assert.equal(container.title, 'SkillJetty');
  assert(fs.existsSync(path.join(__dirname, '..', container.icon)));
  assert.equal(manifest.contributes.views.skillBuilder[0].id, 'skillBuilder.guidedLauncher');
  assert.equal(manifest.contributes.views.skillBuilder[0].type, 'webview');
  assert.equal(manifest.contributes.views.explorer, undefined);
  const hidden = manifest.contributes.menus.commandPalette;
  assert(manifest.contributes.commands.every(item => item.command === 'skillBuilder.openWorkbench' || hidden.some(rule => rule.command === item.command && rule.when === 'false')));
  const declared = new Set(manifest.contributes.commands.map(item => item.command));
  for (const item of Object.values(manifest.contributes.menus).flat()) assert(declared.has(item.command), `Menu references undeclared command ${item.command}`);
  const f = fixture(t);
  await f.commands.get('skillBuilder.openWorkbench')();
  assert.deepEqual(f.executions, ['workbench.view.extension.skillBuilder', 'skillBuilder.workbenchView.focus']);
});

test('native lifecycle tree separates drafts and library with Edit, Check, Publish as dominant draft actions', async t => {
  const f = fixture(t);
  const top = await f.provider.getChildren();
  assert.equal(top[0].label, 'Create a new skill…');
  assert.deepEqual(top.filter(node => node.kind === 'group').map(node => node.label), ['Drafts', 'Published / library']);
  const draft = (await f.provider.getChildren(top.find(node => node.group === 'drafts')))[0];
  const children = await f.provider.getChildren(draft);
  assert.deepEqual(children.slice(0, 3).map(node => node.label), ['Edit skill', 'Check skill', 'Publish…']);
  assert(children.some(node => node.kind === 'tools'));
});

test('confirmed repository association is remembered, cancellation is not, and later drafts reuse it', async t => {
  const f = fixture(t);
  await f.commands.get('skillBuilder.workbenchAssociateRepository')({ skill: f.skill });
  assert.equal(f.memory.size, 0);
  f.picks.push(items => items.find(item => item.repository)); f.inputs.push('main');
  await f.commands.get('skillBuilder.workbenchAssociateRepository')({ skill: f.skill });
  assert.equal(f.inputOptions.at(-1).value, 'main');
  assert.deepEqual(f.memory.get('skillBuilder.prerelease.defaultRepository'), { repository: f.repository, baseBranch: 'main' });
  const second = f.draft('second');
  f.inputs.push('1.0.0', 'Initial second skill.');
  const repositoryCalls = f.counts.repositories;
  const pickCount = f.pickOptions.length;
  await f.commands.get('skillBuilder.workbenchPublishRelease')({ skill: second });
  assert.deepEqual(f.errors, []);
  assert.equal(f.counts.repositories, repositoryCalls, 'a confirmed workspace default avoids another repository chooser');
  assert.equal(f.pickOptions.length, pickCount, 'freshly prepared single version needs no redundant version picker');
  assert.equal(core.listWorkbenchSkills(f.root).find(skill => skill.id === 'second').repository, f.repository);
  assert.equal(f.inputOptions.find(option => /Release version for second/.test(option.title)).value, '1.0.0');
  assert.equal(f.counts.pushed, 0, 'preview cancellation must not upload');
});

test('a verified upload stays in the library and Edit next version prepares a new version instead of republishing v1', async t => {
  const f = fixture(t);
  f.memory.set('skillBuilder.prerelease.defaultRepository', { repository: f.repository, baseBranch: 'main' });
  f.inputs.push('1.0.0', 'Initial publication.'); f.confirmations.push('Push Release Branch');
  await f.commands.get('skillBuilder.workbenchPublishRelease')({ skill: f.skill });
  assert.deepEqual(f.errors, []);
  assert.equal(f.counts.pushed, 1);
  assert.equal(core.listWorkbenchSkills(f.root).length, 0);
  const top = await f.provider.getChildren();
  const entries = await f.provider.getChildren(top.find(node => node.group === 'library'));
  assert.equal(entries.length, 1);
  assert.match(entries[0].description, /uploaded.*awaiting merge/);
  const actions = await f.provider.getChildren(entries[0]);
  assert(actions.some(node => node.label === 'Edit next version…'));
  const receipt = f.documents.find(document => document.content?.includes('**Uploaded — awaiting merge verification.**'));
  assert.equal(receipt.language, 'markdown');
  assert.match(receipt.content, /Merge status is not tracked here/);
  assert.match(receipt.content, /https:\/\/github.com\/example\/Skills\/blob\/skills%2Fsample%2F1.0.0\/sample\/1.0.0\/sample-1.0.0.skill/);
  assert.match(receipt.content, /source\/sample/);
  assert.match(receipt.content, /CHANGELOG.md/);
  assert.match(receipt.content, /%28round%29/);
  const immutable = fs.readFileSync(path.join(entries[0].libraryEntry.directory, 'source', 'sample', 'SKILL.md'));
  await f.commands.get('skillBuilder.workbenchRestoreRelease')(entries[0]);
  const restored = core.listWorkbenchSkills(f.root)[0];
  fs.appendFileSync(path.join(restored.sourcePath, 'SKILL.md'), '\nNew revision content.\n');
  f.inputs.push(undefined);
  const prepared = f.counts.prepared;
  await f.commands.get('skillBuilder.workbenchPublishRelease')({ skill: restored });
  assert.deepEqual(f.errors, []);
  assert.equal(f.inputOptions.at(-1).value, '1.0.1');
  assert.equal(f.counts.prepared, prepared, 'cancelling the next-version prompt must not republish the old version');
  assert.equal(f.counts.pushed, 1);
  assert.deepEqual(fs.readFileSync(path.join(entries[0].libraryEntry.directory, 'source', 'sample', 'SKILL.md')), immutable);
});

test('stale prepared snapshots are not offered when the current draft has changed', async t => {
  const f = fixture(t);
  core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Prepared old draft.');
  fs.appendFileSync(path.join(f.skill.sourcePath, 'SKILL.md'), '\nChanged after preparation.\n');
  f.memory.set('skillBuilder.prerelease.defaultRepository', { repository: f.repository, baseBranch: 'main' });
  f.inputs.push(undefined);
  await f.commands.get('skillBuilder.workbenchPublishRelease')({ skill: f.skill });
  assert.deepEqual(f.errors, []);
  assert.equal(f.inputOptions.at(-1).value, '1.0.1');
  assert.equal(f.counts.prepared, 0); assert.equal(f.counts.pushed, 0);
  assert.equal(f.pickOptions.length, 0);
});

test('checks use readable Markdown and block repository work for an invalid draft', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.skill.sourcePath, 'SKILL.md'), '---\nname: sample\ndescription: ""\n---\n# Invalid\n');
  await f.commands.get('skillBuilder.workbenchPublishRelease')({ skill: f.skill });
  assert.equal(f.counts.repositories, 0); assert.equal(f.counts.prepared, 0);
  const report = f.documents.at(-1);
  assert.equal(report.language, 'markdown');
  assert.match(report.content, /Local validation needs attention/);
  assert.match(report.content, /## Errors/);
  assert.doesNotMatch(report.content, /"report"\s*:/);
});

test('a damaged old library entry cannot hide Drafts or offer restoration of corrupt bytes', async t => {
  const f = fixture(t);
  const release = core.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Initial version.');
  fs.appendFileSync(release.packagePath, 'tampered');
  const top = await f.provider.getChildren();
  const drafts = await f.provider.getChildren(top.find(node => node.group === 'drafts'));
  assert.equal(drafts[0].skill.id, 'sample');
  const history = top.find(node => node.group === 'library');
  assert.equal(history.description, 'needs attention');
  const issues = await f.provider.getChildren(history);
  assert.equal(issues.length, 1);
  assert.match(issues[0].label, /Library needs attention/);
  assert.equal(issues[0].libraryEntry, undefined);
  await f.commands.get('skillBuilder.workbenchLibraryIssue')('Package hash mismatch.');
  assert.match(f.documents.at(-1).content, /Drafts/);
});
