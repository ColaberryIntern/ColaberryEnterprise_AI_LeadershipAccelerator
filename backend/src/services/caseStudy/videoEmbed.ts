/**
 * videoEmbed — turn a YouTube or Vimeo link an operator pasted into an embed URL.
 *
 * THIS OUTPUT BECOMES AN `<iframe src>` ON THREE PUBLIC BRANDS, so the rule is an allowlist
 * of hosts and an id shape, never "rewrite whatever was pasted". A parser that accepted any
 * URL and trusted a path fragment would let a case-study record frame an arbitrary origin on
 * enterprise.colaberry.ai, training.colaberry.com and AI Flotation. Hosts are compared after
 * stripping a leading `www.`, against a fixed set; ids are matched against a character class,
 * not merely extracted.
 *
 * NOTHING HERE TOUCHES THE CSP. Both surfaces already permit these origins in `frame-src`:
 *   enterprise `nginx/security-headers.conf` allows youtube, youtube-nocookie and
 *   player.vimeo.com; the training site's `next.config.ts` allows the same three. Choosing
 *   any other provider would have meant a CSP change in two repositories, which is why the
 *   allowlist stops here rather than growing on request.
 *
 * YOUTUBE EMBEDS THROUGH `youtube-nocookie.com`. It is the same player and the same
 * allowlist entry, and it does not write advertising cookies until playback — these pages
 * carry no consent banner, and a case study is a portfolio piece rather than a tracking
 * surface.
 */

export type VideoProvider = 'youtube' | 'vimeo';

export interface VideoEmbed {
  readonly provider: VideoProvider;
  /** The id as the provider knows it. Kept so a caller can rebuild any URL it needs. */
  readonly videoId: string;
  /** What goes in `<iframe src>`. */
  readonly embedUrl: string;
  /** Where a human should be sent to watch it on the provider's own site. */
  readonly watchUrl: string;
}

/** YouTube ids are 11 chars of an unreserved alphabet. Vimeo ids are digits. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;

const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtube-nocookie.com', 'm.youtube.com']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'player.vimeo.com']);

/** `www.` is cosmetic; every other subdomain is a different host and is refused. */
const bareHost = (h: string): string => h.toLowerCase().replace(/^www\./, '');

function youtubeIdFrom(u: URL): string | null {
  const host = bareHost(u.hostname);
  if (host === 'youtu.be') {
    return u.pathname.slice(1).split('/')[0] || null;
  }
  if (!YOUTUBE_HOSTS.has(host)) return null;

  // /watch?v=<id> — the form a human copies from the address bar.
  const v = u.searchParams.get('v');
  if (v) return v;

  // /embed/<id>, /shorts/<id>, /live/<id> — the forms a share button produces.
  const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname);
  return m ? m[1] : null;
}

function vimeoIdFrom(u: URL): string | null {
  const host = bareHost(u.hostname);
  if (!VIMEO_HOSTS.has(host)) return null;
  // vimeo.com/123456789, vimeo.com/channels/x/123456789, player.vimeo.com/video/123456789.
  // The LAST all-digit segment is the video, which is what makes the channel forms work.
  const segments = u.pathname.split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (/^\d+$/.test(segments[i])) return segments[i];
  }
  return null;
}

/**
 * Parse a pasted link. Returns null for anything not confidently a YouTube or Vimeo video —
 * a null here surfaces to the operator as "that is not a YouTube or Vimeo link", which is a
 * better outcome than embedding something unexpected.
 */
export function parseVideoEmbed(input: string | null | undefined): VideoEmbed | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  let u: URL;
  try {
    // A bare `youtube.com/watch?v=x` has no scheme and would otherwise throw. Anything that
    // already carries a scheme keeps it, so `javascript:` is parsed and then refused below
    // rather than being silently prefixed into an https URL.
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;

  const yt = youtubeIdFrom(u);
  if (yt && YOUTUBE_ID.test(yt)) {
    return {
      provider: 'youtube',
      videoId: yt,
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}`,
      watchUrl: `https://www.youtube.com/watch?v=${yt}`,
    };
  }

  const vm = vimeoIdFrom(u);
  if (vm && VIMEO_ID.test(vm)) {
    return {
      provider: 'vimeo',
      videoId: vm,
      embedUrl: `https://player.vimeo.com/video/${vm}`,
      watchUrl: `https://vimeo.com/${vm}`,
    };
  }

  return null;
}

/** True when this URL is one this platform will frame. Thin, but it reads better at call
 *  sites than `parseVideoEmbed(x) !== null` and keeps the allowlist in one place. */
export const isEmbeddableVideoUrl = (input: string | null | undefined): boolean =>
  parseVideoEmbed(input) !== null;
