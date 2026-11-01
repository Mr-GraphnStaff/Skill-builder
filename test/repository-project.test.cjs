const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { verifyProjectRepository, pullProjectRepository } = require('../out/managed-repository.js');
function fixture(t) {
  const dist = path.resolve(__dirname, '../dist'); fs.mkdirSync(dist, { recursive: true });
  const root = fs.mkdtempSync(path.join(dist, 'repository-project-'));
  assert.equal(path.dirname(root), dist);
  const keys = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_NOSYSTEM'];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const config = path.join(root, 'qa.gitconfig');
  fs.writeFileSync(config, `[safe]\n directory = ${root.replace(/\\/g, '/')}/*\n[user]\n name = Local QA\n email = qa@example.invalid\n`);
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: config, GIT_CONFIG_COUNT: '0', GIT_CONFIG_NOSYSTEM: '1' });
  t.after(() => { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } assert.equal(path.dirname(path.resolve(root)), dist); fs.rmSync(root, { recursive: true, force: true }); });
  const git = (cwd, ...args) => cp.execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
  const remote = path.join(root, 'remote'); fs.mkdirSync(remote); git(remote, 'init', '-b', 'main');
  fs.writeFileSync(path.join(remote, 'README.md'), 'Skills.\n'); git(remote, 'add', '.'); git(remote, 'commit', '-m', 'Initial');
  const local = path.join(root, 'Skills');
  const commit = () => { git(remote, 'add', '.'); git(remote, 'commit', '-m', 'Update'); };
  return { root, remote, local, git, commit, config };
}
test('explicit folder required; hidden and nonempty nongit destinations remain untouched', async t => {
  const f = fixture(t);
  assert.equal((await verifyProjectRepository(f.remote)).status, 'setupRequired');
  await assert.rejects(pullProjectRepository(f.root, f.remote, ''), /explicit/);
  await assert.rejects(pullProjectRepository(f.root, f.remote, path.join(f.root, '.codex', 'skills')), /outside Codex/);
  fs.mkdirSync(f.local); fs.writeFileSync(path.join(f.local, 'keep.txt'), 'Keep');
  await assert.rejects(pullProjectRepository(f.root, f.remote, f.local), /nonempty/);
  assert.equal(fs.readFileSync(path.join(f.local, 'keep.txt'), 'utf8'), 'Keep');
});
test('clone selected folder, read-only verification, remote drift, pull and local preservation', async t => {
  const f = fixture(t);
  const initial = await pullProjectRepository(f.root, f.remote, f.local);
  assert.equal(initial.path, f.local);
  const index = fs.readFileSync(path.join(f.local, '.git/index'));
  const refs = fs.readFileSync(path.join(f.local, '.git/packed-refs'));
  assert.equal((await verifyProjectRepository(f.remote, f.local)).status, 'verified');
  assert.deepEqual(fs.readFileSync(path.join(f.local, '.git/index')), index);
  assert.deepEqual(fs.readFileSync(path.join(f.local, '.git/packed-refs')), refs);
  fs.appendFileSync(path.join(f.remote, 'README.md'), 'Remote update.\n'); f.commit();
  assert.equal((await verifyProjectRepository(f.remote, f.local)).status, 'outOfSync');
  const pulled = await pullProjectRepository(f.root, f.remote, f.local);
  assert.equal(pulled.commit, f.git(f.remote, 'rev-parse', 'HEAD'));
  fs.appendFileSync(path.join(f.local, 'README.md'), 'Local edit.\n');
  assert.equal((await verifyProjectRepository(f.remote, f.local)).dirty, true);
  await assert.rejects(pullProjectRepository(f.root, f.remote, f.local), /local changes/);
  assert.match(fs.readFileSync(path.join(f.local, 'README.md'), 'utf8'), /Local edit/);
});
test('private controls do not block pull and incoming control paths cannot overwrite them', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  const privateFile = path.join(f.local, '.skill-workbench', 'session.json'); fs.mkdirSync(path.dirname(privateFile)); fs.writeFileSync(privateFile, 'Private');
  fs.writeFileSync(path.join(f.remote, 'next.txt'), 'Update'); f.commit();
  await pullProjectRepository(f.root, f.remote, f.local);
  assert.equal(fs.readFileSync(privateFile, 'utf8'), 'Private');
  fs.mkdirSync(path.join(f.remote, '.skill-workbench')); fs.writeFileSync(path.join(f.remote, '.skill-workbench', 'session.json'), 'Remote'); f.commit();
  const head = f.git(f.local, 'rev-parse', 'HEAD');
  await assert.rejects(pullProjectRepository(f.root, f.remote, f.local), /control paths/);
  assert.equal(f.git(f.local, 'rev-parse', 'HEAD'), head); assert.equal(fs.readFileSync(privateFile, 'utf8'), 'Private');
});
test('wrong origin, detached branch, missing upstream and unreachable remote are explicit', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  assert.equal((await verifyProjectRepository(path.join(f.root, 'other'), f.local)).status, 'setupRequired');
  f.git(f.local, 'checkout', '--detach'); assert.equal((await verifyProjectRepository(f.remote, f.local)).status, 'outOfSync');
  f.git(f.local, 'checkout', 'main'); f.git(f.local, 'branch', '--unset-upstream');
  assert.equal((await verifyProjectRepository(f.remote, f.local)).status, 'outOfSync');
  fs.renameSync(f.remote, `${f.remote}-unavailable`);
  assert.equal((await verifyProjectRepository(f.remote, f.local)).status, 'error');
});
test('ignored local files block checkout even if incoming remote would overwrite them', async t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.remote, '.gitignore'), 'personal.local\n'); f.commit();
  await pullProjectRepository(f.root, f.remote, f.local); fs.writeFileSync(path.join(f.local, 'personal.local'), 'Private');
  fs.writeFileSync(path.join(f.remote, 'personal.local'), 'Incoming'); f.git(f.remote, 'add', '-f', 'personal.local'); f.commit();
  await assert.rejects(pullProjectRepository(f.root, f.remote, f.local), /ignored files/);
  assert.equal(fs.readFileSync(path.join(f.local, 'personal.local'), 'utf8'), 'Private');
});
test('verification reports trustRequired and pull refuses writes without a trust decision', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  const previous = process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER;
  process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER = '1';
  fs.writeFileSync(f.config, '[user]\n name = Local QA\n email = qa@example.invalid\n');
  try {
    const result = await verifyProjectRepository(f.remote, f.local);
    assert.equal(result.status, 'setupRequired'); assert.equal(result.trustRequired, true);
    await assert.rejects(pullProjectRepository(f.root, f.remote, f.local), /dubious ownership/);
  } finally { if (previous === undefined) delete process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER; else process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER = previous; }
});
test('verification and pull disable fsmonitor, hooks and clean/smudge filters', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  const marker = path.join(f.root, 'executed.txt');
  const script = path.join(f.root, 'probe.cjs'); fs.writeFileSync(script, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed');`);
  const command = `node "${script.replace(/\\/g, '/')}"`;
  const hookDirectory = path.join(f.root, 'configured-hooks'); fs.mkdirSync(hookDirectory);
  fs.writeFileSync(path.join(hookDirectory, 'post-merge'), `#!/bin/sh\n${command}\n`, { mode: 0o755 });
  f.git(f.local, 'config', 'core.hooksPath', hookDirectory);
  f.git(f.local, 'config', 'core.fsmonitor', command);
  f.git(f.local, 'config', 'filter.guard.clean', command);
  f.git(f.local, 'config', 'filter.guard.smudge', command);
  f.git(f.local, 'config', 'filter.guard.required', 'true');
  fs.writeFileSync(path.join(f.local, '.git/info/attributes'), '* filter=guard\n');
  fs.utimesSync(path.join(f.local, 'README.md'), new Date(), new Date());
  assert.equal((await verifyProjectRepository(f.remote, f.local)).status, 'verified');
  fs.appendFileSync(path.join(f.remote, 'README.md'), 'Update\n'); f.commit();
  await pullProjectRepository(f.root, f.remote, f.local);
  assert.equal(fs.existsSync(marker), false);
});
test('GitHub HTTPS and SSH origin forms identify the same repository', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  f.git(f.local, 'remote', 'set-url', 'origin', 'git@github.com:Example/Skills.git');
  const publisher = require('../out/repository-publisher.js'); const original = publisher.repositoryGit;
  const commit = f.git(f.local, 'rev-parse', 'HEAD');
  publisher.repositoryGit = async (cwd, args) => args.includes('ls-remote') ? `ref: refs/heads/main\tHEAD\n${commit}\tHEAD\n` : original(cwd, args);
  try { assert.equal((await verifyProjectRepository('https://github.com/example/skills', f.local)).status, 'verified'); }
  finally { publisher.repositoryGit = original; }
});
test('missing Git is setupRequired without changing the selected folder', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  const previous = process.env.PATH; process.env.PATH = '';
  try { const result = await verifyProjectRepository(f.remote, f.local); assert.equal(result.status, 'setupRequired'); assert.match(result.message, /git|ENOENT/i); await assert.rejects(pullProjectRepository(f.root, f.remote, f.local), /Setup required.*Git/); }
  finally { process.env.PATH = previous; }
});
