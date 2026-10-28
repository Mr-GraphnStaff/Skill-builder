const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../package.json');
test('public prerelease uses the existing Marketplace identity and public entry point', () => {
  assert.equal(manifest.publisher, 'DavidFarris');
  assert.equal(manifest.name, 'skill-builder');
  assert.equal(manifest.version, '0.11.4');
  assert.equal(manifest.displayName, 'SkillJetty — Agent Skills Studio');
  assert.deepEqual(manifest.contributes.commands.map(item => item.command), ['skillBuilder.openWorkbench']);
  assert.match(manifest.homepage, /Mr-GraphnStaff\/Skill-builder/);
  const declared = new Set(manifest.contributes.commands.map(item => item.command));
  for (const item of Object.values(manifest.contributes.menus).flat()) assert(declared.has(item.command));
});
