import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getIntakeStatus,
  interviewTurn,
  requestCall,
  IntakeStatus,
  InterviewTurn,
} from '../../services/enterpriseIntakeApi';
import { formatHours, hoursPerYear } from './demoPilotModel';
import './demoPilotIntake.css';

/**
 * DemoPilotIntake - what /demo-pilot shows once the form is in (W28).
 *
 * Ali, 2026-11-20: "upon completing that they can have the AI call them. Also tell them how
 * much time is going to save them." So this is the intake's second step, right after the
 * form (Q1 A): their own time figure, then a 10-minute AI interview, by phone or typed. Both
 * run the same interview AI Flotation runs; whichever they pick, the write-up lands on their
 * intake, and our first meeting starts from it.
 *
 * The figure is THEIRS (Q2 A): hours a week from the form, times 52. The only claim about
 * us is the one the process itself makes true: the interview replaces the discovery meeting.
 */

type Phase = 'loading' | 'missing' | 'choose' | 'calling' | 'chat' | 'done';

const POLL_MS = 5000;
/** Stop polling a call after this long; the page offers typing instead. */
const POLL_LIMIT_MS = 20 * 60 * 1000;

export interface DemoPilotIntakeProps {
  token: string;
  /** The number they gave, to say back while we call. Absent after a reload. */
  phone?: string;
}

export function DemoPilotIntake({ token, phone }: DemoPilotIntakeProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('loading');
  const [status, setStatus] = useState<IntakeStatus | null>(null);
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const callStarted = useRef(0);

  useEffect(() => {
    let live = true;
    getIntakeStatus(token)
      .then((s) => {
        if (!live) return;
        setStatus(s);
        setPhase(s.interviewed ? 'done' : s.call === 'in_progress' || s.call === 'writing_up' ? 'calling' : 'choose');
      })
      .catch(() => live && setPhase('missing'));
    return () => {
      live = false;
    };
  }, [token]);

  const send = useCallback(
    async (next: InterviewTurn[]): Promise<void> => {
      setBusy(true);
      setNote('');
      try {
        const r = await interviewTurn(token, next);
        setTurns([...next, { role: 'assistant', text: r.message }]);
        if (r.done) setPhase('done');
      } catch {
        setNote('That did not go through. Please try again.');
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  const startTyping = (): void => {
    setPhase('chat');
    if (turns.length === 0) void send([]);
  };

  const startCall = async (): Promise<void> => {
    setBusy(true);
    setNote('');
    try {
      const r = await requestCall(token);
      if (r.status === 'calling' || r.status === 'already_calling') {
        callStarted.current = Date.now();
        setPhase('calling');
      } else {
        setNote('We cannot call right now. Typing takes the same 10 minutes.');
      }
    } catch {
      setNote('We cannot call right now. Typing takes the same 10 minutes.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (phase !== 'calling') return undefined;
    if (!callStarted.current) callStarted.current = Date.now();
    const t = window.setInterval(() => {
      if (Date.now() - callStarted.current > POLL_LIMIT_MS) {
        window.clearInterval(t);
        setNote('We have not heard back from the call. You can type it instead.');
        return;
      }
      getIntakeStatus(token)
        .then((s) => {
          setStatus(s);
          if (s.interviewed) setPhase('done');
          else if (s.call === 'ended') setNote('The call ended before we could talk. You can type it instead.');
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [phase, token]);

  const submitTurn = (e: React.FormEvent): void => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    void send([...turns, { role: 'user', text }]);
  };

  if (phase === 'loading') {
    return <p className="cbv2-dpi__wait">Loading your interview…</p>;
  }
  if (phase === 'missing') {
    return (
      <p className="cbv2-dpi__wait">
        We could not find that interview. Email <a href="mailto:info@colaberry.com">info@colaberry.com</a> and we
        will pick it up.
      </p>
    );
  }

  const perYear = hoursPerYear(status?.hoursPerWeek ?? null);

  return (
    <div className="cbv2-dpi" data-testid="demo-pilot-intake">
      {phase !== 'done' ? (
        <div className="cbv2-dpi__save" data-testid="intake-savings">
          {perYear !== null ? (
            <p className="cbv2-dpi__fig">
              <span>You told us this process takes</span>
              <b>{formatHours(perYear)} hours a year</b>
              <span>
                {status?.peopleCount ? `${status.peopleCount} ${status.peopleCount === 1 ? 'person' : 'people'}, ` : ''}
                {status?.hoursPerWeek} hours a week. That is the time a pilot goes after.
              </span>
            </p>
          ) : null}
          <p className="cbv2-dpi__skip">
            <b>10 minutes now replaces our discovery meeting.</b> Our first meeting starts with your pilot options,
            not our questions.
          </p>
        </div>
      ) : null}

      {phase === 'choose' ? (
        <div className="cbv2-dpi__choose">
          {status?.callAvailable ? (
            <button type="button" className="cbv2-btn cbv2-btn--primary" onClick={startCall} disabled={busy}>
              Call me now
            </button>
          ) : null}
          <button
            type="button"
            className={`cbv2-btn ${status?.callAvailable ? 'cbv2-btn--line' : 'cbv2-btn--primary'}`}
            onClick={startTyping}
            disabled={busy}
          >
            {status?.callAvailable ? 'Type it instead' : 'Start the interview'}
          </button>
          <p className="cbv2-dpi__hint">
            {status?.callAvailable
              ? 'The call comes from our AI. It will say so, and it only asks what your form left out.'
              : 'Our AI asks one question at a time, and only what your form left out.'}
          </p>
        </div>
      ) : null}

      {phase === 'calling' ? (
        <div className="cbv2-dpi__calling" role="status">
          <p>
            <b>Calling you now{phone ? ` at ${phone}` : ''}.</b> Pick up: it is the AI from Colaberry.
          </p>
          <p className="cbv2-dpi__hint">
            {status?.call === 'writing_up' ? 'The call is done. Writing it up now.' : 'This page updates when the call ends.'}
          </p>
          <button type="button" className="cbv2-btn cbv2-btn--line" onClick={startTyping}>
            Type it instead
          </button>
        </div>
      ) : null}

      {phase === 'chat' ? (
        <div className="cbv2-dpi__chat">
          <ol className="cbv2-dpi__log" aria-live="polite" data-testid="intake-chat-log">
            {turns.map((t, i) => (
              <li key={i} className={`cbv2-dpi__turn cbv2-dpi__turn--${t.role}`}>
                <span className="cbv2-sr-only">{t.role === 'assistant' ? 'Colaberry AI:' : 'You:'}</span>
                {t.text}
              </li>
            ))}
            {busy ? <li className="cbv2-dpi__turn cbv2-dpi__turn--assistant cbv2-dpi__typing">…</li> : null}
          </ol>
          <form className="cbv2-dpi__reply" onSubmit={submitTurn}>
            <label htmlFor="dpi-reply" className="cbv2-sr-only">
              Your answer
            </label>
            <textarea
              id="dpi-reply"
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
            />
            <button type="submit" className="cbv2-btn cbv2-btn--primary" disabled={busy || !draft.trim()}>
              Send
            </button>
          </form>
        </div>
      ) : null}

      {note ? (
        <p className="cbv2-field5__err" role="alert">
          {note}
        </p>
      ) : null}

      {phase === 'done' ? (
        <div className="cbv2-dpi__done" data-testid="intake-done">
          <p className="cbv2-dpi__skip">
            <b>Thank you. We have what we need.</b>
          </p>
          <ol className="cbv2-next5">
            <li>
              <b aria-hidden="true">1</b>
              <p>
                <strong>We research {status?.company || 'your company'}</strong>
                <span>Your site, your systems and the process you described.</span>
              </p>
            </li>
            <li>
              <b aria-hidden="true">2</b>
              <p>
                <strong>We draft options for your pilot</strong>
                <span>From what you told us, before anyone meets.</span>
              </p>
            </li>
            <li>
              <b aria-hidden="true">3</b>
              <p>
                <strong>Someone from Colaberry emails you</strong>
                <span>To set up a first meeting that starts with your options.</span>
              </p>
            </li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}

export default DemoPilotIntake;
