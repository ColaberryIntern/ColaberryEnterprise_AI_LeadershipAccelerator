import { Op, fn, col, literal, QueryTypes } from 'sequelize';
import { Visitor, VisitorSession, PageEvent, Lead, IntentScore, Campaign } from '../models';
import { sequelize } from '../config/database';
import { botExclusionSql, isBotUserAgent } from './visitorBotDetection';

// ---------------------------------------------------------------------------
// 1. Live Visitors
// ---------------------------------------------------------------------------

export async function getLiveVisitors(limit = 50, includeBots = false): Promise<any[]> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  // Find sessions that have at least one PageEvent with timestamp within the
  // last 5 minutes. Use a literal subquery in the WHERE clause so Sequelize
  // does not need a raw query.
  //
  // The bot predicate is applied HERE, in the same WHERE as the recency test,
  // rather than by filtering the returned rows. Post-filtering would interact
  // with LIMIT — asking for 50 and dropping the bots among them returns fewer
  // than 50 while more live humans exist further down, which looks like a quiet
  // site rather than a truncated query.
  const sessions = await VisitorSession.findAll({
    where: {
      [Op.and]: [
        literal(
          `EXISTS (SELECT 1 FROM "page_events" WHERE "page_events"."session_id" = "VisitorSession"."id" AND "page_events"."timestamp" > '${fiveMinutesAgo.toISOString()}')`
        ),
        ...(includeBots
          ? []
          : [
              literal(
                `EXISTS (SELECT 1 FROM "visitors" bv WHERE bv."id" = "VisitorSession"."visitor_id" AND ${botExclusionSql('bv."user_agent"')})`
              ),
            ]),
      ],
    },
    include: [
      {
        model: Visitor,
        as: 'visitor',
        include: [
          {
            model: Lead,
            as: 'lead',
            attributes: ['id', 'name', 'email', 'company'],
            required: false,
          },
          {
            model: IntentScore,
            as: 'intentScore',
            attributes: ['score', 'intent_level', 'signals_count'],
            required: false,
          },
        ],
      },
    ],
    order: [['started_at', 'DESC']],
    limit,
  });

  return sessions.map((s: any) => {
    const visitor = s.visitor;
    const lead = visitor?.lead;
    const intentScore = visitor?.intentScore;

    return {
      // `id` and `fingerprint` are the names the admin view model declares
      // (frontend AdminVisitorsPage `Visitor`). They were previously emitted only
      // as `visitor_id` / `visitor_fingerprint`, so every live row rendered with
      // an undefined React key and an "Anonymous" label with no fingerprint tail,
      // and clicking a row called `/api/admin/visitors/undefined/sessions`.
      id: s.visitor_id,
      fingerprint: visitor?.fingerprint ?? null,
      session_id: s.id,
      visitor_id: s.visitor_id,
      visitor_fingerprint: visitor?.fingerprint ?? null,
      lead_id: lead?.id ?? null,
      lead_name: lead?.name ?? null,
      current_page: s.exit_page,
      started_at: s.started_at,
      // Same number under both names, deliberately. The table reads
      // `session_duration`; `duration_seconds` is kept because it is the column
      // name and the shape every other session payload in this service uses.
      session_duration: s.duration_seconds,
      duration_seconds: s.duration_seconds,
      pageview_count: s.pageview_count,
      referrer_domain: s.referrer_domain,
      // Which property the visitor is actually on. The tracker feeds eight
      // hostnames into one table, so a live row without this is unattributable —
      // a crawler on worldoftaxonomy.com and a buyer on enterprise.colaberry.ai
      // render identically without it.
      site_slug: s.site_slug ?? visitor?.site_slug ?? null,
      device_type: s.device_type ?? visitor?.device_type ?? null,
      ip_address: s.ip_address ?? visitor?.ip_address ?? null,
      city: visitor?.city ?? null,
      country: visitor?.country ?? null,
      is_identified: !!lead,
      // Labelled even when bots are excluded, so turning "Show bots" on gives a
      // list where the machines are marked rather than merely present.
      is_bot: isBotUserAgent(visitor?.user_agent),
      intent_score: intentScore?.score ?? null,
      intent_level: intentScore?.intent_level ?? null,
    };
  });
}

/**
 * How many distinct visitors have fired a page event in the last 5 minutes.
 *
 * Counted separately from `getLiveVisitors` rather than derived from its length:
 * that function is LIMITed (50 by default) for the table, so using its length as
 * the "Live Now" figure would silently cap the headline number at the page size
 * and read as a plateau rather than a truncation.
 */
export async function countLiveVisitors(includeBots = false): Promise<number> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  // Joins `visitors` only to reach `user_agent`, and applies the SAME predicate
  // the list query uses. If these two ever diverge the dashboard reports a
  // headline the table below it contradicts.
  const botFilter = includeBots ? '' : `AND ${botExclusionSql('v."user_agent"')}`;

  const [row] = await sequelize.query<{ count: string }>(
    `SELECT COUNT(DISTINCT pe.visitor_id)::int AS count
       FROM page_events pe
       JOIN visitors v ON v.id = pe.visitor_id
      WHERE pe.timestamp > :since
        ${botFilter}`,
    { replacements: { since: fiveMinutesAgo }, type: QueryTypes.SELECT }
  );

  return Number(row?.count ?? 0);
}

// ---------------------------------------------------------------------------
// 2. Visitor Stats
// ---------------------------------------------------------------------------

export async function getVisitorStats(
  dateRange?: { from: string; to: string }
): Promise<object> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = dateRange?.from ? new Date(dateRange.from) : thirtyDaysAgo;
  const to = dateRange?.to ? new Date(dateRange.to) : now;

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const rangeWhere = { started_at: { [Op.between]: [from, to] } };
  const todayWhere = { started_at: { [Op.gte]: todayStart } };

  const [
    totalVisitors,
    totalSessions,
    pageviewSum,
    avgDuration,
    bounceData,
    visitorsToday,
    sessionsToday,
    liveCount,
  ] = await Promise.all([
    VisitorSession.count({
      where: rangeWhere,
      distinct: true,
      col: 'visitor_id',
    }),
    VisitorSession.count({ where: rangeWhere }),
    VisitorSession.sum('pageview_count', { where: rangeWhere }),
    VisitorSession.findOne({
      where: rangeWhere,
      attributes: [[fn('AVG', col('duration_seconds')), 'avg_duration']],
      raw: true,
    }),
    VisitorSession.findOne({
      where: rangeWhere,
      attributes: [
        [fn('COUNT', literal('CASE WHEN "is_bounce" = true THEN 1 END')), 'bounce_count'],
        [fn('COUNT', col('id')), 'total_count'],
      ],
      raw: true,
    }),
    VisitorSession.count({
      where: todayWhere,
      distinct: true,
      col: 'visitor_id',
    }),
    VisitorSession.count({ where: todayWhere }),
    countLiveVisitors(),
  ]);

  const avgDurationVal = (avgDuration as any)?.avg_duration ?? 0;
  const bounceCount = Number((bounceData as any)?.bounce_count ?? 0);
  const totalCount = Number((bounceData as any)?.total_count ?? 0);
  const bounceRate = totalCount > 0 ? Math.round((bounceCount / totalCount) * 10000) / 100 : 0;

  // Two naming conventions on purpose, and this is the fix rather than a wart.
  //
  // The admin page declares its `VisitorStats` in camelCase (liveCount,
  // todayVisitors, todaySessions, visitors30d, sessions30d, avgDuration,
  // bounceRate) and this function only ever returned snake_case. Nothing threw:
  // every card read `stats.todayVisitors ?? 0` off an object that had
  // `visitors_today`, so the whole dashboard rendered a confident 0 against a
  // table holding 40,788 sessions. `liveCount` had no server-side source at all.
  //
  // The snake_case keys are retained because they are this endpoint's shipped
  // shape and match the column names every other query in this file returns;
  // dropping them would trade one silent contract break for another.
  return {
    // camelCase — the shape the admin view model consumes
    liveCount,
    todayVisitors: visitorsToday,
    todaySessions: sessionsToday,
    visitors30d: totalVisitors,
    sessions30d: totalSessions,
    pageviews30d: pageviewSum ?? 0,
    avgDuration: Math.round(Number(avgDurationVal)),
    bounceRate,
    // snake_case — retained for the shipped contract
    total_visitors: totalVisitors,
    total_sessions: totalSessions,
    total_pageviews: pageviewSum ?? 0,
    avg_session_duration: Math.round(Number(avgDurationVal)),
    bounce_rate: bounceRate,
    visitors_today: visitorsToday,
    sessions_today: sessionsToday,
    live_count: liveCount,
  };
}

// ---------------------------------------------------------------------------
// 3. Visitor Trend
// ---------------------------------------------------------------------------

export async function getVisitorTrend(
  days = 30
): Promise<Array<{ date: string; visitors: number; sessions: number; pageviews: number }>> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows: any[] = await VisitorSession.findAll({
    where: { started_at: { [Op.gte]: since } },
    attributes: [
      [fn('DATE', col('started_at')), 'date'],
      [fn('COUNT', literal('DISTINCT "visitor_id"')), 'visitors'],
      [fn('COUNT', col('id')), 'sessions'],
      [fn('SUM', col('pageview_count')), 'pageviews'],
    ],
    group: [fn('DATE', col('started_at'))],
    order: [[fn('DATE', col('started_at')), 'ASC']],
    raw: true,
  });

  return rows.map((r) => ({
    date: String(r.date),
    visitors: Number(r.visitors),
    sessions: Number(r.sessions),
    pageviews: Number(r.pageviews),
  }));
}

// ---------------------------------------------------------------------------
// 4. Page Popularity
// ---------------------------------------------------------------------------

export async function getPagePopularity(
  dateRange?: { from: string; to: string }
): Promise<Array<{ page_category: string; views: number; unique_visitors: number }>> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = dateRange?.from ? new Date(dateRange.from) : thirtyDaysAgo;
  const to = dateRange?.to ? new Date(dateRange.to) : now;

  const rows: any[] = await PageEvent.findAll({
    where: {
      event_type: 'pageview',
      timestamp: { [Op.between]: [from, to] },
    },
    attributes: [
      'page_category',
      [fn('COUNT', col('id')), 'views'],
      [fn('COUNT', literal('DISTINCT "visitor_id"')), 'unique_visitors'],
    ],
    group: ['page_category'],
    order: [[literal('"views"'), 'DESC']],
    raw: true,
  });

  return rows.map((r) => ({
    page_category: r.page_category ?? 'uncategorized',
    views: Number(r.views),
    unique_visitors: Number(r.unique_visitors),
  }));
}

// ---------------------------------------------------------------------------
// 5. Traffic Sources
// ---------------------------------------------------------------------------

export async function getTrafficSources(
  dateRange?: { from: string; to: string },
  includeBots = false
): Promise<Array<{ source: string; visitors: number; sessions: number }>> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = dateRange?.from ? new Date(dateRange.from) : thirtyDaysAgo;
  const to = dateRange?.to ? new Date(dateRange.to) : now;

  const rows: any[] = await VisitorSession.findAll({
    where: {
      started_at: { [Op.between]: [from, to] },
      // Same rule as the live list, so "Traffic Sources" describes people.
      ...(includeBots
        ? {}
        : {
            [Op.and]: [
              literal(
                `EXISTS (SELECT 1 FROM "visitors" bv WHERE bv."id" = "VisitorSession"."visitor_id" AND ${botExclusionSql('bv."user_agent"')})`
              ),
            ],
          }),
    },
    attributes: [
      [fn('COALESCE', col('referrer_domain'), literal("'direct'")), 'source'],
      [fn('COUNT', literal('DISTINCT "visitor_id"')), 'visitors'],
      [fn('COUNT', col('id')), 'sessions'],
    ],
    group: [fn('COALESCE', col('referrer_domain'), literal("'direct'"))],
    order: [[literal('"visitors"'), 'DESC']],
    limit: 20,
    raw: true,
  });

  return rows.map((r) => ({
    source: r.source,
    visitors: Number(r.visitors),
    sessions: Number(r.sessions),
  }));
}

// ---------------------------------------------------------------------------
// 6. List Visitors (Paginated)
// ---------------------------------------------------------------------------

export async function listVisitors(params: {
  search?: string;
  identified?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
}): Promise<{ visitors: any[]; total: number; page: number; totalPages: number }> {
  const page = Math.max(params.page ?? 1, 1);
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
  const offset = (page - 1) * limit;

  const sortField = params.sort ?? 'last_seen_at';
  const sortOrder = (params.order ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const where: any = {};

  // Identified filter
  if (params.identified === 'true') {
    where.lead_id = { [Op.ne]: null };
  } else if (params.identified === 'false') {
    where.lead_id = { [Op.is]: null as any };
  }

  // Date range filter on last_seen_at
  if (params.dateFrom || params.dateTo) {
    where.last_seen_at = {};
    if (params.dateFrom) where.last_seen_at[Op.gte] = new Date(params.dateFrom);
    if (params.dateTo) where.last_seen_at[Op.lte] = new Date(params.dateTo);
  }

  // Search filter — search in visitor city or associated lead name/company
  const leadInclude: any = {
    model: Lead,
    as: 'lead',
    attributes: ['id', 'name', 'email', 'company'],
    required: false,
  };

  if (params.search) {
    const searchPattern = `%${params.search}%`;
    // When searching, we need to look in visitor.city OR lead.name OR lead.company.
    // Make the lead join required: false but add an OR condition that spans both tables.
    where[Op.or] = [
      { city: { [Op.iLike]: searchPattern } },
      literal(`EXISTS (SELECT 1 FROM "leads" WHERE "leads"."id" = "Visitor"."lead_id" AND ("leads"."name" ILIKE '${params.search.replace(/'/g, "''")}%' OR "leads"."company" ILIKE '%${params.search.replace(/'/g, "''")}%'))`),
    ];
  }

  const { rows, count } = await Visitor.findAndCountAll({
    where,
    include: [
      leadInclude,
      {
        model: IntentScore,
        as: 'intentScore',
        attributes: ['score', 'intent_level', 'signals_count', 'last_signal_at', 'score_updated_at'],
        required: false,
      },
      {
        model: Campaign,
        as: 'campaign',
        attributes: ['id', 'name'],
        required: false,
      },
    ],
    order: [[sortField, sortOrder]],
    limit,
    offset,
  });

  return {
    visitors: rows,
    total: count,
    page,
    totalPages: Math.ceil(count / limit),
  };
}

// ---------------------------------------------------------------------------
// 7. Visitor Profile
// ---------------------------------------------------------------------------

export async function getVisitorProfile(visitorId: string): Promise<object | null> {
  const visitor = await Visitor.findByPk(visitorId, {
    include: [
      {
        model: Lead,
        as: 'lead',
        required: false,
      },
      {
        model: IntentScore,
        as: 'intentScore',
        required: false,
      },
    ],
  });

  if (!visitor) return null;

  const [sessions, recentEvents] = await Promise.all([
    VisitorSession.findAll({
      where: { visitor_id: visitorId },
      order: [['started_at', 'DESC']],
      limit: 50,
    }),
    PageEvent.findAll({
      where: { visitor_id: visitorId },
      order: [['timestamp', 'DESC']],
      limit: 100,
    }),
  ]);

  return {
    visitor,
    sessions,
    recent_events: recentEvents,
  };
}

// ---------------------------------------------------------------------------
// 8. Dashboard Summary (raw SQL aggregates)
// ---------------------------------------------------------------------------

export interface VisitorDashboardSummary {
  total_sessions: number;
  unique_visitors: number;
  avg_session_duration: number;
  bounce_rate: number;
  page_views_per_session: number;
}

export async function getVisitorDashboard(days = 30): Promise<VisitorDashboardSummary> {
  const [row] = await sequelize.query<VisitorDashboardSummary>(
    `SELECT
       COUNT(*)::int                                          AS total_sessions,
       COUNT(DISTINCT visitor_id)::int                        AS unique_visitors,
       COALESCE(ROUND(AVG(duration_seconds)), 0)::int         AS avg_session_duration,
       CASE WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(SUM(CASE WHEN is_bounce THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 1)
       END::float                                             AS bounce_rate,
       CASE WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(SUM(pageview_count)::numeric / COUNT(*), 1)
       END::float                                             AS page_views_per_session
     FROM visitor_sessions
     WHERE started_at >= NOW() - INTERVAL ':days days'`,
    {
      replacements: { days },
      type: QueryTypes.SELECT,
    },
  );

  return row ?? {
    total_sessions: 0,
    unique_visitors: 0,
    avg_session_duration: 0,
    bounce_rate: 0,
    page_views_per_session: 0,
  };
}

// ---------------------------------------------------------------------------
// 9. Conversion Funnel (raw SQL)
// ---------------------------------------------------------------------------

export interface ConversionFunnel {
  total_visitors: number;
  total_sessions: number;
  total_leads: number;
}

export async function getConversionFunnel(days = 30): Promise<ConversionFunnel> {
  const [row] = await sequelize.query<ConversionFunnel>(
    `SELECT
       COUNT(DISTINCT vs.visitor_id)::int   AS total_visitors,
       COUNT(DISTINCT vs.id)::int           AS total_sessions,
       COUNT(DISTINCT vs.lead_id)::int      AS total_leads
     FROM visitor_sessions vs
     WHERE vs.started_at >= NOW() - INTERVAL ':days days'`,
    {
      replacements: { days },
      type: QueryTypes.SELECT,
    },
  );

  return row ?? { total_visitors: 0, total_sessions: 0, total_leads: 0 };
}

// ---------------------------------------------------------------------------
// 10. Top Pages (raw SQL)
// ---------------------------------------------------------------------------

export interface TopPage {
  page_path: string;
  page_title: string | null;
  view_count: number;
  unique_visitors: number;
}

export async function getTopPages(days = 30, limit = 20, includeBots = false): Promise<TopPage[]> {
  // `INTERVAL ':days days'` put the placeholder INSIDE a string literal, and
  // Sequelize deliberately does not substitute inside quotes — so Postgres
  // received the characters ":days days" and threw
  // `invalid input syntax for type interval`. Every call to this function has
  // failed since it was written, which means /api/admin/visitor-analytics/pages
  // has never once returned a row: it 500s, the page catches, and the panel
  // renders its empty state. A bug that only ever produced "no data" rather than
  // a visible error.
  //
  // The window is computed in JS and passed as a real timestamp, which removes
  // the string-interpolation question rather than re-solving it.
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Bots excluded by default, matching the live view. Without this the list is
  // just the crawler's sitemap: production holds 275,587 pageviews under a
  // single category, nearly all of it automated traffic on one property, which
  // would bury every page a person actually read.
  const botJoin = includeBots ? '' : 'JOIN visitors v ON v.id = pe.visitor_id';
  const botFilter = includeBots ? '' : `AND ${botExclusionSql('v."user_agent"')}`;

  const rows = await sequelize.query<TopPage>(
    `SELECT
       pe.page_path,
       MAX(pe.page_title)                       AS page_title,
       COUNT(*)::int                             AS view_count,
       COUNT(DISTINCT pe.visitor_id)::int        AS unique_visitors
     FROM page_events pe
     ${botJoin}
     WHERE pe.event_type = 'pageview'
       AND pe.timestamp >= :since
       ${botFilter}
     GROUP BY pe.page_path
     ORDER BY view_count DESC
     LIMIT :limit`,
    {
      replacements: { since, limit },
      type: QueryTypes.SELECT,
    },
  );

  return rows;
}

// ---------------------------------------------------------------------------
// 11. Device Breakdown (raw SQL)
// ---------------------------------------------------------------------------

export interface DeviceBreakdown {
  device_type: string;
  session_count: number;
  percentage: number;
}

export async function getDeviceBreakdown(days = 30): Promise<DeviceBreakdown[]> {
  const rows = await sequelize.query<DeviceBreakdown>(
    `SELECT
       COALESCE(device_type, 'unknown')           AS device_type,
       COUNT(*)::int                               AS session_count,
       ROUND(COUNT(*)::numeric * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 1)::float AS percentage
     FROM visitor_sessions
     WHERE started_at >= NOW() - INTERVAL ':days days'
     GROUP BY device_type
     ORDER BY session_count DESC`,
    {
      replacements: { days },
      type: QueryTypes.SELECT,
    },
  );

  return rows;
}

export interface SiteBreakdown {
  site_slug: string;
  display_name: string;
  sessions: number;
  unique_visitors: number;
  pageviews: number;
  last_seen_at: string | null;
}

const SITE_DISPLAY_NAMES: Record<string, string> = {
  enterprise: 'Enterprise (enterprise.colaberry.ai)',
  colaberry: 'Colaberry (colaberry.ai)',
  advisor: 'AI Workforce Designer (advisor.colaberry.ai)',
  trustbeforeintelligence: 'Trust Before Intelligence',
  worldoftaxonomy: 'World of Taxonomy',
  unknown: 'Unknown / not tagged',
};

/**
 * Per-site visitor breakdown. Joins visitor_sessions for session/visitor counts
 * and page_events for pageview totals, scoped to last N days. Powers the "By Site"
 * panel on the admin visitor analytics page so we can see traffic per external site.
 */
export async function getSitesBreakdown(days = 30): Promise<SiteBreakdown[]> {
  const rows = await sequelize.query<{
    site_slug: string;
    sessions: string;
    unique_visitors: string;
    pageviews: string;
    last_seen_at: Date | null;
  }>(
    `SELECT
       COALESCE(vs.site_slug, 'unknown')          AS site_slug,
       COUNT(DISTINCT vs.id)                       AS sessions,
       COUNT(DISTINCT vs.visitor_id)               AS unique_visitors,
       COALESCE(SUM(vs.pageview_count), 0)         AS pageviews,
       MAX(vs.started_at)                          AS last_seen_at
     FROM visitor_sessions vs
     WHERE vs.started_at >= NOW() - INTERVAL ':days days'
     GROUP BY 1
     ORDER BY sessions DESC`,
    {
      replacements: { days },
      type: QueryTypes.SELECT,
    },
  );

  return rows.map((r) => ({
    site_slug: r.site_slug,
    display_name: SITE_DISPLAY_NAMES[r.site_slug] || r.site_slug,
    sessions: parseInt(r.sessions as any, 10) || 0,
    unique_visitors: parseInt(r.unique_visitors as any, 10) || 0,
    pageviews: parseInt(r.pageviews as any, 10) || 0,
    last_seen_at: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
  }));
}
