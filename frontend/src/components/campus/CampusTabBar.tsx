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

export default function CampusTabBar({ active }: { active: string }): React.ReactElement {
  const { openMap, layer, settings } = useCampus();
  const on = (m: string[]) => m.some((p) => active === p || active.startsWith(p + '/'));
  return (
    <nav className="cm-tabbar" aria-label="Campus">
      <button type="button" className={`cm-tab${layer === 'map' ? ' active' : ''}`} onClick={() => openMap()}>
        <span className="cm-tab-ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="2" /></svg>
        </span>
        <span className="lb">Map</span>
      </button>
      {TABS.map((t) => (
        <Link key={t.label} to={t.to} className={`cm-tab${on(t.match) ? ' active' : ''}`} aria-current={on(t.match) ? 'page' : undefined}>
          <span className="cm-tab-ic" aria-hidden="true"><span className="cm-tab-dot" /></span>
          <span className="lb">{settings.workplaceNames && t.workplaceLabel ? t.workplaceLabel : t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
