// Preview intentionally disables legacy mutation entry points. The actual
// guided host and publishing modules have their own interaction/contract tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const AdmZip = require('adm-zip');
const core = require('../out/skill-workbench.js');
const { createWorkbench } = require('../out/workbench-setup.js');

const scratch = require('./working-fixture.cjs').workingFixture('publish-entrypoint');
fs.mkdirSync(scratch, { recursive: true });
const legacyMutations = [
  'publishSkillToGit', 'openSkillEditor', 'openInteractiveBuilder', 'createSkill',
  'manageFolder', 'workbenchPublishSource', 'workbenchPublishRelease',
  'workbenchPrepareRelease', 'workbenchAssociateRepository', 'workbenchAddFile',
  'workbenchRestoreRelease', 'workbenchPlayground', 'syncToClaudeCode',
  'importSkillFromGit', 'packageSkill', 'addSupportingFiles', 'runEvals'
].map(name => `skillBuilder.${name}`);

function inventory(root) {
  const result = {};
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name), relative = path.relative(root, file);
      if (entry.isDirectory()) { result[`${relative}/`] = 'directory'; visit(file); }
      else result[relative] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  }
  visit(root); return result;
}

function fixture(t, managed = true) {
  const sandbox = fs.mkdtempSync(path.join(scratch, 'fixture-'));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const root = path.join(sandbox, '.skilljetty-prerelease');
  if (managed) createWorkbench(root);
  const outside = path.join(sandbox, 'unrelated-project'); fs.mkdirSync(outside);
  const manifest = '---\nname: sample\ndescription: Prepare sample reports. Use when asked for a sample report.\n---\n\n# Sample\nKeep supplied facts.\n';
  const manifestPath = path.join(outside, 'SKILL.md'); fs.writeFileSync(manifestPath, manifest);
  const archive = path.join(outside, 'incoming.skill');
  const zip = new AdmZip(); zip.addFile('sample/SKILL.md', Buffer.from(manifest + '\nIncoming package.\n')); zip.writeZip(archive);
  let saves = 0;
  const documents = [{ uri: { scheme: 'file', fsPath: manifestPath }, isDirty: true, async save() { saves++; fs.writeFileSync(manifestPath, 'UNEXPECTED OUTSIDE SAVE'); return true; } }];
  const commands = new Map(), counters = { guided: 0, legacyView: 0, publisher: 0, terminal: 0 };
  let readRoot;
  const vscode = {
    TreeItem: class {}, EventEmitter: class { event() {} },
    commands: {
      registerCommand(id, handler) { commands.set(id, handler); return { dispose() {} }; },
      async executeCommand(id, ...args) { if (!commands.has(id)) throw new Error(`Command is not registered: ${id}`); return commands.get(id)(...args); }
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: managed ? root : outside } }], textDocuments: documents,
      getConfiguration() { return { get(_key, fallback) { return fallback; } }; }
    },
    window: { createTerminal() { counters.terminal++; throw new Error('Legacy terminal must not run.'); } }
  };
  const extension = require.resolve('../out/extension.js'), originalLoad = Module._load;
  delete require.cache[extension];
  try {
    Module._load = function(id, parent, main) {
      if (id === 'vscode') return vscode;
      if (parent?.filename === extension && id === './guided-workbench.js') return { activateGuidedWorkbench(_context, hooks) { counters.guided++; readRoot = hooks.getRoot; } };
      if (parent?.filename === extension && id === './workbench-view.js') return { activateWorkbench() { counters.legacyView++; throw new Error('Legacy workbench must not activate.'); } };
      if (id === './repository-publisher.js') return new Proxy({}, { get() { return () => { counters.publisher++; throw new Error('Legacy publisher must not run.'); }; } });
      return originalLoad.call(this, id, parent, main);
    };
    require(extension).activate({ subscriptions: [] });
  } finally { Module._load = originalLoad; delete require.cache[extension]; }
  return { root, sandbox, outside, manifestPath, manifest, archive, documents, commands, counters, vscode, readRoot, saves: () => saves };
}

test('preview activation installs only its guided workflow and disables every legacy write entry point', async t => {
  const f = fixture(t);
  assert.equal(f.counters.guided, 1);
  assert.equal(f.counters.legacyView, 0);
  assert.equal(await f.readRoot(), f.root);
  for (const command of legacyMutations) assert.equal(f.commands.has(command), false, command);
  assert.equal(f.commands.size, 0, 'the guided module owns command registration; activation must not append legacy handlers');
  assert.equal(f.saves(), 0);
});

test('an ordinary project is never adopted or modified during preview activation', async t => {
  const f = fixture(t, false), before = inventory(f.sandbox);
  assert.equal(await f.readRoot(), undefined);
  assert.equal(fs.existsSync(path.join(f.outside, '.skilljetty-prerelease')), false);
  assert.deepEqual(inventory(f.sandbox), before);
  assert.equal(f.saves(), 0);
  assert.equal(f.counters.guided, 1);
  assert.equal(f.counters.legacyView, 0);
});

for (const selection of ['folder', 'manifest', 'package', 'managed draft']) {
  test(`disabled legacy publish commands cannot mutate an existing ${selection} or save outside dirty documents`, async t => {
    const f = fixture(t);
    let input = selection === 'folder' ? f.outside : selection === 'manifest' ? f.manifestPath : f.archive;
    if (selection === 'managed draft') {
      const source = path.join(f.root, 'skills', 'sample'); fs.mkdirSync(source);
      fs.writeFileSync(path.join(source, 'SKILL.md'), f.manifest);
      input = core.registerSkillFolder(f.root, source).sourcePath;
    }
    const before = inventory(f.sandbox);
    const skill = { name: 'sample', directoryName: 'sample', skillPath: input, manifestPath: selection === 'manifest' ? input : path.join(input, 'SKILL.md') };
    for (const command of legacyMutations) {
      await assert.rejects(f.vscode.commands.executeCommand(command, input, { skill }), /not registered/);
    }
    assert.equal(f.saves(), 0);
    assert.equal(f.documents[0].isDirty, true, 'activation must not flush an unrelated editor buffer');
    assert.deepEqual(inventory(f.sandbox), before, 'no draft import, release preparation, configuration write or replacement is permitted through disabled legacy commands');
    assert.equal(fs.readFileSync(f.manifestPath, 'utf8'), f.manifest);
    assert.equal(fs.existsSync(path.join(f.root, 'skill-builder.config.json')), false);
    assert.deepEqual(f.counters, { guided: 1, legacyView: 0, publisher: 0, terminal: 0 });
  });
}
