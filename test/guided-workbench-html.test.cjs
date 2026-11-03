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

test('older versions remain an explicit reviewed recovery action', () => {
const initial = renderGuidedWorkbench(state(), nonce);
  assert.match(initial, /data-action="previewArchive"[^>]*>Review older saved releases/);
  assert.doesNotMatch(initial, /data-action="archiveReleases"/);
  const html = renderGuidedWorkbench(state({ archivePreview: { entries: [
    { label: 'example <bundle> 1.0.0', directory: 'P:/Workbench/releases/<old>', bytes: 1024, fileCount: 3 }
  ], skipped: ['Latest <bundle> 2.0.0 kept'] }, archives: [{ id: 'safe-id"', label: 'Earlier <release>' }] }), nonce);
  assert.match(html, /<section id="archive-management"/);
  assert.match(html, /data-action="archiveReleases" data-confirmed="true"/);
  assert.match(html, /1,024 bytes · 3 files/);
  assert.match(html, /P:\/Workbench\/releases\/&lt;old&gt;/);
  assert.match(html, /Latest &lt;bundle&gt; 2.0.0 kept/);
  assert.match(html, /data-action="restoreArchive" data-id="safe-id&quot;"/);
  assert.match(html, /does not permanently delete them/);
  assert.match(html, /without replacing newer work/);
  assert.doesNotMatch(html, /data-action="archiveReleases"[^>]*data-directory|<bundle>|<old>|<details/);
});

test('Build Share exposes package formats without requiring plugin metadata for a skill', () => {
const html = renderGuidedWorkbench(state({ step: 'publish', active: { id: 'a', name: 'skill-a' }, publish: { version: '1.0.0', changelog: '', fileCount: 2 } }), nonce);
  assert.match(html, /<label for="exportMode">Package type<\/label>/);
  assert.match(html, /value="portable" selected>Skill package \(\.skill\)/);
  assert.match(html, /value="plugin" >Claude plugin ZIP/);
  assert.match(html, /value="both" >Both skill package and plugin ZIP/);
  assert.match(html, /id="plugin-options" hidden/);
  assert.match(html, /id="pluginName"[^>]*data-plugin-required[^>]*disabled/);
  assert.doesNotMatch(html, /id="pluginName"[^>]*\srequired(?:\s|>)/);
  assert.match(html, /id="geminiZip"[^>]*aria-describedby="gemini-export-help"/);
  assert.match(html, /Import and runtime behavior still need testing in your account/);
  assert.match(html, /Saving a ZIP does not install it in Claude or prove application compatibility/);
  assert.doesNotMatch(html, /<details/);
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
  assert.match(html, /id="pluginVersion"[^>]*value="1\.2\.0"[^>]*data-export-option/);
  assert.match(html, /A version is filled in for you/);
  assert.match(html, /id="pluginName"[^>]*data-export-option/);
  assert.doesNotMatch(html, /id="pluginAuthor"[^>]*data-export-option/);
  assert.doesNotMatch(html, /<img src=x|<script>bad/);
  assert.match(html, /&lt;\/script&gt;&lt;img/);
});

test('optional publisher editing cannot implicitly submit an upload with Enter', () => {
  const html = renderGuidedWorkbench(state({ step: 'publish', workflowIntent: 'plugin',
    publish: { version: '1.0.0', changelog: '', fileCount: 1 } }), nonce);
  const source = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1];
  const start = source.indexOf("document.querySelectorAll('dialog')");
  const end = source.indexOf('function exportPayload()', start);
  let keydown, closed = 0, prevented = 0;
  const dialog = { addEventListener: (event, listener) => { assert.equal(event, 'keydown'); keydown = listener; }, close: () => { ++closed; } };
  new vm.Script(source.slice(start, end)).runInNewContext({ document: { querySelectorAll: () => [dialog] } });
  keydown({ key: 'Enter', isComposing: true, target: { tagName: 'INPUT' }, preventDefault: () => { ++prevented; } });
  assert.equal(closed, 0);
  keydown({ key: 'Enter', isComposing: false, target: { tagName: 'INPUT' }, preventDefault: () => { ++prevented; } });
  assert.equal(prevented, 1);
  assert.equal(closed, 1);
});

test('Build Share makes connected build and upload primary for every selected package type', () => {
for (const [mode, noun] of [['portable', 'skill'], ['plugin', 'plugin'], ['both', 'packages']]) {
    const html = renderGuidedWorkbench(state({ workflowIntent: 'plugin', step: 'publish', active: { id: 'a', name: 'skill-a' },
      publish: { version: '1.0.0', changelog: '', fileCount: 2 },
      exportOptions: { mode, pluginName: 'team-tools', pluginDescription: 'Team tools', pluginVersion: '1.0.0', members: [] } }), nonce);
    assert.match(html, /<h1 id="stepHeading" tabindex="-1">Build \/ Share<\/h1>/);
    assert(html.includes(`>Build &amp; upload ${noun} <span aria-hidden="true">`));
    assert.match(html, /id="publish-form"[^>]*data-form-action="publish"/);
    assert.match(html, /data-submit-action="savePackage">Save locally instead/);
    assert.match(html, /https:\/\/github.com\/example\/Skills.git/);
    assert.match(html, /Nothing is merged automatically/);
    assert.doesNotMatch(html, /<details|aria-current="step"|Step 4/);
    assert(html.indexOf('id="primary-action"') < html.indexOf('id="publish-form"'), 'action is visible before form content');
    if (mode !== 'portable') {
      const modal = /<dialog id="publisher-dialog"[\s\S]*?<\/dialog>/.exec(html)[0];
      assert.doesNotMatch(modal, /data-plugin-required|name="pluginMembers"/);
      assert.match(html, /id="pluginVersion"[^>]*data-plugin-required required/);
    }
  }
});

test('plugin starts with existing skills and a visible project source rather than a dummy draft', () => {
const connected = { workflowIntent: 'plugin', connection: { repository: 'https://github.com/example/Skills', localPath: 'P:/Projects/Skills', baseBranch: 'main' }, drafts: [{ id: 'a', name: 'existing-skill' }], skillsLoaded: true };
  const html = renderGuidedWorkbench(state(connected), nonce);
  assert.match(html, /data-action="openRepositorySkill" id="open-repository-skill">Open from your project/);
  assert.match(html, /data-action="resume" data-id="a">Use existing-skill/);
  assert.match(html, /data-action="openPackage"[^>]*>Open a skill file/);
  assert.match(html, /Your originals stay unchanged/);
  const rejected = renderGuidedWorkbench(state({ ...connected, configurationError: 'The inherited destination is outside this work location.' }), nonce);
  assert.doesNotMatch(rejected, /data-action="openRepositorySkill"/);
  assert.match(rejected, /data-action="openPackage"[^>]*>Open a skill file/);
});

test('package checks and actual build errors stay visible without disclosure controls', () => {
const html = renderGuidedWorkbench(state({ workflowIntent: 'plugin', step: 'publish', error: 'Package generation failed. Your draft is preserved.',
    publish: { version: '1.0.0', changelog: '', fileCount: 2, compatibility: [
      { target: 'Claude public directory', issues: ['Missing directory icon.'], tested: false }, { target: 'Gemini App', issues: ['Unsupported file type.'], tested: false }
    ] }, exportOptions: { mode: 'plugin', pluginName: 'team-tools', pluginDescription: 'Tools', pluginVersion: '1.0.0', members: [] } }), nonce);
  assert.match(html, /<h3>Claude public directory<\/h3>/);
  assert.match(html, /<h3>Gemini App<\/h3>/);
  assert.match(html, /They do not block a private local ZIP/);
  assert.match(html, /Application import and runtime behavior have not been tested/);
  assert(html.indexOf('Package generation failed.') < html.indexOf('id="export-compatibility-details"'));
  assert.doesNotMatch(html, /<details/);
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
  const document = { getElementById: id => elements[id], querySelectorAll: selector => selector === 'input[name="pluginMembers"]:checked' ? [{ value: 'current' }, { value: 'other' }] : [] };
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

test('every area shows the exact project and destination with an always available settings action', () => {
for (const step of ['start', 'edit', 'check', 'publish', 'done']) {
    const html = renderGuidedWorkbench(state({ step, busy: true, workFolder: 'P:/Actual <work>/folder', configuredRepository: 'https://github.com/desired/Skills', configuredLocalRepository: 'P:/Desired <repo>', check: { valid: true, errors: [], warnings: [], compatibility: '', behaviorNote: '' }, publish: { version: '1.0.0', changelog: '', fileCount: 1 } }), nonce);
    assert.equal((html.match(/id="open-settings"/g) || []).length, 1);
    assert.match(html, /id="open-settings"[^>]*data-action="openSettings"[^>]*aria-label="Open SkillJetty settings"/);
    assert.doesNotMatch(html, /<button[^>]*id="open-settings"[^>]*\bdisabled/);
    assert.match(html, /id="configured-repository">https:\/\/github.com\/desired\/Skills<\/strong>/);
    assert.match(html, /id="local-repository-path">P:\/Desired &lt;repo&gt;<\/small>/);
    assert(html.indexOf('id="workbench-configuration"') < html.indexOf('<main'));
  }
});

test('blank settings do not pretend a saved repository is selected', () => {
const html = renderGuidedWorkbench(state({ configuredRepository: '', configuredLocalRepository: '', hasWorkspace: false }), nonce);
  assert.match(html, /id="configured-repository">Not connected<\/strong>/);
  assert.match(html, /Choose a location to begin/);
  assert.match(html, /data-action="createWorkbench"[^>]*>Choose a location/);
  assert.match(html, /id="open-settings"/);
  assert.doesNotMatch(html, /data-action="chooseWorkspace"/);
});

test('first use asks for one home without teaching internal folder architecture', () => {
const html = renderGuidedWorkbench(state({ hasWorkspace: false, connection: undefined }), nonce);
  assert.match(html, /One home for your work/);
  assert.match(html, /exact save location before anything is created/);
  assert.match(html, /Your existing files stay where they are/);
  assert.match(html, /data-action="createWorkbench"[^>]*>Choose a location/);
  assert.doesNotMatch(html, /<code>skills\/|<code>repositories\/|<code>scratch\/|Give SkillJetty a workbench|<details/);
});

test('project identity uses the repository root while preserving the exact storage location', () => {
const html = renderGuidedWorkbench(state({ workspaceMode: 'existing-repository', repositoryRoot: 'P:/Projects/Skills', workFolder: 'P:/Projects/Skills/.skilljetty-prerelease', configuredLocalRepository: 'P:/Projects/Skills', configuredRepository: 'https://github.com/example/Skills' }), nonce);
  assert.match(html, /Working in<\/span><strong>Skills<\/strong>/);
  assert.match(html, /id="local-repository-path">P:\/Projects\/Skills<\/small>/);
  assert.doesNotMatch(html, /Saved in|P:\/Projects\/Skills\/.skilljetty-prerelease/);
  assert.match(html, /id="configured-target-branch">main<\/span>/);
  assert.doesNotMatch(html, /What goes in each|Create another workbench|<details/);
});

test('managed project identity shows its chosen project once and keeps internal directories out of the task', () => {
  const html = renderGuidedWorkbench(state({ workspaceMode: 'managed', workFolder: 'P:\\Projects\\Alpha10\\.skilljetty-prerelease', connection: undefined }), nonce);
  assert.match(html, /Working in<\/span><strong>Alpha10<\/strong>/);
  assert.match(html, /id="local-repository-path">P:\\Projects\\Alpha10<\/small>/);
  assert.doesNotMatch(html, /\.skilljetty-prerelease|Saved in/);
});

test('built plugins are editable project objects with a direct action', () => {
  const html = renderGuidedWorkbench(state({ skillsLoaded: true, releasesLoaded: true, library: [{ kind: 'plugin', skillName: 'team-tools', version: '1.0.0', directory: 'P:/builds/<plugin>', status: 'prepared' }] }), nonce);
  assert.match(html, /data-action="openPlugin" data-directory="P:\/builds\/&lt;plugin&gt;">Edit plugin team-tools/);
  assert.doesNotMatch(html, /choose its skills above|data-action="openPlugin"[^>]*<plugin>/);
});

test('existing projects open their catalogue without another location setup choice', () => {
const html = renderGuidedWorkbench(state({ workspaceMode: 'existing-repository', workFolder: 'P:/Projects/Skills/.skilljetty-prerelease', configuredLocalRepository: 'P:/Projects/Skills', skillsLoaded: true, releasesLoaded: true, drafts: [{ id: 'saved-draft', name: 'saved-draft' }], connection: { repository: 'https://github.com/example/Skills', localPath: 'P:/Projects/Skills', baseBranch: 'main' } }), nonce);
  assert.match(html, /data-action="showCreate"[^>]*>New skill/);
  assert.match(html, /data-action="showPlugin"[^>]*>New plugin/);
  assert.match(html, /Edit saved-draft/);
  assert.match(html, /Open from your project/);
  assert.doesNotMatch(html, /data-action="createWorkbench"|data-action="openWorkbenchFolder"|workbench-setup|<details/);
});

test('invalid settings do not disclose rejected credentials or claim the new configuration is verified', () => {
  const secret = 'never-display-this-password';
  const html = renderGuidedWorkbench(state({ configuredRepository: `https://account:${secret}@github.com/new/Skills`,
    configuredLocalRepository: 'P:/Rejected <folder>', configurationError: `Invalid URL ${secret}`,
    repositoryVerification: { status: 'verified', message: 'Saved connection verified' } }), nonce);
  assert.doesNotMatch(html, new RegExp(secret));
  assert.doesNotMatch(html, /Rejected &lt;folder&gt;|Saved connection verified/);
  assert.match(html, /id="repository-settings-state">Upload needs attention<\/span>/);
  assert.match(html, /id="configured-repository">https:\/\/github.com\/example\/Skills.git<\/strong>/);
});

test('invalid native settings keep local packaging available without enabling upload through a saved connection', () => {
  const html = renderGuidedWorkbench(state({ step: 'publish', configurationError: 'Invalid native setting',
    publish: { version: '1.0.0', changelog: '', fileCount: 1, reviewSupported: true } }), nonce);
  assert.match(html, /id="publish-form"[^>]*data-form-action="savePackage"/);
  assert.match(html, /id="primary-action"[^>]*>Build skill package/);
  assert.doesNotMatch(html, /data-form-action="publish"|>Upload &amp; create PR|>Upload version|Submitting to/);
});

test('home shows available skills immediately and reads saved versions without a Load step', () => {
const html = renderGuidedWorkbench(state({ skillsLoaded: true, drafts: [{ id: 'a', name: 'existing-work' }], library: [{ skillName: 'saved-work', version: '1.0.0', directory: 'local', status: 'archived' }], releasesLoaded: true }), nonce);
  assert.match(html, /Edit existing-work/);
  assert.match(html, /Edit saved-work 1.0.0/);
  assert.doesNotMatch(html, />Load skills|>Unload skills|load only when you ask/);
  const loading = renderGuidedWorkbench(state({ skillsLoaded: true, releasesLoaded: false }), nonce);
  assert.match(loading, /Reading saved versions/);
  const stale = renderGuidedWorkbench(state({ skillsLoaded: true, skillsStale: true }), nonce);
  assert.match(stale, /Refresh to include changes made in another window/);
});

test('a visible path form provides an alternative to the native file chooser', () => {
const html = renderGuidedWorkbench(state({ form: { path: 'C:\\Downloads\\sample.skill' } }), nonce);
  assert.match(html, /data-form-action="openPackagePath"/);
  assert.match(html, /<label for="packagePath">Or paste a skill file path<\/label>/);
  assert.match(html, /id="packagePath"[^>]*value="C:\\Downloads\\sample.skill"[^>]*required/);
  assert.doesNotMatch(html, /<details/);
  assert.match(html, /if \(action === 'openPackagePath'\) payload = \{ path: fieldValue\('packagePath'\) \}/);
});

test('project areas replace the numbered wizard and every active task has one visible main action', () => {
for (const step of ['start', 'edit', 'check', 'publish', 'done']) {
    const html = renderGuidedWorkbench(state({ step, active: { id: 'sample', name: 'sample' }, check: { valid: true, errors: [], warnings: [], compatibility: 'Portable', behaviorNote: '' }, publish: { version: '1.0.0', changelog: '', fileCount: 1 } }), nonce);
    assert.equal((html.match(/id="primary-action"/g) || []).length, step === 'start' ? 0 : 1, step);
    assert.equal((html.match(/<button[^>]*aria-current="page"/g) || []).length, 1, step);
    assert.match(html, /<nav class="project-nav" aria-label="Project">/);
    assert.doesNotMatch(html, /aria-current="step"|Step 1:|Step 5:|<details/);
    const scripts = [...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    assert.doesNotThrow(() => new vm.Script(scripts[0][1]));
    if (step === 'edit') assert.match(html, /id="primary-action"[^>]*data-action="preparePublish"[^>]*>Build \/ Share/);
  }
});

test('start keeps local skill choices while repository setup lives in native settings', () => {
  const repository = renderGuidedWorkbench(state({ connection: undefined, repositories: [{ label: 'My Skills', repository: 'https://github.com/example/Skills.git' }] }), nonce);
  assert.match(repository, /id="open-settings"[^>]*data-action="openSettings"/);
  assert.doesNotMatch(repository, /id="repository-choice"|id="repository-form"|id="repository" name="repository"|data-form-action="connectRepository"|id="create-repository-form"/);
  for (const action of ['showCreate', 'openPackage', 'openFolder']) assert.match(repository, new RegExp(`data-action="${action}"`));
  assert.match(repository, /Create something new, continue your work/);
  assert.match(repository, /data-action="showPlugin"[^>]*>New plugin/);
  assert.doesNotMatch(repository, /id="primary-action"/);
  const creation = renderGuidedWorkbench(state({ form: { mode: 'create', name: 'weekly-status', description: 'Summarize project updates.', instructions: 'Keep unknowns explicit.' } }), nonce);
  assert.match(creation, /id="skillName"[^>]*value="weekly-status"/);
  assert.match(creation, />Summarize project updates\.<\/textarea>/);
  assert.match(creation, />Keep unknowns explicit\.<\/textarea>/);
  assert.match(creation, /form="create-form"[^>]*>Create and edit/);
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
  assert.match(check, /Return to editor/);
  assert.match(check, /does not run an assistant or scan for security threats/);
  const publish = renderGuidedWorkbench(state({ step: 'publish', publish: { version: '2.0.1', changelog: 'Improved input handling.', repository: 'https://github.com/example/Skills.git', fileCount: 4 } }), nonce);
  assert.match(publish, /id="releaseVersion"[^>]*value=""/);
  assert.match(publish, /2.0.1/);
  assert.match(publish, /Improved input handling\.<\/textarea>/);
  assert.match(publish, /Original files and earlier versions are preserved/);
  assert.match(publish, /Skill package \(\.skill\)/);
  assert.match(publish, /Release notes/);
  assert.match(publish, /id="open-settings"[^>]*aria-label="Open SkillJetty settings"/);
  assert.doesNotMatch(publish, /Change or reconnect the repository|id="repository-form"/);
  assert.match(publish, /form="publish-form"[^>]*>Build &amp; upload skill/);
  assert.doesNotMatch(publish, /aria-current="step"/);
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
  assert.match(connect, /id="open-settings"[^>]*aria-label="Open SkillJetty settings"/);
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
  assert.match(html, /form="publish-form"[^>]*>Build &amp; upload skill/);
  assert.match(html, /This repository has no automatic pull request support/);
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
  assert.match(html, /Open SkillJetty/);
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
