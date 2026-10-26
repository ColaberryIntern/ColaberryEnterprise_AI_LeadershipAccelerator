/**
 * C28 (v7 R1): one rule for where a room lives. event -> Events Hall, class -> Classroom, session / open -> Meeting Rooms (commons);
 * every broadcast airs in the Events Hall (LIVE_ROOM_BUILDING 'commons' retired); a class broadcast is still findable for the
 * Classroom's "Your class is live in the Events Hall" line; a room page's id is read from its path.
 */
import { roomKind, roomBuilding, roomIdOfPath, ROOM_BUILDING } from '../campusRoomKind';
import { liveBuildingOf, liveClassOf, onAirBuildings, headlineBroadcast } from '../campusOnAir';
import type { DiscoveryBroadcast } from '../../../hooks/useBroadcastDiscovery';

const bc = (o: Partial<DiscoveryBroadcast>): DiscoveryBroadcast => ({ id: 'b', title: 'Live', room_id: null, session_id: null, ...o } as DiscoveryBroadcast);

it('all five kinds map to their building (C62: a broadcast is live, the Events Hall; an event room is the Meeting Rooms)', () => {
  expect(roomKind({ broadcast: true })).toBe('live');
  expect(roomKind({ metadata: { kind: 'event' } })).toBe('event');
  expect(roomKind({ metadata: { event_id: 'eb-1' } })).toBe('event');
  expect(roomKind({ room_type: 'scheduled', linked_live_session_id: 'ls-1' })).toBe('class');
  expect(roomKind({ room_type: 'scheduled', linked_live_session_id: null })).toBe('open');
  expect(roomKind({ room_type: 'persistent', has_booking: true })).toBe('session');
  expect(roomKind({ room_type: 'persistent' })).toBe('open');
  expect(ROOM_BUILDING).toEqual({ live: 'amphi', event: 'commons', class: 'lecture', session: 'commons', open: 'commons' });
  expect(roomBuilding({ metadata: { kind: 'event' } })).toBe('commons');
  expect(roomBuilding({ broadcast: true, room_type: 'scheduled', linked_live_session_id: 'ls-1' })).toBe('amphi'); // a broadcast wins
});

it('every broadcast lights the Events Hall and never the commons; the headline prefers one with a place', () => {
  const list = [bc({ id: 'x' }), bc({ id: 'r', room_id: 'r1' }), bc({ id: 's', session_id: 's1' })];
  for (const b of list) expect(liveBuildingOf(b)).toBe('amphi');
  expect(Array.from(onAirBuildings(list))).toEqual(['amphi']);
  expect(Array.from(onAirBuildings([bc({ id: 'x' })]))).toEqual([]); // nowhere to walk in: nothing lights
  expect(headlineBroadcast(list)?.id).toBe('r');
  expect(liveClassOf(list)?.id).toBe('s');
  expect(liveClassOf([bc({ room_id: 'r1' })])).toBeNull();
});

it('a room page carries its id; other paths do not', () => {
  expect(roomIdOfPath('/portal/rooms/0b9f3c2e-1a2b-4c3d-8e9f-001122334455')).toBe('0b9f3c2e-1a2b-4c3d-8e9f-001122334455');
  expect(roomIdOfPath('/portal/rooms/0b9f3c2e-1a2b-4c3d-8e9f-001122334455/chat')).toBe('0b9f3c2e-1a2b-4c3d-8e9f-001122334455');
  expect(roomIdOfPath('/portal/rooms')).toBeNull();
  expect(roomIdOfPath('/portal/rooms/not-a-uuid')).toBeNull();
});
