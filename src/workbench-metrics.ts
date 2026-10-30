import { performance } from 'node:perf_hooks';

export const METRIC_STAGES = ['archiveRead', 'archiveValidation', 'archiveDecode', 'extractWrite', 'extractedReadback', 'originalPreservation', 'catalogWrite', 'editorPreview', 'workerStartup', 'workerExecution', 'workerTeardown', 'pickerWait', 'operationTotal', 'editorPreparation', 'webviewRender'] as const;
export type MetricStage = typeof METRIC_STAGES[number];
export type WorkbenchMetric = { stage: MetricStage; durationMs: number; fileCount?: number; byteCount?: number; outcome?: 'ok' | 'error' };
export type WorkbenchMetricSink = (metric: WorkbenchMetric) => void;
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
    sink(safe);
  } catch { /* Diagnostics never change operation or rollback behavior. */ }
}
export function measureWorkbenchPhase<T>(stage: MetricStage, sink: WorkbenchMetricSink | undefined, perform: () => T, counts: { fileCount?: number; byteCount?: number } = {}): T {
  const started = performance.now(); let outcome: 'ok' | 'error' = 'error';
  try { const result = perform(); outcome = 'ok'; return result; }
  finally { emitWorkbenchMetric(sink, { stage, durationMs: performance.now() - started, ...counts, outcome }); }
}
