import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { botExclusionSql } from './visitorBotDetection';

/**
 * People who touched more than one brand, as one row per human.
 *
 * WHY THIS EXISTS. Every admin visitor surface reads as single-brand: it can tell you
 * who visited, and it can tell you their intent, but it cannot tell you that the person
 * reading AI Flotation's pricing page this morning is the same person who read
 * Refactored's enterprise page last week. The data has always been able to answer that —
 * `page_events` carries `brand_id` on every row — but nothing asked.
 *
 * ONE ROW PER HUMAN, NOT PER SITE. That is the whole point. A visitor who touched three
 * brands appears once, with the brands in the order they first met them, rather than as
 * three unrelated rows that happen to share a fingerprint.
 *
 * WHAT "SAME PERSON" MEANS HERE, stated because it bounds the answer. Rows are grouped by
 * `visitor_id`, which is a browser identity. Two devices are two visitors until something
 * stitches them — a form submission, a signed-in portal session, or a `jx` link. So this
 * UNDERCOUNTS cross-brand journeys and never overcounts them: it cannot invent a
 * connection that identity resolution has not already made.
 *
 * Raw SQL rather than Sequelize aggregation because the shape is a grouped array
 * (`array_agg` ordered by first touch) that the ORM would round-trip badly, and because
 * the ordering inside the aggregate is load-bearing — "which brand did they meet first"
 * is most of the value.
 */

export interface CrossBrandVisitor {
  visitor_id: string;
  fingerprint: string;
  lead_id: number | null;
  lead_name: string | null;
  lead_email: string | null;
  brand_slugs: string[];
  brand_count: number;
  intent_score: number | null;
  intent_level: string | null;
  categories: string[];
  first_seen_at: Date;
  last_seen_at: Date;
  event_count: number;
}

export interface CrossBrandQuery {
  /** Minimum distinct brands a visitor must have touched. 2 is the interesting floor. */
  minBrands?: number;
  /** Look-back window in days. */
  days?: number;
  limit?: number;
  /**
   * Bots are excluded by default, matching every other visitor surface: a crawler that
   * walks two brands is not a cross-brand journey, and it is the single easiest way for
   * this view to look busier than the truth. The first real run of this query returned
   * two rows, one of them a visitor with 13,136 events in three weeks — which is what
   * this flag exists to keep out.
   */
  includeBots?: boolean;
}

const buildSql = (botFilter: string) => `
  WITH touched AS (
    SELECT
      pe.visitor_id,
      b.slug                                   AS brand_slug,
      MIN(pe.timestamp)                        AS first_touch,
      COUNT(*)                                 AS events
    FROM page_events pe
    JOIN brands b ON b.id = pe.brand_id
    JOIN visitors bv ON bv.id = pe.visitor_id
    WHERE pe.timestamp >= NOW() - (:days * INTERVAL '1 day')
      AND pe.brand_id IS NOT NULL
      ${botFilter}
    GROUP BY pe.visitor_id, b.slug
  ),
  rolled AS (
    SELECT
      t.visitor_id,
      -- Ordered by first touch, so the array reads as the journey rather than
      -- alphabetically. This ordering is the point of the whole query.
      ARRAY_AGG(t.brand_slug ORDER BY t.first_touch)      AS brand_slugs,
      COUNT(DISTINCT t.brand_slug)                        AS brand_count,
      MIN(t.first_touch)                                  AS first_seen_at,
      SUM(t.events)                                       AS event_count
    FROM touched t
    GROUP BY t.visitor_id
    HAVING COUNT(DISTINCT t.brand_slug) >= :minBrands
  ),
  cats AS (
    SELECT
      pe.visitor_id,
      ARRAY_AGG(DISTINCT pe.page_category) AS categories
    FROM page_events pe
    WHERE pe.timestamp >= NOW() - (:days * INTERVAL '1 day')
      AND pe.page_category IS NOT NULL
      AND pe.page_category <> 'other'
    GROUP BY pe.visitor_id
  )
  SELECT
    r.visitor_id,
    v.fingerprint,
    v.lead_id,
    l.name                       AS lead_name,
    l.email                      AS lead_email,
    r.brand_slugs,
    r.brand_count::int           AS brand_count,
    i.score                      AS intent_score,
    i.intent_level,
    COALESCE(c.categories, ARRAY[]::text[]) AS categories,
    r.first_seen_at,
    v.last_seen_at,
    r.event_count::int           AS event_count
  FROM rolled r
  JOIN visitors v      ON v.id = r.visitor_id
  LEFT JOIN leads l    ON l.id = v.lead_id
  LEFT JOIN intent_scores i ON i.visitor_id = r.visitor_id
  LEFT JOIN cats c     ON c.visitor_id = r.visitor_id
  -- Highest intent first, because the question this answers is "who should we talk to".
  -- NULLS LAST so an unscored visitor never outranks a scored one.
  ORDER BY i.score DESC NULLS LAST, r.brand_count DESC, v.last_seen_at DESC
  LIMIT :limit
`;

export async function getCrossBrandVisitors(
  query: CrossBrandQuery = {},
): Promise<CrossBrandVisitor[]> {
  // Bounded rather than trusted: this is an admin surface, but a limit of 10 million
  // would still be a way to make the database do something expensive by accident.
  //
  // A non-positive value falls back to the DEFAULT rather than being clamped to the
  // floor, and that distinction matters more than it looks. Clamping `minBrands: -5` to
  // 1 would quietly turn "people who touched two or more brands" into "everyone" — the
  // endpoint would still return 200 and a full list, and the screen would be answering a
  // different question than its name. A garbled input should give the intended answer,
  // not a plausible wrong one.
  const bound = (raw: unknown, fallback: number, lo: number, hi: number): number => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(Math.max(Math.floor(n), lo), hi);
  };

  const minBrands = bound(query.minBrands, 2, 1, 10);
  const days = bound(query.days, 30, 1, 365);
  const limit = bound(query.limit, 50, 1, 500);

  // Same predicate the live-visitor surface uses, from the same helper, so "who counts
  // as a bot" cannot drift between two screens that claim to show the same people.
  const botFilter = query.includeBots ? '' : `AND ${botExclusionSql('bv."user_agent"')}`;

  return sequelize.query<CrossBrandVisitor>(buildSql(botFilter), {
    type: QueryTypes.SELECT,
    replacements: { minBrands, days, limit },
  });
}
