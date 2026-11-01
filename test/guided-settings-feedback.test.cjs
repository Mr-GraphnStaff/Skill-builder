const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { renderGuidedWorkbench } = require('../out/guided-workbench-html.js');

function fixture(verification, savedOpen = false) {
  const state = { step: 'start', hasWorkspace: true, target: 'portable', repositories: [], drafts: [], library: [], files: [],
    connection: { repository: 'https://github.com/fixture/skills', localPath: 'P:/fixture', baseBranch: 'main' }, repositoryVerification: verification };
  const html = renderGuidedWorkbench(state, 'settingsFeedbackNonce');
  const nodes = new Map(); let focusCalls = 0, receive;
  const node = (id, extra = {}) => {
    const value = { id, dataset: {}, textContent: '', value: '', open: false, setAttribute() {}, removeAttribute() {}, addEventListener() {}, focus() { focusCalls++; }, ...extra };
    Object.defineProperty(value, 'innerHTML', { set() { throw new Error('Untrusted HTML insertion'); } });
    nodes.set(id, value); return value;
  };
  node('main-content', { dataset: { step: 'start', activeId: '', formScope: 'start:home', busy: 'false', hasError: 'false' } });
  node('repository-settings', { open: ['error', 'setupRequired'].includes(verification?.status) });
  node('repository-settings-state'); node('repository-verification');
  const saved = { step: 'start', activeId: '', disclosures: { 'start:home:repository-settings': savedOpen } };
  const document = { activeElement: null, getElementById: id => nodes.get(id) || null, querySelector: () => null,
    querySelectorAll: selector => selector === 'details[data-persist-open]' ? [nodes.get('repository-settings')] : [], addEventListener() {} };
  vm.runInNewContext(/<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1], { document,
    window: { addEventListener(name, handler) { if (name === 'message') receive = handler; } },
    acquireVsCodeApi: () => ({ getState: () => saved, setState() {}, postMessage() {} }), setTimeout, clearTimeout });
  return { html, nodes, focusCalls: () => focusCalls, receive: verification => receive({ data: { type: 'repositoryVerification', verification } }) };
}

test('background repository results stay discoverable in collapsed settings without moving focus or opening them', () => {
  const f = fixture({ status: 'checking', message: 'Checking' });
  const settings = f.nodes.get('repository-settings'), summary = f.nodes.get('repository-settings-state');
  const labels = { checking: 'Checking connection', verified: 'Verified', outOfSync: 'Local and remote differ', setupRequired: 'Setup needed', error: 'Check failed' };
  for (const [status, label] of Object.entries(labels)) {
    f.receive({ status, message: '<img src=x onerror=hostile()> PRIVATE_REPOSITORY' });
    assert.equal(summary.textContent, label);
    assert.equal(settings.open, false);
    assert.equal(f.nodes.get('repository-verification').textContent, '<img src=x onerror=hostile()> PRIVATE_REPOSITORY');
  }
  assert.equal(f.focusCalls(), 0);
  f.receive({ status: 'constructor', message: 'Unknown result' });
  assert.equal(summary.textContent, 'Not yet verified');
});

test('a saved collapsed choice cannot mask an initial setup error', () => {
  const f = fixture({ status: 'error', message: 'Connection needs attention.' }, false);
  assert.equal(f.nodes.get('repository-settings').open, true);
  assert.match(f.html, /id="repository-settings-state"[^>]*>Check failed<\/span>/);
  assert.match(f.html, /id="repository-settings"[^>]* open/);
});
