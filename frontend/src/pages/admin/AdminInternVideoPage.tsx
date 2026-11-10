import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/admin/shell';
import { apiUrl, fetchInternVideo, type InternVideoView } from '../../services/internVideoApi';

/**
 * An intern's demo video, opened from the Internship Report (Ali, 10 Nov 2026: "allow me to click
 * and open up the video in the platform just as I open an artifact with the word or pdf or excel
 * viewer. I should also have a video viewer where I can see/watch/interact with that artifact").
 *
 * Watch: native controls plus speed (0.75x-2x), jump back / forward 10 seconds, picture-in-
 * picture, and keyboard (Space or K play/pause, J / L or arrows jump 10s, < > speed, F fullscreen).
 * Interact: every other take by the same intern is in the playlist, newest first, with its
 * presentation type, task, length and date. Seeking works because the stream supports HTTP Range.
 */

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const mmss = (s: number | null | undefined): string => (s === null || s === undefined || !Number.isFinite(s) ? '-' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
const day = (iso: string): string => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
const MODE: Record<string, string> = { practice_solo: 'Solo practice', practice_peer: 'Peer practice', cohort_live: 'Live with the cohort' };

export default function AdminInternVideoPage(): React.ReactElement {
  const { id = '' } = useParams<{ id: string }>();
  const [v, setV] = useState<InternVideoView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let live = true;
    setV(null); setError(null);
    fetchInternVideo(id)
      .then((x) => { if (live) setV(x); })
      .catch((e: { response?: { data?: { error?: string } } }) => { if (live) setError(e?.response?.data?.error ?? 'Could not load this video.'); });
    return () => { live = false; };
  }, [id]);

  const jump = useCallback((s: number) => { const el = ref.current; if (el) el.currentTime = Math.max(0, Math.min((el.duration || Infinity), el.currentTime + s)); }, []);
  const setRate = useCallback((r: number) => { setSpeed(r); if (ref.current) ref.current.playbackRate = r; }, []);
  const toggle = useCallback(() => { const el = ref.current; if (!el) return; if (el.paused) void el.play(); else el.pause(); }, []);
  const pip = useCallback(() => {
    const el = ref.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }) | null;
    if (el && el.requestPictureInPicture) void el.requestPictureInPicture().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const i = SPEEDS.indexOf(speed);
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
      else if (e.key === 'j' || e.key === 'ArrowLeft') jump(-10);
      else if (e.key === 'l' || e.key === 'ArrowRight') jump(10);
      else if (e.key === '<' && i > 0) setRate(SPEEDS[i - 1]);
      else if (e.key === '>' && i < SPEEDS.length - 1) setRate(SPEEDS[i + 1]);
      else if (e.key === 'f' && ref.current?.requestFullscreen) void ref.current.requestFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jump, setRate, speed, toggle]);

  if (error) return <div className="container py-4"><div className="alert alert-warning" role="alert">{error}</div></div>;
  if (!v) return <div className="container py-4" aria-busy="true">Loading video...</div>;

  return (
    <div className="container-fluid py-3">
      <PageHeader title={`${v.typeLabel}: ${v.intern}`} subtitle={`${v.projectName ?? 'Project'} · ${v.storyId ?? 'presentation'} · take ${v.attemptNo ?? 1} · ${mmss(v.durationSeconds)} · recorded ${day(v.recordedAt)}`} icon="video-line" />
      <div className="row g-3">
        <div className="col-lg-9">
          <div className="card">
            <div className="card-header small fw-semibold d-flex align-items-center gap-2">
              <span className="badge rounded-1 text-uppercase" style={{ background: '#be185d', letterSpacing: 0.5 }}><i className="ri-video-line me-1" aria-hidden="true" />Video</span>
              {v.typeLabel}{v.isFinalTake && <span className="badge text-bg-success">Final take</span>}
            </div>
            <div className="card-body">
              <video ref={ref} controls preload="metadata" poster={apiUrl(v.thumbnailUrl)} src={apiUrl(v.fileUrl)}
                style={{ width: '100%', maxHeight: '72vh', background: '#0f172a', borderRadius: 6 }} aria-label={`${v.typeLabel} by ${v.intern}`}>
                Your browser cannot play this video.
              </video>
              <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => jump(-10)} aria-label="Back 10 seconds">&#9664;&#9664; 10s</button>
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={toggle}>Play / pause</button>
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => jump(10)} aria-label="Forward 10 seconds">10s &#9654;&#9654;</button>
                <div className="btn-group btn-group-sm" role="group" aria-label="Playback speed">
                  {SPEEDS.map((s) => (
                    <button key={s} type="button" className={`btn ${s === speed ? 'btn-primary' : 'btn-outline-primary'}`} aria-pressed={s === speed} onClick={() => setRate(s)}>{s}x</button>
                  ))}
                </div>
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={pip}>Picture in picture</button>
                <a className="btn btn-outline-secondary btn-sm" href={apiUrl(v.fileUrl)} download>Download</a>
                <span className="small text-muted ms-auto">Keys: Space play, J / L jump 10s, &lt; &gt; speed, F fullscreen</span>
              </div>
            </div>
          </div>
          <div className="card mt-3">
            <div className="card-body small">
              <div className="row g-2">
                <div className="col-sm-3"><div className="text-muted text-uppercase" style={{ fontSize: 10 }}>Presentation</div>{v.typeLabel}</div>
                <div className="col-sm-3"><div className="text-muted text-uppercase" style={{ fontSize: 10 }}>Task</div>{v.storyId ?? '-'}</div>
                <div className="col-sm-3"><div className="text-muted text-uppercase" style={{ fontSize: 10 }}>Session</div>{(v.mode && MODE[v.mode]) || v.mode || '-'}</div>
                <div className="col-sm-3"><div className="text-muted text-uppercase" style={{ fontSize: 10 }}>Captured</div>{v.hasAudio === false ? 'No audio' : 'Audio'}{v.hasSharedScreen ? ', shared screen' : ''}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-3">
          <div className="card">
            <div className="card-header small fw-semibold">{v.intern}&apos;s takes ({v.takes.length})</div>
            <ul className="list-group list-group-flush">
              {v.takes.map((t) => (
                <li key={t.recordingId} className={`list-group-item small${t.recordingId === v.recordingId ? ' active' : ''}`} aria-current={t.recordingId === v.recordingId ? 'true' : undefined}>
                  {t.recordingId === v.recordingId
                    ? <span className="fw-semibold">{t.typeLabel}</span>
                    : <Link to={`/admin/internship/video/${t.recordingId}`} className="fw-semibold">{t.typeLabel}</Link>}
                  <div className={t.recordingId === v.recordingId ? '' : 'text-muted'}>{t.storyId ?? ''} · take {t.attemptNo ?? 1} · {mmss(t.durationSeconds)}{t.isFinalTake ? ' · final' : ''}</div>
                  <div className={t.recordingId === v.recordingId ? '' : 'text-muted'}>{day(t.recordedAt)}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
