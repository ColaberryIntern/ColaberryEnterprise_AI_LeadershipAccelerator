import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * Who and how many are landing on the landing pages.
 *
 * WHY THIS EXISTS. Ali, 2026-10-15: "how do we see who and how many are landing on the landing
 * pages? where is that?" The honest answer at the time was nowhere. The tracker had been
 * recording every view - 258 events and 13 visitors across /lp/ paths in thirty days - and no
 * screen, route or query in the product surfaced any of it. Data collected and never shown is
 * indistinguishable from data never collected, except that it costs storage.
 *
 * ── THE GRAIN IS THE SESSION, NOT THE EVENT ──
 *
 * A page view count answers "how many times was this loaded", which is the least useful of the
 * three numbers. One person refreshing eight times is eight events, one session, one visitor.
 * The ratio matters: `page_events` held 258 rows for 13 visitors, so an events-only number would
 * have overstated the audience twentyfold.
 *
 * So each page reports visitors (people), sessions (visits) and views (loads), and the UI shows
 * people first. `visitor_sessions.entry_page` is the join, because a landing page is by
 * definition where a session STARTS - someone arriving at /lp/x from an ad is entering there,
 * and counting sessions that merely passed through would fold internal navigation into an
 * acquisition number.
 *
 * ── ATTRIBUTION IS READ, NOT RE-DERIVED ──
 *
 * `fbclid`, `gclid` and the UTMs are already extracted onto `visitor_sessions` by
 * `extractAttributionFromUrl` at session creation. This reads those columns. It was tempting to
 * add a second extractor here - the parameter is sitting in `page_events.page_url` too - and
 * that would have been a mistake: two extractors over one input eventually disagree, and then
 * neither number can be trusted. One writer, many readers.
 *
 * ZERO IS A REAL ANSWER. A page with no traffic returns zeros rather than being omitted, because
 * "this page has had no visitors" is exactly what someone checking on a campaign needs to see.
 */

export interface LandingPageTrafficRow {
  /** The hosted page's slug, and the brand it belongs to. */
  slug: string;
  brand_slug: string | null;
  status: string;
  /** Null means the renderer omits the tracker entirely - the page CANNOT be measured. */
  site_slug: string | null;
  /** People. The headline number. */
  visitors: number;
  /** Visits. One person can have several. */
  sessions: number;
  /** Loads. Inflated by refreshes; shown last for that reason. */
  views: number;
  /** Sessions that arrived with a paid click identifier on the URL. */
  ad_clicks: number;
  /** Sessions carrying a utm_campaign, i.e. tagged links of any kind. */
  utm_tagged: number;
  /** Visitors we can put a name to, because they became a lead. */
  identified_leads: number;
  first_seen: string | null;
  last_seen: string | null;
}

/**
 * Traffic for every hosted landing page, newest activity first.
 *
 * One query rather than one per page: there are tens of pages and `page_events` is the largest
 * table in the database, so a per-page loop would be tens of scans of it.
 */
export async function landingPageTraffic(days = 30): Promise<LandingPageTrafficRow[]> {
  // Bounded so a caller cannot ask for an unbounded scan of the biggest table we have.
  const windowDays = Math.min(Math.max(Math.trunc(days) || 30, 1), 365);

  return sequelize.query<LandingPageTrafficRow>(
    `
    WITH pages AS (
      SELECT lp.slug, lp.status, lp.site_slug, b.slug AS brand_slug,
             '/lp/' || COALESCE(b.slug, '') || '/' || lp.slug AS entry_path
        FROM landing_pages lp
        LEFT JOIN brands b ON b.id = lp.brand_id
       WHERE lp.kind = 'hosted'
    ),
    sess AS (
      SELECT s.entry_page,
             COUNT(DISTINCT s.id) AS sessions,
             COUNT(DISTINCT s.visitor_id) AS visitors,
             COUNT(DISTINCT CASE
               WHEN s.fbclid IS NOT NULL OR s.gclid IS NOT NULL
                 OR s.msclkid IS NOT NULL OR s.ttclid IS NOT NULL
               THEN s.id END) AS ad_clicks,
             COUNT(DISTINCT CASE WHEN s.utm_campaign IS NOT NULL THEN s.id END) AS utm_tagged,
             MIN(s.started_at) AS first_seen,
             MAX(s.started_at) AS last_seen
        FROM visitor_sessions s
       WHERE s.entry_page LIKE '/lp/%'
         AND s.started_at > NOW() - (:windowDays || ' days')::interval
       GROUP BY s.entry_page
    ),
    ev AS (
      SELECT pe.page_path,
             COUNT(*) AS views,
             COUNT(DISTINCT pe.lead_id) AS identified_leads
        FROM page_events pe
       WHERE pe.page_path LIKE '/lp/%'
         AND pe.created_at > NOW() - (:windowDays || ' days')::interval
       GROUP BY pe.page_path
    )
    SELECT p.slug,
           p.brand_slug,
           p.status,
           p.site_slug,
           COALESCE(sess.visitors, 0)::int        AS visitors,
           COALESCE(sess.sessions, 0)::int        AS sessions,
           COALESCE(ev.views, 0)::int             AS views,
           COALESCE(sess.ad_clicks, 0)::int       AS ad_clicks,
           COALESCE(sess.utm_tagged, 0)::int      AS utm_tagged,
           COALESCE(ev.identified_leads, 0)::int  AS identified_leads,
           sess.first_seen,
           sess.last_seen
      FROM pages p
      LEFT JOIN sess ON sess.entry_page = p.entry_path
      LEFT JOIN ev   ON ev.page_path    = p.entry_path
     ORDER BY COALESCE(sess.visitors, 0) DESC, p.slug ASC
    `,
    { type: QueryTypes.SELECT, replacements: { windowDays } },
  );
}
