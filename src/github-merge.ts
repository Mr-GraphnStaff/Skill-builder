import { githubRepository, githubError, pullRequestUrl, type GitHubRunner, type ReviewContext } from './github-review.js';
import type { PullRequestRecord } from './guided-contract.js';

export type PullRequestMergeResult = PullRequestRecord & { mergeCommit?: string; branchDeleted?: boolean; mergeError?: string; branchDeleteError?: string };
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40,64}$/i.test(value);
function branch(value: unknown): value is string {
  return typeof value === 'string' && !!value && !/[\x00-\x20~^:?*\[\\]/.test(value) && !value.startsWith('-') && !value.includes('..') && !value.includes('@{')
    && !value.endsWith('.') && value.split('/').every(part => !!part && !part.startsWith('.') && !part.endsWith('.lock'));
}
function missing(error: unknown): boolean { const e = error as { status?: number; statusCode?: number; message?: string; stderr?: string }; return e?.status === 404 || e?.statusCode === 404 || /\b(?:HTTP\s*)?404\b/.test(`${e?.message ?? ''} ${e?.stderr ?? ''}`); }
const isMerged = (raw: any) => raw?.merged === true || (typeof raw?.merged_at === 'string' && Number.isFinite(Date.parse(raw.merged_at)));

/** Explicit user action only. Cleanup must use an injected atomic Git lease. */
export async function mergeVerifiedPullRequest(context: ReviewContext, pr: PullRequestRecord, runner: GitHubRunner, deleteBranch?: (context: ReviewContext) => Promise<void>): Promise<PullRequestMergeResult> {
  const result: PullRequestMergeResult = { ...pr, mergeCommit: undefined, branchDeleted: undefined, mergeError: undefined, branchDeleteError: undefined };
  const repo = githubRepository(context.repository);
  if (!repo || !pr.supported || !Number.isSafeInteger(pr.number) || pr.number! <= 0 || !sha(context.commit) || !branch(context.branch) || !branch(context.baseBranch) || context.branch === context.baseBranch
      || (pr.base !== undefined && pr.base !== context.baseBranch) || (pr.head !== undefined && pr.head !== context.branch) || (pr.headCommit !== undefined && pr.headCommit !== context.commit)) {
    return { ...result, mergeError: 'The saved PR and upload identity are incomplete or different. Check the exact uploaded version before merging.' };
  }
  const root = `repos/${repo.fullName}`, endpoint = `${root}/pulls/${pr.number}`;
  const refEndpoint = `${root}/git/ref/heads/${encodeURIComponent(context.branch)}`;
  const identity = (raw: any) => raw?.number === pr.number && raw.base?.repo?.full_name?.toLowerCase() === repo.fullName.toLowerCase()
    && raw.head?.repo?.full_name?.toLowerCase() === repo.fullName.toLowerCase() && raw.base?.ref === context.baseBranch && raw.head?.ref === context.branch && raw.head?.sha === context.commit;
  const get = (endpoint: string) => runner({ method: 'GET', endpoint }) as Promise<any>;
  const repositoryIdentity = (raw: any) => raw?.full_name?.toLowerCase() === repo.fullName.toLowerCase() && branch(raw.default_branch) && raw.permissions?.push === true;
  let current: any;
  try {
    const metadata = await get(root);
    if (!repositoryIdentity(metadata) || metadata.allow_merge_commit === false) return { ...result, mergeError: 'The exact GitHub repository, push permission or merge-commit method could not be confirmed.' };
    current = await get(endpoint);
    if (!identity(current)) return { ...result, status: 'unknown', identityVerified: false, branchDeleted: undefined, mergeCommit: undefined, mergeError: 'The current PR repository, base, head or commit differs from the recorded upload. No merge or branch deletion was attempted.' };
    result.identityVerified = true; result.url = pullRequestUrl(context.repository, pr.number!);
    result.base = context.baseBranch; result.head = context.branch; result.headCommit = context.commit;
    if (!isMerged(current)) {
      if (current.state !== 'open' || current.draft === true || current.mergeable !== true || current.mergeable_state !== 'clean') return { ...result, mergeError: 'This exact PR is not an open, mergeable PR with clean checks and satisfied merge rules. Check GitHub before trying again.' };
      const base = await get(`${root}/branches/${encodeURIComponent(context.baseBranch)}`);
      if (base?.name !== context.baseBranch || typeof base.protected !== 'boolean') return { ...result, mergeError: 'The target branch and its protection state could not be confirmed.' };
      if (base.protected) {
        const protection = await get(`${root}/branches/${encodeURIComponent(context.baseBranch)}/protection`);
        if (!protection || typeof protection !== 'object' || Array.isArray(protection)) return { ...result, mergeError: 'Target branch protection could not be inspected. No merge was attempted.' };
      }
      const status = await get(`${root}/commits/${context.commit}/status?per_page=100`);
      const checks = await get(`${root}/commits/${context.commit}/check-runs?per_page=100`);
      if (status?.sha !== context.commit || !Array.isArray(status.statuses) || !Number.isSafeInteger(status.total_count) || status.total_count !== status.statuses.length || status.total_count > 100
          || (status.total_count > 0 && (status.state !== 'success' || status.statuses.some((row: any) => row.state !== 'success')))
          || !Array.isArray(checks?.check_runs) || !Number.isSafeInteger(checks.total_count) || checks.total_count !== checks.check_runs.length || checks.total_count > 100
          || checks.check_runs.some((row: any) => row.head_sha !== context.commit || row.status !== 'completed' || !['success', 'neutral', 'skipped'].includes(row.conclusion))) {
        return { ...result, mergeError: 'Commit status checks are incomplete, pending or unsuccessful. No merge was attempted.' };
      }
      const ref = await get(refEndpoint);
      if (ref?.ref !== `refs/heads/${context.branch}` || ref.object?.sha !== context.commit) return { ...result, mergeError: 'The upload branch advanced or changed identity. Preserve it and check the current upload before merging.' };
      let writeError: unknown; let responseCommit: string | undefined;
      try {
        const merged = await runner({ method: 'PUT', endpoint: `${endpoint}/merge`, body: { sha: context.commit, merge_method: 'merge' } }) as any;
        if (merged?.merged !== true || !sha(merged.sha)) writeError = new Error('GitHub did not confirm the merge response');
        else responseCommit = merged.sha;
      } catch (error) { writeError = error; }
      // Reconcile even ambiguous writes by GET; never repeat PUT in this call.
      try { current = await get(endpoint); }
      catch (error) { return { ...result, mergeError: `The merge outcome is unconfirmed. Check this PR before retrying. ${githubError(writeError ?? error)}` }; }
      if (!identity(current) || !isMerged(current) || !sha(current.merge_commit_sha) || (responseCommit !== undefined && responseCommit !== current.merge_commit_sha)) return { ...result, mergeError: `The merge was not confirmed for this exact uploaded commit. The branch was retained. ${githubError(writeError)}` };
    }
    if (!identity(current) || !isMerged(current) || !sha(current.merge_commit_sha)) return { ...result, mergeError: 'The merged PR identity or merge commit could not be confirmed. The branch was retained.' };
    result.status = 'merged'; result.mergeCommit = current.merge_commit_sha; result.checkedAt = new Date().toISOString(); result.error = undefined;
  } catch (error) { return { ...result, mergeError: `The merge could not be verified or completed. ${githubError(error)}` }; }

  try {
    // Protection/default branch are refreshed after confirmed merge, before cleanup.
    const metadata = await get(root);
    if (!repositoryIdentity(metadata) || context.branch === metadata.default_branch || context.branch === context.baseBranch) return { ...result, branchDeleteError: 'Merged. The branch was preserved because it is the default/base branch or repository permissions changed.' };
    let branchMetadata: any;
    try { branchMetadata = await get(`${root}/branches/${encodeURIComponent(context.branch)}`); }
    catch (error) { if (!missing(error)) throw error; }
    let ref: any;
    try { ref = await get(refEndpoint); }
    catch (error) { if (missing(error)) return { ...result, branchDeleted: true }; throw error; }
    if (branchMetadata?.name !== context.branch || branchMetadata?.protected !== false || branchMetadata.commit?.sha !== context.commit
        || ref?.ref !== `refs/heads/${context.branch}` || ref.object?.sha !== context.commit) return { ...result, branchDeleteError: 'Merged. The branch changed, is protected, or its identity could not be confirmed; it was preserved.' };
    if (!deleteBranch) return { ...result, branchDeleteError: 'Merged. Atomic branch cleanup is unavailable; the upload branch was retained.' };
    let deletionError: unknown;
    try { await deleteBranch(context); }
    catch (error) { deletionError = error; }
    // A successful response and an ambiguous response both require a readback.
    try { await get(refEndpoint); }
    catch (error) { if (missing(error)) return { ...result, branchDeleted: true }; return { ...result, branchDeleteError: `Merged. Branch deletion could not be confirmed. ${githubError(deletionError ?? error)}` }; }
    return { ...result, branchDeleteError: `Merged. The branch still exists and was not deleted again. ${deletionError ? githubError(deletionError) : 'Refresh its current state before retrying cleanup.'}` };
  } catch (error) { return { ...result, branchDeleteError: `Merged. The branch was retained because safe cleanup could not be verified. ${githubError(error)}` }; }
}
