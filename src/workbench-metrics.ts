import { performance } from 'node:perf_hooks';
import { AsyncLocalStorage } from 'node:async_hooks';

export const METRIC_STAGES = ['archiveRead', 'archiveValidation', 'archiveDecode', 'extractWrite', 'extractedReadback', 'originalPreservation', 'catalogWrite', 'editorPreview', 'workerStartup', 'workerExecution', 'workerTeardown', 'pickerWait', 'operationTotal', 'editorPreparation', 'webviewRender', 'gitLocal', 'gitRemote', 'authentication', 'githubRequest', 'githubCli', 'skillValidation', 'libraryScan', 'releaseVerification', 'changeComparison', 'releasePreparation'] as const;
export type MetricStage = typeof METRIC_STAGES[number];
export type WorkbenchMetric = { stage: MetricStage; durationMs: number; fileCount?: number; byteCount?: number; outcome?: 'ok' | 'error'; operation?: string; jobKind?: string; statusCode?: number; exitCode?: number; timedOut?: boolean };
export type WorkbenchMetricSink = (metric: WorkbenchMetric) => void;
const context = new AsyncLocalStorage<WorkbenchMetricSink>();
export function withWorkbenchMetrics<T>(sink: WorkbenchMetricSink, perform: () => T): T { return context.run(sink, perform); }
export function currentWorkbenchMetrics(): WorkbenchMetricSink | undefined { return context.getStore(); }
const operations = new Set(['config', 'rev-parse', 'remote', 'branch', 'status', 'for-each-ref', 'ls-remote', 'check-ref-format', 'fetch', 'pull', 'push', 'clone', 'checkout', 'add', 'commit', 'diff', 'show', 'other', 'session', 'switchSession', 'account', 'repository', 'pullRequests', 'reviews', 'collaborators', 'references', 'repositoryList', 'repositoryCreate', 'repositoryView']);
const jobs = new Set(['library', 'reviews', 'validate', 'openPackage', 'importPackage', 'registerFolder', 'prepareRelease', 'restoreRelease', 'verifyRelease', 'snapshot']);
const stages = new Set<string>(METRIC_STAGES);
/** Strictly select public aggregate fields. No imported string or extra property reaches a sink. */
export function emitWorkbenchMetric(sink: WorkbenchMetricSink | undefined, metric: WorkbenchMetric): void {
  if (!sink || !metric || typeof metric !== 'object') return;
  try {
    if (typeof metric.stage !== 'string' || !stages.has(metric.stage) || !Number.isFinite(metric.durationMs) || metric.durationMs < 0 || metric.durationMs > 86_400_000) return;
    const safe: WorkbenchMetric = { stage: metric.stage, durationMs: metric.durationMs };
    for (const key of ['fileCount', 'byteCount'] as const) {
      if (metric[key] !== undefined) { if (!Number.isSafeInteger(metric[key]) || metric[key]! < 0 || metric[key]! > 1_000_000_000_000) return; safe[key] = metric[key]; }
    }
    if (metric.outcome !== undefined) { if (metric.outcome !== 'ok' && metric.outcome !== 'error') return; safe.outcome = metric.outcome; }
    if (metric.operation !== undefined && operations.has(metric.operation)) safe.operation = metric.operation;
    if (metric.jobKind !== undefined && jobs.has(metric.jobKind)) safe.jobKind = metric.jobKind;
    if (Number.isInteger(metric.statusCode) && metric.statusCode! >= 100 && metric.statusCode! <= 599) safe.statusCode = metric.statusCode;
    if (Number.isInteger(metric.exitCode) && metric.exitCode! >= 0 && metric.exitCode! <= 255) safe.exitCode = metric.exitCode;
    if (typeof metric.timedOut === 'boolean') safe.timedOut = metric.timedOut;
    sink(safe);
  } catch { /* Diagnostics never change operation or rollback behavior. */ }
}
export function measureWorkbenchPhase<T>(stage: MetricStage, sink: WorkbenchMetricSink | undefined, perform: () => T, counts: { fileCount?: number; byteCount?: number } = {}): T {
  const started = performance.now(); let outcome: 'ok' | 'error' = 'error';
  try { const result = perform(); outcome = 'ok'; return result; }
  finally { emitWorkbenchMetric(sink, { stage, durationMs: performance.now() - started, ...counts, outcome }); }
}
