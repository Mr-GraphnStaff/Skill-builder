const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const AdmZip = require('adm-zip');
const wb = require('../out/skill-workbench.js');
const publisher = require('../out/repository-publisher.js');

function git(root, args, binary = false) {
  return execFileSync('git', ['-c', 'protocol.ext.allow=never', ...args], {
    cwd: root, encoding: binary ? undefined : 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-publish-integrity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
  const skillBytes = Buffer.from('---\r\nname: integrity-tool\r\ndescription: Process supplied files. Use when asked to run the integrity workflow.\r\n---\r\n# Integrity Tool\r\n\r\nRead references/deep/rules.md.\r\n');
  const zip = new AdmZip();
  zip.addFile('integrity-tool/SKILL.md', skillBytes);
  zip.addFile('integrity-tool/references/deep/rules.md', Buffer.from('# Rules\r\n\r\nKeep the supplied bytes.\r\n'));
  zip.addFile('integrity-tool/assets/deep/payload.bin', Buffer.from([0, 255, 13, 10, 239, 187, 191]));
  zip.addFile('integrity-tool/empty/', Buffer.alloc(0));
  const originalPackage = path.join(root, 'original.skill'); zip.writeZip(originalPackage);
  const record = wb.importSkillPackage(originalPackage, workspace);
  const session = path.join(workspace, 'workbench', record.id, 'playground'); fs.mkdirSync(session, { recursive: true });
  fs.writeFileSync(path.join(session, 'cases.json'), '{"format":1,"cases":[]}');
  const release = wb.prepareSkillRelease(workspace, record.id, '1.0.0', 'Initial integrity-tested version.');
  return { root, workspace, record, release, skillBytes, originalPackage, session };
}
function targetRepository(root) {
  const source = path.join(root, 'destination'); fs.mkdirSync(source);
  git(source, ['init', '-b', 'main']);
  git(source, ['config', 'user.name', 'Integrity Fixture']);
  git(source, ['config', 'user.email', 'integrity@example.invalid']);
  fs.writeFileSync(path.join(source, 'README.md'), '# Destination\n');
  // This reproduced the old staged-byte corruption finding. Publication must
  // preserve the release's CRLF bytes even when the target asks for LF.
  fs.writeFileSync(path.join(source, '.gitattributes'), '*.md text eol=lf\n');
  git(source, ['add', '.']); git(source, ['commit', '-m', 'Destination baseline']);
  const remote = path.join(root, 'destination.git'); git(root, ['clone', '--bare', source, remote]);
  return remote;
}

test('rejects damaged package, source and changelog before any Git clone', async t => {
  for (const kind of ['package', 'source', 'changelog', 'extra']) {
    await t.test(kind, async subtest => {
      const f = fixture(subtest);
      if (kind === 'package') fs.writeFileSync(f.release.packagePath, 'Not a ZIP archive any longer.');
      if (kind === 'source') fs.appendFileSync(path.join(f.release.directory, 'source/integrity-tool/SKILL.md'), '\nChanged after release preparation.');
      if (kind === 'changelog') fs.appendFileSync(path.join(f.release.directory, 'CHANGELOG.md'), '\nChanged after release preparation.');
      if (kind === 'extra') fs.writeFileSync(path.join(f.release.directory, 'unexpected.txt'), 'Unreviewed file');
      const nonexistentRemote = path.join(f.root, 'must-not-be-cloned.git');
      await assert.rejects(publisher.prepareRepositoryPublish(f.release.directory, nonexistentRemote), error => {
        assert.doesNotMatch(error.message, /Git operation failed|does not appear to be a git repository/);
        assert.match(error.message, /hash|digest|modified|match|unexpected|changed|integrity/i);
        return true;
      });
      assert.ok(fs.existsSync(f.record.sourcePath));
      assert.equal(wb.listWorkbenchSkills(f.workspace).length, 1);
    });
  }
});

test('target attributes cannot alter committed release bytes; verified local push permits clean next-session import', async t => {
  const f = fixture(t);
  const remote = targetRepository(f.root);
  const originalBytes = fs.readFileSync(f.originalPackage);
  const packageBytes = fs.readFileSync(f.release.packagePath);
  let preview;
  try {
    preview = await publisher.prepareRepositoryPublish(f.release.directory, remote, 'main');
    const skillRelative = `${preview.relativePath}/source/integrity-tool/SKILL.md`;
    assert.deepEqual(git(preview.checkoutPath, ['show', `:${skillRelative}`], true), f.skillBytes);
    git(preview.checkoutPath, ['config', 'user.name', 'Integrity Fixture']);
    git(preview.checkoutPath, ['config', 'user.email', 'integrity@example.invalid']);
    const result = await publisher.pushPreparedRelease(preview);
    const branchRef = `refs/heads/${result.branch}`;
    assert.equal(git(remote, ['rev-parse', branchRef]).trim(), result.commit);
    assert.deepEqual(git(remote, ['show', `${branchRef}:${skillRelative}`], true), f.skillBytes);
    assert.deepEqual(git(remote, ['show', `${branchRef}:${preview.relativePath}/${path.basename(f.release.packagePath)}`], true), packageBytes);
    assert.deepEqual(git(remote, ['show', `${branchRef}:${preview.relativePath}/original.skill`], true), originalBytes);
    const savedManifest = JSON.parse(git(remote, ['show', `${branchRef}:${preview.relativePath}/release.json`]));
    assert.ok(savedManifest.files.some(file => file.path === 'empty/'));
    const completed = wb.completeWorkbenchSkill(f.workspace, f.record.id, f.release.directory);
    assert.equal(wb.listWorkbenchSkills(f.workspace).length, 0);
    assert.equal(fs.existsSync(f.record.sourcePath), false);
    assert.equal(fs.existsSync(f.session), false);
    assert.ok(fs.existsSync(path.join(completed.archivedPath, 'source/SKILL.md')));
    assert.ok(fs.existsSync(path.join(completed.archivedPath, 'session/playground/cases.json')));
    const next = wb.importSkillPackage(f.originalPackage, f.workspace);
    assert.equal(next.id, f.record.id);
    assert.equal(wb.listWorkbenchSkills(f.workspace).length, 1);
    assert.equal(fs.existsSync(f.session), false);
    assert.deepEqual(fs.readFileSync(path.join(next.sourcePath, 'SKILL.md')), f.skillBytes);
  } finally {
    if (preview) await publisher.disposePublishPreview(preview);
  }
});
