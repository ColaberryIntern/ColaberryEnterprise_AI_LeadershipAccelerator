import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import TimelineFeed from '../../components/timeline/TimelineFeed';
import { TimelineFeedCard } from '../../components/timeline/TimelineCard';
import CardDetailDrawer from '../../components/timeline/CardDetailDrawer';
import { runtimeApi } from './runtime/runtimeApi';
import '../../components/timeline/timeline.css';
import './today/TodayShell.css';
import PortalShell from './today/PortalShell';
import ClassroomNextStepHero from '../../components/timeline/ClassroomNextStepHero';
import { bySectionOrder } from './classroomNextStep';
import { emitPointsEarned, onPointsEarned, emitCardCollected } from '../../services/pointsFx';
import { filterCardsByQuery, tokenizeQuery } from '../../utils/classroomSearch';
import { readViewSnapshot, restoreScroll, usePersistScrollOnScroll } from '../../hooks/useScrollRestore';
import { PaywallScreen } from '../../components/paywall/PageGate';
import { GATED_FEATURES } from '../../components/paywall/gatedFeatures';
import { useNextLiveSession } from './today/useNextLiveSession';
import { useCountdown } from '../../hooks/useCountdown';
import { parseSessionTimeToHHMM, tzAbbrev, formatSessionTimeRange } from '../../utils/sessionTime';
import type { Band } from '../../services/bandLadder';

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
  // Canonical 5-band identity (AI Aware -> AI Enabled -> AI Builder -> AI Architect),
  // the SAME field Settings' points/level page reads. `level.slug` is the raw,
  // unpromoted build-competency ladder slug ("builder" by default for everyone who
  // hasn't shipped a build promotion yet) and must never be shown as the student's
  // displayed level -- see band.rungName below for the one the HUD/Settings use.
  band?: Band;
}
interface Feed {
  cohort_id: string | null;
  buckets: string[];
  cards: TimelineFeedCard[];
  progression?: Progression;
  is_explorer?: boolean;   // free Explorer tier — drives the enroll upsell banner
}

const wkLabel = (w: number | null): string => (w != null ? `Week ${w}` : 'Classroom');

const titleCase = (s: string): string => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Persist the classroom view (selected week + window scroll) so that leaving for
// the runtime workspace and coming back — via the workspace Back button OR the
// browser's own back button — returns the student to the same spot in the list,
// instead of remounting fresh and resetting to the top of the default week.
// Session-scoped (per browser tab); cleared naturally when the tab closes.
// Mechanics (restoreScroll's rAF-poll, the live on-scroll persist) live in the
// shared hooks/useScrollRestore — see there for why the persist must be live,
// not an unmount cleanup.
const VIEW_KEY = 'classroom-view';
interface ClassroomExtra { week: number | null }

const ClassroomPage: React.FC = () => {
  const navigate = useNavigate();
  // Deep link from Today's "next step" CTA: /portal/classroom?open=<cardId>
  // opens that exact card's drawer directly — see the restore effect below.
  const [searchParams, setSearchParams] = useSearchParams();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [uiState, setUiState] = useState<'loading' | 'ready' | 'disabled' | 'gated' | 'error'>('loading');
  const [week, setWeek] = useState<number | null>(null);
  // Store the selected CARD object (not just an id): the Week-0 never-ending feed
  // surfaces ambient cards (blogs/podcasts) that aren't in feed.cards, so an
  // id→feed.cards lookup would fail to open them.
  const [selectedCard, setSelectedCard] = useState<TimelineFeedCard | null>(null);
  const [query, setQuery] = useState<string>('');
  // Real "Next live class" data — the same live_sessions-backed source (and
  // hooks) the Today shell uses via NextLiveClassCard, not a hardcoded
  // "next Thursday 10am" schedule guess.
  const { session: nextSession } = useNextLiveSession();
  const nextSessionTarget = (!nextSession || nextSession.status === 'live' || !nextSession.session_date)
    ? null
    : (() => {
        const hhmm = parseSessionTimeToHHMM(nextSession.start_time || '09:00');
        return hhmm ? `${nextSession.session_date}T${hhmm}:00` : null;
      })();
  const liveCd = useCountdown(nextSessionTarget);

  const load = useCallback(async () => {
    try {
      // Cache-buster: the live feed must never be served from a stale browser
      // copy (a newly-published card has to appear on load), so each fetch is a
      // unique URL. Pairs with the server's Cache-Control: no-store.
      const res = await portalApi.get('/api/portal/classroom', { params: { _t: Date.now() } });
      setFeed(res.data as Feed);
      setUiState('ready');
    } catch (err: any) {
      const status = err?.response?.status;
      setUiState(status === 404 ? 'disabled' : status === 402 ? 'gated' : 'error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Points earned anywhere on this page (card / quick-check / survey completion)
  // means the feed changed — refetch so "Your status" XP + "This week" progress
  // update live, without waiting for a navigation. The quick-check panel updates
  // the HUD via this same event but does not itself refetch the feed.
  useEffect(() => onPointsEarned(() => { void load(); }), [load]);

  const weeks = useMemo(() => {
    const set = new Set<number>();
    // Week 0 (Free Preview) is the Today timeline's content, not Classroom's —
    // Classroom starts at Week 1.
    (feed?.cards || []).forEach((c) => { if (typeof c.week === 'number' && c.week > 0) set.add(c.week); });
    return Array.from(set).sort((a, b) => a - b);
  }, [feed]);

  // Restore the last-viewed week (+ scroll position) when the student returns
  // from the runtime workspace; otherwise default to the first week that still
  // has an incomplete card. Runs once, after the feed loads.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!feed || weeks.length === 0) return;
    if (!restoredRef.current) {
      restoredRef.current = true;
      // Deep link takes priority over the session-restored view: Today's
      // "next step" CTA sends a student here to open ONE specific card, not
      // to resume wherever they last scrolled.
      const openId = searchParams.get('open');
      const openCard = openId ? feed.cards.find((c) => c.id === openId) : null;
      if (openCard) {
        if (openCard.week != null) setWeek(openCard.week);
        setSelectedCard(openCard);
        setSearchParams((prev) => { prev.delete('open'); return prev; }, { replace: true });
        return;
      }
      const snap = readViewSnapshot<ClassroomExtra>(VIEW_KEY);
      // snap.extra can be missing if a stale pre-refactor sessionStorage blob
      // (old shape was {week, scrollY} with no wrapping `extra`) survives across
      // a deploy — guard before reading .week so that doesn't throw.
      if (snap && snap.extra && snap.extra.week != null && weeks.includes(snap.extra.week)) {
        setWeek(snap.extra.week);
        // Restore scroll once the feed is tall enough (its thumbnails have
        // loaded). restoreScroll waits for that, so it runs after App-level
        // ScrollToTop's reset AND after the images that give the page its height.
        restoreScroll(snap.scrollY || 0);
        return;
      }
    }
    if (week == null) {
      const firstOpen = weeks.find((w) => feed.cards.some((c) => c.week === w && c.status !== 'completed'));
      setWeek(firstOpen ?? weeks[0]);
    }
  }, [feed, weeks, week, searchParams, setSearchParams]);

  // Continuously remember the current scroll position (and week) so returning
  // from the workspace can restore it — see hooks/useScrollRestore for why this
  // must be a live on-scroll persist, not an unmount cleanup.
  usePersistScrollOnScroll<ClassroomExtra>(VIEW_KEY, uiState === 'ready', () => ({ week }));

  const weekCards = useMemo(() => {
    if (!feed) return [];
    // Sort by SECTION order (pre_class → learn → … → reflect → share → advance)
    // then by the card's order in its lane — matches the Timeline tab, so e.g.
    // the reflect feedback survey reads at the END, not interleaved at the top.
    // Shared with Today's "active next step" derivation (classroomNextStep.ts)
    // so the two pages can never pick a different "next" card.
    // weeks.length===0 now means this enrollment has NO week-1+ content — either a
    // free-preview/explorer-tier student (whose entire feed is week-0-only, which
    // now belongs to Today, not here) or a cohort with no week-tagged cards at all.
    // Previously this fell back to dumping the WHOLE unfiltered feed.cards here,
    // which — now that week 0 is excluded from `weeks` — silently leaked all of a
    // free-tier student's week-0 content back into Classroom. Show nothing instead;
    // the empty state below directs them to Today, where that content actually lives.
    if (weeks.length === 0) return [];
    return feed.cards.filter((c) => c.week === week).sort(bySectionOrder(feed.buckets));
  }, [feed, weeks, week]);

  const done = weekCards.filter((c) => c.status === 'completed').length;
  const pct = weekCards.length ? Math.round((done / weekCards.length) * 100) : 0;

  // Live search filter. The banner + "This week" progress stay bound to the full
  // weekCards (above) so the progress bar doesn't jump around as the student
  // types — only the rendered feed narrows to the matches.
  const searchTokens = useMemo(() => tokenizeQuery(query), [query]);
  const visibleCards = useMemo(() => filterCardsByQuery(weekCards, query), [weekCards, query]);
  const searching = searchTokens.length > 0;

  // Opening a card now shows its detail drawer (preview + in-app video player);
  // completion is an explicit action inside the drawer, not a side effect of opening.
  const openCard = useCallback((card: TimelineFeedCard) => { setSelectedCard(card); }, []);
  const completeCard = useCallback(async (card: TimelineFeedCard) => {
    // No swallow: a gate rejection (422 watch / 423 lock) must propagate so the
    // caller can surface "watch it first" instead of the tile falsely flipping to
    // "collected". Ambient blogs (ref `blog:<id>`) — surfaced by the Week-0
    // never-ending feed — collect via the blog read gate, not the card endpoint.
    const blogId = card.id.startsWith('blog:') ? card.id.slice('blog:'.length) : null;
    const res = blogId
      ? await runtimeApi.blogCollect(blogId)
      : (await portalApi.post(`/api/portal/classroom/cards/${card.id}/complete`)).data;
    await load();
    emitPointsEarned(res?.points_awarded ?? 0);   // HUD burst + chime (0 = already earned → silent)
    emitCardCollected(card.id);                    // drop it off the never-ending feed
  }, [load]);

  if (uiState === 'loading') return <PortalShell><div className="tl-de"><div className="tl-empty">Loading your classroom…</div></div></PortalShell>;
  if (uiState === 'disabled') return (
    <PortalShell><div className="tl-de"><div className="tl-empty">
      The new Classroom timeline isn’t enabled for your cohort yet.
      <div style={{ marginTop: 12 }}><button type="button" className="tl-btn primary sm" onClick={() => navigate('/portal/curriculum')}>Go to Curriculum</button></div>
    </div></div></PortalShell>
  );
  // Defensive: <PageGate> already blocks this route client-side for a gated
  // user before this fetch ever fires — this only fires on a stale client
  // cache, a direct API call, or a client bug, and renders the SAME visual as
  // <PageGate> so there is one paywall screen, not two that could drift.
  if (uiState === 'gated') return <PortalShell><PaywallScreen copy={GATED_FEATURES.classroom} /></PortalShell>;
  if (uiState === 'error' || !feed) return <PortalShell><div className="tl-de"><div className="tl-error">Couldn’t load the classroom. Please try again.</div></div></PortalShell>;

  const prog = feed.progression;
  const readinessPct = prog ? Math.round(prog.level.readiness * 100) : 0;
  const wkIdx = week != null ? weeks.indexOf(week) : -1;
  const seg = (n: number, l: string) => <div className="cd-seg"><b>{String(n).padStart(2, '0')}</b><span>{l}</span></div>;

  return (
    <PortalShell
      condensedSlot={<ClassroomNextStepHero weekCards={weekCards} variant="condensed" onOpen={openCard} />}
    >
    {(condensed) => (
    <div className="tl-de">
      <div className="tl-top">
        <div>
          <div className="tl-crumb">{wkLabel(week)}</div>
          <h1 className="tl-h1">Classroom{week != null ? ` — ${wkLabel(week)}` : ''}</h1>
          <div className="tl-sub">{feed.is_explorer
            ? 'Your free AI Preview — watch testimonials, listen to podcasts, read, and try short lessons and quizzes. Enroll to unlock the full Accelerator.'
            : 'Your week as a feed. Watch, build, test, reflect — every item scores on-site and feeds your points. Complete each card to advance.'}</div>
        </div>
      </div>

      {feed.is_explorer && (
        <div className="tl-card tl-ac-berry" style={{ padding: '15px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}><path d="M4 8h16v8H4zM4 8l2-3h12l2 3M9 12h6" stroke="var(--cherry)" strokeWidth="2" strokeLinejoin="round" /></svg>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700 }}>You're on the free AI Preview</div>
            <div className="tl-small">Enroll in the AI Systems Architect Accelerator to unlock all 12 weeks, the live classes, the community, and your certification.</div>
          </div>
          <button type="button" className="tl-btn primary sm" onClick={() => navigate('/portal/settings?tab=subscription')}>Enroll to unlock →</button>
        </div>
      )}

      {weeks.length > 1 && (
        <div className="tl-weeknav">
          <button type="button" className="tl-arrow" disabled={wkIdx <= 0} onClick={() => setWeek(weeks[wkIdx - 1])} aria-label="Previous week"><svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
          <div className="tl-wkmid"><div className="tl-wklbl">{`Week ${week} of ${weeks[weeks.length - 1]}`}</div></div>
          <button type="button" className="tl-arrow" disabled={wkIdx >= weeks.length - 1} onClick={() => setWeek(weeks[wkIdx + 1])} aria-label="Next week"><svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        </div>
      )}

      <div className="tl-grid">
        <div className="tl-feedcol">
          <div className="tl-row1">
            <div className={`te-condense-body${condensed ? ' is-condensed' : ''}`}>
              <ClassroomNextStepHero weekCards={weekCards} variant="full" onOpen={openCard} />
            </div>
            <div className="tl-card tl-banner tl-ac-berry">
              <div className="ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 7h16v12H4zM4 7l3-3h10l3 3M9 12h6" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg></div>
              <div className="pr">
                <h3>{week != null ? `Week ${week}` : 'Your timeline'}</h3>
                <div className="tl-small" style={{ margin: '6px 0 8px' }}>{weekCards.length} item{weekCards.length === 1 ? '' : 's'} this week</div>
                <div className="tl-prog"><i style={{ width: `${pct}%` }} /></div>
                <div className="tl-small" style={{ marginTop: 6 }}><b>{done}</b> of <b>{weekCards.length}</b> complete</div>
              </div>
            </div>
          </div>

          {weekCards.length > 0 && (
            <>
              <div className="tl-search">
                <svg className="tl-search-ic" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                <input
                  type="search"
                  className="tl-search-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
                  placeholder="Search this week — try “Prompt Lab”"
                  aria-label="Search this week's cards"
                  autoComplete="off"
                />
                {searching && (
                  <button type="button" className="tl-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  </button>
                )}
              </div>
              {searching && (
                <div className="tl-search-count tl-small" role="status" aria-live="polite">
                  {visibleCards.length} of {weekCards.length} {weekCards.length === 1 ? 'card' : 'cards'} match “{query.trim()}”
                </div>
              )}
            </>
          )}

          {weekCards.length === 0
            ? <div className="tl-empty">No cards here yet.</div>
            : visibleCards.length === 0
              ? <div className="tl-empty">No cards match “{query.trim()}”. <button type="button" className="tl-btn sm primary" style={{ marginLeft: 8 }} onClick={() => setQuery('')}>Clear search</button></div>
              : <TimelineFeed cards={visibleCards} compactCompleted onOpen={openCard} onComplete={completeCard} onComments={openCard} onWorkspace={openCard} />}
        </div>

        <aside className="tl-side">
          {nextSession && (
            <div className="tl-card side-card tl-ac-cherry">
              <h3><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="2" /><path d="M12 9v4l2.5 2M9 2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> Next live class</h3>
              <div className="tl-small" style={{ marginBottom: 4 }}>
                <b style={{ color: 'var(--text-body)' }}>Session {nextSession.session_number}</b> · {nextSession.title}
              </div>
              <div className="tl-small" style={{ marginBottom: 4 }}>
                {nextSession.session_date} · {formatSessionTimeRange(nextSession.start_time, nextSession.end_time)}
                {tzAbbrev(nextSession.timezone, nextSession.session_date) && ` ${tzAbbrev(nextSession.timezone, nextSession.session_date)}`}
              </div>
              {nextSession.status === 'live'
                ? <div className="tl-small" style={{ fontWeight: 700 }}>Live now</div>
                : liveCd && <div className="countdown">{seg(liveCd.days, 'Days')}{seg(liveCd.hours, 'Hrs')}{seg(liveCd.minutes, 'Min')}{seg(liveCd.seconds, 'Sec')}</div>}
              {nextSession.room_id && (
                <Link
                  className="tl-btn primary sm"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                  to={`/portal/rooms/${nextSession.room_id}`}
                >
                  Open the room
                </Link>
              )}
            </div>
          )}

          {prog && (
            <div className="tl-card side-card tl-ac-leaf">
              <h3><svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7L12 17.8 5.8 21.5l1.7-7L2 9.8l7.2-.6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg> Your status</h3>
              <div className="side-stat"><span className="lab">Level</span><span className="num">{prog.band?.rungName ?? titleCase(prog.level.slug)}</span></div>
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

      <CardDetailDrawer card={selectedCard} onClose={() => setSelectedCard(null)} onComplete={completeCard} />
    </div>
    )}
    </PortalShell>
  );
};

export default ClassroomPage;
