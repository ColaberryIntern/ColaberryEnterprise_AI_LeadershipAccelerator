/**
 * C49 (v13 T1): a visible Today button in the campus top bar for every account. Explorers get the red primary pill (Today is their
 * home base); members, business and staff a neutral one (Ali's default). It opens /portal/today?stay=1 so the first-visit landing
 * never bounces it back to the map, and carries "<done> of <total>" only when there is a plan.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../../pages/portal/community/NotificationBell', () => ({ __esModule: true, default: () => null }));
jest.mock('../home/AccountChip', () => ({ __esModule: true, default: () => null }));
let mockAudience = 'explorer';
jest.mock('../useCampusView', () => ({ useCampusView: () => ({ audience: mockAudience, buildings: [], accessOf: () => 'open', ready: true }) }));
jest.mock('../CampusContext', () => ({ useCampus: () => ({ openMap: () => undefined, layer: null, settings: { workplaceNames: false } }) }));
// eslint-disable-next-line import/first
import CampusTopBar from '../home/CampusTopBar';
// eslint-disable-next-line import/first
import CampusTabBar from '../CampusTabBar';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (s: string) => container.querySelector(s) as HTMLElement | null;
const show = (audience: string, today: { done: number; total: number } | null = null) => act(() => {
  root.render(<MemoryRouter><CampusTopBar audience={audience as never} online={3} points={10} rung={null} streak={1} initials="AM" today={today}
    onList={() => undefined} onFind={() => undefined} onMe={() => undefined} /></MemoryRouter>);
});

it('every account has the Today button; only Explorers get the red primary pill', () => {
  for (const a of ['explorer', 'member', 'business', 'staff']) {
    show(a);
    const b = q('[data-testid="cm-topbar-today"]')!;
    expect([a, b.classList.contains('is-primary')]).toEqual([a, a === 'explorer']);
    expect(b.getAttribute('aria-label')).toBe('Open Today: your next step, plan and events');
  }
});

it('opens /portal/today?stay=1 (the landing rule never bounces it)', () => {
  show('explorer');
  expect(q('[data-testid="cm-topbar-today"]')!.getAttribute('href')).toBe('/portal/today?stay=1');
});

it('shows "<done> of <total>" from the plan, and no count without one', () => {
  show('member', { done: 1, total: 3 });
  expect(q('[data-testid="cm-topbar-today-count"]')!.textContent).toBe('1 of 3');
  show('member', null);
  expect(q('[data-testid="cm-topbar-today-count"]')).toBeNull();
  show('member', { done: 0, total: 0 });
  expect(q('[data-testid="cm-topbar-today-count"]')).toBeNull();
});

it('on phones, Explorers get Today first in the tab bar; everyone else keeps Map first', () => {
  const order = () => Array.from(container.querySelectorAll('.cm-tab .lb')).map((n) => n.textContent);
  mockAudience = 'explorer';
  act(() => { root.render(<MemoryRouter><CampusTabBar active="/portal/campus" /></MemoryRouter>); });
  expect(order().slice(0, 2)).toEqual(['Today', 'Map']);
  mockAudience = 'member';
  act(() => { root.render(<MemoryRouter><CampusTabBar active="/portal/campus" /></MemoryRouter>); });
  expect(order().slice(0, 2)).toEqual(['Map', 'Today']);
});
