/**
 * R16 — the Revenue Flow board endpoint, and the one write that makes it mean anything.
 *
 * MOUNTED UNDER /api/admin/commercialization for the reason `revenueRoomController` already
 * documents: `mgmtSectionGate.ts` is deny-by-default, so an unmapped prefix 403s a scoped
 * revenue identity with nothing in the response explaining why, and `adminNav.ts` carries a
 * matching list a test asserts agrees with it. Reusing the already-classified prefix avoids
 * touching two gates to add one page.
 *
 * ── WHY `confirmedBy` IS NOT IN THE REQUEST BODY ─────────────────────────────────────────
 *
 * It is taken from the authenticated session and the client cannot set it. The entire reason
 * a priced bid may be trusted as a real pursuit is that a identifiable human put their name
 * against it, and a name the caller supplies is not that — it is a string. Accepting it from
 * the body would turn the one honesty rail on `gov_bid_values` into decoration.
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { getRevenueFlowBoard, DEFAULT_WINDOW_DAYS } from '../services/revenueFlow/revenueFlowService';
import {
  BidValueRejected,
  confirmBidValue,
  getBidValueHistory,
} from '../services/revenueFlow/govBidValueService';
import { VALUE_BASIS_SOURCES } from '../db/ensureGovBidValueSchema';

/**
 * `window` is bounded on both ends. Unbounded would let one request ask for every event
 * since the epoch, and the only caller is a dashboard whose oldest real datum is 2026-07.
 */
const BoardQuery = z.object({
  window: z.coerce.number().int().min(7).max(1095).optional(),
});

export async function handleGetRevenueFlowBoard(req: Request, res: Response): Promise<void> {
  const query = BoardQuery.safeParse(req.query);
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
    const data = await getRevenueFlowBoard(new Date(), query.data.window ?? DEFAULT_WINDOW_DAYS);
    res.json({ success: true, data });
  } catch (error) {
    const err = error as Error;
    // Classified, because this page's whole purpose is that an empty section means
    // something specific. A silent failure rendering as an empty dashboard is the one
    // outcome it must never produce.
    console.error(JSON.stringify({
      level: 'error',
      service: 'revenue-flow',
      event: 'revenue_flow_board_failed',
      error_class: err.name || 'UnknownError',
      outcome: 'failure',
      message: err.message,
    }));
    res.status(500).json({ success: false, error: 'Could not build the Revenue Flow board.' });
  }
}

/**
 * Price a bid.
 *
 * `proposalValueCents` is cents, as an integer, deliberately rather than a dollar float:
 * 1234.56 dollars cannot be represented exactly in binary floating point, and a pipeline
 * total that drifts by fractions of a cent per bid is the kind of defect nobody finds for a
 * year. The service rejects a non-integer with a message naming the usual cause.
 */
const BidValueBody = z.object({
  deliveryProjectId: z.string().uuid(),
  proposalValueCents: z.number().int().min(0),
  valueBasis: z.string().min(1),
  basisSource: z.enum(VALUE_BASIS_SOURCES),
  periodMonths: z.number().int().positive().nullable().optional(),
  currency: z.string().length(3).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function handleConfirmBidValue(req: Request, res: Response): Promise<void> {
  const body = BidValueBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      error_class: 'ValidationError',
      details: body.error.flatten(),
    });
    return;
  }

  // From the session, never the body. See the module header.
  const actor = (req as any).user?.email
    || (req as any).admin?.email
    || (req as any).user?.sub
    || null;
  if (!actor) {
    res.status(401).json({
      success: false,
      error: 'A bid value must be attributed to an identified person, and this request '
        + 'carries no identity.',
      error_class: 'AuthError',
    });
    return;
  }

  try {
    const { value, superseded } = await confirmBidValue({ ...body.data, confirmedBy: actor });
    console.log(JSON.stringify({
      level: 'info',
      service: 'revenue-flow',
      event: superseded ? 'bid_value_revised' : 'bid_value_confirmed',
      outcome: 'success',
      context: {
        deliveryProjectId: value.deliveryProjectId,
        cents: value.proposalValueCents,
        basisSource: value.basisSource,
        priorCents: superseded ? superseded.proposalValueCents : null,
      },
    }));
    res.status(superseded ? 200 : 201).json({ success: true, data: { value, superseded } });
  } catch (error) {
    const err = error as Error;
    // A rejected value is the caller's problem, not the server's, and the message is the
    // point: it tells them what a usable basis looks like.
    if (err instanceof BidValueRejected) {
      res.status(400).json({ success: false, error: err.message, error_class: 'ValidationError' });
      return;
    }
    console.error(JSON.stringify({
      level: 'error',
      service: 'revenue-flow',
      event: 'bid_value_write_failed',
      error_class: err.name || 'UnknownError',
      outcome: 'failure',
      message: err.message,
    }));
    res.status(500).json({ success: false, error: 'Could not record the bid value.' });
  }
}

const HistoryParams = z.object({ deliveryProjectId: z.string().uuid() });

/** Every price this bid has carried, oldest first, so a revision reads as a revision. */
export async function handleGetBidValueHistory(req: Request, res: Response): Promise<void> {
  const params = HistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      error_class: 'ValidationError',
      details: params.error.flatten(),
    });
    return;
  }
  try {
    const data = await getBidValueHistory(params.data.deliveryProjectId);
    res.json({ success: true, data });
  } catch (error) {
    const err = error as Error;
    console.error(JSON.stringify({
      level: 'error',
      service: 'revenue-flow',
      event: 'bid_value_history_failed',
      error_class: err.name || 'UnknownError',
      outcome: 'failure',
      message: err.message,
    }));
    res.status(500).json({ success: false, error: 'Could not read the bid value history.' });
  }
}
