const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createWorkbench } = require('../out/workbench-setup.js');
const core = require('../out/skill-workbench.js');
const library = require('../out/workbench-library.js');
const guided = require('../out/guided-workspace.js');
const publisher = require('../out/repository-publisher.js');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const { GitHubReviewService } = require('../out/github-review.js');
const scratch = require('./working-fixture.cjs').workingFixture('merged-upload-reuse'); fs.mkdirSync(scratch, { recursive: true });
const repository = 'https://github.com/example/skills', commit = 'a'.repeat(40), branch = 'skills/notes/1.0.0';
const savedPR = { supported: true, status: 'merged', number: 17, identityVerified: true, head: branch, base: 'main', headCommit: commit, checkedAt: '2026-01-01T00:00:00Z' };
function raw(extra = {}) {
  return { number: 17, state: 'closed', merged: true, merged_at: '2026-11-03T12:00:00Z',
    base: { ref: 'main', repo: { full_name: 'example/skills' } },
    head: { ref: branch, sha: commit, repo: { full_name: 'example/skills' } }, ...extra };
}
function fixture(t) {
  const root = createWorkbench(fs.mkdtempSync(path.join(scratch, 'case-'))); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, '.skill-workbench/connection.json'), JSON.stringify({ format: 1, repository, baseBranch: 'main' }));
  const source = path.join(root, 'scratch/source'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: notes\ndescription: Summarize notes when requested.\n---\n# Notes\nPreserve notes.\n');
  const skill = core.registerSkillFolder(root, source), release = core.prepareSkillRelease(root, skill.id, '1.0.0', 'Initial.');
  library.recordLibraryPublication(root, release.directory, { repository, branch, commit, baseBranch: 'main' });
  library.recordLibraryReview(root, release.directory, savedPR);
  return { root, skill, release, publicationPath: path.join(root, '.skill-workbench/publications/notes/1.0.0.json'), reviewPath: path.join(root, '.skill-workbench/pull-requests/notes/1.0.0.json') };
}
test('merged exact live PR reuses deleted or replaced upload branch, never cached status', async t => {
  const original = publisher.verifyRepositoryBranchCommit; publisher.verifyRepositoryBranchCommit = async () => false;
  const prepare = publisher.prepareRepositoryPublish; let uploads = 0;
  publisher.prepareRepositoryPublish = async () => { uploads++; throw new Error('Must not upload an existing receipt again.'); };
  t.after(() => { publisher.verifyRepositoryBranchCommit = original; publisher.prepareRepositoryPublish = prepare; });
  for (const scenario of ['deleted', 'reused', 'closed', 'open', 'wrong-sha', 'wrong-head', 'wrong-base', 'wrong-repository', 'fork', 'unavailable', 'base-changed', 'receipt-changed', 'settings-changed']) {
    await t.test(scenario, async t => {
      const f = fixture(t), before = fs.readFileSync(f.publicationPath), reviewBefore = fs.readFileSync(f.reviewPath); let gets = 0, guardCalls = 0;
      const runner = async request => {
        assert.equal(request.method, 'GET'); gets++;
        if (request.endpoint.endsWith('/reviews')) return [];
        assert.equal(request.endpoint, 'repos/example/skills/pulls/17');
        if (scenario === 'unavailable') throw new Error('GitHub API HTTP 403');
        if (scenario === 'receipt-changed') { const changed = JSON.parse(before); changed.commit = 'b'.repeat(40); fs.writeFileSync(f.publicationPath, JSON.stringify(changed)); }
        if (scenario === 'settings-changed') guardCalls = -100;
        const value = raw();
        if (scenario === 'closed' || scenario === 'open') { value.merged = false; value.merged_at = null; value.state = scenario === 'open' ? 'open' : 'closed'; }
        if (scenario === 'wrong-sha') value.head.sha = 'c'.repeat(40);
        if (scenario === 'wrong-head') value.head.ref = 'skills/notes/2.0.0';
        if (scenario === 'wrong-base') value.base.ref = 'other';
        if (scenario === 'wrong-repository') value.base.repo.full_name = 'another/skills';
        if (scenario === 'fork') value.head.repo.full_name = 'fork/skills';
        return value;
      };
      const operation = () => guided.publishPreparedGuidedRelease(f.root, f.release.directory,
        { repository, baseBranch: scenario === 'base-changed' ? 'new-main' : 'main' }, undefined,
        () => { if (guardCalls < 0) throw new Error('Settings changed during check.'); guardCalls++; }, runner);
      if (scenario === 'deleted' || scenario === 'reused') {
        const result = await operation(); assert.equal(result.publication.commit, commit); assert.equal(gets, 1);
        const saved = library.listLibraryReleases(f.root)[0].pr;
        assert.equal(saved.status, 'merged'); assert.equal(saved.identityVerified, true); assert.notEqual(saved.checkedAt, savedPR.checkedAt);
      } else {
        await assert.rejects(operation(), /recorded upload|changed|does not match/i);
        assert(fs.readFileSync(f.reviewPath).equals(reviewBefore), 'failed checks preserve the saved historical PR');
        if (scenario === 'base-changed') assert.equal(gets, 0);
      }
      if (scenario !== 'receipt-changed') assert(fs.readFileSync(f.publicationPath).equals(before));
      assert.equal(core.listWorkbenchSkills(f.root).length, 1);
    });
  }
  assert.equal(uploads, 0);
});

test('Both retry keeps merged portable receipt and attempts the remaining plugin exactly once', async t => {
  const f = fixture(t), original = { verify: publisher.verifyRepositoryBranchCommit, publish: guided.publishPreparedGuidedRelease,
    review: guided.reviewLibraryRelease, preflight: GitHubReviewService.prototype.preflight };
  const attempts = [], runnerCalls = []; let apiAvailable = false;
  const runner = async request => {
    assert.equal(request.method, 'GET'); runnerCalls.push(request.endpoint);
    if (!apiAvailable) throw new Error('GitHub API HTTP 403');
    if (request.endpoint.includes('/pulls?')) return [raw()];
    assert.equal(request.endpoint, 'repos/example/skills/pulls/17'); return raw();
  };
  publisher.verifyRepositoryBranchCommit = async () => false;
  GitHubReviewService.prototype.preflight = async () => undefined;
  guided.publishPreparedGuidedRelease = async (...args) => {
    const release = require('../out/plugin-release.js').verifyExportRelease(args[1]); attempts.push(release.manifest.kind === 'plugin' ? 'plugin' : 'portable');
    if (release.manifest.kind !== 'plugin') return original.publish(...args);
    args[4]?.();
    const publication = { repository, branch: 'plugins/notes-bundle/1.0.2', commit: 'd'.repeat(40) };
    library.recordLibraryPublication(f.root, release.directory, { ...publication, baseBranch: 'main' });
    return { release, publication };
  };
  guided.reviewLibraryRelease = async (...args) => {
    if (args[1] === f.release.directory) return original.review(...args);
    return { pr: { supported: true, status: 'awaiting_review', number: 18, identityVerified: true } };
  };
  t.after(() => { publisher.verifyRepositoryBranchCommit = original.verify; guided.publishPreparedGuidedRelease = original.publish;
    guided.reviewLibraryRelease = original.review; GitHubReviewService.prototype.preflight = original.preflight; });
  const payload = { exportMode: 'both', pluginName: 'notes-bundle', pluginVersion: '1.0.2', pluginMembers: [f.skill.id], geminiZip: false, version: '1.0.0', changelog: 'Initial.' };
  async function reviewedController() {
    const controller = new GuidedWorkbenchController(f.root, { github: runner, getRepositorySettings: () => ({ repositoryUrl: repository, localRepositoryPath: '' }) });
    controller.resolveRepositoryConnection = async () => ({ repository, baseBranch: 'main' });
    await controller.dispatch({ action: 'resume', payload: { id: f.skill.id } }); assert.equal(controller.state.error, undefined);
    await controller.dispatch({ action: 'preparePublish' }); assert.equal(controller.state.error, undefined);
    await controller.dispatch({ action: 'updateExportOptions', payload }); assert.equal(controller.state.error, undefined);
    return controller;
  }
  let controller = await reviewedController();
  await controller.dispatch({ action: 'publish', payload }); assert.match(controller.state.error, /need attention/);
  assert.deepEqual(attempts, ['portable']); assert.equal(controller.state.receipt.pr.number, 17);
  assert.equal(controller.state.receipt.pr.checkedAt, savedPR.checkedAt, 'failed live check retains historical check time rather than claiming freshness');
  assert.match(controller.state.receipt.artifacts[0].reviewUrl, /pull\/17$/);
  assert.equal(controller.state.receipt.artifacts[0].status, 'uploaded');
  assert.equal(controller.state.receipt.artifacts[1].status, 'prepared');
  attempts.length = 0; apiAvailable = true;
  controller = await reviewedController();
  await controller.dispatch({ action: 'publish', payload }); assert.equal(controller.state.error, undefined, JSON.stringify(controller.state.receipt));
  assert.deepEqual(attempts, ['portable', 'plugin']);
  assert.deepEqual(controller.state.receipt.artifacts.map(item => item.status), ['uploaded', 'uploaded']);
  assert.equal(controller.state.receipt.pr.number, 17); assert.equal(controller.state.receipt.pr.status, 'merged');
  assert.match(controller.state.receipt.artifacts[0].reviewUrl, /pull\/17$/); assert(runnerCalls.length >= 2);
});
