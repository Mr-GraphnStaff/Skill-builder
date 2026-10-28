const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function fixture() {
  const skill = { id: 'sample', name: 'sample', sourcePath: 'C:/fixture/skills/sample' };
  const commands = new Map();
  const picks = []; const inputs = []; const warnings = []; const errors = [];
  const creates = []; const associations = []; const inputOptions = []; const pickOptions = [];
  let confirmation; let createError;
  const vscode = {
    TreeItem: class {}, ThemeIcon: class {}, TreeItemCollapsibleState: { Collapsed: 1, None: 0 },
    EventEmitter: class { event() {} fire() {} dispose() {} }, ProgressLocation: { Notification: 1 },
    commands: { registerCommand(id, fn) { commands.set(id, fn); return { dispose() {} }; } },
    workspace: { onDidSaveTextDocument() { return { dispose() {} }; } },
    window: {
      createTreeView() { return { dispose() {} }; },
      async showQuickPick(items, options) { pickOptions.push({ items, options }); const pick = picks.shift(); return typeof pick === 'function' ? pick(items) : pick; },
      async showInputBox(options) { inputOptions.push(options); return inputs.shift(); },
      async showWarningMessage(message, options, action) { warnings.push({ message, options, action }); return confirmation; },
      showInformationMessage() { return new Promise(() => {}); },
      async showErrorMessage(message) { errors.push(message); },
      async withProgress(options, run) { return run(); }
    }
  };
  const publisher = {
    async listRepositoryChoices() { return [{ label: 'Existing remote', repository: 'https://github.com/example/existing.git' }]; },
    async createGitHubRepository(root, name, visibility) {
      creates.push({ root, name, visibility });
      if (createError) throw createError;
      return { repository: `https://github.com/example/${name}.git`, baseBranch: 'trunk', nameWithOwner: `example/${name}`, visibility };
    }
  };
  const core = {
    listWorkbenchSkills() { return [skill]; },
    updateSkillRepository(root, id, repository, branch) { associations.push({ root, id, repository, branch }); return { ...skill, repository, baseBranch: branch }; }
  };
  const modulePath = require.resolve('../out/workbench-view.js');
  const originalLoad = Module._load;
  delete require.cache[modulePath];
  try {
    Module._load = function(id, parent, main) {
      if (id === 'vscode') return vscode;
      if (parent?.filename === modulePath && id === './repository-publisher.js') return publisher;
      if (parent?.filename === modulePath && id === './skill-workbench.js') return core;
      return originalLoad.call(this, id, parent, main);
    };
    require(modulePath).activateWorkbench({ subscriptions: [] }, { getRoot: async () => 'C:/fixture', createSkill: async () => undefined });
  } finally { Module._load = originalLoad; }
  return {
    skill, picks, inputs, warnings, errors, creates, associations, inputOptions, pickOptions,
    confirm(value) { confirmation = value; }, failCreate(error) { createError = error; },
    run() { return commands.get('skillJettyBeta.workbenchAssociateRepository')({ skill }); }
  };
}

test('create repository association offers private first, confirms name/visibility, and uses backend base branch', async () => {
  const f = fixture();
  f.picks.push(items => items.find(item => item.create), items => items[0]);
  f.inputs.push('Skills'); f.confirm('Create Repository');
  await f.run();
  assert.deepEqual(f.errors, []);
  assert.equal(f.inputOptions.length, 1, 'creation must not ask for a separate base branch');
  assert.equal(f.inputOptions[0].value, 'sample');
  assert.equal(f.pickOptions[1].items[0].visibility, 'private');
  assert.equal(f.warnings.length, 1);
  assert.equal(f.warnings[0].options.modal, true);
  assert.match(f.warnings[0].message, /"Skills".*PRIVATE/);
  assert.deepEqual(f.creates, [{ root: 'C:/fixture', name: 'Skills', visibility: 'private' }]);
  assert.deepEqual(f.associations, [{ root: 'C:/fixture', id: 'sample', repository: 'https://github.com/example/Skills.git', branch: 'trunk' }]);
});

test('cancelled creation confirmation creates no repository and changes no association', async () => {
  const f = fixture();
  f.picks.push(items => items.find(item => item.create), items => items[0]);
  f.inputs.push('Skills');
  await f.run();
  assert.deepEqual(f.creates, []);
  assert.deepEqual(f.associations, []);
  assert.deepEqual(f.errors, []);
});

test('public repository creation requires explicit public selection and confirmation', async () => {
  const f = fixture();
  f.picks.push(items => items.find(item => item.create), items => items.find(item => item.visibility === 'public'));
  f.inputs.push('PublicSkills'); f.confirm('Create Repository');
  await f.run();
  assert.equal(f.creates[0].visibility, 'public');
  assert.match(f.warnings[0].message, /"PublicSkills".*PUBLIC/);
});

test('repository creation failure retains the current association', async () => {
  const f = fixture();
  f.picks.push(items => items.find(item => item.create), items => items[0]);
  f.inputs.push('Skills'); f.confirm('Create Repository'); f.failCreate(new Error('Authentication failed.'));
  await f.run();
  assert.deepEqual(f.associations, []);
  assert.match(f.errors.join('\n'), /Authentication failed/);
});

test('choosing an existing repository keeps the existing branch prompt and never creates a repository', async () => {
  const f = fixture();
  f.picks.push(items => items.find(item => item.repository));
  f.inputs.push('stable');
  await f.run();
  assert.deepEqual(f.creates, []);
  assert.equal(f.associations[0].repository, 'https://github.com/example/existing.git');
  assert.equal(f.associations[0].branch, 'stable');
});
