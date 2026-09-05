import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { botExclusionSql, notAutomatedSessionSql, engagedVisitorSql } from './visitorBotDetection';

/**
 * The visitor KPI frame: reach -> acquisition -> engagement -> conversion.
 *
 * WHY THIS EXISTS. The Traffic Flow chart reported three session-based outcome
 * shares and nothing else, so the most basic question a marketer asks — "how many
 * PEOPLE came to the site in the last 30 days" — was unanswerable from it. 4,484
 * sessions is not 4,484 anyone; it is 994 people who visited 4.5 times each, and
 * those are different facts that lead to different decisions.
 *
 * EVERYTHING HERE COUNTS DISTINCT VISITORS, not sessions, except where a session
 * count is the honest unit (sessions-per-visitor, bounce rate). A conversion rate
 * measured per session would divide by a number inflated 4.5x and understate the
 * business by the same factor.
 *
 * THE ORDER IS THE POINT. Reach, then acquisition, then engagement, then
 * conversion, is the sequence a visitor actually moves through, so a number that
 * looks wrong can be traced to the stage before it rather than guessed at.
 */

export interface ChannelKpi {
  channel: string;
  unique_visitors: number;
  sessions: number;
  converted: number;
  conversion_rate: number;
}

export interface VisitorKpis {
  days: number;
  /** Reach */
  unique_visitors: number;
  unique_visitors_7d: number;
  sessions: number;
  /**
   * Visitors who actually looked at something — any session beyond 10 seconds or
   * one page, plus anyone who converted. The gap between this and
   * `unique_visitors` is the share of traffic that is a hit rather than a read,
   * and on this site it is most of it.
   */
  engaged_visitors: number;
  shallow_visitors: number;
  /** Conversion measured against the engaged denominator, which is the honest one. */
  engaged_conversion_rate: number;
  /** Acquisition */
  new_visitors: number;
  returning_visitors: number;
  new_visitor_rate: number;
  /** Engagement */
  sessions_per_visitor: number;
  bounce_rate: number;
  /** Conversion */
  converted_visitors: number;
  conversion_rate: number;
  /** Conversion split by property, and by traffic source once referrers land. */
  by_site: ChannelKpi[];
  by_source: ChannelKpi[];
  /**
   * True when no session in the window carries a referrer or UTM. Referrer
   * capture only shipped on 2026-09-04 and `document.referrer` cannot be
   * backfilled, so the source breakdown is empty by construction until new
   * traffic arrives. Stating that on the surface is the difference between "no
   * data yet" and "all your traffic is direct", which are opposite conclusions.
   */
  source_attribution_pending: boolean;
}

interface HeadlineRow {
  unique_visitors: number;
  unique_visitors_7d: number;
  sessions: number;
  new_visitors: number;
  returning_visitors: number;
  converted_visitors: number;
  bounce_sessions: number;
  engaged_visitors: number;
}

interface ChannelRow {
  channel: string;
  unique_visitors: number;
  sessions: number;
  converted: number;
}

/** The human-session predicate, shared with the rest of the dashboard. */
function humanFilter(includeBots: boolean): string {
  if (includeBots) return '';
  return (
    `AND EXISTS (SELECT 1 FROM "visitors" hv WHERE hv."id" = vs."visitor_id" ` +
    `AND ${botExclusionSql('hv."user_agent"')}) ` +
    `AND ${notAutomatedSessionSql('vs."pageview_count"', 'vs."duration_seconds"')}`
  );
}

function rate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

export async function getVisitorKpis(days = 30, includeBots = false): Promise<VisitorKpis> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const filter = humanFilter(includeBots);

  /**
   * `new` vs `returning` is judged on the visitor's FIRST EVER sighting, not on
   * whether they appear twice inside the window. Someone who first arrived in
   * March and came back yesterday is a returning visitor even though this window
   * holds only one of their sessions — and they are the more valuable signal.
   */
  const [headline] = await sequelize.query<HeadlineRow>(
    `SELECT
       COUNT(DISTINCT vs.visitor_id)::int                                                        AS unique_visitors,
       COUNT(DISTINCT vs.visitor_id) FILTER (WHERE vs.started_at >= :since7)::int                AS unique_visitors_7d,
       COUNT(*)::int                                                                              AS sessions,
       COUNT(DISTINCT vs.visitor_id) FILTER (WHERE v.first_seen_at >= :since)::int                AS new_visitors,
       COUNT(DISTINCT vs.visitor_id) FILTER (WHERE v.first_seen_at <  :since)::int                AS returning_visitors,
       COUNT(DISTINCT vs.visitor_id) FILTER (WHERE v.lead_id IS NOT NULL)::int                    AS converted_visitors,
       COUNT(*) FILTER (WHERE vs.is_bounce IS TRUE)::int                                          AS bounce_sessions,
       COUNT(DISTINCT vs.visitor_id) FILTER (
         WHERE ${engagedVisitorSql('vs."visitor_id"', 'v."lead_id"')}
       )::int                                                                                     AS engaged_visitors
     FROM visitor_sessions vs
     JOIN visitors v ON v.id = vs.visitor_id
     WHERE vs.started_at >= :since
       ${filter}`,
    { replacements: { since, since7 }, type: QueryTypes.SELECT }
  );

  const bySite = await sequelize.query<ChannelRow>(
    `SELECT
       COALESCE(NULLIF(vs.site_slug, ''), NULLIF(v.site_slug, ''), 'unknown')      AS channel,
       COUNT(DISTINCT vs.visitor_id)::int                                          AS unique_visitors,
       COUNT(*)::int                                                               AS sessions,
       COUNT(DISTINCT vs.visitor_id) FILTER (WHERE v.lead_id IS NOT NULL)::int     AS converted
     FROM visitor_sessions vs
     JOIN visitors v ON v.id = vs.visitor_id
     WHERE vs.started_at >= :since
       ${filter}
     GROUP BY 1
     ORDER BY 2 DESC`,
    { replacements: { since }, type: QueryTypes.SELECT }
  );

  /**
   * Source is referrer first, UTM second. Sessions with neither are EXCLUDED
   * rather than bucketed as "Direct": until referrer capture has run for a while
   * every row would land in Direct, and a 100%-Direct chart is not a finding
   * about the audience — it is the shape of a field that was empty. Better to
   * show nothing and say why.
   */
  const bySource = await sequelize.query<ChannelRow>(
    `SELECT
       COALESCE(NULLIF(vs.referrer_domain, ''), NULLIF(v.utm_source, ''))          AS channel,
       COUNT(DISTINCT vs.visitor_id)::int                                          AS unique_visitors,
       COUNT(*)::int                                                               AS sessions,
       COUNT(DISTINCT vs.visitor_id) FILTER (WHERE v.lead_id IS NOT NULL)::int     AS converted
     FROM visitor_sessions vs
     JOIN visitors v ON v.id = vs.visitor_id
     WHERE vs.started_at >= :since
       AND COALESCE(NULLIF(vs.referrer_domain, ''), NULLIF(v.utm_source, '')) IS NOT NULL
       ${filter}
     GROUP BY 1
     ORDER BY 2 DESC
     LIMIT 12`,
    { replacements: { since }, type: QueryTypes.SELECT }
  );

  const uniqueVisitors = Number(headline?.unique_visitors ?? 0);
  const sessions = Number(headline?.sessions ?? 0);
  const newVisitors = Number(headline?.new_visitors ?? 0);
  const converted = Number(headline?.converted_visitors ?? 0);
  const engaged = Number(headline?.engaged_visitors ?? 0);

  const toChannel = (r: ChannelRow): ChannelKpi => ({
    channel: r.channel || 'unknown',
    unique_visitors: Number(r.unique_visitors),
    sessions: Number(r.sessions),
    converted: Number(r.converted),
    conversion_rate: rate(Number(r.converted), Number(r.unique_visitors)),
  });

  return {
    days,
    unique_visitors: uniqueVisitors,
    unique_visitors_7d: Number(headline?.unique_visitors_7d ?? 0),
    sessions,
    engaged_visitors: engaged,
    shallow_visitors: Math.max(0, uniqueVisitors - engaged),
    // Against ENGAGED visitors, not all fingerprints. 23 leads from 995 hits
    // reads 2.3%; from the ~377 people who actually looked it is ~6% — and the
    // second is the number that describes the site's persuasiveness.
    engaged_conversion_rate: rate(converted, engaged),
    new_visitors: newVisitors,
    returning_visitors: Number(headline?.returning_visitors ?? 0),
    new_visitor_rate: rate(newVisitors, uniqueVisitors),
    // Rounded to one decimal: 4.5 visits per person is the actionable fact, and
    // the extra digits imply a precision a fingerprint-based count does not have.
    sessions_per_visitor: uniqueVisitors ? Math.round((sessions / uniqueVisitors) * 10) / 10 : 0,
    bounce_rate: rate(Number(headline?.bounce_sessions ?? 0), sessions),
    converted_visitors: converted,
    // Per VISITOR, not per session. Dividing by 4,484 sessions instead of 994
    // people would report 0.5% where the truth is 2.3% — understating the funnel
    // by the exact factor of repeat visits.
    conversion_rate: rate(converted, uniqueVisitors),
    by_site: bySite.map(toChannel),
    by_source: bySource.map(toChannel),
    source_attribution_pending: bySource.length === 0,
  };
}
