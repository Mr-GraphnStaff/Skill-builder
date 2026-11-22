const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createWorkbench } = require('../out/workbench-setup.js');
const { validateSeparateRepositoryPath } = require('../out/workbench-boundary.js');
const workspace = require('../out/guided-workspace.js');
const publisher = require('../out/repository-publisher.js');
const { workingFixture } = require('./working-fixture.cjs');
const remote = 'https://github.com/example/nested-private.git';
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
Object.assign(environment, { GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' });

function git(local, ...args) {
  return cp.execFileSync('git', ['--no-optional-locks', '-c', `safe.directory=${local.replaceAll('\\', '/')}`, ...args],
    { cwd: local, env: environment, windowsHide: true, encoding: 'utf8', timeout: 30_000, stdio: 'pipe' }).trim();
}

function fixture(t, folder = '.skilljetty-prerelease') {
  const scratch = workingFixture('nested-repository-privacy'); fs.mkdirSync(scratch, { recursive: true });
  const base = fs.mkdtempSync(path.join(scratch, 'case-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const local = path.join(base, 'repository'); fs.mkdirSync(local);
  git(local, 'init', '-b', 'main'); git(local, 'config', 'user.name', 'Privacy Fixture');
  git(local, 'config', 'user.email', 'privacy@example.invalid'); git(local, 'remote', 'add', 'origin', remote);
  fs.writeFileSync(path.join(local, 'README.md'), 'Existing public content.\n');
  git(local, 'add', 'README.md'); git(local, 'commit', '-m', 'Initial fixture');
  const root = createWorkbench(path.join(local, folder));
  const exclude = path.join(local, '.git', 'info', 'exclude'), originalExclude = fs.readFileSync(exclude);
  const original = publisher.resolveRepositoryDefaultBranch;
  publisher.resolveRepositoryDefaultBranch = async () => 'main';
  t.after(() => { publisher.resolveRepositoryDefaultBranch = original; });
  return { root, local, exclude, originalExclude, record: path.join(root, '.skill-workbench', 'connection.json') };
}

test('removing a confirmed ancestor connection exclusion fails closed without rewriting the saved pair', async t => {
  const f = fixture(t);
  await workspace.connectWorkspaceRepository(f.root, remote, { localPath: f.local, separateRepository: true });
  assert.equal(workspace.getWorkspaceConnection(f.root).localPath, f.local);
  const saved = fs.readFileSync(f.record), index = fs.readFileSync(path.join(f.local, '.git', 'index'));
  fs.writeFileSync(f.exclude, f.originalExclude);
  assert.throws(() => workspace.getWorkspaceConnection(f.root), /no longer Git-ignored/);
  assert.deepEqual(fs.readFileSync(f.record), saved);
  assert.deepEqual(fs.readFileSync(f.exclude), f.originalExclude);
  assert.deepEqual(fs.readFileSync(path.join(f.local, '.git', 'index')), index);
});

test('ancestor support still rejects equal roots and repositories inside the workbench', t => {
  const f = fixture(t), before = fs.readFileSync(f.exclude);
  assert.throws(() => validateSeparateRepositoryPath(f.root, f.root), /separate/);
  assert.throws(() => validateSeparateRepositoryPath(f.root, path.join(f.root, 'repositories', 'child')), /separate/);
  assert.equal(validateSeparateRepositoryPath(f.root, f.local), f.local);
  assert.deepEqual(fs.readFileSync(f.exclude), before);
  assert.equal(fs.existsSync(f.record), false);
});

test('the confirmed local exclusion escapes metacharacters and does not hide sibling owner files', async t => {
  const folder = 'private [notes] #!', f = fixture(t, folder);
  const sibling = path.join(f.local, 'private n #!'); fs.mkdirSync(sibling);
  fs.writeFileSync(path.join(sibling, 'owner.txt'), 'Keep this visible to Git.\n');
  await workspace.connectWorkspaceRepository(f.root, remote, { localPath: f.local, separateRepository: true });
  const installed = fs.readFileSync(f.exclude);
  assert.deepEqual(installed.subarray(0, f.originalExclude.length), f.originalExclude);
  assert.match(git(f.local, 'check-ignore', '--verbose', '--no-index', '--', `${folder}/skills/new/SKILL.md`), /info[\\/]exclude/);
  assert.throws(() => git(f.local, 'check-ignore', '--quiet', '--no-index', '--', 'private n #!/owner.txt'), error => error.status === 1);
  assert.equal(git(f.local, 'ls-files', '--', folder), '');
  assert.equal(workspace.getWorkspaceConnection(f.root).localPath, f.local);
});

test('a literal Unix backslash is not confused with an ignored nested directory', { skip: process.platform === 'win32' && 'Windows treats backslashes as path separators.' }, async t => {
  const folder = 'literal\\private', f = fixture(t, folder);
  fs.mkdirSync(path.join(f.local, 'literal', 'private'), { recursive: true });
  fs.appendFileSync(f.exclude, '\n/literal/private/\n');
  assert.throws(() => git(f.local, 'check-ignore', '--quiet', '--no-index', '--', `${folder}/`), error => error.status === 1);
  await workspace.connectWorkspaceRepository(f.root, remote, { localPath: f.local, separateRepository: true });
  assert.match(git(f.local, 'check-ignore', '--verbose', '--no-index', '--', `${folder}/skills/new/SKILL.md`), /info[\\/]exclude/);
  assert.equal(workspace.getWorkspaceConnection(f.root).localPath, f.local);
});
