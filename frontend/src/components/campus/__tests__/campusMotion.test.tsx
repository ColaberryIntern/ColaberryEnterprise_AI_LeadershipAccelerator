/**
 * C11 motion: the campus acts on the learner's choice when made, otherwise the device preference,
 * followed LIVE; the choice reaches CSS through the `cm-reduced` class on <html>; the settings panel
 * changes it and persists it.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: true }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({}), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
  fetchLook: () => Promise.resolve({ equipped: {}, unlocked: [], points: 0 }),
}));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor('member', { isStaff: false, hasFullAccess: true, isExplorer: false }) };
});

// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusSettingsPanel from '../CampusSettingsPanel';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY, REDUCED_MOTION_QUERY } from '../campusSettings';
// eslint-disable-next-line import/first
import { REDUCED_CLASS } from '../useEffectiveReduceMotion';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A controllable prefers-reduced-motion media query. */
let deviceReduces = false;
let listeners: ((e: { matches: boolean }) => void)[] = [];
function installMatchMedia(): void {
  window.matchMedia = ((query: string) => ({
    get matches() { return query === REDUCED_MOTION_QUERY && deviceReduces; },
    media: query,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => { listeners.push(fn); },
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => { listeners = listeners.filter((l) => l !== fn); },
  })) as unknown as typeof window.matchMedia;
}
async function setDevice(reduce: boolean): Promise<void> {
  deviceReduces = reduce;
  await act(async () => { listeners.forEach((l) => l({ matches: reduce })); });
}

let seen: ReturnType<typeof useCampus>;
function Probe(): null { seen = useCampus(); return null; }

let container: HTMLDivElement;
let root: Root;
async function mount(stored: Record<string, unknown> | null, withPanel = false): Promise<void> {
  if (stored) window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify(stored));
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter><ParticipantAuthProvider><CampusProvider><Probe />{withPanel && <CampusSettingsPanel />}</CampusProvider></ParticipantAuthProvider></MemoryRouter>);
  });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
}
const html = () => document.documentElement.classList;
const q = (sel: string) => container.querySelector(sel) as HTMLElement | null;

beforeEach(() => { deviceReduces = false; listeners = []; installMatchMedia(); window.localStorage.clear(); html().remove(REDUCED_CLASS); });
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); });

// C11b: the illustrated map is ~5x the DOM of the C2 outlines (377 vs 77 nodes; trees, paths, windows), and these suites mount
// the whole campus (up to three maps) and some run axe over it; a cold first render under parallel jest can pass 5 s.
jest.setTimeout(15000);

describe('effective reduce motion in the provider', () => {
  const cases: [string, Record<string, unknown> | null, boolean, boolean][] = [
    ['unset, device full motion', null, false, false],
    ['unset, device reduces', null, true, true],
    ['on, device full motion', { motion: 'on' }, false, true],
    ['on, device reduces', { motion: 'on' }, true, true],
    ['off, device full motion', { motion: 'off' }, false, false],
    ['off, device reduces', { motion: 'off' }, true, false],
  ];
  it.each(cases)('%s', async (_label, stored, device, expected) => {
    deviceReduces = device;
    await mount(stored ? { nav: 'campus', workplaceNames: false, ...stored } : null);
    expect(seen.settings.reduceMotion).toBe(expected);
    expect(html().contains(REDUCED_CLASS)).toBe(expected);
  });

  it('follows the device LIVE while the learner has not chosen', async () => {
    await mount(null);
    expect(seen.settings.reduceMotion).toBe(false);
    await setDevice(true);
    expect(seen.settings.reduceMotion).toBe(true);
    expect(html().contains(REDUCED_CLASS)).toBe(true);
    await setDevice(false);
    expect(seen.settings.reduceMotion).toBe(false);
    expect(html().contains(REDUCED_CLASS)).toBe(false);
  });

  it('a made choice is NOT overridden by a later device change', async () => {
    await mount({ nav: 'campus', workplaceNames: false, motion: 'off' });
    await setDevice(true);
    expect(seen.settings.reduceMotion).toBe(false);
  });

  it('removes the class from <html> when the campus goes classic', async () => {
    await mount({ nav: 'campus', workplaceNames: false, motion: 'on' });
    expect(html().contains(REDUCED_CLASS)).toBe(true);
    await act(async () => { seen.updateSettings({ nav: 'classic' }); });
    expect(html().contains(REDUCED_CLASS)).toBe(false);
  });

  it('unsubscribes from the media query on unmount', async () => {
    await mount(null);
    expect(listeners.length).toBeGreaterThan(0);
    act(() => root.unmount());
    expect(listeners).toHaveLength(0);
    root = createRoot(container); // afterEach unmounts again
  });
});

describe('the settings panel', () => {
  it('opens, changes motion and Workplace names, persists them, and Esc returns focus to the button', async () => {
    await mount(null, true);
    const btn = q('[data-testid="cm-settings-bar"]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    await act(async () => { btn.click(); });
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(q('[data-testid="cm-settings-panel"]')).not.toBeNull();
    expect(document.activeElement?.tagName).toBe('INPUT');

    await act(async () => { (q('[data-testid="cm-setting-motion-on"]') as HTMLInputElement).click(); });
    expect(seen.settings.motion).toBe('on');
    expect(seen.settings.reduceMotion).toBe(true);
    await act(async () => { (q('[data-testid="cm-setting-workplace"]') as HTMLInputElement).click(); });
    expect(seen.settings.workplaceNames).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(CAMPUS_SETTINGS_KEY) as string)).toEqual({ nav: 'campus', workplaceNames: true, motion: 'on', shareBuilding: true });

    const panel = q('[data-testid="cm-settings-panel"]') as HTMLElement;
    await act(async () => { panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(q('[data-testid="cm-settings-panel"]')).toBeNull();
    expect(document.activeElement).toBe(btn);
  });

  it('Esc inside the panel does not reach an outer Esc handler (the map stays open)', async () => {
    const outer = jest.fn();
    document.addEventListener('keydown', outer);
    await mount(null, true);
    await act(async () => { (q('[data-testid="cm-settings-bar"]') as HTMLButtonElement).click(); });
    await act(async () => { (q('[data-testid="cm-settings-panel"]') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener('keydown', outer);
  });

  it('with the panel CLOSED, Esc on the Settings button still reaches the map (closes it)', async () => {
    const outer = jest.fn();
    await mount(null, true);
    const wrapper = q('.cm-settings') as HTMLElement;
    wrapper.parentElement!.addEventListener('keydown', outer);
    await act(async () => { (q('[data-testid="cm-settings-bar"]') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('a settings choice survives a remount', async () => {
    await mount(null, true);
    await act(async () => { (q('[data-testid="cm-settings-bar"]') as HTMLButtonElement).click(); });
    await act(async () => { (q('[data-testid="cm-setting-motion-off"]') as HTMLInputElement).click(); });
    act(() => root.unmount()); container.remove();
    await mount(null);
    expect(seen.settings.motion).toBe('off');
  });
});
