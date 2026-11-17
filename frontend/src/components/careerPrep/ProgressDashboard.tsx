import React, { useEffect, useRef, useState } from 'react';
import type { PrepDashboard, PrepInterview, PrepSkill, PrepSourceKey } from './careerPrepApi';
import { LineTrend, ProgressRing, WeeklyBars } from './charts/PrepCharts';
import { SOURCE_WORDS, SourcesPanel } from './SourcesPanel';

/**
 * Career Prep v27 (CP3.5): Your progress, laid out as the design's dashboard (shot L3-7): the readiness hero (number,
 * change since the first week, the weekly trend with a dashed "ready" line, and the interviews beside it), the skills
 * lowest first with Cora's read beside them, where the data comes from, and practice over time.
 *
 * NO INVENTED DATA: every number is the server's. A value the server could not compute is never shown as 0: readiness
 * without a score is a ring toward the first score (skills scored of the ones readiness needs), a skill without enough
 * practice is an empty gray bar saying so. Counts of sources and minutes ARE data, so a real zero is shown as zero.
 * Tips need data this release does not collect (time of day, practice mode against real-interview results), so the
 * design's "Tips from your data" is not shown.
 */

/** Mirrors backend services/careerPrep/readinessWeights.json (minSkillsForReadiness, minObservationsPerSkill). */
export const SKILLS_FOR_READINESS = 5;
export const RESULTS_PER_SKILL = 3;

const SOURCES: ReadonlyArray<{ key: keyof PrepDashboard['sources']; icon: string; label: string; word: string }> = [
  { key: 'video', icon: 'ri-vidicon-line', label: 'video answers scored', word: 'video' },
  { key: 'phone_mock', icon: 'ri-phone-line', label: 'phone mocks with Cora', word: 'phone mocks' },
  { key: 'real_interview', icon: 'ri-building-line', label: 'real interviews recorded', word: 'real interviews' },
  { key: 'training', icon: 'ri-book-open-line', label: 'training lessons done', word: 'training' },
  { key: 'project', icon: 'ri-tools-line', label: 'projects verified', word: 'projects' },
];
const SRC = new Map(SOURCES.map((s) => [s.key as string, s]));
const shortWeek = (iso: string) => new Date(`${iso}T18:00:00Z`).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' });
const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric' });

export function coraRead(skills: PrepSkill[]): PrepSkill[] {
  return skills.filter((s) => s.score !== undefined).slice(0, 3);
}

function Change({ value, suffix = '' }: { value?: number; suffix?: string }): React.ReactElement | null {
  if (value === undefined || value === 0) return null;
  const up = value > 0;
  return (
    <span className={`cp-delta ${up ? 'up' : 'down'}`}><i className={up ? 'ri-arrow-up-s-fill' : 'ri-arrow-down-s-fill'} aria-hidden="true" />
      <span className="visually-hidden">{up ? 'up' : 'down'} </span>{Math.abs(value)}{suffix}</span>
  );
}

function ReadinessNumber({ d }: { d: PrepDashboard }): React.ReactElement {
  const r = d.readiness;
  if (!r) {
    const scored = d.skills.filter((s) => s.score !== undefined).length;
    return (
      <div data-testid="cp-readiness-empty">
        <div className="cp-hero-k">Interview readiness</div>
        <div className="cp-ready-empty">
          <ProgressRing have={Math.min(scored, SKILLS_FOR_READINESS)} need={SKILLS_FOR_READINESS} label={`${scored} of ${SKILLS_FOR_READINESS} skills scored`} />
          <small>skills scored, of the {SKILLS_FOR_READINESS} your first readiness score needs</small>
        </div>
        <p className="cp-hero-note">Each skill needs {RESULTS_PER_SKILL} practice results: answers, lessons or projects.</p>
      </div>
    );
  }
  const first = r.trend[0];
  return (
    <div>
      <div className="cp-hero-k">Interview readiness</div>
      <div className="cp-bignum" data-testid="cp-readiness"><b>{r.value}</b><small>/ 100</small></div>
      {r.changeSinceFirst !== undefined && r.changeSinceFirst !== 0 && first && <div data-testid="cp-readiness-change"><Change value={r.changeSinceFirst} suffix={` since ${shortWeek(first.week)}`} /></div>}
      <p className="cp-hero-note">From every video, interview, lesson and project you have done here.</p>
    </div>
  );
}

function Trend({ d }: { d: PrepDashboard }): React.ReactElement {
  const r = d.readiness;
  if (!r || r.trend.length === 0) return <div className="cp-trend-empty" data-testid="cp-trend-empty">Your weekly trend starts with your first readiness score.</div>;
  return <LineTrend title="Readiness by week" target={r.target} points={r.trend.map((t) => ({ label: shortWeek(t.week), value: t.value }))} />;
}

function Interviews({ list, onAnchor }: { list: PrepInterview[]; onAnchor: (id: string) => void }): React.ReactElement {
  return (
    <div className="cp-iv" aria-labelledby="cp-iv-h">
      <div className="cp-hero-k" id="cp-iv-h">Your interviews</div>
      {list.length === 0 && <p className="cp-hero-note">None yet. Ask Cora to add one.</p>}
      {list.map((i) => (
        <button key={i.id} type="button" className="cp-ivrow" onClick={() => onAnchor(i.id)} data-testid={`cp-iv-${i.id}`}>
          <b>{i.company}</b><span className="cp-faint"> · {i.startsAt ? shortDay(i.startsAt) : i.role}</span>
          {i.readiness !== undefined ? (
            <><span className="cp-bar" aria-hidden="true"><span className="cp-bar-fill" style={{ width: `${i.readiness}%` }} /><span className="cp-bar-tick" style={{ left: `${i.target}%` }} /></span>
              <small>{i.readiness} now · {i.target} is ready</small></>
          ) : (
            <><span className="cp-bar is-empty" aria-hidden="true"><span className="cp-bar-tick" style={{ left: `${i.target}%` }} /></span>
              <small>not enough data yet · {i.target} is ready</small></>
          )}
        </button>
      ))}
    </div>
  );
}

/** How a source icon names itself to a screen reader: "Pace and clarity: 3 video results" when the skill has one source. */
export function sourceButtonLabel(s: PrepSkill, k: string): string {
  const w = SOURCE_WORDS[k as PrepSourceKey] ?? { one: 'result', many: 'results' };
  if (s.sources.length === 1) return `${s.label}: ${s.count} ${s.count === 1 ? w.one : w.many}`;
  return `${s.label}: the ${w.many} behind this score`;
}

/** R1.1: the plan button covers the name, bar and number; each source icon is its OWN button beside it (never nested). */
interface RowProps { s: PrepSkill; onSkill: (s: PrepSkill) => void; onSource: (s: PrepSkill, k: PrepSourceKey) => void; isNew: boolean; focused: boolean; busy: boolean }
function SkillRow({ s, onSkill, onSource, isNew, focused, busy }: RowProps): React.ReactElement {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => { if (focused) ref.current?.scrollIntoView?.({ block: 'center' }); }, [focused]);
  const srcs = (
    <span className="cp-srcs">{s.sources.map((k) => (
      <button key={k} type="button" className="cp-srcbtn" onClick={() => onSource(s, k as PrepSourceKey)} aria-label={sourceButtonLabel(s, k)}
        title={sourceButtonLabel(s, k)} data-testid={`cp-src-${s.key}-${k}`}><i className={SRC.get(k)?.icon ?? 'ri-checkbox-blank-circle-line'} aria-hidden="true" /></button>
    ))}</span>
  );
  const name = <span className="cp-skill-name">{s.label}{isNew && <span className="cp-new" data-testid={`cp-new-${s.key}`}> New</span>}</span>;
  const cls = `cp-skrow${isNew ? ' is-new' : ''}${focused ? ' is-focus' : ''}`;
  const planLabel = `${s.label}: make me a plan for this`;
  if (s.score === undefined) {
    return (
      <li className={cls} ref={ref} data-testid={`cp-skrow-${s.key}`}>
        <button type="button" className="cp-rowbtn is-unscored" onClick={() => onSkill(s)} disabled={busy} aria-label={planLabel} data-testid={`cp-skill-${s.key}`}>
          {name}<span className="cp-skill-empty"><span className="cp-bar is-empty" aria-hidden="true" />
            <span className="cp-skill-none">not enough practice yet{s.count > 0 ? ` · ${Math.min(s.count, RESULTS_PER_SKILL)} of ${RESULTS_PER_SKILL}` : ''}</span></span>
        </button>{srcs}
      </li>
    );
  }
  return (
    <li className={cls} ref={ref} data-testid={`cp-skrow-${s.key}`}>
      <button type="button" className="cp-rowbtn" onClick={() => onSkill(s)} disabled={busy} aria-label={`${planLabel} (score ${s.score})`} data-testid={`cp-skill-${s.key}`}>
        {name}<span className="cp-bar" aria-hidden="true"><span className="cp-bar-fill" style={{ width: `${s.score}%` }} /></span>
        <span className="cp-skill-v">{s.score}</span><span>{s.change30 !== undefined && <Change value={s.change30} />}{s.change30 !== undefined && s.change30 !== 0 && <span className="visually-hidden"> in 30 days</span>}</span>
      </button>{srcs}
    </li>
  );
}

interface PlanProps { onSkill: (s: PrepSkill) => void; planBusy?: boolean }
function Skills({ skills, onSkill, onSource, newKeys = [], focusKey, planBusy = false }: PlanProps & { skills: PrepSkill[]; onSource: RowProps['onSource']; newKeys?: string[]; focusKey?: string }): React.ReactElement {
  return (
    <section className="cp-dash-card" aria-labelledby="cp-sk-h">
      <h3 id="cp-sk-h">Your skills, from every source</h3>
      <p className="cp-subline">Lowest first. Pick one to ask Cora for a plan; an icon shows where its score comes from. The arrows are the change over 30 days.</p>
      {skills.length === 0 ? <p className="cp-muted">No skill has any practice yet.</p> : (
        <ul className="cp-skills" data-testid="cp-skills">{skills.map((s) => (
          <SkillRow key={s.key} s={s} onSkill={onSkill} onSource={onSource} isNew={newKeys.includes(s.key)} focused={focusKey === s.key} busy={planBusy} />
        ))}</ul>
      )}
    </section>
  );
}

function CoraRead({ skills, onSkill, planBusy = false, building }: PlanProps & { skills: PrepSkill[]; building: string | null }): React.ReactElement | null {
  const read = coraRead(skills);
  if (!read.length) return null;
  return (
    <section className="cp-dash-card" aria-labelledby="cp-read-h">
      <h3 id="cp-read-h">Cora&apos;s read</h3>
      <p className="cp-subline">Your lowest scores, and what they come from</p>
      <ol className="cp-read">{read.map((s) => (
        <li key={s.key}><b>{s.label}</b>
          <small>{s.score} · from {s.count} {s.count === 1 ? 'result' : 'results'} ({s.sources.map((k) => SRC.get(k)?.word ?? k).join(', ')})</small>
          <button type="button" className="cp-ghost sm" onClick={() => onSkill(s)} disabled={planBusy} aria-busy={planBusy && building === s.key}
            data-testid={`cp-read-plan-${s.key}`}>{planBusy && building === s.key ? 'Building your plan...' : 'Make me a plan for this'}</button></li>
      ))}</ol>
    </section>
  );
}

function Sources({ sources }: { sources: PrepDashboard['sources'] }): React.ReactElement {
  return (
    <section className="cp-dash-card" aria-labelledby="cp-src-h">
      <h3 id="cp-src-h">Where the data comes from</h3>
      <p className="cp-subline">Everything Cora reads to coach you</p>
      <ul className="cp-tiles" data-testid="cp-tiles">{SOURCES.map((s) => (
        <li key={s.key} className={`cp-tile${sources[s.key] ? '' : ' is-zero'}`}><b>{sources[s.key]}</b><small><i className={s.icon} aria-hidden="true" />{s.label}</small></li>
      ))}</ul>
    </section>
  );
}

function Practice({ d }: { d: PrepDashboard }): React.ReactElement {
  const any = d.weeklyMinutes.some((w) => w.minutes > 0);
  return (
    <section className="cp-dash-card" aria-labelledby="cp-time-h">
      <h3 id="cp-time-h">Practice over time</h3>
      <p className="cp-subline">Minutes per week · {d.streak > 0 ? `${d.streak}-day streak` : 'no streak yet'}</p>
      {d.weeklyMinutes.length > 0 && <WeeklyBars title="Minutes practiced per week" points={d.weeklyMinutes.map((w) => ({ label: shortWeek(w.week), value: w.minutes }))} />}
      {!any && <p className="cp-muted cp-small">No practice minutes yet. Your first session starts this chart.</p>}
    </section>
  );
}

/**
 * `newKeys`: skills the session just finished changed (CP4.5), marked New. `focusKey` (R1.1): a skill picked in the
 * left rail, scrolled to and outlined. `planBusy`: a plan is being built; every plan button waits (no repeat clicks),
 * and the one that was clicked in Cora's read says so.
 */
export function ProgressDashboard({ d, onAnchor, onSkill, newKeys, focusKey, planBusy = false }: {
  d: PrepDashboard; onAnchor: (id: string) => void; onSkill: (s: PrepSkill) => void; newKeys?: string[]; focusKey?: string; planBusy?: boolean;
}): React.ReactElement {
  const read = coraRead(d.skills).length > 0;
  const [panel, setPanel] = useState<{ skill: PrepSkill; source: PrepSourceKey } | null>(null);
  const [building, setBuilding] = useState<string | null>(null);
  useEffect(() => { if (!planBusy) setBuilding(null); }, [planBusy]);
  const plan = (s: PrepSkill) => { if (planBusy) return; setBuilding(s.key); onSkill(s); };
  return (
    <div className="cp-dash" data-testid="cp-dashboard">
      {panel && <SourcesPanel skill={panel.skill} source={panel.source} onClose={() => setPanel(null)} />}
      <section className="cp-dash-card cp-rhero" aria-label="Interview readiness">
        <ReadinessNumber d={d} />
        <Trend d={d} />
        <Interviews list={d.interviews} onAnchor={onAnchor} />
      </section>
      <div className={read ? 'cp-grid2 wide' : 'cp-dash'}>
        <Skills skills={d.skills} onSkill={plan} onSource={(skill, source) => setPanel({ skill, source })} newKeys={newKeys} focusKey={focusKey} planBusy={planBusy} />
        <CoraRead skills={d.skills} onSkill={plan} planBusy={planBusy} building={building} />
      </div>
      <div className="cp-grid2">
        <Sources sources={d.sources} />
        <Practice d={d} />
      </div>
    </div>
  );
}
