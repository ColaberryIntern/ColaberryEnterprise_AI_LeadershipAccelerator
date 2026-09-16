import React, { useEffect, useRef, useState } from 'react';
import { StatusBadge } from '../shell';
import {
  IntakeCallProgress,
  IntakeStudent,
  PlacedCall,
  describeCallError,
  getIntakeCall,
  placeIntakeCall,
} from '../../../services/adminFlotationIntakeApi';

/**
 * The spoken interview, from the management side.
 *
 *     "I want the exact same setup (deterministic) as AI flotation - that includes voice
 *      intake."  (Ali, 2026-09-16)
 *
 * Places the call "Call me now" on /start places - same script, same gates, same webhook,
 * same `finishIntake` at the end - stamped with the student it is for. Then watches: the
 * vendor reports to the webhook, not to this page, so the page asks every few seconds
 * where the call has got to until it has become a project or clearly will not.
 *
 * The phone is whoever should be on the line. To test the experience, give your own number
 * and play the customer; the project still lands in the student's portal.
 */

interface Props {
  student: IntakeStudent;
  onViewAs: () => void;
}

const POLL_MS = 8_000;
/** A call is a few minutes; extraction and build a couple more. Past this, stop asking. */
const WATCH_FOR_MS = 20 * 60 * 1000;

type Stage = 'form' | 'placing' | 'watching' | 'done' | 'gave_up';

export default function SpokenIntake({ student, onViewAs }: Props) {
  const [phone, setPhone] = useState('');
  const [idea, setIdea] = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const [placed, setPlaced] = useState<PlacedCall | null>(null);
  const [progress, setProgress] = useState<IntakeCallProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number>(0);

  const place = async () => {
    if (!phone.trim() || stage === 'placing') return;
    setStage('placing');
    setError(null);
    try {
      const result = await placeIntakeCall({ enrollmentId: student.id, phone: phone.trim(), idea: idea.trim() || undefined });
      setPlaced(result);
      startedAt.current = Date.now();
      setStage(result.call_id ? 'watching' : 'gave_up');
    } catch (err) {
      setError(describeCallError(err));
      setStage('form');
    }
  };

  // Watch the call until it has become a project, failed, or run out of time.
  useEffect(() => {
    if (stage !== 'watching' || !placed?.call_id) return undefined;
    const callId = placed.call_id;
    let live = true;
    const tick = async () => {
      try {
        const p = await getIntakeCall(callId);
        if (!live) return;
        setProgress(p);
        if (p.build || p.call.status === 'failed' || (p.understanding && p.understanding.status !== 'extracted')) {
          setStage('done');
          return;
        }
      } catch {
        // A missed poll is not a failed call; the next one will say.
      }
      if (live && Date.now() - startedAt.current > WATCH_FOR_MS) setStage('gave_up');
    };
    void tick();
    const t = setInterval(() => { void tick(); }, POLL_MS);
    return () => { live = false; clearInterval(t); };
  }, [stage, placed]);

  const reset = () => {
    setStage('form');
    setPlaced(null);
    setProgress(null);
    setError(null);
  };

  if (stage === 'form' || stage === 'placing') {
    return (
      <form className="d-flex flex-column gap-2" style={{ maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); void place(); }}>
        <div>
          <label htmlFor="intake-phone" className="form-label small fw-semibold mb-1">Number to call</label>
          <input
            id="intake-phone"
            type="tel"
            className="form-control form-control-sm"
            placeholder="+1 555 012 3456"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={stage === 'placing'}
            autoComplete="tel"
          />
          <div className="form-text">
            Only a number whose owner has agreed to be called. To test the experience, use your own and play the customer -
            the project still lands in {student.full_name ? `${student.full_name}'s` : 'their'} portal.
          </div>
        </div>
        <div>
          <label htmlFor="intake-idea" className="form-label small fw-semibold mb-1">What the project is <span className="text-muted fw-normal">(optional - the agent opens with it)</span></label>
          <textarea
            id="intake-idea"
            className="form-control form-control-sm"
            rows={2}
            placeholder="One or two sentences, the way a customer would say it"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            disabled={stage === 'placing'}
            maxLength={5000}
          />
        </div>
        {error && <p className="text-danger small mb-0">{error}</p>}
        <div>
          <button type="submit" className="btn btn-sm btn-primary" disabled={stage === 'placing' || !phone.trim()}>
            {stage === 'placing' ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ri-phone-line me-1" />}
            Call now
          </button>
        </div>
      </form>
    );
  }

  const call = progress?.call;
  const ended = call?.status === 'delivered' || call?.status === 'failed';
  const writtenUp = progress?.understanding?.status === 'extracted';
  const building = Boolean(progress?.build);
  const failed = call?.status === 'failed' || (progress?.understanding && progress.understanding.status !== 'extracted');

  return (
    <div className="border rounded p-3" style={{ maxWidth: 640 }} aria-live="polite">
      <ol className="list-unstyled mb-3 d-flex flex-column gap-2 small">
        <Step done state="done" label={placed?.deduped ? 'Call already placed a moment ago - watching that one' : 'Call placed'} detail={placed?.call_id ? `call ${placed.call_id}` : undefined} />
        <Step
          done={ended}
          state={call?.status === 'failed' ? 'failed' : ended ? 'done' : 'waiting'}
          label={call?.status === 'failed' ? `Call did not complete${call.end_reason ? ` (${call.end_reason})` : ''}` : ended ? 'Call ended, transcript in' : 'On the phone'}
          detail={call?.duration ? `${Math.round(call.duration / 60)} min` : undefined}
        />
        <Step
          done={writtenUp}
          state={progress?.understanding && !writtenUp ? 'failed' : writtenUp ? 'done' : 'waiting'}
          label={writtenUp ? `Written up${progress?.understanding?.title ? `: ${progress.understanding.title}` : ''}` : progress?.understanding ? 'Write-up failed' : 'Writing it up'}
          detail={writtenUp ? `${progress?.understanding?.items} items` : undefined}
        />
        <Step done={building} state={building ? 'done' : 'waiting'} label={building ? 'Build started' : 'Starting the build'} />
      </ol>

      {stage === 'watching' && !failed && (
        <p className="small text-muted mb-2"><span className="spinner-border spinner-border-sm me-2" />Checking every few seconds. You can leave this page; the call finishes on its own.</p>
      )}
      {stage === 'gave_up' && !building && (
        <p className="small text-warning mb-2">
          {placed?.call_id ? 'Stopped watching after twenty minutes. If the call did happen, its project will show in the enquiry table below.' : `The call was not placed${placed?.reason ? `: ${placed.reason}` : ''}.`}
        </p>
      )}
      {failed && <p className="small text-danger mb-2">Nothing more will happen from this call. Place another when they are ready.</p>}
      {building && (
        <p className="small mb-2">
          The project is building now - a minute or two - and will appear in {student.full_name || 'their'} portal exactly as a student-created one would.
        </p>
      )}

      <div className="d-flex gap-2">
        {building && (
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={onViewAs}>
            <i className="ri-eye-line me-1" />See it as they would
          </button>
        )}
        {(stage === 'done' || stage === 'gave_up') && (
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={reset}>
            <i className="ri-phone-line me-1" />Place another call
          </button>
        )}
      </div>
    </div>
  );
}

function Step({ done, state, label, detail }: { done: boolean; state: 'done' | 'waiting' | 'failed'; label: string; detail?: string }) {
  return (
    <li className="d-flex align-items-center gap-2">
      <StatusBadge label={state === 'failed' ? 'stopped' : done ? 'done' : 'waiting'} tone={state === 'failed' ? 'danger' : done ? 'success' : 'neutral'} />
      <span>{label}</span>
      {detail && <span className="text-muted">{detail}</span>}
    </li>
  );
}
