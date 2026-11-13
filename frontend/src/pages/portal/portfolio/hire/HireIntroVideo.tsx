import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteHireVideo, fetchHireVideo, updateHireVideo, uploadHireVideo, videoErrorText, type HireVideo,
} from '../../../../services/hireStudioApi';
import { MIN_TAKE_BYTES, PROMPTS, recClock, uploadProblem } from './hireVideoModel';
import HireVideoRecorder from './HireVideoRecorder';

/**
 * Intro video (kit §3.2). Record in the browser or upload a file; either becomes a DRAFT that only
 * the candidate can see, and nothing reaches Hire until they press Publish. A recording is shown
 * back before it is uploaded. Coaching from colaberry/video-analysis is for the candidate only and
 * says plainly when that service is not switched on yet.
 */

interface Props {
  /** Keeps the studio's menu badge and checklist in step with what is saved. */
  onChanged: (summary: { status: string; seconds: number | null } | null) => void;
}

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; video: HireVideo | null };
type Mode = 'view' | 'record' | 'review' | 'uploading';

const summary = (v: HireVideo | null) => (v ? { status: v.status, seconds: v.seconds } : null);

const HireIntroVideo: React.FC<Props> = ({ onChanged }) => {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [mode, setMode] = useState<Mode>('view');
  const [take, setTake] = useState<{ blob: Blob; name: string; url: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const read = useCallback(() => {
    setLoad({ state: 'loading' });
    fetchHireVideo().then((video) => setLoad({ state: 'ready', video }), () => setLoad({ state: 'failed' }));
  }, []);
  useEffect(read, [read]);
  useEffect(() => () => { if (take) URL.revokeObjectURL(take.url); }, [take]);

  const saved = (video: HireVideo | null) => { setLoad({ state: 'ready', video }); onChanged(summary(video)); };

  const upload = async (blob: Blob, name: string) => {
    setMsg(null); setMode('uploading'); setProgress(0);
    try {
      saved(await uploadHireVideo(blob, name, setProgress));
      setTake(null);
      setMode('view');
    } catch (e) {
      setMsg(videoErrorText(e));
      setMode(take ? 'review' : 'view');
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const problem = uploadProblem(f);
    if (problem) { setMsg(problem); return; }
    void upload(f, f.name);
  };

  const change = async (u: { published?: boolean; captionsWanted?: boolean }) => {
    setBusy(true); setMsg(null);
    try { saved(await updateHireVideo(u)); } catch (e) { setMsg(videoErrorText(e)); } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setMsg(null);
    try { await deleteHireVideo(); saved(null); setConfirmDelete(false); } catch (e) { setMsg(videoErrorText(e)); } finally { setBusy(false); }
  };

  const video = load.state === 'ready' ? load.video : null;
  const live = video?.status === 'published';

  const pickers = (again: boolean) => (
    <>
      <button type="button" className={`cp-btn${again ? '' : ' cp-btn-primary'}`} onClick={() => { setMsg(null); setMode('record'); }} data-testid="hs-rec-start">
        {again ? 'Record a new one' : 'Start recording'}
      </button>
      <button type="button" className="cp-btn" onClick={() => file.current?.click()} data-testid="hs-upload">
        {again ? 'Upload a new one' : 'Upload a video'}
      </button>
    </>
  );

  return (
    <section className="cp-card" aria-labelledby="hs-video-h" data-testid="hs-video">
      <div className="hs-vhead">
        <h3 className="cp-card-h" id="hs-video-h">Intro video</h3>
        {video && <span className={`hs-vstatus${live ? ' live' : ''}`} data-testid="hs-video-status">{live ? 'Live on Hire' : 'Draft, only you can see it'}</span>}
      </div>
      <input ref={file} type="file" accept="video/*" className="hs-file" tabIndex={-1} aria-hidden="true" onChange={onFile} data-testid="hs-file" />
      {msg && <p className="hs-vmsg" role="alert" data-testid="hs-video-msg">{msg}</p>}

      {load.state === 'loading' && <p className="cp-muted" role="status">Loading…</p>}
      {load.state === 'failed' && (
        <div role="alert">
          <p className="cp-muted">We couldn’t load your video just now. Nothing you saved is lost.</p>
          <button type="button" className="cp-btn" onClick={read}>Try again</button>
        </div>
      )}

      {load.state === 'ready' && mode === 'record' && (
        <HireVideoRecorder
          onTake={(blob, name) => {
            // A camera that never delivered frames gives an empty take (seen with a cold device in
            // Chrome). Say so here rather than upload nothing and get "too short" back.
            if (blob.size < MIN_TAKE_BYTES) { setMsg('That recording came out empty. Check your camera, then try again or upload a video.'); setMode('view'); return; }
            setTake({ blob, name, url: URL.createObjectURL(blob) }); setMode('review');
          }}
          onCancel={() => setMode('view')} />
      )}

      {load.state === 'ready' && mode === 'review' && take && (
        <div data-testid="hs-review">
          <div className="hs-vbox"><video src={take.url} controls playsInline aria-label="Your new take" /></div>
          <div className="hs-vacts">
            <button type="button" className="cp-btn cp-btn-primary" onClick={() => void upload(take.blob, take.name)} data-testid="hs-use-take">Use this take</button>
            <button type="button" className="cp-btn" onClick={() => { setTake(null); setMode('record'); }}>Record again</button>
            <button type="button" className="cp-btn" onClick={() => { setTake(null); setMode('view'); }}>Discard</button>
          </div>
        </div>
      )}

      {mode === 'uploading' && (
        <div className="hs-vupload" data-testid="hs-uploading">
          <div className="hs-meter" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <i style={{ transform: `scaleX(${progress})` }} />
          </div>
          <p className="cp-muted" role="status">{progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : 'Preparing your video. This takes about a minute.'}</p>
        </div>
      )}

      {load.state === 'ready' && mode === 'view' && (video ? (
        <>
          <div className="hs-vbox">
            {/* Same origin as the studio, so the preview's caption track needs no crossorigin. */}
            <video controls playsInline preload="metadata" poster={video.posterUrl} aria-label={`Your intro video${video.seconds ? `, ${recClock(video.seconds)}` : ''}`} data-testid="hs-video-player">
              <source src={video.streamUrl} type="video/mp4" />
              {video.captionsUrl && <track kind="captions" src={video.captionsUrl} srcLang="en" label="English" default />}
            </video>
          </div>
          <div className="hs-vacts">
            <button type="button" className={`cp-btn${live ? '' : ' cp-btn-primary'}`} disabled={busy} onClick={() => void change({ published: !live })} data-testid="hs-publish">
              {live ? 'Unpublish' : 'Publish to Hire'}
            </button>
            {pickers(true)}
            {confirmDelete
              ? <button type="button" className="cp-btn hs-danger" disabled={busy} onClick={() => void remove()} data-testid="hs-delete-confirm">Yes, delete it</button>
              : <button type="button" className="cp-btn" onClick={() => setConfirmDelete(true)} data-testid="hs-delete">Delete</button>}
          </div>
          <label className="hs-check hs-vcheck">
            <input type="checkbox" checked={video.captionsWanted} disabled={busy} onChange={(e) => void change({ captionsWanted: e.target.checked })} data-testid="hs-captions" />
            <span>Add captions automatically</span>
          </label>
          <Coaching video={video} />
        </>
      ) : (
        <>
          <div className="hs-vbox hs-vempty">
            <ol className="hs-prompts" aria-label="The three prompts">{PROMPTS.map((p) => <li key={p}>{p}</li>)}</ol>
          </div>
          <div className="hs-vacts">{pickers(false)}</div>
        </>
      ))}

      <p className="cp-muted hs-vtips">
        Tips: face a window, keep the camera at eye level, and aim for 90 seconds. Nothing goes on Hire until you press Publish.
      </p>
    </section>
  );
};

/** Candidate-only coaching from colaberry/video-analysis. Never shown on Hire. */
const Coaching: React.FC<{ video: HireVideo }> = ({ video }) => (
  <div className="hs-coach" data-testid="hs-coaching">
    <div className="hs-coach-h">Coaching <span className="cp-muted">· just for you, never on Hire</span></div>
    {video.coaching?.notes.length
      ? <ul>{video.coaching.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      : video.analysis === 'pending'
        ? <p className="cp-muted" role="status">Listening to your video. Coaching and captions appear here in a few minutes.</p>
        : <p className="cp-muted">Coaching on length, pace and filler words, and automatic captions, come from our video analysis service, which is not switched on yet. Your video works without them.</p>}
  </div>
);

export default HireIntroVideo;
