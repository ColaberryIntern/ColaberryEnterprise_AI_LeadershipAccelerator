import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * oauthState - the signed `state` every network's sign-in carries, and the PKCE verifier
 * derived from it.
 *
 * WHY SIGNED, NOT STORED. `state` defends against CSRF: without it an attacker can hand a
 * victim's browser an authorization code and graft the attacker's own Facebook Page onto the
 * victim's brand. The state is an HMAC over the facts the callback must trust - which network,
 * which admin, which brand, when - so the callback verifies it with no table, no sweep, and no
 * cleanup job. `linkedInOAuth.ts` established this for LinkedIn; this is the same idea for every
 * other network, with two additions that LinkedIn never needed.
 *
 * ADDITION 1: THE CONNECTOR IS SIGNED IN. One callback handler serves five networks, keyed by
 * the URL path. The state names the network it was minted for and the callback refuses a state
 * whose network differs from the path's. Without that, a state minted for a Meta connect could
 * be replayed against the X callback, and whatever code arrived there would be sealed onto the
 * brand in the state.
 *
 * ADDITION 2: PKCE WITHOUT STORAGE. X requires PKCE and Google accepts it. PKCE needs a secret
 * `code_verifier` that is sent only at token exchange and never in the browser-visible authorize
 * URL. The state IS browser-visible (signed, not encrypted), so the verifier cannot ride inside
 * it. Instead the verifier is DERIVED: HMAC(secret, "pkce:" + nonce). The nonce travels in the
 * state; the verifier is recomputed server-side at callback time and exists nowhere else. An
 * attacker who intercepts the code and reads the state still cannot compute the verifier
 * without the server secret, which is the property PKCE exists to give.
 *
 * DOMAIN SEPARATION. The HMAC input is prefixed with "oauth-v2|", so a state minted by the
 * older LinkedIn flow (which signs the bare body) cannot be decoded here, and one minted here
 * cannot be decoded there. The two share a secret; they must not share a meaning.
 */

/** How long a sign-in attempt stays valid. Long enough to sign in, short enough to matter. */
export const STATE_TTL_MS = 10 * 60 * 1000;

const STATE_DOMAIN = 'oauth-v2|';
const PKCE_DOMAIN = 'pkce|';

export class OAuthError extends Error {
  constructor(message: string, public readonly errorClass: string, public readonly status = 400) {
    super(message);
    this.name = 'OAuthError';
  }
}

export interface OAuthStatePayload {
  /** Which network's callback may accept this state. */
  connector: string;
  /** The admin who started the flow. The callback attributes the connection to them. */
  adminId: string;
  /** The brand the accounts will belong to. Signed so a redirect cannot rewrite it. */
  brandId: string;
  /** Milliseconds since epoch, for the TTL. */
  issuedAt: number;
  /** Random per attempt. Also the seed of the PKCE verifier. */
  nonce: string;
}

function secret(env: NodeJS.ProcessEnv): string {
  // The app's JWT secret: already required to exist, one secret to rotate, and a state signed
  // with it is exactly as trustworthy as a session.
  const s = env.JWT_SECRET;
  if (!s) throw new OAuthError('JWT_SECRET is not configured; the sign-in state cannot be signed.', 'ConfigMissing', 500);
  return s;
}

function sign(body: string, env: NodeJS.ProcessEnv): string {
  return createHmac('sha256', secret(env)).update(STATE_DOMAIN + body).digest('base64url');
}

export function encodeState(
  input: { connector: string; adminId: string; brandId: string },
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): { state: string; payload: OAuthStatePayload } {
  const payload: OAuthStatePayload = { ...input, issuedAt: now, nonce: randomBytes(18).toString('base64url') };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return { state: `${body}.${sign(body, env)}`, payload };
}

/**
 * Verify and read a state. Throws `OAuthError` for anything short of a fresh, intact state minted
 * for `expectedConnector`.
 */
export function decodeState(
  state: string,
  expectedConnector: string,
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): OAuthStatePayload {
  const parts = state.split('.');
  if (parts.length !== 2) throw new OAuthError('The sign-in state is malformed.', 'StateInvalid');
  const [body, signature] = parts;

  const a = Buffer.from(signature);
  const b = Buffer.from(sign(body, env));
  // Length first: timingSafeEqual throws on unequal lengths rather than returning false.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new OAuthError('The sign-in state failed verification. Start the connection again.', 'StateInvalid');
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new OAuthError('The sign-in state is malformed.', 'StateInvalid');
  }

  if (typeof payload.issuedAt !== 'number' || now - payload.issuedAt > STATE_TTL_MS) {
    throw new OAuthError('The sign-in attempt expired. Start the connection again.', 'StateExpired');
  }
  if (!payload.adminId || !payload.brandId || !payload.nonce) {
    throw new OAuthError('The sign-in state is incomplete.', 'StateInvalid');
  }
  if (payload.connector !== expectedConnector) {
    // Checked AFTER the signature, so a mismatch is a genuine state for another network rather
    // than noise - which is exactly the replay this refusal exists for.
    throw new OAuthError('The sign-in state was issued for a different network.', 'StateConnectorMismatch');
  }
  return payload;
}

/**
 * The PKCE `code_verifier` for an attempt: 43 url-safe characters, recomputable from the nonce
 * by this server alone. RFC 7636 requires 43-128 characters from the unreserved set; a
 * base64url-encoded SHA-256 HMAC is exactly 43.
 */
export function pkceVerifier(nonce: string, env: NodeJS.ProcessEnv = process.env): string {
  return createHmac('sha256', secret(env)).update(PKCE_DOMAIN + nonce).digest('base64url');
}

/** The S256 `code_challenge` for a verifier (RFC 7636 section 4.2). */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}
