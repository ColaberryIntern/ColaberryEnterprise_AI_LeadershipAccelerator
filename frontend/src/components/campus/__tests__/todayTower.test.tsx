/**
 * C51 (v13 T3) and C52 (T4): Today lives visibly in the Schedule tower, and the Main Gate says START HERE -> TODAY. For Explorers only: the tower's main button is Open Today (members keep
 * Open my schedule; the building list is not forked, and the name and rooms stay), its line says it is their home base, a red TODAY
 * flag above the spire opens Today without walking, and arriving there shows the "Today lives here" tile first.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import CampusWorld from '../CampusWorld';
import { campusBuildingsFor } from '../useCampusView';
import { subOf } from '../campusArrival';
import { TowerTodayTile } from '../home/TodayCard';
import type { CampusAudience } from '../campusMap';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// mounting the whole campus map takes several seconds on a busy machine (a verifier saw one 5 s timeout): give each test room
jest.setTimeout(30_000);
const tower = (a: CampusAudience) => campusBuildingsFor(a).find((b) => b.id === 'tower')!;

it('the tower opens Today for Explorers and the schedule for everyone else; name and rooms do not change', () => {
  expect(tower('explorer').primary).toEqual({ label: 'Open Today', route: '/portal/today?stay=1' });
  for (const a of ['member', 'business', 'staff'] as CampusAudience[]) expect(tower(a).primary).toEqual({ label: 'Open my schedule', route: '/portal/schedule' });
  expect(tower('explorer').name).toBe('Schedule');
  expect(tower('explorer').rooms).toEqual(tower('member').rooms);
  expect(subOf({ id: 'tower' }, 'explorer')).toBe('Today, your home base · plus your schedule');
  expect(subOf({ id: 'tower' }, 'member')).toBe('Your schedule & today’s agenda');
});

let container: HTMLDivElement;
let root: Root;
let path = '';
function Where(): null { path = useLocation().pathname + useLocation().search; return null; }
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = undefined as unknown as Root; });
async function mount(audience: CampusAudience): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={['/portal/campus']}>
        <Where />
        <Routes><Route path="*" element={<CampusWorld buildings={campusBuildingsFor(audience)} audience={audience} hasFullAccess={audience !== 'explorer'}
          workplaceNames={false} reduceMotion onExit={() => {}} onNavigate={() => {}} />} /></Routes>
      </MemoryRouter>,
    );
  });
}
const q = (s: string) => container.querySelector(s) as HTMLElement | null;

it('only Explorers see the TODAY flag', async () => {
  await mount('member');
  expect(q('[data-testid="cm-today-flag"]')).toBeNull();
  act(() => root.unmount()); container.remove();
  await mount('explorer');
  expect(q('[data-testid="cm-today-flag"]')).not.toBeNull();
});

it('a flag click opens Today and starts no walk (no card, no route line)', async () => {
  await mount('explorer');
  act(() => { q('[data-testid="cm-today-flag"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(path).toBe('/portal/today?stay=1');
  expect(q('[data-testid="cm-card"]')).toBeNull();
  expect(q('[data-testid="cm-route-line"]')!.getAttribute('d')).toBe('');
});

it('Enter on the flag opens Today too', async () => {
  await mount('explorer');
  act(() => { q('[data-testid="cm-today-flag"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(path).toBe('/portal/today?stay=1');
});

// C52 (v13 T4): the Main Gate says START HERE -> TODAY, for Explorers only (staff see the gate but not the sign)
it('only Explorers see the START HERE sign at the gate, and it opens Today without a walk', async () => {
  for (const a of ['member', 'staff'] as CampusAudience[]) {
    await mount(a);
    expect([a, q('[data-testid="cm-gate-today"]')]).toEqual([a, null]);
    act(() => root.unmount()); container.remove();
  }
  await mount('explorer');
  const sign = q('[data-testid="cm-gate-today"]')!;
  expect(sign.getAttribute('role')).toBe('button');
  expect(sign.getAttribute('aria-label')).toBe('Start here: open Today');
  expect(sign.textContent).toBe('START HERE → TODAY');
  act(() => { sign.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(path).toBe('/portal/today?stay=1');
  expect(q('[data-testid="cm-card"]')).toBeNull();
});

it('the tile offers Open Today and Full schedule', () => {
  const opened: string[] = [];
  container = document.createElement('div'); document.body.appendChild(container);
  act(() => { root = createRoot(container); root.render(<TowerTodayTile onOpen={(r) => opened.push(r)} />); });
  expect(q('[data-testid="cm-tower-today"]')!.textContent).toContain('Today lives here');
  container.querySelectorAll('button').forEach((b) => act(() => { b.click(); }));
  expect(opened).toEqual(['/portal/today?stay=1', '/portal/schedule']);
});
