/**
 * The two campus Meeting Rooms must not share a Zoom identity.
 *
 * WHAT WENT WRONG. `ensureRoomLink` minted each room's year-long meeting with no host,
 * so `zoomService.createMeeting` fell back to the single `ZOOM_HOST_EMAIL` for both.
 * A Zoom user hosts one meeting at a time, so the Monday interns standup could not
 * open while the public AI session was live — someone had to end one call to start
 * the other. The host pool existed and nothing in this path consumed it.
 *
 * These tests pin the WIRING, which the allocator's own unit tests cannot: that a
 * reserved host actually reaches Zoom, and that an unconfigured pool still sends no
 * host at all. Removing the pass-through fails the first test by name.
 */
jest.mock('../../../models/CommunityRoom', () => ({ __esModule: true, default: { findOrCreate: jest.fn() } }));
jest.mock('../../../models/RoomMembership', () => ({ __esModule: true, default: { findOrCreate: jest.fn() } }));
jest.mock('../../../models/CohortMembership', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../zoomService', () => ({ createMeeting: jest.fn(), isZoomConfigured: jest.fn(() => true) }));
jest.mock('../../zoom/roomHostAllocator', () => ({ reserveRoomHost: jest.fn() }));
jest.mock('../internshipCohortService', () => {
  const actual = jest.requireActual('../internshipCohortService');
  return {
    ...actual,
    ensureInternshipCohort: jest.fn(),
    internshipSettings: jest.fn(() => actual.DEFAULT_INTERNSHIP_SETTINGS),
  };
});

import CommunityRoom from '../../../models/CommunityRoom';
import RoomMembership from '../../../models/RoomMembership';
import CohortMembership from '../../../models/CohortMembership';
import { createMeeting } from '../../zoomService';
import { reserveRoomHost } from '../../zoom/roomHostAllocator';
import { ensureInternshipCohort } from '../internshipCohortService';
import {
  ensureInternshipMeetingRooms,
  INTERNS_ROOM_SLUG,
  PUBLIC_ROOM_SLUG,
} from '../internshipMeetingRooms';

const findOrCreateRoom = CommunityRoom.findOrCreate as unknown as jest.Mock;
const findOrCreateMembership = RoomMembership.findOrCreate as unknown as jest.Mock;
const findMemberships = CohortMembership.findAll as unknown as jest.Mock;
const zoomCreate = createMeeting as unknown as jest.Mock;
const reserve = reserveRoomHost as unknown as jest.Mock;
const ensureCohort = ensureInternshipCohort as unknown as jest.Mock;

/** A room row as the provisioning service uses it: identity, no link yet, updatable. */
function roomRow(slug: string, id: string, name: string) {
  return { id, slug, name, description: `${name} room`, meeting_link: null, update: jest.fn() };
}

/** The host each `createMeeting` call was given, keyed by the room in its topic. */
function hostByRoomName(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [input] of zoomCreate.mock.calls) {
    const name = String(input.topic).replace(/^Colaberry — /, '');
    out[name] = input.hostEmail;
  }
  return out;
}

beforeEach(() => {
  jest.clearAllMocks();
  ensureCohort.mockResolvedValue({
    cohort: { id: 'cohort-1', settings_json: {}, update: jest.fn() },
    created: false,
  });
  findMemberships.mockResolvedValue([]);
  findOrCreateMembership.mockResolvedValue([{}, true]);
  findOrCreateRoom.mockImplementation(async ({ where }: { where: { slug: string } }) =>
    where.slug === INTERNS_ROOM_SLUG
      ? [roomRow(INTERNS_ROOM_SLUG, 'room-interns', 'AI Internship')]
      : [roomRow(PUBLIC_ROOM_SLUG, 'room-public', 'Colaberry AI Sessions')]);
  zoomCreate.mockImplementation(async (input: { topic: string }) =>
    ({ joinUrl: `https://zoom.us/j/${encodeURIComponent(input.topic)}`, meetingId: '1' }));
});

describe('each room is minted under its own Zoom host', () => {
  it('passes the reserved host through to Zoom, one per room', async () => {
    reserve.mockImplementation(async (roomId: string) =>
      (roomId === 'room-interns' ? 'standup@colaberry.com' : 'sessions@colaberry.com'));

    await ensureInternshipMeetingRooms();

    const hosts = hostByRoomName();
    expect(hosts['AI Internship']).toBe('standup@colaberry.com');
    expect(hosts['Colaberry AI Sessions']).toBe('sessions@colaberry.com');
    // The property that matters is not the specific addresses but that they differ:
    // two rooms on one host is precisely the state that cannot run two calls.
    expect(hosts['AI Internship']).not.toBe(hosts['Colaberry AI Sessions']);
  });

  it('reserves a host for each room before minting its link', async () => {
    reserve.mockResolvedValue('a@colaberry.com');
    await ensureInternshipMeetingRooms();

    expect(reserve).toHaveBeenCalledWith('room-interns');
    expect(reserve).toHaveBeenCalledWith('room-public');
    expect(reserve).toHaveBeenCalledTimes(2);
  });

  it('sends NO host when the pool is empty, exactly as before the pool existed', async () => {
    // The regression guard. Until an operator registers a second host the behavior
    // must be indistinguishable from this feature's absence — and an explicit
    // `hostEmail: undefined` is not the same thing as omitting it.
    reserve.mockResolvedValue(null);
    await ensureInternshipMeetingRooms();

    for (const [input] of zoomCreate.mock.calls) {
      expect(input).not.toHaveProperty('hostEmail');
    }
  });

  it('never re-mints a room that already has a link (idempotency)', async () => {
    // Re-running provisioning must not move a room to another host: the link is
    // already live on the first one, and reconcile asks the host that was recorded.
    findOrCreateRoom.mockImplementation(async ({ where }: { where: { slug: string } }) => [{
      ...roomRow(where.slug, 'room-x', 'Already Linked'),
      meeting_link: 'https://zoom.us/j/EXISTING',
    }]);
    reserve.mockResolvedValue('spare@colaberry.com');

    await ensureInternshipMeetingRooms();

    expect(zoomCreate).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });

  it('keeps the room when Zoom refuses, without taking the run down (failure path)', async () => {
    reserve.mockResolvedValue('a@colaberry.com');
    zoomCreate.mockRejectedValue(Object.assign(new Error('429 rate limited'), { error_class: 'RateLimitError' }));

    const result = await ensureInternshipMeetingRooms();

    expect(result.interns_room.join_url).toBeNull();
    expect(result.public_room.join_url).toBeNull();
    expect(result.interns_room.id).toBe('room-interns');
  });
});
