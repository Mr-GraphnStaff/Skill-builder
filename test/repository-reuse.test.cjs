const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const wb = require('../out/skill-workbench.js');
const publisher = require('../out/repository-publisher.js');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repository-reuse-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const remote = path.join(root, 'remote'), local = path.join(root, 'selected'), workspace = path.join(root, 'workspace');
  fs.mkdirSync(remote); fs.mkdirSync(workspace);
  git(remote, 'init', '-b', 'main');
  git(remote, 'config', 'user.name', 'Local test'); git(remote, 'config', 'user.email', 'test@example.invalid');
  fs.writeFileSync(path.join(remote, 'README.md'), 'Initial\n');
  fs.writeFileSync(path.join(remote, '.gitattributes'), '*.md text eol=lf\n');
  git(remote, 'add', '.'); git(remote, 'commit', '-m', 'Initial');
  git(root, 'clone', remote, local);
  const input = path.join(root, 'input'); fs.mkdirSync(input);
  fs.writeFileSync(path.join(input, 'SKILL.md'), '---\r\nname: reuse-test\r\ndescription: Reuse a repository when asked.\r\n---\r\n# Preserve these bytes\r\n');
  const skill = wb.registerSkillFolder(workspace, input);
  const release = wb.prepareSkillRelease(workspace, skill.id, '1.0.0', 'First release.');
  return { root, remote, local, release };
}

test('submission reuses selected repository data, fetches latest base, and preserves dirty local state', async t => {
  const f = fixture(t);
  // The destination advances after setup. The selected checkout remains stale
  // and dirty; publication must neither reset it nor publish its local edits.
  fs.writeFileSync(path.join(f.remote, 'remote-new.txt'), 'Latest destination\n');
  git(f.remote, 'add', '.'); git(f.remote, 'commit', '-m', 'Advance remote');
  git(f.local, 'switch', '-c', 'skills/reuse-test/1.0.0');
  fs.writeFileSync(path.join(f.local, 'README.md'), 'User staged edits\n');
  git(f.local, 'add', 'README.md');
  fs.appendFileSync(path.join(f.local, 'README.md'), 'User unstaged edits\n');
  fs.writeFileSync(path.join(f.local, 'untracked.txt'), 'Keep me');
  const snapshot = () => ({ head: git(f.local, 'rev-parse', 'HEAD'), status: git(f.local, 'status', '--porcelain=v1'),
    config: fs.readFileSync(path.join(f.local, '.git/config'), 'utf8'),
    index: fs.readFileSync(path.join(f.local, '.git/index')).toString('base64'),
    readme: fs.readFileSync(path.join(f.local, 'README.md'), 'utf8') });
  const before = snapshot(), messages = [];
  const preview = await publisher.prepareRepositoryPublish(f.release.directory, f.remote, 'main', message => messages.push(message), true, { localPath: f.local });
  try {
    assert(messages.some(message => /Reusing your local repository/.test(message)));
    assert.equal(git(preview.checkoutPath, 'rev-parse', 'HEAD'), git(f.remote, 'rev-parse', 'HEAD'));
    assert.equal(fs.readFileSync(path.join(preview.checkoutPath, 'remote-new.txt'), 'utf8'), 'Latest destination\n');
    assert.deepEqual(snapshot(), before);
    assert.equal(fs.existsSync(path.join(preview.checkoutPath, 'untracked.txt')), false);
    git(preview.checkoutPath, 'config', 'user.name', 'Local test'); git(preview.checkoutPath, 'config', 'user.email', 'test@example.invalid');
    const result = await publisher.pushPreparedRelease(preview);
    assert.equal(git(f.remote, 'rev-parse', `refs/heads/${result.branch}`), result.commit);
    assert.equal(git(f.remote, 'show', `${result.commit}:README.md`), 'Initial');
    assert.deepEqual(snapshot(), before);
  } finally { await publisher.disposePublishPreview(preview); }
  assert.equal(fs.existsSync(preview.checkoutPath), false);
  assert.deepEqual(snapshot(), before);
});

test('submission rejects a selected repository with the wrong origin', async t => {
  const f = fixture(t);
  git(f.local, 'remote', 'set-url', 'origin', path.join(f.root, 'wrong.git'));
  await assert.rejects(publisher.prepareRepositoryPublish(f.release.directory, f.remote, 'main', undefined, true, { localPath: f.local }), /origin does not match/);
  assert.equal(fs.readFileSync(path.join(f.local, 'README.md'), 'utf8'), 'Initial\n');
});
