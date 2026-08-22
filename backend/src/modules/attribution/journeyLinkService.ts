import crypto from 'crypto';
import { env } from '../../config/env';

/**
 * Journey Link Service — signed, short-lived, opaque cross-domain context tokens.
 *
 * WHY THIS EXISTS: the current tracker identifies a visitor from a raw `?email=` URL
 * parameter. That leaks PII into browser history, referrer headers, server access logs
 * and any analytics tool on the page, and it lets anyone who knows an email address bind
 * their own browser to that person's journey. Cookies and localStorage cannot carry
 * context between cpn.org and aiflotation.com, so something has to travel in the URL —
 * it just must not be the email.
 *
 * A `jx` token carries IDENTIFIERS ONLY. No email, no name, no phone, no profile data.
 * Anyone intercepting it learns a set of opaque UUIDs and an expiry, and can associate a
 * destination session with them — which is exactly and only what the link was for.
 *
 * Shape: `<base64url(payload)>.<hex hmac>` — self-contained and stateless, so no
 * database row has to be created per outbound link and expiry needs no sweeper.
 *
 * Failure model: verification is pure and cannot throw on attacker input. Malformed,
 * tampered, expired, or wrong-context tokens all return null. Fail-closed by
 * construction — there is no branch that returns a partial context.
 */

/**
 * Domain separation. This prefix means a journey token can never be cross-used as an
 * unsubscribe token or a JWT even though all three may fall back to the same secret.
 */
const CONTEXT = 'refactored:journey:v1';

/** 30 minutes. A campaign click is acted on immediately or not at all; a longer window
 *  only widens the replay opportunity for a token sitting in someone's browser history. */
const DEFAULT_TTL_SECONDS = 30 * 60;

export interface JourneyTokenPayload {
  /** Originating browser identity. */
  v?: string | null;
  /** Canonical lead id. INTEGER because leads.id is an INTEGER autoincrement. */
  l?: number | null;
  c?: string | null;
  cl?: string | null;
  s?: string | null;
  /** Originating brand, so the destination can record a cross-brand transition. */
  ob?: string | null;
  /** Issued-at and expires-at, epoch seconds. */
  iat: number;
  exp: number;
}

export interface JourneyLinkInput {
  visitorId?: string | null;
  leadId?: number | null;
  campaignId?: string | null;
  campaignLeadId?: string | null;
  sessionId?: string | null;
  originBrandId?: string | null;
  ttlSeconds?: number;
  /** Injected in tests so token expiry can be asserted without waiting. */
  now?: Date;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string | null {
  try {
    return Buffer.from(input, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

function sign(encodedPayload: string): string {
  return crypto
    .createHmac('sha256', env.journeyLinkSecret)
    .update(`${CONTEXT}:${encodedPayload}`)
    .digest('hex');
}

/** Mint a signed journey token. Returns the token string only — never a URL with PII. */
export function createJourneyToken(input: JourneyLinkInput): string {
  const now = input.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const ttl = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  const payload: JourneyTokenPayload = {
    v: input.visitorId ?? null,
    l: input.leadId ?? null,
    c: input.campaignId ?? null,
    cl: input.campaignLeadId ?? null,
    s: input.sessionId ?? null,
    ob: input.originBrandId ?? null,
    iat: issuedAt,
    exp: issuedAt + ttl,
  };

  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

/**
 * Verify and decode. Returns null for anything that is not a currently-valid token
 * minted by this server: malformed, tampered, or expired.
 */
export function verifyJourneyToken(
  token: string | null | undefined,
  now: Date = new Date(),
): JourneyTokenPayload | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signature, 'utf8');
  // Length-check before timingSafeEqual, which throws on a length mismatch. A different
  // length is itself proof of invalidity, so nothing is leaked by returning early.
  if (expectedBuf.length !== actualBuf.length) return null;
  if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) return null;

  const json = base64UrlDecode(encoded);
  if (!json) return null;

  let payload: JourneyTokenPayload;
  try {
    payload = JSON.parse(json) as JourneyTokenPayload;
  } catch {
    return null;
  }

  // A signature proves authorship, not freshness. Expiry is checked separately and
  // after the signature so an attacker cannot use timing to probe payload contents.
  if (typeof payload.exp !== 'number') return null;
  if (payload.exp * 1000 <= now.getTime()) return null;

  return payload;
}

/**
 * Append a journey token to a destination URL as `?jx=`.
 *
 * Deliberately narrow: it takes identifiers, never a lead's email or name. If a future
 * caller wants to add PII to a cross-domain URL, they have to do it somewhere other
 * than here, and that is the point.
 */
export function buildJourneyUrl(destinationUrl: string, input: JourneyLinkInput): string {
  const url = new URL(destinationUrl);
  url.searchParams.set('jx', createJourneyToken(input));
  return url.toString();
}

/** The context a destination site may act on after verifying a token. */
export interface JourneyContext {
  visitorId: string | null;
  leadId: number | null;
  campaignId: string | null;
  campaignLeadId: string | null;
  originSessionId: string | null;
  originBrandId: string | null;
}

/** Flatten a verified payload into the shape the tracking layer consumes. */
export function toJourneyContext(payload: JourneyTokenPayload): JourneyContext {
  return {
    visitorId: payload.v ?? null,
    leadId: typeof payload.l === 'number' ? payload.l : null,
    campaignId: payload.c ?? null,
    campaignLeadId: payload.cl ?? null,
    originSessionId: payload.s ?? null,
    originBrandId: payload.ob ?? null,
  };
}
