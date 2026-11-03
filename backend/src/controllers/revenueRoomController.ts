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
import { getRevenueRoomBoard } from '../services/revenueRoom/revenueRoomService';

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
