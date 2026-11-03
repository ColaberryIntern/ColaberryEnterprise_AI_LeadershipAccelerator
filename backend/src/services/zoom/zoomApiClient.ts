/**
 * Zoom Server-to-Server OAuth + the thin API request helper.
 *
 * ## Why this module exists
 *
 * Extracted verbatim from `zoomService.ts` on 2026-11-03. That file had reached 640 lines,
 * past CLAUDE.md's 500-line hard ceiling, and the rule there is explicit: the next change to a
 * file over the ceiling MUST split it before adding new code. Transcript support needed the
 * authenticated request helper, so the helper came out rather than the file growing again.
 *
 * Nothing about the behaviour changed. `zoomService.ts` re-exports what it used to own, so every
 * existing caller and test keeps working; the token cache stays module-level here, which means it
 * is still shared by every caller in the process (that was true before and is the point — a
 * per-caller cache would mint a token per service).
 *
 * `zoomService.ts` is still over the ceiling after this extraction. The next opportunity is the
 * recording-selection block (`pickBestMp4`, `recordingOverlapsWindow`, `findRecording*`), which is
 * a bigger and riskier move because it is the live class-recording ingestion path. Named here so
 * the next person does not have to rediscover it.
 */
import { env } from '../../config/env';

const TOKEN_URL = 'https://zoom.us/oauth/token';
export const ZOOM_API_BASE = 'https://api.zoom.us/v2';
/** Small/fast calls only — file streaming is deliberately unbounded, as in driveService. */
export const ZOOM_API_TIMEOUT_MS = 15_000;

/** Throws unless every Zoom credential is present. */
export function assertZoomConfigured(): void {
  if (!env.zoomAccountId || !env.zoomClientId || !env.zoomClientSecret || !env.zoomHostEmail) {
    throw new Error('Zoom not configured');
  }
}

export async function zoomFetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = ZOOM_API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---- Server-to-Server OAuth ----
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getZoomAccessToken(): Promise<string> {
  assertZoomConfigured();
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token;

  const basicAuth = Buffer.from(`${env.zoomClientId}:${env.zoomClientSecret}`).toString('base64');
  const res = await zoomFetchWithTimeout(
    `${TOKEN_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(env.zoomAccountId)}`,
    { method: 'POST', headers: { Authorization: `Basic ${basicAuth}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zoom OAuth token error ${res.status}: ${body}`);
  }
  const data: any = await res.json();
  cachedToken = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return cachedToken.token;
}

/** Test-only: drop the cached token so a test cannot inherit one from a previous case. */
export function __resetZoomTokenCacheForTests(): void {
  cachedToken = null;
}

export async function zoomApiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getZoomAccessToken();
  const res = await zoomFetchWithTimeout(`${ZOOM_API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[Zoom] API error ${res.status} ${method} ${path}: ${errBody}`);
    throw new Error(`Zoom API error ${res.status}: ${errBody}`);
  }
  // PATCH/DELETE meeting calls return 204 with no body — res.json() would throw.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
