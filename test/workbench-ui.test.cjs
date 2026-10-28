const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const wb = require('../out/skill-workbench.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-ui-qa-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'skills', 'ui-sample');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: ui-sample\ndescription: Manage sample reports. Use when asked to prepare a sample report.\n---\n# Sample\n');
  const skill = wb.registerSkillFolder(root, source);
  const commands = new Map(); const errors = []; const inputs = []; const choices = [];
  const documents = []; const counters = { prepared: 0, pushed: 0, disposed: 0 };
  class Uri { constructor(file) { this.fsPath = file; this.scheme = 'file'; } static file(file) { return new Uri(file); } }
  let provider;
  const vscode = {
    Uri, TreeItem: class { constructor(label) { this.label = label; } },
    TreeItemCollapsibleState: { Collapsed: 1, None: 0 }, ThemeIcon: class {},
    EventEmitter: class { event() {} fire() {} dispose() {} }, ProgressLocation: { Notification: 1 },
    commands: { registerCommand(id, fn) { commands.set(id, fn); return { dispose() {} }; }, async executeCommand() {} },
    workspace: { textDocuments: documents, onDidSaveTextDocument() { return { dispose() {} }; }, async openTextDocument(value) { return value; } },
    window: {
      createTreeView(id, options) { provider = options.treeDataProvider; return { dispose() {} }; },
      async showErrorMessage(message) { errors.push(message); }, async showInformationMessage() {},
      async showWarningMessage() { return undefined; }, async showTextDocument() {},
      async showQuickPick() { return choices.shift(); }, async showInputBox() { return inputs.shift(); },
      async showOpenDialog() { return [Uri.file(path.join(root, 'input.bin'))]; },
      async withProgress(options, run) { return run(); }
    }, env: { clipboard: { async writeText() {} } }
  };
  const publisher = {
    async listRepositoryChoices() { return []; },
    async prepareRepositoryPublish() { counters.prepared++; return { repository: 'local', branch: 'release', relativePath: 'releases/ui-sample/1.0.0', files: [] }; },
    async pushPreparedRelease() { counters.pushed++; return { commit: 'mock', branch: 'release' }; },
    async disposePublishPreview() { counters.disposed++; }
  };
  const load = Module._load;
  const modulePath = require.resolve('../out/workbench-view.js');
  delete require.cache[modulePath];
  try {
    Module._load = function(id, parent, main) {
      if (id === 'vscode') return vscode;
      if (id === './repository-publisher.js' && parent?.filename === modulePath) return publisher;
      return load.call(this, id, parent, main);
    };
    require(modulePath).activateWorkbench({ subscriptions: [] }, { getRoot: async () => root, createSkill: async () => undefined });
  } finally { Module._load = load; }
  return { root, source, skill, commands, errors, inputs, choices, documents, counters, provider, Uri };
}

test('native workbench exposes named keyboard-addressable actions and nested binary files', async t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.source, 'assets', 'deep'), { recursive: true });
  fs.writeFileSync(path.join(f.source, 'assets', 'deep', 'image.bin'), Buffer.from([0, 255, 13, 10]));
  const top = await f.provider.getChildren();
  assert.equal(top[0].label, 'Create a new skill…');
  const drafts = top.find(node => node.group === 'drafts');
  const skill = (await f.provider.getChildren(drafts)).find(node => node.kind === 'skill');
  const children = await f.provider.getChildren(skill);
  assert.deepEqual(children.slice(0, 3).map(node => node.label), ['Edit skill', 'Check skill', 'Publish…']);
  const tools = children.find(node => node.kind === 'tools');
  assert.ok((await f.provider.getChildren(tools)).some(node => node.label === 'Playground — manual test cases'));
  const assets = children.find(node => node.label === 'assets');
  const deep = (await f.provider.getChildren(assets))[0];
  const binary = (await f.provider.getChildren(deep))[0];
  assert.equal(binary.label, 'image.bin');
  assert.equal(binary.command.command, 'vscode.open');
});

test('add-file command rejects traversal even if a host bypasses input validation', async t => {
  const f = fixture(t);
  f.choices.push('Create an empty text file'); f.inputs.push('../escaped.md');
  await f.commands.get('skillBuilder.workbenchAddFile')({ skill: f.skill });
  assert.match(f.errors.join('\n'), /Unsafe file path/);
  assert.equal(fs.existsSync(path.join(f.root, 'skills', 'escaped.md')), false);
});

test('copy-file command preserves nested binary bytes without flattening', async t => {
  const f = fixture(t); const bytes = Buffer.from([0, 255, 13, 10, 128]);
  fs.writeFileSync(path.join(f.root, 'input.bin'), bytes);
  f.choices.push('Copy an existing file'); f.inputs.push('assets/deep/data.bin');
  await f.commands.get('skillBuilder.workbenchAddFile')({ skill: f.skill });
  assert.deepEqual(f.errors, []);
  assert.deepEqual(fs.readFileSync(path.join(f.source, 'assets', 'deep', 'data.bin')), bytes);
});

test('failed dirty-document save stops release preparation before prompting or writing', async t => {
  const f = fixture(t); let saved = 0;
  f.documents.push({ uri: f.Uri.file(path.join(f.source, 'SKILL.md')), isDirty: true, async save() { saved++; return false; } });
  f.inputs.push('1.0.0', 'Changes');
  await f.commands.get('skillBuilder.workbenchPrepareRelease')({ skill: f.skill });
  assert.equal(saved, 1); assert.equal(f.inputs.length, 2);
  assert.match(f.errors.join('\n'), /Save the skill files/);
  assert.equal(fs.existsSync(path.join(f.root, 'releases')), false);
});

test('publish cancellation disposes preview without push or active-skill cleanup', async t => {
  const f = fixture(t);
  wb.updateSkillRepository(f.root, f.skill.id, '/local/repository', 'main');
  const release = wb.prepareSkillRelease(f.root, f.skill.id, '1.0.0', 'Changes');
  f.choices.push({ release });
  await f.commands.get('skillBuilder.workbenchPublishRelease')({ skill: f.skill });
  assert.deepEqual(f.errors, []);
  assert.deepEqual(f.counters, { prepared: 1, pushed: 0, disposed: 1 });
  assert.equal(wb.listWorkbenchSkills(f.root).length, 1);
  assert.ok(fs.existsSync(f.source));
});
