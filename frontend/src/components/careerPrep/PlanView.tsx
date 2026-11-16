import React from 'react';
import type { PrepPlan } from './careerPrepApi';

/**
 * Career Prep v27 (CP4.2): Your plan (kit P4.4, shot L3-3). One row per day; each day is a timeline of
 * segment blocks whose width is proportional to the minutes. Blocks that target a skill are marked, and
 * each block names itself on hover and on keyboard focus. Today has Start; later days read Upcoming.
 */
export function PlanView({ plan, company, onStart }: { plan: PrepPlan | null; company?: string; onStart: () => void }): React.ReactElement {
  if (!plan) return <p className="cp-pending">Pick a plan with Cora and it appears here.</p>;
  const total = (segs: PrepPlan['days'][number]['segments']) => segs.reduce((a, s) => a + s.minutes, 0);
  const targeted = Array.from(new Set(plan.days.flatMap((d) => d.segments.filter((s) => s.targetSkill).map((s) => s.title.replace(/^Learn: /, '')))))
    .filter((t) => !/^Try|^Pressure/.test(t));
  return (
    <div className="cp-plan" data-testid="cp-plan">
      <h3>Your plan{company ? ` · for ${company}` : ''}</h3>
      {targeted.length > 0 && <p className="cp-muted">Built from your weakest skills: {targeted.join(', ')}.</p>}
      <button type="button" className="cp-send" onClick={onStart} data-testid="cp-start-today">▶ Start today&apos;s session</button>
      <ol className="cp-days">
        {plan.days.map((d, i) => {
          const mins = total(d.segments);
          return (
            <li key={d.date} className="cp-day" data-testid={`cp-day-${i}`}>
              <div className="cp-day-head"><b>{d.label}</b><span className="cp-muted">{mins} min</span>
                {i === 0 ? <button type="button" className="cp-chip" onClick={onStart}>Start</button> : <span className="cp-muted">Upcoming</span>}</div>
              <div className="cp-timeline" role="list" aria-label={`${d.label}: ${mins} minutes`}>
                {d.segments.map((s, j) => (
                  <span key={`${s.kind}${j}`} role="listitem" tabIndex={0} className={`cp-seg cp-seg-${s.kind}${s.targetSkill ? ' is-target' : ''}`}
                    style={{ flexGrow: s.minutes }} title={`${s.title}, ${s.minutes} min`} aria-label={`${s.title}, ${s.minutes} minutes${s.targetSkill ? ', works on a weak skill' : ''}`}
                    data-minutes={s.minutes}>{s.minutes >= 4 ? s.title.replace(/^Learn: .*/, 'Learn') : ''}</span>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
