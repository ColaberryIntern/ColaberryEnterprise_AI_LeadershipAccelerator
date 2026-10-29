/**
 * C84: the Staff tools card lists the Management Portal rooms this badge opens, most used first, capped, with "See all"
 * walking to the HQ (Ali, 2026-10-28: "Don't show all if you have a big list like me").
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { StaffTools } from '../home/ConciergeCards';
import { CAMPUS_BUILDINGS, careerBuildingFor } from '../campusMap';
import { STAFF_TOOLS_CAP, USAGE_KEY } from '../hq/hqUsage';

let mockMgmt = { isMgmt: true, label: 'Owner', sections: [] as string[], canSection: (_s: string) => true };
jest.mock('../campusMgmt', () => ({ useCampusMgmt: () => mockMgmt }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { window.localStorage.clear(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

// The staff face of the career building is the one carrying the admin rooms.
const buildings = CAMPUS_BUILDINGS.map((b) => (b.id === 'career' ? { ...b, ...careerBuildingFor('staff') } : b));
const mount = (onAll?: () => void) => act(() => { root.render(<StaffTools buildings={buildings} onAll={onAll} />); });
const tiles = () => Array.from(container.querySelectorAll('[data-testid="cm-cc-staff-rooms"] a')).map((a) => a.textContent);

test('a full-access badge sees the cap, not every room, and "See all" walks to the HQ', () => {
  const onAll = jest.fn();
  mount(onAll);
  expect(tiles()).toHaveLength(STAFF_TOOLS_CAP);
  expect(container.querySelector('[data-testid="cm-cc-staff-rooms-h"]')!.textContent).toBe('Your rooms');
  const all = container.querySelector('[data-testid="cm-cc-staff-all"]') as HTMLButtonElement;
  expect(all.textContent).toMatch(/^See all \d+ rooms in the Staff Office/);
  act(() => { all.click(); });
  expect(onAll).toHaveBeenCalledTimes(1);
  // every room opens through the Management Portal bridge in a new tab
  for (const a of Array.from(container.querySelectorAll('[data-testid="cm-cc-staff-rooms"] a'))) {
    expect(a.getAttribute('href')).toMatch(/^\/portal\/mgmt-enter\?next=/);
    expect(a.getAttribute('target')).toBe('_blank');
  }
});

test('the most used room comes first and the heading says so', () => {
  window.localStorage.setItem(USAGE_KEY, JSON.stringify({ '/admin/campaigns': { n: 9, at: 1 } }));
  mount();
  expect(tiles()[0]).toContain('Campaigns');
  expect(container.querySelector('[data-testid="cm-cc-staff-rooms-h"]')!.textContent).toBe('Your most used rooms');
});

test('a scoped badge sees only its own rooms and no "See all" when they fit', () => {
  mockMgmt = { ...mockMgmt, label: 'Mentor', canSection: (s: string) => s === 'career_review' };
  mount(() => undefined);
  expect(tiles().length).toBeGreaterThan(0);
  expect(tiles().length).toBeLessThanOrEqual(STAFF_TOOLS_CAP);
  expect(tiles().join(' ')).not.toMatch(/Revenue|Campaigns/);
  expect(container.querySelector('[data-testid="cm-cc-staff-all"]')).toBeNull();
});

test('without Management Portal access there are no staff rooms, only the disabled portal tile', () => {
  mockMgmt = { isMgmt: false, label: null as unknown as string, sections: [], canSection: () => false };
  mount();
  expect(container.querySelector('[data-testid="cm-cc-staff-rooms"]')).toBeNull();
  expect(container.querySelector('.cm-staff-tile.is-0')!.getAttribute('aria-disabled')).toBe('true');
});
