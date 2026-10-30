const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GitHubReviewService } = require('../out/github-review.js');
const { reviewLibraryRelease } = require('../out/guided-workspace.js');
const core = require('../out/skill-workbench.js');
const library = require('../out/workbench-library.js');
const { renderGuidedWorkbench } = require('../out/guided-workbench-html.js');

const context = { repository: 'https://github.com/history-owner/history-repository.git', baseBranch: 'main', branch: 'skills/history-skill/1.0.0', commit: 'a'.repeat(40), skillName: 'history-skill', version: '1.0.0' };
const fullName = 'history-owner/history-repository';
function raw(number, options = {}) {
  const commit = options.commit ?? context.commit;
  return { number, state: options.state ?? 'open', merged_at: options.merged ? '2026-10-29T12:00:00Z' : null,
    user: { login: 'author' }, requested_reviewers: [],
    base: { ref: options.base ?? context.baseBranch, repo: { full_name: options.baseRepo ?? fullName } },
    head: { ref: options.branch ?? context.branch, sha: commit, repo: { full_name: options.headRepo ?? fullName } } };
}
function historical(number = 9, options = {}) { return raw(number, { state: 'closed', merged: true, commit: 'b'.repeat(40), ...options }); }
function previous(number = 9) { return { supported: true, status: 'unknown', number, head: context.branch, base: context.baseBranch, headCommit: 'b'.repeat(40), identityVerified: false }; }
function mock(initial = []) {
  const state = { prs: new Map(initial.map(pr => [pr.number, structuredClone(pr)])), calls: [], createBehavior: 'ok', branchCommit: context.commit,
    pageRows: undefined, detailOverrides: new Map() };
  state.runner = async request => {
    state.calls.push(structuredClone(request));
    const endpoint = request.endpoint;
    if (request.method === 'GET') {
      if (endpoint === `repos/${fullName}`) return { full_name: fullName, permissions: { push: true } };
      if (endpoint.includes('/git/ref/heads/')) {
        if (state.branchCommit === undefined) throw new Error('GitHub API HTTP 404');
        return { ref: `refs/heads/${context.branch}`, object: { sha: state.branchCommit } };
      }
      if (endpoint.includes('/pulls?')) {
        const query = new URL(`https://api.github.com/${endpoint}`).searchParams;
        const page = Number(query.get('page') ?? 1);
        const all = state.pageRows ? state.pageRows.flat() : [...state.prs.values()];
        const filtered = all.filter(pr => query.get('state') === 'open' ? pr.state === 'open' : query.get('state') === 'closed' ? pr.state === 'closed' : true);
        const size = Number(query.get('per_page') ?? 100);
        return structuredClone(filtered.slice((page - 1) * size, page * size));
      }
      if (/\/pulls\/\d+\/reviews\?/.test(endpoint)) return [];
      const number = /\/pulls\/(\d+)$/.exec(endpoint)?.[1];
      if (number) {
        const pr = state.detailOverrides.get(Number(number)) ?? state.prs.get(Number(number));
        if (!pr) throw new Error('GitHub API HTTP 404');
        return structuredClone(pr);
      }
    }
    if (request.method === 'POST' && endpoint === `repos/${fullName}/pulls`) {
      assert.equal(request.body.head, context.branch); assert.equal(request.body.base, context.baseBranch);
      if (state.createBehavior === 'timeoutWithoutResult') throw new Error('network timeout');
      if (state.createBehavior === 'malformed') return { acceptedButIncomplete: true };
      const created = raw(10); state.prs.set(10, created);
      if (state.createBehavior === 'timeoutAfterCreate') throw new Error('network timeout');
      return structuredClone(created);
    }
    throw new Error(`Unexpected mock request: ${request.method} ${endpoint}`);
  };
  return state;
}
const writes = state => state.calls.filter(call => call.method === 'POST');

test('new upload on a reused branch creates a new PR instead of reusing its old merged PR', async () => {
  for (const recorded of [undefined, previous()]) {
    const m = mock([historical()]); const result = await new GitHubReviewService('.', m.runner).ensure(context, recorded);
    assert.equal(result.number, 10); assert.equal(result.identityVerified, true); assert.equal(result.status, 'awaiting_review');
    assert.equal(writes(m).length, 1); assert.equal(writes(m)[0].endpoint, `repos/${fullName}/pulls`);
  }
});

test('matching open PR takes precedence over old terminal history in either list order', async () => {
  for (const rows of [[historical(), raw(10)], [raw(10), historical()]]) {
    const m = mock(rows); const result = await new GitHubReviewService('.', m.runner).ensure(context, previous());
    assert.equal(result.number, 10); assert.equal(result.identityVerified, true); assert.equal(writes(m).length, 0);
  }
});

test('an exact but closed recorded PR does not hide a newer current open PR', async () => {
  const m = mock([raw(9, { state: 'closed' }), raw(10)]);
  const recorded = { ...previous(), status: 'closed', identityVerified: true, headCommit: context.commit };
  const service = new GitHubReviewService('.', m.runner);
  const found = await service.ensure(context, recorded);
  assert.equal(found.number, 10); assert.equal(found.status, 'awaiting_review'); assert.equal(found.identityVerified, true);
  const checked = await service.check(context, recorded);
  assert.equal(checked.number, 9); assert.equal(checked.status, 'closed'); assert.equal(writes(m).length, 0);
});

test('current open PR is discovered after a full page of older terminal PRs', async () => {
  const older = Array.from({ length: 100 }, (_, index) => historical(index + 100));
  const current = raw(10); const m = mock([...older, current]); m.pageRows = [older, [current]];
  const result = await new GitHubReviewService('.', m.runner).ensure(context);
  assert.equal(result.number, 10); assert.equal(writes(m).length, 0);
  assert(m.calls.some(call => call.endpoint.includes('page=2')) || m.calls.some(call => call.endpoint.includes('state=open')),
    'find the current PR through pagination or an open-only query');
});

test('checking a recorded historical number never retargets it to another PR or writes', async () => {
  const m = mock([historical(), raw(10)]);
  const result = await new GitHubReviewService('.', m.runner).check(context, previous());
  assert.equal(result.number, 9); assert.equal(result.status, 'unknown'); assert.equal(result.identityVerified, false);
  assert(m.calls.some(call => call.endpoint === `repos/${fullName}/pulls/9`)); assert.equal(writes(m).length, 0);
});

test('an exact historical PR remains valid for an unchanged upload even if its branch was deleted', async () => {
  for (const merged of [false, true]) {
    const m = mock([raw(9, { state: 'closed', merged })]); m.branchCommit = undefined;
    const result = await new GitHubReviewService('.', m.runner).ensure(context);
    assert.equal(result.number, 9); assert.equal(result.identityVerified, true); assert.equal(result.status, merged ? 'merged' : 'closed');
    assert.equal(writes(m).length, 0);
  }
});

test('several mismatched terminal PRs do not prevent creating one current PR', async () => {
  const m = mock([historical(7), historical(8, { merged: false }), historical(9)]);
  const result = await new GitHubReviewService('.', m.runner).ensure(context);
  assert.equal(result.number, 10); assert.equal(result.identityVerified, true); assert.equal(writes(m).length, 1);
});

test('ambiguous open PRs and mismatched active identities block creation', async () => {
  for (const rows of [[raw(8), raw(9)], [raw(9, { base: 'another-base' })], [raw(9, { headRepo: 'another-owner/another-repository' })], [raw(9, { commit: 'c'.repeat(40) })]]) {
    const m = mock(rows); const result = await new GitHubReviewService('.', m.runner).ensure(context);
    assert.notEqual(result.identityVerified, true); assert.equal(writes(m).length, 0);
    assert(result.error || result.warning);
  }
});

test('an uncertain creation with only old history never blindly posts another PR', async () => {
  for (const recorded of [{ supported: true, status: 'uploaded' }, previous()]) {
    const m = mock([historical()]); const service = new GitHubReviewService('.', m.runner);
    const result = await service.ensure(context, { ...recorded, creationUncertain: true });
    assert.equal(result.creationUncertain, true); assert.equal(writes(m).length, 0);
  }
});

test('adopting a current PR does not inherit review notifications from the historical PR', async () => {
  const m = mock([historical(), raw(10)]);
  const stale = { ...previous(), reviewer: 'old-reviewer', reviewerRequested: true, reviewRequestUncertain: true, reviewRequestError: 'Old notification failure' };
  const result = await new GitHubReviewService('.', m.runner).ensure(context, stale);
  assert.equal(result.number, 10); assert.equal(result.identityVerified, true);
  assert.notEqual(result.reviewerRequested, true); assert.notEqual(result.reviewRequestUncertain, true);
  assert.equal(result.reviewRequestError, undefined); assert.equal(writes(m).length, 0);
});

test('ambiguous creation reconciles the current PR without associating old history or posting twice', async () => {
  const m = mock([historical()]); m.createBehavior = 'timeoutAfterCreate';
  const service = new GitHubReviewService('.', m.runner);
  const first = await service.ensure(context);
  assert.equal(first.number, 10); assert.equal(first.identityVerified, true);
  await service.ensure(context, first); assert.equal(writes(m).length, 1);
});

test('unconfirmed and malformed creations remain uncertain despite unrelated historical PRs', async () => {
  for (const mode of ['timeoutWithoutResult', 'malformed']) {
    const m = mock([historical()]); m.createBehavior = mode;
    const service = new GitHubReviewService('.', m.runner);
    const first = await service.ensure(context);
    assert.equal(first.creationUncertain, true); assert.notEqual(first.number, 9);
    await service.ensure(context, first); assert.equal(writes(m).length, 1);
  }
});

test('a changed branch or changed candidate detail is not accepted as the uploaded revision', async () => {
  const moved = mock([historical()]); moved.branchCommit = 'c'.repeat(40);
  const missing = await new GitHubReviewService('.', moved.runner).ensure(context);
  assert.notEqual(missing.identityVerified, true); assert.equal(writes(moved).length, 0);
  const raced = mock([raw(10)]); raced.detailOverrides.set(10, raw(10, { commit: 'c'.repeat(40) }));
  const changed = await new GitHubReviewService('.', raced.runner).ensure(context);
  assert.notEqual(changed.identityVerified, true); assert.equal(writes(raced).length, 0);
});

test('create repair replaces a stale recorded PR number and preserves the prior receipt bytes', async t => {
  const dist = path.resolve(__dirname, '../dist'); fs.mkdirSync(dist, { recursive: true });
  const root = fs.mkdtempSync(path.join(dist, 'pr-history-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(root)), dist); fs.rmSync(root, { recursive: true, force: true }); });
  const source = path.join(root, 'input'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: history-skill\ndescription: Summarize supplied notes when asked.\n---\nKeep the supplied facts.\n');
  const skill = core.registerSkillFolder(root, source);
  const release = core.prepareSkillRelease(root, skill.id, context.version, 'Selected version.');
  fs.writeFileSync(path.join(root, '.skill-workbench/connection.json'), JSON.stringify({ format: 1, repository: context.repository, baseBranch: context.baseBranch }));
  library.recordLibraryPublication(root, release.directory, { repository: context.repository, branch: context.branch, commit: context.commit, baseBranch: context.baseBranch });
  library.recordLibraryReview(root, release.directory, previous());
  const receiptPath = path.join(root, '.skill-workbench/pull-requests/history-skill/1.0.0.json');
  const oldReceipt = fs.readFileSync(receiptPath);
  const m = mock([historical()]);
  const result = await reviewLibraryRelease(root, release.directory, 'create', undefined, m.runner);
  assert.equal(result.pr.number, 10); assert.equal(result.pr.identityVerified, true); assert.equal(result.cleanupError, undefined);
  assert.equal(library.listLibraryReleases(root)[0].pr.number, 10); assert.equal(writes(m).length, 1);
  const savedFiles = fs.readdirSync(path.join(root, '.skill-workbench'), { recursive: true }).map(file => path.join(root, '.skill-workbench', file));
  assert(savedFiles.some(file => file !== receiptPath && fs.statSync(file).isFile() && fs.readFileSync(file).equals(oldReceipt)), 'the exact old receipt remains recoverable');
});

test('a stale numbered PR exposes the repair action without another upload', () => {
  const html = renderGuidedWorkbench({ step: 'done', hasWorkspace: true, repositories: [], drafts: [], library: [], files: [], target: 'portable',
    connection: { repository: context.repository, baseBranch: context.baseBranch },
    receipt: { name: context.skillName, version: context.version, directory: '/fixture/release', note: 'Uploaded; review identity needs repair.', pr: previous() } }, 'prHistoryRegressionNonce123');
  assert.match(html, /data-action="createPullRequest"/);
  assert.match(html, /data-action="checkPullRequest"/);
  const closed = renderGuidedWorkbench({ step: 'done', hasWorkspace: true, repositories: [], drafts: [], library: [], files: [], target: 'portable',
    receipt: { name: context.skillName, version: context.version, directory: '/fixture/release', note: 'Closed recorded submission.', pr: { ...previous(), status: 'closed', identityVerified: true, headCommit: context.commit } } }, 'prHistoryRegressionNonce123');
  assert.match(closed, /data-action="createPullRequest"[^>]*>Find current PR for this upload/);
});

test('explicit create adopts the newer open PR after an exact closed receipt and keeps its old bytes', async t => {
  const dist = path.resolve(__dirname, '../dist'); fs.mkdirSync(dist, { recursive: true });
  const root = fs.mkdtempSync(path.join(dist, 'pr-exact-history-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(root)), dist); fs.rmSync(root, { recursive: true, force: true }); });
  const source = path.join(root, 'input'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: history-skill\ndescription: Summarize supplied notes when asked.\n---\nKeep the supplied facts.\n');
  const skill = core.registerSkillFolder(root, source);
  const release = core.prepareSkillRelease(root, skill.id, context.version, 'Selected version.');
  fs.writeFileSync(path.join(root, '.skill-workbench/connection.json'), JSON.stringify({ format: 1, repository: context.repository, baseBranch: context.baseBranch }));
  library.recordLibraryPublication(root, release.directory, { repository: context.repository, branch: context.branch, commit: context.commit, baseBranch: context.baseBranch });
  const recorded = { ...previous(), status: 'closed', identityVerified: true, headCommit: context.commit, reviewer: 'old-reviewer', reviewerRequested: true };
  library.recordLibraryReview(root, release.directory, recorded);
  const receiptPath = path.join(root, '.skill-workbench/pull-requests/history-skill/1.0.0.json');
  const oldReceipt = fs.readFileSync(receiptPath);
  const m = mock([raw(9, { state: 'closed' }), raw(10)]);
  const result = await reviewLibraryRelease(root, release.directory, 'create', undefined, m.runner);
  assert.equal(result.pr.number, 10); assert.equal(result.pr.identityVerified, true); assert.notEqual(result.pr.reviewerRequested, true);
  assert.equal(library.listLibraryReleases(root)[0].pr.number, 10); assert.equal(writes(m).length, 0);
  const savedFiles = fs.readdirSync(path.join(root, '.skill-workbench'), { recursive: true }).map(file => path.join(root, '.skill-workbench', file));
  assert(savedFiles.some(file => file !== receiptPath && fs.statSync(file).isFile() && fs.readFileSync(file).equals(oldReceipt)));
});

test('merge integration never creates a PR or requests a reviewer even when a reviewer payload is supplied', async t => {
  const dist = path.resolve(__dirname, '../dist'); fs.mkdirSync(dist, { recursive: true });
  const root = fs.mkdtempSync(path.join(dist, 'pr-merge-side-effects-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(root)), dist); fs.rmSync(root, { recursive: true, force: true }); });
  const source = path.join(root, 'input'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: history-skill\ndescription: Summarize supplied notes when asked.\n---\nKeep the supplied facts.\n');
  const skill = core.registerSkillFolder(root, source);
  const release = core.prepareSkillRelease(root, skill.id, context.version, 'Selected version.');
  fs.writeFileSync(path.join(root, '.skill-workbench/connection.json'), JSON.stringify({ format: 1, repository: context.repository, baseBranch: context.baseBranch }));
  library.recordLibraryPublication(root, release.directory, { repository: context.repository, branch: context.branch, commit: context.commit, baseBranch: context.baseBranch });
  const recorded = { ...previous(), number: 10, status: 'awaiting_review', identityVerified: true, headCommit: context.commit };
  library.recordLibraryReview(root, release.directory, recorded);
  const original = Object.fromEntries(['merge', 'ensure', 'check', 'requestReviewer'].map(name => [name, GitHubReviewService.prototype[name]]));
  t.after(() => { Object.assign(GitHubReviewService.prototype, original); });
  let merges = 0;
  GitHubReviewService.prototype.merge = async (actualContext, actualRecord) => {
    merges++; assert.equal(actualContext.commit, context.commit); assert.equal(actualRecord.number, 10);
    return { ...actualRecord, status: 'merged', mergeCommit: 'b'.repeat(40), branchDeleted: true };
  };
  for (const name of ['ensure', 'check', 'requestReviewer']) GitHubReviewService.prototype[name] = async () => { assert.fail(`Merge must not call ${name}`); };
  const result = await reviewLibraryRelease(root, release.directory, 'merge', 'must-not-be-notified', async () => assert.fail('Unexpected network request'));
  assert.equal(merges, 1); assert.equal(result.pr.status, 'merged'); assert.equal(result.pr.branchDeleted, true);
  const persisted = library.listLibraryReleases(root)[0].pr;
  assert.equal(persisted.mergeCommit, 'b'.repeat(40)); assert.equal(persisted.branchDeleted, true);
  assert.notEqual(persisted.reviewer, 'must-not-be-notified');
});
