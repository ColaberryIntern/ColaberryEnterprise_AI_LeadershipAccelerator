/**
 * C11 phone pass (390 px): the banner trail is never blank, the message toast moves clear of the card while a layer is open,
 * and the map (WP-1: the campus home, /portal/campus) scrolls the walk target into view. (The overlay's map bar and its phone
 * "More" menu were removed with the overlay in WP-1.) Layout itself is checked in the 390x844 screenshots (T8); jsdom has no layout, so the CSS rules that make
 * these work are pinned here by text.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: true }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({}), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
  fetchLook: () => Promise.resolve({ points: 0, rung_name: 'AI Aware I', equipped: {}, catalog: [] }),
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
import { DmToastView } from '../CampusDmToast';
// eslint-disable-next-line import/first
import { trailFor } from '../campusTrail';
// eslint-disable-next-line import/first
import { buildingsFor } from '../campusMap';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { WithCampusHome, skipGate, signIn, where, Where } from './testEnv/WithCampusHome';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DIR = path.join(__dirname, '..');
const css = (f: string) => fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** The body of the (first) max-width:820px media block of a stylesheet. */
const phoneRules = (f: string) => {
  const s = css(f);
  const i = s.search(/@media\s*\(\s*max-width\s*:\s*820px\s*\)\s*\{/);
  if (i < 0) return '';
  let depth = 0, j = s.indexOf('{', i);
  for (let k = j; k < s.length; k += 1) { if (s[k] === '{') depth += 1; if (s[k] === '}') { depth -= 1; if (depth === 0) return s.slice(j + 1, k); } }
  return '';
};

let campus: ReturnType<typeof useCampus>;
function Controls(): null { campus = useCampus(); return null; }
let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };
async function mountCampus(): Promise<void> {
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, motion: 'on' }));
  skipGate();
  signIn();
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter initialEntries={['/portal/today']}><ParticipantAuthProvider><CampusProvider><Controls /><Where /><WithCampusHome><CampusLayers /></WithCampusHome></CampusProvider></ParticipantAuthProvider></MemoryRouter>);
  });
  await flush();
}
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); window.localStorage.clear(); jest.restoreAllMocks(); });

// C11b: the illustrated map is ~5x the DOM of the C2 outlines (377 vs 77 nodes; trees, paths, windows), and these suites mount
// the whole campus (up to three maps) and some run axe over it; a cold first render under parallel jest can pass 5 s.
jest.setTimeout(15000);

describe('banner trail on phones is never blank', () => {
  it('a page outside every building has exactly one crumb, "Campus"', () => {
    expect(trailFor('/portal/settings', buildingsFor('member'), false)).toEqual([{ label: 'Campus' }]);
  });
  it('CSS: the "Campus" crumb hides on phones ONLY when another crumb follows it', () => {
    const phone = phoneRules('campusBanner.css');
    expect(phone).toMatch(/\.cm-trail li:first-child:not\(:only-child\)\{display:none\}/);
    expect(phone).not.toMatch(/\.cm-trail li:first-child\{display:none\}/);
  });
});

describe('the message toast stays clear of card actions', () => {
  it('carries is-over-layer while a campus layer is open, and not otherwise', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const toast = { key: 'k', peerId: 'p', peerName: 'Sam' };
    await act(async () => { root = createRoot(container); root.render(<MemoryRouter><DmToastView toast={toast} onDismiss={() => undefined} overLayer /></MemoryRouter>); });
    expect(q('[data-testid="cm-dm-toast"]')!.classList.contains('is-over-layer')).toBe(true);
    await act(async () => { root.render(<MemoryRouter><DmToastView toast={toast} onDismiss={() => undefined} /></MemoryRouter>); });
    expect(q('[data-testid="cm-dm-toast"]')!.classList.contains('is-over-layer')).toBe(false);
  });
  it('CSS: on phones the raised toast sits at the top', () => {
    expect(phoneRules('campusPeople.css')).toMatch(/\.cm-dm-toast\.is-over-layer\{top:[^;]+;bottom:auto\}/);
  });
});

describe('the map scrolls the walk target into view', () => {
  it('walking to a building on the campus home scrolls it to the center, instantly with reduce motion', async () => {
    const spy = jest.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = spy;
    await mountCampus();
    await act(async () => { campus.openMap('library'); });
    await flush();
    expect(where.path).toBe('/portal/campus');
    const call = spy.mock.calls.find((_c, i) => (spy.mock.instances[i] as Element).getAttribute?.('data-building') === 'library');
    expect(call?.[0]).toEqual({ block: 'nearest', inline: 'center', behavior: 'auto' });
    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
  });
});
