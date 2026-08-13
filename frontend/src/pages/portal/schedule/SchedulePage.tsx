import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalShell from '../today/PortalShell';
import CondensedHeaderCard from '../today/CondensedHeaderCard';
import portalApi from '../../../utils/portalApi';
import { fetchSchedule, fetchPublicEvents, fetchPoints, joinSession, OpenHouseView, FirstClassView, PointsEvent } from '../../../services/onboardingApi';
import { fmtCentralTime, centralParts } from '../today/shellUtils';
import { useNextLiveSession } from '../today/useNextLiveSession';
import { useCountdown } from '../../../hooks/useCountdown';
import { parseSessionTimeToHHMM } from '../../../utils/sessionTime';
import { emitPointsEarned } from '../../../services/pointsFx';
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
  room_id?: string | null; // linked Colaberry Commons room, when one exists
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

/** A human label for a points-ledger event, from its type/metadata. */
function labelForPointsEvent(e: PointsEvent): string {
  const OVERRIDES: Record<string, string> = {
    open_house_rsvp: 'Open House RSVP',
    daily_streak: 'Daily streak',
    profile_complete: 'Profile completed',
    background_added: 'Background added',
    first_login: 'First login',
    card_complete: 'Lesson completed',
    lesson_complete: 'Lesson completed',
  };
  if (OVERRIDES[e.event_type]) return OVERRIDES[e.event_type];
  const t = (e.event_type || 'Points').replace(/[_:]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function stateForSession(status: string, day: Date, today: Date): EvState {
  if (status === 'completed') return 'done';
  if (status === 'live') return 'live';
  return day.getTime() < today.getTime() ? 'done' : 'up';
}

function buildSchedule(sessions: SessionItem[], events: OpenHouseView[], firstClass: FirstClassView | null, today: Date): SchedMap {
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
      // Sessions link into their Colaberry Commons room, not the retired
      // /portal/sessions/:id detail page. A session only has a room once
      // Community Rooms has provisioned one for it (ensureRoomForSession);
      // until then the item renders as plain (unclickable) text rather than
      // pointing at a dead route.
      href: s.room_id ? `/portal/rooms/${s.room_id}` : undefined,
      sub: (s.session_type || 'session').replace(/_/g, ' '),
    });
  }
  for (const e of events) {
    // Bucket + label events in Central time (program-canonical), regardless of viewer tz.
    const cp = centralParts(e.starts_at);
    if (!cp) continue;
    add(new Date(cp.y, cp.mo, cp.d), {
      id: e.id, kind: 'event', title: e.title,
      time: fmtCentralTime(e.starts_at), hour: cp.h, state: 'up',
      href: e.registration_url || undefined, external: true,
      sub: /open house/i.test(e.title) ? 'Open House' : 'Event',
    });
  }
  // Cohort kickoff: the countdown's "next class". Surface it on the calendar
  // even when no per-session rows exist yet, so the class-start day is visible.
  if (firstClass?.start_date) {
    const d = parseYmd(firstClass.start_date);
    if (d) {
      const hasClass = (sched[dkey(d)] || []).some((e) => e.kind === 'class');
      if (!hasClass) {
        add(d, {
          id: 'class-start', kind: 'class',
          title: `Class starts · ${firstClass.cohort_name || 'Your cohort'}`,
          time: '', hour: -1,
          state: d.getTime() < today.getTime() ? 'done' : 'up',
          sub: 'Cohort kickoff',
        });
      }
    }
  }
  Object.keys(sched).forEach((k) =>
    sched[k].sort((a, b) => (a.hour - b.hour) || a.title.localeCompare(b.title)));
  return sched;
}

/** Wrap a calendar item: external event -> new-tab link, session -> in-app Link, else a plain div. */
function renderItem(ev: SchedEvent, className: string, inner: React.ReactNode, block?: boolean): React.ReactNode {
  const style: React.CSSProperties = { textDecoration: 'none', color: 'inherit' };
  if (block) style.display = 'block';
  if (ev.href && ev.external) {
    return <a key={ev.id} href={ev.href} target="_blank" rel="noopener noreferrer" className={className} title={ev.title} style={style}>{inner}</a>;
  }
  if (ev.href) {
    return <Link key={ev.id} to={ev.href} className={className} title={ev.title} style={style}>{inner}</Link>;
  }
  return <div key={ev.id} className={className} title={ev.title}>{inner}</div>;
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
// Points-earned marker — a filled star, so a day with points is recognizable
// at a glance (not just another text chip) in every view.
const PointsIcon: React.FC<{ w?: number; h?: number; fill?: string }> = ({ w = 11, h = 11, fill = '#3C7A26' }) => (
  <svg width={w} height={h} viewBox="0 0 24 24" fill="none"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6-5.9-3.3-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8L12 2.5z" fill={fill} /></svg>
);

const SchedulePage: React.FC = () => {
  const today = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }, []);

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [events, setEvents] = useState<OpenHouseView[]>([]);
  const [firstClass, setFirstClass] = useState<FirstClassView | null>(null);
  const [pointsEvents, setPointsEvents] = useState<PointsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Each fetch resolves to its own fallback on error, so Promise.all never
      // rejects and the calendar degrades gracefully (e.g. guests have no sessions).
      const [ss, ev, ko, pts] = await Promise.all([
        portalApi.get('/api/portal/sessions').then((r) => (r.data.sessions || []) as SessionItem[]).catch(() => [] as SessionItem[]),
        fetchPublicEvents(90).catch(() => [] as OpenHouseView[]),
        fetchSchedule().then((s) => s.first_class ?? null).catch(() => null),
        fetchPoints().then((p) => p.events || []).catch(() => [] as PointsEvent[]),
      ]);
      if (cancelled) return;
      setSessions(ss);
      setEvents(ev);
      setFirstClass(ko);
      setPointsEvents(pts);
      setLoading(false);
    })().catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const sched = useMemo(() => buildSchedule(sessions, events, firstClass, today), [sessions, events, firstClass, today]);
  const totalItems = useMemo(() => Object.values(sched).reduce((n, arr) => n + arr.length, 0), [sched]);

  // Points history bucketed by Central day: a per-day total (for the month/week
  // badges) plus the ordered breakdown (for the agenda). Sourced from the
  // `student_points_events` ledger via `/api/portal/points`.
  const { pointsByDay, pointsDetailByDay } = useMemo(() => {
    const by: Record<string, number> = {};
    const det: Record<string, { label: string; points: number; time: string }[]> = {};
    for (const e of pointsEvents) {
      const cp = centralParts(e.created_at);
      if (!cp) continue;
      const k = dkey(new Date(cp.y, cp.mo, cp.d));
      by[k] = (by[k] || 0) + (e.points || 0);
      (det[k] = det[k] || []).push({ label: labelForPointsEvent(e), points: e.points || 0, time: fmtCentralTime(e.created_at) });
    }
    return { pointsByDay: by, pointsDetailByDay: det };
  }, [pointsEvents]);

  // Week numbering anchor: cohort kickoff, else earliest session, else today.
  const anchorMon = useMemo(() => {
    const fcDate = firstClass?.start_date ? parseYmd(firstClass.start_date) : null;
    const ds = sessions.map((s) => parseYmd(s.session_date)).filter((d): d is Date => !!d);
    const earliest = ds.length ? ds.reduce((x, y) => (x.getTime() < y.getTime() ? x : y)) : null;
    const a: Date = fcDate ?? earliest ?? today;
    return mondayOf(a);
  }, [firstClass, sessions, today]);

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
      const dots = evs.slice(0, 3).map((ev) => renderItem(
        ev, `mdot ${KIND_CLASS[ev.kind]}${ev.state === 'done' ? ' done' : ''}`,
        <>
          <b>{ev.title}</b>
          {ev.time ? <span className="mp">{ev.time}</span> : null}
        </>,
      ));
      const more = evs.length > 3 ? <div className="mmore">+{evs.length - 3} more</div> : null;
      const dayPts = pointsByDay[dkey(d)];
      cells.push(
        <div key={i} className={`mcell${out ? ' out' : ''}${isToday(d) ? ' today' : ''}`}>
          <div className="dn"><span>{d.getDate()}</span>{wk && d.getDay() === 1 ? <span className="wkn">W{wk}</span> : null}</div>
          {dots}{more}
          {dayPts ? (
            <div className="mdot pts-badge" style={{ background: 'rgba(91,166,60,.14)', color: '#3C7A26', fontWeight: 800 }} title={`${dayPts} points earned`}>
              <PointsIcon /><span>+{dayPts} pts</span>
            </div>
          ) : null}
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
            const dayPts = pointsByDay[dkey(d)];
            return (
              <div key={i} className={`tg-dayhead${isToday(d) ? ' today' : ''}`}>
                <div className="d">{dn}</div><div className="n">{d.getDate()}</div>
                {dayPts ? (
                  <div className="pts-badge" style={{ fontSize: 10, fontWeight: 800, color: '#3C7A26', justifyContent: 'center' }} title={`${dayPts} points earned`}>
                    <PointsIcon w={10} h={10} /><span>+{dayPts} pts</span>
                  </div>
                ) : null}
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
                    {items.map((ev) => renderItem(
                      ev, `tg-ev ${KIND_CLASS[ev.kind]}${ev.state === 'done' ? ' done' : ''}`,
                      <>
                        <b>{ev.title}</b>
                        <span className="tgp">{ev.time || ev.sub}{ev.time ? ' · ' + ev.sub : ''}</span>
                      </>,
                      true,
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
      const pts = pointsDetailByDay[dkey(d)] || [];
      if (!evs.length && !pts.length) continue;
      const dayPtsTotal = pts.reduce((n, p) => n + p.points, 0);
      blocks.push(
        <div key={dkey(d)}>
          <div className="agenda-day">
            <div className="dh">{d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}{isToday(d) ? ' — Today' : ''}</div>
            {dayPtsTotal ? (
              <span className="ptbadge pts-badge" style={{ background: 'rgba(91,166,60,.14)', color: '#3C7A26' }}>
                <PointsIcon /><span>+{dayPtsTotal} pts</span>
              </span>
            ) : null}
          </div>
          {pts.length ? (
            <div className="queue agenda-queue">
              {pts.map((p, idx) => (
                <div key={`pts-${idx}`} className="qtask done">
                  <span className="qrank" style={{ color: '#3C7A26' }}>+{p.points}</span>
                  <span className="qbody">
                    <span className="qtitle">{p.label}</span>
                    <span className="qmeta">
                      <span className="chip learning"><span className="sw" style={{ background: '#5BA63C' }} />Points</span>
                      {p.time ? <span className="ptbadge">{p.time}</span> : null}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {evs.length ? (
            <div className="queue agenda-queue">
              {evs.map((ev) => renderItem(
                ev, `qtask${ev.state === 'done' ? ' done' : ''}`,
                <>
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
                </>,
              ))}
            </div>
          ) : null}
        </div>
      );
    }
    if (!blocks.length) return <div className="sch-empty">Nothing scheduled this week.</div>;
    return <>{blocks}</>;
  };

  // Condensed-header content — the same real live_sessions source the Today
  // shell and the header's own "Next class" pill trust (see useNextLiveSession).
  const { session: nextLiveSession } = useNextLiveSession();
  const nlsTarget = (!nextLiveSession || nextLiveSession.status === 'live' || !nextLiveSession.session_date)
    ? null
    : (() => {
        const hhmm = parseSessionTimeToHHMM(nextLiveSession.start_time || '09:00');
        return hhmm ? `${nextLiveSession.session_date}T${hhmm}:00` : null;
      })();
  const nlsCd = useCountdown(nlsTarget);
  const handleJoinNext = () => {
    if (!nextLiveSession?.meeting_link) return;
    window.open(nextLiveSession.meeting_link, '_blank', 'noopener,noreferrer');
    joinSession(nextLiveSession.id).then((r) => { if (r.awarded) emitPointsEarned(r.points); }).catch(() => { /* best-effort */ });
  };

  return (
    <PortalShell
      condensedSlot={nextLiveSession ? (
        <CondensedHeaderCard
          icon={<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          tone={nextLiveSession.status === 'live' ? 'cherry' : 'berry'}
          label={nextLiveSession.status === 'live' ? 'Live now' : 'Next class'}
          title={`Session ${nextLiveSession.session_number} · ${nextLiveSession.title}`}
          sub={nextLiveSession.status !== 'live' && nlsCd ? `${nlsCd.days}d ${nlsCd.hours}h` : undefined}
          action={nextLiveSession.status === 'live'
            ? <button className="te-btn cherry sm" type="button" onClick={handleJoinNext}>Join →</button>
            : nextLiveSession.room_id
              ? <Link className="te-btn ghost sm" to={`/portal/rooms/${nextLiveSession.room_id}`}>Open →</Link>
              : undefined}
        />
      ) : undefined}
    >
      {(condensed) => (
        <>
      <div className={`te-condense-body${condensed ? ' is-condensed' : ''}`}>
      <div className="te-page-h">
        <div className="crumb">One Spine</div>
        <h1>Your schedule</h1>
        <div className="sub">Your cohort's live classes and program events on one timeline. Scroll back through completed sessions or ahead to what's coming.</div>
      </div>
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
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><PointsIcon /> points earned that day</span>
        </div>
      </div>
        </>
      )}
    </PortalShell>
  );
};

export default SchedulePage;
