/**
 * retentionEnforcementService — LIVE enforcement of the retention policy defined in
 * retentionReportService.ts (TBI audit P2-5). retentionReportService stays dry-run/read-only;
 * this module is the only place in the codebase that actually deletes or anonymizes rows for
 * retention. Enabled 2026-07-31 per Ali's sign-off (was previously gated pending sign-off).
 *
 * Safety properties (Failure-First Design / Idempotency & Replayability):
 *   - One transaction per class — a failure in one class never touches another, and never
 *     leaves a class partially purged.
 *   - Idempotent by construction: `purge` re-runs match zero additional rows once the
 *     expired set is gone (WHERE ageColumn < cutoff over remaining rows). `anonymize_review`
 *     re-runs match zero rows once anonymized, because the WHERE clause excludes rows whose
 *     PII columns are already NULL — running twice cannot re-anonymize or double-count.
 *   - Every class's outcome is recorded as an `ai_events` row (event_type
 *     'governance.retention_enforced') so there is a durable, queryable record of what was
 *     deleted/anonymized and when — required for evidence-based compliance per
 *     TBI_COMPLIANCE_PROGRAM.md §4.1.
 *   - `leads` is anonymized (name/email/phone nulled), never hard-deleted — deleting CRM
 *     pipeline data is business-destructive; anonymization satisfies the same retention intent
 *     without destroying pipeline/attribution history.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { emitAiEvent } from './aiEventService';
import { RETENTION_POLICY, RETENTION_DEFAULT_TTL_MONTHS, type RetentionAction } from './retentionReportService';

const IDENT = /^[a-z_][a-z0-9_]*$/; // same defense-in-depth as retentionReportService: policy identifiers only, never user input

export interface RetentionEnforcementClassResult {
  key: string;
  label: string;
  table: string;
  action: RetentionAction;
  ttlMonths: number;
  affected: number;
  error?: string;
}

export interface RetentionEnforcementResult {
  executedAt: string;
  classes: RetentionEnforcementClassResult[];
  totals: { affected: number; errors: number };
}

function clampTtl(months?: number): number {
  if (!months || !Number.isFinite(months)) return RETENTION_DEFAULT_TTL_MONTHS;
  return Math.min(120, Math.max(1, Math.floor(months)));
}

async function purgeClass(table: string, ageColumn: string, ttlMonths: number): Promise<number> {
  return sequelize.transaction(async (t) => {
    const result = (await sequelize.query(
      `DELETE FROM "${table}" WHERE "${ageColumn}" < NOW() - make_interval(months => :ttl)`,
      { type: QueryTypes.DELETE, replacements: { ttl: ttlMonths }, transaction: t }
    )) as unknown as [unknown, number];
    // node-postgres/Sequelize DELETE returns rowCount as the second tuple element for QueryTypes.DELETE.
    return typeof result?.[1] === 'number' ? result[1] : 0;
  });
}

/** Anonymizes (never deletes) expired lead PII. Excludes already-anonymized rows so re-runs affect zero. */
async function anonymizeLeads(ttlMonths: number): Promise<number> {
  return sequelize.transaction(async (t) => {
    const result = (await sequelize.query(
      `UPDATE leads
         SET name = NULL, email = NULL, phone = NULL
       WHERE created_at < NOW() - make_interval(months => :ttl)
         AND email IS NOT NULL`,
      { type: QueryTypes.UPDATE, replacements: { ttl: ttlMonths }, transaction: t }
    )) as unknown as [unknown, number];
    return typeof result?.[1] === 'number' ? result[1] : 0;
  });
}

/**
 * Enforces the retention policy for every class. Read `retentionReportService.getRetentionReport()`
 * first if you want to preview counts before calling this — it is the same policy table, just
 * without the writes.
 */
export async function enforceRetention(ttlMonthsOverride?: number): Promise<RetentionEnforcementResult> {
  const override = ttlMonthsOverride != null ? clampTtl(ttlMonthsOverride) : undefined;
  const classes: RetentionEnforcementClassResult[] = [];

  for (const def of RETENTION_POLICY) {
    const ttlMonths = override ?? def.ttlMonths;
    const base = { key: def.key, label: def.label, table: def.table, action: def.action, ttlMonths };

    if (!IDENT.test(def.table) || !IDENT.test(def.ageColumn)) {
      classes.push({ ...base, affected: 0, error: 'invalid_identifier' });
      continue;
    }

    try {
      const affected =
        def.action === 'anonymize_review' ? await anonymizeLeads(ttlMonths) : await purgeClass(def.table, def.ageColumn, ttlMonths);
      classes.push({ ...base, affected });
      await emitAiEvent({
        event_type: 'governance.retention_enforced',
        outcome: 'success',
        actor_type: 'system',
        external_system: 'internal',
        metadata: { class_key: def.key, table: def.table, action: def.action, ttl_months: ttlMonths, affected },
      });
    } catch (err: any) {
      const errorClass = err?.constructor?.name || 'QueryError';
      classes.push({ ...base, affected: 0, error: errorClass });
      await emitAiEvent({
        event_type: 'governance.retention_enforced',
        outcome: 'failure',
        error_class: errorClass,
        actor_type: 'system',
        external_system: 'internal',
        metadata: { class_key: def.key, table: def.table, action: def.action, ttl_months: ttlMonths, message: err?.message },
      }).catch(() => {});
    }
  }

  const affected = classes.reduce((s, c) => s + c.affected, 0);
  const errors = classes.filter((c) => c.error).length;
  return { executedAt: new Date().toISOString(), classes, totals: { affected, errors } };
}
