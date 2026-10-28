// Compare only an explicitly marked synthetic fixture, never user skill data.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
async function main() {
  const [moduleRoot, fixture] = process.argv.slice(2);
  if (!moduleRoot || !fixture) throw new Error('Supply compiled module directory and synthetic fixture.');
  const marker = JSON.parse(fs.readFileSync(path.join(fixture, '.skilljetty-benchmark.json'), 'utf8'));
  if (marker.format !== 1 || typeof marker.skillId !== 'string') throw new Error('Not a benchmark fixture.');
  const { GuidedWorkbenchController } = require(path.resolve(moduleRoot, 'guided-controller.js'));
  const controller = new GuidedWorkbenchController(fixture);
  const before = process.memoryUsage(); const start = performance.now();
  await controller.dispatch({ action: 'ready' });
  const after = process.memoryUsage();
  if (controller.state.error) throw new Error(controller.state.error);
  console.log(JSON.stringify({ elapsedMs: +(performance.now() - start).toFixed(2),
    hostHeapDeltaBytes: after.heapUsed - before.heapUsed, hostExternalDeltaBytes: after.external - before.external,
    drafts: controller.state.drafts.length, releases: controller.state.library.length,
    files: marker.files, savedReleases: marker.releases,
    note: 'Synthetic controller startup in a fresh Node process. End-of-operation host memory delta is not peak memory or whole VS Code usage.' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
