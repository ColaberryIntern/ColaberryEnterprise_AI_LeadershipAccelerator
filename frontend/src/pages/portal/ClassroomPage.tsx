import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import TimelineFeed from '../../components/timeline/TimelineFeed';
import { TimelineFeedCard } from '../../components/timeline/TimelineCard';
import CardDetailDrawer from '../../components/timeline/CardDetailDrawer';
import '../../components/timeline/timeline.css';
import PortalShell from './today/PortalShell';
import { emitPointsEarned, onPointsEarned } from '../../services/pointsFx';

/**
 * ClassroomPage — the student Classroom as a Colaberry Design E timeline feed.
 * Fetches /api/portal/classroom, renders the week banner + feed + status
 * sidebar. Opening a card calls the real completion endpoint and refetches, so
 * XP + level + week progress update live. Flag-gated: 404 -> legacy curriculum.
 */

interface Progression {
  xp: { learning: number; builder: number; community: number };
  competencies: Array<{ domain_id: string; confidence: number; evidence_count: number }>;
  level: { slug: string; rank: number; readiness: number };
}
interface Feed {
  cohort_id: string | null;
  buckets: string[];
  cards: TimelineFeedCard[];
  progression?: Progression;
  is_explorer?: boolean;   // free Explorer tier — Week 0 only, with an enroll upsell
}

// Week 0 is the free "AI Preview" tier; the rest are the paid Accelerator weeks.
const wkLabel = (w: number | null): string => (w === 0 ? 'Free Preview' : w != null ? `Week ${w}` : 'Classroom');

const titleCase = (s: string): string => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const readTheme = (): 'light' | 'dark' =>
  (typeof window !== 'undefined' && window.localStorage.getItem('tl-theme') === 'dark') ? 'dark' : 'light';

/** ms until the next Thursday 10:00 (client-side schedule anchor until live sessions are wired). */
function nextThursday(now: number): number {
  const d = new Date(now);
  let add = (4 - d.getDay() + 7) % 7;
  if (add === 0 && d.getHours() >= 10) add = 7;
  const t = new Date(d);
  t.setDate(d.getDate() + add);
  t.setHours(10, 0, 0, 0);
  return Math.max(0, t.getTime() - now);
}

const ClassroomPage: React.FC = () => {
  const navigate = useNavigate();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [uiState, setUiState] = useState<'loading' | 'ready' | 'disabled' | 'error'>('loading');
  const [theme, setTheme] = useState<'light' | 'dark'>(readTheme);
  const [week, setWeek] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => (typeof performance !== 'undefined' ? Date.now() : 0));

  const load = useCallback(async () => {
    try {
      // Cache-buster: the live feed must never be served from a stale browser
      // copy (a newly-published card has to appear on load), so each fetch is a
      // unique URL. Pairs with the server's Cache-Control: no-store.
      const res = await portalApi.get('/api/portal/classroom', { params: { _t: Date.now() } });
      setFeed(res.data as Feed);
      setUiState('ready');
    } catch (err: any) {
      setUiState(err?.response?.status === 404 ? 'disabled' : 'error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Points earned anywhere on this page (card / quick-check / survey completion)
  // means the feed changed — refetch so "Your status" XP + "This week" progress
  // update live, without waiting for a navigation. The quick-check panel updates
  // the HUD via this same event but does not itself refetch the feed.
  useEffect(() => onPointsEarned(() => { void load(); }), [load]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const weeks = useMemo(() => {
    const set = new Set<number>();
    (feed?.cards || []).forEach((c) => { if (typeof c.week === 'number') set.add(c.week); });
    return Array.from(set).sort((a, b) => a - b);
  }, [feed]);

  // default to the first week that still has an incomplete card
  useEffect(() => {
    if (!feed || week != null || weeks.length === 0) return;
    const firstOpen = weeks.find((w) => feed.cards.some((c) => c.week === w && c.status !== 'completed'));
    setWeek(firstOpen ?? weeks[0]);
  }, [feed, weeks, week]);

  const weekCards = useMemo(() => {
    if (!feed) return [];
    // Sort by SECTION order (pre_class → learn → … → reflect → share → advance)
    // then by the card's order in its lane — matches the Timeline tab, so e.g.
    // the reflect feedback survey reads at the END, not interleaved at the top.
    const bIdx = (b: string) => { const i = feed.buckets.indexOf(b); return i < 0 ? feed.buckets.length : i; };
    const bySection = (a: typeof feed.cards[number], b: typeof feed.cards[number]) =>
      bIdx(a.bucket) - bIdx(b.bucket) || a.order - b.order;
    if (weeks.length === 0) return [...feed.cards].sort(bySection);
    return feed.cards.filter((c) => c.week === week).sort(bySection);
  }, [feed, weeks, week]);

  const done = weekCards.filter((c) => c.status === 'completed').length;
  const pct = weekCards.length ? Math.round((done / weekCards.length) * 100) : 0;

  // Opening a card now shows its detail drawer (preview + in-app video player);
  // completion is an explicit action inside the drawer, not a side effect of opening.
  const openCard = useCallback((card: TimelineFeedCard) => { setSelectedId(card.id); }, []);
  const completeCard = useCallback(async (card: TimelineFeedCard) => {
    try {
      const res = await portalApi.post(`/api/portal/classroom/cards/${card.id}/complete`);
      await load();
      emitPointsEarned(res.data?.points_awarded ?? 0);   // HUD burst + chime (0 = already earned → silent)
    } catch { /* surfaced on next load; keep the UI responsive */ }
  }, [load]);
  const selectedCard = useMemo(() => feed?.cards.find((c) => c.id === selectedId) ?? null, [feed, selectedId]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { window.localStorage.setItem('tl-theme', next); } catch { /* ignore */ }
  };

  const themeBtn = (
    <button type="button" className="tl-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
      {theme === 'dark'
        ? <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        : <svg viewBox="0 0 24 24" fill="none"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>}
    </button>
  );

  if (uiState === 'loading') return <PortalShell><div className="tl-de"><div className="tl-empty">Loading your classroom…</div></div></PortalShell>;
  if (uiState === 'disabled') return (
    <PortalShell><div className="tl-de"><div className="tl-empty">
      The new Classroom timeline isn’t enabled for your cohort yet.
      <div style={{ marginTop: 12 }}><button type="button" className="tl-btn primary sm" onClick={() => navigate('/portal/curriculum')}>Go to Curriculum</button></div>
    </div></div></PortalShell>
  );
  if (uiState === 'error' || !feed) return <PortalShell><div className="tl-de"><div className="tl-error">Couldn’t load the classroom. Please try again.</div></div></PortalShell>;

  const prog = feed.progression;
  const readinessPct = prog ? Math.round(prog.level.readiness * 100) : 0;
  const wkIdx = week != null ? weeks.indexOf(week) : -1;
  const diff = nextThursday(now);
  const cd = { d: Math.floor(diff / 864e5), h: Math.floor((diff % 864e5) / 36e5), m: Math.floor((diff % 36e5) / 6e4), s: Math.floor((diff % 6e4) / 1e3) };
  const seg = (n: number, l: string) => <div className="cd-seg"><b>{String(n).padStart(2, '0')}</b><span>{l}</span></div>;

  return (
    <PortalShell>
    <div className="tl-de" data-theme={theme}>
      <div className="tl-top">
        <div>
          <div className="tl-crumb">{wkLabel(week)}</div>
          <h1 className="tl-h1">Classroom{week != null ? ` — ${wkLabel(week)}` : ''}</h1>
          <div className="tl-sub">{feed.is_explorer
            ? 'Your free AI Preview — watch testimonials, listen to podcasts, read, and try short lessons and quizzes. Enroll to unlock the full Accelerator.'
            : 'Your week as a feed. Watch, build, test, reflect — every item scores on-site and feeds your points. Complete each card to advance.'}</div>
        </div>
        {themeBtn}
      </div>

      {feed.is_explorer && (
        <div className="tl-card tl-ac-berry" style={{ padding: '15px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}><path d="M4 8h16v8H4zM4 8l2-3h12l2 3M9 12h6" stroke="var(--cherry)" strokeWidth="2" strokeLinejoin="round" /></svg>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700 }}>You're on the free AI Preview</div>
            <div className="tl-small">Enroll in the AI Systems Architect Accelerator to unlock all 12 weeks, the live classes, the community, and your certification.</div>
          </div>
          <button type="button" className="tl-btn primary sm" onClick={() => navigate('/portal/curriculum')}>Enroll to unlock →</button>
        </div>
      )}

      {weeks.length > 1 && (
        <div className="tl-weeknav">
          <button type="button" className="tl-arrow" disabled={wkIdx <= 0} onClick={() => setWeek(weeks[wkIdx - 1])} aria-label="Previous week"><svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
          <div className="tl-wkmid"><div className="tl-wklbl">{week === 0 ? 'Free Preview' : `Week ${week} of ${weeks[weeks.length - 1]}`}</div></div>
          <button type="button" className="tl-arrow" disabled={wkIdx >= weeks.length - 1} onClick={() => setWeek(weeks[wkIdx + 1])} aria-label="Next week"><svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        </div>
      )}

      <div className="tl-grid">
        <div className="tl-feedcol">
          <div className="tl-card tl-banner tl-ac-berry">
            <div className="ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 7h16v12H4zM4 7l3-3h10l3 3M9 12h6" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg></div>
            <div className="pr">
              <h3>{week != null ? `Week ${week}` : 'Your timeline'}</h3>
              <div className="tl-small" style={{ margin: '6px 0 8px' }}>{weekCards.length} item{weekCards.length === 1 ? '' : 's'} this week</div>
              <div className="tl-prog"><i style={{ width: `${pct}%` }} /></div>
              <div className="tl-small" style={{ marginTop: 6 }}><b>{done}</b> of <b>{weekCards.length}</b> complete</div>
            </div>
          </div>

          {weekCards.length === 0
            ? <div className="tl-empty">No cards here yet.</div>
            : <TimelineFeed cards={weekCards} onOpen={openCard} onComplete={completeCard} onComments={(c) => navigate(`/portal/runtime/${c.id}`)} onWorkspace={(c) => navigate(`/portal/runtime/${c.id}`)} />}
        </div>

        <aside className="tl-side">
          <div className="tl-card side-card tl-ac-cherry">
            <h3><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="2" /><path d="M12 9v4l2.5 2M9 2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> Next live class</h3>
            <div className="tl-small" style={{ marginBottom: 4 }}><b style={{ color: 'var(--text-body)' }}>Build Day</b> · Thursday 10:00 AM</div>
            <div className="countdown">{seg(cd.d, 'Days')}{seg(cd.h, 'Hrs')}{seg(cd.m, 'Min')}{seg(cd.s, 'Sec')}</div>
          </div>

          {prog && (
            <div className="tl-card side-card tl-ac-leaf">
              <h3><svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7L12 17.8 5.8 21.5l1.7-7L2 9.8l7.2-.6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg> Your status</h3>
              <div className="side-stat"><span className="lab">Level</span><span className="num">{titleCase(prog.level.slug)}</span></div>
              <div className="side-stat"><span className="lab">Architect readiness</span><span className="num">{readinessPct}%</span></div>
              <div className="ribbon"><i style={{ width: `${readinessPct}%`, background: 'var(--cherry)' }} /></div>
              <div className="side-stat"><span className="lab">Builder XP</span><span className="num">{prog.xp.builder}</span></div>
              <div className="side-stat"><span className="lab">Learning XP</span><span className="num">{prog.xp.learning}</span></div>
              <div className="side-stat" style={{ marginBottom: 0 }}><span className="lab">Community XP</span><span className="num">{prog.xp.community}</span></div>
            </div>
          )}

          <div className="tl-card side-card tl-ac-berry">
            <h3><svg viewBox="0 0 24 24" fill="none"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> This week</h3>
            <div className="side-stat"><span className="lab">Items complete</span><span className="num"><b>{done}</b> / <b>{weekCards.length}</b></span></div>
            <div className="ribbon" style={{ marginBottom: 0 }}><i style={{ width: `${pct}%`, background: 'var(--berry)' }} /></div>
          </div>
        </aside>
      </div>

      <CardDetailDrawer card={selectedCard} onClose={() => setSelectedId(null)} onComplete={completeCard} />
    </div>
    </PortalShell>
  );
};

export default ClassroomPage;
