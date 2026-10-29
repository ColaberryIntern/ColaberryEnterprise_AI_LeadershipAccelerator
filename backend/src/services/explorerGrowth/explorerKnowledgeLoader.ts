import { env } from '../../config/env';
import {
  parseKnowledgeBase,
  KnowledgeBaseContractError,
  type KnowledgeBase,
} from './explorerKnowledgeSource';

/**
 * Brings the `/knowledge` export into the backend. This is the caller
 * `explorerKnowledgeSource` was written for and never had.
 *
 * ## Why a fetch and not a file read
 *
 * `explorerKnowledgeSource` is deliberately a parser, not a loader: `kb.json` is baked
 * into the NGINX image by the CRA build, `backend/Dockerfile` copies only
 * `frontend/src/pages/`, so the file is NOT in the backend image and cannot be read from
 * disk at runtime. That module left "how the bytes arrive" to its caller, and because the
 * caller was never written, 217 curated entries and a fully tested quote gate have sat
 * unused. The hub is public and already served by our own NGINX, so the bytes arrive over
 * HTTP from the same origin the learner reads - no Dockerfile change, no second copy of
 * the corpus, and the hub stays the single source of truth.
 *
 * ## Why this does not cache the corpus in Postgres
 *
 * Copying 217 entries into a table would create a second source of truth that goes stale
 * silently - exactly the failure `explorerKnowledgeSource` guards against by REFUSING an
 * older schema rather than defaulting a missing field. Traceability does not require
 * storing the corpus: it requires storing the CITATION, which the draft already has room
 * for in `scheduled_emails.metadata`. So the corpus is fetched, held for a TTL, and cited.
 *
 * ## The SPA-fallback trap, named explicitly
 *
 * The hub is static files behind a single-page-app fallback, which answers an unknown path
 * with `index.html` and status **200**. A loader that trusted the status code would hand
 * HTML to `JSON.parse` and report "invalid JSON", or worse, parse something JSON-shaped
 * and treat it as a knowledge base. Two defences: an HTML body is detected and reported as
 * its own failure reason naming the trap, and the parser itself refuses any document that
 * is not `colaberry.kb/v1` at version >= 1.1. A 200 is not evidence the file exists here.
 *
 * ## Fail-closed, and never into the render path
 *
 * Every failure is returned as data, not thrown. A draft render that cannot load the
 * knowledge base must still produce copy - ungrounded copy that cites nothing, which the
 * existing fact guard then judges on its own terms - rather than crashing the batch. Only
 * success is cached: caching a failure would let one transient outage silence the knowledge
 * base for the whole TTL.
 */

/** Path of the export under the public app origin. */
export const KNOWLEDGE_PATH = '/knowledge/kb.json';

/**
 * Explicit timeout, per the rule that no outbound call may hang unbounded.
 * 10s is generous for a 182 KB static file from our own NGINX; the nightly batch can
 * afford it once, and a hung fetch would hold the whole render.
 */
export const KNOWLEDGE_FETCH_TIMEOUT_MS = 10_000;

/**
 * How long a successful load is reused.
 *
 * One hour: the corpus changes when marketing copy is rebuilt and redeployed, which is
 * not a per-minute event, and the draft render is a once-nightly batch. The point of the
 * cache is that one batch of 142 decisions performs one fetch, not 142.
 */
export const KNOWLEDGE_CACHE_TTL_MS = 60 * 60 * 1000;

/** Why a load did not produce a knowledge base. Distinct causes, because the fixes differ. */
export type KnowledgeLoadFailure =
  /** The request exceeded {@link KNOWLEDGE_FETCH_TIMEOUT_MS}. */
  | 'timeout'
  /** A non-2xx status. */
  | 'http_error'
  /** 200, but the body is HTML - almost certainly the SPA fallback. */
  | 'spa_fallback_html'
  /** 200, body is neither HTML nor parseable JSON. */
  | 'not_json'
  /** Valid JSON that is not a knowledge base this code may read. */
  | 'contract_violation'
  /** DNS, TLS, connection reset - the request never completed. */
  | 'network_error';

export type KnowledgeLoadResult =
  | { readonly loaded: true; readonly base: KnowledgeBase; readonly fromCache: boolean }
  | {
      readonly loaded: false;
      readonly reason: KnowledgeLoadFailure;
      readonly detail: string;
      /** Stable classification, because a bare `Error` is not acceptable in a logged path. */
      readonly errorClass: string;
    };

/** The shape of a completed HTTP response this module needs. Injected so tests need no network. */
export interface KnowledgeHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly text: string;
}

export type KnowledgeFetcher = (
  url: string,
  timeoutMs: number,
) => Promise<KnowledgeHttpResponse>;

/** Maps a thrown fetch error onto the two network-ish failure reasons. */
function classifyFetchError(err: unknown): { reason: KnowledgeLoadFailure; detail: string } {
  const name = (err as { name?: string } | null)?.name ?? '';
  const message = (err as { message?: string } | null)?.message ?? String(err);
  // An AbortController firing on the timeout surfaces as AbortError.
  if (name === 'AbortError' || name === 'TimeoutError') {
    return { reason: 'timeout', detail: `no response within ${KNOWLEDGE_FETCH_TIMEOUT_MS}ms` };
  }
  return { reason: 'network_error', detail: message };
}

/** The real fetcher: global fetch with an explicit, always-cleared timeout. */
const defaultFetcher: KnowledgeFetcher = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    // Cleared in `finally` so a fast response does not leave the process holding a timer.
    clearTimeout(timer);
  }
};

/** Cached success only. `null` means "nothing valid held". */
let cached: { base: KnowledgeBase; at: number } | null = null;

export interface LoadKnowledgeOptions {
  readonly fetcher?: KnowledgeFetcher;
  /** Injected clock, so TTL expiry is testable without waiting an hour. */
  readonly nowMs?: number;
  /** Overrides the derived URL. Used by tests; production derives it from config. */
  readonly url?: string;
  /** Skip the cache for this call. The admin re-run uses this; the nightly batch does not. */
  readonly bypassCache?: boolean;
}

/** The URL the corpus is fetched from, derived from the public app origin. */
export function knowledgeUrl(): string {
  return `${env.publicAppUrl.replace(/\/+$/, '')}${KNOWLEDGE_PATH}`;
}

/**
 * Load and parse the knowledge base, reusing a recent success.
 *
 * Never rejects: every failure is a `loaded: false` result carrying a reason and a stable
 * `errorClass`.
 */
export async function loadExplorerKnowledge(
  opts: LoadKnowledgeOptions = {},
): Promise<KnowledgeLoadResult> {
  const now = opts.nowMs ?? Date.now();
  const fetcher = opts.fetcher ?? defaultFetcher;
  const url = opts.url ?? knowledgeUrl();

  if (!opts.bypassCache && cached && now - cached.at < KNOWLEDGE_CACHE_TTL_MS) {
    return { loaded: true, base: cached.base, fromCache: true };
  }

  let res: KnowledgeHttpResponse;
  try {
    res = await fetcher(url, KNOWLEDGE_FETCH_TIMEOUT_MS);
  } catch (err) {
    const { reason, detail } = classifyFetchError(err);
    return {
      loaded: false,
      reason,
      detail,
      errorClass: reason === 'timeout' ? 'TimeoutError' : 'UpstreamUnavailable',
    };
  }

  if (!res.ok) {
    return {
      loaded: false,
      reason: 'http_error',
      detail: `status ${res.status}`,
      errorClass: 'UpstreamUnavailable',
    };
  }

  // The SPA fallback answers an unknown path with index.html and a 200. Catch it by shape
  // and name it, rather than letting it arrive as a confusing JSON parse error.
  const head = res.text.trimStart().slice(0, 1);
  if (head === '<') {
    return {
      loaded: false,
      reason: 'spa_fallback_html',
      detail: `${url} returned HTML with status ${res.status}; the single-page-app fallback answers unknown paths this way, so the export is probably not deployed at that path`,
      errorClass: 'ContractViolation',
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(res.text);
  } catch (err: any) {
    return {
      loaded: false,
      reason: 'not_json',
      detail: err?.message ?? 'unparseable body',
      errorClass: 'ContractViolation',
    };
  }

  let base: KnowledgeBase;
  try {
    base = parseKnowledgeBase(raw);
  } catch (err) {
    const detail = err instanceof KnowledgeBaseContractError
      ? err.message
      : (err as { message?: string } | null)?.message ?? 'unreadable knowledge base';
    return { loaded: false, reason: 'contract_violation', detail, errorClass: 'ContractViolation' };
  }

  cached = { base, at: now };
  return { loaded: true, base, fromCache: false };
}

/** Test seam: forget the cached corpus. */
export function __resetExplorerKnowledgeCacheForTests(): void {
  cached = null;
}
