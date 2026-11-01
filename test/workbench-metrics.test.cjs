const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { emitWorkbenchMetric, METRIC_STAGES } = require('../out/workbench-metrics.js');
const { openSkillPackage } = require('../out/skill-workbench.js');
const { runWorkbenchJob } = require('../out/workbench-jobs.js');
function fixture(t) {
  const dist = path.resolve(__dirname, '../dist'); fs.mkdirSync(dist, { recursive: true });
  const base = fs.mkdtempSync(path.join(dist, 'metrics-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(base)), dist); fs.rmSync(base, { recursive: true, force: true }); });
  const root = path.join(base, 'workspace'); fs.mkdirSync(root);
  const file = path.join(base, 'private-package.skill');
  const zip = new AdmZip(); const manifest = '---\nname: metric-sample\ndescription: Handle private content when asked.\n---\nPRIVATE_CONTENT_CANARY';
  zip.addFile('metric-sample/SKILL.md', Buffer.from(manifest));
  for (let i = 0; i < 12; i++) zip.addFile(`metric-sample/private-name-${i}.txt`, Buffer.from('PRIVATE_PAYLOAD_CANARY'));
  zip.writeZip(file); return { base, root, file, manifest };
}
function checkSchema(metrics) {
  for (const metric of metrics) {
    assert.ok(METRIC_STAGES.includes(metric.stage)); assert.ok(Number.isFinite(metric.durationMs) && metric.durationMs >= 0);
    assert.ok(Object.keys(metric).every(k => ['stage', 'durationMs', 'fileCount', 'byteCount', 'outcome', 'jobKind', 'operation', 'statusCode', 'exitCode', 'timedOut'].includes(k)));
  }
  const json = JSON.stringify(metrics); assert.doesNotMatch(json, /PRIVATE|private-name|private-package|workspace|https:|\\\\/);
}
test('metrics strictly allow aggregate fields and isolate sink failures', () => {
  const metrics = []; const sink = metric => metrics.push(metric);
  emitWorkbenchMetric(sink, { stage: 'archiveRead', durationMs: 2, fileCount: 3, byteCount: 10, outcome: 'ok', path: 'PRIVATE_PATH', error: 'PRIVATE_ERROR' });
  assert.deepEqual(metrics, [{ stage: 'archiveRead', durationMs: 2, fileCount: 3, byteCount: 10, outcome: 'ok' }]);
  for (const metric of [{ stage: 'PRIVATE_PATH', durationMs: 0 }, { stage: 'archiveRead', durationMs: Infinity }, { stage: 'archiveRead', durationMs: -1 }, { stage: 'archiveRead', durationMs: 0, byteCount: 'PRIVATE' }, { stage: 'archiveRead', durationMs: 0, outcome: 'PRIVATE' }]) emitWorkbenchMetric(sink, metric);
  assert.equal(metrics.length, 1);
  assert.doesNotThrow(() => emitWorkbenchMetric(() => { throw new Error('Logger failed'); }, { stage: 'operationTotal', durationMs: 1 }));
});
test('opening emits bounded aggregate import phases without private data or per-file events', t => {
  const f = fixture(t), metrics = [];
  const result = openSkillPackage(f.file, f.root, false, metric => metrics.push(metric));
  assert.equal(result.manifestContent, f.manifest); assert.equal(result.files.length, 13);
  assert.deepEqual(new Set(metrics.map(m => m.stage)), new Set(['archiveRead', 'archiveValidation', 'archiveDecode', 'extractWrite', 'extractedReadback', 'originalPreservation', 'catalogWrite', 'editorPreview']));
  assert.equal(metrics.length, 8); assert.equal(metrics.find(m => m.stage === 'extractWrite').fileCount, 13);
  checkSchema(metrics);
});
test('throwing metric sinks do not alter success, archive rejection, or prior draft preservation', t => {
  const f = fixture(t); const logger = () => { throw new Error('Diagnostic callback failed'); };
  const first = openSkillPackage(f.file, f.root, false, logger); const before = fs.readFileSync(path.join(first.skill.sourcePath, 'SKILL.md'));
  const bad = new AdmZip(); bad.addFile('wrong-root/SKILL.md', Buffer.from(f.manifest)); const invalid = path.join(f.base, 'bad.skill'); bad.writeZip(invalid);
  assert.throws(() => openSkillPackage(invalid, f.root, true, logger), /folder must match/);
  assert.deepEqual(fs.readFileSync(path.join(first.skill.sourcePath, 'SKILL.md')), before);
});
test('workers forward metrics and readiness independently before resolving only the final result', async t => {
  const f = fixture(t), metrics = [];
  const result = await runWorkbenchJob({ kind: 'openPackage', root: f.root, file: f.file }, { onMetric: metric => metrics.push(metric) });
  assert.equal(result.manifestContent, f.manifest); assert.equal(result.skill.name, 'metric-sample');
  assert.equal(metrics[0].stage, 'workerStartup'); assert.equal(metrics.at(-1).stage, 'workerTeardown');
  assert.ok(metrics.some(m => m.stage === 'workerExecution')); assert.ok(metrics.some(m => m.stage === 'archiveRead'));
  checkSchema(metrics);
  const second = await runWorkbenchJob({ kind: 'validate', skill: result.skill }, { onMetric: () => { throw new Error('Logger failed'); } });
  assert.equal(second.valid, true);
});
test('logger failures cannot interrupt recovery after a catalog write fails', t => {
  const f = fixture(t); const logger = () => { throw new Error('Diagnostic callback failed'); };
  const first = openSkillPackage(f.file, f.root, false, logger);
  const originalSource = fs.readFileSync(path.join(first.skill.sourcePath, 'SKILL.md'));
  const originalCatalog = fs.readFileSync(path.join(f.root, '.skill-workbench/catalog.json'));
  const replacement = new AdmZip(); replacement.addFile('metric-sample/SKILL.md', Buffer.from(`${f.manifest}\nReplacement.`)); replacement.writeZip(f.file);
  const originalRename = fs.renameSync;
  fs.renameSync = (source, destination) => {
    if (path.resolve(destination) === path.join(f.root, '.skill-workbench/catalog.json')) throw new Error('Injected catalog write failure');
    return originalRename(source, destination);
  };
  try { assert.throws(() => openSkillPackage(f.file, f.root, true, logger), /Injected catalog write failure/); }
  finally { fs.renameSync = originalRename; }
  assert.deepEqual(fs.readFileSync(path.join(first.skill.sourcePath, 'SKILL.md')), originalSource);
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.skill-workbench/catalog.json')), originalCatalog);
});
test('worker failures retain aggregate timing and never turn error text into diagnostics', async t => {
  const f = fixture(t), metrics = [];
  await assert.rejects(runWorkbenchJob({ kind: 'openPackage', root: f.root, file: path.join(f.base, 'PRIVATE_MISSING.skill') }, { onMetric: metric => metrics.push(metric) }));
  assert.ok(metrics.some(m => m.stage === 'workerExecution' && m.outcome === 'error'));
  assert.equal(metrics.at(-1).stage, 'workerTeardown'); checkSchema(metrics);
});
