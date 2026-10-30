const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createGitHubSessionRunner } = require('../out/github-session.js');

function transport(status = 200, trickle = false) {
  const calls = [];
  const factory = (options, callback) => {
    const request = new EventEmitter(); let interval;
    request.destroyed = false;
    request.destroy = () => { request.destroyed = true; clearInterval(interval); };
    request.end = body => {
      calls.push({ options, body, request });
      queueMicrotask(() => {
        const response = new EventEmitter(); response.statusCode = status;
        response.destroy = () => clearInterval(interval);
        callback(response);
        if (status >= 200 && status < 300) {
          if (trickle) interval = setInterval(() => response.emit('data', Buffer.from(' ')), 2);
          else { response.emit('data', Buffer.from('{"login":"fixture-account"}')); response.emit('end'); }
        }
      });
    };
    return request;
  };
  return { calls, factory };
}

test('managed-session transport fixes HTTPS origin and certificate verification, with JSON on the request body', async () => {
  const f = transport();
  const run = createGitHubSessionRunner(async () => 'synthetic-test-token', f.factory);
  const result = await run({ method: 'POST', endpoint: 'repos/fixture-owner/fixture-repository/pulls', body: { title: 'Fixture only' } });
  assert.equal(result.login, 'fixture-account');
  assert.equal(f.calls[0].options.hostname, 'api.github.com');
  assert.equal(f.calls[0].options.protocol, 'https:');
  assert.equal(f.calls[0].options.rejectUnauthorized, true);
  assert.equal(f.calls[0].body, '{"title":"Fixture only"}');
});

test('redirects are refused and cancellation or endpoint injection never forwards an authentication header', async () => {
  const f = transport(302); let sessions = 0;
  const run = createGitHubSessionRunner(async () => { sessions++; return 'synthetic-test-token'; }, f.factory);
  await assert.rejects(run({ method: 'GET', endpoint: 'user' }), error => /redirect refused/.test(error.message) && !error.message.includes('synthetic-test-token'));
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].request.destroyed, true);
  await assert.rejects(run({ method: 'GET', endpoint: 'https://evil.invalid/steal' }), /Invalid/);
  assert.equal(sessions, 1);
  await assert.rejects(createGitHubSessionRunner(async () => { throw new Error('cancelled with synthetic-test-token'); }, f.factory)({ method: 'GET', endpoint: 'user' }), error => /cancelled/.test(error.message) && !error.message.includes('synthetic-test-token'));
  assert.equal(f.calls.length, 1);
});

test('an absolute owned deadline stops a response that keeps sending bytes', async () => {
  const f = transport(200, true);
  const run = createGitHubSessionRunner(async () => 'synthetic-test-token', f.factory, 20);
  let guard;
  try {
    await assert.rejects(Promise.race([run({ method: 'GET', endpoint: 'user' }), new Promise((_, reject) => { guard = setTimeout(() => reject(new Error('absolute deadline missing')), 500); })]), /timed out/);
    assert.equal(f.calls[0].request.destroyed, true);
  } finally { clearTimeout(guard); for (const call of f.calls) call.request.destroy(); }
});


test('merge uses authenticated PUT while unleased reference DELETE is unavailable', async () => {
  const f = transport(); let sessions = 0;
  const run = createGitHubSessionRunner(async () => { sessions++; return 'synthetic-test-token'; }, f.factory);
  const body = { sha: 'a'.repeat(40), merge_method: 'merge' };
  await run({ method: 'PUT', endpoint: 'repos/fixture-owner/fixture-repository/pulls/10/merge', body });
  assert.equal(f.calls[0].options.method, 'PUT'); assert.deepEqual(JSON.parse(f.calls[0].body), body);
  await assert.rejects(run({ method: 'DELETE', endpoint: 'repos/fixture-owner/fixture-repository/git/refs/heads/skills/sample/1.0.0' }), /Invalid GitHub API endpoint/);
  assert.equal(sessions, 1); assert.equal(f.calls.length, 1);
});
