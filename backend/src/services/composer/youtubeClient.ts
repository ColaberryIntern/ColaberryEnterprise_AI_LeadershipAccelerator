/**
 * youtubeClient — the ONLY I/O boundary to the YouTube Data API v3. Given a
 * search query it returns real, verified short-video candidates: embeddable,
 * live, English, with a parsed duration. Failure-first: explicit timeout, capped
 * retries with backoff, quota/no-key degradation (returns [] + a reason, never
 * throws into the composer). The API key is read from env and NEVER logged.
 *
 * Kept deliberately thin + injectable so videoCurationService stays pure and
 * testable without network access.
 */

export interface VideoCandidate {
  video_id: string;
  title: string;
  channel: string;
  url: string;
  duration_seconds: number;
  duration_label: string;   // "6:42"
  thumbnail_url: string | null;
  view_count: number;
}

export interface SearchOptions {
  minSeconds?: number;      // default 180 (3 min)
  maxSeconds?: number;      // default 600 (10 min)
  maxResults?: number;      // candidates to request from search (default 10)
  timeoutMs?: number;       // default 10000
  maxAttempts?: number;     // default 3
}

const API = 'https://www.googleapis.com/youtube/v3';

// Force IPv4 egress for these calls only. The YouTube API key is IP-restricted to
// the host's IPv4, but the host egresses IPv6 by default — which the key rejects.
// Scoped here via an undici dispatcher; no global runtime change. Falls back to the
// default dispatcher (IPv6) if undici can't be resolved.
let ipv4Dispatcher: any;
try {
  const { Agent } = require('undici');
  ipv4Dispatcher = new Agent({ connect: { family: 4 } });
} catch { /* default dispatcher — key IP restriction must then allow IPv6 */ }

/** PURE — parse an ISO-8601 duration (e.g. "PT6M42S") to whole seconds. */
export function iso8601ToSeconds(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || '').trim());
  if (!m) return 0;
  const [, h, min, s] = m;
  return (Number(h || 0) * 3600) + (Number(min || 0) * 60) + Number(s || 0);
}

/** PURE — seconds → "M:SS" (or "H:MM:SS"). */
export function secondsToLabel(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}

async function fetchJson(url: string, timeoutMs: number, maxAttempts: number): Promise<any> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, dispatcher: ipv4Dispatcher } as any);
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) { lastErr = new Error(`YouTube API ${res.status}`); }
      else if (!res.ok) {
        // 4xx (bad key, quota exceeded via 403) — not retryable; surface a clean reason.
        const body = await res.json().catch(() => ({}));
        const reason = body?.error?.errors?.[0]?.reason || body?.error?.message || `HTTP ${res.status}`;
        throw Object.assign(new Error(`YouTube API rejected: ${reason}`), { status: res.status, retryable: false });
      } else {
        return await res.json();
      }
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.retryable === false) throw e;
      lastErr = e;
    }
    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 300 * attempt)); // linear backoff
  }
  throw lastErr || new Error('YouTube API unreachable');
}

/**
 * Search YouTube for embeddable videos matching a query and return only those
 * inside [minSeconds, maxSeconds]. Returns [] (never throws) when the key is
 * missing or the API is unreachable — the caller degrades gracefully.
 */
export async function searchShortVideos(query: string, opts: SearchOptions = {}): Promise<VideoCandidate[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return []; // no key → caller notes "not configured"; never logs the (absent) key
  const minSeconds = opts.minSeconds ?? 180;
  const maxSeconds = opts.maxSeconds ?? 600;
  const maxResults = opts.maxResults ?? 10;
  const timeoutMs = opts.timeoutMs ?? 10000;
  const maxAttempts = opts.maxAttempts ?? 3;

  const searchUrl = `${API}/search?part=snippet&type=video&videoEmbeddable=true`
    + `&safeSearch=strict&relevanceLanguage=en&maxResults=${maxResults}`
    + `&q=${encodeURIComponent(query)}&key=${key}`;
  const search = await fetchJson(searchUrl, timeoutMs, maxAttempts);
  const ids: string[] = (search.items || []).map((i: any) => i?.id?.videoId).filter(Boolean);
  if (!ids.length) return [];

  const detailUrl = `${API}/videos?part=contentDetails,statistics,snippet,status&id=${ids.join(',')}&key=${key}`;
  const details = await fetchJson(detailUrl, timeoutMs, maxAttempts);

  const out: VideoCandidate[] = [];
  for (const v of details.items || []) {
    if (v?.status?.embeddable === false) continue;
    const seconds = iso8601ToSeconds(v?.contentDetails?.duration || '');
    if (seconds < minSeconds || seconds > maxSeconds) continue;
    out.push({
      video_id: v.id,
      title: v?.snippet?.title || '(untitled)',
      channel: v?.snippet?.channelTitle || '',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      duration_seconds: seconds,
      duration_label: secondsToLabel(seconds),
      thumbnail_url: v?.snippet?.thumbnails?.medium?.url || v?.snippet?.thumbnails?.default?.url || null,
      view_count: Number(v?.statistics?.viewCount || 0),
    });
  }
  return out;
}

/**
 * Look up ONE video's real duration by id — no min/max filtering, no ranking, just
 * ground truth. Used at card-authoring time and by the duration backfill script, so
 * an already-known video (unlike `searchShortVideos`) never gets rejected for being
 * outside a "short video" range. Never throws: returns null when the key is missing,
 * the video doesn't exist / isn't embeddable, or the API is unreachable after retries
 * — callers degrade to their own fallback (mirrors `searchShortVideos`'s contract).
 */
export async function getVideoDurationSeconds(videoId: string, opts: Pick<SearchOptions, 'timeoutMs' | 'maxAttempts'> = {}): Promise<number | null> {
  const key = process.env.YOUTUBE_API_KEY;
  const id = String(videoId || '').trim();
  if (!key || !id) return null;
  const timeoutMs = opts.timeoutMs ?? 10000;
  const maxAttempts = opts.maxAttempts ?? 3;
  try {
    const detailUrl = `${API}/videos?part=contentDetails,status&id=${encodeURIComponent(id)}&key=${key}`;
    const details = await fetchJson(detailUrl, timeoutMs, maxAttempts);
    const v = (details.items || [])[0];
    if (!v || v?.status?.embeddable === false) return null;
    const seconds = iso8601ToSeconds(v?.contentDetails?.duration || '');
    return seconds > 0 ? seconds : null;
  } catch {
    return null; // quota exceeded, video deleted/private, network failure — caller falls back
  }
}
