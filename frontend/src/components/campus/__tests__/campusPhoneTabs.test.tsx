/**
 * C23 WP-11: the phone tab bar is the prototype's five (D:1311): Map, Today, Messages, Alerts, Me. On a phone the top bar's
 * stats pill is hidden, so these tabs are the only way to the inbox, the bell and the Me panel. On the campus home they open in
 * place; on a page they go back to the map with the panel to open in the router state (CampusHomePage opens it on arrival).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

let mockAudience = 'member';
const mockOpenMe = jest.fn();
let mockConvos: { unread: boolean }[] | null = null;
jest.mock('../useCampusView', () => ({ useCampusView: () => ({ audience: mockAudience, buildings: [], accessOf: () => 'open', ready: true }) }));
jest.mock('../CampusContext', () => ({ useCampus: () => ({ openMap: () => undefined, layer: null, openMe: mockOpenMe, dmConversations: mockConvos }) }));
// eslint-disable-next-line import/first
import CampusTabBar, { PANEL_STATE } from '../CampusTabBar';
// eslint-disable-next-line import/first
import { OPEN_BELL_EVENT } from '../art/BuildingBadges';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let where: { path: string; state: unknown } = { path: '', state: null };
function Probe(): null { const l = useLocation(); where = { path: l.pathname, state: l.state }; return null; }
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); mockOpenMe.mockReset(); mockConvos = null; mockAudience = 'member'; });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (s: string) => container.querySelector(s) as HTMLElement | null;
const labels = () => Array.from(container.querySelectorAll('.cm-tab .lb')).map((n) => n.textContent);
const click = (s: string) => act(() => { q(s)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const show = (at: string, onMessages?: () => void) => act(() => {
  root.render(<MemoryRouter initialEntries={[at]}><Routes><Route path="*" element={<><CampusTabBar active={at} onMessages={onMessages} /><Probe /></>} /></Routes></MemoryRouter>);
});

it('the prototype\'s five tabs; Explorers get Today first; business has no Messages (no inbox)', () => {
  show('/portal/campus');
  expect(labels()).toEqual(['Map', 'Today', 'Messages', 'Alerts', 'Me']);
  mockAudience = 'explorer';
  show('/portal/campus');
  expect(labels()).toEqual(['Today', 'Map', 'Messages', 'Alerts', 'Me']);
  mockAudience = 'business';
  show('/portal/campus');
  expect(labels()).toEqual(['Map', 'Today', 'Alerts', 'Me']);
});

it('on the campus home: Messages opens the inbox, Alerts the bell, Me the Me panel, without leaving the map', () => {
  const onMessages = jest.fn();
  const bell = jest.fn();
  window.addEventListener(OPEN_BELL_EVENT, bell);
  show('/portal/campus', onMessages);
  click('[data-testid="cm-tab-messages"]');
  click('[data-testid="cm-tab-alerts"]');
  click('[data-testid="cm-tab-me"]');
  window.removeEventListener(OPEN_BELL_EVENT, bell);
  expect(onMessages).toHaveBeenCalledTimes(1);
  expect(bell).toHaveBeenCalledTimes(1);
  expect(mockOpenMe).toHaveBeenCalledTimes(1);
  expect(where).toEqual({ path: '/portal/campus', state: null });
});

it.each(['messages', 'alerts', 'me'] as const)('on a page, %s goes back to the map and asks it to open the panel', (panel) => {
  const bell = jest.fn();
  window.addEventListener(OPEN_BELL_EVENT, bell);
  show('/portal/library');
  click(`[data-testid="cm-tab-${panel}"]`);
  window.removeEventListener(OPEN_BELL_EVENT, bell);
  expect(where).toEqual({ path: '/portal/campus', state: { [PANEL_STATE]: panel } });
  expect(bell).not.toHaveBeenCalled(); // the home opens it on arrival, not the page
  expect(mockOpenMe).not.toHaveBeenCalled();
});

it('the Messages tab carries the unread count (9+ past nine), nothing at zero', () => {
  mockConvos = [{ unread: true }, { unread: false }, { unread: true }];
  show('/portal/campus');
  expect(q('[data-testid="cm-tab-messages"] .cm-tab-badge')!.textContent).toBe('2');
  expect(q('[data-testid="cm-tab-messages"]')!.getAttribute('aria-label')).toBe('Messages, 2 unread');
  mockConvos = Array.from({ length: 12 }, () => ({ unread: true }));
  show('/portal/campus');
  expect(q('[data-testid="cm-tab-messages"] .cm-tab-badge')!.textContent).toBe('9+');
  mockConvos = [{ unread: false }];
  show('/portal/campus');
  expect(q('.cm-tab-badge')).toBeNull();
  expect(q('[data-testid="cm-tab-messages"]')!.getAttribute('aria-label')).toBe('Messages');
});

it('Today is a link to Today and is the active tab there', () => {
  show('/portal/today');
  const t = q('[data-testid="cm-tab-today"]')!;
  expect(t.getAttribute('href')).toBe('/portal/today');
  expect(t.classList.contains('active')).toBe(true);
  expect(q('[data-testid="cm-tab-map"]')!.classList.contains('active')).toBe(false);
});
