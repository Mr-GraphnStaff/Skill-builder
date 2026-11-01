const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stableWorkspaceRoot, stableDataDirectory } = require('../out/stable-workspace.js');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');

function fixture(t) {
  const dist = path.resolve(__dirname, '../dist'); fs.mkdirSync(dist, { recursive: true });
  const root = fs.mkdtempSync(path.join(dist, 'stable-workspace-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(root)), dist); fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}

test('stable preserves the selected workspace and explicit legacy data-directory settings', () => {
  const root = path.resolve('stable-project');
  assert.equal(stableWorkspaceRoot(root), root);
  assert.equal(stableWorkspaceRoot(root, 'custom'), path.join(root, 'custom'));
  const explicit = path.resolve('explicit-stable-data');
  assert.equal(stableWorkspaceRoot(root, explicit), explicit);
  assert.equal(stableDataDirectory(root, 'skills', 'skills'), path.join(root, 'skills'));
  assert.equal(stableDataDirectory(root, '', 'skills'), root);
  assert.equal(stableDataDirectory(root, ' assets ', 'skills'), path.join(root, ' assets '));
  assert.equal(stableDataDirectory(root, 'custom/assets', 'skills'), path.join(root, 'custom/assets'));
  assert.equal(stableDataDirectory(root, explicit, 'skills'), explicit);
  assert.equal(stableDataDirectory(root, '../stable-exports', 'dist'), path.resolve(root, '../stable-exports'));
});

test('stable rejects Codex, preview and private control roots without redirecting them', () => {
  const root = path.resolve('stable-project');
  for (const folder of ['.codex', '.skilljetty-prerelease', '.skilljetty-beta', '.skill-workbench']) {
    assert.throws(() => stableWorkspaceRoot(path.join(root, folder, 'nested')), /outside Codex, preview/);
    assert.throws(() => stableWorkspaceRoot(root, path.join(folder, 'nested')), /outside Codex, preview/);
    assert.throws(() => stableDataDirectory(root, path.join(folder, 'nested'), 'skills'), /outside Codex, preview/);
  }
});

test('creating a stable draft preserves preview and legacy stable state without migration', async t => {
  const root = fixture(t);
  for (const folder of ['.skilljetty-prerelease', '.skilljetty-beta']) {
    fs.mkdirSync(path.join(root, folder, '.skill-workbench'), { recursive: true });
    fs.writeFileSync(path.join(root, folder, '.skill-workbench', 'connection.json'), 'preview-sentinel');
  }
  const controller = new GuidedWorkbenchController(stableWorkspaceRoot(root));
  await controller.dispatch({ action: 'createSkill', payload: { name: 'stable-notes', description: 'Summarize supplied notes. Use when preparing summaries.', instructions: '# Notes\nPreserve facts.' } });
  assert.equal(controller.state.error, undefined);
  assert.ok(fs.existsSync(path.join(root, 'skills', 'stable-notes', 'SKILL.md')));
  assert.equal(controller.state.connection, undefined);
  for (const folder of ['.skilljetty-prerelease', '.skilljetty-beta']) {
    assert.equal(fs.readFileSync(path.join(root, folder, '.skill-workbench', 'connection.json'), 'utf8'), 'preview-sentinel');
    assert.equal(fs.existsSync(path.join(root, folder, 'skills')), false);
  }
});

test('stable rejects linked workspace and configured directory ancestors', t => {
  const root = fixture(t), outside = path.join(root, 'outside'); fs.mkdirSync(outside);
  const linked = path.join(root, 'linked');
  try { fs.symlinkSync(outside, linked, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (['EPERM', 'ENOTSUP', ...(process.platform === 'win32' ? ['EISDIR'] : [])].includes(error.code)) {
      t.skip(`Host project drive cannot create the directory-link fixture (${error.code}); actual linked-path enforcement was not exercised locally.`);
      return;
    }
    throw error;
  }
  assert.throws(() => stableWorkspaceRoot(linked), /links or junctions/);
  assert.throws(() => stableDataDirectory(root, 'linked/assets', 'skills'), /links or junctions/);
  assert.deepEqual(fs.readdirSync(outside), []);
});
