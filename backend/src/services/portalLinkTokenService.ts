import crypto from 'crypto';
import { sequelize } from '../config/database';
import { REPLAY_GRACE_SECONDS } from '../db/ensurePortalLinkTokenSchema';
import { safeNextPath } from '../utils/safeNextPath';

/**
 * Mint and redeem the one-click sign-in links carried by notification email.
 *
 * The reasoning for the table — why not `enrollments.portal_token`, why single
 * use, why a replay grace window — lives in `db/ensurePortalLinkTokenSchema.ts`
 * and is not repeated here. This module is the two operations on it.
 *
 * ## The raw token exists in exactly one place
 *
 * `mintPortalLinkToken` is the only code that ever holds the token in the clear,
 * and it hands it straight to the caller for the URL. What is stored is the
 * SHA-256 hash. Nothing here logs the token, and nothing here returns it twice —
 * a token that is lost before it reaches the email is gone, which is correct.
 *
 * ## The claim is one statement, on purpose
 *
 * Reading the row, deciding it is unused, and then marking it used is a
 * check-then-act race: two clicks landing together would both read `used_at IS
 * NULL` and both be honoured. The UPDATE below does the test and the write in one
 * statement, so Postgres decides the winner, and `RETURNING` tells us whether we
 * were it. This is the same posture `email/idempotentSend.ts` takes for the send
 * ledger, and for the same reason.
 *
 * ## `$grace::int` is load-bearing, not decoration
 *
 * A bare `$grace * INTERVAL '1 second'` gives Postgres a parameter of unknown type
 * beside an interval, and both `integer * interval` and `double precision *
 * interval` match — "operator is not unique". That throws at runtime, the catch
 * below turns it into `null`, and EVERY one-click link fails while the logs show
 * a tidy warning. A mocked `sequelize.query` accepts the statement happily and
 * deduces nothing, so no test in this file would ever have caught it.
 */

/** 256 bits, URL-safe. Longer than a UUID's 122 bits of entropy, and not a guessable shape. */
const TOKEN_BYTES = 32;

/** What these tokens are for. Stored so a future purpose cannot redeem this one's link. */
export const PURPOSE_DM_NOTIFICATION = 'dm_notification';

/** Default lifetime. Matches the portal magic link, so this grants nothing longer than login already does. */
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

export interface MintInput {
  enrollmentId: string;
  purpose: string;
  /** Where to land after sign-in. Validated here; an unsafe value is stored as null, never as-is. */
  nextPath?: string | null;
  ttlMs?: number;
}

/**
 * Create a token and return it in the clear, once.
 *
 * Returns null rather than throwing when the row cannot be written: a mail about
 * a message must still go out if this fails, just without the one-click link.
 * The caller falls back to a plain portal URL, which is exactly today's behaviour.
 */
export async function mintPortalLinkToken(input: MintInput): Promise<string | null> {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const ttl = input.ttlMs && input.ttlMs > 0 ? input.ttlMs : DEFAULT_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);
  // Validated at MINT as well as at redemption. The path is built by this codebase
  // rather than by a request, so an unsafe one here means a programming error, and
  // storing it would hand the verify page something it will only discard anyway.
  const nextPath = safeNextPath(input.nextPath ?? null);

  try {
    await sequelize.query(
      `INSERT INTO portal_link_tokens (token_hash, enrollment_id, purpose, next_path, expires_at)
       VALUES ($hash, $enrollmentId, $purpose, $nextPath, $expiresAt)`,
      {
        bind: {
          hash: hashToken(raw),
          enrollmentId: input.enrollmentId,
          purpose: input.purpose,
          nextPath,
          expiresAt,
        },
      },
    );
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'portal_link_token_mint_failed',
      outcome: 'failure',
      error_class: err?.name || 'Error',
      // The enrollment, never the token.
      context: { enrollment_id: input.enrollmentId, purpose: input.purpose },
    }));
    return null;
  }

  // Housekeeping, scoped to this enrollment so it stays an index seek rather than
  // a table scan, and best-effort so a failed tidy never costs somebody their link.
  // Deliberately opportunistic: there is no scheduler for this table, and adding
  // one for a few rows per message would be more moving parts than the problem.
  try {
    await sequelize.query(
      `DELETE FROM portal_link_tokens
        WHERE enrollment_id = $enrollmentId AND expires_at < NOW() - INTERVAL '7 days'`,
      { bind: { enrollmentId: input.enrollmentId } },
    );
  } catch { /* tidying is never allowed to fail a mint */ }

  return raw;
}

export interface ClaimResult {
  enrollmentId: string;
  nextPath: string | null;
}

/**
 * Redeem a token. Returns null for unknown, expired, or replayed-past-the-grace.
 *
 * `COALESCE(used_at, NOW())` keeps the FIRST claim's timestamp. Writing NOW()
 * unconditionally would slide the grace window forward on every replay, so a
 * token polled once a minute would stay valid forever — the opposite of single use.
 */
export async function claimPortalLinkToken(raw: string, purpose?: string): Promise<ClaimResult | null> {
  if (!raw || typeof raw !== 'string') return null;

  try {
    const [rows]: any = await sequelize.query(
      `UPDATE portal_link_tokens
          SET used_at = COALESCE(used_at, NOW())
        WHERE token_hash = $hash
          AND expires_at > NOW()
          AND ($purpose IS NULL OR purpose = $purpose)
          AND (used_at IS NULL OR used_at > NOW() - ($grace::int * INTERVAL '1 second'))
        RETURNING enrollment_id, next_path`,
      {
        bind: {
          hash: hashToken(raw),
          purpose: purpose ?? null,
          grace: REPLAY_GRACE_SECONDS,
        },
      },
    );
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row) return null;
    return {
      enrollmentId: String(row.enrollment_id),
      // Re-validated on the way out. The column is varchar and this value becomes a
      // redirect, so it is checked at the boundary it leaves through as well as the
      // one it entered by.
      nextPath: safeNextPath(row.next_path),
    };
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'portal_link_token_claim_failed',
      outcome: 'failure',
      error_class: err?.name || 'Error',
      context: { purpose: purpose ?? null },
    }));
    return null;
  }
}
