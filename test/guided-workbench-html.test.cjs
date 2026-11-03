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

test('Submit keeps portable default and exposes explicit plugin and Gemini export choices', () => {
  const html = renderGuidedWorkbench(state({ step: 'publish', active: { id: 'a', name: 'skill-a' },
    publish: { version: '1.0.0', changelog: '', fileCount: 2 } }), nonce);
  assert.match(html, /<legend>Choose your export<\/legend>/);
  assert.match(html, /<label for="exportMode">Package format<\/label>/);
  assert.match(html, /value="portable" selected>Portable skill only/);
  assert.match(html, /value="plugin" >Claude plugin only/);
  assert.match(html, /value="both" >Both portable skill and Claude plugin/);
  assert.match(html, /id="plugin-options" hidden/);
  assert.match(html, /id="pluginName"[^>]*data-plugin-required[^>]*disabled/);
  assert.doesNotMatch(html, /id="pluginName"[^>]*\srequired(?:\s|>)/);
  assert.match(html, /id="geminiZip"[^>]*aria-describedby="gemini-export-help"/);
  assert.match(html, /Import and runtime behavior must be tested in your account/);
  assert.match(html, /Claude organization installation, marketplace sync and group assignment are separate manual steps/);
});

test('plugin metadata and multiple members are labelled, selected explicitly and escaped', () => {
  const hostile = '</script><img src=x onerror="bad()">';
  const html = renderGuidedWorkbench(state({ step: 'publish', active: { id: 'a', name: 'skill-a' },
    publish: { version: '2.0.0', changelog: '', fileCount: 3 },
    exportOptions: { mode: 'both', pluginName: hostile, pluginDescription: hostile, pluginVersion: '1.2.0',
      pluginAuthor: hostile, pluginLicense: hostile, geminiZip: true,
      members: [{ id: 'a', name: 'skill-a', version: '2.0.0', selected: true },
        { id: 'b"', name: hostile, version: '3.1.0', selected: true },
        { id: 'c', name: 'skill-c', selected: false }] }
  }), nonce);
  assert.doesNotMatch(html, /id="plugin-options" hidden/);
  assert.match(html, /id="pluginName"[^>]*data-plugin-required required/);
  assert.match(html, /name="pluginMembers" value="a"[^>]*checked[^>]*data-current-member disabled/);
  assert.match(html, /name="pluginMembers" value="b&quot;"[^>]*checked/);
  assert.match(html, /id="geminiZip"[^>]*checked/);
  assert.match(html, /Installable .skill package and Claude plugin ZIP/);
  assert.match(html, /The bundle has its own version/);
  assert.doesNotMatch(html, /<img src=x|<script>bad/);
  assert.match(html, /&lt;\/script&gt;&lt;img/);
});

test('client serializes selected members and active format and disables hidden plugin requirements', () => {
  const html = renderGuidedWorkbench(state(), nonce);
  const script = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1];
  const functions = script.slice(script.indexOf('function fieldValue('), script.indexOf('  updateExportVisibility();'));
  const controls = [{ required: true, disabled: false, hasAttribute: () => true }];
  const elements = {
    exportMode: { value: 'portable' }, pluginName: { value: 'team-tools' }, pluginVersion: { value: '4.0.0' },
    pluginDescription: { value: 'Team workflows' }, pluginAuthor: { value: 'DAF-TECH' }, pluginLicense: { value: '' },
    geminiZip: { checked: true }, 'export-package-summary': { textContent: '' },
    'plugin-options': { hidden: false, querySelectorAll: () => controls }
  };
  const document = { getElementById: id => elements[id], querySelectorAll: () => [{ value: 'current' }, { value: 'other' }] };
  const result = new vm.Script(functions + ';updateExportVisibility();({payload:exportPayload(),hidden:document.getElementById("plugin-options").hidden});').runInNewContext({ document });
  assert.equal(result.payload.exportMode, 'portable');
  assert.deepEqual(Array.from(result.payload.pluginMembers), ['current', 'other']);
  assert.equal(result.payload.geminiZip, true);
  assert.equal(result.hidden, true);
  assert.equal(controls[0].required, false);
  assert.equal(controls[0].disabled, true);
  elements.exportMode.value = 'both';
  controls[0].hasAttribute = name => name === 'data-plugin-required';
  new vm.Script(functions + ';updateExportVisibility();').runInNewContext({ document });
  assert.equal(controls[0].required, true);
  assert.equal(controls[0].disabled, false);
  assert.equal(elements['plugin-options'].hidden, false);
  assert.match(elements['export-package-summary'].textContent, /Claude plugin ZIP/);
});

test('Done keeps separate artifact outcomes and compatibility limits without unsafe links', () => {
  const html = renderGuidedWorkbench(state({ step: 'done', receipt: { name: 'team-tools', version: '1.0.0',
    local: true, note: 'Prepared exports.', artifacts: [
      { kind: 'portable', label: 'Portable skill', path: 'P:/Workbench/skill.skill', status: 'prepared' },
      { kind: 'plugin', label: 'Claude plugin', path: 'P:/Workbench/plugin.zip', status: 'failed', error: '<unsafe>', url: 'javascript:unsafe()', reviewUrl: 'https://github.com/example/skills/pull/42' }
    ], compatibility: [{ target: 'Gemini App', issues: ['Unsupported <file>.ts'], tested: false }] }
  }), nonce);
  assert.match(html, /<h2 id="export-results-heading">Export results<\/h2>/);
  assert.match(html, /Portable skill<\/strong> — prepared/);
  assert.match(html, /Claude plugin<\/strong> — failed/);
  assert.match(html, /data-path="P:\/Workbench\/plugin.zip"/);
  assert.match(html, /Unsupported &lt;file&gt;.ts/);
  assert.match(html, /Review Claude plugin PR/);
  assert.match(html, /data-url="https:\/\/github.com\/example\/skills\/pull\/42"/);
  assert.match(html, /Application import and runtime behavior have not been tested by SkillJetty/);
  assert.doesNotMatch(html, /href="javascript:|data-url="javascript:|<unsafe>/);
});

test('performance log is in Activity from the first screen through busy later steps', () => {
  for (const step of ['start', 'edit', 'check', 'publish', 'done']) {
    for (const hasWorkspace of [false, true]) {
      const html = renderGuidedWorkbench(state({ step, hasWorkspace, busy: true,
        check: { valid: true, errors: [], warnings: [], compatibility: '', behaviorNote: '' },
        publish: { version: '1.0.0', changelog: '', fileCount: 1 } }), nonce);
      const activityStart = html.indexOf('id="operation-status"');
      const logButton = html.indexOf('id="open-performance-log"');
      assert(logButton > activityStart && logButton < html.indexOf('<main id="main-content"'), step);
      assert.equal((html.match(/id="open-performance-log"/g) || []).length, 1);
      assert.match(html, /data-action="openPerformanceLog" id="open-performance-log" data-diagnostics="true"/);
      assert.doesNotMatch(html, /<button[^>]*id="open-performance-log"[^>]*\bdisabled/);
    }
  }
});

test('read-only configuration and its labelled settings gear remain available on every screen', () => {
  for (const step of ['start', 'edit', 'check', 'publish', 'done']) {
    for (const hasWorkspace of [false, true]) {
      const html = renderGuidedWorkbench(state({ step, hasWorkspace, busy: true,
        workFolder: 'P:/Actual <work>/folder', configuredRepository: 'https://github.com/desired/Skills',
        configuredLocalRepository: 'P:/Desired <repo>',
        check: { valid: true, errors: [], warnings: [], compatibility: '', behaviorNote: '' },
        publish: { version: '1.0.0', changelog: '', fileCount: 1 } }), nonce);
      assert.equal((html.match(/id="open-settings"/g) || []).length, 1);
      assert.match(html, /id="open-settings"[^>]*data-action="openSettings"[^>]*aria-label="Open SkillJetty settings"/);
      assert.doesNotMatch(html, /<button[^>]*id="open-settings"[^>]*\bdisabled/);
      assert.match(html, /id="active-work-folder">P:\/Actual &lt;work&gt;\/folder<\/dd>/);
      assert.match(html, /id="configured-repository">https:\/\/github.com\/desired\/Skills<\/dd>/);
      assert.match(html, /id="local-repository-path">P:\/Desired &lt;repo&gt;<\/dd>/);
      assert.doesNotMatch(html, /id="repository-form"|id="create-repository-form"|id="repository-settings"|data-action="connectGitHub"|data-action="pullRepository"|data-action="verifyRepository"|data-action="setRepositoryFolder"/);
    }
  }
});

test('empty settings do not resurrect saved repository values and unconfigured users have a settings route', () => {
  const html = renderGuidedWorkbench(state({ configuredRepository: '', configuredLocalRepository: '', hasWorkspace: false }), nonce);
  assert.match(html, /id="configured-repository">Not configured<\/dd>/);
  assert.match(html, /id="local-repository-path">Not configured<\/dd>/);
  assert.match(html, /id="active-work-folder">Not selected<\/dd>/);
  assert.match(html, /data-action="createWorkbench"[^>]*>Create workbench/);
  assert.match(html, /data-action="openWorkbenchFolder"[^>]*>Open existing workbench/);
  assert.match(html, /id="open-settings"/);
  assert.doesNotMatch(html, /data-action="chooseWorkspace"/);
});

test('workbench setup explains local folders and has explicit, cancellable setup actions', () => {
  const html = renderGuidedWorkbench(state({ hasWorkspace: false, connection: undefined }), nonce);
  assert.match(html, /Setup creates local folders only/);
  assert.match(html, /does not move existing work, clone a repository or upload anything/);
  assert.match(html, /review the exact destination before creating/);
  assert.match(html, /old work folder is not moved or adopted automatically/);
  assert.doesNotMatch(html, /data-action="showCreate"|data-action="openPackage"|data-action="loadSkills"/);
  for (const folder of ['skills/', 'repositories/', 'releases/', 'scratch/', 'recovery/', 'logs/', '.skill-workbench/']) {
    assert(html.includes(`<code>${folder}</code>`), folder);
  }
});

test('folder guide distinguishes drafts, local repositories, remote destination and target branch', () => {
  const html = renderGuidedWorkbench(state({ workFolder: 'P:/Workbench/.skilljetty-prerelease',
    configuredLocalRepository: 'P:/Workbench/.skilljetty-prerelease/repositories/skills' }), nonce);
  assert.match(html, /<summary>What goes in each workbench folder\?<\/summary>/);
  assert.match(html, /Local repository — inside repositories\//);
  assert.match(html, /Remote repository — sharing destination/);
  assert.match(html, /<dt>Target branch<\/dt><dd id="configured-target-branch">main<\/dd>/);
  assert.match(html, /Opening a different project in VS Code does not choose a new destination/);
  assert.match(html, /changing settings does not clone, pull or upload/);
  assert.match(html, /<dl class="action-help"><dt><code>skills\//);
  assert.match(html, /README.md/);
  assert.match(html, /SkillJetty blocks destinations outside this workbench/);
  assert.match(html, /including AI-tool install folders outside it/);
  assert.match(html, /This preview connects to GitHub using an HTTPS address/);
  assert.match(html, /SSH addresses, local paths and file URLs are unavailable as remote destinations/);
  assert.match(html, /Earlier edits and completed draft archives/);
});

test('invalid settings do not disclose rejected credentials or claim the new configuration is verified', () => {
  const secret = 'never-display-this-password';
  const html = renderGuidedWorkbench(state({ configuredRepository: `https://account:${secret}@github.com/new/Skills`,
    configuredLocalRepository: 'P:/Rejected <folder>', configurationError: `Invalid URL ${secret}`,
    repositoryVerification: { status: 'verified', message: 'Saved connection verified' } }), nonce);
  assert.doesNotMatch(html, new RegExp(secret));
  assert.doesNotMatch(html, /Rejected &lt;folder&gt;|Saved connection verified/);
  assert.match(html, /id="repository-settings-state">Needs attention<\/dd>/);
  assert.match(html, /id="configured-repository">https:\/\/github.com\/example\/Skills.git<\/dd>/);
});

test('invalid native settings keep local packaging available without enabling upload through a saved connection', () => {
  const html = renderGuidedWorkbench(state({ step: 'publish', configurationError: 'Invalid native setting',
    publish: { version: '1.0.0', changelog: '', fileCount: 1, reviewSupported: true } }), nonce);
  assert.match(html, /id="publish-form"[^>]*data-form-action="savePackage"/);
  assert.match(html, /id="primary-action"[^>]*>Save package on this computer/);
  assert.doesNotMatch(html, /data-form-action="publish"|>Upload &amp; create PR|>Upload version|Submitting to/);
});

test('saved skills are opt-in and unloaded content is not rendered', () => {
  const saved = { drafts: [{ id: 'private-draft', name: 'private-draft' }], library: [{ skillName: 'private-release', version: '1.0.0', directory: 'local', status: 'archived' }] };
  const unloaded = renderGuidedWorkbench(state(saved), nonce);
  assert.match(unloaded, /data-action="loadSkills"[^>]*>Load skills/);
  assert.match(unloaded, /saved skills load only when you ask/);
  assert.doesNotMatch(unloaded, /Resume private-draft|Improve private-release/);
  assert.doesNotMatch(unloaded, /data-action="unloadSkills"/);
  const loaded = renderGuidedWorkbench(state({ ...saved, skillsLoaded: true }), nonce);
  assert.match(loaded, /Resume private-draft/);
  assert.match(loaded, /Improve private-release/);
  assert.match(loaded, /data-action="unloadSkills"[^>]*>Unload skills/);
  assert.match(loaded, /Your files stay saved/);
  const empty = renderGuidedWorkbench(state({ skillsLoaded: true }), nonce);
  assert.match(empty, /No saved skills were found/);
  const stale = renderGuidedWorkbench(state({ ...saved, skillsLoaded: true, skillsStale: true }), nonce);
  assert.match(stale, /saved list may be out of date/);
  assert.match(stale, /Choose Reload skills to include your latest changes/);
});

test('a keyboard-accessible optional path form bypasses the native file chooser', () => {
  const html = renderGuidedWorkbench(state({ form: { path: 'C:\\Downloads\\sample.skill' } }), nonce);
  assert.match(html, /<summary>Open by file path<\/summary>/);
  assert.match(html, /data-form-action="openPackagePath"/);
  assert.match(html, /<label for="packagePath">Full package path \(required\)<\/label>/);
  assert.match(html, /id="packagePath"[^>]*value="C:\\Downloads\\sample.skill"[^>]*required/);
  assert.match(html, /if \(action === 'openPackagePath'\) payload = \{ path: fieldValue\('packagePath'\) \}/);
});

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

test('start keeps local skill choices while repository setup lives in native settings', () => {
  const repository = renderGuidedWorkbench(state({ connection: undefined, repositories: [{ label: 'My Skills', repository: 'https://github.com/example/Skills.git' }] }), nonce);
  assert.match(repository, /id="open-settings"[^>]*data-action="openSettings"/);
  assert.doesNotMatch(repository, /id="repository-choice"|id="repository-form"|id="repository" name="repository"|data-form-action="connectRepository"|id="create-repository-form"/);
  for (const action of ['showCreate', 'openPackage', 'openFolder']) assert.match(repository, new RegExp(`data-action="${action}"`));
  assert.match(repository, /No repository connection is needed to create, open, or edit a skill/);
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

test('legacy repository form state returns to local Start choices and native settings', () => {
  const html = renderGuidedWorkbench(state({ form: { mode: 'repository' }, repositories: [{ label: 'My Skills', repository: 'https://github.com/example/Skills.git' }] }), nonce);
  assert.match(html, /data-action="showCreate"/);
  assert.match(html, /data-action="openSettings"/);
  assert.doesNotMatch(html, /id="repository-form"|id="repository-choice"|form="repository-form"/);
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
    const document = { getElementById: id => id === 'main-content' ? { dataset: {} } : id === 'editorContent' ? editor : id === 'bufferContent' ? hidden : null };
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
  assert.match(publish, /id="releaseVersion"[^>]*value=""/);
  assert.match(publish, /2.0.1/);
  assert.match(publish, /Improved input handling\.<\/textarea>/);
  assert.match(publish, /Editable source/);
  assert.match(publish, /Installable .skill package/);
  assert.match(publish, /CHANGELOG.md/);
  assert.match(publish, /id="open-settings"[^>]*aria-label="Open SkillJetty settings"/);
  assert.doesNotMatch(publish, /Change or reconnect the repository|id="repository-form"/);
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
  assert.match(html, /const reviewer = action === 'publish' \? fieldValue\('reviewer'\) : ''/);
  assert.match(html, /reviewer, confirmed: !!reviewer/);
});

test('GitHub account is read-only and reviewer state remains scoped to the host account', () => {
  const connect = renderGuidedWorkbench(state(), nonce);
  assert.match(connect, /GitHub sign-in is also available in the Command Palette/);
  assert.doesNotMatch(connect, /data-action="connectGitHub"/);
  assert.doesNotMatch(connect, /type="password"|name="token"|name="pat"/);
  const switched = renderGuidedWorkbench(state({ githubAccount: 'Account <unsafe>' }), nonce);
  assert.match(switched, /Account &lt;unsafe&gt;/);
  assert.doesNotMatch(switched, /data-action="connectGitHub"/);
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
    assert.match(html, /Build it\. Improve it\. Share it\./);
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
  const hover = /\.primary:hover:not\(:disabled\) \{ background: (#[a-f0-9]{6})/i.exec(html);
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
