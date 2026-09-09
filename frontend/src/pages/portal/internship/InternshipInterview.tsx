import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

  const answered = view ? view.progress.resolved : 0;
  const total = view ? view.progress.total : 0;

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

  const askForCall = useCallback(async () => {
    setBusy(true);
    setCallNote(null);
    try {
      const res = await requestInternshipCall();
      setCallNote(res.placed
        ? 'Calling you now — answer when it rings. You can finish here if the call drops.'
        : res.message);
      if (res.placed) await load();
    } catch {
      setCallNote('We could not place the call. You can answer the questions here instead.');
    } finally {
      setBusy(false);
    }
  }, [load]);

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

        {error && <div className="ip-alert" role="alert">{error}</div>}

        {question ? (
          <div className="ip-q">
            <p className="ip-q__section">{question.section_title}</p>
            <label className="ip-q__prompt" htmlFor="ip-answer">{question.prompt}</label>

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
                {busy ? 'Saving…' : 'Save and continue'}
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
    </>
  );
};

export default InternshipInterview;
