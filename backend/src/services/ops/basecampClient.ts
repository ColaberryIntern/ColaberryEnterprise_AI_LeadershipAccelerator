/**
 * basecampClient — shared BC API helper for the ops services. Exposes typed
 * get/post/put plus a paginating getAll. The access token is resolved (and
 * auto-refreshed from CCPP on a 401) by the basecampToken provider, so a token
 * rotation self-heals instead of 401-ing until the container's .env is
 * manually updated.
 *
 * /inbox-zero T6 (CC-20260910-3q7x) added two things this client was missing:
 *   - a timeout on every fetch. There was none, so a Basecamp stall hung the
 *     caller forever — and would have hung an operator session inside it.
 *     An abort is classified as TimeoutError and retried inside the same
 *     BC_MAX_RETRIES budget as a 429, then thrown with a stable error_class.
 *   - bcGetAll, following `Link: rel="next"`. Without it every TypeScript
 *     read of a Basecamp collection was silently first-page-only.
 */
import { getBcToken, refreshBcToken, isAuthError } from './basecampToken';
import { BC_RETRYABLE_STATUS, bcBackoffMs, bcPace, bcTimeoutMs, isAbortError, parseNextLink, sleep } from './bcRetry';
import { classifyError } from '../../utils/errorClassifier';

// Lazy import (matches alertDeliveryService.ts's convention): avoids pulling
// the full Sequelize/model graph into every basecampClient import.
async function emitFailureEvent(params: Parameters<typeof import('../aiEventService').emitAiEvent>[0]): Promise<void> {
  try {
    const { emitAiEvent } = await import('../aiEventService');
    await emitAiEvent(params);
  } catch (err: any) {
    console.error(JSON.stringify({
      level: 'error', service: 'backend', event: 'emit_failure_event_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { event_type: params.event_type, message: err?.message },
    }));
  }
}

const BC_ACCOUNT_ID = process.env.BASECAMP_ACCOUNT_ID || '3945211';
const BC_API = `https://3.basecampapi.com/${BC_ACCOUNT_ID}`;
const BC_USER_AGENT =
  process.env.BASECAMP_USER_AGENT || 'Colaberry AI Ops Command Center (ali@colaberry.com)';
const BC_MAX_RETRIES = 5;
// A collection deeper than this is almost certainly a runaway (Basecamp pages
// are 50 items; 20 pages = 1,000 rows). Stop, and say so — never truncate quietly.
export const BC_DEFAULT_MAX_PAGES = 20;

/** Thrown when every attempt at a request timed out. `error_class` is the
 * stable tag root CLAUDE.md requires on every caught exception. */
export class BcTimeoutError extends Error {
  error_class = 'TimeoutError';
  constructor(public method: string, public url: string, public attempts: number, public timeoutMs: number) {
    super(`BC ${method} ${url} timed out after ${attempts} attempt(s) at ${timeoutMs}ms each`);
    this.name = 'BcTimeoutError';
  }
}

function bcHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': BC_USER_AGENT,
    Accept: 'application/json',
    ...extra,
  };
}

function toUrl(urlOrPath: string): string {
  return urlOrPath.startsWith('http') ? urlOrPath : `${BC_API}${urlOrPath}`;
}

// One fetch attempt loop shared by every verb: refresh the token on a 401
// (token rotation), back off + retry on a 429/503 (rate limit) or a timeout.
// `send` builds a fresh Request each attempt so it picks up a refreshed token,
// and receives a fresh AbortSignal each attempt so the timeout is per-try.
async function bcSend(method: string, url: string, send: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
  let refreshed = false;
  const timeoutMs = bcTimeoutMs();
  for (let attempt = 0; ; attempt++) {
    await bcPace(); // stay under BC's rate limit
    let r: Response;
    try {
      r = await send(AbortSignal.timeout(timeoutMs));
    } catch (err) {
      if (!isAbortError(err)) throw err;
      if (attempt < BC_MAX_RETRIES) {
        await sleep(bcBackoffMs(null, attempt));
        continue;
      }
      const timeoutErr = new BcTimeoutError(method, url, attempt + 1, timeoutMs);
      emitFailureEvent({
        event_type: 'basecamp_request_failed',
        outcome: 'failure',
        external_system: 'basecamp',
        error_class: timeoutErr.error_class,
        metadata: { method, url, message: timeoutErr.message },
      });
      throw timeoutErr;
    }
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

async function failNonOk(method: string, url: string, r: Response): Promise<never> {
  const body = await r.text().catch(() => '');
  emitFailureEvent({
    event_type: 'basecamp_request_failed',
    outcome: 'failure',
    external_system: 'basecamp',
    error_class: classifyError({ status: r.status }),
    metadata: { method, url, message: body.slice(0, 200) },
  });
  throw new Error(`BC ${method} ${url} -> ${r.status} ${body.slice(0, 200)}`);
}

/** GET returning the raw Response (bcGetAll needs the Link header). */
async function bcGetResponse(urlOrPath: string): Promise<Response> {
  const u = toUrl(urlOrPath);
  const r = await bcSend('GET', u, (signal) => fetch(u, { headers: bcHeaders(getBcToken()), signal }));
  if (!r.ok) await failNonOk('GET', u, r);
  return r;
}

export async function bcGet<T>(urlOrPath: string): Promise<T> {
  const r = await bcGetResponse(urlOrPath);
  return (await r.json()) as T;
}

/**
 * GET every page of a Basecamp collection by following `Link: rel="next"`.
 * Stops at `maxPages` and logs `basecamp_pagination_capped` when it does, so
 * a truncated read is visible in the log rather than silently short.
 */
export async function bcGetAll<T>(urlOrPath: string, opts: { maxPages?: number } = {}): Promise<T[]> {
  const maxPages = opts.maxPages ?? BC_DEFAULT_MAX_PAGES;
  const items: T[] = [];
  let next: string | null = toUrl(urlOrPath);
  let pages = 0;
  while (next) {
    if (pages >= maxPages) {
      console.warn(JSON.stringify({
        level: 'warn', service: 'basecampClient', event: 'basecamp_pagination_capped',
        outcome: 'partial', context: { url: toUrl(urlOrPath), pages, max_pages: maxPages, items: items.length },
      }));
      break;
    }
    const r: Response = await bcGetResponse(next);
    const page = (await r.json()) as T[];
    if (Array.isArray(page)) items.push(...page);
    pages++;
    next = parseNextLink(r.headers.get('Link'));
  }
  return items;
}

export async function bcPost<T>(urlOrPath: string, body: unknown): Promise<T> {
  const u = toUrl(urlOrPath);
  const r = await bcSend('POST', u, (signal) =>
    fetch(u, {
      method: 'POST',
      headers: bcHeaders(getBcToken(), { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal,
    }),
  );
  if (!r.ok) await failNonOk('POST', u, r);
  return (await r.json()) as T;
}

// PUT — updates to an existing recording (e.g. todo due-date/assignee
// changes, marking a todo complete via the completion sub-resource). Added
// for the Inbox Intel Case Resolution Engine's action executor; shares the
// same auth/retry/backoff/timeout as bcGet/bcPost rather than a second client.
export async function bcPut<T>(urlOrPath: string, body?: unknown): Promise<T | null> {
  const u = toUrl(urlOrPath);
  const r = await bcSend('PUT', u, (signal) =>
    fetch(u, {
      method: 'PUT',
      headers: bcHeaders(getBcToken(), { 'Content-Type': 'application/json' }),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    }),
  );
  if (!r.ok) await failNonOk('PUT', u, r);
  // Basecamp returns 204 No Content for several PUT endpoints (e.g. todo completion).
  if (r.status === 204) return null;
  return (await r.json()) as T;
}

export const BC_BASE_URL = BC_API;
