/**
 * C11 accessibility: the six blockers from the audit, each pinned by behavior, plus an axe-core sweep of every campus
 * surface in both themes (the liveMiniPlayer.axe pattern: zero wcag2a/wcag2aa violations, and nothing NEW left unchecked).
 *
 *  1. compact maps (banner, side nav) expose no tabbable buildings;
 *  2. person tokens draw their own focus ring and a 16-unit hit circle;
 *  3. cards take focus on open and hand it back on close (to the dialog when the opener is gone);
 *  4. Tab and Shift+Tab wrap inside the list layer (WP-1: the map is the campus home, a page, not a modal);
 *  5. game keys are read from the canvas only (gameRoomA11y.test.tsx);
 *  6. contrast (campusContrast.test.ts: jsdom has no paint, so axe cannot compute it here).
 */
import React, { useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';

jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: true }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({}), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
  fetchLook: () => Promise.resolve({ points: 200, rung_name: 'Builder', equipped: {}, catalog: [
    { id: 'cap', name: 'Cap', slot: 'head', threshold: 150, unlocked: true }, { id: 'hoodie', name: 'Hoodie', slot: 'body', threshold: 400, unlocked: false }] }),
  putLook: () => Promise.resolve({ points: 200, rung_name: 'Builder', equipped: {}, catalog: [] }),
}));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor('member', { isStaff: false, hasFullAccess: true, isExplorer: false }) };
});
// WP-1: the map is the campus home (/portal/campus) now; its own services are mocked (no network).
jest.mock('../../../services/onboardingApi', () => require('./testEnv/homeServiceMocks').onboardingApi(jest.requireActual('../../../services/onboardingApi')));
jest.mock('../../../services/communityApi', () => require('./testEnv/homeServiceMocks').communityApi(jest.requireActual('../../../services/communityApi')));

// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusLayers from '../CampusLayers';
// eslint-disable-next-line import/first
import CampusNav from '../CampusNav';
// eslint-disable-next-line import/first
import CampusWorldMap from '../CampusWorldMap';
// eslint-disable-next-line import/first
import PersonTokens, { TOKEN_HIT_R } from '../PersonToken';
// eslint-disable-next-line import/first
import { useCardFocus } from '../useCardFocus';
// eslint-disable-next-line import/first
import { CAMPUS_BUILDINGS } from '../campusMap';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { WithCampusHome, skipGate, signIn, where, Where } from './testEnv/WithCampusHome';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let campus: ReturnType<typeof useCampus>;
function Controls(): null { campus = useCampus(); return null; }

let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };
async function render(node: React.ReactNode): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(node); });
  await flush();
}
async function mountCampus(extra?: React.ReactNode): Promise<void> {
  // Reduce motion on: arrivals are instant, so a building card opens in the same act().
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, motion: 'on' }));
  skipGate();
  signIn();
  // WP-1: a page at /portal/today; "open the map" goes to the real campus home at /portal/campus.
  await render(
    <MemoryRouter initialEntries={['/portal/today']}>
      <ParticipantAuthProvider><CampusProvider><Controls /><Where /><WithCampusHome>{extra}<CampusLayers /></WithCampusHome></CampusProvider></ParticipantAuthProvider>
    </MemoryRouter>,
  );
}
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const press = async (el: Element, key: string, shiftKey = false) => {
  await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })); });
};

const PERSON = { enrollment_id: 'p-1', display_name: 'Avery Stone', avatar_url: null, can_message: true, rung_name: 'Builder' };

beforeEach(() => { window.localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

// C11b: the illustrated map is ~5x the DOM of the C2 outlines (377 vs 77 nodes; trees, paths, windows), and these suites mount
// the whole campus (up to three maps) and some run axe over it; a cold first render under parallel jest can pass 5 s.
jest.setTimeout(15000);

describe('1. compact maps are pictures, not 12 extra tab stops', () => {
  it('the compact map has no tabbable building and is hidden from assistive tech; the full map keeps all of them', async () => {
    const props = { buildings: [...CAMPUS_BUILDINGS], accessOf: () => 'open' as const, workplaceNames: false, reduceMotion: true, onArrive: () => undefined };
    await render(<><div data-testid="compact"><CampusWorldMap {...props} compact /></div><div data-testid="full"><CampusWorldMap {...props} /></div></>);
    const compact = q('[data-testid="compact"]')!;
    expect(compact.querySelectorAll('[tabindex], [role="button"]')).toHaveLength(0);
    expect(compact.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(q('[data-testid="full"]')!.querySelectorAll('[role="button"][tabindex="0"]')).toHaveLength(CAMPUS_BUILDINGS.length);
  });

  it('the side nav reaches every building through its links, with no focusable map building', async () => {
    await mountCampus(<CampusNav active="/portal/today" />);
    const nav = q('nav.cm-nav')!;
    expect(nav.querySelector('.cm-nav-map [tabindex]')).toBeNull();
    expect(nav.querySelectorAll('.cm-nav-list a, .cm-nav-list [aria-disabled="true"]').length).toBeGreaterThan(5);
  });
});

describe('2. person tokens: their own focus ring and a real target', () => {
  it('draws a focus ring separate from the level ring, and a hit circle of TOKEN_HIT_R', async () => {
    const b = CAMPUS_BUILDINGS.find((x) => x.id === 'commons')!;
    await render(<svg><PersonTokens b={b} shown={[PERSON]} more={0} maxY={700} onPick={() => undefined} /></svg>);
    const token = q('.cm-token')!;
    const focus = token.querySelector('.cm-token-focus')!;
    expect(focus).not.toBeNull();
    expect(focus.getAttribute('style')).toBeNull(); // the level ring carries the inline stroke; the focus ring never does
    expect(Number(token.querySelector('.cm-token-hit')!.getAttribute('r'))).toBe(TOKEN_HIT_R);
    expect(TOKEN_HIT_R).toBeGreaterThanOrEqual(12);
  });
});

describe('3. cards take focus and give it back', () => {
  function Card({ onClose }: { onClose: () => void }): React.ReactElement {
    const h = useRef<HTMLHeadingElement | null>(null);
    useCardFocus(h);
    return <section><h2 tabIndex={-1} ref={h}>Card</h2><button type="button" onClick={onClose} data-testid="close">x</button></section>;
  }
  function Harness({ dropOpener = false }: { dropOpener?: boolean }): React.ReactElement {
    const [open, setOpen] = useState(false);
    return (
      <div role="dialog" aria-label="Layer" tabIndex={-1} data-testid="dialog">
        {!(dropOpener && open) && <button type="button" data-testid="opener" onClick={() => setOpen(true)}>Open</button>}
        {open && <Card onClose={() => setOpen(false)} />}
      </div>
    );
  }

  it('focuses the heading on open and returns focus to the opener on close', async () => {
    await render(<Harness />);
    const opener = q('[data-testid="opener"]')!;
    opener.focus();
    await act(async () => { opener.click(); });
    expect(document.activeElement?.tagName).toBe('H2');
    await act(async () => { q('[data-testid="close"]')!.click(); });
    expect(document.activeElement).toBe(q('[data-testid="opener"]'));
  });

  it('when the opener is gone, focus lands on the dialog, never on <body>', async () => {
    await render(<Harness dropOpener />);
    const opener = q('[data-testid="opener"]')!;
    opener.focus();
    await act(async () => { opener.click(); });
    await act(async () => { q('[data-testid="close"]')!.click(); });
    expect(document.activeElement).toBe(q('[data-testid="dialog"]'));
  });

  it('a building card opened from the map (the campus home) takes focus on its heading, and Esc gives it back to the building', async () => {
    await mountCampus();
    await act(async () => { campus.openMap('library'); });
    await flush();
    expect(where.path).toBe('/portal/campus');
    expect(q('[data-testid="cm-home"]')).not.toBeNull();
    expect(q('[data-testid="cm-card"]')).not.toBeNull();
    expect(document.activeElement?.classList.contains('cm-card-title')).toBe(true);
    await press(document.activeElement!, 'Escape');
    await flush();
    expect(q('[data-testid="cm-card"]')).toBeNull();
    expect(document.activeElement?.getAttribute('data-building')).toBe('library');
  });

  // WP-1: on the home the openers are SVG (buildings, tokens); useCardFocus accepts them.
  it('a person card takes focus, and Esc hands it back to its opener on the map (the campus home)', async () => {
    await mountCampus();
    await act(async () => { campus.openMap(); });
    await flush();
    expect(where.path).toBe('/portal/campus');
    const opener = q('.cm-bld[data-building="commons"]')!;
    opener.focus();
    await act(async () => { campus.openPersonCard({ person: PERSON, buildingId: 'commons' }); });
    await flush();
    expect(document.activeElement?.textContent).toBe('Avery Stone');
    await press(document.activeElement!, 'Escape');
    expect(q('[data-testid="cm-person-card"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  // WP-1: with no opener and no dialog (the home is a page), focus falls back to the map's first building.
  it('a person card with no opener: Esc still hands focus back inside the map (the campus home), never <body>', async () => {
    await mountCampus();
    await act(async () => { campus.openMap(); });
    await flush();
    expect(where.path).toBe('/portal/campus');
    await act(async () => { campus.openPersonCard({ person: PERSON, buildingId: 'commons' }); });
    await flush();
    expect(document.activeElement?.textContent).toBe('Avery Stone');
    await press(document.activeElement!, 'Escape');
    expect(q('[data-testid="cm-person-card"]')).toBeNull();
    expect(q('[data-testid="cm-home"]')!.contains(document.activeElement)).toBe(true);
  });
});

// WP-1: the map is the campus home, a page rather than a modal, so only the list layer (still a dialog) traps Tab.
describe('4. Tab stays inside the list layer', () => {
  it('list layer: Tab from the last control wraps to the first, Shift+Tab back', async () => {
    await mountCampus();
    await act(async () => { campus.openList(); });
    await flush();
    const layer = q('[data-testid="cm-list"]')!;
    const items = Array.from(layer.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])'))
      .filter((el) => !el.closest('[aria-hidden="true"]'));
    expect(items.length).toBeGreaterThan(2);
    items[items.length - 1].focus();
    await press(items[items.length - 1], 'Tab');
    expect(document.activeElement).toBe(items[0]);
    await press(items[0], 'Tab', true);
    expect(document.activeElement).toBe(items[items.length - 1]);
  });
});

/* ---------------- axe-core sweep ---------------- */

const WCAG = ['wcag2a', 'wcag2aa'];
// Tooling limit, as in liveMiniPlayer.axe: jsdom has no paint. Contrast is campusContrast.test.ts.
const KNOWN_UNCHECKED: ReadonlyArray<string> = ['color-contrast'];
async function audit(el: Element): Promise<{ violations: string[]; unchecked: string[] }> {
  const r = await axe.run(el, { runOnly: { type: 'tag', values: WCAG } });
  return {
    violations: r.violations.map((v) => `${v.id} [${v.impact ?? 'n/a'}] ${v.nodes.map((n) => n.html.slice(0, 120)).join(' | ')}`),
    unchecked: r.incomplete.map((x) => x.id).filter((id) => !KNOWN_UNCHECKED.includes(id)).sort(),
  };
}

const SURFACES: [string, () => Promise<void>, string][] = [
  // WP-1: the map, its cards, the tour and the locker all render on the campus home (cm-home) now.
  ['campus home map', async () => { campus.openMap(); }, 'cm-home'],
  ['list view', async () => { campus.openList(); }, 'cm-list'],
  ['building card', async () => { campus.openMap('commons'); }, 'cm-home'],
  ['person card', async () => { campus.openMap(); await Promise.resolve(); campus.openPersonCard({ person: PERSON, buildingId: 'commons' }); }, 'cm-home'],
  ['tour', async () => { campus.startTour(); }, 'cm-home'],
  ['locker', async () => { campus.openLocker(); }, 'cm-home'],
];

describe.each([['light', null], ['dark', 'dark']])('axe: zero wcag2a/wcag2aa violations (%s)', (_label, theme) => {
  beforeEach(() => { if (theme) document.documentElement.setAttribute('data-theme', theme); });

  it.each(SURFACES)('%s', async (_name, open, testid) => {
    await mountCampus();
    await act(async () => { await open(); });
    await flush();
    const el = q(`[data-testid="${testid}"]`);
    expect(el).not.toBeNull();
    expect(await audit(el!)).toEqual({ violations: [], unchecked: [] });
  }, 30_000);
});

describe('the sweep is really running', () => {
  it('evaluates a non-trivial number of rules on the campus home map', async () => {
    await mountCampus();
    await act(async () => { campus.openMap(); });
    await flush();
    const r = await axe.run(q('[data-testid="cm-home"]')!, { runOnly: { type: 'tag', values: WCAG } });
    expect(r.passes.length + r.violations.length + r.incomplete.length).toBeGreaterThan(5);
  }, 30_000);
});
