const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { renderGuidedWorkbench } = require('../out/guided-workbench-html.js');

const nonce = 'humanWorkbenchNonce123';
function state(overrides = {}) {
  return {
    step: 'publish', hasWorkspace: true, repositories: [], drafts: [], library: [], files: [], target: 'portable',
    active: { id: 'sample', name: 'sample', version: '2.13.0', versionNote: 'Read from SKILL.md metadata.version.' },
    connection: { repository: 'https://github.com/example/Skills.git', baseBranch: 'main' },
    publish: { version: '2.13.1', changelog: '', fileCount: 3, versionSource: 'The previous release is preserved; this is the next available number.',
      changeSummary: { added: ['references/new.md'], changed: ['SKILL.md'], removed: [], unchanged: 1 }, suggestedChangelog: 'Updated SKILL.md. Added references/new.md.' },
    ...overrides
  };
}

test('sharing a skill needs neither a version decision nor handwritten release notes', () => {
  const html = renderGuidedWorkbench(state(), nonce);
  assert.match(html, /id="managed-version">2\.13\.1<\/strong>/);
  assert.match(html, /Declared version 2\.13\.0/);
  const override = /<input id="releaseVersion"([^>]*)>/.exec(html);
  assert(override);
  assert.match(override[1], /value=""/);
  assert.doesNotMatch(override[1], /\brequired\b/);
  assert.match(html, /<details class="optional" ><summary>Advanced: choose a release number/);
  const notes = /<textarea id="releaseChangelog"([^>]*)>/.exec(html);
  assert(notes);
  assert.doesNotMatch(notes[1], /\brequired\b/);
  assert.match(html, /Anything else people should know\? \(optional\)/);
  assert.match(html, /1 added · 1 changed · 0 removed · 1 unchanged/);
  assert.match(html, /Preview automatic release notes/);
  assert.match(html, /counts describe file contents, not whether the skill behaves better/);
});

test('package facts and automatic notes are escaped instead of becoming webview instructions', () => {
  const base = state();
  const html = renderGuidedWorkbench(state({ active: { ...base.active, name: '<script>unsafe()</script>', versionNote: '<img src=x>' },
    publish: { ...base.publish, versionWarning: '<script>conflict()</script>', suggestedChangelog: '</pre><script>notes()</script>',
      changeSummary: { added: ['<img src=x>.md'], changed: [], removed: [], unchanged: 0 } }
  }), nonce);
  assert.match(html, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
  assert.match(html, /&lt;script&gt;conflict\(\)&lt;\/script&gt;/);
  assert.match(html, /&lt;\/pre&gt;&lt;script&gt;notes\(\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x&gt;\.md/);
  assert.doesNotMatch(html, /<script>unsafe|<script>conflict|<script>notes|<img src=x>/);
});

test('publish sends an override only when the person actually supplies one', () => {
  const html = renderGuidedWorkbench(state(), nonce);
  const source = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1];
  const start = source.indexOf("document.querySelectorAll('form[data-form-action]')");
  const end = source.indexOf("document.addEventListener('click'", start);
  assert(start >= 0 && end > start);
  for (const [override, expected] of [['', undefined], [' 3.0.0 ', '3.0.0']]) {
    let submit;
    let posted;
    const form = { dataset: { formAction: 'publish' }, reportValidity: () => true, addEventListener: (_name, handler) => { submit = handler; } };
    const context = { document: { querySelectorAll: () => [form] }, actionPending: false,
      clientError: () => {}, fieldValue: id => id === 'releaseVersion' ? override : '', post: (action, payload) => { posted = { action, payload }; } };
    new vm.Script(source.slice(start, end)).runInNewContext(context);
    submit({ preventDefault() {}, isComposing: false });
    assert.equal(posted.action, 'publish');
    assert.equal(posted.payload.version, expected);
    assert.equal(Object.hasOwn(posted.payload, 'version'), expected !== undefined);
    assert.equal(posted.payload.changelog, '');
    assert.equal(posted.payload.confirmed, false);
  }
});

test('a checked skill can become a usable package without a repository or account', () => {
  const html = renderGuidedWorkbench(state({ connection: undefined }), nonce);
  assert.match(html, /data-form-action="savePackage"/);
  assert.match(html, /id="primary-action"[^>]*form="publish-form"[^>]*>Save package on this computer/);
  assert.match(html, /<summary>Optional: share through a repository<\/summary>/);
  assert.match(html, /No repository or sign-in is needed/);
  assert.doesNotMatch(html, /id="primary-action"[^>]*form="repository-form"/);
});

test('saving locally from a connected workbench sends no review request', () => {
  const html = renderGuidedWorkbench(state(), nonce);
  assert.match(html, /type="submit" class="secondary" data-submit-action="savePackage">Save package on this computer/);
  const source = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1];
  const start = source.indexOf("document.querySelectorAll('form[data-form-action]')");
  const end = source.indexOf("document.addEventListener('click'", start);
  let submit;
  let posted;
  const form = { dataset: { formAction: 'publish' }, reportValidity: () => true, addEventListener: (_name, handler) => { submit = handler; } };
  new vm.Script(source.slice(start, end)).runInNewContext({ document: { querySelectorAll: () => [form] }, actionPending: false,
    clientError: () => {}, fieldValue: id => id === 'reviewer' ? 'someone' : id === 'releaseChangelog' ? 'Useful context.' : '',
    post: (action, payload) => { posted = { action, payload }; } });
  submit({ preventDefault() {}, isComposing: false, submitter: { dataset: { submitAction: 'savePackage' } } });
  assert.equal(posted.action, 'savePackage');
  assert.equal(posted.payload.reviewer, '');
  assert.equal(posted.payload.confirmed, false);
  assert.equal(posted.payload.changelog, 'Useful context.');
  assert.equal(Object.hasOwn(posted.payload, 'version'), false);
});

test('local package receipt shows the file and retained draft without claiming upload or review', () => {
  const html = renderGuidedWorkbench(state({ step: 'done', receipt: { name: 'sample', version: '2.13.1', local: true,
    packagePath: 'P:/skills/<sample>.skill', note: 'Package checked and saved.' } }), nonce);
  assert.match(html, /sample 2\.13\.1 — saved on this computer/);
  assert.match(html, /P:\/skills\/&lt;sample&gt;\.skill/);
  assert.match(html, /data-action="revealPackage"/);
  assert.match(html, /data-action="resume"[^>]*data-id="sample"[^>]*>Continue improving/);
  assert.doesNotMatch(html, /Version upload verified|Uploaded — PR|data-action="checkPullRequest"|Open uploaded branch/);
});

test('earlier edits are recoverable without showing history for a binary file', () => {
  const edit = state({ step: 'edit', editor: { path: 'SKILL.md', content: 'Current instructions' },
    history: [{ id: 'earlier-edit', path: 'SKILL.md', at: '2026-10-26T12:00:00Z' }] });
  const html = renderGuidedWorkbench(edit, nonce);
  assert.match(html, /Earlier edits \(1\)/);
  assert.match(html, /without losing the content currently saved/);
  assert.match(html, /data-action="restoreEdit" data-id="earlier-edit"/);
  assert.match(html, /data-action="refreshHistory"[^>]*>Refresh earlier edits/);
  assert.match(html, /<time datetime="2026-10-26T12:00:00Z">/);
  const binary = renderGuidedWorkbench({ ...edit, editor: { path: 'asset.bin', content: '', readOnly: true } }, nonce);
  assert.doesNotMatch(binary, /data-action="restoreEdit"/);
  assert.doesNotMatch(binary, /data-action="refreshHistory"/);
});

test('an empty history explains how to reveal edits saved without leaving the editor', () => {
  const html = renderGuidedWorkbench(state({ step: 'edit', editor: { path: 'SKILL.md', content: 'Instructions' }, history: [], form: { historyOpen: 'true' } }), nonce);
  assert.match(html, /data-action="refreshHistory"[^>]*>Refresh earlier edits/);
  assert.match(html, /Refresh to show edits saved since this screen opened/);
  assert.match(html, /Save changes, then refresh to see earlier content/);
  assert.match(html, /<details class="optional edit-history" open>/);
  assert.match(html, /Build it\. Improve it\. Share it\./);
});

test('saved releases invite improving the skill while preserving earlier releases', () => {
  const html = renderGuidedWorkbench(state({ step: 'start', skillsLoaded: true, library: [{ skillName: 'sample', version: '2.13.0', directory: 'releases/sample/2.13.0', status: 'uploaded' }] }), nonce);
  assert.match(html, /Saved releases/);
  assert.match(html, /Earlier releases stay unchanged/);
  assert.match(html, /Improve sample from 2\.13\.0/);
  assert.match(html, /SkillJetty handles the next release number/);
});
