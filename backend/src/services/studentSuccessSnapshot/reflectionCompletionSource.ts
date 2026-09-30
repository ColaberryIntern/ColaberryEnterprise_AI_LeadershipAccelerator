import ReflectionEntry from '../../models/ReflectionEntry';
import { ReflectionCompletionValue, SnapshotField } from './types';

/**
 * ReflectionEntry's own header comment is explicit: these are STRATEGIC
 * signals, "not graded" — matches the discovery report's classification of
 * this source as context-only, never decision-gating. Surfaced here as
 * real completion/readiness signal, not fabricated into a score.
 */
export async function getReflectionCompletionField(enrollmentId: string): Promise<SnapshotField<ReflectionCompletionValue>> {
  const rows = await ReflectionEntry.findAll({
    where: { enrollment_id: enrollmentId },
    order: [['updated_at', 'DESC']],
  });

  const latest: any = rows[0] || null;

  return {
    value: {
      count: rows.length,
      lastSubmittedAt: latest ? new Date(latest.updated_at).toISOString() : null,
      lastReadiness: latest ? latest.readiness ?? null : null,
    },
    status: 'known',
    sourceSystem: 'reflection_entries',
    sourceRecordIds: rows.map((r: any) => r.id),
    observedAt: new Date(),
    freshnessPolicy: 'real-time-idempotent-upsert',
    reliabilityState: 'healthy',
  };
}
