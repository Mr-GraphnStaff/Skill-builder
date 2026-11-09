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
  assert.equal(manifest.scripts['package:pre-release'], `vsce package --pre-release --out dist/skill-builder-${manifest.version}.vsix`);
  assert.equal(manifest.displayName, 'SkillJetty — Agent Skills Studio');
  assert.deepEqual(manifest.contributes.commands.map(item => item.command), ['skillBuilder.openWorkbench', 'skillBuilder.configureRepository', 'skillBuilder.showPerformanceLog', 'skillBuilder.openSettings', 'skillBuilder.connectGitHub', 'skillBuilder.verifyRepository', 'skillBuilder.pullRepository', 'skillBuilder.openRepositorySkill', 'skillBuilder.createRepository', 'skillBuilder.createWorkbench', 'skillBuilder.openWorkbenchFolder']);
  assert.match(manifest.homepage, /Mr-GraphnStaff\/Skill-builder/);
  const declared = new Set(manifest.contributes.commands.map(item => item.command));
  for (const item of Object.values(manifest.contributes.menus).flat()) assert(declared.has(item.command));
});
