const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { renderGuidedWorkbench } = require('../out/guided-workbench-html.js');
const { connectRepositoryFlow, normalizeGitHubRepository } = require('../out/repository-connection-flow.js');
const flowRoot = path.resolve(__dirname, '../working/flow-fixture');
const workbenchFolder = path.join(flowRoot, 'workbench');
const localParent = path.join(flowRoot, 'repositories');
const nextLocal = path.join(localParent, 'next');

function state(overrides = {}) {
  return { step: 'start', hasWorkspace: true, workFolder: workbenchFolder,
    repositories: [], drafts: [], library: [], files: [], target: 'portable', ...overrides };
}

function connectionButtons(html) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .filter(([, , label]) => /^(?:Connect(?: a)? repository|Change connection)$/.test(label.trim()))
    .map(([, attributes, label]) => ({ attributes, label }));
}

for (const connected of [false, true]) {
  test(`${connected ? 'changing' : 'connecting'} the project repository enters a connection flow instead of Settings`, () => {
    const html = renderGuidedWorkbench(state(connected ? {
      connection: { repository: 'https://github.com/example/skills', localPath: path.join(localParent, 'skills'), baseBranch: 'main' }
    } : {}), 'connectionFlowNonce');
    const buttons = connectionButtons(html);
    assert(buttons.length > 0, 'the project must expose a directly labelled connection action');
    for (const button of buttons) {
      assert.match(button.attributes, /data-action="[^"]+"/);
      assert.doesNotMatch(button.attributes, /data-action="openSettings"/,
        `${button.label} must start repository selection, not generic Settings`);
    }
  });
}

test('Build / Share offers the same real connection flow when no repository is configured', () => {
  const html = renderGuidedWorkbench(state({ step: 'publish', active: { id: 'sample', name: 'sample' },
    publish: { version: '1.0.0', changelog: '', fileCount: 1 } }), 'connectionFlowNonce');
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .filter(([, , label]) => /Connect (?:a )?repository/.test(label));
  assert(buttons.length > 0, 'publishing without a connection must offer a visible next action');
  for (const [, attributes] of buttons) assert.doesNotMatch(attributes, /data-action="openSettings"/);
});

function fixture(overrides = {}) {
  const events = [];
  const previous = { repository: 'https://github.com/example/previous.git', localPath: path.join(localParent, 'previous') };
  let connection = { ...previous };
  const hooks = {
    workbenchFolder, currentRepository: previous.repository,
    currentLocalRepository: previous.localPath,
    assertCurrent() { events.push(['assert']); },
    async inputRepository(current) { events.push(['input', current]); return 'example/next'; },
    async chooseLocalMode() { events.push(['mode']); return 'existing'; },
    async chooseFolder(mode, suggested) { events.push(['folder', mode, suggested]); return nextLocal; },
    async confirm(selection) { events.push(['confirm', selection]); return true; },
    async validateExisting(repository, localPath) { events.push(['validate', repository, localPath]); },
    async clone(repository, localPath) { events.push(['clone', repository, localPath]); },
    async activate(repository, localPath) { events.push(['activate', repository, localPath]); connection = { repository, localPath }; },
    ...overrides
  };
  return { hooks, events, previous, connection: () => connection };
}

test('GitHub repository input accepts a root URL or owner/repository and has one canonical identity', () => {
  for (const value of ['Example/Next', 'https://github.com/Example/Next', 'https://github.com/Example/Next.git']) {
    assert.equal(normalizeGitHubRepository(value), 'https://github.com/Example/Next.git');
  }
});

test('repository input rejects credential URLs, subdirectories and alternate transports', () => {
  for (const value of ['https://user:password@github.com/example/next', 'https://user@github.com/example/next',
    'https://github.com/example/next/tree/main', 'https://github.com/example/next?token=private',
    'https://github.com/example/next#fragment', 'https://github.com:444/example/next',
    'http://github.com/example/next', 'https://github.com.evil.invalid/example/next',
    'file:///home/repository', 'git@github.com:example/next', '-c/core.sshCommand', 'example/next\n--upload-pack=bad']) {
    assert.throws(() => normalizeGitHubRepository(value), undefined, value);
  }
});

test('a verified existing local repository outside the workbench can become the complete active pair', async () => {
  const f = fixture();
  assert.equal(await connectRepositoryFlow(f.hooks), true);
  assert.deepEqual(f.connection(), { repository: 'https://github.com/example/next.git', localPath: nextLocal });
  assert.equal(f.events.filter(([event]) => event === 'activate').length, 1);
  assert.equal(f.events.some(([event]) => event === 'clone'), false);
  const confirmation = f.events.find(([event]) => event === 'confirm')[1];
  assert.equal(confirmation.repository, 'https://github.com/example/next.git');
  assert.equal(confirmation.localPath, nextLocal);
  assert.equal(confirmation.workbenchFolder, f.hooks.workbenchFolder);
  assert.equal(confirmation.clone, false);
});

test('clone shows the exact destination and completes before activating the new pair', async () => {
  const f = fixture({ chooseLocalMode: async () => 'clone', chooseFolder: async () => localParent });
  assert.equal(await connectRepositoryFlow(f.hooks), true);
  const destination = path.join(localParent, 'next');
  const confirmation = f.events.find(([event]) => event === 'confirm')[1];
  assert.equal(confirmation.localPath, destination);
  assert.equal(confirmation.clone, true);
  const clone = f.events.findIndex(([event]) => event === 'clone');
  const activate = f.events.findIndex(([event]) => event === 'activate');
  assert(clone >= 0 && activate > clone);
  assert.equal(f.connection().localPath, destination);
});

for (const stage of ['inputRepository', 'chooseLocalMode', 'chooseFolder', 'confirm']) {
  test(`canceling ${stage} preserves the complete previous connection and starts no clone`, async () => {
    const f = fixture({ [stage]: async () => stage === 'confirm' ? false : undefined });
    assert.equal(await connectRepositoryFlow(f.hooks), false);
    assert.deepEqual(f.connection(), f.previous);
    assert.equal(f.events.some(([event]) => ['clone', 'activate'].includes(event)), false);
  });
}

test('an existing local copy with the wrong origin is rejected without activating or repointing it', async () => {
  const f = fixture({ validateExisting: async () => { throw new Error('origin mismatch'); } });
  await assert.rejects(connectRepositoryFlow(f.hooks), /origin mismatch/);
  assert.deepEqual(f.connection(), f.previous);
  assert.equal(f.events.some(([event]) => ['clone', 'activate'].includes(event)), false);
});

test('a failed clone preserves the previous usable connection', async () => {
  const f = fixture({ chooseLocalMode: async () => 'clone', clone: async () => { throw new Error('authentication failed'); } });
  await assert.rejects(connectRepositoryFlow(f.hooks), /authentication failed/);
  assert.deepEqual(f.connection(), f.previous);
  assert.equal(f.events.some(([event]) => event === 'activate'), false);
});

test('declining clone confirmation creates nothing and retains the previous connection', async () => {
  const f = fixture({ chooseLocalMode: async () => 'clone', confirm: async () => false });
  assert.equal(await connectRepositoryFlow(f.hooks), false);
  assert.deepEqual(f.connection(), f.previous);
  assert.equal(f.events.some(([event]) => ['clone', 'activate'].includes(event)), false);
});

test('an empty repository input cancels without asking the user to select a local folder', async () => {
  const f = fixture({ inputRepository: async () => '   ' });
  assert.equal(await connectRepositoryFlow(f.hooks), false);
  assert.deepEqual(f.connection(), f.previous);
  assert.equal(f.events.some(([event]) => ['mode', 'folder', 'clone', 'activate'].includes(event)), false);
});

for (const stage of ['inputRepository', 'chooseLocalMode', 'chooseFolder', 'confirm', 'validateExisting']) {
  test(`configuration changes during ${stage} prevent activating a stale connection`, async () => {
    let changed = false;
    const f = fixture({ assertCurrent() { if (changed) throw new Error('configuration changed'); } });
    const original = f.hooks[stage];
    f.hooks[stage] = async (...args) => { const result = await original(...args); changed = true; return result; };
    await assert.rejects(connectRepositoryFlow(f.hooks), /configuration changed/);
    assert.deepEqual(f.connection(), f.previous);
    assert.equal(f.events.some(([event]) => ['clone', 'activate'].includes(event)), false);
  });
}

test('configuration changes during clone prevent activating its stale result', async () => {
  let changed = false;
  const f = fixture({ chooseLocalMode: async () => 'clone',
    assertCurrent() { if (changed) throw new Error('configuration changed'); },
    clone: async () => { changed = true; } });
  await assert.rejects(connectRepositoryFlow(f.hooks), /configuration changed/);
  assert.deepEqual(f.connection(), f.previous);
  assert.equal(f.events.some(([event]) => event === 'activate'), false);
});
