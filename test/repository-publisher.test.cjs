const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { prepareRepositoryPublish, pushPreparedRelease, disposePublishPreview, createGitHubRepository, runPublisherProcess } = require('../out/repository-publisher.js');
const { registerSkillFolder, prepareSkillRelease } = require('../out/skill-workbench.js');
const { preparePluginRelease } = require('../out/plugin-release.js');

function git(root, ...args) {
  return execFileSync('git', ['-c', 'protocol.ext.allow=never', ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-publisher-test-'));
  const target = path.join(root, 'target'); fs.mkdirSync(target);
  git(target, 'init', '-b', 'main');
  git(target, 'config', 'user.name', 'Workbench Test'); git(target, 'config', 'user.email', 'test@example.invalid');
  fs.writeFileSync(path.join(target, 'README.md'), 'Destination repository\n');
  git(target, 'add', '.'); git(target, 'commit', '-m', 'Target baseline');
  const remote = path.join(root, 'target.git'); git(root, 'clone', '--bare', target, remote);
  const caller = path.join(root, 'caller'); fs.mkdirSync(caller);
  git(caller, 'init', '-b', 'main');
  git(caller, 'config', 'user.name', 'Caller'); git(caller, 'config', 'user.email', 'caller@example.invalid');
  fs.writeFileSync(path.join(caller, 'PRIVATE.txt'), 'Unrelated history\n');
  git(caller, 'add', '.'); git(caller, 'commit', '-m', 'Unrelated source history');
  // Workbench setup supplies scratch before publication; a sentinel makes its
  // pre-existing untracked status visible to the preservation assertion.
  fs.mkdirSync(path.join(caller, 'scratch')); fs.writeFileSync(path.join(caller, 'scratch', 'user-scratch.txt'), 'Keep scratch work.');
  fs.writeFileSync(path.join(caller, 'STAGED.txt'), 'Must remain staged\n'); git(caller, 'add', 'STAGED.txt');
  const source = path.join(root, 'sample'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\r\nname: sample\r\ndescription: Create useful sample reports. Use when asked for a sample report.\r\n---\r\n\r\n# Sample\r\n');
  fs.mkdirSync(path.join(source, 'assets'));
  fs.writeFileSync(path.join(source, 'assets', 'example.bin'), Buffer.from([0, 1, 2, 255]));
  const skill = registerSkillFolder(caller, source);
  const release = prepareSkillRelease(caller, skill.id, '1.0.0', 'Initial version.').directory;
  return { root, remote, release, caller, target };
}

test('publishes a plugin as a complete versioned plugin tree without changing portable paths', async () => {
  const f = fixture(); let preview;
  try {
    const bundle = preparePluginRelease(f.caller, { name: 'team-bundle', description: 'Team workflows', version: '2.0.0', author: 'Example Team', members: [{ directory: f.release }], changelog: 'Bundle sample 1.0.0.' });
    preview = await prepareRepositoryPublish(bundle.directory, f.remote, 'main', undefined, false, { workspaceRoot: f.caller });
    assert.equal(preview.branch, 'plugins/team-bundle/2.0.0');
    assert.equal(preview.relativePath, 'Plugins/team-bundle');
    assert.equal(preview.kind, 'plugin'); assert.deepEqual(preview.members, [{ name: 'sample', version: '1.0.0' }]);
    const originalPath = preview.relativePath; preview.relativePath = '../../elsewhere';
    await assert.rejects(pushPreparedRelease(preview), /destination changed/); preview.relativePath = originalPath;
    git(preview.checkoutPath, 'config', 'user.name', 'Workbench Test'); git(preview.checkoutPath, 'config', 'user.email', 'test@example.invalid');
    const uploaded = await pushPreparedRelease(preview);
    const tree = git(f.remote, 'ls-tree', '-r', '--name-only', uploaded.commit);
    assert.match(tree, /Plugins\/team-bundle\/source\/\.claude-plugin\/plugin\.json/);
    assert.match(tree, /Plugins\/team-bundle\/source\/skills\/sample\/SKILL\.md/);
    assert.match(tree, /team-bundle-2\.0\.0\.zip/);
    assert.doesNotMatch(tree, /PRIVATE|STAGED/);
  } finally { if (preview) await disposePublishPreview(preview); fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('a newer plugin replaces only its stable active folder and preserves the previous commit', async () => {
  const f = fixture(); let preview;
  const bundle = version => preparePluginRelease(f.caller, { name: 'team-bundle', description: 'Team workflows', version, members: [{ directory: f.release }], changelog: `Bundle ${version}.` });
  try {
    const first = bundle('2.0.0');
    preview = await prepareRepositoryPublish(first.directory, f.remote, 'main', undefined, false, { workspaceRoot: f.caller });
    git(preview.checkoutPath, 'config', 'user.name', 'Workbench Test'); git(preview.checkoutPath, 'config', 'user.email', 'test@example.invalid');
    const uploaded = await pushPreparedRelease(preview); await disposePublishPreview(preview); preview = undefined;
    // Simulate the reviewed commit becoming main in this disposable bare repository.
    git(f.remote, 'update-ref', 'refs/heads/main', uploaded.commit);
    await assert.rejects(prepareRepositoryPublish(first.directory, f.remote, 'main', undefined, false, { workspaceRoot: f.caller }), /already exists/);
    const next = bundle('2.1.0');
    preview = await prepareRepositoryPublish(next.directory, f.remote, 'main', undefined, false, { workspaceRoot: f.caller });
    assert.equal(preview.relativePath, 'Plugins/team-bundle');
    const active = path.join(preview.checkoutPath, 'Plugins', 'team-bundle');
    assert.equal(fs.existsSync(path.join(active, 'team-bundle-2.0.0.zip')), false);
    assert.equal(fs.existsSync(path.join(active, 'team-bundle-2.1.0.zip')), true);
    assert.ok(preview.changedFiles.includes('Plugins/team-bundle/team-bundle-2.0.0.zip'));
    git(preview.checkoutPath, 'config', 'user.name', 'Workbench Test'); git(preview.checkoutPath, 'config', 'user.email', 'test@example.invalid');
    const newer = await pushPreparedRelease(preview);
    const activeTree = git(f.remote, 'ls-tree', '-r', '--name-only', newer.commit);
    assert.match(activeTree, /Plugins\/team-bundle\/team-bundle-2\.1\.0\.zip/);
    assert.doesNotMatch(activeTree, /team-bundle-2\.0\.0\.zip/);
    assert.equal(JSON.parse(git(f.remote, 'show', `${uploaded.commit}:Plugins/team-bundle/release.json`)).version, '2.0.0');
    assert.equal(fs.existsSync(first.packagePath), true, 'local immutable history remains available');
  } finally { if (preview) await disposePublishPreview(preview); fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('stable plugin publication refuses to adopt or remove legacy version folders', async () => {
  const f = fixture();
  try {
    const legacy = path.join(f.target, 'Plugins', 'team-bundle', '1.0.0'); fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, 'keep.txt'), 'Existing historical work'); git(f.target, 'add', 'Plugins'); git(f.target, 'commit', '-m', 'Legacy layout'); git(f.target, 'push', f.remote, 'main');
    const bundle = preparePluginRelease(f.caller, { name: 'team-bundle', description: 'Team workflows', version: '2.0.0', members: [{ directory: f.release }], changelog: 'New bundle.' });
    const originalHead = git(f.remote, 'rev-parse', 'main');
    await assert.rejects(prepareRepositoryPublish(bundle.directory, f.remote, 'main', undefined, false, { workspaceRoot: f.caller }), /cleanup or migration/);
    assert.equal(git(f.remote, 'rev-parse', 'main'), originalHead); assert.equal(fs.readFileSync(path.join(legacy, 'keep.txt'), 'utf8'), 'Existing historical work');
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('stable plugin cannot downgrade or replace same-version bytes from a fresh workbench', async () => {
  const f = fixture(); let preview;
  try {
    const first = preparePluginRelease(f.caller, { name: 'team-bundle', description: 'Team workflows', version: '2.0.0', members: [{ directory: f.release }], changelog: 'First bundle.' });
    preview = await prepareRepositoryPublish(first.directory, f.remote, 'main', undefined, false, { workspaceRoot: f.caller });
    git(preview.checkoutPath, 'config', 'user.name', 'Workbench Test'); git(preview.checkoutPath, 'config', 'user.email', 'test@example.invalid');
    const uploaded = await pushPreparedRelease(preview); await disposePublishPreview(preview); preview = undefined;
    git(f.remote, 'update-ref', 'refs/heads/main', uploaded.commit);
    const fresh = path.join(f.root, 'fresh-workbench'), changedSource = path.join(f.root, 'changed-source'); fs.mkdirSync(fresh); fs.mkdirSync(changedSource);
    fs.writeFileSync(path.join(changedSource, 'SKILL.md'), '---\nname: sample\ndescription: Different content on another workstation.\n---\nChanged instructions.\n');
    const changedSkill = registerSkillFolder(fresh, changedSource), changed = prepareSkillRelease(fresh, changedSkill.id, '1.0.0', 'Changed snapshot.');
    const variant = version => preparePluginRelease(fresh, { name: 'team-bundle', description: 'Team workflows', version, members: [{ directory: changed.directory }], changelog: 'Fresh workstation bundle.' });
    await assert.rejects(prepareRepositoryPublish(variant('2.0.0').directory, f.remote, 'main', undefined, true, { workspaceRoot: fresh }), /different content.*strictly newer/s);
    await assert.rejects(prepareRepositoryPublish(variant('1.9.9').directory, f.remote, 'main', undefined, true, { workspaceRoot: fresh }), /downgrade.*strictly newer/s);
    await assert.rejects(prepareRepositoryPublish(first.directory, f.remote, 'main', undefined, true, { workspaceRoot: f.caller }), /identical content.*no upload/s);
    assert.equal(git(f.remote, 'rev-parse', 'main').trim(), uploaded.commit);
    assert.equal(JSON.parse(git(f.remote, 'show', 'main:Plugins/team-bundle/release.json')).version, '2.0.0');
  } finally { if (preview) await disposePublishPreview(preview); fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('publishes the complete version using destination history; leaves caller index and history intact', async () => {
  const f = fixture(); let preview;
  try {
    const before = git(f.caller, 'status', '--porcelain');
    const callerHead = git(f.caller, 'rev-parse', 'HEAD');
    const destinationHead = git(f.target, 'rev-parse', 'HEAD').trim();
    preview = await prepareRepositoryPublish(f.release, f.remote, 'main');
    assert.ok(preview.files.every(file => file.startsWith('sample/1.0.0/')));
    git(preview.checkoutPath, 'config', 'user.name', 'Workbench Test');
    git(preview.checkoutPath, 'config', 'user.email', 'test@example.invalid');
    const result = await pushPreparedRelease(preview);
    assert.equal(git(preview.checkoutPath, 'rev-parse', `${result.commit}^`).trim(), destinationHead);
    assert.equal(git(f.caller, 'status', '--porcelain'), before);
    assert.equal(git(f.caller, 'rev-parse', 'HEAD'), callerHead);
    const remoteTree = git(f.remote, 'ls-tree', '-r', '--name-only', `refs/heads/${result.branch}`);
    assert.match(remoteTree, /sample-1\.0\.0\.skill/);
    assert.match(remoteTree, /source\/sample\/SKILL.md/);
    assert.doesNotMatch(remoteTree, /PRIVATE|STAGED/);
    const retried = await pushPreparedRelease(preview);
    assert.equal(retried.commit, result.commit);
    await assert.rejects(prepareRepositoryPublish(f.release, f.remote, result.branch), /already exists/);
  } finally {
    if (preview) await disposePublishPreview(preview);
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('rejects modified previews and unrelated staged changes before commit/push', async () => {
  const f = fixture(); let preview;
  try {
    preview = await prepareRepositoryPublish(f.release, f.remote);
    const changelog = path.join(preview.checkoutPath, preview.relativePath, 'CHANGELOG.md');
    const original = fs.readFileSync(changelog);
    fs.writeFileSync(changelog, 'Modified after review');
    await assert.rejects(pushPreparedRelease(preview), /files changed/);
    fs.writeFileSync(changelog, original);
    fs.writeFileSync(path.join(preview.checkoutPath, 'unrelated.txt'), 'unexpected');
    git(preview.checkoutPath, 'add', 'unrelated.txt');
    await assert.rejects(pushPreparedRelease(preview), /Unexpected staged files/);
    const heads = git(f.remote, 'for-each-ref', '--format=%(refname)', 'refs/heads');
    assert.doesNotMatch(heads, /skills\/sample/);
  } finally {
    if (preview) await disposePublishPreview(preview);
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('rejects credential-bearing or executable Git remote forms', async () => {
  for (const remote of ['ext::cmd /c bad', '--upload-pack=bad', 'https://user:secret@github.com/a/b']) {
    await assert.rejects(prepareRepositoryPublish('unused', remote), /Choose a repository/);
  }
});

test('repository creation rejects ambiguous names and visibility before invoking GitHub', async () => {
  for (const name of ['-option', 'owner/repo', 'bad name', '.', '..', 'a;command', 'x'.repeat(101)]) {
    await assert.rejects(createGitHubRepository('unused', name), /repository name/);
  }
  await assert.rejects(createGitHubRepository('unused', 'Skills', 'internal'), /visibility/);
});

test('owned command timeout terminates its own child process tree', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-owned-process-test-'));
  const pidFile = path.join(root, 'owned-pids.json');
  const script = `const fs=require('fs');const cp=require('child_process');const child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});fs.writeFileSync(${JSON.stringify(pidFile)},JSON.stringify({parent:process.pid,child:child.pid}));setInterval(()=>{},1000);`;
  try {
    await assert.rejects(runPublisherProcess(process.execPath, ['-e', script], { cwd: root, timeoutMs: 1500 }), /timed out after 1500 ms/);
    const pids = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
    for (const pid of [pids.parent, pids.child]) {
      let alive = true;
      for (let attempt = 0; attempt < 20; attempt++) {
        try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') { alive = false; break; } throw error; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(alive, false, `Owned fixture process ${pid} must exit after timeout`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('cleanup failure preserves the original Git failure and reports retained checkout', async () => {
  const f = fixture();
  const promises = require('node:fs/promises');
  const originalRm = promises.rm;
  let retained;
  const progress = [];
  promises.rm = async function (target, ...args) {
    if (path.basename(target).startsWith('skill-workbench-publish-')) {
      retained = target; throw Object.assign(new Error('Injected locked directory'), { code: 'EBUSY' });
    }
    return originalRm.call(this, target, ...args);
  };
  try {
    await assert.rejects(prepareRepositoryPublish(f.release, path.join(f.root, 'missing.git'), 'main', message => progress.push(message)), error => {
      assert.match(error.message, /Git operation failed/);
      assert.match(error.message, /does not exist|not appear to be a git repository/);
      assert.match(error.message, /Temporary checkout retained.*EBUSY/s);
      return true;
    });
    assert.ok(progress.some(message => message.includes('Downloading')));
    assert.ok(progress.some(message => message.includes('original publication failure is preserved')));
  } finally {
    promises.rm = originalRm;
    if (retained) await originalRm(retained, { recursive: true, force: true });
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('temporary checkout cleanup cannot turn verified local push into failure', async () => {
  const f = fixture(); let preview;
  const promises = require('node:fs/promises'); const originalRm = promises.rm;
  const progress = [];
  try {
    preview = await prepareRepositoryPublish(f.release, f.remote, 'main', message => progress.push(message));
    git(preview.checkoutPath, 'config', 'user.name', 'Workbench Test');
    git(preview.checkoutPath, 'config', 'user.email', 'test@example.invalid');
    const published = await pushPreparedRelease(preview, message => progress.push(message));
    promises.rm = async function (target, ...args) {
      if (target === path.dirname(preview.checkoutPath)) throw Object.assign(new Error('Injected lock'), { code: 'EBUSY' });
      return originalRm.call(this, target, ...args);
    };
    await assert.doesNotReject(disposePublishPreview(preview, message => progress.push(message)));
    assert.equal(git(f.remote, 'rev-parse', `refs/heads/${published.branch}`).trim(), published.commit);
    assert.ok(progress.some(message => message.includes('remote repository confirms')));
    assert.ok(progress.some(message => message.includes('Publication status is unchanged')));
  } finally {
    promises.rm = originalRm;
    if (preview) await disposePublishPreview(preview);
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});


test('overwrites the same Git version on the latest registered branches and preserves unrelated files and history', async () => {
  const f = fixture(); let first, next;
  const identityKeys = ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'];
  const oldIdentity = Object.fromEntries(identityKeys.map(key => [key, process.env[key]]));
  for (const key of identityKeys) process.env[key] = key.endsWith('EMAIL') ? 'qa@example.invalid' : 'SkillJetty Local QA';
  try {
    first = await prepareRepositoryPublish(f.release, f.remote);
    git(first.checkoutPath, 'config', 'user.name', 'Workbench Test');
    git(first.checkoutPath, 'config', 'user.email', 'test@example.invalid');
    const original = await pushPreparedRelease(first);
    fs.writeFileSync(path.join(f.target, 'LATEST.txt'), 'Fetched base change');
    git(f.target, 'add', '.'); git(f.target, 'commit', '-m', 'Latest base'); git(f.target, 'push', f.remote, 'main');
    const core = require('../out/skill-workbench.js');
    const skill = core.listWorkbenchSkills(f.caller)[0];
    fs.unlinkSync(path.join(skill.sourcePath, 'assets/example.bin'));
    fs.writeFileSync(path.join(skill.sourcePath, 'new.txt'), 'Selected replacement');
    const updated = core.prepareSkillRelease(f.caller, skill.id, '1.0.0', 'Replace same version', true);
    next = await prepareRepositoryPublish(updated.directory, f.remote, 'main', undefined, true);
    git(next.checkoutPath, 'config', 'user.name', 'Workbench Test');
    git(next.checkoutPath, 'config', 'user.email', 'test@example.invalid');
    const replaced = await pushPreparedRelease(next);
    assert.equal(replaced.branch, original.branch);
    const tree = git(f.remote, 'ls-tree', '-r', '--name-only', replaced.commit);
    assert.match(tree, /LATEST.txt/);
    assert.match(tree, /source\/sample\/new.txt/);
    assert.doesNotMatch(tree, /example.bin/);
    git(f.remote, 'merge-base', '--is-ancestor', original.commit, replaced.commit);
    assert.equal(git(f.remote, 'show', `${replaced.commit}:sample/1.0.0/source/sample/new.txt`), 'Selected replacement');
  } finally {
    for (const key of identityKeys) { if (oldIdentity[key] === undefined) delete process.env[key]; else process.env[key] = oldIdentity[key]; }
    if (first) await disposePublishPreview(first);
    if (next) await disposePublishPreview(next);
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
