/**
 * aiVideoStreamSource — the "AI Video Stream" intel source adapter.
 *
 * COLLECT-only adapter over the YouTube Data API v3 `search` endpoint. It self-
 * registers with the generic intel engine at module load (slug `ai_video_stream`),
 * so importing this file wires the pipeline; the engine (intelPipeline) owns
 * ingest / score / materialize / publish. This module owns exactly one thing:
 * turning a YouTube search response into NormalizedIntelItem[].
 *
 * DEGRADE-DARK (the non-negotiable requirement): the YouTube key MAY NOT be
 * present in prod. If YOUTUBE_API_KEY is missing/empty, collect() logs a single
 * skip line and returns [] WITHOUT making a request and WITHOUT throwing — the
 * generator ships dark and simply produces nothing until a key is provided.
 *
 * FAIL-FIRST: collect() NEVER throws. Network failure (via the shared
 * fetchWithTimeout: hard timeout + capped retries), a non-2xx status, or malformed
 * JSON are each caught, logged, and degraded to []. The API key is never logged
 * (it is only ever placed in the request URL, which is never emitted to a log).
 *
 * LANGUAGE GUARD: this is an English-only curriculum feed, and YouTube `search`
 * has no reliable language filter (`relevanceLanguage` only biases ranking, it
 * does not exclude results). Every candidate is checked with languageGuard
 * (../languageGuard) before being returned: a second `videos.list` call reads
 * each candidate's `defaultAudioLanguage`/`defaultLanguage` (authoritative when
 * an uploader set it), backstopped by a deterministic non-Latin-script/
 * language-name text heuristic for the common case where they didn't. The
 * `videos.list` call follows the same DEGRADE / FAIL-FIRST rule as search: if it
 * fails, collect() does not throw or drop everything — it falls back to the text
 * heuristic alone for that run.
 */
import { NormalizedIntelItem, registerIntelSource } from '../intelRegistry';
import { fetchWithTimeout } from '../intelHttp';
import { isLikelyNonEnglishText, isNonEnglishLanguageCode } from '../languageGuard';

export const SLUG = 'ai_video_stream';

const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';
const DEFAULT_QUERY = 'AI systems architecture';

/** Minimal shape of the YouTube Data API v3 `search` response we read. Only the
 *  fields the adapter maps are declared; everything else is intentionally ignored.
 *  All fields are optional because upstream shape is not a contract we control. */
interface YouTubeSearchSnippet {
  title?: string;
  description?: string;
  publishedAt?: string;
}
interface YouTubeSearchItem {
  id?: { kind?: string; videoId?: string };
  snippet?: YouTubeSearchSnippet;
}
interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
}

/** Minimal shape of the `videos.list` response we read: just the two language
 *  fields, keyed back to the video id by the caller. */
interface YouTubeVideoSnippet {
  defaultAudioLanguage?: string;
  defaultLanguage?: string;
}
interface YouTubeVideoItem {
  id?: string;
  snippet?: YouTubeVideoSnippet;
}
interface YouTubeVideosResponse {
  items?: YouTubeVideoItem[];
}

/** Parse an upstream date string to a Date, or null when absent/invalid (never
 *  produces an Invalid Date, which would poison downstream ordering). */
function parseDate(raw: string | undefined): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Look up `defaultAudioLanguage`/`defaultLanguage` for a batch of video ids in one
 * `videos.list` call. FAIL-FIRST like the rest of this adapter: any failure
 * (network, non-2xx, malformed JSON) is caught and degrades to an empty map — the
 * caller then relies on the text heuristic alone, it never throws or drops the run.
 */
async function fetchAudioLanguages(videoIds: string[], key: string): Promise<Map<string, string | undefined>> {
  const langByVideoId = new Map<string, string | undefined>();
  if (!videoIds.length) return langByVideoId;

  const url =
    `${VIDEOS_ENDPOINT}?part=snippet&id=${encodeURIComponent(videoIds.join(','))}` +
    `&key=${encodeURIComponent(key)}`;

  let body: string;
  try {
    body = await fetchWithTimeout(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
    console.warn(`[intel] ${SLUG}: videos.list fetch failed (falling back to text heuristic) — ${msg}`);
    return langByVideoId;
  }

  let payload: YouTubeVideosResponse;
  try {
    payload = JSON.parse(body) as YouTubeVideosResponse;
  } catch {
    console.warn(`[intel] ${SLUG}: videos.list malformed JSON (falling back to text heuristic)`);
    return langByVideoId;
  }

  for (const it of Array.isArray(payload?.items) ? payload.items : []) {
    if (!it?.id) continue;
    const snip = it.snippet || {};
    langByVideoId.set(it.id, snip.defaultAudioLanguage || snip.defaultLanguage || undefined);
  }
  return langByVideoId;
}

/** The active query: AI_VIDEO_STREAM_QUERY override, else the AI-architecture default. */
function resolveQuery(): string {
  return (process.env.AI_VIDEO_STREAM_QUERY || '').trim() || DEFAULT_QUERY;
}

/**
 * Fetch recent AI videos and normalize them. Degrades to [] (never throws) when
 * the key is absent, the request fails, or the payload is malformed.
 */
export async function collect(): Promise<NormalizedIntelItem[]> {
  const key = (process.env.YOUTUBE_API_KEY || '').trim();
  if (!key) {
    console.warn(`[intel] ${SLUG}: YOUTUBE_API_KEY not set — skipping`);
    return [];
  }

  const query = resolveQuery();
  // Key/query are URL-encoded into the request. The URL (which carries the key) is
  // NEVER logged; only err.message is surfaced on failure.
  const url =
    `${SEARCH_ENDPOINT}?part=snippet&type=video&order=date&maxResults=25&relevanceLanguage=en` +
    `&q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;

  let body: string;
  try {
    body = await fetchWithTimeout(url);
  } catch (err) {
    // err is unknown (fetch/abort/HTTP-status Error); we only read its message.
    const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
    console.warn(`[intel] ${SLUG}: fetch failed — ${msg}`);
    return [];
  }

  let payload: YouTubeSearchResponse;
  try {
    payload = JSON.parse(body) as YouTubeSearchResponse;
  } catch {
    console.warn(`[intel] ${SLUG}: malformed JSON response — skipping`);
    return [];
  }

  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  const candidates: Array<{ videoId: string; title: string; description: string; publishedAt: string | undefined }> = [];
  for (const it of rawItems) {
    const videoId = it?.id?.videoId;
    if (!videoId || typeof videoId !== 'string') continue; // not a video result — skip
    const snip: YouTubeSearchSnippet = it.snippet || {};
    candidates.push({
      videoId,
      title: typeof snip.title === 'string' && snip.title.trim() ? snip.title.trim() : '(untitled video)',
      description: typeof snip.description === 'string' ? snip.description.trim() : '',
      publishedAt: snip.publishedAt,
    });
  }
  if (!candidates.length) return [];

  const langByVideoId = await fetchAudioLanguages(candidates.map((c) => c.videoId), key);

  const items: NormalizedIntelItem[] = [];
  for (const c of candidates) {
    const audioLang = langByVideoId.get(c.videoId);
    if (isNonEnglishLanguageCode(audioLang) || isLikelyNonEnglishText(c.title, c.description)) {
      console.log(`[intel] ${SLUG}: skipping non-English candidate "${c.title}" (lang=${audioLang ?? 'unknown'})`);
      continue;
    }
    items.push({
      guid: `yt:${c.videoId}`,
      source: 'YouTube',
      title: c.title,
      url: `https://www.youtube.com/watch?v=${c.videoId}`,
      excerpt: c.description ? c.description : null,
      publishedAt: parseDate(c.publishedAt),
    });
  }
  return items;
}

// Self-register at module load. Last-write-wins in the registry, so a re-import
// during hot-reload is idempotent rather than throwing.
registerIntelSource({
  slug: SLUG,
  label: 'AI Video Stream',
  enableEnv: 'AI_VIDEO_STREAM_INGEST_ENABLED',
  maxPerRunEnv: 'AI_VIDEO_STREAM_MAX_PER_RUN',
  collect,
});
