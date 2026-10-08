// Only playChime is replaced: the question "did it try to interrupt again?" cannot be
// answered without a spy, and the cued-set logic beside it is exactly what is under test.
jest.mock('../broadcastLaunchCue', () => ({
  ...jest.requireActual('../broadcastLaunchCue'),
  playChime: jest.fn(() => Promise.resolve('played')),
}));

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, Outlet, useNavigate } from 'react-router-dom';
import LiveNowBadge from '../LiveNowBadge';
import { uncued, readSoundOptIn, playChime } from '../broadcastLaunchCue';
const chime = playChime as jest.MockedFunction<typeof playChime>;
const { playChime: realPlayChime } = jest.requireActual('../broadcastLaunchCue');
import { BroadcastPlayerProvider } from '../../../contexts/BroadcastPlayerContext';
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
import type { DiscoveryResponse, DiscoveryBroadcast } from '../../../hooks/useBroadcastDiscovery';

/**
 * P3-05: the launch cue. Three criteria, one block each.
 *
 *   once per occurrence — the cue is an interruption, so a second one is a defect
 *   no re-interrupt on route change — the thing most likely to cause a second one
 *   denied-sound fallback — a refused chime must be SAID, never silently swallowed
 *
 * There is no audio asset to test, because there is no audio asset: the chime is synthesised
 * from two sine tones, which is how "no ESPN asset" is satisfied structurally rather than by
 * promising not to add one.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIVE: DiscoveryBroadcast = {
  id: 'occ-mon', title: 'Monday cohort class', access_mode: 'paid', editorial_state: 'live',
  room_id: 'room-1', content_started_at: Date.now() - 60_000, scheduled_start_at: Date.now() - 120_000,
  can_watch: true, reason: 'entitled', offer_upgrade: false, preview_seconds_remaining: null,
};

const response = (over: Partial<DiscoveryResponse> = {}): DiscoveryResponse => ({
  states: ['live', 'reconnecting'], broadcasts: [LIVE], poll_after_ms: 45_000, ...over,
});

const fetchDiscovery = jest.fn<Promise<DiscoveryResponse>, []>();

let container: HTMLDivElement;
let root: Root;
let timers: Array<{ id: number; fn: () => void; ms: number }>;
let nextTimerId: number;

function deps() {
  return {
    fetchDiscovery,
    setTimer: (fn: () => void, ms: number) => {
      const t = { id: nextTimerId++, fn, ms };
      timers.push(t);
      return t.id;
    },
    clearTimer: (h: unknown) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
    isVisible: () => true,
    subscribeVisibility: () => () => undefined,
  };
}

function Nav() {
  const navigate = useNavigate();
  return (
    <div>
      <button type="button" data-testid="go-b" onClick={() => navigate('/portal/b')} />
      <button type="button" data-testid="go-a" onClick={() => navigate('/portal/a')} />
    </div>
  );
}

function App() {
  return (
    <MemoryRouter initialEntries={['/portal/a']}>
      <ParticipantAuthProvider>
        <BroadcastPlayerProvider>
          <Nav />
          <Routes>
            <Route element={<><Outlet /><LiveNowBadge discoveryDeps={deps()} /></>}>
              <Route path="/portal/a" element={<p data-testid="page">a</p>} />
              <Route path="/portal/b" element={<p data-testid="page">b</p>} />
            </Route>
          </Routes>
        </BroadcastPlayerProvider>
      </ParticipantAuthProvider>
    </MemoryRouter>
  );
}

const find = (id: string): HTMLElement | null => container.querySelector(`[data-testid="${id}"]`);

async function click(id: string): Promise<void> {
  const el = find(id);
  if (!el) throw new Error(`nothing to click: ${id}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<App />); });
}

beforeEach(() => {
  timers = [];
  nextTimerId = 1;
  chime.mockReset();
  chime.mockResolvedValue('played');
  fetchDiscovery.mockResolvedValue(response());
  localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'a.test.token');
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  localStorage.clear();
});

describe('once per occurrence', () => {
  it('flourishes a newly announced broadcast', async () => {
    await mount();
    expect(find('lnb-item-occ-mon')!.className).toContain('is-new');
  });

  it('records it, so a remount does not announce the same class twice', async () => {
    await mount();
    expect(JSON.parse(localStorage.getItem('colaberry.broadcast.cued')!)).toContain('occ-mon');

    await act(async () => { root.unmount(); });
    container.remove();
    await mount();

    // A cue is an interruption; a second one for the same class is a defect.
    expect(find('lnb-item-occ-mon')!.className).not.toContain('is-new');
  });

  it('announces a NEW broadcast while leaving one cued in an earlier session alone', async () => {
    // The property that matters is persistence across sessions. Within one mount the class
    // lingers harmlessly, because a one-shot animation does not replay — asserting otherwise
    // was testing an implementation detail that has since been deleted.
    localStorage.setItem('colaberry.broadcast.cued', JSON.stringify(['occ-mon']));
    fetchDiscovery.mockResolvedValue(response({
      broadcasts: [LIVE, { ...LIVE, id: 'occ-oh', title: 'Open house' }],
    }));

    await mount();

    expect(find('lnb-item-occ-oh')!.className).toContain('is-new');
    expect(find('lnb-item-occ-mon')!.className).not.toContain('is-new');
  });

  it('uncued() is the whole rule, and it is a set difference', () => {
    expect(uncued(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c']);
    expect(uncued(['a'], ['a'])).toEqual([]);
    expect(uncued([], ['a'])).toEqual([]);
  });
});

describe('no re-interrupt on route change — the criterion', () => {
  it('does not sound the chime again on navigation', async () => {
    // The interruption is the SOUND. The animation cannot re-fire because the class is never
    // re-applied, so the thing to pin is that navigating does not re-announce.
    localStorage.setItem('colaberry.broadcast.cueSound', 'true');
    await mount();
    expect(chime).toHaveBeenCalledTimes(1);

    await click('go-b');
    await click('go-a');
    await click('go-b');

    // A cue keyed on mount, or on the effect's own re-run, fires again on every click.
    expect(chime).toHaveBeenCalledTimes(1);
  });

  it('does not re-mark anything as cued on navigation', async () => {
    await mount();
    const afterMount = localStorage.getItem('colaberry.broadcast.cued');

    await click('go-b');
    await click('go-a');

    expect(localStorage.getItem('colaberry.broadcast.cued')).toBe(afterMount);
    expect(JSON.parse(afterMount!)).toEqual(['occ-mon']);
  });
});

describe('reduced motion is respected', () => {
  it('applies no flourish class when the viewer asked for less movement', async () => {
    const original = window.matchMedia;
    (window as unknown as Record<string, unknown>).matchMedia = (q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    try {
      await mount();
      // Guarded in JS as well as in the stylesheet: a browser that reports the preference
      // only to matchMedia is still respected, and vice versa.
      expect(find('lnb-item-occ-mon')!.className).not.toContain('is-new');
    } finally {
      (window as unknown as Record<string, unknown>).matchMedia = original;
    }
  });

  it('still records the cue, so turning motion back on does not replay it', async () => {
    const original = window.matchMedia;
    (window as unknown as Record<string, unknown>).matchMedia = (q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    try {
      await mount();
      expect(JSON.parse(localStorage.getItem('colaberry.broadcast.cued')!)).toContain('occ-mon');
    } finally {
      (window as unknown as Record<string, unknown>).matchMedia = original;
    }
  });
});

describe('sound is opt-in, and a refusal is said out loud', () => {
  it('is OFF until asked for', async () => {
    await mount();
    expect(readSoundOptIn()).toBe(false);
    expect(find('lnb-sound')!.getAttribute('aria-pressed')).toBe('false');
    expect(find('lnb-sound')!.textContent).toBe('Sound off');
  });

  it('remembers the choice', async () => {
    await mount();
    await click('lnb-sound');
    expect(readSoundOptIn()).toBe(true);
    expect(find('lnb-sound')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('says so when the browser has no Web Audio at all', async () => {
    chime.mockResolvedValue('unsupported');
    await mount();
    await click('lnb-sound');
    expect(find('lnb-sound-unsupported')).not.toBeNull();
    expect(container.textContent).toMatch(/cannot play the alert sound/i);
    // And the visual cue is explicitly still promised.
    expect(container.textContent).toMatch(/badge will still appear/i);
  });

  it('never reports a refusal as success', async () => {
    const refusing = {
      state: 'suspended',
      resume: () => Promise.reject(new Error('NotAllowedError')),
    } as unknown as AudioContext;
    // The REAL implementation, not the module mock the component uses. A policy refusal is a
    // different fact from no Web Audio, and neither one is "played".
    await expect(realPlayChime({ createContext: () => refusing })).resolves.toBe('refused');
  });

  it('reports unsupported when there is no context to build', async () => {
    await expect(realPlayChime({ createContext: () => null })).resolves.toBe('unsupported');
  });

  it('plays when the context allows it, without needing an audio file', async () => {
    const nodes: string[] = [];
    const osc = () => ({
      type: '', frequency: { value: 0 }, connect: () => undefined,
      start: () => nodes.push('start'), stop: () => nodes.push('stop'),
    });
    const gain = () => ({
      gain: {
        setValueAtTime: () => undefined,
        linearRampToValueAtTime: () => undefined,
      },
      connect: () => undefined,
    });
    const ctx = {
      state: 'running', currentTime: 0, destination: {},
      resume: () => Promise.resolve(),
      createOscillator: osc,
      createGain: gain,
    } as unknown as AudioContext;

    await expect(realPlayChime({ createContext: () => ctx })).resolves.toBe('played');
    // Two tones, synthesised — no asset, nothing to license.
    expect(nodes.filter((n) => n === 'start')).toHaveLength(2);
  });
});
