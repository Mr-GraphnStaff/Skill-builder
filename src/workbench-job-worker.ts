import { parentPort, workerData } from 'node:worker_threads';
import { requireWorkbench } from './workbench-setup.js';
import { assertWorkbenchPath } from './workbench-boundary.js';
import { openSkillPackage, importSkillPackage, registerSkillFolder, validateWorkbenchSkill, prepareSkillRelease, verifySkillRelease } from './skill-workbench.js';
import { listLibraryReleases, summarizeFileChanges, restoreLibraryRelease } from './workbench-library.js';
import { connectedReviewReleases } from './guided-workspace.js';
import type { WorkbenchJob, WorkbenchSnapshot } from './workbench-jobs.js';
import { emitWorkbenchMetric, measureWorkbenchPhase, type WorkbenchMetric } from './workbench-metrics.js';
import { preparePluginRelease, prepareGeminiRelease, verifyExportRelease, assessPluginDirectoryReadiness } from './plugin-release.js';
import { previewReleaseArchive, archiveReviewedReleases, restoreReleaseArchive, listReleaseArchives } from './release-archive.js';

const onMetric = (metric: WorkbenchMetric) => emitWorkbenchMetric(value => parentPort?.postMessage({ type: 'metric', metric: value }), metric);

function perform(job: WorkbenchJob): unknown {
  if (!job || typeof job !== 'object') throw new Error('Choose a supported local operation.');
  if (workerData.boundaryRoot) {
    const root = requireWorkbench(workerData.boundaryRoot);
    if ('root' in job) assertWorkbenchPath(root, job.root);
    if ('skill' in job) assertWorkbenchPath(root, job.skill.sourcePath);
    if ('directory' in job) assertWorkbenchPath(root, job.directory);
  }
  switch (job.kind) {
    case 'previewArchive': return previewReleaseArchive(job.root);
    case 'archiveReleases': return archiveReviewedReleases(job.root, job.plan);
    case 'restoreArchive': return restoreReleaseArchive(job.root, job.id);
    case 'listArchives': return listReleaseArchives(job.root);
    case 'preparePlugin': return preparePluginRelease(job.root, job.options);
    case 'prepareGemini': return prepareGeminiRelease(job.root, job.directory);
    case 'verifyExport': return verifyExportRelease(job.directory);
    case 'pluginReadiness': return assessPluginDirectoryReadiness(job.directory);
    case 'library': return measureWorkbenchPhase('libraryScan', onMetric, () => listLibraryReleases(job.root, job.skillName, { verifyPayload: false }));
    case 'reviews': return connectedReviewReleases(job.root);
    case 'validate': return measureWorkbenchPhase('skillValidation', onMetric, () => validateWorkbenchSkill(job.skill));
    case 'openPackage': return openSkillPackage(job.file, job.root, job.replaceExisting, onMetric);
    case 'importPackage': return importSkillPackage(job.file, job.root, job.replaceExisting);
    case 'registerFolder': return registerSkillFolder(job.root, job.folder, job.replaceExisting);
    case 'prepareRelease': return measureWorkbenchPhase('releasePreparation', onMetric, () => prepareSkillRelease(job.root, job.id, job.version, job.changelog, job.replaceExisting));
    case 'restoreRelease': return restoreLibraryRelease(job.root, job.directory);
    case 'verifyRelease': return measureWorkbenchPhase('releaseVerification', onMetric, () => verifySkillRelease(job.directory));
    case 'snapshot': {
      const validation = measureWorkbenchPhase('skillValidation', onMetric, () => validateWorkbenchSkill(job.skill));
      if (!validation.valid) throw new Error(validation.errors.join('\n'));
      const releases = measureWorkbenchPhase('libraryScan', onMetric, () => listLibraryReleases(job.root, job.skill.name, { verifyPayload: false }));
      const baseline = releases[0];
      const prior = baseline ? measureWorkbenchPhase('releaseVerification', onMetric, () => verifySkillRelease(baseline.directory).manifest.files) : undefined;
      const summary = measureWorkbenchPhase('changeComparison', onMetric, () => summarizeFileChanges(validation.files, baseline && prior ? { version: baseline.version, files: prior } : undefined));
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
