const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { pullManagedRepository, managedRepositoryPath } = require('../out/managed-repository.js');
const { renderGuidedWorkbench } = require('../out/guided-workbench-html.js');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const { connectWorkspaceRepository, setWorkspaceRepositoryFolder } = require('../out/guided-workspace.js');
function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim(); }
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-repository-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const remote = path.join(base, 'remote'); fs.mkdirSync(remote);
  const root = path.join(base, 'workspace'); fs.mkdirSync(root);
  git(remote, 'init', '-b', 'trunk');
  git(remote, 'config', 'user.name', 'Local QA'); git(remote, 'config', 'user.email', 'qa@example.invalid');
  fs.mkdirSync(path.join(remote, 'notes'));
  fs.writeFileSync(path.join(remote, 'notes/SKILL.md'), '---\nname: notes\ndescription: Summarize notes when asked.\n---\nFirst content.\n');
  git(remote, 'add', '.'); git(remote, 'commit', '-m', 'Initial skill');
  return { base, root, remote };
}
test('Git pull is available for a registered repository before a skill is opened', () => {
  const state = { step: 'start', hasWorkspace: true, repositories: [], drafts: [], library: [], files: [], target: 'portable', connection: { repository: 'https://github.com/example/skills.git', baseBranch: 'trunk' } };
  const html = renderGuidedWorkbench(state, 'managedRepositoryNonce123');
  assert.match(html, /data-action="pullRepository"[^>]*>Git pull<\/button>/);
  assert.match(html, /data-action="openRepositorySkill"/);
  assert.match(html, /repository actions are optional before starting skill work/i);
  assert.match(html, /id="pull-repository"/);
  assert.match(html, /id="open-repository-skill"/);
  assert.doesNotMatch(renderGuidedWorkbench({ ...state, connection: undefined }, 'managedRepositoryNonce123'), /data-action="pullRepository"/);
});
test('managed Git pull downloads latest skills before work, then fast-forwards and protects local edits', async t => {
  const f = fixture(t);
  await connectWorkspaceRepository(f.root, f.remote);
  setWorkspaceRepositoryFolder(f.root, path.join(f.base, 'skills-project'));
  let initialPath;
  const controller = new GuidedWorkbenchController(f.root, { pickFolder: async initial => { initialPath = initial; return path.join(initial, 'notes'); } });
  await controller.dispatch({ action: 'pullRepository' });
  assert.equal(controller.state.error, undefined);
  const checkout = path.join(f.base, 'skills-project');
  assert.equal(controller.state.repositoryCheckout.path, checkout);
  assert.equal(controller.state.active, undefined);
  fs.appendFileSync(path.join(f.remote, 'notes/SKILL.md'), 'Remote update.\n');
  git(f.remote, 'add', '.'); git(f.remote, 'commit', '-m', 'Update skill');
  const pulled = await pullManagedRepository(f.root, f.remote, undefined, checkout);
  assert.equal(pulled.commit, git(f.remote, 'rev-parse', 'HEAD'));
  await controller.dispatch({ action: 'openRepositorySkill' });
  assert.equal(controller.state.error, undefined);
  assert.equal(initialPath, checkout);
  assert.equal(controller.state.active.name, 'notes');
  assert.match(fs.readFileSync(path.join(f.root, 'skills/notes/SKILL.md'), 'utf8'), /Remote update/);
  fs.appendFileSync(path.join(checkout, 'notes/SKILL.md'), 'Keep local edit.\n');
  await assert.rejects(pullManagedRepository(f.root, f.remote, undefined, checkout), /local changes/);
  assert.match(fs.readFileSync(path.join(checkout, 'notes/SKILL.md'), 'utf8'), /Keep local edit/);
});


test('cancel opening a pulled skill keeps the current create screen', async t => {
  const f = fixture(t);
  await connectWorkspaceRepository(f.root, f.remote);
  setWorkspaceRepositoryFolder(f.root, path.join(f.base, 'skills-project'));
  const checkout = path.join(f.base, 'skills-project');
  fs.mkdirSync(path.join(checkout, '.git'), { recursive: true });
  const controller = new GuidedWorkbenchController(f.root, { pickFolder: async () => undefined });
  await controller.dispatch({ action: 'showCreate' });
  await controller.dispatch({ action: 'openRepositorySkill' });
  assert.equal(controller.state.error, undefined);
  assert.equal(controller.state.form.mode, 'create');
  assert.match(controller.state.notice, /canceled/);
});
