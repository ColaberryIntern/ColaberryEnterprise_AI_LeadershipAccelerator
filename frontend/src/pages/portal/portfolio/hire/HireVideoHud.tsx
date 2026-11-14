import React, { useEffect, useRef, useState } from 'react';
import type { HireVideo, VideoCoaching } from '../../../../services/hireStudioApi';
import { liveAt, marks, PACE } from './hireCoachModel';
import { recClock } from './hireVideoModel';
import './HireVideoCoach.css';

/**
 * The candidate's own playback with live coaching (Ali, 2026-11-14): as the video plays, pace,
 * filler words, hedges, pauses and voice level update on screen, and every moment is marked on
 * the rail. All of it comes from the analysed audio and transcript.
 *
 * THE FUTURISTIC LOOK IS DECORATION ONLY: corner brackets, a grid and a scan line over the
 * picture. Nothing reads or measures the face (Ali: "for the face, just make some futuristic
 * view"), and nothing on screen pretends to. Motion is transform/opacity only and stops under
 * prefers-reduced-motion. Candidate only; never on Hire.
 */
interface Props { video: HireVideo; coaching: VideoCoaching; seekTo?: { t: number; n: number } | null }

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const HireVideoHud: React.FC<Props> = ({ video, coaching, seekTo }) => {
  const ref = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const duration = coaching.seconds || video.seconds || 1;

  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    let raf = 0;
    const tick = () => { setT(v.currentTime); if (!v.paused && !reduced()) raf = requestAnimationFrame(tick); };
    const onTime = () => setT(v.currentTime);
    const onPlay = () => { cancelAnimationFrame(raf); tick(); };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('seeked', onTime);
    v.addEventListener('play', onPlay);
    return () => { cancelAnimationFrame(raf); v.removeEventListener('timeupdate', onTime); v.removeEventListener('seeked', onTime); v.removeEventListener('play', onPlay); };
  }, []);

  useEffect(() => {
    if (!seekTo || !ref.current) return;
    ref.current.currentTime = Math.max(0, seekTo.t - 0.5);
    setT(ref.current.currentTime);
    ref.current.focus();
  }, [seekTo]);

  const live = liveAt(coaching, t);
  const energy = coaching.voice?.energy ?? [];
  const bars = Array.from({ length: 16 }, (_, i) => energy[Math.floor(t * 2) - 15 + i] ?? 0);

  return (
    <div className="hud" data-testid="hs-hud">
      <div className="hud-stage">
        {/* Same origin as the studio, so the preview's caption track needs no crossorigin. */}
        <video ref={ref} controls playsInline preload="metadata" poster={video.posterUrl}
          aria-label={`Your intro video${video.seconds ? `, ${recClock(video.seconds)}` : ''}`} data-testid="hs-video-player">
          <source src={video.streamUrl} type="video/mp4" />
          {video.captionsUrl && <track kind="captions" src={video.captionsUrl} srcLang="en" label="English" default />}
        </video>
        <span className="hud-deco" aria-hidden="true">
          <i className="hud-c tl" /><i className="hud-c tr" /><i className="hud-c bl" /><i className="hud-c br" />
          <i className="hud-grid" /><i className="hud-scan" />
          <b className="hud-tag">COACH VIEW · {recClock(Math.floor(t))}</b>
        </span>
        {live.flash && <span className={`hud-flash ${live.flash.kind}`} aria-hidden="true" data-testid="hud-flash">{live.flash.kind === 'filler' ? `“${live.flash.label}”` : live.flash.label}</span>}
        {live.pausing && <span className="hud-pause" aria-hidden="true">PAUSE</span>}
      </div>

      <div className="hud-rail" aria-hidden="true">
        <i className="hud-rail-fill" style={{ transform: `scaleX(${Math.min(1, t / duration)})` }} />
        {marks(coaching).map((m) => <i key={`${m.kind}${m.t}`} className={`hud-mark ${m.kind}`} style={{ left: `${Math.min(100, (m.t / duration) * 100)}%` }} />)}
      </div>

      <div className="hud-panel" role="group" aria-label="Live coaching, updates as the video plays">
        <div className={`hud-tile pace ${live.paceBand ?? ''}`} data-testid="hud-pace">
          <span className="hud-k">Pace</span>
          <b>{live.wpm ?? 0}<small> wpm</small></b>
          <span className="hud-gauge"><i style={{ transform: `scaleX(${Math.min(1, (live.wpm ?? 0) / 220)})` }} /><em style={{ left: `${(PACE.lo / 220) * 100}%`, width: `${((PACE.hi - PACE.lo) / 220) * 100}%` }} /></span>
          <span className="hud-s">{live.paceBand === 'good' ? 'In the zone' : live.paceBand === 'slow' ? 'A bit slow' : live.paceBand === 'fast' ? 'A bit fast' : 'Listening'}</span>
        </div>
        <div className="hud-tile" data-testid="hud-fillers">
          <span className="hud-k">Filler words</span>
          <b>{live.fillers}<small> / {coaching.fillerTotal ?? 0}</small></b>
          <span className="hud-s">so far / in total</span>
        </div>
        <div className="hud-tile" data-testid="hud-hedges">
          <span className="hud-k">Hedges</span>
          <b>{live.hedges}<small> / {coaching.hedgeTotal ?? 0}</small></b>
          <span className="hud-s">“I think”, “kind of”</span>
        </div>
        <div className="hud-tile" data-testid="hud-voice">
          <span className="hud-k">Voice</span>
          <span className="hud-bars">{bars.map((b, i) => <i key={i} style={{ transform: `scaleY(${Math.max(0.06, b)})` }} />)}</span>
          <span className="hud-s">{live.pausing ? 'Pause' : live.energy > 0.55 ? 'Strong' : live.energy > 0.25 ? 'Steady' : 'Quiet'}</span>
        </div>
      </div>
    </div>
  );
};

export default HireVideoHud;
