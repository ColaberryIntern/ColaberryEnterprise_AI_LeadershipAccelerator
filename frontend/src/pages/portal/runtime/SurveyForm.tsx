import React, { useEffect, useState } from 'react';
import { runtimeApi, SurveyView } from './runtimeApi';

/**
 * SurveyForm — the interactive weekly-feedback survey in the Runtime workspace
 * (render_band === 'survey'). Each generated question is a 1–5 agreement scale
 * (Strongly disagree → Strongly agree) with an optional comment, plus one open
 * prompt. Loads any prior answers to prefill, and stores answers to the server
 * (idempotent per student). "Save & mark complete" persists then completes.
 */

const SCALE = [1, 2, 3, 4, 5];
const SCALE_ENDS = ['Strongly disagree', 'Strongly agree'];

interface Props {
  cardId: string;
  completed: boolean;
  busy: boolean;
  onSubmit: () => Promise<void> | void;   // parent's complete() — runs AFTER answers save
}

const SurveyForm: React.FC<Props> = ({ cardId, completed, busy, onSubmit }) => {
  const [view, setView] = useState<SurveyView | null>(null);
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [open, setOpen] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    runtimeApi.survey(cardId).then((v) => {
      if (!alive) return;
      setView(v);
      // Prefill from any saved answers (by index, aligned to the current questions).
      if (v.answers) {
        const r: Record<number, number> = {}; const c: Record<number, string> = {};
        v.answers.items.forEach((it, i) => { if (it.rating != null) r[i] = it.rating; if (it.comment) c[i] = it.comment; });
        setRatings(r); setComments(c); setOpen(v.answers.open || '');
      }
    }).catch(() => { if (alive) setError('Couldn’t load the survey.'); });
    return () => { alive = false; };
  }, [cardId]);

  const answeredCount = Object.keys(ratings).length + (open.trim() ? 1 : 0);

  const save = async () => {
    if (!view || saving || busy) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const items = view.questions.map((_, i) => ({ index: i, rating: ratings[i] ?? null, comment: comments[i] || null }));
      await runtimeApi.saveSurvey(cardId, { items, open: open.trim() || null });
      setSaved(true);
      await onSubmit();   // mark the card complete
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Couldn’t save your answers — try again.');
    } finally {
      setSaving(false);
    }
  };

  if (error && !view) return <div className="rt-card"><p className="rt-muted">{error}</p></div>;
  if (!view) return <div className="rt-card"><p className="rt-muted">Loading the survey…</p></div>;
  if (view.questions.length === 0) {
    return <div className="rt-card"><p className="rt-muted">This week’s survey is being prepared — check back shortly.</p></div>;
  }

  return (
    <div className="sv">
      <div className="rt-lab">Weekly feedback · {view.questions.length} quick questions</div>
      <p className="rt-muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
        Rate each statement from <b>1 (strongly disagree)</b> to <b>5 (strongly agree)</b>. Your answers are saved and help us shape next week.
      </p>

      {view.questions.map((q, i) => (
        <div key={i} className="sv-q">
          <div className="sv-qtext">{i + 1}. {q}</div>
          <div className="sv-scale" role="radiogroup" aria-label={q}>
            <span className="sv-end">{SCALE_ENDS[0]}</span>
            {SCALE.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={ratings[i] === n}
                aria-label={`${n} out of 5`}
                className={`sv-dot${ratings[i] === n ? ' on' : ''}`}
                disabled={completed}
                onClick={() => setRatings((m) => ({ ...m, [i]: n }))}
              >{n}</button>
            ))}
            <span className="sv-end">{SCALE_ENDS[1]}</span>
          </div>
          <input
            className="rt-in sv-comment"
            placeholder="Add a comment (optional)"
            value={comments[i] || ''}
            disabled={completed}
            onChange={(e) => setComments((m) => ({ ...m, [i]: e.target.value }))}
          />
        </div>
      ))}

      <div className="rt-lab" style={{ marginTop: 16 }}>{view.open_prompt || 'Anything else you’d like us to know?'}</div>
      <textarea
        className="rt-in"
        style={{ minHeight: 90 }}
        placeholder="Your answer (optional)…"
        value={open}
        disabled={completed}
        onChange={(e) => setOpen(e.target.value)}
      />

      {error && <p className="sv-err">{error}</p>}
      <div className="sv-actions">
        {completed
          ? <span className="rt-pill done">✓ Submitted — thank you for your feedback</span>
          : <>
              <button className="rt-btn cta" disabled={saving || busy || answeredCount === 0} onClick={save}>
                {saving ? 'Saving…' : 'Save & mark complete'}
              </button>
              {saved && <span className="rt-muted" style={{ fontSize: 12.5 }}>Saved.</span>}
              {answeredCount === 0 && <span className="rt-muted" style={{ fontSize: 12.5 }}>Answer at least one question.</span>}
            </>}
      </div>

      <style>{`
        .sv-q{padding:14px 0;border-bottom:1px solid var(--line-soft)}
        .sv-qtext{font-weight:600;font-size:14px;margin-bottom:10px;color:var(--ink)}
        .sv-scale{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
        .sv-end{font-size:11px;color:var(--muted2);white-space:nowrap}
        .sv-dot{width:38px;height:38px;border-radius:50%;border:1.5px solid var(--line);background:var(--paper);color:var(--muted);font-weight:700;font-size:14px;cursor:pointer;transition:.14s}
        .sv-dot:hover:not(:disabled){border-color:var(--berry);color:var(--berry)}
        .sv-dot.on{background:var(--berry);border-color:var(--berry);color:#fff}
        .sv-dot:disabled{cursor:default;opacity:.9}
        .sv-comment{margin-top:2px}
        .sv-actions{display:flex;align-items:center;gap:12px;margin-top:16px}
        .sv-err{color:var(--cherry-deep,#a4161a);font-size:13px;margin:10px 0 0}
      `}</style>
    </div>
  );
};

export default SurveyForm;
