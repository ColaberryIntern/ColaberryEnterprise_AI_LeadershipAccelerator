/**
 * C29 (v7 R2): the Meeting Rooms hallway. Door order (live rooms with a friend, other live rooms, your bookings, your idle rooms),
 * at most six doors with "More rooms →", the teal friends glow, the door signs, the Central time slots (DST-correct), and the
 * sheets: the peek's Join, + New room and Book a session through the existing rooms endpoints (one booking per sheet).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, useLocation } from 'react-router-dom';

const mockRooms = { createRoom: jest.fn(), createBooking: jest.fn(), inviteToRoom: jest.fn() };
jest.mock('../../../services/roomsApi', () => ({
  createRoom: (...a: unknown[]) => mockRooms.createRoom(...a),
  createBooking: (...a: unknown[]) => mockRooms.createBooking(...a),
  inviteToRoom: (...a: unknown[]) => mockRooms.inviteToRoom(...a),
}));
jest.mock('../campusApi', () => ({
  fetchCampusPresence: () => Promise.resolve({ library: { count: 2, people: [{ enrollment_id: 'e9', display_name: 'Ada Byron', avatar_url: null }, { anonymous: true }] } }),
}));
jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { get: jest.fn() } }));

// eslint-disable-next-line import/first
import { hallwayDoors, orderedDoors, doorSign, centralSlotIso, bookDays, wallDoors, isEmptyDoor, type Door } from '../hallway/hallwayModel';
// eslint-disable-next-line import/first
import { HallwayWall, HallwayRows, HallwayBoard } from '../hallway/Hallway';
// eslint-disable-next-line import/first
import { MeetingSheet } from '../hallway/MeetingSheet';
// eslint-disable-next-line import/first
import { MEET_SHEET_EVENT, HALLWAY_CHANGED_EVENT, type Hallway, type HallwayRoom } from '../hallway/hallwayApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const person = (id: string, friend = false) => ({ enrollment_id: id, display_name: `Person ${id}`, avatar_url: null, friend });
const room = (id: string, o: Partial<HallwayRoom> = {}): HallwayRoom => ({ room_id: id, name: `Room ${id}`, sub: '', emoji: null, privacy: 'cohort', mine: false, inside_count: 0, inside: [], ...o });
const H = (rooms: HallwayRoom[], bookings: Hallway['bookings'] = []): Hallway => ({ rooms, bookings, reese_id: 'reese-1' });
const booking = (id: string, roomId: string, start: string) => ({ booking_id: id, room_id: roomId, title: `Session ${id}`, start_at: start, end_at: null, state: 'scheduled', hosting: true });

describe('the door rules', () => {
  const h = H([
    room('mine', { mine: true }), room('live1', { inside_count: 5, inside: [person('a')] }), room('bk'),
    room('friendly', { inside_count: 2, inside: [person('b', true)] }), room('idle-not-mine'),
  ], [booking('b2', 'bk', '2026-10-28T15:00:00.000Z')]);

  it('orders live rooms with a friend, other live rooms, your bookings, then your idle rooms; idle rooms that are not yours have no door', () => {
    expect(orderedDoors(h).map((d) => `${d.roomId}:${d.state}`)).toEqual(['friendly:live', 'live1:live', 'bk:booked', 'mine:idle']);
    expect(orderedDoors(h)[0].friends).toBe(true);
    expect(orderedDoors(h)[2].name).toBe('Session b2'); // a booked door shows the session's title
  });

  it('caps at six doors; with more, the sixth is "More rooms" with the hidden count; doors are numbered 1-6', () => {
    const many = H(Array.from({ length: 9 }, (_, i) => room(`r${i}`, { inside_count: 9 - i })));
    const doors = hallwayDoors(many);
    expect(doors).toHaveLength(6);
    expect(doors.map((d) => d.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(doors[5]).toEqual({ more: true, n: 6, key: 'more', hidden: 4 });
    expect(hallwayDoors(H(Array.from({ length: 6 }, (_, i) => room(`r${i}`, { inside_count: 1 })))).some((d) => d.more)).toBe(false);
    expect(hallwayDoors(H([]))).toEqual([]); // an empty campus has no invented doors
  });

  it('signs: "● n inside", "Booked · Wed 10:00 AM" (Central), "Available"', () => {
    const [f, l, b, fr] = hallwayDoors(h) as Door[];
    expect(doorSign(f)).toBe('● 2 inside');
    expect(doorSign(l)).toBe('● 5 inside');
    expect(doorSign(b)).toBe('Booked · Wed 10:00 AM');
    expect(doorSign(fr)).toBe('Available');
  });

  it('a Central slot is the right instant either side of the DST change; days skip the weekend and start tomorrow', () => {
    expect(centralSlotIso('2026-10-27', '10:30 AM')).toBe('2026-10-27T15:30:00.000Z'); // CDT
    expect(centralSlotIso('2026-11-03', '10:30 AM')).toBe('2026-11-03T16:30:00.000Z'); // CST
    expect(centralSlotIso('2026-11-03', '1:00 PM')).toBe('2026-11-03T19:00:00.000Z');
    const days = bookDays(new Date('2026-10-23T17:00:00Z')); // a Friday in Central
    expect(days).toHaveLength(7);
    expect(days[0].key).toBe('2026-10-26'); // Monday
    expect(days.map((d) => d.wd)).not.toContain('Sat');
    expect(days.map((d) => d.wd)).not.toContain('Sun');
  });
});

let container: HTMLDivElement;
let root: Root;
let where = '';
function Where(): null { where = useLocation().pathname; return null; }
const render = (el: React.ReactElement) => { act(() => { root.render(<MemoryRouter initialEntries={['/portal/campus']}>{el}<Where /></MemoryRouter>); }); };
const q = (s: string) => container.querySelector(s);
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  Object.values(mockRooms).forEach((f) => f.mockReset());
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('the walls, the board and the card', () => {
  const h = H([room('f', { inside_count: 2, inside: [person('b', true)] }), room('l', { inside_count: 1, inside: [person('a')] })]);

  it('a friend\'s room glows (is-friends); a door opens the peek; the left wall holds doors 1-3', () => {
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(MEET_SHEET_EVENT, on);
    render(<><HallwayWall doors={hallwayDoors(h)} side="left" onOpen={() => undefined} /><HallwayWall doors={hallwayDoors(h)} side="right" onOpen={() => undefined} /></>);
    expect(q('[data-testid="cm-door-1"]')!.className).toContain('is-friends');
    expect(q('[data-testid="cm-door-2"]')!.className).not.toContain('is-friends');
    expect(q('[data-testid="cm-door-1"]')!.textContent).toContain('● 2 inside');
    act(() => { (q('[data-testid="cm-door-1"]') as HTMLButtonElement).click(); });
    expect(seen).toEqual([{ mode: 'peek', roomId: 'f' }]);
    window.removeEventListener(MEET_SHEET_EVENT, on);
  });

  it('the board counts the open rooms and Join goes to the room page', () => {
    const opened: string[] = [];
    render(<HallwayBoard hallway={h} onOpen={(r) => opened.push(r)} />);
    expect(q('[data-testid="cm-board-title"]')!.textContent).toBe('Meeting rooms · 2 open now');
    act(() => { (q('[data-testid="cm-board-room-f"] button') as HTMLButtonElement).click(); });
    expect(opened).toEqual(['/portal/rooms/f']);
  });

  it('the card says so when the rooms cannot load or none are open, and still offers + New room and Book a session', () => {
    render(<HallwayRows hallway={null} error onOpen={() => undefined} />);
    expect(q('[data-testid="cm-hall-rows"]')!.textContent).toContain('can’t load the rooms');
    render(<HallwayRows hallway={H([])} error={false} onOpen={() => undefined} />);
    expect(q('[data-testid="cm-hall-rows"]')!.textContent).toContain('No rooms are open yet');
    expect(q('[data-testid="cm-hall-new"]')).not.toBeNull();
    expect(q('[data-testid="cm-hall-book"]')).not.toBeNull();
  });
});

describe('the sheets', () => {
  const h = H([room('f', { inside_count: 3, inside: [person('b', true)] })]);

  it('the peek names who the presence rule names, counts the rest, and Join goes into the room', () => {
    render(<MeetingSheet open={{ mode: 'peek', roomId: 'f' }} hallway={h} onClose={() => undefined} />);
    expect(q('[data-testid="cm-meet-peek"]')!.textContent).toContain('Inside · 3');
    expect(q('[data-testid="cm-meet-peek"]')!.textContent).toContain('Person b');
    expect(q('[data-testid="cm-meet-peek"]')!.textContent).toContain('2 more people');
    act(() => { (q('[data-testid="cm-meet-join"]') as HTMLButtonElement).click(); });
    expect(where).toBe('/portal/rooms/f');
  });

  it('+ New room creates the room through the rooms endpoint (Cohort by default), invites, and takes you in', async () => {
    mockRooms.createRoom.mockResolvedValue({ id: 'new-1' });
    mockRooms.inviteToRoom.mockResolvedValue(1);
    let changed = 0;
    const on = () => { changed += 1; };
    window.addEventListener(HALLWAY_CHANGED_EVENT, on);
    render(<MeetingSheet open={{ mode: 'new' }} hallway={h} onClose={() => undefined} />);
    await flush();
    act(() => { (q('[data-testid="cm-meet-invite-reese"]') as HTMLButtonElement).click(); });
    await act(async () => { (q('[data-testid="cm-meet-go"]') as HTMLButtonElement).click(); });
    await flush();
    expect(mockRooms.createRoom).toHaveBeenCalledWith(expect.objectContaining({ name: 'Your room', privacy: 'cohort' }));
    expect(mockRooms.inviteToRoom).toHaveBeenCalledWith('new-1', ['reese-1']);
    expect(where).toBe('/portal/rooms/new-1');
    expect(changed).toBe(1);
    window.removeEventListener(HALLWAY_CHANGED_EVENT, on);
  });

  it('Book a session needs a time; it books once with an idempotency key at the Central instant, even on a double tap', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockRooms.createBooking.mockReturnValue(new Promise((r) => { release = r; }));
    render(<MeetingSheet open={{ mode: 'book' }} hallway={h} onClose={() => undefined} />);
    await flush();
    expect((q('[data-testid="cm-meet-go"]') as HTMLButtonElement).disabled).toBe(true);
    act(() => { (q('[data-testid="cm-meet-slots"] button') as HTMLButtonElement).click(); }); // 9:00 AM
    const go = q('[data-testid="cm-meet-go"]') as HTMLButtonElement;
    await act(async () => { go.click(); go.click(); });
    await act(async () => { release({ id: 'bk-1', room_id: 'room-9' }); });
    await flush();
    expect(mockRooms.createBooking).toHaveBeenCalledTimes(1);
    const body = mockRooms.createBooking.mock.calls[0][0];
    expect(body.idempotency_key).toMatch(/^campus-book-/);
    expect(body.timezone).toBe('America/Chicago');
    expect(new Date(body.end_at).getTime() - new Date(body.start_at).getTime()).toBe(60 * 60_000);
    expect(new Date(body.start_at).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })).toBe('9:00 AM');
  });

  it('a failed create says so and changes nothing', async () => {
    mockRooms.createRoom.mockRejectedValue(new Error('down'));
    render(<MeetingSheet open={{ mode: 'new' }} hallway={h} onClose={() => undefined} />);
    await act(async () => { (q('[data-testid="cm-meet-go"]') as HTMLButtonElement).click(); });
    await flush();
    expect(q('[role="alert"]')!.textContent).toContain('Could not open the room');
    expect(where).toBe('/portal/campus');
  });
});

describe('C44: the walls always show six doors', () => {
  const mine = (n: number) => Array.from({ length: n }, (_, i) => room(`m${i}`, { mine: true }));
  it('0, 3, 6 and 9 rooms each give six doors: the real ones first, then empty fillers, or More rooms as the sixth', () => {
    const shape = (n: number) => wallDoors(H(mine(n))).map((d) => (isEmptyDoor(d) ? 'empty' : d.more ? 'more' : 'room'));
    expect(shape(0)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty', 'empty']);
    expect(shape(3)).toEqual(['room', 'room', 'room', 'empty', 'empty', 'empty']);
    expect(shape(6)).toEqual(['room', 'room', 'room', 'room', 'room', 'room']);
    expect(shape(9)).toEqual(['room', 'room', 'room', 'room', 'room', 'more']);
    expect(wallDoors(H(mine(3))).map((d) => d.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(hallwayDoors(H(mine(3)))).toHaveLength(3); // the card rows still list only real rooms
  });
  it('an empty door reads Room <n> - Empty - open it and opens the New room sheet; it never says free', () => {
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(MEET_SHEET_EVENT, on);
    const h = H(mine(3));
    render(<><HallwayWall doors={wallDoors(h)} side="left" onOpen={() => undefined} /><HallwayWall doors={wallDoors(h)} side="right" onOpen={() => undefined} /></>);
    const d5 = container.querySelector('[data-testid="cm-door-5"]') as HTMLButtonElement;
    expect(d5.textContent).toContain('Room 5');
    expect(d5.textContent).toContain('Empty');
    expect(container.textContent).not.toMatch(/free/i);
    act(() => { d5.click(); });
    window.removeEventListener(MEET_SHEET_EVENT, on);
    expect(seen).toEqual([{ mode: 'new' }]);
  });
});
