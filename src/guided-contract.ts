export type GuidedStep = 'start' | 'edit' | 'check' | 'publish' | 'done';
export type SkillTarget = 'portable' | 'claude' | 'codex' | 'gemini' | 'copilot';
export type GuidedState = {
  step: GuidedStep;
  busy?: boolean;
  progress?: string;
  error?: string;
  notice?: string;
  hasWorkspace: boolean;
  connection?: { repository: string; baseBranch: string };
  repositories: { label: string; repository: string }[];
  drafts: { id: string; name: string }[];
  library: { skillName: string; version: string; directory: string; status: string }[];
  libraryError?: string;
  active?: { id: string; name: string };
  files: { path: string; size: number; text: boolean }[];
  editor?: { path: string; content: string; readOnly?: boolean };
  target: SkillTarget;
  check?: { valid: boolean; errors: { message: string; file?: string }[]; warnings: { message: string; file?: string }[]; compatibility: string; behaviorNote: string };
  publish?: { version: string; changelog: string; repository?: string; fileCount: number };
  receipt?: { name: string; version: string; sourceUrl?: string; packageUrl?: string; changelogUrl?: string; reviewUrl?: string; commit?: string; branch?: string; cleanupError?: string; note: string };
  form?: Record<string, string>;
};

export type GuidedAction = 'ready' | 'chooseWorkspace' | 'discoverRepositories' | 'connectRepository' | 'createRepository'
  | 'showCreate' | 'createSkill' | 'openPackage' | 'openFolder' | 'resume' | 'restoreVersion' | 'openFile' | 'addFile' | 'createFile'
  | 'save' | 'reloadFile' | 'check' | 'edit' | 'preparePublish' | 'publish' | 'back' | 'startAnother' | 'refresh' | 'setTarget' | 'openLink';
export type GuidedMessage = { action: GuidedAction; payload?: Record<string, unknown>; editorSkillId?: string; editorPath?: string; editorContent?: string };
