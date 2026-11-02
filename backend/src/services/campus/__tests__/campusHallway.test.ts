// C29 (v7 R2): what the Meeting Rooms hallway reads. Models, the room list and the presence rule are stubbed: no database.
type Row = Record<string, unknown>;
const mock = {
  listed: [] as Array<{ visibility: 'full' | 'shell'; room: Row }>,
  extraRooms: [] as Row[],
  presence: [] as Array<{ room_id: string; enrollment_id: string }>,
  bookings: [] as Row[],
  going: [] as Array<{ booking_id: string }>,
  cohorts: [] as Array<{ id: string; cohort_id: string | null }>,
  visible: new Map<string, { enrollment_id: string; display_name: string; avatar_url: string | null }>(),
  bookingWhere: null as unknown,
  sessions: [] as Array<{ day: string; time: string; title: string; room_id: string | null }>,
  sessionsThrow: false,
};
// The weekly timetable. Stubbed like every other read here, and stubbed EXPLICITLY
// rather than left to fail: before this mock existed the hallway's new schedule lookup
// reached an unmocked Cohort.findOne, threw, and was swallowed by its own degradation
// path — so the suite passed while never once exercising a scheduled session.
jest.mock('../campusWeekdaySessions', () => ({
  getWeekdaySessions: async () => {
    if (mock.sessionsThrow) throw Object.assign(new Error('timetable unavailable'), { name: 'TimeoutError' });
    return { intern: true, sessions: mock.sessions };
  },
}));
jest.mock('../../communityRooms/roomService', () => ({ listRoomsForViewer: async () => mock.listed }));
jest.mock('../campusPresenceService', () => ({ visibleSetFor: async () => mock.visible }));
jest.mock('../../reese/reeseIdentitySeed', () => ({ getReeseEnrollmentId: async () => 'reese-1' }));
jest.mock('../../../models/CommunityRoom', () => ({ __esModule: true, default: { findAll: async () => mock.extraRooms } }));
jest.mock('../../../models/RoomPresence', () => ({ __esModule: true, default: { findAll: async () => mock.presence } }));
jest.mock('../../../models/RoomBooking', () => ({ __esModule: true, default: { findAll: async (q: { where: unknown }) => { mock.bookingWhere = q.where; return mock.bookings; } } }));
jest.mock('../../../models/RoomBookingAttendee', () => ({ __esModule: true, default: { findAll: async () => mock.going } }));
jest.mock('../../../models/Enrollment', () => ({ __esModule: true, default: { findAll: async () => mock.cohorts } }));

import { inspect } from 'util';
import { getHallway, roomSub, INSIDE_NAMED_MAX } from '../campusHallway';

const CTX = { enrollmentId: 'me', cohortId: 'coh-1', isAdmin: false };
const room = (id: string, o: Row = {}): Row => ({ id, name: `Room ${id}`, privacy: 'cohort', owner_enrollment_id: 'other', metadata: null, ...o });
const person = (id: string) => ({ enrollment_id: id, display_name: `Person ${id}`, avatar_url: null });

beforeEach(() => {
  mock.listed = []; mock.extraRooms = []; mock.presence = []; mock.bookings = []; mock.going = []; mock.cohorts = []; mock.visible = new Map();
  mock.sessions = []; mock.sessionsThrow = false;
});

describe('the timetable claims a room, which is a third fact from presence and liveness', () => {
  // Monday 2026-11-02, CST: the 9:00 AM standup is the real instant 15:00Z.
  const STANDUP = { day: 'monday', time: '9:00 AM', title: 'Intern standup', room_id: 'standup-room' };

  it('keeps a room whose session is due even with NOBODY inside and NO call running', async () => {
    // The moment this exists for: someone opens the campus at 8:50 looking for the
    // standup. Before this clause the room was filtered out until a person was already
    // in it, so the schedule drove nothing.
    mock.sessions = [STANDUP];
    mock.listed = [{ visibility: 'full', room: room('standup-room') }];
    const h = await getHallway(CTX, new Date('2026-11-02T14:50:00Z'));
    expect(h.rooms.map((r) => r.room_id)).toEqual(['standup-room']);
    expect(h.rooms[0].inside_count).toBe(0);
    expect(h.rooms[0].live_since).toBeNull();
    expect(h.rooms[0].session).toEqual({
      title: 'Intern standup',
      start_at: '2026-11-02T15:00:00.000Z',
      end_at: '2026-11-02T16:00:00.000Z',
      in_progress: false,
    });
  });

  it('marks the session in progress once it has started', async () => {
    mock.sessions = [STANDUP];
    mock.listed = [{ visibility: 'full', room: room('standup-room') }];
    const h = await getHallway(CTX, new Date('2026-11-02T15:30:00Z'));
    expect(h.rooms[0].session?.in_progress).toBe(true);
  });

  it('drops the room again once the session window has passed', async () => {
    mock.sessions = [STANDUP];
    mock.listed = [{ visibility: 'full', room: room('standup-room') }];
    const h = await getHallway(CTX, new Date('2026-11-02T16:30:00Z'));
    expect(h.rooms).toEqual([]);
  });

  it('reports session null for a room nothing is scheduled in', async () => {
    mock.sessions = [STANDUP];
    mock.presence = [{ room_id: 'adhoc', enrollment_id: 'p1' }];
    mock.listed = [{ visibility: 'full', room: room('adhoc') }];
    const h = await getHallway(CTX, new Date('2026-11-02T15:30:00Z'));
    expect(h.rooms.map((r) => r.room_id)).toEqual(['adhoc']);
    expect(h.rooms[0].session).toBeNull();
  });

  it('reports a session and a running call independently on the same room', async () => {
    // Both true at once is the normal case for a session someone actually started, and
    // the payload must not collapse them: `live_since` is Zoom, `session` is the clock.
    mock.sessions = [STANDUP];
    mock.listed = [{ visibility: 'full', room: room('standup-room', { metadata: { live: { occurrence_uuid: 'o', meeting_id: '1', since: '2026-11-02T15:02:00.000Z' } } }) }];
    const h = await getHallway(CTX, new Date('2026-11-02T15:30:00Z'));
    expect(h.rooms[0].live_since).toBe('2026-11-02T15:02:00.000Z');
    expect(h.rooms[0].session?.in_progress).toBe(true);
  });

  it('STILL RENDERS THE HALLWAY when the timetable lookup fails', async () => {
    // A label must never take down the page people use to reach a call in progress.
    mock.sessionsThrow = true;
    mock.presence = [{ room_id: 'adhoc', enrollment_id: 'p1' }];
    mock.listed = [{ visibility: 'full', room: room('adhoc') }];
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const h = await getHallway(CTX, new Date('2026-11-02T15:30:00Z'));
      expect(h.rooms.map((r) => r.room_id)).toEqual(['adhoc']);
      expect(h.rooms[0].session).toBeNull();
      // Degraded, not silent.
      expect(err).toHaveBeenCalled();
      expect(String(err.mock.calls[0][0])).toContain('campus_hallway_sessions_failed');
    } finally {
      err.mockRestore();
    }
  });
});

describe('a meeting running is not the same thing as a page being open', () => {
  const liveMeta = (sinceIso: string) => ({ live: { occurrence_uuid: 'occ-1', meeting_id: '123', since: sinceIso } });

  it('keeps a room whose meeting is running even though NOBODY has its page open', async () => {
    // The normal shape of a real call: everyone is in Zoom, nobody on the website.
    // Such a room has no presence rows, so the hallway used to drop it entirely.
    mock.listed = [{ visibility: 'full', room: room('calling', { metadata: liveMeta('2026-10-26T11:45:00.000Z') }) }];
    const h = await getHallway(CTX, new Date('2026-10-26T12:00:00Z'));
    expect(h.rooms.map((r) => r.room_id)).toEqual(['calling']);
    expect(h.rooms[0].live_since).toBe('2026-10-26T11:45:00.000Z');
    expect(h.rooms[0].inside_count).toBe(0);
  });

  it('reports live_since null for a room that merely has people in it', async () => {
    // inside_count counts open browser tabs and never meant a meeting was happening.
    mock.listed = [{ visibility: 'full', room: room('busy') }];
    mock.presence = [{ room_id: 'busy', enrollment_id: 'a' }];
    const h = await getHallway(CTX, new Date('2026-10-26T12:00:00Z'));
    expect(h.rooms[0]).toMatchObject({ room_id: 'busy', inside_count: 1, live_since: null });
  });

  it('drops a stale liveness whose meeting never ended', async () => {
    // A dropped `meeting.ended` must not pin a room open forever — that would be the
    // original lie in a new place.
    mock.listed = [{ visibility: 'full', room: room('stale', { metadata: liveMeta('2026-10-20T00:00:00.000Z') }) }];
    const h = await getHallway(CTX, new Date('2026-10-26T12:00:00Z'));
    expect(h.rooms).toEqual([]);
  });
});

it('keeps rooms someone is in, rooms you own and rooms you booked; drops idle rooms, locked shells and event rooms', async () => {
  mock.listed = [
    { visibility: 'full', room: room('live') }, { visibility: 'full', room: room('idle') }, { visibility: 'full', room: room('own', { owner_enrollment_id: 'me' }) },
    { visibility: 'shell', room: room('locked') }, { visibility: 'full', room: room('ev', { metadata: { kind: 'event' } }) },
  ];
  mock.presence = [{ room_id: 'live', enrollment_id: 'a' }, { room_id: 'locked', enrollment_id: 'b' }, { room_id: 'ev', enrollment_id: 'c' }];
  mock.bookings = [{ id: 'bk', room_id: 'booked', title: 'Pair', start_at: new Date('2026-10-27T15:00:00Z'), end_at: null, state: 'scheduled', host_enrollment_id: 'me' }];
  mock.extraRooms = [room('booked')];
  const h = await getHallway(CTX, new Date('2026-10-26T12:00:00Z'));
  expect(h.rooms.map((r) => r.room_id).sort()).toEqual(['booked', 'live', 'own']);
  expect(h.bookings).toEqual([{ booking_id: 'bk', room_id: 'booked', title: 'Pair', start_at: '2026-10-27T15:00:00.000Z', end_at: null, state: 'scheduled', hosting: true }]);
  expect(h.reese_id).toBe('reese-1');
});

it('counts everyone inside but names only people the presence rule names, at most four; a cohort-mate is a friend', async () => {
  mock.listed = [{ visibility: 'full', room: room('r') }];
  mock.presence = ['a', 'b', 'c', 'd', 'e', 'stranger', 'a'].map((enrollment_id) => ({ room_id: 'r', enrollment_id }));
  mock.visible = new Map(['a', 'b', 'c', 'd', 'e'].map((id) => [id, person(id)]));
  mock.cohorts = [{ id: 'a', cohort_id: 'coh-1' }, { id: 'b', cohort_id: 'coh-2' }];
  const [r] = (await getHallway(CTX)).rooms;
  expect(r.inside_count).toBe(6); // distinct heartbeats, including the unnamed one
  expect(r.inside).toHaveLength(INSIDE_NAMED_MAX);
  expect(r.inside.map((p) => p.enrollment_id)).not.toContain('stranger');
  expect(r.inside.find((p) => p.enrollment_id === 'a')?.friend).toBe(true);
  expect(r.inside.find((p) => p.enrollment_id === 'b')?.friend).toBe(false);
});

it('bookings: hosting or RSVP going, scheduled or lobby open, from an hour ago on', async () => {
  mock.going = [{ booking_id: 'g1' }];
  await getHallway(CTX, new Date('2026-10-26T12:00:00Z'));
  const json = inspect(mock.bookingWhere, { depth: 10 }); // Sequelize operators are symbol keys: inspect shows them, JSON drops them
  expect(json).toContain('scheduled');
  expect(json).toContain('lobby_open');
  expect(json).toContain('g1');
  expect(json).toContain('me');
});

it('an empty campus is an empty hallway (no invented rooms)', async () => {
  expect(await getHallway(CTX)).toEqual({ rooms: [], bookings: [], reese_id: 'reese-1' });
});

it('the line under the name is the room\'s own words, never invented', () => {
  expect(roomSub({ id: 'x', privacy: 'public', metadata: { tagline: 'Pair work' }, topic: 'MCP' })).toBe('Pair work');
  expect(roomSub({ id: 'x', privacy: 'public', topic: 'MCP', description: 'd' })).toBe('MCP');
  expect(roomSub({ id: 'x', privacy: 'public' })).toBe('');
});
