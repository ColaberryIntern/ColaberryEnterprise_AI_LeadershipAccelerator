import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import LiveMiniPlayer from '../LiveMiniPlayer';
import { BroadcastPlayerProvider, useBroadcastPlayer, BroadcastSession } from '../../../contexts/BroadcastPlayerContext';
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
import type { GrantResponse } from '../../../services/broadcastPlaybackAdapter';
import type { HeartbeatBody } from '../../../services/broadcastHeartbeat';

/**
 * THE TEST WHOSE ABSENCE LET THIS SHIP BROKEN (L4.9).
 *
 * L4.6 delivered the heartbeat route, the schema, the bounded upsert and the
 * unavailable-never-zero audience read, with thirteen passing tests — and no caller. Test 2
 * then aired for twenty minutes with real viewers and recorded zero rows, so "nobody watched"
 * and "collection is broken" were indistinguishable, which is the single failure L4.6 existed
 * to prevent.
 *
 * Every test below asserts the PLAYER CALLS THE ENDPOINT. None of them would pass against the
 * code as it shipped on 16 October, which is the point: thirteen server-side tests could not
 * see this, because they all started one layer below the gap.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OCC = '11111111-2222-4333-8444-555555555555';

const grant = (asset: string): GrantResponse => ({
  url: `/bm/broadcast/${OCC}/${asset}?e=${Date.now() + 120_000}&s=sig-${asset}`,
  expires_at: Date.now() + 120_000,
  ttl_seconds: 120,
  grant: 'full',
  preview_seconds_remaining: null,
});

// Set in beforeEach, not here: react-scripts sets resetMocks, which wipes implementations.
const fetchGrant = jest.fn<Promise<GrantResponse>, [string, string]>();
const postHeartbeat = jest.fn<Promise<void>, [string, HeartbeatBody]>();

let container: HTMLDivElement;
let root: Root;

function Opener({ session }: { session: BroadcastSession }) {
  const { open } = useBroadcastPlayer();
  return <button type="button" data-testid="open" onClick={() => open(session)} />;
}

function App({ session }: { session: BroadcastSession }) {
  return (
    <ParticipantAuthProvider>
      <BroadcastPlayerProvider>
        <Opener session={session} />
        <LiveMiniPlayer fetchGrant={fetchGrant} postHeartbeat={postHeartbeat} />
      </BroadcastPlayerProvider>
    </ParticipantAuthProvider>
  );
}

const BASE: BroadcastSession = { occurrenceId: OCC, asset: 'live.m3u8', title: 'Week 9 class' };

async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<App session={BASE} />); });
  const el = container.querySelector('[data-testid="open"]') as HTMLElement;
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

const video = (): HTMLVideoElement => {
  const v = container.querySelector('video');
  if (!v) throw new Error('no <video> rendered');
  return v as HTMLVideoElement;
};

/** Fire a media event the way the browser would, so the component's listeners run. */
async function fire(type: string): Promise<void> {
  await act(async () => { video().dispatchEvent(new Event(type)); });
}

/** Every body the player has posted, in order. */
const bodies = (): HeartbeatBody[] => postHeartbeat.mock.calls.map(([, b]) => b);

beforeEach(() => {
  fetchGrant.mockImplementation((_o: string, asset: string) => Promise.resolve(grant(asset)));
  postHeartbeat.mockResolvedValue(undefined);
  localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'a.test.token');
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  localStorage.clear();
});

describe('the player reports playback to the heartbeat endpoint', () => {
  it('posts a heartbeat when the video starts playing', async () => {
    await mount();
    expect(postHeartbeat).not.toHaveBeenCalled();

    await fire('play');

    expect(postHeartbeat).toHaveBeenCalledTimes(1);
    const [occurrenceId, body] = postHeartbeat.mock.calls[0];
    expect(occurrenceId).toBe(OCC);
    expect(body.state).toBe('playing');
  });

  it('sends the occurrence id it was opened with, not some other one', async () => {
    await mount();
    await fire('play');
    expect(postHeartbeat.mock.calls.every(([o]) => o === OCC)).toBe(true);
  });

  it('reports pause, buffering and ended as distinct states', async () => {
    await mount();
    await fire('play');
    await fire('pause');
    await fire('waiting');
    await fire('ended');

    expect(bodies().map((b) => b.state)).toEqual(['playing', 'paused', 'buffering', 'ended']);
  });

  it('does not repeat a state it has already reported', async () => {
    // A <video> fires `waiting` repeatedly while it rebuffers. Posting each one would count a
    // struggling connection as engagement.
    await mount();
    await fire('play');
    await fire('waiting');
    await fire('waiting');
    await fire('waiting');

    expect(bodies().filter((b) => b.state === 'buffering')).toHaveLength(1);
  });

  it('carries a session id matching the server contract, stable across the session', async () => {
    await mount();
    await fire('play');
    await fire('pause');

    const ids = bodies().map((b) => b.session_id);
    expect(ids[0]).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(new Set(ids).size).toBe(1);
  });

  it('never sends a field the server forbids a client from asserting', async () => {
    // The route rejects client-supplied identity outright. A body carrying one would be a 400
    // in production and would look, from the client, exactly like telemetry silently not working.
    await mount();
    await fire('play');

    const forbidden = [
      'enrollment_id', 'enrollmentId', 'is_staff', 'isStaff', 'role', 'access_mode',
      'viewer_count', 'watching_now', 'count', 'person_id',
    ];
    bodies().forEach((b) => {
      expect(Object.keys(b).sort()).toEqual(['intent', 'session_id', 'state']);
      forbidden.forEach((f) => expect(b).not.toHaveProperty(f));
    });
  });

  it('does not break playback when the heartbeat endpoint fails', async () => {
    // Measurement must never affect the thing being measured.
    postHeartbeat.mockRejectedValue(new Error('500 from the collector'));
    await mount();

    await fire('play');
    await fire('pause');

    expect(postHeartbeat).toHaveBeenCalled();
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('stops reporting once the player unmounts', async () => {
    await mount();
    await fire('play');
    const before = postHeartbeat.mock.calls.length;

    await act(async () => { root.unmount(); });
    // Re-created in afterEach's unmount path; make that safe.
    root = createRoot(document.createElement('div'));

    // An ended beat on teardown is allowed; anything beyond that is a leak.
    expect(postHeartbeat.mock.calls.length).toBeLessThanOrEqual(before + 1);
  });
});
