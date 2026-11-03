const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { renderGuidedWorkbench } = require('../out/guided-workbench-html.js');

function fixture(verification, configurationError) {
  const state = { step: 'start', hasWorkspace: true, target: 'portable', repositories: [], drafts: [], library: [], files: [],
    connection: { repository: 'https://github.com/fixture/skills', localPath: 'P:/fixture', baseBranch: 'main' }, repositoryVerification: verification, configurationError };
  const html = renderGuidedWorkbench(state, 'settingsFeedbackNonce');
  const nodes = new Map(); let focusCalls = 0, receive;
  const node = (id, extra = {}) => {
    const value = { id, dataset: {}, textContent: '', value: '', open: false, setAttribute() {}, removeAttribute() {}, addEventListener() {}, focus() { focusCalls++; }, ...extra };
    Object.defineProperty(value, 'innerHTML', { set() { throw new Error('Untrusted HTML insertion'); } });
    nodes.set(id, value); return value;
  };
  node('main-content', { dataset: { step: 'start', activeId: '', formScope: 'start:home', busy: 'false', hasError: 'false' } });
  node('workbench-configuration', { dataset: { configurationError: String(!!configurationError) } });
  node('repository-settings-state'); node('repository-verification');
  const saved = { step: 'start', activeId: '' };
  const document = { activeElement: null, getElementById: id => nodes.get(id) || null, querySelector: () => null,
    querySelectorAll: () => [], addEventListener() {} };
  vm.runInNewContext(/<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1], { document,
    window: { addEventListener(name, handler) { if (name === 'message') receive = handler; } },
    acquireVsCodeApi: () => ({ getState: () => saved, setState() {}, postMessage() {} }), setTimeout, clearTimeout });
  return { html, nodes, focusCalls: () => focusCalls, receive: verification => receive({ data: { type: 'repositoryVerification', verification } }) };
}

test('background repository results update the read-only summary without moving focus', () => {
  const f = fixture({ status: 'checking', message: 'Checking' });
  const summary = f.nodes.get('repository-settings-state');
  const labels = { checking: 'Checking connection', verified: 'Verified', outOfSync: 'Local and remote differ', setupRequired: 'Setup needed', error: 'Check failed' };
  for (const [status, label] of Object.entries(labels)) {
    f.receive({ status, message: '<img src=x onerror=hostile()> PRIVATE_REPOSITORY' });
    assert.equal(summary.textContent, label);
    assert.equal(f.nodes.get('repository-verification').textContent, '<img src=x onerror=hostile()> PRIVATE_REPOSITORY');
  }
  assert.equal(f.focusCalls(), 0);
  f.receive({ status: 'constructor', message: 'Unknown result' });
  assert.equal(summary.textContent, 'Not yet verified');
});

test('setup errors stay visible in the read-only summary without a collapsed settings region', () => {
  const f = fixture({ status: 'error', message: 'Connection needs attention.' });
  assert.match(f.html, /id="repository-settings-state"[^>]*>Upload needs attention<\/span>/);
  assert.match(f.html, /Connection needs attention\./);
  assert.doesNotMatch(f.html, /id="repository-settings"/);
});

test('background verification cannot make rejected settings appear verified', () => {
  const f = fixture({ status: 'verified', message: 'Saved connection verified' }, 'Invalid credentials-bearing URL');
  f.receive({ status: 'verified', message: 'The saved connection is verified.' });
  assert.match(f.html, /id="repository-settings-state">Upload needs attention<\/span>/);
  assert.equal(f.nodes.get('repository-settings-state').textContent, '');
  assert.equal(f.nodes.get('repository-verification').textContent, '');
  assert.doesNotMatch(f.html, /Invalid credentials-bearing URL/);
});
