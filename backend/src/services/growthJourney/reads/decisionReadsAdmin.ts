import { GrowthJourneyScoreSnapshot, GrowthJourneyTransition } from '../../../models';
import { safeField } from '../handoffs/assigneeDigest';
import { brandWhere, emptyPage, paging, scopeWhere, type Page, type ReadScope } from './readPaging';

/**
 * The two reads behind a decision: the score snapshot it was taken on, and the
 * transitions it produced (Phase 6, T607).
 *
 * ─── `scores` IS NOT NUMERIC BY CONTRACT, SO THIS FILE MAKES IT NUMERIC ─────
 *
 * The plan for this task described `growth_journey_score_snapshots.scores` as
 * "a numeric map — the JSONB is numeric by contract, asserted". It is not:
 * the column is `JSONB` with no CHECK, no Zod schema and no exported type, and
 * the shape the rest of the journey writes into the analogous columns is a
 * `ScoreVector` (`governor/types.ts`) whose `dimensions` carry `label`,
 * `source` and a `factors` array — free text, i.e. exactly what an admin list
 * must not echo.
 *
 * So the contract is enforced here instead of assumed: `numericScores` walks
 * the JSONB, keeps a dimension only when its `value` is a finite number, and
 * reports the keys it refused in `non_numeric_keys` so a screen can say "this
 * dimension is not a number" rather than render a silent zero. Nothing else
 * from the JSONB leaves — no `label`, no `source`, no `factors`.
 *
 * ─── THE TABLE HAS NO WRITER YET ────────────────────────────────────────────
 *
 * Nothing in `backend/src` inserts into `growth_journey_score_snapshots`: it is
 * created by boot DDL, declared on the model and the barrel, and referenced by
 * tests. Verified by grep across the tree, not assumed. The read is real and
 * correct, and it answers an empty page until a writer exists — which is a
 * fact worth stating rather than a bug worth hiding. The dated snapshot writer
 * belongs to whoever adds it; this read is what will make it visible.
 *
 * ─── TRANSITIONS: THE STATE, NOT THE JSONB ──────────────────────────────────
 *
 * `from_value` and `to_value` are JSONB objects (`{ state, overlays }`), not
 * the `from_state` / `to_state` strings the plan named. Only the `state` string
 * is projected, capped; `evidence`, `idempotency_key` and `lead_id` are never
 * requested. `reason` is `TEXT` written by services, so it goes through T517's
 * `safeField` like every other operator-facing string on this surface.
 */

/* ── score snapshots ────────────────────────────────────────────────────────── */

export interface NumericScores {
  summary: number | null;
  dimensions: Array<{ key: string; value: number }>;
  /** Keys whose value was NOT a finite number, named so a screen can say so instead of showing 0. */
  non_numeric_keys: string[];
}

const KEY_CAP = 64;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Everything numeric in the JSONB, and the name of everything that was not. */
export function numericScores(raw: unknown): NumericScores {
  const out: NumericScores = { summary: null, dimensions: [], non_numeric_keys: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;
  if (finite(obj.summary)) out.summary = obj.summary;

  // The ScoreVector shape: a `dimensions` array of objects keyed by `key`.
  if (Array.isArray(obj.dimensions)) {
    for (const d of obj.dimensions) {
      if (!d || typeof d !== 'object') continue;
      const dim = d as Record<string, unknown>;
      if (typeof dim.key !== 'string' || dim.key.length === 0) continue;
      const key = dim.key.slice(0, KEY_CAP);
      if (finite(dim.value)) out.dimensions.push({ key, value: dim.value });
      else out.non_numeric_keys.push(key);
    }
    return out;
  }

  // A flat map, which is what the plan expected: keep the numbers, name the rest.
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'summary') continue;
    const key = k.slice(0, KEY_CAP);
    if (finite(v)) out.dimensions.push({ key, value: v });
    else out.non_numeric_keys.push(key);
  }
  return out;
}

export interface SnapshotRow {
  id: string;
  brand_id: string;
  subject_ref: string;
  as_of_date: string;
  state: string | null;
  scores: NumericScores;
  score_gaps: string[];
  created_at: string;
}

export interface SubjectFilters extends ReadScope {
  subjectRef?: string;
}

const gapsOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((g): g is string => typeof g === 'string').map((g) => g.slice(0, KEY_CAP)) : [];

export async function readScoreSnapshots(filters: SubjectFilters): Promise<Page<SnapshotRow>> {
  const { limit, offset } = paging(filters);
  if (filters.brandIds.length === 0) return emptyPage(limit, offset);
  const where = brandWhere(filters.brandIds);
  if (filters.subjectRef) where.subject_ref = filters.subjectRef;
  const { rows, count } = await GrowthJourneyScoreSnapshot.findAndCountAll({
    where,
    attributes: ['id', 'brand_id', 'subject_ref', 'as_of_date', 'state', 'scores', 'score_gaps', 'created_at'],
    order: [['as_of_date', 'DESC'], ['id', 'ASC']],
    limit,
    offset,
  });
  return {
    rows: rows.map((r) => ({
      id: String(r.get('id')),
      brand_id: String(r.get('brand_id')),
      subject_ref: String(r.get('subject_ref')),
      as_of_date: String(r.get('as_of_date')),
      state: (r.get('state') as string | null) ?? null,
      scores: numericScores(r.get('scores')),
      score_gaps: gapsOf(r.get('score_gaps')),
      created_at: new Date(r.get('created_at') as Date).toISOString(),
    })),
    total: count,
    limit,
    offset,
  };
}

/* ── transitions ────────────────────────────────────────────────────────────── */

export interface TransitionRow {
  id: string;
  brand_id: string;
  program_id: string | null;
  subject_ref: string;
  transition_type: string;
  status: string;
  /** The `state` string out of the JSONB, capped. The JSONB itself never leaves. */
  from_state: string | null;
  to_state: string | null;
  reason: string;
  reason_redacted: boolean;
  requested_by: string;
  requested_by_redacted: boolean;
  created_at: string;
}

const STATE_CAP = 64;
const stateOf = (v: unknown): string | null => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const state = (v as Record<string, unknown>).state;
  return typeof state === 'string' && state.length > 0 ? state.slice(0, STATE_CAP) : null;
};

export async function readTransitions(filters: SubjectFilters): Promise<Page<TransitionRow>> {
  const { limit, offset } = paging(filters);
  if (filters.brandIds.length === 0) return emptyPage(limit, offset);
  const where = scopeWhere(filters) as Record<string, unknown>;
  if (filters.subjectRef) where.subject_ref = filters.subjectRef;
  const { rows, count } = await GrowthJourneyTransition.findAndCountAll({
    where,
    attributes: [
      'id', 'brand_id', 'program_id', 'subject_ref', 'transition_type', 'status',
      'from_value', 'to_value', 'reason', 'requested_by', 'created_at',
    ],
    order: [['created_at', 'DESC'], ['id', 'ASC']],
    limit,
    offset,
  });
  return {
    rows: rows.map((r) => {
      const reason = safeField(r.get('reason'));
      const by = safeField(r.get('requested_by'));
      return {
        id: String(r.get('id')),
        brand_id: String(r.get('brand_id')),
        program_id: (r.get('program_id') as string | null) ?? null,
        subject_ref: String(r.get('subject_ref')),
        transition_type: String(r.get('transition_type')),
        status: String(r.get('status')),
        from_state: stateOf(r.get('from_value')),
        to_state: stateOf(r.get('to_value')),
        reason: reason.value,
        reason_redacted: reason.redacted,
        requested_by: by.value,
        requested_by_redacted: by.redacted,
        created_at: new Date(r.get('created_at') as Date).toISOString(),
      };
    }),
    total: count,
    limit,
    offset,
  };
}
