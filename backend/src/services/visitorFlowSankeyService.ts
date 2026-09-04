import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { botExclusionSql, notAutomatedSessionSql } from './visitorBotDetection';

/**
 * Traffic source -> site entered -> outcome, as a Sankey.
 *
 * WHAT THIS REPLACES. The Navigation Flow tab rendered a force-directed graph of
 * page-to-page movement. A force layout answers "what is connected to what",
 * which is a question about topology; the question actually asked of this screen
 * is "where does traffic come from, which property does it land on, and what
 * happens to it" — a question about VOLUME along a path. Sankey band width is
 * proportional to sessions, so that answer is readable at a glance instead of
 * being interrogated out of a node cloud.
 *
 * THREE STAGES, NOT MORE. Every extra stage multiplies the crossings and a Sankey
 * stops being legible somewhere around four. Source, site and outcome are the
 * three the business acts on.
 *
 * BOTS ARE EXCLUDED, using the same predicates as the live view. That matters
 * more here than on the live table: roughly 74% of sessions are crawlers, and on
 * a width-proportional chart they are not noise at the edges — they are the shape
 * of the whole diagram. An unfiltered Sankey would be a portrait of Googlebot.
 */

export interface SankeyNode {
  name: string;
  /** Which column the node sits in — lets the client colour by stage. */
  stage: 'source' | 'site' | 'outcome';
}

export interface SankeyLink {
  source: number;
  target: number;
  value: number;
}

export interface VisitorFlowSankey {
  nodes: SankeyNode[];
  links: SankeyLink[];
  total_sessions: number;
  days: number;
  /** The rows behind the picture, so the chart is never the only way to read it. */
  table: Array<{ source: string; site: string; outcome: string; sessions: number }>;
}

export interface FlowRow {
  source: string;
  site: string;
  outcome: string;
  sessions: number;
}

/**
 * Sources beyond this fold into "Other".
 *
 * Not cosmetic: a Sankey with twenty source nodes is a hairball and the long tail
 * is individually meaningless. The fold is still REPORTED in the table, so the
 * totals reconcile rather than quietly shrinking.
 */
const MAX_SOURCES = 6;

/**
 * Outcomes hold a fixed order rather than a volume order.
 *
 * This column is a scale from best to worst. Ranking it by volume would move the
 * same label to a different height on every refresh, so a reader comparing two
 * loads would be comparing two different pictures.
 */
const OUTCOME_ORDER = ['Identified', 'Engaged', 'Left', 'Bounced'] as const;

/**
 * A referrer domain reduced to something a person recognises.
 *
 * `www.google.co.uk` and `google.com` are the same answer to "where did they come
 * from", and keeping them apart splits one readable band into several thin ones
 * that say less than the sum would.
 */
export function normaliseSource(referrerDomain: string | null | undefined): string {
  if (!referrerDomain) return 'Direct';
  const host = String(referrerDomain).trim().toLowerCase().replace(/^www\./, '');
  if (!host) return 'Direct';

  if (/(^|\.)google\./.test(host)) return 'Google';
  if (/(^|\.)bing\./.test(host)) return 'Bing';
  if (/(^|\.)duckduckgo\./.test(host)) return 'DuckDuckGo';
  if (/(^|\.)linkedin\./.test(host) || host === 'lnkd.in') return 'LinkedIn';
  if (/(^|\.)facebook\./.test(host) || /(^|\.)fb\./.test(host)) return 'Facebook';
  if (/(^|\.)instagram\./.test(host)) return 'Instagram';
  if (/(^|\.)x\.com$/.test(host) || /(^|\.)twitter\./.test(host) || host === 't.co') return 'X';
  if (/(^|\.)youtube\./.test(host) || host === 'youtu.be') return 'YouTube';
  if (/(^|\.)reddit\./.test(host)) return 'Reddit';
  if (/(^|\.)eventbrite\./.test(host)) return 'Eventbrite';
  if (/(^|\.)skool\./.test(host)) return 'Skool';
  return host;
}

export async function getVisitorFlowSankey(days = 30, includeBots = false): Promise<VisitorFlowSankey> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const botFilter = includeBots
    ? ''
    : `AND ${botExclusionSql('v."user_agent"')}
       AND ${notAutomatedSessionSql('vs."pageview_count"', 'vs."duration_seconds"')}`;

  /**
   * Outcome, in priority order:
   *   Identified — the visitor is linked to a lead. The only outcome that is a
   *                business result rather than a behaviour.
   *   Bounced    — the session's own bounce flag.
   *   Engaged    — more than one page, so they went somewhere deliberately.
   *   Left       — a single page not flagged as a bounce.
   * The strongest true statement wins: someone identified who also bounced is
   * still Identified, because that is the fact worth acting on.
   */
  const rows = await sequelize.query<FlowRow>(
    `SELECT
       COALESCE(NULLIF(vs.referrer_domain, ''), '') AS source,
       COALESCE(NULLIF(vs.site_slug, ''), NULLIF(v.site_slug, ''), 'unknown') AS site,
       CASE
         WHEN v.lead_id IS NOT NULL THEN 'Identified'
         WHEN vs.is_bounce IS TRUE THEN 'Bounced'
         WHEN COALESCE(vs.pageview_count, 0) > 1 THEN 'Engaged'
         ELSE 'Left'
       END AS outcome,
       COUNT(*)::int AS sessions
     FROM visitor_sessions vs
     JOIN visitors v ON v.id = vs.visitor_id
     WHERE vs.started_at >= :since
       ${botFilter}
     GROUP BY 1, 2, 3`,
    { replacements: { since }, type: QueryTypes.SELECT }
  );

  return buildSankey(rows, days);
}

/** Add `value` to the count stored at map[a][b]. */
function addPair(map: Map<string, Map<string, number>>, a: string, b: string, value: number): void {
  let inner = map.get(a);
  if (!inner) {
    inner = new Map<string, number>();
    map.set(a, inner);
  }
  inner.set(b, (inner.get(b) ?? 0) + value);
}

/**
 * Pure shaping, exported so it can be tested without a database.
 *
 * Pairs are held in NESTED MAPS rather than under a joined string key. A composite
 * key would have to be split again to build the links, and any separator can occur
 * inside a referrer hostname — the result would be traffic attached to a node it
 * never touched, drawn as a perfectly plausible diagram. Nested maps cannot
 * express that mistake.
 *
 * The invariant the tests assert: value is conserved across both hops. The two
 * link layers must each sum to the same total, or a width-proportional chart is
 * misstating volume, which is the one thing it must never do.
 */
export function buildSankey(rows: FlowRow[], days: number): VisitorFlowSankey {
  const normalised = rows.map((r) => ({
    source: normaliseSource(r.source),
    site: (r.site || 'unknown').trim() || 'unknown',
    outcome: r.outcome,
    sessions: Number(r.sessions) || 0,
  }));

  // Fold the long tail of sources into "Other" before any node is built.
  const bySource = new Map<string, number>();
  for (const r of normalised) bySource.set(r.source, (bySource.get(r.source) ?? 0) + r.sessions);
  const keptSources = new Set(
    [...bySource.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_SOURCES)
      .map(([name]) => name)
  );
  const folded = normalised
    .filter((r) => r.sessions > 0)
    .map((r) => ({ ...r, source: keptSources.has(r.source) ? r.source : 'Other' }));

  const sourceTotals = new Map<string, number>();
  const siteTotals = new Map<string, number>();
  const outcomeTotals = new Map<string, number>();
  const sourceToSite = new Map<string, Map<string, number>>();
  const siteToOutcome = new Map<string, Map<string, number>>();

  for (const r of folded) {
    sourceTotals.set(r.source, (sourceTotals.get(r.source) ?? 0) + r.sessions);
    siteTotals.set(r.site, (siteTotals.get(r.site) ?? 0) + r.sessions);
    outcomeTotals.set(r.outcome, (outcomeTotals.get(r.outcome) ?? 0) + r.sessions);
    addPair(sourceToSite, r.source, r.site, r.sessions);
    addPair(siteToOutcome, r.site, r.outcome, r.sessions);
  }

  const byVolumeDesc = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);

  const sources = byVolumeDesc(sourceTotals);
  const sites = byVolumeDesc(siteTotals);
  const outcomes = OUTCOME_ORDER.filter((o) => outcomeTotals.has(o));

  const nodes: SankeyNode[] = [
    ...sources.map((name) => ({ name, stage: 'source' as const })),
    ...sites.map((name) => ({ name, stage: 'site' as const })),
    ...outcomes.map((name) => ({ name, stage: 'outcome' as const })),
  ];

  // Index per stage, so a site and a source sharing a name cannot collide.
  const sourceIndex = new Map(sources.map((name, i) => [name, i]));
  const siteIndex = new Map(sites.map((name, i) => [name, sources.length + i]));
  // Typed as string keys, not the literal union: the outcome arriving from the
  // pair map is a plain string, and narrowing here would only push the cast to
  // the lookup site.
  const outcomeIndex = new Map<string, number>(
    outcomes.map((name, i) => [name as string, sources.length + sites.length + i]),
  );

  const links: SankeyLink[] = [];
  for (const [source, targets] of sourceToSite) {
    for (const [site, value] of targets) {
      links.push({ source: sourceIndex.get(source)!, target: siteIndex.get(site)!, value });
    }
  }
  for (const [site, targets] of siteToOutcome) {
    for (const [outcome, value] of targets) {
      links.push({ source: siteIndex.get(site)!, target: outcomeIndex.get(outcome)!, value });
    }
  }

  const total = [...siteTotals.values()].reduce((a, b) => a + b, 0);

  return {
    nodes,
    links,
    total_sessions: total,
    days,
    table: folded
      .slice()
      .sort((a, b) => b.sessions - a.sessions)
      .map((r) => ({ source: r.source, site: r.site, outcome: r.outcome, sessions: r.sessions })),
  };
}
