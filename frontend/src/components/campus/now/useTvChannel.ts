import { useCallback, useEffect, useRef, useState } from 'react';
import { parseVideoUrl, withAutoplay } from '../../../utils/videoEmbed';
import { readYtMessage, YT_STATE, ytCommand, ytHandshake } from '../../../utils/youtubeChannel';

/**
 * One Colaberry TV player (Campus v20 N2, Basecamp C132): a youtube-nocookie embed (`enablejsapi=1`, from parseVideoUrl, the same
 * source <VideoEmbed> uses) driven over its postMessage channel (utils/youtubeChannel.ts; the CSP blocks YouTube's script).
 *
 *  - starts playing when mounted (Colaberry Now opening is a click), WITH sound unless the viewer muted it this visit;
 *  - if it is not playing AUTOPLAY_CHECK_MS after the frame loads, the browser blocked sound: it restarts muted and `needsTap` asks
 *    for "Tap for sound" (the tap reloads it with sound: that tap is the gesture the browser wanted);
 *  - the mute button is a live command (no reload); the embed URL changes only for a new short or a forced mute;
 *  - ENDED calls onEnded (the TV plays the next short); a reported length goes to onDuration (never guessed);
 *  - on unmount: the frame goes to about:blank and every timer and listener is cleared, so nothing keeps playing behind the map.
 */
export const AUTOPLAY_CHECK_MS = 2500;
const HANDSHAKE_MS = 1000;

export interface TvChannel {
  frameRef: React.RefObject<HTMLIFrameElement>;
  src: string;
  muted: boolean;
  needsTap: boolean;
  onLoad: () => void;
  setMuted: (m: boolean) => void;
  tapForSound: () => void;
}

export interface TvChannelOptions {
  startMuted: boolean;
  onEnded: () => void;
  onDuration: (youtubeId: string, seconds: number) => void;
  onMutedChange: (muted: boolean) => void;
}

export function embedSrc(youtubeId: string | null, muted: boolean, origin: string): string {
  const source = youtubeId ? parseVideoUrl(`https://www.youtube.com/shorts/${youtubeId}`) : null;
  return source ? `${withAutoplay(source, muted)}&playsinline=1&origin=${encodeURIComponent(origin)}` : 'about:blank';
}

export function useTvChannel(youtubeId: string | null, opts: TvChannelOptions): TvChannel {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [muted, setMutedState] = useState(opts.startMuted);
  const [forcedMute, setForcedMute] = useState(false);
  const [srcMuted, setSrcMuted] = useState(opts.startMuted);
  const mutedNow = useRef(muted);
  mutedNow.current = muted || forcedMute;
  const playing = useRef(false);
  const timers = useRef<number[]>([]);
  const cb = useRef(opts);
  cb.current = opts;

  const src = embedSrc(youtubeId, srcMuted, window.location.origin);

  const post = useCallback((msg: string) => {
    try { frameRef.current?.contentWindow?.postMessage(msg, '*'); } catch { /* frame navigating */ }
  }, []);
  const clearTimers = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };

  // A new short: fresh state, and its embed takes the current mute choice.
  useEffect(() => {
    playing.current = false;
    clearTimers();
    setSrcMuted(mutedNow.current);
    return clearTimers;
  }, [youtubeId]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const win = frameRef.current?.contentWindow;
      if (ev.source && win && ev.source !== win) return;
      const info = readYtMessage(ev);
      if (!info) return;
      if (info.state === YT_STATE.PLAYING) playing.current = true;
      if (info.duration && youtubeId) cb.current.onDuration(youtubeId, info.duration);
      if (info.state === YT_STATE.ENDED) cb.current.onEnded();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [youtubeId]);

  // Unmount: stop the player for real (about:blank), not just hide it. React detaches the ref before passive cleanups run, so the
  // last frame element is kept here.
  const lastFrame = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => { if (frameRef.current) lastFrame.current = frameRef.current; });
  useEffect(() => () => {
    clearTimers();
    const f = lastFrame.current;
    if (f) f.src = 'about:blank';
  }, []);

  const onLoad = useCallback(() => {
    if (!frameRef.current || !youtubeId) return;
    post(ytHandshake());
    timers.current.push(window.setTimeout(() => post(ytHandshake()), HANDSHAKE_MS));
    if (!srcMuted) {
      timers.current.push(window.setTimeout(() => {
        if (!playing.current) { setForcedMute(true); setSrcMuted(true); }
      }, AUTOPLAY_CHECK_MS));
    }
  }, [post, srcMuted, youtubeId]);

  const setMuted = useCallback((m: boolean) => {
    setMutedState(m);
    if (!m) setForcedMute(false);
    post(ytCommand(m ? 'mute' : 'unMute'));
    cb.current.onMutedChange(m);
  }, [post]);

  const tapForSound = useCallback(() => {
    setForcedMute(false);
    setMutedState(false);
    setSrcMuted(false);
    cb.current.onMutedChange(false);
  }, []);

  return { frameRef, src, muted: muted || forcedMute, needsTap: forcedMute && !muted, onLoad, setMuted, tapForSound };
}
