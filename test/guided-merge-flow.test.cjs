const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const workspace = require('../out/guided-workspace.js');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const { renderGuidedWorkbench } = require('../out/guided-workbench-html.js');
test('merge is a confirmed explicit action routed to the recorded upload without publication or reviewer calls', async t => {
  const original = workspace.reviewLibraryRelease; const calls = [];
  t.after(() => { workspace.reviewLibraryRelease = original; });
  workspace.reviewLibraryRelease = async (...args) => { calls.push(args); return { pr: { supported: true, status: 'merged', number: 10, identityVerified: true, branchDeleted: true } }; };
  const controller = new GuidedWorkbenchController(path.resolve('dist/mock-merge-workspace'));
  controller.refreshReviews = async () => {};
  controller.state.form = { mode: 'reviews' };
  await controller.dispatch({ action: 'mergePullRequest', payload: { directory: 'recorded-release' } });
  assert.equal(calls.length, 0); assert.match(controller.state.error, /confirm/);
  await controller.dispatch({ action: 'mergePullRequest', payload: { directory: 'recorded-release', confirmed: true } });
  assert.equal(calls.length, 1); assert.equal(calls[0][1], 'recorded-release'); assert.equal(calls[0][2], 'merge');
  assert.equal(controller.state.form.mode, 'reviews'); assert.equal(controller.state.error, undefined);
});
test('merge and cleanup controls distinguish current submission, mismatched history and completed cleanup', () => {
  const state = { step: 'start', hasWorkspace: true, repositories: [], drafts: [], library: [], files: [], target: 'portable', form: { mode: 'reviews' } };
  const render = pr => renderGuidedWorkbench({ ...state, reviewQueue: [{ directory: 'release', skillName: 'sample', version: '1.0.0', pr }] }, 'test-nonce-0123456789abcdef');
  const current = { supported: true, status: 'awaiting_review', number: 10, identityVerified: true };
  assert.match(render(current), /data-action="mergePullRequest"[^>]*data-confirmed="true"[^>]*>Merge PR and delete branch/);
  assert.doesNotMatch(render({ ...current, identityVerified: false, status: 'unknown' }), /data-action="mergePullRequest"/);
  assert.match(render({ ...current, status: 'merged', branchDeleteError: 'Cleanup pending' }), /Delete merged PR branch/);
  assert.doesNotMatch(render({ ...current, status: 'merged', branchDeleted: true }), /data-action="mergePullRequest"/);
  assert.match(render({ ...current, status: 'merged', branchDeleted: true }), /Merge confirmed. Submission branch deleted./);
  const mismatch = render({ ...current, status: 'merged', identityVerified: false, branchDeleted: true, mergeError: 'Identity changed' });
  assert.doesNotMatch(mismatch, /result-badge pass|Merge confirmed. Submission branch deleted./);
  assert.match(mismatch, /Status not verified for this upload/);
});


test('merge failures and confirmed-merge cleanup failures produce distinct terminal feedback', async t => {
  const original = workspace.reviewLibraryRelease; t.after(() => { workspace.reviewLibraryRelease = original; });
  const results = [
    { supported: true, number: 10, status: 'awaiting_review', identityVerified: true, mergeError: 'Checks are pending' },
    { supported: true, number: 10, status: 'merged', identityVerified: true, branchDeleteError: 'Branch advanced' },
    { supported: true, number: 10, status: 'merged', identityVerified: false, branchDeleted: true }
  ];
  const messages = [/Checks are pending/, /PR merged. Branch cleanup needs attention: Branch advanced/, /not verified for this exact submission/];
  for (let index = 0; index < results.length; index++) {
    workspace.reviewLibraryRelease = async () => ({ pr: results[index] });
    const controller = new GuidedWorkbenchController(path.resolve('dist/mock-merge-workspace'));
    controller.refreshReviews = async () => {}; controller.state.form = { mode: 'reviews' };
    await controller.dispatch({ action: 'mergePullRequest', payload: { directory: 'recorded-release', confirmed: true } });
    assert.match(controller.state.error, messages[index]); assert.equal(controller.state.notice, undefined);
  }
});
