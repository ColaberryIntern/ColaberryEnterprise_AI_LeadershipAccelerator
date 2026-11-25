// kitToken — a short-lived signed token that authorizes the instructor's Class
// Kit deck to READ one session's live state. The deck is opened by an admin (the
// kit-doc endpoint is admin-gated) and the token is baked into the deck at render
// time, scoped to that one session, so the standalone deck can poll live-state
// without carrying the admin JWT. Signed with the same secret as participant
// tokens (env.jwtSecret); 12h TTL covers a class plus setup/overrun.
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

/** 'deck' runs the class. 'notes' is the presenter's phone page: any staff login can open that page, so its token cannot open an offer. */
export type KitScope = 'deck' | 'notes';
interface KitTokenPayload { typ: 'kit'; sid: string; scope?: KitScope; }

export function mintKitToken(sessionId: string, scope: KitScope = 'deck'): string {
  return jwt.sign({ typ: 'kit', sid: sessionId, scope } as KitTokenPayload, env.jwtSecret, { expiresIn: '12h' });
}

/** True only if `token` is a valid, unexpired kit token scoped to `sessionId`. */
export function verifyKitToken(token: string | undefined, sessionId: string): boolean {
  return read(token, sessionId) !== null;
}

/**
 * True only for a token from the deck itself. A token with no scope was minted before scopes existed and is
 * refused: it may have come from the presenter page. Reopening the deck mints a good one.
 */
export function verifyDeckToken(token: string | undefined, sessionId: string): boolean {
  return read(token, sessionId)?.scope === 'deck';
}

function read(token: string | undefined, sessionId: string): KitTokenPayload | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, env.jwtSecret) as KitTokenPayload;
    return p?.typ === 'kit' && p?.sid === sessionId ? p : null;
  } catch {
    return null; // expired, tampered or not a token: the caller falls back to the staff login check
  }
}
