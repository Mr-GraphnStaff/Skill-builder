const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const publisher = require('../out/repository-publisher.js');
const repository = require('../out/managed-repository.js');
const { connectWorkspaceRepository, setWorkspaceRepositoryFolder, getWorkspaceConnection } = require('../out/guided-workspace.js');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const remote = 'https://github.com/example/startup-skills';
function fixture(t) {
  const dist = path.resolve(__dirname, '../dist'); fs.mkdirSync(dist, { recursive: true });
  const base = fs.mkdtempSync(path.join(dist, 'repository-startup-'));
  const root = path.join(base, 'workspace'); fs.mkdirSync(root);
  const originalBranch = publisher.resolveRepositoryDefaultBranch;
  publisher.resolveRepositoryDefaultBranch = async () => 'main'; // No network or user repository is involved.
  t.after(() => { publisher.resolveRepositoryDefaultBranch = originalBranch; assert.equal(path.dirname(path.resolve(base)), dist); fs.rmSync(base, { recursive: true, force: true }); });
  return { base, root, local: path.join(base, 'Skills'), connectionFile: path.join(root, '.skill-workbench/connection.json') };
}
function mockVerification(t, verify) {
  const original = repository.verifyProjectRepository; repository.verifyProjectRepository = verify;
  t.after(() => { repository.verifyProjectRepository = original; });
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('explicit project folder persists across controller startup and same-repository reconnect', async t => {
  const f = fixture(t); await connectWorkspaceRepository(f.root, remote);
  setWorkspaceRepositoryFolder(f.root, f.local);
  await connectWorkspaceRepository(f.root, `${remote}.git`);
  assert.equal(getWorkspaceConnection(f.root).localPath, f.local);
  const saved = fs.readFileSync(f.connectionFile);
  const controller = new GuidedWorkbenchController(f.root); await controller.dispatch({ action: 'ready' });
  assert.equal(controller.state.connection.localPath, f.local);
  await controller.verifyRepository();
  assert.equal(controller.state.repositoryVerification.status, 'setupRequired');
  assert.deepEqual(fs.readFileSync(f.connectionFile), saved, 'startup verification must not rewrite the saved connection');
  assert.equal(fs.existsSync(f.local), false, 'startup must not create the selected missing project');
  assert.equal(fs.existsSync(path.join(f.root, '.skill-workbench/repositories')), false, 'startup must not allocate a hidden checkout');
});
test('startup verification reports an unregistered repository without blocking local creation', async t => {
  const f = fixture(t), updates = [];
  const controller = new GuidedWorkbenchController(f.root, { onRepositoryVerification: state => updates.push(state) });
  await controller.dispatch({ action: 'ready' }); await controller.verifyRepository();
  assert.equal(controller.state.repositoryVerification.status, 'setupRequired');
  assert.match(controller.state.repositoryVerification.message, /register.*repository/i);
  await controller.dispatch({ action: 'showCreate' }); assert.equal(controller.state.form.mode, 'create'); assert.equal(controller.state.error, undefined);
  assert.equal(updates.at(-1).status, 'setupRequired');
});
test('registered repository without an explicit local path requires setup and creates no checkout', async t => {
  const f = fixture(t); await connectWorkspaceRepository(f.root, remote);
  const controller = new GuidedWorkbenchController(f.root); await controller.dispatch({ action: 'ready' }); await controller.verifyRepository();
  assert.equal(controller.state.repositoryVerification.status, 'setupRequired');
  assert.match(controller.state.repositoryVerification.message, /explicit.*local|choose.*folder/i);
  assert.equal(getWorkspaceConnection(f.root).localPath, undefined);
  assert.equal(fs.existsSync(path.join(f.root, '.skill-workbench/repositories')), false);
});
test('verification results are discarded when the persisted connection folder changes', async t => {
  const f = fixture(t); await connectWorkspaceRepository(f.root, remote); setWorkspaceRepositoryFolder(f.root, f.local);
  const pending = deferred(), updates = [];
  mockVerification(t, () => pending.promise);
  const controller = new GuidedWorkbenchController(f.root, { onRepositoryVerification: state => updates.push(state) });
  await controller.dispatch({ action: 'ready' }); const verification = controller.verifyRepository();
  assert.equal(controller.state.repositoryVerification.status, 'checking');
  const nextFolder = path.join(f.base, 'OtherSkills'); setWorkspaceRepositoryFolder(f.root, nextFolder);
  await controller.dispatch({ action: 'ready' });
  pending.resolve({ status: 'verified', message: 'Stale prior folder', repository: remote, localPath: f.local }); await verification;
  assert.equal(controller.state.connection.localPath, nextFolder);
  assert.equal(updates.some(state => state.message === 'Stale prior folder'), false);
  assert.notEqual(controller.state.repositoryVerification?.status, 'verified');
});
test('background verification leaves the action queue available while Git remains unresolved', async t => {
  const f = fixture(t); await connectWorkspaceRepository(f.root, remote); setWorkspaceRepositoryFolder(f.root, f.local);
  const pending = deferred(); mockVerification(t, () => pending.promise);
  const controller = new GuidedWorkbenchController(f.root); await controller.dispatch({ action: 'ready' });
  const verification = controller.verifyRepository(); let timer;
  try {
    await Promise.race([controller.dispatch({ action: 'showCreate' }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Background verification blocked the action queue')), 15000); })]);
    assert.equal(controller.state.form.mode, 'create'); assert.equal(controller.state.busy, false);
    assert.equal(controller.state.repositoryVerification.status, 'checking');
  } finally { clearTimeout(timer); pending.resolve({ status: 'verified', message: 'Completed', repository: remote, localPath: f.local }); await verification; }
  assert.equal(controller.state.repositoryVerification.status, 'verified');
});
