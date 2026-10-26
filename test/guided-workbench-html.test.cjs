const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { renderGuidedWorkbench, renderGuidedLauncher } = require('../out/guided-workbench-html.js');

const nonce = 'testNonce12345678';
function state(overrides = {}) {
  return {
    step: 'start', hasWorkspace: true, repositories: [], drafts: [], library: [], files: [], target: 'portable',
    connection: { repository: 'https://github.com/example/Skills.git', baseBranch: 'main' }, ...overrides
  };
}

test('each guided step marks progress; Start offers equal choices and later steps have one next action', () => {
  for (const step of ['start', 'edit', 'check', 'publish', 'done']) {
    const html = renderGuidedWorkbench(state({ step, active: { id: 'sample', name: 'sample' }, check: { valid: true, errors: [], warnings: [], compatibility: 'Portable', behaviorNote: 'No model was run.' }, publish: { version: '1.0.0', changelog: '', fileCount: 1 } }), nonce);
    assert.equal((html.match(/id="primary-action"/g) || []).length, step === 'start' ? 0 : 1, step);
    assert.equal((html.match(/aria-current="step"/g) || []).length, 1, step);
    if (step !== 'start') assert.match(html, /data-action="back"/, step);
    else for (const action of ['showCreate', 'openPackage', 'openFolder']) assert.match(html, new RegExp(`class="secondary" data-action="${action}"`));
    assert.match(html, /Step 1: <\/span>Start/, step);
    assert.match(html, /Step 5: <\/span>Done/, step);
    const scripts = [...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    assert.doesNotThrow(() => new vm.Script(scripts[0][1]));
  }
});

test('start uses inline repository selection and preserves create inputs without a branch prompt', () => {
  const repository = renderGuidedWorkbench(state({ connection: undefined, repositories: [{ label: 'My Skills', repository: 'https://github.com/example/Skills.git' }] }), nonce);
  assert.match(repository, /<select id="repository-choice"/);
  assert.match(repository, /id="repository" name="repository"/);
  assert.doesNotMatch(repository, /<(?:input|select)[^>]+(?:id|name)="[^"]*branch/i);
  assert.match(repository, /data-form-action="connectRepository"/);
  assert.match(repository, /<button type="submit" class="secondary">Connect repository/);
  for (const action of ['showCreate', 'openPackage', 'openFolder']) assert.match(repository, new RegExp(`data-action="${action}"`));
  assert.match(repository, /No repository connection is needed to create, open, or edit a skill/);
  assert(repository.indexOf('class="start-choices"') < repository.indexOf('id="repository-form"'));
  assert.doesNotMatch(repository, /id="primary-action"/);
  const creation = renderGuidedWorkbench(state({ form: { mode: 'create', name: 'weekly-status', description: 'Summarize project updates.', instructions: 'Keep unknowns explicit.' } }), nonce);
  assert.match(creation, /id="skillName"[^>]*value="weekly-status"/);
  assert.match(creation, />Summarize project updates\.<\/textarea>/);
  assert.match(creation, />Keep unknowns explicit\.<\/textarea>/);
  assert.match(creation, /form="create-form"[^>]*>Create draft/);
});

test('skill contents and paths remain inert text, including textarea and script closing payloads', () => {
  const attack = '</textarea><script>globalThis.injected = true</script><img src=x onerror="injected()">';
  const html = renderGuidedWorkbench(state({ step: 'edit', active: { id: 'sample', name: '<unsafe>' }, editor: { path: 'notes" data-hijack="yes.md', content: attack }, files: [{ path: 'notes" data-hijack="yes.md', size: 7, text: true }] }), nonce);
  assert.match(html, /&lt;\/textarea&gt;&lt;script&gt;globalThis.injected/);
  assert.match(html, /data-path="notes&quot; data-hijack=&quot;yes.md"/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>globalThis.injected/);
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.match(html, /&lt;unsafe&gt;/);
});

test('repository discovery leaves Start connection controls expanded so the returned choices are visible', () => {
  const html = renderGuidedWorkbench(state({ repositories: [{ label: 'My Skills', repository: 'https://github.com/example/Skills.git' }] }), nonce);
  assert.match(html, /<details class="optional" open><summary>Change the connected repository<\/summary>/);
  assert.match(html, /<select id="repository-choice"/);
});

test('serialized file data restores both textarea values before the baseline without opening a script boundary', () => {
  const content = '\n\n</textarea></script><script>globalThis.injected=true</script>\u2028\u2029&<>\r\n' + ['$&', "$'", '$`', '$$'].join(' ');
  for (const step of ['edit', 'check']) {
    const html = renderGuidedWorkbench(state({ step, active: { id: 'sample', name: 'sample' }, editor: { path: 'notes.md', content } }), nonce);
    const scripts = [...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1, 'file text must not terminate the legitimate script element');
    const source = scripts[0][1];
    assert.doesNotMatch(source, /<\/script>|[\u2028\u2029]/);
    const editor = step === 'edit' ? { value: 'HTML parser already lost the leading line.' } : null;
    const hidden = step === 'check' ? { value: 'HTML parser already lost the leading line.' } : null;
    const document = { getElementById: id => id === 'main-content' ? { dataset: {} } : id === 'editorContent' ? editor : hidden };
    const prefix = source.slice(0, source.indexOf('const initialFields'));
    const result = new vm.Script(prefix + ';({ content: (editor || hiddenBuffer).value, baseline: initialEditorContent, injected: typeof globalThis.injected });').runInNewContext({ document, acquireVsCodeApi: () => ({ getState: () => ({}) }) });
    assert.equal(result.content, content);
    assert.equal(result.baseline, step === 'edit' ? content : '');
    assert.equal(result.injected, 'undefined');
  }
});

test('CSP permits only nonced local code and the client uses no HTML injection or network API', () => {
  const html = renderGuidedWorkbench(state(), nonce);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /style-src 'nonce-testNonce12345678'/);
  assert.match(html, /script-src 'nonce-testNonce12345678'/);
  assert.match(html, /form-action 'none'/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|\.innerHTML|\.outerHTML|insertAdjacentHTML|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.throws(() => renderGuidedWorkbench(state(), 'bad"nonce'), /valid webview nonce/);
});

test('dense skill file lists offer a native keyboard skip link directly to the editor', () => {
  const html = renderGuidedWorkbench(state({ step: 'edit', active: { id: 'sample', name: 'sample' },
    editor: { path: 'SKILL.md', content: '# Skill' },
    files: Array.from({ length: 189 }, (_, index) => ({ path: `references/file-${index}.md`, size: 10, text: true }))
  }), nonce);
  assert.match(html, /<a href="#editorContent" class="editor-skip">Skip file list and edit selected file<\/a>/);
  assert(html.indexOf('class="editor-skip"') < html.indexOf('<ul class="file-list">'));
  assert.match(html, /\.editor-skip:focus/);
  assert.doesNotMatch(html, /tabindex="[1-9]/);
});

test('check and publish explain their limits and show actionable file findings', () => {
  const check = renderGuidedWorkbench(state({ step: 'check', check: { valid: false, errors: [{ message: 'Description is missing.', file: 'SKILL.md' }], warnings: [], compatibility: 'Portable structure only.', behaviorNote: 'No AI model has been executed.' } }), nonce);
  assert.match(check, /data-action="openFile" data-path="SKILL.md"/);
  assert.match(check, /Fix and return to editing/);
  assert.match(check, /No AI model has been executed/);
  const publish = renderGuidedWorkbench(state({ step: 'publish', publish: { version: '2.0.1', changelog: 'Improved input handling.', repository: 'https://github.com/example/Skills.git', fileCount: 4 } }), nonce);
  assert.match(publish, /id="releaseVersion"[^>]*value="2.0.1"/);
  assert.match(publish, /Improved input handling\.<\/textarea>/);
  assert.match(publish, /Editable source/);
  assert.match(publish, /Installable .skill package/);
  assert.match(publish, /CHANGELOG.md/);
  assert.match(publish, /Change or reconnect the repository/);
  assert.match(publish, /form="publish-form"[^>]*>Upload &amp; create PR/);
  assert.match(publish, /Step 4: <\/span>Submit/);
  assert.match(publish, /data-action="loadReviewers"/);
  assert.match(publish, /Selecting a reviewer sends that person a review request when you submit/);
});

test('done exposes only HTTPS receipt links and distinguishes uploaded content from merged content', () => {
  const html = renderGuidedWorkbench(state({ step: 'done', receipt: {
    name: 'sample', version: '1.0.0', note: '<b>Remote commit confirmed.</b>', branch: 'skills/sample/1.0.0',
    sourceUrl: 'https://github.com/example/Skills/tree/commit/sample/1.0.0/source/sample',
    packageUrl: 'javascript:injected()', changelogUrl: 'https://user:token@example.invalid/log', reviewUrl: 'https://github.com/example/Skills/compare/main...branch'
  } }), nonce);
  assert.match(html, /data-action="openLink"/);
  assert.match(html, /Open editable source/);
  assert.match(html, /Uploaded — PR not checked/);
  assert.match(html, /Version upload verified/);
  assert.match(html, /&lt;b&gt;Remote commit confirmed\.&lt;\/b&gt;/);
  assert.doesNotMatch(html, /href="javascript:|data-url="javascript:|user:token/);
  assert.match(html, /data-action="startAnother"/);
});

test('submission reviewer choice is optional, escaped and explicitly discloses notifications', () => {
  const html = renderGuidedWorkbench(state({ step: 'publish', publish: { version: '1.0.0', changelog: 'Initial version.', fileCount: 3 },
    reviewersLoaded: true, reviewers: [{ login: 'casey', name: 'Casey <script>unsafe()</script>' }], form: { reviewer: 'casey' }
  }), nonce);
  assert.match(html, /<label for="reviewer">Reviewer \(optional\)<\/label>/);
  const select = /<select id="reviewer"([^>]*)>([\s\S]*?)<\/select>/.exec(html);
  assert(select); assert.doesNotMatch(select[1], /required/);
  assert.match(select[2], /value="">Skip — do not request a reviewer/);
  assert.match(select[2], /value="casey" selected/);
  assert.match(select[2], /Casey &lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
  assert.match(html, /Submitting a review request will notify that person/);
  assert.match(html, /const reviewer = fieldValue\('reviewer'\)/);
  assert.match(html, /reviewer, confirmed: !!reviewer/);
});

test('GitHub account control delegates consent to VS Code and does not solicit a token', () => {
  const connect = renderGuidedWorkbench(state(), nonce);
  assert.match(connect, /data-action="connectGitHub"[^>]*>Connect GitHub account/);
  assert.match(connect, /VS Code manages sign-in and asks you to allow repository access/);
  assert.match(connect, /Cancel keeps your draft unchanged/);
  assert.doesNotMatch(connect, /type="password"|name="token"|name="pat"/);
  const switched = renderGuidedWorkbench(state({ githubAccount: 'Account <unsafe>' }), nonce);
  assert.match(switched, /Account &lt;unsafe&gt;/);
  assert.match(switched, /data-action="connectGitHub"[^>]*>Switch GitHub account/);
  assert.match(switched, /key\.endsWith\(':reviewer'\)/);
  assert.match(switched, /element\.name === 'reviewer' && reviewerContextChanged/);
});

test('non-GitHub uploads do not advertise automatic PRs or reviewer requests', () => {
  const html = renderGuidedWorkbench(state({ step: 'publish', connection: { repository: 'C:/local/repository.git', baseBranch: 'main' },
    publish: { version: '1.0.0', changelog: 'Initial version.', fileCount: 4, reviewSupported: false }, reviewersLoaded: true, reviewers: [{ login: 'casey' }]
  }), nonce);
  assert.match(html, /form="publish-form"[^>]*>Upload version/);
  assert.match(html, /This upload does not create a PR or notify a reviewer/);
  assert.doesNotMatch(html, /id="reviewer"|data-action="loadReviewers"|>Upload &amp; create PR/);
});

test('review dashboard distinguishes approval, merge, unknown and uploaded legacy versions', () => {
  const reviewQueue = ['awaiting_review', 'changes_requested', 'approved', 'merged', 'closed', 'unknown', 'uploaded', 'unsupported'].map((status, index) => ({
    directory: `releases/sample/${index}`, skillName: 'sample', version: `1.0.${index}`,
    pr: { status, supported: status !== 'unsupported', ...(status !== 'uploaded' && status !== 'unsupported' ? { number: index + 1 } : {}), checkedAt: '2026-10-26T02:30:00Z' }
  }));
  const html = renderGuidedWorkbench(state({ form: { mode: 'reviews' }, reviewQueue }), nonce);
  for (const label of ['Awaiting review', 'Changes requested', 'Approved — awaiting merge', 'Merged', 'Closed without merging', 'Status not verified', 'Uploaded — PR not created', 'Uploaded — PRs unavailable']) assert(html.includes(label));
  assert.match(html, /data-action="checkPullRequests"/);
  assert.match(html, /data-action="createPullRequest" data-directory="releases\/sample\/6"/);
  assert.doesNotMatch(html, /data-action="createPullRequest" data-directory="releases\/sample\/7"/);
  assert.doesNotMatch(html, /data-action="(?:merge|mergePullRequest|autoMerge)"/);
  assert.match(html, /Last verified:/);
});

test('PR request failure leaves uploaded contents visible and offers a bounded retry without raw URLs', () => {
  const html = renderGuidedWorkbench(state({ step: 'done', receipt: { name: 'sample', version: '1.0.0', directory: 'releases/sample/1.0.0', note: 'Upload verified.',
    pr: { supported: true, status: 'awaiting_review', number: 12, url: 'https://untrusted.invalid/pr', reviewer: 'casey', reviewRequestError: '<script>unsafe()</script>', checkedAt: '2026-10-26T02:30:00Z' }
  } }), nonce);
  assert.match(html, /The PR exists, but the review request was not confirmed/);
  assert.match(html, /Version upload verified/);
  assert.match(html, /data-action="requestReviewer" data-directory="releases\/sample\/1.0.0" data-reviewer="casey" data-confirmed="true"/);
  assert.match(html, /data-action="openPullRequest" data-directory="releases\/sample\/1.0.0"/);
  assert.doesNotMatch(html, /data-action="createPullRequest"/);
  assert.doesNotMatch(html, /untrusted\.invalid|<script>unsafe\(\)/);
});

test('launcher has one plain Open Workbench action rather than nested command menus', () => {
  const html = renderGuidedLauncher(nonce);
  assert.equal((html.match(/<button\b/g) || []).length, 1);
  assert.match(html, /Open Workbench/);
  assert.match(html, /action:'openWorkbench'/);
  assert.doesNotMatch(html, /data-tab=|role="tree"|command:/);
});

test('trusted DAF-TECH PNG and configurable product wordmark appear throughout the guided workflow and launcher', () => {
  const logo = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, '..', 'images', 'icon.png')).toString('base64')}`;
  const brand = { productName: 'Brand Product', logoDataUri: logo };
  for (const step of ['start', 'edit', 'check', 'publish', 'done']) {
    const html = renderGuidedWorkbench(state({ step }), nonce, brand);
    assert(html.includes(`src="${logo}"`));
    assert.match(html, /width="64" height="64" alt="DAF-TECH"/);
    assert.match(html, /class="brand-product">Brand Product<\/strong>/);
    assert.match(html, /Agent Skills Studio/);
    assert.match(html, /Build it\. Version it\. Ship it\./);
    assert.match(html, /img-src data:/);
    assert.equal((html.match(/id="primary-action"/g) || []).length, step === 'start' ? 0 : 1);
  }
  const launcher = renderGuidedLauncher(nonce, brand);
  assert(launcher.includes(`src="${logo}"`));
  assert.match(launcher, /<h1 class="brand-product">Brand Product<\/h1>/);
  assert.equal((launcher.match(/<button\b/g) || []).length, 1);
});

test('branding rejects external or non-PNG image sources and escapes configurable product text', () => {
  for (const logoDataUri of ['https://example.invalid/logo.png', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,AAAA" onerror="injected()']) {
    const html = renderGuidedWorkbench(state(), nonce, { productName: 'Product </strong><script>injected()</script>', logoDataUri });
    assert.doesNotMatch(html, /<img\b/);
    assert.match(html, /Product &lt;\/strong&gt;&lt;script&gt;injected\(\)&lt;\/script&gt;/);
    assert.equal((html.match(/<script\b/g) || []).length, 1);
  }
  const fallback = renderGuidedWorkbench(state(), nonce);
  assert.match(fallback, /DAF-TECH/);
  assert.match(fallback, /class="brand-product">SkillJetty/);
});

test('teal primary action maintains readable white-text contrast in normal and hover states', () => {
  const html = renderGuidedWorkbench(state(), nonce);
  const primary = /\.primary \{ background: (#[a-f0-9]{6}); color: (#[a-f0-9]{6})/i.exec(html);
  const hover = /\.primary:hover \{ background: (#[a-f0-9]{6})/i.exec(html);
  assert(primary); assert(hover);
  const luminance = hex => {
    const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const contrast = (left, right) => (Math.max(luminance(left), luminance(right)) + 0.05) / (Math.min(luminance(left), luminance(right)) + 0.05);
  assert(contrast(primary[1], primary[2]) >= 4.5);
  assert(contrast(hover[1], primary[2]) >= 4.5);
  assert.match(html, /forced-colors: active/);
  assert.match(html, /background: Highlight; color: HighlightText/);
});
