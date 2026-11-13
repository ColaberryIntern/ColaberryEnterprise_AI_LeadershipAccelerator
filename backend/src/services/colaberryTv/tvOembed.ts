import { classifyError } from '../../utils/errorClassifier';

/**
 * A short's title from YouTube's public oEmbed endpoint (no key). One attempt, 5 s timeout, no retry: a title is a nicety, so a
 * failure returns null (the playlist shows "Colaberry short" until staff rename it) and is logged with its class. Never throws.
 */
export const OEMBED_TIMEOUT_MS = 5000;

export async function fetchShortTitle(youtubeId: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/shorts/${youtubeId}`)}`;
  const started = Date.now();
  try {
    const r = await fetcher(url, { signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS) });
    if (!r.ok) throw Object.assign(new Error(`oEmbed ${r.status}`), { status: r.status });
    const j = (await r.json()) as { title?: unknown };
    const t = typeof j.title === 'string' ? j.title.trim().slice(0, 120) : '';
    if (!t) throw Object.assign(new Error('oEmbed answered without a title'), { name: 'ContractViolation' });
    return t;
  } catch (err) {
    console.warn(JSON.stringify({ level: 'warn', service: 'colaberry-tv', event: 'colaberry_tv_oembed_failed', outcome: 'failure',
      error_class: classifyError(err), duration_ms: Date.now() - started, context: { youtube_id: youtubeId } }));
    return null;
  }
}
