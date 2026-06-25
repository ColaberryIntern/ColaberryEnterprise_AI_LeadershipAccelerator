/**
 * basecampClient — shared BC API helper for the ops services. Exposes typed
 * get/post. The access token is resolved (and auto-refreshed from CCPP on a
 * 401) by the basecampToken provider, so a token rotation self-heals instead
 * of 401-ing until the container's .env is manually updated.
 */
import { getBcToken, refreshBcToken, isAuthError } from './basecampToken';
import { BC_RETRYABLE_STATUS, bcBackoffMs, bcPace, sleep } from './bcRetry';

const BC_ACCOUNT_ID = process.env.BASECAMP_ACCOUNT_ID || '3945211';
const BC_API = `https://3.basecampapi.com/${BC_ACCOUNT_ID}`;
const BC_USER_AGENT =
  process.env.BASECAMP_USER_AGENT || 'Colaberry AI Ops Command Center (ali@colaberry.com)';
const BC_MAX_RETRIES = 5;

function bcHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': BC_USER_AGENT,
    Accept: 'application/json',
    ...extra,
  };
}

// One fetch attempt loop shared by get/post: refresh the token on a 401 (token
// rotation) and back off + retry on a 429/503 (rate limit). `send` builds a
// fresh Request each attempt so it picks up a refreshed token.
async function bcSend(send: () => Promise<Response>): Promise<Response> {
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    await bcPace(); // stay under BC's rate limit
    const r = await send();
    if (isAuthError(r.status) && !refreshed) {
      await refreshBcToken();
      refreshed = true;
      continue;
    }
    if (BC_RETRYABLE_STATUS.has(r.status) && attempt < BC_MAX_RETRIES) {
      await sleep(bcBackoffMs(r.headers.get('Retry-After'), attempt));
      continue;
    }
    return r;
  }
}

export async function bcGet<T>(urlOrPath: string): Promise<T> {
  const u = urlOrPath.startsWith('http') ? urlOrPath : `${BC_API}${urlOrPath}`;
  const r = await bcSend(() => fetch(u, { headers: bcHeaders(getBcToken()) }));
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`BC GET ${u} -> ${r.status} ${body.slice(0, 200)}`);
  }
  return (await r.json()) as T;
}

export async function bcPost<T>(urlOrPath: string, body: unknown): Promise<T> {
  const u = urlOrPath.startsWith('http') ? urlOrPath : `${BC_API}${urlOrPath}`;
  const r = await bcSend(() =>
    fetch(u, {
      method: 'POST',
      headers: bcHeaders(getBcToken(), { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }),
  );
  if (!r.ok) {
    const errBody = await r.text().catch(() => '');
    throw new Error(`BC POST ${u} -> ${r.status} ${errBody.slice(0, 200)}`);
  }
  return (await r.json()) as T;
}

export const BC_BASE_URL = BC_API;
