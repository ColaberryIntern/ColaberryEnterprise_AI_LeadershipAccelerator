import { Op, type WhereOptions } from 'sequelize';
import { GrowthJourneyExecution, GrowthJourneyHandoff, GrowthJourneyOutcome } from '../../../models';
import { safeField } from '../handoffs/assigneeDigest';
import { loadHandoffRates, type BrandHandoffRates } from '../outcomes/handoffRatesQuery';

/**
 * The journey's three list reads and the rates roll-up (Phase 6, T606).
 *
 * ─── SCALARS ONLY, AND THE PROJECTION IS THE MECHANISM ──────────────────────
 *
 * Every row that leaves here is built field by field from a named column. No
 * spread of a model instance, no `metadata`, no `evidence`, no `payload` - the
 * JSONB columns on these tables are where a person's words end up (a reply
 * quoted into an outcome, a bounce message on a receipt), and an admin list is
 * the one place they must not reappear. `status_reason` IS shown, because an
 * operator needs to know why a send was blocked, but it goes through T517's
 * `safeField`: a string carrying an `@` becomes `redacted` and the row says so.
 *
 * `subject_ref` is shown on outcomes (it is `lead:123` / `enrollment:<uuid>`,
 * a pointer, never an address) because it is the only way to reconcile a row
 * back to the queue it came from. `lead_id` is NOT shown: it is the key the
 * marketing tables join on, and nothing on this screen needs it.
 *
 * ─── BOUNDED, ALWAYS ────────────────────────────────────────────────────────
 *
 * Each list read takes `limit` (≤ `MAX_PAGE`) and `offset`, and answers with a
 * `total` from `count` so a page can say "25 of 312" without loading 312 rows.
 * `findAndCountAll` issues both in one call. The window on the rates read is
 * clamped by its own schema, and the rates read COUNTS before it computes so
 * Phase 4's own unbounded row read is never reached with a window too large -
 * see `MAX_RATE_HANDOFFS`. The rates themselves come from Phase 4's
 * computation, which this module does not reimplement.
 *
 * ─── THE SCOPE IS THE CALLER'S, AND AN EMPTY SCOPE READS NOTHING ────────────
 *
 * `brandIds` is the caller's memberships (narrowed by an explicit `brand_id`
 * the controller already refused if out of scope). An empty list short-circuits
 * to an empty page WITHOUT a query, which is the same fail-closed shape every
 * other journey read has: in production today `tenant_memberships` is empty, so
 * that is every admin.
 */

export const MAX_PAGE = 100;
export const DEFAULT_PAGE = 25;

export interface ReadScope {
  brandIds: readonly string[];
  programId?: string | null;
  limit?: number;
  offset?: number;
}

export interface Page<T> {
  rows: T[];
  total: number;
  limit: number;
  offset: number;
}

const emptyPage = <T>(limit: number, offset: number): Page<T> => ({ rows: [], total: 0, limit, offset });

function paging(scope: ReadScope): { limit: number; offset: number } {
  const limit = Math.min(Math.max(1, Math.floor(scope.limit ?? DEFAULT_PAGE)), MAX_PAGE);
  const offset = Math.max(0, Math.floor(scope.offset ?? 0));
  return { limit, offset };
}

function scopeWhere(scope: ReadScope): WhereOptions {
  const where: Record<string, unknown> = { brand_id: { [Op.in]: [...scope.brandIds] } };
  if (scope.programId) where.program_id = scope.programId;
  return where;
}

/* ── receipts ───────────────────────────────────────────────────────────────── */

export interface ReceiptRow {
  id: string;
  brand_id: string;
  program_id: string | null;
  channel: string;
  action_type: string;
  status: string;
  /** Through `safeField`: an `@` becomes `redacted`, and `status_reason_redacted` says it happened. */
  status_reason: string;
  status_reason_redacted: boolean;
  campaign_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReceiptFilters extends ReadScope {
  status?: string;
  channel?: string;
}

export async function readReceipts(filters: ReceiptFilters): Promise<Page<ReceiptRow>> {
  const { limit, offset } = paging(filters);
  if (filters.brandIds.length === 0) return emptyPage(limit, offset);
  const where = scopeWhere(filters) as Record<string, unknown>;
  if (filters.status) where.status = filters.status;
  if (filters.channel) where.channel = filters.channel;
  const { rows, count } = await GrowthJourneyExecution.findAndCountAll({
    where,
    attributes: ['id', 'brand_id', 'program_id', 'channel', 'action_type', 'status', 'status_reason', 'campaign_key', 'created_at', 'updated_at'],
    order: [['created_at', 'DESC'], ['id', 'ASC']],
    limit,
    offset,
  });
  return {
    rows: rows.map((r) => {
      const reason = safeField(r.get('status_reason'));
      return {
        id: String(r.get('id')),
        brand_id: String(r.get('brand_id')),
        program_id: (r.get('program_id') as string | null) ?? null,
        channel: String(r.get('channel')),
        action_type: String(r.get('action_type')),
        status: String(r.get('status')),
        status_reason: reason.value,
        status_reason_redacted: reason.redacted,
        campaign_key: (r.get('campaign_key') as string | null) ?? null,
        created_at: new Date(r.get('created_at') as Date).toISOString(),
        updated_at: new Date(r.get('updated_at') as Date).toISOString(),
      };
    }),
    total: count,
    limit,
    offset,
  };
}

/* ── outcomes ───────────────────────────────────────────────────────────────── */

export interface OutcomeRow {
  id: string;
  brand_id: string;
  /** `lead:123` / `enrollment:<uuid>` - a pointer, never an address. */
  subject_ref: string;
  outcome_type: string;
  source: string;
  occurred_at: string;
  handoff_id: string | null;
  decision_id: string | null;
}

export interface OutcomeFilters extends ReadScope {
  outcomeType?: string;
  source?: string;
}

export async function readOutcomes(filters: OutcomeFilters): Promise<Page<OutcomeRow>> {
  const { limit, offset } = paging(filters);
  if (filters.brandIds.length === 0) return emptyPage(limit, offset);
  // `growth_journey_outcomes` carries no program_id, so the programme filter does not apply here;
  // scoping it by brand alone is deliberate rather than an omission.
  const where: Record<string, unknown> = { brand_id: { [Op.in]: [...filters.brandIds] } };
  if (filters.outcomeType) where.outcome_type = filters.outcomeType;
  if (filters.source) where.source = filters.source;
  const { rows, count } = await GrowthJourneyOutcome.findAndCountAll({
    where,
    // `metadata` and `value` are deliberately absent: the first is JSONB a reply can reach, the
    // second is a figure whose meaning depends on the outcome type and belongs to a metric.
    attributes: ['id', 'brand_id', 'subject_ref', 'outcome_type', 'source', 'occurred_at', 'handoff_id', 'decision_id'],
    order: [['occurred_at', 'DESC'], ['id', 'ASC']],
    limit,
    offset,
  });
  return {
    rows: rows.map((r) => ({
      id: String(r.get('id')),
      brand_id: String(r.get('brand_id')),
      subject_ref: String(r.get('subject_ref')),
      outcome_type: String(r.get('outcome_type')),
      source: String(r.get('source')),
      occurred_at: new Date(r.get('occurred_at') as Date).toISOString(),
      handoff_id: (r.get('handoff_id') as string | null) ?? null,
      decision_id: (r.get('decision_id') as string | null) ?? null,
    })),
    total: count,
    limit,
    offset,
  };
}

/* ── rates ──────────────────────────────────────────────────────────────────── */

/**
 * How many handoffs this read will load for one brand before it refuses to.
 *
 * Phase 4's `loadHandoffRates` is the computation, and it reads ROWS - every handoff in the window
 * and every outcome from the window's start, with no `LIMIT`, because the nightly that wrote it runs
 * once per brand per day over 30 days. This admin route can ask for 365 days across every brand in
 * scope, so it is the caller that made that read unbounded, and it is this file's job to bound it.
 *
 * The bound is a COUNT first, not a truncated sample: a rate computed over the newest N handoffs is
 * a different number wearing the same name, which is exactly the defect the metric registry exists
 * to prevent. So a brand over the cap answers `{ rates: null, capped: true, handoffs_in_window }`
 * with the reason, and the caller narrows the window - a refusal a screen can render, rather than a
 * figure nobody can defend or a request that pulls a year of rows into memory.
 */
export const MAX_RATE_HANDOFFS = 5_000;
export const WINDOW_TOO_LARGE = 'window_too_large';

export interface BrandRates {
  brand_id: string;
  /** Null only when `capped` - never a partial rate wearing a full rate's name. */
  rates: BrandHandoffRates | null;
  capped: boolean;
  handoffs_in_window: number;
  reason?: typeof WINDOW_TOO_LARGE;
}

export interface RatesResult {
  brands: BrandRates[];
  window_days: number;
  max_handoffs_per_brand: number;
}

/**
 * Phase 4's handoff rates, per brand in scope and per queue - its computation, not a second one.
 *
 * Reported per brand rather than pooled, because that is what the rates ARE: one brand's queue
 * performance. `journey.*` metrics pool them for a scope-wide figure (T605); this read is the
 * drill-through behind that number, so it keeps them apart.
 */
export async function readRates(scope: { brandIds: readonly string[]; windowDays: number; asOf?: Date }): Promise<RatesResult> {
  const to = scope.asOf ?? new Date();
  const from = new Date(to.getTime() - scope.windowDays * 86_400_000);
  const brands: BrandRates[] = [];
  for (const brandId of scope.brandIds) {
    // One indexed COUNT per brand, on the same predicate the rates query uses, before any row is read.
    const handoffs = await GrowthJourneyHandoff.count({ where: { brand_id: brandId, created_at: { [Op.gte]: from, [Op.lt]: to } } });
    if (handoffs > MAX_RATE_HANDOFFS) {
      brands.push({ brand_id: brandId, rates: null, capped: true, handoffs_in_window: handoffs, reason: WINDOW_TOO_LARGE });
      continue;
    }
    brands.push({
      brand_id: brandId,
      rates: await loadHandoffRates({ brandId, asOf: scope.asOf, windowDays: scope.windowDays }),
      capped: false,
      handoffs_in_window: handoffs,
    });
  }
  return { brands, window_days: scope.windowDays, max_handoffs_per_brand: MAX_RATE_HANDOFFS };
}
