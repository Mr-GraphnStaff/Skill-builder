const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeVerifiedPullRequest } = require('../out/github-merge.js');
const context = { repository: 'https://github.com/example/skills.git', baseBranch: 'main', branch: 'skills/sample/1.0.0', commit: 'a'.repeat(40), skillName: 'sample', version: '1.0.0' };
const receipt = { supported: true, status: 'approved', number: 7, base: context.baseBranch, head: context.branch, headCommit: context.commit, identityVerified: true, reviewer: 'reviewer' };
const mergedCommit = 'b'.repeat(40);
function fixture() {
  const state = { calls: [], deleted: false, branchSha: context.commit, mergeMode: 'ok', deleteMode: 'ok', defaultBranch: 'main', protected: false, mergedRead: true,
    pr: { number: 7, state: 'open', merged: false, merged_at: null, draft: false, mergeable: true, mergeable_state: 'clean', base: { ref: 'main', repo: { full_name: 'example/skills' } }, head: { ref: context.branch, sha: context.commit, repo: { full_name: 'example/skills' } } },
    statuses: { sha: context.commit, state: 'pending', total_count: 0, statuses: [] }, checks: { total_count: 0, check_runs: [] } };
  const root = 'repos/example/skills';
  state.runner = async request => {
    state.calls.push(structuredClone(request)); const e = request.endpoint;
    if (request.method === 'GET') {
      if (e === root) return { full_name: 'example/skills', default_branch: state.defaultBranch, permissions: { push: true }, allow_merge_commit: true };
      if (e === `${root}/pulls/7`) { const value = structuredClone(state.pr); if (!state.mergedRead && value.merged) { value.merged = false; value.merged_at = null; } return value; }
      if (e === `${root}/branches/main`) return { name: 'main', protected: false };
      if (e.includes('/branches/')) { if (state.deleted) throw new Error('GitHub API HTTP 404'); return { name: context.branch, protected: state.protected, commit: { sha: state.branchSha } }; }
      if (e.includes('/git/ref/heads/')) { if (state.deleted) throw new Error('GitHub API HTTP 404'); return { ref: `refs/heads/${context.branch}`, object: { sha: state.branchSha } }; }
      if (e.includes('/status?')) return state.statuses;
      if (e.includes('/check-runs?')) return state.checks;
    }
    if (request.method === 'PUT') {
      if (state.mergeMode === 'fail') throw new Error('HTTP 405 PRIVATE_TOKEN');
      state.pr.merged = true; state.pr.state = 'closed'; state.pr.merged_at = '2026-10-29T00:00:00Z'; state.pr.merge_commit_sha = mergedCommit;
      if (state.advanceAfterMerge) state.branchSha = 'c'.repeat(40);
      if (state.mergeMode === 'ambiguous') throw new Error('network timeout PRIVATE_TOKEN');
      return { merged: true, sha: mergedCommit };
    }
    if (request.method === 'DELETE') throw new Error('REST deletion is forbidden');
    throw new Error(`Unexpected mock endpoint ${request.method} ${e}`);
  };
  state.deleteBranch = async selected => {
    assert.deepEqual(selected, context);
    state.calls.push({ method: 'LEASE', endpoint: 'private-lease' });
    if (state.advanceAtLease) state.branchSha = 'e'.repeat(40);
    if (state.branchSha !== selected.commit) throw new Error('Atomic lease rejected advanced branch');
    if (state.deleteMode === 'fail') throw new Error('HTTP 403 PRIVATE_TOKEN');
    state.deleted = true;
    if (state.deleteMode === 'ambiguous') throw new Error('network timeout PRIVATE_TOKEN');
  };
  return state;
}
const writes = m => m.calls.filter(c => c.method !== 'GET');
test('explicit merge verifies exact identity, confirms merge, deletes only unchanged branch and reads back absence', async () => {
  const m = fixture(), result = await mergeVerifiedPullRequest(context, receipt, m.runner, m.deleteBranch);
  assert.equal(result.status, 'merged'); assert.equal(result.mergeCommit, mergedCommit); assert.equal(result.branchDeleted, true); assert.equal(result.reviewer, 'reviewer');
  assert.deepEqual(writes(m).map(c => c.method), ['PUT', 'LEASE']);
  assert.deepEqual(writes(m)[0].body, { sha: context.commit, merge_method: 'merge' });
  assert.match(writes(m)[1].endpoint, /private-lease$/);
  const put = m.calls.findIndex(c => c.method === 'PUT'), del = m.calls.findIndex(c => c.method === 'LEASE');
  assert.ok(m.calls.slice(put + 1, del).some(c => c.endpoint.endsWith('/pulls/7')));
  assert.equal(m.calls.at(-1).method, 'GET');
});
test('already merged exact PR retries cleanup without a second merge', async () => {
  const m = fixture(); m.pr.merged = true; m.pr.merge_commit_sha = mergedCommit; m.pr.state = 'closed';
  const result = await mergeVerifiedPullRequest(context, receipt, m.runner, m.deleteBranch);
  assert.equal(result.branchDeleted, true); assert.equal(writes(m).filter(c => c.method === 'PUT').length, 0);
  m.calls.length = 0; const retried = await mergeVerifiedPullRequest(context, result, m.runner, m.deleteBranch);
  assert.equal(retried.status, 'merged'); assert.equal(retried.branchDeleted, true); assert.equal(writes(m).length, 0);
});
test('saved or live PR identity mismatch permits no writes', async () => {
  const m = fixture(); m.pr.head.sha = 'd'.repeat(40);
  const result = await mergeVerifiedPullRequest(context, receipt, m.runner, m.deleteBranch); assert.ok(result.mergeError); assert.equal(result.identityVerified, false); assert.equal(writes(m).length, 0);
  const other = fixture(); const invalid = await mergeVerifiedPullRequest(context, { ...receipt, head: 'other' }, other.runner); assert.ok(invalid.mergeError); assert.equal(other.calls.length, 0);
});
test('branch advance before merge prevents merge; advance after merge preserves branch', async () => {
  const before = fixture(); before.branchSha = 'd'.repeat(40); assert.ok((await mergeVerifiedPullRequest(context, receipt, before.runner, before.deleteBranch)).mergeError); assert.equal(writes(before).length, 0);
  const after = fixture(); after.advanceAfterMerge = true; const result = await mergeVerifiedPullRequest(context, receipt, after.runner, after.deleteBranch);
  assert.equal(result.status, 'merged'); assert.ok(result.branchDeleteError); assert.notEqual(result.branchDeleted, true); assert.deepEqual(writes(after).map(c => c.method), ['PUT']);
});
test('no cleanup callback occurs before exact merged PR is independently confirmed', async () => {
  const m = fixture(); m.mergedRead = false;
  const result = await mergeVerifiedPullRequest(context, receipt, m.runner, m.deleteBranch); assert.ok(result.mergeError); assert.deepEqual(writes(m).map(c => c.method), ['PUT']);
});
test('missing lease callback retains merged branch and never uses REST deletion', async () => {
  const m = fixture(); const result = await mergeVerifiedPullRequest(context, receipt, m.runner);
  assert.equal(result.status, 'merged'); assert.equal(result.branchDeleted, undefined); assert.match(result.branchDeleteError, /Atomic branch cleanup is unavailable/);
  assert.deepEqual(writes(m).map(c => c.method), ['PUT']);
});
test('atomic lease preserves a branch advanced in the exact read-to-delete race window', async () => {
  const m = fixture(); m.advanceAtLease = true;
  const result = await mergeVerifiedPullRequest(context, receipt, m.runner, m.deleteBranch);
  assert.equal(result.status, 'merged'); assert.ok(result.branchDeleteError); assert.equal(result.branchDeleted, undefined);
  assert.equal(m.branchSha, 'e'.repeat(40)); assert.equal(m.deleted, false); assert.deepEqual(writes(m).map(c => c.method), ['PUT', 'LEASE']);
  assert.equal(m.calls.some(c => c.method === 'DELETE'), false);
});
test('merge failure retains original PR and branch with safe errors; ambiguous successful write reconciles without repeating PUT', async () => {
  const fail = fixture(); fail.mergeMode = 'fail'; const result = await mergeVerifiedPullRequest(context, receipt, fail.runner, fail.deleteBranch);
  assert.equal(result.number, receipt.number); assert.equal(result.status, receipt.status); assert.ok(result.mergeError); assert.doesNotMatch(result.mergeError, /PRIVATE_TOKEN/); assert.deepEqual(writes(fail).map(c => c.method), ['PUT']);
  const ambiguous = fixture(); ambiguous.mergeMode = 'ambiguous'; const success = await mergeVerifiedPullRequest(context, receipt, ambiguous.runner, ambiguous.deleteBranch);
  assert.equal(success.branchDeleted, true); assert.equal(writes(ambiguous).filter(c => c.method === 'PUT').length, 1);
});
test('delete failures retain confirmed merge; ambiguous successful deletion reconciles only by GET', async () => {
  const fail = fixture(); fail.deleteMode = 'fail'; const result = await mergeVerifiedPullRequest(context, receipt, fail.runner, fail.deleteBranch);
  assert.equal(result.status, 'merged'); assert.ok(result.branchDeleteError); assert.doesNotMatch(result.branchDeleteError, /PRIVATE_TOKEN/); assert.equal(result.branchDeleted, undefined);
  const ambiguous = fixture(); ambiguous.deleteMode = 'ambiguous'; assert.equal((await mergeVerifiedPullRequest(context, receipt, ambiguous.runner, ambiguous.deleteBranch)).branchDeleted, true);
  assert.equal(writes(ambiguous).filter(c => c.method === 'LEASE').length, 1);
});
test('default and protected branches are preserved and failing or pending checks block merge', async () => {
  const defaultHead = fixture(); defaultHead.defaultBranch = context.branch; const result = await mergeVerifiedPullRequest(context, receipt, defaultHead.runner, defaultHead.deleteBranch); assert.equal(result.status, 'merged'); assert.ok(result.branchDeleteError); assert.equal(writes(defaultHead).some(c => c.method === 'LEASE'), false);
  const protectedHead = fixture(); protectedHead.protected = true; assert.ok((await mergeVerifiedPullRequest(context, receipt, protectedHead.runner, protectedHead.deleteBranch)).branchDeleteError); assert.equal(writes(protectedHead).some(c => c.method === 'LEASE'), false);
  for (const conclusion of ['failure', 'timed_out', null]) { const m = fixture(); m.checks = { total_count: 1, check_runs: [{ head_sha: context.commit, status: conclusion ? 'completed' : 'in_progress', conclusion }] }; assert.ok((await mergeVerifiedPullRequest(context, receipt, m.runner, m.deleteBranch)).mergeError); assert.equal(writes(m).length, 0); }
  const m = fixture(); m.pr.mergeable_state = 'blocked'; assert.ok((await mergeVerifiedPullRequest(context, receipt, m.runner, m.deleteBranch)).mergeError); assert.equal(writes(m).length, 0);
});
