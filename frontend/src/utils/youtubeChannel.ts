/**
 * youtubeChannel - the raw postMessage channel of a YouTube embed opened with `enablejsapi=1`. PURE, no script tag.
 *
 * WHY NOT THE IFRAME API SCRIPT: the portal's Content-Security-Policy (nginx/security-headers.conf) allows YouTube in frame-src
 * only, not in script-src, so https://www.youtube.com/iframe_api cannot load in production. The embed itself speaks the same
 * protocol the script wraps: post `{"event":"listening"}` and it answers with `infoDelivery` / `onStateChange` messages; post
 * `{"event":"command","func":"playVideo"}` and it plays. <VideoEmbed> (watch progress) and Colaberry TV (play order) share this.
 */
export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

export interface YtInfo {
  /** Player state (YT_STATE), when the message carried one. */
  state?: number;
  currentTime?: number;
  duration?: number;
  muted?: boolean;
  /** The player said it is ready (onReady). */
  ready?: boolean;
}

/** The handshake that makes the embed start reporting to this window. */
export function ytHandshake(): string {
  return JSON.stringify({ event: 'listening', id: 1, channel: 'widget' });
}

/** A player command, e.g. ytCommand('playVideo'), ytCommand('mute'), ytCommand('unMute'). */
export function ytCommand(func: 'playVideo' | 'pauseVideo' | 'stopVideo' | 'mute' | 'unMute', args: unknown[] = []): string {
  return JSON.stringify({ event: 'command', func, args });
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Read one message from a YouTube embed, or null for anything else (another origin, junk, another event). */
export function readYtMessage(ev: { origin?: unknown; data?: unknown }): YtInfo | null {
  if (typeof ev.origin !== 'string' || !/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(ev.origin)) return null;
  let data: unknown = ev.data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return null; } }
  if (!data || typeof data !== 'object') return null;
  const d = data as { event?: unknown; info?: unknown };
  if (d.event === 'onReady') return { ready: true };
  if (d.event === 'onStateChange') { const s = num(d.info); return s === undefined ? null : { state: s }; }
  if (d.event !== 'infoDelivery' || !d.info || typeof d.info !== 'object') return null;
  const i = d.info as Record<string, unknown>;
  const out: YtInfo = {};
  if (num(i.playerState) !== undefined) out.state = num(i.playerState);
  if (num(i.currentTime) !== undefined) out.currentTime = num(i.currentTime);
  if (num(i.duration) !== undefined && (i.duration as number) > 0) out.duration = num(i.duration);
  if (typeof i.muted === 'boolean') out.muted = i.muted;
  return Object.keys(out).length ? out : null;
}
