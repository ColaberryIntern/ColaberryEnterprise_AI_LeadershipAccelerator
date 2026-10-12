/**
 * broadcastPlaybackGrant — the short-lived, signed permission to fetch media bytes.
 *
 * This is where request §4.2's hardest sentence is actually satisfied: "prove the viewer
 * cannot continue obtaining paid content after expiry". A countdown in the UI proves
 * nothing, because the player is not the thing holding the bytes back. The token is.
 *
 * TWO RULES DO ALL THE WORK.
 *
 * 1. A PREVIEW GRANT IS BOUNDED BY THE PREVIEW DEADLINE, NOT BY THE TTL.
 *    expiresAt = min(now + ttl, contentStartedAt + previewSeconds). A viewer at minute
 *    fourteen gets a 60-second token, not a 120-second one. Renewal recomputes from the
 *    same server-side deadline, so refreshing, opening a second tab, moving to another
 *    device, or changing the client clock all converge on the same instant — none of them
 *    can mint a window that outlives the deadline.
 *
 * 2. THE TTL IS SHORT ON PURPOSE. Deliberately not mediaStore's 15 minutes: that is sized
 *    for a provider fetching an image once, and it would leave a revoked viewer — someone
 *    removed from a room, or whose entitlement lapsed mid-event — holding a valid token
 *    for a quarter of an hour. Revocation is only as fast as the shortest token, so the
 *    grant is minutes, and the segment tolerance below is what stops that being jarring.
 *
 * SEGMENT TOLERANCE. A player requests a segment slightly before it needs it, so a token
 * that expires to the exact second cuts playback off mid-buffer. GRANT_SEGMENT_GRACE_MS is
 * the documented allowance: a request arriving within the grace window of expiry is served,
 * one beyond it is not. It applies to the CHECK, never to the grant, so the deadline itself
 * is never extended — the most a viewer can gain is one partially-buffered segment, and
 * they cannot chain it because the next request is past the grace too.
 *
 * Signing deliberately mirrors mediaStore.ts:199-224 — HMAC-SHA256 over `key|expiresAt`
 * under JWT_SECRET, base64url — and the verifier returns the SAME status classes
 * (404 InvalidKey, 403 Unsigned, 410 Expired, 403 BadSignature) so the two media surfaces
 * cannot drift into disagreeing about what a bad link means.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import type { BroadcastAccessDecision } from './broadcastEntitlement';

/** Short, because revocation is only as fast as the shortest live token. */
export const GRANT_TTL_MS = 120_000;
/** Documented buffer tolerance. Applies to verification only, never to the grant. */
export const GRANT_SEGMENT_GRACE_MS = 10_000;

export type GrantErrorClass = 'InvalidKey' | 'Unsigned' | 'Expired' | 'BadSignature' | 'NotEntitled';

export class PlaybackGrantError extends Error {
  constructor(message: string, readonly error_class: GrantErrorClass, readonly status: number) {
    super(message);
    this.name = 'PlaybackGrantError';
  }
}

/** `broadcast/<occurrenceId>/<asset>` — asset is a slug, never a path. */
const KEY_PATTERN = /^broadcast\/[0-9a-f-]{36}\/[a-z0-9][a-z0-9._-]{0,80}$/i;

export function isValidGrantKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

function signingSecret(env: NodeJS.ProcessEnv): string {
  const secret = env.JWT_SECRET;
  if (!secret) {
    // Fail loud rather than sign with a default. An unsigned-but-accepted media URL is the
    // same failure as no paywall at all.
    throw new PlaybackGrantError('JWT_SECRET is not configured; playback cannot be signed.', 'Unsigned', 500);
  }
  return secret;
}

function signature(key: string, expiresAt: number, env: NodeJS.ProcessEnv): string {
  return createHmac('sha256', signingSecret(env)).update(`${key}|${expiresAt}`).digest('base64url');
}

export interface PreviewBound {
  /** null when the viewer has full access — then only the TTL applies. */
  contentStartedAtMs: number | null;
  previewSeconds: number;
}

/**
 * PURE. The whole preview-enforcement rule in one expression, so it can be tested at the
 * 899/900/901 boundary without a clock, a database or a network.
 *
 * Returns null when no token may be issued at all.
 */
export function computeGrantExpiry(
  decision: Pick<BroadcastAccessDecision, 'grant'>,
  bound: PreviewBound,
  nowMs: number,
  ttlMs: number = GRANT_TTL_MS,
): number | null {
  if (decision.grant === 'denied') return null;

  const ttlExpiry = nowMs + ttlMs;
  if (decision.grant === 'full') return ttlExpiry;

  // preview: bounded by the server-side deadline, whatever the TTL would allow.
  if (bound.contentStartedAtMs === null) return null; // clock has not started; nothing to grant
  const deadline = bound.contentStartedAtMs + bound.previewSeconds * 1000;
  if (nowMs >= deadline) return null; // window already spent
  return Math.min(ttlExpiry, deadline);
}

export interface SignedPlayback {
  url: string;
  expiresAt: number;
  /** Seconds the client may rely on. Floor, so a client never rounds past the deadline. */
  ttlSeconds: number;
}

/**
 * Mint a signed media URL, or return null when the viewer may not have one.
 *
 * There is deliberately NO fallback that returns an unsigned or long-lived URL on failure:
 * request §7 forbids concealing a gap behind "a public unlisted URL", and a fallback is
 * exactly how that happens.
 */
export function signPlayback(
  key: string,
  decision: Pick<BroadcastAccessDecision, 'grant'>,
  bound: PreviewBound,
  publicBaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  nowMs: number = Date.now(),
  ttlMs: number = GRANT_TTL_MS,
): SignedPlayback | null {
  if (!isValidGrantKey(key)) throw new PlaybackGrantError('Not a broadcast media key.', 'InvalidKey', 404);
  const expiresAt = computeGrantExpiry(decision, bound, nowMs, ttlMs);
  if (expiresAt === null) return null;
  const s = signature(key, expiresAt, env);
  return {
    url: `${publicBaseUrl.replace(/\/$/, '')}/bm/${key}?e=${expiresAt}&s=${s}`,
    expiresAt,
    ttlSeconds: Math.max(0, Math.floor((expiresAt - nowMs) / 1000)),
  };
}

/**
 * Verify an incoming media request. Returns the key, or throws with the same status classes
 * mediaStore uses so the two surfaces agree.
 *
 * Order matters: grammar, then signature, then expiry. Checking expiry before the signature
 * would let an attacker learn whether a guessed key was ever valid by the difference between
 * 410 and 403.
 */
export function verifyPlaybackRequest(
  key: string,
  expiry: string | undefined,
  sig: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  nowMs: number = Date.now(),
  graceMs: number = GRANT_SEGMENT_GRACE_MS,
): string {
  if (!isValidGrantKey(key)) throw new PlaybackGrantError('Not a broadcast media key.', 'InvalidKey', 404);
  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || !sig) {
    throw new PlaybackGrantError('The link is not signed.', 'Unsigned', 403);
  }

  const expected = Buffer.from(signature(key, expiresAt, env));
  const given = Buffer.from(String(sig));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new PlaybackGrantError('The link signature is invalid.', 'BadSignature', 403);
  }

  // Grace applies only here, and only to in-flight segment requests.
  if (nowMs > expiresAt + graceMs) {
    throw new PlaybackGrantError('The link has expired.', 'Expired', 410);
  }
  return key;
}
