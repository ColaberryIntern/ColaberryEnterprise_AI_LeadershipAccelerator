import React from 'react';
import type { PrepDashboard, PrepInterview, PrepSkill } from './careerPrepApi';
import { LineTrend, WeeklyBars } from './charts/PrepCharts';

/**
 * Career Prep v27 (CP3.5): Your progress (kit P4.6, shots L3-2 and L3-7), one small component per section.
 * NO INVENTED DATA: a section without data is left out, and readiness under the minimum shows what to do
 * first instead of a number. Tips need data this release does not collect (time of day, practice mode
 * against real-interview results), so none are shown. The kit's SkillTable is the Skills section here.
 */
const SOURCE_LABEL: Record<string, string> = {
  video: 'video answers scored', phone_mock: 'phone mocks with Cora', real_interview: 'real interviews recorded',
  training: 'training lessons and exercises', project: 'projects verified',
};
const shortWeek = (iso: string) => new Date(`${iso}T18:00:00Z`).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' });
const changeText = (s: PrepSkill) => (s.change30 === undefined || s.change30 === 0 ? null : s.change30 > 0 ? `up ${s.change30}` : `down ${Math.abs(s.change30)}`);

export function coraRead(skills: PrepSkill[]): PrepSkill[] {
  return skills.filter((s) => s.score !== undefined).slice(0, 3);
}

function Readiness({ d }: { d: PrepDashboard }): React.ReactElement {
  const r = d.readiness;
  return (
    <section className="cp-dash-card" aria-labelledby="cp-ready-h">
      <h3 id="cp-ready-h">Interview readiness</h3>
      {r ? (
        <>
          <p className="cp-big" data-testid="cp-readiness"><b>{r.value}</b> / 100
            {r.changeSinceFirst !== undefined && <small> · {r.changeSinceFirst >= 0 ? 'up' : 'down'} {Math.abs(r.changeSinceFirst)} since your first week</small>}</p>
          <p className="cp-muted">From every video, interview, lesson and project you have done here.</p>
          {r.trend.length > 1 && <LineTrend title="Readiness by week" target={r.target} points={r.trend.map((t) => ({ label: shortWeek(t.week), value: t.value }))} />}
        </>
      ) : <p data-testid="cp-readiness-empty">Record two answers and I will have your first score. Readiness appears once five skills have enough practice behind them.</p>}
    </section>
  );
}

function Interviews({ list, onAnchor }: { list: PrepInterview[]; onAnchor: (id: string) => void }): React.ReactElement | null {
  if (!list.length) return null;
  return (
    <section className="cp-dash-card" aria-labelledby="cp-iv-h">
      <h3 id="cp-iv-h">Your interviews</h3>
      <ul className="cp-list">{list.map((i) => (
        <li key={i.id}><button type="button" className="cp-rowbtn" onClick={() => onAnchor(i.id)} data-testid={`cp-iv-${i.id}`}>
          <b>{i.company}</b> · {i.role}
          {i.readiness !== undefined ? (
            <><span className="cp-bar" aria-hidden="true"><span className="cp-bar-fill" style={{ width: `${i.readiness}%` }} /><span className="cp-bar-tick" style={{ left: `${i.target}%` }} /></span>
              <span>{i.readiness} now · {i.target} is ready</span></>
          ) : <span className="cp-muted">not enough data yet</span>}
        </button></li>
      ))}</ul>
    </section>
  );
}

function Skills({ skills, onSkill }: { skills: PrepSkill[]; onSkill: (s: PrepSkill) => void }): React.ReactElement {
  const scored = skills.filter((s) => s.score !== undefined);
  const unscored = skills.filter((s) => s.score === undefined);
  return (
    <section className="cp-dash-card" aria-labelledby="cp-sk-h">
      <h3 id="cp-sk-h">Your skills, from every source</h3>
      {scored.length === 0 && <p className="cp-muted">No skill has enough practice yet.</p>}
      <ul className="cp-list" data-testid="cp-skills">{scored.map((s) => (
        <li key={s.key}><button type="button" className="cp-rowbtn" onClick={() => onSkill(s)}>
          <span className="cp-skill-name">{s.label}</span>
          <span className="cp-bar" aria-hidden="true"><span className="cp-bar-fill" style={{ width: `${s.score}%` }} /></span>
          <b>{s.score}</b>{changeText(s) && <small> {changeText(s)} in 30 days</small>}<small className="cp-muted"> · {s.sources.join(', ')}</small>
        </button></li>
      ))}</ul>
      {unscored.length > 0 && <p className="cp-muted">Not enough data yet: {unscored.map((s) => s.label).join(', ')}.</p>}
    </section>
  );
}

function CoraRead({ skills, onSkill }: { skills: PrepSkill[]; onSkill: (s: PrepSkill) => void }): React.ReactElement | null {
  const read = coraRead(skills);
  if (!read.length) return null;
  return (
    <section className="cp-dash-card" aria-labelledby="cp-read-h">
      <h3 id="cp-read-h">Cora&apos;s read</h3>
      <ol className="cp-list">{read.map((s) => (
        <li key={s.key}><b>{s.label}</b> is at {s.score}, from {s.count} {s.count === 1 ? 'observation' : 'observations'} ({s.sources.join(', ')}).
          <button type="button" className="cp-linkbtn" onClick={() => onSkill(s)}>Make me a plan for this</button></li>
      ))}</ol>
    </section>
  );
}

function Sources({ sources }: { sources: PrepDashboard['sources'] }): React.ReactElement | null {
  const have = Object.entries(sources).filter(([, n]) => n > 0);
  if (!have.length) return null;
  return (
    <section className="cp-dash-card" aria-labelledby="cp-src-h">
      <h3 id="cp-src-h">Where the data comes from</h3>
      <ul className="cp-list">{have.map(([k, n]) => <li key={k}><b>{n}</b> {SOURCE_LABEL[k] ?? k}</li>)}</ul>
    </section>
  );
}

function Practice({ d }: { d: PrepDashboard }): React.ReactElement | null {
  const any = d.weeklyMinutes.some((w) => w.minutes > 0);
  if (!any && d.streak === 0) return null;
  return (
    <section className="cp-dash-card" aria-labelledby="cp-time-h">
      <h3 id="cp-time-h">Practice over time</h3>
      {d.streak > 0 && <p>Streak: <b>{d.streak}</b> {d.streak === 1 ? 'day' : 'days'}</p>}
      {any && <WeeklyBars title="Minutes practiced per week" points={d.weeklyMinutes.map((w) => ({ label: shortWeek(w.week), value: w.minutes }))} />}
    </section>
  );
}

export function ProgressDashboard({ d, onAnchor, onSkill }: { d: PrepDashboard; onAnchor: (id: string) => void; onSkill: (s: PrepSkill) => void }): React.ReactElement {
  return (
    <div className="cp-dash" data-testid="cp-dashboard">
      <Readiness d={d} />
      <Interviews list={d.interviews} onAnchor={onAnchor} />
      <Skills skills={d.skills} onSkill={onSkill} />
      <CoraRead skills={d.skills} onSkill={onSkill} />
      <Sources sources={d.sources} />
      <Practice d={d} />
    </div>
  );
}
