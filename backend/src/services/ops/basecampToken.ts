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

/* ---------------------------------------------------------------------------
 * Identity verification
 *
 * ## The failure this exists for
 *
 * TOKEN_QUERY above selects on RECENCY and the table has no identity column, so
 * whichever job last wrote an active row decides which person this whole platform
 * acts as. On 2026-11-13T15:00:02Z a legacy CCPP refresher inserted row 249 holding
 * a grant for CB System <ali+999@colaberry.com> id 37708014 instead of Ali id
 * 17454835. CB System is not a member of Basecamp project 49210714, and Basecamp
 * answers 404 rather than 403 for a resource the caller cannot see, so every read
 * and write against that project failed in a way INDISTINGUISHABLE FROM A DELETED
 * TICKET. The token was valid the whole time. It just belonged to somebody else.
 *
 * `scripts/refreshBasecampTokenFromVault.sh` now asserts the identity before it
 * writes, which stops THIS platform writing a wrong token. It cannot stop the other
 * writer from inserting one, so the read path has to be able to notice.
 *
 * ## Why this logs instead of throwing
 *
 * The wrong identity could still see 64 of the 65 projects it was asked about, so
 * most ops work kept running. Throwing here would convert "one project 404s" into
 * "every Basecamp call in the platform fails", which is a worse outage bought in
 * exchange for loudness. So the token is still returned and the mismatch is emitted
 * as a structured error with a stable error_class, which is this repo's definition
 * of loud (see CLAUDE.md, Observability Framework). `lastBcIdentityCheck()` exposes
 * the same verdict in-process for anything that wants to degrade deliberately.
 *
 * ## Three things this deliberately does not do
 *
 * - It does NOT go through `bcGet`. That would 401 on a bad token, call back into
 *   refreshBcToken, and recurse. It uses a bare fetch with the token in hand.
 * - It does NOT fail the refresh when the check itself fails. A profile endpoint
 *   that times out is an observability problem; letting it break authentication
 *   would make this module less reliable than the bug it reports.
 * - It does NOT run on the env-token fallback path. The defect is in the CCPP
 *   rotation, and verifying the env token would put a network call in the local and
 *   test paths, which is how a provider module acquires a hidden dependency.
 * ------------------------------------------------------------------------- */

/** The Basecamp person this platform is expected to act as: Ali, ali@colaberry.com. */
export const EXPECTED_BC_PERSON_ID = 17454835;

// Both read env lazily rather than at module load, matching getBcToken above. A
// constant frozen at import time makes the module depend on the order env vars are
// set, which is a property no reader expects and every test trips over.
//
// Defined here rather than imported from basecampClient on purpose: that module
// imports this one, so importing it back would be a circular dependency, which
// CLAUDE.md forbids. Two string literals is the cheaper price.
function profileUrl(): string {
  const account = process.env.BASECAMP_ACCOUNT_ID || '3945211';
  return `https://3.basecampapi.com/${account}/my/profile.json`;
}

function userAgent(): string {
  return process.env.BASECAMP_USER_AGENT
    || 'Colaberry AI Ops Command Center (ali@colaberry.com)';
}

/** Bounded so a hanging profile endpoint cannot stall every caller of a refresh. */
const IDENTITY_TIMEOUT_MS = 5000;

export interface BcIdentityCheck {
  checked_at: string;
  /** `unknown` means the check could not run, NOT that the identity is right. */
  outcome: 'match' | 'mismatch' | 'unknown';
  expected_person_id: number;
  actual_person_id: number | null;
  actual_email: string | null;
  error_class?: string;
}

let lastIdentity: BcIdentityCheck | null = null;

/**
 * The most recent identity verdict, or null if no CCPP refresh has happened yet.
 * Null and `unknown` both mean "not established" rather than "fine".
 */
export function lastBcIdentityCheck(): BcIdentityCheck | null {
  return lastIdentity;
}

function expectedPersonId(): number {
  const raw = (process.env.BASECAMP_EXPECTED_PERSON_ID || '').trim();
  if (!raw) return EXPECTED_BC_PERSON_ID;
  const n = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(n) || n <= 0) {
    console.warn(
      `[basecampToken] BASECAMP_EXPECTED_PERSON_ID is not a positive integer (${raw}); `
      + `using ${EXPECTED_BC_PERSON_ID}`,
    );
    return EXPECTED_BC_PERSON_ID;
  }
  return n;
}

function emit(level: 'error' | 'warn', event: string, check: BcIdentityCheck, durationMs: number): void {
  const line = JSON.stringify({
    timestamp: check.checked_at,
    level,
    service: 'backend',
    event,
    duration_ms: durationMs,
    outcome: level === 'error' ? 'failure' : 'partial',
    error_class: check.error_class,
    context: {
      source: 'ccpp',
      expected_person_id: check.expected_person_id,
      actual_person_id: check.actual_person_id,
      actual_email: check.actual_email,
    },
  });
  if (level === 'error') console.error(line);
  else console.warn(line);
}

/**
 * Ask Basecamp who `token` is and record the verdict. Never throws, never returns
 * a value the caller has to branch on: the refresh proceeds either way.
 */
async function verifyIdentity(token: string): Promise<void> {
  const expected = expectedPersonId();
  const started = Date.now();
  const base = {
    checked_at: new Date().toISOString(),
    expected_person_id: expected,
    actual_person_id: null as number | null,
    actual_email: null as string | null,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IDENTITY_TIMEOUT_MS);
  try {
    const r = await fetch(profileUrl(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': userAgent(),
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!r.ok) {
      lastIdentity = { ...base, outcome: 'unknown', error_class: `ProfileHttp${r.status}` };
      emit('warn', 'basecamp_identity_unverified', lastIdentity, Date.now() - started);
      return;
    }
    const body = (await r.json()) as { id?: unknown; email_address?: unknown };
    const actual = typeof body?.id === 'number' ? body.id : Number.parseInt(String(body?.id), 10);
    const email = typeof body?.email_address === 'string' ? body.email_address : null;
    if (!Number.isSafeInteger(actual)) {
      lastIdentity = { ...base, outcome: 'unknown', actual_email: email, error_class: 'ProfileShape' };
      emit('warn', 'basecamp_identity_unverified', lastIdentity, Date.now() - started);
      return;
    }
    if (actual !== expected) {
      lastIdentity = {
        ...base,
        outcome: 'mismatch',
        actual_person_id: actual,
        actual_email: email,
        error_class: 'BasecampIdentityMismatch',
      };
      emit('error', 'basecamp_identity_mismatch', lastIdentity, Date.now() - started);
      return;
    }
    lastIdentity = { ...base, outcome: 'match', actual_person_id: actual, actual_email: email };
  } catch (e: any) {
    lastIdentity = {
      ...base,
      outcome: 'unknown',
      error_class: e?.name === 'AbortError' ? 'TimeoutError' : 'UpstreamUnavailable',
    };
    emit('warn', 'basecamp_identity_unverified', lastIdentity, Date.now() - started);
  } finally {
    clearTimeout(timer);
  }
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
        // Verify WHO the rotated token is, not just that it exists. Awaited inside
        // the single-flight so concurrent callers share one profile call rather
        // than each making their own. See the block comment above verifyIdentity.
        await verifyIdentity(t);
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
  lastIdentity = null;
}
