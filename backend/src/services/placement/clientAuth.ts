import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';
import { guardedSendMail, resolveEmailRecipient } from '../emailService';
import { sendOnce, type ProviderResult } from '../email/idempotentSend';
import { checkRateLimit, GENERIC_LINK_INVALID, hashToken, mintToken, normalizeEmail } from '../../modules/delivery/clientMagicLink';
import { isSwitchOn, SWITCHES, type Read } from './darkSwitches';
import { bookingLinkBase } from './bookingReply';
import * as store from './clientStore';

/**
 * Career Prep v27, CP10.2 (kit "Employer portal", contract assumption 2): employer sign-in by emailed link, reusing the
 * pure rules of modules/delivery/clientMagicLink.ts (one-hour single-use link, stored hashed, 1/min and 6/hour per address,
 * one uniform answer), and the session every /api/hire/client/* route requires.
 *
 * DARK: switch hire_client_portal_enabled (darkSwitches.ts; absent or unreadable = OFF). Off: request-link answers the
 * same uniform message and writes nothing, redeem refuses every link, and requireHireClient refuses every session, so
 * no session can exist (execution contract). The switch is read on EVERY request, so turning it off ends sessions at once.
 * NO ENUMERATION: request-link gives one answer for an address with access, without access, malformed, rate-limited,
 * switched off or failed. Only an address that is a member gets a token row and an email.
 * SESSION: a JWT signed with the app secret, audience 'hire-client', kind 'hire_client_session', 8 hours, carrying
 * the member and client ids only. It has NO role claim (so requireAdmin / requireParticipant refuse it) and other
 * tokens lack the audience (so this guard refuses them). Each request re-reads the member: a removed member is out.
 * ONCE: the sign-in mail goes through sendOnce keyed on the token row (a retried request is a new row, by design: the
 * rate limit bounds it). Redeem spends the link in one conditional UPDATE (two redemptions at once: one session).
 * FAILURE: a database or mail error is logged with its class; request-link still answers the uniform message (a 500
 * would mark real addresses) and redeem answers the uniform invalid message.
 */
export const HIRE_CLIENT_AUDIENCE = 'hire-client';
export const HIRE_CLIENT_KIND = 'hire_client_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const REQUEST_LINK_RESPONSE = 'If that address can sign in to the employer portal, a sign-in link is on its way. It expires in one hour.';
export const LINK_INVALID = GENERIC_LINK_INVALID;
export const SESSION_REFUSED = 'Please sign in again.';
export const SIGNIN_SUBJECT = 'Your Refactored.ai sign-in link';

export type RequestLinkOutcome = 'off' | 'invalid' | 'limited' | 'no_access' | 'sent' | 'failed';
export interface HireClientSession { memberId: string; clientId: string; clientName: string; email: string }
export interface ClientRequest extends Request { hireClient?: HireClientSession }
interface Claims { kind: string; mid: string; cid: string }

const errClass = (e: unknown) => ((e as Error)?.name && (e as Error).name !== 'Error' ? (e as Error).name : 'UpstreamUnavailable');
export function log(level: 'info' | 'warn', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context });
  if (level === 'warn') console.warn(line); else console.log(line);
}

export const portalOn = (read?: Read): Promise<boolean> => isSwitchOn(SWITCHES.clientPortal, read);
export const signinLink = (token: string): string => `${bookingLinkBase()}/client/?t=${encodeURIComponent(token)}`;

/** The sign-in email: plain text, the one link, how long it lasts. PURE. */
export function signinEmailText(link: string): string {
  return ['Hello,', '', 'Here is your link to sign in to the Refactored.ai employer portal:', link, '',
    'The link works once and expires in one hour. If you did not ask for it, you can ignore this email.', '', 'Refactored.ai'].join('\n');
}

async function deliver(to: string, token: string): Promise<ProviderResult> {
  const routed = await resolveEmailRecipient(to, SIGNIN_SUBJECT);
  const info = await guardedSendMail({ from: `"Refactored.ai" <${env.emailFrom}>`, to: routed.to, subject: routed.subject,
    text: signinEmailText(signinLink(token)), headers: { 'X-MC-Tags': 'hire-client-signin' } });
  return info?.messageId ? { ok: true, messageId: String(info.messageId) } : { ok: false, errorClass: 'SendBlocked', error: 'blocked by kill switch or dev guard' };
}

/** What happened (for logs and tests only); the route answers REQUEST_LINK_RESPONSE whatever this returns. */
export async function requestLink(rawEmail: unknown, opts: { read?: Read; now?: Date } = {}): Promise<RequestLinkOutcome> {
  try {
    if (!(await portalOn(opts.read))) return 'off';
    const email = normalizeEmail(rawEmail);
    if (!email) return 'invalid';
    const verdict = checkRateLimit((await store.recentLinkRequests(email)).map((createdAt) => ({ createdAt })), opts.now ?? new Date());
    if (!verdict.allowed) { log('warn', 'hire_client_link_rate_limited', { reason: verdict.reason }, 'RateLimitError'); return 'limited'; }
    if (!(await store.membershipsFor(email)).length) { log('info', 'hire_client_link_no_access', {}); return 'no_access'; }
    const { token, tokenHash, expiresAt } = mintToken();
    const rowId = await store.insertSigninToken(email, tokenHash, expiresAt); // stored BEFORE the send: a link never sent still counts
    const res = await sendOnce({ recipient: email, subject: SIGNIN_SUBJECT, businessEventId: `hire_client_signin:${rowId}` }, () => deliver(email, token));
    if (res.outcome === 'sent') return 'sent';
    log('warn', 'hire_client_link_send_failed', { token_row: rowId }, res.outcome === 'failed' ? res.errorClass : 'SendSkipped');
    return 'failed';
  } catch (err) {
    log('warn', 'hire_client_link_request_error', {}, errClass(err));
    return 'failed';
  }
}

export type RedeemResult = { ok: true; token: string; expiresIn: number; clientName: string } | { ok: false };

/** Spend a link and mint a session for the address's first membership. Every refusal is the same { ok: false }. */
export async function redeemLink(presented: unknown, opts: { read?: Read; now?: Date } = {}): Promise<RedeemResult> {
  try {
    if (typeof presented !== 'string' || !/^[0-9a-f-]{36}$/i.test(presented)) return { ok: false };
    if (!(await portalOn(opts.read))) return { ok: false };
    // clientMagicLink's decideRedemption rule (exists, not used, not expired), applied in ONE conditional UPDATE so it
    // is also atomic: expired, used and unknown links are one refusal.
    const email = await store.consumeSigninToken(hashToken(presented));
    if (!email) return { ok: false };
    const member = (await store.membershipsFor(email))[0];
    if (!member) { log('info', 'hire_client_link_no_access_at_redeem', {}); return { ok: false }; }
    const claims: Claims = { kind: HIRE_CLIENT_KIND, mid: member.member_id, cid: member.client_id };
    const token = jwt.sign(claims, env.jwtSecret, { audience: HIRE_CLIENT_AUDIENCE, expiresIn: SESSION_TTL_SECONDS });
    return { ok: true, token, expiresIn: SESSION_TTL_SECONDS, clientName: member.client_name };
  } catch (err) {
    log('warn', 'hire_client_redeem_error', {}, errClass(err));
    return { ok: false };
  }
}

/** The guard on every /api/hire/client/* data route: switch on, a valid hire-client session, the member still present. */
export function requireHireClient(read?: Read) {
  return async (req: ClientRequest, res: Response, next: NextFunction): Promise<void> => {
    const refuse = () => { res.status(401).json({ error: SESSION_REFUSED }); };
    try {
      if (!(await portalOn(read))) return refuse();
      const h = req.headers.authorization;
      if (!h || !h.startsWith('Bearer ')) return refuse();
      const c = jwt.verify(h.slice(7), env.jwtSecret, { audience: HIRE_CLIENT_AUDIENCE }) as Partial<Claims>;
      if (c.kind !== HIRE_CLIENT_KIND || typeof c.mid !== 'string' || typeof c.cid !== 'string') return refuse();
      const m = await store.memberById(c.mid, c.cid);
      if (!m) return refuse();
      req.hireClient = { memberId: m.member_id, clientId: m.client_id, clientName: m.client_name, email: m.email };
      next();
    } catch (err) {
      const name = (err as Error)?.name;
      if (name !== 'JsonWebTokenError' && name !== 'TokenExpiredError') log('warn', 'hire_client_session_error', {}, errClass(err));
      refuse();
    }
  };
}
