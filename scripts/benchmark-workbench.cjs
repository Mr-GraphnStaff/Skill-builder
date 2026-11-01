#!/usr/bin/env node
// Synthetic-only benchmark. Never points at production/user workbench data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const wb = require('../out/skill-workbench.js');
const library = require('../out/workbench-library.js');
const { GuidedWorkbenchController } = require('../out/guided-controller.js');

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
}
function count(name, fallback, maximum) {
  const value = Number(argument(name, fallback));
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`Invalid --${name}.`);
  return value;
}
const files = count('files', 189, 1000), releases = count('releases', 20, 100), samples = count('samples', 3, 20);
const fixtureArgument = argument('fixture');
const owned = !fixtureArgument;
const root = owned ? fs.mkdtempSync(path.join(os.tmpdir(), 'skilljetty-benchmark-')) : path.resolve(fixtureArgument);
const marker = path.join(root, '.skilljetty-benchmark.json');
const counters = { verifyRelease: 0, validate: 0, listLibrary: 0 };
for (const [object, key, counter] of [[wb, 'verifySkillRelease', 'verifyRelease'], [wb, 'validateWorkbenchSkill', 'validate'], [library, 'listLibraryReleases', 'listLibrary']]) {
  const original = object[key];
  object[key] = (...args) => { counters[counter]++; return original(...args); };
}

async function main() {
  if (owned) {
    const input = path.join(root, 'input'); fs.mkdirSync(input);
    fs.mkdirSync(path.join(input, 'references'));
    const manifest = '---\nname: benchmark-notes\ndescription: Summarize supplied facts. Use when someone asks for a concise report.\nmetadata:\n  version: 1.0.0\n---\n\n# Notes\nKeep supplied facts and identify uncertainty.\n';
    fs.writeFileSync(path.join(input, 'SKILL.md'), manifest);
    for (let index = 1; index < files; index++) fs.writeFileSync(path.join(input, 'references', `rules-${index}.md`), `# Rule ${index}\n\nKeep supplied evidence. ${'Reference context for a local benchmark. '.repeat(100)}\n`);
    const skill = wb.registerSkillFolder(root, input);
    for (let index = 0; index < releases; index++) {
      fs.writeFileSync(path.join(skill.sourcePath, 'SKILL.md'), `${manifest}\nSaved revision ${index}.\n`);
      wb.prepareSkillRelease(root, skill.id, `1.0.${index}`, `Synthetic benchmark release ${index}.`);
    }
    fs.writeFileSync(marker, JSON.stringify({ format: 1, files, releases, skillId: skill.id }));
  }
  if (!fs.existsSync(marker)) throw new Error('Only a fixture created by this benchmark may be measured.');
  const spec = JSON.parse(fs.readFileSync(marker, 'utf8'));
  if (spec.format !== 1 || typeof spec.skillId !== 'string') throw new Error('Invalid benchmark fixture.');
  const controller = new GuidedWorkbenchController(root);
  await controller.dispatch({ action: 'resume', payload: { id: spec.skillId } });
  const operations = {};
  for (const action of (process.argv.includes('--edited-save') ? ['editedSave'] : ['save', 'check', 'preparePublish'])) {
    const values = [];
    for (let sample = 0; sample < samples; sample++) {
      for (const key of Object.keys(counters)) counters[key] = 0;
      let timerDelay;
      const start = performance.now();
      const timer = new Promise(resolve => setTimeout(() => { timerDelay = performance.now() - start; resolve(); }, 0));
      await controller.dispatch(action === 'editedSave'
        ? { action: 'save', editorSkillId: controller.state.active.id, editorPath: controller.state.editor.path,
          editorContent: controller.state.editor.content + `\nSynthetic saved edit ${sample}.\n` }
        : { action });
      const elapsedMs = performance.now() - start;
      if (controller.state.error) throw new Error(controller.state.error);
      await timer;
      values.push({ elapsedMs: Number(elapsedMs.toFixed(2)), timerDelayMs: Number(timerDelay.toFixed(2)), ...counters });
    }
    const medians = {};
    for (const key of Object.keys(values[0])) medians[key] = [...values.map(value => value[key])].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    operations[action] = { median: medians, samples: values };
  }
  const result = { label: argument('label', 'measurement'), runtime: process.version, platform: process.platform, fixture: root, files: spec.files, releases: spec.releases, samples, operations,
    note: `Synthetic warm-cache local filesystem measurement. ${process.argv.includes('--edited-save') ? 'Each editedSave writes changed text and preserves an earlier-edit record.' : 'Save is a no-op Save without an editor buffer, isolating orchestration overhead.'} Counts cover the main process only; worker-thread verification is not intercepted. Milliseconds and first timer delay are observed, not an end-user/native UI latency claim.` };
  const output = argument('output');
  if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
main().catch(error => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }).finally(() => {
  if (!owned || process.argv.includes('--keep')) return;
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('skilljetty-benchmark-')) throw new Error('Refusing unexpected cleanup path.');
  fs.rmSync(resolved, { recursive: true, force: true });
});
