import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import {
  BroadcastDiscoveryProvider,
  useDiscoveryState,
  useRoomBroadcast,
  DISCOVERY_FALLBACK,
} from '../BroadcastDiscoveryContext';
import { ParticipantAuthProvider } from '../ParticipantAuthContext';
import { PARTICIPANT_TOKEN_KEY } from '../../utils/participantToken';
import type { DiscoveryBroadcast, DiscoveryResponse } from '../../hooks/useBroadcastDiscovery';

/**
 * The shared discovery source.
 *
 * THE POINT OF THIS SUITE IS THE FIRST TEST. `useBroadcastDiscovery` holds all of its state
 * per-instance, so every call site is an independent poller with its own timer. The runbook's
 * capacity table projects discovery load as `viewers / 45 s` — one request per tab per
 * cadence — and P3-04 puts the live state in several places at once. Without a single source,
 * shipping those placements would silently multiply the real request rate by the number of
 * surfaces and make a published capacity figure false. "One poll however many consumers" is
 * therefore a load guarantee, not an implementation detail, and it gets a test that fails if
 * a placement ever goes back to calling the hook directly.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIVE_ONE: DiscoveryBroadcast = {
  id: 'occ-1', title: 'Monday cohort class', access_mode: 'paid', editorial_state: 'live',
  room_id: 'room-1', content_started_at: 1_000, scheduled_start_at: 500,
  can_watch: true, reason: 'entitled', offer_upgrade: false, preview_seconds_remaining: null,
};
const LIVE_TWO: DiscoveryBroadcast = {
  ...LIVE_ONE, id: 'occ-2', title: 'Thursday build day', room_id: 'room-2',
};
/**
 * A broadcast with NO room. `BroadcastOccurrence.room_id` is `allowNull: true`, so this is a
 * real row shape, and it is the fixture that makes the `!roomId` guard testable: without it
 * present, dropping the guard changed no result and the mutation survived.
 */
const LIVE_NO_ROOM: DiscoveryBroadcast = {
  ...LIVE_ONE, id: 'occ-roomless', title: 'Roomless special', room_id: null,
};

const response = (over: Partial<DiscoveryResponse> = {}): DiscoveryResponse => ({
  states: ['live', 'reconnecting'],
  broadcasts: [LIVE_ONE, LIVE_TWO],
  poll_after_ms: 45_000,
  ...over,
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

/** A consumer that writes what it sees into the DOM, so each one is independently checkable. */
function StateProbe({ label }: { label: string }) {
  const { broadcasts, disabled, unavailable, answered } = useDiscoveryState();
  return (
    <div
      data-testid={`probe-${label}`}
      data-count={String(broadcasts.length)}
      data-disabled={String(disabled)}
      data-unavailable={String(unavailable)}
      data-answered={String(answered)}
    />
  );
}

function RoomProbe({ label, roomId }: { label: string; roomId: string | null }) {
  const airing = useRoomBroadcast(roomId);
  return <div data-testid={`room-${label}`} data-occ={airing ? airing.id : 'none'} />;
}

beforeEach(() => {
  fetchDiscovery.mockImplementation(() => Promise.resolve(response()));
  timers = [];
  nextTimerId = 1;
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  localStorage.clear();
});

function signedIn(): void {
  localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'a.test.token');
}

async function mount(node: React.ReactElement): Promise<void> {
  root = createRoot(container);
  await act(async () => { root.render(node); });
}

const find = (testid: string): HTMLElement | null =>
  container.querySelector(`[data-testid="${testid}"]`);

describe('one poll per tab, however many consumers', () => {
  it('fetches ONCE for five consumers', async () => {
    signedIn();
    await mount(
      <ParticipantAuthProvider>
        <BroadcastDiscoveryProvider deps={deps()}>
          <StateProbe label="a" />
          <StateProbe label="b" />
          <StateProbe label="c" />
          <RoomProbe label="r1" roomId="room-1" />
          <RoomProbe label="r2" roomId="room-2" />
        </BroadcastDiscoveryProvider>
      </ParticipantAuthProvider>,
    );

    // The load guarantee. Five placements calling the hook directly would be five requests
    // per cadence per tab, and the runbook's table would understate real traffic fivefold.
    expect(fetchDiscovery).toHaveBeenCalledTimes(1);
    // And exactly one timer armed, so the CADENCE is shared too, not just the first request.
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(45_000);
  });

  it('gives every consumer the same answer', async () => {
    signedIn();
    await mount(
      <ParticipantAuthProvider>
        <BroadcastDiscoveryProvider deps={deps()}>
          <StateProbe label="a" />
          <StateProbe label="b" />
        </BroadcastDiscoveryProvider>
      </ParticipantAuthProvider>,
    );

    expect(find('probe-a')?.getAttribute('data-count')).toBe('2');
    expect(find('probe-b')?.getAttribute('data-count')).toBe('2');
    expect(find('probe-a')?.getAttribute('data-disabled')).toBe('false');
  });
});

describe('the auth gate lives in the provider, so no placement can forget it', () => {
  it('does not call the endpoint at all when signed out', async () => {
    // No token. The portal layout route wraps /portal/login, /portal/signup and
    // /portal/verify, so this is the state on those pages — and an authenticated request
    // from there is what put a "Live status is unavailable" panel on the login screen, and
    // with the flag on would send a signed-out visitor from the login page to the login page.
    await mount(
      <ParticipantAuthProvider>
        <BroadcastDiscoveryProvider deps={deps()}>
          <StateProbe label="a" />
        </BroadcastDiscoveryProvider>
      </ParticipantAuthProvider>,
    );

    expect(fetchDiscovery).not.toHaveBeenCalled();
    expect(timers).toHaveLength(0);
    expect(find('probe-a')?.getAttribute('data-count')).toBe('0');
  });

  it('honours enabled={false} even for a signed-in viewer', async () => {
    signedIn();
    await mount(
      <ParticipantAuthProvider>
        <BroadcastDiscoveryProvider enabled={false} deps={deps()}>
          <StateProbe label="a" />
        </BroadcastDiscoveryProvider>
      </ParticipantAuthProvider>,
    );

    expect(fetchDiscovery).not.toHaveBeenCalled();
  });

  it('is an AND, not a substitution — enabled alone does not defeat the auth check', async () => {
    // The mutation this kills: `useBroadcastDiscovery(enabled, ...)`, dropping the
    // conjunction. It passes every test that happens to be signed in.
    await mount(
      <ParticipantAuthProvider>
        <BroadcastDiscoveryProvider enabled deps={deps()}>
          <StateProbe label="a" />
        </BroadcastDiscoveryProvider>
      </ParticipantAuthProvider>,
    );

    expect(fetchDiscovery).not.toHaveBeenCalled();
  });
});

describe('a consumer outside the provider is OFF, not merely empty', () => {
  it('sees the disabled fallback', async () => {
    // "Empty and working" and "not running at all" must not look the same to a placement:
    // one means render nothing, the other could mean render an empty state.
    await mount(<StateProbe label="lonely" />);

    expect(find('probe-lonely')?.getAttribute('data-disabled')).toBe('true');
    expect(find('probe-lonely')?.getAttribute('data-count')).toBe('0');
  });

  it('exports a fallback that really is disabled', () => {
    expect(DISCOVERY_FALLBACK.disabled).toBe(true);
    expect(DISCOVERY_FALLBACK.broadcasts).toEqual([]);
    expect(DISCOVERY_FALLBACK.unavailable).toBe(false);
    // Nothing was asked, so nothing was answered.
    expect(DISCOVERY_FALLBACK.answered).toBe(false);
  });

  it('useRoomBroadcast finds nothing outside the provider', async () => {
    await mount(<RoomProbe label="lonely" roomId="room-1" />);
    expect(find('room-lonely')?.getAttribute('data-occ')).toBe('none');
  });
});

/**
 * `answered` — the positive signal, kept apart from the absence of the negative one.
 *
 * `disabled` starts false, because on mount nothing yet says the feature is off, and that is
 * right for a placement that renders nothing until it has something to show. It is wrong for
 * anything reading `!disabled` as "broadcasting exists": for the first moment of every page
 * load that is a guess, and with the flag dark it is a wrong one. L8.3's "Replays" nav tab was
 * gated that way first, which put the tab in every sidebar on load and took it away when the
 * 404 landed.
 */
describe('answered — asked, and got a reply', () => {
  async function mountOne(): Promise<void> {
    signedIn();
    await mount(
      <ParticipantAuthProvider>
        <BroadcastDiscoveryProvider deps={deps()}>
          <StateProbe label="gate" />
        </BroadcastDiscoveryProvider>
      </ParticipantAuthProvider>,
    );
  }

  it('is FALSE while the first request is still in flight, though disabled is false too', async () => {
    // The whole point: in this state `!disabled` is true and means nothing. A gate built on it
    // alone shows a tab for a feature that may well be switched off.
    fetchDiscovery.mockImplementation(() => new Promise<DiscoveryResponse>(() => undefined));
    await mountOne();

    expect(find('probe-gate')?.getAttribute('data-answered')).toBe('false');
    expect(find('probe-gate')?.getAttribute('data-disabled')).toBe('false');
  });

  it('is true once discovery answers with a list', async () => {
    fetchDiscovery.mockImplementation(() => Promise.resolve(response()));
    await mountOne();

    expect(find('probe-gate')?.getAttribute('data-answered')).toBe('true');
    expect(find('probe-gate')?.getAttribute('data-disabled')).toBe('false');
  });

  it('is true after a 404 as well — a 404 IS an answer, and the one a gate most needs', async () => {
    fetchDiscovery.mockImplementation(() => Promise.reject(
      Object.assign(new Error('not found'), { response: { status: 404 } }),
    ));
    await mountOne();

    expect(find('probe-gate')?.getAttribute('data-answered')).toBe('true');
    expect(find('probe-gate')?.getAttribute('data-disabled')).toBe('true');
  });

  it('is true after an outage, which is neither off nor unknown', async () => {
    fetchDiscovery.mockImplementation(() => Promise.reject(
      Object.assign(new Error('bad gateway'), { response: { status: 503 } }),
    ));
    await mountOne();

    expect(find('probe-gate')?.getAttribute('data-answered')).toBe('true');
    expect(find('probe-gate')?.getAttribute('data-unavailable')).toBe('true');
  });

  it('stays false for a signed-out viewer, who is never asked at all', async () => {
    // No token: the provider never enables the hook, so there is no answer to have.
    await mount(
      <ParticipantAuthProvider>
        <BroadcastDiscoveryProvider deps={deps()}>
          <StateProbe label="gate" />
        </BroadcastDiscoveryProvider>
      </ParticipantAuthProvider>,
    );

    expect(find('probe-gate')?.getAttribute('data-answered')).toBe('false');
    expect(fetchDiscovery).not.toHaveBeenCalled();
  });
});

describe('useRoomBroadcast — room_id is the ONLY honest join key', () => {
  async function mountRooms(): Promise<void> {
    signedIn();
    await mount(
      <ParticipantAuthProvider>
        <BroadcastDiscoveryProvider deps={deps()}>
          <RoomProbe label="one" roomId="room-1" />
          <RoomProbe label="two" roomId="room-2" />
          <RoomProbe label="other" roomId="room-99" />
          <RoomProbe label="null" roomId={null} />
        </BroadcastDiscoveryProvider>
      </ParticipantAuthProvider>,
    );
  }

  it('matches each room to ITS airing occurrence, not just to any', async () => {
    await mountRooms();
    // The mutation this kills is `broadcasts[0]` — which passes any test with one broadcast
    // in the fixture, and silently shows room-2 the class airing in room-1.
    expect(find('room-one')?.getAttribute('data-occ')).toBe('occ-1');
    expect(find('room-two')?.getAttribute('data-occ')).toBe('occ-2');
  });

  it('answers nothing for a room with no airing occurrence', async () => {
    await mountRooms();
    expect(find('room-other')?.getAttribute('data-occ')).toBe('none');
  });

  it('answers nothing for a surface with no room id', async () => {
    // EventsPage and CommunityPage are in exactly this position: `OpenHouseView` and
    // `CommunityEvent` carry no room or occurrence id, so they CANNOT say "this event is the
    // one airing". A null id must not fall back to "the first one".
    await mountRooms();
    expect(find('room-null')?.getAttribute('data-occ')).toBe('none');
  });

  it('does not match a ROOMLESS broadcast to a surface with no room id', async () => {
    // The version of the test above passed with the `!roomId` guard removed, because no
    // fixture had `room_id: null` and `.find(b => b.room_id === null)` therefore matched
    // nothing anyway. `room_id` IS nullable on the model, so the pair really can meet:
    // null === null, and a page with no room would show a Watch button for a broadcast it
    // has no relationship to. This is the test that fails when the guard goes.
    signedIn();
    fetchDiscovery.mockImplementation(() => Promise.resolve(response({
      broadcasts: [LIVE_NO_ROOM, LIVE_ONE],
    })));
    await mount(
      <ParticipantAuthProvider>
        <BroadcastDiscoveryProvider deps={deps()}>
          <RoomProbe label="null" roomId={null} />
          <RoomProbe label="one" roomId="room-1" />
        </BroadcastDiscoveryProvider>
      </ParticipantAuthProvider>,
    );

    expect(find('room-null')?.getAttribute('data-occ')).toBe('none');
    // and the roomless row does not shadow a real match either
    expect(find('room-one')?.getAttribute('data-occ')).toBe('occ-1');
  });

  it('a terminal 404 empties the list as well as disabling — the invariant useRoomBroadcast relies on', async () => {
    // `useRoomBroadcast` deliberately has no `disabled` check, on the grounds that `disabled`
    // can never coexist with a non-empty list. That premise is owned by the hook, not by this
    // module, so it is asserted here: if a future change keeps a stale list while disabled,
    // this fails and the check has to come back.
    signedIn();
    await mount(
      <ParticipantAuthProvider>
        <BroadcastDiscoveryProvider deps={deps()}>
          <StateProbe label="a" />
          <RoomProbe label="one" roomId="room-1" />
        </BroadcastDiscoveryProvider>
      </ParticipantAuthProvider>,
    );
    expect(find('probe-a')?.getAttribute('data-count')).toBe('2');
    expect(find('room-one')?.getAttribute('data-occ')).toBe('occ-1');

    // The flag goes dark mid-session, or the token expires: the endpoint answers terminally.
    fetchDiscovery.mockImplementation(() => Promise.reject({ response: { status: 404 } }));
    await act(async () => { timers[0].fn(); });

    expect(find('probe-a')?.getAttribute('data-disabled')).toBe('true');
    expect(find('probe-a')?.getAttribute('data-count')).toBe('0');
    // Which is why a room lookup cannot return a stale match even without a disabled check.
    expect(find('room-one')?.getAttribute('data-occ')).toBe('none');
  });
});
