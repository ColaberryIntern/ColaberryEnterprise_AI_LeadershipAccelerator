// C28 (v7 R1): where a room lives, on the server (presence for /portal/rooms/:id). The models are stubbed: no database.
const mockRoom: { value: unknown } = { value: null };
const mockCounts = { bookings: 0, broadcasts: 0 };
jest.mock('../../../models/CommunityRoom', () => ({ __esModule: true, default: { findByPk: async () => mockRoom.value } }));
jest.mock('../../../models/RoomBooking', () => ({ __esModule: true, default: { count: async () => mockCounts.bookings } }));
jest.mock('../../../models/BroadcastOccurrence', () => ({ __esModule: true, default: { count: async () => mockCounts.broadcasts } }));

import { roomKindOf, roomBuildingFor, ROOM_BUILDING } from '../campusRoomBuilding';

const facts = (o: Partial<Parameters<typeof roomKindOf>[0]> = {}) => ({ room_type: 'persistent', linked_live_session_id: null, metadata: null, hasBooking: false, hasBroadcast: false, ...o });

describe('roomKindOf', () => {
  it('maps all five kinds (C62: a broadcast is live, the Events Hall; an event room is the Meeting Rooms)', () => {
    expect(roomKindOf(facts({ hasBroadcast: true }))).toBe('live');
    expect(roomKindOf(facts({ hasBroadcast: true, metadata: { kind: 'event' } }))).toBe('live');
    expect(roomKindOf(facts({ metadata: { kind: 'event' } }))).toBe('event');
    expect(roomKindOf(facts({ room_type: 'scheduled', linked_live_session_id: 'ls-1' }))).toBe('class');
    expect(roomKindOf(facts({ hasBooking: true }))).toBe('session');
    expect(roomKindOf(facts())).toBe('open');
    expect(ROOM_BUILDING).toEqual({ live: 'amphi', event: 'commons', class: 'lecture', session: 'commons', open: 'commons' });
  });
});

describe('roomBuildingFor', () => {
  beforeEach(() => { mockRoom.value = null; mockCounts.bookings = 0; mockCounts.broadcasts = 0; });
  it('a live room (a broadcast airs in it) counts in the Events Hall; a class room in the Classroom; the rest in the commons', async () => {
    mockRoom.value = { id: 'r', room_type: 'persistent', linked_live_session_id: null, metadata: null };
    mockCounts.broadcasts = 1;
    await expect(roomBuildingFor('r')).resolves.toBe('amphi');
    mockCounts.broadcasts = 0;
    mockRoom.value = { id: 'r', room_type: 'scheduled', linked_live_session_id: 'ls-1', metadata: null };
    await expect(roomBuildingFor('r')).resolves.toBe('lecture');
    mockRoom.value = { id: 'r', room_type: 'persistent', linked_live_session_id: null, metadata: null };
    mockCounts.bookings = 2;
    await expect(roomBuildingFor('r')).resolves.toBe('commons');
    // C62: an event room (no broadcast) counts in the Meeting Rooms, where events happen
    mockCounts.bookings = 0;
    mockRoom.value = { id: 'r', room_type: 'persistent', linked_live_session_id: null, metadata: { kind: 'event' } };
    await expect(roomBuildingFor('r')).resolves.toBe('commons');
  });
  it('an unknown room is null (the caller keeps the area the client sent)', async () => {
    await expect(roomBuildingFor('missing')).resolves.toBeNull();
  });
});
