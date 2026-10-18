/**
 * C3 door transitions: zoom through a building's door into the real page, and back out.
 * jsdom has no element.animate, so it is stubbed with a `finished` promise the test controls; the
 * 800 ms fallback is driven with fake timers. Navigation must happen exactly once.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

// C5: the provider reads staff desks and polls the inbox while the campus is on; stubbed so no test touches the network.
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: true }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({}), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
}));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => ({ audience: 'member', hasFullAccess: true, buildings: actual.campusBuildingsFor('member') }) };
});

// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusLayers from '../CampusLayers';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { DOOR_FALLBACK_MS } from '../CampusDoorTransition';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let resolveFinished: (() => void) | null = null;
let animateCalls = 0;
let paths: string[] = [];
function Where(): null { paths.push(useLocation().pathname); return null; }
function Controls(): React.ReactElement {
  const c = useCampus();
  (window as unknown as { __campus: ReturnType<typeof useCampus> }).__campus = c;
  return <></>;
}
const campus = () => (window as unknown as { __campus: ReturnType<typeof useCampus> }).__campus;

let container: HTMLDivElement;
let root: Root;
async function mount(reduceMotion: boolean): Promise<void> {
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, reduceMotion }));
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={['/portal/today']}>
        <CampusProvider>
          <Controls /><CampusLayers />
          <Routes><Route path="*" element={<Where />} /></Routes>
        </CampusProvider>
      </MemoryRouter>,
    );
  });
}
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); }); };
const rect = { left: 100, top: 100, width: 80, height: 60 };
const navigatedTo = (p: string) => paths.filter((x, i) => x === p && paths[i - 1] !== p).length;

beforeEach(() => {
  jest.useFakeTimers();
  paths = []; animateCalls = 0; resolveFinished = null;
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = function animate() {
    animateCalls += 1;
    return { finished: new Promise<void>((res) => { resolveFinished = res; }) };
  };
});
afterEach(() => {
  act(() => root.unmount()); container.remove(); window.localStorage.clear(); jest.useRealTimers();
  delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
});

describe('enter through the door', () => {
  it('with motion: shows the panel, animates, and navigates once when the animation finishes', async () => {
    await mount(false);
    await act(async () => { campus().enterThroughDoor('/portal/library', rect); });
    expect(container.querySelector('[data-testid="cm-door"]')).not.toBeNull();
    expect(animateCalls).toBe(1);
    expect(navigatedTo('/portal/library')).toBe(0);
    await act(async () => { resolveFinished!(); });
    await flush();
    expect(navigatedTo('/portal/library')).toBe(1);
    expect(container.querySelector('[data-testid="cm-door"]')).toBeNull();
    await act(async () => { jest.advanceTimersByTime(DOOR_FALLBACK_MS * 2); });
    expect(navigatedTo('/portal/library')).toBe(1); // the fallback does not navigate a second time
  });

  it('if the animation never finishes, the 800 ms fallback navigates exactly once', async () => {
    await mount(false);
    await act(async () => { campus().enterThroughDoor('/portal/rooms', rect); });
    await act(async () => { jest.advanceTimersByTime(DOOR_FALLBACK_MS - 1); });
    expect(navigatedTo('/portal/rooms')).toBe(0);
    await act(async () => { jest.advanceTimersByTime(1); });
    await flush();
    expect(navigatedTo('/portal/rooms')).toBe(1);
    await act(async () => { resolveFinished?.(); });
    await flush();
    expect(navigatedTo('/portal/rooms')).toBe(1);
  });

  it('reduce motion: navigates at once, no panel, no animation, no timer', async () => {
    await mount(true);
    await act(async () => { campus().enterThroughDoor('/portal/events', rect); });
    await flush();
    expect(navigatedTo('/portal/events')).toBe(1);
    expect(container.querySelector('[data-testid="cm-door"]')).toBeNull();
    expect(animateCalls).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('closes the map overlay when it enters', async () => {
    await mount(true);
    await act(async () => { campus().openMap(); });
    expect(container.querySelector('[data-testid="cm-overlay"]')).not.toBeNull();
    await act(async () => { campus().enterThroughDoor('/portal/library', rect); });
    await flush();
    expect(container.querySelector('[data-testid="cm-overlay"]')).toBeNull();
  });
});

describe('step outside', () => {
  it('with motion: opens the map at the building and zooms out once', async () => {
    await mount(false);
    await act(async () => { campus().stepOutside('library'); });
    expect(container.querySelector('[data-testid="cm-overlay"]')).not.toBeNull();
    expect(campus().mapFocus).toBe('library');
    expect(animateCalls).toBe(1);
    await act(async () => { resolveFinished!(); });
    await flush();
    expect(container.querySelector('[data-testid="cm-door"]')).toBeNull();
  });

  it('reduce motion: opens the map immediately, no animation', async () => {
    await mount(true);
    await act(async () => { campus().stepOutside('commons'); });
    expect(container.querySelector('[data-testid="cm-overlay"]')).not.toBeNull();
    expect(campus().mapFocus).toBe('commons');
    expect(animateCalls).toBe(0);
  });
});
