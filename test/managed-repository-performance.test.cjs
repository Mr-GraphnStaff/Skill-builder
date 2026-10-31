const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { verifyProjectRepository, pullProjectRepository, validateProjectRepositoryForPublish } = require('../out/managed-repository.js');
const { withWorkbenchMetrics } = require('../out/workbench-metrics.js');

function fixture(t) {
  const dist = path.resolve(__dirname, '../dist'); fs.mkdirSync(dist, { recursive: true });
  const root = fs.mkdtempSync(path.join(dist, 'managed-performance-'));
  const keys = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_NOSYSTEM'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const config = path.join(root, 'qa.gitconfig');
  fs.writeFileSync(config, `[safe]\n directory = ${root.replace(/\\/g, '/')}/*\n[user]\n name = Local QA\n email = qa@example.invalid\n`);
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: config, GIT_CONFIG_COUNT: '0', GIT_CONFIG_NOSYSTEM: '1' });
  t.after(() => {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    assert.equal(path.dirname(path.resolve(root)), dist); fs.rmSync(root, { recursive: true, force: true });
  });
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const remote = path.join(root, 'remote'); fs.mkdirSync(remote); git(remote, 'init', '-b', 'main');
  fs.writeFileSync(path.join(remote, 'README.md'), 'Skills.\n'); git(remote, 'add', '.'); git(remote, 'commit', '-m', 'Initial');
  return { root, remote, local: path.join(root, 'Skills'), git };
}

test('repository verification discovers filters once at the status boundary', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  const metrics = [];
  const result = await withWorkbenchMetrics(metric => metrics.push(metric), () => verifyProjectRepository(f.remote, f.local));
  assert.equal(result.status, 'verified');
  assert.equal(metrics.filter(metric => metric.operation === 'config').length, 1);
  assert.equal(metrics.filter(metric => metric.operation === 'status').length, 1);
});

test('pull rediscovers a filter added after the local status check', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  const marker = path.join(f.root, 'filter-executed.txt');
  const probe = path.join(f.root, 'filter.cjs');
  fs.writeFileSync(probe, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); process.stdout.write(require('node:fs').readFileSync(0));\n`);
  fs.writeFileSync(path.join(f.local, '.git/info/attributes'), '* filter=late\n');
  fs.appendFileSync(path.join(f.remote, 'README.md'), 'Remote update.\n');
  f.git(f.remote, 'add', '.'); f.git(f.remote, 'commit', '-m', 'Update');
  let configured = false;
  await pullProjectRepository(f.root, f.remote, f.local, message => {
    if (!message.startsWith('Checking incoming changes')) return;
    const command = `node "${probe.replace(/\\/g, '/')}"`;
    f.git(f.local, 'config', 'filter.late.clean', command);
    f.git(f.local, 'config', 'filter.late.smudge', command);
    f.git(f.local, 'config', 'filter.late.required', 'true');
    configured = true;
  });
  assert.equal(configured, true);
  assert.equal(fs.existsSync(marker), false, 'newly configured content drivers must not execute');
  assert.match(fs.readFileSync(path.join(f.local, 'README.md'), 'utf8'), /Remote update/);
  assert.equal((await verifyProjectRepository(f.remote, f.local)).status, 'verified');
  assert.equal(fs.existsSync(marker), false, 'the next verification must also disable the driver');
});

test('publication object source validation preserves dirty files and Git state, and rejects wrong origin', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  fs.appendFileSync(path.join(f.local, 'README.md'), 'Uncommitted work.\n');
  const files = ['README.md', '.git/index', '.git/config', '.git/HEAD'];
  const before = files.map(file => fs.readFileSync(path.join(f.local, file)));
  assert.equal(await validateProjectRepositoryForPublish(f.remote, f.local), f.local);
  for (let index = 0; index < files.length; index++) assert.deepEqual(fs.readFileSync(path.join(f.local, files[index])), before[index]);
  await assert.rejects(validateProjectRepositoryForPublish(path.join(f.root, 'other-remote'), f.local), /origin does not match/);
  for (let index = 0; index < files.length; index++) assert.deepEqual(fs.readFileSync(path.join(f.local, files[index])), before[index]);
});
