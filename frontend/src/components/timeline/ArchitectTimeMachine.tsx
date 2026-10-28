import React, { useEffect, useState } from 'react';
import { runtimeApi, AmScenario, AmProgress, AmReceipt, AmLedger, AmInterviewQuestion, AmInterviewAnswer } from '../../pages/portal/runtime/runtimeApi';
import { emitPointsEarned } from '../../services/pointsFx';
import { Aperture, TimeDial, Receipt, OutcomeDashboard, ConsequenceHorizon, Completed } from './ArchitectTimeMachineParts';
import { AM_CSS } from './architectTimeMachineStyles';

/**
 * ArchitectTimeMachine — the bespoke, self-contained renderer for the
 * architect_mindset curriculum type ("The Architect Time Machine").
 *
 * variant='drawer'    the ~440px right-side panel: orient, show progress, resume,
 *                     confirm completion, and enter the full Workspace.
 * variant='workspace' the full cinematic experience: request, first decision,
 *                     system zoom-out, the Architect Interview (MC + custom, with
 *                     required-state validation), the consequence reveal, re-
 *                     architecture, Experience Receipt, Decision Record, project
 *                     transfer, and backend-authoritative completion.
 *
 * Fully self-styled (its own <style> + --am-* vars, the survey pattern) so it looks
 * identical in the .tl-de drawer and the .rt workspace scopes. The central stage is
 * always the dark cinematic "dream"; motion honors prefers-reduced-motion.
 */

interface Props {
  cardId: string;
  variant: 'drawer' | 'workspace';
  preview?: boolean;
  completed?: boolean;
  onEnterWorkspace?: () => void;              // drawer -> open the full workspace
  onCompleted?: (readiness: any) => void;     // workspace -> after backend completion
}

const STAGES_FULL = [
  { key: 'arrival', label: 'Arrival' },
  { key: 'request', label: 'The Request' },
  { key: 'first_decision', label: 'First Decision' },
  { key: 'zoom_out', label: 'System Zoom-Out' },
  { key: 'interview1', label: 'Architect Interview' },
  { key: 'consequence', label: 'Consequences' },
  { key: 'rearchitecture', label: 'Re-Architecture' },
  { key: 'receipt', label: 'Experience Receipt' },
  { key: 'record', label: 'Decision Record' },
  { key: 'transfer', label: 'Project Transfer' },
] as const;
// scenario.lite (Week 0): a short first taste. One click question + one sentence at the end.
const STAGES_LITE = [
  { key: 'arrival', label: 'Arrival' },
  { key: 'request', label: 'The Request' },
  { key: 'first_decision', label: 'Your Call' },
  { key: 'zoom_out', label: 'The Bigger Picture' },
  { key: 'consequence', label: 'Fast-Forward' },
  { key: 'takeaway', label: 'Your Takeaway' },
] as const;
type StageKey = typeof STAGES_FULL[number]['key'] | typeof STAGES_LITE[number]['key'];
type StageDef = { key: StageKey; label: string };

const isText = (s: any) => typeof s === 'string' && s.trim().length >= 2;

const ArchitectTimeMachine: React.FC<Props> = ({ cardId, variant, preview, completed: completedProp, onEnterWorkspace, onCompleted }) => {
  const [scenario, setScenario] = useState<AmScenario | null>(null);
  const [progress, setProgress] = useState<AmProgress | null>(null);
  const [receipt, setReceipt] = useState<AmReceipt | null>(null);
  const [ledger, setLedger] = useState<AmLedger | null>(null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(!!completedProp);
  const [busy, setBusy] = useState(false);

  // stage flow (workspace)
  const [cur, setCur] = useState(0);
  const [reveal, setReveal] = useState(false);        // consequence: time advanced
  const [reqError, setReqError] = useState('');       // required-state validation banner

  // captured inputs
  const [firstChoice, setFirstChoice] = useState<string>('');
  const [firstCustom, setFirstCustom] = useState('');
  const [firstReason, setFirstReason] = useState('');
  const [iv1, setIv1] = useState<Record<string, AmInterviewAnswer>>({});
  const [iv2, setIv2] = useState<Record<string, AmInterviewAnswer>>({});
  const [reflection, setReflection] = useState('');
  const [commitment, setCommitment] = useState('');
  const [assumed, setAssumed] = useState('');
  const [outcome, setOutcome] = useState('');

  useEffect(() => {
    if (preview) { setLoading(false); return; }
    let alive = true;
    runtimeApi.architectState(cardId).then((v) => {
      if (!alive) return;
      setScenario(v.scenario); setProgress(v.progress); setReceipt(v.receipt); setLedger(v.ledger);
      setCompleted(v.status === 'completed' || v.progress.state === 'completed');
      // hydrate captured inputs for resume
      const p = v.progress;
      if (p.first_decision) { setFirstChoice(p.first_decision.choice || (p.first_decision.custom ? 'custom' : '')); setFirstCustom(p.first_decision.custom || ''); setFirstReason(p.first_decision.reasoning || ''); }
      if (p.interview) {
        const p1: Record<string, AmInterviewAnswer> = {}; const p2: Record<string, AmInterviewAnswer> = {};
        const q2ids = new Set((v.scenario.interview_part_2 || []).map((q) => q.id));
        Object.entries(p.interview).forEach(([id, a]) => { (q2ids.has(id) ? p2 : p1)[id] = a; });
        setIv1(p1); setIv2(p2);
      }
      if (isText(p.reflection)) setReflection(p.reflection as string);
      if (isText(p.commitment)) setCommitment(p.commitment as string);
      if (p.project_transfer) { setAssumed(p.project_transfer.assumed_solution || ''); setOutcome(p.project_transfer.outcome || ''); }
      if (p.flags?.consequence_viewed) setReveal(true);
      // resume to a sensible stage
      setCur(resumeStage(p.state, !!v.scenario.lite));
      setLoading(false);
    }).catch(() => { if (alive) { setLoading(false); setError('Could not load the Architect Time Machine.'); } });
    return () => { alive = false; };
  }, [cardId, preview]);

  const lite = !!scenario?.lite;
  const STAGES: readonly StageDef[] = lite ? STAGES_LITE : STAGES_FULL;

  // ── stage advance with validation + autosave ────────────────────────────────
  const save = async (to: string, patch?: Partial<AmProgress>) => { try { await runtimeApi.architectAdvance(cardId, to, patch); } catch { /* autosave is best-effort; backend re-validates on complete */ } };

  const goNext = async () => {
    if (busy) return;
    setReqError('');
    const stage = STAGES[cur].key as StageKey;
    if (!scenario) return;
    // per-stage validation + persistence
    if (stage === 'first_decision') {
      if (!firstChoice || (firstChoice === 'custom' && !isText(firstCustom))) { setReqError('Choose the answer closest to your thinking, or write your own, before continuing.'); return; }
      await save('first_decision_submitted', { first_decision: { choice: firstChoice, custom: firstChoice === 'custom' ? firstCustom : null, reasoning: firstReason } });
    } else if (stage === 'zoom_out') {
      await save('zoom_out_complete', { flags: { zoom_out_viewed: true } });
    } else if (stage === 'interview1') {
      const bad = requiredUnanswered(scenario.interview_part_1, iv1);
      if (bad.length) { setReqError(`Please answer every required question (${bad.length} remaining). Any "write my own" answer needs text.`); return; }
      setBusy(true);
      try { await runtimeApi.architectInterview(cardId, 1, iv1); await save('interview_part_1_complete'); }
      catch (e: any) { setReqError(e?.response?.data?.error || 'Please complete your answers.'); setBusy(false); return; }
      setBusy(false);
    } else if (stage === 'consequence') {
      if (!reveal) { setReveal(true); await save('consequence_in_progress'); return; } // first click advances time
      await save('consequence_complete', { flags: { consequence_viewed: true } });
    } else if (stage === 'rearchitecture') {
      const bad = requiredUnanswered(scenario.interview_part_2, iv2);
      if (bad.length || !isText(reflection)) { setReqError('Answer what changed, and describe the most important thing you originally missed.'); return; }
      setBusy(true);
      try {
        await runtimeApi.architectInterview(cardId, 2, iv2);
        const r2 = iv2['r2'];
        await save('rearchitecture_submitted', { revised_decision: { choice: r2?.choice || undefined, custom: r2?.custom }, reflection });
      } catch (e: any) { setReqError(e?.response?.data?.error || 'Please complete your answers.'); setBusy(false); return; }
      setBusy(false);
    } else if (stage === 'receipt') {
      await save('receipt_unlocked');
    } else if (stage === 'record') {
      if (!isText(commitment)) { setReqError('Complete your Architect Commitment before continuing.'); return; }
      await save('adr_generated', { commitment });
    } else if (stage === 'transfer') {
      await save('project_transfer_complete', { project_transfer: { assumed_solution: assumed, outcome } });
      await finish();
      return;
    } else if (stage === 'takeaway') {
      const bad = requiredUnanswered(scenario.interview_part_2, iv2);
      if (bad.length || !isText(commitment)) { setReqError('Pick the big idea closest to yours, and finish the sentence, before you finish.'); return; }
      setBusy(true);
      try { await runtimeApi.architectInterview(cardId, 2, iv2); }
      catch (e: any) { setReqError(e?.response?.data?.error || 'Please complete your answer.'); setBusy(false); return; }
      setBusy(false);
      await save('adr_generated', { commitment });
      await finish();
      return;
    } else if (stage === 'arrival') {
      await save('arrival');
    } else if (stage === 'request') {
      await save('request_viewed');
    }
    setCur((c) => Math.min(STAGES.length - 1, c + 1));
  };

  const finish = async () => {
    setBusy(true); setReqError('');
    try {
      await runtimeApi.architectEvaluate(cardId);            // graceful; deterministic fallback
      const res = await runtimeApi.architectComplete(cardId);
      setReceipt(res.receipt); setLedger(res.ledger); setCompleted(true);
      setProgress((p) => (p ? { ...p, state: 'completed', evaluation: res.evaluation } : p));
      if (res.artifact) emitPointsEarned(0);
      if (onCompleted) onCompleted(res.readiness);
    } catch (e: any) {
      setReqError(e?.response?.data?.error || 'A few steps remain before this can be completed.');
    } finally { setBusy(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (error) return <div className="am"><Style />{styleReset}<div className="am-empty">{error}</div></div>;
  if (loading) return <div className="am"><Style /><div className="am-empty">Calibrating the Architect Time Machine…</div></div>;

  // ── DRAWER: orientation / resume / summary ──────────────────────────────────
  if (variant === 'drawer') {
    const principle = scenario?.principle || 'An architect sees the entire system surrounding the requested feature.';
    const isBaseline = scenario ? !!scenario.baseline : true;
    const weekLabel = scenario ? `Week ${scenario.week}` : 'Architect Mindset';
    return (
      <div className="am am-drawer"><Style />
        <Aperture />
        <div className="am-d-cap"><div className="am-series">Architect Mindset · {weekLabel}</div><div className="am-d-title">{scenario?.title || 'Welcome to the Architect Time Machine'}</div></div>
        <div className="am-d-body">
          <div className="am-principle"><b>This week's principle.</b> {principle}</div>
          {!completed && scenario?.request && (
            <div className="am-brief"><b>This week's brief.</b> &ldquo;{scenario.request.text}&rdquo;</div>
          )}
          {completed ? (
            <>
              {!lite && <div className="am-sec">Experience Receipt</div>}
              {!lite && receipt && <Receipt receipt={receipt} compact />}
              {progress?.commitment && <div className="am-commit">&ldquo;{progress.commitment}&rdquo;<span>Your Architect Commitment</span></div>}
              <p className="am-note">{isBaseline ? 'Week 0 is a baseline. Week 1 begins your scored growth.' : 'A scored lesson. Your Architect Mindset Score is on the completion screen.'}</p>
            </>
          ) : lite ? (
            <>
              <div className="am-sec">What happens inside</div>
              <ol className="am-flow">
                <li>Get a simple request</li>
                <li>Make a quick call (no wrong answers)</li>
                <li>See the bigger picture behind it</li>
                <li>Fast-forward to see what happens next</li>
              </ol>
              <p className="am-note">A quick first look, about 5 minutes. Nothing here is graded. Your progress saves as you go.</p>
            </>
          ) : (
            <>
              <div className="am-sec">What happens inside</div>
              <ol className="am-flow">
                <li>Arrive, and meet your Mindset Ledger</li>
                <li>Receive a deceptively simple request</li>
                <li>Make your first decision, before the lesson</li>
                <li>Watch the system zoom out to its real size</li>
                <li>Be interviewed by the Architect Interviewer</li>
                <li>See the consequences play out across time</li>
                <li>Re-architect, and receive your Decision Record</li>
              </ol>
              <p className="am-note">{isBaseline ? 'Week 0 is a baseline demonstration (about 13 minutes), not scored as your first lesson.' : `A scored lesson (about ${receipt?.minutes || 25} minutes).`} Your progress autosaves.</p>
            </>
          )}
        </div>
        {!preview && onEnterWorkspace && !completed && (
          <button type="button" className="am-cta" onClick={onEnterWorkspace}>Enter the Time Machine →</button>
        )}
        {completed && <div className="am-done-pill">✓ Completed · {isBaseline ? 'baseline set' : 'lesson complete'}</div>}
        {preview && <p className="am-note" style={{ padding: '0 4px' }}>Preview — in the live card, this panel orients the student and the button opens the full Workspace experience.</p>}
      </div>
    );
  }

  // ── WORKSPACE: the full experience ──────────────────────────────────────────
  if (completed) return <div className="am am-ws"><Style /><Completed receipt={receipt} ledger={ledger} progress={progress} lite={lite} /></div>;

  const stage = STAGES[cur].key as StageKey;
  return (
    <div className="am am-ws" data-reveal={reveal && stage === 'consequence' ? 'true' : 'false'}><Style />
      {/* stage nav */}
      <nav className="am-nav" aria-label="Experience stages">
        {STAGES.map((s, i) => (
          <button key={s.key} type="button" className={`am-step${i === cur ? ' on' : ''}${i < cur ? ' done' : ''}`} disabled={i > cur} onClick={() => i <= cur && setCur(i)}>
            <span className="am-ic">{i < cur ? '✓' : i + 1}</span><span className="am-step-l">{s.label}</span>
          </button>
        ))}
      </nav>

      <div className="am-stage">
        <div className="am-fx" aria-hidden="true"><span className="am-tunnel" /><span className="am-grid" /></div>
        <div className="am-stage-body">
          <TimeDial phase={dialPhase(stage)} reveal={reveal} />
          {scenario && <StageBody
            stage={stage} scenario={scenario} reveal={reveal} lite={lite}
            firstChoice={firstChoice} setFirstChoice={setFirstChoice} firstCustom={firstCustom} setFirstCustom={setFirstCustom} firstReason={firstReason} setFirstReason={setFirstReason}
            iv1={iv1} setIv1={setIv1} iv2={iv2} setIv2={setIv2}
            reflection={reflection} setReflection={setReflection} commitment={commitment} setCommitment={setCommitment}
            assumed={assumed} setAssumed={setAssumed} outcome={outcome} setOutcome={setOutcome}
            receipt={receipt} reqError={reqError}
          />}
        </div>
        <div className="am-foot">
          <span className="am-foot-l">{STAGES[cur].label}</span>
          <div className="am-foot-btns">
            {cur > 0 && <button type="button" className="am-btn ghost" onClick={() => { setReqError(''); setCur((c) => Math.max(0, c - 1)); }}>Back</button>}
            <button type="button" className="am-btn pri" disabled={busy} onClick={goNext}>{nextLabel(stage, reveal, busy, lite)}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── helpers ───────────────────────────────────────────────────────────────────
function resumeStage(state: string, lite: boolean): number {
  if (lite) {
    const liteMap: Record<string, number> = {
      not_started: 0, arrival: 1, request_viewed: 2, first_decision_draft: 2, first_decision_submitted: 3,
      zoom_out_in_progress: 3, zoom_out_complete: 4, consequence_in_progress: 4,
    };
    return liteMap[state] ?? 5;   // anything past the fast-forward resumes at the takeaway
  }
  const map: Record<string, number> = {
    not_started: 0, arrival: 1, request_viewed: 2, first_decision_draft: 2, first_decision_submitted: 3,
    zoom_out_in_progress: 3, zoom_out_complete: 4, interview_part_1_in_progress: 4, interview_part_1_complete: 5,
    architecture_selected: 5, consequence_in_progress: 5, consequence_complete: 6, interview_part_2_in_progress: 6,
    interview_part_2_complete: 7, rearchitecture_draft: 6, rearchitecture_submitted: 7, receipt_unlocked: 8,
    adr_generated: 9, project_transfer_in_progress: 9, project_transfer_complete: 9,
  };
  return map[state] ?? 0;
}
function dialPhase(stage: StageKey): 0 | 1 | 2 {
  if (['arrival', 'request', 'first_decision', 'zoom_out'].includes(stage)) return 0;
  if (['interview1', 'rearchitecture'].includes(stage)) return 1;
  return 2;
}
function nextLabel(stage: StageKey, reveal: boolean, busy: boolean, lite: boolean): string {
  if (busy) return 'Saving…';
  if (stage === 'arrival') return lite ? 'Let\'s go →' : 'Enter the machine →';
  if (stage === 'consequence' && !reveal) return lite ? 'Fast-forward →' : 'Advance time →';
  if (stage === 'transfer') return 'Validate & finish →';
  if (stage === 'takeaway') return 'Finish →';
  return 'Continue →';
}
function requiredUnanswered(questions: AmInterviewQuestion[], answers: Record<string, AmInterviewAnswer>): string[] {
  return questions.filter((q) => {
    const a = answers[q.id];
    const custom = q.options.find((o) => o.custom)?.id;
    if (!a) return true;
    if (q.mode === 'multiple') { const c = a.choices || []; if (!c.length) return true; if (custom && c.includes(custom)) return !isText(a.custom); return false; }
    if (!a.choice) return true;
    if (custom && a.choice === custom) return !isText(a.custom);
    return false;
  }).map((q) => q.id);
}

// ── sub-components ─────────────────────────────────────────────────────────────

const OptionList: React.FC<{ name: string; options: { id: string; label: string; custom?: boolean }[]; value: string; custom: string; onChoose: (id: string) => void; onCustom: (t: string) => void; invalid?: boolean }> =
  ({ name, options, value, custom, onChoose, onCustom, invalid }) => (
    <div className="am-opts" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={`am-opt${value === o.id ? ' on' : ''}${o.custom ? ' custom' : ''}${invalid && !value ? ' invalid' : ''}`} onClick={() => onChoose(o.id)}>
          <span className="am-box"><i /></span>{o.label}
        </button>
      ))}
      {value === (options.find((o) => o.custom)?.id) && (
        <textarea className="am-input" autoFocus placeholder="In your own words…" value={custom} onChange={(e) => onCustom(e.target.value)} aria-label="Your own answer (required)" />
      )}
    </div>
  );

const Interview: React.FC<{ questions: AmInterviewQuestion[]; answers: Record<string, AmInterviewAnswer>; set: (a: Record<string, AmInterviewAnswer>) => void; invalidIds: string[] }> =
  ({ questions, answers, set, invalidIds }) => (
    <>
      {questions.map((q, i) => {
        const a = answers[q.id] || {};
        const customId = q.options.find((o) => o.custom)?.id;
        return (
          <div key={q.id} className={`am-q${invalidIds.includes(q.id) ? ' q-invalid' : ''}`}>
            <div className="am-interviewer"><span className="am-orb" /><div className="am-bubble"><span className="am-who">Question {i + 1} of {questions.length} · choose one</span>{q.text}</div></div>
            <OptionList name={q.text} options={q.options} value={a.choice || ''} custom={a.custom || ''} invalid={invalidIds.includes(q.id)}
              onChoose={(id) => set({ ...answers, [q.id]: { ...a, choice: id, custom: id === customId ? (a.custom || '') : null } })}
              onCustom={(t) => set({ ...answers, [q.id]: { ...a, custom: t } })} />
          </div>
        );
      })}
    </>
  );

const StageBody: React.FC<any> = (p) => {
  const s: AmScenario = p.scenario;
  const stage: StageKey = p.stage;
  const banner = p.reqError ? <div className="am-reqbanner" role="alert"><span className="am-i">!</span>{p.reqError}</div> : null;
  const lite: boolean = !!p.lite;
  switch (stage) {
    case 'arrival':
      if (lite) return (<><p className="am-kicker">Orientation · a quick first look</p><h2 className="am-h">Welcome to the Architect Time Machine.</h2>
        <p className="am-lead">Here is how it works. You get a simple request and make a quick call. Then the machine fast-forwards so you can see what happens next.</p>
        <p className="am-lead">It takes about 5 minutes, and nothing here is graded.</p>
        <p className="am-hint">Your work saves at every step.</p></>);
      return (<><p className="am-kicker">Week {s.week}{s.baseline ? ' · Baseline demonstration' : ''}</p><h2 className="am-h">{s.title}.</h2>
        <p className="am-lead">The machine is calibrating to your Week {s.week} request. You will make a decision, watch its consequences unfold across time, and be interviewed about what you saw, and what you missed.{s.baseline ? ' This week is a baseline. It is not scored as your first lesson.' : ''}</p>
        <p className="am-hint">Keyboard, screen-reader, and reduced-motion support are on. Your work autosaves at every step.</p></>);
    case 'request':
      return (<><p className="am-kicker">The Request</p><h2 className="am-h">{lite ? 'Here is your request.' : 'A deceptively simple assignment.'}</h2>
        <div className="am-memo"><div className="am-from">Incoming · from {s.request.from}</div><p>&ldquo;{s.request.text}&rdquo;</p></div>
        <p className="am-lead">Right now the system looks like {s.initial_system.length} boxes: {s.initial_system.map((x, i) => <b key={i}>{x}{i < s.initial_system.length - 1 ? ', ' : ''}</b>)}. That is all you would normally have on day one.</p></>);
    case 'first_decision':
      return (<><p className="am-kicker">{lite ? 'Your Call' : 'First Decision · before the lesson'}</p><h2 className="am-h">What would you do first?</h2><p className="am-lead">{s.first_decision.prompt}</p>{banner}
        <OptionList name="First decision" options={s.first_decision.options} value={p.firstChoice} custom={p.firstCustom} invalid={!!p.reqError} onChoose={p.setFirstChoice} onCustom={p.setFirstCustom} />
        {!lite && (<><label className="am-flab" htmlFor="am-reason">Why? (one line captures your reasoning)</label>
        <textarea id="am-reason" className="am-input" placeholder="I would start by…" value={p.firstReason} onChange={(e) => p.setFirstReason(e.target.value)} /></>)}</>);
    case 'zoom_out':
      return (<><p className="am-kicker">{lite ? 'The Bigger Picture' : 'System Zoom-Out'}</p><h2 className="am-h">{lite ? `It was never just ${s.initial_system.length} things.` : `The system was never ${s.initial_system.length} boxes.`}</h2>
        <div className="am-layers">
          {([[s.zoom_out.titles?.people || 'People', s.zoom_out.people], [s.zoom_out.titles?.information || 'Information', s.zoom_out.information], [s.zoom_out.titles?.decisions || 'Decisions', s.zoom_out.decisions], [s.zoom_out.titles?.operations || 'Operations', s.zoom_out.operations]] as [string, string[]][]).filter(([, items]) => items && items.length).map(([t, items]) => (
            <div key={t} className="am-layer"><h5>{t} · {items.length}</h5><div className="am-tags">{items.map((x, i) => <span key={i} className="am-tag">{x}</span>)}</div></div>
          ))}
        </div>
        {s.signature_reveals.map((r, i) => <div key={i} className={`am-reveal${i === 1 ? ' amber' : ''}`}>&ldquo;{r}&rdquo;</div>)}</>);
    case 'interview1':
      return (<><p className="am-kicker">Architect Interview · Part One · required</p><h2 className="am-h">Tell me how you were thinking.</h2>{banner}
        <Interview questions={s.interview_part_1} answers={p.iv1} set={p.setIv1} invalidIds={p.reqError ? requiredUnanswered(s.interview_part_1, p.iv1) : []} /></>);
    case 'consequence':
      return (<><p className="am-kicker">{lite ? 'Fast-Forward' : 'Consequence Simulation · the machine advances time'}</p><h2 className="am-h">{lite ? 'Now, see what happens next.' : 'Watch what your first instinct caused.'}</h2>
        {!p.reveal ? <p className="am-lead">{lite ? 'Say the team just builds what was asked for. The machine will jump ahead a few months to show what happens after the demo.' : 'The machine will now carry this decision forward through the life of the system: launch, growth, the first failure, the first audit, and beyond. Advance time to see what happens.'}</p>
          : (<>
              {s.consequence.dashboard && s.consequence.dashboard.length ? <OutcomeDashboard metrics={s.consequence.dashboard} /> : null}
              <ConsequenceHorizon horizon={s.consequence.horizon} />
              <div className="am-reveal cherry">&ldquo;{s.consequence.reveal}&rdquo;</div>
              <p className="am-lead">{s.consequence.lesson}</p>
            </>)}</>);
    case 'rearchitecture':
      return (<><p className="am-kicker">Re-Architecture · Interview, Part Two</p><h2 className="am-h">Now, what would you change?</h2>
        <div className="am-interviewer"><span className="am-orb" /><div className="am-bubble"><span className="am-who">Architect Interviewer</span>{s.rearchitecture.prompt}</div></div>{banner}
        <Interview questions={s.interview_part_2} answers={p.iv2} set={p.setIv2} invalidIds={p.reqError ? requiredUnanswered(s.interview_part_2, p.iv2) : []} />
        <label className="am-flab" htmlFor="am-reflect">In your own words, the most important thing you originally missed</label>
        <textarea id="am-reflect" className="am-input" placeholder="I planned for the successful path but did not design the…" value={p.reflection} onChange={(e) => p.setReflection(e.target.value)} /></>);
    case 'receipt':
      return (<><p className="am-kicker">Experience Receipt</p><h2 className="am-h">What this session represented.</h2>{p.receipt && <Receipt receipt={p.receipt} />}</>);
    case 'record':
      return (<><p className="am-kicker">Architect Decision Record</p><h2 className="am-h">Your record, in your words.</h2>
        <p className="am-lead">A structured, portfolio-ready record you own, generated from what you decided. Finish it with your commitment.</p>
        <label className="am-flab" htmlFor="am-commit">{s.commitment_prompt} …</label>
        <textarea id="am-commit" className="am-input" placeholder="… map the whole system, its owners, and its failure paths, before choosing a tool." value={p.commitment} onChange={(e) => p.setCommitment(e.target.value)} />{banner}</>);
    case 'transfer':
      return (<><p className="am-kicker">Project Transfer</p><h2 className="am-h">Apply it to your own project.</h2>
        <div className="am-interviewer"><span className="am-orb" /><div className="am-bubble"><span className="am-who">Architect Interviewer</span>{s.project_transfer.questions[0]}</div></div>
        <label className="am-flab" htmlFor="am-assumed">{s.project_transfer.questions[0]}</label>
        <textarea id="am-assumed" className="am-input" placeholder="I assumed I would build…" value={p.assumed} onChange={(e) => p.setAssumed(e.target.value)} />
        <label className="am-flab" htmlFor="am-outcome">{s.project_transfer.questions[1]}</label>
        <textarea id="am-outcome" className="am-input" placeholder="Success would look like…" value={p.outcome} onChange={(e) => p.setOutcome(e.target.value)} />{banner}</>);
    case 'takeaway':
      return (<><p className="am-kicker">Your Takeaway</p><h2 className="am-h">What will you take with you?</h2>
        <p className="am-lead">{s.rearchitecture.prompt}</p>{banner}
        <Interview questions={s.interview_part_2} answers={p.iv2} set={p.setIv2} invalidIds={p.reqError ? requiredUnanswered(s.interview_part_2, p.iv2) : []} />
        <label className="am-flab" htmlFor="am-commit">Finish the sentence: {s.commitment_prompt} …</label>
        <textarea id="am-commit" className="am-input" placeholder="… ask who will use it and what it touches before I pick a tool." value={p.commitment} onChange={(e) => p.setCommitment(e.target.value)} /></>);
    default: return null;
  }
};


const styleReset = null;
const Style: React.FC = () => (<style>{AM_CSS}</style>);

export default ArchitectTimeMachine;
