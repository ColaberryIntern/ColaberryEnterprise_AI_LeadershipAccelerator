import React from 'react';
import type { PrepDashboard, PrepSkill } from './careerPrepApi';
import { LineTrend, WeeklyBars } from './charts/PrepCharts';

/**
 * Career Prep v27 (CP3.5): Your progress (kit P4.6, shots L3-2 and L3-7). Readiness with its weekly
 * trend; your interviews; your skills lowest first; Cora's read; where the data comes from; practice
 * over time. NO INVENTED DATA: an element without data is left out, and readiness under the minimum
 * shows what to do first instead of a number. Tips need data this release does not collect yet
 * (time of day, practice mode against real-interview results), so none are shown.
 */
const SOURCE_LABEL: Record<string, string> = {
  video: 'video answers scored', phone_mock: 'phone mocks with Cora', real_interview: 'real interviews recorded',
  training: 'training lessons and exercises', project: 'projects verified',
};
const shortWeek = (iso: string) => new Date(`${iso}T18:00:00Z`).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' });

function change(s: PrepSkill): string | null {
  if (s.change30 === undefined || s.change30 === 0) return null;
  return s.change30 > 0 ? `up ${s.change30}` : `down ${Math.abs(s.change30)}`;
}

export function coraRead(skills: PrepSkill[]): PrepSkill[] {
  return skills.filter((s) => s.score !== undefined).slice(0, 3);
}

export function ProgressDashboard({ d, onAnchor, onSkill }: { d: PrepDashboard; onAnchor: (id: string) => void; onSkill: (s: PrepSkill) => void }): React.ReactElement {
  const scored = d.skills.filter((s) => s.score !== undefined);
  const unscored = d.skills.filter((s) => s.score === undefined);
  const sources = Object.entries(d.sources).filter(([, n]) => n > 0);
  const read = coraRead(d.skills);
  const minutes = d.weeklyMinutes.filter((w) => w.minutes > 0);
  return (
    <div className="cp-dash" data-testid="cp-dashboard">
      <section className="cp-dash-card" aria-labelledby="cp-ready-h">
        <h3 id="cp-ready-h">Interview readiness</h3>
        {d.readiness ? (
          <>
            <p className="cp-big" data-testid="cp-readiness"><b>{d.readiness.value}</b> / 100
              {d.readiness.changeSinceFirst !== undefined && <small> · {d.readiness.changeSinceFirst >= 0 ? 'up' : 'down'} {Math.abs(d.readiness.changeSinceFirst)} since your first week</small>}</p>
            <p className="cp-muted">From every video, interview, lesson and project you have done here.</p>
            {d.readiness.trend.length > 1 && <LineTrend title="Readiness by week" target={d.readiness.target} points={d.readiness.trend.map((t) => ({ label: shortWeek(t.week), value: t.value }))} />}
          </>
        ) : (
          <p data-testid="cp-readiness-empty">Record two answers and I will have your first score. Readiness appears once five skills have enough practice behind them.</p>
        )}
      </section>

      {d.interviews.length > 0 && (
        <section className="cp-dash-card" aria-labelledby="cp-iv-h">
          <h3 id="cp-iv-h">Your interviews</h3>
          <ul className="cp-list">
            {d.interviews.map((i) => (
              <li key={i.id}><button type="button" className="cp-rowbtn" onClick={() => onAnchor(i.id)}>
                <b>{i.company}</b> · {i.role}
                {i.readiness !== undefined ? <span> · {i.readiness} now · {i.target} is ready</span> : <span className="cp-muted"> · not enough data yet</span>}
              </button></li>
            ))}
          </ul>
        </section>
      )}

      <section className="cp-dash-card" aria-labelledby="cp-sk-h">
        <h3 id="cp-sk-h">Your skills, from every source</h3>
        {scored.length === 0 && <p className="cp-muted">No skill has enough practice yet.</p>}
        <ul className="cp-list" data-testid="cp-skills">
          {scored.map((s) => (
            <li key={s.key}><button type="button" className="cp-rowbtn" onClick={() => onSkill(s)}>
              <span className="cp-skill-name">{s.label}</span>
              <span className="cp-bar" aria-hidden="true"><span className="cp-bar-fill" style={{ width: `${s.score}%` }} /></span>
              <b>{s.score}</b>{change(s) && <small> {change(s)} in 30 days</small>}
              <small className="cp-muted"> · {s.sources.join(', ')}</small>
            </button></li>
          ))}
        </ul>
        {unscored.length > 0 && <p className="cp-muted">Not enough data yet: {unscored.map((s) => s.label).join(', ')}.</p>}
      </section>

      {read.length > 0 && (
        <section className="cp-dash-card" aria-labelledby="cp-read-h">
          <h3 id="cp-read-h">Cora&apos;s read</h3>
          <ol className="cp-list">
            {read.map((s) => <li key={s.key}><b>{s.label}</b> is at {s.score}, from {s.count} {s.count === 1 ? 'observation' : 'observations'} ({s.sources.join(', ')}).
              <button type="button" className="cp-linkbtn" onClick={() => onSkill(s)}>Make me a plan for this</button></li>)}
          </ol>
        </section>
      )}

      {sources.length > 0 && (
        <section className="cp-dash-card" aria-labelledby="cp-src-h">
          <h3 id="cp-src-h">Where the data comes from</h3>
          <ul className="cp-list">{sources.map(([k, n]) => <li key={k}><b>{n}</b> {SOURCE_LABEL[k] ?? k}</li>)}</ul>
        </section>
      )}

      {(minutes.length > 0 || d.streak > 0) && (
        <section className="cp-dash-card" aria-labelledby="cp-time-h">
          <h3 id="cp-time-h">Practice over time</h3>
          {d.streak > 0 && <p>Streak: <b>{d.streak}</b> {d.streak === 1 ? 'day' : 'days'}</p>}
          {minutes.length > 0 && <WeeklyBars title="Minutes practiced per week" points={d.weeklyMinutes.map((w) => ({ label: shortWeek(w.week), value: w.minutes }))} />}
        </section>
      )}
    </div>
  );
}
