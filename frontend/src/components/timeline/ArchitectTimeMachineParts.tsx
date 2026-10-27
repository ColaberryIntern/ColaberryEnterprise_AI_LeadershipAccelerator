import React from 'react';
import type { AmProgress, AmReceipt, AmLedger } from '../../pages/portal/runtime/runtimeApi';

/**
 * Display-only pieces of the Architect Time Machine (ArchitectTimeMachine.tsx):
 * the hero, time dial, receipt, outcome dashboard, consequence horizon, score card,
 * and the completion screen. No state, no API calls; split out to keep the
 * renderer under the 500-line ceiling.
 */
export const Aperture: React.FC = () => (
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

export const TimeDial: React.FC<{ phase: 0 | 1 | 2; reveal: boolean }> = ({ phase }) => (
  <div className="am-dial" role="img" aria-label={`Time: ${['before decision', 'after decision', 'future consequence'][phase]}`}>
    <span className={phase === 0 ? 'on' : ''}>BEFORE</span><span className={phase === 1 ? 'on' : ''}>AFTER</span><span className={phase === 2 ? 'on' : ''}>FUTURE</span>
  </div>
);

export const Receipt: React.FC<{ receipt: AmReceipt; compact?: boolean }> = ({ receipt, compact }) => (
  <div className={`am-receipt${compact ? ' compact' : ''}`}>
    <div className="am-rg">{receipt.counts.slice(0, compact ? 6 : receipt.counts.length).map((c, i) => (<div key={i}><b>{c.value}</b>{c.label}</div>))}</div>
    <div className="am-rhours"><b>~{receipt.represented_hours.toLocaleString()} hrs</b> represented · compressed into ~{receipt.minutes} min <span className="am-ratio">({receipt.ratio.toLocaleString()} : 1)</span></div>
    <div className="am-qual"><strong>Illustrative and scenario-based.</strong> {receipt.qualification}</div>
  </div>
);

export const OutcomeDashboard: React.FC<{ metrics: { label: string; value: string; trend?: 'up' | 'down' | 'flat' }[] }> = ({ metrics }) => (
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

export const ConsequenceHorizon: React.FC<{ horizon: { point: string; risk: number; note?: string }[] }> = ({ horizon }) => {
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

export const Completed: React.FC<{ receipt: AmReceipt | null; ledger: AmLedger | null; progress: AmProgress | null; lite?: boolean }> = ({ receipt, ledger, progress, lite }) => {
  const gates = ['Initial decision submitted', 'All stages traversed', 'Consequence reveal viewed', 'Every required interview question answered', 'Custom answers are meaningful', 'Revised decision submitted', 'At least one tradeoff explained', 'At least one assumption identified', 'At least one failure risk identified', 'Final reflection submitted', 'Architect Decision Record generated', 'Experience evaluated', 'All progress saved', 'Backend confirmed eligibility'];
  const ev = progress?.evaluation;
  const scored = !!ev && ev.baseline === false && Array.isArray(ev.dimensions) && ev.dimensions.length > 0;
  if (lite) return (
    <div className="am-stage"><div className="am-fx" aria-hidden="true"><span className="am-tunnel" /><span className="am-grid" /></div>
      <div className="am-stage-body">
        <TimeDial phase={2} reveal />
        <p className="am-kicker">Orientation complete</p>
        <h2 className="am-h">That is the Time Machine. You are ready for Week 1.</h2>
        <p className="am-lead">Each week works the same way: a request, your call, the bigger picture, and a look into the future. From Week 1 it goes a little deeper, one idea at a time.</p>
        {ev?.observation && <div className="am-baseline"><b>What we noticed</b><p>{ev.observation}</p></div>}
        {progress?.commitment && <div className="am-commit">&ldquo;{progress.commitment}&rdquo;<span>Your Architect Commitment</span></div>}
      </div>
    </div>
  );
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
