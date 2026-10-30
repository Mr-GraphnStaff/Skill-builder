import { parentPort, workerData } from 'node:worker_threads';
import { openSkillPackage, importSkillPackage, registerSkillFolder, validateWorkbenchSkill, prepareSkillRelease, verifySkillRelease } from './skill-workbench.js';
import { listLibraryReleases, summarizeFileChanges, restoreLibraryRelease } from './workbench-library.js';
import { connectedReviewReleases } from './guided-workspace.js';
import type { WorkbenchJob, WorkbenchSnapshot } from './workbench-jobs.js';
import { emitWorkbenchMetric, type WorkbenchMetric } from './workbench-metrics.js';

const onMetric = (metric: WorkbenchMetric) => emitWorkbenchMetric(value => parentPort?.postMessage({ type: 'metric', metric: value }), metric);

function perform(job: WorkbenchJob): unknown {
  if (!job || typeof job !== 'object') throw new Error('Choose a supported local operation.');
  switch (job.kind) {
    case 'library': return listLibraryReleases(job.root, job.skillName);
    case 'reviews': return connectedReviewReleases(job.root);
    case 'validate': return validateWorkbenchSkill(job.skill);
    case 'openPackage': return openSkillPackage(job.file, job.root, job.replaceExisting, onMetric);
    case 'importPackage': return importSkillPackage(job.file, job.root, job.replaceExisting);
    case 'registerFolder': return registerSkillFolder(job.root, job.folder, job.replaceExisting);
    case 'prepareRelease': return prepareSkillRelease(job.root, job.id, job.version, job.changelog, job.replaceExisting);
    case 'restoreRelease': return restoreLibraryRelease(job.root, job.directory);
    case 'verifyRelease': return verifySkillRelease(job.directory);
    case 'snapshot': {
      const validation = validateWorkbenchSkill(job.skill);
      if (!validation.valid) throw new Error(validation.errors.join('\n'));
      const releases = listLibraryReleases(job.root, job.skill.name);
      const baseline = releases[0];
      const prior = baseline ? verifySkillRelease(baseline.directory).manifest.files : undefined;
      const summary = summarizeFileChanges(validation.files, baseline && prior ? { version: baseline.version, files: prior } : undefined);
      return { validation, releases, summary } satisfies WorkbenchSnapshot;
    }
    default: throw new Error('Choose a supported local operation.');
  }
}

if (parentPort) {
  parentPort.postMessage({ type: 'ready' });
  try { parentPort.postMessage({ type: 'result', ok: true, result: perform(workerData) }); }
  catch (error) { parentPort.postMessage({ type: 'result', ok: false, error: (error instanceof Error ? error.message : String(error)).slice(0, 1800) }); }
}
