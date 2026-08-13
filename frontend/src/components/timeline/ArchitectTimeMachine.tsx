import React, { useEffect, useState } from 'react';
import { runtimeApi, AmScenario, AmProgress, AmReceipt, AmLedger, AmInterviewQuestion, AmInterviewAnswer } from '../../pages/portal/runtime/runtimeApi';
import { emitPointsEarned } from '../../services/pointsFx';

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

const STAGES = [
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
type StageKey = typeof STAGES[number]['key'];

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
      setCur(resumeStage(p.state));
      setLoading(false);
    }).catch(() => { if (alive) { setLoading(false); setError('Could not load the Architect Time Machine.'); } });
    return () => { alive = false; };
  }, [cardId, preview]);

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
              <div className="am-sec">Experience Receipt</div>
              {receipt && <Receipt receipt={receipt} compact />}
              {progress?.commitment && <div className="am-commit">&ldquo;{progress.commitment}&rdquo;<span>Your Architect Commitment</span></div>}
              <p className="am-note">{isBaseline ? 'Week 0 is a baseline. Week 1 begins your scored growth.' : 'A scored lesson. Your Architect Mindset Score is on the completion screen.'}</p>
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
  if (completed) return <div className="am am-ws"><Style /><Completed receipt={receipt} ledger={ledger} progress={progress} /></div>;

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
            stage={stage} scenario={scenario} reveal={reveal}
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
            <button type="button" className="am-btn pri" disabled={busy} onClick={goNext}>{nextLabel(stage, reveal, busy)}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── helpers ───────────────────────────────────────────────────────────────────
function resumeStage(state: string): number {
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
function nextLabel(stage: StageKey, reveal: boolean, busy: boolean): string {
  if (busy) return 'Saving…';
  if (stage === 'arrival') return 'Enter the machine →';
  if (stage === 'consequence' && !reveal) return 'Advance time →';
  if (stage === 'transfer') return 'Validate & finish →';
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
const Aperture: React.FC = () => (
  <div className="am-hero" aria-hidden="true">
    <svg viewBox="0 0 440 150" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="amh" cx="22%" cy="50%" r="80%"><stop offset="0%" stopColor="#1c4658" /><stop offset="60%" stopColor="#0f2731" /><stop offset="100%" stopColor="#0a1a22" /></radialGradient>
        <radialGradient id="amc" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ffd9b0" /><stop offset="40%" stopColor="#FB2832" /><stop offset="100%" stopColor="#FB2832" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="440" height="150" fill="url(#amh)" />
      <g className="am-drift" transform="translate(95,75)"><circle r="64" fill="none" stroke="#367895" strokeOpacity=".5" strokeWidth="1.5" /><circle r="46" fill="none" stroke="#5fb0cc" strokeOpacity=".26" /><circle r="30" fill="none" stroke="#5fb0cc" strokeOpacity=".2" /><circle r="16" fill="url(#amc)" /><circle r="4" fill="#ffe9d2" /></g>
    </svg>
  </div>
);

const TimeDial: React.FC<{ phase: 0 | 1 | 2; reveal: boolean }> = ({ phase }) => (
  <div className="am-dial" role="img" aria-label={`Time: ${['before decision', 'after decision', 'future consequence'][phase]}`}>
    <span className={phase === 0 ? 'on' : ''}>BEFORE</span><span className={phase === 1 ? 'on' : ''}>AFTER</span><span className={phase === 2 ? 'on' : ''}>FUTURE</span>
  </div>
);

const Receipt: React.FC<{ receipt: AmReceipt; compact?: boolean }> = ({ receipt, compact }) => (
  <div className={`am-receipt${compact ? ' compact' : ''}`}>
    <div className="am-rg">{receipt.counts.slice(0, compact ? 6 : receipt.counts.length).map((c, i) => (<div key={i}><b>{c.value}</b>{c.label}</div>))}</div>
    <div className="am-rhours"><b>~{receipt.represented_hours.toLocaleString()} hrs</b> represented · compressed into ~{receipt.minutes} min <span className="am-ratio">({receipt.ratio.toLocaleString()} : 1)</span></div>
    <div className="am-qual"><strong>Illustrative and scenario-based.</strong> {receipt.qualification}</div>
  </div>
);

const OptionList: React.FC<{ name: string; options: { id: string; label: string; custom?: boolean }[]; value: string; custom: string; onChoose: (id: string) => void; onCustom: (t: string) => void; invalid?: boolean }> =
  ({ name, options, value, custom, onChoose, onCustom, invalid }) => (
    <div className="am-opts" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={`am-opt${value === o.id ? ' on' : ''}${o.custom ? ' custom' : ''}${invalid && !value ? ' invalid' : ''}`} onClick={() => onChoose(o.id)}>
          <span className="am-box"><i /></span>{o.label}
        </button>
      ))}
      {value === (options.find((o) => o.custom)?.id) && (
        <textarea className="am-free" autoFocus placeholder="In your own words…" value={custom} onChange={(e) => onCustom(e.target.value)} aria-label="Your own answer (required)" />
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
  switch (stage) {
    case 'arrival':
      return (<><p className="am-kicker">Week 0 · Baseline demonstration</p><h2 className="am-h">{s.title}.</h2>
        <p className="am-lead">The machine is calibrating to your Week 0 request. You will make a decision, watch its consequences unfold across time, and be interviewed about what you saw, and what you missed. This week is a baseline. It is not scored as your first lesson.</p>
        <p className="am-hint">Keyboard, screen-reader, and reduced-motion support are on. Your work autosaves at every step.</p></>);
    case 'request':
      return (<><p className="am-kicker">The Request</p><h2 className="am-h">A deceptively simple assignment.</h2>
        <div className="am-memo"><div className="am-from">Incoming · from {s.request.from}</div><p>&ldquo;{s.request.text}&rdquo;</p></div>
        <p className="am-lead">Right now the system looks like {s.initial_system.length} boxes: {s.initial_system.map((x, i) => <b key={i}>{x}{i < s.initial_system.length - 1 ? ', ' : ''}</b>)}. That is all you would normally have on day one.</p></>);
    case 'first_decision':
      return (<><p className="am-kicker">First Decision · before the lesson</p><h2 className="am-h">What would you do first?</h2><p className="am-lead">{s.first_decision.prompt}</p>{banner}
        <OptionList name="First decision" options={s.first_decision.options} value={p.firstChoice} custom={p.firstCustom} invalid={!!p.reqError} onChoose={p.setFirstChoice} onCustom={p.setFirstCustom} />
        <label className="am-flab" htmlFor="am-reason">Why? (one line captures your reasoning)</label>
        <textarea id="am-reason" className="am-free" placeholder="I would start by…" value={p.firstReason} onChange={(e) => p.setFirstReason(e.target.value)} /></>);
    case 'zoom_out':
      return (<><p className="am-kicker">System Zoom-Out</p><h2 className="am-h">The system was never {s.initial_system.length} boxes.</h2>
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
      return (<><p className="am-kicker">Consequence Simulation · the machine advances time</p><h2 className="am-h">Watch what your first instinct caused.</h2>
        {!p.reveal ? <p className="am-lead">The machine will now carry this decision forward through the life of the system: launch, growth, the first failure, the first audit, and beyond. Advance time to see what happens.</p>
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
        <textarea id="am-reflect" className="am-free" placeholder="I planned for the successful path but did not design the…" value={p.reflection} onChange={(e) => p.setReflection(e.target.value)} /></>);
    case 'receipt':
      return (<><p className="am-kicker">Experience Receipt</p><h2 className="am-h">What this session represented.</h2>{p.receipt && <Receipt receipt={p.receipt} />}</>);
    case 'record':
      return (<><p className="am-kicker">Architect Decision Record</p><h2 className="am-h">Your record, in your words.</h2>
        <p className="am-lead">A structured, portfolio-ready record you own, generated from what you decided. Finish it with your commitment.</p>
        <label className="am-flab" htmlFor="am-commit">{s.commitment_prompt} …</label>
        <textarea id="am-commit" className="am-free" placeholder="… map the whole system, its owners, and its failure paths, before choosing a tool." value={p.commitment} onChange={(e) => p.setCommitment(e.target.value)} />{banner}</>);
    case 'transfer':
      return (<><p className="am-kicker">Project Transfer</p><h2 className="am-h">Apply it to your own project.</h2>
        <div className="am-interviewer"><span className="am-orb" /><div className="am-bubble"><span className="am-who">Architect Interviewer</span>{s.project_transfer.questions[0]}</div></div>
        <label className="am-flab" htmlFor="am-assumed">{s.project_transfer.questions[0]}</label>
        <textarea id="am-assumed" className="am-free" placeholder="I assumed I would build…" value={p.assumed} onChange={(e) => p.setAssumed(e.target.value)} />
        <label className="am-flab" htmlFor="am-outcome">{s.project_transfer.questions[1]}</label>
        <textarea id="am-outcome" className="am-free" placeholder="Success would look like…" value={p.outcome} onChange={(e) => p.setOutcome(e.target.value)} />{banner}</>);
    default: return null;
  }
};

const OutcomeDashboard: React.FC<{ metrics: { label: string; value: string; trend?: 'up' | 'down' | 'flat' }[] }> = ({ metrics }) => (
  <div className="am-chartcard"><h5>30-Day Outcome Dashboard</h5><div className="am-cap">What actually happened after the demo shipped.</div>
    <div className="am-dash">{metrics.map((m, i) => (
      <div key={i} className={`am-metric${m.trend === 'down' ? ' down' : m.trend === 'up' ? ' up' : ''}`}><b>{m.value}</b><span>{m.label}</span></div>
    ))}</div>
  </div>
);

const ScoreCard: React.FC<{ ev: NonNullable<AmProgress['evaluation']> }> = ({ ev }) => (
  <div className="am-scorecard">
    <div className="am-scorehead"><div className="am-scoretotal"><b>{ev.total}</b><span>/100</span></div><div className="am-scorestage">{ev.stage?.label}</div></div>
    <div className="am-cap" style={{ color: '#9fbcc7', marginTop: 6 }}>A transparent, weighted score across eight architect dimensions. Architecture has no single correct answer, so this rewards evidence, depth, and reasoning, not a "right" choice.</div>
    <div className="am-dims">{(ev.dimensions || []).map((d) => (
      <div key={d.key} className="am-dim">
        <div className="am-dimhead"><span>{d.label}</span><span className="am-dimval">{d.score}<em> · {d.weight}%</em></span></div>
        <div className="am-dimbar"><i style={{ width: `${d.score}%` }} /></div>
        <div className="am-dimnote"><b>Strength.</b> {d.strength} <b>Next.</b> {d.gap}</div>
      </div>
    ))}</div>
  </div>
);

const ConsequenceHorizon: React.FC<{ horizon: { point: string; risk: number; note?: string }[] }> = ({ horizon }) => {
  const w = 640, n = horizon.length, step = (w - 80) / Math.max(1, n - 1);
  const col = (r: number) => (r > 60 ? '#FB2832' : r > 36 ? '#E8920C' : '#77BB4A');
  const pts = horizon.map((h, i) => `${40 + i * step},${112 - h.risk}`).join(' ');
  return (
    <div className="am-chartcard"><h5>Consequence Horizon</h5><div className="am-cap">The same decision, seen at each point in the system's life.</div>
      <svg viewBox="0 0 640 150" width="100%" role="img" aria-label="Consequence horizon from first build to long-term operation">
        <line x1="20" y1="112" x2="620" y2="112" stroke="#ffffff33" />
        <polyline fill="none" stroke="#8fc7db" strokeOpacity=".5" strokeWidth="2" points={pts} />
        {horizon.map((h, i) => { const x = 40 + i * step; const y = 112 - h.risk; return (<g key={i}><circle cx={x} cy={y} r="5" fill={col(h.risk)} /><text x={x} y="132" fill="#9fbcc7" fontSize="8.5" fontFamily="'Roboto Mono',monospace" textAnchor="middle">{h.point}</text></g>); })}
      </svg>
    </div>
  );
};

const Completed: React.FC<{ receipt: AmReceipt | null; ledger: AmLedger | null; progress: AmProgress | null }> = ({ receipt, ledger, progress }) => {
  const gates = ['Initial decision submitted', 'All stages traversed', 'Consequence reveal viewed', 'Every required interview question answered', 'Custom answers are meaningful', 'Revised decision submitted', 'At least one tradeoff explained', 'At least one assumption identified', 'At least one failure risk identified', 'Final reflection submitted', 'Architect Decision Record generated', 'Experience evaluated', 'All progress saved', 'Backend confirmed eligibility'];
  const ev = progress?.evaluation;
  const scored = !!ev && ev.baseline === false && Array.isArray(ev.dimensions) && ev.dimensions.length > 0;
  return (
    <div className="am-stage"><div className="am-fx" aria-hidden="true"><span className="am-tunnel" /><span className="am-grid" /></div>
      <div className="am-stage-body">
        <TimeDial phase={2} reveal />
        <p className="am-kicker">Completion · verified on the backend</p>
        <h2 className="am-h">{scored ? 'Lesson complete. Here is your Architect Mindset Score.' : 'Baseline set. You are ready for Week 1.'}</h2>
        <p className="am-lead">All fourteen completion gates passed server-side. Draft progress never counts as completion, and reopening this card will not re-award anything.</p>
        <div className="am-gates">{gates.map((g, i) => <div key={i} className="am-gate"><span className="am-c">✓</span>{g}</div>)}</div>
        {scored && ev
          ? <ScoreCard ev={ev} />
          : (ev?.observation && <div className="am-baseline"><b>Baseline observation{ev.stage ? ` · ${ev.stage.label}` : ''}</b><p>{ev.observation}</p></div>)}
        {scored && ev?.observation && <div className="am-baseline"><b>Your debrief</b><p>{ev.observation}</p></div>}
        {progress?.commitment && <div className="am-commit">&ldquo;{progress.commitment}&rdquo;<span>Your Architect Commitment</span></div>}
        {receipt && <Receipt receipt={receipt} />}
        {ledger && (<div className="am-ledger"><div className="am-sec light">Mindset Ledger</div><div className="am-lrow"><span>Lessons completed</span><b>{ledger.lessons_completed}{scored ? '' : ' (baseline)'}</b></div><div className="am-lrow"><span>Decisions recorded</span><b>{ledger.decisions_recorded}</b></div><div className="am-lrow"><span>Assumptions discovered</span><b>{ledger.assumptions_discovered}</b></div><div className="am-lrow"><span>Failure modes examined</span><b>{ledger.failure_modes_examined}</b></div><div className="am-lrow"><span>Perspectives encountered</span><b>{ledger.perspectives_encountered}</b></div><div className="am-lrow"><span>Represented exposure</span><b>~{ledger.represented_hours.toLocaleString()} hrs</b></div></div>)}
        <p className="am-hint">{scored ? 'This is your first scored lesson. Your growth is measured from here across the rest of the series.' : 'Week 0 is a baseline (you entered describing systems, not tools). It is not scored as your first lesson. Week 1 begins your scored growth.'}</p>
      </div>
    </div>
  );
};

const styleReset = null;
const Style: React.FC = () => (<style>{AM_CSS}</style>);

const AM_CSS = `
.am{--am-berry:#367895;--am-berry-deep:#2E6A86;--am-cherry:#FB2832;--am-cherry-deep:#c81e26;--am-leaf:#5BA63C;--am-amber:#E8920C;
  --am-ink:#e7eef1;--am-sub:#9fbcc7;--am-stage1:#0e1a20;--am-stage2:#12303c;
  --am-page:#fff;--am-strong:#1A1A1A;--am-body:#2B2B2B;--am-muted:#6B6B6B;--am-line:#E4E4E3;--am-sunken:#F1F1F0;
  --am-sans:'Roboto','Segoe UI',system-ui,sans-serif;--am-mono:'Roboto Mono',ui-monospace,monospace;--am-ease:cubic-bezier(.22,1,.36,1);
  font-family:var(--am-sans);color:var(--am-body)}
@media (prefers-color-scheme:dark){.am{--am-page:#15242c;--am-strong:#f3f6f7;--am-body:#d7e0e3;--am-muted:#93a3a9;--am-line:#26424e;--am-sunken:#0f1d24}}
:root[data-theme="dark"] .am,.tl-de[data-theme="dark"] .am,.rt[data-theme="dark"] .am{--am-page:#15242c;--am-strong:#f3f6f7;--am-body:#d7e0e3;--am-muted:#93a3a9;--am-line:#26424e;--am-sunken:#0f1d24}
:root[data-theme="light"] .am,.tl-de[data-theme="light"] .am,.rt[data-theme="light"] .am{--am-page:#fff;--am-strong:#1A1A1A;--am-body:#2B2B2B;--am-muted:#6B6B6B;--am-line:#E4E4E3;--am-sunken:#F1F1F0}
.am *{box-sizing:border-box}
.am-empty{padding:40px 20px;text-align:center;color:var(--am-muted);font-size:14px}
/* DRAWER */
.am-drawer{display:flex;flex-direction:column;height:100%}
.am-hero{position:relative;height:150px;border-radius:14px;overflow:hidden;margin:0 0 2px}.am-hero svg{width:100%;height:100%;display:block}
.am-d-cap{padding:12px 4px 4px}.am-series{font:700 11px var(--am-mono);letter-spacing:.16em;text-transform:uppercase;color:var(--am-berry)}
.am-d-title{font-size:19px;font-weight:800;color:var(--am-strong);line-height:1.2;margin-top:3px}
.am-d-body{padding:8px 4px;flex:1;overflow-y:auto}
.am-principle{background:var(--am-sunken);border:1px solid var(--am-line);border-left:3px solid var(--am-berry);border-radius:10px;padding:11px 13px;font-size:13.5px}.am-principle b{color:var(--am-strong)}
.am-brief{background:var(--am-page);border:1px solid var(--am-line);border-left:3px solid var(--am-amber);border-radius:10px;padding:11px 13px;font-size:13.5px;margin-top:9px;font-style:italic;color:var(--am-body)}.am-brief b{color:var(--am-strong);font-style:normal}
.am-sec{font:700 11px var(--am-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--am-berry);margin:16px 0 8px}
.am-flow{margin:0;padding-left:20px}.am-flow li{font-size:13px;margin:5px 0;color:var(--am-body)}
.am-note{font-size:12px;color:var(--am-muted);margin:10px 0 0;line-height:1.5}
.am-cta{margin:12px 4px 4px;border:0;border-radius:999px;background:var(--am-cherry);color:#fff;font:700 15px var(--am-sans);padding:13px;cursor:pointer;width:calc(100% - 8px)}
.am-cta:hover{background:var(--am-cherry-deep)}.am-cta:focus-visible{outline:3px solid var(--am-berry);outline-offset:2px}
.am-done-pill{margin:12px 4px;text-align:center;color:var(--am-leaf);font-weight:700;font-size:14px}
.am-commit{margin:12px 0;font-size:14px;font-style:italic;color:var(--am-body);border-left:3px solid var(--am-leaf);padding-left:11px}.am-commit span{display:block;font-style:normal;color:var(--am-muted);font-size:11.5px;margin-top:3px}
/* WORKSPACE */
.am-ws{display:flex;flex-direction:column;min-height:100%}
.am-nav{display:flex;gap:6px;overflow-x:auto;padding:10px 6px;flex-wrap:wrap}
.am-step{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--am-line);background:var(--am-page);color:var(--am-body);border-radius:999px;padding:6px 11px;font:600 12px var(--am-sans);cursor:pointer;white-space:nowrap}
.am-step:disabled{opacity:.5;cursor:not-allowed}.am-step.on{background:var(--am-sunken);border-color:var(--am-berry);color:var(--am-strong)}
.am-step:focus-visible{outline:3px solid var(--am-berry);outline-offset:1px}
.am-ic{width:20px;height:20px;border-radius:99px;background:var(--am-sunken);color:var(--am-muted);font:700 10.5px var(--am-mono);display:grid;place-items:center}
.am-step.on .am-ic{background:var(--am-cherry);color:#fff}.am-step.done .am-ic{background:var(--am-leaf);color:#fff}
@media (max-width:560px){.am-step-l{display:none}}
.am-stage{flex:1;border-radius:16px;position:relative;overflow:hidden;color:var(--am-ink);display:flex;flex-direction:column;min-height:520px;
  background:radial-gradient(900px 480px at 22% 0%,#1c4658,transparent 60%),linear-gradient(160deg,var(--am-stage1),var(--am-stage2) 62%,#0a1a22)}
.am-ws[data-reveal="true"] .am-stage{background:radial-gradient(800px 460px at 60% -5%,#5a2f10,transparent 60%),linear-gradient(160deg,#1a0f0a,#3a1d10 70%,#12060a)}
.am-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.am-tunnel{position:absolute;left:-6%;top:50%;width:460px;height:460px;transform:translateY(-50%);border-radius:50%;
  background:repeating-radial-gradient(circle at center,transparent 0 26px,rgba(95,176,204,.10) 26px 28px);opacity:.6}
.am-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(95,176,204,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(95,176,204,.07) 1px,transparent 1px);background-size:42px 42px;animation:am-drift 30s linear infinite}
@keyframes am-drift{from{background-position:0 0}to{background-position:42px 42px}}
.am-drift{animation:am-pulse 6s var(--am-ease) infinite alternate}@keyframes am-pulse{from{opacity:.85}to{opacity:1}}
.am-stage-body{position:relative;z-index:2;padding:22px 26px;overflow-y:auto;flex:1}
.am-foot{position:relative;z-index:3;border-top:1px solid #ffffff1a;padding:12px 18px;display:flex;align-items:center;justify-content:space-between;background:#0000001f}
.am-foot-l{font:600 12px var(--am-mono);color:var(--am-sub)}.am-foot-btns{display:flex;gap:10px}
.am-dial{display:inline-flex;font:700 10.5px var(--am-mono);letter-spacing:.08em;margin-bottom:14px}
.am-dial span{padding:5px 11px;border:1px solid #ffffff2e;color:var(--am-sub)}.am-dial span:first-child{border-radius:99px 0 0 99px}.am-dial span:last-child{border-radius:0 99px 99px 0}
.am-dial span.on{background:#8fc7db;color:#0e1a20;border-color:#8fc7db}.am-ws[data-reveal="true"] .am-dial span.on{background:var(--am-amber);color:#1a0f0a;border-color:var(--am-amber)}
.am-kicker{font:700 11px var(--am-mono);letter-spacing:.14em;text-transform:uppercase;color:#8fc7db;margin:0}
.am-ws[data-reveal="true"] .am-kicker{color:#ffce8a}
.am-h{font-size:24px;font-weight:800;color:#fff;margin:6px 0 6px;line-height:1.2;max-width:24ch}
.am-lead{font-size:15px;color:#cfe0e6;max-width:62ch}.am-lead b{color:#fff}
.am-hint{font-size:12px;color:#9fbcc7;margin-top:10px}
.am-memo{background:#0000002e;border:1px solid #ffffff26;border-radius:14px;padding:16px 18px;max-width:60ch;margin:16px 0}
.am-from{font:600 11px var(--am-mono);color:#8fc7db;letter-spacing:.06em;text-transform:uppercase}.am-memo p{font-size:16px;color:#eef6f9;margin:8px 0 0;line-height:1.5}
.am-opts{display:flex;flex-direction:column;gap:9px;max-width:62ch;margin:14px 0}
.am-opt{display:flex;gap:12px;align-items:flex-start;text-align:left;border:1px solid #ffffff2b;background:#ffffff0f;color:#eaf3f6;border-radius:12px;padding:12px 14px;font:500 14px var(--am-sans);cursor:pointer;transition:.15s var(--am-ease)}
.am-opt:hover{background:#ffffff1c;border-color:#8fc7db}.am-opt:focus-visible{outline:3px solid #8fc7db;outline-offset:2px}
.am-opt.on{background:#8fc7db26;border-color:#8fc7db;box-shadow:inset 0 0 0 1px #8fc7db}.am-opt.custom{border-style:dashed}.am-opt.invalid{border-color:#ff7a80;box-shadow:0 0 0 1px #ff7a80}
/* Single-select affordance. These groups are role="radiogroup" and only ever accept
   ONE answer, so the control must READ as a radio: a circle with a filled dot, never
   a square with a tick. A square+check promises multi-select the group cannot honour
   (Ram, 2026-08-10) — and it appeared on every question, since one component renders
   them all. If a genuine multi-select question is ever authored (mode: 'multiple'),
   give it a square + check then, not before. */
.am-box{flex:none;width:18px;height:18px;border-radius:50%;border:2px solid #8fc7db;margin-top:1px;display:grid;place-items:center;background:transparent}
.am-box>i{width:9px;height:9px;border-radius:50%;background:#8fc7db;transform:scale(0);transition:transform .13s var(--am-ease)}
.am-opt.on .am-box>i{transform:scale(1)}
@media(prefers-reduced-motion:reduce){.am-box>i{transition:none}}
.am-free{width:100%;max-width:62ch;background:#0b1519;border:1px solid #ffffff2e;border-radius:10px;color:#eef6f9;font:14px var(--am-sans);padding:11px 13px;min-height:70px;resize:vertical;margin-top:6px}
.am-free:focus-visible{outline:3px solid #8fc7db;outline-offset:1px}
.am-flab{display:block;font:600 12px var(--am-mono);letter-spacing:.03em;color:#9fbcc7;margin:14px 0 4px;text-transform:uppercase}
.am-reqbanner{display:flex;align-items:center;gap:10px;background:#3a1416;border:1px solid #7a2a2e;color:#ffb9bd;border-radius:10px;padding:10px 13px;font-size:13px;margin:12px 0;max-width:62ch}.am-i{font-weight:800}
.am-layers{display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:70ch;margin:14px 0}
.am-layer{background:#ffffff10;border:1px solid #ffffff24;border-radius:12px;padding:12px 14px}.am-layer h5{margin:0 0 8px;font:700 11px var(--am-mono);letter-spacing:.08em;text-transform:uppercase;color:#8fc7db}
.am-tags{display:flex;flex-wrap:wrap;gap:6px}.am-tag{font-size:11.5px;background:#0e1a2099;border:1px solid #ffffff26;border-radius:99px;padding:3px 9px;color:#d6e6ec}
.am-reveal{margin:12px 0;max-width:62ch;border-left:3px solid var(--am-cherry);background:#ffffff0d;border-radius:0 10px 10px 0;padding:12px 15px;font-size:15px;color:#fff;font-weight:600}
.am-reveal.amber{border-left-color:var(--am-amber)}.am-reveal.cherry{border-left-color:var(--am-cherry)}
.am-interviewer{display:flex;gap:12px;align-items:flex-start;max-width:64ch;margin:14px 0 4px}
.am-orb{flex:none;width:42px;height:42px;border-radius:99px;background:radial-gradient(circle at 35% 30%,#bfe4f2,#367895 70%);box-shadow:0 0 22px #367895aa}
.am-bubble{background:#ffffff12;border:1px solid #ffffff24;border-radius:4px 14px 14px 14px;padding:12px 15px;font-size:15px;color:#eef6f9}
.am-who{display:block;font:600 10.5px var(--am-mono);color:#8fc7db;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px}
.am-q{padding:8px 0;border-bottom:1px solid #ffffff14}.am-q.q-invalid .am-bubble{border-color:#ff7a80}
.am-chartcard{background:#ffffff0d;border:1px solid #ffffff20;border-radius:14px;padding:16px;margin:12px 0;max-width:64ch}
.am-chartcard h5{margin:0 0 3px;font-size:14px;color:#fff}.am-cap{font-size:12px;color:#9fbcc7;margin-bottom:8px}
.am-receipt{background:#ffffff0d;border:1px dashed #8fc7db;border-radius:14px;padding:16px 18px;max-width:64ch;margin:12px 0}
.am-receipt.compact{background:var(--am-sunken);border-color:var(--am-berry)}
.am-rg{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 16px;margin:2px 0 10px}.am-rg div{font-size:11.5px;color:#9fbcc7}.am-rg b{display:block;font:700 18px var(--am-mono);color:#fff}
.am-receipt.compact .am-rg div{color:var(--am-muted)}.am-receipt.compact .am-rg b{color:var(--am-strong)}
.am-rhours{font-size:13px;color:#cfe0e6;margin:6px 0}.am-receipt.compact .am-rhours{color:var(--am-body)}.am-rhours b{color:#fff}.am-receipt.compact .am-rhours b{color:var(--am-strong)}.am-ratio{color:#8fc7db;font-family:var(--am-mono)}
.am-qual{font-size:11.5px;line-height:1.55;color:#cfe0e6;background:#0e1a2099;border:1px solid #ffffff20;border-radius:9px;padding:10px 12px;margin-top:8px}.am-qual strong{color:#ffce8a}
.am-receipt.compact .am-qual{color:var(--am-muted);background:var(--am-page)}.am-receipt.compact .am-qual strong{color:var(--am-amber)}
.am-gates{columns:2;column-gap:24px;max-width:66ch;margin:12px 0}.am-gate{display:flex;gap:9px;align-items:flex-start;font-size:13px;color:#dce9ee;break-inside:avoid;margin-bottom:7px}
.am-c{flex:none;width:18px;height:18px;border-radius:99px;background:var(--am-leaf);color:#fff;font-size:11px;display:grid;place-items:center}
.am-baseline{background:#ffffff0d;border:1px solid #ffffff20;border-radius:12px;padding:13px 15px;margin:12px 0;max-width:64ch}.am-baseline b{color:#fff;font-size:13.5px}.am-baseline p{margin:5px 0 0;font-size:14px;color:#cfe0e6}
.am-dash{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.am-metric{background:#0e1a2099;border:1px solid #ffffff20;border-radius:10px;padding:11px 12px;text-align:center}
.am-metric b{display:block;font:700 20px var(--am-mono);color:#8fc7db}.am-metric.down b{color:#ff8a90}.am-metric.up b{color:#8fd28a}.am-metric span{display:block;font-size:11px;color:#9fbcc7;margin-top:3px;line-height:1.3}
@media (max-width:560px){.am-dash{grid-template-columns:1fr 1fr}}
.am-scorecard{background:#ffffff0d;border:1px dashed #8fc7db;border-radius:14px;padding:16px 18px;max-width:64ch;margin:12px 0}
.am-scorehead{display:flex;align-items:baseline;gap:14px}.am-scoretotal b{font:800 40px var(--am-mono);color:#fff}.am-scoretotal span{font:600 14px var(--am-mono);color:#9fbcc7}
.am-scorestage{font:800 16px var(--am-sans);color:#8fc7db;padding:4px 12px;border:1px solid #8fc7db55;border-radius:999px}
.am-dims{margin-top:12px;display:flex;flex-direction:column;gap:10px}
.am-dim{border-top:1px solid #ffffff14;padding-top:9px}.am-dim:first-child{border-top:0;padding-top:0}
.am-dimhead{display:flex;justify-content:space-between;font-size:13px;color:#eef6f9;font-weight:600}.am-dimval{font-family:var(--am-mono);color:#8fc7db}.am-dimval em{color:#9fbcc7;font-style:normal;font-size:11px}
.am-dimbar{height:7px;border-radius:99px;background:#0e1a2099;overflow:hidden;margin:5px 0}.am-dimbar i{display:block;height:100%;background:linear-gradient(90deg,var(--am-berry),#8fc7db);border-radius:99px}
.am-dimnote{font-size:11.5px;color:#9fbcc7;line-height:1.5}.am-dimnote b{color:#cfe0e6;font-weight:700}
.am-ledger{max-width:64ch;margin:12px 0}.am-sec.light{color:#8fc7db}
.am-lrow{display:flex;justify-content:space-between;font-size:13px;padding:7px 0;border-bottom:1px solid #ffffff14;color:#cfe0e6}.am-lrow b{font-family:var(--am-mono);color:#fff}
.am-btn{border:0;border-radius:999px;font:700 14px var(--am-sans);padding:11px 20px;cursor:pointer}
.am-btn.pri{background:#8fc7db;color:#0e1a20}.am-btn.pri:hover{background:#a8d6e6}.am-btn.pri:disabled{opacity:.55;cursor:not-allowed}
.am-btn.ghost{background:transparent;color:#cfe0e6;border:1px solid #ffffff33}.am-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}
@media (max-width:560px){.am-layers,.am-gates{grid-template-columns:1fr;columns:1}.am-stage-body{padding:16px 15px}.am-h{font-size:21px}}
@media (prefers-reduced-motion:reduce){.am-grid,.am-drift{animation:none}}
`;

export default ArchitectTimeMachine;
