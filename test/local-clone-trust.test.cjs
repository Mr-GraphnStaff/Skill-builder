const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const publisher = require('../out/repository-publisher.js');
const { resolveExistingRepositoryWorkspace } = require('../out/workspace-selection.js');
const core = require('../out/skill-workbench.js');
const scratch = require('./working-fixture.cjs').workingFixture('local-clone-trust');
fs.mkdirSync(scratch, { recursive: true });

test('selected local clone carries exact existing ownership trust into source .git only', async t => {
  const base = fs.mkdtempSync(path.join(scratch, 'case-')), root = path.join(base, 'selected'), home = path.join(base, 'home');
  fs.mkdirSync(root); fs.mkdirSync(home);
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const savedEnv = { HOME: process.env.HOME, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME };
  process.env.HOME = home; process.env.XDG_CONFIG_HOME = path.join(home, '.config');
  t.after(() => { for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const globalPath = path.join(home, '.gitconfig'), exact = root.replaceAll('\\', '/');
  const globalBytes = Buffer.from(`[safe]\n\tdirectory = ${exact}\n`); fs.writeFileSync(globalPath, globalBytes);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  Object.assign(env, { GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
  const git = args => cp.spawnSync('git', ['-c', `safe.directory=${exact}`, ...args], { cwd: root, env, encoding: 'utf8', windowsHide: true });
  for (const args of [['init', '-b', 'main'], ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--allow-empty', '-m', 'Initial'], ['remote', 'add', 'origin', 'https://github.com/example/skills.git']]) {
    const result = git(args); assert.equal(result.status, 0, result.stderr);
  }
  fs.writeFileSync(path.join(root, 'keep.txt'), 'Uncommitted author work.');
  const dataRoot = path.join(root, '.skilljetty-prerelease'), control = path.join(dataRoot, '.skill-workbench'); fs.mkdirSync(control, { recursive: true });
  const connectionPath = path.join(control, 'connection.json');
  fs.writeFileSync(connectionPath, JSON.stringify({ format: 1, repository: 'https://github.com/example/skills', baseBranch: 'main', localPath: root }));
  const connectionBytes = fs.readFileSync(connectionPath), configBytes = fs.readFileSync(path.join(root, '.git/config')), head = git(['rev-parse', 'HEAD']).stdout.trim();
  const selection = await resolveExistingRepositoryWorkspace(root); assert.equal(selection.trustedRepositoryRoot, true);
  const source = path.join(base, 'skill'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: notes\ndescription: Summarize notes when requested.\n---\nKeep notes.\n');
  const skill = core.registerSkillFolder(dataRoot, source), release = core.prepareSkillRelease(dataRoot, skill.id, '1.0.0', 'Initial.');
  const forced = { ...env, GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' };
  const baseline = cp.spawnSync('git', ['-c', `safe.directory=${exact}`, 'clone', '--no-checkout', '--no-hardlinks', '--', root, path.join(base, 'baseline')], { cwd: base, env: forced, encoding: 'utf8', windowsHide: true });
  assert.equal(baseline.status, 128); assert.match(baseline.stderr, /dubious ownership[\s\S]*[\\/]\.git/);
  const spawn = cp.spawn; let cloneArgs, cloneExit, fetchReached = false;
  cp.spawn = (command, args, options) => {
    if (command === 'git' && args.includes('fetch')) {
      fetchReached = true;
      assert.equal(args.some(value => value === `safe.directory=${exact}` || value === `safe.directory=${exact}/.git`), false, 'source grants do not leak into later transport');
      throw new Error('STOP_AFTER_REAL_LOCAL_CLONE: no remote requests permitted');
    }
    if (command === 'git' && args.includes('clone')) cloneArgs = args;
    const child = spawn(command, args, { ...options, env: { ...options.env, GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' } });
    if (command === 'git' && args.includes('clone')) child.on('close', code => { cloneExit = code; });
    return child;
  };
  try {
    await assert.rejects(publisher.prepareRepositoryPublish(release.directory, 'https://github.com/example/skills', 'main', undefined, false, { localPath: root, workspaceRoot: dataRoot }), /STOP_AFTER_REAL_LOCAL_CLONE/);
    assert.equal(cloneExit, 0); assert.equal(fetchReached, true);
    const grants = cloneArgs.filter(value => value.startsWith('safe.directory='));
    assert.deepEqual(grants, [`safe.directory=${exact}`, `safe.directory=${exact}/.git`]);
    assert.equal(fs.readFileSync(globalPath).equals(globalBytes), true);
    cloneArgs = undefined; fetchReached = false;
    await assert.rejects(publisher.prepareRepositoryPublish(release.directory, 'https://github.com/example/skills', 'main', message => {
      if (message.startsWith('Reusing your local')) fs.appendFileSync(globalPath, '\n# Trust settings changed while preparing.\n');
    }, false, { localPath: root, workspaceRoot: dataRoot }), /trust settings changed/);
    assert.equal(cloneArgs, undefined, 'revoked or changed user trust refuses before clone starts');
    assert.equal(fetchReached, false);
    fs.writeFileSync(globalPath, globalBytes);
    await assert.rejects(publisher.prepareRepositoryPublish(release.directory, 'https://github.com/example/skills', 'main', message => {
      if (message.startsWith('Reusing your local')) fs.appendFileSync(path.join(root, '.git/config'), '\n# Source configuration changed.\n');
    }, false, { localPath: root, workspaceRoot: dataRoot }), /repository configuration changed/);
    assert.equal(cloneArgs, undefined, 'changed source configuration refuses before clone starts');
    assert.equal(fetchReached, false);
    fs.writeFileSync(path.join(root, '.git/config'), configBytes);
  } finally { cp.spawn = spawn; }
  assert(fs.readFileSync(connectionPath).equals(connectionBytes)); assert(fs.readFileSync(path.join(root, '.git/config')).equals(configBytes));
  assert.equal(git(['rev-parse', 'HEAD']).stdout.trim(), head); assert.equal(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8'), 'Uncommitted author work.');
});
