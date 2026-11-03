export type GuidedStep = 'start' | 'edit' | 'check' | 'publish' | 'done';
export type GuidedActivityStatus = 'running' | 'waiting' | 'succeeded' | 'failed' | 'info';
export type GuidedActivityEntry = { id: number; message: string; status: GuidedActivityStatus };
export type GuidedProgress = (message: string, status?: GuidedActivityStatus) => void;
export type SkillTarget = 'portable' | 'claude' | 'codex' | 'gemini' | 'copilot';
export type ReviewerChoice = { login: string; name?: string };
export type ExportMode = 'portable' | 'plugin' | 'both';
export type ExportCompatibility = { target: string; issues: string[]; tested?: boolean };
export type ExportOptions = {
  mode: ExportMode; pluginName: string; pluginVersion: string; pluginDescription: string;
  pluginAuthor?: string; pluginLicense?: string; geminiZip: boolean;
  pluginIcon?: string; pluginPrivacyPolicyUrl?: string; pluginDocumentationUrl?: string; pluginSupportUrl?: string;
  members: { id: string; name: string; version?: string; selected: boolean }[];
};
export type ExportArtifact = { label: string; path?: string; url?: string; reviewUrl?: string; directory?: string;
  kind?: 'portable' | 'plugin' | 'gemini'; version?: string; status?: string; error?: string };
export type PullRequestRecord = {
  supported: boolean;
  status: 'uploaded' | 'awaiting_review' | 'changes_requested' | 'approved' | 'merged' | 'closed' | 'unknown' | 'unsupported';
  number?: number; url?: string; base?: string; head?: string; headCommit?: string;
  checkedAt?: string; lastAttemptAt?: string; error?: string; warning?: string;
  reviewer?: string; reviewerRequested?: boolean; reviewRequestError?: string;
  mergeCommit?: string; branchDeleted?: boolean; mergeError?: string; branchDeleteError?: string;
  identityVerified?: boolean; creationUncertain?: boolean; reviewRequestUncertain?: boolean;
};
export type GuidedReviewItem = { directory: string; skillName: string; version: string; repository?: string; pr?: PullRequestRecord };
export type RepositoryCheckState = { status: 'checking' | 'verified' | 'outOfSync' | 'setupRequired' | 'error'; message: string; localPath?: string; repository?: string; branch?: string; localCommit?: string; remoteCommit?: string; dirty?: boolean; trustRequired?: boolean };
export type GuidedState = {
  step: GuidedStep;
  busy?: boolean;
  progress?: string;
  activity?: GuidedActivityEntry[];
  activityGeneration?: number;
  waitingForInput?: boolean;
  skillsLoaded?: boolean;
  skillsStale?: boolean;
  error?: string;
  notice?: string;
  hasWorkspace: boolean;
  workFolder?: string;
  configuredRepository?: string;
  configuredLocalRepository?: string;
  configurationError?: string;
  connection?: { repository: string; baseBranch: string; localPath?: string };
  repositoryVerification?: RepositoryCheckState;
  repositoryCheckout?: { path: string; branch?: string; commit?: string };
  repositories: { label: string; repository: string }[];
  drafts: { id: string; name: string }[];
  library: { kind?: 'skill' | 'plugin'; skillName: string; version: string; directory: string; status: string; pr?: PullRequestRecord }[];
  reviewers?: ReviewerChoice[];
  reviewersLoaded?: boolean;
  reviewersError?: string;
  reviewQueue?: GuidedReviewItem[];
  reviewQueueError?: string;
  githubAccount?: string;
  libraryError?: string;
  archivePreview?: { entries: { label: string; directory: string; bytes: number; fileCount: number }[]; skipped: string[] };
  archives?: { id: string; label: string }[];
  active?: { id: string; name: string; version?: string; versionNote?: string };
  history?: { id: string; path: string; at: string }[];
  files: { path: string; size: number; text: boolean }[];
  editor?: { path: string; content: string; readOnly?: boolean };
  target: SkillTarget;
  exportOptions?: ExportOptions;
  check?: { valid: boolean; errors: { message: string; file?: string }[]; warnings: { message: string; file?: string }[]; compatibility: string; behaviorNote: string };
  publish?: { version: string; changelog: string; repository?: string; fileCount: number; reviewSupported?: boolean;
    compatibility?: ExportCompatibility[];
    versionSource?: string; versionWarning?: string; suggestedChangelog?: string;
    changeSummary?: { baselineVersion?: string; added: string[]; changed: string[]; removed: string[]; unchanged: number; note?: string } };
  receipt?: { name: string; version: string; directory?: string; local?: boolean; packagePath?: string; pr?: PullRequestRecord; sourceUrl?: string; packageUrl?: string; changelogUrl?: string; reviewUrl?: string; commit?: string; branch?: string; cleanupError?: string; note: string; artifacts?: ExportArtifact[]; compatibility?: ExportCompatibility[] };
  form?: Record<string, string>;
};

export type GuidedAction = 'ready' | 'openSettings' | 'loadSkills' | 'unloadSkills' | 'chooseWorkspace' | 'discoverRepositories' | 'connectRepository' | 'createRepository'
  | 'verifyRepository' | 'setRepositoryFolder' | 'pullRepository' | 'openRepositorySkill' | 'showCreate' | 'createSkill' | 'openPackage' | 'openPackagePath' | 'openFolder' | 'resume' | 'restoreVersion' | 'openFile' | 'addFile' | 'createFile'
  | 'save' | 'reloadFile' | 'check' | 'edit' | 'preparePublish' | 'publish' | 'back' | 'startAnother' | 'refresh' | 'setTarget' | 'openLink'
  | 'loadReviewers' | 'checkPullRequests' | 'checkPullRequest' | 'mergePullRequest' | 'createPullRequest' | 'requestReviewer' | 'openPullRequest' | 'connectGitHub' | 'restoreEdit' | 'refreshHistory' | 'savePackage' | 'revealPackage' | 'updateExportOptions'
  | 'previewArchive' | 'archiveReleases' | 'restoreArchive';
export type GuidedMessage = { action: GuidedAction; payload?: Record<string, unknown>; editorSkillId?: string; editorPath?: string; editorContent?: string };
