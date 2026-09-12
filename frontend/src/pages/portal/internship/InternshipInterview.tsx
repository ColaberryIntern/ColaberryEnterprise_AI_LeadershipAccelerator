import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnswerPayload,
  InterviewQuestionView,
  InterviewView,
  cancelInternshipCall,
  fetchInterview,
  requestInternshipCall,
  saveInterviewAnswers,
  scheduleInternshipCall,
} from '../../../services/internshipApi';

/**
 * The phone call is a blocking, self-advancing moment.
 *
 * 'placing'  — the request is in flight.
 * 'on_call'  — a call is live; the server still reports live_call. This covers both
 *              the conversation itself and the short wrap while the transcript is
 *              reconciled, because the session stays in_progress until then.
 * 'complete' — the call ended and every question is answered; hands off to summary.
 * 'partial'  — the call ended having answered some; the rest continue on screen.
 * 'none'     — the call ended with nothing captured (or never connected).
 */
type CallPhase = 'idle' | 'placing' | 'on_call' | 'complete' | 'partial' | 'none';
const POLL_MS = 5000;

/**
 * The interview, both channels, on one screen.
 *
 * ── WHY BOTH CHANNELS LIVE TOGETHER ────────────────────────────────────────
 *
 * The contract requires an applicant to switch channels mid-interview without
 * repeating anything. Making the phone option a separate page you commit to would
 * fight that: the natural failure ("the call dropped, now what?") becomes a
 * navigation problem. Here the call panel sits beside the questions, so
 * "continue remaining questions online" is always one click, and the question
 * list re-fetches after a call because the server recomputes what is left.
 *
 * ── ONE QUESTION AT A TIME, BUT THE WHOLE LIST IN HAND ─────────────────────
 *
 * "Use one question or small logical group at a time." The server hands over the
 * full remaining list, so the section heading and an honest "6 of 21" render
 * without a round trip per answer — but only one question is ever on screen.
 *
 * ── AUTOSAVE MEANS AUTOSAVE ────────────────────────────────────────────────
 *
 * Every answer is saved when the applicant moves on, not at the end. A 21-question
 * interview that loses everything on a closed tab is one nobody finishes twice.
 */

type Draft = { text: string; value: boolean | string | null };

const emptyDraft = (): Draft => ({ text: '', value: null });

interface Props {
  onProgressed?: () => void;
  /** Called when the interview finishes, so the page can move to the summary. */
  onComplete?: () => void;
}

const InternshipInterview: React.FC<Props> = ({ onProgressed, onComplete }) => {
  const [view, setView] = useState<InterviewView | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callNote, setCallNote] = useState<string | null>(null);
  const [when, setWhen] = useState('');

  // The blocking call overlay and the poll that drives it.
  const [callPhase, setCallPhase] = useState<CallPhase>('idle');
  const [captured, setCaptured] = useState(0);
  const resolvedAtStart = useRef(0);
  const capturedAtStart = useRef(0);
  const pollTimer = useRef<number | null>(null);
  const polling = useRef(false);

  const stopPolling = useCallback(() => {
    polling.current = false;
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  // Stop polling if the component goes away mid-call.
  useEffect(() => stopPolling, [stopPolling]);

  const load = useCallback(async () => {
    try {
      const v = await fetchInterview();
      setView(v);
      setIndex(0);
      setDraft(emptyDraft());
      if (v.progress.complete) onComplete?.();
    } catch {
      setError('We could not load your interview. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [onComplete]);

  useEffect(() => { void load(); }, [load]);

  const question: InterviewQuestionView | null = useMemo(
    () => view?.questions?.[index] ?? null,
    [view, index],
  );

  // Pre-fill the draft with what the call captured for this question, so the
  // applicant confirms or edits it rather than re-typing. Keyed on the question so
  // it re-seeds each time the shown question changes.
  useEffect(() => {
    const cap = question?.captured;
    if (cap && (cap.answer_text != null || cap.answer_value != null)) {
      setDraft({ text: cap.answer_text ?? '', value: cap.answer_value ?? null });
    } else {
      setDraft(emptyDraft());
    }
  }, [question?.question_key]); // eslint-disable-line react-hooks/exhaustive-deps

  const answered = view ? view.progress.resolved : 0;
  const total = view ? view.progress.total : 0;
  const capturedPending = view ? view.progress.captured_pending : 0;

  /** Is the current draft a submittable answer for this question type? */
  const draftIsValid = useMemo(() => {
    if (!question) return false;
    if (question.answer_type === 'yes_no') return typeof draft.value === 'boolean';
    if (question.answer_type === 'choice') return typeof draft.value === 'string' && draft.value.length > 0;
    return draft.text.trim().length > 0;
  }, [question, draft]);

  const submitAnswer = useCallback(async (skip = false) => {
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload: AnswerPayload = skip
        ? { question_key: question.question_key, state: 'skipped' }
        : {
          question_key: question.question_key,
          answer_text: question.answer_type === 'yes_no' || question.answer_type === 'choice'
            ? null
            : draft.text.trim(),
          answer_value: question.answer_type === 'yes_no' || question.answer_type === 'choice'
            ? draft.value
            : null,
          state: 'answered',
        };

      const res = await saveInterviewAnswers([payload]);
      onProgressed?.();

      if (res.progress.complete) { onComplete?.(); await load(); return; }

      // Advance locally rather than re-fetching per answer: the server already
      // told us what remains, and a full reload between every question would make
      // a 21-question interview feel like 21 page loads.
      const nextIndex = index + 1;
      if (nextIndex < (view?.questions.length ?? 0)) {
        setIndex(nextIndex);
        setDraft(emptyDraft());
      } else {
        await load();
      }
    } catch {
      setError('We could not save that answer. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [question, busy, draft, index, view, load, onProgressed, onComplete]);

  // Resolve the overlay once a placed call has left the live state. Called from the
  // poll and from the initial placement (a call can fail fast, before the first poll).
  const settleEndedCall = useCallback((v: InterviewView) => {
    setView(v);
    if (v.progress.complete) {
      setCallPhase('complete');
      // Let the acknowledgement land, then hand off to review-and-submit.
      window.setTimeout(() => onComplete?.(), 1600);
      return;
    }
    // A phone call's answers land as `needs_followup` (captured, not yet
    // confirmed), so `resolved` barely moves — the real signal that the call did
    // something is the jump in captured_pending. Count both.
    const got = Math.max(
      0,
      (v.progress.resolved - resolvedAtStart.current) + (v.progress.captured_pending - capturedAtStart.current),
    );
    if (got > 0) {
      setCaptured(got);
      setIndex(0);
      setDraft(emptyDraft());
      setCallPhase('partial');
      return;
    }
    setCallPhase('none');
  }, [onComplete]);

  const pollCall = useCallback(async () => {
    if (!polling.current) return;
    let v: InterviewView | null = null;
    try { v = await fetchInterview(); } catch { /* transient — keep polling */ }
    if (!polling.current) return;
    if (v && !v.live_call) {
      stopPolling();
      settleEndedCall(v);
      return;
    }
    if (v) setView(v);
    pollTimer.current = window.setTimeout(() => { void pollCall(); }, POLL_MS);
  }, [settleEndedCall, stopPolling]);

  const askForCall = useCallback(async () => {
    setCallNote(null);
    setCallPhase('placing');
    try {
      const res = await requestInternshipCall();
      if (!res.placed) {
        setCallPhase('idle');
        setCallNote(res.message);
        return;
      }
      const v = await fetchInterview();
      resolvedAtStart.current = v.progress.resolved;
      capturedAtStart.current = v.progress.captured_pending;
      if (!v.live_call) {
        // Placed but already terminal (a fast no-answer/fail). Settle immediately.
        settleEndedCall(v);
        return;
      }
      setView(v);
      setCallPhase('on_call');
      polling.current = true;
      pollTimer.current = window.setTimeout(() => { void pollCall(); }, POLL_MS);
    } catch {
      setCallPhase('idle');
      setCallNote('We could not place the call. You can answer the questions here instead.');
    }
  }, [pollCall, settleEndedCall]);

  // The always-available escape from the overlay: stop waiting and answer on screen.
  const leaveCall = useCallback(() => {
    stopPolling();
    setCallPhase('idle');
    void load();
  }, [stopPolling, load]);

  const bookCall = useCallback(async () => {
    if (!when) return;
    setBusy(true);
    setCallNote(null);
    try {
      // datetime-local gives a wall-clock string with no zone. new Date() reads it
      // in the browser's zone, which is what the applicant meant, and toISOString
      // converts it once. (Sending the raw string would let the server read it as UTC.)
      await scheduleInternshipCall(new Date(when).toISOString());
      setCallNote('Booked. We will call you then, and you can move it any time.');
      await load();
    } catch {
      setCallNote('We could not book that time. Try another.');
    } finally {
      setBusy(false);
    }
  }, [when, load]);

  const dropCall = useCallback(async () => {
    setBusy(true);
    try {
      await cancelInternshipCall();
      setCallNote('Call cancelled. You can book another time or answer here.');
      await load();
    } catch {
      setCallNote('We could not cancel that. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [load]);

  if (loading) return <p className="ip-muted">Loading your interview…</p>;
  if (!view) return <p className="ip-muted">{error ?? 'Interview unavailable.'}</p>;

  return (
    <>
      <section className="ip-card" aria-labelledby="ip-iv">
        <h2 id="ip-iv">Your interview</h2>

        <div className="ip-progress" role="group" aria-label="Interview progress">
          <div className="ip-progress__bar">
            <div
              className="ip-progress__fill"
              style={{ width: `${total ? Math.round((answered / total) * 100) : 0}%` }}
            />
          </div>
          {/* Text, not just a bar — a bar alone tells a screen-reader user nothing. */}
          <p className="ip-muted" aria-live="polite">
            {view.progress.complete
              ? 'All questions answered.'
              : `Question ${answered + 1} of ${total}`}
          </p>
        </div>

        {/* After a phone call, the captured answers arrive as needs_followup and are
            pre-filled below. Say so, or "Question 1 of 21" reads as nothing done. */}
        {capturedPending > 0 && !view.progress.complete && (
          <div className="ip-captured-banner" role="status">
            <strong>{capturedPending} {capturedPending === 1 ? 'answer' : 'answers'} from your call</strong> are
            ready below, pre-filled with what we heard. Confirm each one — edit anything that isn’t right —
            and answer what the call didn’t cover.
          </div>
        )}

        {error && <div className="ip-alert" role="alert">{error}</div>}

        {question ? (
          <div className="ip-q">
            <p className="ip-q__section">{question.section_title}</p>
            <label className="ip-q__prompt" htmlFor="ip-answer">{question.prompt}</label>
            {question.captured && (
              <p className="ip-q__fromcall">
                From your call — confirm or edit, then save.
              </p>
            )}

            {question.answer_type === 'yes_no' && (
              <div className="ip-q__yesno" role="group" aria-label={question.prompt}>
                <button
                  type="button"
                  className={`ip-toggle${draft.value === true ? ' is-on' : ''}`}
                  aria-pressed={draft.value === true}
                  onClick={() => setDraft({ text: '', value: true })}
                >Yes</button>
                <button
                  type="button"
                  className={`ip-toggle${draft.value === false ? ' is-on' : ''}`}
                  aria-pressed={draft.value === false}
                  onClick={() => setDraft({ text: '', value: false })}
                >No</button>
              </div>
            )}

            {question.answer_type === 'choice' && (
              <select
                id="ip-answer"
                className="ip-q__select"
                value={typeof draft.value === 'string' ? draft.value : ''}
                onChange={(e) => setDraft({ text: '', value: e.target.value })}
              >
                <option value="">Select…</option>
                {(question.options ?? []).map((o) => (
                  <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
                ))}
              </select>
            )}

            {(question.answer_type === 'text' || question.answer_type === 'long_text') && (
              <textarea
                id="ip-answer"
                className="ip-q__text"
                rows={question.answer_type === 'long_text' ? 5 : 2}
                maxLength={8000}
                value={draft.text}
                onChange={(e) => setDraft({ text: e.target.value, value: null })}
                placeholder="Your answer"
              />
            )}

            <div className="ip-actions">
              <button
                type="button"
                className="te-btn berry"
                onClick={() => submitAnswer(false)}
                disabled={busy || !draftIsValid}
              >
                {busy ? 'Saving…' : question.captured ? 'Confirm and continue' : 'Save and continue'}
              </button>
              {/* Skipping is allowed and honest: a skipped question comes back
                  round rather than being silently treated as answered. */}
              {!question.required && (
                <button type="button" className="ip-skip" onClick={() => submitAnswer(true)} disabled={busy}>
                  Skip this one
                </button>
              )}
            </div>
            <p className="ip-muted ip-q__saved">Your answers save as you go. You can stop and come back.</p>
          </div>
        ) : (
          <p className="ip-muted">
            Every question is answered. Review your summary and submit when you are ready.
          </p>
        )}
      </section>

      {/* The call panel. Deliberately beside the questions, not on another page. */}
      <section className="ip-card" aria-labelledby="ip-call">
        <h2 id="ip-call">Prefer to talk?</h2>
        <p className="ip-muted ip-sub">
          Our AI interviewer can call you and ask whatever is left. It counts exactly the same as
          answering here, and anything you have already answered will not be asked again.
        </p>

        {view.scheduled_call ? (
          <div className="ip-booked">
            <p>
              <strong>Call booked</strong> for{' '}
              {new Date(view.scheduled_call.scheduled_for).toLocaleString()}
            </p>
            <div className="ip-actions">
              <button type="button" className="te-btn ghost sm" onClick={dropCall} disabled={busy}>
                Cancel the call
              </button>
            </div>
          </div>
        ) : (
          <div className="ip-callrow">
            <button type="button" className="te-btn berry" onClick={askForCall} disabled={busy}>
              Have AI Call Me now
            </button>
            <span className="ip-muted ip-or">or</span>
            <label className="ip-field ip-field--inline">
              <span>Book a time</span>
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </label>
            <button type="button" className="te-btn ghost sm" onClick={bookCall} disabled={busy || !when}>
              Book it
            </button>
          </div>
        )}

        {callNote && <p className="ip-muted ip-note" role="status">{callNote}</p>}

        <p className="ip-warn ip-warn--sm">
          The interviewer will never ask for your password or API key. If anything ever does, it is
          not us — stop and tell us.
        </p>
      </section>

      {/* The call takes over the screen so the applicant talks instead of typing,
          and the page moves itself on the moment the call reconciles. Never a hard
          trap: every waiting state offers a way back to answering online. */}
      {callPhase !== 'idle' && (
        <div className="ip-callover" role="dialog" aria-modal="true" aria-live="assertive">
          <div className="ip-callover__card">
            {(callPhase === 'placing' || callPhase === 'on_call') && (
              <>
                <div className="ip-callpulse" aria-hidden="true"><span /><span /><span /></div>
                <h3>{callPhase === 'placing' ? 'Calling you now' : 'You’re on the call'}</h3>
                <p>
                  {callPhase === 'placing'
                    ? 'Answer when your phone rings, and keep this page open.'
                    : 'Answer the interviewer out loud — there is nothing to do on this screen. It updates by itself the moment the call ends.'}
                </p>
                <button type="button" className="ip-skip" onClick={leaveCall}>
                  I’d rather answer online
                </button>
              </>
            )}
            {callPhase === 'complete' && (
              <>
                <div className="ip-callmark" aria-hidden="true">✓</div>
                <h3>Interview complete</h3>
                <p>Thank you — we have your answers. Taking you to review and submit…</p>
              </>
            )}
            {callPhase === 'partial' && (
              <>
                <div className="ip-callmark ip-callmark--part" aria-hidden="true">✓</div>
                <h3>Call ended</h3>
                <p>
                  We captured {captured} {captured === 1 ? 'answer' : 'answers'} from your call.
                  Confirm each one below — they’re pre-filled with what we heard — and answer anything we missed.
                </p>
                <button type="button" className="te-btn berry" onClick={() => setCallPhase('idle')}>
                  Review my answers
                </button>
              </>
            )}
            {callPhase === 'none' && (
              <>
                <h3>We couldn’t finish the call</h3>
                <p>Nothing was captured this time. You can try the call again, or answer the questions here.</p>
                <button type="button" className="te-btn berry" onClick={leaveCall}>
                  Answer online
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default InternshipInterview;
