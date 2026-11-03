const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const AdmZip = require('adm-zip');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');
const { resolveExistingRepositoryWorkspace } = require('../out/workspace-selection.js');
const core = require('../out/skill-workbench.js');
const publisher = require('../out/repository-publisher.js');
const scratch = require('./working-fixture.cjs').workingFixture('local-repository-source');
fs.mkdirSync(scratch, { recursive: true });

test('repository source picker is local-only and aborts changed settings before copying', async t => {
  for (const change of ['none', 'validation', 'picker']) await t.test(change, async t => {
    const root = fs.mkdtempSync(path.join(scratch, 'case-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const remote = 'https://github.com/example/skills', dataRoot = path.join(root, '.skilljetty-prerelease');
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
    Object.assign(env, { GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
    const git = (...args) => cp.execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, env, windowsHide: true, stdio: 'pipe' });
    git('init', '-b', 'main'); git('remote', 'add', 'origin', `${remote}.git`);
    const source = path.join(root, 'source-notes'); fs.mkdirSync(source);
    const bytes = Buffer.from('---\nname: source-notes\ndescription: Summarize local notes when requested.\n---\n# Notes\nKeep the source bytes.\n');
    fs.writeFileSync(path.join(source, 'SKILL.md'), bytes);
    fs.mkdirSync(path.join(dataRoot, '.skill-workbench'), { recursive: true });
    const connectionPath = path.join(dataRoot, '.skill-workbench/connection.json');
    fs.writeFileSync(connectionPath, JSON.stringify({ format: 1, repository: remote, baseBranch: 'main', localPath: root }));
    const connectionBytes = fs.readFileSync(connectionPath), gitConfig = fs.readFileSync(path.join(root, '.git/config'));
    const selection = await resolveExistingRepositoryWorkspace(root);
    let settings = { repositoryUrl: remote, localRepositoryPath: root }, pickerCalls = 0, githubCalls = 0, remoteCalls = 0, armed = false;
    const original = publisher.repositoryGit;
    publisher.repositoryGit = async (cwd, args, ...rest) => {
      if (args.some(arg => ['ls-remote', 'fetch', 'push', 'clone'].includes(arg))) { remoteCalls++; throw new Error('Remote Git is forbidden in local opening.'); }
      const result = await original(cwd, args, ...rest);
      if (armed && change === 'validation' && args.includes('remote') && args.includes('get-url')) {
        armed = false; settings = { ...settings, repositoryUrl: 'https://github.com/example/changed' };
      }
      return result;
    };
    t.after(() => { publisher.repositoryGit = original; });
    const controller = new GuidedWorkbenchController(dataRoot, {
      workspaceSelection: selection, enforceWorkbench: false, getRepositorySettings: () => settings,
      github: async () => { githubCalls++; throw new Error('GitHub is forbidden in local opening.'); },
      pickFolder: async initial => {
        pickerCalls++; assert.equal(path.resolve(initial), path.resolve(root));
        if (change === 'picker') settings = { ...settings, localRepositoryPath: path.join(root, 'another') };
        return source;
      }
    });
    await controller.dispatch({ action: 'showPlugin' });
    armed = true;
    await controller.dispatch({ action: 'openRepositorySkill' });
    if (change !== 'none') {
      assert.match(controller.state.error, /Correct the repository settings|configuration changed/i);
      assert.equal(pickerCalls, change === 'validation' ? 0 : 1);
      assert.equal(core.listWorkbenchSkills(dataRoot).length, 0);
      assert.equal(fs.existsSync(path.join(dataRoot, 'skills/source-notes')), false);
    } else {
      assert.equal(controller.state.error, undefined); assert.equal(pickerCalls, 1);
      assert.equal(controller.state.workflowIntent, 'plugin');
      await controller.dispatch({ action: 'preparePublish' }); assert.equal(controller.state.error, undefined);
      await controller.dispatch({ action: 'savePackage', payload: {} }); assert.equal(controller.state.error, undefined);
      const artifact = controller.state.receipt.artifacts.find(item => item.kind === 'plugin');
      assert(artifact); const zip = new AdmZip(artifact.path);
      assert(zip.getEntry('skills/source-notes/SKILL.md').getData().equals(bytes));
    }
    assert.equal(remoteCalls, 0); assert.equal(githubCalls, 0);
    assert(fs.readFileSync(connectionPath).equals(connectionBytes));
    assert(fs.readFileSync(path.join(root, '.git/config')).equals(gitConfig));
    assert(fs.readFileSync(path.join(source, 'SKILL.md')).equals(bytes));
  });
});
