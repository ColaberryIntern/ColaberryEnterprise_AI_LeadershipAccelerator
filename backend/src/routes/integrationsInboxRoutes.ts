import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { InboxEventSchema } from '../services/placement/inboxEventSchema';
import { acceptInboxEvent } from '../services/placement/inboxEvents';
import { verifyInboxSignature } from '../services/placement/inboxSignature';

/**
 * Career Prep v27, CP6.2 (kit F3): the inbox manager pushes classified mail and interview events here.
 *
 *   POST /api/integrations/inbox/events   headers X-Timestamp + X-Signature (inboxSignature.ts), body = one event
 *
 * ORDER OF REFUSALS: INBOX_INTEGRATION_SECRET unset -> 503 {error:"integration not configured"} (nothing is read);
 * no raw body -> 400; signature missing, stale (over 5 minutes) or wrong -> 401; not JSON or not the F3 shape -> 400;
 * then stored once per (message_id, type): new -> 202, replay -> 200 {duplicate:true}. A dispatch failure -> 503, so the
 * sender's own retry (3 attempts, 2/10/60 s, kit F3) dispatches it again.
 *
 * RAW BYTES: mounted by boot/placementBoot.ts mountPlacementIntegrations(app), which server.ts calls BEFORE its global
 * express.json(), and this route has its OWN express.raw, so the HMAC is computed over exactly the bytes sent. The type
 * matcher accepts any Content-Type (webhookRoutes.ts learned in production that a strict 'application/json' filter
 * silently skips raw capture when a sender varies the header).
 *
 * The secret is read from the environment per request and never logged; log lines carry the refusal reason only.
 */
export const EVENTS_PATH = '/api/integrations/inbox/events';
const raw = express.raw({ type: () => true, limit: '256kb' });

function log(event: string, context: Record<string, unknown>, errorClass: string): void {
  console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event, outcome: 'failure', error_class: errorClass, context }));
}

/** 503 before anything else when the integration is not configured (dark until CP7). */
function requireSecret(_req: Request, res: Response, next: NextFunction): void {
  if (!process.env.INBOX_INTEGRATION_SECRET) { res.status(503).json({ error: 'integration not configured' }); return; }
  next();
}

/** The raw parser, with its own errors (too large, bad encoding) answered as JSON. */
function rawBody(req: Request, res: Response, next: NextFunction): void {
  raw(req, res, (err?: unknown) => {
    if (!err) { next(); return; }
    const status = (err as { status?: number })?.status === 413 ? 413 : 400;
    log('inbox_event_body_refused', { status }, status === 413 ? 'PayloadTooLarge' : 'ValidationError');
    res.status(status).json({ error: status === 413 ? 'Body too large.' : 'Unreadable body.' });
  });
}

export async function postInboxEvent(req: Request, res: Response): Promise<void> {
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) { res.status(400).json({ error: 'Send the event as a JSON body.' }); return; }
  const check = verifyInboxSignature({ secret: process.env.INBOX_INTEGRATION_SECRET as string, timestamp: req.get('x-timestamp'), signature: req.get('x-signature'), body, now: new Date() });
  if (!check.ok) { log('inbox_event_signature_refused', { reason: check.reason }, 'AuthError'); res.status(401).json({ error: 'Bad signature.' }); return; }
  let parsed: unknown;
  try { parsed = JSON.parse(body.toString('utf8')); } catch { res.status(400).json({ error: 'Body is not JSON.' }); return; }
  const ev = InboxEventSchema.safeParse(parsed);
  if (!ev.success) { res.status(400).json({ error: 'Not an inbox event.', fields: ev.error.issues.map((i) => i.path.join('.')).slice(0, 10) }); return; }
  try {
    const r = await acceptInboxEvent(ev.data);
    if (r.duplicate) { res.status(200).json({ accepted: true, duplicate: true }); return; }
    res.status(202).json({ accepted: true, duplicate: false });
  } catch (err) {
    log('inbox_event_dispatch_failed', { type: ev.data.type }, (err as Error)?.name && (err as Error).name !== 'Error' ? (err as Error).name : 'UpstreamUnavailable');
    res.status(503).json({ error: 'Could not process the event. Retry.' });
  }
}

const router = Router();
router.post(EVENTS_PATH, requireSecret, rawBody, postInboxEvent);
export default router;
