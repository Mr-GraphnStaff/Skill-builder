const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { GitHubReviewService, githubRepository, reviewRecord } = require('../out/github-review.js');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const library = require('../out/workbench-library.js');
const core = require('../out/skill-workbench.js');
const workspace = require('../out/guided-workspace.js');
const context = { repository: 'https://github.com/fixture-owner/fixture-repository.git', baseBranch: 'main', branch: 'skills/fixture-skill/1.0.0', commit: 'a'.repeat(40), skillName: 'fixture-skill', version: '1.0.0' };
function raw(c = context, extra = {}) {
  return { number: 7, state: 'open', merged_at: null, user: { login: 'author' }, requested_reviewers: [], base: { ref: c.baseBranch, repo: { full_name: 'fixture-owner/fixture-repository' } }, head: { ref: c.branch, sha: c.commit, repo: { full_name: 'fixture-owner/fixture-repository' } }, ...extra };
}
function mock(c = context) {
  const state = { pr: undefined, reviews: [], collaborators: [
    { login: 'author', type: 'User', permissions: { push: true } },
    { login: 'eligible', type: 'User', permissions: { push: true } },
    { login: 'read-only', type: 'User', permissions: { pull: true } },
    { login: 'automation', type: 'Bot', permissions: { push: true } }
  ], calls: [], failCreate: false, failReview: false, failRead: false, wrongRef: false, permissions: true };
  state.runner = async request => {
    state.calls.push(structuredClone(request));
    const e = request.endpoint;
    if (request.method === 'GET') {
      if (state.failRead) throw new Error('GitHub API HTTP 429');
      if (e === 'user') return { login: 'author' };
      if (e === 'repos/fixture-owner/fixture-repository') return { full_name: 'fixture-owner/fixture-repository', permissions: { push: state.permissions } };
      if (e.includes('/collaborators?')) return state.collaborators;
      if (e.includes('/git/ref/heads/')) return { ref: `refs/heads/${c.branch}`, object: { sha: state.wrongRef ? 'b'.repeat(40) : c.commit } };
      if (e.includes('/reviews?')) return state.reviews;
      if (e.includes('/pulls?')) return state.pr ? [{ number: state.pr.number }] : [];
      if (e.endsWith('/pulls/7')) { if (!state.pr) throw new Error('GitHub API HTTP 404'); return structuredClone(state.pr); }
    }
    if (request.method === 'POST' && e.endsWith('/pulls')) {
      if (state.failCreate === 'without-result') throw new Error('network timeout');
      state.pr = raw(c);
      if (state.failCreate) throw new Error('network timeout');
      return structuredClone(state.pr);
    }
    if (request.method === 'POST' && e.endsWith('/requested_reviewers')) {
      if (state.failReview) throw new Error('GitHub API HTTP 403');
      state.pr.requested_reviewers = request.body.reviewers.map(login => ({ login }));
      return structuredClone(state.pr);
    }
    throw new Error(`Unexpected fixture request: ${request.method} ${e}`);
  };
  return state;
}

test('GitHub identity parsing rejects lookalikes, credentials and arbitrary hosts; unsupported providers make no requests', async () => {
  assert.equal(githubRepository('git@github.com:fixture-owner/fixture-repository.git').fullName, 'fixture-owner/fixture-repository');
  for (const value of ['https://github.com.evil.invalid/a/b', 'https://user:secret@github.com/a/b', 'https://github.com/a/b?x=1', 'https://github.com/a/b/extra', 'https://gitlab.com/a/b', 'https://github.com:444/a/b']) assert.equal(githubRepository(value), undefined);
  const m = mock(); const service = new GitHubReviewService('.', m.runner);
  assert.equal((await service.ensure({ ...context, repository: 'P:/local/destination.git' })).status, 'unsupported');
  assert.equal(m.calls.length, 0);
  assert.equal(reviewRecord({ supported: true, status: 'approved', number: 7, url: 'https://evil.invalid/secret' }, context.repository).url, 'https://github.com/fixture-owner/fixture-repository/pull/7');
});

test('reviewer choices include verified read collaborators, excluding author and bots', async () => {
  const m = mock();
  assert.deepEqual(await new GitHubReviewService('.', m.runner).reviewers(context.repository), [{ login: 'eligible' }, { login: 'read-only' }]);
  assert(m.calls.every(call => !call.endpoint.includes('contributors')));
});

test('preflight verifies exact repository and account permission before an upload is attempted', async () => {
  const m = mock(); m.permissions = false;
  await assert.rejects(new GitHubReviewService('.', m.runner).preflight(context.repository), /before uploading.*Connect \/ switch GitHub/);
  assert(m.calls.every(call => call.method === 'GET'));
});

test('PR creation uses exact recorded branch/base and deterministic links, then retries reuse the existing PR', async () => {
  const m = mock(); const service = new GitHubReviewService('.', m.runner);
  const first = await service.ensure(context);
  assert.equal(first.status, 'awaiting_review'); assert.equal(first.identityVerified, true);
  const write = m.calls.find(call => call.method === 'POST');
  assert.equal(write.body.head, context.branch); assert.equal(write.body.base, 'main');
  assert.match(write.body.body, /CHANGELOG\.md/); assert.match(write.body.body, new RegExp(context.commit));
  assert.doesNotMatch(write.body.body, /@|Closes #|Fixes #/);
  assert.equal((await service.ensure(context, first)).number, 7);
  assert.equal(m.calls.filter(call => call.method === 'POST').length, 1);
});

test('ambiguous create is reconciled by reads and never blindly posts a second PR', async () => {
  const m = mock(); m.failCreate = true;
  const service = new GitHubReviewService('.', m.runner);
  const result = await service.ensure(context);
  assert.equal(result.number, 7); assert.equal(result.status, 'awaiting_review');
  await service.ensure(context, result);
  assert.equal(m.calls.filter(call => call.method === 'POST').length, 1);
  const absent = mock(); absent.failCreate = 'without-result';
  const uncertain = await new GitHubReviewService('.', absent.runner).ensure(context);
  assert.equal(uncertain.creationUncertain, true);
  await new GitHubReviewService('.', absent.runner).ensure(context, uncertain);
  assert.equal(absent.calls.filter(call => call.method === 'POST').length, 1);
});

test('a fulfilled but malformed create response remains uncertain and cannot blindly repeat POST', async () => {
  const m = mock(); const original = m.runner;
  const runner = request => request.method === 'POST' && request.endpoint.endsWith('/pulls')
    ? (m.calls.push(structuredClone(request)), Promise.resolve({ acceptedButIncomplete: true })) : original(request);
  const service = new GitHubReviewService('.', runner);
  const first = await service.ensure(context);
  assert.equal(first.creationUncertain, true);
  await service.ensure(context, first);
  assert.equal(m.calls.filter(call => call.method === 'POST').length, 1);
});

test('approvals for a different commit do not approve the recorded upload', async () => {
  const m = mock(); m.pr = raw();
  m.reviews = [{ id: 1, state: 'APPROVED', commit_id: 'b'.repeat(40), user: { login: 'eligible' } }];
  const result = await new GitHubReviewService('.', m.runner).check(context);
  assert.equal(result.status, 'awaiting_review'); assert.match(result.warning, /another revision/);
});

test('changed branch commit prevents a new PR and mismatched existing PR is never declared merged', async () => {
  const m = mock(); m.wrongRef = true;
  const service = new GitHubReviewService('.', m.runner);
  const result = await service.ensure(context);
  assert.equal(result.status, 'unknown'); assert.match(result.warning, /no longer matches/);
  assert.equal(m.calls.filter(call => call.method === 'POST').length, 0);
  m.pr = raw(context, { merged_at: '2026-10-26T01:00:00Z' }); m.pr.base.ref = 'other-base';
  const mismatch = await service.check(context);
  assert.equal(mismatch.status, 'unknown'); assert.equal(mismatch.identityVerified, false);
  assert.match(mismatch.warning, /does not confirm/);
});

test('reviews distinguish changes requested, approved, closed and merged; merged checks do not require the deleted branch', async () => {
  const m = mock(); m.pr = raw(); const service = new GitHubReviewService('.', m.runner);
  m.reviews = [{ id: 1, state: 'APPROVED', commit_id: context.commit, user: { login: 'reviewer' } }, { id: 2, state: 'CHANGES_REQUESTED', user: { login: 'other' } }];
  assert.equal((await service.check(context)).status, 'changes_requested');
  m.reviews.push({ id: 3, state: 'DISMISSED', user: { login: 'other' } });
  assert.equal((await service.check(context)).status, 'approved');
  m.pr.state = 'closed';
  assert.equal((await service.ensure(context)).status, 'closed');
  m.pr.merged_at = '2026-10-26T01:00:00Z'; m.wrongRef = true;
  assert.equal((await service.check(context, { supported: true, status: 'approved', number: 7 })).status, 'merged');
  assert.equal(m.calls.filter(call => call.method === 'POST').length, 0);
  assert.equal(m.calls.filter(call => call.endpoint.includes('/git/ref/')).length, 0);
});

test('read errors preserve known status and last successful check instead of reporting a new pass', async () => {
  const m = mock(); m.failRead = true;
  const prior = { supported: true, status: 'approved', number: 7, checkedAt: '2026-10-25T00:00:00Z' };
  const result = await new GitHubReviewService('.', m.runner).check(context, prior);
  assert.equal(result.status, 'approved'); assert.equal(result.checkedAt, prior.checkedAt);
  assert.match(result.error, /rate-limited/); assert.ok(result.lastAttemptAt);
});

test('review request failure is partial, selection is freshly checked, and confirmed requests are not duplicated', async () => {
  const m = mock(); const service = new GitHubReviewService('.', m.runner);
  const pr = await service.ensure(context); m.failReview = true;
  const failed = await service.requestReviewer(context, pr, 'eligible');
  assert.equal(failed.number, 7); assert.equal(failed.status, 'awaiting_review'); assert.match(failed.reviewRequestError, /review request failed/);
  const forbidden = await service.requestReviewer(context, pr, 'author');
  assert.match(forbidden.reviewRequestError, /not an eligible/);
  m.failReview = false;
  const success = await service.requestReviewer(context, failed, 'eligible');
  const writes = m.calls.filter(call => call.endpoint.endsWith('/requested_reviewers') && call.method === 'POST').length;
  await service.requestReviewer(context, success, 'eligible');
  assert.equal(m.calls.filter(call => call.endpoint.endsWith('/requested_reviewers') && call.method === 'POST').length, writes);
});

test('an ambiguous reviewer request reconciles completed current-commit review or blocks another notification', async () => {
  const m = mock(); const original = m.runner;
  const runner = async request => {
    if (request.method === 'POST' && request.endpoint.endsWith('/requested_reviewers')) { m.calls.push(structuredClone(request)); throw new Error('network timeout'); }
    return original(request);
  };
  const service = new GitHubReviewService('.', runner);
  const pr = await service.ensure(context);
  const first = await service.requestReviewer(context, pr, 'eligible');
  assert.equal(first.reviewRequestUncertain, true);
  const second = await service.requestReviewer(context, first, 'eligible');
  assert.match(second.reviewRequestError, /still uncertain/);
  assert.equal(m.calls.filter(call => call.endpoint.endsWith('/requested_reviewers') && call.method === 'POST').length, 1);
  m.reviews = [{ id: 1, state: 'APPROVED', commit_id: context.commit, user: { login: 'eligible' } }];
  const reconciled = await service.requestReviewer(context, second, 'eligible');
  assert.equal(reconciled.reviewerRequested, true); assert.equal(reconciled.reviewRequestUncertain, false);
  m.failRead = true;
  const kept = await service.requestReviewer(context, reconciled, 'eligible');
  assert.equal(kept.reviewerRequested, true);
  assert.equal(m.calls.filter(call => call.endpoint.endsWith('/requested_reviewers') && call.method === 'POST').length, 1);
});

function fixture(t, names = ['fixture-skill']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skilljetty-pr-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const control = path.join(root, '.skill-workbench'); fs.mkdirSync(control);
  fs.writeFileSync(path.join(control, 'connection.json'), JSON.stringify({ format: 1, repository: context.repository, baseBranch: 'main' }));
  const releases = names.map((name, index) => {
    const source = path.join(root, `input-${name}`); fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'SKILL.md'), `---\nname: ${name}\ndescription: Review fixture data. Use when asked to review fixture data.\n---\n\n# Fixture\nRetain the supplied evidence.\n`);
    const skill = core.registerSkillFolder(root, source);
    const release = core.prepareSkillRelease(root, skill.id, '1.0.0', 'Imported notes must not become @mentions or Fixes #123 in PR bodies.');
    const c = { ...context, skillName: name, branch: `skills/${name}/1.0.0`, commit: (index ? 'b' : 'a').repeat(40) };
    library.recordLibraryPublication(root, release.directory, { repository: c.repository, branch: c.branch, commit: c.commit, baseBranch: 'main' });
    return { skill, release, context: c };
  });
  return { root, releases };
}
function tree(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? tree(file) : [[file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]];
  });
}

test('review sidecars leave immutable release bytes unchanged and never act on a foreign directory/repository', async t => {
  const f = fixture(t); const { release, context: c } = f.releases[0];
  const before = tree(release.directory); const m = mock(c);
  const result = await workspace.reviewLibraryRelease(f.root, release.directory, 'create', undefined, m.runner);
  assert.equal(result.pr.number, 7); assert.deepEqual(tree(release.directory), before);
  assert.equal(library.listLibraryReleases(f.root)[0].pr.number, 7);
  assert.equal(core.listWorkbenchSkills(f.root).length, 0, 'cleanup follows a persisted PR receipt and preserves a recoverable archive');
  const writes = m.calls.length;
  await assert.rejects(workspace.reviewLibraryRelease(f.root, path.join(f.root, '..', 'foreign'), 'create', undefined, m.runner), /no verified upload/);
  assert.equal(m.calls.length, writes);
});

test('a newly confirmed PR survives a partial reviews-read error after an older uploaded-only sidecar', async t => {
  const f = fixture(t); const { release, context: c } = f.releases[0];
  library.recordLibraryReview(f.root, release.directory, { supported: true, status: 'uploaded', checkedAt: '2026-10-25T00:00:00Z' });
  const m = mock(c); const original = m.runner;
  const runner = request => request.endpoint.includes('/reviews?') ? Promise.reject(new Error('GitHub API HTTP 403')) : original(request);
  const result = await workspace.reviewLibraryRelease(f.root, release.directory, 'create', undefined, runner);
  assert.equal(result.pr.number, 7); assert.equal(result.pr.identityVerified, true);
  assert.equal(result.pr.status, 'awaiting_review'); assert.match(result.pr.error, /permissions/);
  assert.equal(library.listLibraryReleases(f.root)[0].pr.number, 7);
  await workspace.reviewLibraryRelease(f.root, release.directory, 'create', undefined, runner);
  assert.equal(m.calls.filter(call => call.method === 'POST' && call.endpoint.endsWith('/pulls')).length, 1);
});

test('Check PRs discovers two historical uploads read-only and keeps the dashboard open for individual checks', async t => {
  const f = fixture(t, ['fixture-skill', 'second-skill']);
  const first = mock(f.releases[0].context); first.pr = raw(f.releases[0].context, { state: 'closed', merged_at: '2026-10-26T01:00:00Z' });
  const second = mock(f.releases[1].context);
  const runner = request => request.endpoint.includes(encodeURIComponent('skills/second-skill/1.0.0')) ? second.runner(request) : first.runner(request);
  const controller = new GuidedWorkbenchController(f.root, { github: runner });
  await controller.dispatch({ action: 'checkPullRequests' });
  assert.equal(controller.state.form.mode, 'reviews'); assert.equal(controller.state.reviewQueue.length, 2);
  assert.equal(controller.state.reviewQueue.find(item => item.skillName === 'fixture-skill').pr.status, 'merged');
  assert.equal(controller.state.reviewQueue.find(item => item.skillName === 'second-skill').pr.status, 'uploaded');
  assert([...first.calls, ...second.calls].every(call => call.method === 'GET'));
  await controller.dispatch({ action: 'checkPullRequest', payload: { directory: f.releases[0].release.directory } });
  assert.equal(controller.state.form.mode, 'reviews');
  await controller.dispatch({ action: 'requestReviewer', payload: { directory: f.releases[0].release.directory, reviewer: 'eligible' } });
  assert.match(controller.state.error, /explicitly confirm/);
});

test('old publication receipts need no PR fields; cancellation and wrong-account preflight do not upload or change a draft', async t => {
  const f = fixture(t); const before = tree(f.releases[0].skill.sourcePath); const m = mock(); m.permissions = false;
  assert.equal(library.listLibraryReleases(f.root)[0].pr, undefined);
  const controller = new GuidedWorkbenchController(f.root, { github: m.runner, connectGitHub: async () => undefined });
  await controller.dispatch({ action: 'ready' });
  assert.equal(m.calls.length, 0, 'opening the workbench must not request a session or query GitHub');
  await controller.dispatch({ action: 'connectGitHub' });
  assert.match(controller.state.error, /cancelled/); assert.deepEqual(tree(f.releases[0].skill.sourcePath), before);
  const { skill } = f.releases[0];
  await controller.dispatch({ action: 'resume', payload: { id: skill.id } });
  await controller.dispatch({ action: 'preparePublish' });
  await controller.dispatch({ action: 'publish', payload: { version: '2.0.0', changelog: 'Next version.' } });
  assert.match(controller.state.error, /before uploading/);
  assert.deepEqual(tree(skill.sourcePath), before);
  assert.equal(m.calls.filter(call => call.method === 'POST').length, 0);
  assert.equal(core.listSkillReleases(f.root, skill.id).length, 1);
});
