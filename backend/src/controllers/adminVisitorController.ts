import { Request, Response, NextFunction } from 'express';
import { getTrackingEstate } from '../services/trackingEstateService';
import { getCrossBrandVisitors } from '../services/crossBrandVisitorService';
import {
  listVisitors,
  getVisitorStats,
  getLiveVisitors,
  countLiveVisitors,
  getLiveSignedInPeople,
  getVisitorTrend,
  getVisitorProfile,
} from '../services/visitorAnalyticsService';
import { getVisitorSignals, getVisitorSignalSummary, getSignalDefinitions } from '../services/behavioralSignalService';
import { getHighIntentVisitors, getIntentScoreForVisitor, getIntentDistribution } from '../services/intentScoringService';
import { listConversations, getConversationDetail, getChatStats } from '../services/chatService';
import { Visitor, VisitorSession, PageEvent, IntentScore, Lead } from '../models';

// ---------------------------------------------------------------------------
// 1. List Visitors (paginated)         GET /api/admin/visitors
// ---------------------------------------------------------------------------

export async function handleListVisitors(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      search,
      identified,
      dateFrom,
      dateTo,
      page,
      limit,
      sort,
      order,
    } = req.query;

    const result = await listVisitors({
      search: search as string | undefined,
      identified: identified as string | undefined,
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sort: sort as string | undefined,
      order: order as string | undefined,
      includeBots: req.query.includeBots === 'true',
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 2. Visitor Stats                     GET /api/admin/visitors/stats
// ---------------------------------------------------------------------------

export async function handleGetVisitorStats(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = req.query;
    const dateRange =
      from || to
        ? { from: from as string, to: to as string }
        : undefined;

    const stats = await getVisitorStats(dateRange);
    res.json(stats);
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 3. Live Visitors                     GET /api/admin/visitors/live
// ---------------------------------------------------------------------------

/**
 * Returns `{ visitors, count }`, not a bare array.
 *
 * The admin page has always read `res.data.visitors` here while this handler
 * returned the array itself, so `res.data.visitors` was undefined, the `|| []`
 * fallback took over, and the table rendered "No visitors currently on the site"
 * no matter how many were. The envelope is what the only consumer already
 * expects, and it carries `count` — the true number of live visitors, which is
 * NOT `visitors.length` once the limit truncates the list.
 */
export async function handleGetLiveVisitors(req: Request, res: Response, next: NextFunction) {
  try {
    const requested = req.query.limit ? Number(req.query.limit) : 50;
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 200) : 50;
    // Bots are hidden by default: the question this page answers is "who is on
    // the site", and a crawler is not a who. Opt in with ?includeBots=true.
    const includeBots = req.query.includeBots === 'true';
    const [visitors, count, signedIn] = await Promise.all([
      getLiveVisitors(limit, includeBots),
      countLiveVisitors(includeBots),
      // Never allowed to take the endpoint down: presence is an enrichment, and
      // a failure here must not cost the anonymous list it sits beside.
      getLiveSignedInPeople().catch((err) => {
        console.warn('[AdminVisitors] presence lookup failed (non-blocking):', err.message);
        return [];
      }),
    ]);
    // `signed_in` is a SEPARATE list with its own count, deliberately not folded
    // into `count`. An anonymous fingerprint and a named person are different
    // units; summing them would produce a headline that means nothing and could
    // double-count the same human twice over.
    res.json({ visitors, count, includeBots, signed_in: signedIn, signed_in_count: signedIn.length });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 4. Visitor Trend                     GET /api/admin/visitors/trend
// ---------------------------------------------------------------------------

export async function handleGetVisitorTrend(req: Request, res: Response, next: NextFunction) {
  try {
    const days = req.query.days ? Number(req.query.days) : 30;
    const trend = await getVisitorTrend(days);
    res.json(trend);
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 5. Visitor Profile                   GET /api/admin/visitors/:id
// ---------------------------------------------------------------------------

export async function handleGetVisitorProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await getVisitorProfile(req.params.id as string);
    if (!profile) {
      return res.status(404).json({ error: 'Visitor not found' });
    }
    res.json(profile);
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 6. Visitor Sessions                  GET /api/admin/visitors/:id/sessions
// ---------------------------------------------------------------------------

export async function handleGetVisitorSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const sessions = await VisitorSession.findAll({
      where: { visitor_id: req.params.id },
      order: [['started_at', 'DESC']],
    });
    res.json(sessions);
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 6b. List Sessions (paginated)        GET /api/admin/sessions
// ---------------------------------------------------------------------------

export async function handleListSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    const includeBots = req.query.includeBots === 'true';
    const { literal, Op } = require('sequelize');
    const { botExclusionSql, notAutomatedSessionSql } = require('../services/visitorBotDetection');
    // Unfiltered this lists all 84,416 sessions newest-first, and crawlers never
    // stop, so the first page was permanently machines.
    const where = includeBots
      ? {}
      : {
          [Op.and]: [
            literal(`EXISTS (SELECT 1 FROM "visitors" sv WHERE sv."id" = "VisitorSession"."visitor_id" AND ${botExclusionSql('sv."user_agent"')})`),
            literal(notAutomatedSessionSql('"VisitorSession"."pageview_count"', '"VisitorSession"."duration_seconds"')),
          ],
        };

    const { rows, count } = await VisitorSession.findAndCountAll({
      where,
      order: [['started_at', 'DESC']],
      limit,
      offset,
      include: [
        {
          model: Visitor,
          as: 'visitor',
          attributes: ['id', 'fingerprint', 'lead_id'],
          include: [{ model: Lead, as: 'lead', attributes: ['id', 'name'], required: false }],
        },
      ],
    });

    const sessions = rows.map((s: any) => ({
      id: s.id,
      visitor_id: s.visitor_id,
      visitor_name: s.visitor?.lead?.name || null,
      lead_name: s.visitor?.lead?.name || null,
      started_at: s.started_at,
      ended_at: s.ended_at,
      duration: s.duration_seconds,
      pageview_count: s.pageview_count,
      event_count: s.event_count,
      entry_page: s.entry_page,
      exit_page: s.exit_page,
      is_bounce: s.is_bounce,
      referrer_domain: s.utm_source || null,
      utm_source: s.utm_source,
      device_type: s.device_type,
      site_slug: s.site_slug ?? null,
    }));

    res.json({ sessions, total: count, page, totalPages: Math.ceil(count / limit) });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 7. Session Events                    GET /api/admin/sessions/:id/events
// ---------------------------------------------------------------------------

export async function handleGetSessionEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const events = await PageEvent.findAll({
      where: { session_id: req.params.id },
      order: [['timestamp', 'ASC']],
    });
    res.json(events);
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 8. Visitor Signals                    GET /api/admin/visitors/:id/signals
// ---------------------------------------------------------------------------

export async function handleGetVisitorSignals(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const signals = await getVisitorSignals(req.params.id as string, limit);
    const summary = await getVisitorSignalSummary(req.params.id as string);
    res.json({ signals, summary });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 9. Visitor Intent Score               GET /api/admin/visitors/:id/intent
// ---------------------------------------------------------------------------

export async function handleGetVisitorIntent(req: Request, res: Response, next: NextFunction) {
  try {
    const intentScore = await getIntentScoreForVisitor(req.params.id as string);
    const signals = await getVisitorSignals(req.params.id as string, 20);
    res.json({
      intent: intentScore || { score: 0, intent_level: 'low', signals_count: 0 },
      recent_signals: signals,
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 10. High Intent Visitors              GET /api/admin/visitors/high-intent
// ---------------------------------------------------------------------------

/**
 * One row per human who touched more than one brand, ordered by intent.
 *
 * The question every other visitor endpoint cannot answer: is the person reading AI
 * Flotation's pricing page the same one who read Refactored's enterprise page last week.
 */
/**
 * The whole tracking estate: brands, their registered hostnames, and the site slugs that
 * actually report. Returned at both grains because five properties resolve to one brand.
 */
export async function handleGetTrackingEstate(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getTrackingEstate());
  } catch (err) {
    next(err);
  }
}

export async function handleGetCrossBrandVisitors(req: Request, res: Response, next: NextFunction) {
  try {
    const visitors = await getCrossBrandVisitors({
      minBrands: req.query.minBrands ? Number(req.query.minBrands) : undefined,
      days: req.query.days ? Number(req.query.days) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ visitors, count: visitors.length });
  } catch (err) {
    next(err);
  }
}

export async function handleGetHighIntentVisitors(req: Request, res: Response, next: NextFunction) {
  try {
    const threshold = req.query.threshold ? Number(req.query.threshold) : 45;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const visitors = await getHighIntentVisitors(threshold, limit);
    res.json(visitors);
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 11. Intent Distribution               GET /api/admin/visitors/intent-distribution
// ---------------------------------------------------------------------------

export async function handleGetIntentDistribution(req: Request, res: Response, next: NextFunction) {
  try {
    const distribution = await getIntentDistribution();
    res.json(distribution);
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 12. Signal Definitions                GET /api/admin/visitors/signal-definitions
// ---------------------------------------------------------------------------

export async function handleGetSignalDefinitions(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(getSignalDefinitions());
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 13. List Chat Conversations             GET /api/admin/chat/conversations
// ---------------------------------------------------------------------------

export async function handleListChatConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, status } = req.query;
    const result = await listConversations({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status: status as string | undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 14. Chat Conversation Detail            GET /api/admin/chat/conversations/:id
// ---------------------------------------------------------------------------

export async function handleGetChatConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getConversationDetail(req.params.id as string);
    if (!result) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 15. Chat Stats                          GET /api/admin/chat/stats
// ---------------------------------------------------------------------------

export async function handleGetChatStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getChatStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
}
