const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { verifyProjectRepository, pullProjectRepository } = require('../out/managed-repository.js');
function fixture(t) {
  const scratch = require('./working-fixture.cjs').workingFixture('repository-project'); fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, 'repository-project-'));
  assert.equal(path.dirname(root), scratch);
  const keys = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_NOSYSTEM'];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const config = path.join(root, 'qa.gitconfig');
  fs.writeFileSync(config, `[safe]\n directory = ${root.replace(/\\/g, '/')}/*\n[user]\n name = Local QA\n email = qa@example.invalid\n`);
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: config, GIT_CONFIG_COUNT: '0', GIT_CONFIG_NOSYSTEM: '1' });
  t.after(() => { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } assert.equal(path.dirname(path.resolve(root)), scratch); fs.rmSync(root, { recursive: true, force: true }); });
  const git = (cwd, ...args) => cp.execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
  const remote = path.join(root, 'remote'); fs.mkdirSync(remote); git(remote, 'init', '-b', 'main');
  fs.writeFileSync(path.join(remote, 'README.md'), 'Skills.\n'); git(remote, 'add', '.'); git(remote, 'commit', '-m', 'Initial');
  const local = path.join(root, 'Skills');
  const commit = () => { git(remote, 'add', '.'); git(remote, 'commit', '-m', 'Update'); };
  return { root, remote, local, git, commit, config };
}
test('explicit folder required; hidden and nonempty nongit destinations remain untouched', async t => {
  const f = fixture(t);
  assert.equal((await verifyProjectRepository(f.remote)).status, 'setupRequired');
  await assert.rejects(pullProjectRepository(f.root, f.remote, ''), /explicit/);
  await assert.rejects(pullProjectRepository(f.root, f.remote, path.join(f.root, '.codex', 'skills')), /outside Codex/);
  fs.mkdirSync(f.local); fs.writeFileSync(path.join(f.local, 'keep.txt'), 'Keep');
  await assert.rejects(pullProjectRepository(f.root, f.remote, f.local), /nonempty/);
  assert.equal(fs.readFileSync(path.join(f.local, 'keep.txt'), 'utf8'), 'Keep');
});
test('clone selected folder, read-only verification, remote drift, pull and local preservation', async t => {
  const f = fixture(t);
  const initial = await pullProjectRepository(f.root, f.remote, f.local);
  assert.equal(initial.path, f.local);
  const index = fs.readFileSync(path.join(f.local, '.git/index'));
  const refs = fs.readFileSync(path.join(f.local, '.git/packed-refs'));
  assert.equal((await verifyProjectRepository(f.remote, f.local)).status, 'verified');
  assert.deepEqual(fs.readFileSync(path.join(f.local, '.git/index')), index);
  assert.deepEqual(fs.readFileSync(path.join(f.local, '.git/packed-refs')), refs);
  fs.appendFileSync(path.join(f.remote, 'README.md'), 'Remote update.\n'); f.commit();
  assert.equal((await verifyProjectRepository(f.remote, f.local)).status, 'outOfSync');
  const pulled = await pullProjectRepository(f.root, f.remote, f.local);
  assert.equal(pulled.commit, f.git(f.remote, 'rev-parse', 'HEAD'));
  fs.appendFileSync(path.join(f.local, 'README.md'), 'Local edit.\n');
  assert.equal((await verifyProjectRepository(f.remote, f.local)).dirty, true);
  await assert.rejects(pullProjectRepository(f.root, f.remote, f.local), /local changes/);
  assert.match(fs.readFileSync(path.join(f.local, 'README.md'), 'utf8'), /Local edit/);
});
test('private controls do not block pull and incoming control paths cannot overwrite them', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  const privateFile = path.join(f.local, '.skill-workbench', 'session.json'); fs.mkdirSync(path.dirname(privateFile)); fs.writeFileSync(privateFile, 'Private');
  fs.writeFileSync(path.join(f.remote, 'next.txt'), 'Update'); f.commit();
  await pullProjectRepository(f.root, f.remote, f.local);
  assert.equal(fs.readFileSync(privateFile, 'utf8'), 'Private');
  fs.mkdirSync(path.join(f.remote, '.skill-workbench')); fs.writeFileSync(path.join(f.remote, '.skill-workbench', 'session.json'), 'Remote'); f.commit();
  const head = f.git(f.local, 'rev-parse', 'HEAD');
  await assert.rejects(pullProjectRepository(f.root, f.remote, f.local), /control paths/);
  assert.equal(f.git(f.local, 'rev-parse', 'HEAD'), head); assert.equal(fs.readFileSync(privateFile, 'utf8'), 'Private');
});
test('wrong origin, detached branch, missing upstream and unreachable remote are explicit', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  assert.equal((await verifyProjectRepository(path.join(f.root, 'other'), f.local)).status, 'setupRequired');
  f.git(f.local, 'checkout', '--detach'); assert.equal((await verifyProjectRepository(f.remote, f.local)).status, 'outOfSync');
  f.git(f.local, 'checkout', 'main'); f.git(f.local, 'branch', '--unset-upstream');
  assert.equal((await verifyProjectRepository(f.remote, f.local)).status, 'outOfSync');
  fs.renameSync(f.remote, `${f.remote}-unavailable`);
  assert.equal((await verifyProjectRepository(f.remote, f.local)).status, 'error');
});
test('ignored local files block checkout even if incoming remote would overwrite them', async t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.remote, '.gitignore'), 'personal.local\n'); f.commit();
  await pullProjectRepository(f.root, f.remote, f.local); fs.writeFileSync(path.join(f.local, 'personal.local'), 'Private');
  fs.writeFileSync(path.join(f.remote, 'personal.local'), 'Incoming'); f.git(f.remote, 'add', '-f', 'personal.local'); f.commit();
  await assert.rejects(pullProjectRepository(f.root, f.remote, f.local), /ignored files/);
  assert.equal(fs.readFileSync(path.join(f.local, 'personal.local'), 'utf8'), 'Private');
});

test('unrelated ignored private directories do not dirty verification or block a safe pull', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  fs.appendFileSync(path.join(f.local, '.git/info/exclude'), '\n/private-cache/\n');
  const privateFile = path.join(f.local, 'private-cache', 'retained.txt');
  fs.mkdirSync(path.dirname(privateFile)); fs.writeFileSync(privateFile, 'Only local content.');
  assert.equal(f.git(f.local, 'status', '--porcelain'), '');
  const verification = await verifyProjectRepository(f.remote, f.local);
  assert.equal(verification.status, 'verified'); assert.equal(verification.dirty, false);
  const sharedFetchHead = path.join(f.local, '.git/FETCH_HEAD');
  const preservedFetchHead = `${f.git(f.local, 'rev-parse', 'HEAD')}\t\tExisting user fetch state\n`;
  fs.writeFileSync(sharedFetchHead, preservedFetchHead);
  fs.appendFileSync(path.join(f.remote, 'README.md'), 'Safe remote update.\n'); f.commit();
  await pullProjectRepository(f.root, f.remote, f.local);
  assert.equal(f.git(f.local, 'rev-parse', 'HEAD'), f.git(f.remote, 'rev-parse', 'HEAD'));
  assert.match(fs.readFileSync(path.join(f.local, 'README.md'), 'utf8'), /Safe remote update/);
  assert.equal(fs.readFileSync(privateFile, 'utf8'), 'Only local content.');
  assert.equal(fs.readFileSync(sharedFetchHead, 'utf8'), preservedFetchHead, 'Pull does not overwrite shared FETCH_HEAD');
  fs.writeFileSync(path.join(f.local, 'untracked-note.txt'), 'Untracked user note.');
  await assert.rejects(pullProjectRepository(f.root, f.remote, f.local), /local changes/);
  assert.equal(fs.readFileSync(path.join(f.local, 'untracked-note.txt'), 'utf8'), 'Untracked user note.');
});

for (const collision of ['ignored directory', 'ignored file ancestor', 'incoming file ancestor']) {
  test(`${collision} collisions preserve private files and HEAD before merge`, async t => {
    const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
    fs.appendFileSync(path.join(f.local, '.git/info/exclude'), '\n/private-store\n');
    const privatePath = path.join(f.local, 'private-store');
    if (collision === 'ignored file ancestor') fs.writeFileSync(privatePath, 'Private file.');
    else { fs.mkdirSync(privatePath); fs.writeFileSync(path.join(privatePath, 'only-local.txt'), 'Private directory content.'); }
    if (collision === 'incoming file ancestor') fs.writeFileSync(path.join(f.remote, 'private-store'), 'Incoming file.');
    else { fs.mkdirSync(path.join(f.remote, 'private-store')); fs.writeFileSync(path.join(f.remote, 'private-store', 'new-remote.txt'), 'Incoming directory content.'); }
    f.commit();
    const head = f.git(f.local, 'rev-parse', 'HEAD');
    await assert.rejects(pullProjectRepository(f.root, f.remote, f.local), /overlap ignored files or folders/);
    assert.equal(f.git(f.local, 'rev-parse', 'HEAD'), head);
    const retained = collision === 'ignored file ancestor' ? privatePath : path.join(privatePath, 'only-local.txt');
    assert.match(fs.readFileSync(retained, 'utf8'), /^Private /);
    assert.equal(fs.existsSync(path.join(f.local, 'private-store', 'new-remote.txt')), false);
  });
}

test('case-only ignored file collisions preserve private bytes and HEAD on Windows', { skip: process.platform !== 'win32' }, async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  fs.appendFileSync(path.join(f.local, '.git/info/exclude'), '\n*.cache\n');
  const privateFile = path.join(f.local, 'personal.cache'); fs.writeFileSync(privateFile, 'Private case-sensitive name.');
  fs.writeFileSync(path.join(f.remote, 'PERSONAL.cache'), 'Incoming case variant.'); f.commit();
  const head = f.git(f.local, 'rev-parse', 'HEAD');
  await assert.rejects(pullProjectRepository(f.root, f.remote, f.local), /overlap ignored files or folders/);
  assert.equal(f.git(f.local, 'rev-parse', 'HEAD'), head);
  assert.equal(fs.readFileSync(privateFile, 'utf8'), 'Private case-sensitive name.');
});

test('Git refuses an ignored file created after the collision inventory and preserves HEAD', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  fs.appendFileSync(path.join(f.local, '.git/info/exclude'), '\nlate.cache\n');
  fs.writeFileSync(path.join(f.remote, 'late.cache'), 'Incoming content.'); f.commit();
  const head = f.git(f.local, 'rev-parse', 'HEAD'), privateFile = path.join(f.local, 'late.cache');
  const publisher = require('../out/repository-publisher.js'), original = publisher.repositoryGit;
  let inventoried = false, mergeProtected = false;
  publisher.repositoryGit = async (cwd, args) => {
    const result = await original(cwd, args);
    if (args.includes('ls-files') && args.includes('--ignored')) inventoried = true;
    return result;
  };
  try {
    await assert.rejects(pullProjectRepository(f.root, f.remote, f.local, undefined, () => {
      if (inventoried && !fs.existsSync(privateFile)) {
        fs.writeFileSync(privateFile, 'User file created after inventory.'); mergeProtected = true;
      }
    }), /overwritten by merge|untracked working tree files|would be overwritten/i);
  } finally { publisher.repositoryGit = original; }
  assert.equal(mergeProtected, true);
  assert.equal(f.git(f.local, 'rev-parse', 'HEAD'), head);
  assert.equal(fs.readFileSync(privateFile, 'utf8'), 'User file created after inventory.');
});

test('a shared FETCH_HEAD swap cannot replace the immutable scanned Pull commit', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  fs.writeFileSync(path.join(f.remote, 'safe-update.txt'), 'Reviewed branch update.'); f.commit();
  const expected = f.git(f.remote, 'rev-parse', 'HEAD');
  f.git(f.remote, 'switch', '-c', 'unchecked');
  fs.mkdirSync(path.join(f.remote, '.vscode')); fs.writeFileSync(path.join(f.remote, '.vscode/settings.json'), '{"unchecked":true}'); f.commit();
  const unchecked = f.git(f.remote, 'rev-parse', 'HEAD');
  f.git(f.remote, 'switch', 'main');
  f.git(f.local, 'fetch', '--no-write-fetch-head', f.remote, 'refs/heads/unchecked:refs/remotes/origin/unchecked');
  const shared = path.join(f.local, '.git/FETCH_HEAD'), replacement = `${unchecked}\t\tConcurrent external fetch\n`;
  const publisher = require('../out/repository-publisher.js'), original = publisher.repositoryGit;
  let swapped = false, privateRef;
  publisher.repositoryGit = async (cwd, args) => {
    if (args.includes('fetch')) {
      assert(args.includes('--no-write-fetch-head'));
      const refspec = args.find(value => value.startsWith('refs/heads/main:refs/skilljetty/pull/'));
      assert(refspec, 'Pull fetches only the selected branch into its own private reference');
      privateRef = refspec.slice(refspec.indexOf(':') + 1);
    }
    const result = await original(cwd, args);
    if (args.includes('ls-files') && args.includes('--ignored') && !swapped) {
      fs.writeFileSync(shared, replacement); swapped = true;
    }
    return result;
  };
  try { await pullProjectRepository(f.root, f.remote, f.local); }
  finally { publisher.repositoryGit = original; }
  assert.equal(swapped, true);
  assert.equal(f.git(f.local, 'rev-parse', 'HEAD'), expected);
  assert.equal(fs.existsSync(path.join(f.local, '.vscode/settings.json')), false);
  assert.equal(fs.readFileSync(shared, 'utf8'), replacement);
  assert.equal(f.git(f.local, 'for-each-ref', '--format=%(refname)', privateRef), '', 'successful Pull removes only its own pinned reference');
});

for (const change of ['branch switched', 'HEAD advanced']) {
  test(`a ${change} after inventory is preserved and prevents merging`, async t => {
    const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
    const startingHead = f.git(f.local, 'rev-parse', 'HEAD');
    if (change === 'branch switched') f.git(f.local, 'branch', 'user-work');
    fs.writeFileSync(path.join(f.remote, 'safe-update.txt'), 'Remote update.'); f.commit();
    const publisher = require('../out/repository-publisher.js'), original = publisher.repositoryGit;
    let inventoried = false, changed = false, preservedHead, mergeRan = false;
    publisher.repositoryGit = async (cwd, args) => {
      if (args.includes('merge')) mergeRan = true;
      const result = await original(cwd, args);
      if (args.includes('ls-files') && args.includes('--ignored')) inventoried = true;
      return result;
    };
    try {
      await assert.rejects(pullProjectRepository(f.root, f.remote, f.local, undefined, () => {
        if (!inventoried || changed) return;
        if (change === 'branch switched') f.git(f.local, 'switch', 'user-work');
        else f.git(f.local, 'commit', '--allow-empty', '-m', 'User concurrent commit');
        changed = true; preservedHead = f.git(f.local, 'rev-parse', 'HEAD');
      }), /branch or commit changed/);
    } finally { publisher.repositoryGit = original; }
    assert.equal(changed, true); assert.equal(mergeRan, false);
    assert.equal(f.git(f.local, 'branch', '--show-current'), change === 'branch switched' ? 'user-work' : 'main');
    assert.equal(f.git(f.local, 'rev-parse', 'HEAD'), preservedHead);
    if (change === 'branch switched') assert.equal(f.git(f.local, 'rev-parse', 'refs/heads/main'), startingHead);
    assert.equal(fs.existsSync(path.join(f.local, 'safe-update.txt')), false);
  });
}

for (const change of ['different value', 'symbolic reference']) {
  test(`private Pull reference cleanup preserves user refs when changed to a ${change}`, async t => {
    const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
    const startingHead = f.git(f.local, 'rev-parse', 'HEAD');
    const unrelated = 'refs/skilljetty/pull/user-preserved'; f.git(f.local, 'update-ref', unrelated, startingHead);
    fs.writeFileSync(path.join(f.remote, 'safe-update.txt'), 'Remote update.'); f.commit();
    const expected = f.git(f.remote, 'rev-parse', 'HEAD');
    const publisher = require('../out/repository-publisher.js'), original = publisher.repositoryGit;
    let privateRef, changed = false;
    publisher.repositoryGit = async (cwd, args) => {
      if (args.includes('fetch')) {
        const refspec = args.find(value => value.startsWith('refs/heads/main:refs/skilljetty/pull/'));
        privateRef = refspec?.slice(refspec.indexOf(':') + 1);
      }
      const result = await original(cwd, args);
      if (args.includes('merge') && privateRef) {
        if (change === 'different value') f.git(f.local, 'update-ref', privateRef, startingHead);
        else f.git(f.local, 'symbolic-ref', privateRef, 'refs/heads/main');
        changed = true;
      }
      return result;
    };
    try { await pullProjectRepository(f.root, f.remote, f.local); }
    finally { publisher.repositoryGit = original; }
    assert.equal(changed, true);
    assert.equal(f.git(f.local, 'rev-parse', 'refs/heads/main'), expected, 'cleanup never dereferences a changed private ref into the user branch');
    assert.equal(f.git(f.local, 'rev-parse', unrelated), startingHead, 'another private reference remains untouched');
    if (change === 'different value') assert.equal(f.git(f.local, 'rev-parse', privateRef), startingHead, 'changed private reference is retained');
  });
}
test('verification reports trustRequired and pull refuses writes without a trust decision', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  const previous = process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER;
  process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER = '1';
  fs.writeFileSync(f.config, '[user]\n name = Local QA\n email = qa@example.invalid\n');
  try {
    const result = await verifyProjectRepository(f.remote, f.local);
    assert.equal(result.status, 'setupRequired'); assert.equal(result.trustRequired, true);
    await assert.rejects(pullProjectRepository(f.root, f.remote, f.local), /dubious ownership/);
  } finally { if (previous === undefined) delete process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER; else process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER = previous; }
});
test('verification and pull disable fsmonitor, hooks and clean/smudge filters', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  const marker = path.join(f.root, 'executed.txt');
  const script = path.join(f.root, 'probe.cjs'); fs.writeFileSync(script, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed');`);
  const command = `node "${script.replace(/\\/g, '/')}"`;
  const hookDirectory = path.join(f.root, 'configured-hooks'); fs.mkdirSync(hookDirectory);
  fs.writeFileSync(path.join(hookDirectory, 'post-merge'), `#!/bin/sh\n${command}\n`, { mode: 0o755 });
  f.git(f.local, 'config', 'core.hooksPath', hookDirectory);
  f.git(f.local, 'config', 'core.fsmonitor', command);
  f.git(f.local, 'config', 'filter.guard.clean', command);
  f.git(f.local, 'config', 'filter.guard.smudge', command);
  f.git(f.local, 'config', 'filter.guard.required', 'true');
  fs.writeFileSync(path.join(f.local, '.git/info/attributes'), '* filter=guard\n');
  fs.utimesSync(path.join(f.local, 'README.md'), new Date(), new Date());
  assert.equal((await verifyProjectRepository(f.remote, f.local)).status, 'verified');
  fs.appendFileSync(path.join(f.remote, 'README.md'), 'Update\n'); f.commit();
  await pullProjectRepository(f.root, f.remote, f.local);
  assert.equal(fs.existsSync(marker), false);
});
test('GitHub HTTPS and SSH origin forms identify the same repository', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  f.git(f.local, 'remote', 'set-url', 'origin', 'git@github.com:Example/Skills.git');
  const publisher = require('../out/repository-publisher.js'); const original = publisher.repositoryGit;
  const commit = f.git(f.local, 'rev-parse', 'HEAD');
  publisher.repositoryGit = async (cwd, args) => args.includes('ls-remote') ? `ref: refs/heads/main\tHEAD\n${commit}\tHEAD\n` : original(cwd, args);
  try { assert.equal((await verifyProjectRepository('https://github.com/example/skills', f.local)).status, 'verified'); }
  finally { publisher.repositoryGit = original; }
});
test('missing Git is setupRequired without changing the selected folder', async t => {
  const f = fixture(t); await pullProjectRepository(f.root, f.remote, f.local);
  const previous = process.env.PATH; process.env.PATH = '';
  try { const result = await verifyProjectRepository(f.remote, f.local); assert.equal(result.status, 'setupRequired'); assert.match(result.message, /git|ENOENT/i); await assert.rejects(pullProjectRepository(f.root, f.remote, f.local), /Setup required.*Git/); }
  finally { process.env.PATH = previous; }
});
