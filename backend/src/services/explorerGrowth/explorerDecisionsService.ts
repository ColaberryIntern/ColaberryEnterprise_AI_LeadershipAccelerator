import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { PURPOSE_SPECS, allPurposes, unsupportedPurposes } from './content/assetPurposeMap';
import { namedGaps } from './explorerGapParsing';
import { pgArray } from './content/resolveContentAssets';
import type { ExplorerActionType, ExplorerAssetPurpose } from '../../types/explorerGrowth';
import type { ContentQuery, DecisionsQuery, ShadowQuery } from '../../schemas/explorerGrowthSchema';

/**
 * The per-decision tabs: Decisions, Shadow, and Content.
 *
 * READ-ONLY, like its sibling.
 *
 * Each query was executed against production on 2026-09-02 and returned rows:
 *
 *   decisions  153 rows on the latest date, 142 with suppressed candidates
 *   shadow     130 SEND_EMAIL + 12 RECOMMEND_LESSON would have gone out, 0 executed
 *   content    646 assets, 552 active and emailable; 4 declared gaps
 *   coverage   lesson_recommendation 23 free_preview / 552 full_access;
 *              activation_first_step 23 / 47
 *
 * The figures above come from the RENDERED SQL — `injectReplacements` output run
 * against production — not from SQL written by hand to resemble it. The first
 * version of this header claimed production verification while the coverage
 * query it described emitted `CAST('LESSON' AS text[])`, which Postgres rejects
 * outright. The numbers were real; the query that produced them was not the one
 * that shipped, and no test could tell, because all of them mock
 * `sequelize.query` and assert on the template. A test now asserts the bound
 * VALUE instead.
 */

export interface ExplorerDecisionRow {
  id: string;
  enrollment_id: string;
  decision_date: string;
  mode: string;
  selected_action: ExplorerActionType | null;
  channel: string | null;
  executed: boolean;
  reason: string;
  suppressed_count: number;
  asset_count: number;
  email_normalized: string | null;
  primary_state: string | null;
  e_score: number | null;
  i_score: number | null;
  f_score: number | null;
}

export interface ExplorerDecisionPage {
  rows: ExplorerDecisionRow[];
  total: number;
  limit: number;
  offset: number;
  /** The date these rows are for, so a caller never mislabels an older run as today. */
  decision_date: string | null;
}

export interface ExplorerPurposeCoverage {
  purpose: ExplorerAssetPurpose;
  supported: boolean;
  /** Present only when the purpose is a declared gap. Read from PURPOSE_SPECS. */
  declared_gap_reason: string | null;
  kinds: string[];
  pinned_stages: string[] | null;
  free_preview: number;
  full_access: number;
}

export interface ExplorerContentHealth {
  total: number;
  active: number;
  emailable: number;
  purposes: ExplorerPurposeCoverage[];
  /**
   * stage x audience, the cross-tab that explains the decision-level gap.
   *
   * DO NOT SUM THE CELLS. 23 assets carry both audience tags, so the cells total
   * 575 against 552 real assets. Each cell is correct as "assets a learner in
   * this stage and tier could receive"; the total is `active`/`emailable`.
   */
  matrix: { stage: string; audience: string; count: number }[];
  decision_gaps: { decision_date: string | null; gap_count: number; named: string[] };
}

/** The `WHERE` for a decisions listing, anchored on the latest run unless a date is given. */
function decisionFilters(q: DecisionsQuery): { sql: string; bind: Record<string, unknown> } {
  const clauses: string[] = [];
  const bind: Record<string, unknown> = {};

  if (q.date) {
    clauses.push('d.decision_date = :date');
    bind.date = q.date;
  } else {
    // Anchored on MAX rather than CURRENT_DATE: the recompute runs nightly, so
    // "today" returns zero rows on a morning before it has run, which reads as
    // "nothing was decided" rather than "it has not run yet".
    clauses.push('d.decision_date = (SELECT MAX(decision_date) FROM explorer_journey_decisions)');
  }
  if (q.action) {
    clauses.push('d.selected_action = :action');
    bind.action = q.action;
  }
  if (q.executed !== undefined) {
    clauses.push('d.executed = :executed');
    bind.executed = q.executed;
  }

  return { sql: `WHERE ${clauses.join(' AND ')}`, bind };
}

const DECISION_COLUMNS = `d.id, d.enrollment_id, d.decision_date, d.mode, d.selected_action,
       d.channel, d.executed, d.reason,
       jsonb_array_length(d.suppressed_actions) AS suppressed_count,
       jsonb_array_length(d.selected_content_assets) AS asset_count,
       p.email_normalized, p.primary_state, p.e_score, p.i_score, p.f_score`;

async function listDecisions(
  where: string,
  bind: Record<string, unknown>,
  limit: number,
  offset: number,
): Promise<ExplorerDecisionPage> {
  const [count] = await sequelize.query<{ count: string; decision_date: string | null }>(
    `SELECT COUNT(*) AS count, MAX(d.decision_date) AS decision_date
       FROM explorer_journey_decisions d ${where}`,
    { replacements: bind, type: QueryTypes.SELECT },
  );

  const rows = await sequelize.query<ExplorerDecisionRow>(
    `SELECT ${DECISION_COLUMNS}
       FROM explorer_journey_decisions d
       LEFT JOIN explorer_journey_profiles p ON p.enrollment_id = d.enrollment_id
       ${where}
      ORDER BY d.created_at DESC, d.id
      LIMIT :limit OFFSET :offset`,
    { replacements: { ...bind, limit, offset }, type: QueryTypes.SELECT },
  );

  return {
    rows,
    total: Number(count?.count ?? 0),
    limit,
    offset,
    decision_date: count?.decision_date ?? null,
  };
}

/** The Decisions tab: what was decided, filterable, each row linking to its Why. */
export async function getDecisions(q: DecisionsQuery): Promise<ExplorerDecisionPage> {
  const { sql, bind } = decisionFilters(q);
  return listDecisions(sql, bind, q.limit, q.offset);
}

/**
 * The Shadow tab: the same rows framed as a review — what WOULD have been sent.
 *
 * `executed = false AND selected_action <> 'WAIT'` is the definition. A WAIT
 * would have sent nothing, so listing it under "what would have gone out" pads
 * the review with 11 non-events and makes the real number look smaller than it
 * is. On the latest run that is 142 rows, not 153.
 */
export async function getShadow(q: ShadowQuery): Promise<ExplorerDecisionPage> {
  const { sql, bind } = decisionFilters({ limit: q.limit, offset: q.offset, date: q.date });
  const where = `${sql} AND d.selected_action <> 'WAIT' AND d.executed = false`;
  return listDecisions(where, bind, q.limit, q.offset);
}

/** Assets that could answer one purpose, split by the audience tier that may see them. */
async function coverageForPurpose(purpose: ExplorerAssetPurpose): Promise<ExplorerPurposeCoverage> {
  const spec = PURPOSE_SPECS[purpose];

  if (!spec.supported) {
    // Reuses the reason declared in PURPOSE_SPECS rather than restating it. A
    // second copy of this list would drift from the one the Governor consults.
    return {
      purpose,
      supported: false,
      declared_gap_reason: spec.reason,
      kinds: [],
      pinned_stages: null,
      free_preview: 0,
      full_access: 0,
    };
  }

  const stages = spec.stageTags ?? null;
  // COUNT(DISTINCT a.id) is defensive rather than load-bearing: the only unnest
  // here is on `audience_tags` and the grouping is BY audience, while stages are
  // filtered with `&&`, which cannot multiply rows. An earlier comment claimed
  // it prevented multi-stage double counting; that mechanism is not in play.
  const rows = await sequelize.query<{ audience: string; n: string }>(
    `SELECT u.audience, COUNT(DISTINCT a.id) AS n
       FROM explorer_content_assets a, LATERAL UNNEST(a.audience_tags) u(audience)
      WHERE a.active
        AND 'email' = ANY(a.allowed_channels)
        AND (a.starts_at IS NULL OR a.starts_at <= NOW())
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
        AND a.asset_type = ANY(CAST(:kinds AS text[]))
        AND (CAST(:stages AS text[]) IS NULL OR a.journey_stage_tags && CAST(:stages AS text[]))
      GROUP BY 1`,
    // pgArray, NOT the raw arrays. Sequelize `replacements` is textual
    // substitution: `kinds: ['LESSON']` renders as `CAST('LESSON' AS text[])`,
    // which Postgres rejects with "malformed array literal", and every supported
    // purpose would reject at once — taking the matrix and the gap report down
    // with them through `Promise.all`. The first version of this file shipped
    // exactly that, and every test passed because they all assert on the SQL
    // TEMPLATE and never on what Sequelize renders.
    {
      replacements: { kinds: pgArray(spec.kinds), stages: stages ? pgArray(stages) : null },
      type: QueryTypes.SELECT,
    },
  );

  const byTier = new Map(rows.map((r) => [r.audience, Number(r.n)]));
  return {
    purpose,
    supported: true,
    declared_gap_reason: null,
    kinds: spec.kinds,
    pinned_stages: stages,
    free_preview: byTier.get('free_preview') ?? 0,
    full_access: byTier.get('full_access') ?? 0,
  };
}

/**
 * The Content tab: registry health, coverage per purpose, and the gaps.
 *
 * "646 assets" reads healthy. What it hides, measured on 2026-09-02: every one
 * of the 206 learning-stage assets is `full_access`, and the only free-preview
 * content in the catalogue is 23 activation assets. A free-tier learner past
 * week 0 therefore has an empty candidate set BY CONSTRUCTION — which is why the
 * matrix is returned alongside the count rather than instead of it.
 */
export async function getContentHealth(q: ContentQuery): Promise<ExplorerContentHealth> {
  const [totals] = await sequelize.query<{ total: string; active: string; emailable: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE active) AS active,
            COUNT(*) FILTER (WHERE active AND 'email' = ANY(allowed_channels)) AS emailable
       FROM explorer_content_assets`,
    { type: QueryTypes.SELECT },
  );

  const matrix = await sequelize.query<{ stage: string; audience: string; count: string }>(
    `SELECT s.stage, u.audience, COUNT(DISTINCT a.id) AS count
       FROM explorer_content_assets a,
            LATERAL UNNEST(a.journey_stage_tags) s(stage),
            LATERAL UNNEST(a.audience_tags) u(audience)
      WHERE a.active AND 'email' = ANY(a.allowed_channels)
      GROUP BY 1, 2 ORDER BY 3 DESC`,
    { type: QueryTypes.SELECT },
  );

  const purposes = await Promise.all(allPurposes().map((p) => coverageForPurpose(p)));
  const gaps = await decisionGapSummary(q.date);

  return {
    total: Number(totals?.total ?? 0),
    active: Number(totals?.active ?? 0),
    emailable: Number(totals?.emailable ?? 0),
    purposes,
    matrix: matrix.map((m) => ({ stage: m.stage, audience: m.audience, count: Number(m.count) })),
    decision_gaps: gaps,
  };
}

/** How many of the latest run's decisions reported a gap, and which gaps they named. */
async function decisionGapSummary(
  date?: string,
): Promise<{ decision_date: string | null; gap_count: number; named: string[] }> {
  const anchor = date
    ? 'd.decision_date = :date'
    : 'd.decision_date = (SELECT MAX(decision_date) FROM explorer_journey_decisions)';

  // The reason is returned raw and parsed by `namedGaps`, the SAME function the
  // Why drilldown uses. Extracting the gap in SQL was the first attempt and it
  // reintroduced a bug already fixed once: a pattern like `[^|]*` stops at a
  // pipe, and a multi-stage gap token carries its own bare pipe
  // (`...:learning|deciding`), so the gap would have been silently truncated
  // here while the drilldown showed it in full. One rule, one implementation.
  const rows = await sequelize.query<{ decision_date: string; reason: string }>(
    `SELECT d.decision_date, d.reason
       FROM explorer_journey_decisions d
      WHERE ${anchor} AND d.reason LIKE '%asset gaps:%'`,
    { replacements: date ? { date } : {}, type: QueryTypes.SELECT },
  );

  const named = new Set<string>();
  for (const r of rows) for (const g of namedGaps(r.reason)) named.add(g);

  return {
    decision_date: rows[0]?.decision_date ?? null,
    gap_count: rows.length,
    named: [...named],
  };
}

/** Re-exported for the unsupported-purpose panel, so the reasons come from one place. */
export { unsupportedPurposes };
