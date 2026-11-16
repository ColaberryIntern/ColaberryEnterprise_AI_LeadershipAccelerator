import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { HqFloorScene } from '../HqInside';
import { HqPanel } from '../HqPanel';
import { buildHq, PLACEMENT_SECTION, type HqFloor, type HqNav, type HqPlaced } from '../hqModel';
import { CAREER_PREP_ROOM_PATH } from '../careerPrepDoors';
import type { HqState } from '../useHq';
import type { HqPerson } from '../HqPeople';
import { fetchPrepSummary } from '../../../careerPrep/careerPrepApi';
import { resetCareerPrepSummaryCache } from '../../../careerPrep/useCareerPrepSummary';

jest.mock('../../../careerPrep/careerPrepApi', () => ({ fetchPrepSummary: jest.fn() }));

/**
 * CP2.1 to CP2.3, rendered: the Placement staff door opens in the SAME tab, every other staff room in a
 * new tab; the student's Career Prep floor swaps in its own scene; the panel counts doors and its door
 * row opens the room in the same tab.
 */
const nav: HqNav = { pinned: [], groups: [
  { label: 'Revenue', section: 'revenue', links: [{ path: '/admin/revenue', label: 'Revenue', icon: 'x' }] },
  { label: 'Placement', section: PLACEMENT_SECTION, links: [{ path: '/admin/placement/students', label: 'Student prep', icon: 'x', inPlace: true }] },
] };
const empty: HqPlaced<HqPerson> = { lobby: [], byFloor: new Map(), byRoom: new Map() };
const state = (hq: ReturnType<typeof buildHq>, f: HqFloor): HqState => ({
  hq, scene: 'floor', floor: f.num, cabAt: f.num, hover: null, moving: false, doorsShut: false, toast: null,
  walkIn: jest.fn(), toLobby: jest.fn(), toCab: jest.fn(), ride: jest.fn(), locked: jest.fn(), lockedRoom: jest.fn(), setHover: jest.fn(),
  floorOf: (num) => hq.floors.find((x) => x.num === num) ?? null,
});

let host: HTMLDivElement | null = null;
let root: Root | null = null;
async function mount(el: React.ReactElement): Promise<HTMLDivElement> {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const r = createRoot(h);
  host = h; root = r;
  await act(async () => { r.render(el); });
  await act(async () => { await Promise.resolve(); });
  return h;
}
beforeEach(() => { resetCareerPrepSummaryCache(); (fetchPrepSummary as jest.Mock).mockResolvedValue({ stops: {}, interviews: [], today: '2026-11-16' }); });
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } host?.remove(); host = null; root = null; });

describe('staff doors: same tab for Placement, new tab for everything else (CP2.1)', () => {
  const hq = buildHq(() => true, true, 'staff', nav);
  const floorNamed = (label: string) => hq.floors.find((f) => f.label === label)!;

  it('renders the Student prep door with no target and no rel', async () => {
    const h = await mount(<HqFloorScene s={state(hq, floorNamed('Placement'))} f={floorNamed('Placement')} people={empty} />);
    const a = h.querySelector('a[data-testid="cm-hq-office"]') as HTMLAnchorElement;
    expect(a.textContent).toContain('Student prep');
    expect(a.hasAttribute('target')).toBe(false);
    expect(a.hasAttribute('rel')).toBe(false);
  });

  it('still opens another staff room in a new tab', async () => {
    const h = await mount(<HqFloorScene s={state(hq, floorNamed('Revenue'))} f={floorNamed('Revenue')} people={empty} />);
    const a = h.querySelector('a[data-testid="cm-hq-office"]') as HTMLAnchorElement;
    expect(a.getAttribute('target')).toBe('_blank');
  });
});

describe('the student\'s Career Prep floor (CP2.3)', () => {
  const hq = buildHq(() => false, false, 'member', nav, undefined, undefined, {}, { on: true });
  const f = hq.floors.find((x) => x.label === 'Career Prep')!;

  it('swaps in the Career Prep scene instead of the generic floor', async () => {
    const h = await mount(<HqFloorScene s={state(hq, f)} f={f} people={empty} />);
    expect(h.querySelector('[data-testid="cp-floor"]')).not.toBeNull();
    expect(h.querySelector('[data-testid="cm-hq-floor"]')).toBeNull();
  });

  it('the panel counts one door and its door row opens the room in the same tab', async () => {
    const h = await mount(<HqPanel s={state(hq, f)} who={{ name: 'Ali', initials: 'A', title: 'Student' }} face="" placed={empty} />);
    expect(h.textContent).toContain('Doors on this floor');
    expect(h.textContent).toContain('1 door');
    const row = Array.from(h.querySelectorAll('a.cm-hq-rrow')).find((a) => a.getAttribute('href') === CAREER_PREP_ROOM_PATH) as HTMLAnchorElement;
    expect(row).toBeTruthy();
    expect(row.hasAttribute('target')).toBe(false);
  });
});
