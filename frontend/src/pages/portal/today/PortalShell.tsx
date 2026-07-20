import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './TodayShell.css';
import { fetchPoints, fetchSchedule, levelFor, PointsSummary, OnboardingSchedule } from '../../../services/onboardingApi';
import { fetchSettings, readCachedAvatar } from '../../../services/portalSettingsApi';
import { onPointsEarned } from '../../../services/pointsFx';
import { readParticipant, countdown, firstClassTargetMs } from './shellUtils';
import NotificationBell from '../community/NotificationBell';
import BuildToast from '../projects/BuildToast';
import { CohortContact, fetchCohortPresence } from '../../../services/cohortPresenceApi';
import { pingPresence } from '../../../services/communityApi';
import { useIsExplorer } from '../useIsExplorer';
import { useIsOrgManager } from '../useIsOrgManager';

// Sidebar nav — mirrors the Design E mockup: three grouped sections, one SVG
// icon per item. Today / Path / Schedule / Projects / Classroom / Community /
// Rooms are built and navigate; Cert Prep / Portfolio are deferred past the
// P0 launch fence and render as a dimmed "Soon" item. (Rooms IS the group-chat
// surface — text + video rooms — so the old "Group Chat" placeholder was removed.)
type NavItem = { label: string; to?: string; icon: React.ReactNode; soon?: boolean };
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
      { label: 'Projects', to: '/portal/projects', icon: (
        <svg viewBox="0 0 24 24" fill="none"><path d="M3 7l9-4 9 4-9 4-9-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M3 12l9 4 9-4M3 17l9 4 9-4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
      ) },
      { label: 'Classroom', to: '/portal/classroom', icon: (
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
      { label: 'Rooms', to: '/portal/rooms', icon: (
        <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M17 9l4-2v10l-4-2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
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
  const isExplorer = useIsExplorer();   // Explorer = demo tier — shows a Demo pill on Projects
  const isOrgManager = useIsOrgManager(); // manager = also sees a "Your company" nav group
  // Effective nav: managers get "Your company" prepended above "Your day".
  const groups = useMemo<NavGroup[]>(
    () => (isOrgManager ? [COMPANY_NAV_GROUP, ...NAV_GROUPS] : NAV_GROUPS),
    [isOrgManager],
  );
  // Mobile bottom tab bar mirrors the effective, navigable destinations.
  const tabItems = useMemo(
    () => groups.flatMap((g) => g.items).filter((i) => i.to && !i.soon),
    [groups],
  );
  const [points, setPoints] = useState<PointsSummary | null>(null);
  const [schedule, setSchedule] = useState<OnboardingSchedule | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
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
  useEffect(() => {
    let alive = true;
    const tick = () => {
      fetchCohortPresence().then((list) => { if (alive) setContacts(list); }).catch(() => { /* keep last roster */ });
      pingPresence().catch(() => { /* non-fatal */ });
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

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
  const oh = schedule?.next_open_house || null;
  const ohCd = countdown(oh ? new Date(oh.starts_at).getTime() : null, now);
  const fcCd = countdown(firstClassTargetMs(schedule?.first_class ?? null), now);
  const cohortName = schedule?.first_class?.cohort_name || 'Your cohort';
  const active = location.pathname;

  // Contacts rail — show only who's online now (no full-roster dump of registered
  // strangers). The friends model + DMs will replace this; see follow-up.
  const onlineList = contacts.filter((c) => c.presence !== 'offline');

  return (
    <div className={`te-shell${navCollapsed ? ' collapsed' : ''}${contactsCollapsed ? ' contacts-collapsed' : ''}`}>
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
            aria-label={`${total} points, level ${lvl.name} — view your points breakdown`}
          >
            {fx && <span key={fx.key} className="te-hud-burst" aria-hidden="true">+{fx.delta}</span>}
            <div className="row"><span className="lvl"><svg className="star" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7L12 17.8 5.8 21.5l1.7-7L2 9.8l7.2-.6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>{lvl.name}</span><span className="pts">{displayTotal.toLocaleString()} pts</span></div>
            <div className="bar"><i style={{ width: `${lvl.pct}%` }} /></div>
            <div className="next">{lvl.next ? `${lvl.next.min - total} pts to ${lvl.next.name}` : 'Max level'}</div>
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
                  {n.label === 'Projects' && isExplorer && <span className="te-soon" style={{ background: '#E8920C', color: '#fff', fontWeight: 700 }}>Demo</span>}
                  {n.soon && <span className="te-soon">Soon</span>}
                </>
              );
              if (isActive) return <span key={n.label} className="te-navbtn active">{inner}</span>;
              if (n.soon) return <span key={n.label} className="te-navbtn is-soon" title="Coming soon" aria-disabled="true">{inner}</span>;
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
        <button type="button" className="te-ct-find" title="Find people">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M21 21l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          <span>Find people</span>
        </button>
        <div className="te-ct-list">
          {onlineList.length > 0 && <div className="te-ct-grp">Online now · {onlineList.length}</div>}
          {onlineList.map((c) => (
            <button key={c.id} type="button" className="te-ctrow" data-name={c.name} title={c.name}>
              <span className="te-ctav" style={{ background: c.color }}>{c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.initials}<span className={`te-ctpres ${c.presence}`} /></span>
              <span className="te-ctname">{c.name}</span>
              <span className={`te-ctpres ${c.presence}`} />
            </button>
          ))}
          {onlineList.length === 0 && (
            <div className="te-ct-empty">No connections yet. Use <b>Find people</b> to connect with your cohort and start a conversation.</div>
          )}
        </div>
      </aside>

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
