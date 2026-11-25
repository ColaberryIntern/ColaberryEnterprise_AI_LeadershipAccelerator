import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';

/**
 * The personal link in a recap email (WL1.2).
 *
 * It is NOT the guest pass: a guest pass lives 12 hours and authorizes acting in the live class. This
 * token only lets one attendee read one class's recap page, including the class chat, for 30 days.
 * Scoped to (session, guest) so a forwarded link opens that class only, and a link from one class can
 * never read another class's chat.
 */
interface RecapClaims { typ: 'recap'; sid: string; gid: string }

export const RECAP_TOKEN_TTL = '30d';

export function mintRecapToken(sessionId: string, guestId: string): string {
  return jwt.sign({ typ: 'recap', sid: sessionId, gid: guestId } as RecapClaims, env.jwtSecret, { expiresIn: RECAP_TOKEN_TTL });
}

/** The guest id when `token` is a valid recap token for this session, else null. Never throws. */
export function verifyRecapToken(token: unknown, sessionId: string): string | null {
  if (typeof token !== 'string' || !token) return null;
  try {
    const p = jwt.verify(token, env.jwtSecret) as RecapClaims;
    return p?.typ === 'recap' && p.sid === sessionId && typeof p.gid === 'string' ? p.gid : null;
  } catch {
    return null;
  }
}

/** Opt-out token: email-scoped, no expiry (an unsubscribe link must keep working). */
interface OptOutClaims { typ: 'recap_optout'; em: string }

export function mintOptOutToken(emailLower: string): string {
  return jwt.sign({ typ: 'recap_optout', em: emailLower } as OptOutClaims, env.jwtSecret);
}

export function verifyOptOutToken(token: unknown): string | null {
  if (typeof token !== 'string' || !token) return null;
  try {
    const p = jwt.verify(token, env.jwtSecret) as OptOutClaims;
    return p?.typ === 'recap_optout' && typeof p.em === 'string' && p.em.includes('@') ? p.em : null;
  } catch {
    return null;
  }
}
