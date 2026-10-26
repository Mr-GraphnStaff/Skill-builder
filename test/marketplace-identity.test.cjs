const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../package.json');
test('branding updates retain the published Marketplace identity and single public entry point', () => {
  assert.equal(manifest.publisher, 'DavidFarris');
  assert.equal(manifest.name, 'skill-builder');
  assert.deepEqual(manifest.contributes.commands.map(item => item.command), ['skillBuilder.openWorkbench']);
  assert.match(manifest.homepage, /Mr-GraphnStaff\/Skill-builder/);
  const declared = new Set(manifest.contributes.commands.map(item => item.command));
  for (const item of Object.values(manifest.contributes.menus).flat()) assert(declared.has(item.command));
});
