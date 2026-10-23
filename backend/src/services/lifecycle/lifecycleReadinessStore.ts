/**
 * Persisting readiness. The I/O half of `lifecycleReadiness.ts`, which stays pure.
 *
 * Design: `readiness-and-approval-separation.md` §4 and §9 step 1.
 *
 * ## Raw SQL, deliberately
 *
 * `lifecycle_stage_readiness` has no Sequelize model. `backend/CLAUDE.md` permits raw SQL where
 * no model exists, provided the result is typed at the call site, which it is below. A model
 * would also have to re-declare the five CHECK constraints' meaning in TypeScript, and they are
 * the thing that makes this table trustworthy - better to let the database be their only home.
 *
 * ## Idempotent by the unique index, not by a read-then-write
 *
 * `ON CONFLICT DO NOTHING` against `uq_readiness_measurement (lifecycle, stage, evidence hash)`.
 * Re-measuring unchanged evidence is a no-op and the ORIGINAL `measured_at` survives - the same
 * shape as a retried blueprint approval returning the original approver and timestamp. A
 * read-then-insert would leave the race open; the index closes it.
 *
 * ## What this module cannot do
 *
 * It cannot write a row attributed to a person, cannot record an approval as a performed act, and
 * cannot claim a stage is satisfied while blocking gaps are present. Those are CHECK constraints
 * on the table, not conditionals here, so they hold for every writer including a future one that
 * has never read this file. `lifecycleReadinessPersistence.integration.test.ts` proves all three
 * refuse against a real Postgres rather than asserting the DDL text contains them.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import type { LifecycleStage } from './lifecycleStages';
import type { StageReadiness } from './lifecycleReadiness';

/**
 * The only identity readiness is ever written under. The `system:` prefix is required by
 * `ck_readiness_measured_by_is_system`, so a caller that invents a different value gets a
 * constraint violation rather than a row.
 */
export const READINESS_MEASURED_BY = 'system:lifecycle-readiness';

export interface ReadinessRow {
  id: string;
  targetStage: LifecycleStage;
  satisfied: boolean;
  gapCount: number;
  gaps: unknown[];
  evidenceSha256: string;
  measuredBy: string;
  performedAct: string | null;
  measuredAt: Date;
}

/**
 * Record one measurement. Returns whether a row was actually written, so a caller can tell a
 * fresh measurement from a repeat of one already on file.
 *
 * `performedAct` is the work permission the pipeline exercised, when this measurement accompanies
 * work it actually did. It must never be an approval; the table refuses one.
 */
export async function recordReadiness(input: {
  tenantId: string;
  lifecycleStateId: string;
  readiness: StageReadiness;
  performedAct?: string | null;
}): Promise<{ inserted: boolean }> {
  const { readiness } = input;

  // Held by `ck_readiness_satisfied_iff_no_gaps` as well, but asserted here so the failure names
  // the caller rather than arriving as a constraint violation from three layers down.
  if (readiness.satisfied !== (readiness.blocking.length === 0)) {
    throw new Error(
      'readiness is internally inconsistent: satisfied disagrees with its blocking gaps',
    );
  }

  const rows = await sequelize.query<{ id: string }>(
    `INSERT INTO lifecycle_stage_readiness (
       tenant_id, lifecycle_state_id, target_stage, satisfied, gap_count, gaps,
       evidence_sha256, measured_by, performed_act
     ) VALUES (
       :tenantId, :lifecycleStateId, :targetStage, :satisfied, :gapCount, CAST(:gaps AS JSONB),
       :evidenceSha256, :measuredBy, :performedAct
     )
     ON CONFLICT (lifecycle_state_id, target_stage, evidence_sha256) DO NOTHING
     RETURNING id`,
    {
      replacements: {
        tenantId: input.tenantId,
        lifecycleStateId: input.lifecycleStateId,
        targetStage: readiness.targetStage,
        satisfied: readiness.satisfied,
        gapCount: readiness.blocking.length,
        gaps: JSON.stringify(readiness.blocking),
        evidenceSha256: readiness.evidenceSha256,
        measuredBy: READINESS_MEASURED_BY,
        performedAct: input.performedAct ?? null,
      },
      type: QueryTypes.SELECT,
    },
  );

  return { inserted: rows.length === 1 };
}

/** The most recent measurement for one hop, or null if nobody has measured it. */
export async function latestReadiness(
  lifecycleStateId: string,
  targetStage: LifecycleStage,
): Promise<ReadinessRow | null> {
  const rows = await sequelize.query<{
    id: string;
    target_stage: LifecycleStage;
    satisfied: boolean;
    gap_count: number;
    gaps: unknown[];
    evidence_sha256: string;
    measured_by: string;
    performed_act: string | null;
    measured_at: Date;
  }>(
    `SELECT id, target_stage, satisfied, gap_count, gaps, evidence_sha256, measured_by,
            performed_act, measured_at
       FROM lifecycle_stage_readiness
      WHERE lifecycle_state_id = :lifecycleStateId AND target_stage = :targetStage
      ORDER BY measured_at DESC
      LIMIT 1`,
    { replacements: { lifecycleStateId, targetStage }, type: QueryTypes.SELECT },
  );

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    targetStage: row.target_stage,
    satisfied: row.satisfied,
    gapCount: Number(row.gap_count),
    gaps: Array.isArray(row.gaps) ? row.gaps : [],
    evidenceSha256: row.evidence_sha256,
    measuredBy: row.measured_by,
    performedAct: row.performed_act,
    measuredAt: new Date(row.measured_at),
  };
}

/**
 * Whether an approval granted against `approvedSha256` still matches the newest measurement.
 *
 * This is the staleness question the fingerprint exists to answer, and it returns `null` when
 * nothing has been measured rather than guessing - an unmeasured hop is not a fresh one.
 */
export async function approvalIsStale(
  lifecycleStateId: string,
  targetStage: LifecycleStage,
  approvedSha256: string,
): Promise<boolean | null> {
  const latest = await latestReadiness(lifecycleStateId, targetStage);
  if (!latest) return null;
  return latest.evidenceSha256 !== approvedSha256;
}
