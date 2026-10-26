const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const script = path.resolve(__dirname, '../scripts/publish-skill.mjs');
function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-workbench-test-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  git(repo, 'init', '-b', 'main'); git(repo, 'config', 'user.name', 'Test'); git(repo, 'config', 'user.email', 'test@example.invalid');
  fs.writeFileSync(path.join(repo, 'README.md'), 'Baseline'); git(repo, 'add', '.'); git(repo, 'commit', '-m', 'Baseline');
  const remote = path.join(root, 'remote.git'); git(root, 'clone', '--bare', repo, remote);
  git(repo, 'remote', 'add', 'origin', remote);
  fs.mkdirSync(path.join(repo, 'skills', 'sample'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'skills', 'sample', 'SKILL.md'), '---\nname: sample\ndescription: Make reports. Use for reporting.\n---\n# Sample\n');
  fs.writeFileSync(path.join(repo, 'unrelated.txt'), 'Leave staged'); git(repo, 'add', 'unrelated.txt');
  fs.writeFileSync(path.join(repo, 'skill-builder.config.json'), JSON.stringify({ git: { enabled: true, remote: 'origin', publishMode: 'current-branch', fetchBeforePush: false } }));
  return { root, repo, remote };
}
test('legacy selected-folder publishing does not commit preexisting unrelated staged files', () => {
  const f = setup();
  try {
    const result = spawnSync(process.execPath, [script, 'sample', '--root', f.repo, '--yes'], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(git(f.repo, 'diff', '--cached', '--name-only').trim(), 'unrelated.txt');
    const files = git(f.remote, 'ls-tree', '-r', '--name-only', 'main');
    assert.match(files, /skills\/sample\/SKILL.md/); assert.doesNotMatch(files, /unrelated.txt/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
test('legacy cross-repository URL publishing is rejected without moving caller branch or index', () => {
  const f = setup();
  try {
    const before = git(f.repo, 'status', '--porcelain'); const head = git(f.repo, 'rev-parse', 'HEAD');
    const result = spawnSync(process.execPath, [script, 'sample', '--root', f.repo, '--remote', path.join(f.root, 'unrelated.git'), '--yes'], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 1); assert.match(result.stderr, /isolated|different associated repository/);
    assert.equal(git(f.repo, 'status', '--porcelain'), before); assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
