import React, { useCallback, useEffect, useRef, useState } from 'react';
import { InterviewTurn, IntakeStatus, getIntakeStatus, interviewTurn, requestCall } from '../../../services/enterpriseIntakeApi';

/**
 * InterviewRunner - the 10-minute AI interview itself, by phone or typed (W28, moved here in v2
 * unchanged in behavior so DemoPilotIntake can sequence plan, meeting and interview).
 */
type Phase = 'choose' | 'calling' | 'chat';

const POLL_MS = 5000;
/** Stop polling a call after this long; the page offers typing instead. */
const POLL_LIMIT_MS = 20 * 60 * 1000;

export interface InterviewRunnerProps {
  token: string;
  status: IntakeStatus;
  /** The number they gave, to say back while we call. Absent after a reload. */
  phone?: string;
  onDone: () => void;
}

export function InterviewRunner({ token, status: initial, phone, onDone }: InterviewRunnerProps): React.ReactElement {
  const [status, setStatus] = useState<IntakeStatus>(initial);
  const [phase, setPhase] = useState<Phase>(initial.call === 'in_progress' || initial.call === 'writing_up' ? 'calling' : 'choose');
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const callStarted = useRef(0);

  const send = useCallback(
    async (next: InterviewTurn[]): Promise<void> => {
      setBusy(true);
      setNote('');
      try {
        const r = await interviewTurn(token, next);
        setTurns([...next, { role: 'assistant', text: r.message }]);
        if (r.done) onDone();
      } catch {
        setNote('That did not go through. Please try again.');
      } finally {
        setBusy(false);
      }
    },
    [token, onDone],
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
          if (s.interviewed) onDone();
          else if (s.call === 'ended') setNote('The call ended before we could talk. You can type it instead.');
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [phase, token, onDone]);

  const submitTurn = (e: React.FormEvent): void => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    void send([...turns, { role: 'user', text }]);
  };

  return (
    <section className="cbv2-dpi__card" aria-labelledby="dpi-int-title" data-testid="interview-runner">
      <h2 id="dpi-int-title" className="cbv2-dpi__h">Your 10-minute AI interview</h2>

      {phase === 'choose' ? (
        <div className="cbv2-dpi__choose">
          {status.callAvailable ? (
            <button type="button" className="cbv2-btn cbv2-btn--primary" onClick={startCall} disabled={busy}>
              Call me now
            </button>
          ) : null}
          <button type="button" className={`cbv2-btn ${status.callAvailable ? 'cbv2-btn--line' : 'cbv2-btn--primary'}`} onClick={startTyping} disabled={busy}>
            {status.callAvailable ? 'Type it instead' : 'Start the interview'}
          </button>
          <p className="cbv2-dpi__hint">
            {status.callAvailable
              ? 'The call comes from our AI. It will say so, and it only asks what your form and files left out.'
              : 'Our AI asks one question at a time, and only what your form and files left out.'}
          </p>
        </div>
      ) : null}

      {phase === 'calling' ? (
        <div className="cbv2-dpi__calling" role="status">
          <p>
            <b>Calling you now{phone ? ` at ${phone}` : ''}.</b> Pick up: it is the AI from Colaberry.
          </p>
          <p className="cbv2-dpi__hint">{status.call === 'writing_up' ? 'The call is done. Writing it up now.' : 'This page updates when the call ends.'}</p>
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
            <textarea id="dpi-reply" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy} />
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
    </section>
  );
}

export default InterviewRunner;
