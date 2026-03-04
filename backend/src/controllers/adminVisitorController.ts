import { Request, Response, NextFunction } from 'express';
import {
  listVisitors,
  getVisitorStats,
  getLiveVisitors,
  getVisitorTrend,
  getVisitorProfile,
} from '../services/visitorAnalyticsService';
import { VisitorSession, PageEvent } from '../models';

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

export async function handleGetLiveVisitors(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const live = await getLiveVisitors(limit);
    res.json(live);
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
