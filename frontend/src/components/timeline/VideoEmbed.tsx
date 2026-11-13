import React, { useEffect, useRef, useState } from 'react';
import { VideoSource, providerLabel, withAutoplay, isAudioUrl } from '../../utils/videoEmbed';
import { ytHandshake } from '../../utils/youtubeChannel';
import { getPodcastMuted, setPodcastMuted } from '../../utils/podcastMutePreference';

/**
 * VideoEmbed — plays a lesson video in-app from any supported link (YouTube,
 * Vimeo, Loom, Wistia, or a direct file), with no third-party player library.
 * Inline contexts show a poster + play button first; drawer contexts pass
 * `autoplay` (the click that OPENED the drawer is the play intent) so the video
 * starts right away. Direct-file videos report `onEnded` so the card can
 * auto-complete; iframe providers complete via an explicit action.
 *
 * Watch tracking (`onWatchBeat`): accumulates seconds ACTUALLY PLAYED (scrubbing
 * adds nothing — only small position deltas count) and flushes a beat roughly
 * every 15s of playback plus on pause/end/unmount. Sources: native `timeupdate`
 * for <video>/<audio>; the YouTube (`enablejsapi` postMessage `infoDelivery`)
 * and Vimeo (`timeupdate` postMessage) player channels for iframes; a
 * visibility-gated dwell timer for providers with no signal (Loom/Wistia).
 * When `onWatchBeat` is absent (admin previews) nothing is tracked.
 *
 * Exits (C119, 2026-11-10): closing the tab or app, switching away, or locking
 * the phone sends what is buffered right away, with `{ exiting: true }`, so
 * callers can send it as a keepalive request that survives the page going away.
 * React cleanup never runs on unload, so before this, a learner who left
 * without pausing lost up to 15 seconds of watch time, and one who left in the
 * first 15 seconds was not recorded at all. A pause that arrives after the page
 * is already hidden is an exit too.
 */

export interface WatchBeatPayload {
  delta_s: number;
  position_s?: number | null;
  duration_s?: number | null;
  provider?: string | null;
}

/** Passed as onWatchBeat's second argument only on an exit beat. */
export interface WatchBeatMeta {
  exiting: true;
}

/** True when the page is hidden (tab closed or switched, app backgrounded, phone locked). */
const pageHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

interface Props {
  source: VideoSource | null;
  title?: string;
  poster?: string | null;
  onEnded?: () => void;
  /** A corner ribbon label drawn over the poster (e.g. "Testimonial") so the card
   *  type is always visible on the thumbnail. */
  badge?: string | null;
  /** Start playing immediately (no poster click) — used when the user's click
   *  already expressed play intent (opening a video card's drawer). */
  autoplay?: boolean;
  /** Live watch-progress reporter — see the header comment. */
  onWatchBeat?: (beat: WatchBeatPayload, meta?: WatchBeatMeta) => void;
  /** Duration fallback in seconds (e.g. card.estimated_time * 60) for providers
   *  that never report one — powers the dwell fallback's percentage. */
  fallbackDurationS?: number | null;
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
);

const FLUSH_AFTER_S = 15;          // flush a beat after this much new play time
const MAX_TICK_DELTA_S = 2.5;      // position jumps beyond this = a seek, not playback

const addParam = (u: string, p: string) => u + (u.includes('?') ? '&' : '?') + p;

const VideoEmbed: React.FC<Props> = ({ source, title, poster, onEnded, badge, autoplay, onWatchBeat, fallbackDurationS }) => {
  const [playing, setPlaying] = useState(!!autoplay);

  // --- watch accumulation (refs so handlers/effects never go stale) ---
  const bufRef = useRef({ delta: 0, position: 0, duration: 0 });
  const lastPosRef = useRef<number | null>(null);
  const beatRef = useRef<Props['onWatchBeat']>(onWatchBeat);
  beatRef.current = onWatchBeat;
  const fallbackRef = useRef<number>(0);
  fallbackRef.current = Math.max(0, Number(fallbackDurationS) || 0);

  // The provider label of the last tick, so an exit beat is labeled like the beats before it.
  const lastProviderRef = useRef<string>('file');

  const flushRef = useRef<(provider: string, exiting?: boolean) => void>(() => {});
  flushRef.current = (provider: string, exiting = false) => {
    const b = bufRef.current;
    if (!beatRef.current || b.delta <= 0) return;
    bufRef.current = { delta: 0, position: b.position, duration: b.duration };
    const beat: WatchBeatPayload = {
      delta_s: Math.round(b.delta * 10) / 10,
      position_s: Math.round(b.position),
      duration_s: Math.round(b.duration || fallbackRef.current || 0),
      provider,
    };
    // One argument on an ordinary beat, so existing callers and tests see exactly what they always did.
    if (exiting || pageHidden()) beatRef.current(beat, { exiting: true });
    else beatRef.current(beat);
  };

  /** Fold one playhead tick into the buffer (media elements + iframe messages). */
  const tick = (pos: number, dur: number | null, provider: string, isPlaying = true) => {
    lastProviderRef.current = provider;
    const last = lastPosRef.current;
    lastPosRef.current = pos;
    if (last != null && isPlaying) {
      const d = pos - last;
      if (d > 0 && d < MAX_TICK_DELTA_S) bufRef.current.delta += d;   // seeks add nothing
    }
    bufRef.current.position = Math.max(bufRef.current.position, pos);
    if (dur && Number.isFinite(dur) && dur > 0) bufRef.current.duration = Math.max(bufRef.current.duration, dur);
    if (bufRef.current.delta >= FLUSH_AFTER_S) flushRef.current(provider);
  };

  const mediaTimeUpdate = (provider: string) => (e: React.SyntheticEvent<HTMLMediaElement>) => {
    const el = e.currentTarget;
    tick(el.currentTime, el.duration, provider);
  };
  const mediaEnded = (provider: string) => () => {
    // Mark the playhead at the end, flush what's buffered, then auto-complete.
    if (bufRef.current.duration > 0) bufRef.current.position = bufRef.current.duration;
    flushRef.current(provider);
    onEnded?.();
  };

  // Iframe tracking: YouTube/Vimeo postMessage channels; dwell timer otherwise.
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const provider = source?.provider;
  const kind = source?.kind;
  useEffect(() => {
    if (!playing || kind !== 'iframe' || !onWatchBeat) return undefined;

    if (provider === 'youtube' || provider === 'vimeo') {
      const yt = provider === 'youtube';
      const handshake = () => {
        const win = iframeRef.current?.contentWindow;
        if (!win) return;
        try {
          if (yt) win.postMessage(ytHandshake(), '*');
          else win.postMessage(JSON.stringify({ method: 'addEventListener', value: 'timeupdate' }), '*');
        } catch { /* frame not ready yet */ }
      };
      const hs = window.setInterval(handshake, 2500);
      handshake();
      const onMsg = (ev: MessageEvent) => {
        if (typeof ev.origin !== 'string' || !ev.origin.includes(yt ? 'youtube' : 'vimeo')) return;
        let data: any = ev.data;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
        if (!data || typeof data !== 'object') return;
        if (yt) {
          if (data.event !== 'infoDelivery' || !data.info) return;
          const info = data.info;
          if (typeof info.currentTime !== 'number') return;
          const isPlaying = typeof info.playerState === 'number' ? info.playerState === 1 : true;
          tick(info.currentTime, typeof info.duration === 'number' ? info.duration : null, 'youtube', isPlaying);
        } else {
          if (data.event === 'ready') { handshake(); return; }
          if (data.event !== 'timeupdate' && data.event !== 'playProgress') return;
          const d = data.data || {};
          if (typeof d.seconds !== 'number') return;
          tick(d.seconds, typeof d.duration === 'number' ? d.duration : null, 'vimeo');
        }
      };
      window.addEventListener('message', onMsg);
      const safety = window.setInterval(() => flushRef.current(provider), 20000);
      return () => {
        window.clearInterval(hs);
        window.clearInterval(safety);
        window.removeEventListener('message', onMsg);
        flushRef.current(provider);
      };
    }

    // Loom/Wistia/unknown iframes emit nothing — count visible dwell time against
    // the fallback duration so these players still gate fairly (never harder).
    const dwell = window.setInterval(() => {
      if (document.hidden) return;
      lastProviderRef.current = 'dwell';
      bufRef.current.delta += 5;
      bufRef.current.position += 5;
      if (!bufRef.current.duration && fallbackRef.current) bufRef.current.duration = fallbackRef.current;
      if (bufRef.current.delta >= FLUSH_AFTER_S) flushRef.current('dwell');
    }, 5000);
    return () => { window.clearInterval(dwell); flushRef.current('dwell'); };
  }, [playing, kind, provider, onWatchBeat]);

  // C119: leaving the page sends the buffered watch time now, as an exit beat. `pagehide` covers a closed tab,
  // `visibilitychange` to hidden covers a backgrounded app or locked phone (where pagehide may never fire). When both
  // fire, the second finds an empty buffer and sends nothing.
  const tracking = playing && !!onWatchBeat;
  useEffect(() => {
    if (!tracking) return undefined;
    const exit = () => flushRef.current(lastProviderRef.current, true);
    const onVisibility = () => { if (pageHidden()) exit(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', exit);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', exit);
    };
  }, [tracking]);

  const ribbon = badge ? <span className="tlv-ribbon">{badge}</span> : null;

  if (!source) {
    return <div className="tlv-none">No video is attached to this card yet.</div>;
  }

  // Unknown / unsupported URL — offer to open it at the source.
  if (source.kind === 'link') {
    return (
      <div className="tlv-frame tlv-link">
        {ribbon}
        <div className="tlv-linkbody">
          <p>This video is hosted on {providerLabel(source.provider)}.</p>
          <a className="tl-btn primary sm" href={source.originalUrl} target="_blank" rel="noopener noreferrer">
            Watch on {providerLabel(source.provider)}
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </div>
      </div>
    );
  }

  if (!playing) {
    return (
      <button type="button" className="tlv-frame tlv-poster" onClick={() => setPlaying(true)} aria-label={`Play ${title || 'video'}`}>
        {poster && <img className="tlv-posterimg" src={poster} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
        <span className="tlv-postergrad" />
        {ribbon}
        <span className="tlv-bigplay"><PlayIcon /></span>
        {title && <span className="tlv-postertitle">{title}</span>}
      </button>
    );
  }

  if (source.kind === 'file') {
    // Audio-only episode (podcast .mp3) — keep the artwork as the backdrop with an
    // in-app audio player; `onEnded` still auto-completes like direct-file video.
    if (isAudioUrl(source.embedUrl)) {
      return (
        <div className="tlv-frame" style={{ position: 'relative' }}>
          {poster && <img className="tlv-posterimg" src={poster} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
          <span className="tlv-postergrad" style={{ pointerEvents: 'none' }} />
          {ribbon}
          {/* zIndex 2: the postergrad overlay is z-index:1 and would otherwise sit ON TOP
              of the (z-auto) player and swallow every click on the pause/play controls. */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 12px', display: 'grid', gap: 6, zIndex: 2 }}>
            {title && <span className="tlv-postertitle" style={{ position: 'static' }}>{title}</span>}
            <audio
              style={{ width: '100%' }}
              src={source.embedUrl}
              controls
              autoPlay
              // Read fresh on every (re)mount — a new VideoEmbed instance mounts per
              // drawer-open / per scroll-triggered preview, so a stale useState here
              // would silently re-mute an episode the student already unmuted.
              muted={getPodcastMuted()}
              onVolumeChange={(e) => setPodcastMuted(e.currentTarget.muted)}
              onTimeUpdate={mediaTimeUpdate('audio')}
              onPause={() => flushRef.current('audio')}
              onEnded={mediaEnded('audio')}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="tlv-frame">
        <video
          className="tlv-media"
          src={source.embedUrl}
          controls
          autoPlay
          muted={autoplay}
          playsInline
          onTimeUpdate={mediaTimeUpdate('file')}
          onPause={() => flushRef.current('file')}
          onEnded={mediaEnded('file')}
        >
          <track kind="captions" />
        </video>
      </div>
    );
  }

  // iframe providers (youtube / vimeo / loom / wistia). YouTube gets the JS-API
  // origin param so its postMessage channel reports playback to this window.
  const iframeSrc = source.provider === 'youtube'
    ? addParam(withAutoplay(source, autoplay), `origin=${encodeURIComponent(window.location.origin)}`)
    : withAutoplay(source, autoplay);
  return (
    <div className="tlv-frame">
      <iframe
        ref={iframeRef}
        className="tlv-media"
        src={iframeSrc}
        title={title || 'Lesson video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  );
};

export default VideoEmbed;
