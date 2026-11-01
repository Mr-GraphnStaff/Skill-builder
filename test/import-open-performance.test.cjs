const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const core = require('../out/skill-workbench.js');
const guided = require('../out/guided-workspace.js');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const manifest = '---\nname: quick-import\ndescription: Summarize supplied notes when asked.\n---\nKeep supplied facts.\n';
function fixture(t) {
  const dist = path.resolve(__dirname, '../dist'); fs.mkdirSync(dist, { recursive: true });
  const root = fs.mkdtempSync(path.join(dist, 'import-open-test-'));
  t.after(() => { assert.equal(path.dirname(root), dist); fs.rmSync(root, { recursive: true, force: true }); });
  const zip = new AdmZip(); zip.addFile('quick-import/SKILL.md', Buffer.from(manifest));
  for (let i = 0; i < 40; i++) zip.addFile(`quick-import/references/file-${i}.txt`, Buffer.from(`Reference ${i}`));
  zip.addFile('quick-import/assets/data.bin', Buffer.from([0, 255, 1]));
  zip.addFile('quick-import/references/empty.txt', Buffer.alloc(0));
  zip.addFile('quick-import/empty-folder/', Buffer.alloc(0));
  const file = path.join(root, 'input.skill'); zip.writeZip(file);
  return { root, file };
}
test('opening returns a byte-preserving editor preview without creating a directory for every file', t => {
  const f = fixture(t), mkdir = fs.mkdirSync; let mkdirCalls = 0;
  fs.mkdirSync = function(...args) { mkdirCalls++; return mkdir.apply(this, args); };
  let opening;
  try { opening = core.openSkillPackage(f.file, f.root); }
  finally { fs.mkdirSync = mkdir; }
  assert.ok(mkdirCalls < 20, `Only distinct directories need creating; observed ${mkdirCalls}`);
  assert.equal(opening.manifestContent, manifest);
  assert.deepEqual(opening.files, guided.listGuidedFiles(opening.skill));
  assert.equal(opening.files.find(file => file.path === 'assets/data.bin').text, false);
  assert.equal(opening.files.find(file => file.path === 'references/empty.txt').text, true);
  assert.deepEqual(fs.readFileSync(opening.skill.originalPackagePath), fs.readFileSync(f.file));
  assert.equal(core.listWorkbenchSkills(f.root)[0].files, undefined, 'preview data is never persisted in the catalog');
});
test('the first editor frame reuses imported bytes instead of rereading every extracted file', async t => {
  const f = fixture(t), list = guided.listGuidedFiles, read = guided.readGuidedFile;
  guided.listGuidedFiles = () => { throw new Error('Unexpected eager file rescan'); };
  guided.readGuidedFile = () => { throw new Error('Unexpected manifest reread'); };
  const controller = new GuidedWorkbenchController(f.root, { pickPackage: async () => f.file });
  try {
    await controller.dispatch({ action: 'openPackage' });
    assert.equal(controller.state.error, undefined);
    assert.equal(controller.state.step, 'edit');
    assert.equal(controller.state.editor.content, manifest);
    assert.equal(controller.state.files.length, 43);
  } finally { guided.listGuidedFiles = list; guided.readGuidedFile = read; }
});
test('a first-frame preview cannot overwrite a subsequent external file change', async t => {
  const f = fixture(t), controller = new GuidedWorkbenchController(f.root, { pickPackage: async () => f.file });
  await controller.dispatch({ action: 'openPackage' });
  assert.equal(controller.state.error, undefined);
  const skill = core.listWorkbenchSkills(f.root)[0];
  const external = manifest + '\nKeep external change.\n';
  fs.writeFileSync(path.join(skill.sourcePath, 'SKILL.md'), external);
  await controller.dispatch({ action: 'save', editorSkillId: skill.id, editorPath: 'SKILL.md', editorContent: manifest + '\nWorkbench change.\n' });
  assert.match(controller.state.error, /changed in another editor/);
  assert.equal(fs.readFileSync(path.join(skill.sourcePath, 'SKILL.md'), 'utf8'), external);
});


test('opening one editor file reads only that file, while binary files remain read-only', async t => {
  const f = fixture(t), controller = new GuidedWorkbenchController(f.root, { pickPackage: async () => f.file });
  await controller.dispatch({ action: 'openPackage' });
  const read = fs.readFileSync, reads = [];
  fs.readFileSync = function(file, ...args) { reads.push(String(file)); return read.call(this, file, ...args); };
  try {
    await controller.dispatch({ action: 'openFile', payload: { path: 'references/file-1.txt' } });
    assert.equal(controller.state.error, undefined);
    assert.equal(controller.state.editor.content, 'Reference 1');
    assert.equal(reads.filter(file => file.includes('references') || file.endsWith('.bin')).length, 1);
    await controller.dispatch({ action: 'openFile', payload: { path: 'assets/data.bin' } });
    assert.equal(controller.state.error, undefined);
    assert.equal(controller.state.editor.readOnly, true);
  } finally { fs.readFileSync = read; }
});
