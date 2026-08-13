/**
 * capeAiPulseExposureService — least-recently-shown lookup/record for
 * `capeTodayPlanService.ts`'s `ai_pulse` slot rotation fix (scoped bugfix,
 * 2026-08-06, Session CC-20260802-r4q9). Backed by `cape_ai_pulse_exposure`
 * (see `ensureCapeAiPulseExposureSchema.ts` for the full root-cause writeup
 * and why this is a new table rather than an extension of
 * `today_feed_impressions`).
 *
 * Both functions are fail-soft, matching this repo's other Cape services
 * (`capeGovernancePolicyService.getCurrentGovernancePolicy`,
 * `feedConfigService.getFeedPolicy`): a DB hiccup here must never break Today
 * Plan assembly. `getAiPulseExposureMap` degrades to "treat everything as
 * never-shown" (an empty map) on failure, which reproduces the exact
 * pre-fix `pickFirst` ordering for that one request — a safe, byte-identical
 * fallback, never a thrown error or an empty ai_pulse slot. `recordAiPulseExposure`
 * degrades to a logged no-op on failure — losing one exposure write only
 * delays rotation by a day, never crashes plan assembly.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

/** Plain read: last_shown_at per ref, for the given enrollment + candidate refs only. */
export async function getAiPulseExposureMap(enrollmentId: string, refs: string[]): Promise<Map<string, Date>> {
  const uniqueRefs = Array.from(new Set(refs)).filter((r): r is string => !!r);
  if (!uniqueRefs.length) return new Map();
  try {
    const rows = await sequelize.query<{ ref: string; last_shown_at: string | Date }>(
      `SELECT ref, last_shown_at FROM cape_ai_pulse_exposure
         WHERE enrollment_id = :eid AND ref IN (:refs)`,
      { replacements: { eid: enrollmentId, refs: uniqueRefs }, type: QueryTypes.SELECT },
    );
    const map = new Map<string, Date>();
    for (const row of rows) {
      if (!row?.ref) continue;
      const d = row.last_shown_at instanceof Date ? row.last_shown_at : new Date(row.last_shown_at);
      if (!Number.isNaN(d.getTime())) map.set(row.ref, d);
    }
    return map;
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'cape_ai_pulse_exposure_read_failed',
      error_class: err?.name || 'Error',
      outcome: 'failure',
      context: { enrollment_id: enrollmentId, candidate_count: uniqueRefs.length, message: err?.message },
    }));
    return new Map(); // fail-soft: everything reads as never-shown -> reproduces pre-fix pickFirst order
  }
}

/**
 * Record that `ref` was placed in the ai_pulse slot just now. Idempotent
 * upsert on the (enrollment_id, ref) unique index — a retry or a second
 * `getTodayPlan` call the same day converges to one row with the latest
 * `last_shown_at` and an incremented `shown_count`, never a duplicate row.
 */
export async function recordAiPulseExposure(enrollmentId: string, ref: string): Promise<void> {
  try {
    await sequelize.query(
      `INSERT INTO cape_ai_pulse_exposure (enrollment_id, ref, shown_count, last_shown_at)
         VALUES (:eid, :ref, 1, NOW())
       ON CONFLICT (enrollment_id, ref)
         DO UPDATE SET shown_count = cape_ai_pulse_exposure.shown_count + 1, last_shown_at = NOW()`,
      { replacements: { eid: enrollmentId, ref }, type: QueryTypes.INSERT },
    );
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'cape_ai_pulse_exposure_write_failed',
      error_class: err?.name || 'Error',
      outcome: 'failure',
      context: { enrollment_id: enrollmentId, ref, message: err?.message },
    }));
    // fail-soft: losing one exposure write only delays rotation by a day, never breaks plan assembly
  }
}
