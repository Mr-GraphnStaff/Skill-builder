export type GuidedStep = 'start' | 'edit' | 'check' | 'publish' | 'done';
export type SkillTarget = 'portable' | 'claude' | 'codex' | 'gemini' | 'copilot';
export type ReviewerChoice = { login: string; name?: string };
export type PullRequestRecord = {
  supported: boolean;
  status: 'uploaded' | 'awaiting_review' | 'changes_requested' | 'approved' | 'merged' | 'closed' | 'unknown' | 'unsupported';
  number?: number; url?: string; base?: string; head?: string; headCommit?: string;
  checkedAt?: string; lastAttemptAt?: string; error?: string; warning?: string;
  reviewer?: string; reviewerRequested?: boolean; reviewRequestError?: string;
  identityVerified?: boolean; creationUncertain?: boolean; reviewRequestUncertain?: boolean;
};
export type GuidedReviewItem = { directory: string; skillName: string; version: string; repository?: string; pr?: PullRequestRecord };
export type GuidedState = {
  step: GuidedStep;
  busy?: boolean;
  waitingForInput?: boolean;
  progress?: string;
  error?: string;
  notice?: string;
  hasWorkspace: boolean;
  connection?: { repository: string; baseBranch: string };
  repositoryCheckout?: { path: string; branch?: string; commit?: string };
  repositories: { label: string; repository: string }[];
  drafts: { id: string; name: string }[];
  library: { skillName: string; version: string; directory: string; status: string; pr?: PullRequestRecord }[];
  reviewers?: ReviewerChoice[];
  reviewersLoaded?: boolean;
  reviewersError?: string;
  reviewQueue?: GuidedReviewItem[];
  reviewQueueError?: string;
  githubAccount?: string;
  libraryError?: string;
  active?: { id: string; name: string };
  files: { path: string; size: number; text: boolean }[];
  editor?: { path: string; content: string; readOnly?: boolean };
  target: SkillTarget;
  check?: { valid: boolean; errors: { message: string; file?: string }[]; warnings: { message: string; file?: string }[]; compatibility: string; behaviorNote: string };
  publish?: { version: string; changelog: string; repository?: string; fileCount: number; reviewSupported?: boolean };
  receipt?: { name: string; version: string; directory?: string; pr?: PullRequestRecord; sourceUrl?: string; packageUrl?: string; changelogUrl?: string; reviewUrl?: string; commit?: string; branch?: string; cleanupError?: string; note: string };
  form?: Record<string, string>;
};

export type GuidedAction = 'ready' | 'chooseWorkspace' | 'discoverRepositories' | 'connectRepository' | 'createRepository'
  | 'pullRepository' | 'openRepositorySkill' | 'showCreate' | 'createSkill' | 'openPackage' | 'openFolder' | 'resume' | 'restoreVersion' | 'openFile' | 'addFile' | 'createFile'
  | 'save' | 'reloadFile' | 'check' | 'edit' | 'preparePublish' | 'publish' | 'back' | 'startAnother' | 'refresh' | 'setTarget' | 'openLink'
  | 'loadReviewers' | 'checkPullRequests' | 'checkPullRequest' | 'createPullRequest' | 'requestReviewer' | 'openPullRequest' | 'connectGitHub';
export type GuidedMessage = { action: GuidedAction; payload?: Record<string, unknown>; editorSkillId?: string; editorPath?: string; editorContent?: string };
