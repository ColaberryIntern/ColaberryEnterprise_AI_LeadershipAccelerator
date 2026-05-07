/**
 * awarenessRetentionManager — extends the Phase 4 snapshot retention pattern
 * to all the new-table growth from Phases 5–8.
 *
 * Tables managed (best-effort; missing tables are skipped):
 *   - cognition_events
 *   - cognitive_incidents (resolved/expired only)
 *   - dom_snapshots
 *   - behavioral_events
 *   - queue_history_entries
 *   - build_sessions (rejected/abandoned > 30d)
 *
 * Idempotent. Each sweep returns counts so callers can report.
 */
import { Op } from 'sequelize';

export interface RetentionPolicy {
  readonly cognition_events_keep_days: number;
  readonly behavioral_events_keep_days: number;
  readonly dom_snapshots_keep_days: number;
  readonly queue_history_keep_days: number;
  readonly resolved_incidents_keep_days: number;
  readonly rejected_build_sessions_keep_days: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  cognition_events_keep_days: 30,
  behavioral_events_keep_days: 14,
  dom_snapshots_keep_days: 60,
  queue_history_keep_days: 60,
  resolved_incidents_keep_days: 90,
  rejected_build_sessions_keep_days: 30,
};

export interface RetentionSweepResult {
  readonly started_at: string;
  readonly elapsed_ms: number;
  readonly per_table: Record<string, { deleted: number; skipped_reason?: string }>;
  readonly total_deleted: number;
}

export async function sweepAwareness(policy: RetentionPolicy = DEFAULT_RETENTION): Promise<RetentionSweepResult> {
  const t0 = Date.now();
  const started_at = new Date().toISOString();
  const per_table: Record<string, { deleted: number; skipped_reason?: string }> = {};
  let total = 0;

  const tasks: Array<[string, () => Promise<number>]> = [
    ['cognition_events', () => sweepByDate('CognitionEvent', 'emitted_at', policy.cognition_events_keep_days)],
    ['behavioral_events', () => sweepByDate('BehavioralEvent', 'observed_at', policy.behavioral_events_keep_days)],
    ['dom_snapshots', () => sweepByDate('DOMSnapshot', 'captured_at', policy.dom_snapshots_keep_days)],
    ['queue_history_entries', () => sweepByDate('QueueHistoryEntry', 'recorded_at', policy.queue_history_keep_days)],
    ['cognitive_incidents', () => sweepResolvedIncidents(policy.resolved_incidents_keep_days)],
    ['build_sessions', () => sweepRejectedBuildSessions(policy.rejected_build_sessions_keep_days)],
  ];

  for (const [name, fn] of tasks) {
    try {
      const deleted = await fn();
      per_table[name] = { deleted };
      total += deleted;
    } catch (err: any) {
      per_table[name] = { deleted: 0, skipped_reason: err?.message ?? 'unknown' };
    }
  }

  return {
    started_at,
    elapsed_ms: Date.now() - t0,
    per_table,
    total_deleted: total,
  };
}

async function sweepByDate(modelName: string, column: string, keepDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
  const models = await import('../../../models');
  const Model = (models as any)[modelName];
  if (!Model) throw new Error(`Model ${modelName} not registered`);
  const deleted = await Model.destroy({ where: { [column]: { [Op.lt]: cutoff } } });
  return deleted;
}

async function sweepResolvedIncidents(keepDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
  const { default: CognitiveIncident } = await import('../../../models/CognitiveIncident');
  const deleted = await CognitiveIncident.destroy({
    where: {
      state: { [Op.in]: ['resolved', 'expired'] },
      [Op.or]: [
        { resolved_at: { [Op.lt]: cutoff } },
        { last_seen_at: { [Op.lt]: cutoff } },
      ],
    } as any,
  });
  return deleted;
}

async function sweepRejectedBuildSessions(keepDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
  const { default: BuildSession } = await import('../../../models/BuildSession');
  const deleted = await BuildSession.destroy({
    where: {
      status: { [Op.in]: ['rejected', 'abandoned'] },
      completed_at: { [Op.lt]: cutoff },
    } as any,
  });
  return deleted;
}
