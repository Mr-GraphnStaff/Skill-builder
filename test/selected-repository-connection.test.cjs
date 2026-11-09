const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const workspace = require('../out/guided-workspace.js');
const publisher = require('../out/repository-publisher.js');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
function createWorkbench(root) {
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(root, 'skills')); fs.mkdirSync(path.join(root, 'releases'));
  return root;
}
const { validateSelectedRepository, pullProjectRepository } = require('../out/managed-repository.js');
const scratch = path.join(process.env.AGENT_WORKING_DIR || path.resolve(__dirname, '../working/test-fixtures'), 'selected-repository-connection');
const scratchRelative = path.relative(path.resolve(__dirname, '../working'), scratch);
if (scratchRelative === '..' || scratchRelative.startsWith(`..${path.sep}`) || path.isAbsolute(scratchRelative)) throw new Error('Test scratch must remain inside working/');
fs.mkdirSync(scratch, { recursive: true });
const remoteA = 'https://github.com/example/first.git';
const remoteB = 'https://github.com/example/second.git';
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
Object.assign(env, { GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' });

function git(root, ...args) {
  return cp.execFileSync('git', ['--no-optional-locks', '-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args],
    { cwd: root, env, windowsHide: true, encoding: 'utf8', stdio: 'pipe', timeout: 30_000 }).trim();
}

function fixture(t) {
  const base = fs.mkdtempSync(path.join(scratch, 'pair-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = createWorkbench(path.join(base, 'workbench'));
  const first = path.join(base, 'first'), second = path.join(base, 'second');
  for (const [local, remote] of [[first, remoteA], [second, remoteB]]) {
    fs.mkdirSync(local);
    git(local, 'init', '-b', 'main');
    git(local, 'config', 'user.name', 'Connection Fixture');
    git(local, 'config', 'user.email', 'connection@example.invalid');
    git(local, 'remote', 'add', 'origin', remote);
    fs.writeFileSync(path.join(local, 'README.md'), 'Existing user content.\n');
    git(local, 'add', 'README.md');
    git(local, 'commit', '-m', 'Initial fixture');
  }
  const original = publisher.resolveRepositoryDefaultBranch;
  publisher.resolveRepositoryDefaultBranch = async () => 'main';
  t.after(() => { publisher.resolveRepositoryDefaultBranch = original; });
  return { root, first, second, file: path.join(root, '.skill-workbench', 'connection.json') };
}

test('a separate local repository is saved as a complete pinned connection and survives rereading', async t => {
  const f = fixture(t);
  await workspace.connectWorkspaceRepository(f.root, remoteA, { localPath: f.first, separateRepository: true });
  const saved = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  assert.equal(saved.repository, remoteA);
  assert.equal(saved.localPath, f.first);
  assert.equal(saved.baseBranch, 'main');
  assert.equal(saved.separateRepository, true);
  assert.match(saved.gitConfigDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(workspace.getWorkspaceConnection(f.root), {
    repository: remoteA, localPath: f.first, baseBranch: 'main', separateRepository: true,
    gitConfigDigest: saved.gitConfigDigest
  });
});

test('a complete accepted pair survives controller reload without separating its local and remote', async t => {
  const f = fixture(t);
  const controller = new GuidedWorkbenchController(f.root);
  await controller.acceptRepositoryConnection(remoteA, f.first);
  assert.equal(controller.state.connection.repository, remoteA);
  assert.equal(controller.state.connection.localPath, f.first);
  const reopened = new GuidedWorkbenchController(f.root);
  await reopened.dispatch({ action: 'ready' });
  assert.equal(reopened.state.connection.repository, remoteA);
  assert.equal(reopened.state.connection.localPath, f.first);
  assert.equal(reopened.state.workFolder, f.root);
});

test('switching a connection preserves dirty user files, drafts and old upload receipts', async t => {
  const f = fixture(t);
  await workspace.connectWorkspaceRepository(f.root, remoteA, { localPath: f.first, separateRepository: true });
  const draft = path.join(f.root, 'skills', 'existing-skill'); fs.mkdirSync(draft);
  const draftFile = path.join(draft, 'SKILL.md'), receipt = path.join(f.root, 'releases', 'old-upload.json');
  fs.writeFileSync(draftFile, '---\nname: existing-skill\n---\nPreserved unsent instructions.\n');
  fs.writeFileSync(receipt, JSON.stringify({ repository: remoteA, commit: 'old-upload' }));
  const modified = path.join(f.second, 'README.md'), untracked = path.join(f.second, 'user-notes.txt');
  fs.writeFileSync(modified, 'Uncommitted user edit.\n'); fs.writeFileSync(untracked, 'Untracked user content.\n');
  const files = [draftFile, receipt, modified, untracked];
  const before = files.map(file => fs.readFileSync(file));
  const previousHead = git(f.second, 'rev-parse', 'HEAD');
  await workspace.connectWorkspaceRepository(f.root, remoteB, { localPath: f.second, separateRepository: true });
  files.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), before[index]));
  assert.equal(git(f.second, 'rev-parse', 'HEAD'), previousHead);
  assert.equal(git(f.first, 'remote', 'get-url', 'origin'), remoteA);
  assert.equal(workspace.getWorkspaceConnection(f.root).repository, remoteB);
});

test('wrong-origin validation rejects the candidate and preserves the previous connection byte for byte', async t => {
  const f = fixture(t);
  await workspace.connectWorkspaceRepository(f.root, remoteA, { localPath: f.first, separateRepository: true });
  const before = fs.readFileSync(f.file);
  await assert.rejects(validateSelectedRepository(f.root, remoteB, f.first), /origin|match/i);
  await assert.rejects(workspace.connectWorkspaceRepository(f.root, remoteB, { localPath: f.first, separateRepository: true }), /origin|match/i);
  assert.deepEqual(fs.readFileSync(f.file), before);
  assert.equal(git(f.first, 'remote', 'get-url', 'origin'), remoteA);
});

test('configuration invalidation immediately before saving retains the previous complete pair', async t => {
  const f = fixture(t);
  await workspace.connectWorkspaceRepository(f.root, remoteA, { localPath: f.first, separateRepository: true });
  const before = fs.readFileSync(f.file);
  await assert.rejects(workspace.connectWorkspaceRepository(f.root, remoteB, {
    localPath: f.second, separateRepository: true, beforeSave() { throw new Error('settings changed during setup'); }
  }), /settings changed during setup/);
  assert.deepEqual(fs.readFileSync(f.file), before);
  assert.equal(workspace.getWorkspaceConnection(f.root).repository, remoteA);
});

test('changing a connected local origin invalidates the saved pair instead of silently following another remote', async t => {
  const f = fixture(t);
  await workspace.connectWorkspaceRepository(f.root, remoteA, { localPath: f.first, separateRepository: true });
  const before = fs.readFileSync(f.file);
  git(f.first, 'remote', 'set-url', 'origin', remoteB);
  assert.throws(() => workspace.getWorkspaceConnection(f.root), /configuration changed|connect.*again/i);
  assert.deepEqual(fs.readFileSync(f.file), before);
});

test('a candidate with local HTTP transport overrides is rejected before network access', async t => {
  const f = fixture(t);
  await workspace.connectWorkspaceRepository(f.root, remoteA, { localPath: f.first, separateRepository: true });
  const before = fs.readFileSync(f.file);
  git(f.second, 'config', 'http.proxy', 'http://example.invalid:8080');
  git(f.second, 'config', 'http.sslVerify', 'false');
  const original = publisher.repositoryGit;
  let network = 0;
  publisher.repositoryGit = async (cwd, args, ...rest) => {
    if (args.includes('ls-remote') || args.includes('fetch') || args.includes('push')) network++;
    return original(cwd, args, ...rest);
  };
  try {
    await assert.rejects(validateSelectedRepository(f.root, remoteB, f.second), /redirect|transport|unsafe/i);
    assert.equal(network, 0);
    assert.deepEqual(fs.readFileSync(f.file), before);
  } finally { publisher.repositoryGit = original; }
});

function cloneFixture(t) {
  const root = fs.mkdtempSync(path.join(scratch, 'cross-volume-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const remote = path.join(root, 'remote'), local = path.join(root, 'checkout');
  fs.mkdirSync(remote);
  git(remote, 'init', '-b', 'main');
  git(remote, 'config', 'user.name', 'Connection Fixture');
  git(remote, 'config', 'user.email', 'connection@example.invalid');
  fs.writeFileSync(path.join(remote, 'README.md'), 'Remote repository content.\n');
  git(remote, 'add', 'README.md'); git(remote, 'commit', '-m', 'Initial remote');
  return { root, remote, local };
}

test('a new clone can be promoted across filesystem volumes with verified contents', async t => {
  const f = cloneFixture(t), rename = fs.promises.rename;
  let crossed = false;
  fs.promises.rename = async (source, target, ...rest) => {
    if (path.resolve(target) === f.local && path.basename(source).startsWith('clone-')) {
      crossed = true;
      throw Object.assign(new Error('cross-device link'), { code: 'EXDEV' });
    }
    return rename(source, target, ...rest);
  };
  try {
    const result = await pullProjectRepository(f.root, f.remote, f.local, undefined, undefined, true);
    assert.equal(crossed, true, 'the cross-volume promotion path must actually execute');
    assert.equal(result.commit, git(f.remote, 'rev-parse', 'HEAD'));
    assert.equal(git(f.local, 'rev-parse', 'HEAD'), result.commit);
    assert.equal(fs.readFileSync(path.join(f.local, 'README.md'), 'utf8'), 'Remote repository content.\n');
  } finally { fs.promises.rename = rename; }
});

test('a file created during cross-volume copying is retained and the partial copy is not activated', async t => {
  const f = cloneFixture(t), rename = fs.promises.rename, copy = fs.promises.cp;
  let crossed = false, collided = false;
  fs.promises.rename = async (source, target, ...rest) => {
    if (path.resolve(target) === f.local && path.basename(source).startsWith('clone-')) {
      crossed = true;
      throw Object.assign(new Error('cross-device link'), { code: 'EXDEV' });
    }
    return rename(source, target, ...rest);
  };
  fs.promises.cp = async (source, target, options) => {
    if (!collided && (path.resolve(target) === f.local || path.dirname(path.resolve(target)) === f.local)) {
      collided = true;
      fs.writeFileSync(path.join(f.local, 'README.md'), 'User file that appeared during copying.\n');
    }
    return copy(source, target, options);
  };
  try {
    await assert.rejects(pullProjectRepository(f.root, f.remote, f.local, undefined, undefined, true), /not activated|already exists/i);
    assert.equal(crossed, true); assert.equal(collided, true);
    assert.equal(fs.readFileSync(path.join(f.local, 'README.md'), 'utf8'), 'User file that appeared during copying.\n');
    assert.equal(fs.existsSync(path.join(f.root, '.skill-workbench', 'connection.json')), false);
  } finally { fs.promises.rename = rename; fs.promises.cp = copy; }
});
test('a busy staging cleanup preserves the original clone failure and leaves the connection inactive', async t => {
  const f = cloneFixture(t), originalGit = publisher.repositoryGit, remove = fs.promises.rm;
  let attemptedClone = false, attemptedCleanup = false;
  publisher.repositoryGit = async (cwd, args, ...rest) => {
    if (args.includes('clone')) {
      attemptedClone = true;
      throw new Error('fixture clone failure');
    }
    return originalGit(cwd, args, ...rest);
  };
  fs.promises.rm = async (target, ...rest) => {
    if (['clone-', 'disabled-hooks-'].some(prefix => path.basename(path.resolve(target)).startsWith(prefix))) {
      attemptedCleanup = true;
      throw Object.assign(new Error('fixture cleanup busy'), { code: 'EBUSY' });
    }
    return remove(target, ...rest);
  };
  try {
    await assert.rejects(pullProjectRepository(f.root, f.remote, f.local, undefined, undefined, true), error => {
      assert.match(error.message, /fixture clone failure/);
      assert.match(error.message, /fixture cleanup busy/);
      assert.match(error.message, /cleanup|retained/i);
      return true;
    });
    assert.equal(attemptedClone, true, 'the original clone failure must actually execute');
    assert.equal(attemptedCleanup, true, 'the staging cleanup failure must actually execute');
    assert.equal(fs.existsSync(f.local), false, 'a failed clone must not create the selected local repository');
    assert.equal(fs.existsSync(path.join(f.root, '.skill-workbench', 'connection.json')), false);
  } finally {
    publisher.repositoryGit = originalGit;
    fs.promises.rm = remove;
  }
});
