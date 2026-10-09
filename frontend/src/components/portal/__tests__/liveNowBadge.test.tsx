import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, Outlet, useNavigate } from 'react-router-dom';
import LiveNowBadge from '../LiveNowBadge';
import { BroadcastPlayerProvider, useBroadcastPlayer } from '../../../contexts/BroadcastPlayerContext';
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
import { BroadcastDiscoveryProvider } from '../../../contexts/BroadcastDiscoveryContext';
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
import type { DiscoveryResponse, DiscoveryBroadcast } from '../../../hooks/useBroadcastDiscovery';

/**
 * The "live now" badge, and the two acceptance criteria P3-04 names.
 *
 *  1. A PRIVATE TITLE NEVER RENDERS FOR AN INELIGIBLE VIEWER. That is enforced on the server,
 *     which omits the item entirely — so the client-side half of the proof is that the badge
 *     renders exactly what it is given and invents nothing. The test feeds it a payload with
 *     the private item already absent and asserts the title appears nowhere in the DOM.
 *
 *  2. DISMISSAL DOES NOT RE-FIRE PER ROUTE CHANGE. Asserted by navigating three times after
 *     dismissing, because the obvious implementation — dismissal in page state — passes every
 *     test that never navigates.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIVE: DiscoveryBroadcast = {
  id: 'occ-mon', title: 'Monday cohort class', access_mode: 'paid', editorial_state: 'live',
  room_id: 'room-1', content_started_at: Date.now() - 60_000, scheduled_start_at: Date.now() - 120_000,
  can_watch: true, reason: 'entitled', offer_upgrade: false, preview_seconds_remaining: null,
};

const response = (over: Partial<DiscoveryResponse> = {}): DiscoveryResponse => ({
  states: ['live', 'reconnecting'],
  broadcasts: [LIVE],
  poll_after_ms: 45_000,
  ...over,
});

const fetchDiscovery = jest.fn<Promise<DiscoveryResponse>, []>();

let container: HTMLDivElement;
let root: Root;
/** A manual timer list: every "when" assertion is an exact number, not a tolerance. */
let timers: Array<{ id: number; fn: () => void; ms: number }>;
let nextTimerId: number;
let visible: boolean;
let visibilityListeners: Array<() => void>;

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
    isVisible: () => visible,
    subscribeVisibility: (fn: () => void) => {
      visibilityListeners.push(fn);
      return () => { visibilityListeners = visibilityListeners.filter((f) => f !== fn); };
    },
  };
}

function Nav() {
  const navigate = useNavigate();
  return (
    <div>
      <button type="button" data-testid="go-b" onClick={() => navigate('/portal/b')} />
      <button type="button" data-testid="go-c" onClick={() => navigate('/portal/c')} />
      <button type="button" data-testid="go-a" onClick={() => navigate('/portal/a')} />
    </div>
  );
}

function OpenState() {
  const { session } = useBroadcastPlayer();
  return <span data-testid="session">{session ? session.title : 'none'}</span>;
}

function App() {
  return (
    <MemoryRouter initialEntries={['/portal/a']}>
      <ParticipantAuthProvider>
        {/*
          Deps are injected into the PROVIDER, not the badge. The badge no longer polls for
          itself — a second poller would be a second request per cadence per tab, and the
          runbook's capacity table assumes one — so this mirrors the real tree in
          `portalRoutes.tsx` rather than hand-feeding the component.
        */}
        <BroadcastDiscoveryProvider deps={deps()}>
          <BroadcastPlayerProvider>
          <Nav />
          <OpenState />
          <Routes>
            <Route
              element={(
                <>
                  <Outlet />
                  <LiveNowBadge />
                </>
              )}
            >
              <Route path="/portal/a" element={<p data-testid="page">a</p>} />
              <Route path="/portal/b" element={<p data-testid="page">b</p>} />
              <Route path="/portal/c" element={<p data-testid="page">c</p>} />
            </Route>
          </Routes>
          </BroadcastPlayerProvider>
        </BroadcastDiscoveryProvider>
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
  visible = true;
  visibilityListeners = [];
  fetchDiscovery.mockResolvedValue(response());
  localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'a.test.token');
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  localStorage.clear();
});

describe('what it shows', () => {
  it('announces a live broadcast, with a Watch action', async () => {
    await mount();
    expect(find('live-now-badge')).not.toBeNull();
    expect(container.textContent).toContain('Monday cohort class');
    expect(find('lnb-watch-occ-mon')!.textContent).toBe('Watch');
  });

  it('renders nothing at all when nothing is airing', async () => {
    fetchDiscovery.mockResolvedValue(response({ broadcasts: [] }));
    await mount();
    expect(find('live-now-badge')).toBeNull();
  });

  it('renders exactly what the server sent and invents no item of its own', async () => {
    // The private-title criterion is enforced server-side by omission. The client half of the
    // proof is that an omitted item cannot reappear here.
    fetchDiscovery.mockResolvedValue(response({ broadcasts: [] }));
    await mount();
    expect(container.innerHTML).not.toContain('Cohort 12 private review');
    expect(container.querySelectorAll('[data-testid^="lnb-item-"]')).toHaveLength(0);
  });

  it('counts multiple airings and offers one row each', async () => {
    fetchDiscovery.mockResolvedValue(response({
      broadcasts: [LIVE, { ...LIVE, id: 'occ-oh', title: 'Open house' }],
    }));
    await mount();
    expect(find('lnb-count')!.textContent).toBe('2 airing now');
    expect(container.querySelectorAll('[data-testid^="lnb-item-"]')).toHaveLength(2);
  });

  it('labels an unentitled preview rather than promising playback', async () => {
    fetchDiscovery.mockResolvedValue(response({
      broadcasts: [{ ...LIVE, access_mode: 'preview', can_watch: false, offer_upgrade: true, preview_seconds_remaining: 0 }],
    }));
    await mount();
    expect(container.textContent).toContain('Preview');
    expect(find('lnb-watch-occ-mon')!.textContent).toBe('Details');
  });

  it('says so when live status is unavailable, instead of showing nothing', async () => {
    fetchDiscovery.mockRejectedValue(new Error('503'));
    await mount();
    // An outage must not read as a quiet evening.
    expect(find('lnb-unavailable')).not.toBeNull();
    expect(container.textContent).toContain('unavailable');
  });

  it('keeps the last known list through a failed refresh', async () => {
    await mount();
    expect(container.textContent).toContain('Monday cohort class');

    fetchDiscovery.mockRejectedValue(new Error('503'));
    await act(async () => { timers.shift()!.fn(); });

    expect(container.textContent).toContain('Monday cohort class');
    expect(find('lnb-unavailable')).not.toBeNull();
  });

  it('stands down once the viewer is actually watching something', async () => {
    await mount();
    await click('lnb-watch-occ-mon');
    expect(find('session')!.textContent).toBe('Monday cohort class');
    // The badge would otherwise compete with the player it just opened.
    expect(find('live-now-badge')).toBeNull();
  });
});

describe('dismissal survives navigation — the criterion', () => {
  it('stays dismissed across three route changes', async () => {
    await mount();
    await click('lnb-dismiss-occ-mon');
    expect(find('live-now-badge')).toBeNull();

    await click('go-b');
    expect(find('page')!.textContent).toBe('b');
    expect(find('live-now-badge')).toBeNull();

    await click('go-c');
    await click('go-a');
    // The naive implementation — dismissal in page state — passes every test that never
    // navigates, and fails here on the first click.
    expect(find('live-now-badge')).toBeNull();
  });

  it('dismisses ONE broadcast, not the rest', async () => {
    fetchDiscovery.mockResolvedValue(response({
      broadcasts: [LIVE, { ...LIVE, id: 'occ-oh', title: 'Open house' }],
    }));
    await mount();

    await click('lnb-dismiss-occ-mon');

    expect(find('lnb-item-occ-mon')).toBeNull();
    expect(find('lnb-item-occ-oh')).not.toBeNull();
    expect(container.textContent).not.toContain('Monday cohort class');
  });

  it('persists so a reload does not undo the decision', async () => {
    await mount();
    await click('lnb-dismiss-occ-mon');

    expect(JSON.parse(localStorage.getItem('colaberry.broadcast.dismissed')!)).toContain('occ-mon');

    // Remount: a fresh page load with the same storage.
    await act(async () => { root.unmount(); });
    container.remove();
    await mount();

    expect(find('live-now-badge')).toBeNull();
  });

  it('survives storage being unavailable instead of throwing out of a render', async () => {
    const original = window.localStorage.setItem;
    // A private window throws on write. The badge must degrade, not crash the portal.
    window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      await mount();
      await click('lnb-dismiss-occ-mon');
      expect(find('live-now-badge')).toBeNull();
    } finally {
      window.localStorage.setItem = original;
    }
  });
});

describe('the poll is bounded, and a hidden tab does not poll', () => {
  it('arms the next poll at the cadence the SERVER chose', async () => {
    fetchDiscovery.mockResolvedValue(response({ poll_after_ms: 60_000 }));
    await mount();
    expect(timers.map((t) => t.ms)).toEqual([60_000]);
  });

  it('clamps a cadence the server should never have sent', async () => {
    fetchDiscovery.mockResolvedValue(response({ poll_after_ms: 250 }));
    await mount();
    // One bad env value must not turn every open tab into a load test.
    expect(timers.map((t) => t.ms)).toEqual([15_000]);
  });

  it('backs off after a failure rather than hammering a struggling endpoint', async () => {
    await mount();
    fetchDiscovery.mockRejectedValue(new Error('503'));

    await act(async () => { timers.shift()!.fn(); });
    expect(timers.map((t) => t.ms)).toEqual([45_000]);

    await act(async () => { timers.shift()!.fn(); });
    expect(timers.map((t) => t.ms)).toEqual([90_000]);
  });

  it('arms NOTHING while the tab is hidden', async () => {
    await mount();
    expect(timers).toHaveLength(1);

    visible = false;
    await act(async () => { visibilityListeners.forEach((fn) => fn()); });

    // The largest saving available: most open portal tabs are in a background window, and a
    // badge nobody can see does not need refreshing.
    expect(timers).toHaveLength(0);
  });

  it('does not re-arm when the tab goes hidden WHILE a request is in flight', async () => {
    // The case the visibility listener alone does not cover, and the one a surviving mutation
    // found. The listener clears the timer when the tab hides — but a request already in
    // flight resolves afterwards and re-arms from its own completion path. Without the guard
    // there, a tab hidden at the wrong moment polls forever in the background.
    let release: (r: DiscoveryResponse) => void = () => undefined;
    fetchDiscovery.mockReturnValueOnce(new Promise<DiscoveryResponse>((res) => { release = res; }));

    await mount();
    expect(timers).toHaveLength(0);          // nothing armed yet; the first request is pending

    visible = false;                         // the viewer switches tabs mid-flight
    await act(async () => { release(response()); });

    expect(timers).toHaveLength(0);
  });

  it('refreshes immediately on becoming visible again', async () => {
    await mount();
    const before = fetchDiscovery.mock.calls.length;

    visible = false;
    await act(async () => { visibilityListeners.forEach((fn) => fn()); });
    visible = true;
    await act(async () => { visibilityListeners.forEach((fn) => fn()); });

    // What a returning viewer sees first should be current, not a cadence out of date.
    expect(fetchDiscovery.mock.calls.length).toBe(before + 1);
    expect(timers).toHaveLength(1);
  });

  it('stops polling when unmounted, leaving no timer behind', async () => {
    await mount();
    expect(timers).toHaveLength(1);
    await act(async () => { root.unmount(); });
    expect(timers).toHaveLength(0);
    container.remove();
    // Re-mounted so the shared afterEach has something to unmount.
    await mount();
  });
});
