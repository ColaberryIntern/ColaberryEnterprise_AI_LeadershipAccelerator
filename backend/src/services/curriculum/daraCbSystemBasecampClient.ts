/**
 * Dara v2 Phase 7 activation — a dedicated, minimal Basecamp POST helper
 * authenticated as the real "CB System" service account (Basecamp person id
 * 37708014), per Ali's explicit direction: "Use CB System for agent
 * communication."
 *
 * Deliberately NOT built by threading a token override through the shared
 * `basecampClient.ts` — that file's retry-on-401 logic (`bcSend()`) calls
 * `refreshBcToken()` on any 401, which refreshes and retries with Ali's own
 * CCPP-sourced token. For a CB-System-authenticated call, that would be
 * exactly the "self-reply flood" failure class `scripts/ops-engine/`'s own
 * comments describe at length: a stale/rejected CB System token silently
 * falling back to a real person's identity. This module fails closed instead
 * — a 401 or any other failure is a real, reported failure, never a
 * fallback to a different identity.
 *
 * Token source: the SAME cache file `scripts/ops-engine/refreshCbSystemToken.sh`
 * already keeps fresh (a real, existing, independently-running host cron job
 * — this module never mints or refreshes a token itself), confirmed mounted
 * into the backend container at `/app/host-ops-engine/` (verified directly
 * against the real container before writing this). The cache file's raw
 * content, trimmed, IS the bearer token — confirmed against
 * `scripts/cron-env-wrapper.sh`'s own real, working extraction
 * (`export BASECAMP_ACCESS_TOKEN="$(cat "$CB_SYSTEM_TOKEN_CACHE")"`), not
 * assumed from the file's on-disk encoding.
 *
 * Deliberately minimal: no retry/backoff (this is a rare, low-volume write —
 * one todo per real handoff — not a bulk process where transient-failure
 * resilience earns its complexity), a single timeout, single attempt.
 */
import fs from 'fs/promises';

const CB_SYSTEM_TOKEN_CACHE_PATH =
  process.env.CB_SYSTEM_TOKEN_CACHE_PATH || '/app/host-ops-engine/cb-system-token.cache';
const BC_ACCOUNT_ID = process.env.BASECAMP_ACCOUNT_ID || '3945211';
const BC_API = `https://3.basecampapi.com/${BC_ACCOUNT_ID}`;
const BC_USER_AGENT = process.env.BASECAMP_USER_AGENT || 'Colaberry AI Ops Command Center (ali@colaberry.com)';
const CB_SYSTEM_TIMEOUT_MS = 15000;

export class CbSystemTokenUnavailableError extends Error {
  error_class = 'CbSystemTokenUnavailableError';
  constructor(message: string) {
    super(message);
    this.name = 'CbSystemTokenUnavailableError';
  }
}

async function getCbSystemToken(): Promise<string> {
  let raw: string;
  try {
    raw = await fs.readFile(CB_SYSTEM_TOKEN_CACHE_PATH, 'utf8');
  } catch (e: any) {
    throw new CbSystemTokenUnavailableError(`CB System token cache unreadable at ${CB_SYSTEM_TOKEN_CACHE_PATH}: ${e?.message || e}`);
  }
  const token = raw.trim();
  if (!token) {
    throw new CbSystemTokenUnavailableError(`CB System token cache at ${CB_SYSTEM_TOKEN_CACHE_PATH} is empty`);
  }
  return token;
}

/**
 * POST as CB System. Never falls back to any other identity on any failure —
 * throws (a real, honest failure) rather than silently posting as a real
 * person. Caller decides what "failed" means for its own audit trail.
 */
export async function cbSystemBcPost<T>(urlOrPath: string, body: unknown): Promise<T> {
  const token = await getCbSystemToken();
  const url = urlOrPath.startsWith('http') ? urlOrPath : `${BC_API}${urlOrPath}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': BC_USER_AGENT,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CB_SYSTEM_TIMEOUT_MS),
  });

  if (!res.ok) {
    const responseBody = await res.text().catch(() => '');
    throw new Error(`CB System POST ${url} -> ${res.status} ${responseBody.slice(0, 200)}`);
  }

  return (await res.json()) as T;
}
