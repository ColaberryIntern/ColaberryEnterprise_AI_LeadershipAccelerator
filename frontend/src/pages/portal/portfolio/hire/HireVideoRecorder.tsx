import React, { useEffect, useRef, useState } from 'react';
import { MAX_RECORD_SECONDS, pickRecorderType, promptAt, PROMPTS, recClock, recordingName } from './hireVideoModel';

/**
 * Records the intro video in the browser (kit §3.2): getUserMedia + MediaRecorder, capped at 90
 * seconds, with a red "REC 0:42" pill and the current prompt over the live preview, and
 * **Next prompt →** to move through the three. Stopping (or reaching 90s) hands the take up; the
 * parent shows it back before anything is uploaded.
 *
 * The camera is released on stop, on cancel and on unmount, so the browser's camera light never
 * stays on after the candidate leaves the section.
 */

interface Props {
  onTake: (blob: Blob, name: string) => void;
  onCancel: () => void;
}

type Phase = 'asking' | 'recording' | 'denied' | 'unsupported';

const HireVideoRecorder: React.FC<Props> = ({ onTake, onCancel }) => {
  const [phase, setPhase] = useState<Phase>('asking');
  const [elapsed, setElapsed] = useState(0);
  const [prompt, setPrompt] = useState(0);
  const preview = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const release = () => {
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  useEffect(() => {
    const type = pickRecorderType(typeof MediaRecorder !== 'undefined' ? MediaRecorder.isTypeSupported?.bind(MediaRecorder) : undefined);
    if (!type || !navigator.mediaDevices?.getUserMedia) { setPhase('unsupported'); return undefined; }
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (preview.current) { preview.current.srcObject = s; void preview.current.play().catch(() => undefined); }
        const chunks: Blob[] = [];
        const rec = new MediaRecorder(s, { mimeType: type });
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        rec.onstop = () => { release(); if (!cancelled) onTake(new Blob(chunks, { type }), recordingName(type)); };
        recorder.current = rec;
        const started = Date.now();
        rec.start(1000);
        setPhase('recording');
        timer.current = window.setInterval(() => {
          const s2 = (Date.now() - started) / 1000;
          setElapsed(s2);
          if (s2 >= MAX_RECORD_SECONDS && rec.state === 'recording') rec.stop();
        }, 250);
      })
      .catch(() => { if (!cancelled) setPhase('denied'); });
    return () => {
      cancelled = true;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      release();
    };
    // Runs once per mount: a new take mounts a new recorder.
  }, []);

  const stop = () => { if (recorder.current?.state === 'recording') recorder.current.stop(); };

  if (phase === 'unsupported' || phase === 'denied') {
    return (
      <div className="hs-vrec-msg" role="alert" data-testid="hs-rec-problem">
        <p className="cp-muted">
          {phase === 'denied'
            ? 'We could not use your camera and microphone. Allow them for this site in your browser, or upload a video instead.'
            : 'This browser cannot record video here. Upload a video you recorded on your phone or computer instead.'}
        </p>
        <button type="button" className="cp-btn" onClick={onCancel}>Back</button>
      </div>
    );
  }

  const last = prompt >= PROMPTS.length - 1;
  return (
    <div className="hs-vrec" data-testid="hs-recorder">
      <div className="hs-vbox">
        <video ref={preview} muted playsInline aria-label="Camera preview" />
        {phase === 'recording' && (
          <>
            <span className="hs-rec" role="timer" aria-live="off" data-testid="hs-rec-clock">REC {recClock(elapsed)}</span>
            <p className="hs-vprompt" aria-live="polite">{prompt + 1}. {promptAt(prompt)}</p>
          </>
        )}
        {phase === 'asking' && <p className="hs-vprompt" role="status">Waiting for your camera…</p>}
      </div>
      <div className="hs-vacts">
        <button type="button" className="cp-btn" onClick={() => setPrompt((p) => p + 1)} disabled={phase !== 'recording' || last} data-testid="hs-next-prompt">
          Next prompt →
        </button>
        <button type="button" className="cp-btn cp-btn-primary" onClick={stop} disabled={phase !== 'recording'} data-testid="hs-rec-stop">
          Stop
        </button>
        <span className="cp-muted hs-vcap">Stops on its own at {recClock(MAX_RECORD_SECONDS)}.</span>
      </div>
    </div>
  );
};

export default HireVideoRecorder;
