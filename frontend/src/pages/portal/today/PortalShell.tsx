import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './TodayShell.css';
import { rungTone } from '../../../services/onboardingApi';
import '../../../styles/rungTones.css';
import { hudView } from './pointsHud';
import { fetchSettings, readCachedAvatar } from '../../../services/portalSettingsApi';
import { readParticipant, countdown, firstClassTargetMs } from './shellUtils';
import { useNextLiveSession } from './useNextLiveSession';
import { parseSessionTimeToHHMM } from '../../../utils/sessionTime';
import NotificationBell from '../community/NotificationBell';
import BuildToast from '../projects/BuildToast';
import ShellContactsRail from './ShellContactsRail';
import ChatDock from './ChatDock';
import { useShellDms } from './useShellDms';
import MessagesButton from './MessagesButton';
import { useEntitlement } from '../useEntitlement';
import { useOrgManager, companyLabel } from '../useIsOrgManager';
import { useMgmtStatus } from '../useMgmtStatus';
import { useInternshipNav } from '../useInternshipNav';
import ConfettiCelebration from '../../../components/ConfettiCelebration';
import { ClassicNav, ClassicTabBar } from './ShellNav';
import { useCampus } from '../../../components/campus/CampusContext';
import { useDiscoveryState } from '../../../contexts/BroadcastDiscoveryContext';
import { showReplaysTab } from '../../../components/portal/replaysNavGate';
import CampusNav from '../../../components/campus/CampusNav';
import CampusTabBar from '../../../components/campus/CampusTabBar';
import CampusLayers from '../../../components/campus/CampusLayers';
import CampusBanner from '../../../components/campus/CampusBanner';
import CampusLocationBar from '../../../components/campus/CampusLocationBar';
import type { NavItem, NavGroup } from './ShellNav';
import { useScrollCondense } from '../../../hooks/useScrollCondense';
import { useShellPrefs } from './useShellPrefs';
import { useShellPeople } from './useShellPeople';
import { useShellPoints } from './useShellPoints';

// Sidebar nav — mirrors the Design E mockup: three grouped sections, one SVG
// icon per item. Every destination now navigates. Cert Prep was a dimmed "Soon"
// item until 2026-09-03; it is now routed and content-gated like Classroom and
// Projects. Its own Week 7 availability fence lives SERVER-side, so the nav item
// is present from day one and the page explains when the track opens rather than
// the sidebar hiding it. (Rooms IS the group-chat surface — text + video rooms —
// so the old "Group Chat" placeholder was removed.)
// The nav item types, the "More" split and the classic rail + tab bar live in
// ShellNav.tsx (moved unchanged for Colaberry Campus C2). Re-exported so existing
// imports from PortalShell keep working.
export { NAV_PRIMARY_COUNT, splitNavGroup } from './ShellNav';

export const NAV_GROUPS: NavGroup[] = [
  {
    grp: 'Your day',
    items: [
      { label: 'Today', to: '/portal/today', icon: (
        <svg viewBox="0 0 24 24" fill="none"><path d="M3 12 12 4l9 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 10v10h14V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) },
      { label: 'Schedule', to: '/portal/schedule', icon: (
        <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) },
      { label: 'Path', to: '/portal/path', icon: (
        <svg viewBox="0 0 24 24" fill="none"><circle cx="5" cy="6" r="2.4" stroke="currentColor" strokeWidth="2" /><circle cx="19" cy="18" r="2.4" stroke="currentColor" strokeWidth="2" /><path d="M5 8.4c0 5 7 2 7 7s7 0 7 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) },
      { label: 'Events', to: '/portal/events', icon: (
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M12 12v8M4 8.5 12 13l8-4.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
      ) },
    ],
  },
  {
    grp: 'Build and learn',
    items: [
      // Order is meaningful: the first NAV_PRIMARY_COUNT items in each group are
      // the ones shown before "More", so Classroom leads here by request.
      { label: 'Classroom', to: '/portal/classroom', gate: 'classroom', icon: (
        <svg viewBox="0 0 24 24" fill="none"><path d="M3 8l9-4 9 4-9 4-9-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M7 11v5c0 1 2 2 5 2s5-1 5-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) },
      { label: 'Projects', to: '/portal/projects', gate: 'projects', icon: (
        <svg viewBox="0 0 24 24" fill="none"><path d="M3 7l9-4 9 4-9 4-9-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M3 12l9 4 9-4M3 17l9 4 9-4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
      ) },
      { label: 'Cert Prep', to: '/portal/cert-prep', gate: 'cert-prep', icon: (
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
      { label: 'Rooms', to: '/portal/rooms', icon: (
        <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M17 9l4-2v10l-4-2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
      ) },
      { label: 'People', to: '/portal/community/people', icon: (
        <svg viewBox="0 0 24 24" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="2" /><circle cx="17" cy="9" r="2.2" stroke="currentColor" strokeWidth="2" /><path d="M2.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M15.5 14.2c2.4.3 4 2.1 4 4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) },
      { label: 'Library', to: '/portal/library', icon: (
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
      ) },
      { label: 'Portfolio', to: '/portal/portfolio', gate: 'portfolio', icon: (
        <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M9 6V4h6v2M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) },
    ],
  },
];

// "Your company" — prepended above "Your day" only for org managers. Single item
// to the real, authed manager page. Kept out of NAV_GROUPS so normal students
// never see it.
const COMPANY_ICON = (
  <svg viewBox="0 0 24 24" fill="none"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M12 9h.01M15 9h.01M9 13h.01M12 13h.01M15 13h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/**
 * The company nav group, named after the actual company.
 *
 * Was a module-level constant with the string "Your company" hardcoded twice,
 * so every business account's sidebar read the same generic label even though
 * the org's real name was already on the settings payload the shell fetches.
 * Now built per-render from that name, falling back to the generic label only
 * when no company was supplied at signup (see companyLabel / has_real_name).
 */
function buildCompanyNavGroup(label: string): NavGroup {
  return { grp: label, items: [{ label, to: '/portal/company', icon: COMPANY_ICON }] };
}

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

// "Internship" — appended to the "Build and learn" group, but only for people
// who are IN the internship process or are active interns (useInternshipNav).
// The route /portal/internship is already reachable at any stage; this is the
// nav destination that makes it findable, so an intern is never stranded with
// no way back to their application. Ungated (no lock badge): if the tab shows,
// the person already belongs in the internship.
const INTERNSHIP_NAV_ITEM: NavItem = {
  label: 'Internship', to: '/portal/internship', icon: (
    <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
};

// "Replays" (L8.3) — appended to "Build and learn", and ONLY when broadcasting is switched on.
// It takes that fact from the shared discovery provider, whose `disabled` already means "the
// feature is off or nobody is signed in": with BROADCAST_ENABLED dark the replay route answers
// a clean 404, so an unconditional nav item would be a permanent link to an empty page on
// every student's sidebar. Ungated (no lock badge): the page's entries carry their own
// entitlement answer per class, and a free replay must not sit behind a paid-looking lock.
const REPLAYS_NAV_ITEM: NavItem = {
  label: 'Replays', to: '/portal/replays', icon: (
    <svg viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2.5" stroke="currentColor" strokeWidth="2" /><path d="M10 9.5l4.5 2.5L10 14.5v-5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
  ),
};

type PortalShellProps = {
  /** Plain node for pages that don't condense; a function form for pages that
   *  need the live condensed boolean to sync their body hero's animation with
   *  the header slot (Today/Projects/Classroom). */
  children: React.ReactNode | ((condensed: boolean) => React.ReactNode);
  /** Count badge shown on the Today nav item (open onboarding steps). */
  todayBadge?: number;
  /** Condensed content shown in the header gap once scrolled past the
   *  threshold. Falsy = the slot stays zero-width regardless of scroll state. */
  condensedSlot?: React.ReactNode;
};

/**
 * The Design-E portal shell: sticky topbar (brand + next-milestone chip + points
 * HUD + avatar), grouped left nav, cohort presence footer, and a main content
 * region for the page. Points + schedule are fetched here purely to drive the
 * topbar; each page fetches whatever else it needs.
 */
const PortalShell: React.FC<PortalShellProps> = ({ children, todayBadge, condensedSlot }) => {
  const location = useLocation();
  // Single shared scroll signal — the header slot and whichever page's body
  // hero is condensing both animate off this one boolean so they can never
  // drift a frame apart. See useScrollCondense.ts for the hysteresis logic.
  const condensed = useScrollCondense();
  const { isStaff, hasFullAccess } = useEntitlement();   // drives the nav lock badge on gated items
  // The org itself, not just the boolean: the nav group is named after the company.
  const { isManager: isOrgManager, org } = useOrgManager();
  const companyNavLabel = companyLabel(org);
  const mgmt = useMgmtStatus();           // employee with a mgmt role = "Management Portal" link
  const { isIntern } = useInternshipNav(); // in the internship process / active intern = "Internship" tab
  // Broadcasting on = a "Replays" tab. Read from the SHARED provider, so this adds no request.
  // The rule itself lives in `replaysNavGate`, with the reason the `answered` term is not
  // redundant and a test for each of its four states.
  const broadcastOn = showReplaysTab(useDiscoveryState());
  // Effective nav: employees get "Management Portal", managers get "Your company",
  // both prepended above "Your day"; interns get an "Internship" tab inside
  // "Build and learn". Non-interns see the group exactly as before.
  const groups = useMemo<NavGroup[]>(
    () => {
      const extra: NavItem[] = [
        ...(isIntern ? [INTERNSHIP_NAV_ITEM] : []),
        ...(broadcastOn ? [REPLAYS_NAV_ITEM] : []),
      ];
      const base = extra.length
        ? NAV_GROUPS.map((g) =>
            g.grp === 'Build and learn'
              ? { ...g, items: [...g.items, ...extra] }
              : g,
          )
        : NAV_GROUPS;
      return [
        ...(mgmt.is_mgmt ? [MGMT_NAV_GROUP] : []),
        ...(isOrgManager ? [buildCompanyNavGroup(companyNavLabel)] : []),
        ...base,
      ];
    },
    [isOrgManager, companyNavLabel, mgmt.is_mgmt, isIntern, broadcastOn],
  );
  // Mobile bottom tab bar mirrors the effective, navigable destinations.
  const tabItems = useMemo(
    () => groups.flatMap((g) => g.items).filter((i) => i.to && !i.soon),
    [groups],
  );
  const { points, schedule, displayTotal, fx } = useShellPoints(); // C16: points, schedule and the earn burst (useShellPoints)
  const [now, setNow] = useState<number>(() => Date.now());
  // Real per-session schedule (live_sessions), same source as the Today "Next
  // live class" card and the Classroom sidebar — the topbar "Next class" pill
  // used to derive its countdown purely from the cohort's first_class start
  // date (midnight-anchored, no time-of-day), so it never reflected the actual
  // next session's real start time. Falls back to that cohort-level countdown
  // when there's no live session (e.g. Explorer/guest with none scheduled).
  const { session: nextLiveSessionHud } = useNextLiveSession();
  /**
   * The app bar is sticky at top:0 and its height is content-driven, so any
   * sticky element below it has to know how tall it is or it parks underneath.
   * Every page's right-hand rail was doing exactly that: measured at 1600x950,
   * the bar's bottom edge sat at 110px while the rail stuck at 20px, hiding its
   * top 90px — the "Your builds" and "Where you are" headings included.
   *
   * Measuring beats hardcoding here because the bar is not one height: it
   * changes with the condensed slot, and shrinks its padding on mobile. The
   * observed height is published as --te-top-h on the shell, and the shared
   * rail offset is derived from it, so one measurement keeps every page right.
   */
  const topBarRef = useRef<HTMLElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bar = topBarRef.current;
    const shell = shellRef.current;
    if (!bar || !shell) return;
    const apply = () => shell.style.setProperty('--te-top-h', `${Math.round(bar.getBoundingClientRect().height)}px`);
    apply();
    if (typeof ResizeObserver === 'undefined') return;   // jsdom, older browsers
    const ro = new ResizeObserver(apply);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const me = useMemo(readParticipant, []);
  const [avatar, setAvatar] = useState<string | null>(() => readCachedAvatar());
  // C16: theme and the remembered nav / rail collapse (useShellPrefs)
  const { theme, toggleTheme, navCollapsed, setNavCollapsed, navExpanded, setNavExpanded, contactsCollapsed, setContactsCollapsed } = useShellPrefs();
  // C16: contacts, the People panel, presence pings and friend actions (useShellPeople)
  const { contacts, panel, onAddFriend, onRespondFriend } = useShellPeople();
  // Direct messages: docks, the open-failed flash, the openers and the te-open-dm bridge (moved to useShellDms).
  const { chats, openChatTarget, closeChat, dmError, openChat, openPerson } = useShellDms();

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);


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

  // What the points HUD may state, and what it must withhold. The rule (never
  // render a level or a total the server has not supplied — no zero defaults)
  // lives in ./pointsHud as a pure function so it can be tested; see the header
  // comment there for the defect it exists to prevent.
  const hud = hudView(points, displayTotal);
  // `schedule` is null both while loading AND when there is genuinely nothing
  // scheduled; the chips must not render an em dash for the first case.
  const scheduleKnown = schedule !== null;
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
  const campus = useCampus(); // Colaberry Campus: off (and classic nav) unless the server flag is on for this learner

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
    <div ref={shellRef} className={`te-shell${navCollapsed ? ' collapsed' : ''}${contactsCollapsed ? ' contacts-collapsed' : ''}${campus.active ? ' has-locbar' : ''}`}>
      {/* Points celebration — confetti splash scaled by the award, fires on the timeline
          (and anywhere in the shell) when points land. */}
      <ConfettiCelebration />
      {/* ── topbar ── */}
      <header className="te-top" ref={topBarRef}>
        <button type="button" className="te-navtoggle" onClick={() => setNavCollapsed((c) => !c)}
          title={navCollapsed ? 'Expand menu' : 'Collapse menu'} aria-label="Toggle menu" aria-expanded={!navCollapsed}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <div className="te-brand te-brand--site">
          <img className="te-mark" src="/colaberry-horizontal.png" alt="Colaberry" width={436} height={102} />
          <span>AI Systems Architect Accelerator</span>
        </div>
        {/* Scroll-condensed slot — whatever the current page hands us via
            condensedSlot "sucks up" into this gap once condensed is true.
            Falsy condensedSlot keeps this at zero width regardless of scroll. */}
        {/* C13: the campus has its own location bar and rail, so the page's condensed 'YOUR NEXT STEP' never jumps into the header */}
        <div className={`te-condensed-slot${condensed && condensedSlot && !campus.active ? ' is-visible' : ''}`}>
          <div className="te-condensed-inner">{campus.active ? null : condensedSlot}</div>
        </div>
        <div className="te-top-right">
          <div className="te-rail">
            {(() => {
              const cdInner = (
                <>
                  <span className="ic"><svg viewBox="0 0 24 24" fill="none"><path d="M3 8l9-4 9 4-9 4-9-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M7 11v4c0 1 2 2 5 2s5-1 5-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
                  <span className="tx"><span className="lbl">Next class</span><span className="when mono">{scheduleKnown ? (fcCd ? `${fcCd.d}d ${fcCd.h}h` : '—') : <i className="te-hud-skel cd" aria-hidden="true" />}</span></span>
                </>
              );
              // Clickable straight into the class's room when one exists (real
              // live_sessions countdown); a cohort-level fallback countdown (no
              // linked session yet) stays a plain, non-clickable pill.
              return nextLiveSessionHud?.room_id ? (
                <Link className="te-cd class" title="Next class" to={`/portal/rooms/${nextLiveSessionHud.room_id}`}>{cdInner}</Link>
              ) : (
                <span className="te-cd class" title="Next class">{cdInner}</span>
              );
            })()}
            {/* Links to the Events page — the chip named an event with no way
                to reach it or sign up. Matches the Next class chip's behaviour. */}
            <Link className="te-cd event" title="Next event — see all events" to="/portal/events">
              <span className="ic"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
              <span className="tx"><span className="lbl">Next event</span><span className="when mono">{scheduleKnown ? (ohCd ? `${ohCd.d}d ${ohCd.h}h` : '—') : <i className="te-hud-skel cd" aria-hidden="true" />}</span></span>
            </Link>
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
            className={`te-hud${fx ? ' bump' : ''}${active.startsWith('/portal/settings') ? ' active' : ''}${hud.known ? '' : ' pending'}`}
            title="View your points breakdown"
            aria-label={hud.ariaLabel}
            aria-busy={hud.known ? undefined : true}
          >
            {fx && <span key={fx.key} className="te-hud-burst" aria-hidden="true">+{fx.delta}</span>}
            {/*
              Same box, same height, same rhythm whether or not the numbers have
              landed — a placeholder, not a spinner, so the header stays calm and
              nothing reflows underneath the student when the real value arrives.
            */}
            <div className="row">
              <span className={`lvl${hud.levelName ? ` rung-${rungTone(hud.levelName)}` : ''}`}>
                <svg className="star" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7L12 17.8 5.8 21.5l1.7-7L2 9.8l7.2-.6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
                {hud.levelName ?? <i className="te-hud-skel lvl" aria-hidden="true" />}
              </span>
              <span className="pts">
                {hud.totalText ?? <i className="te-hud-skel pts" aria-hidden="true" />}
              </span>
            </div>
            <div className="bar"><i style={{ width: `${hud.pct}%` }} /></div>
            <div className="next">{hud.nextLine ?? <i className="te-hud-skel next" aria-hidden="true" />}</div>
          </Link>
          <Link to="/portal/settings" className={`te-iconbtn${active.startsWith('/portal/settings') ? ' active' : ''}`} title="Settings" aria-label="Settings">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" /><path d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 7.5 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 13a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 6.5a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 2.6h.09A1.65 1.65 0 0 0 11 1.09V1a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 16.5 4.6l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 21.4 11H21a2 2 0 0 1 0 4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
          </Link>
          <Link to="/portal/settings" className="te-avatar" title={me.email || 'Settings'}>
            {avatar ? <img src={avatar} alt="Your profile" /> : me.initials}
          </Link>
        </div>
      </header>

      {/* C16 (round 3 §2.4): the campus location bar, its own full-width row under the header */}
      {/* Ali, 2026-10-24: the page's sticky next task rides IN the bar once scrolled (it used to ride in the header) */}
      {campus.active && <CampusLocationBar next={condensed ? condensedSlot ?? null : null} />}

      {/* ── nav ── Colaberry Campus replaces the classic rail when active (flag on + not chosen classic) */}
      {campus.active ? <CampusNav active={active} /> : (
      <ClassicNav
        groups={groups} active={active} navCollapsed={navCollapsed} navExpanded={navExpanded}
        onToggleGroup={(grp) => setNavExpanded((m) => ({ ...m, [grp]: !m[grp] }))}
        todayBadge={todayBadge} isStaff={isStaff} hasFullAccess={hasFullAccess} cohortName={cohortName}
        footer={campus.enabled ? (
          <button type="button" className="cm-link cm-switch-back" data-testid="cm-use-campus" onClick={() => campus.updateSettings({ nav: 'campus' })}>
            Switch to campus map
          </button>
        ) : undefined}
      />
      )}

      {/* ── main ── */}
      <main className="te-main">{campus.active && <CampusBanner />}{typeof children === 'function' ? children(condensed) : children}</main>

      {/* ── right contacts rail (Facebook-style cohort presence) ──
          Shell-level, so it appears on every PortalShell page. On narrow
          viewports it is the FIRST thing to collapse (avatar-only rail), before
          the left nav — see the staged .te-contacts media rules in TodayShell.css. */}
      <ShellContactsRail
        panel={panel} contactsCollapsed={contactsCollapsed} onToggleCollapsed={() => setContactsCollapsed((c) => !c)}
        openPerson={openPerson} showFind={showFind} onBackToPeople={() => setRailView('people')}
        onOpenFind={() => { setContactsCollapsed(false); setRailView('find'); setFindQuery(''); }}
        findQuery={findQuery} setFindQuery={setFindQuery} findFiltered={findFiltered}
        onAddFriend={onAddFriend} onRespondFriend={onRespondFriend} incoming={incoming} people={people}
        cohortName={cohortName} onlineNow={onlineNow} contactsCount={contacts.length} openChat={openChat}
      />

      {/* ── 1:1 chat docks (Facebook-style, bottom-right) ── */}
      {chats.length > 0 && (
        <div className="te-dmdock">
          {chats.map((t) => (
            <ChatDock key={t.roomId} target={t} onClose={() => closeChat(t.roomId)} />
          ))}
        </div>
      )}

      {dmError && <div className="te-toast">{dmError}</div>}

      {/* ── bottom tab bar (mobile only via CSS) — nav reachable on phones ── */}
      {campus.active
        ? <><CampusTabBar active={active} /><CampusLayers /></>
        : <ClassicTabBar tabItems={tabItems} active={active} todayBadge={todayBadge} />}

      {/* global build-ready toast (fires on any portal page) */}
      <BuildToast />
    </div>
  );
};

export default PortalShell;
