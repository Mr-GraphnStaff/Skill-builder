import { deleteBranchWithLease } from './github-branch-delete.js';
import { mergeVerifiedPullRequest } from './github-merge.js';
import { runPublisherProcess } from './repository-publisher.js';
import type { PullRequestRecord, ReviewerChoice } from './guided-contract.js';

export type GitHubRequest = { method: 'GET' | 'POST' | 'PUT'; endpoint: string; body?: unknown };
export type GitHubRunner = (request: GitHubRequest) => Promise<unknown>;
export type ReviewContext = { repository: string; baseBranch: string; branch: string; commit: string; skillName: string; version: string };
type Repository = { owner: string; name: string; fullName: string };
const loginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const statuses = new Set(['uploaded', 'awaiting_review', 'changes_requested', 'approved', 'merged', 'closed', 'unknown', 'unsupported']);

/** The only supported review provider. No host or endpoint comes from a webview. */
export function githubRepository(repository: string): Repository | undefined {
  if (typeof repository !== 'string' || /[\s\x00-\x1f]/.test(repository)) return undefined;
  const scp = /^git@github\.com:([^/]+)\/([^/]+)$/i.exec(repository);
  let owner: string; let name: string;
  if (scp) [, owner, name] = scp;
  else {
    let url: URL; try { url = new URL(repository); } catch { return undefined; }
    if (url.hostname.toLowerCase() !== 'github.com' || url.port || url.search || url.hash || url.password
      || !['https:', 'ssh:'].includes(url.protocol) || (url.username && !(url.protocol === 'ssh:' && url.username === 'git'))) return undefined;
    const parts = url.pathname.replace(/\/$/, '').split('/');
    if (parts.length !== 3 || parts[0] !== '') return undefined;
    [, owner, name] = parts;
  }
  name = name.replace(/\.git$/i, '');
  if (!loginPattern.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(name) || /^\.+$/.test(name)) return undefined;
  return { owner, name, fullName: `${owner}/${name}` };
}

export function pullRequestUrl(repository: string, number: number): string {
  const repo = githubRepository(repository);
  if (!repo || !Number.isSafeInteger(number) || number <= 0) throw new Error('The pull request identity is invalid.');
  return `https://github.com/${repo.fullName}/pull/${number}`;
}

/** Select known scalar fields only; local JSON never supplies an executable URL. */
export function reviewRecord(value: unknown, repository: string): PullRequestRecord {
  const input = value as PullRequestRecord;
  if (!input || typeof input.supported !== 'boolean' || !statuses.has(input.status)) throw new Error('The saved pull request receipt is invalid.');
  const output: PullRequestRecord = { supported: input.supported, status: input.status };
  for (const key of ['base', 'head', 'headCommit', 'error', 'warning', 'reviewRequestError', 'mergeCommit', 'mergeError', 'branchDeleteError'] as const) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string' || input[key]!.length > 2000 || /\x00/.test(input[key]!)) throw new Error('The saved pull request receipt is invalid.');
      output[key] = input[key];
    }
  }
  for (const key of ['checkedAt', 'lastAttemptAt'] as const) if (input[key] !== undefined) {
    if (typeof input[key] !== 'string' || !Number.isFinite(Date.parse(input[key]!))) throw new Error('The saved review timestamp is invalid.');
    output[key] = input[key];
  }
  if (input.number !== undefined) { output.number = input.number; output.url = pullRequestUrl(repository, input.number); }
  if (input.reviewer !== undefined) { if (!loginPattern.test(input.reviewer)) throw new Error('The saved reviewer is invalid.'); output.reviewer = input.reviewer; }
  for (const key of ['branchDeleted', 'reviewerRequested', 'identityVerified', 'creationUncertain', 'reviewRequestUncertain'] as const) if (typeof input[key] === 'boolean') output[key] = input[key];
  return output;
}

export function githubError(error: unknown): string {
  const failure = error as { message?: string; stderr?: string; code?: string };
  const detail = `${failure?.code ?? ''} ${failure?.message ?? ''} ${failure?.stderr ?? ''}`;
  if (/cancelled|canceled/i.test(detail)) return 'GitHub sign-in was cancelled. Use Connect / switch GitHub when ready; previously uploaded files and PRs are retained.';
  if (/ENOENT|not recognized|not found.*gh/i.test(detail)) return 'GitHub CLI is unavailable. Set up gh using your normal VS Code account, then retry. Uploaded files are retained.';
  if (/429|rate.?limit|secondary rate/i.test(detail)) return 'GitHub rate-limited this check. Wait before retrying; the previous status and uploaded files are retained.';
  if (/401|authentication|not logged|bad credentials/i.test(detail)) return 'GitHub authentication failed. Use Connect / switch GitHub to choose your VS Code account, then retry; uploaded files are retained.';
  if (/403|404|permission|forbidden|not accessible/i.test(detail)) return 'GitHub could not access the required repository or review metadata. Use Connect / switch GitHub and check that account’s repository permissions; uploaded files are retained.';
  if (/timeout|timed out|network|ENOTFOUND|ECONN|fetch failed/i.test(detail)) return 'GitHub did not finish the request. Check your connection and use Check PRs before retrying a write; uploaded files are retained.';
  if (/422/i.test(detail)) return 'GitHub rejected the request. Check the existing PR, branch and reviewer eligibility before retrying; uploaded files are retained.';
  return 'GitHub did not confirm the operation. Use Check PRs and verify account permissions before retrying; uploaded files are retained.';
}

function validateContext(context: ReviewContext): Repository | undefined {
  if (!/^[a-f0-9]{40,64}$/i.test(context.commit) || !context.baseBranch || !context.branch
    || [context.baseBranch, context.branch].some(ref => /[\x00-\x20~^:?*\[\\]/.test(ref) || ref.startsWith('-') || ref.includes('..') || ref.includes('@{'))
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(context.skillName) || !/^[A-Za-z0-9.+-]+$/.test(context.version)) throw new Error('The verified publication identity is incomplete. Reconnect the repository and inspect its upload receipt.');
  return githubRepository(context.repository);
}

export class GitHubReviewService {
  private readonly run: GitHubRunner;
  constructor(private readonly cwd: string, runner?: GitHubRunner, private readonly onProgress?: import('./guided-contract.js').GuidedProgress) {
    this.run = runner ?? (async request => {
      const args = ['api', '--hostname', 'github.com', '--method', request.method, request.endpoint, '--header', 'Accept: application/vnd.github+json'];
      if (request.body !== undefined) args.push('--input', '-');
      const result = await runPublisherProcess('gh', args, { cwd, timeoutMs: 30_000,
        env: { ...process.env, GH_HOST: 'github.com', GH_REPO: undefined, GH_DEBUG: undefined, DEBUG: undefined, GH_PAGER: 'cat', GH_PROMPT_DISABLED: '1' },
        ...(request.body === undefined ? {} : { input: JSON.stringify(request.body) }) });
      return JSON.parse(result.stdout);
    });
  }
  private async pages(endpoint: string): Promise<any[]> {
    const result: any[] = [];
    for (let page = 1; page <= 10; page++) {
      const rows = await this.run({ method: 'GET', endpoint: `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}` });
      if (!Array.isArray(rows)) throw new Error('GitHub returned invalid list metadata.');
      result.push(...rows); if (rows.length < 100) return result;
    }
    throw new Error('GitHub pagination exceeded the bounded metadata limit.');
  }
  async preflight(repository: string): Promise<void> {
    const repo = githubRepository(repository); if (!repo) return;
    try {
      const metadata = await this.run({ method: 'GET', endpoint: `repos/${repo.fullName}` }) as any;
      if (metadata?.full_name?.toLowerCase() !== repo.fullName.toLowerCase() || metadata.permissions?.push !== true) throw new Error('permission: the GitHub session cannot create a PR in this repository');
    } catch (error) { throw new Error(`GitHub PR access was not confirmed before uploading. ${githubError(error)}`); }
  }
  async reviewers(repository: string, author?: string): Promise<ReviewerChoice[]> {
    const repo = githubRepository(repository); if (!repo) throw new Error('Reviewer selection is available for GitHub.com repositories only.');
    const user = await this.run({ method: 'GET', endpoint: 'user' }) as any;
    if (!loginPattern.test(user?.login ?? '')) throw new Error('GitHub did not identify the current account.');
    const excluded = new Set([String(user.login).toLowerCase(), author?.toLowerCase()]);
    const rows = await this.pages(`repos/${repo.fullName}/collaborators?affiliation=all`);
    return rows.filter(row => row?.type === 'User' && loginPattern.test(row.login ?? '') && !excluded.has(row.login.toLowerCase())
      && (row.permissions?.pull === true || row.permissions?.push === true || row.permissions?.admin === true || row.permissions?.maintain === true))
      .map(row => ({ login: row.login, ...(typeof row.name === 'string' ? { name: row.name.slice(0, 200) } : {}) }))
      .filter((row, index, all) => all.findIndex(other => other.login.toLowerCase() === row.login.toLowerCase()) === index)
      .sort((a, b) => a.login.localeCompare(b.login));
  }
  private identity(context: ReviewContext, raw: any, previous?: PullRequestRecord): PullRequestRecord {
    const repo = validateContext(context)!;
    const number = raw?.number;
    if (!Number.isSafeInteger(number) || number <= 0) throw new Error('GitHub returned an invalid pull request number.');
    if (previous?.number && number !== previous.number) throw new Error('GitHub returned a different pull request identity.');
    const output: PullRequestRecord = { ...previous, supported: true, number, url: pullRequestUrl(context.repository, number),
      base: raw.base?.ref, head: raw.head?.ref, headCommit: raw.head?.sha,
      lastAttemptAt: new Date().toISOString(), error: undefined, warning: undefined, creationUncertain: false,
      status: raw.merged_at || raw.merged === true ? 'merged' : raw.state === 'closed' ? 'closed' : 'awaiting_review' };
    const match = raw.base?.repo?.full_name?.toLowerCase() === repo.fullName.toLowerCase()
      && raw.head?.repo?.full_name?.toLowerCase() === repo.fullName.toLowerCase()
      && raw.base?.ref === context.baseBranch && raw.head?.ref === context.branch && raw.head?.sha === context.commit;
    output.identityVerified = match;
    if (!match) { output.status = 'unknown'; output.warning = 'The PR head, base or commit differs from this recorded upload. This does not confirm that this skill version was reviewed or merged.'; }
    return output;
  }
  private async find(context: ReviewContext, previous?: PullRequestRecord): Promise<any | undefined> {
    const repo = validateContext(context)!;
    if (previous?.number) return this.run({ method: 'GET', endpoint: `repos/${repo.fullName}/pulls/${previous.number}` });
    const rows = await this.pages(`repos/${repo.fullName}/pulls?state=all&head=${encodeURIComponent(`${repo.owner}:${context.branch}`)}`);
    if (rows.length > 1) throw new Error('More than one PR uses the recorded upload branch. Inspect GitHub before retrying.');
    if (!rows.length) return undefined;
    if (!Number.isSafeInteger(rows[0]?.number) || rows[0].number <= 0) throw new Error('GitHub returned an invalid pull request number.');
    return this.run({ method: 'GET', endpoint: `repos/${repo.fullName}/pulls/${rows[0].number}` });
  }
  /** A branch name can be reused after a PR is merged. Only its current
   * submission may satisfy Create PR; historical mismatches are not receipts. */
  private async findForCreation(context: ReviewContext, previous?: PullRequestRecord): Promise<any | undefined> {
    const repo = validateContext(context)!;
    const exact = (raw: any) => raw.base?.repo?.full_name?.toLowerCase() === repo.fullName.toLowerCase()
      && raw.head?.repo?.full_name?.toLowerCase() === repo.fullName.toLowerCase()
      && raw.base?.ref === context.baseBranch && raw.head?.ref === context.branch && raw.head?.sha === context.commit;
    const terminal = (raw: any) => raw.state === 'closed' || !!raw.merged_at || raw.merged === true;
    let savedTerminal: any;
    if (previous?.number) {
      const saved = await this.run({ method: 'GET', endpoint: `repos/${repo.fullName}/pulls/${previous.number}` }) as any;
      if (!terminal(saved)) return saved;
      if (exact(saved)) savedTerminal = saved;
    }
    const rows = await this.pages(`repos/${repo.fullName}/pulls?state=all&head=${encodeURIComponent(`${repo.owner}:${context.branch}`)}`);
    const candidates: any[] = [];
    for (const row of rows) {
      if (!Number.isSafeInteger(row?.number) || row.number <= 0) throw new Error('GitHub returned an invalid pull request number.');
      const raw = row.base && row.head && typeof row.state === 'string' ? row
        : await this.run({ method: 'GET', endpoint: `repos/${repo.fullName}/pulls/${row.number}` });
      if (!terminal(raw) || exact(raw)) candidates.push(raw);
    }
    const open = candidates.filter(raw => !terminal(raw));
    if (open.length > 1) throw new Error('More than one open PR uses the upload branch. Inspect GitHub before retrying.');
    if (open.length) return this.run({ method: 'GET', endpoint: `repos/${repo.fullName}/pulls/${open[0].number}` }); // A mismatched open PR fails identity checks; never create beside it.
    const chosen = candidates.sort((a, b) => b.number - a.number)[0] ?? savedTerminal;
    return chosen ? this.run({ method: 'GET', endpoint: `repos/${repo.fullName}/pulls/${chosen.number}` }) : undefined;
  }
  private async status(context: ReviewContext, raw: any, previous?: PullRequestRecord): Promise<PullRequestRecord> {
    const output = this.identity(context, raw, previous);
    if (!output.identityVerified) return output;
    if (output.status === 'awaiting_review') {
      const repo = validateContext(context)!;
      let rows: any[];
      try { rows = await this.pages(`repos/${repo.fullName}/pulls/${output.number}/reviews`); }
      catch (error) { return { ...output, status: previous?.status ?? 'awaiting_review', checkedAt: previous?.checkedAt, error: githubError(error) }; }
      const decisions = new Map<string, { state: string; commit?: string }>();
      for (const review of rows.sort((a, b) => Number(a.id) - Number(b.id))) {
        if (typeof review.user?.login !== 'string' || review.user.login.toLowerCase() === String(raw.user?.login).toLowerCase()) continue;
        if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) decisions.set(review.user.login.toLowerCase(), { state: review.state, commit: review.commit_id });
      }
      const values = [...decisions.values()];
      output.status = values.some(review => review.state === 'CHANGES_REQUESTED') ? 'changes_requested' : values.some(review => review.state === 'APPROVED' && review.commit === context.commit) ? 'approved' : 'awaiting_review';
      if (values.some(review => review.state === 'APPROVED' && review.commit !== context.commit)) output.warning = 'An approval belongs to another revision and was not counted for this uploaded commit. Review status does not establish mergeability.';
      if (previous?.reviewRequestUncertain && previous.reviewer && (raw.requested_reviewers?.some((person: any) => person.login?.toLowerCase() === previous.reviewer!.toLowerCase())
        || rows.some(review => review.user?.login?.toLowerCase() === previous.reviewer!.toLowerCase() && review.commit_id === context.commit && ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED'].includes(review.state)))) {
        output.reviewerRequested = true; output.reviewRequestUncertain = false; output.reviewRequestError = undefined;
      }
    }
    output.checkedAt = new Date().toISOString(); return output;
  }
  async check(context: ReviewContext, previous?: PullRequestRecord): Promise<PullRequestRecord> {
    if (!validateContext(context)) return { supported: false, status: 'unsupported', warning: 'This repository supports branch upload only. Pull request review is currently available for GitHub.com.' };
    try {
      const raw = await this.find(context, previous);
      return raw ? await this.status(context, raw, previous) : { supported: true, status: 'uploaded', checkedAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString(), creationUncertain: false };
    } catch (error) { return { ...previous, supported: true, status: previous?.status ?? 'unknown', lastAttemptAt: new Date().toISOString(), error: githubError(error) }; }
  }
  async ensure(context: ReviewContext, previous?: PullRequestRecord): Promise<PullRequestRecord> {
    const repo = validateContext(context); if (!repo) return this.check(context, previous);
    try {
      this.onProgress?.('Looking for a pull request matching this uploaded version…');
      const found = await this.findForCreation(context, previous);
      if (found) return await this.status(context, found, previous?.number === found.number ? previous : undefined);
      if (previous?.creationUncertain) return { ...previous, lastAttemptAt: new Date().toISOString(), error: 'The earlier creation is still unconfirmed. Use Check PRs before retrying Create PR; no duplicate write was attempted.' };
      // Historical PR identity/reviewer state must not carry into a new submission.
      previous = { supported: true, status: 'uploaded' };
      this.onProgress?.('Confirming the uploaded branch before creating its pull request…');
      const ref = await this.run({ method: 'GET', endpoint: `repos/${repo.fullName}/git/ref/heads/${encodeURIComponent(context.branch)}` }) as any;
      if (ref?.ref !== `refs/heads/${context.branch}` || ref.object?.sha !== context.commit) return { ...previous, supported: true, status: 'unknown', warning: 'The upload branch no longer matches the recorded version commit. No PR was created; inspect the branch and upload receipt.' };
      // No skill text or user changelog is embedded: avoid automatic mentions
      // and issue-closing instructions from imported content.
      const prefix = `${encodeURIComponent(context.skillName)}/${encodeURIComponent(context.version)}`;
      const base = `https://github.com/${repo.fullName}/blob/${context.commit}/${prefix}`;
      const body = `SkillJetty version ${context.version} for ${context.skillName}.\n\nVerified upload commit: ${context.commit}\n\n- [Editable source](https://github.com/${repo.fullName}/tree/${context.commit}/${prefix}/source/${encodeURIComponent(context.skillName)})\n- [Skill package](${base}/${encodeURIComponent(`${context.skillName}-${context.version}.skill`)})\n- [Version notes](${base}/CHANGELOG.md)\n\nReview and merge remain separate actions. Use the explicit Merge action when this exact submission is ready.`;
      let created: any;
      try {
        this.onProgress?.('Creating the pull request on GitHub…');
        created = await this.run({ method: 'POST', endpoint: `repos/${repo.fullName}/pulls`, body: { title: `SkillJetty: ${context.skillName} ${context.version}`, head: context.branch, base: context.baseBranch, body } });
        this.identity(context, created, previous);
      }
      catch (error) {
        try { const reconciled = await this.findForCreation(context); if (reconciled) return await this.status(context, reconciled, previous); } catch { /* Keep the original write ambiguous, never retry POST here. */ }
        return { ...previous, supported: true, status: previous?.status ?? 'uploaded', creationUncertain: true, lastAttemptAt: new Date().toISOString(), error: `Uploaded — PR creation was not confirmed. ${githubError(error)}` };
      }
      const confirmed = this.identity(context, created, previous);
      this.onProgress?.(confirmed.identityVerified ? 'Pull request created and its uploaded commit verified.' : 'Pull request created; its identity needs attention.', confirmed.identityVerified ? 'succeeded' : 'info');
      this.onProgress?.('Reading the pull request review status…');
      // Preserve a successfully created PR even if the following reviews read fails.
      return this.check(context, confirmed);
    } catch (error) { return { ...previous, supported: true, status: previous?.status ?? 'uploaded', lastAttemptAt: new Date().toISOString(), error: `Uploaded — PR not created or verified. ${githubError(error)}` }; }
  }
  async merge(context: ReviewContext, previous: PullRequestRecord): Promise<PullRequestRecord> {
    return mergeVerifiedPullRequest(context, previous, this.run, current => deleteBranchWithLease(this.cwd, current));
  }
  async requestReviewer(context: ReviewContext, previous: PullRequestRecord, reviewer: string): Promise<PullRequestRecord> {
    const repo = validateContext(context);
    if (!repo || !previous.number || !loginPattern.test(reviewer)) return { ...previous, reviewRequestError: 'Choose an eligible reviewer after creating a GitHub.com PR.' };
    if (previous.reviewerRequested && previous.reviewer?.toLowerCase() === reviewer.toLowerCase()) return { ...previous, reviewRequestError: undefined };
    try {
      const raw = await this.find(context, previous);
      const verified = this.identity(context, raw, previous);
      if (!verified.identityVerified || verified.status === 'closed' || verified.status === 'merged') return { ...verified, reviewRequestError: 'Review requests require an open PR matching this exact uploaded version.' };
      const eligible = await this.reviewers(context.repository, raw.user?.login);
      const choice = eligible.find(item => item.login.toLowerCase() === reviewer.toLowerCase());
      if (!choice) return { ...previous, reviewer, reviewerRequested: false, reviewRequestError: 'This person is not an eligible collaborator reviewer. Refresh the reviewer choices and choose someone else.' };
      if ((previous.reviewerRequested && previous.reviewer?.toLowerCase() === choice.login.toLowerCase())
        || raw.requested_reviewers?.some((item: any) => item.login?.toLowerCase() === choice.login.toLowerCase())) return { ...previous, reviewer: choice.login, reviewerRequested: true, reviewRequestUncertain: false, reviewRequestError: undefined };
      const confirmation = async (metadata?: any) => {
        const after = metadata ?? await this.find(context, previous);
        if (!this.identity(context, after, previous).identityVerified) return false;
        if (after?.requested_reviewers?.some((item: any) => item.login?.toLowerCase() === choice.login.toLowerCase())) return true;
        const reviews = await this.pages(`repos/${repo.fullName}/pulls/${previous.number}/reviews`);
        return reviews.some(review => review.user?.login?.toLowerCase() === choice.login.toLowerCase() && review.commit_id === context.commit && ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED'].includes(review.state));
      };
      if (previous.reviewRequestUncertain && previous.reviewer?.toLowerCase() === choice.login.toLowerCase()) {
        if (await confirmation(raw)) return { ...previous, reviewer: choice.login, reviewerRequested: true, reviewRequestUncertain: false, reviewRequestError: undefined, warning: 'A pending or completed review confirms this reviewer; no additional notification was sent.' };
        return { ...previous, reviewRequestError: 'The earlier request outcome is still uncertain. Check PRs or inspect the PR in GitHub before making a renewed request; no duplicate notification was sent.' };
      }
      try {
        const response = await this.run({ method: 'POST', endpoint: `repos/${repo.fullName}/pulls/${previous.number}/requested_reviewers`, body: { reviewers: [choice.login] } });
        if (!await confirmation(response)) throw new Error('Review request response did not confirm its outcome.');
      }
      catch (error) {
        try { if (await confirmation()) return { ...previous, reviewer: choice.login, reviewerRequested: true, reviewRequestUncertain: false, reviewRequestError: undefined }; } catch { /* Preserve the PR and the notification uncertainty. */ }
        const detail = error as { message?: string; stderr?: string };
        const rejected = /HTTP\s+(?:400|401|403|404|422|429)\b/.test(`${detail.message ?? ''} ${detail.stderr ?? ''}`);
        return { ...previous, reviewer: choice.login, reviewerRequested: false, reviewRequestUncertain: !rejected, reviewRequestError: `PR created — review request failed or was not confirmed. ${githubError(error)}` };
      }
      return { ...previous, reviewer: choice.login, reviewerRequested: true, reviewRequestUncertain: false, reviewRequestError: undefined };
    } catch (error) { return { ...previous, reviewer, reviewerRequested: previous.reviewer?.toLowerCase() === reviewer.toLowerCase() ? previous.reviewerRequested : false, reviewRequestError: `PR created — review request failed. ${githubError(error)}` }; }
  }
}
