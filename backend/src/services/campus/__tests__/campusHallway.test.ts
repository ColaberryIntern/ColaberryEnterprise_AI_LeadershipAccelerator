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
};
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
