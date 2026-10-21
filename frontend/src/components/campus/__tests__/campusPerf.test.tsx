/**
 * C11 "the map stays light" (build prompt hard rule):
 *  - an identical presence answer keeps the same object, so the campus does not re-render every 30 s;
 *  - but a failed read followed by the same data DOES render again (the broken state must clear);
 *  - walking the avatar (one state update per animation frame) does not re-render the buildings.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const mockFetch = jest.fn();
let mockLabelCalls = 0;
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: true }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: (...a: unknown[]) => mockFetch(...a), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
  fetchLook: () => Promise.resolve({ points: 0, rung_name: 'AI Aware I', equipped: {}, catalog: [] }),
}));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor('member', { isStaff: false, hasFullAccess: true, isExplorer: false }) };
});
// Building renders call accessLabel once each: a render counter for the memoized buildings.
jest.mock('../campusAccess', () => {
  const actual = jest.requireActual('../campusAccess');
  return { ...actual, accessLabel: (...a: Parameters<typeof actual.accessLabel>) => { mockLabelCalls += 1; return actual.accessLabel(...a); } };
});

// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import { samePresence, PRESENCE_POLL_MS } from '../useCampusPresencePoll';
// eslint-disable-next-line import/first
import type { CampusPresence } from '../campusApi';
// eslint-disable-next-line import/first
import CampusWorldMap from '../CampusWorldMap';
// eslint-disable-next-line import/first
import { CAMPUS_BUILDINGS } from '../campusMap';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const answer = (): CampusPresence => ({ commons: { count: 2, people: [{ enrollment_id: 'p1', display_name: 'Avery Stone', avatar_url: null }, { anonymous: true }] } });

// C11b: the illustrated map is ~5x the DOM of the C2 outlines (377 vs 77 nodes; trees, paths, windows), and these suites mount
// the whole campus (up to three maps) and some run axe over it; a cold first render under parallel jest can pass 5 s.
jest.setTimeout(15000);

describe('samePresence', () => {
  it('equal content is the same; any difference, or null on one side, is not', () => {
    expect(samePresence(answer(), answer())).toBe(true);
    expect(samePresence(answer(), { commons: { count: 3, people: [] } })).toBe(false);
    expect(samePresence(null, answer())).toBe(false);
    expect(samePresence(answer(), null)).toBe(false);
    expect(samePresence(null, null)).toBe(true);
  });
});

let container: HTMLDivElement;
let root: Root;
let renders = 0;
let seen: ReturnType<typeof useCampus>;
function Consumer(): null { renders += 1; seen = useCampus(); return null; }
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };

describe('the presence poll', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockFetch.mockReset();
    window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, motion: 'on' }));
    window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); jest.useRealTimers(); });

  async function mount(): Promise<void> {
    renders = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => { root = createRoot(container); root.render(<MemoryRouter><ParticipantAuthProvider><CampusProvider><Consumer /></CampusProvider></ParticipantAuthProvider></MemoryRouter>); });
    await flush();
  }
  const tick = async () => { await act(async () => { jest.advanceTimersByTime(PRESENCE_POLL_MS); }); await flush(); };

  it('an identical answer (a fresh but equal object) does not re-render the campus', async () => {
    mockFetch.mockImplementation(() => Promise.resolve(answer()));
    await mount();
    const first = seen.presence;
    expect(first).not.toBeNull();
    const before = renders;
    await tick();
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(seen.presence).toBe(first);
    expect(renders).toBe(before);
  });

  it('a changed answer does render', async () => {
    mockFetch.mockImplementationOnce(() => Promise.resolve(answer())).mockImplementation(() => Promise.resolve({ commons: { count: 5, people: [] } }));
    await mount();
    const before = renders;
    await tick();
    expect(seen.presence?.commons.count).toBe(5);
    expect(renders).toBeGreaterThan(before);
  });

  it('a failed read then the SAME data renders again, clearing the broken state', async () => {
    mockFetch.mockImplementationOnce(() => Promise.resolve(answer())).mockImplementationOnce(() => Promise.reject(new Error('down')))
      .mockImplementation(() => Promise.resolve(answer()));
    await mount();
    await tick();
    expect(seen.presenceError).toBe(true);
    expect(seen.presence).toBeNull();
    await tick();
    expect(seen.presenceError).toBe(false);
    expect(seen.presence?.commons.count).toBe(2);
  });
});

describe('walking', () => {
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    frames = [];
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => { frames.push(cb); return frames.length; }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('animation frames move the avatar without re-rendering any building', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const accessOf = () => 'open' as const;
    const onArrive = () => undefined;
    const buildings = [...CAMPUS_BUILDINGS];
    await act(async () => {
      root = createRoot(container);
      root.render(<svg><CampusWorldMap buildings={buildings} accessOf={accessOf} workplaceNames={false} reduceMotion={false} onArrive={onArrive}
        walkRequest={{ id: 'library', seq: 1 }} /></svg>);
    });
    expect(frames.length).toBeGreaterThan(0); // a walk really started
    const avatar = () => container.querySelector('[data-testid="cm-avatar"]')!.getAttribute('transform');
    const start = avatar();
    mockLabelCalls = 0;
    for (let t = 16; t <= 160; t += 16) {
      const cb = frames.shift();
      if (!cb) break;
      await act(async () => { cb(t); });
    }
    expect(avatar()).not.toBe(start); // the avatar moved
    expect(mockLabelCalls).toBe(0); // and no building rendered again
  });
});
