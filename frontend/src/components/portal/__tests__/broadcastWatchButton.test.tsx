import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import * as fs from 'fs';
import * as path from 'path';
import BroadcastWatchButton from '../BroadcastWatchButton';
import { BroadcastDiscoveryProvider } from '../../../contexts/BroadcastDiscoveryContext';
import { BroadcastPlayerProvider, useBroadcastPlayer } from '../../../contexts/BroadcastPlayerContext';
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
import type { DiscoveryBroadcast, DiscoveryResponse } from '../../../hooks/useBroadcastDiscovery';

/**
 * The in-room "Watch here" hand-off.
 *
 * The three decisions this component exists to centralise are each a user-visible defect when
 * wrong: offering a button for a room where nothing is airing, naming a broadcast the viewer
 * is not entitled to, and stacking a second Watch beside a video that is already playing.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOM_ONE: DiscoveryBroadcast = {
  id: 'occ-1', title: 'Monday cohort class', access_mode: 'paid', editorial_state: 'live',
  room_id: 'room-1', content_started_at: 1_000, scheduled_start_at: 500,
  can_watch: true, reason: 'entitled', offer_upgrade: false, preview_seconds_remaining: null,
};
const ROOM_TWO: DiscoveryBroadcast = {
  ...ROOM_ONE, id: 'occ-2', title: 'Thursday build day', room_id: 'room-2',
};

const fetchDiscovery = jest.fn<Promise<DiscoveryResponse>, []>();

let container: HTMLDivElement;
let root: Root;
let opened: Array<{ occurrenceId: string; asset: string; title: string | null }>;

function deps() {
  return {
    fetchDiscovery,
    setTimer: () => 1,
    clearTimer: () => undefined,
    isVisible: () => true,
    subscribeVisibility: () => () => undefined,
  };
}

/** Records what the player was asked to open, and can pre-open a session. */
function PlayerSpy({ preopen }: { preopen?: DiscoveryBroadcast }) {
  const { open, session } = useBroadcastPlayer();
  React.useEffect(() => {
    if (preopen) open({ occurrenceId: preopen.id, asset: 'master.m3u8', title: preopen.title });
  }, [preopen, open]);
  React.useEffect(() => {
    if (session) opened.push(session as typeof opened[number]);
  }, [session]);
  return null;
}

beforeEach(() => {
  fetchDiscovery.mockImplementation(() => Promise.resolve({
    states: ['live', 'reconnecting'], broadcasts: [ROOM_ONE, ROOM_TWO], poll_after_ms: 45_000,
  }));
  opened = [];
  localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'a.test.token');
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  localStorage.clear();
});

async function mount(
  roomId: string | null,
  over: Partial<DiscoveryBroadcast>[] | null = null,
  preopen?: DiscoveryBroadcast,
): Promise<void> {
  if (over) {
    fetchDiscovery.mockImplementation(() => Promise.resolve({
      states: ['live', 'reconnecting'],
      broadcasts: over.map((o) => ({ ...ROOM_ONE, ...o })),
      poll_after_ms: 45_000,
    }));
  }
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ParticipantAuthProvider>
        <BroadcastDiscoveryProvider deps={deps()}>
          <BroadcastPlayerProvider>
            <PlayerSpy preopen={preopen} />
            <BroadcastWatchButton roomId={roomId} />
          </BroadcastPlayerProvider>
        </BroadcastDiscoveryProvider>
      </ParticipantAuthProvider>,
    );
  });
}

const button = (): HTMLElement | null => container.querySelector('[data-testid="broadcast-watch"]');

describe('it offers a watch only when there is really something to watch', () => {
  it('renders the button when this room has an airing, watchable broadcast', async () => {
    await mount('room-1');
    expect(button()).not.toBeNull();
    expect(button()?.textContent).toContain('Watch here');
    expect(button()?.tagName).toBe('BUTTON');
    expect(button()?.getAttribute('type')).toBe('button');
  });

  it('opens THIS room\'s occurrence, not merely the first in the list', async () => {
    // The mutation this kills is `broadcasts[0]` in useRoomBroadcast: with two rooms airing
    // it would send a room-2 viewer into room-1's class, and every single-fixture test passes.
    await mount('room-2');
    await act(async () => {
      button()!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      occurrenceId: 'occ-2', asset: 'master.m3u8', title: 'Thursday build day',
    });
  });

  it('renders NOTHING for a room with nothing airing', async () => {
    await mount('room-99');
    expect(button()).toBeNull();
  });

  it('renders NOTHING when the viewer may not watch', async () => {
    // A Watch button that answers 402 is worse than no button; the badge owns the upgrade
    // path because it has room to explain itself.
    await mount('room-1', [{ can_watch: false, offer_upgrade: true, reason: 'not_entitled' }]);
    expect(button()).toBeNull();
  });

  it('renders NOTHING for a surface with no room id', async () => {
    // EventsPage and CommunityPage are in this position: their row types carry no room or
    // occurrence id. A null id must not degrade into "the first airing broadcast".
    await mount(null);
    expect(button()).toBeNull();
  });

  it('renders NOTHING when that occurrence is already playing', async () => {
    // Otherwise a second press reopens the same session and restarts the video the viewer is
    // watching — the player keys off `session`, so `open()` with the same id is not a no-op.
    await mount('room-1', null, ROOM_ONE);
    expect(button()).toBeNull();
  });

  it('still offers a DIFFERENT room\'s broadcast while one is playing', async () => {
    await mount('room-2', null, ROOM_ONE);
    expect(button()).not.toBeNull();
  });
});

describe('RoomPane really passes the room id down', () => {
  /**
   * A SOURCE-TEXT assertion, and its limits are the reason it is labelled as one.
   *
   * `ClassSessionBanner` fetches by live-session id and `ClassSessionInfo` carries no
   * `room_id`, so the banner cannot correlate anything unless `RoomPane` hands it the room
   * id. There is no test harness for `RoomPane` anywhere in the repo — mounting it pulls
   * room fetches, presence, chat and tabs — and the established local pattern for exactly
   * this case is to read the file and assert on its text
   * (`pages/portal/today/__tests__/TodayShell.loadState.test.ts:31` does the same).
   *
   * What this CANNOT prove: that the value is correct at runtime. It only proves the wiring
   * is present, which is the part a refactor silently drops.
   */
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..', 'pages', 'portal', 'rooms', 'RoomPane.tsx'),
    'utf8',
  );

  it('declares roomId on the banner and passes it at the mount site', () => {
    expect(src).toMatch(/ClassSessionBanner:\s*React\.FC<\{\s*sessionId:\s*string;\s*roomId:\s*string\s*\}>/);
    expect(src).toMatch(/<ClassSessionBanner\s+sessionId=\{room\.linked_live_session_id\}\s+roomId=\{roomId\}\s*\/>/);
  });

  it('renders the watch button BESIDE the join button, not instead of it', () => {
    // A broadcast is one-way and the meeting link is two-way. Replacing the join escape would
    // remove participation for everyone in order to add watching for some.
    expect(src).toContain('<BroadcastWatchButton roomId={roomId} />');
    expect(src).toMatch(/onClick=\{handleJoin\}>📹 Join Class<\/button>/);
  });

  it('leaves the two escapes that have NO broadcast-side source alone', () => {
    // The always-open video room is a two-way meeting with no broadcast equivalent, and the
    // class recording comes from `recording_url` — a different system from broadcast
    // occurrences, and `ACTIVE_DISCOVERY_STATES` does not return `replay_ready` at all, so
    // there is no replay feed to hand off to. Pretending otherwise would be the fabrication.
    expect(src).toContain("const { join_url } = await joinVideoRoom(roomId);");
    expect(src).toMatch(/openSessionRecording\(session\.recording_url, session\.title\)/);
  });
});
