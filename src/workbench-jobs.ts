import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { emitWorkbenchMetric, type WorkbenchMetric, type WorkbenchMetricSink } from './workbench-metrics.js';
import type { WorkbenchSkill, ValidationReport, WorkbenchRelease, OpenedSkillPackage } from './skill-workbench.js';
import type { LibraryRelease, SkillChangeSummary } from './workbench-library.js';
import type { connectedReviewReleases } from './guided-workspace.js';

export type WorkbenchJob =
  | { kind: 'library'; root: string; skillName?: string }
  | { kind: 'reviews'; root: string }
  | { kind: 'validate'; skill: WorkbenchSkill }
  | { kind: 'openPackage'; root: string; file: string; replaceExisting?: boolean }
  | { kind: 'importPackage'; root: string; file: string; replaceExisting?: boolean }
  | { kind: 'registerFolder'; root: string; folder: string; replaceExisting?: boolean }
  | { kind: 'prepareRelease'; root: string; id: string; version: string; changelog: string; replaceExisting?: boolean }
  | { kind: 'restoreRelease'; root: string; directory: string }
  | { kind: 'verifyRelease'; directory: string }
  | { kind: 'snapshot'; root: string; skill: WorkbenchSkill };

export type WorkbenchSnapshot = { validation: ValidationReport; releases: LibraryRelease[]; summary: SkillChangeSummary };
export type WorkbenchJobResult<J extends WorkbenchJob> =
  J extends { kind: 'openPackage' } ? OpenedSkillPackage :
  J extends { kind: 'library' } ? LibraryRelease[] :
  J extends { kind: 'reviews' } ? ReturnType<typeof connectedReviewReleases> :
  J extends { kind: 'validate' } ? ValidationReport :
  J extends { kind: 'prepareRelease' | 'verifyRelease' } ? WorkbenchRelease :
  J extends { kind: 'snapshot' } ? WorkbenchSnapshot : WorkbenchSkill;

const WRITING_JOBS = new Set(['openPackage', 'importPackage', 'registerFolder', 'prepareRelease', 'restoreRelease']);
const DEFAULT_TIMEOUT = 120_000;

/** Execute only our installed, fixed job module. A skill never selects code to run.
 * The controller serializes state transitions, including calls to this function. */
export function runWorkbenchJob<J extends WorkbenchJob>(job: J, options: { timeoutMs?: number; onMetric?: WorkbenchMetricSink } = {}): Promise<WorkbenchJobResult<J>> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > DEFAULT_TIMEOUT) return Promise.reject(new Error('Invalid local operation timeout.'));
  return new Promise((resolve, reject) => {
    const started = performance.now(); let readyAt: number | undefined;
    const worker = new Worker(path.join(__dirname, 'workbench-job-worker.js'), {
      workerData: job,
      resourceLimits: { maxOldGenerationSizeMb: 384, stackSizeMb: 4 },
      // Do not propagate parent execArgv startup-module hooks.
      execArgv: []
    });
    let settled = false;
    const finish = (error?: Error, result?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const finished = performance.now();
      emitWorkbenchMetric(options.onMetric, { stage: readyAt === undefined ? 'workerStartup' : 'workerExecution', durationMs: finished - (readyAt ?? started), outcome: error ? 'error' : 'ok' });
      // Await teardown before resolving, so the next queued write cannot race
      // a terminated job. Atomic staging/guard checks remain in core functions.
      worker.terminate().then(() => {
        emitWorkbenchMetric(options.onMetric, { stage: 'workerTeardown', durationMs: performance.now() - finished, outcome: 'ok' });
        if (error) reject(error);
        else resolve(result as WorkbenchJobResult<J>);
      }, failure => { emitWorkbenchMetric(options.onMetric, { stage: 'workerTeardown', durationMs: performance.now() - finished, outcome: 'error' }); reject(error ?? failure); });
    };
    const timer = setTimeout(() => {
      const uncertain = WRITING_JOBS.has(job.kind)
        ? ' The local write may already have completed. Inspect the saved drafts or releases before trying again; nothing was retried automatically.'
        : ' No upload was attempted. Your existing draft is retained.';
      finish(new Error(`The local operation did not finish within ${Math.ceil(timeout / 1000)} seconds.${uncertain}`));
    }, timeout);
    worker.on('message', (message: unknown) => {
      if (settled || !message || typeof message !== 'object') return;
      const reply = message as { type?: string; metric?: WorkbenchMetric; ok?: boolean; result?: unknown; error?: unknown };
      if (reply.type === 'metric') { if (reply.metric) emitWorkbenchMetric(options.onMetric, reply.metric); return; }
      if (reply.type === 'ready') {
        if (readyAt === undefined) { readyAt = performance.now(); emitWorkbenchMetric(options.onMetric, { stage: 'workerStartup', durationMs: readyAt - started, outcome: 'ok' }); }
        return;
      }
      if (reply.type !== 'result') return;
      if (reply.ok === true) finish(undefined, reply.result);
      else if (reply.ok === false) finish(new Error(typeof reply.error === 'string' ? reply.error : 'The local operation could not be completed.'));
    });
    worker.once('error', error => finish(new Error(`${error.message}${WRITING_JOBS.has(job.kind) ? ' Inspect saved drafts and releases before retrying; the local write may already have completed.' : ''}`)));
    worker.once('exit', code => {
      if (!settled) finish(new Error(`The local operation stopped unexpectedly (worker exit ${code}).${WRITING_JOBS.has(job.kind) ? ' Inspect saved drafts and releases before retrying; a local write may have completed.' : ''}`));
    });
  });
}
