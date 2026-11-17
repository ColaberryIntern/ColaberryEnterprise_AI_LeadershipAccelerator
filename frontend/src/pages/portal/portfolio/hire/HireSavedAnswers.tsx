import React, { useCallback, useEffect, useState } from 'react';
import { deleteAnswerApi, fetchSavedAnswersApi, setShowPublicApi, type SavedAnswer } from '../../../../components/careerPrep/careerPrepApi';

/**
 * Career Prep R1.1: "Saved practice answers" in the Hire studio's Video section. The Try answers a student chose to
 * keep in the Career Prep room (an unchecked box they ticked), each playable and deletable (Delete asks first).
 * R1.2 (Ali, Q1: A): each one has a SECOND opt-in, "Show on my public profile", unchecked by default. Only a
 * switched-on answer reaches the public hire profile, and only while that profile is public; employers see the
 * question and the video, never the score. Career Prep off, or the list unreadable: the section is not drawn at all.
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
  const showPublic = async (id: string, on: boolean) => {
    setBusy(id); setProblem(null);
    try {
      const got = await setShowPublicApi(id, on);
      setAnswers((a) => (a ?? []).map((x) => (x.attemptId === id ? { ...x, showPublic: got?.showPublic === true } : x)));
    } catch { setProblem(on ? 'Could not show that answer on your profile. Try again.' : 'Could not hide that answer. Try again.'); } finally { setBusy(null); }
  };
  const anyPublic = answers.some((a) => a.showPublic === true);

  return (
    <section className="cp-card hs-saved" aria-labelledby="hs-saved-h" data-testid="hs-saved">
      <div className="hs-vhead">
        <h3 className="cp-card-h" id="hs-saved-h">Saved practice answers</h3>
        <span className="hs-vstatus" data-testid="hs-saved-status">{anyPublic ? 'Some are on your public profile' : 'Only you can see these'}</span>
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
            <label className="hs-saved-public">
              <input type="checkbox" checked={a.showPublic === true} disabled={busy === a.attemptId}
                onChange={(e) => void showPublic(a.attemptId, e.target.checked)} data-testid="hs-saved-public" />
              <span>Show on my public profile</span>
            </label>
            <p className="cp-muted hs-saved-note">Employers see the question and the video, never your score. Shown only while your profile is public.</p>
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
