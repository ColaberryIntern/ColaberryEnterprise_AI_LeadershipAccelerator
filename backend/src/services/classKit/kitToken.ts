// kitToken — a short-lived signed token that authorizes the instructor's Class
// Kit deck to READ one session's live state. The deck is opened by an admin (the
// kit-doc endpoint is admin-gated) and the token is baked into the deck at render
// time, scoped to that one session, so the standalone deck can poll live-state
// without carrying the admin JWT. Signed with the same secret as participant
// tokens (env.jwtSecret); 12h TTL covers a class plus setup/overrun.
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

interface KitTokenPayload { typ: 'kit'; sid: string; }

export function mintKitToken(sessionId: string): string {
  return jwt.sign({ typ: 'kit', sid: sessionId } as KitTokenPayload, env.jwtSecret, { expiresIn: '12h' });
}

/** True only if `token` is a valid, unexpired kit token scoped to `sessionId`. */
export function verifyKitToken(token: string | undefined, sessionId: string): boolean {
  if (!token) return false;
  try {
    const p = jwt.verify(token, env.jwtSecret) as KitTokenPayload;
    return p?.typ === 'kit' && p?.sid === sessionId;
  } catch {
    return false;
  }
}
