const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const core = require('../out/skill-workbench.js');
const publisher = require('../out/repository-publisher.js');
const { pullManagedRepository } = require('../out/managed-repository.js');

function fixture(t) {
  const dist = path.resolve(__dirname, '../dist'); fs.mkdirSync(dist, { recursive: true });
  const root = fs.mkdtempSync(path.join(dist, 'execution-guards-'));
  const keys = ['TEMP', 'TMP', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_NOSYSTEM', 'SKILLJETTY_EXECUTION_MARKER'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const config = path.join(root, 'qa.gitconfig');
  const marker = path.join(root, 'executed.txt');
  Object.assign(process.env, { TEMP: root, TMP: root, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_COUNT: '0', GIT_CONFIG_NOSYSTEM: '1', SKILLJETTY_EXECUTION_MARKER: marker });
  fs.writeFileSync(config, `[safe]\n directory = ${root.replace(/\\/g, '/')}/*\n[user]\n name = SkillJetty Guard QA\n email = qa@example.invalid\n`);
  t.after(() => {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const git = (cwd, ...args) => cp.execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const target = path.join(root, 'target'); fs.mkdirSync(target); git(target, 'init', '-b', 'main');
  // This script belongs to the remote repository, not to a trusted installed tool.
  fs.writeFileSync(path.join(target, 'guard-probe.cjs'), "require('node:fs').writeFileSync(process.env.SKILLJETTY_EXECUTION_MARKER, 'executed'); process.stdout.write('token\\0');\n");
  fs.writeFileSync(path.join(target, 'README.md'), 'Guard fixture.\n');
  return { root, target, config, marker, git };
}

for (const mode of ['attribute-selected', 'merge.default']) {
  test(`same-version replacement does not execute a repository script through ${mode} merge drivers`, async t => {
    const f = fixture(t); let initial, replacement;
    fs.appendFileSync(f.config, '[merge "guardprobe"]\n driver = node guard-probe.cjs %O %A %B\n');
    if (mode === 'attribute-selected') fs.writeFileSync(path.join(f.target, '.gitattributes'), '* merge=guardprobe\n');
    else fs.appendFileSync(f.config, '[merge]\n default = guardprobe\n');
    f.git(f.target, 'add', '.'); f.git(f.target, 'commit', '-m', 'Initial repository');
    const remote = path.join(f.root, 'remote.git'); f.git(f.root, 'clone', '--bare', f.target, remote);
    const work = path.join(f.root, 'work'); fs.mkdirSync(work);
    const source = path.join(f.root, 'sample'); fs.mkdirSync(source);
    const manifest = '---\nname: sample\ndescription: Create reports. Use when asked to create a sample report.\n---\n# Sample\nCreate a report.\n';
    fs.writeFileSync(path.join(source, 'SKILL.md'), manifest);
    const skill = core.registerSkillFolder(work, source);
    const release = core.prepareSkillRelease(work, skill.id, '1.0.0', 'Selected incoming version.');
    const relative = 'sample/1.0.0/source/sample/SKILL.md';
    try {
      initial = await publisher.prepareRepositoryPublish(release.directory, remote, 'main');
      const first = await publisher.pushPreparedRelease(initial);
      // Add conflicting changes inside the exact version the user selected to replace.
      fs.writeFileSync(path.join(initial.checkoutPath, relative), `${manifest}\nUpload branch change.\n`);
      f.git(initial.checkoutPath, 'add', '--', relative); f.git(initial.checkoutPath, 'commit', '-m', 'Edit upload branch');
      f.git(initial.checkoutPath, 'push', 'origin', first.branch);
      fs.mkdirSync(path.dirname(path.join(f.target, relative)), { recursive: true });
      fs.writeFileSync(path.join(f.target, relative), `${manifest}\nMain branch change.\n`);
      f.git(f.target, 'add', '--', relative); f.git(f.target, 'commit', '-m', 'Edit base branch'); f.git(f.target, 'push', remote, 'main');
      assert.equal(fs.existsSync(f.marker), false, 'fixture setup must not invoke a driver');
      replacement = await publisher.prepareRepositoryPublish(release.directory, remote, 'main', undefined, true);
      assert.equal(fs.existsSync(f.marker), false, 'remote merge driver script must not execute');
      const result = await publisher.pushPreparedRelease(replacement);
      assert.equal(f.git(remote, 'show', `${result.commit}:${relative}`), manifest.trim());
      assert.equal(fs.existsSync(f.marker), false, 'commit and push must not invoke the remote script');
    } finally {
      if (replacement) await publisher.disposePublishPreview(replacement);
      if (initial) await publisher.disposePublishPreview(initial);
    }
  });
}

test('managed Git pull disables a configured repository-relative fsmonitor command', async t => {
  const f = fixture(t);
  f.git(f.target, 'add', '.'); f.git(f.target, 'commit', '-m', 'Initial repository');
  fs.appendFileSync(f.config, '[core]\n fsmonitor = node guard-probe.cjs\n');
  const work = path.join(f.root, 'work'); fs.mkdirSync(work);
  const first = await pullManagedRepository(work, f.target);
  assert.equal(fs.existsSync(f.marker), false, 'initial checkout/reset/status/pull must not execute a remote script');
  const second = await pullManagedRepository(work, f.target);
  assert.equal(second.path, first.path);
  assert.equal(second.commit, first.commit);
  assert.equal(fs.existsSync(f.marker), false, 'pulling the existing checkout must not execute a remote script');
});
