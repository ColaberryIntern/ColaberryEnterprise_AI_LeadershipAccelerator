import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAdmin, requireCoryAuthorized } from '../../middlewares/authMiddleware';
import { classifyError } from '../../utils/errorClassifier';
import { maskEmail } from '../../utils/piiRedaction';
import MayaOutboundApproval from '../../models/MayaOutboundApproval';
import {
  approveOutbound, listPendingOutbound, rejectOutbound,
  type OutboundDecisionResult, type OutboundRefusal,
} from '../../services/maya/mayaOutboundQueue';

/**
 * The review surface over `maya_outbound_approvals`: the queue where every message Maya composed
 * for a real person waits for Ali to read it.
 *
 * ── WHO MAY DO WHAT, AND WHY THE TWO DIRECTIONS DIFFER ──────────────────────────────────────
 *
 *   GET     any admin                 (requireAdmin)          reading what is waiting risks nothing
 *   approve Ali or a super_admin      (requireCoryAuthorized) the chosen option is "held for YOUR approval"
 *   reject  any admin                 (requireAdmin)          stopping a message must never wait on one person
 *
 * That is the same asymmetry `mayaCapabilityRoutes` encodes between promote and revert, for the
 * same reason: widening what Maya does without a person is Ali's decision, and pulling her back
 * during an incident is any admin's.
 *
 * The approver handed to the service is ALWAYS the authenticated identity. There is no body field
 * for it, so a request cannot name somebody else as the person who decided, and the queue's own
 * positive lookup against recorded humans still runs behind this route rather than instead of it.
 *
 * ── THERE IS NO BULK APPROVE, AND THERE IS NO ROUTE SHAPED LIKE ONE ─────────────────────────
 *
 * Not `POST /outbound/approve-all`, not an `ids: []` body, not an `approve?status=pending` filter.
 * `mayaOutboundRoutes.access.test.ts` asserts that by reading this file, because the defect this
 * whole queue exists to prevent was a bulk decision: `approvalRequestTimeoutJob.ts` approved every
 * expired pending row at once and replayed 851 DMs to 52 students. One id, one decision, one
 * delivery.
 *
 * ── WHY THE LIST DOES NOT CARRY THE BODIES ──────────────────────────────────────────────────
 *
 * The list is metadata plus a short preview; the full bytes come from the single-row read. That is
 * a deliberate shape, not a payload optimisation: a list endpoint that hands back fifty complete
 * messages invites a screen that renders fifty of them with fifty buttons, which is the bulk
 * approve this feature refuses to have. Reviewing one message means fetching that one message.
 *
 * ── WHAT IS MASKED AND WHAT IS NOT ──────────────────────────────────────────────────────────
 *
 * `recipient_address` is masked to `a***@domain` in every response and every log line here: the
 * repo rule is that an API response carries no PII and an id is never an email address, which is
 * what `recipient_ref` is for. The BODY is returned in full and unmasked, because the body is the
 * thing being approved - a review of a redacted message would be a review of nothing.
 */

const router = Router();

/** A rejection says why. An approval does not have to; reading the message was the review. */
const ApproveBody = z.object({ decision_note: z.string().trim().max(500).optional() });
const RejectBody = z.object({ decision_note: z.string().trim().min(3).max(500) });
const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).optional() });

/** How a refusal from the queue is answered. Every one is a sentence, never a 500. */
const REFUSAL_STATUS: Readonly<Record<OutboundRefusal, number>> = Object.freeze({
  row_not_found: 404,
  approver_missing: 403,
  approver_is_non_human: 403,
  approver_not_a_recorded_human: 403,
  body_changed_since_review: 409,
  not_awaiting_approval: 409,
});

function badRequest(res: Response, message: string, issues?: z.ZodIssue[]): void {
  res.status(400).json({
    error: message, error_class: 'ValidationError',
    issues: issues?.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

function fail(res: Response, event: string, err: unknown): void {
  const errorClass = classifyError(err);
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'maya', event, outcome: 'failure',
    error_class: errorClass, context: { message: err instanceof Error ? err.message : String(err) },
  }));
  res.status(500).json({ error: 'Maya outbound queue request failed', error_class: errorClass });
}

function decider(req: Request): string {
  return String(req.admin?.email || req.admin?.sub || '').trim();
}

/** Collapsed to one line and cut short: enough to recognise a message, not enough to review it. */
function preview(body: string): string {
  return body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
}

function projectSummary(row: MayaOutboundApproval): Record<string, unknown> {
  return {
    id: row.id,
    recipient_ref: row.recipient_ref,
    recipient_masked: maskEmail(row.recipient_address),
    recipient_display: row.recipient_display,
    channel: row.channel,
    subject: row.subject,
    body_preview: preview(row.body),
    composed_by: row.composed_by,
    capability: row.capability,
    correlation_id: row.correlation_id,
    status: row.status,
    created_at: row.created_at,
    expires_at: row.expires_at,
  };
}

/** The one message being reviewed, with the exact bytes that would leave. */
function projectDetail(row: MayaOutboundApproval): Record<string, unknown> {
  return {
    ...projectSummary(row),
    body: row.body,
    body_hash: row.body_hash,
    decided_by: row.decided_by,
    decided_at: row.decided_at,
    decision_note: row.decision_note,
    delivered_at: row.delivered_at,
    failure_reason: row.failure_reason,
  };
}

router.get('/api/admin/maya/outbound', requireAdmin, async (req: Request, res: Response) => {
  const query = ListQuery.safeParse(req.query ?? {});
  if (!query.success) { badRequest(res, 'limit must be a number between 1 and 200', query.error.issues); return; }
  try {
    const rows = await listPendingOutbound(query.data.limit ?? 50);
    res.json({ pending: rows.map(projectSummary), count: rows.length });
  } catch (err) {
    fail(res, 'maya_outbound_list_failed', err);
  }
});

router.get('/api/admin/maya/outbound/:id', requireAdmin, async (req: Request, res: Response) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) { badRequest(res, 'A queued message id must be a uuid'); return; }
  try {
    const row = await MayaOutboundApproval.findByPk(id.data);
    if (!row) { res.status(404).json({ error: 'No such queued message', error_class: 'NotFound' }); return; }
    res.json(projectDetail(row));
  } catch (err) {
    fail(res, 'maya_outbound_read_failed', err);
  }
});

/**
 * One decision route, used twice. The DECISION is the service call; everything here is the
 * boundary: a uuid, a validated body, an authenticated decider, and a refusal translated into a
 * status code rather than swallowed into a 200.
 */
function decisionRoute(
  decide: (id: string, by: string, note: string | undefined) => Promise<OutboundDecisionResult>,
  schema: z.ZodType<{ decision_note?: string }>,
  event: string,
  noteHelp: string,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) { badRequest(res, 'A queued message id must be a uuid'); return; }
    const body = schema.safeParse(req.body ?? {});
    if (!body.success) { badRequest(res, noteHelp, body.error.issues); return; }
    const by = decider(req);
    if (!by) { res.status(401).json({ error: 'Authentication required' }); return; }

    try {
      const result = await decide(id.data, by, body.data.decision_note);
      if (!result.ok && result.refusal) {
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(), level: 'warn', service: 'maya',
          event: `${event}_refused`, outcome: 'failure', error_class: 'ContractViolation',
          context: { id: id.data, refusal: result.refusal, status: result.status, by },
        }));
        res.status(REFUSAL_STATUS[result.refusal]).json({
          error: result.message ?? `Refused: ${result.refusal}`,
          error_class: 'ContractViolation', refusal: result.refusal, status: result.status,
        });
        return;
      }
      // Decided, but the provider would not take it. The row records the failure and nothing was
      // sent; this is NOT retried here, for the reason `mayaOutboundQueue` gives at length.
      if (!result.ok) {
        res.status(502).json({
          error: result.message ?? 'Delivery failed. Nothing was sent.',
          error_class: 'UpstreamUnavailable', status: result.status, id: result.id,
        });
        return;
      }
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'info', service: 'maya', event,
        outcome: 'success', context: { id: result.id, status: result.status, by },
      }));
      res.json(result);
    } catch (err) {
      fail(res, `${event}_failed`, err);
    }
  };
}

router.post(
  '/api/admin/maya/outbound/:id/approve',
  requireCoryAuthorized,
  decisionRoute(
    (id, by, note) => approveOutbound(id, by, note),
    ApproveBody,
    'maya_outbound_approved',
    'decision_note, if given, must be 500 characters or fewer',
  ),
);

router.post(
  '/api/admin/maya/outbound/:id/reject',
  requireAdmin,
  decisionRoute(
    // The note is required by the schema above, so it is present here; the service signature
    // takes it positionally rather than optionally, which is why this is not the same call shape.
    (id, by, note) => rejectOutbound(id, by, String(note)),
    RejectBody,
    'maya_outbound_rejected',
    'A decision_note of 3 to 500 characters is required to reject a message',
  ),
);

export default router;
