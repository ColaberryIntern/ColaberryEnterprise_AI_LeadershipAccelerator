import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { PURPOSE_SPECS, stageTagsFor, type SupportedPurpose } from './assetPurposeMap';
import type { ContentAssetQuery } from '../governor/types';

/**
 * Explorer Growth OS — EPIC 5 T004. Turn a Governor asset request into concrete
 * assets, or into a NAMED refusal.
 *
 * THE ONE RULE THIS MODULE EXISTS TO HOLD: it never substitutes. If the purpose
 * cannot be answered, it says so and says why. A resolver that quietly returns
 * "some other lesson" when the right one is missing is the same defect as
 * consent-absence read as permission — a system inventing a decision out of a
 * gap — and it would make the shadow gap report a fiction.
 *
 * Reads only. Nothing here can send.
 */

/** One resolved asset, as it lands on the decision row. */
export interface ResolvedAsset {
  id: string;
  asset_type: string;
  title: string;
  url: string | null;
  source_system: string;
  source_id: string | null;
}

/**
 * Deliberately a discriminated union rather than an array that might be empty.
 *
 * An empty list and a refusal must not look alike to the caller: one means "this
 * purpose has no content behind it", the other means "nothing matched THIS
 * learner". Collapsing them is how a resolver bug gets filed as a content gap.
 */
export type ResolvedAssets =
  | { resolved: true; assets: ResolvedAsset[] }
  | { resolved: false; reason: string };

/**
 * Rows are filtered in SQL, then RANKED in SQL.
 *
 * Affinity is a RANKING, NOT A FILTER, and that is a deliberate choice rather
 * than an oversight. `weekly_digest` is satisfiable by any lesson; a learner
 * whose declared interest matches nothing in the registry should get the
 * best-priority lesson, not a manufactured gap. Filtering on affinity would
 * invent absences the content does not actually have.
 *
 * KNOWN AND HONEST: affinity ranking is INERT today, on both sides. All 153
 * profiles carry an empty affinity list, and the timeline sync writes
 * `topic_tags` while leaving `affinity_tags` at its `{}` default. Nothing here
 * pretends otherwise, and no mapping between the two was invented to make the
 * feature look alive — that would be authoring a targeting signal nobody
 * measured.
 */
const RESOLVE_SQL = `
  SELECT id, asset_type, title, url, source_system, source_id
    FROM explorer_content_assets
   WHERE active = true
     AND asset_type = ANY(CAST(:kinds AS text[]))
     AND (starts_at IS NULL OR starts_at <= :as_of)
     AND (expires_at IS NULL OR expires_at > :as_of)
     AND 'email' = ANY(allowed_channels)
     AND (:stage_tags IS NULL OR journey_stage_tags && CAST(:stage_tags AS text[]))
   ORDER BY CASE WHEN CAST(:affinity_tags AS text[]) = '{}'::text[] THEN 0
                 WHEN affinity_tags && CAST(:affinity_tags AS text[]) THEN 0
                 ELSE 1 END,
            priority DESC,
            published_at DESC NULLS LAST,
            id
   LIMIT :max_rows
`;

/** Postgres array literal for a text[] bind. */
function pgArray(values: readonly string[]): string {
  return `{${values.map((v) => `"${String(v).replace(/(["\\])/g, '\\$1')}"`).join(',')}}`;
}

/**
 * Resolve one asset query.
 *
 * Every exit is either assets or a named reason. There is no path that returns
 * an empty success.
 */
export async function resolveContentAssets(
  query: ContentAssetQuery,
  asOf: Date,
): Promise<ResolvedAssets> {
  const spec = PURPOSE_SPECS[query.asset_type];

  // 1. A purpose nothing can answer. Its declared reason travels to the caller
  //    verbatim so the gap report can say WHY, not just how many.
  if (!spec.supported) return { resolved: false, reason: spec.reason };

  const supported = spec as SupportedPurpose;

  // 2/3. Stage. `null` means DO NOT FILTER — which is not the same as an empty
  //      list, and the SQL treats it that way explicitly rather than by
  //      accident of an empty array matching nothing.
  const stages = stageTagsFor(supported, query.state);

  const rows = await sequelize.query<ResolvedAsset>(RESOLVE_SQL, {
    type: QueryTypes.SELECT,
    replacements: {
      kinds: pgArray(supported.kinds),
      as_of: asOf,
      stage_tags: stages ? pgArray(stages) : null,
      // 4. An empty affinity list means NO PREFERENCE. Read as "match nothing"
      //    it would return zero assets for all 153 learners — every one of whom
      //    has an empty list — and look exactly like a content shortage.
      affinity_tags: pgArray(query.affinity_tags ?? []),
      max_rows: supported.limit,
    },
  });

  // 6. Nothing matched. A named refusal, never a substitute.
  if (rows.length === 0) {
    return {
      resolved: false,
      reason: `no_asset_for_purpose:${query.asset_type}${stages ? `:${stages.join('|')}` : ''}`,
    };
  }

  return { resolved: true, assets: rows };
}

/**
 * Resolve every query a candidate carries.
 *
 * ALL entries, not just the first: a candidate may legitimately ask for more
 * than one thing, and resolving only the head would drop the rest silently.
 *
 * Partial success is reported as such. One resolvable asset does not make the
 * others appear, and one gap does not discard the assets that did resolve —
 * the decision records both, and the gap text is what the shadow review reads.
 */
export async function resolveAllForCandidate(
  queries: ContentAssetQuery[],
  asOf: Date,
): Promise<{ assets: ResolvedAsset[]; gaps: string[] }> {
  const assets: ResolvedAsset[] = [];
  const gaps: string[] = [];

  for (const q of queries) {
    const result = await resolveContentAssets(q, asOf);
    if (result.resolved) assets.push(...result.assets);
    else gaps.push(result.reason);
  }

  return { assets, gaps };
}
