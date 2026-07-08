import React, { useCallback, useMemo, useState } from 'react';
import PortalShell from '../today/PortalShell';
import './SchedulePage.css';

/**
 * Schedule — faithful React port of the Design E "Schedule" view (ONE SPINE).
 *
 * Renders every task from all four tracks (Learning / Project / Internship /
 * Cert) plus live events on one timeline, in Month / Week / Agenda modes, with
 * period navigation, a Today button, a points bank, and a color legend.
 *
 * The 12-week program is seeded once (useMemo). All dates are anchored to a
 * fixed program "today" (Aug 11 2026, Week 5) exactly as the mockup does, so the
 * seeded done/prog/up states line up. Per the repo's date-helper rule, no
 * `new Date()`/`Date.now()` runs at module top-level — the anchors are computed
 * inside the component/memo bodies.
 *
 * Clicking an event is a no-op here: the mockup's drill / task-detail panels are
 * intentionally not ported.
 */

// ── Fixed program anchors (Design E). Constructed lazily inside the component,
//    never at module top-level, so the worktree date-helper rule holds.
const KICKOFF_Y = 2026, KICKOFF_M = 6, KICKOFF_D = 13; // 2026-07-13 cohort kickoff (Monday)

const WEEK_NAMES = [
  'Claude Code Foundations', 'Agent Skills', 'Claude API + Workflow Assistant',
  'Prompt Engineering', 'MCP Foundations', 'Advanced MCP', 'Subagents / Multi-Agent',
  'Workflows / Automation', 'Reliability', 'Governance', 'Systems Architecture',
  'Capstone + Architect Expo',
];

const PTS = { video: 35, test: 40, lab: 90, survey: 25, cert: 60, event: 15, project: 50, internship: 30 };

const TOTAL_PTS = 2140;

type EvType = 'learning' | 'project' | 'internship' | 'cert' | 'event';
type EvState = 'done' | 'prog' | 'up' | 'lock';
type SchedEvent = {
  type: EvType;
  taskType: string;
  title: string;
  pts: number;
  state: EvState;
  time?: string;
};
type SchedMap = Record<string, SchedEvent[]>;

type Mode = 'month' | 'week' | 'agenda';

const DAY_MS = 7 * 864e5; // one week in ms (as in the mockup's weekNumFor)

const dkey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// ── Seed the 12-week program keyed by date. Mirrors the mockup's seed().
function buildSchedule(kickoff: Date): SchedMap {
  const sched: SchedMap = {};
  const addEv = (d: Date, o: SchedEvent): void => {
    const k = dkey(d);
    (sched[k] = sched[k] || []).push(o);
  };
  const wkMon = (n: number): Date => {
    const d = new Date(kickoff);
    d.setDate(kickoff.getDate() + (n - 1) * 7);
    return d;
  };

  for (let w = 1; w <= 12; w++) {
    const mon = wkMon(w);
    const past = w < 5, cur = w === 5;
    const mk = (off: number, o: SchedEvent): void => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + off);
      addEv(d, o);
    };
    // Monday Architecture Day (live event)
    mk(0, { type: 'event', taskType: 'video', title: 'Architecture Day · ' + WEEK_NAMES[w - 1], pts: PTS.event, state: past ? 'done' : cur ? 'done' : 'up', time: '10:00 AM' });
    // Learning items
    mk(0, { type: 'learning', taskType: 'video', title: 'Course · ' + WEEK_NAMES[w - 1], pts: PTS.video, state: past ? 'done' : cur ? 'done' : 'up' });
    mk(1, { type: 'learning', taskType: 'video', title: 'Video · ' + WEEK_NAMES[w - 1] + ' deep dive', pts: PTS.video, state: past ? 'done' : cur ? 'done' : 'up' });
    mk(2, { type: 'learning', taskType: 'lab', title: 'Lab · ' + WEEK_NAMES[w - 1] + ' build', pts: PTS.lab, state: past ? 'done' : cur ? 'prog' : 'up' });
    mk(2, { type: 'learning', taskType: 'test', title: 'Quiz · ' + WEEK_NAMES[w - 1] + ' check', pts: PTS.test, state: past ? 'done' : 'up' });
    // Thursday Build Day + project
    mk(3, { type: 'event', taskType: 'video', title: 'Build Day · live demos', pts: PTS.event, state: past ? 'done' : 'up', time: '10:00 AM' });
    mk(3, { type: 'project', taskType: 'lab', title: 'Project · Recipe Concierge step', pts: PTS.project, state: past ? 'done' : 'up' });
    // Friday cert pulse
    mk(4, { type: 'cert', taskType: 'survey', title: 'CCA-F · Week ' + w + ' confidence pulse', pts: PTS.survey, state: past ? 'done' : 'up' });
  }
  // internship + a SkillsJar cert milestone in week 5
  const w5 = wkMon(5);
  const wed = new Date(w5); wed.setDate(w5.getDate() + 2);
  addEv(wed, { type: 'internship', taskType: 'test', title: 'Internship · Data-source review (Acme)', pts: PTS.internship, state: 'up' });
  const tue = new Date(w5); tue.setDate(w5.getDate() + 1);
  addEv(tue, { type: 'cert', taskType: 'cert', title: 'SkillsJar · Introduction to MCP cert', pts: PTS.cert, state: 'up' });

  return sched;
}

const TYPE_CLASS: Record<EvType, string> = {
  learning: 'learning', project: 'project', internship: 'internship', cert: 'cert', event: 'event',
};

// deterministic time-slot for the week time-grid (0..3 → 9:00 / 11:00 / 14:00 / 16:00)
const TG_SLOTS = ['9:00', '11:00', '14:00', '16:00'];
function slotForEv(ev: SchedEvent): number {
  if (ev.type === 'event') return 0;       // live days
  if (ev.taskType === 'video') return 1;    // learning videos late morning
  if (ev.taskType === 'lab') return 2;      // labs early afternoon
  if (ev.type === 'project') return 2;
  return 3;                                 // quizzes / surveys / cert / internship
}

// ── small SVG helpers (no emoji; inline SVG per design system) ──
const CheckIcon: React.FC<{ w?: number; h?: number; stroke?: string }> = ({ w = 13, h = 13, stroke = 'var(--leaf-action)' }) => (
  <svg width={w} height={h} viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke={stroke} strokeWidth="3" strokeLinecap="round" /></svg>
);
const ProgIcon: React.FC<{ w?: number; h?: number; stroke?: string }> = ({ w = 13, h = 13, stroke = 'var(--berry)' }) => (
  <svg width={w} height={h} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={stroke} strokeWidth="2" /><path d="M12 7v5l3 2" stroke={stroke} strokeWidth="2" strokeLinecap="round" /></svg>
);
const TodoIcon: React.FC<{ w?: number; h?: number; stroke?: string }> = ({ w = 13, h = 13, stroke = 'currentColor' }) => (
  <svg width={w} height={h} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={stroke} strokeWidth="2" /></svg>
);

// status pip shown on the .tk chips (week header)
const StatusPip: React.FC<{ state: EvState }> = ({ state }) => {
  if (state === 'done') return <span className="stpip"><CheckIcon w={12} h={12} stroke="currentColor" /> done</span>;
  if (state === 'prog') return <span className="stpip" style={{ color: 'var(--berry)' }}><ProgIcon w={12} h={12} stroke="currentColor" /> in progress</span>;
  if (state === 'lock') return (
    <span className="stpip">
      <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" /></svg>
      upcoming
    </span>
  );
  return <span className="stpip" style={{ color: 'var(--text-muted)' }}><TodoIcon w={12} h={12} stroke="currentColor" /> to do</span>;
};

const stPipText = (s: EvState): string => (s === 'done' ? ' · done' : s === 'prog' ? ' · in progress' : s === 'lock' ? ' · upcoming' : '');

const SchedulePage: React.FC = () => {
  // Fixed anchors, computed inside the component (never at module top-level).
  const kickoff = useMemo(() => new Date(KICKOFF_Y, KICKOFF_M, KICKOFF_D), []);
  const today = useMemo(() => new Date(2026, 7, 11), []);          // Tue Aug 11, Week 5
  const week5Mon = useMemo(() => new Date(2026, 7, 10), []);       // Aug 10 = start of Week 5
  const sched = useMemo(() => buildSchedule(kickoff), [kickoff]);

  const weekNumFor = useCallback((d: Date): number | null => {
    const diff = Math.floor((d.getTime() - kickoff.getTime()) / DAY_MS);
    return diff >= 0 && diff < 12 ? diff + 1 : null;
  }, [kickoff]);

  const [mode, setMode] = useState<Mode>('week');
  // month cursor is first-of-month; week/agenda cursor is Monday of the shown week.
  const [cursor, setCursor] = useState<Date>(() => new Date(2026, 7, 10));

  const setView = useCallback((m: Mode): void => {
    setMode(m);
    if (m === 'month') setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    else setCursor(new Date(week5Mon));
  }, [today, week5Mon]);

  const goToday = useCallback((): void => {
    if (mode === 'month') setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    else setCursor(new Date(week5Mon));
  }, [mode, today, week5Mon]);

  const nav = useCallback((dir: number): void => {
    setCursor((prev) => {
      const next = new Date(prev);
      if (mode === 'month') next.setMonth(next.getMonth() + dir);
      else next.setDate(next.getDate() + 7 * dir);
      return next;
    });
  }, [mode]);

  // ── period label ──
  const periodLabel = useMemo((): string => {
    if (mode === 'month') return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const ws = new Date(cursor), we = new Date(cursor); we.setDate(ws.getDate() + 4);
    const wk = weekNumFor(cursor);
    return (wk ? 'Week ' + wk + ' · ' : '')
      + ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      + ' – ' + we.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, [mode, cursor, weekNumFor]);

  // ── points bank (day / period) ──
  const { dayPts, periodPts } = useMemo(() => {
    let day = 0, period = 0;
    const inPeriod = (d: Date): boolean => {
      if (mode === 'month') return d.getMonth() === cursor.getMonth();
      const ws = new Date(cursor), we = new Date(cursor); we.setDate(ws.getDate() + 6);
      return d >= ws && d <= we;
    };
    Object.keys(sched).forEach((k) => {
      const [y, m, dd] = k.split('-').map(Number);
      const d = new Date(y, m, dd);
      sched[k].forEach((ev) => {
        if (ev.state === 'done') {
          if (inPeriod(d)) period += ev.pts;
          if (dkey(d) === dkey(today)) day += ev.pts;
        }
      });
    });
    return { dayPts: day, periodPts: period };
  }, [mode, cursor, sched, today]);

  const isToday = useCallback((d: Date): boolean => dkey(d) === dkey(today), [today]);

  // ── MONTH ──
  const renderMonth = (): React.ReactNode => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7)); // back to Monday
    const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const cells: React.ReactNode[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const out = d.getMonth() !== cursor.getMonth();
      const k = dkey(d);
      const evs = sched[k] || [];
      const wk = weekNumFor(d);
      const dots = evs.slice(0, 3).map((ev, idx) => (
        <div
          key={idx}
          className={`mdot ${TYPE_CLASS[ev.type]}${ev.state === 'done' ? ' done' : ''}${ev.state === 'lock' ? ' lock' : ''}`}
        >
          <b>{ev.title.split(' · ')[0]}</b>
          <span className="mp">+{ev.pts}</span>
        </div>
      ));
      const more = evs.length > 3 ? <div className="mmore">+{evs.length - 3} more</div> : null;
      cells.push(
        <div key={i} className={`mcell${out ? ' out' : ''}${isToday(d) ? ' today' : ''}`}>
          <div className="dn">
            <span>{d.getDate()}</span>
            {wk && d.getDay() === 1 ? <span className="wkn">W{wk}</span> : null}
          </div>
          {dots}
          {more}
        </div>
      );
    }
    return (
      <div className="monthgrid">
        {dows.map((d) => <div key={d} className="moh">{d}</div>)}
        {cells}
      </div>
    );
  };

  // ── WEEK (time grid) ──
  const renderWeek = (): React.ReactNode => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const wk = weekNumFor(cursor);
    // bucket events by `${dayIndex}-${slotIndex}`
    const buckets: Record<string, { ev: SchedEvent; k: string; idx: number }[]> = {};
    for (let i = 0; i < 5; i++) {
      const d = new Date(cursor); d.setDate(cursor.getDate() + i);
      const k = dkey(d);
      (sched[k] || []).forEach((ev, idx) => {
        const s = slotForEv(ev);
        const key = i + '-' + s;
        (buckets[key] = buckets[key] || []).push({ ev, k, idx });
      });
    }
    return (
      <>
        <div className="sch-weekhdr">
          <span className="chip learning"><span className="sw" />{wk ? 'Week ' + wk + ' · ' + WEEK_NAMES[wk - 1] : 'Outside program'}</span>
        </div>
        <div className="timegrid">
          <div className="tg-corner" />
          {days.map((dn, i) => {
            const d = new Date(cursor); d.setDate(cursor.getDate() + i);
            const sl = i === 0 ? 'Architecture Day' : i === 3 ? 'Build Day' : '';
            return (
              <div key={i} className={`tg-dayhead${isToday(d) ? ' today' : ''}`}>
                <div className="d">{dn}</div>
                <div className="n">{d.getDate()}</div>
                {sl ? <div className="sl">{sl}</div> : null}
              </div>
            );
          })}
          {TG_SLOTS.map((slot, s) => (
            <React.Fragment key={slot}>
              <div className="tg-time">{slot}</div>
              {days.map((_, i) => {
                const d = new Date(cursor); d.setDate(cursor.getDate() + i);
                const items = buckets[i + '-' + s] || [];
                return (
                  <div key={i} className={`tg-cell${isToday(d) ? ' today' : ''}`}>
                    {items.map(({ ev, k, idx }) => (
                      <div
                        key={k + '-' + idx}
                        className={`tg-ev ${TYPE_CLASS[ev.type]}${ev.state === 'done' ? ' done' : ''}${ev.state === 'lock' ? ' locked' : ''}`}
                      >
                        <b>{ev.title.split(' · ')[0]}</b>
                        <span className="tgp">+{ev.pts} · {ev.taskType}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </>
    );
  };

  // ── AGENDA ──
  const renderAgenda = (): React.ReactNode => {
    const ws = new Date(cursor);
    const blocks: React.ReactNode[] = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(ws); d.setDate(ws.getDate() + i);
      const k = dkey(d);
      const evs = sched[k] || [];
      if (!evs.length) continue;
      blocks.push(
        <div key={k}>
          <div className="agenda-day">
            <div className="dh">
              {d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              {isToday(d) ? ' — Today' : ''}
            </div>
          </div>
          <div className="queue agenda-queue">
            {evs.map((ev, idx) => {
              const done = ev.state === 'done';
              return (
                <button key={idx} className={`qtask${done ? ' done' : ''}`} type="button">
                  <span className="qrank">{done ? '✓' : ev.state === 'lock' ? '\u{1F512}' : '·'}</span>
                  <span className="qbody">
                    <span className="qtitle">{ev.title}</span>
                    <span className="qmeta">
                      <span className={`chip ${TYPE_CLASS[ev.type]}`}><span className="sw" />{ev.type}</span>
                      <span className={`ptbadge${done ? ' earned' : ''}`}>+{ev.pts} pts</span>
                      {' · '}{ev.taskType}{stPipText(ev.state)}
                    </span>
                  </span>
                  <svg className="qgo" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    if (!blocks.length) return <div className="sch-empty">No scheduled items this week.</div>;
    return <>{blocks}</>;
  };

  return (
    <PortalShell>
      <div className="te-page-h">
        <div className="crumb">One Spine</div>
        <h1>Your schedule</h1>
        <div className="sub">Every task from all four tracks on one timeline — scroll back through completed work or ahead to preview what's coming across all 12 weeks.</div>
      </div>

      <div className="sch-root">
        <div className="schtoolbar">
          <div className="toggle">
            <button className={mode === 'month' ? 'active' : ''} onClick={() => setView('month')} type="button">Month</button>
            <button className={mode === 'week' ? 'active' : ''} onClick={() => setView('week')} type="button">Week</button>
            <button className={mode === 'agenda' ? 'active' : ''} onClick={() => setView('agenda')} type="button">Agenda</button>
          </div>
          <div className="navbtns">
            <button className="navarrow" onClick={() => nav(-1)} aria-label="Previous" type="button">
              <svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div className="periodlbl">{periodLabel}</div>
            <button className="navarrow" onClick={() => nav(1)} aria-label="Next" type="button">
              <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button className="sch-btn ghost sm" onClick={goToday} type="button">Today</button>
          </div>
          <div className="ptsbank">
            <div className="ptchip"><span className="v">+{dayPts}</span><span className="l">This day</span></div>
            <div className="ptchip"><span className="v">+{periodPts}</span><span className="l">This period</span></div>
            <div className="ptchip"><span className="v">{TOTAL_PTS.toLocaleString()}</span><span className="l">Total pts</span></div>
          </div>
        </div>

        <div>
          {mode === 'month' ? renderMonth() : mode === 'week' ? renderWeek() : renderAgenda()}
        </div>

        <div className="legend">
          <span><span className="chip learning"><span className="sw" style={{ background: 'var(--dv-learning)' }} />Learning</span></span>
          <span><span className="chip" style={{ background: 'rgba(91,166,60,.16)', color: 'var(--leaf-text)' }}><span className="sw" style={{ background: 'var(--dv-project2)' }} />Project</span></span>
          <span><span className="chip" style={{ background: 'rgba(232,146,12,.16)', color: 'var(--amber-deep)' }}><span className="sw" style={{ background: 'var(--amber)' }} />Internship</span></span>
          <span><span className="chip" style={{ background: 'rgba(46,106,134,.14)', color: 'var(--berry)' }}><span className="sw" style={{ background: 'var(--dv-cert2)' }} />Cert · CCA-F</span></span>
          <span><span className="chip event"><span className="sw" />Live event</span></span>
          <span style={{ marginLeft: 8, display: 'inline-flex', gap: 6, alignItems: 'center' }}><CheckIcon /> done</span>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><ProgIcon /> in progress</span>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><TodoIcon /> not started</span>
        </div>
      </div>
    </PortalShell>
  );
};

export default SchedulePage;
