import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './TodayShell.css';
import { fetchPoints, fetchSchedule, levelFor, bandHudNext, PointsSummary, OnboardingSchedule } from '../../../services/onboardingApi';
import { fetchSettings, readCachedAvatar } from '../../../services/portalSettingsApi';
import { onPointsEarned } from '../../../services/pointsFx';
import { readParticipant, countdown, firstClassTargetMs } from './shellUtils';
import { useNextLiveSession } from './useNextLiveSession';
import { parseSessionTimeToHHMM } from '../../../utils/sessionTime';
import NotificationBell from '../community/NotificationBell';
import BuildToast from '../projects/BuildToast';
import { CohortContact, fetchCohortPresence, sendFriendRequest, respondToFriendRequest, colorFor } from '../../../services/cohortPresenceApi';
import { fetchPeoplePanel, PeoplePanel } from '../../../services/peoplePanelApi';
import PeoplePanelRail from './PeoplePanelRail';
import { pingPresence } from '../../../services/communityApi';
import { openDm } from '../../../services/dmApi';
import ChatDock, { DmTarget } from './ChatDock';
import MessagesButton from './MessagesButton';
import { useEntitlement } from '../useEntitlement';
import { useIsOrgManager } from '../useIsOrgManager';
import { useMgmtStatus } from '../useMgmtStatus';
import ConfettiCelebration from '../../../components/ConfettiCelebration';
import type { GatedFeatureKey } from '../../../components/paywall/gatedFeatures';

// Sidebar nav — mirrors the Design E mockup: three grouped sections, one SVG
// icon per item. Today / Path / Schedule / Projects / Classroom / Community /
// Rooms are built and navigate; Cert Prep / Portfolio are deferred past the
// P0 launch fence and render as a dimmed "Soon" item. (Rooms IS the group-chat
// surface — text + video rooms — so the old "Group Chat" placeholder was removed.)
// `gate` marks an item as content-paywalled (<PageGate> on its route) — the item
// STAYS a clickable Link (unlike `soon`, which fully disables it): a free/unpaid
// student can click through and see the upsell screen the route itself renders.
type NavItem = { label: string; to?: string; icon: React.ReactNode; soon?: boolean; newTab?: boolean; gate?: GatedFeatureKey };
type NavGroup = { grp: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    grp: 'Your day',
    items: [
      { label: 'Today', to: '/portal/today', icon: (
        <svg viewBox="0 0 24 24" fill="none"><path d="M3 12 12 4l9 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 10v10h14V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) },
      { label: 'Path', to: '/portal/path', icon: (
        <svg viewBox="0 0 24 24" fill="none"><circle cx="5" cy="6" r="2.4" stroke="currentColor" strokeWidth="2" /><circle cx="19" cy="18" r="2.4" stroke="currentColor" strokeWidth="2" /><path d="M5 8.4c0 5 7 2 7 7s7 0 7 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) },
      { label: 'Schedule', to: '/portal/schedule', icon: (
        <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) },
    ],
  },
  {
    grp: 'Build and learn',
    items: [
      { label: 'Projects', to: '/portal/projects', gate: 'projects', icon: (
        <svg viewBox="0 0 24 24" fill="none"><path d="M3 7l9-4 9 4-9 4-9-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M3 12l9 4 9-4M3 17l9 4 9-4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
      ) },
      { label: 'Classroom', to: '/portal/classroom', gate: 'classroom', icon: (
        <svg viewBox="0 0 24 24" fill="none"><path d="M3 8l9-4 9 4-9 4-9-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M7 11v5c0 1 2 2 5 2s5-1 5-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) },
      { label: 'Cert Prep', soon: true, icon: (
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9 11l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) },
    ],
  },
  {
    grp: 'Belong',
    items: [
      { label: 'Community', to: '/portal/community', icon: (
        <svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="2" /><path d="M3 19c0-3 3-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M16 7a3 3 0 0 1 0 6M18 19c0-2-1-3.5-2.5-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) },
      { label: 'People', to: '/portal/community/people', icon: (
        <svg viewBox="0 0 24 24" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="2" /><circle cx="17" cy="9" r="2.2" stroke="currentColor" strokeWidth="2" /><path d="M2.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M15.5 14.2c2.4.3 4 2.1 4 4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) },
      { label: 'Rooms', to: '/portal/rooms', icon: (
        <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M17 9l4-2v10l-4-2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
      ) },
      { label: 'Library', to: '/portal/library', icon: (
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
      ) },
      { label: 'Portfolio', soon: true, icon: (
        <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M9 6V4h6v2M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) },
    ],
  },
];

// "Your company" — prepended above "Your day" only for org managers. Single item
// to the real, authed manager page. Kept out of NAV_GROUPS so normal students
// never see it.
const COMPANY_NAV_GROUP: NavGroup = {
  grp: 'Your company',
  items: [
    { label: 'Your company', to: '/portal/company', icon: (
      <svg viewBox="0 0 24 24" fill="none"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M12 9h.01M15 9h.01M9 13h.01M12 13h.01M15 13h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    ) },
  ],
};

// "Management Portal" — a single link that opens the admin portal for employees
// (staff with a management role). Shown only when useMgmtStatus().is_mgmt. Routes
// to a landing that mints a scoped admin token then redirects into /admin.
const MGMT_NAV_GROUP: NavGroup = {
  grp: 'Employee',
  items: [
    { label: 'Management Portal', to: '/portal/mgmt-enter', newTab: true, icon: (
      <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M3 9h18M8 4v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
    ) },
  ],
};

type PortalShellProps = {
  children: React.ReactNode;
  /** Count badge shown on the Today nav item (open onboarding steps). */
  todayBadge?: number;
};

/**
 * The Design-E portal shell: sticky topbar (brand + next-milestone chip + points
 * HUD + avatar), grouped left nav, cohort presence footer, and a main content
 * region for the page. Points + schedule are fetched here purely to drive the
 * topbar; each page fetches whatever else it needs.
 */
const PortalShell: React.FC<PortalShellProps> = ({ children, todayBadge }) => {
  const location = useLocation();
  const { isStaff, hasFullAccess } = useEntitlement();   // drives the nav lock badge on gated items
  const isOrgManager = useIsOrgManager(); // manager = also sees a "Your company" nav group
  const mgmt = useMgmtStatus();           // employee with a mgmt role = "Management Portal" link
  // Effective nav: employees get "Management Portal", managers get "Your company",
  // both prepended above "Your day".
  const groups = useMemo<NavGroup[]>(
    () => [
      ...(mgmt.is_mgmt ? [MGMT_NAV_GROUP] : []),
      ...(isOrgManager ? [COMPANY_NAV_GROUP] : []),
      ...NAV_GROUPS,
    ],
    [isOrgManager, mgmt.is_mgmt],
  );
  // Mobile bottom tab bar mirrors the effective, navigable destinations.
  const tabItems = useMemo(
    () => groups.flatMap((g) => g.items).filter((i) => i.to && !i.soon),
    [groups],
  );
  const [points, setPoints] = useState<PointsSummary | null>(null);
  const [schedule, setSchedule] = useState<OnboardingSchedule | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  // Real per-session schedule (live_sessions), same source as the Today "Next
  // live class" card and the Classroom sidebar — the topbar "Next class" pill
  // used to derive its countdown purely from the cohort's first_class start
  // date (midnight-anchored, no time-of-day), so it never reflected the actual
  // next session's real start time. Falls back to that cohort-level countdown
  // when there's no live session (e.g. Explorer/guest with none scheduled).
  const { session: nextLiveSessionHud } = useNextLiveSession();
  // Points-earned FX: displayTotal counts UP to the real total; `fx` drives the
  // "+N" burst + a brief scale-pulse on the HUD when points land.
  const [displayTotal, setDisplayTotal] = useState(0);
  const displayRef = useRef(0);
  const [fx, setFx] = useState<{ delta: number; key: number } | null>(null);
  const fxKeyRef = useRef(0);
  const me = useMemo(readParticipant, []);
  const [avatar, setAvatar] = useState<string | null>(() => readCachedAvatar());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('te-theme') as 'light' | 'dark') || 'light'; } catch { return 'light'; }
  });
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('te-theme', theme);
    } catch { /* ignore */ }
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('te_nav_collapsed') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('te_nav_collapsed', navCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [navCollapsed]);
  // Right contacts rail collapse — mirrors navCollapsed. On narrow viewports the
  // rail auto-collapses (CSS) regardless of this flag; this drives the manual
  // toggle + persistence at full width.
  const [contactsCollapsed, setContactsCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('te_contacts_collapsed') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('te_contacts_collapsed', contactsCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [contactsCollapsed]);
  // Cohort contacts rail — real presence from GET /api/portal/cohort/presence on
  // a light 60s poll. Also ping our own presence so cohort-mates see us online
  // while we're anywhere in the portal (not just the Community tab). Fail-soft:
  // any error keeps the last roster and never breaks the shell.
  const [contacts, setContacts] = useState<CohortContact[]>([]);
  // Role-aware People panel (flag-gated server-side). null = flag OFF or error, in
  // which case the rail falls back to the legacy cohort-presence view below.
  const [panel, setPanel] = useState<PeoplePanel | null>(null);
  const refreshContacts = useCallback(() => {
    fetchCohortPresence().then(setContacts).catch(() => { /* keep last roster */ });
  }, []);
  const refreshPanel = useCallback(() => {
    fetchPeoplePanel().then(setPanel).catch(() => { /* fall back to cohort rail */ });
  }, []);
  useEffect(() => {
    refreshContacts();
    refreshPanel();
    pingPresence().catch(() => { /* non-fatal */ });
    const id = window.setInterval(() => {
      refreshContacts();
      refreshPanel();
      pingPresence().catch(() => { /* non-fatal */ });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [refreshContacts, refreshPanel]);
  // Friend actions — fire, then refetch so friendshipStatus (and the friends-first
  // order) update. Fail-soft: an error just leaves the person addable.
  const onAddFriend = useCallback((id: string) => {
    sendFriendRequest(id).then(refreshContacts).catch(() => { /* stays addable */ });
  }, [refreshContacts]);
  const onRespondFriend = useCallback((requesterId: string, accept: boolean) => {
    respondToFriendRequest(requesterId, accept).then(refreshContacts).catch(() => { /* keep request */ });
  }, [refreshContacts]);
  // Open (or focus) a 1:1 chat dock when a contact face is clicked.
  const [chats, setChats] = useState<DmTarget[]>([]);
  const openChatTarget = useCallback((t: DmTarget) => {
    setChats((prev) => (prev.some((x) => x.roomId === t.roomId) ? prev : [...prev, t]));
  }, []);
  const openChat = useCallback((c: CohortContact) => {
    openDm(c.id).then((roomId) => openChatTarget({ roomId, name: c.name, color: c.color })).catch(() => { /* non-fatal */ });
  }, [openChatTarget]);
  // People-panel rows carry only enrollmentId + name; derive the colour the same way
  // the cohort rail does so the same person is always the same colour.
  const openPerson = useCallback((enrollmentId: string, name: string) => {
    openDm(enrollmentId).then((roomId) => openChatTarget({ roomId, name, color: colorFor(enrollmentId) })).catch(() => { /* non-fatal */ });
  }, [openChatTarget]);

  // Bridge: other surfaces (e.g. the community member profile drawer) open a DM
  // by dispatching a `te-open-dm` CustomEvent { enrollmentId, name, color? } —
  // the same dock mechanism the contacts rail uses, without prop-drilling the
  // opener into every page.
  useEffect(() => {
    const onOpenDm = (e: Event) => {
      const detail = (e as CustomEvent<{ enrollmentId?: string; name?: string; color?: string }>).detail;
      if (!detail?.enrollmentId) return;
      openDm(detail.enrollmentId)
        .then((roomId) => openChatTarget({ roomId, name: detail.name ?? 'Direct message', color: detail.color ?? colorFor(detail.enrollmentId!) }))
        .catch(() => { /* non-fatal */ });
    };
    window.addEventListener('te-open-dm', onOpenDm as EventListener);
    return () => window.removeEventListener('te-open-dm', onOpenDm as EventListener);
  }, [openChatTarget]);

  const load = useCallback(async () => {
    const [p, s] = await Promise.allSettled([fetchPoints(), fetchSchedule()]);
    if (p.status === 'fulfilled') setPoints(p.value);
    if (s.status === 'fulfilled') setSchedule(s.value);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Count the HUD total UP to its current value (on load, and after each earn).
  useEffect(() => {
    const end = points?.total ?? 0;
    const start = displayRef.current;
    if (start === end) return;
    const reduce = !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { displayRef.current = end; setDisplayTotal(end); return; }
    let raf = 0;
    const t0 = performance.now();
    const dur = 700;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(start + (end - start) * eased);
      displayRef.current = v;
      setDisplayTotal(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [points]);

  // When points are earned anywhere in the portal, refetch the authoritative
  // total (so the bar + level are exact) and fire the "+N" burst + pulse.
  useEffect(() => {
    return onPointsEarned((d) => {
      void load();
      fxKeyRef.current += 1;
      setFx({ delta: d.delta, key: fxKeyRef.current });
    });
  }, [load]);
  useEffect(() => {
    if (!fx) return;
    const id = window.setTimeout(() => setFx(null), 1100);
    return () => window.clearTimeout(id);
  }, [fx]);

  // Profile photo for the topbar avatar. Read the per-session cache first for an
  // instant paint; fetch once if it hasn't been populated yet this session.
  useEffect(() => {
    const sync = () => setAvatar(readCachedAvatar());
    window.addEventListener('te-avatar-changed', sync);
    window.addEventListener('storage', sync);
    if (readCachedAvatar() === null) {
      fetchSettings().then((s) => setAvatar(s.avatar_data_url)).catch(() => { /* non-fatal */ });
    }
    return () => {
      window.removeEventListener('te-avatar-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const total = points?.total ?? 0;
  const lvl = levelFor(total);
  // 5-band re-skin (runtime flag on the points payload). When ON, the HUD shows
  // the canonical band rung (e.g. "AI Enabled II") as the level identity; when OFF
  // band is null and the legacy "Apprentice/…/Principal" identity is byte-identical.
  const band = points?.fiveBandUiEnabled ? points.band ?? null : null;
  const idName = band ? band.rungName : lvl.name;
  const nextLine = band
    ? bandHudNext(band, total)
    : (lvl.next ? `${lvl.next.min - total} pts to ${lvl.next.name}` : 'Max level');
  const oh = schedule?.next_open_house || null;
  const ohCd = countdown(oh ? new Date(oh.starts_at).getTime() : null, now);
  const nextLiveSessionTargetMs = (() => {
    if (!nextLiveSessionHud) return null;
    if (nextLiveSessionHud.status === 'live') return now; // live now → 0d 0h
    if (!nextLiveSessionHud.session_date) return null;
    const hhmm = parseSessionTimeToHHMM(nextLiveSessionHud.start_time || '09:00');
    if (!hhmm) return null;
    const t = new Date(`${nextLiveSessionHud.session_date}T${hhmm}:00`).getTime();
    return isNaN(t) ? null : t;
  })();
  const fcCd = countdown(
    nextLiveSessionHud ? nextLiveSessionTargetMs : firstClassTargetMs(schedule?.first_class ?? null),
    now,
  );
  const cohortName = schedule?.first_class?.cohort_name || 'Your cohort';
  const active = location.pathname;

  // Contacts rail — up to RAIL_MAX people shown as faces, friends-first then
  // most-active (the API sorts). Capped so there's never a long scroll. Incoming
  // friend requests get pulled out into their own Requests section.
  const [railView, setRailView] = useState<'people' | 'find'>('people');
  const [findQuery, setFindQuery] = useState('');
  const RAIL_MAX = 15;
  const incoming = contacts.filter((c) => c.friendshipStatus === 'incoming');
  const people = contacts.filter((c) => c.friendshipStatus !== 'incoming').slice(0, RAIL_MAX);
  const onlineNow = contacts.filter((c) => c.presence !== 'offline').length;
  // Find-people directory, filtered by the search box.
  const findQ = findQuery.trim().toLowerCase();
  const findFiltered = findQ ? contacts.filter((c) => c.name.toLowerCase().includes(findQ)) : contacts;
  // "Find people" flips the rail to the full cohort directory; a back button
  // flips home. Only meaningful when the rail is expanded.
  const showFind = railView === 'find' && !contactsCollapsed;

  return (
    <div className={`te-shell${navCollapsed ? ' collapsed' : ''}${contactsCollapsed ? ' contacts-collapsed' : ''}`}>
      {/* Points celebration — confetti splash scaled by the award, fires on the timeline
          (and anywhere in the shell) when points land. */}
      <ConfettiCelebration />
      {/* ── topbar ── */}
      <header className="te-top">
        <button type="button" className="te-navtoggle" onClick={() => setNavCollapsed((c) => !c)}
          title={navCollapsed ? 'Expand menu' : 'Collapse menu'} aria-label="Toggle menu" aria-expanded={!navCollapsed}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <div className="te-brand">
          <img className="te-mark" src="/colaberry-icon.png" alt="Colaberry" />
          <div><b><span className="cc">C</span>olaberry</b><span>AI Systems Architect Accelerator</span></div>
        </div>
        <div className="te-top-right">
          <div className="te-rail">
            <span className="te-cd class" title="Next class">
              <span className="ic"><svg viewBox="0 0 24 24" fill="none"><path d="M3 8l9-4 9 4-9 4-9-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M7 11v4c0 1 2 2 5 2s5-1 5-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
              <span className="tx"><span className="lbl">Next class</span><span className="when mono">{fcCd ? `${fcCd.d}d ${fcCd.h}h` : '—'}</span></span>
            </span>
            <span className="te-cd event" title="Next event">
              <span className="ic"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
              <span className="tx"><span className="lbl">Next event</span><span className="when mono">{ohCd ? `${ohCd.d}d ${ohCd.h}h` : '—'}</span></span>
            </span>
          </div>
          <MessagesButton onOpen={openChatTarget} />
          <NotificationBell />
          <button type="button" className="te-iconbtn" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle dark mode">
            {theme === 'dark'
              ? <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              : <svg viewBox="0 0 24 24" fill="none"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>}
          </button>
          <Link
            to="/portal/settings?tab=points"
            className={`te-hud${fx ? ' bump' : ''}${active.startsWith('/portal/settings') ? ' active' : ''}`}
            title="View your points breakdown"
            aria-label={`${total} points, level ${idName} — view your points breakdown`}
          >
            {fx && <span key={fx.key} className="te-hud-burst" aria-hidden="true">+{fx.delta}</span>}
            <div className="row"><span className="lvl"><svg className="star" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7L12 17.8 5.8 21.5l1.7-7L2 9.8l7.2-.6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>{idName}</span><span className="pts">{displayTotal.toLocaleString()} pts</span></div>
            <div className="bar"><i style={{ width: `${lvl.pct}%` }} /></div>
            <div className="next">{nextLine}</div>
          </Link>
          <Link to="/portal/settings" className={`te-iconbtn${active.startsWith('/portal/settings') ? ' active' : ''}`} title="Settings" aria-label="Settings">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" /><path d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 7.5 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 13a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 6.5a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 2.6h.09A1.65 1.65 0 0 0 11 1.09V1a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 16.5 4.6l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 21.4 11H21a2 2 0 0 1 0 4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
          </Link>
          <Link to="/portal/settings" className="te-avatar" title={me.email || 'Settings'}>
            {avatar ? <img src={avatar} alt="Your profile" /> : me.initials}
          </Link>
        </div>
      </header>

      {/* ── nav ── */}
      <nav className="te-nav">
        {groups.map((group) => (
          <React.Fragment key={group.grp}>
            <div className="grp">{group.grp}</div>
            {group.items.map((n) => {
              const isActive = !!n.to && (active === n.to || active.startsWith(n.to + '/'));
              const inner = (
                <>
                  <span className="ic">{n.icon}</span>
                  <span className="lb">{n.label}</span>
                  {n.label === 'Today' && !!todayBadge && todayBadge > 0 && <span className="badge">{todayBadge}</span>}
                  {n.gate && !isStaff && !hasFullAccess && (
                    <span className="te-navlock" title="Requires a paid seat" aria-label="Locked — requires a paid seat">
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true">
                        <rect x="5" y="10" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </span>
                  )}
                  {n.soon && <span className="te-soon">Soon</span>}
                </>
              );
              if (isActive) return <span key={n.label} className="te-navbtn active">{inner}</span>;
              if (n.soon) return <span key={n.label} className="te-navbtn is-soon" title="Coming soon" aria-disabled="true">{inner}</span>;
              // Open in a NEW TAB (e.g. Management Portal) so the student session stays put.
              if (n.newTab) return <a key={n.label} className="te-navbtn" href={n.to!} target="_blank" rel="noopener noreferrer">{inner}</a>;
              return <Link key={n.label} className="te-navbtn" to={n.to!}>{inner}</Link>;
            })}
          </React.Fragment>
        ))}

        <div className="te-presence">
          <div className="h"><span className="pdot" /> {cohortName}</div>
          <div className="te-onrow" style={{ cursor: 'default' }}>
            <span className="pmini">+</span> Meet your cohort when you enroll
          </div>
        </div>
      </nav>

      {/* ── main ── */}
      <main className="te-main">{children}</main>

      {/* ── right contacts rail (Facebook-style cohort presence) ──
          Shell-level, so it appears on every PortalShell page. On narrow
          viewports it is the FIRST thing to collapse (avatar-only rail), before
          the left nav — see the staged .te-contacts media rules in TodayShell.css. */}
      <aside className="te-contacts" aria-label="Cohort contacts">
        {panel ? (
          // Role-aware People panel (PEOPLE_PANEL_ROLES_ENABLED=true). When null (flag
          // OFF or fetch error) the legacy cohort-presence rail below renders unchanged.
          <PeoplePanelRail
            panel={panel}
            collapsed={contactsCollapsed}
            onToggleCollapsed={() => setContactsCollapsed((c) => !c)}
            onOpenPerson={openPerson}
          />
        ) : showFind ? (
          <>
            {/* Find-people view — the full cohort directory, reachable by clicking
                "Find people" and dismissed with the back arrow. */}
            <div className="te-ct-head">
              <button type="button" className="te-ct-back" onClick={() => setRailView('people')} aria-label="Back to contacts" title="Back">
                <svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <h3>Find people</h3>
            </div>
            <div className="te-ct-search-wrap">
              <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M21 21l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <input
                className="te-ct-search"
                type="text"
                autoFocus
                value={findQuery}
                onChange={(e) => setFindQuery(e.target.value)}
                placeholder="Search your cohort…"
                aria-label="Search people"
              />
            </div>
            <div className="te-ct-list">
              {findFiltered.map((c) => (
                <div key={c.id} className="te-ctrow te-ctrow-static" title={c.name}>
                  <span className="te-ctav" style={{ background: c.color }}>{c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.initials}<span className={`te-ctpres ${c.presence}`} /></span>
                  <span className="te-ctname">{c.name}</span>
                  {c.friendshipStatus === 'friend' ? (
                    <span className="te-ct-added">Friends</span>
                  ) : c.friendshipStatus === 'requested' ? (
                    <button type="button" className="te-ct-add" disabled>Requested</button>
                  ) : c.friendshipStatus === 'incoming' ? (
                    <button type="button" className="te-ct-add" onClick={() => onRespondFriend(c.id, true)}>Accept</button>
                  ) : (
                    <button type="button" className="te-ct-add" onClick={() => onAddFriend(c.id)}>Add</button>
                  )}
                </div>
              ))}
              {findFiltered.length === 0 && (
                <div className="te-ct-empty">{findQuery.trim() ? `No one matches “${findQuery.trim()}”.` : 'No one from your cohort is here yet.'}</div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Default view — up to RAIL_MAX faces, most-active first. */}
            <div className="te-ct-head">
              <h3>Contacts</h3>
              <button
                type="button"
                className="te-ct-toggle"
                onClick={() => setContactsCollapsed((c) => !c)}
                title={contactsCollapsed ? 'Expand contacts' : 'Collapse contacts'}
                aria-label="Toggle contacts panel"
                aria-expanded={!contactsCollapsed}
              >
                <svg viewBox="0 0 24 24" fill="none" style={{ transform: contactsCollapsed ? 'rotate(180deg)' : 'none' }}>
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <button type="button" className="te-ct-find" title="Find people" onClick={() => { setContactsCollapsed(false); setRailView('find'); setFindQuery(''); }}>
              <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M21 21l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <span>Find people</span>
            </button>
            {!contactsCollapsed && incoming.length > 0 && (
              <div className="te-ct-list te-ct-requests">
                <div className="te-ct-grp">Requests · {incoming.length}</div>
                {incoming.map((c) => (
                  <div key={c.id} className="te-ctrow te-ctrow-static" title={c.name}>
                    <span className="te-ctav" style={{ background: c.color }}>{c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.initials}</span>
                    <span className="te-ctname">{c.name}</span>
                    <span className="te-ct-reqbtns">
                      <button type="button" className="te-ct-add" onClick={() => onRespondFriend(c.id, true)}>Accept</button>
                      <button type="button" className="te-ct-decline" onClick={() => onRespondFriend(c.id, false)} aria-label="Decline request">✕</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="te-ct-list">
              {people.length > 0 && <div className="te-ct-grp">{cohortName} · {onlineNow} online</div>}
              {people.map((c) => (
                <button key={c.id} type="button" className="te-ctrow" data-name={c.name} title={`Message ${c.name}`} onClick={() => openChat(c)}>
                  <span className="te-ctav" style={{ background: c.color }}>{c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.initials}<span className={`te-ctpres ${c.presence}`} /></span>
                  <span className="te-ctname">{c.name}</span>
                  <span className={`te-ctpres ${c.presence}`} />
                </button>
              ))}
              {contacts.length === 0 && (
                <div className="te-ct-empty">No one from your cohort yet. Check back soon.</div>
              )}
            </div>
          </>
        )}
      </aside>

      {/* ── 1:1 chat docks (Facebook-style, bottom-right) ── */}
      {chats.length > 0 && (
        <div className="te-dmdock">
          {chats.map((t) => (
            <ChatDock key={t.roomId} target={t} onClose={() => setChats((prev) => prev.filter((x) => x.roomId !== t.roomId))} />
          ))}
        </div>
      )}

      {/* ── bottom tab bar (mobile only via CSS) — nav reachable on phones ── */}
      <nav className="te-tabbar">
        {tabItems.map((t) => {
          const on = !!t.to && (active === t.to || active.startsWith(t.to + '/'));
          return (
            <Link key={t.label} to={t.to!} className={`te-tab${on ? ' active' : ''}`}>
              <span className="ic">{t.icon}</span>
              <span className="lb">{t.label}</span>
              {t.label === 'Today' && !!todayBadge && todayBadge > 0 && <span className="tdot" />}
            </Link>
          );
        })}
      </nav>

      {/* global build-ready toast (fires on any portal page) */}
      <BuildToast />
    </div>
  );
};

export default PortalShell;
