/**
 * C3 "Where to?" (D7): a WAI-ARIA combobox over buildings, rooms and the people the server named.
 * Room -> through the door into the page; building or person -> the map, focused there.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

// C5: the provider reads staff desks and polls the inbox while the campus is on; stubbed so no test touches the network.
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: true }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({
    commons: { count: 3, people: [{ enrollment_id: 'e9', display_name: 'Priya Natarajan', avatar_url: null }, { anonymous: true }, { anonymous: true }] },
  }),
  postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
}));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor('member', { isStaff: false, hasFullAccess: true, isExplorer: false }) };
});

// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusBanner from '../CampusBanner';
// eslint-disable-next-line import/first
import CampusLayers from '../CampusLayers';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let paths: string[] = [];
function Where(): null { paths.push(useLocation().pathname); return null; }
function Probe(): React.ReactElement | null {
  const c = useCampus();
  (window as unknown as { __campus: ReturnType<typeof useCampus> }).__campus = c;
  return c.active ? <><CampusBanner /><CampusLayers /></> : null; // the banner hosts Where to and the page Esc listener
}
const campus = () => (window as unknown as { __campus: ReturnType<typeof useCampus> }).__campus;

let container: HTMLDivElement;
let root: Root;
async function mount(): Promise<void> {
  paths = [];
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, reduceMotion: true }));
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={['/portal/today']}>
        <ParticipantAuthProvider><CampusProvider><Probe /><Routes><Route path="*" element={<Where />} /></Routes></CampusProvider></ParticipantAuthProvider>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
}
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); });

const input = () => container.querySelector('[data-testid="cm-whereto"]') as HTMLInputElement;
const options = () => Array.from(container.querySelectorAll('[role="option"]'));
const listbox = () => container.querySelector('[role="listbox"]') as HTMLUListElement;
async function type(text: string): Promise<void> {
  await act(async () => {
    input().focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input(), text);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const key = (k: string) => act(() => { input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });

describe('combobox semantics', () => {
  it('starts collapsed with the combobox wiring in place', async () => {
    await mount();
    expect(input().getAttribute('role')).toBe('combobox');
    expect(input().getAttribute('aria-autocomplete')).toBe('list');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().getAttribute('aria-controls')).toBe(listbox().id);
    expect(listbox().hidden).toBe(true);
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('typing expands the list, announces the count and points aria-activedescendant at the first option', async () => {
    await mount();
    await type('lib');
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(options().length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="cm-whereto-count"]')?.textContent).toBe(`${options().length} ${options().length === 1 ? 'result' : 'results'}`);
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[0].id);
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('ArrowDown and ArrowUp move the active option and wrap', async () => {
    await mount();
    await type('lib');
    const n = options().length;
    key('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[1 % n].id);
    key('ArrowUp'); key('ArrowUp');
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[n - 1].id);
  });
});

describe('picking', () => {
  it('Enter on a room goes through the door into that page', async () => {
    await mount();
    await type('schedule');
    const i = options().findIndex((o) => o.getAttribute('data-kind') === 'room');
    expect(i).toBeGreaterThanOrEqual(0);
    for (let k = 0; k < i; k++) key('ArrowDown');
    key('Enter');
    for (let k = 0; k < 4; k++) await act(async () => { await Promise.resolve(); });
    expect(paths[paths.length - 1]).toBe('/portal/schedule');
    expect(input().value).toBe('');
  });

  it('Enter on a building opens the map focused on it', async () => {
    await mount();
    await type('library');
    expect(options()[0].getAttribute('data-kind')).toBe('building');
    key('Enter');
    expect(campus().layer).toBe('map');
    expect(campus().mapFocus).toBe('library');
  });

  it('a named person is searchable and opens the map at their building', async () => {
    await mount();
    await type('priya');
    expect(options().map((o) => o.getAttribute('data-kind'))).toEqual(['person']);
    expect(options()[0].textContent).toContain('Priya Natarajan');
    key('Enter');
    expect(campus().mapFocus).toBe('commons');
  });

  it('a mouse pick works the same as Enter', async () => {
    await mount();
    await type('library');
    await act(async () => { options()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    expect(campus().mapFocus).toBe('library');
  });
});

describe('Esc inside the search box', () => {
  it('first Esc closes the list and keeps focus; second Esc leaves the box; neither steps outside', async () => {
    await mount();
    await type('lib');
    key('Escape');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(input());
    key('Escape');
    expect(document.activeElement).not.toBe(input());
    expect(campus().layer).toBe('none');
  });

  it('a query with no match keeps the list collapsed and says 0 results', async () => {
    await mount();
    await type('zzzz-nothing');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-testid="cm-whereto-count"]')?.textContent).toBe('0 results');
  });
});
