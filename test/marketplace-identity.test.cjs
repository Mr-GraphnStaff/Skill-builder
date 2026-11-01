const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../package.json');
test('production uses the existing Marketplace identity and diagnostic Command Palette entry', () => {
  assert.equal(manifest.publisher, 'DavidFarris');
  assert.equal(manifest.name, 'skill-builder');
  assert.equal(manifest.version, '0.12.2');
  assert.equal(manifest.displayName, 'SkillJetty — Agent Skills Studio');
  assert.deepEqual(manifest.contributes.commands.map(item => item.command), ['skillBuilder.openWorkbench', 'skillBuilder.showPerformanceLog']);
  assert.equal(manifest.contributes.commands.find(item => item.command === 'skillBuilder.showPerformanceLog').title, 'SkillJetty: Show Performance Log');
  assert.deepEqual(manifest.activationEvents, ['workspaceContains:skills/*/SKILL.md']);
  assert.match(manifest.homepage, /Mr-GraphnStaff\/Skill-builder/);
  const declared = new Set(manifest.contributes.commands.map(item => item.command));
  for (const item of Object.values(manifest.contributes.menus).flat()) assert(declared.has(item.command));
});
