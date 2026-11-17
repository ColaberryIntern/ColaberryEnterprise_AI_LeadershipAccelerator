import React, { useCallback, useEffect, useState } from 'react';
import { deleteAnswerApi, fetchSavedAnswersApi, type SavedAnswer } from '../../../../components/careerPrep/careerPrepApi';

/**
 * Career Prep R1.1: "Saved practice answers" in the Hire studio's Video section. The Try answers a student chose to
 * keep in the Career Prep room (an unchecked box they ticked), each playable and deletable (Delete asks first).
 * ONLY THE STUDENT SEES THESE: they are not on the public hire profile (a second opt-in to show one there is a
 * follow-up). Career Prep off, or the list unreadable: the section is not drawn at all.
 */
const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' });
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export const HireSavedAnswers: React.FC = () => {
  const [answers, setAnswers] = useState<SavedAnswer[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const read = useCallback(() => { fetchSavedAnswersApi().then(setAnswers).catch(() => setAnswers(null)); }, []);
  useEffect(read, [read]);
  if (answers === null) return null;

  const remove = async (id: string) => {
    setBusy(id); setProblem(null);
    try { await deleteAnswerApi(id); setAnswers((a) => (a ?? []).filter((x) => x.attemptId !== id)); setConfirm(null); } catch { setProblem('Could not delete that answer. Try again.'); } finally { setBusy(null); }
  };

  return (
    <section className="cp-card hs-saved" aria-labelledby="hs-saved-h" data-testid="hs-saved">
      <div className="hs-vhead">
        <h3 className="cp-card-h" id="hs-saved-h">Saved practice answers</h3>
        <span className="hs-vstatus">Only you can see these</span>
      </div>
      {problem && <p className="hs-vmsg" role="alert">{problem}</p>}
      {answers.length === 0 ? (
        <p className="cp-muted" data-testid="hs-saved-empty">None yet. In Career Prep, after a Try answer is scored, tick Save this answer to my profile to keep it here.</p>
      ) : (
        <ul className="hs-saved-list">{answers.map((a) => (
          <li key={a.attemptId} className="hs-saved-item" data-testid={`hs-saved-${a.attemptId}`}>
            <div className="hs-vbox">
              <video controls playsInline preload="metadata" poster={a.posterUrl} aria-label={a.question ? `Your answer to: ${a.question}` : 'Your saved practice answer'}>
                <source src={a.streamUrl} type="video/mp4" />
              </video>
            </div>
            <p className="hs-saved-q">{a.question ?? 'A practice answer'}</p>
            <p className="cp-muted hs-saved-meta">Saved {when(a.savedAt)}{a.seconds ? ` · ${clock(a.seconds)}` : ''}{a.delivery !== null ? ` · Delivery ${a.delivery}` : ''}</p>
            <div className="hs-vacts">
              {confirm === a.attemptId ? (
                <>
                  <button type="button" className="cp-btn hs-danger" disabled={busy === a.attemptId} onClick={() => void remove(a.attemptId)} data-testid="hs-saved-delete-confirm">Yes, delete it</button>
                  <button type="button" className="cp-btn" onClick={() => setConfirm(null)}>Keep it</button>
                </>
              ) : <button type="button" className="cp-btn" onClick={() => setConfirm(a.attemptId)} data-testid="hs-saved-delete">Delete</button>}
            </div>
          </li>
        ))}</ul>
      )}
    </section>
  );
};
