const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { renderGuidedWorkbench } = require('../out/guided-workbench-html.js');

function harness({ saved = {}, step = 'edit', activity = [] } = {}) {
  const state = { step, active: { id: 'sample', name: 'sample' }, hasWorkspace: true,
    repositories: [], drafts: [], library: [], files: [], target: 'portable', activity };
  const html = renderGuidedWorkbench(state, 'activityUiNonce');
  const script = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1];
  const nodes = new Map(), handlers = new Map(), windowHandlers = new Map(), posted = [], timers = new Map();
  let persisted = saved, focusCalls = [], scrollCalls = 0, timer = 0;
  const document = { activeElement: null,
    getElementById: id => nodes.get(id) ?? null,
    createElement: tag => node(undefined, { tag }),
    querySelectorAll: selector => selector === 'button' ? [nodes.get('primary-action')] : [],
    querySelector: () => null,
    addEventListener: (name, handler) => handlers.set(name, handler) };
  function node(id, overrides = {}) {
    const element = { id, dataset: {}, textContent: '', value: '', disabled: false, hidden: false, children: [],
      scrollHeight: 0, scrollTop: 0, clientHeight: 100, attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; this.scrollHeight = children.length * 35; },
      contains(target) { return this.children.includes(target); },
      focus() { document.activeElement = this; focusCalls.push(this.id); handlers.get('focusin')?.({ target: this }); },
      scrollIntoView() { scrollCalls++; }, addEventListener() {}, ...overrides };
    if (id) nodes.set(id, element);
    return element;
  }
  node('main-content', { dataset: { step, activeId: 'sample', busy: 'false' } });
  for (const id of ['operation-status', 'operation-indicator', 'progress-message', 'activity-details', 'activity-history', 'client-error', 'save-status', 'retry-save', 'reload-file', 'stepHeading', 'feedback', 'primary-action']) node(id);
  document.activeElement = nodes.get('primary-action');
  vm.runInNewContext(script, { document,
    window: { addEventListener: (name, handler) => windowHandlers.set(name, handler) },
    Date: { now: () => 0 },
    setTimeout: callback => { timers.set(++timer, callback); return timer; }, clearTimeout: id => timers.delete(id),
    acquireVsCodeApi: () => ({ getState: () => persisted, setState: value => { persisted = value; }, postMessage: message => posted.push(message) }) });
  const receive = data => windowHandlers.get('message')({ data });
  return { html, nodes, posted, focusCalls, scrollCalls: () => scrollCalls, saved: () => persisted,
    click(action, primary = false) { handlers.get('click')({ preventDefault() {}, target: { closest: () => ({ id: primary ? 'primary-action' : '', dataset: { action } }) } }); },
    receive, focus(id) { nodes.get(id).focus(); } };
}

const entry = (id, status = 'info', message = `Step ${id}`) => ({ id, status, message });

test('Next moves focus to Activity once; progress and completion do not steal focus', () => {
  const h = harness({ saved: { step: 'edit', activeId: 'sample' } });
  h.click('preparePublish', true);
  assert.equal(h.focusCalls.at(-1), 'operation-status');
  assert.equal(h.scrollCalls(), 1);
  const count = h.focusCalls.length;
  h.receive({ type: 'progress', message: 'Checking files', activity: [entry(1, 'running')] });
  h.receive({ type: 'progress', message: 'Waiting for GitHub', activity: [entry(1, 'info'), entry(2, 'waiting')] });
  h.receive({ type: 'operationComplete', message: 'Finished', activity: [entry(1, 'succeeded'), entry(2, 'info')] });
  assert.equal(h.focusCalls.length, count);
  assert.equal(h.saved().activityFocus, true);
  const next = harness({ saved: h.saved(), step: 'publish', activity: [entry(1, 'succeeded')] });
  assert.equal(next.focusCalls.at(-1), 'operation-status', 'final document keeps focus on activity after a step change');
});

test('deliberately leaving Activity cancels focus restoration', () => {
  const h = harness({ saved: { step: 'edit', activeId: 'sample' } });
  h.click('check', true);
  h.focus('primary-action');
  assert.equal(h.saved().activityFocus, false);
  const next = harness({ saved: h.saved(), step: 'check' });
  assert.equal(next.focusCalls.at(-1), 'stepHeading');
});

test('activity retains explicit outcomes without inferring success from a later message', () => {
  const h = harness();
  h.receive({ type: 'progress', message: 'Checking files', activity: [entry(1, 'running')] });
  h.receive({ type: 'progress', message: 'Waiting for GitHub', activity: [entry(1, 'info'), entry(2, 'waiting')] });
  const history = h.nodes.get('activity-history');
  assert.equal(history.children[0].dataset.status, 'info');
  assert.equal(history.children[0].children[0].textContent, 'Update: ');
  assert.equal(history.children[1].children[0].textContent, 'Waiting: ');
  h.receive({ type: 'operationComplete', error: 'Connection failed', activity: [entry(1, 'info'), entry(2, 'failed')] });
  assert.equal(history.children[1].children[0].textContent, 'Needs attention: ');
});

test('history follows new entries at the bottom and preserves position while reading earlier entries', () => {
  const h = harness(), history = h.nodes.get('activity-history');
  const entries = Array.from({ length: 10 }, (_, index) => entry(index));
  h.receive({ type: 'progress', activity: entries });
  assert.equal(history.scrollTop, history.scrollHeight);
  history.scrollTop = 15;
  h.receive({ type: 'progress', activity: [...entries, entry(11)] });
  assert.equal(history.scrollTop, 15);
  const next = harness({ saved: h.saved(), activity: [...entries, entry(11)] });
  assert.equal(next.nodes.get('activity-history').scrollTop, 15, 'completion render preserves reading position');
});

test('activity is bounded, renders hostile text as text, and announces only the current status', () => {
  const hostile = '</script><img src=x onerror=hostile()>';
  const h = harness({ activity: [entry(1, 'info', hostile)] });
  assert.doesNotMatch(h.html, /<img src=x onerror=hostile\(\)>/);
  assert.match(h.html, /id="activity-history"[^>]*aria-live="off"/);
  assert.match(h.html, /id="progress-message" role="status" aria-live="polite"/);
  h.receive({ type: 'progress', activity: [...Array.from({ length: 110 }, (_, index) => entry(index)), entry(111, 'info', hostile)] });
  const history = h.nodes.get('activity-history');
  assert.equal(history.children.length, 100);
  assert.equal(history.children.at(-1).children[1].textContent, hostile);
});

test('ordinary secondary actions do not move focus to Activity', () => {
  const h = harness({ saved: { step: 'edit', activeId: 'sample' } });
  const before = h.focusCalls.length;
  h.click('refreshHistory');
  assert.equal(h.focusCalls.length, before);
  assert.equal(h.scrollCalls(), 0);
});
