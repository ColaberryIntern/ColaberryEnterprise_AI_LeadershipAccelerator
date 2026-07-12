import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalShell from '../today/PortalShell';
import portalApi from '../../utils/portalApi';
import { fetchSchedule, fetchPublicEvents, OpenHouseView } from '../../services/onboardingApi';
import './SchedulePage.css';

/**
 * Schedule — real-data calendar (Month / Week / Agenda).
 *
 * Renders the learner's cohort class sessions (`/api/portal/sessions`) and the
 * program's public events (`/api/portal/events`, sourced from CCPP) on one
 * timeline. Anchored to the REAL current date and the cohort's first-class date;
 * no seeded mock. Per the repo date-helper rule, no `new Date()` / `Date.now()`
 * runs at module top-level — every "now" is computed inside the component/hooks.
 */

type SessionItem = {
  id: string;
  session_number: number;
  title: string;
  session_date: string;   // YYYY-MM-DD
  start_time: string | null;
  status: string;         // scheduled | live | completed | cancelled
  session_type: string;
};

type EvKind = 'class' | 'event'; // class = cohort session, event = public open house
type EvState = 'done' | 'live' | 'up';
type SchedEvent = {
  id: string;
  kind: EvKind;
  title: string;
  time: string;   // display time ('' if none)
  hour: number;   // 0..23 for time-grid slotting, -1 if unknown
  state: EvState;
  href?: string;
  external?: boolean;
  sub: string;    // session_type or 'Open House'
};
type SchedMap = Record<string, SchedEvent[]>;
type Mode = 'month' | 'week' | 'agenda';

const DAY_MS = 7 * 864e5;

const dkey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const dateOnly = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mondayOf = (d: Date): Date => { const x = new Date(d); x.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return x; };

/** Parse a DATEONLY 'YYYY-MM-DD' as a LOCAL date (avoids a UTC off-by-one). */
function parseYmd(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** '13:00[:00]' or a Date -> '1:00 PM'. */
function fmtTime(t: string | null | undefined, from?: Date): string {
  let h: number, min: number;
  if (from) { h = from.getHours(); min = from.getMinutes(); }
  else if (t && /^\d{1,2}:\d{2}/.test(t)) { const [hh, mm] = t.split(':'); h = Number(hh); min = Number(mm); }
  else return '';
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${ap}`;
}
function hourOf(t: string | null | undefined, from?: Date): number {
  if (from) return from.getHours();
  if (t && /^\d{1,2}:/.test(t)) return Number(t.split(':')[0]);
  return -1;
}

const KIND_CLASS: Record<EvKind, string> = { class: 'learning', event: 'event' };

function stateForSession(status: string, day: Date, today: Date): EvState {
  if (status === 'completed') return 'done';
  if (status === 'live') return 'live';
  return day.getTime() < today.getTime() ? 'done' : 'up';
}

function buildSchedule(sessions: SessionItem[], events: OpenHouseView[], today: Date): SchedMap {
  const sched: SchedMap = {};
  const add = (d: Date, ev: SchedEvent): void => { const k = dkey(d); (sched[k] = sched[k] || []).push(ev); };

  for (const s of sessions) {
    if (s.status === 'cancelled') continue;
    const d = parseYmd(s.session_date);
    if (!d) continue;
    add(d, {
      id: s.id, kind: 'class', title: `#${s.session_number} · ${s.title}`,
      time: fmtTime(s.start_time), hour: hourOf(s.start_time),
      state: stateForSession(s.status, d, today),
      href: `/portal/sessions/${s.id}`, sub: (s.session_type || 'session').replace(/_/g, ' '),
    });
  }
  for (const e of events) {
    const dt = new Date(e.starts_at);
    if (isNaN(dt.getTime())) continue;
    add(dateOnly(dt), {
      id: e.id, kind: 'event', title: e.title,
      time: fmtTime(null, dt), hour: hourOf(null, dt), state: 'up',
      href: e.registration_url || undefined, external: true, sub: 'Open House',
    });
  }
  Object.keys(sched).forEach((k) =>
    sched[k].sort((a, b) => (a.hour - b.hour) || a.title.localeCompare(b.title)));
  return sched;
}

const slotForHour = (h: number): number => (h < 10 ? 0 : h < 13 ? 1 : h < 16 ? 2 : 3);
const TG_SLOTS = ['Morning', 'Midday', 'Afternoon', 'Evening'];

// ── small SVG helpers (no emoji; inline SVG per design system) ──
const CheckIcon: React.FC<{ w?: number; h?: number; stroke?: string }> = ({ w = 13, h = 13, stroke = 'var(--leaf-action)' }) => (
  <svg width={w} height={h} viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke={stroke} strokeWidth="3" strokeLinecap="round" /></svg>
);
const LiveIcon: React.FC = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" fill="var(--berry)" /></svg>
);
const TodoIcon: React.FC<{ w?: number; h?: number; stroke?: string }> = ({ w = 13, h = 13, stroke = 'currentColor' }) => (
  <svg width={w} height={h} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={stroke} strokeWidth="2" /></svg>
);

const SchedulePage: React.FC = () => {
  const navigate = useNavigate();
  const today = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }, []);

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [events, setEvents] = useState<OpenHouseView[]>([]);
  const [kickoff, setKickoff] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Each fetch resolves to its own fallback on error, so Promise.all never
      // rejects and the calendar degrades gracefully (e.g. guests have no sessions).
      const [ss, ev, ko] = await Promise.all([
        portalApi.get('/api/portal/sessions').then((r) => (r.data.sessions || []) as SessionItem[]).catch(() => [] as SessionItem[]),
        fetchPublicEvents(90).catch(() => [] as OpenHouseView[]),
        fetchSchedule().then((s) => s.first_class?.start_date ?? null).catch(() => null),
      ]);
      if (cancelled) return;
      setSessions(ss);
      setEvents(ev);
      setKickoff(ko ? parseYmd(ko) : null);
      setLoading(false);
    })().catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const sched = useMemo(() => buildSchedule(sessions, events, today), [sessions, events, today]);
  const totalItems = useMemo(() => Object.values(sched).reduce((n, arr) => n + arr.length, 0), [sched]);

  // Week numbering anchor: cohort kickoff, else earliest session, else today.
  const anchorMon = useMemo(() => {
    const ds = sessions.map((s) => parseYmd(s.session_date)).filter((d): d is Date => !!d);
    const earliest = ds.length ? ds.reduce((x, y) => (x.getTime() < y.getTime() ? x : y)) : null;
    const a: Date = kickoff ?? earliest ?? today;
    return mondayOf(a);
  }, [kickoff, sessions, today]);

  const weekNumFor = useCallback((d: Date): number | null => {
    const diff = Math.floor((mondayOf(d).getTime() - anchorMon.getTime()) / DAY_MS);
    return diff >= 0 && diff < 26 ? diff + 1 : null;
  }, [anchorMon]);

  const [mode, setMode] = useState<Mode>('month');
  const [cursor, setCursor] = useState<Date>(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const setView = useCallback((m: Mode): void => {
    setMode(m);
    setCursor(m === 'month' ? new Date(today.getFullYear(), today.getMonth(), 1) : mondayOf(today));
  }, [today]);
  const goToday = useCallback((): void => {
    setCursor(mode === 'month' ? new Date(today.getFullYear(), today.getMonth(), 1) : mondayOf(today));
  }, [mode, today]);
  const nav = useCallback((dir: number): void => {
    setCursor((prev) => { const n = new Date(prev); if (mode === 'month') n.setMonth(n.getMonth() + dir); else n.setDate(n.getDate() + 7 * dir); return n; });
  }, [mode]);

  const periodLabel = useMemo((): string => {
    if (mode === 'month') return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const ws = mondayOf(cursor), we = new Date(ws); we.setDate(ws.getDate() + 4);
    const wk = weekNumFor(cursor);
    return (wk ? 'Week ' + wk + ' · ' : '')
      + ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      + ' – ' + we.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, [mode, cursor, weekNumFor]);

  const { dayCount, periodCount, upcomingCount } = useMemo(() => {
    let day = 0, period = 0, up = 0;
    const inPeriod = (d: Date): boolean => {
      if (mode === 'month') return d.getMonth() === cursor.getMonth() && d.getFullYear() === cursor.getFullYear();
      const ws = mondayOf(cursor), we = new Date(ws); we.setDate(ws.getDate() + 6);
      return d >= ws && d <= we;
    };
    Object.keys(sched).forEach((k) => {
      const [y, m, dd] = k.split('-').map(Number);
      const d = new Date(y, m, dd);
      sched[k].forEach(() => {
        if (dkey(d) === dkey(today)) day++;
        if (inPeriod(d)) period++;
        if (d.getTime() >= today.getTime()) up++;
      });
    });
    return { dayCount: day, periodCount: period, upcomingCount: up };
  }, [mode, cursor, sched, today]);

  const isToday = useCallback((d: Date): boolean => dkey(d) === dkey(today), [today]);

  const openItem = useCallback((ev: SchedEvent): void => {
    if (!ev.href) return;
    if (ev.external) window.open(ev.href, '_blank', 'noopener,noreferrer');
    else navigate(ev.href);
  }, [navigate]);

  // ── MONTH ──
  const renderMonth = (): React.ReactNode => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const cells: React.ReactNode[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const out = d.getMonth() !== cursor.getMonth();
      const evs = sched[dkey(d)] || [];
      const wk = weekNumFor(d);
      const dots = evs.slice(0, 3).map((ev) => (
        <div
          key={ev.id}
          className={`mdot ${KIND_CLASS[ev.kind]}${ev.state === 'done' ? ' done' : ''}`}
          title={ev.title}
        >
          <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</b>
          {ev.time ? <span className="mp">{ev.time}</span> : null}
        </div>
      ));
      const more = evs.length > 3 ? <div className="mmore">+{evs.length - 3} more</div> : null;
      cells.push(
        <div key={i} className={`mcell${out ? ' out' : ''}${isToday(d) ? ' today' : ''}`}>
          <div className="dn"><span>{d.getDate()}</span>{wk && d.getDay() === 1 ? <span className="wkn">W{wk}</span> : null}</div>
          {dots}{more}
        </div>
      );
    }
    return <div className="monthgrid">{dows.map((d) => <div key={d} className="moh">{d}</div>)}{cells}</div>;
  };

  // ── WEEK (time grid) ──
  const renderWeek = (): React.ReactNode => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const wk = weekNumFor(cursor);
    const ws = mondayOf(cursor);
    const buckets: Record<string, SchedEvent[]> = {};
    for (let i = 0; i < 5; i++) {
      const d = new Date(ws); d.setDate(ws.getDate() + i);
      (sched[dkey(d)] || []).forEach((ev) => {
        const key = i + '-' + slotForHour(ev.hour);
        (buckets[key] = buckets[key] || []).push(ev);
      });
    }
    return (
      <>
        <div className="sch-weekhdr">
          <span className="chip learning"><span className="sw" />{wk ? 'Week ' + wk : 'Outside program'}</span>
        </div>
        <div className="timegrid">
          <div className="tg-corner" />
          {days.map((dn, i) => {
            const d = new Date(ws); d.setDate(ws.getDate() + i);
            return (
              <div key={i} className={`tg-dayhead${isToday(d) ? ' today' : ''}`}>
                <div className="d">{dn}</div><div className="n">{d.getDate()}</div>
              </div>
            );
          })}
          {TG_SLOTS.map((slot, s) => (
            <React.Fragment key={slot}>
              <div className="tg-time">{slot}</div>
              {days.map((_, i) => {
                const d = new Date(ws); d.setDate(ws.getDate() + i);
                const items = buckets[i + '-' + s] || [];
                return (
                  <div key={i} className={`tg-cell${isToday(d) ? ' today' : ''}`}>
                    {items.map((ev) => (
                      <div
                        key={ev.id}
                        className={`tg-ev ${KIND_CLASS[ev.kind]}${ev.state === 'done' ? ' done' : ''}`}
                        title={ev.title}
                      >
                        <b>{ev.title}</b>
                        <span className="tgp">{ev.time || ev.sub}{ev.time ? ' · ' + ev.sub : ''}</span>
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
    const ws = mondayOf(cursor);
    const blocks: React.ReactNode[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws); d.setDate(ws.getDate() + i);
      const evs = sched[dkey(d)] || [];
      if (!evs.length) continue;
      blocks.push(
        <div key={dkey(d)}>
          <div className="agenda-day"><div className="dh">{d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}{isToday(d) ? ' — Today' : ''}</div></div>
          <div className="queue agenda-queue">
            {evs.map((ev) => (
              <button key={ev.id} className={`qtask${ev.state === 'done' ? ' done' : ''}`} type="button" onClick={ev.href ? () => openItem(ev) : undefined}>
                <span className="qrank">{ev.state === 'done' ? '✓' : ev.state === 'live' ? '●' : '·'}</span>
                <span className="qbody">
                  <span className="qtitle">{ev.title}</span>
                  <span className="qmeta">
                    <span className={`chip ${KIND_CLASS[ev.kind]}`}><span className="sw" />{ev.kind === 'class' ? 'Class' : 'Event'}</span>
                    {ev.time ? <span className="ptbadge">{ev.time}</span> : null}
                    {' · '}{ev.sub}{ev.state === 'live' ? ' · live now' : ''}
                  </span>
                </span>
                {ev.href ? <svg className="qgo" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> : null}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (!blocks.length) return <div className="sch-empty">Nothing scheduled this week.</div>;
    return <>{blocks}</>;
  };

  return (
    <PortalShell>
      <div className="te-page-h">
        <div className="crumb">One Spine</div>
        <h1>Your schedule</h1>
        <div className="sub">Your cohort's live classes and program events on one timeline. Scroll back through completed sessions or ahead to what's coming.</div>
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
            <div className="ptchip"><span className="v">{dayCount}</span><span className="l">Today</span></div>
            <div className="ptchip"><span className="v">{periodCount}</span><span className="l">This period</span></div>
            <div className="ptchip"><span className="v">{upcomingCount}</span><span className="l">Upcoming</span></div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-5"><div className="spinner-border" style={{ color: 'var(--berry)' }} role="status"><span className="visually-hidden">Loading...</span></div></div>
        ) : error ? (
          <div className="sch-empty">We couldn't load your schedule right now. Please try again shortly.</div>
        ) : (
          <>
            {totalItems === 0 && (
              <div className="sch-empty" style={{ marginBottom: 12 }}>No classes or events scheduled yet. Program events will appear here as they're published.</div>
            )}
            <div>{mode === 'month' ? renderMonth() : mode === 'week' ? renderWeek() : renderAgenda()}</div>
          </>
        )}

        <div className="legend">
          <span><span className="chip learning"><span className="sw" style={{ background: 'var(--dv-learning)' }} />Class session</span></span>
          <span><span className="chip event"><span className="sw" />Program event</span></span>
          <span style={{ marginLeft: 8, display: 'inline-flex', gap: 6, alignItems: 'center' }}><CheckIcon /> done</span>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><LiveIcon /> live</span>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><TodoIcon /> upcoming</span>
        </div>
      </div>
    </PortalShell>
  );
};

export default SchedulePage;
