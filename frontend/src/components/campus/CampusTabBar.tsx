import React from 'react';
import { Link } from 'react-router-dom';
import { useCampus } from './CampusContext';

/**
 * Phone bottom bar while the campus is active (Campus C2), in place of nav.te-tabbar; shown by
 * CSS at the same breakpoint. Messages and alerts stay in the portal top bar, which phones
 * already show, so the five slots are Map, Today, Lounge, Progress and Me.
 */
// C11: `workplaceLabel` is the short tab name under Workplace names (the Community Lounge is the Collab Cafe there).
const TABS: { label: string; workplaceLabel?: string; to: string; match: string[] }[] = [
  { label: 'Today', to: '/portal/today', match: ['/portal/today', '/portal/schedule'] },
  { label: 'Lounge', workplaceLabel: 'Cafe', to: '/portal/rooms', match: ['/portal/rooms', '/portal/community'] },
  { label: 'Progress', to: '/portal/path', match: ['/portal/path', '/portal/progress', '/portal/points'] },
  { label: 'Me', to: '/portal/settings', match: ['/portal/settings'] },
];

/** C11b: each tab's icon (the prototype's tab bar has one per tab, never a placeholder dot). */
const svg = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const TAB_ICON: Record<string, React.ReactElement> = {
  Today: svg('M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'),
  Lounge: svg('M4 5h16v10H9l-5 4V5z'),
  Progress: svg('M4 19V9M10 19V5M16 19v-7M22 19H2'),
  Me: svg('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'),
};

export default function CampusTabBar({ active }: { active: string }): React.ReactElement {
  const { openMap, layer, settings } = useCampus();
  const on = (m: string[]) => m.some((p) => active === p || active.startsWith(p + '/'));
  return (
    <nav className="cm-tabbar" aria-label="Campus">
      <button type="button" className={`cm-tab${layer === 'map' || active === '/portal/campus' ? ' active' : ''}`} aria-current={active === '/portal/campus' ? 'page' : undefined} onClick={() => openMap()}>
        <span className="cm-tab-ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="2" /></svg>
        </span>
        <span className="lb">Map</span>
      </button>
      {TABS.map((t) => (
        <Link key={t.label} to={t.to} className={`cm-tab${on(t.match) ? ' active' : ''}`} aria-current={on(t.match) ? 'page' : undefined}>
          <span className="cm-tab-ic" aria-hidden="true">{TAB_ICON[t.label]}</span>
          <span className="lb">{settings.workplaceNames && t.workplaceLabel ? t.workplaceLabel : t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
