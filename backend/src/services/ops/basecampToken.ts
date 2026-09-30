/**
 * basecampToken — in-process Basecamp access-token provider with CCPP refresh.
 *
 * The Basecamp token rotates ~every 2 weeks; the source of truth is the CCPP
 * `Basecamp_AuthInfo` table. The backend container reads BASECAMP_ACCESS_TOKEN
 * from its baked `.env`, which goes stale on each rotation — so container-side
 * BC calls (bcSyncService, basecampClient) started 401-ing until the .env was
 * manually updated. This provider closes that gap: it serves the env token
 * normally, and on an auth failure pulls the live token from CCPP and caches it
 * for the rest of the process, so the next rotation self-heals without a manual
 * .env edit + redeploy.
 *
 * The host cron scripts already self-heal via cron-env-wrapper.sh; this is the
 * container-side equivalent. (The CommonJS `scripts/lib/basecampToken.js` is the
 * host-script version; this TS module exists because the container runs from
 * compiled `dist/` and cannot require the un-compiled .js.)
 */
import sql from 'mssql';

let cached: string | null = null;
let refreshing: Promise<string> | null = null;

function clean(t: string | undefined | null): string {
  let s = String(t || '').trim();
  if (s.toLowerCase().startsWith('bearer ')) s = s.slice(7).trim();
  return s;
}

const TOKEN_QUERY =
  'SELECT TOP 1 AccessToken FROM Basecamp_AuthInfo WHERE IsActive = 1 ORDER BY BasecampAuthInfoID DESC';

async function fetchFromCcpp(): Promise<string> {
  const pool = await new sql.ConnectionPool({
    server: process.env.MSSQL_HOST as string,
    port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASS,
    database: process.env.MSSQL_DATABASE,
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: 2, min: 0, idleTimeoutMillis: 5000 },
  }).connect();
  try {
    const r = await pool.request().query(TOKEN_QUERY);
    const t = clean(r.recordset?.[0]?.AccessToken);
    if (!t) throw new Error('Basecamp_AuthInfo returned no active token (IsActive = 1)');
    return t;
  } finally {
    await pool.close();
  }
}

/** True for an expired/invalid Basecamp token response (refresh + retry). */
export function isAuthError(status: number): boolean {
  return status === 401;
}

/**
 * Current token: the cached value if we've refreshed, else the env token.
 * Cheap and synchronous — no CCPP round-trip. Throws only if neither exists.
 */
export function getBcToken(): string {
  if (cached) return cached;
  const env = clean(process.env.BASECAMP_ACCESS_TOKEN);
  if (env) { cached = env; return env; }
  throw new Error('BASECAMP_ACCESS_TOKEN not set and no cached Basecamp token');
}

/**
 * Force-refresh the token from CCPP (the rotation source of truth) and cache it.
 * Single-flight: concurrent callers share one CCPP round-trip. Falls back to the
 * env token if CCPP creds are absent or the pull fails, so dev/local still works.
 */
export async function refreshBcToken(): Promise<string> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      if (process.env.MSSQL_HOST) {
        const t = await fetchFromCcpp();
        cached = t;
        console.warn('[basecampToken] refreshed token from CCPP after auth failure');
        return t;
      }
    } catch (e: any) {
      console.warn(`[basecampToken] CCPP refresh failed (${e?.message}); keeping env token`);
    }
    const env = clean(process.env.BASECAMP_ACCESS_TOKEN);
    if (env) { cached = env; return env; }
    throw new Error('CCPP refresh failed and no BASECAMP_ACCESS_TOKEN fallback');
  })();
  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
}

/** Test-only: reset the module cache so each test starts clean. */
export function __resetForTests(): void {
  cached = null;
  refreshing = null;
}
