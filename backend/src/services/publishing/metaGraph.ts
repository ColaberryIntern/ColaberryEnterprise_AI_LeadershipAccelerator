import { ProviderPublishError } from './socialProviderAdapter';

/**
 * metaGraph - the one way this adapter talks to Meta, and the one place that decides whether a
 * failure is worth retrying.
 *
 * WHY THE CLASSIFICATION MATTERS MORE THAN THE TRANSPORT. The worker retries on a failure it is
 * told is temporary and dead-letters one it is told is permanent. Get it backwards and either a
 * mistyped permission is retried for hours against a wall, or a passing rate-limit blip buries a
 * post that would have gone out on the next attempt. Meta states the reason in `error.code`, so
 * that is what decides, with the HTTP status as the fallback.
 *
 * VERSION. Meta retires Graph versions on a rolling ~2-year window; a retired one fails with a
 * clear message rather than silently changing behaviour. `META_GRAPH_VERSION` overrides the
 * default for the day a bump is needed without a deploy.
 */

export const META_GRAPH_VERSION_DEFAULT = 'v25.0';

export interface MetaHttpResponse { status: number; body: unknown }
export type MetaHttp = (input: {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<MetaHttpResponse>;

export function graphVersion(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.META_GRAPH_VERSION?.trim();
  return v && /^v\d+\.\d+$/.test(v) ? v : META_GRAPH_VERSION_DEFAULT;
}

export function graphUrl(path: string, env?: NodeJS.ProcessEnv): string {
  return `https://graph.facebook.com/${graphVersion(env)}${path}`;
}

/** Video uploads go to a different host; the rest of the API does not accept them. */
export function graphVideoUrl(path: string, env?: NodeJS.ProcessEnv): string {
  return `https://graph-video.facebook.com/${graphVersion(env)}${path}`;
}

/**
 * Meta error codes that mean "this will fail again the same way". Everything else is treated as
 * temporary, because retrying a temporary failure costs a minute and refusing a permanent one
 * costs the post.
 *
 *   100 invalid parameter        190 access token invalid/expired
 *   200 / 10 permission denied   368 temporarily blocked for policy violations
 *   324 missing or invalid image 9004 media URL unreachable (Instagram)
 *   2207xx Instagram publishing errors (unsupported format, aspect ratio, caption)
 */
const PERMANENT_CODES = new Set([100, 10, 190, 200, 324, 368, 9004]);

export function isPermanentMetaError(code: number | null, httpStatus: number): boolean {
  if (code !== null) {
    if (PERMANENT_CODES.has(code)) return true;
    // Instagram's publishing errors are 2207xx; all of them describe the media or the caption.
    if (code >= 220_000 && code < 221_000) return true;
    // 4, 17, 32, 613: application/page/user rate limits. Temporary by definition.
    if ([4, 17, 32, 613].includes(code)) return false;
    // 1 and 2 are Meta's own "unknown / temporary" pair.
    if (code === 1 || code === 2) return false;
  }
  if (httpStatus === 429) return false;
  if (httpStatus >= 500) return false;
  // A 4xx with no code we recognise: permanent. Retrying a request Meta calls malformed only
  // repeats it.
  return httpStatus >= 400 && httpStatus < 500;
}

export interface MetaError {
  message: string;
  code: number | null;
  subcode: number | null;
  type: string | null;
  traceId: string | null;
}

/** Meta's error envelope, or null when the body carries none. */
export function metaErrorOf(body: unknown): MetaError | null {
  const e = (body as { error?: Record<string, unknown> } | null)?.error;
  if (!e || typeof e !== 'object') return null;
  return {
    message: typeof e.message === 'string' ? e.message : 'Meta refused the request.',
    code: typeof e.code === 'number' ? e.code : null,
    subcode: typeof e.error_subcode === 'number' ? e.error_subcode : null,
    type: typeof e.type === 'string' ? e.type : null,
    // fbtrace_id is what Meta support asks for first; it belongs in the dead-letter row.
    traceId: typeof e.fbtrace_id === 'string' ? e.fbtrace_id : null,
  };
}

/**
 * Call the Graph API and turn any failure into a classified `ProviderPublishError`.
 *
 * Meta also answers 200 with an error body in places, so the body is checked either way. The
 * access token goes in the POST body or the query of a GET; either way this never logs the URL.
 */
export async function callGraph(
  http: MetaHttp,
  input: { method: 'GET' | 'POST'; url: string; form?: Record<string, string>; what: string },
): Promise<Record<string, any>> {
  const res = await http({
    method: input.method,
    url: input.url,
    headers: input.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
    body: input.form ? new URLSearchParams(input.form).toString() : undefined,
  });

  const err = metaErrorOf(res.body);
  if (res.status >= 400 || err) {
    const detail = err?.message ?? `HTTP ${res.status}`;
    const permanent = isPermanentMetaError(err?.code ?? null, res.status);
    throw new ProviderPublishError(
      `Meta refused ${input.what}: ${detail}${err?.traceId ? ` (trace ${err.traceId})` : ''}`,
      permanent,
      err?.code !== null && err?.code !== undefined ? String(err.code) : null,
      res.status,
    );
  }
  return (res.body ?? {}) as Record<string, any>;
}
