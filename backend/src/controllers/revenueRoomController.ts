/**
 * R1 — the Revenue Room board endpoint. Read-only, admin-gated.
 *
 * MOUNTED UNDER /api/admin/commercialization DELIBERATELY, not under a new
 * /api/admin/revenue-room prefix. `mgmtSectionGate.ts` is deny-by-default: an unmapped
 * prefix 403s a scoped revenue identity with nothing in the response explaining why, and
 * `adminNav.ts` carries a matching list that a test asserts agrees with it. The Revenue
 * Room IS commercialization work, so reusing the already-classified prefix avoids
 * touching two gates to add one read-only page. The frontend route is still
 * /admin/revenue-room; the API prefix and the page path do not have to match.
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { getRevenueRoomBoard } from '../services/revenueRoom/revenueRoomService';
import {
  DrilldownNotFound,
  getDrilldown,
} from '../services/revenueRoom/revenueRoomDrilldown';

export async function handleGetRevenueRoomBoard(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    res.json({ success: true, data: await getRevenueRoomBoard() });
  } catch (error) {
    const err = error as Error;
    // Classified rather than generic: this page's whole purpose is that an empty card
    // means something specific, so a silent failure rendering as empty cards would be
    // the one outcome it must never produce.
    console.error(JSON.stringify({
      level: 'error',
      service: 'revenue-room',
      event: 'revenue_room_board_failed',
      error_class: err.name || 'UnknownError',
      outcome: 'failure',
      message: err.message,
    }));
    res.status(500).json({
      success: false,
      error: 'Could not build the Revenue Room board.',
    });
  }
}

/**
 * R4 - the drill-down behind one card.
 *
 * `cardKey` is validated as a bare identifier rather than passed through: it reaches a
 * registry lookup, and a route param that can carry anything is a route param somebody
 * will eventually put a path or a quote in. `bid` is a UUID because the only roster that
 * exists is keyed on `delivery_project_id`.
 */
const DrilldownParams = z.object({
  cardKey: z.string().min(1).max(120).regex(/^[a-z][a-z0-9_]*$/, 'cardKey must be a bare identifier'),
});
const DrilldownQuery = z.object({
  bid: z.string().uuid().optional(),
});

export async function handleGetRevenueRoomDrilldown(
  req: Request,
  res: Response,
): Promise<void> {
  // Two guards rather than one: a discriminated union only narrows `error` inside the
  // failing branch, so a combined check would need a non-null assertion to compile and
  // would be asserting exactly the thing the union already knows.
  const params = DrilldownParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      error_class: 'ValidationError',
      details: params.error.flatten(),
    });
    return;
  }
  const query = DrilldownQuery.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      error_class: 'ValidationError',
      details: query.error.flatten(),
    });
    return;
  }

  try {
    const data = await getDrilldown(params.data.cardKey, query.data.bid);
    res.json({ success: true, data });
  } catch (error) {
    const err = error as Error;
    // A card that does not exist is a 404, not a 500: it is the caller's path that is
    // wrong, and returning 500 would send someone looking for a server fault.
    if (err instanceof DrilldownNotFound) {
      res.status(404).json({ success: false, error: err.message, error_class: 'NotFoundError' });
      return;
    }
    console.error(JSON.stringify({
      level: 'error',
      service: 'revenue-room',
      event: 'revenue_room_drilldown_failed',
      error_class: err.name || 'UnknownError',
      outcome: 'failure',
      message: err.message,
      context: { cardKey: params.data.cardKey },
    }));
    res.status(500).json({ success: false, error: 'Could not build the drill-down.' });
  }
}
