/**
 * videoEmbed — pure provider parser for in-app video playback. Turns a raw
 * YouTube / Vimeo / Loom / Wistia / direct-file URL into an embeddable source
 * the <VideoEmbed> component can render without any third-party player library.
 * Unknown URLs degrade to an external "watch on source" link.
 *
 * Pure + side-effect free so it is trivially unit-testable.
 */

export type VideoProvider = 'youtube' | 'vimeo' | 'loom' | 'wistia' | 'file' | 'unknown';
export type VideoKind = 'iframe' | 'file' | 'link';

export interface VideoSource {
  provider: VideoProvider;
  kind: VideoKind;
  id: string;          // provider id, or the raw url for file/unknown
  embedUrl: string;    // iframe src, file src, or the original link
  originalUrl: string;
}

/** Append a query param to a URL that may or may not already have a query string. */
function withParam(url: string, param: string): string {
  return url + (url.includes('?') ? '&' : '?') + param;
}

/** PURE — parse a raw video URL into an embeddable source, or null if empty. */
export function parseVideoUrl(raw: string | null | undefined): VideoSource | null {
  const url = String(raw || '').trim();
  if (!url) return null;

  const yt = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return src('youtube', 'iframe', yt[1], `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&modestbranding=1`, url);

  const vim = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vim) return src('vimeo', 'iframe', vim[1], `https://player.vimeo.com/video/${vim[1]}`, url);

  const loom = url.match(/loom\.com\/(?:share|embed)\/([\w-]+)/);
  if (loom) return src('loom', 'iframe', loom[1], `https://www.loom.com/embed/${loom[1]}`, url);

  const wistia = url.match(/(?:wistia\.com|wi\.st)\/(?:medias|embed(?:\/iframe)?)\/([\w-]+)/);
  if (wistia) return src('wistia', 'iframe', wistia[1], `https://fast.wistia.net/embed/iframe/${wistia[1]}`, url);

  if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url)) return src('file', 'file', url, url, url);

  return src('unknown', 'link', url, url, url);
}

function src(provider: VideoProvider, kind: VideoKind, id: string, embedUrl: string, originalUrl: string): VideoSource {
  return { provider, kind, id, embedUrl, originalUrl };
}

/** Human label for a provider (for the fallback "watch on X" link). */
export function providerLabel(p: VideoProvider): string {
  return { youtube: 'YouTube', vimeo: 'Vimeo', loom: 'Loom', wistia: 'Wistia', file: 'source', unknown: 'source' }[p];
}

/** PURE — a derivable still image for a video source, or null. YouTube exposes
 *  deterministic thumbnail URLs per video id; other providers need an API call,
 *  so cards there rely on an explicitly saved poster instead. */
export function videoThumbnail(source: VideoSource | null): string | null {
  if (!source) return null;
  if (source.provider === 'youtube') return `https://img.youtube.com/vi/${source.id}/hqdefault.jpg`;
  return null;
}

/** Add autoplay to an iframe embed url in the provider's own dialect. */
export function withAutoplay(source: VideoSource): string {
  if (source.kind !== 'iframe') return source.embedUrl;
  if (source.provider === 'youtube') return withParam(source.embedUrl, 'autoplay=1');
  if (source.provider === 'vimeo') return withParam(source.embedUrl, 'autoplay=1');
  if (source.provider === 'loom') return withParam(source.embedUrl, 'autoplay=1');
  return source.embedUrl;
}
