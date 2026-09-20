import { Op } from 'sequelize';
import { GrowthJourneyExecution, GrowthJourneyExecutionControl } from '../../../models';

/**
 * Reading the operator's switchboard (Phase 5 T504).
 *
 * Reads only. Writing a control is the admin route's job (T518), and this run
 * never writes one in production. Every read is scoped to the tenant, and only
 * rows that are still active (`cleared_at IS NULL`) count — a cleared row is
 * history, and history does not pause anything.
 */

export interface ActiveControl {
  id: string;
  kind: string;
  scope_key: string;
  mode: string;
  brand_id: string | null;
  program_id: string | null;
  channel: string | null;
  subject_ref: string | null;
  cohort_lead_ids: number[] | null;
  daily_limit: number | null;
}

const asControl = (row: Record<string, unknown> | null): ActiveControl | null =>
  row === null ? null : ({
    id: String(row.id),
    kind: String(row.kind),
    scope_key: String(row.scope_key),
    mode: String(row.mode),
    brand_id: (row.brand_id as string | null) ?? null,
    program_id: (row.program_id as string | null) ?? null,
    channel: (row.channel as string | null) ?? null,
    subject_ref: (row.subject_ref as string | null) ?? null,
    cohort_lead_ids: (row.cohort_lead_ids as number[] | null) ?? null,
    daily_limit: (row.daily_limit as number | null) ?? null,
  });

/**
 * The most specific active pause covering a target, or null.
 *
 * `keys` arrives from `pauseScopeKeysFor`, most specific first; the rows come
 * back unordered, so the caller's order is re-applied here rather than trusted
 * from the database.
 */
export async function findActivePause(tenantId: string, keys: readonly string[]): Promise<ActiveControl | null> {
  if (keys.length === 0) return null;
  const rows = await GrowthJourneyExecutionControl.findAll({
    where: { tenant_id: tenantId, kind: 'pause', cleared_at: null, scope_key: { [Op.in]: [...keys] } },
  });
  const found = new Map((rows as unknown as Array<Record<string, unknown>>).map((r) => [String(r.scope_key), r]));
  for (const key of keys) {
    const hit = found.get(key);
    if (hit) return asControl(hit);
  }
  return null;
}

/** The active rollout for one brand x programme x channel, or null (which means SHADOW). */
export async function findActiveRollout(tenantId: string, scopeKey: string): Promise<ActiveControl | null> {
  const row = await GrowthJourneyExecutionControl.findOne({
    where: { tenant_id: tenantId, kind: 'rollout', cleared_at: null, scope_key: scopeKey },
  });
  return asControl(row as unknown as Record<string, unknown> | null);
}

/** The UTC day `asOf` falls in — the same day boundary Phase 4's queue capacity uses. */
export function startOfUtcDay(asOf: Date): Date {
  return new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
}

/**
 * How many receipts this rollout's scope has already taken today.
 *
 * Counts receipts PLANNED today for the brand x programme x channel, whatever
 * became of them: a receipt that was blocked or failed still used a slot, which
 * is the conservative reading of a daily limit. A refusal that never wrote a
 * receipt is not counted, because nothing was spent.
 */
export async function countExecutionsToday(
  scope: { tenantId: string; brandId: string; programId: string | null; channel: string },
  asOf: Date,
): Promise<number> {
  return GrowthJourneyExecution.count({
    where: {
      tenant_id: scope.tenantId,
      brand_id: scope.brandId,
      channel: scope.channel,
      ...(scope.programId ? { program_id: scope.programId } : {}),
      created_at: { [Op.gte]: startOfUtcDay(asOf) },
    },
  });
}
