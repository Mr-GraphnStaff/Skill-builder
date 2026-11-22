const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../package.json');
test('public prerelease uses the existing Marketplace identity and public entry point', () => {
  assert.equal(manifest.publisher, 'DavidFarris');
  assert.equal(manifest.name, 'skill-builder');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  const lock = require('../package-lock.json');
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[''].version, manifest.version);
  assert.equal(manifest.scripts['package:pre-release'], 'node scripts/package-prerelease.cjs');
  assert.equal(manifest.displayName, 'SkillJetty — Agent Skills Studio');
  assert.deepEqual(manifest.contributes.commands.map(item => item.command), [
    'skillBuilder.openWorkbench',
    'skillBuilder.configureRepository',
    'skillBuilder.openPluginFolder',
    'skillBuilder.showPerformanceLog',
    'skillBuilder.openSettings',
    'skillBuilder.connectGitHub',
    'skillBuilder.verifyRepository',
    'skillBuilder.pullRepository',
    'skillBuilder.openRepositorySkill',
    'skillBuilder.createRepository',
    'skillBuilder.createWorkbench',
    'skillBuilder.openWorkbenchFolder'
  ]);
  assert.match(manifest.homepage, /Mr-GraphnStaff\/Skill-builder/);
  const declared = new Set(manifest.contributes.commands.map(item => item.command));
  for (const item of Object.values(manifest.contributes.menus).flat()) assert(declared.has(item.command));
});

test('local packaging derives its versioned pre-release filename and propagates failure', () => {
  const path = require('node:path');
  const childProcess = require('node:child_process');
  const script = require.resolve('../scripts/package-prerelease.cjs');
  const originalSpawn = childProcess.spawnSync, originalVersion = manifest.version, originalExitCode = process.exitCode;
  try {
    for (const version of [originalVersion, '99.42.1']) {
      manifest.version = version;
      let invocation;
      childProcess.spawnSync = (command, args, options) => { invocation = { command, args, options }; return { status: 17 }; };
      delete require.cache[script];
      require(script);
      assert.equal(invocation.command, process.execPath);
      assert.deepEqual(invocation.args.slice(1), ['package', '--pre-release', '--out', path.join('dist', `${manifest.name}-${version}.vsix`)]);
      assert.equal(invocation.options.shell, false);
      assert.equal(process.exitCode, 17);
    }
  } finally {
    childProcess.spawnSync = originalSpawn; manifest.version = originalVersion; process.exitCode = originalExitCode;
    delete require.cache[script];
  }
});
