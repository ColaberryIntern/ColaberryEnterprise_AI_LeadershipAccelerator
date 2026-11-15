/**
 * serviceGapBatch - "Analyze unlinked case studies": the whole current intake, bounded, resumable, observable.
 *
 *   - ONE running run per tenant: the partial unique index on service_gap_runs decides (a second start gets the
 *     running run back, which the route turns into a 409). A run left `running` by a restarted process for more than
 *     ABANDON_AFTER_MS is marked failed first, so a crash cannot lock the button forever.
 *   - Bounded: at most MAX_BATCH case studies, CONCURRENCY model calls at a time.
 *   - Resumable and idempotent: each item goes through `analyzeCaseStudy`, which reuses any stored result for the same
 *     fingerprints. Re-running after a partial failure only pays for what is missing or failed.
 *   - Partial failure is normal: one failed item is counted and the run continues. Counters are atomic increments.
 * Nothing here links, creates or changes a service.
 */
import { sequelize } from '../../../config/database';
import { listIntakeCaseStudies } from '../../caseStudy/caseStudyIntakeQueue';
import { analyzeCaseStudy, type Assess } from './serviceGapAnalysis';
import { loadCatalog, loadEvidence } from './serviceGapLoader';

export const MAX_BATCH = 200;
export const CONCURRENCY = 3;
export const ABANDON_AFTER_MS = 30 * 60 * 1000;

export interface GapRunView {
  id: string; status: 'running' | 'completed' | 'failed'; total: number; analyzed: number; reused: number; failed: number;
  lastError: string | null; startedBy: string | null; startedAt: string; finishedAt: string | null;
}

interface RunRow { id: string; status: GapRunView['status']; total: number; analyzed: number; reused: number; failed: number; last_error: string | null; started_by: string | null; started_at: Date | string; finished_at: Date | string | null }
const toRunView = (r: RunRow): GapRunView => ({
  id: r.id, status: r.status, total: r.total, analyzed: r.analyzed, reused: r.reused, failed: r.failed, lastError: r.last_error,
  startedBy: r.started_by, startedAt: new Date(r.started_at).toISOString(), finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
});

export async function latestRun(tenantId: string): Promise<GapRunView | null> {
  const { default: Run } = await import('../../../models/ServiceGapRun');
  const row = await Run.findOne({ where: { tenant_id: tenantId }, order: [['started_at', 'DESC']] });
  return row ? toRunView(row.get({ plain: true }) as unknown as RunRow) : null;
}

const bump = (id: string, col: 'analyzed' | 'reused' | 'failed'): Promise<unknown> =>
  sequelize.query(`UPDATE service_gap_runs SET ${col} = ${col} + 1 WHERE id = :id`, { replacements: { id } });

function logRun(event: string, outcome: string, context: Record<string, unknown>): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'error' : 'info', service: 'backend', event, outcome, context }));
}

/** Start a run, or return the one already running (`started: false`). Does not process; see `processRun`. */
export async function startRun(tenantId: string, actor: string): Promise<{ run: GapRunView; started: boolean; caseStudyIds: string[] }> {
  await sequelize.query(
    `UPDATE service_gap_runs SET status = 'failed', last_error = 'abandoned (process restarted mid-run)', finished_at = now()
      WHERE tenant_id = :tenantId AND status = 'running' AND started_at < now() - (:ms || ' milliseconds')::interval`,
    { replacements: { tenantId, ms: String(ABANDON_AFTER_MS) } },
  );
  const intake = await listIntakeCaseStudies({ tenantId });
  const caseStudyIds = intake.slice(0, MAX_BATCH).map((i) => i.id);
  const [rows] = await sequelize.query(
    `INSERT INTO service_gap_runs (tenant_id, status, total, started_by) VALUES (:tenantId, 'running', :total, :actor)
     ON CONFLICT (tenant_id) WHERE status = 'running' DO NOTHING RETURNING *`,
    { replacements: { tenantId, total: caseStudyIds.length, actor } },
  );
  const created = (rows as RunRow[])[0];
  if (created) return { run: toRunView(created), started: true, caseStudyIds };
  const running = await latestRun(tenantId);
  if (!running) throw new Error('service gap run neither created nor found');
  return { run: running, started: false, caseStudyIds: [] };
}

/** Process a started run. Never throws: a fatal error marks the run failed. */
export async function processRun(input: { runId: string; tenantId: string; caseStudyIds: string[]; actor: string; assess?: Assess; concurrency?: number }): Promise<void> {
  const t0 = Date.now();
  try {
    const catalog = await loadCatalog(input.tenantId);
    const evidence = await loadEvidence(input.caseStudyIds);
    const queue = input.caseStudyIds.filter((id) => evidence.has(id));
    if (queue.length !== input.caseStudyIds.length) {
      await sequelize.query('UPDATE service_gap_runs SET total = :n WHERE id = :id', { replacements: { n: queue.length, id: input.runId } });
    }
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < queue.length) {
        const id = queue[next]; next += 1;
        try {
          const { view, reused } = await analyzeCaseStudy({ tenantId: input.tenantId, evidence: evidence.get(id)!, catalog, actor: input.actor, assess: input.assess });
          await bump(input.runId, view.status === 'failed' ? 'failed' : reused ? 'reused' : 'analyzed');
        } catch (err) {
          await bump(input.runId, 'failed');
          logRun('service_gap_batch_item_failed', 'failure', { run_id: input.runId, case_study_id: id, error_class: (err as Error)?.name, message: String((err as Error)?.message ?? err).slice(0, 200) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(input.concurrency ?? CONCURRENCY, 5)) }, worker));
    await sequelize.query(`UPDATE service_gap_runs SET status = 'completed', finished_at = now() WHERE id = :id`, { replacements: { id: input.runId } });
    logRun('service_gap_batch_completed', 'success', { run_id: input.runId, items: queue.length, duration_ms: Date.now() - t0 });
  } catch (err) {
    const message = String((err as Error)?.message ?? err).slice(0, 300);
    await sequelize.query(`UPDATE service_gap_runs SET status = 'failed', last_error = :message, finished_at = now() WHERE id = :id`, { replacements: { id: input.runId, message } })
      .catch((e: unknown) => logRun('service_gap_batch_finalize_failed', 'failure', { run_id: input.runId, message: String((e as Error)?.message ?? e).slice(0, 200) }));
    logRun('service_gap_batch_failed', 'failure', { run_id: input.runId, error_class: (err as Error)?.name, message, duration_ms: Date.now() - t0 });
  }
}
