import type { MetaHttp, MetaHttpResponse } from './metaGraph';

/**
 * The real HTTP transport for the Meta adapter, in its own file so the adapter stays
 * network-free and fully testable.
 *
 * EVERY OUTBOUND CALL HAS AN EXPLICIT TIMEOUT, for the reason linkedInHttp states: the
 * publishing worker claims a job before calling an adapter, so a hung socket holds that claim
 * until the process restarts - a post that never publishes and never dead-letters.
 *
 * The video budget is separate and longer. A Facebook video post hands Meta a URL and Meta
 * fetches the file itself, but the call still does not answer until Meta has taken the video,
 * and a 200 MB fetch is a transfer rather than an API call.
 *
 * A timeout throws, and a thrown non-ProviderPublishError is treated as TRANSIENT by the
 * caller. That is right here and it is why metaPublish looks for an identical recent post
 * before creating one: a timed-out publish may well have landed.
 */

export const META_TIMEOUT_MS = 20_000;
export const META_VIDEO_TIMEOUT_MS = 120_000;

export class MetaTransportError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'MetaTransportError';
  }
}

export function makeMetaHttp(timeoutMs: number = META_TIMEOUT_MS): MetaHttp {
  return async ({ method, url, headers, body }): Promise<MetaHttpResponse> => {
    // graph-video.facebook.com is the video host; it is the one call worth waiting on.
    const budget = url.includes('graph-video.') ? META_VIDEO_TIMEOUT_MS : timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget);
    try {
      const res = await fetch(url, { method, headers, body, signal: controller.signal });
      const raw = await res.text();
      let parsed: unknown = raw;
      if (raw !== '') {
        // Meta answers JSON on success and on error, but a gateway page or an empty 502 is not
        // JSON. Falling back keeps the status, which is what the classifier reads.
        try { parsed = JSON.parse(raw); } catch { parsed = { message: raw.slice(0, 500) }; }
      }
      return { status: res.status, body: parsed };
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new MetaTransportError(`Meta did not respond within ${budget} ms.`, err);
      }
      throw new MetaTransportError('The request to Meta failed before a response arrived.', err);
    } finally {
      clearTimeout(timer);
    }
  };
}
