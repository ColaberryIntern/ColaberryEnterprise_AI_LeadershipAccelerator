import React, { useEffect, useRef, useState } from 'react';
import { runtimeApi, AssessmentView, AssessmentResult, AssessmentItem, AssessmentKind, AssessmentQ, CompetencyScore, SectionProgress, Readiness } from './runtimeApi';
import { emitPointsEarned } from '../../../services/pointsFx';

/**
 * AssessmentPanel — the Knowledge Check (quiz) and Evaluation experience in the
 * Learning Runtime. One component, two modes:
 *   QUIZ  — low-stakes entry check; instant per-question feedback + the correct
 *           answer; no pass gate; framed as "what you know coming in".
 *   EVAL  — graded end-of-section test; hidden answers, batch submit, 70% to pass
 *           and earn points, a pre→post growth meter vs the section's quiz, retry.
 * Portal-styled (rt-* tokens); its own scoped .as-* classes.
 */

interface Props {
  cardId: string;
  onCompleted?: (readiness: Readiness | null) => void;
  preview?: boolean;          // admin Experience Studio: sample questions, no fetch, no persist
  kind?: AssessmentKind;      // preview only — which mode to demo
}
type Phase = 'loading' | 'intro' | 'taking' | 'result' | 'error';

const pct = (x: number | null | undefined) => (x == null ? null : Math.round(x * 100));
const now = () => Date.now();

// Representative sample questions for the admin Studio preview (real students get
// blueprint-generated questions from the backend). Answers included so the preview
// scores client-side without any API call.
type SampleQ = { question: string; options: string[]; competency: string; correct_index: number; explanation: string };
const SAMPLE_QS: SampleQ[] = [
  { question: 'What best describes an AI system architecture?', options: ['A single clever prompt', 'The end-to-end design of the components, data, and models that deliver an AI capability', 'A chatbot window', 'A database table'], competency: 'architecture', correct_index: 1, explanation: 'Architecture is the whole end-to-end design, not any one piece.' },
  { question: 'Which most improves a prompt?', options: ['Adding more words', 'Being specific and giving the model clear context and examples', 'Guessing and hoping', 'Avoiding any examples'], competency: 'prompt_engineering', correct_index: 1, explanation: 'Clear, specific context (and examples) reliably improves outputs.' },
  { question: 'Why do we test AI systems?', options: ['We do not need to', 'To catch failures before users do and keep behavior reliable', 'Only to slow shipping down', 'Only for compliance paperwork'], competency: 'testing', correct_index: 1, explanation: 'Testing surfaces failures early and keeps behavior reliable.' },
  { question: 'A good first step when scoping an AI feature is to…', options: ['Pick the biggest model available', 'Define the outcome and how you will measure success', 'Write the UI first', 'Skip planning to move fast'], competency: 'architecture', correct_index: 1, explanation: 'Start from the outcome and a success measure, then design to it.' },
];

const AssessmentPanel: React.FC<Props> = ({ cardId, onCompleted, preview, kind: kindProp }) => {
  const [view, setView] = useState<AssessmentView | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [locked, setLocked] = useState<Record<number, boolean>>({});   // quiz: question answered+revealed
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const startRef = useRef<number>(now());
  const qStartRef = useRef<number>(now());
  const timesRef = useRef<Record<number, number>>({});

  useEffect(() => {
    let alive = true;
    if (preview) {
      const k: AssessmentKind = kindProp || 'quiz';
      const questions: AssessmentQ[] = SAMPLE_QS.map((s, i) => ({
        index: i, question: s.question, options: s.options, competency: s.competency,
        ...(k === 'quiz' ? { correct_index: s.correct_index, explanation: s.explanation } : {}),  // quiz reveals; eval hides
      }));
      setView({ kind: k, pass_threshold: k === 'evaluation' ? 0.70 : null, question_count: questions.length, questions, last_attempt: null, section: null });
      setPhase('intro');
      return () => { alive = false; };
    }
    runtimeApi.assessment(cardId)
      .then((v) => { if (!alive) return; setView(v); setPhase(v.last_attempt ? 'result' : 'intro'); })
      .catch(() => { if (alive) setPhase('error'); });
    return () => { alive = false; };
  }, [cardId, preview, kindProp]);

  const isEval = view?.kind === 'evaluation';
  const qs = view?.questions || [];
  const total = qs.length;
  const q = qs[idx];

  const noteTime = (i: number) => { timesRef.current[i] = (timesRef.current[i] || 0) + (now() - qStartRef.current); qStartRef.current = now(); };
  const begin = () => { startRef.current = now(); qStartRef.current = now(); setIdx(0); setAnswers({}); setLocked({}); setResult(null); setPhase('taking'); };

  const pick = (optionIndex: number) => {
    if (isEval) { setAnswers((a) => ({ ...a, [idx]: optionIndex })); return; }
    if (locked[idx]) return;                       // quiz: one shot per question, then reveal
    setAnswers((a) => ({ ...a, [idx]: optionIndex }));
    setLocked((l) => ({ ...l, [idx]: true }));
  };
  const goNext = () => { noteTime(idx); if (idx < total - 1) setIdx(idx + 1); };
  const goBack = () => { noteTime(idx); if (idx > 0) setIdx(idx - 1); };

  const submit = async () => {
    noteTime(idx);
    if (preview) { setResult(scorePreview(kindProp || 'quiz', answers)); setPhase('result'); return; }
    setBusy(true);
    try {
      const responses = qs.map((_, i) => ({ index: i, selected_index: answers[i] ?? null, time_ms: timesRef.current[i] ?? null }));
      const r = await runtimeApi.submitAssessment(cardId, { responses, duration_ms: now() - startRef.current, started_at: new Date(startRef.current).toISOString() });
      setResult(r);
      setPhase('result');
      // Knowledge Check always completes; Evaluation only on a pass — the backend
      // reports the exact points awarded (0 if none), which drives the HUD burst.
      emitPointsEarned(r.completion?.outcome?.points_awarded ?? 0);
      onCompleted?.(r.completion?.readiness ?? null);
    } catch { setPhase('error'); } finally { setBusy(false); }
  };

  if (phase === 'loading') return <div className="as"><style>{asCss}</style><div className="as-load">Loading your {isEval ? 'evaluation' : 'knowledge check'}…</div></div>;
  if (phase === 'error') return <div className="as"><style>{asCss}</style><div className="as-load">Could not load the assessment. Try refreshing.</div></div>;
  if (!view) return null;

  const section = result?.section ?? view.section;

  return (
    <div className="as">
      <style>{asCss}</style>
      <Journey kind={view.kind} section={section} phase={phase} />

      {phase === 'intro' && <Intro view={view} onBegin={begin} />}

      {phase === 'taking' && q && (
        <div className="as-take">
          <div className="as-prog"><div className="as-progbar"><span style={{ width: `${((idx + 1) / total) * 100}%` }} /></div><div className="as-progn">Question {idx + 1} of {total}</div></div>
          {q.competency && <div className="as-qtag">{prettyDomain(q.competency)}</div>}
          <div className="as-qtext">{q.question}</div>
          <div className="as-opts" role="radiogroup" aria-label={q.question}>
            {q.options.map((opt, oi) => {
              const chosen = answers[idx] === oi;
              const showFeedback = !isEval && locked[idx];
              const isCorrect = showFeedback && q.correct_index === oi;
              const isWrong = showFeedback && chosen && q.correct_index !== oi;
              return (
                <button key={oi} className={`as-opt${chosen ? ' chosen' : ''}${isCorrect ? ' correct' : ''}${isWrong ? ' wrong' : ''}`}
                  role="radio" aria-checked={chosen}
                  disabled={showFeedback} onClick={() => pick(oi)}>
                  <span className="as-optk">{String.fromCharCode(65 + oi)}</span>
                  <span className="as-optt">{opt}</span>
                  {isCorrect && <span className="as-optmark ok">✓</span>}
                  {isWrong && <span className="as-optmark no">✕</span>}
                </button>
              );
            })}
          </div>
          {!isEval && locked[idx] && q.explanation && (
            <div className={`as-explain${answers[idx] === q.correct_index ? ' ok' : ' no'}`}>
              <b>{answers[idx] === q.correct_index ? 'Correct.' : `Answer: ${String.fromCharCode(65 + (q.correct_index ?? 0))}.`}</b> {q.explanation}
            </div>
          )}
          <div className="as-nav">
            <button className="rt-btn" disabled={idx === 0} onClick={goBack}>← Back</button>
            {idx < total - 1
              ? <button className="rt-btn pri" disabled={isEval ? answers[idx] == null : !locked[idx]} onClick={goNext}>Next →</button>
              : <button className="rt-btn cta" disabled={busy || (isEval ? Object.keys(answers).length === 0 : !locked[idx])} onClick={submit}>{busy ? 'Scoring…' : isEval ? 'Submit evaluation' : 'See my results'}</button>}
          </div>
        </div>
      )}

      {phase === 'result' && (
        <Result view={view} result={result} section={section} onRetry={isEval ? begin : undefined} />
      )}
    </div>
  );
};

// ── intro ────────────────────────────────────────────────────────────────────
const Intro: React.FC<{ view: AssessmentView; onBegin: () => void }> = ({ view, onBegin }) => {
  const isEval = view.kind === 'evaluation';
  return (
    <div className="as-intro">
      <div className={`as-badge ${isEval ? 'eval' : 'quiz'}`}>{isEval ? 'Evaluation' : 'Knowledge Check'}</div>
      <div className="as-introttl">{isEval ? 'End-of-section evaluation' : 'Quick knowledge check'}</div>
      <p className="as-introsub">
        {isEval
          ? <>{view.question_count} questions. Score <b>{pct(view.pass_threshold)}%</b> or higher to pass and earn your points. This measures how far you’ve come since your entry check.</>
          : <>{view.question_count} quick questions to see what you know coming in. No pressure — you’ll get the correct answer right away, and this just sets your starting point.</>}
      </p>
      <button className={`rt-btn ${isEval ? 'cta' : 'pri'}`} onClick={onBegin}>{isEval ? 'Start evaluation' : 'Start check'}</button>
    </div>
  );
};

// ── section journey ("where you are / where you're going") ────────────────────
const Journey: React.FC<{ kind: string; section: SectionProgress | null; phase: Phase }> = ({ kind, section }) => {
  const isEval = kind === 'evaluation';
  const beginPct = pct(section?.beginning);
  const curPct = pct(section?.current);
  const steps = [
    { key: 'quiz', label: 'Knowledge Check', done: !!section?.quiz_taken, sub: beginPct != null ? `${beginPct}% coming in` : 'entry check', active: !isEval },
    { key: 'learn', label: 'Learn the section', done: !!section?.quiz_taken, sub: 'lessons & labs', active: false },
    { key: 'eval', label: 'Evaluation', done: section?.evaluation_passed === true, sub: isEval ? (curPct != null ? `${curPct}% now` : '70% to pass') : 'ahead', active: isEval },
  ];
  return (
    <div className="as-journey">
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          {i > 0 && <div className="as-jline" />}
          <div className={`as-jstep${s.active ? ' active' : ''}${s.done ? ' done' : ''}`}>
            <div className="as-jdot">{s.done ? '✓' : i + 1}</div>
            <div className="as-jmeta"><div className="as-jlabel">{s.label}</div><div className="as-jsub">{s.sub}</div></div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

// ── results ───────────────────────────────────────────────────────────────────
const Result: React.FC<{ view: AssessmentView; result: AssessmentResult | null; section: SectionProgress | null; onRetry?: () => void }> = ({ view, result, section, onRetry }) => {
  const isEval = view.kind === 'evaluation';
  const a = result ?? view.last_attempt;
  if (!a) return null;
  const scorePct = pct(a.score) ?? 0;
  const passed = a.passed;
  const items: AssessmentItem[] = a.items || [];
  const comp = a.competency_scores || {};

  return (
    <div className="as-result">
      <div className={`as-hero ${isEval ? (passed ? 'pass' : 'fail') : 'quiz'}`}>
        <div className="as-heroscore">{scorePct}%</div>
        <div className="as-herometa">
          <div className="as-herottl">
            {isEval ? (passed ? 'Passed — nice work!' : 'Not quite yet') : 'Your starting point'}
          </div>
          <div className="as-herosub">
            {a.correct_count}/{a.total_count} correct{isEval && a.pass_threshold != null ? ` · ${pct(a.pass_threshold)}% to pass` : ''}
          </div>
        </div>
      </div>

      {/* growth meter — pre/post for the section */}
      {isEval && section && section.beginning != null && section.current != null && (
        <div className="as-growth">
          <div className="rt-lab">Your growth this section</div>
          <div className="as-growthrow">
            <div className="as-gnode"><b>{pct(section.beginning)}%</b><span>coming in</span></div>
            <div className="as-garrow">→ {section.growth != null && section.growth >= 0 ? '+' : ''}{pct(section.growth)} pts</div>
            <div className="as-gnode cur"><b>{pct(section.current)}%</b><span>now</span></div>
          </div>
        </div>
      )}

      {/* per-competency breakdown */}
      {Object.keys(comp).length > 0 && (
        <div className="as-comps">
          <div className="rt-lab">By competency</div>
          {Object.entries(comp).map(([domain, cs]) => {
            const p = Math.round(cs.pct * 100);
            const grow = section?.per_competency?.find((x) => x.domain === domain);
            return (
              <div key={domain} className="as-comprow">
                <div className="as-compname">{prettyDomain(domain)}</div>
                <div className="as-compbar"><span style={{ width: `${p}%` }} className={p >= 75 ? 'hi' : p >= 40 ? 'mid' : 'lo'} /></div>
                <div className="as-comppct">{p}%{grow?.delta != null ? <em>{grow.delta >= 0 ? '+' : ''}{Math.round(grow.delta * 100)}</em> : null}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* per-question review (reveal answers) */}
      <details className="as-review">
        <summary>Review answers</summary>
        {items.map((it, i) => (
          <div key={i} className={`as-ritem${it.is_correct ? ' ok' : ' no'}`}>
            <div className="as-rq"><span className="as-rmark">{it.is_correct ? '✓' : '✕'}</span>{it.question}</div>
            <div className="as-ropts">
              {it.options.map((o, oi) => (
                <div key={oi} className={`as-ro${oi === it.correct_index ? ' correct' : ''}${oi === it.selected_index && oi !== it.correct_index ? ' chosen-wrong' : ''}`}>
                  {String.fromCharCode(65 + oi)}. {o}{oi === it.correct_index ? ' ✓' : ''}{oi === it.selected_index && oi !== it.correct_index ? ' (your answer)' : ''}
                </div>
              ))}
            </div>
            {it.explanation && <div className="as-rexp">{it.explanation}</div>}
          </div>
        ))}
      </details>

      {isEval && !passed && onRetry && (
        <button className="rt-btn cta" style={{ marginTop: 14 }} onClick={onRetry}>Review &amp; retry</button>
      )}
      {isEval && passed && <div className="as-done">✓ Points earned. Your readiness updated below.</div>}
      {!isEval && <div className="as-done">✓ Logged as your baseline. Learn the section, then take the evaluation to measure your growth.</div>}
    </div>
  );
};

function prettyDomain(d: string): string {
  return (d || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Client-side scoring for the admin Studio preview — no API, no persistence.
function scorePreview(kind: AssessmentKind, answers: Record<number, number>): AssessmentResult {
  const items: AssessmentItem[] = SAMPLE_QS.map((s, i) => ({
    question: s.question, competency: s.competency, options: s.options,
    selected_index: answers[i] ?? null, correct_index: s.correct_index,
    is_correct: (answers[i] ?? null) === s.correct_index, explanation: s.explanation, time_ms: null,
  }));
  const correct = items.filter((x) => x.is_correct).length;
  const total = SAMPLE_QS.length;
  const score = total ? correct / total : 0;
  const passed = kind === 'evaluation' ? score >= 0.70 : null;
  const agg: Record<string, { correct: number; total: number }> = {};
  for (const it of items) { const c = it.competency || 'general'; (agg[c] = agg[c] || { correct: 0, total: 0 }).total += 1; if (it.is_correct) agg[c].correct += 1; }
  const competency_scores: Record<string, CompetencyScore> = {};
  for (const [c, v] of Object.entries(agg)) competency_scores[c] = { correct: v.correct, total: v.total, pct: v.total ? v.correct / v.total : 0 };
  const BEGIN = 0.4;   // a sample "coming in" baseline so the eval growth meter renders
  const section: SectionProgress | null = kind === 'evaluation' ? {
    week: 1, beginning: BEGIN, current: score, growth: score - BEGIN,
    quiz_taken: true, evaluation_taken: true, evaluation_passed: passed,
    per_competency: Object.entries(competency_scores).map(([domain, cs]) => ({ domain, beginning: BEGIN, current: cs.pct, delta: cs.pct - BEGIN })),
  } : null;
  return { kind, score, correct_count: correct, total_count: total, passed, pass_threshold: kind === 'evaluation' ? 0.70 : null, attempt_number: 1, items, competency_scores, section, completion: null };
}

/*
 * Deliberately self-contained: `.as` declares every token it uses rather than
 * inheriting them, because this panel renders in two different scopes. In the
 * Runtime Workspace it sits under `.rt` (runtimeKit) which defines them all; in
 * the Classroom drawer it sits under `.tl-de` (timeline.css) which defines only
 * --berry/--cherry/--leaf/--amber. Under `.tl-de` the missing --line made
 * `border:1.5px solid var(--line)` invalid at computed-value time, so
 * border-style fell back to `none` and --berry-soft resolved to transparent —
 * which meant a picked answer was pixel-identical to an unpicked one and
 * students could not see (or revise) their own selection. Same rule the other
 * card renderers already follow (see CardSurveyExperience `.svx`,
 * ReflectionReview `.rfx`, ArchitectTimeMachine `.am`).
 *
 * Values mirror runtimeKit's `.rt` exactly, so the workspace rendering is
 * unchanged; only the drawer gains the styling it was silently losing.
 */
export const asCss = `
.as{--ink:#16191C;--paper:#FFFFFF;--mist:#F7F8FA;--sunken:#EFF2F5;--line:#E6EAEE;--line-soft:#EEF1F4;
  --berry:#367895;--berry-deep:#2E6A86;--berry-soft:#E6F0F3;--cherry:#FB2832;--cherry-deep:#C20E1E;--cherry-soft:#FDE7E8;
  --leaf:#5BA63C;--leaf-deep:#3C7A26;--leaf-soft:#E9F5E4;--amber:#E8920C;--amber-soft:#FBEFD9;--muted:#6A7680;--muted2:#95A0A8;
  --mono:'Roboto Mono',ui-monospace,Consolas,monospace;--sans:'Roboto',system-ui,'Segoe UI',sans-serif;
  padding:2px 2px 8px}
/* Follows the one global theme the portal header toggle stamps on <html>. Both
   selectors are needed: the workspace root carries data-theme itself, while the
   Classroom drawer inherits it from <html> under .te-main. Admin Experience
   Studio previews reuse .tl-de outside .te-main and stay light, matching
   timeline.css. */
.rt[data-theme="dark"] .as,
:root[data-theme="dark"] .te-main .as{
  --ink:#F4F4F4;--paper:#1E1E1E;--mist:#151515;--sunken:#272727;--line:#3A3A3A;--line-soft:#2C2C2C;
  --berry-soft:#22343B;--cherry-soft:#3A1B1E;--leaf-soft:#22331C;--amber-soft:#3A2E12;
  --muted:#9C9C9C;--muted2:#7E8891;
}
.as-load{padding:30px 0;color:var(--muted);text-align:center}
.as-journey{display:flex;align-items:center;gap:8px;margin:2px 0 16px;flex-wrap:wrap}
.as-jstep{display:flex;align-items:center;gap:9px;opacity:.6}
.as-jstep.active{opacity:1}
.as-jdot{width:26px;height:26px;border-radius:50%;background:var(--sunken);color:var(--muted);display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:12px;font-weight:800;flex:none}
.as-jstep.active .as-jdot{background:var(--berry);color:#fff}
.as-jstep.done .as-jdot{background:var(--leaf);color:#fff}
.as-jlabel{font-size:12.5px;font-weight:700;color:var(--ink);line-height:1.1}
.as-jsub{font-family:var(--mono);font-size:10px;color:var(--muted2);text-transform:uppercase;letter-spacing:.03em}
.as-jline{flex:1;min-width:16px;height:2px;background:var(--line);border-radius:2px}
.as-intro{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:22px}
.as-badge{display:inline-block;font-family:var(--mono);font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:5px 11px;border-radius:999px;margin-bottom:12px}
.as-badge.quiz{background:var(--berry-soft);color:var(--berry-deep)}
.as-badge.eval{background:var(--cherry-soft);color:var(--cherry-deep)}
.as-introttl{font-size:19px;font-weight:800;color:var(--ink);margin-bottom:6px}
.as-introsub{font-size:14px;color:var(--muted);margin:0 0 16px;max-width:520px}
.as-take{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:20px}
.as-prog{margin-bottom:16px}
.as-progbar{height:7px;background:var(--sunken);border-radius:999px;overflow:hidden}
.as-progbar span{display:block;height:100%;background:var(--berry);border-radius:999px;transition:width .25s ease}
.as-progn{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:6px}
.as-qtag{display:inline-block;font-family:var(--mono);font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted2);background:var(--sunken);padding:3px 8px;border-radius:6px;margin-bottom:8px}
.as-qtext{font-size:17px;font-weight:700;color:var(--ink);line-height:1.35;margin-bottom:16px}
.as-opts{display:flex;flex-direction:column;gap:9px}
.as-opt{display:flex;align-items:center;gap:12px;text-align:left;padding:13px 15px;border:1.5px solid var(--line);background:var(--paper);border-radius:11px;cursor:pointer;font-size:14.5px;color:var(--ink);transition:all .12s}
.as-opt:hover:not(:disabled){border-color:var(--berry)}
.as-opt:disabled{cursor:default}
.as-opt.chosen{border-color:var(--berry);background:var(--berry-soft);box-shadow:inset 0 0 0 1px var(--berry)}
.as-opt.chosen .as-optk{background:var(--berry);color:#fff}
.as-opt.correct{border-color:var(--leaf);background:var(--leaf-soft)}
.as-opt.wrong{border-color:var(--cherry);background:var(--cherry-soft)}
.as-optk{width:26px;height:26px;border-radius:7px;background:var(--sunken);display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-weight:800;font-size:12.5px;color:var(--muted);flex:none}
.as-opt.correct .as-optk{background:var(--leaf);color:#fff}
.as-opt.wrong .as-optk{background:var(--cherry);color:#fff}
.as-optt{flex:1}
.as-optmark{font-weight:800;font-size:17px}.as-optmark.ok{color:var(--leaf-deep)}.as-optmark.no{color:var(--cherry-deep)}
.as-explain{margin-top:12px;padding:11px 14px;border-radius:10px;font-size:13.5px;line-height:1.5}
.as-explain.ok{background:var(--leaf-soft);color:var(--leaf-deep)}
.as-explain.no{background:var(--amber-soft);color:#8a5a08}
.as-nav{display:flex;justify-content:space-between;gap:10px;margin-top:18px}
.as-result{}
.as-hero{display:flex;align-items:center;gap:18px;padding:20px 22px;border-radius:14px;color:#fff;margin-bottom:14px}
.as-hero.quiz{background:linear-gradient(135deg,var(--berry),var(--berry-deep))}
.as-hero.pass{background:linear-gradient(135deg,var(--leaf),var(--leaf-deep))}
.as-hero.fail{background:linear-gradient(135deg,var(--amber),#b5710a)}
.as-heroscore{font-family:var(--mono);font-size:44px;font-weight:800;line-height:1}
.as-herottl{font-size:18px;font-weight:800}
.as-herosub{font-size:13px;opacity:.9;font-family:var(--mono)}
.as-growth{background:var(--paper);border:1px solid var(--line);border-radius:13px;padding:14px 16px;margin-bottom:14px}
.as-growthrow{display:flex;align-items:center;gap:16px}
.as-gnode{text-align:center}.as-gnode b{font-family:var(--mono);font-size:24px;font-weight:800;display:block;color:var(--muted)}.as-gnode.cur b{color:var(--leaf-deep)}.as-gnode span{font-family:var(--mono);font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted2)}
.as-garrow{font-family:var(--mono);font-weight:800;color:var(--leaf-deep);font-size:14px}
.as-comps{background:var(--paper);border:1px solid var(--line);border-radius:13px;padding:14px 16px;margin-bottom:14px}
.as-comprow{display:flex;align-items:center;gap:12px;margin:8px 0}
.as-compname{width:140px;font-size:12.5px;font-weight:600;color:var(--ink);flex:none}
.as-compbar{flex:1;height:9px;background:var(--sunken);border-radius:999px;overflow:hidden}
.as-compbar span{display:block;height:100%;border-radius:999px}.as-compbar .hi{background:var(--leaf)}.as-compbar .mid{background:var(--amber)}.as-compbar .lo{background:var(--cherry)}
.as-comppct{width:64px;text-align:right;font-family:var(--mono);font-size:12.5px;font-weight:700;color:var(--ink);flex:none}
.as-comppct em{color:var(--leaf-deep);font-style:normal;font-size:10.5px;margin-left:5px}
.as-review{background:var(--paper);border:1px solid var(--line);border-radius:13px;padding:6px 16px;margin-bottom:8px}
.as-review summary{cursor:pointer;font-weight:700;font-size:13.5px;color:var(--berry-deep);padding:8px 0}
.as-ritem{border-top:1px solid var(--line-soft);padding:11px 0}
.as-rq{font-size:14px;font-weight:600;color:var(--ink);display:flex;gap:9px;margin-bottom:7px}
.as-rmark{font-weight:800}.as-ritem.ok .as-rmark{color:var(--leaf-deep)}.as-ritem.no .as-rmark{color:var(--cherry-deep)}
.as-ropts{display:flex;flex-direction:column;gap:3px;padding-left:19px}
.as-ro{font-size:13px;color:var(--muted)}
.as-ro.correct{color:var(--leaf-deep);font-weight:700}
.as-ro.chosen-wrong{color:var(--cherry-deep)}
.as-rexp{font-size:12.5px;color:var(--muted);padding-left:19px;margin-top:5px;font-style:italic}
.as-done{margin-top:14px;padding:11px 14px;background:var(--leaf-soft);color:var(--leaf-deep);border-radius:10px;font-size:13.5px;font-weight:600}
`;

export default AssessmentPanel;
