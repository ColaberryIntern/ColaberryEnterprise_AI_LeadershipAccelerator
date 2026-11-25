/**
 * R16 — the Revenue Flow board endpoint, and the writes that make it mean anything.
 *
 * Two of them now. R16 added the government bid price; R23 Phase 3 adds the enterprise deal
 * value. Both follow the same rule and it is the only rule that matters on this file: the
 * figure is a named human's claim, and the name comes from the session.
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
import { getMembershipStageRoster } from '../services/revenueFlow/membershipRoster';
import {
  BidValueRejected,
  confirmBidValue,
  getBidValueHistory,
} from '../services/revenueFlow/govBidValueService';
import {
  DealValueRejected,
  confirmDealValue,
  getDealValueHistory,
} from '../services/revenueFlow/enterpriseDealValueService';
import { VALUE_BASIS_SOURCES } from '../db/ensureGovBidValueSchema';
import { DEAL_BASIS_SOURCES } from '../db/ensureEnterpriseDealValueSchema';

/**
 * The identified human behind this request, or null.
 *
 * ── WHY THIS IS ONE FUNCTION AND NOT TWO COPIES ──────────────────────────────────────────
 *
 * Both money writes on this surface depend on it, and it is the only thing standing between
 * "a named person confirmed this figure" and "a string arrived in a request". Two copies of
 * the one rail that makes a confirmation mean anything is two places for it to drift, and a
 * drifted copy fails OPEN: it would accept an unattributed write rather than refuse one.
 *
 * The fallback chain is ordered by how identifying each claim is. `sub` last, because it is a
 * subject id rather than a person's address and is the least useful thing to read off a money
 * board six months later - but it is still an identity, so it beats refusing the write.
 */
function actorFrom(req: Request): string | null {
  return (req as any).user?.email
    || (req as any).admin?.email
    || (req as any).user?.sub
    || null;
}

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

  const actor = actorFrom(req);
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

/**
 * R23 Phase 3 — record what an ENTERPRISE deal is worth.
 *
 * Phase 2 built `enterprise_deal_values` and the service that is the only sanctioned way into
 * it. Nothing in the product could call that service, so the stream read zero in production
 * regardless of the table existing. This is that missing write path.
 *
 * ── WHY THE BODY IS A DISCRIMINATED UNION AND NOT A SET OF OPTIONAL FIELDS ────────────────
 *
 * This is the HTTP boundary, so it is where the retainer foot-gun would come back.
 *
 * `ConfirmDealValueInput` is already a union in the service, and TypeScript enforces it for
 * every in-process caller. A request body is `any`, so that protection stops at this
 * function: a flat schema with `dealValueCents`, `monthlyFeeCents` and `periodMonths` all
 * optional would happily accept `{ valueKind: 'monthly_retainer', dealValueCents: 450000 }`
 * and hand the service an object its own types say cannot exist.
 *
 * `z.discriminatedUnion` makes the two shapes genuinely exclusive at the wire, so a retainer
 * REQUIRES `monthlyFeeCents` and a term, and a total-contract deal cannot carry a monthly fee
 * at all. `.strict()` on each member is the other half: without it, a client that sent
 * `monthlyFeeCents` alongside `valueKind: 'total_contract'` would have the field silently
 * stripped and the deal recorded as a total, which is the $4,500-instead-of-$54,000 error
 * arriving by a different door.
 *
 * `.strict()` has a second effect worth stating, because it is deliberate: a body carrying
 * `confirmedBy` is REFUSED rather than quietly ignored. Stripping it would work correctly and
 * teach the caller nothing, and a client that believes it is setting the confirming person
 * should find out it is not.
 */
const DealValueCommon = {
  enterpriseIntakeId: z.string().uuid(),
  valueBasis: z.string().min(1),
  basisSource: z.enum(DEAL_BASIS_SOURCES),
  currency: z.string().length(3).optional(),
  notes: z.string().max(2000).nullable().optional(),
};

const DealValueBody = z.discriminatedUnion('valueKind', [
  z.object({
    ...DealValueCommon,
    valueKind: z.literal('total_contract'),
    /** The WHOLE engagement, in cents. */
    dealValueCents: z.number().int().min(0),
    periodMonths: z.number().int().positive().nullable().optional(),
  }).strict(),
  z.object({
    ...DealValueCommon,
    valueKind: z.literal('monthly_retainer'),
    /** The RECURRING fee per month, in cents. The total is computed from this and the term. */
    monthlyFeeCents: z.number().int().min(0),
    /** Required, not optional: a retainer with no term has no total contract value. */
    periodMonths: z.number().int().positive(),
  }).strict(),
]);

export async function handleConfirmDealValue(req: Request, res: Response): Promise<void> {
  const body = DealValueBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      error_class: 'ValidationError',
      details: body.error.flatten(),
    });
    return;
  }

  // From the session, never the body. The W28 intake is AI-driven end to end, so an
  // unattributed value would be the model's estimate of its own pipeline on a money board.
  const actor = actorFrom(req);
  if (!actor) {
    res.status(401).json({
      success: false,
      error: 'An enterprise deal value must be attributed to an identified person, and this '
        + 'request carries no identity.',
      error_class: 'AuthError',
    });
    return;
  }

  try {
    const { value, superseded } = await confirmDealValue({ ...body.data, confirmedBy: actor });
    console.log(JSON.stringify({
      level: 'info',
      service: 'revenue-flow',
      event: superseded ? 'enterprise_deal_value_revised' : 'enterprise_deal_value_confirmed',
      outcome: 'success',
      context: {
        enterpriseIntakeId: value.enterpriseIntakeId,
        // The stored TOTAL, which is the invariant the table holds whichever shape was sent.
        // Logged alongside the shape so a retainer is legible in the log as a retainer.
        cents: value.dealValueCents,
        valueKind: body.data.valueKind,
        periodMonths: value.periodMonths,
        basisSource: value.basisSource,
        priorCents: superseded ? superseded.dealValueCents : null,
      },
    }));
    res.status(superseded ? 200 : 201).json({ success: true, data: { value, superseded } });
  } catch (error) {
    const err = error as Error;
    // A rejected value is the caller's problem, and the service's message is the useful part:
    // it says what a usable basis looks like, and why a retainer needs a term.
    if (err instanceof DealValueRejected) {
      res.status(400).json({ success: false, error: err.message, error_class: 'ValidationError' });
      return;
    }
    console.error(JSON.stringify({
      level: 'error',
      service: 'revenue-flow',
      event: 'enterprise_deal_value_write_failed',
      error_class: err.name || 'UnknownError',
      outcome: 'failure',
      message: err.message,
    }));
    res.status(500).json({ success: false, error: 'Could not record the enterprise deal value.' });
  }
}

const DealHistoryParams = z.object({ enterpriseIntakeId: z.string().uuid() });

/** Every value this deal has carried, oldest first, so a revision reads as a revision. */
export async function handleGetDealValueHistory(req: Request, res: Response): Promise<void> {
  const params = DealHistoryParams.safeParse(req.params);
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
    const data = await getDealValueHistory(params.data.enterpriseIntakeId);
    res.json({ success: true, data });
  } catch (error) {
    const err = error as Error;
    console.error(JSON.stringify({
      level: 'error',
      service: 'revenue-flow',
      event: 'enterprise_deal_value_history_failed',
      error_class: err.name || 'UnknownError',
      outcome: 'failure',
      message: err.message,
    }));
    res.status(500).json({
      success: false,
      error: 'Could not read the enterprise deal value history.',
    });
  }
}

/**
 * R26 — the named people behind one membership funnel count.
 *
 * Taiwo Oludimimu, 25 Nov 2026: "can you make the data points clickable so they show a list
 * of students or leads that fall within each category?"
 *
 * The stage key is validated against the service's own vocabulary rather than a copy of it
 * here, so a stage renamed in one place cannot leave a route accepting the old name. An
 * unknown key is a 404 and not an empty list: an empty list would say the stage exists and
 * nobody is in it, which is a different and wrong answer.
 */
const StageParams = z.object({ stageKey: z.string().min(1).max(64) });

export async function handleGetMembershipStageRoster(
  req: Request,
  res: Response,
): Promise<void> {
  const params = StageParams.safeParse(req.params);
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
    const data = await getMembershipStageRoster(params.data.stageKey);
    if (!data) {
      res.status(404).json({
        success: false,
        error: `No membership funnel stage is called "${params.data.stageKey}".`,
        error_class: 'NotFoundError',
      });
      return;
    }
    res.json({ success: true, data });
  } catch (error) {
    const err = error as Error;
    console.error(JSON.stringify({
      level: 'error',
      service: 'revenue-flow',
      event: 'membership_stage_roster_failed',
      error_class: err.name || 'UnknownError',
      outcome: 'failure',
      stage: params.data.stageKey,
      message: err.message,
    }));
    res.status(500).json({
      success: false,
      error: 'Could not read the people in that stage.',
    });
  }
}
