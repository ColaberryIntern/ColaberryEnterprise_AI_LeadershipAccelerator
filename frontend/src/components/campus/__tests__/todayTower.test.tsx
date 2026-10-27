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

// C77 (Ali 2026-10-27: "everyone needs to start with the schedule"): the flag says START HERE and walks into the Schedule, exactly
// as a click on the tower does; it no longer jumps to the Today page
const walked = async (el: HTMLElement, ev: Event): Promise<void> => {
  await act(async () => { el.dispatchEvent(ev); await Promise.resolve(); });
};
it('C77: a flag click walks you to the Schedule (the same as clicking the tower) and stays on the campus', async () => {
  await mount('explorer');
  expect(q('[data-testid="cm-today-flag"]')!.textContent).toBe('START HERE');
  await walked(q('[data-testid="cm-today-flag"]')!, new MouseEvent('click', { bubbles: true }));
  expect(path).toBe('/portal/campus');
  expect(q('[data-testid="cm-card"]')!.textContent).toContain('Schedule');
});

it('C77: Enter on the flag walks to the Schedule too', async () => {
  await mount('explorer');
  await walked(q('[data-testid="cm-today-flag"]')!, new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(path).toBe('/portal/campus');
  expect(q('[data-testid="cm-card"]')!.textContent).toContain('Schedule');
});

// C52 (v13 T4) + C77: the Main Gate says START HERE -> SCHEDULE, for Explorers only (staff see the gate but not the sign)
it('only Explorers see the START HERE sign at the gate, and it walks to the Schedule', async () => {
  for (const a of ['member', 'staff'] as CampusAudience[]) {
    await mount(a);
    expect([a, q('[data-testid="cm-gate-today"]')]).toEqual([a, null]);
    act(() => root.unmount()); container.remove();
  }
  await mount('explorer');
  const sign = q('[data-testid="cm-gate-today"]')!;
  expect(sign.getAttribute('role')).toBe('button');
  expect(sign.getAttribute('aria-label')).toBe('Start here: walk to the Schedule');
  expect(sign.textContent).toBe('START HERE → SCHEDULE');
  await walked(sign, new MouseEvent('click', { bubbles: true }));
  expect(path).toBe('/portal/campus');
  expect(q('[data-testid="cm-card"]')!.textContent).toContain('Schedule');
});

it('the tile offers Open Today and Full schedule', () => {
  const opened: string[] = [];
  container = document.createElement('div'); document.body.appendChild(container);
  act(() => { root = createRoot(container); root.render(<TowerTodayTile onOpen={(r) => opened.push(r)} />); });
  expect(q('[data-testid="cm-tower-today"]')!.textContent).toContain('Today lives here');
  container.querySelectorAll('button').forEach((b) => act(() => { b.click(); }));
  expect(opened).toEqual(['/portal/today?stay=1', '/portal/schedule']);
});
