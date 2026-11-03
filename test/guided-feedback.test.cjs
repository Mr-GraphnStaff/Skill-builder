const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { renderGuidedWorkbench } = require('../out/guided-workbench-html.js');

function harness(overrides = {}) {
  const state = { step: 'edit', active: { id: 'sample', name: 'sample' }, hasWorkspace: true,
    repositories: [], drafts: [], library: [], files: [], target: 'portable', editor: { path: 'SKILL.md', content: 'Keep these instructions.' }, ...overrides };
  const html = renderGuidedWorkbench(state, 'feedbackTestNonce');
  const source = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1];
  const elements = new Map();
  const lifecycle = { focusCalls: 0, stateWrites: 0 };
  function element(id, extra = {}) {
    const value = { id, dataset: {}, hidden: false, textContent: '', disabled: false, value: '', attributes: {},
      setAttribute(name, text) { this.attributes[name] = text; }, removeAttribute(name) { delete this.attributes[name]; },
      focus() { lifecycle.focusCalls++; }, addEventListener() {}, ...extra };
    elements.set(id, value); return value;
  }
  const main = element('main-content', { dataset: { step: state.step, activeId: 'sample', busy: String(!!state.busy), waitingForInput: String(!!state.waitingForInput) } });
  const editor = element('editorContent', { dataset: { editorPath: 'SKILL.md' }, readOnly: false });
  element('operation-status'); element('operation-indicator', { hidden: true }); element('progress-message'); element('activity-details');
  for (const id of ['client-error', 'save-status', 'retry-save', 'reload-file', 'stepHeading', 'feedback']) element(id);
  element('workbench-configuration', { dataset: { configurationError: 'false' } });
  for (const id of ['active-work-folder', 'local-repository-path', 'configured-repository', 'repository-settings-state', 'repository-verification']) {
    const output = element(id);
    Object.defineProperty(output, 'innerHTML', { set() { throw new Error('Untrusted HTML insertion'); } });
  }
  const buttons = [element('check-button'), element('permanently-unavailable', { dataset: { unavailable: 'true' }, disabled: true })];
  const input = element('optional-note'), unavailable = element('unavailable-input', { disabled: true });
  const packagePath = element('packagePath', { value: 'C:\\Downloads\\example.skill' });
  let formSubmit;
  const pathForm = { dataset: { formAction: 'openPackagePath' }, reportValidity: () => true,
    addEventListener: (name, handler) => { if (name === 'submit') formSubmit = handler; } };
  const handlers = new Map(), windowHandlers = new Map(), timers = new Map(), posted = [];
  let timerId = 0;
  let now = 0;
  const document = { activeElement: editor, getElementById: id => elements.get(id) ?? null,
    querySelectorAll: selector => selector === 'button' ? buttons : selector === 'input,select,textarea' ? [editor, input, unavailable] : selector === 'form[data-form-action]' ? [pathForm] : [], querySelector: () => null,
    addEventListener: (name, handler) => handlers.set(name, handler) };
  const context = { document, window: { addEventListener: (name, handler) => windowHandlers.set(name, handler) },
    Date: { now: () => now },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id), acquireVsCodeApi: () => ({ getState: () => ({ step: state.step, activeId: 'sample' }), setState() { lifecycle.stateWrites++; },
      postMessage(message) { posted.push({ message, label: elements.get('progress-message').textContent, spinning: !elements.get('operation-indicator').hidden }); } }) };
  new vm.Script(source).runInNewContext(context);
  const click = action => handlers.get('click')({ preventDefault() {}, target: { closest: () => ({ dataset: { action } }) } });
  const receive = message => windowHandlers.get('message')({ data: message });
  const fire = delay => { const entry = [...timers].find(([, timer]) => timer.delay === delay); assert(entry, `missing ${delay}ms timer`); timers.delete(entry[0]); entry[1].callback(); };
  return { html, main, editor, elements, element, lifecycle, buttons, posted, timers, click, receive, fire, advance: ms => { now += ms; }, submitPath: () => formSubmit({ preventDefault() {} }) };
}

test('startup sends no automatic skill load and explicit load shows immediate activity', () => {
  const h = harness({ step: 'start', active: undefined, editor: undefined });
  assert.equal(h.posted.length, 0);
  h.click('loadSkills'); h.click('loadSkills');
  assert.equal(h.posted.length, 1);
  assert.equal(h.posted[0].message.action, 'loadSkills');
  assert.equal(h.posted[0].spinning, true);
  assert.match(h.posted[0].label, /Loading and checking saved skills/);
});

test('open by path sends the explicit path directly as a processing action', () => {
  const h = harness(); h.submitPath();
  assert.equal(h.posted.length, 1);
  assert.equal(h.posted[0].message.action, 'openPackagePath');
  assert.equal(h.posted[0].message.payload.path, 'C:\\Downloads\\example.skill');
  assert.equal(h.posted[0].spinning, true);
  assert.equal(h.elements.get('operation-status').dataset.waitingForInput, 'false');
});

test('step clicks show specific feedback before host work and reject a duplicate request', () => {
  const h = harness(); h.click('check'); h.click('check');
  assert.equal(h.posted.length, 1);
  assert.equal(h.posted[0].message.action, 'check');
  assert.equal(h.posted[0].label, 'Running a structural sanity check…');
  assert.equal(h.posted[0].spinning, true);
  assert.equal(h.main.attributes['aria-busy'], 'true');
  assert.equal(h.buttons[0].disabled, true);
  assert.equal(h.editor.value, 'Keep these instructions.');
  assert.equal(h.editor.readOnly, true, 'prevent new edits after the checked buffer was submitted');
  assert.equal(h.posted[0].message.editorContent, 'Keep these instructions.', 'capture buffer before temporarily making editor read-only');
  assert.equal(h.elements.get('optional-note').disabled, true);
});

test('native pickers and account selection show human-input feedback without a processing spinner or delay warning', () => {
  for (const action of ['chooseWorkspace', 'openPackage', 'openFolder', 'addFile', 'connectGitHub']) {
    const h = harness(); h.click(action);
    assert.match(h.posted[0].label, /Choose|selection/);
    assert.equal(h.posted[0].spinning, false, action);
    assert.equal(h.timers.size, 0, 'a human selection must not trigger a slow-processing warning');
    assert.equal(h.elements.get('operation-status').dataset.waitingForInput, 'true');
    h.click(action); assert.equal(h.posted.length, 1, 'do not open duplicate dialogs');
    h.receive({ type: 'operationComplete' });
    assert.equal(h.elements.get('progress-message').textContent, 'Ready.');
    assert.equal(h.main.attributes['aria-busy'], 'false');
    assert.equal(h.buttons[0].disabled, false);
    assert.equal(h.buttons[1].disabled, true);
    assert.equal(h.editor.readOnly, false);
    assert.equal(h.elements.get('optional-note').disabled, false);
    assert.equal(h.elements.get('unavailable-input').disabled, true);
    assert.equal(h.elements.get('operation-status').dataset.waitingForInput, 'false');
  }
});

test('workbench setup reports the actual queued, dialog and checking phases without stealing focus', () => {
  for (const action of ['createWorkbench', 'openWorkbenchFolder']) {
    const h = harness({ step: 'start', active: undefined, editor: undefined });
    const focusBefore = h.lifecycle.focusCalls;
    h.click(action);
    assert.match(h.posted[0].label, /^Requesting/);
    assert.equal(h.posted[0].spinning, true, 'a request is not proof that the native chooser opened');
    assert.equal(h.elements.get('operation-status').dataset.waitingForInput, 'false');
    h.receive({ type: 'progress', message: 'Choose a workbench folder in VS Code.', waitingForInput: true });
    assert.equal(h.elements.get('operation-indicator').hidden, true);
    assert.equal(h.elements.get('operation-status').dataset.waitingForInput, 'true');
    assert.equal(h.timers.size, 0);
    h.receive({ type: 'progress', message: 'Checking the selected folder…', waitingForInput: false });
    assert.equal(h.elements.get('operation-indicator').hidden, false);
    assert.equal(h.elements.get('operation-status').dataset.waitingForInput, 'false');
    h.receive({ type: 'operationComplete', error: 'Select an initialized workbench folder.' });
    assert.equal(h.buttons[0].disabled, false);
    assert.equal(h.elements.get('operation-indicator').hidden, true);
    assert.match(h.elements.get('client-error').textContent, /Select an initialized workbench folder/);
    assert.equal(h.timers.size, 0);
    assert.equal(h.lifecycle.focusCalls, focusBefore, 'host phases must not move keyboard focus');
  }
});

test('selected input starts the processing indicator and slow timer only after the explicit processing phase', () => {
  const h = harness(); h.click('openPackage');
  h.receive({ type: 'progress', message: 'Choose a package in the dialog.', waitingForInput: true });
  assert.equal(h.elements.get('operation-indicator').hidden, true);
  assert.equal(h.timers.size, 0);
  h.receive({ type: 'progress', message: 'Inspecting the selected package…', waitingForInput: false });
  assert.equal(h.elements.get('operation-indicator').hidden, false);
  assert.equal(h.elements.get('operation-status').dataset.waitingForInput, 'false');
  h.fire(8000);
  assert.match(h.elements.get('progress-message').textContent, /Inspecting the selected package.*Still waiting for this operation to finish/);
  assert.doesNotMatch(h.elements.get('progress-message').textContent, /\d+%|complete|success/i);
  h.receive({ type: 'operationComplete' });
  assert.equal(h.elements.get('operation-indicator').hidden, true);
  assert.equal(h.timers.size, 0);
});

test('an explicit human-input phase stops an already-running processing delay without interpreting copy', () => {
  const h = harness(); h.click('check');
  assert.equal(h.timers.size, 2);
  h.receive({ type: 'progress', message: 'A decision is needed.', waitingForInput: true });
  assert.equal(h.elements.get('operation-indicator').hidden, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.elements.get('progress-message').textContent, 'A decision is needed.');
});

test('initial human-input render has no processing indicator or slow warning', () => {
  const h = harness({ busy: true, waitingForInput: true, progress: 'Choose a skill package.' });
  assert.equal(h.elements.get('operation-indicator').hidden, true);
  assert.equal(h.timers.size, 0);
  assert.match(h.html, /data-working="false" data-waiting-for-input="true"/);
  assert.match(h.html, /<progress[^>]*hidden/);
});

test('incremental host stages and completion use inert text without replacing editor content', () => {
  const h = harness(); h.click('savePackage');
  h.receive({ type: 'progress', message: 'Comparing <script>private()</script> files…' });
  assert.equal(h.elements.get('progress-message').textContent, 'Comparing <script>private()</script> files…');
  assert.equal(h.editor.value, 'Keep these instructions.');
  h.receive({ type: 'operationComplete', error: 'Read failed <img src=x>' });
  assert.equal(h.elements.get('operation-indicator').hidden, true);
  assert.match(h.elements.get('client-error').textContent, /Read failed <img src=x>/);
  assert.equal(h.buttons[0].disabled, false);
  assert.equal(h.timers.size, 0);
});

test('failed autosave cancels the queued submission and keeps the editor for explicit retry', () => {
  const h = harness(); h.click('save'); h.click('publish');
  assert.equal(h.posted.length, 1); assert.equal(h.posted[0].message.action, 'save');
  assert.match(h.elements.get('progress-message').textContent, /Saving your current edit/);
  h.receive({ type: 'saved', error: 'File changed in another editor.' });
  assert.equal(h.posted.length, 1, 'no publish after a failed prerequisite save');
  assert.equal(h.editor.value, 'Keep these instructions.');
  assert.equal(h.buttons[0].disabled, false);
  assert.equal(h.elements.get('retry-save').hidden, false);
  assert.equal(h.elements.get('operation-indicator').hidden, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.editor.readOnly, false);
});

test('autosave itself leaves the editor writable', () => {
  const h = harness(); h.click('save');
  assert.equal(h.editor.readOnly, false);
  assert.equal(h.elements.get('optional-note').disabled, false);
  h.receive({ type: 'saved' });
  assert.equal(h.editor.readOnly, false);
});

test('successful autosave resumes exactly one queued action with its own progress', () => {
  const h = harness(); h.click('save'); h.click('check');
  h.receive({ type: 'saved' });
  assert.equal(h.posted.length, 2);
  assert.equal(h.posted[1].message.action, 'check');
  assert.equal(h.posted[1].label, 'Running a structural sanity check…');
  assert.equal(h.posted[1].spinning, true);
});

test('activity status sits outside the busy region and supports reduced motion and forced colors', () => {
  const h = harness(), index = h.html.indexOf('<main id="main-content"');
  assert(index > h.html.indexOf('<div id="operation-status"'));
  const status = h.html.slice(h.html.indexOf('<div id="operation-status"'), index);
  assert.match(status, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(status, /<progress[^>]*aria-label="Operation in progress"/);
  assert.doesNotMatch(status, /<progress[^>]*\bvalue=/);
  assert.match(h.html, /prefers-reduced-motion: reduce\) \{ \.activity-indicator \{ animation: none/);
  assert.match(h.html, /forced-colors: active\) \{ \.activity-status/);
});

test('elapsed time survives stage updates and host silence is distinguished from task progress', () => {
  const h = harness(); h.click('check');
  h.advance(4000); h.receive({ type: 'progress', message: 'Checking compatibility…' });
  h.advance(2000); h.receive({ type: 'heartbeat' }); h.fire(1000);
  assert.match(h.elements.get('activity-details').textContent, /6s elapsed.*Extension responding/);
  h.advance(11000); h.fire(1000);
  assert.match(h.elements.get('activity-details').textContent, /17s elapsed.*No extension response for 11s.*may be stalled/);
  assert.equal(h.buttons[0].disabled, true, 'silence must not unlock a duplicate write');
  h.receive({ type: 'heartbeat' }); h.fire(1000);
  assert.match(h.elements.get('activity-details').textContent, /Extension responding.*completion is still pending/);
  h.receive({ type: 'operationComplete', message: 'Finished in 17.0 seconds.' });
  assert.equal(h.elements.get('progress-message').textContent, 'Finished in 17.0 seconds.');
  assert.equal(h.elements.get('activity-details').textContent, '');
  assert.equal(h.timers.size, 0);
});


test('elapsed processing time excludes time spent choosing a package', () => {
  const h = harness(); h.click('openPackage');
  h.receive({ type: 'progress', message: 'Choose a package.', waitingForInput: true });
  h.advance(65000);
  h.receive({ type: 'progress', message: 'Opening the selected package.', waitingForInput: false });
  assert.match(h.elements.get('activity-details').textContent, /^0s elapsed/);
  h.advance(2000); h.fire(1000);
  assert.match(h.elements.get('activity-details').textContent, /^2s elapsed/);
});

test('native command capture acknowledges the current unsaved editor buffer without saving or starting work', () => {
  const h = harness();
  h.editor.value = 'Typed locally but not saved yet.';
  const timers = h.timers.size;
  h.receive({ type: 'captureEditorBuffer', requestId: 'bound-request-123', action: 'publish' });
  assert.equal(h.posted.length, 1);
  const captured = h.posted[0].message;
  assert.equal(captured.action, 'editorBufferCaptured');
  assert.equal(captured.requestId, 'bound-request-123');
  assert.equal(captured.editorSkillId, 'sample');
  assert.equal(captured.editorPath, 'SKILL.md');
  assert.equal(captured.editorContent, 'Typed locally but not saved yet.');
  assert.equal(h.posted[0].spinning, false);
  assert.equal(h.editor.readOnly, false);
  assert.equal(h.buttons[0].disabled, false);
  assert.equal(h.timers.size, timers);
  assert.equal(h.editor.value, 'Typed locally but not saved yet.');
});

test('buffer capture responds while busy without unlocking controls or dispatching a supplied action', () => {
  const h = harness(); h.click('check');
  h.receive({ type: 'captureEditorBuffer', requestId: 'busy-request', action: 'publish' });
  assert.equal(h.posted.length, 2);
  assert.equal(h.posted[1].message.action, 'editorBufferCaptured');
  assert.equal(h.posted[1].message.requestId, 'busy-request');
  assert.equal(h.buttons[0].disabled, true);
  assert.equal(h.editor.readOnly, true);
  assert.equal(h.elements.get('progress-message').textContent, 'Running a structural sanity check…');
  h.receive({ type: 'captureEditorBuffer', requestId: 7 });
  assert.equal(h.posted.length, 2, 'malformed request ids are ignored');
});

test('settings gear does not capture or flush a pending editor save', () => {
  const h = harness(); h.click('save');
  h.editor.value = 'Still typing during save.';
  h.click('openSettings');
  assert.equal(h.posted.length, 2);
  assert.equal(h.posted[1].message.action, 'openSettings');
  assert.deepEqual(Object.keys(h.posted[1].message), ['action']);
  assert.equal(h.editor.value, 'Still typing during save.');
  assert.equal(h.editor.readOnly, false);
});

test('targeted configuration updates preserve newer unsaved text after an earlier autosave advanced the server', () => {
  const h = harness({ editor: { path: 'SKILL.md', content: 'Original page baseline.' } });
  h.editor.value = 'First edit saved to the server.';
  h.click('save');
  h.receive({ type: 'saved' });
  const latest = 'Second edit typed after autosave.\n</textarea><script>not executable</script>';
  h.editor.value = latest;
  const counts = { ...h.lifecycle }, timerCount = h.timers.size, posts = h.posted.length;
  const hostile = '<img src=x onerror=hostile()>';
  h.receive({ type: 'configurationChanged', display: { workFolder: 'P:/Active work', localRepository: hostile,
    repository: 'https://github.com/changed/Skills', invalid: false, notice: hostile } });
  assert.equal(h.editor.value, latest, 'targeted updates must not restore any earlier editor baseline');
  assert.equal(h.editor.readOnly, false);
  assert.deepEqual(h.lifecycle, counts, 'no focus move or persisted editor snapshot');
  assert.equal(h.timers.size, timerCount, 'no autosave scheduled');
  assert.equal(h.posted.length, posts, 'no operation or editor acknowledgement sent');
  assert.equal(h.elements.get('active-work-folder').textContent, 'P:/Active work');
  assert.equal(h.elements.get('local-repository-path').textContent, hostile);
  assert.equal(h.elements.get('repository-verification').textContent, hostile);
  assert.equal(h.elements.get('repository-settings-state').textContent, 'Not yet verified');
});

test('configuration changes disable only stale upload while preserving local save and the settings route', () => {
  const h = harness({ step: 'publish' });
  const upload = h.element('primary-action');
  const localSave = h.element('local-package-button');
  h.element('publish-form', { dataset: { formAction: 'publish' } });
  h.receive({ type: 'configurationChanged', display: { workFolder: 'P:/Active work', localRepository: '',
    repository: '', invalid: true, notice: 'Correct your repository in Settings.' } });
  assert.equal(upload.disabled, true);
  assert.equal(upload.dataset.unavailable, 'true');
  assert.equal(localSave.disabled, false);
  assert.equal(h.elements.get('workbench-configuration').dataset.configurationError, 'true');
  assert.equal(h.elements.get('repository-settings-state').textContent, 'Needs attention');
  assert.match(h.elements.get('repository-verification').textContent, /review a fresh submission summary/);
  h.click('publish');
  assert.equal(h.posted.length, 0, 'implicit or programmatic upload cannot use the stale review');
  h.click('openSettings');
  assert.equal(h.posted[0].message.action, 'openSettings');
  h.click('savePackage');
  assert.equal(h.posted[1].message.action, 'savePackage');
});

test('a local-only package primary remains available after settings change', () => {
  const h = harness({ step: 'publish' });
  const save = h.element('primary-action');
  h.element('publish-form', { dataset: { formAction: 'savePackage' } });
  h.receive({ type: 'configurationChanged', display: { workFolder: 'P:/Active work', localRepository: '', repository: '', invalid: false, notice: 'Settings updated.' } });
  assert.equal(save.disabled, false);
  h.click('savePackage');
  assert.equal(h.posted[0].message.action, 'savePackage');
});
