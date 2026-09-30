/**
 * Unsubscribe Controller — public one-click opt-out endpoint.
 *
 * Serves the RFC 8058 one-click flow and the human "click to unsubscribe" link
 * embedded in campaign email, so an opt-out no longer depends on a request
 * landing in a human inbox and being swept by the Inbox COS scanner.
 *
 *   GET  /api/unsubscribe?lid=<id>&sig=<hmac>  → verify, opt out, render page
 *   POST /api/unsubscribe?lid=<id>&sig=<hmac>  → verify, opt out, 200 (mailbox
 *                                                providers POST List-Unsubscribe=One-Click)
 *
 * Security: the opt-out only fires for a signature that matches the lead's
 * current email (see unsubscribeTokenService). An attacker iterating `lid`
 * without a valid `sig` can never opt anyone out. Input is Zod-validated.
 *
 * Idempotency: a lead already `unsubscribed` short-circuits — no duplicate
 * UnsubscribeEvent is written, so repeated clicks (and a provider POST plus a
 * human GET on the same link) converge to the same state.
 *
 * Failure model: verification is pure (no I/O). The only external call is the
 * Sequelize lead lookup + processOptOut; on DB error we log an error_class and
 * return 503 so the caller (or mailbox provider) can retry — we never render a
 * false "you're unsubscribed" when the write did not happen.
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { Lead } from '../models';
import { verifyUnsubscribe } from '../services/unsubscribeTokenService';
import { processOptOut } from '../services/unsubscribeEnforcementService';

const LOG_PREFIX = '[Unsubscribe][API]';

const querySchema = z.object({
  lid: z.coerce.number().int().positive(),
  sig: z.string().min(16).max(128),
});

type OptOutResult =
  | { kind: 'ok' }
  | { kind: 'already' }
  | { kind: 'bad_request' }
  | { kind: 'invalid_token' }
  | { kind: 'error' };

/**
 * Validate the token and perform the opt-out. Pure of any HTTP concerns so both
 * GET and POST share identical trust/idempotency logic.
 */
async function resolveOptOut(rawQuery: unknown, via: 'get' | 'post'): Promise<OptOutResult> {
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) return { kind: 'bad_request' };
  const { lid, sig } = parsed.data;

  try {
    const lead = await Lead.findByPk(lid, { attributes: ['id', 'email', 'status'] });
    // Unknown lead id: nothing to opt out. Treat as invalid_token so we neither
    // leak existence via a distinct code nor claim a removal that did not happen.
    if (!lead || !(lead as any).email) return { kind: 'invalid_token' };

    if (!verifyUnsubscribe((lead as any).id, (lead as any).email, sig)) {
      console.warn(`${LOG_PREFIX} invalid signature for lead ${lid} via ${via}`);
      return { kind: 'invalid_token' };
    }

    if ((lead as any).status === 'unsubscribed') {
      return { kind: 'already' }; // idempotent: no duplicate event
    }

    await processOptOut((lead as any).id, 'email', `One-click unsubscribe link (${via})`, 'unsub_link');
    console.log(`${LOG_PREFIX} opted out lead ${lid} via one-click ${via}`);
    return { kind: 'ok' };
  } catch (err: any) {
    // error_class: DbError — the lookup or opt-out write failed; caller may retry.
    console.error(`${LOG_PREFIX} DbError processing opt-out for lead ${lid}: ${err?.message}`);
    return { kind: 'error' };
  }
}

/** Minimal, self-contained confirmation page. CSP is set per-response so the
 *  inline styles render despite the app-wide helmet policy. */
function renderPage(res: Response, status: number, heading: string, message: string): void {
  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading}</title></head>
<body style="margin:0;background:#f7fafc;font-family:Arial,Helvetica,sans-serif;color:#2d3748;">
  <div style="max-width:520px;margin:64px auto;padding:32px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;">
    <div style="font-weight:700;font-size:20px;color:#1a365d;margin-bottom:12px;">${heading}</div>
    <div style="font-size:15px;line-height:1.6;">${message}</div>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#a0aec0;">
      Colaberry Inc., 200 Chisholm Place, Suite 200, Plano, TX 75075
    </div>
  </div>
</body></html>`);
}

const SUPPORT_LINE =
  'If you keep receiving messages, reply &ldquo;unsubscribe&rdquo; to any email or contact ' +
  '<a href="mailto:ali@colaberry.com" style="color:#2b6cb0;">ali@colaberry.com</a>.';

/** GET handler — human-facing, renders a confirmation page. */
export async function handleUnsubscribeGet(req: Request, res: Response): Promise<void> {
  const result = await resolveOptOut(req.query, 'get');
  switch (result.kind) {
    case 'ok':
    case 'already':
      return renderPage(res, 200, 'You&rsquo;ve been unsubscribed',
        'You will no longer receive marketing emails from Colaberry. ' + SUPPORT_LINE);
    case 'bad_request':
    case 'invalid_token':
      return renderPage(res, 400, 'This link is invalid or expired',
        'We could not process this unsubscribe link. ' + SUPPORT_LINE);
    case 'error':
      return renderPage(res, 503, 'Something went wrong',
        'We hit a temporary problem processing your request. Please try again shortly. ' + SUPPORT_LINE);
  }
}

/** POST handler — RFC 8058 one-click. Mailbox providers only need a 2xx. */
export async function handleUnsubscribePost(req: Request, res: Response): Promise<void> {
  const result = await resolveOptOut(req.query, 'post');
  switch (result.kind) {
    case 'ok':
    case 'already':
      res.status(200).json({ status: 'unsubscribed' });
      return;
    case 'bad_request':
    case 'invalid_token':
      res.status(400).json({ status: 'invalid' });
      return;
    case 'error':
      res.status(503).json({ status: 'error' });
      return;
  }
}
