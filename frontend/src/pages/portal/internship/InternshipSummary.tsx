import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SummaryLineView,
  SummaryView,
  confirmInterviewSummary,
  fetchInterviewSummary,
  saveInterviewAnswers,
  submitInternshipApplication,
} from '../../../services/internshipApi';

/**
 * Review, correct, confirm, submit.
 *
 * ── WHY THIS SCREEN IS LOAD-BEARING AND NOT A COURTESY ─────────────────────
 *
 * Transcript extraction never writes a confident answer. Everything captured from
 * a phone call lands as `needs_followup`, and it is the applicant's confirmation
 * here that promotes it. So this screen is the only thing standing between a
 * model's reading of a phone call and a reviewer treating it as the applicant's
 * own words.
 *
 * That is why the answers are shown VERBATIM. Paraphrasing them would be asking
 * someone to approve our interpretation of what they said, which is not the same
 * as approving what they said.
 *
 * ── AND WHY "CONFIRM" IS A SEPARATE ACT FROM "SUBMIT" ──────────────────────
 *
 * Confirming says "yes, that is what I told you". Submitting says "hand this to a
 * reviewer". Collapsing them would mean a single click both endorsed the
 * extraction and gave up the chance to fix it.
 */

interface Props {
  onSubmitted?: () => void;
  onEditRequested?: () => void;
}

const InternshipSummary: React.FC<Props> = ({ onSubmitted, onEditRequested }) => {
  const [view, setView] = useState<SummaryView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const load = useCallback(async () => {
    try {
      setView(await fetchInterviewSummary());
    } catch {
      setError('We could not load your summary. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** Group by section so the review reads like the interview did. */
  const sections = useMemo(() => {
    const out: Array<{ title: string; lines: SummaryLineView[] }> = [];
    for (const line of view?.lines ?? []) {
      const last = out[out.length - 1];
      if (last && last.title === line.section_title) last.lines.push(line);
      else out.push({ title: line.section_title, lines: [line] });
    }
    return out;
  }, [view]);

  const needsConfirmation = view?.needs_confirmation ?? [];

  const startEdit = (line: SummaryLineView) => {
    setEditing(line.question_key);
    // Yes/no and choice answers are corrected in the interview itself, where the
    // right control exists. Free text is editable in place, which is where the
    // transcription errors actually are.
    setEditText(line.answer_display === '(skipped)' ? '' : line.answer_display);
  };

  const saveEdit = useCallback(async (line: SummaryLineView) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveInterviewAnswers([{
        question_key: line.question_key,
        answer_text: editText.trim(),
        state: 'answered',
      }], true);
      setEditing(null);
      await load();
    } catch {
      setError('We could not save that correction. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, editText, load]);

  const confirmAll = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await confirmInterviewSummary();
      await load();
    } catch {
      setError('We could not confirm your answers. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [load]);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await submitInternshipApplication();
      onSubmitted?.();
    } catch {
      setError('We could not submit your application. Check for anything still unanswered.');
      await load();
    } finally {
      setBusy(false);
    }
  }, [load, onSubmitted]);

  if (loading) return <p className="ip-muted">Loading your summary…</p>;
  if (!view) return <p className="ip-muted">{error ?? 'Summary unavailable.'}</p>;

  const unanswered = view.lines.filter((l) => l.state === 'not_asked');
  const canSubmit = view.progress.complete && needsConfirmation.length === 0;

  return (
    <section className="ip-card" aria-labelledby="ip-sum">
      <h2 id="ip-sum">Check your answers</h2>
      <p className="ip-muted ip-sub">
        This is exactly what you told us, in your own words. Fix anything that is not right —
        nothing goes to a reviewer until you submit.
      </p>

      {error && <div className="ip-alert" role="alert">{error}</div>}

      {needsConfirmation.length > 0 && (
        <div className="ip-confirm" role="status">
          <p>
            <strong>{needsConfirmation.length} answer{needsConfirmation.length === 1 ? '' : 's'} came from your phone call.</strong>{' '}
            Read them over. If we wrote something down wrong, correct it — then confirm.
          </p>
          <button type="button" className="te-btn berry" onClick={confirmAll} disabled={busy}>
            {busy ? 'Confirming…' : 'These are right — confirm'}
          </button>
        </div>
      )}

      {sections.map((section) => (
        <div key={section.title} className="ip-sumsec">
          <h3>{section.title}</h3>
          {section.lines.map((line) => (
            <div
              key={line.question_key}
              className={`ip-sumline${line.state === 'needs_followup' ? ' is-unconfirmed' : ''}`}
            >
              <p className="ip-sumline__q">{line.question}</p>

              {editing === line.question_key ? (
                <div className="ip-sumline__edit">
                  <textarea
                    rows={4}
                    maxLength={8000}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    aria-label={`Correct your answer to: ${line.question}`}
                  />
                  <div className="ip-actions">
                    <button
                      type="button"
                      className="te-btn berry sm"
                      onClick={() => saveEdit(line)}
                      disabled={busy || !editText.trim()}
                    >Save correction</button>
                    <button type="button" className="ip-skip" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="ip-sumline__a">
                    {line.answer_display || <em className="ip-muted">Not answered yet</em>}
                  </p>
                  <div className="ip-sumline__meta">
                    {line.answered_via && (
                      <span className="ip-tag">
                        {line.answered_via === 'phone' ? 'From your call' : 'Answered online'}
                      </span>
                    )}
                    {line.state === 'needs_followup' && (
                      <span className="ip-tag ip-tag--warn">Needs your confirmation</span>
                    )}
                    {/* Free text only: a yes/no is corrected in the interview,
                        where the right control lives. */}
                    {line.state !== 'not_asked' && !line.is_confirmation && (
                      <button type="button" className="ip-editlink" onClick={() => startEdit(line)}>
                        Change this
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ))}

      {unanswered.length > 0 && (
        <p className="ip-muted ip-note">
          {unanswered.length} question{unanswered.length === 1 ? ' is' : 's are'} still unanswered.{' '}
          <button type="button" className="ip-editlink" onClick={() => onEditRequested?.()}>
            Go back to the interview
          </button>
        </p>
      )}

      <div className="ip-actions ip-actions--submit">
        <button type="button" className="te-btn berry" onClick={submit} disabled={busy || !canSubmit}>
          {busy ? 'Submitting…' : 'Submit my application'}
        </button>
        {!canSubmit && (
          <span className="ip-muted">
            {needsConfirmation.length > 0
              ? 'Confirm your call answers first.'
              : 'Answer everything first.'}
          </span>
        )}
      </div>
    </section>
  );
};

export default InternshipSummary;
