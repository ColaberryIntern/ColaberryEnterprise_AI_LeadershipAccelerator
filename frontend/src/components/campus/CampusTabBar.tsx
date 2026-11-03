import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCampus } from './CampusContext';
import { useCampusView } from './useCampusView';
import { OPEN_BELL_EVENT } from './art/BuildingBadges';
import { badgeText, unreadConversations } from './home/inboxModel';

/**
 * Phone bottom bar while the campus is active (Campus C2), in place of nav.te-tabbar; shown by CSS at the same breakpoint.
 * C23 WP-11: the prototype's five slots (D:1311): Map, Today, Messages, Alerts and Me. On a phone the top bar's stats pill
 * (inbox, bell, you) is hidden, so these three are the only way to them. Each tab opens its panel, as the prototype's tabs do
 * (a press always opens, never toggles). On the campus home they open in place; on a page they walk back to the map, which
 * opens the panel on arrival (CampusHomePage reads PANEL_STATE). Business accounts get no Messages tab (no inbox, D:592).
 */
export type PhonePanel = 'messages' | 'alerts' | 'me';
/** The router state key a page's tab bar hands the campus home: `{ [PANEL_STATE]: PhonePanel }`. */
export const PANEL_STATE = 'cmPanel';

/** C11b: each tab's icon (the prototype's tab bar has one per tab, never a placeholder dot). */
const svg = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const ICON = {
  map: <svg viewBox="0 0 24 24" fill="none"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="2" /></svg>,
  today: svg('M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'),
  messages: svg('M4 5h16v10H9l-5 4V5z'),
  alerts: svg('M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0'),
  me: svg('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'),
};
const TODAY_MATCH = ['/portal/today', '/portal/schedule'];

/** `onMessages` is the campus home's inbox opener; without it (on a page) the tab walks back to the map first. */
export default function CampusTabBar({ active, onMessages }: { active: string; onMessages?: () => void }): React.ReactElement {
  const { openMap, layer, openMe, dmConversations } = useCampus();
  const { audience } = useCampusView();
  const navigate = useNavigate();
  const onHome = active === '/portal/campus';
  const todayFirst = audience === 'explorer'; // C49 (v13 T1): Today, the Explorer's home base, leads the tab bar
  const todayOn = TODAY_MATCH.some((p) => active === p || active.startsWith(p + '/'));
  const unread = badgeText(unreadConversations(dmConversations));
  const open = (panel: PhonePanel) => {
    if (!onHome) { navigate('/portal/campus', { state: { [PANEL_STATE]: panel } }); return; }
    if (panel === 'messages') onMessages?.();
    else if (panel === 'alerts') window.dispatchEvent(new Event(OPEN_BELL_EVENT));
    else openMe();
  };
  const button = (panel: PhonePanel, label: string, badge: string | null = null) => (
    <button key={panel} type="button" className="cm-tab" onClick={() => open(panel)} data-testid={`cm-tab-${panel}`}
      aria-label={badge ? `${label}, ${badge} unread` : label}>
      <span className="cm-tab-ic" aria-hidden="true">{ICON[panel]}</span>
      <span className="lb">{label}</span>
      {badge && <i className="cm-tab-badge" aria-hidden="true">{badge}</i>}
    </button>
  );
  const today = (
    <Link key="today" to="/portal/today" className={`cm-tab${todayOn ? ' active' : ''}`} aria-current={todayOn ? 'page' : undefined} data-testid="cm-tab-today">
      <span className="cm-tab-ic" aria-hidden="true">{ICON.today}</span>
      <span className="lb">Today</span>
    </Link>
  );
  const map = (
    <button key="map" type="button" className={`cm-tab${layer === 'map' || onHome ? ' active' : ''}`} aria-current={onHome ? 'page' : undefined} onClick={() => openMap()} data-testid="cm-tab-map">
      <span className="cm-tab-ic" aria-hidden="true">{ICON.map}</span>
      <span className="lb">Map</span>
    </button>
  );
  return (
    <nav className="cm-tabbar" aria-label="Campus">
      {todayFirst ? [today, map] : [map, today]}
      {audience !== 'business' && button('messages', 'Messages', unread)}
      {button('alerts', 'Alerts')}
      {button('me', 'Me')}
    </nav>
  );
}
