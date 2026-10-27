import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { useReplayDiscovery, type ReplayState, type ReplayResponse } from '../useReplayDiscovery';

/**
 * L8.3's fetch, and specifically the fact that its three failures are not alike.
 *
 * `useBroadcastDiscovery`'s header records what happens when they are treated alike, and both
 * incidents were production ones: a 404 reported as an outage put a permanent fake error panel
 * on every portal page while the flag was dark, and a retried 401 drove `portalApi`'s
 * interceptor into the login-redirects-to-itself loop that `portalLoginHref.ts` logs twice
 * (2026-08-03, 7 students; 2026-08-24, 18). The classifier is IMPORTED from that hook rather
 * than rewritten here, so this suite's job is to prove this hook actually routes through it.
 *
 * The fourth state is the one the server went out of its way to preserve: an empty list and an
 * unresolved list are different facts, and a hook that returns `[]` for both would throw the
 * distinction away at the last possible step.
 */

let container: HTMLDivElement;
let root: Root;
let seen: ReplayState;

function Probe({ enabled, fetchReplays }: {
  enabled: boolean;
  fetchReplays: () => Promise<ReplayResponse>;
}): null {
  seen = useReplayDiscovery(enabled, { fetchReplays });
  return null;
}

async function mount(enabled: boolean, fetchReplays: () => Promise<ReplayResponse>): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<Probe enabled={enabled} fetchReplays={fetchReplays} />); });
}

afterEach(() => {
  act(() => { root?.unmount(); });
  container?.remove();
});

const httpError = (status: number): Error => Object.assign(new Error('http ' + status), { response: { status } });

const body = (replays: ReplayResponse['replays']): ReplayResponse => ({ states: ['replay_ready'], replays });

const row = (over: Record<string, unknown> = {}): ReplayResponse['replays'][number] => ({
  id: 'occ-1', title: 'Week 9 Build Day', access_mode: 'free', editorial_state: 'replay_ready',
  room_id: null, content_started_at: null, scheduled_start_at: null, can_watch: true,
  reason: 'entitled', offer_upgrade: false, preview_seconds_remaining: null,
  ended_at: Date.UTC(2026, 9, 13, 19, 40), ...over,
} as ReplayResponse['replays'][number]);

describe('the four states, kept apart', () => {
  it('a 404 means the feature is OFF — never an outage', async () => {
    await mount(true, () => Promise.reject(httpError(404)));
    expect(seen.disabled).toBe(true);
    expect(seen.unavailable).toBe(false);
  });

  it('a 401 is terminal too, and does not retry into the login loop', async () => {
    const fetchReplays = jest.fn(() => Promise.reject(httpError(401)));
    await mount(true, fetchReplays);
    expect(seen.disabled).toBe(true);
    expect(seen.unavailable).toBe(false);
    // One attempt. A retry is what reaches the interceptor a second time.
    expect(fetchReplays).toHaveBeenCalledTimes(1);
  });

  it('a 503 IS an outage, and says so', async () => {
    await mount(true, () => Promise.reject(httpError(503)));
    expect(seen.unavailable).toBe(true);
    expect(seen.disabled).toBe(false);
  });

  it('a network failure with no response is an outage, not a disabled feature', async () => {
    // `isTerminalDiscoveryError` reads err.response.status; an offline request has none, and
    // reading it as "off" would hide a real failure behind a reassuring message.
    await mount(true, () => Promise.reject(new Error('Network Error')));
    expect(seen.unavailable).toBe(true);
    expect(seen.disabled).toBe(false);
  });

  it('an EMPTY list is neither off nor unavailable', async () => {
    await mount(true, () => Promise.resolve(body([])));
    expect(seen.replays).toEqual([]);
    expect(seen.disabled).toBe(false);
    expect(seen.unavailable).toBe(false);
  });
});

describe('the retention window it is told', () => {
  it('passes a sane window through', async () => {
    await mount(true, () => Promise.resolve({ ...body([row()]), retention_days: 25 }));
    expect(seen.retentionDays).toBe(25);
  });

  it('is null when the server does not say, so the page stays silent', async () => {
    // An older backend sends no window. Null means "say nothing", never "assume something".
    await mount(true, () => Promise.resolve(body([row()])));
    expect(seen.retentionDays).toBeNull();
  });

  it('refuses a value that is not a positive finite number', async () => {
    /**
     * Each of these would render as a retention promise the server never made: "0 days",
     * "-5 days", "NaN days", "25 days" from a string that later fails arithmetic. The guard
     * is cheap; the failure is a page lying to a student about how long their class lasts.
     */
    for (const bad of [0, -5, Number.NaN, Infinity, '25', null, {}, []]) {
      // eslint-disable-next-line no-await-in-loop
      await mount(true, () => Promise.resolve({ ...body([row()]), retention_days: bad } as never));
      expect(seen.retentionDays).toBeNull();
      act(() => { root?.unmount(); });
      container?.remove();
    }
  });
});

describe('what it returns', () => {
  it('passes the rows through untouched', async () => {
    await mount(true, () => Promise.resolve(body([row(), row({ id: 'occ-2' })])));
    expect(seen.replays.map((r) => r.id)).toEqual(['occ-1', 'occ-2']);
    expect(seen.unavailable).toBe(false);
  });

  it('survives a malformed payload rather than throwing on .map later', async () => {
    await mount(true, () => Promise.resolve({ states: [] } as unknown as ReplayResponse));
    expect(seen.replays).toEqual([]);
  });

  it('clears stale rows when a refresh fails, so the list never outlives its own truth', async () => {
    let fail = false;
    const fetchReplays = () => (fail ? Promise.reject(httpError(503)) : Promise.resolve(body([row()])));
    await mount(true, fetchReplays);
    expect(seen.replays).toHaveLength(1);

    fail = true;
    await act(async () => { seen.refresh(); });

    expect(seen.unavailable).toBe(true);
    expect(seen.replays).toEqual([]);
  });

  it('does not spin when the caller builds its deps object INLINE', async () => {
    /**
     * The loop `useBroadcastDiscovery`'s header records, approached from the caller's side: an
     * inline `{ fetchReplays: () => … }` is a new identity every render, which without the ref
     * would change the callback, re-run the effect, set state and render again, forever.
     *
     * A render counter rather than a timeout: the failure is unbounded renders, and counting
     * them is the only assertion that distinguishes "settled" from "slow".
     */
    const fetchReplays = jest.fn(() => Promise.resolve(body([row()])));
    let renders = 0;
    function InlineProbe(): null {
      renders += 1;
      // Deliberately inline, which is what a real page would most naturally write.
      seen = useReplayDiscovery(true, { fetchReplays: () => fetchReplays() });
      return null;
    }
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(<InlineProbe />); });

    expect(fetchReplays).toHaveBeenCalledTimes(1);
    // Mount, then the settled state. A loop shows up here as tens or hundreds.
    expect(renders).toBeLessThan(6);
    expect(seen.replays).toHaveLength(1);
  });

  it('does not call the endpoint at all when it is not enabled', async () => {
    const fetchReplays = jest.fn(() => Promise.resolve(body([row()])));
    await mount(false, fetchReplays);
    expect(fetchReplays).not.toHaveBeenCalled();
    // Off, not empty: a signed-out viewer has no replay list, which is not the same as having
    // an empty one.
    expect(seen.disabled).toBe(true);
  });
});
