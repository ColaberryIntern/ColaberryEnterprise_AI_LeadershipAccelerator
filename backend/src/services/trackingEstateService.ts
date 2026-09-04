import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * The whole tracking estate, as production actually has it.
 *
 * WHY SOURCES ARE REPORTED SEPARATELY FROM BRANDS, and this is the finding the screen
 * exists to make visible: FIVE distinct web properties currently resolve to the single
 * `colaberry-enterprise` brand — `colaberry`, `enterprise`, `worldoftaxonomy`, `advisor`
 * and `trustbeforeintelligence`. They are all registered lead sources, so their events
 * land correctly and are attributed correctly; they are simply pooled.
 *
 * The consequence is that every brand-keyed view — per-brand totals, cross-brand
 * journeys, the intent dashboard — reports those five as one thing. `worldoftaxonomy`
 * alone carries 161,881 events in thirty days, more than half of everything the estate
 * records, so "Colaberry Enterprise had 317,231 events" is a true number about five
 * different websites and mostly about one nobody would name. Nothing in a brand-keyed
 * screen hints at that.
 *
 * `site_slug` is the finer grain the data already has, so the estate is returned at BOTH
 * levels and the screen can show which sites hide inside which brand. Neither level is
 * wrong; presenting only the brand level is what misleads.
 */

export interface EstateBrand {
  brand_slug: string | null;
  brand_name: string | null;
  tenant_slug: string | null;
  events_30d: number;
  visitors_30d: number;
  pageviews_24h: number;
  scroll_24h: number;
  time_on_page_24h: number;
  cta_click_24h: number;
  click_24h: number;
  /** Largest single-visitor event count in the window. A skew detector. */
  top_visitor_events_30d: number;
}

export interface EstateHost {
  hostname: string;
  purpose: string | null;
  brand_slug: string | null;
  is_primary: boolean;
  registered: boolean;
  /** True when a campaign link to this host would carry a journey token. */
  in_token_allowlist: boolean;
}

export interface EstateSource {
  site_slug: string;
  visitors: number;
  events_30d: number;
  click_24h: number;
  scroll_24h: number;
  registered_brand: string | null;
  first_seen: Date | null;
  last_seen: Date | null;
}

export interface TrackingEstate {
  brands: EstateBrand[];
  hosts: EstateHost[];
  sources: EstateSource[];
  generated_at: string;
}

const BRANDS_SQL = `
  WITH ev AS (
    SELECT pe.brand_id,
           COUNT(*)                                                      AS events_30d,
           COUNT(DISTINCT pe.visitor_id)                                 AS visitors_30d,
           COUNT(*) FILTER (WHERE pe.timestamp >= NOW() - INTERVAL '24 hours'
                              AND pe.event_type = 'pageview')            AS pageviews_24h,
           COUNT(*) FILTER (WHERE pe.timestamp >= NOW() - INTERVAL '24 hours'
                              AND pe.event_type = 'scroll')              AS scroll_24h,
           COUNT(*) FILTER (WHERE pe.timestamp >= NOW() - INTERVAL '24 hours'
                              AND pe.event_type = 'time_on_page')        AS time_on_page_24h,
           COUNT(*) FILTER (WHERE pe.timestamp >= NOW() - INTERVAL '24 hours'
                              AND pe.event_type = 'cta_click')           AS cta_click_24h,
           COUNT(*) FILTER (WHERE pe.timestamp >= NOW() - INTERVAL '24 hours'
                              AND pe.event_type = 'click')               AS click_24h
    FROM page_events pe
    WHERE pe.timestamp >= NOW() - INTERVAL '30 days'
    GROUP BY pe.brand_id
  ),
  top_visitor AS (
    -- The largest single contributor per brand. One internal browser can carry most of a
    -- brand's volume, and a total that hides that is a misleading total.
    SELECT brand_id, MAX(n) AS top_visitor_events_30d
    FROM (
      SELECT pe.brand_id, pe.visitor_id, COUNT(*) AS n
      FROM page_events pe
      WHERE pe.timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY pe.brand_id, pe.visitor_id
    ) q
    GROUP BY brand_id
  )
  SELECT b.slug AS brand_slug, b.name AS brand_name, t.slug AS tenant_slug,
         COALESCE(ev.events_30d,0)::int       AS events_30d,
         COALESCE(ev.visitors_30d,0)::int     AS visitors_30d,
         COALESCE(ev.pageviews_24h,0)::int    AS pageviews_24h,
         COALESCE(ev.scroll_24h,0)::int       AS scroll_24h,
         COALESCE(ev.time_on_page_24h,0)::int AS time_on_page_24h,
         COALESCE(ev.cta_click_24h,0)::int    AS cta_click_24h,
         COALESCE(ev.click_24h,0)::int        AS click_24h,
         COALESCE(tv.top_visitor_events_30d,0)::int AS top_visitor_events_30d
  FROM brands b
  JOIN tenants t ON t.id = b.tenant_id
  LEFT JOIN ev ON ev.brand_id = b.id
  LEFT JOIN top_visitor tv ON tv.brand_id = b.id
  ORDER BY events_30d DESC
`;

const HOSTS_SQL = `
  SELECT bd.hostname, bd.purpose, b.slug AS brand_slug, bd.is_primary
  FROM brand_domains bd
  JOIN brands b ON b.id = bd.brand_id
  ORDER BY b.slug, bd.hostname, bd.purpose
`;

/**
 * Per-site metrics.
 *
 * A CAVEAT THAT SHAPES HOW THESE READ: `site_slug` lives on the VISITOR, not the event,
 * and it is first-touch — set once when the visitor is created and never overwritten. So
 * these totals are "events by people who arrived via this site", not "events on this
 * site". For someone who only ever visits one property they are the same number; for a
 * genuine cross-site visitor the events are all credited to where they first landed.
 *
 * That is the grain the data actually has. Presenting it as per-site pageviews without
 * saying so would overstate the precision.
 */
const SOURCES_SQL = `
  SELECT v.site_slug,
         COUNT(DISTINCT v.id)::int AS visitors,
         MIN(v.first_seen_at)      AS first_seen,
         MAX(v.last_seen_at)       AS last_seen,
         COALESCE(COUNT(pe.id) FILTER (
           WHERE pe.timestamp >= NOW() - INTERVAL '30 days'), 0)::int AS events_30d,
         COALESCE(COUNT(pe.id) FILTER (
           WHERE pe.timestamp >= NOW() - INTERVAL '24 hours'
             AND pe.event_type = 'click'), 0)::int                    AS click_24h,
         COALESCE(COUNT(pe.id) FILTER (
           WHERE pe.timestamp >= NOW() - INTERVAL '24 hours'
             AND pe.event_type = 'scroll'), 0)::int                   AS scroll_24h,
         (SELECT b2.slug FROM lead_sources ls
          JOIN brands b2 ON b2.id = ls.brand_id
          WHERE ls.slug = v.site_slug LIMIT 1) AS registered_brand
  FROM visitors v
  LEFT JOIN page_events pe ON pe.visitor_id = v.id
  WHERE v.site_slug IS NOT NULL
  GROUP BY v.site_slug
  ORDER BY events_30d DESC
`;

/** Purposes whose hostnames a campaign link may point at, matching journeyLinkRewriter. */
const LINKABLE = new Set(['web', 'app']);

export async function getTrackingEstate(): Promise<TrackingEstate> {
  const [brands, hostRows, sources] = await Promise.all([
    sequelize.query<EstateBrand>(BRANDS_SQL, { type: QueryTypes.SELECT }),
    sequelize.query<Omit<EstateHost, 'registered' | 'in_token_allowlist'>>(HOSTS_SQL, {
      type: QueryTypes.SELECT,
    }),
    sequelize.query<EstateSource>(SOURCES_SQL, { type: QueryTypes.SELECT }),
  ]);

  const hosts: EstateHost[] = hostRows.map((h) => ({
    ...h,
    registered: true,
    // Mirrors the rewriter's rule exactly rather than restating it loosely: if this
    // screen and the mail path disagree about what carries a token, the screen is worse
    // than useless because it is confidently wrong.
    in_token_allowlist: LINKABLE.has(String(h.purpose)),
  }));

  return {
    brands,
    hosts,
    sources,
    generated_at: new Date().toISOString(),
  };
}
