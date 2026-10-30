const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { deleteBranchWithLease } = require('../out/github-branch-delete.js');
const { runPublisherProcess } = require('../out/repository-publisher.js');
const context = { repository: 'https://github.com/example/skills.git', branch: 'skills/sample/1.0.0', baseBranch: 'main', commit: 'a'.repeat(40), skillName: 'sample', version: '1.0.0' };
function fixture(t) {
  const dist = path.resolve(__dirname, '../dist'); fs.mkdirSync(dist, { recursive: true });
  const root = fs.mkdtempSync(path.join(dist, 'branch-delete-qa-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(root)), dist); fs.rmSync(root, { recursive: true, force: true }); }); return root;
}
test('exact lease uses private bare metadata, disabled hooks and cleaned Git overrides', async t => {
  const root = fixture(t), calls = [], keys = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', 'GIT_CONFIG_PARAMETERS', 'GIT_SSH_COMMAND'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) process.env[key] = 'UNTRUSTED_INJECTION';
  try { await deleteBranchWithLease(root, context, async (command, args, options) => { calls.push({ command, args, options }); return { stdout: '', stderr: '' }; }); }
  finally { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
  assert.equal(calls.length, 2); assert.ok(calls[0].args.includes('init')); assert.ok(calls[0].args.includes('--bare'));
  const push = calls[1]; assert.equal(push.command, 'git'); assert.ok(push.args.includes('push'));
  assert.ok(push.args.includes(`--force-with-lease=refs/heads/${context.branch}:${context.commit}`)); assert.equal(push.args.includes('--force'), false);
  assert.deepEqual(push.args.slice(-2), ['https://github.com/example/skills.git', `:refs/heads/${context.branch}`]);
  assert.ok(push.args.includes('protocol.ext.allow=never')); assert.ok(push.args.includes('core.fsmonitor=false')); assert.ok(push.args.some(arg => arg.startsWith('core.hooksPath=')));
  assert.ok(push.options.cwd.startsWith(path.join(root, '.skill-workbench', 'branch-delete-')));
  for (const key of keys) assert.equal(push.options.env[key], undefined);
  assert.equal(push.options.env.GIT_TERMINAL_PROMPT, '0'); assert.equal(push.options.env.GCM_INTERACTIVE, 'never');
  assert.deepEqual(fs.readdirSync(path.join(root, '.skill-workbench')), []);
});
test('unsafe URL, ref, SHA and workspace inputs perform no writes or Git calls', async t => {
  const root = fixture(t); let calls = 0; const runner = async () => { calls++; return { stdout: '', stderr: '' }; };
  for (const change of [{ repository: 'ext::unsafe' }, { repository: 'https://github.com.evil.invalid/a/b' }, { repository: 'https://user:secret@github.com/a/b' }, { branch: '--force' }, { branch: '../main' }, { branch: 'main' }, { branch: 'topic.lock' }, { branch: 'HEAD' }, { branch: '@' }, { commit: 'invalid' }]) await assert.rejects(deleteBranchWithLease(root, { ...context, ...change }, runner));
  await assert.rejects(deleteBranchWithLease('relative', context, runner)); assert.equal(calls, 0); assert.deepEqual(fs.readdirSync(root), []);
});
test('real bare Git deletes the exact head and preserves an intervening remote branch advance atomically', async t => {
  const root = fixture(t), seed = path.join(root, 'seed'), remote = path.join(root, 'remote.git'); fs.mkdirSync(seed);
  const config = path.join(root, 'qa.gitconfig');
  fs.writeFileSync(config, `[safe]\n${[root, seed, path.join(seed, '.git'), remote].map(folder => ` directory = ${path.resolve(folder).replace(/\\/g, '/')}`).join('\n')}\n directory = ${root.replace(/\\/g, '/')}/*\n`);
  const environment = { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_COUNT: '0', GIT_TERMINAL_PROMPT: '0' };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_CONFIG_PARAMETERS']) delete environment[key];
  const git = (cwd, ...args) => cp.execFileSync('git', ['-c', `safe.directory=${cwd.replace(/\\/g, '/')}`, ...args], { cwd, env: environment, windowsHide: true, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git(seed, 'init', '-b', 'main'); git(seed, 'config', 'user.name', 'Lease QA'); git(seed, 'config', 'user.email', 'qa@example.invalid');
  fs.writeFileSync(path.join(seed, 'README.md'), 'Initial\n'); git(seed, 'add', '.'); git(seed, 'commit', '-m', 'Initial'); const first = git(seed, 'rev-parse', 'HEAD');
  fs.appendFileSync(path.join(seed, 'README.md'), 'Next\n'); git(seed, 'commit', '-am', 'Next'); const advanced = git(seed, 'rev-parse', 'HEAD');
  git(root, 'clone', '--bare', seed, remote); const ref = `refs/heads/${context.branch}`; git(remote, 'update-ref', ref, first);
  const exact = { ...context, commit: first }; let race = false, pushes = 0;
  const runner = async (command, args, options) => {
    const selected = args.map(arg => arg === 'https://github.com/example/skills.git' ? remote : arg);
    if (args.includes('push')) { pushes++; if (race) git(remote, 'update-ref', ref, advanced); }
    return runPublisherProcess(command, selected, { ...options, env: { ...options.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_COUNT: '0' } });
  };
  await deleteBranchWithLease(root, exact, runner); assert.throws(() => git(remote, 'show-ref', '--verify', ref));
  git(remote, 'update-ref', ref, first); race = true; await assert.rejects(deleteBranchWithLease(root, exact, runner));
  assert.equal(git(remote, 'rev-parse', ref), advanced); assert.equal(pushes, 2);
  assert.deepEqual(fs.readdirSync(path.join(root, '.skill-workbench')), []);
});
