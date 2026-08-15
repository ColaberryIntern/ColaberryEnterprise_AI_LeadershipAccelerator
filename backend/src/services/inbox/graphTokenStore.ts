/**
 * Durable storage for the rotating MS Graph refresh token.
 *
 * Microsoft returns a NEW refresh token on most refreshes. Before this module,
 * graphMailService logged that fact and threw the new token away, so the only
 * copy lived in `MS_GRAPH_REFRESH_TOKEN` and grew staler with every rotation.
 * That works right up until Microsoft invalidates the old one, at which point
 * Hotmail sync, auto-archive and reply-sending all stop at once and the only
 * recovery is a human doing an interactive re-consent.
 *
 * Resolution order is DB first, env second:
 *   - DB present  → the most recently rotated token (authoritative once seeded)
 *   - DB absent   → env var, which is also how the vault gets seeded initially
 *
 * Deliberately NOT stored in `system_settings`: `GET /api/admin/settings`
 * returns that whole table verbatim, so a token there would be published over
 * the admin API.
 */
import { sequelize } from '../../config/database';
import { QueryTypes } from 'sequelize';

const PROVIDER = 'ms_graph_hotmail';
const LOG_PREFIX = '[InboxCOS][TokenStore]';

/** Cached so the hot path does not hit Postgres on every token refresh. */
let cachedToken: string | null = null;

/**
 * The refresh token to use right now: the rotated value from the vault if one
 * exists, otherwise the env var.
 *
 * Never throws — a vault read failure must degrade to the env var rather than
 * take down mail entirely, since the env var is usually still valid.
 */
export async function getRefreshToken(): Promise<string | undefined> {
  if (cachedToken) return cachedToken;

  try {
    const rows = await sequelize.query<{ refresh_token: string }>(
      `SELECT refresh_token FROM oauth_token_vault WHERE provider = :provider LIMIT 1`,
      { replacements: { provider: PROVIDER }, type: QueryTypes.SELECT },
    );
    if (rows.length > 0 && rows[0].refresh_token) {
      cachedToken = rows[0].refresh_token;
      return cachedToken;
    }
  } catch (err: any) {
    console.warn(`${LOG_PREFIX} Vault read failed, falling back to env: ${err.message}`);
  }

  return process.env.MS_GRAPH_REFRESH_TOKEN;
}

/**
 * Persist a rotated refresh token. Idempotent: storing the same value twice is
 * a harmless no-op update.
 *
 * Never throws. A failed write means the next process start falls back to the
 * env var — degraded, but not broken — and that is strictly better than
 * failing the mail operation that triggered the rotation.
 */
export async function saveRotatedToken(token: string): Promise<void> {
  if (!token) return;
  cachedToken = token;

  try {
    await sequelize.query(
      `INSERT INTO oauth_token_vault (provider, refresh_token, rotated_at, updated_at)
       VALUES (:provider, :token, NOW(), NOW())
       ON CONFLICT (provider) DO UPDATE
         SET refresh_token = EXCLUDED.refresh_token,
             rotated_at    = NOW(),
             updated_at    = NOW()`,
      { replacements: { provider: PROVIDER, token } },
    );
    // Length only — never the value (root CLAUDE.md: no secrets in logs).
    console.log(`${LOG_PREFIX} Persisted rotated refresh token (${token.length} chars)`);
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Failed to persist rotated token: ${err.message}`);
  }
}

/**
 * Drop the vault entry and revert to the env var.
 *
 * The recovery path that makes DB-first safe: if a persisted token is rejected
 * by AAD (invalid_grant — revoked, expired, or superseded), continuing to serve
 * it from the vault would wedge mail permanently, because the vault always wins
 * over the env var. Clearing it lets the very next attempt retry with the env
 * var, which may well still be valid.
 */
export async function invalidateStoredToken(): Promise<void> {
  cachedToken = null;
  try {
    await sequelize.query(`DELETE FROM oauth_token_vault WHERE provider = :provider`, {
      replacements: { provider: PROVIDER },
    });
    console.warn(`${LOG_PREFIX} Cleared rejected token from vault — next attempt falls back to MS_GRAPH_REFRESH_TOKEN`);
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Failed to clear rejected token: ${err.message}`);
  }
}

/** Test seam — drops the in-process cache without touching the vault. */
export function __resetTokenCache(): void {
  cachedToken = null;
}
