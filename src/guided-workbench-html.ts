import type { GuidedState, GuidedStep } from './guided-contract.js';

const steps: { key: GuidedStep; name: string }[] = [
  { key: 'start', name: 'Start' }, { key: 'edit', name: 'Edit' }, { key: 'check', name: 'Check' },
  { key: 'publish', name: 'Publish' }, { key: 'done', name: 'Done' }
];
type Primary = { label: string; action?: string; form?: string; disabled?: boolean };
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
  return `<div class="brand-lockup">${logo ? `<img class="brand-logo" src="${escape(logo)}" width="64" height="64" alt="DAF-TECH">` : ''}<div class="brand-wordmark"><span class="brand-company" ${logo ? 'aria-hidden="true"' : ''}>by DAF-TECH</span><${tag} class="brand-product">${escape(productName(brand))}</${tag}><span class="brand-tagline">${escape(brand?.descriptor ?? 'Agent Skills Studio')} · ${escape(brand?.tagline ?? 'Build it. Version it. Ship it.')}</span></div></div>`;
}
function secondary(action: string, label: string, attributes = ''): string {
  return `<button type="button" class="secondary" data-action="${escape(action)}" ${attributes}>${escape(label)}</button>`;
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
function repositoryForm(state: GuidedState, main = false): string {
  const connection = state.connection;
  const repository = state.form?.repository ?? connection?.repository ?? '';
  return `<section class="card repository-card">
    <h2>${connection ? 'Repository connection' : 'Connect your repository once'}</h2>
    ${connection ? `<p class="connection"><span aria-hidden="true">✓</span> Connected to <strong>${escape(connection.repository)}</strong></p><p class="hint">The repository’s default branch is detected automatically. Future skills use this connection.</p>` : '<p>Choose where published skills should go. You can use an existing repository or create one below.</p>'}
    <form id="repository-form" action="#" method="post" data-form-action="connectRepository">
      <fieldset ${state.busy ? 'disabled' : ''}><legend class="visually-hidden">Connect an existing repository</legend>
      ${state.repositories.length ? `<div class="field"><label for="repository-choice">Available repositories</label><select id="repository-choice" name="repository-choice"><option value="">Choose a repository or enter its address below</option>${state.repositories.map(item => `<option value="${escape(item.repository)}" ${item.repository === repository ? 'selected' : ''}>${escape(item.label)}</option>`).join('')}</select></div>` : ''}
      ${field('repository', 'Repository address (required)', repository, 'required autocomplete="off" autocapitalize="off" spellcheck="false"', 'Paste a GitHub repository URL or use a detected repository. No branch name is required.')}
      <div class="button-row">${secondary('discoverRepositories', state.repositories.length ? 'Refresh available repositories' : 'Find my repositories')}${!main ? '<button type="submit" class="secondary">Connect repository</button>' : ''}</div>
      </fieldset>
    </form>
    <details class="optional"><summary>Create a new GitHub repository instead</summary>
      <form id="create-repository-form" action="#" method="post" data-form-action="createRepository">
        <fieldset ${state.busy ? 'disabled' : ''}><legend class="visually-hidden">Create a repository</legend>
        ${field('repositoryName', 'New repository name (required)', state.form?.repositoryName ?? state.form?.name ?? '', 'required maxlength="100" pattern="[A-Za-z0-9_.\\-]+" autocomplete="off" autocapitalize="off" spellcheck="false"', 'For example Skills. This creates a repository in your signed-in GitHub account.')}
        <fieldset class="visibility"><legend>Repository visibility</legend>
          <label for="visibility-private"><input id="visibility-private" type="radio" name="visibility" value="private" ${state.form?.visibility !== 'public' ? 'checked' : ''} data-persist> Private — only people you grant access can see it</label>
          <label for="visibility-public"><input id="visibility-public" type="radio" name="visibility" value="public" ${state.form?.visibility === 'public' ? 'checked' : ''} data-persist> Public — anyone can see the repository and skills you publish</label>
        </fieldset>
        <p class="hint">Creating the repository connects it to this workspace. No skill is uploaded at this step.</p>
        <button type="submit" class="secondary" id="create-repository-button">Create private repository</button>
        </fieldset>
      </form>
    </details>
  </section>`;
}
function savedWork(state: GuidedState): string {
  if (!state.drafts.length && !state.library.length && !state.libraryError) return '';
  return `<section class="saved-work"><h2>Continue saved work</h2>
    ${state.drafts.length ? `<h3>Drafts</h3><ul class="work-list">${state.drafts.map(draft => `<li><span><strong>${escape(draft.name)}</strong><small>Editable draft</small></span>${secondary('resume', `Resume ${draft.name}`, `data-id="${escape(draft.id)}"`)}</li>`).join('')}</ul>` : ''}
    ${state.library.length ? `<h3>Version library</h3><ul class="work-list">${state.library.map(entry => `<li><span><strong>${escape(entry.skillName)} ${escape(entry.version)}</strong><small>${escape(entry.status === 'uploaded' ? 'Recorded upload — merge status is not tracked here' : entry.status === 'archived' ? 'Preserved version — upload not verified' : 'Prepared locally')}</small></span>${secondary('restoreVersion', `Edit next version of ${entry.skillName} ${entry.version}`, `data-directory="${escape(entry.directory)}"`)}</li>`).join('')}</ul>` : ''}
    ${state.libraryError ? `<p class="warning"><span aria-hidden="true">!</span> ${escape(state.libraryError)}</p>` : ''}
  </section>`;
}
function start(state: GuidedState): { title: string; hint: string; html: string; primary?: Primary } {
  if (!state.hasWorkspace) return {
    title: 'Start with a workspace', hint: 'Choose a folder to keep your drafts, original packages, and version history together.',
    html: '<section class="card"><h2>Your skills stay in your workspace</h2><p>Choose an existing folder or an empty folder for this work. You will connect the publication repository next.</p></section>',
    primary: { label: 'Choose workspace folder', action: 'chooseWorkspace' }
  };
  if (state.form?.mode === 'create') return {
    title: 'Create your draft', hint: 'Give the skill a name, describe when it should be used, and write its instructions.',
    html: `<section class="card"><form id="create-form" action="#" method="post" data-form-action="createSkill"><fieldset ${state.busy ? 'disabled' : ''}><legend class="visually-hidden">New skill</legend>
      ${field('skillName', 'Skill name (required)', state.form?.name ?? '', 'required maxlength="64" pattern="[a-z0-9]+(-[a-z0-9]+)*" autocomplete="off" autocapitalize="off" spellcheck="false"', 'Use a short lowercase name with hyphens, for example weekly-status.')}
      ${textField('skillDescription', 'What it does and when to use it (required)', state.form?.description ?? '', 'required maxlength="1024" rows="3"', 'For example: Summarize project updates. Use when the user asks for a weekly status report.')}
      ${textField('skillInstructions', 'Instructions (required)', state.form?.instructions ?? '', 'required rows="10"', 'Write the repeatable steps, expected output, and how to handle missing information. You can edit the complete SKILL.md next.')}
      </fieldset></form></section>`,
    primary: { label: 'Create draft', form: 'create-form' }
  };
  if (state.form?.mode === 'repository') return {
    title: 'Connect your repository', hint: 'Set the publication destination once. The workbench detects its default branch for you.',
    html: repositoryForm(state, true) + savedWork(state), primary: { label: 'Connect repository', form: 'repository-form' }
  };
  return {
    title: 'Create or open a skill', hint: 'Choose one of the three options below. Edit and check locally; connect a repository when you are ready to publish.',
    html: `<section class="card start-card"><h2>Choose how to start</h2><p>No repository connection is needed to create, open, or edit a skill.</p><div class="start-choices">
      <div class="start-option">${secondary('showCreate', 'Create a new skill', 'aria-describedby="create-choice-help"')}<p class="hint" id="create-choice-help">Start from an idea. Write the name, purpose, and instructions.</p></div>
      <div class="start-option">${secondary('openPackage', 'Open a .skill file', 'aria-describedby="package-choice-help"')}<p class="hint" id="package-choice-help">Choose an existing .skill file in the file picker. Its contents open for editing.</p></div>
      <div class="start-option">${secondary('openFolder', 'Open a skill folder', 'aria-describedby="folder-choice-help"')}<p class="hint" id="folder-choice-help">Choose a folder containing SKILL.md and any supporting files.</p></div>
      </div></section>
      ${state.connection ? `<section class="connected-strip"><span aria-hidden="true">✓</span><span>Publishing destination: <strong>${escape(state.connection.repository)}</strong></span></section>` : '<p class="hint">Ready to upload later? Connect a repository below or at the Publish step.</p>'}
      ${savedWork(state)}<details class="optional" ${state.repositories.length ? 'open' : ''}><summary>${state.connection ? 'Change the connected repository' : 'Connect a repository for publishing'}</summary>${repositoryForm(state)}</details>`,
    primary: undefined
  };
}
function edit(state: GuidedState): { title: string; hint: string; html: string; primary: Primary } {
  const editor = state.editor;
  const targets = [['portable', 'Portable'], ['claude', 'Claude'], ['codex', 'Codex'], ['gemini', 'Gemini'], ['copilot', 'GitHub Copilot']];
  return {
    title: state.active?.name ?? 'Edit your skill', hint: 'Edit the instructions and supporting files. Changes save locally; Check and continue tells you what needs attention.',
    html: `<div class="edit-toolbar"><div class="field target-field"><label for="target">Compatibility target</label><select id="target" name="target" ${state.busy ? 'disabled' : ''}>${targets.map(([value, label]) => `<option value="${value}" ${value === state.target ? 'selected' : ''}>${label}</option>`).join('')}</select><p class="hint">Changing the target updates local compatibility checks; it does not run a model.</p></div><div class="save-controls"><span id="save-status" aria-live="off">Saved locally</span>${secondary('save', 'Save now', `id="save-button" ${!editor || editor.readOnly ? 'disabled data-unavailable="true"' : ''}`)}<button type="button" class="secondary" data-action="save" id="retry-save" ${state.error ? '' : 'hidden'}>Retry save</button><button type="button" class="secondary" data-action="reloadFile" id="reload-file" ${state.error ? '' : 'hidden'}>Reload saved file</button></div></div>
      <div class="editor-layout"><aside class="file-panel" aria-labelledby="files-heading"><h2 id="files-heading">Skill files</h2>${editor ? `<a href="#editorContent" class="editor-skip">Skip file list and ${editor.readOnly ? 'inspect' : 'edit'} selected file</a>` : ''}<ul class="file-list">${state.files.map(file => `<li><button type="button" class="file-button ${file.path === editor?.path ? 'selected' : ''}" data-action="openFile" data-path="${escape(file.path)}" ${file.path === editor?.path ? 'aria-current="true"' : ''}><span>${escape(file.path)}</span><small>${file.text ? 'Text' : 'Binary — preserved'} · ${file.size} bytes</small></button></li>`).join('')}</ul>
      <details class="optional"><summary>Add a supporting file</summary><form id="add-file-form" action="#" method="post" data-form-action="addFile">${field('addFilePath', 'Destination inside this skill (optional)', '', 'autocomplete="off" autocapitalize="off" spellcheck="false"', 'For example references/rules.md. Leave blank to keep the selected filename under references/.')}<button type="submit" class="secondary">Choose file to add</button></form></details>
      <details class="optional"><summary>Create a text file</summary><form id="new-file-form" action="#" method="post" data-form-action="createFile">${field('newFilePath', 'File path inside this skill (required)', '', 'required autocomplete="off" autocapitalize="off" spellcheck="false"', 'For example references/report-format.md. Existing files are not overwritten.')}<button type="submit" class="secondary">Create file</button></form></details></aside>
      <section class="editor-panel" aria-labelledby="editor-heading"><h2 id="editor-heading">${escape(editor?.path ?? 'Select a file to edit')}</h2>${editor ? `<label for="editorContent" class="visually-hidden">Content of ${escape(editor.path)}</label><textarea id="editorContent" name="editorContent" class="code-editor" data-editor-path="${escape(editor.path)}" ${editor.readOnly ? 'readonly data-read-only="true"' : ''} spellcheck="false" autocomplete="off" aria-describedby="editor-help">${escape(editor.content)}</textarea><p class="hint" id="editor-help">${editor.readOnly ? 'This file is binary or read-only. Its original bytes are preserved; it will not be saved as text.' : 'You are editing the complete file. Tab moves to the next control. No scripts or AI models are run by this editor.'}</p>` : '<p>Choose a text file from Skill files. Binary supporting files remain included without being edited.</p>'}</section></div>`,
    primary: { label: 'Check and continue', action: 'check', disabled: !state.active }
  };
}
function findings(title: string, values: { message: string; file?: string }[], className: string): string {
  return `<section class="card ${className}"><h2>${escape(title)} (${values.length})</h2>${values.length ? `<ul class="findings">${values.map(item => `<li><span>${escape(item.message)}</span>${item.file ? secondary('openFile', `Fix ${item.file}`, `data-path="${escape(item.file)}"`) : ''}</li>`).join('')}</ul>` : '<p>No findings in this category.</p>'}</section>`;
}
function check(state: GuidedState): { title: string; hint: string; html: string; primary: Primary } {
  const result = state.check;
  const passed = !!result?.valid;
  return {
    title: passed ? 'Your local checks passed' : 'Fix these items before publishing',
    hint: passed ? 'Review the warnings and compatibility notes, then continue to the publication summary.' : 'Open an affected file or return to editing, fix the errors, and check again.',
    html: `<p class="result-badge ${passed ? 'pass' : 'warning'}"><span aria-hidden="true">${passed ? '✓' : '!'}</span> ${passed ? 'Passed — local checks' : 'Needs attention — local checks'}</p>
      ${findings('Errors', result?.errors ?? [], 'error-card')}${findings('Warnings', result?.warnings ?? [], '')}
      <section class="card"><h2>Compatibility and manual testing</h2><p>${escape(result?.compatibility ?? 'Run local checks to see compatibility notes.')}</p><p class="hint">${escape(result?.behaviorNote ?? 'No AI model has been run. These checks do not prove that the skill improves model behavior.')}</p><p>If you test the skill in your chosen environment, review the actual output before publishing. This workbench does not report an unrun model test as passed.</p></section>`,
    primary: passed ? { label: 'Continue to publish', action: 'preparePublish' } : { label: 'Fix and return to editing', action: 'edit' }
  };
}
function publish(state: GuidedState): { title: string; hint: string; html: string; primary: Primary } {
  const details = state.publish;
  const version = state.form?.version ?? details?.version ?? '1.0.0';
  const changelog = state.form?.changelog ?? details?.changelog ?? '';
  return {
    title: 'Review and publish this version', hint: 'Confirm the destination, version, and changes. Publish version uploads this checked release to a review branch.',
    html: `${!state.connection ? repositoryForm(state, true) : `<section class="connected-strip"><span aria-hidden="true">✓</span><span>Publishing to <strong>${escape(state.connection.repository)}</strong></span></section>`}
      <section class="card"><form id="publish-form" action="#" method="post" data-form-action="publish"><fieldset ${state.busy ? 'disabled' : ''}><legend class="visually-hidden">Version to publish</legend>
      ${field('releaseVersion', 'Version (required)', version, 'required autocomplete="off" autocapitalize="off" spellcheck="false"', 'The suggested version preserves existing releases. You can change it before publishing.')}
      ${textField('releaseChangelog', 'What changed in this version? (required)', changelog, 'required rows="4"', 'For the first version, describe what the skill does. For later versions, describe what changed. Every version includes CHANGELOG.md.')}
      </fieldset></form></section>
      <section class="card"><h2>What will be published</h2><ul class="package-summary"><li><span aria-hidden="true">✓</span><span><strong>Editable source</strong> — ${details?.fileCount ?? state.files.length} files with their existing folder structure</span></li><li><span aria-hidden="true">✓</span><span><strong>Installable .skill package</strong> — rebuilt and checked against this source</span></li><li><span aria-hidden="true">✓</span><span><strong>CHANGELOG.md</strong> — your version notes</span></li></ul><p class="hint">Original imported packages and previous versions remain preserved. The upload uses a review branch; merging is a separate repository decision.</p></section>
      ${state.connection ? `<details class="optional" ${state.error ? 'open' : ''}><summary>Change or reconnect the repository</summary>${repositoryForm(state)}</details>` : ''}`,
    primary: state.connection ? { label: 'Publish version', form: 'publish-form', disabled: !details } : { label: 'Connect repository', form: 'repository-form' }
  };
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
  return {
    title: receipt ? `${receipt.name} ${receipt.version} is uploaded` : 'No publication receipt is available',
    hint: receipt ? 'Open the exact source, package, and changelog below. A recorded branch upload does not establish that it has been merged.' : 'Return to Start to resume a saved draft or inspect your version library.',
    html: `<section class="card done-card"><p class="result-badge ${receipt ? 'pass' : 'warning'}"><span aria-hidden="true">${receipt ? '✓' : '!'}</span> ${receipt ? 'Uploaded — awaiting review or merge verification' : 'No verified upload recorded'}</p><p>${escape(receipt?.note ?? 'No publication receipt is available yet.')}</p>
      <ul class="receipt-links"><li>${verifiedLink(receipt?.sourceUrl, 'Open editable source')}</li><li>${verifiedLink(receipt?.packageUrl, 'Open .skill package')}</li><li>${verifiedLink(receipt?.changelogUrl, 'Open CHANGELOG.md')}</li><li>${verifiedLink(receipt?.reviewUrl, 'Open review branch or comparison')}</li></ul>
      ${receipt?.branch ? `<p class="detail"><strong>Review branch:</strong> ${escape(receipt.branch)}</p>` : ''}${receipt?.commit ? `<p class="detail"><strong>Verified upload commit:</strong> ${escape(receipt.commit)}</p>` : ''}
      ${receipt?.cleanupError ? `<p class="warning"><span aria-hidden="true">!</span> The upload succeeded, but local completion needs attention: ${escape(receipt.cleanupError)}. Your remaining draft is retained. Do not upload again to fix local completion.</p>` : '<p>Your version history remains available under the Start screen’s version library. Use Edit next version when you want to revise it.</p>'}</section>`,
    primary: { label: 'Start another skill', action: 'startAnother' }
  };
}

const styles = `
  :root { color-scheme: light dark; font-family: var(--vscode-font-family, system-ui, sans-serif); color: var(--vscode-editor-foreground, CanvasText); background: var(--vscode-editor-background, Canvas); font-size: var(--vscode-font-size, 14px); line-height: 1.55; }
  * { box-sizing: border-box; } body { margin: 0; } button, input, select, textarea { font: inherit; } button, input, select { min-block-size: 2.6rem; } button { cursor: pointer; border: 1px solid var(--vscode-contrastBorder, var(--vscode-button-border, transparent)); border-radius: .35rem; padding: .6rem .95rem; } button:disabled { cursor: wait; opacity: .65; } input, select, textarea { inline-size: 100%; padding: .65rem .75rem; color: var(--vscode-input-foreground, CanvasText); background: var(--vscode-input-background, Canvas); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, GrayText)); border-radius: .25rem; } textarea { resize: vertical; min-block-size: 6rem; } :where(button, a, input, select, textarea, summary):focus-visible { outline: 3px solid var(--vscode-focusBorder, Highlight); outline-offset: 3px; } input:user-invalid, textarea:user-invalid { border-color: var(--vscode-inputValidation-errorBorder, #be3f3f); } a { color: var(--vscode-textLink-foreground, LinkText); } a:hover { color: var(--vscode-textLink-activeForeground, LinkText); } h1 { font-size: clamp(1.6rem, 3vw, 2.15rem); line-height: 1.2; margin: .4rem 0 .75rem; font-weight: 650; letter-spacing: -.025em; } h2 { font-size: 1.12rem; line-height: 1.35; margin: 0 0 .75rem; } h3 { font-size: 1rem; margin-block: 1.2rem .6rem; } p { margin-block: .45rem .9rem; } [hidden] { display: none !important; }
  .shell { max-inline-size: 1120px; margin-inline: auto; padding: 1.4rem clamp(1rem, 3.3vw, 2.7rem) 0; } .brand { font-size: .92rem; color: var(--vscode-descriptionForeground, GrayText); letter-spacing: .04em; } .progress { padding: 0; margin: 1.3rem 0 2rem; list-style: none; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .5rem; } .step { display: flex; align-items: center; gap: .6rem; border-block-end: 2px solid var(--vscode-panel-border, GrayText); padding-block: .45rem .75rem; min-inline-size: 0; } .step-marker { display: grid; place-items: center; min-inline-size: 1.9rem; min-block-size: 1.9rem; border: 1px solid var(--vscode-panel-border, GrayText); border-radius: 50%; font-weight: 700; } .step-name { font-weight: 600; display: block; } .step-state { display: block; font-size: .76rem; color: var(--vscode-descriptionForeground, GrayText); } .step.current { border-color: var(--workbench-accent, #0b635d); } .step.current .step-marker { background: #0b635d; color: #ffffff; border-color: var(--workbench-accent, #0b635d); } .step.completed .step-marker { color: var(--vscode-testing-iconPassed, #55a66a); border-color: currentColor; }
  .next-step { border-inline-start: .3rem solid var(--workbench-accent, #0b635d); background: var(--vscode-textBlockQuote-background, var(--vscode-editor-inactiveSelectionBackground, ButtonFace)); padding: .8rem 1rem; margin-block-end: 1.3rem; } .next-step strong { display: block; margin-block-end: .1rem; } .card { padding: 1.3rem; border: 1px solid var(--vscode-panel-border, GrayText); border-radius: .55rem; margin-block-end: 1rem; } .hint, small { color: var(--vscode-descriptionForeground, GrayText); font-size: .9rem; } .field { margin-block-end: 1.2rem; } label, legend { font-weight: 600; } .field label { display: block; margin-block-end: .35rem; } .field .hint { margin-block: 0 .4rem; } fieldset { border: 0; padding: 0; margin: 0; min-inline-size: 0; } .button-row { display: flex; flex-wrap: wrap; gap: .6rem; } .secondary { color: var(--vscode-button-secondaryForeground, ButtonText); background: var(--vscode-button-secondaryBackground, ButtonFace); border-color: var(--vscode-contrastBorder, var(--vscode-panel-border, GrayText)); } .secondary:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground, ButtonFace)); } .primary { background: #0b635d; color: #ffffff; border: 2px solid var(--workbench-accent, #0b635d); min-inline-size: 13rem; font-weight: 650; } .primary:hover { background: #0a746b; }
  .action-bar { position: sticky; inset-block-end: 0; display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-block-start: 1.6rem; padding: 1rem 0 1.3rem; background: var(--vscode-editor-background, Canvas); border-block-start: 1px solid var(--vscode-panel-border, GrayText); } .action-bar .primary { margin-inline-start: auto; } .optional { margin-block: 1rem; } summary { cursor: pointer; padding: .6rem .1rem; font-weight: 600; } details > form, details > .card { margin-block-start: .75rem; } .connected-strip, .connection { overflow-wrap: anywhere; } .connected-strip { display: flex; gap: .65rem; align-items: baseline; border: 1px solid var(--vscode-testing-iconPassed, #55a66a); padding: .75rem 1rem; margin-block-end: 1rem; border-radius: .35rem; } .visibility { margin-block: .8rem; } .visibility label { display: flex; gap: .5rem; align-items: center; font-weight: 400; padding-block: .35rem; } input[type=radio] { inline-size: 1.1rem; min-block-size: 1.1rem; flex: none; accent-color: var(--vscode-focusBorder, Highlight); }
  .work-list, .file-list, .receipt-links { padding: 0; list-style: none; } .work-list li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .8rem 0; border-block-end: 1px solid var(--vscode-panel-border, GrayText); } .work-list small { display: block; } .saved-work { margin-block: 1.6rem; } .edit-toolbar { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 1.2rem; margin-block-end: 1rem; } .target-field { max-inline-size: 25rem; margin: 0; } .save-controls { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; } .editor-layout { display: grid; grid-template-columns: minmax(12rem, 17rem) minmax(0, 1fr); gap: 1.1rem; } .file-panel { border: 1px solid var(--vscode-panel-border, GrayText); border-radius: .4rem; padding: 1rem; min-inline-size: 0; } .file-list { margin: .5rem 0 1.2rem; max-block-size: 25rem; overflow: auto; } .file-button { display: block; text-align: start; inline-size: 100%; background: transparent; color: inherit; padding: .6rem; overflow-wrap: anywhere; border: 1px solid transparent; } .file-button small { display: block; } .file-button:hover { background: var(--vscode-list-hoverBackground, ButtonFace); } .file-button.selected { background: var(--vscode-list-inactiveSelectionBackground, ButtonFace); border-color: var(--vscode-focusBorder, Highlight); } .editor-panel { min-inline-size: 0; } .code-editor { font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 14px); line-height: 1.6; min-block-size: 30rem; tab-size: 2; white-space: pre; overflow: auto; } .findings li { margin-block-end: .8rem; overflow-wrap: anywhere; } .findings button { margin: .4rem 0 0 .5rem; } .result-badge { display: inline-flex; gap: .5rem; padding: .5rem .8rem; border: 1px solid currentColor; border-radius: .3rem; font-weight: 600; } .pass { color: var(--vscode-editor-foreground, CanvasText); border-color: var(--vscode-testing-iconPassed, #55a66a); } .pass > [aria-hidden="true"] { color: var(--vscode-testing-iconPassed, #55a66a); } .warning { color: var(--vscode-editor-foreground, CanvasText); border-color: var(--vscode-editorWarning-foreground, #bc8a27); } .warning > [aria-hidden="true"] { color: var(--vscode-editorWarning-foreground, #bc8a27); } .error-card { border-inline-start: .25rem solid var(--vscode-inputValidation-errorBorder, #be3f3f); } .feedback { margin-block: .5rem 1rem; overflow-wrap: anywhere; } .feedback:empty { margin: 0; } .error-message { border-inline-start: .25rem solid var(--vscode-inputValidation-errorBorder, #be3f3f); background: var(--vscode-inputValidation-errorBackground, ButtonFace); padding: .75rem 1rem; color: var(--vscode-errorForeground, CanvasText); } .notice-message { border-inline-start: .25rem solid var(--vscode-focusBorder, Highlight); padding: .5rem 1rem; } .package-summary { padding: 0; list-style: none; } .package-summary li { display: flex; gap: .65rem; padding-block: .5rem; } .receipt-links li { margin-block: .6rem; } .receipt-links a { display: inline-block; padding-block: .35rem; font-weight: 600; } .detail { overflow-wrap: anywhere; } .unavailable { color: var(--vscode-descriptionForeground, GrayText); } .skip-link { position: absolute; inset-inline-start: 1rem; inset-block-start: -5rem; padding: .6rem; background: var(--vscode-editor-background, Canvas); z-index: 10; } .skip-link:focus { inset-block-start: .5rem; } .visually-hidden { position: absolute; inline-size: 1px; block-size: 1px; clip-path: inset(50%); overflow: hidden; white-space: nowrap; }
  :root { --workbench-accent: #0b635d; } .brand-lockup { display: flex; align-items: center; gap: 1rem; margin-block: .3rem 1.4rem; min-inline-size: 0; } .brand-logo { inline-size: 64px; block-size: 64px; object-fit: contain; flex: none; } .brand-wordmark { min-inline-size: 0; } .brand-company { display: block; color: var(--workbench-accent); font-size: .78rem; line-height: 1.5; font-weight: 750; letter-spacing: .16em; } .brand-product { display: block; color: var(--vscode-editor-foreground, CanvasText); font-size: clamp(1.3rem, 2.3vw, 1.8rem); font-weight: 700; line-height: 1.2; letter-spacing: -.025em; margin: .08rem 0 .2rem; overflow-wrap: anywhere; } .brand-tagline { display: block; color: var(--vscode-descriptionForeground, GrayText); font-size: .85rem; line-height: 1.4; }
  @media (prefers-color-scheme: dark) { :root { --workbench-accent: #67c3b8; } } body.vscode-light { --workbench-accent: #0b635d; } body.vscode-dark { --workbench-accent: #67c3b8; }
  .editor-skip { position: absolute; inline-size: 1px; block-size: 1px; clip-path: inset(50%); overflow: hidden; white-space: nowrap; } .editor-skip:focus { position: static; display: block; inline-size: auto; block-size: auto; clip-path: none; overflow: visible; white-space: normal; padding: .5rem; margin-block-end: .5rem; }
  .start-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: .8rem; } .start-option { min-inline-size: 0; } .start-choices button { inline-size: 100%; min-block-size: 3.5rem; font-weight: 650; } .start-option .hint { margin: .6rem .15rem 0; }
  @media (max-width: 760px) { .editor-layout { grid-template-columns: 1fr; } .file-list { max-block-size: 12rem; } .code-editor { min-block-size: 24rem; } .step { flex-direction: column; align-items: start; gap: .35rem; } .step-name { font-size: .9rem; } .step-state { font-size: .7rem; } .work-list li { align-items: start; flex-direction: column; gap: .5rem; } .action-bar { align-items: stretch; } .action-bar .primary { min-inline-size: 0; flex: 1; } }
  @media (pointer: coarse) { button, input, select, summary { min-block-size: 3rem; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
  @media (forced-colors: active) { .card, .file-panel, .connected-strip, .next-step, button, input, select, textarea, .step, .result-badge { border-color: CanvasText; } :where(button, a, input, select, textarea, summary):focus-visible { outline-color: Highlight; } .primary, .step.current .step-marker { forced-color-adjust: auto; background: Highlight; color: HighlightText; border-color: Highlight; } .brand-company { color: CanvasText; } .next-step { border-inline-start-color: Highlight; } }
`;

const script = `
  const vscode = acquireVsCodeApi();
  const main = document.getElementById('main-content');
  const step = main.dataset.step;
  const activeId = main.dataset.activeId || '';
  const scope = main.dataset.formScope || step;
  let saved = vscode.getState() || {};
  let saveTimer;
  let savePending = false;
  let queuedAction;
  let lastSavedContent = '';
  let actionPending = main.dataset.busy === 'true';
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
    const value = element.type === 'radio' ? String(element.checked) : element.value;
    initialFields[key] = value;
    const previous = saved.fields && saved.fields[key];
    if (previous && previous.base === value) {
      if (element.type === 'radio') element.checked = previous.value === 'true';
      else element.value = previous.value;
    }
  });
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
      fields[key] = { base: initialFields[key], value: element.type === 'radio' ? String(element.checked) : element.value };
    });
    saved = Object.assign({}, saved, { fields, step, activeId });
    if (editor && !editor.readOnly) saved.editor = { activeId, path: editor.dataset.editorPath, base: initialEditorContent, content: editor.value };
    const focused = document.activeElement;
    if (focused && focused.id) saved.focus = { id: focused.id, start: focused.selectionStart, end: focused.selectionEnd };
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
    document.querySelectorAll('button').forEach(button => { button.disabled = locked || button.dataset.unavailable === 'true'; });
    main.setAttribute('aria-busy', String(locked));
  }
  function post(action, payload = {}) {
    if (actionPending) return;
    persist();
    clearTimeout(saveTimer);
    if (action !== 'save' && savePending) { queuedAction = { action, payload }; lockActions(true); return; }
    if (action === 'save') {
      if (!editor || editor.readOnly || savePending) return;
      savePending = true;
      lastSavedContent = editor.value;
      document.getElementById('save-status').textContent = 'Saving locally…';
    } else {
      lockActions(true);
      if (action === 'startAnother') { saved = {}; vscode.setState(saved); }
    }
    if (action === 'reloadFile') { delete saved.editor; vscode.setState(saved); }
    vscode.postMessage(Object.assign({ action, payload }, action === 'reloadFile' ? {} : buffer()));
  }
  function scheduleSave() {
    if (!editor || editor.readOnly || actionPending) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => post('save'), 500);
  }
  function fieldValue(id) { const element = document.getElementById(id); return element ? element.value : ''; }
  function updateRepositoryCreateLabel() {
    const button = document.getElementById('create-repository-button');
    const selected = document.querySelector('input[name="visibility"]:checked');
    if (button) button.textContent = 'Create ' + (selected ? selected.value : 'private') + ' repository';
  }
  document.querySelectorAll('form[data-form-action]').forEach(form => form.addEventListener('submit', event => {
    event.preventDefault();
    if (event.isComposing || actionPending) return;
    if (!form.reportValidity()) { clientError('Complete the required fields highlighted below.'); const first = form.querySelector(':invalid'); if (first) first.focus(); return; }
    clientError('');
    const action = form.dataset.formAction;
    let payload = {};
    if (action === 'connectRepository') payload = { repository: fieldValue('repository') };
    if (action === 'createRepository') payload = { name: fieldValue('repositoryName'), visibility: document.querySelector('input[name="visibility"]:checked').value, confirmed: true };
    if (action === 'createSkill') payload = { name: fieldValue('skillName'), description: fieldValue('skillDescription'), instructions: fieldValue('skillInstructions') };
    if (action === 'addFile') payload = { path: fieldValue('addFilePath') };
    if (action === 'createFile') payload = { path: fieldValue('newFilePath') };
    if (action === 'publish') payload = { version: fieldValue('releaseVersion'), changelog: fieldValue('releaseChangelog') };
    post(action, payload);
  }));
  document.addEventListener('click', event => {
    const element = event.target.closest('[data-action]');
    if (!element) return;
    event.preventDefault();
    const payload = {};
    for (const key of ['id', 'directory', 'path', 'url']) if (element.dataset[key] !== undefined) payload[key] = element.dataset[key];
    post(element.dataset.action, payload);
  });
  document.addEventListener('input', event => {
    clientError(''); persist();
    if (event.target.validity && event.target.validity.valid) event.target.removeAttribute('aria-invalid');
    if (event.target === editor && !editor.readOnly) { document.getElementById('save-status').textContent = 'Unsaved changes'; scheduleSave(); }
  });
  document.addEventListener('change', () => { updateRepositoryCreateLabel(); persist(); });
  document.addEventListener('focusin', () => persist());
  const repositoryChoice = document.getElementById('repository-choice');
  if (repositoryChoice) repositoryChoice.addEventListener('change', () => { if (repositoryChoice.value) document.getElementById('repository').value = repositoryChoice.value; persist(); });
  const target = document.getElementById('target');
  if (target) target.addEventListener('change', () => post('setTarget', { target: target.value }));
  window.addEventListener('message', event => {
    const message = event.data || {};
    if (message.type === 'progress') { const output = document.getElementById('progress-message'); output.textContent = String(message.message || ''); output.hidden = !message.message; }
    if (message.type === 'saved') {
      savePending = false;
      const status = document.getElementById('save-status');
      const retry = document.getElementById('retry-save');
      const reload = document.getElementById('reload-file');
      if (message.error) { clientError(String(message.error)); if (status) status.textContent = 'Save failed — changes kept on this screen'; if (retry) retry.hidden = false; if (reload) reload.hidden = false; }
      else {
        const current = editor ? editor.value : '';
        if (status) status.textContent = current === lastSavedContent ? 'Saved locally' : 'Unsaved changes';
        if (retry) retry.hidden = true;
        if (reload) reload.hidden = true;
        if (current !== lastSavedContent) scheduleSave();
      }
      persist();
      if (queuedAction) { const next = queuedAction; queuedAction = undefined; lockActions(false); post(next.action, next.payload); }
    }
  });
  updateRepositoryCreateLabel();
  if (actionPending) { lockActions(true); document.querySelectorAll('input,select,textarea').forEach(element => { element.disabled = true; }); }
  const previousStep = saved.step;
  const previousActive = saved.activeId;
  if (main.dataset.hasError === 'true') document.getElementById('feedback').focus();
  else if (previousStep !== step || previousActive !== activeId) document.getElementById('stepHeading').focus();
  else if (saved.focus) { const focused = document.getElementById(saved.focus.id); if (focused && !focused.disabled) { focused.focus({ preventScroll: true }); if (typeof focused.setSelectionRange === 'function' && typeof saved.focus.start === 'number') focused.setSelectionRange(saved.focus.start, saved.focus.end); } }
  persist();
  if (editor && !editor.readOnly && editor.value !== initialEditorContent) { document.getElementById('save-status').textContent = 'Unsaved changes'; scheduleSave(); }
`;

export function renderGuidedWorkbench(state: GuidedState, nonce: string, brand?: GuidedBrand): string {
  nonce = nonceValue(nonce);
  const current = Math.max(0, steps.findIndex(step => step.key === state.step));
  const screen = state.step === 'edit' ? edit(state) : state.step === 'check' ? check(state) : state.step === 'publish' ? publish(state) : state.step === 'done' ? done(state) : start(state);
  const formScope = state.step === 'publish' ? `${state.active?.id ?? ''}:publish:${state.publish?.version ?? ''}` : state.step === 'start' ? `start:${state.form?.mode ?? 'home'}` : `${state.active?.id ?? ''}:${state.step}`;
  const backDisabled = state.step === 'start' && !state.form?.mode;
  const primary = screen.primary;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><title>${escape(screen.title)} | ${escape(productName(brand))}</title><style nonce="${nonce}">${styles}</style></head><body>
    <a href="#main-content" class="skip-link">Skip to current step</a><div class="shell"><header>${brandHeader(brand)}<nav aria-label="Skill workflow progress"><ol class="progress">${steps.map((step, index) => `<li class="step ${index === current ? 'current' : index < current ? 'completed' : ''}" ${index === current ? 'aria-current="step"' : ''}><span class="step-marker" aria-hidden="true">${index < current ? '✓' : index + 1}</span><span><span class="step-name"><span class="visually-hidden">Step ${index + 1}: </span>${step.name}</span><span class="step-state">${index === current ? 'Current step' : index < current ? 'Complete' : 'Next'}</span></span></li>`).join('')}</ol></nav></header>
    <main id="main-content" tabindex="-1" data-step="${escape(state.step)}" data-active-id="${escape(state.active?.id ?? '')}" data-form-scope="${escape(formScope)}" data-busy="${!!state.busy}" data-has-error="${!!state.error}" aria-busy="${!!state.busy}">
      <h1 id="stepHeading" tabindex="-1">${escape(screen.title)}</h1><div class="next-step"><strong>Next step</strong>${escape(screen.hint)}</div>
      <div id="feedback" class="feedback" role="status" aria-live="polite" aria-atomic="true" tabindex="-1">${state.error ? `<p class="error-message"><strong>Needs attention.</strong> ${escape(state.error)}</p>` : state.notice ? `<p class="notice-message">${escape(state.notice)}</p>` : ''}<p id="progress-message" ${!state.progress ? 'hidden' : ''}>${escape(state.progress ?? '')}</p><p id="client-error" class="error-message" hidden></p></div>
      ${screen.html}
      ${state.step !== 'edit' && state.editor ? `<textarea id="bufferContent" hidden data-editor-path="${escape(state.editor.path)}" ${state.editor.readOnly ? 'readonly data-read-only="true"' : ''}>${escape(state.editor.content)}</textarea>` : ''}
      ${primary ? `<footer class="action-bar"><button type="button" class="secondary" data-action="back" ${backDisabled ? 'disabled data-unavailable="true"' : ''}>← Back</button><button id="primary-action" class="primary" type="${primary.form ? 'submit' : 'button'}" ${primary.form ? `form="${primary.form}"` : `data-action="${primary.action}"`} ${state.busy || primary.disabled ? 'disabled' : ''} ${primary.disabled ? 'data-unavailable="true"' : ''}>${state.busy ? 'Working…' : escape(primary.label)} <span aria-hidden="true">→</span></button></footer>` : ''}
    </main></div><script nonce="${nonce}">const initialFileContent = ${scriptString(state.editor?.content ?? '')};${script}</script></body></html>`;
}

export function renderGuidedLauncher(nonce: string, brand?: GuidedBrand): string {
  nonce = nonceValue(nonce);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><title>Open ${escape(productName(brand))}</title><style nonce="${nonce}">${styles}body{padding:1.1rem}.primary{inline-size:100%;min-inline-size:0;margin-block:1rem}.brand-lockup{gap:.7rem;margin-block-end:1.25rem}.brand-product{font-size:1.25rem}.brand-tagline{font-size:.77rem}.launcher-steps{padding-inline-start:1.2rem}.launcher-steps li{margin-block:.35rem}</style></head><body><main>${brandHeader(brand, true)}<p>Create or open a skill, edit its files, check it, and publish a version.</p><ol class="launcher-steps"><li>Start with a draft</li><li>Edit and check</li><li>Publish and keep its history</li></ol><button type="button" class="primary" id="open-workbench">Open Workbench <span aria-hidden="true">→</span></button><p class="hint">The full workflow opens in an editor tab. Your drafts and original packages stay in the workspace.</p></main><script nonce="${nonce}">const vscode=acquireVsCodeApi();document.getElementById('open-workbench').addEventListener('click',()=>vscode.postMessage({action:'openWorkbench'}));</script></body></html>`;
}
