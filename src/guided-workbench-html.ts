import type { ExportCompatibility, GuidedState, PullRequestRecord } from './guided-contract.js';

type Primary = { label: string; action?: string; form?: string; disabled?: boolean; id?: string };
export type GuidedBrand = { productName?: string; logoDataUri?: string; tagline?: string; descriptor?: string };

function escape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}
function nonceValue(nonce: string): string {
  if (!/^[A-Za-z0-9+/_=-]{8,}$/.test(nonce)) throw new Error('A valid webview nonce is required.');
  return nonce;
}
function productName(brand?: GuidedBrand): string {
  return brand?.productName?.trim() || 'SkillJetty';
}
function brandHeader(brand?: GuidedBrand, heading = false): string {
  const logo = brand?.logoDataUri && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(brand.logoDataUri) ? brand.logoDataUri : undefined;
  const tag = heading ? 'h1' : 'strong';
  return `<div class="brand-lockup">${logo ? `<img class="brand-logo" src="${escape(logo)}" width="64" height="64" alt="DAF-TECH">` : ''}<div class="brand-wordmark"><span class="brand-company" ${logo ? 'aria-hidden="true"' : ''}>by DAF-TECH</span><${tag} class="brand-product">${escape(productName(brand))}</${tag}><span class="brand-tagline">${escape(brand?.descriptor ?? 'Agent Skills Studio')} · ${escape(brand?.tagline ?? 'Build it. Improve it. Share it.')}</span></div></div>`;
}
function secondary(action: string, label: string, attributes = ''): string {
  return `<button type="button" class="secondary" data-action="${escape(action)}" ${attributes}>${escape(label)}</button>`;
}
function settingsButton(): string {
  return '<button type="button" id="open-settings" class="secondary settings-gear" data-action="openSettings" data-settings="true" aria-label="Open SkillJetty settings" title="Open SkillJetty settings" aria-describedby="settings-help"><span aria-hidden="true">⚙</span></button><span id="settings-help" class="visually-hidden">Settings for file locations and optional GitHub publishing.</span>';
}
function selectedExportMode(state: GuidedState) {
  return state.exportOptions?.mode ?? (state.workflowIntent === 'plugin' ? 'plugin' : 'portable');
}
function scriptString(value: string): string {
  // This is data inside a nonced script, not HTML text. Prevent closing the
  // script element and keep JavaScript line separators escaped as data.
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
function field(id: string, label: string, value: string, attributes = '', hint = ''): string {
  return `<div class="field"><label for="${id}">${escape(label)}</label>${hint ? `<p class="hint" id="${id}-hint">${escape(hint)}</p>` : ''}<input id="${id}" name="${id}" value="${escape(value)}" data-persist ${hint ? `aria-describedby="${id}-hint"` : ''} ${attributes}></div>`;
}
function textField(id: string, label: string, value: string, attributes = '', hint = ''): string {
  return `<div class="field"><label for="${id}">${escape(label)}</label>${hint ? `<p class="hint" id="${id}-hint">${escape(hint)}</p>` : ''}<textarea id="${id}" name="${id}" data-persist ${hint ? `aria-describedby="${id}-hint"` : ''} ${attributes}>${escape(value)}</textarea></div>`;
}
function configurationSummary(state: GuidedState): string {
  const invalid = !!state.configurationError;
  // Rejected settings may contain credentials. Show accepted context only.
  const repository = invalid ? state.connection?.repository : state.configuredRepository ?? state.connection?.repository;
  const local = invalid ? state.connection?.localPath : state.configuredLocalRepository ?? state.connection?.localPath;
  // Display labels do not change storage selection or repository ownership.
  const folderName = (folder?: string) => folder?.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || folder;
  const buildProject = state.workFolder?.replace(/[\\/]\.skilljetty-prerelease[\\/]*$/i, '');
  const buildName = state.workFolder && buildProject !== state.workFolder ? `${folderName(buildProject)} builds` : folderName(state.workFolder);
  const localRoot = state.repositoryRoot ?? local;
  let remoteName = repository;
  if (repository) {
    try {
      const url = new URL(repository);
      remoteName = url.hostname.toLowerCase() === 'github.com'
        ? url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '') : `${url.hostname}${url.pathname}`;
    } catch { remoteName = folderName(repository); }
  }
  const verification = state.repositoryVerification;
  const status = invalid || verification?.status === 'error' ? 'Upload needs attention'
    : verification?.status === 'outOfSync' ? 'Local and remote differ'
    : verification?.status === 'checking' ? 'Checking connection'
    : verification?.status === 'verified' ? 'Verified' : repository ? 'Ready to check on upload' : 'Not connected';
  return `<section id="workbench-configuration" class="project-strip" aria-label="Build space, local repository and remote repository" data-configuration-error="${invalid}">
    <div class="build-space-summary"><span class="eyebrow">Build space</span><strong id="active-work-folder" title="${escape(state.workFolder || '')}">${escape(buildName || 'Choose a location to begin')}</strong></div>
    <div class="local-repository-summary"><span class="eyebrow">Local repository</span><strong id="local-repository-path" title="${escape(localRoot || '')}">${escape(folderName(localRoot) || 'Not connected')}</strong>${state.localRepositorySetupPending ? '<small>Prepared on first upload</small>' : localRoot && state.localRepositoryAvailable === false ? '<small>Needs attention</small>' : ''}${repository && !invalid ? `<div class="sync-action">${secondary('pullRepository', 'Sync repository')}</div>` : ''}</div>
    <div><span class="eyebrow">Remote repository</span><strong id="configured-repository" title="${escape(repository || '')}">${escape(remoteName || 'Not connected')}</strong><small><span id="configured-target-branch">${escape(state.connection?.baseBranch || (repository ? 'Branch checked before upload' : ''))}</span> <span id="repository-settings-state">${escape(repository || invalid ? status : '')}</span></small></div>
    <div class="project-actions">${secondary('openSettings', repository ? 'Change connection' : 'Connect repository')}${state.githubAccount ? `<small>Signed in as ${escape(state.githubAccount)}</small>` : ''}</div>
    <p id="repository-verification" class="hint" role="status" aria-live="polite" data-status="${invalid ? 'error' : escape(verification?.status ?? 'setupRequired')}">${invalid ? 'GitHub upload needs a corrected connection. Your work can still be edited and saved locally.' : escape(verification?.status === 'error' || verification?.status === 'outOfSync' ? verification.message : '')}</p>
  </section>`;
}
function reviewLabel(pr?: PullRequestRecord): string {
  if (!pr) return 'Uploaded — PR not checked';
  if (pr.identityVerified === false) return 'Status not verified for this upload';
  const labels: Record<PullRequestRecord['status'], string> = {
    uploaded: 'Uploaded — PR not created', awaiting_review: 'Awaiting review',
    changes_requested: 'Changes requested', approved: 'Approved — awaiting merge',
    merged: 'Merged', closed: 'Closed without merging', unknown: 'Status not verified',
    unsupported: 'Uploaded — PRs unavailable for this repository'
  };
  return labels[pr.status] ?? 'Status not verified';
}
function reviewerChoices(state: GuidedState, id: string, selected = ''): string {
  return `<div class="field"><label for="${id}">Reviewer (optional)</label><select id="${id}" name="reviewer" data-persist aria-describedby="${id}-hint"><option value="">Skip — do not request a reviewer</option>${(state.reviewers ?? []).map(reviewer => `<option value="${escape(reviewer.login)}" ${reviewer.login === selected ? 'selected' : ''}>${escape(reviewer.name ? `${reviewer.name} (@${reviewer.login})` : `@${reviewer.login}`)}</option>`).join('')}</select><p class="hint" id="${id}-hint">Choose an eligible repository collaborator. Submitting a review request will notify that person. Leaving this blank sends no review request.</p></div>`;
}
function reviewerPicker(state: GuidedState): string {
  return `<section class="reviewer-picker"><h2>Ask someone to review (optional)</h2><p class="hint">Selecting a reviewer sends that person a review request when you submit. Saving locally does not notify them.</p>${state.reviewersLoaded ? reviewerChoices(state, 'reviewer', state.form?.reviewer ?? '') : '<p class="hint">You can submit without choosing a reviewer. Load eligible collaborators if you want to request a review.</p>'}
    ${secondary('loadReviewers', state.reviewersLoaded ? 'Refresh eligible reviewers' : 'Load eligible reviewers')}
    ${state.reviewersLoaded && !state.reviewers?.length ? '<p class="hint">No eligible collaborators were returned. You can continue without a review request.</p>' : ''}
    ${state.reviewersError ? `<p class="warning"><span aria-hidden="true">!</span> Reviewers could not be loaded: ${escape(state.reviewersError)}. You can retry or submit without a reviewer.</p>` : ''}</section>`;
}
function pullRequestPanel(pr: PullRequestRecord | undefined, directory: string | undefined): string {
  const attrs = directory ? `data-directory="${escape(directory)}"` : '';
  return `<section class="card pr-card"><h2>${pr?.number && pr.identityVerified !== false ? `Pull request #${escape(pr.number)}` : 'Pull request for this upload'}</h2>
    <p class="result-badge ${pr?.status === 'merged' && pr.identityVerified !== false ? 'pass' : 'warning'}"><span aria-hidden="true">${pr?.status === 'merged' && pr.identityVerified !== false ? '✓' : '•'}</span> ${pr?.error && pr.status !== 'unknown' ? 'Last verified status: ' : ''}${escape(reviewLabel(pr))}</p>
    ${pr?.checkedAt && pr.identityVerified !== false ? `<p class="hint">Last verified: <time datetime="${escape(pr.checkedAt)}">${escape(pr.checkedAt)}</time></p>` : '<p class="hint">No verified status check has been recorded yet.</p>'}
    ${pr?.lastAttemptAt && pr.lastAttemptAt !== pr.checkedAt ? `<p class="hint">Latest attempt: <time datetime="${escape(pr.lastAttemptAt)}">${escape(pr.lastAttemptAt)}</time></p>` : ''}
    ${pr?.error ? `<p class="warning"><span aria-hidden="true">!</span> The latest PR operation could not be verified: ${escape(pr.error)}. Your uploaded version remains preserved.</p>` : ''}
    ${pr?.warning ? `<p class="warning"><span aria-hidden="true">!</span> ${escape(pr.warning)}</p>` : ''}
    ${pr?.reviewRequestError ? `<p class="warning"><span aria-hidden="true">!</span> The PR exists, but the review request was not confirmed: ${escape(pr.reviewRequestError)}. Do not upload the version again.</p>` : ''}
    ${pr?.mergeError ? `<p class="warning">Merge not confirmed: ${escape(pr.mergeError)}</p>` : ''}
    ${pr?.branchDeleteError ? `<p class="warning">${pr.identityVerified === true && pr.status === 'merged' ? 'The PR is merged. Branch cleanup needs attention:' : 'Recorded branch cleanup could not be verified:'} ${escape(pr.branchDeleteError)}</p>` : ''}
    ${pr?.status === 'merged' && pr.identityVerified === true && pr.branchDeleted ? '<p>Merge confirmed. Submission branch deleted.</p>' : ''}
    ${pr?.reviewerRequested && pr.identityVerified !== false && pr.reviewer ? `<p>Review requested from <strong>@${escape(pr.reviewer)}</strong>.</p>` : ''}
    ${directory ? `<div class="button-row">${pr?.number ? secondary('openPullRequest', pr.identityVerified === false ? `Inspect mismatched PR #${pr.number}` : `Open PR #${pr.number}`, attrs) : ''}${secondary('checkPullRequest', 'Check status', attrs)}${pr?.number && pr.identityVerified && pr.status !== 'closed' && (pr.status !== 'merged' || !pr.branchDeleted) ? secondary('mergePullRequest', pr.status === 'merged' ? 'Delete merged PR branch' : 'Merge PR and delete branch', `${attrs} data-confirmed="true"`) : ''}${pr?.supported !== false && (!pr?.number || pr.identityVerified === false || pr.status === 'closed') ? secondary('createPullRequest', pr?.status === 'closed' && pr.identityVerified ? 'Find current PR for this upload' : 'Create PR for this upload', attrs) : ''}${pr?.reviewRequestError && pr.identityVerified !== false && pr.reviewer && pr.number ? secondary('requestReviewer', `Retry review request to @${pr.reviewer} — notify reviewer`, `${attrs} data-reviewer="${escape(pr.reviewer)}" data-confirmed="true"`) : ''}</div>` : ''}
    <p class="hint">Merge verifies this exact uploaded commit. Its branch is removed only after GitHub confirms the merge.</p></section>`;
}
function reviews(state: GuidedState): { title: string; hint: string; html: string; primary: Primary } {
  return { title: 'Check PRs', hint: 'Check the connected repository’s uploaded versions. Refreshing status does not create PRs, request reviews, or merge anything.',
    html: `${state.connection ? `<p class="connection">Repository: <strong>${escape(state.connection.repository)}</strong></p>` : '<p class="warning">Set a repository in SkillJetty settings before checking its PRs.</p>'}
      ${state.reviewQueueError ? `<p class="warning"><span aria-hidden="true">!</span> ${escape(state.reviewQueueError)}</p>` : ''}
      ${(state.reviewQueue ?? []).length ? (state.reviewQueue ?? []).map(item => `<article class="review-item"><h2>${escape(item.skillName)} <span class="hint">${escape(item.version)}</span></h2>${pullRequestPanel(item.pr, item.directory)}</article>`).join('') : '<section class="card"><p>No uploaded versions are listed for this connected repository yet. Versions prepared only on this computer are not PR submissions.</p></section>'}`,
    primary: { label: 'Refresh PR statuses', action: 'checkPullRequests' } };
}
function savedWork(state: GuidedState): string {
  return `<section class="saved-work"><div class="section-heading"><h2>${state.workflowIntent === 'plugin' ? 'Choose a skill to include' : 'Your skills'}</h2>${secondary('loadSkills', 'Refresh', 'aria-label="Refresh your skills and saved versions"')}</div>
    ${state.drafts.length ? `<ul class="skill-grid">${state.drafts.map(draft => `<li><div><span class="eyebrow">Skill</span><h3>${escape(draft.name)}</h3><p class="hint">Your editable work</p></div>${secondary('resume', state.workflowIntent === 'plugin' ? `Use ${draft.name}` : `Edit ${draft.name}`, `data-id="${escape(draft.id)}"`)}</li>`).join('')}</ul>` : `<p class="empty-state">${state.skillsLoaded ? 'No skills here yet. Create one or open existing work below.' : 'Reading your skills…'}</p>`}
    ${state.skillsStale ? '<p class="hint">Refresh to include changes made in another window.</p>' : ''}
    ${!state.releasesLoaded ? '<p class="hint">Reading saved versions…</p>' : ''}
    ${state.library.length ? `<h3>Built versions</h3><ul class="work-list">${state.library.map(entry => `<li><span><strong>${escape(entry.skillName)}</strong> <span class="version-chip">${escape(entry.version)}</span><small>${entry.kind === 'plugin' ? 'Plugin · ' : ''}${escape(entry.pr ? reviewLabel(entry.pr) : entry.status === 'uploaded' ? 'Uploaded to GitHub' : 'Saved on this computer')}</small></span>${entry.kind === 'plugin' ? secondary('openPlugin', `Edit plugin ${entry.skillName}`, `data-directory="${escape(entry.directory)}"`) : secondary('restoreVersion', `Edit ${entry.skillName} ${entry.version}`, `data-directory="${escape(entry.directory)}"`)}</li>`).join('')}</ul>` : ''}
    ${state.libraryError ? `<p class="warning">${escape(state.libraryError)} ${secondary('loadSkills', 'Try reading saved versions again')}</p>` : ''}
  </section>`;
}
function start(state: GuidedState): { title: string; hint: string; html: string; primary?: Primary } {
  if (!state.hasWorkspace) return {
    title: 'One home for your work', hint: 'Choose a location once. SkillJetty will keep your skills, builds and earlier edits together.',
    html: `<section class="card welcome-card"><h2>Where would you like to work?</h2><p>Choose a project folder. You will see the exact save location before anything is created.</p><div class="button-row">${secondary('createWorkbench', 'Choose a location', 'id="choose-home" aria-describedby="workbench-setup-help"')}</div><p id="workbench-setup-help" class="hint">Your existing files stay where they are. You do not need a GitHub connection to begin.</p></section>`, primary: undefined
  };
  if (state.form?.mode === 'reviews') return reviews(state);
  if (state.form?.mode === 'create') return {
    title: state.workflowIntent === 'plugin' ? 'Write a skill for your plugin' : 'New skill', hint: 'Name it, describe its job, and write the instructions. You can keep improving it in the editor.',
    html: `<section class="card"><form id="create-form" action="#" method="post" data-form-action="createSkill"><fieldset ${state.busy ? 'disabled' : ''}><legend class="visually-hidden">New skill</legend>
      ${field('skillName', 'Name (required)', state.form?.name ?? '', 'required maxlength="64" pattern="[a-z0-9]+(-[a-z0-9]+)*" autocomplete="off" autocapitalize="off" spellcheck="false"', 'Lowercase words joined with hyphens, for example weekly-status.')}
      ${textField('skillDescription', 'What should it do? (required)', state.form?.description ?? '', 'required maxlength="1024" rows="2"', 'Describe its purpose and when an assistant should use it.')}
      ${textField('skillInstructions', 'Instructions (required)', state.form?.instructions ?? '', 'required rows="10"', 'Write the steps and the result you want.')}
      </fieldset></form></section>`, primary: { label: 'Create and edit', form: 'create-form' }
  };
  const plugin = state.workflowIntent === 'plugin';
  const repositorySource = !state.configurationError && state.localRepositoryAvailable !== false && state.connection?.localPath;
  return {
    title: plugin ? 'Choose skills for your plugin' : 'Your project',
    hint: plugin ? 'A plugin brings skills together. Choose your first skill below; add more when you build.' : 'Create something new, continue your work, or open a skill you already have.',
    html: `<div class="home-actions">${plugin ? secondary('showCreate', 'Write a new skill', 'data-intent="plugin"') : `${secondary('showCreate', 'New skill', 'aria-describedby="create-choice-help"')}${secondary('showPlugin', 'New plugin', 'aria-describedby="plugin-choice-help"')}`}<span id="create-choice-help" class="visually-hidden">Write instructions for an AI assistant.</span><span id="plugin-choice-help" class="visually-hidden">Bundle skills into a Claude plugin.</span>${state.connection && !state.configurationError ? secondary('checkPullRequests', 'GitHub uploads & reviews') : ''}</div>
      ${savedWork(state)}
      <section class="card import-card"><h2>Open existing work</h2><div class="button-row">${repositorySource ? secondary('openRepositorySkill', 'Open from your project', 'id="open-repository-skill"') : ''}${secondary('openPackage', 'Open a skill file')}${secondary('openFolder', 'Open a folder')}</div><p class="hint">SkillJetty opens an editable copy. Your originals stay unchanged.</p>
      <form id="package-path-form" action="#" method="post" data-form-action="openPackagePath" class="path-form"><fieldset ${state.busy ? 'disabled' : ''}><legend class="visually-hidden">Open a file by path</legend>${field('packagePath', 'Or paste a skill file path', state.form?.path ?? '', 'required autocomplete="off" autocapitalize="off" spellcheck="false"')}<button type="submit" class="secondary">Open path</button></fieldset></form></section>
      ${plugin ? `<div class="button-row">${secondary('showSkillStart', 'Return to your project')}</div>` : archiveManagement(state)}`,
    primary: undefined
  };
}
function archiveManagement(state: GuidedState): string {
  const preview = state.archivePreview;
  const bytes = (value: number) => Number.isSafeInteger(value) && value >= 0 ? `${value.toLocaleString()} bytes` : 'size unavailable';
  return `<section id="archive-management" class="card maintenance"><h2>Older versions</h2>
    <p class="hint">Review older local builds before moving them into recovery. GitHub and installed plugins stay unchanged.</p>
    <p class="hint" id="archive-protection-help">Current versions and work awaiting review are kept in place.</p>
    ${secondary('previewArchive', 'Review older saved releases', 'aria-describedby="archive-protection-help"')}
    ${preview ? `<section aria-labelledby="archive-preview-heading"><h3 id="archive-preview-heading">Review before archiving</h3>${preview.entries.length ? `<ul class="artifact-results">${preview.entries.map(entry => `<li><strong>${escape(entry.label)}</strong><p>${escape(bytes(entry.bytes))} · ${escape(entry.fileCount)} files</p><p class="detail"><code>${escape(entry.directory)}</code></p></li>`).join('')}</ul>${secondary('archiveReleases', 'Archive reviewed releases', 'data-confirmed="true" aria-describedby="archive-confirmation-help"')}<p class="hint" id="archive-confirmation-help">This moves only the reviewed local release folders to recovery. It does not permanently delete them. If the reviewed files change, review a fresh plan before archiving.</p>` : '<p>No older releases are currently eligible. Nothing will be moved.</p>'}${preview.skipped.length ? `<h3>Kept in place</h3><ul>${preview.skipped.map(reason => `<li>${escape(reason)}</li>`).join('')}</ul>` : ''}</section>` : ''}
    ${state.archives?.length ? `<section aria-labelledby="archive-restore-heading"><h3 id="archive-restore-heading">Local recovery archives</h3><ul class="work-list">${state.archives.map(archive => `<li><span>${escape(archive.label)}</span>${secondary('restoreArchive', `Restore ${archive.label}`, `data-id="${escape(archive.id)}"`)}</li>`).join('')}</ul><p class="hint">Restore brings the preserved release folders back without replacing newer work. It does not install a plugin or publish to GitHub.</p></section>` : ''}
  </section>`;
}
function skillIdentity(state: GuidedState): string {
  const skill = state.active;
  if (!skill) return '';
  return `<section class="identity-strip" aria-label="Skill identity"><p><strong>Working on ${escape(skill.name)}</strong>${skill.version ? ` <span class="hint">· Declared version ${escape(skill.version)}</span>` : ''}</p><p class="hint">${escape(skill.versionNote ?? 'This is your editable draft. Release numbers are managed when you share it.')}</p></section>`;
}
function changeSummary(state: GuidedState): string {
  const summary = state.publish?.changeSummary;
  if (!summary) return '<section class="card"><h2>Changes in this release</h2><p>SkillJetty will prepare release notes from the files in this draft. You can add context below.</p></section>';
  const changes = summary.added.length + summary.changed.length + summary.removed.length;
  return `<section class="card"><h2>Changes in this release</h2><p>${changes ? `${summary.added.length} added · ${summary.changed.length} changed · ${summary.removed.length} removed` : 'No file changes compared with the saved release.'}${summary.unchanged ? ` · ${summary.unchanged} unchanged` : ''}</p><p class="hint">File changes are detected automatically. These counts describe file contents, not whether the skill behaves better.</p>${changes ? `<section class="change-list"><h3>Changed files</h3>${([['Added', summary.added], ['Changed', summary.changed], ['Removed', summary.removed]] as const).filter(([, files]) => files.length).map(([label, files]) => `<h3>${label}</h3><ul class="change-files">${files.map(file => `<li><code>${escape(file)}</code></li>`).join('')}</ul>`).join('')}</section>` : ''}${state.publish?.suggestedChangelog ? `<section class="automatic-notes"><h3>Automatic release notes</h3><pre class="release-notes">${escape(state.publish.suggestedChangelog)}</pre></section>` : ''}</section>`;
}
function earlierEdits(state: GuidedState): string {
  if (!state.editor || state.editor.readOnly) return '';
  const edits = state.history ?? [];
  return `<section class="card edit-history"><h2>Earlier edits${edits.length ? ` (${edits.length})` : ''}</h2><p class="hint">Earlier content preserved on this computer for this file. Restore an earlier edit without losing the content currently saved.</p>${secondary('refreshHistory', 'Refresh earlier edits')}<p class="hint">Refresh to show edits saved since this screen opened.</p>${edits.length ? `<ul class="work-list">${edits.map(edit => {
    const date = new Date(edit.at);
    const label = Number.isNaN(date.getTime()) ? edit.at : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return `<li><span><time datetime="${escape(edit.at)}">${escape(label)}</time><small>${escape(edit.path)}</small></span>${secondary('restoreEdit', `Restore edit from ${label}`, `data-id="${escape(edit.id)}"`)}</li>`;
  }).join('')}</ul>` : '<p class="hint">Earlier saved text will appear here after Refresh.</p>'}</section>`;
}
function edit(state: GuidedState): { title: string; hint: string; html: string; primary: Primary } {
  const editor = state.editor;
  const targets = [['portable', 'Portable'], ['claude', 'Claude'], ['codex', 'Codex'], ['gemini', 'Gemini'], ['copilot', 'GitHub Copilot']];
  return {
    title: state.active?.name ?? 'Edit your skill', hint: 'Your changes save automatically. When you are ready, Build / Share checks the files and prepares your package.',
    html: `${skillIdentity(state)}<div class="edit-toolbar"><div class="field target-field"><label for="target">Intended assistant</label><select id="target" name="target" aria-describedby="target-help" ${state.busy ? 'disabled' : ''}>${targets.map(([value, label]) => `<option value="${value}" ${value === state.target ? 'selected' : ''}>${label}</option>`).join('')}</select><p class="hint" id="target-help">Portable works as the general format. This choice does not run an assistant.</p></div><div class="save-controls"><span id="save-status" aria-live="off">Saved locally</span>${secondary('save', 'Save now', `id="save-button" ${!editor || editor.readOnly ? 'disabled data-unavailable="true"' : ''}`)}<button type="button" class="secondary" data-action="save" id="retry-save" ${state.error ? '' : 'hidden'}>Retry save</button><button type="button" class="secondary" data-action="reloadFile" id="reload-file" ${state.error ? '' : 'hidden'}>Reload saved file</button></div></div>
      <div class="editor-layout"><aside class="file-panel" aria-labelledby="files-heading"><h2 id="files-heading">Files</h2>${editor ? `<a href="#editorContent" class="editor-skip">Skip file list and ${editor.readOnly ? 'inspect' : 'edit'} selected file</a>` : ''}<ul class="file-list">${state.files.map(file => `<li><button type="button" class="file-button ${file.path === editor?.path ? 'selected' : ''}" data-action="openFile" data-path="${escape(file.path)}" ${file.path === editor?.path ? 'aria-current="true"' : ''}><span>${escape(file.path)}</span><small>${file.text ? 'Text' : 'Binary — preserved'} · ${file.size} bytes</small></button></li>`).join('')}</ul>
      <section class="file-tools"><h3>Add a file</h3><form id="add-file-form" action="#" method="post" data-form-action="addFile">${field('addFilePath', 'Destination inside this skill (optional)', '', 'autocomplete="off" autocapitalize="off" spellcheck="false"', 'For example references/rules.md. Leave blank to keep the selected filename under references/.')}<button type="submit" class="secondary">Choose file to add</button></form></section>
      <section class="file-tools"><h3>New text file</h3><form id="new-file-form" action="#" method="post" data-form-action="createFile">${field('newFilePath', 'File path inside this skill (required)', '', 'required autocomplete="off" autocapitalize="off" spellcheck="false"', 'For example references/report-format.md. Existing files are not overwritten.')}<button type="submit" class="secondary">Create file</button></form></section></aside>
      <section class="editor-panel" aria-labelledby="editor-heading"><h2 id="editor-heading">${escape(editor?.path ?? 'Select a file to edit')}</h2>${editor ? `<label for="editorContent" class="visually-hidden">Content of ${escape(editor.path)}</label><textarea id="editorContent" name="editorContent" class="code-editor" data-editor-path="${escape(editor.path)}" ${editor.readOnly ? 'readonly data-read-only="true"' : ''} spellcheck="false" autocomplete="off" aria-describedby="editor-help">${escape(editor.content)}</textarea><p class="hint" id="editor-help">${editor.readOnly ? 'This file is binary or read-only. Its original bytes are preserved; it will not be saved as text.' : 'You are editing the complete file. Tab moves to the next control. No scripts or AI models are run by this editor.'}</p>` : '<p>Choose a text file from Skill files. Binary supporting files remain included without being edited.</p>'}${earlierEdits(state)}</section></div>`,
    primary: { label: 'Build / Share', action: 'preparePublish', disabled: !state.active }
  };
}
function findings(title: string, values: { message: string; file?: string }[], className: string, actionable = true): string {
  return `<section class="card ${className}"><h2>${escape(title)} (${values.length})</h2>${values.length ? `<ul class="findings">${values.map(item => `<li><span>${escape(item.message)}</span>${actionable && item.file ? secondary('openFile', `Fix ${item.file}`, `data-path="${escape(item.file)}"`) : ''}</li>`).join('')}</ul>` : '<p>No findings in this category.</p>'}</section>`;
}
function check(state: GuidedState): { title: string; hint: string; html: string; primary: Primary } {
  const result = state.check;
  const passed = !!result?.valid;
  return {
    title: passed ? 'Ready to build' : 'Fix these before building',
    hint: passed ? 'Your files passed the structural check.' : 'Choose a file below to fix it. Your work is saved.',
    html: `${findings('Errors', result?.errors ?? [], 'error-card')}${result?.warnings.length ? findings('Notes', result.warnings, '', false) : ''}<p class="hint">This checks file structure. It does not run an assistant or scan for security threats.</p>`,
    primary: passed ? { label: 'Build / Share', action: 'preparePublish' } : { label: 'Return to editor', action: 'edit' }
  };
}
function publish(state: GuidedState): { title: string; hint: string; html: string; primary: Primary } {
  const connection = state.configurationError ? undefined : state.connection;
  const details = state.publish;
  const reviewSupported = details?.reviewSupported !== false;
  const version = details?.version ?? '1.0.0';
  const override = state.form?.version ?? '';
  const changelog = state.form?.changelog ?? details?.changelog ?? '';
  const mode = selectedExportMode(state);
  const noun = mode === 'plugin' ? 'plugin' : mode === 'both' ? 'packages' : 'skill';
  const localSaveLabel = mode === 'plugin' ? 'Build plugin ZIP' : mode === 'both' ? 'Build both packages' : 'Build skill package';
  return {
    title: 'Build / Share', hint: connection ? `Build your ${noun} and upload it in one action, or save it on this computer.` : `Build your ${noun} on this computer. Connect a repository whenever you want to upload.`,
    html: `<div class="build-layout"><section class="card build-main"><form id="publish-form" action="#" method="post" novalidate data-form-action="${connection ? 'publish' : 'savePackage'}"><fieldset ${state.busy ? 'disabled' : ''}><legend class="visually-hidden">Build and share</legend>
      ${exportChoices(state)}
      <section class="release-notes-field"><h2>Release notes</h2>${textField('releaseChangelog', 'Add a note (optional)', changelog, 'rows="2"', 'Leave blank to use automatic notes.')}</section>
      ${mode === 'portable' ? `<div class="release-number"><p>Version <strong id="managed-version">${escape(version)}</strong> · chosen automatically</p>${field('releaseVersion', 'Use a different version (optional)', override, 'autocomplete="off" autocapitalize="off" spellcheck="false"', 'Leave blank to keep the suggested version. Reusing a version replaces its Git folder; history and recovery copies preserve earlier content.')}</div>` : ''}
      ${connection && reviewSupported ? reviewerPicker(state) : ''}
      </fieldset></form></section>
      <aside class="build-summary"><section class="card"><h2>${connection ? 'Upload destination' : 'Save on this computer'}</h2>${connection ? `<p class="destination">${escape(connection.repository)}</p><p>Branch: <strong>${escape(connection.baseBranch || 'Checked before upload')}</strong></p><p class="hint">${reviewSupported ? 'Builds the package, uploads it, and opens a pull request. Nothing is merged automatically.' : 'Builds the package and uploads it. This repository has no automatic pull request support.'}</p>` : `<p>No GitHub connection is required to build.</p><div class="button-row">${secondary('openSettings', 'Connect a repository')}${secondary('connectGitHub', 'Sign in to GitHub')}</div>`}<p class="hint">${details?.fileCount ?? state.files.length} files. Original files and earlier versions are preserved.</p>${details?.versionWarning ? `<p class="warning">${escape(details.versionWarning)}</p>` : ''}<p class="hint">Saving a ZIP does not install it in Claude or prove application compatibility.</p></section>${mode === 'portable' ? changeSummary(state) : ''}</aside></div>
      ${compatibilityReport(details?.compatibility, true)}`,
    primary: { label: connection ? `Build & upload ${noun}` : localSaveLabel, form: 'publish-form', disabled: !details }
  };
}
function exportChoices(state: GuidedState): string {
  const options = state.exportOptions;
  const mode = selectedExportMode(state);
  const plugin = mode !== 'portable';
  const pluginVersion = options?.pluginVersion ?? '1.0.0';
  const candidates = options?.members ?? [
    ...(state.active ? [{ id: state.active.id, name: state.active.name, version: state.active.version, selected: true }] : []),
    ...state.drafts.filter(draft => draft.id !== state.active?.id).map(draft => ({ ...draft, selected: false, version: undefined }))
  ];
  const pluginField = (id: string, label: string, value: string, required = false, hint = '') => field(id, label, value,
    `${required ? 'data-plugin-required' : ''} ${plugin && required ? 'required' : ''} ${!plugin ? 'disabled' : ''} ${id === 'pluginName' || id === 'pluginVersion' ? 'data-export-option' : ''} autocomplete="off"`, hint);
  return `<fieldset class="export-options"><legend>Build</legend>
    <div class="field"><label for="exportMode">Package type</label><select id="exportMode" name="exportMode" data-persist data-export-option aria-describedby="export-mode-help">${[['portable', 'Skill package (.skill)'], ['plugin', 'Claude plugin ZIP'], ['both', 'Both skill package and plugin ZIP']].map(([value, label]) => `<option value="${value}" ${mode === value ? 'selected' : ''}>${label}</option>`).join('')}</select><p id="export-mode-help" class="hint">Choose a skill, a Claude plugin, or both.</p></div>
    <fieldset id="plugin-options" ${!plugin ? 'hidden' : ''}><legend>Your plugin</legend>
      <div class="metadata-grid">${pluginField('pluginName', 'Plugin name (required)', options?.pluginName ?? state.active?.name ?? '', true, 'Use lowercase words joined by hyphens, for example team-tools.')}
      ${pluginField('pluginVersion', 'Version (required)', pluginVersion, true, 'A version is filled in for you. Keep it unless you need a specific version.')} </div>${pluginField('pluginDescription', 'What does the plugin do? (required)', options?.pluginDescription ?? '', true)}
      <fieldset aria-describedby="plugin-members-help"><legend>Skills to include</legend><p id="plugin-members-help" class="hint">Select the skills for this plugin. Their supporting files are included.</p>
      ${candidates.map((member, index) => `<label class="export-choice" for="plugin-member-${index}"><input id="plugin-member-${index}" type="checkbox" name="pluginMembers" value="${escape(member.id)}" data-persist data-export-option ${member.selected || member.id === state.active?.id ? 'checked' : ''} ${member.id === state.active?.id ? 'data-current-member disabled' : !plugin ? 'disabled' : ''}> <span>${escape(member.name)}${member.version ? ` — ${escape(member.version)}` : ''}${member.id === state.active?.id ? ' (current skill)' : ''}</span></label>`).join('')}
      </fieldset><div class="publisher-section"><button type="button" class="secondary" data-open-dialog="publisher-dialog">Edit publisher details (optional)</button><dialog id="publisher-dialog" aria-labelledby="publisher-dialog-heading"><h2 id="publisher-dialog-heading">Publisher details</h2><p class="hint">These details are optional. Your plugin can be built without them.</p><div id="plugin-publisher-details" class="metadata-grid">
      ${pluginField('pluginAuthor', 'Author (optional)', options?.pluginAuthor ?? '')}
      ${pluginField('pluginLicense', 'License (optional)', options?.pluginLicense ?? '', false, 'Only grant licensing terms you are authorized to use.')}
      ${pluginField('pluginIcon', 'Icon path inside the plugin (optional)', options?.pluginIcon ?? '', false, 'For example ./skills/name/assets/logo.png. The image must already be included.')}
      ${pluginField('pluginPrivacyPolicyUrl', 'Privacy policy URL (optional)', options?.pluginPrivacyPolicyUrl ?? '', false, 'Needed for a public directory listing if the plugin sends data to a remote server.')}
      ${pluginField('pluginDocumentationUrl', 'Documentation URL (optional)', options?.pluginDocumentationUrl ?? '')}
      ${pluginField('pluginSupportUrl', 'Support URL (optional)', options?.pluginSupportUrl ?? '')}</div><button type="button" class="primary" data-close-dialog="publisher-dialog">Keep details</button></dialog></div>
    </fieldset>
    <section class="gemini-option"><label class="export-choice" for="geminiZip"><input id="geminiZip" type="checkbox" name="geminiZip" aria-describedby="gemini-export-help" data-persist data-export-option ${options?.geminiZip ? 'checked' : ''}> <span>Also save a Gemini App import ZIP</span></label><p class="hint" id="gemini-export-help">Checks Gemini App file and size limits. Import and runtime behavior still need testing in your account.</p></section>
  </fieldset>`;
}
function compatibilityReport(reports: ExportCompatibility[] | undefined, optional = false): string {
  if (!reports?.length) return '';
  const directory = optional ? reports.filter(report => /public directory/i.test(report.target)) : [];
  const findings = reports.filter(report => report.issues.length && !directory.includes(report));
  return `<section id="export-compatibility-details" class="card compatibility-report" aria-labelledby="compatibility-heading"><h2 id="compatibility-heading">Package checks</h2>${findings.length ? findings.map(report => `<h3>${escape(report.target)}</h3><ul>${report.issues.map(issue => `<li>${escape(issue)}</li>`).join('')}</ul>`).join('') : '<p>No documented structural conflicts found for the selected package.</p>'}<p class="hint">Application import and runtime behavior have not been tested by SkillJetty.</p>${directory.length ? `<button type="button" class="secondary" data-open-dialog="directory-report-dialog">View optional public-directory report</button><dialog id="directory-report-dialog" aria-labelledby="directory-report-heading"><h2 id="directory-report-heading">Public-directory report</h2><p>These requirements apply if you submit to a public directory. They do not block a private local ZIP.</p>${directory.map(report => `<h3>${escape(report.target)}</h3>${report.issues.length ? `<ul>${report.issues.map(issue => `<li>${escape(issue)}</li>`).join('')}</ul>` : '<p>No documented structural conflicts found.</p>'}`).join('')}<button type="button" class="primary" data-close-dialog="directory-report-dialog">Close report</button></dialog>` : ''}</section>`;
}
function artifactReceipts(state: GuidedState): string {
  const artifacts = state.receipt?.artifacts;
  if (!artifacts?.length) return '';
  return `<section class="card" aria-labelledby="export-results-heading"><h2 id="export-results-heading">Export results</h2><ul class="artifact-results">${artifacts.map(artifact => `<li><strong>${escape(artifact.label)}${artifact.version ? ` ${escape(artifact.version)}` : ''}</strong>${artifact.status ? ` — ${escape(artifact.status)}` : ''}${artifact.path ? `<p class="detail"><code>${escape(artifact.path)}</code></p>${secondary('revealPackage', `Show ${artifact.label} in folder`, `data-path="${escape(artifact.path)}"`)}` : ''}${artifact.url ? `<p>${verifiedLink(artifact.url, `Open ${artifact.label}`)}</p>` : ''}${artifact.reviewUrl ? `<p>${verifiedLink(artifact.reviewUrl, `Review ${artifact.label} PR`)}</p>` : ''}${artifact.error ? `<p class="error-message">${escape(artifact.error)}. Keep this receipt and retry only the incomplete action.</p>` : ''}</li>`).join('')}</ul></section>${compatibilityReport(state.receipt?.compatibility)}`;
}
function verifiedLink(url: string | undefined, label: string): string {
  if (!url) return `<span class="unavailable">${escape(label)} — link unavailable</span>`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Unsafe link');
    return `<a href="${escape(parsed.href)}" data-action="openLink" data-url="${escape(url)}">${escape(label)} <span aria-hidden="true">↗</span></a>`;
  } catch { return `<span class="unavailable">${escape(label)} — link unavailable</span>`; }
}
function done(state: GuidedState): { title: string; hint: string; html: string; primary: Primary } {
  const receipt = state.receipt;
  const pr = receipt?.pr;
  const exportNeedsAttention = receipt?.artifacts?.some(artifact => artifact.status === 'failed' || !!artifact.error);
  if (receipt?.local) return {
    title: `${receipt.name} ${receipt.version} — saved on this computer`,
    hint: 'Your installable package is ready. You can use it in your chosen tool, share the file, or continue improving the draft.',
    html: `<section class="card done-card"><p class="result-badge pass"><span aria-hidden="true">✓</span> Package saved locally</p><p>${escape(receipt.note)}</p>${receipt.packagePath ? `<p class="detail"><strong>Package:</strong> <code>${escape(receipt.packagePath)}</code></p>${secondary('revealPackage', 'Show package in folder', receipt.artifacts?.length ? `data-path="${escape(receipt.packagePath)}"` : '')}` : ''}<p>Your editable draft and earlier edits remain available. This saved release stays unchanged when you continue editing.</p></section>${artifactReceipts(state)}<div class="button-row">${secondary('startAnother', 'Start another skill')}</div>`,
    primary: state.active ? { label: 'Continue improving', action: 'resume', id: state.active.id } : { label: 'Start another skill', action: 'startAnother' }
  };
  return {
    title: receipt ? `${receipt.name} ${receipt.version} — ${exportNeedsAttention ? 'submission needs attention' : pr?.number ? `${pr.error && pr.status !== 'unknown' ? 'last verified: ' : ''}${reviewLabel(pr)}` : 'uploaded'}` : 'No submission receipt is available',
    hint: receipt ? 'Your upload is preserved. Check the PR status below; approval alone does not mean merged. You can start another skill while review continues.' : 'Return to Start to resume a saved draft or inspect your version library.',
    html: `${receipt ? pullRequestPanel(pr, receipt.directory) : ''}<section class="card done-card"><p class="result-badge ${receipt && !exportNeedsAttention ? 'pass' : 'warning'}"><span aria-hidden="true">${receipt && !exportNeedsAttention ? '✓' : '!'}</span> ${exportNeedsAttention ? 'Submission needs attention — inspect each export result' : receipt ? 'Version upload verified' : 'No verified upload recorded'}</p><p>${escape(receipt?.note ?? 'No submission receipt is available yet.')}</p>
      <ul class="receipt-links"><li>${verifiedLink(receipt?.sourceUrl, 'Open editable source')}</li><li>${verifiedLink(receipt?.packageUrl, receipt?.artifacts?.some(artifact => artifact.kind === 'plugin') ? 'Open primary package' : 'Open .skill package')}</li><li>${verifiedLink(receipt?.changelogUrl, 'Open CHANGELOG.md')}</li><li>${verifiedLink(receipt?.reviewUrl, 'Open uploaded branch or comparison')}</li></ul>${artifactReceipts(state)}
      ${receipt?.branch ? `<p class="detail"><strong>Review branch:</strong> ${escape(receipt.branch)}</p>` : ''}${receipt?.commit ? `<p class="detail"><strong>Verified upload commit:</strong> ${escape(receipt.commit)}</p>` : ''}
      ${receipt?.cleanupError ? `<p class="warning"><span aria-hidden="true">!</span> The upload succeeded, but local completion needs attention: ${escape(receipt.cleanupError)}. Your remaining draft is retained. Do not upload again to fix local completion.</p>` : '<p>Your release history remains available under Saved releases on Start. Choose Improve to continue from a release in a separate draft.</p>'}${receipt ? `<div class="button-row">${secondary('checkPullRequests', 'Check all PRs')}</div>` : ''}</section>`,
    primary: { label: 'Start another skill', action: 'startAnother' }
  };
}

const styles = `
  .export-options { margin-block: .6rem 1rem; } .export-choice { display: flex; align-items: start; gap: .6rem; margin-block: .7rem; overflow-wrap: anywhere; } .export-choice input { flex: none; inline-size: 1.2rem; min-block-size: 1.2rem; block-size: 1.2rem; margin-block-start: .2rem; } .artifact-results { padding-inline-start: 1.4rem; } .artifact-results > li { margin-block: 1rem; } #plugin-options[hidden] { display: none; }
  .activity-status { position: sticky; inset-block-start: 0; z-index: 3; display: flex; align-items: center; gap: .7rem; min-block-size: 3rem; padding: .6rem .8rem; margin-block: 0 1rem; border: 1px solid var(--vscode-panel-border, GrayText); border-radius: .35rem; background: var(--vscode-editor-background, Canvas); overflow-wrap: anywhere; } .activity-status[data-working="true"] { border-color: var(--vscode-focusBorder, Highlight); } .activity-indicator { flex: none; appearance: none; inline-size: 1.15rem; block-size: 1.15rem; border: .16rem solid var(--vscode-panel-border, GrayText); border-block-start-color: var(--vscode-focusBorder, Highlight); border-radius: 50%; background: transparent; animation: activity-spin 1s linear infinite; } .activity-indicator::-webkit-progress-bar { display: none; } .activity-indicator::-webkit-progress-value { display: none; } .activity-indicator::-moz-progress-bar { display: none; } @keyframes activity-spin { to { transform: rotate(1turn); } } @media (prefers-reduced-motion: reduce) { .activity-indicator { animation: none; border-style: dotted; } } @media (forced-colors: active) { .activity-status[data-working="true"] { border-color: Highlight; } .activity-indicator { border-color: CanvasText; border-block-start-color: Highlight; } }
  .activity-status { display: block; } .activity-current { display: flex; align-items: center; gap: .7rem; } .activity-current > div { min-inline-size: 0; } .activity-heading { margin: 0 0 .35rem; font-size: .85rem; } .activity-history { max-block-size: min(8rem, 22vh); overflow-y: auto; overscroll-behavior: contain; padding-inline-start: 1.5rem; margin-block: .5rem 0; font-size: .85rem; scrollbar-gutter: stable; } .activity-history li { padding: .2rem .3rem; overflow-wrap: anywhere; } .activity-history li[data-status="succeeded"] { border-inline-start: 2px solid var(--vscode-testing-iconPassed, #55a66a); } .activity-history li[data-status="failed"] { border-inline-start: 2px solid var(--vscode-errorForeground, #be3f3f); } .activity-history li[data-status="running"], .activity-history li[data-status="waiting"] { border-inline-start: 2px solid var(--vscode-focusBorder, Highlight); } #operation-status:focus-visible, .activity-history:focus-visible { outline: 3px solid var(--vscode-focusBorder, Highlight); outline-offset: 2px; } @media (max-height: 500px) { .activity-history { max-block-size: 4rem; } } #activity-details { font-size: .85rem; color: var(--vscode-descriptionForeground, GrayText); } .repository-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); gap: .75rem 1.2rem; } .repository-actions .hint { margin-block: .4rem 0; } .action-help { margin-block: .3rem .7rem; } .action-help dt { font-weight: 650; } .action-help dd { margin: .2rem 0 .8rem; } .setup-tools { margin-block: .5rem 1rem; }
  .identity-strip { border-inline-start: .25rem solid var(--vscode-focusBorder, Highlight); padding: .2rem 1rem; margin-block: 0 1.2rem; overflow-wrap: anywhere; } .identity-strip p { margin-block: .3rem; } .managed-release strong { font-variant-numeric: tabular-nums; } .release-notes { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; background: var(--vscode-textBlockQuote-background, var(--vscode-editor-inactiveSelectionBackground, ButtonFace)); padding: .75rem; border-radius: .25rem; } .change-files { padding-inline-start: 1.4rem; } .change-files li { overflow-wrap: anywhere; } .edit-history .work-list { max-block-size: 20rem; overflow: auto; }
  html { scroll-padding-block: calc(var(--activity-height, 8rem) + 1rem) 7rem; } :where(button, a, input, select, textarea, summary, [tabindex]) { scroll-margin-block: 1rem 7rem; }
  :root { color-scheme: light dark; font-family: var(--vscode-font-family, system-ui, sans-serif); color: var(--vscode-editor-foreground, CanvasText); background: var(--vscode-editor-background, Canvas); font-size: var(--vscode-font-size, 14px); line-height: 1.55; }
  * { box-sizing: border-box; } body { margin: 0; } button, input, select, textarea { font: inherit; } button, input, select { min-block-size: 2.6rem; } button { appearance: none; color: var(--vscode-button-secondaryForeground, ButtonText); background: var(--vscode-button-secondaryBackground, ButtonFace); cursor: pointer; border: 1px solid currentColor; border-radius: .35rem; padding: .6rem .95rem; } button:disabled { cursor: not-allowed; opacity: .6; border-style: dashed; } input, select, textarea { inline-size: 100%; padding: .65rem .75rem; color: var(--vscode-input-foreground, CanvasText); background: var(--vscode-input-background, Canvas); border: 1px solid currentColor; border-radius: .25rem; } textarea { resize: vertical; min-block-size: 6rem; } :where(button, a, input, select, textarea, summary):focus-visible { outline: 3px solid var(--vscode-focusBorder, Highlight); outline-offset: 3px; } input:user-invalid, textarea:user-invalid { border-color: var(--vscode-inputValidation-errorBorder, #be3f3f); } a { color: var(--vscode-textLink-foreground, LinkText); } a:hover { color: var(--vscode-textLink-activeForeground, LinkText); } h1 { font-size: clamp(1.6rem, 3vw, 2.15rem); line-height: 1.2; margin: .4rem 0 .75rem; font-weight: 650; letter-spacing: -.025em; } h2 { font-size: 1.12rem; line-height: 1.35; margin: 0 0 .75rem; } h3 { font-size: 1rem; margin-block: 1.2rem .6rem; } p { margin-block: .45rem .9rem; } [hidden] { display: none !important; }
  .shell { max-inline-size: 1120px; margin-inline: auto; padding: 0 clamp(1rem, 3.3vw, 2.7rem); } .shell > header { padding-block-start: .5rem; } .brand { font-size: .92rem; color: var(--vscode-descriptionForeground, GrayText); letter-spacing: .04em; }
  .card { padding: 1.3rem; border: 1px solid var(--vscode-panel-border, GrayText); border-radius: .55rem; margin-block-end: 1rem; } .hint, small { color: var(--vscode-descriptionForeground, GrayText); font-size: .9rem; } .field { margin-block-end: 1.2rem; } label, legend { font-weight: 600; } .field label { display: block; margin-block-end: .35rem; } .field .hint { margin-block: 0 .4rem; } fieldset { border: 0; padding: 0; margin: 0; min-inline-size: 0; } .button-row { display: flex; flex-wrap: wrap; gap: .6rem; } .secondary { color: var(--vscode-button-secondaryForeground, ButtonText); background: var(--vscode-button-secondaryBackground, ButtonFace); border-color: currentColor; border-color: color-mix(in srgb, currentColor 70%, transparent); } .secondary:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground, ButtonFace)); } .primary { background: #0b635d; color: #ffffff; border: 2px solid var(--workbench-accent, #0b635d); min-inline-size: 13rem; font-weight: 650; } .primary:hover:not(:disabled) { background: #0a746b; }
  .action-bar { position: sticky; inset-block-end: 0; display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-block-start: 1.6rem; padding: 1rem 0 1.3rem; background: var(--vscode-editor-background, Canvas); border-block-start: 1px solid var(--vscode-panel-border, GrayText); } .action-bar .primary { margin-inline-start: auto; } .optional { margin-block: 1rem; } summary { cursor: pointer; padding: .6rem .1rem; font-weight: 600; } details > form, details > .card { margin-block-start: .75rem; } .connected-strip, .connection { overflow-wrap: anywhere; } .connected-strip { display: flex; gap: .65rem; align-items: baseline; border: 1px solid var(--vscode-testing-iconPassed, #55a66a); padding: .75rem 1rem; margin-block-end: 1rem; border-radius: .35rem; } .visibility { margin-block: .8rem; } .visibility label { display: flex; gap: .5rem; align-items: center; font-weight: 400; padding-block: .35rem; } input[type=radio] { inline-size: 1.1rem; min-block-size: 1.1rem; flex: none; accent-color: var(--vscode-focusBorder, Highlight); }
  .work-list, .file-list, .receipt-links { padding: 0; list-style: none; } .work-list li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .8rem 0; border-block-end: 1px solid var(--vscode-panel-border, GrayText); } .work-list small { display: block; } .saved-work { margin-block: 1.6rem; } .edit-toolbar { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 1.2rem; margin-block-end: 1rem; } .target-field { max-inline-size: 25rem; margin: 0; } .save-controls { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; } .editor-layout { display: grid; grid-template-columns: minmax(12rem, 17rem) minmax(0, 1fr); gap: 1.1rem; } .file-panel { border: 1px solid var(--vscode-panel-border, GrayText); border-radius: .4rem; padding: 1rem; min-inline-size: 0; } .file-list { margin: .5rem 0 1.2rem; max-block-size: 25rem; overflow: auto; } .file-button { display: block; text-align: start; inline-size: 100%; background: transparent; color: inherit; padding: .6rem; overflow-wrap: anywhere; border: 1px solid transparent; } .file-button small { display: block; } .file-button:hover:not(:disabled) { background: var(--vscode-list-hoverBackground, ButtonFace); } .file-button.selected { background: var(--vscode-list-inactiveSelectionBackground, ButtonFace); border-color: var(--vscode-focusBorder, Highlight); } .editor-panel { min-inline-size: 0; } .code-editor { font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 14px); line-height: 1.6; min-block-size: 30rem; tab-size: 2; white-space: pre; overflow: auto; } .findings li { margin-block-end: .8rem; overflow-wrap: anywhere; } .findings button { margin: .4rem 0 0 .5rem; } .result-badge { display: inline-flex; gap: .5rem; padding: .5rem .8rem; border: 1px solid currentColor; border-radius: .3rem; font-weight: 600; } .pass { color: var(--vscode-editor-foreground, CanvasText); border-color: var(--vscode-testing-iconPassed, #55a66a); } .pass > [aria-hidden="true"] { color: var(--vscode-testing-iconPassed, #55a66a); } .warning { color: var(--vscode-editor-foreground, CanvasText); border-color: var(--vscode-editorWarning-foreground, #bc8a27); } .warning > [aria-hidden="true"] { color: var(--vscode-editorWarning-foreground, #bc8a27); } .error-card { border-inline-start: .25rem solid var(--vscode-inputValidation-errorBorder, #be3f3f); } .feedback { margin-block: .5rem 1rem; overflow-wrap: anywhere; } .feedback:empty { margin: 0; } .error-message { border-inline-start: .25rem solid var(--vscode-inputValidation-errorBorder, #be3f3f); background: var(--vscode-inputValidation-errorBackground, ButtonFace); padding: .75rem 1rem; color: var(--vscode-errorForeground, CanvasText); } .notice-message { border-inline-start: .25rem solid var(--vscode-focusBorder, Highlight); padding: .5rem 1rem; } .package-summary { padding: 0; list-style: none; } .package-summary li { display: flex; gap: .65rem; padding-block: .5rem; } .receipt-links li { margin-block: .6rem; } .receipt-links a { display: inline-block; padding-block: .35rem; font-weight: 600; } .detail { overflow-wrap: anywhere; } .unavailable { color: var(--vscode-descriptionForeground, GrayText); } .skip-link { position: absolute; inset-inline-start: 1rem; inset-block-start: -5rem; padding: .6rem; background: var(--vscode-editor-background, Canvas); z-index: 10; } .skip-link:focus { inset-block-start: .5rem; } .visually-hidden { position: absolute; inline-size: 1px; block-size: 1px; clip-path: inset(50%); overflow: hidden; white-space: nowrap; }
  :root { --workbench-accent: #0b635d; } .brand-lockup { display: flex; align-items: center; gap: 1rem; margin-block: .3rem 1.4rem; min-inline-size: 0; } .brand-logo { inline-size: 64px; block-size: 64px; object-fit: contain; flex: none; } .brand-wordmark { min-inline-size: 0; } .brand-company { display: block; color: var(--workbench-accent); font-size: .78rem; line-height: 1.5; font-weight: 750; letter-spacing: .16em; } .brand-product { display: block; color: var(--vscode-editor-foreground, CanvasText); font-size: clamp(1.3rem, 2.3vw, 1.8rem); font-weight: 700; line-height: 1.2; letter-spacing: -.025em; margin: .08rem 0 .2rem; overflow-wrap: anywhere; } .brand-tagline { display: block; color: var(--vscode-descriptionForeground, GrayText); font-size: .85rem; line-height: 1.4; }
  @media (prefers-color-scheme: dark) { :root { --workbench-accent: #67c3b8; } } body.vscode-light, body.vscode-high-contrast-light { color-scheme: light; --workbench-accent: #0b635d; } body.vscode-dark, body.vscode-high-contrast { color-scheme: dark; --workbench-accent: #67c3b8; }
  .editor-skip { position: absolute; inline-size: 1px; block-size: 1px; clip-path: inset(50%); overflow: hidden; white-space: nowrap; } .editor-skip:focus { position: static; display: block; inline-size: auto; block-size: auto; clip-path: none; overflow: visible; white-space: normal; padding: .5rem; margin-block-end: .5rem; }
  .header-heading { display: flex; align-items: start; justify-content: space-between; gap: 1rem; } .header-tools { flex: none; } #activity-timing { margin-block: .2rem 0; } #activity-timing > summary { font-size: .8rem; padding-block: .3rem; }
  .start-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: .8rem; } .start-option { min-inline-size: 0; } .start-choices button { inline-size: 100%; min-block-size: 3.5rem; font-weight: 650; } .start-option .hint { margin: .6rem .15rem 0; } .start-card .start-choices button { background: #0b635d; color: #fff; border-color: #0b635d; } .start-card .start-choices button:hover:not(:disabled) { background: #084f4b; }
  .account-strip { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .5rem 1rem; padding-block-end: .9rem; border-block-end: 1px solid var(--vscode-panel-border, GrayText); } .account-strip p { margin: .1rem 0 0; overflow-wrap: anywhere; } .account-strip .hint { flex-basis: 100%; }
  @media (max-width: 760px) { .editor-layout { grid-template-columns: 1fr; } .file-list { max-block-size: 12rem; } .code-editor { min-block-size: 24rem; } .work-list li { align-items: start; flex-direction: column; gap: .5rem; } .action-bar { align-items: stretch; } .action-bar .primary { min-inline-size: 0; flex: 1; } }
  @media (pointer: coarse) { button, input, select, summary { min-block-size: 3rem; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
  /* Control boundaries must remain visible even when a theme intentionally uses a transparent secondary fill or leaves optional border tokens empty. */
  input, select, textarea { border-color: currentColor; border-color: color-mix(in srgb, currentColor 70%, transparent); }
  .file-button.selected { background: var(--vscode-list-inactiveSelectionBackground, transparent); color: var(--vscode-list-inactiveSelectionForeground, var(--vscode-editor-foreground, CanvasText)); }
  .file-button.selected small { color: inherit; }
  .error-message { color: var(--vscode-editor-foreground, CanvasText); background: var(--vscode-inputValidation-errorBackground, var(--vscode-editor-background, Canvas)); }
  body.vscode-high-contrast .primary, body.vscode-high-contrast-light .primary { background: var(--vscode-button-background, ButtonFace); color: var(--vscode-button-foreground, ButtonText); border-color: currentColor; }
  body.vscode-high-contrast .primary:hover:not(:disabled), body.vscode-high-contrast-light .primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground, ButtonFace); }
  body.vscode-high-contrast .secondary, body.vscode-high-contrast-light .secondary, body.vscode-high-contrast input, body.vscode-high-contrast select, body.vscode-high-contrast textarea, body.vscode-high-contrast-light input, body.vscode-high-contrast-light select, body.vscode-high-contrast-light textarea { border-color: currentColor; }
  @media (forced-colors: active) { .card, .file-panel, .connected-strip, .next-step, button, input, select, textarea, .result-badge { border-color: CanvasText; } :where(button, a, input, select, textarea, summary):focus-visible { outline-color: Highlight; } .primary { forced-color-adjust: auto; background: Highlight; color: HighlightText; border-color: Highlight; } .brand-company { color: CanvasText; } .next-step { border-inline-start-color: Highlight; } }
  .shell { max-inline-size: 1320px; padding-inline: clamp(1rem, 3vw, 2.5rem); }
  .action-bar { inset-block-start: calc(var(--activity-height, 4rem) + .3rem); inset-block-end: auto; z-index: 2; margin-block: .8rem 1rem; padding-block: .65rem; }
  dialog { color: inherit; background: var(--vscode-editor-background, Canvas); border: 1px solid var(--vscode-panel-border, GrayText); border-radius: .5rem; padding: 1.5rem; inline-size: min(95vw, 48rem); max-block-size: 85vh; overflow: auto; } dialog::backdrop { background: rgb(0 0 0 / .55); } #choose-home { background: #0b635d; color: white; }
  .project-nav { display: flex; gap: .3rem; margin-block: .2rem 1rem; border-block-end: 1px solid var(--vscode-panel-border, GrayText); }
  .nav-button { background: transparent; color: inherit; border: 0; border-block-end: 3px solid transparent; border-radius: 0; padding: .65rem 1rem; }
  .nav-button[aria-current="page"] { border-color: var(--workbench-accent); font-weight: 700; }
  .project-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: .65rem 1.4rem; padding: .9rem 1rem; border: 1px solid var(--vscode-panel-border, GrayText); border-radius: .45rem; margin-block-end: 1.6rem; background: var(--vscode-sideBar-background, transparent); }
  .project-strip > div { min-inline-size: 0; } .project-strip strong, .project-strip small { display: block; overflow-wrap: anywhere; } .project-strip .hint:empty { display: none; } .project-strip > .hint { grid-column: 1 / -1; margin: 0; }
  .eyebrow { display: block; color: var(--vscode-descriptionForeground, GrayText); font-size: .8rem; margin-block-end: .15rem; } .project-actions { align-self: center; } .project-actions small { margin-block-start: .3rem; }
  .home-actions { display: flex; flex-wrap: wrap; gap: .6rem; padding-block: .25rem 1rem; } .home-actions > button:first-child { background: #0b635d; color: #fff; border-color: #0b635d; } .home-actions button { min-inline-size: 8rem; }
  .section-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-block-end: .6rem; } .section-heading h2 { margin: 0; } .section-heading button { min-block-size: 2.2rem; padding: .35rem .65rem; }
  .skill-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); gap: .8rem; padding: 0; list-style: none; } .skill-grid > li { display: flex; flex-direction: column; align-items: start; justify-content: space-between; gap: .7rem; padding: 1.1rem; border: 1px solid var(--vscode-panel-border, GrayText); border-radius: .5rem; background: var(--vscode-sideBar-background, transparent); overflow-wrap: anywhere; } .skill-grid h3 { margin: .15rem 0; } .skill-grid .hint { margin: .2rem 0; }
  .empty-state { padding: 1.5rem; border: 1px dashed var(--vscode-panel-border, GrayText); border-radius: .4rem; } .version-chip { font-variant-numeric: tabular-nums; color: var(--vscode-descriptionForeground, GrayText); } .screen-hint { max-inline-size: 65rem; color: var(--vscode-descriptionForeground, GrayText); margin-block-end: 1.3rem; }
  .path-form { margin-block-start: 1rem; } .path-form fieldset { display: flex; align-items: end; flex-wrap: wrap; gap: .6rem; } .path-form .field { flex: 1 1 18rem; margin: 0; } .maintenance { margin-block-start: 1.4rem; } .maintenance > .hint { max-inline-size: 65rem; }
  .build-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(16rem, 23rem); gap: 1rem; align-items: start; } .build-main { min-inline-size: 0; } .build-summary { min-inline-size: 0; } .destination { font-weight: 650; overflow-wrap: anywhere; } .build-summary .card { padding: 1rem; } .metadata-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 1rem; } .publisher-section, .release-notes-field, .gemini-option { border-block-start: 1px solid var(--vscode-panel-border, GrayText); padding-block-start: 1rem; margin-block-start: 1rem; } .publisher-section h3 { margin-block-start: 0; } .publisher-section .hint { font-size: .8rem; } .publisher-section input { min-block-size: 2.35rem; } .file-tools { border-block-start: 1px solid var(--vscode-panel-border, GrayText); padding-block-start: .5rem; margin-block-start: .8rem; } .file-tools h3 { margin-block: .25rem .6rem; } .file-tools .field { margin-block-end: .5rem; } .file-tools .hint { font-size: .78rem; } .file-tools button { inline-size: 100%; } .edit-history { margin-block-start: 1.5rem; padding: 1rem; }
  .diagnostic-actions { margin-block-start: .3rem; } .diagnostic-actions .hint { display: none; } .diagnostic-actions button { min-block-size: 1.7rem; padding: .1rem .4rem; font-size: .75rem; } .activity-heading { display: none; } .activity-status { padding: .45rem .7rem; margin-block-end: .7rem; } .activity-history { max-block-size: 4.5rem; } .brand-lockup { margin-block-end: .5rem; } .brand-logo { inline-size: 46px; block-size: 46px; } .brand-product { font-size: 1.4rem; }
  .sync-action { margin-block-start: .35rem; } .sync-action button { min-block-size: 2rem; padding: .25rem .5rem; font-size: .85rem; }
  @media (max-width: 950px) { .build-layout { grid-template-columns: 1fr; } .build-summary { order: -1; } .project-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); } .project-actions { grid-column: 1 / -1; } }
  @media (max-width: 560px) { .project-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); } .build-space-summary { grid-column: 1 / -1; } .metadata-grid { grid-template-columns: 1fr; } .project-nav { gap: 0; } .nav-button { flex: 1; padding-inline: .4rem; } .action-bar { flex-wrap: wrap; gap: .5rem; } .action-bar .primary { flex-basis: 100%; } }

  .activity-status { display: flex; justify-content: space-between; align-items: center; gap: .6rem; }
  .activity-current { flex: 1; min-inline-size: 0; }
  .activity-history-button { flex: none; min-block-size: 2rem; padding: .25rem .5rem; font-size: .8rem; line-height: 1.2; max-inline-size: 7rem; }
  #activity-history-dialog .activity-history { max-block-size: min(55vh, 30rem); margin-block: .7rem 1rem; font-size: .9rem; }
  #activity-history-dialog .diagnostic-actions { margin-block: .6rem 1rem; }
  #activity-history-dialog .diagnostic-actions .hint { display: block; }

`;

const script = `
  const vscode = acquireVsCodeApi();
  const main = document.getElementById('main-content');
  const step = main.dataset.step;
  const activeId = main.dataset.activeId || '';
  const scope = main.dataset.formScope || step;
  let saved = vscode.getState() || {};
  const reviewerContext = main.dataset.reviewerContext || '';
  const reviewerContextChanged = saved.reviewerContext !== reviewerContext;
  let saveTimer;
  let savePending = false;
  let queuedAction;
  let pluginMetadataSequence = 0;
  let pluginVersionEditSequence = 0;
  let pluginMetadataRequest;
  let queuedMetadataAction;
  let lastSavedContent = '';
  let actionPending = main.dataset.busy === 'true';
  let activityTimer;
  let activityMessage = '';
  let activityStarted;
  let lastHostResponse;
  let configurationChanged = false;
  let activityTick;
  const activityDetails = document.getElementById('activity-details');
  const activityStatus = document.getElementById('operation-status');
  const activityIndicator = document.getElementById('operation-indicator');
  const activityOutput = document.getElementById('progress-message');
  const activityHistory = document.getElementById('activity-history');
  let historyInitialized = false;
  let historyGeneration = saved.activityScroll?.generation ?? 0;
  function updateActivityHistory(entries, generation = historyGeneration) {
    if (!activityHistory || !Array.isArray(entries)) return;
    const nextGeneration = Number.isSafeInteger(generation) && generation >= 0 ? generation : historyGeneration;
    const reset = nextGeneration !== historyGeneration;
    const historyVisible = document.getElementById('activity-history-dialog')?.open !== false;
    const follow = reset || (historyInitialized && historyVisible ? activityHistory.scrollHeight - activityHistory.scrollTop - activityHistory.clientHeight < 24 : saved.activityScroll?.follow !== false);
    const position = reset ? 0 : historyInitialized && historyVisible ? activityHistory.scrollTop : saved.activityScroll?.top || 0;
    const labels = { running: 'In progress', waiting: 'Waiting', succeeded: 'Succeeded', failed: 'Needs attention', info: 'Update' };
    const rows = entries.slice(-100).filter(entry => entry && typeof entry.message === 'string' && Object.prototype.hasOwnProperty.call(labels, entry.status)).map(entry => {
      const row = document.createElement('li');
      row.dataset.status = entry.status;
      const label = document.createElement('strong');
      label.textContent = labels[entry.status] + ': ';
      const message = document.createElement('span');
      message.textContent = entry.message;
      row.append(label, message);
      return row;
    });
    activityHistory.replaceChildren(...rows);
    activityHistory.hidden = rows.length === 0;
    if (historyVisible) activityHistory.scrollTop = follow ? activityHistory.scrollHeight : position;
    historyInitialized = true;
    historyGeneration = nextGeneration;
    saved.activityScroll = { top: historyVisible ? activityHistory.scrollTop : position, follow, generation: historyGeneration };
    vscode.setState(saved);
  }
  function focusActivity() {
    if (!activityStatus) return;
    activityStatus.focus({ preventScroll: true });
    if (typeof activityStatus.scrollIntoView === 'function') activityStatus.scrollIntoView({ block: 'start', behavior: 'auto' });
    saved.activityFocus = true;
    vscode.setState(saved);
  }
  updateActivityHistory(initialActivity, initialActivityGeneration);
  if (activityHistory) activityHistory.addEventListener('scroll', () => {
    if (document.getElementById('activity-history-dialog')?.open === false) return;
    saved.activityScroll = { top: activityHistory.scrollTop, follow: activityHistory.scrollHeight - activityHistory.scrollTop - activityHistory.clientHeight < 24, generation: historyGeneration };
    vscode.setState(saved);
  });
  if (activityStatus && typeof ResizeObserver === 'function') {
    const statusSize = new ResizeObserver(() => { document.documentElement.style.setProperty('--activity-height', activityStatus.getBoundingClientRect().height + 'px'); });
    statusSize.observe(activityStatus);
  }
  const lockedControls = new Map();
  const editor = document.getElementById('editorContent');
  const hiddenBuffer = document.getElementById('bufferContent');
  // Assign source data before capturing the baseline; HTML parsing may have
  // removed a leading newline from either textarea's fallback text.
  if (editor) editor.value = initialFileContent;
  if (hiddenBuffer) hiddenBuffer.value = initialFileContent;
  const initialEditorContent = editor ? editor.value : '';
  const initialFields = {};
  document.querySelectorAll('[data-persist]').forEach(element => {
    const key = scope + ':' + element.id;
    const value = element.type === 'radio' || element.type === 'checkbox' ? String(element.checked) : element.value;
    initialFields[key] = value;
    const previous = saved.fields && saved.fields[key];
    if (element.name === 'reviewer' && reviewerContextChanged) { if (saved.fields) delete saved.fields[key]; return; }
    if (previous && previous.base === value) {
      if (element.type === 'radio' || element.type === 'checkbox') element.checked = previous.value === 'true';
      else element.value = previous.value;
    }
  });
  document.querySelectorAll('details[data-persist-open]').forEach(disclosure => {
    const previous = saved.disclosures && saved.disclosures[scope + ':' + disclosure.id];
    if (!disclosure.open && typeof previous === 'boolean') disclosure.open = previous;
  });
  document.addEventListener('toggle', event => {
    const disclosure = event.target;
    if (!disclosure.matches || !disclosure.matches('details[data-persist-open]')) return;
    saved.disclosures = Object.assign({}, saved.disclosures, { [scope + ':' + disclosure.id]: disclosure.open });
    vscode.setState(saved);
  }, true);
  if (editor && !editor.readOnly && saved.editor && saved.editor.activeId === activeId && saved.editor.path === editor.dataset.editorPath && saved.editor.base === initialEditorContent) editor.value = saved.editor.content;
  function buffer() {
    const current = editor || hiddenBuffer;
    return current && !current.readOnly && current.dataset.readOnly !== 'true'
      ? { editorSkillId: activeId, editorPath: current.dataset.editorPath, editorContent: current.value } : {};
  }
  function persist() {
    const fields = Object.assign({}, saved.fields || {});
    document.querySelectorAll('[data-persist]').forEach(element => {
      const key = scope + ':' + element.id;
      fields[key] = { base: initialFields[key], value: element.type === 'radio' || element.type === 'checkbox' ? String(element.checked) : element.value };
    });
    saved = Object.assign({}, saved, { fields, step, activeId, reviewerContext });
    if (editor && !editor.readOnly) saved.editor = { activeId, path: editor.dataset.editorPath, base: initialEditorContent, content: editor.value };
    const focused = document.activeElement;
    if (focused && focused.id) saved.focus = { id: focused.id, start: focused.selectionStart, end: focused.selectionEnd };
    if (saved.activityFocus && focused && focused !== activityStatus && !(activityStatus && typeof activityStatus.contains === 'function' && activityStatus.contains(focused))) saved.activityFocus = false;
    vscode.setState(saved);
  }
  function clientError(message) {
    const output = document.getElementById('client-error');
    output.textContent = message;
    output.hidden = !message;
  }
  function syncValidity(control) {
    if (!control || !control.willValidate || !control.validity) return;
    if (control.validity.valid) control.removeAttribute('aria-invalid');
    else control.setAttribute('aria-invalid', 'true');
  }
  document.addEventListener('invalid', event => {
    syncValidity(event.target);
    clientError('Check the highlighted field and its instructions before continuing.');
  }, true);
  document.addEventListener('blur', event => syncValidity(event.target), true);
  function lockActions(locked) {
    actionPending = locked;
    document.querySelectorAll('button').forEach(button => { if (button.dataset.diagnostics === 'true' || button.dataset.settings === 'true') return; button.disabled = locked || button.dataset.unavailable === 'true'; });
    if (locked) {
      document.querySelectorAll('input,select,textarea').forEach(control => {
        if (!lockedControls.has(control)) lockedControls.set(control, { disabled: control.disabled, readOnly: control.readOnly });
        if (control === editor) control.readOnly = true;
        else control.disabled = true;
      });
    } else {
      lockedControls.forEach((original, control) => { control.disabled = original.disabled; if (original.readOnly !== undefined) control.readOnly = original.readOnly; });
      lockedControls.clear();
    }
    main.setAttribute('aria-busy', String(locked));
  }
  function actionMessage(action) {
    return ({ ready: 'Opening your workbench…', createWorkbench: 'Requesting a folder for a new workbench…', openWorkbenchFolder: 'Requesting the existing-workbench folder chooser…', refresh: 'Refreshing your saved work…', loadSkills: 'Loading and checking saved skills…', unloadSkills: 'Clearing the loaded skills list…', openPackagePath: 'Opening and checking the selected skill package…', chooseWorkspace: 'Choose a folder for your beta work…',
      openPackage: 'Choose a skill package to open…', openFolder: 'Choose a skill folder to open…', createSkill: 'Creating your draft…',
      resume: 'Opening your draft…', restoreVersion: 'Preparing a draft from the saved release…', openFile: 'Opening the selected file…',
      addFile: 'Choose a supporting file to add…', createFile: 'Creating the new file…', reloadFile: 'Loading the saved file…',
      refreshHistory: 'Loading earlier edits…', restoreEdit: 'Restoring the selected edit…', check: 'Running a structural sanity check…',
      preparePublish: 'Comparing files and preparing your sharing summary…', savePackage: 'Checking and saving your local package…',
      publish: 'Preparing your submission…', revealPackage: 'Showing your saved package…', discoverRepositories: 'Finding your repositories…',
      connectRepository: 'Checking the repository connection…', createRepository: 'Creating your repository…',
      loadReviewers: 'Finding eligible reviewers…', connectGitHub: 'Waiting for your GitHub account selection in VS Code…',
      checkPullRequests: 'Checking recorded pull requests…', checkPullRequest: 'Checking this pull request…',
      createPullRequest: 'Finding or creating the pull request…', requestReviewer: 'Requesting the selected reviewer…',
      openPullRequest: 'Opening the recorded pull request…', openLink: 'Opening the selected link…', setTarget: 'Updating the intended application…',
      showCreate: 'Opening a new skill draft…', showPlugin: 'Opening the plugin builder…', showSkillStart: 'Returning to skill or plugin choices…', edit: 'Returning to your draft…', back: 'Returning to the previous step…',
      startAnother: 'Opening the start screen…' })[action] || 'Working on your request…';
  }
  function beginActivity(message, waitingForInput = false) {
    clearTimeout(activityTimer);
    activityTimer = undefined;
    activityMessage = message;
    if (waitingForInput) activityStarted = undefined;
    else if (activityStarted === undefined) activityStarted = Date.now();
    clearTimeout(activityTick);
    function tick() {
      const elapsed = Math.floor((Date.now() - activityStarted) / 1000);
      const age = lastHostResponse === undefined ? elapsed : Math.floor((Date.now() - lastHostResponse) / 1000);
      const response = age >= 10 ? 'No extension response for ' + age + 's. The operation may be stalled; completion is unconfirmed. Do not resubmit.'
        : lastHostResponse === undefined ? 'Waiting for the extension to respond.' : 'Extension responding. Task completion is still pending.';
      if (activityDetails) activityDetails.textContent = elapsed + 's elapsed · ' + (waitingForInput ? 'Waiting for your selection in VS Code.' : response);
      activityTick = setTimeout(tick, 1000);
    }
    // Human dialogs do not need a processing timer or a stale-response warning.
    if (waitingForInput) { if (activityDetails) activityDetails.textContent = 'Waiting for your selection in VS Code. Check the file picker or account prompt; cancel to return here.'; }
    else tick();
    if (activityOutput) activityOutput.textContent = message;
    if (activityStatus) { activityStatus.dataset.working = String(!waitingForInput); activityStatus.dataset.waitingForInput = String(waitingForInput); }
    if (activityIndicator) activityIndicator.hidden = waitingForInput;
    if (waitingForInput) return;
    activityTimer = setTimeout(() => {
      if (activityOutput) activityOutput.textContent = activityMessage + ' Still waiting for this operation to finish. You do not need to click again.';
    }, 8000);
  }
  function finishActivity(message = 'Ready.') {
    clearTimeout(activityTick);
    activityStarted = undefined;
    lastHostResponse = undefined;
    if (activityDetails) activityDetails.textContent = '';
    clearTimeout(activityTimer);
    activityTimer = undefined;
    activityMessage = '';
    if (activityOutput) activityOutput.textContent = message;
    if (activityIndicator) activityIndicator.hidden = true;
    if (activityStatus) activityStatus.dataset.working = 'false';
    if (activityStatus) activityStatus.dataset.waitingForInput = 'false';
  }
  function post(action, payload = {}, focusStatus = false) {
    if (action === 'openSettings') { vscode.postMessage({ action }); return; }
    if (action === 'openPerformanceLog') { vscode.postMessage({ action }); return; }
    if (actionPending) return;
    if (action === 'publish' && configurationChanged) { clientError('Settings changed. Return to the previous step and review a fresh submission summary before uploading.'); return; }
    if (pluginMetadataRequest) {
      queuedMetadataAction = { action, payload, focusStatus };
      lockActions(true);
      beginActivity('Updating plugin details before continuing…');
      return;
    }
    persist();
    const messageBuffer = action === 'reloadFile' ? {} : buffer();
    clearTimeout(saveTimer);
    const moveToStatus = action !== 'save' && (focusStatus || ['check', 'preparePublish', 'publish', 'savePackage'].includes(action));
    if (action !== 'save' && savePending) { queuedAction = { action, payload, focusStatus }; lockActions(true); beginActivity('Saving your current edit before continuing…'); if (moveToStatus) focusActivity(); return; }
    if (action === 'save') {
      if (!editor || editor.readOnly || savePending) return;
      savePending = true;
      lastSavedContent = editor.value;
      document.getElementById('save-status').textContent = 'Saving locally…';
    } else {
      lockActions(true);
      beginActivity(actionMessage(action), ['setRepositoryFolder', 'openRepositorySkill', 'chooseWorkspace', 'openPackage', 'openFolder', 'addFile', 'connectGitHub'].includes(action));
      if (moveToStatus) focusActivity();
      if (action === 'startAnother') { saved = {}; vscode.setState(saved); }
    }
    if (action === 'reloadFile') { delete saved.editor; vscode.setState(saved); }
    vscode.postMessage(Object.assign({ action, payload }, messageBuffer));
  }
  function scheduleSave() {
    if (!editor || editor.readOnly || actionPending) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => post('save'), 500);
  }
  function fieldValue(id) { const element = document.getElementById(id); return element ? element.value : ''; }
  document.querySelectorAll('[data-open-dialog]').forEach(button => button.addEventListener('click', () => {
    const dialog = document.getElementById(button.dataset.openDialog);
    dialog?.showModal();
    if (dialog?.id === 'activity-history-dialog' && activityHistory) {
      activityHistory.scrollTop = saved.activityScroll?.follow !== false ? activityHistory.scrollHeight : saved.activityScroll?.top || 0;
    }
  }));
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => {
    document.getElementById(button.dataset.closeDialog)?.close();
  }));
  // Enter while editing optional publisher metadata must never submit an
  // upload from the enclosing package form. Closing the dialog keeps the data.
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('keydown', event => {
    if (!event.isComposing && event.key === 'Enter' && event.target?.tagName === 'INPUT') {
      event.preventDefault();
      dialog.close();
    }
  }));
  function exportPayload() {
    return {
      exportMode: fieldValue('exportMode') || 'portable',
      pluginName: fieldValue('pluginName'), pluginVersion: fieldValue('pluginVersion'),
      pluginDescription: fieldValue('pluginDescription'), pluginAuthor: fieldValue('pluginAuthor'), pluginLicense: fieldValue('pluginLicense'),
      pluginMembers: Array.from(document.querySelectorAll('input[name="pluginMembers"]:checked')).map(element => element.value),
      pluginIcon: fieldValue('pluginIcon'), pluginPrivacyPolicyUrl: fieldValue('pluginPrivacyPolicyUrl'), pluginDocumentationUrl: fieldValue('pluginDocumentationUrl'), pluginSupportUrl: fieldValue('pluginSupportUrl'),
      geminiZip: document.getElementById('geminiZip')?.checked === true
    };
  }
  function submissionPayload(action) {
    const reviewer = action === 'publish' ? fieldValue('reviewer') : '';
    const version = fieldValue('releaseVersion').trim();
    return { ...(version ? { version } : {}), changelog: fieldValue('releaseChangelog'), reviewer, confirmed: !!reviewer, ...exportPayload() };
  }
  function requestPluginMetadata(acceptedVersion) {
    // Keep one request in flight. Later edits remain in the live form and are
    // coalesced after the host acknowledges the previous suggested version.
    if (pluginMetadataRequest) return;
    const displayedVersion = fieldValue('pluginVersion');
    pluginMetadataRequest = { requestId: pluginMetadataClientId + ':' + (++pluginMetadataSequence),
      pluginName: fieldValue('pluginName'), pluginVersion: acceptedVersion === undefined ? displayedVersion : acceptedVersion,
      displayedVersion, versionEditSequence: pluginVersionEditSequence };
    persist();
    vscode.postMessage({ action: 'updatePluginMetadata', requestId: pluginMetadataRequest.requestId,
      payload: { pluginName: pluginMetadataRequest.pluginName, pluginVersion: pluginMetadataRequest.pluginVersion } });
  }
  function updateExportVisibility() {
    const pluginOptions = document.getElementById('plugin-options');
    if (!pluginOptions) return;
    const mode = fieldValue('exportMode') || 'portable';
    const plugin = mode !== 'portable';
    pluginOptions.hidden = !plugin;
    pluginOptions.querySelectorAll('input').forEach(element => {
      element.disabled = !plugin || element.hasAttribute('data-current-member');
      if (element.hasAttribute('data-plugin-required')) element.required = plugin;
    });
    const summary = document.getElementById('export-package-summary');
    if (summary) summary.textContent = mode === 'plugin' ? 'Claude plugin ZIP' : mode === 'both' ? 'Installable .skill package and Claude plugin ZIP' : 'Installable .skill package';
  }
  updateExportVisibility();
  document.querySelectorAll('form[data-form-action]').forEach(form => form.addEventListener('submit', event => {
    event.preventDefault();
    if (event.isComposing || actionPending) return;
    // A required field may be inside an advanced disclosure. Reveal it before
    // native validation tries to focus it, so the error is never hidden.
    if (form.querySelectorAll) form.querySelectorAll(':invalid').forEach(control => {
      let details = control.closest?.('details');
      while (details) { details.open = true; details = details.parentElement?.closest('details'); }
    });
    if (!form.reportValidity()) { clientError('Complete the required fields highlighted below.'); const first = form.querySelector('input:invalid,select:invalid,textarea:invalid'); if (first) first.focus(); return; }
    clientError('');
    const action = event.submitter?.dataset.submitAction || form.dataset.formAction;
    let payload = {};
    if (action === 'createSkill') payload = { name: fieldValue('skillName'), description: fieldValue('skillDescription'), instructions: fieldValue('skillInstructions') };
    if (action === 'openPackagePath') payload = { path: fieldValue('packagePath') };
    if (action === 'addFile') payload = { path: fieldValue('addFilePath') };
    if (action === 'createFile') payload = { path: fieldValue('newFilePath') };
    if (action === 'publish' || action === 'savePackage') {
      payload = submissionPayload(action);
    }
    post(action, payload, event.submitter?.id === 'primary-action');
  }));
  document.addEventListener('click', event => {
    const element = event.target.closest('[data-action]');
    if (!element) return;
    event.preventDefault();
    const payload = {};
    for (const key of ['id', 'directory', 'path', 'url', 'reviewer', 'intent']) if (element.dataset[key] !== undefined) payload[key] = element.dataset[key];
    if (element.dataset.confirmed === 'true') payload.confirmed = true;
    post(element.dataset.action, payload, element.id === 'primary-action');
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'pluginVersion') ++pluginVersionEditSequence;
    clientError(''); persist();
    if (event.target.validity && event.target.validity.valid) event.target.removeAttribute('aria-invalid');
    if (event.target === editor && !editor.readOnly) { document.getElementById('save-status').textContent = 'Unsaved changes'; scheduleSave(); }
  });
  document.addEventListener('change', event => {
    persist();
    if (event.target.id === 'pluginName' || event.target.id === 'pluginVersion') {
      if (!actionPending) requestPluginMetadata();
      return;
    }
    if (event.target.hasAttribute && event.target.hasAttribute('data-export-option')) {
      updateExportVisibility();
      if (step === 'publish') post('updateExportOptions', { ...exportPayload(), version: fieldValue('releaseVersion'), changelog: fieldValue('releaseChangelog') });
    }
  });
  document.addEventListener('focusin', () => persist());
  const target = document.getElementById('target');
  if (target) target.addEventListener('change', () => post('setTarget', { target: target.value }));
  window.addEventListener('message', event => {
    const message = event.data || {};
    if (message.type === 'pluginMetadataUpdated') {
      const request = pluginMetadataRequest;
      if (!request || request.requestId !== message.requestId) return;
      const currentName = fieldValue('pluginName'), currentVersion = fieldValue('pluginVersion');
      const versionEdited = currentVersion !== request.displayedVersion || pluginVersionEditSequence !== request.versionEditSequence;
      const unchanged = currentName === request.pluginName && !versionEdited;
      const next = queuedMetadataAction;
      queuedMetadataAction = undefined;
      pluginMetadataRequest = undefined;
      const error = typeof message.error === 'string' ? message.error
        : typeof message.pluginVersion !== 'string' || typeof message.pluginName !== 'string' ? 'Plugin details could not be checked. Your inputs are preserved.' : undefined;
      if (!unchanged) {
        // Do not show an obsolete name's suggestion. For the next name, echo
        // the host-accepted baseline instead of mistaking the old display for
        // an explicit version override. Genuine version edits stay explicit.
        queuedMetadataAction = next;
        requestPluginMetadata(versionEdited ? currentVersion : error ? request.pluginVersion : message.pluginVersion);
        return;
      }
      if (unchanged && !error) {
        const version = document.getElementById('pluginVersion');
        if (version) version.value = message.pluginVersion;
        initialFields[scope + ':pluginVersion'] = message.pluginVersion;
        const summary = document.getElementById('plugin-version-details')?.querySelector('summary');
        if (summary) summary.textContent = 'Version ' + (message.pluginVersion || 'required') + ' — change if needed';
        persist();
      }
      if (unchanged && error) clientError(error);
      if (next) {
        lockActions(false);
        finishActivity();
        if (unchanged && error) { finishActivity('Plugin details need attention. Your inputs are preserved.'); return; }
        const payload = next.action === 'savePackage' || next.action === 'publish' ? submissionPayload(next.action)
          : next.action === 'updateExportOptions' ? { ...exportPayload(), version: fieldValue('releaseVersion'), changelog: fieldValue('releaseChangelog') } : next.payload;
        post(next.action, payload, next.focusStatus);
      }
      return;
    }
    if (message.type === 'configurationChanged' && message.display && typeof message.display === 'object') {
      const display = message.display;
      configurationChanged = true;
      const configuration = document.getElementById('workbench-configuration');
      if (configuration) configuration.dataset.configurationError = String(display.invalid === true);
      // Settings may select a different Git checkout; it does not change the
      // project that owns the active draft. Keep that identity until reopened.
      for (const [id, key, fallback] of [['configured-repository', 'repository', 'Not connected'], ['configured-target-branch', 'targetBranch', 'Branch checked before upload']]) {
        const output = document.getElementById(id);
        if (output) {
          const value = typeof display[key] === 'string' && display[key] ? display[key] : fallback;
          output.textContent = value;
          if (id === 'configured-repository') {
            output.title = value === fallback ? '' : value;
            try {
              const url = new URL(value);
              output.textContent = url.hostname.toLowerCase() === 'github.com'
                ? url.pathname.replace(/^\\/+|\\/+$/g, '').replace(/\\.git$/i, '') : url.hostname + url.pathname;
            } catch { /* Keep the safe host-projected value or fallback. */ }
          }
        }
      }
      const summary = document.getElementById('repository-settings-state');
      if (summary) summary.textContent = display.invalid === true ? 'Needs attention' : 'Not yet verified';
      const status = document.getElementById('repository-verification');
      const uploadForm = document.getElementById('publish-form');
      const staleUpload = step === 'publish' && uploadForm?.dataset.formAction === 'publish';
      if (status) {
        status.dataset.status = display.invalid === true ? 'error' : 'unverified';
        status.textContent = (typeof display.notice === 'string' ? display.notice : 'Settings changed. Reopen the workbench to use a different work folder.') + (staleUpload ? ' Return to the previous step and review a fresh submission summary before uploading.' : '');
      }
      if (staleUpload) {
        const upload = document.getElementById('primary-action');
        if (upload) { upload.disabled = true; upload.dataset.unavailable = 'true'; }
      }
      return;
    }
    if (message.type === 'captureEditorBuffer' && typeof message.requestId === 'string') {
      persist();
      vscode.postMessage(Object.assign({ action: 'editorBufferCaptured', requestId: message.requestId }, buffer()));
      return;
    }
    if (message.type === 'progress') {
      lastHostResponse = Date.now();
      updateActivityHistory(message.activity, message.activityGeneration);
      if (message.message) beginActivity(String(message.message), message.waitingForInput === true);
    }
    if (message.type === 'repositoryVerification') {
      const status = document.getElementById('repository-verification');
      const summaryStatus = document.getElementById('repository-settings-state');
      if (document.getElementById('workbench-configuration')?.dataset.configurationError === 'true') return;
      const verification = message.verification;
      if (verification && typeof verification.message === 'string') {
        if (status) {
          status.textContent = verification.message;
          status.dataset.status = String(verification.status || 'error');
        }
        if (summaryStatus) {
          const labels = new Map([['checking', 'Checking connection'], ['verified', 'Verified'], ['outOfSync', 'Local and remote differ'], ['setupRequired', 'Setup needed'], ['error', 'Check failed']]);
          summaryStatus.textContent = labels.get(verification.status) || 'Not yet verified';
        }
        // Keep background results discoverable without shifting the draft or
        // overriding a deliberate disclosure collapse. The summary stays visible.
      }
    }
    if (message.type === 'heartbeat' && actionPending) lastHostResponse = Date.now();
    if (message.type === 'operationComplete') {
      updateActivityHistory(message.activity, message.activityGeneration);
      lockActions(false);
      finishActivity(message.error ? 'Needs attention. Your work is kept on this screen.' : String(message.message || 'Ready.'));
      if (message.error) clientError(String(message.error));
    }
    if (message.type === 'saved') {
      savePending = false;
      const status = document.getElementById('save-status');
      const retry = document.getElementById('retry-save');
      const reload = document.getElementById('reload-file');
      if (message.error) {
        clientError(String(message.error)); if (status) status.textContent = 'Save failed — changes kept on this screen'; if (retry) retry.hidden = false; if (reload) reload.hidden = false;
        queuedAction = undefined; lockActions(false); finishActivity('Save needs attention. Retry saving before continuing.');
      }
      else {
        const current = editor ? editor.value : '';
        if (status) status.textContent = current === lastSavedContent ? 'Saved locally' : 'Unsaved changes';
        if (retry) retry.hidden = true;
        if (reload) reload.hidden = true;
        if (current !== lastSavedContent) scheduleSave();
      }
      persist();
      if (queuedAction && !message.error) { const next = queuedAction; queuedAction = undefined; lockActions(false); finishActivity(); post(next.action, next.payload, next.focusStatus); }
    }
  });
  if (actionPending) { lockActions(true); beginActivity(activityOutput?.textContent || 'Working on your request…', main.dataset.waitingForInput === 'true'); }
  const previousStep = saved.step;
  const previousActive = saved.activeId;
  if (saved.activityFocus) focusActivity();
  else if (main.dataset.hasError === 'true') document.getElementById('feedback').focus();
  else if (previousStep !== step || previousActive !== activeId) document.getElementById('stepHeading').focus();
  else if (saved.focus) { const focused = document.getElementById(saved.focus.id); if (focused && !focused.disabled) { focused.focus({ preventScroll: true }); if (typeof focused.setSelectionRange === 'function' && typeof saved.focus.start === 'number') focused.setSelectionRange(saved.focus.start, saved.focus.end); } }
  persist();
  if (editor && !editor.readOnly && editor.value !== initialEditorContent) { document.getElementById('save-status').textContent = 'Unsaved changes'; scheduleSave(); }
`;

export function renderGuidedWorkbench(state: GuidedState, nonce: string, brand?: GuidedBrand): string {
  nonce = nonceValue(nonce);
  const area = state.step === 'start' ? 'home' : state.step === 'edit' || state.step === 'check' ? 'editor' : 'build';
  const screen = state.step === 'edit' ? edit(state) : state.step === 'check' ? check(state) : state.step === 'publish' ? publish(state) : state.step === 'done' ? done(state) : start(state);
  const formScope = state.step === 'publish' ? `${state.active?.id ?? ''}:publish:${state.publish?.version ?? ''}:${state.workflowIntent ?? 'skill'}` : state.step === 'start' ? `start:${state.form?.mode ?? 'home'}:${state.workflowIntent ?? 'skill'}` : `${state.active?.id ?? ''}:${state.step}`;
  const backDisabled = state.step === 'start' && !state.form?.mode;
  const primary = screen.primary;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><title>${escape(screen.title)} | ${escape(productName(brand))}</title><style nonce="${nonce}">${styles}</style></head><body>
    <a href="#main-content" class="skip-link">Skip to content</a><div class="shell">
    <div id="operation-status" class="activity-status" role="region" aria-labelledby="activity-heading" tabindex="-1" data-working="${!!state.busy && !state.waitingForInput}" data-waiting-for-input="${!!state.waitingForInput}"><h2 id="activity-heading" class="activity-heading">Activity</h2><div class="activity-current"><progress id="operation-indicator" class="activity-indicator" aria-label="Operation in progress" ${!state.busy || state.waitingForInput ? 'hidden' : ''}></progress><div><strong id="progress-message" role="status" aria-live="polite" aria-atomic="true">${escape(state.progress ?? 'Ready.')}</strong><div id="activity-details" aria-live="off"></div></div></div><button type="button" class="secondary activity-history-button" data-open-dialog="activity-history-dialog" data-diagnostics="true">Activity history</button><dialog id="activity-history-dialog" aria-labelledby="activity-history-heading"><h2 id="activity-history-heading">Activity history</h2><ol id="activity-history" class="activity-history" aria-label="Activity history" aria-live="off" tabindex="0" ${state.activity?.length ? '' : 'hidden'}>${(state.activity ?? []).slice(-100).map(entry => `<li data-status="${escape(entry.status)}"><strong>${escape(({ running: 'In progress', waiting: 'Waiting', succeeded: 'Succeeded', failed: 'Needs attention', info: 'Update' })[entry.status])}: </strong><span>${escape(entry.message)}</span></li>`).join('')}</ol><div id="activity-timing" class="diagnostic-actions"><div class="button-row">${secondary('openPerformanceLog', 'Open performance log', 'id="open-performance-log" data-diagnostics="true" aria-describedby="performance-log-help"')}</div><p class="hint" id="performance-log-help">Open local timing details, including startup and earlier steps. Available while work is running.</p></div><button type="button" class="primary" data-close-dialog="activity-history-dialog" data-diagnostics="true">Close history</button></dialog></div>
    <header><div class="header-heading">${brandHeader(brand)}<div class="header-tools">${settingsButton()}</div></div><nav class="project-nav" aria-label="Project"><button type="button" class="nav-button" data-action="startAnother" ${area === 'home' ? 'aria-current="page" disabled data-unavailable="true"' : ''}>Your project</button><button type="button" class="nav-button" data-action="${state.step === 'publish' ? 'back' : 'edit'}" ${area === 'editor' ? 'aria-current="page" disabled data-unavailable="true"' : ''} ${!state.active ? 'disabled data-unavailable="true"' : ''}>Editor</button><button type="button" class="nav-button" data-action="preparePublish" ${area === 'build' ? 'aria-current="page" disabled data-unavailable="true"' : ''} ${!state.active ? 'disabled data-unavailable="true"' : ''}>Build / Share</button></nav>${configurationSummary(state)}</header>
    <main id="main-content" tabindex="-1" data-step="${escape(state.step)}" data-active-id="${escape(state.active?.id ?? '')}" data-form-scope="${escape(formScope)}" data-reviewer-context="${escape(JSON.stringify([state.githubAccount ?? '', state.connection?.repository ?? '']))}" data-busy="${!!state.busy}" data-waiting-for-input="${!!state.waitingForInput}" data-has-error="${!!state.error}" aria-busy="${!!state.busy}">
      <h1 id="stepHeading" tabindex="-1">${escape(screen.title)}</h1><p class="screen-hint">${escape(screen.hint)}</p>
      <div id="feedback" class="feedback" role="status" aria-live="polite" aria-atomic="true" tabindex="-1">${state.error ? `<p class="error-message"><strong>Needs attention.</strong> ${escape(state.error)}</p>` : state.notice ? `<p class="notice-message">${escape(state.notice)}</p>` : ''}<p id="client-error" class="error-message" hidden></p></div>
      ${primary ? `<footer class="action-bar"><button type="button" class="secondary" data-action="back" ${backDisabled ? 'disabled data-unavailable="true"' : ''}>← ${state.step === 'publish' ? 'Edit' : 'Back'}</button>${state.step === 'publish' && state.connection && !state.configurationError ? '<button type="submit" form="publish-form" class="secondary" data-submit-action="savePackage">Save locally instead</button>' : ''}<button id="primary-action" class="primary" type="${primary.form ? 'submit' : 'button'}" ${primary.form ? `form="${primary.form}"` : `data-action="${primary.action}"`} ${primary.id ? `data-id="${escape(primary.id)}"` : ''} ${state.busy || primary.disabled ? 'disabled' : ''} ${primary.disabled ? 'data-unavailable="true"' : ''}>${state.busy ? 'Working…' : escape(primary.label)} <span aria-hidden="true">→</span></button></footer>` : ''}
      ${screen.html}
      ${state.step !== 'edit' && state.editor ? `<textarea id="bufferContent" hidden data-editor-path="${escape(state.editor.path)}" ${state.editor.readOnly ? 'readonly data-read-only="true"' : ''}>${escape(state.editor.content)}</textarea>` : ''}

    </main></div><script nonce="${nonce}">const pluginMetadataClientId = ${scriptString(nonce.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''))};const initialFileContent = ${scriptString(state.editor?.content ?? '')};const initialActivity = JSON.parse(${scriptString(JSON.stringify(state.activity ?? []))});const initialActivityGeneration = ${Number.isSafeInteger(state.activityGeneration) ? state.activityGeneration : 0};${script}</script></body></html>`;
}

export function renderGuidedLauncher(nonce: string, brand?: GuidedBrand): string {
  nonce = nonceValue(nonce);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><title>Open ${escape(productName(brand))}</title><style nonce="${nonce}">${styles}body{padding:1.1rem}.primary{inline-size:100%;min-inline-size:0;margin-block:1rem}.brand-lockup{gap:.7rem;margin-block-end:1.25rem}.brand-product{font-size:1.25rem}.brand-tagline{font-size:.77rem}.launcher-steps{padding-inline-start:1.2rem}.launcher-steps li{margin-block:.35rem}</style></head><body><main>${brandHeader(brand, true)}<p>Your skills, plugins and GitHub sharing in one place.</p><button type="button" class="primary" id="open-workbench">Open SkillJetty <span aria-hidden="true">→</span></button><p class="hint">Create, edit and share from your project. Existing work stays preserved.</p></main><script nonce="${nonce}">const vscode=acquireVsCodeApi();document.getElementById('open-workbench').addEventListener('click',()=>vscode.postMessage({action:'openWorkbench'}));</script></body></html>`;
}


