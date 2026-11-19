import fs from 'fs';
import path from 'path';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { HqFloorScene } from '../HqInside';
import { HqPanel } from '../HqPanel';
import { buildHq, PLACEMENT_SECTION, type HqFloor, type HqNav, type HqPlaced } from '../hqModel';
import type { HqState } from '../useHq';
import type { HqPerson } from '../HqPeople';
import { VIEW_AS_TOKEN_KEY, PARTICIPANT_TOKEN_KEY } from '../../../../utils/participantToken';
import { MGMT_BRIDGE_BLOCKED_REASON } from '../../../../pages/portal/mgmtBridgeGate';

jest.mock('../../../careerPrep/careerPrepApi', () => ({ fetchPrepSummary: jest.fn() }));

/**
 * AF2.7b — the campus HQ tower obeys the view-as rule, and keeps obeying it.
 *
 * `adminLinkViewAs.test.tsx` closed this on the four campus surfaces that existed in October:
 * a new tab carries none of this tab's sessionStorage view-as token, so an admin room opened
 * from a view-as session bridges as the ADMIN, silently, as the wrong person. The fix was to
 * put the refusal in one leaf so *"a fifth call site added later inherits the rule instead of
 * having to remember it."*
 *
 * The HQ elevator shipped two days later with two hand-rolled anchors and did not inherit it.
 * Ali hit the same bug again on 2026-11-19, from the Staff Office floor.
 *
 * So this file asserts BOTH halves, because either alone would have let it through:
 *
 *   1. the tower's rooms are withheld during a view-as session, rendered (not unit-tested in
 *      isolation, since isolation is exactly what the first fix had);
 *   2. no other file under `components/campus` can compute a room's URL, which is the only way
 *      to draw a room link, so a third HQ surface cannot hand-roll its way around the leaf.
 *
 * Assertions are on the ANCHOR, never on the label: the thing that must not exist is a
 * clickable new-tab link.
 */

const nav: HqNav = { pinned: [], groups: [
  { label: 'Revenue', section: 'revenue', links: [{ path: '/admin/revenue', label: 'Revenue', icon: 'x' }] },
  { label: 'Placement', section: PLACEMENT_SECTION, links: [{ path: '/admin/placement/students', label: 'Student prep', icon: 'x', inPlace: true }] },
] };
const empty: HqPlaced<HqPerson> = { lobby: [], byFloor: new Map(), byRoom: new Map() };
const who = { name: 'Ali', initials: 'A', title: 'Staff' };
const hq = buildHq(() => true, true, 'staff', nav);
const floorNamed = (label: string): HqFloor => hq.floors.find((f) => f.label === label)!;

const state = (f: HqFloor): HqState => ({
  hq, scene: 'floor', floor: f.num, cabAt: f.num, hover: null, moving: false, doorsShut: false, toast: null,
  walkIn: jest.fn(), toLobby: jest.fn(), toCab: jest.fn(), ride: jest.fn(), locked: jest.fn(), lockedRoom: jest.fn(), setHover: jest.fn(),
  floorOf: (num) => hq.floors.find((x) => x.num === num) ?? null,
});

const tok = (claims: Record<string, unknown>): string => `h.${btoa(JSON.stringify(claims))}.s`;
const viewingAsSomeoneElse = () => {
  localStorage.setItem(PARTICIPANT_TOKEN_KEY, tok({ sub: 'admin-sub' }));
  sessionStorage.setItem(VIEW_AS_TOKEN_KEY, tok({ sub: 'member-sub', read_only: true }));
};

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
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } host?.remove(); host = null; root = null; });

const scene = (label: string) => <HqFloorScene s={state(floorNamed(label))} f={floorNamed(label)} people={empty} />;
const panel = (label: string) => <HqPanel s={state(floorNamed(label))} who={who} face="" placed={empty} />;

describe('a bridge room during a read-only view-as session', () => {
  beforeEach(viewingAsSomeoneElse);

  it('the floor scene offers no clickable door', async () => {
    const h = await mount(scene('Revenue'));
    expect(h.querySelector('a[data-testid="cm-hq-office"]')).toBeNull();
    expect(h.querySelectorAll('a[href]')).toHaveLength(0);
  });

  it('the floor scene says why, and still names the room', async () => {
    const h = await mount(scene('Revenue'));
    const el = h.querySelector('[data-admin-blocked="view-as"]') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute('aria-disabled')).toBe('true');
    expect(el.getAttribute('title')).toBe(MGMT_BRIDGE_BLOCKED_REASON);
    expect(el.getAttribute('data-testid')).toBe('cm-hq-office'); // the surface keeps its test hook
    expect(el.textContent).toContain('Revenue');
  });

  it('the side panel offers no clickable room row', async () => {
    const h = await mount(panel('Revenue'));
    expect(h.querySelector('a[data-testid="cm-hq-rrow"]')).toBeNull();
    const el = h.querySelector('[data-admin-blocked="view-as"]') as HTMLElement;
    expect(el.getAttribute('title')).toBe(MGMT_BRIDGE_BLOCKED_REASON);
    expect(el.textContent).toContain('Revenue');
  });
});

/**
 * THE CONTROLS, and they are the point of the file. A leaf that refused unconditionally, or that
 * refused every room rather than only the bridged ones, would pass every assertion above while
 * removing the tower from the campus and breaking view-as itself.
 */
describe('the controls', () => {
  it('with no view-as session the door is a real new-tab link again', async () => {
    const h = await mount(scene('Revenue'));
    const a = h.querySelector('a[data-testid="cm-hq-office"]') as HTMLAnchorElement;
    expect(a).toBeTruthy();
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    // Through the bridge, which is precisely what made the new tab dangerous.
    expect(a.getAttribute('href')).toMatch(/^\/portal\/mgmt-enter/);
    expect(a.getAttribute('aria-label')).toBe('Revenue, opens in a new tab');
    expect(h.querySelector('[data-admin-blocked="view-as"]')).toBeNull();
  });

  it('with no view-as session the panel row is a real new-tab link again', async () => {
    const h = await mount(panel('Revenue'));
    const a = h.querySelector('a[data-testid="cm-hq-rrow"]') as HTMLAnchorElement;
    expect(a).toBeTruthy();
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('a SAME-TAB room stays open during view-as, because that is what view-as is for', async () => {
    viewingAsSomeoneElse();
    const h = await mount(scene('Placement'));
    const a = h.querySelector('a[data-testid="cm-hq-office"]') as HTMLAnchorElement;
    expect(a).toBeTruthy();
    expect(a.textContent).toContain('Student prep');
    // Same tab, so this tab's view-as token travels with it and the bridge landing has its own
    // say (mgmtBridgeGate). Withholding it here would delete the Career Prep door instead.
    expect(a.hasAttribute('target')).toBe(false);
    expect(a.hasAttribute('rel')).toBe(false);
  });
});

/**
 * The second half: nobody else may compute a room's URL.
 *
 * Drawing a room link requires its href, so pinning the set of files that can produce one pins
 * the set of files that can draw one. A new HQ surface either renders `HqRoomLink` or fails
 * here, which is the conversation this test exists to force.
 */
describe('hqRoomLinkIsTheLeaf', () => {
  const DIR = path.join(__dirname, '..', '..');
  const rel = (f: string) => path.relative(DIR, f).split(path.sep).join('/');
  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(path.join(dir, e.name));
      return /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : [];
    });
  }
  // A comment naming a helper is not a call to it; campusNoHex.test.ts strips the same way.
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const FILES = walk(DIR);
  const callers = (needle: string) => FILES
    .filter((f) => stripComments(fs.readFileSync(f, 'utf8')).includes(needle))
    .map(rel).sort();

  it('scans the real campus tree, recursively, test files excluded', () => {
    expect(FILES.map(rel)).toContain('hq/HqRoomLink.tsx');
    expect(FILES.map(rel)).toContain('AdminLink.tsx');
    expect(FILES.map(rel).some((f) => f.includes('__tests__'))).toBe(false);
  });

  it('roomHref is called only where it is defined and by the leaf', () => {
    expect(callers('roomHref(')).toEqual(['hq/HqRoomLink.tsx', 'hq/hqModel.ts']);
  });

  it('mgmtBridgeTo is called only where a room URL is built, never at a link', () => {
    expect(callers('mgmtBridgeTo(')).toEqual(['campusMap.ts', 'hq/hqModel.ts']);
  });

  it('mutation control: a planted call is caught, and a mention in a comment is not', () => {
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hqleaf-'));
    fs.writeFileSync(path.join(tmp, 'Sneaky.tsx'), 'const h = roomHref(r);');
    fs.writeFileSync(path.join(tmp, 'Innocent.tsx'), '/* calls roomHref(r) one day */ const x = 1;');
    const hit = (n: string) => fs.readdirSync(tmp)
      .filter((f) => stripComments(fs.readFileSync(path.join(tmp, f), 'utf8')).includes(n)).sort();
    expect(hit('roomHref(')).toEqual(['Sneaky.tsx']);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
