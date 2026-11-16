import React from 'react';
import type { PrepPlan, PrepSegment } from './careerPrepApi';

/**
 * Career Prep v27 (CP4.2): Your plan (kit P4.4, shot L3-3). One row per day; each day is a timeline of
 * segment blocks whose width follows the minutes. Blocks that work on a weak skill are marked. Every block
 * shows a tooltip on hover AND on keyboard focus naming the segment, its minutes and the skill it targets.
 *
 * Which row is "Today" is decided HERE, from the row's date and the current Central date, never from a
 * stored label or the row's position: a plan opened the next day puts Start on the right row. Days already
 * over are not shown.
 */
const TZ = 'America/Chicago';
export const centralToday = (now = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const nextDate = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === nextDate(today)) return 'Tomorrow';
  return new Date(`${date}T18:00:00Z`).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' });
}

function Block({ s, skill }: { s: PrepSegment; skill?: string }): React.ReactElement {
  const tip = `${s.title}, ${s.minutes} min${skill ? `, works on ${skill}` : ''}`;
  return (
    <span role="listitem" tabIndex={0} className={`cp-seg cp-seg-${s.kind}${s.targetSkill ? ' is-target' : ''}`} style={{ flexGrow: s.minutes }} aria-label={tip} data-minutes={s.minutes}>
      <span aria-hidden="true">{s.minutes >= 4 ? s.title.replace(/^Learn: .*/, 'Learn') : ''}</span>
      <span className="cp-seg-tip" role="tooltip">{tip}</span>
    </span>
  );
}

export function PlanView({ plan, company, skillLabels = {}, onStart, now }: {
  plan: PrepPlan | null; company?: string; skillLabels?: Record<string, string>; onStart: () => void; now?: Date;
}): React.ReactElement {
  if (!plan) return <p className="cp-pending">Pick a plan with Cora and it appears here.</p>;
  const today = centralToday(now);
  const days = plan.days.filter((d) => d.date >= today);
  if (!days.length) return <p className="cp-pending">This plan is finished. Ask Cora for a new one.</p>;
  const targeted = Array.from(new Set(days.flatMap((d) => d.segments.map((s) => s.targetSkill).filter((k): k is string => !!k))));
  const hasToday = days[0].date === today;
  return (
    <div className="cp-plan" data-testid="cp-plan">
      <h3>Your plan{company ? ` · for ${company}` : ''}</h3>
      {targeted.length > 0 && <p className="cp-muted">Built from your weakest skills: {targeted.map((k) => skillLabels[k] ?? k).join(', ')}.</p>}
      {hasToday && <button type="button" className="cp-send" onClick={onStart} data-testid="cp-start-today">Start today&apos;s session</button>}
      <ol className="cp-days">
        {days.map((d, i) => {
          const mins = d.segments.reduce((a, s) => a + s.minutes, 0);
          const label = dayLabel(d.date, today);
          return (
            <li key={d.date} className="cp-day" data-testid={`cp-day-${i}`}>
              <div className="cp-day-head"><b>{label}</b><span className="cp-muted">{mins} min</span>
                {d.date === today ? <button type="button" className="cp-chip" onClick={onStart}>Start</button> : <span className="cp-muted">Upcoming</span>}</div>
              <div className="cp-timeline" role="list" aria-label={`${label}: ${mins} minutes`}>
                {d.segments.map((s, j) => <Block key={`${s.kind}${j}`} s={s} skill={s.targetSkill ? skillLabels[s.targetSkill] ?? s.targetSkill : undefined} />)}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
