import React, { useEffect, useMemo, useState } from 'react';
import { runtimeApi } from '../../pages/portal/runtime/runtimeApi';

/**
 * CardSurveyExperience — the bespoke, self-contained "take the survey live"
 * experience for the Survey curriculum type. Rendered on the right (the card
 * detail drawer) and reused in the full workspace, so both are identical.
 *
 * Fully self-styled (its own <style>, brand colors, light+dark) so it looks the
 * same in every host scope. Live mode fetches the week's questions + any saved
 * answers (prefill) and stores answers on submit — completing the assignment.
 * `preview` (admin Studio/editor) renders the same UI, non-interactive, from the
 * card's already-generated questions.
 */

interface Props {
  cardId: string;
  questions: string[];            // from card.content — preview + fallback
  openPrompt?: string | null;     // card.content.reflection — the open question
  title?: string | null;
  preview?: boolean;              // admin: non-interactive, no fetch/save
  completed?: boolean;            // card already completed
  onComplete?: () => Promise<void> | void;  // mark the card complete after saving
}

const ENDS: [string, string] = ['Strongly disagree', 'Strongly agree'];

const CardSurveyExperience: React.FC<Props> = ({ cardId, questions: initialQs, openPrompt: initialOpenPrompt, title, preview, completed, onComplete }) => {
  const [questions, setQuestions] = useState<string[]>(initialQs || []);
  const [openPrompt, setOpenPrompt] = useState<string | null>(initialOpenPrompt || null);
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [showComment, setShowComment] = useState<Record<number, boolean>>({});
  const [open, setOpen] = useState('');
  const [loading, setLoading] = useState(!preview);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(!!completed);
  const [error, setError] = useState('');

  // Live: load authoritative questions + prefill this student's saved answers.
  useEffect(() => {
    if (preview) { setLoading(false); return; }
    let alive = true;
    runtimeApi.survey(cardId).then((v) => {
      if (!alive) return;
      if (v.questions?.length) setQuestions(v.questions);
      if (v.open_prompt) setOpenPrompt(v.open_prompt);
      if (v.answers) {
        const r: Record<number, number> = {}; const c: Record<number, string> = {}; const sc: Record<number, boolean> = {};
        v.answers.items.forEach((it, i) => { if (it.rating != null) r[i] = it.rating; if (it.comment) { c[i] = it.comment; sc[i] = true; } });
        setRatings(r); setComments(c); setShowComment(sc); setOpen(v.answers.open || '');
      }
      setLoading(false);
    }).catch(() => { if (alive) { setLoading(false); setError('Couldn’t load the survey.'); } });
    return () => { alive = false; };
  }, [cardId, preview]);

  const answered = useMemo(() => Object.keys(ratings).length, [ratings]);
  const total = questions.length;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const canSubmit = !done && (answered > 0 || open.trim().length > 0);

  const submit = async () => {
    if (!canSubmit || saving) return;
    // Preview (admin Studio/editor): fully takeable, but LOCAL — no save, no
    // completion. Lets an author click through exactly how it feels to a student.
    if (preview) { setDone(true); return; }
    setSaving(true); setError('');
    try {
      const items = questions.map((_, i) => ({ index: i, rating: ratings[i] ?? null, comment: comments[i] || null }));
      await runtimeApi.saveSurvey(cardId, { items, open: open.trim() || null });
      if (onComplete) await onComplete();
      setDone(true);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Couldn’t submit — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const styleBlock = (
    <style>{`
      .svx{--svx-accent:#367895;--svx-accent-deep:#2E6A86;--svx-good:#5BA63C;--svx-ink:#1A1A1A;--svx-muted:#6B6B6B;--svx-line:#E4E4E3;--svx-panel:#FFFFFF;--svx-sunken:#F6F7F8;font-family:inherit;color:var(--svx-ink)}
      @media (prefers-color-scheme:dark){.svx{--svx-ink:#FFFFFF;--svx-muted:#B4B4B4;--svx-line:rgba(255,255,255,.14);--svx-panel:#141414;--svx-sunken:#1C1C1C}}
      :root[data-theme="dark"] .svx,.tl-de[data-theme="dark"] .svx{--svx-ink:#FFFFFF;--svx-muted:#B4B4B4;--svx-line:rgba(255,255,255,.14);--svx-panel:#141414;--svx-sunken:#1C1C1C}
      .tl-de[data-theme="light"] .svx,:root[data-theme="light"] .svx{--svx-ink:#1A1A1A;--svx-muted:#6B6B6B;--svx-line:#E4E4E3;--svx-panel:#FFFFFF;--svx-sunken:#F6F7F8}
      .svx-head{margin-bottom:16px}
      .svx-eyebrow{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--svx-accent);margin-bottom:8px}
      .svx-title{font-size:19px;font-weight:700;line-height:1.25;margin:0 0 4px}
      .svx-lead{font-size:13.5px;color:var(--svx-muted);margin:0 0 12px;line-height:1.5}
      .svx-prog{display:flex;align-items:center;gap:10px;margin-bottom:2px}
      .svx-bar{flex:1;height:7px;border-radius:999px;background:var(--svx-sunken);overflow:hidden}
      .svx-bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--svx-accent),var(--svx-good));border-radius:999px;transition:width .35s cubic-bezier(.4,0,.2,1)}
      .svx-count{font-size:12px;font-weight:700;color:var(--svx-muted);white-space:nowrap;font-variant-numeric:tabular-nums}
      .svx-q{padding:16px 0;border-bottom:1px solid var(--svx-line)}
      .svx-qhead{display:flex;gap:10px;margin-bottom:12px}
      .svx-num{flex:none;width:24px;height:24px;border-radius:50%;background:var(--svx-sunken);color:var(--svx-muted);font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}
      .svx-q.answered .svx-num{background:var(--svx-accent);color:#fff}
      .svx-qtext{font-size:14.5px;font-weight:600;line-height:1.4;padding-top:2px}
      .svx-scale{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:0 0 4px}
      .svx-opt{position:relative;aspect-ratio:1;min-height:44px;border-radius:12px;border:1.5px solid var(--svx-line);background:var(--svx-panel);color:var(--svx-muted);font-size:15px;font-weight:700;cursor:pointer;transition:.14s ease;display:flex;align-items:center;justify-content:center}
      .svx-opt:hover:not(:disabled){border-color:var(--svx-accent);color:var(--svx-accent);transform:translateY(-1px)}
      .svx-opt.on{background:var(--svx-accent);border-color:var(--svx-accent);color:#fff;box-shadow:0 4px 12px rgba(54,120,149,.32)}
      .svx-opt:disabled{cursor:default}
      .svx-ends{display:flex;justify-content:space-between;font-size:11px;color:var(--svx-muted);margin-top:2px}
      .svx-ctoggle{margin-top:10px;background:none;border:none;padding:0;color:var(--svx-accent);font-size:12.5px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
      .svx-ctoggle:hover{text-decoration:underline}
      .svx-input{width:100%;margin-top:8px;padding:9px 12px;border:1px solid var(--svx-line);border-radius:10px;font-size:13.5px;font-family:inherit;background:var(--svx-panel);color:var(--svx-ink);box-sizing:border-box}
      .svx-input:focus{outline:none;border-color:var(--svx-accent);box-shadow:0 0 0 3px rgba(54,120,149,.14)}
      .svx-open{padding-top:16px}
      .svx-openlab{font-size:14.5px;font-weight:600;margin-bottom:10px;line-height:1.4}
      .svx-actions{position:sticky;bottom:0;background:var(--svx-panel);padding:14px 0 2px;margin-top:6px}
      .svx-submit{width:100%;padding:13px;border:none;border-radius:12px;background:var(--svx-accent);color:#fff;font-size:15px;font-weight:700;cursor:pointer;transition:.16s ease;display:flex;align-items:center;justify-content:center;gap:8px}
      .svx-submit:hover:not(:disabled){background:var(--svx-accent-deep)}
      .svx-submit:disabled{opacity:.45;cursor:not-allowed}
      .svx-hint{text-align:center;font-size:12px;color:var(--svx-muted);margin-top:8px}
      .svx-err{color:#C20E1E;font-size:13px;margin-top:8px;text-align:center}
      .svx-thanks{text-align:center;padding:36px 20px}
      .svx-check{width:64px;height:64px;border-radius:50%;background:var(--svx-good);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;animation:svxpop .4s cubic-bezier(.2,1.4,.4,1)}
      .svx-check svg{width:34px;height:34px;color:#fff}
      @keyframes svxpop{0%{transform:scale(0)}100%{transform:scale(1)}}
      @media (prefers-reduced-motion:reduce){.svx-check{animation:none}.svx-bar>i{transition:none}}
      .svx-thanks h3{font-size:19px;font-weight:700;margin:0 0 6px}
      .svx-thanks p{font-size:14px;color:var(--svx-muted);margin:0 0 16px;line-height:1.5}
      .svx-edit{background:none;border:1px solid var(--svx-line);border-radius:10px;padding:9px 16px;font-size:13px;font-weight:600;color:var(--svx-ink);cursor:pointer}
      .svx-edit:hover{border-color:var(--svx-accent);color:var(--svx-accent)}
      .svx-empty{padding:28px 10px;text-align:center;color:var(--svx-muted);font-size:13.5px}
    `}</style>
  );

  if (loading) return <div className="svx">{styleBlock}<div className="svx-empty">Loading your survey…</div></div>;
  if (total === 0) return <div className="svx">{styleBlock}<div className="svx-empty">This week’s survey is being prepared — check back shortly.</div></div>;

  // Completed / thank-you state
  if (done) {
    return (
      <div className="svx">
        {styleBlock}
        <div className="svx-thanks">
          <div className="svx-check"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
          <h3>Thank you for your feedback</h3>
          <p>{preview
            ? `Preview — in the live survey, these ${total} answers would be saved and this activity marked complete.`
            : `Your answers are saved and help us shape next week. You rated ${answered} of ${total} questions.`}</p>
          <button type="button" className="svx-edit" onClick={() => setDone(false)}>{preview ? 'Take it again' : 'Update my answers'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="svx">
      {styleBlock}
      <div className="svx-head">
        <div className="svx-eyebrow">Weekly feedback · {total} quick questions</div>
        {title && <h2 className="svx-title">{title}</h2>}
        <p className="svx-lead">Rate each statement from 1 (strongly disagree) to 5 (strongly agree). It takes about two minutes and directly shapes next week.</p>
        <div className="svx-prog">
          <div className="svx-bar"><i style={{ width: `${pct}%` }} /></div>
          <span className="svx-count">{answered}/{total}</span>
        </div>
      </div>

      {questions.map((q, i) => (
        <div key={i} className={`svx-q${ratings[i] ? ' answered' : ''}`}>
          <div className="svx-qhead">
            <span className="svx-num">{ratings[i] ? '✓' : i + 1}</span>
            <span className="svx-qtext">{q}</span>
          </div>
          <div className="svx-scale" role="radiogroup" aria-label={q}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={ratings[i] === n}
                aria-label={`${n} out of 5`}
                className={`svx-opt${ratings[i] === n ? ' on' : ''}`}
                onClick={() => setRatings((m) => ({ ...m, [i]: n }))}
              >{n}</button>
            ))}
          </div>
          <div className="svx-ends"><span>{ENDS[0]}</span><span>{ENDS[1]}</span></div>
          {showComment[i] ? (
            <input
              className="svx-input"
              placeholder="Add a comment (optional)"
              value={comments[i] || ''}
              onChange={(e) => setComments((m) => ({ ...m, [i]: e.target.value }))}
            />
          ) : (
            <button type="button" className="svx-ctoggle" onClick={() => setShowComment((m) => ({ ...m, [i]: true }))}>＋ Add a comment</button>
          )}
        </div>
      ))}

      <div className="svx-open">
        <div className="svx-openlab">{openPrompt || 'Anything else you’d like us to know?'}</div>
        <textarea
          className="svx-input"
          style={{ minHeight: 92, resize: 'vertical' }}
          placeholder="Your answer (optional)…"
          value={open}
          onChange={(e) => setOpen(e.target.value)}
        />
      </div>

      <div className="svx-actions">
        <button type="button" className="svx-submit" disabled={!canSubmit || saving} onClick={submit}>
          {saving ? 'Submitting…' : preview ? 'Submit feedback (preview)' : 'Submit feedback'}
          {!saving && <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
        {error ? <div className="svx-err">{error}</div>
          : answered === 0 && !open.trim() ? <div className="svx-hint">Answer at least one question to submit.</div>
          : preview ? <div className="svx-hint">Preview — take it to feel the flow; answers aren’t saved here.</div>
          : <div className="svx-hint">Submitting marks this activity complete.</div>}
      </div>
    </div>
  );
};

export default CardSurveyExperience;
