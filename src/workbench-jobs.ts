import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { WorkbenchSkill, ValidationReport, WorkbenchRelease } from './skill-workbench.js';
import type { LibraryRelease, SkillChangeSummary } from './workbench-library.js';
import type { connectedReviewReleases } from './guided-workspace.js';

export type WorkbenchJob =
  | { kind: 'library'; root: string; skillName?: string }
  | { kind: 'reviews'; root: string }
  | { kind: 'validate'; skill: WorkbenchSkill }
  | { kind: 'importPackage'; root: string; file: string }
  | { kind: 'registerFolder'; root: string; folder: string }
  | { kind: 'prepareRelease'; root: string; id: string; version: string; changelog: string }
  | { kind: 'restoreRelease'; root: string; directory: string }
  | { kind: 'verifyRelease'; directory: string }
  | { kind: 'snapshot'; root: string; skill: WorkbenchSkill };

export type WorkbenchSnapshot = { validation: ValidationReport; releases: LibraryRelease[]; summary: SkillChangeSummary };
export type WorkbenchJobResult<J extends WorkbenchJob> =
  J extends { kind: 'library' } ? LibraryRelease[] :
  J extends { kind: 'reviews' } ? ReturnType<typeof connectedReviewReleases> :
  J extends { kind: 'validate' } ? ValidationReport :
  J extends { kind: 'prepareRelease' | 'verifyRelease' } ? WorkbenchRelease :
  J extends { kind: 'snapshot' } ? WorkbenchSnapshot : WorkbenchSkill;

const WRITING_JOBS = new Set(['importPackage', 'registerFolder', 'prepareRelease', 'restoreRelease']);
const DEFAULT_TIMEOUT = 120_000;

/** Execute only our installed, fixed job module. A skill never selects code to run.
 * The controller serializes state transitions, including calls to this function. */
export function runWorkbenchJob<J extends WorkbenchJob>(job: J, options: { timeoutMs?: number } = {}): Promise<WorkbenchJobResult<J>> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > DEFAULT_TIMEOUT) return Promise.reject(new Error('Invalid local operation timeout.'));
  return new Promise((resolve, reject) => {
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
      // Await teardown before resolving, so the next queued write cannot race
      // a terminated job. Atomic staging/guard checks remain in core functions.
      worker.terminate().then(() => {
        if (error) reject(error);
        else resolve(result as WorkbenchJobResult<J>);
      }, failure => reject(error ?? failure));
    };
    const timer = setTimeout(() => {
      const uncertain = WRITING_JOBS.has(job.kind)
        ? ' The local write may already have completed. Inspect the saved drafts or releases before trying again; nothing was retried automatically.'
        : ' No upload was attempted. Your existing draft is retained.';
      finish(new Error(`The local operation did not finish within ${Math.ceil(timeout / 1000)} seconds.${uncertain}`));
    }, timeout);
    worker.once('message', (message: unknown) => {
      const reply = message as { ok?: boolean; result?: unknown; error?: unknown };
      if (reply?.ok === true) finish(undefined, reply.result);
      else finish(new Error(typeof reply?.error === 'string' ? reply.error : 'The local operation could not be completed.'));
    });
    worker.once('error', error => finish(new Error(`${error.message}${WRITING_JOBS.has(job.kind) ? ' Inspect saved drafts and releases before retrying; the local write may already have completed.' : ''}`)));
    worker.once('exit', code => {
      if (!settled) finish(new Error(`The local operation stopped unexpectedly (worker exit ${code}).${WRITING_JOBS.has(job.kind) ? ' Inspect saved drafts and releases before retrying; a local write may have completed.' : ''}`));
    });
  });
}
