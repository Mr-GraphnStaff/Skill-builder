const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { emitWorkbenchMetric, withWorkbenchMetrics } = require('../out/workbench-metrics.js');
const { repositoryGit } = require('../out/repository-publisher.js');
const { createGitHubSessionRunner } = require('../out/github-session.js');
const { createGuidedSkill } = require('../out/guided-workspace.js');
const { runWorkbenchJob } = require('../out/workbench-jobs.js');

function fixture(t) {
  const dist = path.resolve(__dirname, '../dist'); fs.mkdirSync(dist, { recursive: true });
  const root = fs.mkdtempSync(path.join(dist, 'runtime-diagnostics-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(root)), dist); fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}
function transport(status = 200, hang = false) {
  return (options, callback) => {
    const req = new EventEmitter(); req.destroy = () => {};
    req.end = () => queueMicrotask(() => {
      const response = new EventEmitter(); response.statusCode = status; response.destroy = () => {};
      callback(response);
      if (status >= 200 && status < 300 && !hang) {
        response.emit('data', Buffer.from('{"private":"PRIVATE_RESPONSE_CANARY"}')); response.emit('end');
      }
    });
    return req;
  };
}
const request = { method: 'GET', endpoint: 'repos/PRIVATE_OWNER/PRIVATE_REPOSITORY/pulls/5/reviews' };

test('runtime schema admits only fixed categories, bounded numbers and booleans', () => {
  const output = [];
  emitWorkbenchMetric(m => output.push(m), { stage: 'githubRequest', durationMs: 3, operation: request.endpoint, jobKind: 'PRIVATE_JOB', statusCode: 401, exitCode: -1, timedOut: 'PRIVATE_TOKEN', body: 'PRIVATE_BODY' });
  assert.deepEqual(output, [{ stage: 'githubRequest', durationMs: 3, statusCode: 401 }]);
  emitWorkbenchMetric(m => output.push(m), { stage: 'gitLocal', durationMs: 4, operation: 'config', exitCode: 1, outcome: 'error', timedOut: false });
  assert.deepEqual(output[1], { stage: 'gitLocal', durationMs: 4, operation: 'config', exitCode: 1, outcome: 'error', timedOut: false });
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE/);
});

test('Git reports local and remote command timing, failures, and isolated concurrent operations without arguments', async t => {
  const root = fixture(t);
  execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'pipe', windowsHide: true });
  const foreground = [], background = [];
  await Promise.all([
    withWorkbenchMetrics(m => foreground.push(m), async () => {
      await repositoryGit(root, ['--no-optional-locks', '-c', 'core.fsmonitor=false', 'rev-parse', '--git-dir']);
      await assert.rejects(repositoryGit(root, ['config', '--get', 'PRIVATE.missing']), /Git operation failed/);
    }),
    withWorkbenchMetrics(m => background.push(m), () => repositoryGit(root, ['ls-remote', '--', root, 'HEAD']))
  ]);
  assert.deepEqual(foreground.map(m => [m.stage, m.operation, m.outcome, m.exitCode]), [['gitLocal', 'rev-parse', 'ok', 0], ['gitLocal', 'config', 'error', 1]]);
  assert.deepEqual(background.map(m => [m.stage, m.operation, m.outcome]), [['gitRemote', 'ls-remote', 'ok']]);
  const text = JSON.stringify([...foreground, ...background]);
  assert.doesNotMatch(text, /PRIVATE|runtime-diagnostics-|\.git|P:|Users/);
  assert.ok([...foreground, ...background].every(m => Number.isFinite(m.durationMs) && m.durationMs >= 0));
});

test('session and HTTPS timings preserve status and timeout outcomes without token, endpoint or response data', async () => {
  const metrics = [];
  await withWorkbenchMetrics(m => metrics.push(m), async () => {
    await createGitHubSessionRunner(async () => 'PRIVATE_TOKEN_CANARY', transport())(request);
    await assert.rejects(createGitHubSessionRunner(async () => 'PRIVATE_TOKEN_CANARY', transport(403))(request), /HTTP 403/);
    await assert.rejects(createGitHubSessionRunner(async () => 'PRIVATE_TOKEN_CANARY', transport(200, true), 15)(request), /timed out/);
    await assert.rejects(createGitHubSessionRunner(async () => { throw new Error('PRIVATE_AUTH_ERROR'); }, transport())(request), /sign-in/);
    await assert.rejects(createGitHubSessionRunner(async () => '', transport())(request), /sign-in/);
  });
  assert.deepEqual(metrics.filter(m => m.stage === 'authentication').map(m => m.outcome), ['ok', 'ok', 'ok', 'error', 'error']);
  assert.deepEqual(metrics.filter(m => m.stage === 'githubRequest').map(m => [m.operation, m.statusCode, m.outcome, m.timedOut]), [['reviews', 200, 'ok', false], ['reviews', 403, 'error', false], ['reviews', 200, 'error', true]]);
  assert.doesNotMatch(JSON.stringify(metrics), /PRIVATE|repos\/|pulls\//);
  await assert.doesNotReject(withWorkbenchMetrics(() => { throw new Error('PRIVATE_LOGGER_ERROR'); }, () => createGitHubSessionRunner(async () => 'PRIVATE_TOKEN', transport())(request)));
});

test('worker phases identify validation, release preparation and snapshot scans without private skill data', async t => {
  const root = fixture(t), metrics = [];
  const skill = createGuidedSkill(root, { name: 'private-canary', description: 'Summarize provided records when asked.', instructions: 'PRIVATE_INSTRUCTIONS_CANARY' });
  const onMetric = m => metrics.push(m);
  await runWorkbenchJob({ kind: 'validate', skill }, { onMetric });
  await runWorkbenchJob({ kind: 'prepareRelease', root, id: skill.id, version: '1.0.0', changelog: 'PRIVATE_CHANGELOG_CANARY' }, { onMetric });
  await runWorkbenchJob({ kind: 'snapshot', root, skill }, { onMetric });
  assert.ok(metrics.some(m => m.stage === 'skillValidation' && m.jobKind === 'validate'));
  assert.ok(metrics.some(m => m.stage === 'releasePreparation' && m.jobKind === 'prepareRelease'));
  for (const stage of ['skillValidation', 'libraryScan', 'releaseVerification', 'changeComparison']) assert.ok(metrics.some(m => m.stage === stage && m.jobKind === 'snapshot'), stage);
  assert.deepEqual(metrics.filter(m => m.stage === 'workerExecution').map(m => m.jobKind), ['validate', 'prepareRelease', 'snapshot']);
  assert.doesNotMatch(JSON.stringify(metrics), /PRIVATE|private-canary|runtime-diagnostics-|\.skill|\.md/);
});
