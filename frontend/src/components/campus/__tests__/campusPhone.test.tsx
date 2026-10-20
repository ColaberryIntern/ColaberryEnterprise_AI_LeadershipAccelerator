/**
 * C11 phone pass (390 px): the map bar's actions collapse behind "More" (keyboard and Esc work, nothing renders twice), the
 * banner trail is never blank, the message toast moves clear of the card while a layer is open, and the map scrolls the walk
 * target into view. Layout itself is checked in the 390x844 screenshots (T8); jsdom has no layout, so the CSS rules that make
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
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

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
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter><ParticipantAuthProvider><CampusProvider><Controls /><CampusLayers /></CampusProvider></ParticipantAuthProvider></MemoryRouter>);
  });
  await flush();
}
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const esc = async (el: Element) => { await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); };

afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); window.localStorage.clear(); jest.restoreAllMocks(); });

// C11b: the illustrated map is ~5x the DOM of the C2 outlines (377 vs 77 nodes; trees, paths, windows), and these suites mount
// the whole campus (up to three maps) and some run axe over it; a cold first render under parallel jest can pass 5 s.
jest.setTimeout(15000);

describe('map bar: More on phones', () => {
  it('one set of actions: Tour, My look, List view and Settings each render exactly once', async () => {
    await mountCampus();
    await act(async () => { campus.openMap(); });
    await flush();
    const items = q('[data-testid="cm-bar-items"]')!;
    expect(items.querySelectorAll('[data-testid="cm-tour-start-bar"]')).toHaveLength(1);
    expect(items.querySelectorAll('[data-testid="cm-look-open-bar"]')).toHaveLength(1);
    expect(items.querySelectorAll('[data-testid="cm-settings-bar"]')).toHaveLength(1);
    expect(Array.from(items.querySelectorAll('button')).filter((b) => b.textContent === 'List view')).toHaveLength(1);
    expect(document.querySelectorAll('[data-testid="cm-settings-bar"]')).toHaveLength(1);
  });

  it('More opens by click, focuses the first action, Esc closes it and returns focus WITHOUT closing the map', async () => {
    await mountCampus();
    await act(async () => { campus.openMap(); });
    await flush();
    const more = q('[data-testid="cm-bar-more"]')!;
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(q('[data-testid="cm-bar-items"]')!.id).toBe(more.getAttribute('aria-controls'));
    await act(async () => { more.click(); });
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(q('[data-testid="cm-bar-items"]')!.contains(document.activeElement)).toBe(true);
    await esc(document.activeElement!);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more);
    expect(q('[data-testid="cm-overlay"]')).not.toBeNull();
  });

  it('choosing an action closes More and does it (List view opens the list)', async () => {
    await mountCampus();
    await act(async () => { campus.openMap(); });
    await flush();
    await act(async () => { q('[data-testid="cm-bar-more"]')!.click(); });
    const list = Array.from(q('[data-testid="cm-bar-items"]')!.querySelectorAll('button')).find((b) => b.textContent === 'List view')!;
    await act(async () => { list.click(); });
    await flush();
    expect(q('[data-testid="cm-list"]')).not.toBeNull();
  });

  it('CSS: under 820 px the items hide behind More and drop down when open; on wide screens More is hidden', () => {
    const all = css('campus.css');
    expect(all).toMatch(/\.cm-bar-more\{display:none\}/);
    const phone = phoneRules('campus.css');
    expect(phone).toMatch(/\.cm-bar-more\{display:inline-flex/);
    expect(phone).toMatch(/\.cm-bar-items\{display:none\}/);
    expect(phone).toMatch(/\.cm-bar-actions\.is-open \.cm-bar-items\{display:flex/);
    expect(phone).toMatch(/\.cm-layer-bar\{[^}]*flex-wrap:wrap/);
  });
});

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
  it('walking to a building scrolls it to the center, instantly with reduce motion', async () => {
    const spy = jest.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = spy;
    await mountCampus();
    await act(async () => { campus.openMap('library'); });
    await flush();
    const call = spy.mock.calls.find((_c, i) => (spy.mock.instances[i] as Element).getAttribute?.('data-building') === 'library');
    expect(call?.[0]).toEqual({ block: 'nearest', inline: 'center', behavior: 'auto' });
    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
  });
});
