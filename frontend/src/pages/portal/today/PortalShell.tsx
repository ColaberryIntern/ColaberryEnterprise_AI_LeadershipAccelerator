import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './TodayShell.css';
import { fetchPoints, fetchSchedule, levelFor, PointsSummary, OnboardingSchedule } from '../../../services/onboardingApi';
import { readParticipant, countdown, firstClassTargetMs } from './shellUtils';
import BuildToast from '../projects/BuildToast';

// Sidebar nav — mirrors the Design E mockup: three grouped sections, one SVG
// icon per item. Today / Path / Schedule / Projects / Classroom are built and
// navigate; Cert Prep / Community / Group Chat / Portfolio are deferred past
// the P0 launch fence and render as a dimmed "Soon" item.
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
      { label: 'Classroom', to: '/portal/curriculum', icon: (
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
      { label: 'Community', soon: true, icon: (
        <svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="2" /><path d="M3 19c0-3 3-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M16 7a3 3 0 0 1 0 6M18 19c0-2-1-3.5-2.5-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) },
      { label: 'Group Chat', soon: true, icon: (
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 5h16v10H8l-4 4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) },
      { label: 'Portfolio', soon: true, icon: (
        <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M9 6V4h6v2M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) },
    ],
  },
];

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
  const [points, setPoints] = useState<PointsSummary | null>(null);
  const [schedule, setSchedule] = useState<OnboardingSchedule | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const me = useMemo(readParticipant, []);

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

  const total = points?.total ?? 0;
  const lvl = levelFor(total);
  const oh = schedule?.next_open_house || null;
  const ohCd = countdown(oh ? new Date(oh.starts_at).getTime() : null, now);
  const fcCd = countdown(firstClassTargetMs(schedule?.first_class ?? null), now);
  const cohortName = schedule?.first_class?.cohort_name || 'Your cohort';
  const active = location.pathname;

  return (
    <div className="te-shell">
      {/* ── topbar ── */}
      <header className="te-top">
        <div className="te-brand">
          <span className="te-mark">C</span>
          <div><b><span className="cc">C</span>olaberry</b><span>AI Systems Architect Accelerator</span></div>
        </div>
        <div className="te-top-right">
          {(oh || schedule?.first_class) && (
            <div className="te-cdchip" title="Your next milestone">
              <span className="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="2" /><path d="M12 9v4l2.5 2M9 2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
              <span>
                <span className="lbl">{oh ? 'Next open house' : 'First class'}</span>
                <span className="val">
                  {ohCd ? <span className="mono">{ohCd.d}d {ohCd.h}h {ohCd.m}m</span>
                    : fcCd ? <span className="mono">{fcCd.d}d {fcCd.h}h</span> : '--'}
                </span>
              </span>
            </div>
          )}
          <div className="te-hud">
            <div className="row"><span className="lvl">{lvl.name}</span><span className="pts">{total.toLocaleString()} pts</span></div>
            <div className="bar"><i style={{ width: `${lvl.pct}%` }} /></div>
            <div className="next">{lvl.next ? `${lvl.next.min - total} pts to ${lvl.next.name}` : 'Max level'}</div>
          </div>
          <div className="te-avatar" title={me.email}>{me.initials}</div>
        </div>
      </header>

      {/* ── nav ── */}
      <nav className="te-nav">
        {NAV_GROUPS.map((group) => (
          <React.Fragment key={group.grp}>
            <div className="grp">{group.grp}</div>
            {group.items.map((n) => {
              const isActive = !!n.to && (active === n.to || active.startsWith(n.to + '/'));
              const inner = (
                <>
                  <span className="ic">{n.icon}</span>
                  <span className="lb">{n.label}</span>
                  {n.label === 'Today' && !!todayBadge && todayBadge > 0 && <span className="badge">{todayBadge}</span>}
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

      {/* global build-ready toast (fires on any portal page) */}
      <BuildToast />
    </div>
  );
};

export default PortalShell;
