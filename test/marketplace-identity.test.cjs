const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../package.json');
test('local UAT has a distinct identity and public entry point without replacing production', () => {
  assert.equal(manifest.publisher, 'DavidFarris');
  assert.equal(manifest.name, 'skill-builder-beta');
  assert.equal(manifest.displayName, 'SkillJetty Beta — UAT');
  assert.deepEqual(manifest.contributes.commands.map(item => item.command), ['skillJettyBeta.openWorkbench']);
  assert.match(manifest.homepage, /Mr-GraphnStaff\/Skill-builder/);
  const declared = new Set(manifest.contributes.commands.map(item => item.command));
  for (const item of Object.values(manifest.contributes.menus).flat()) assert(declared.has(item.command));
});
