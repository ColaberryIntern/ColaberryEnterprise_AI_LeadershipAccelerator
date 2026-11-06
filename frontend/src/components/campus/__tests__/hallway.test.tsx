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
import { hallwayDoors, orderedDoors, doorSign, centralSlotIso, bookDays, wallDoors, isEmptyDoor, canJoin, boardSummary, rowLine, type Door } from '../hallway/hallwayModel';
// eslint-disable-next-line import/first
import { HallwayWall, HallwayRows, HallwayBoard } from '../hallway/Hallway';
// eslint-disable-next-line import/first
import { MeetingSheet } from '../hallway/MeetingSheet';
// eslint-disable-next-line import/first
import { MEET_SHEET_EVENT, HALLWAY_CHANGED_EVENT, type Hallway, type HallwayRoom } from '../hallway/hallwayApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const person = (id: string, friend = false) => ({ enrollment_id: id, display_name: `Person ${id}`, avatar_url: null, friend });
// live_since defaults to null: people present with NO meeting running, which is what
// inside_count has always actually meant. session defaults to null too: an ad-hoc room
// is in nobody's timetable, and the three are independent.
const room = (id: string, o: Partial<HallwayRoom> = {}): HallwayRoom => ({ room_id: id, name: `Room ${id}`, sub: '', emoji: null, privacy: 'cohort', mine: false, inside_count: 0, inside: [], live_since: null, session: null, ...o });
const H = (rooms: HallwayRoom[], bookings: Hallway['bookings'] = []): Hallway => ({ rooms, bookings, reese_id: 'reese-1' });
const booking = (id: string, roomId: string, start: string) => ({ booking_id: id, room_id: roomId, title: `Session ${id}`, start_at: start, end_at: null, state: 'scheduled', hosting: true });
/** A scheduled session. 2026-11-02 is a Monday in CST, so 9:00 AM Central is 15:00Z. */
const sess = (o: Partial<HallwayRoom['session'] & object> = {}) => ({
  title: 'Intern standup', start_at: '2026-11-02T15:00:00.000Z', end_at: '2026-11-02T16:00:00.000Z', in_progress: true, ...o,
});

describe('the door rules', () => {
  const h = H([
    room('mine', { mine: true }), room('live1', { inside_count: 5, inside: [person('a')] }), room('bk'),
    room('friendly', { inside_count: 2, inside: [person('b', true)] }), room('idle-not-mine'),
  ], [booking('b2', 'bk', '2026-10-28T15:00:00.000Z')]);

  it('orders rooms with a friend first, other occupied rooms, your bookings, then your idle rooms; idle rooms that are not yours have no door', () => {
    // These rooms have people but no meeting, so they are `occupied`, not `live`.
    expect(orderedDoors(h).map((d) => `${d.roomId}:${d.state}`)).toEqual(['friendly:occupied', 'live1:occupied', 'bk:booked', 'mine:idle']);
    expect(orderedDoors(h)[0].friends).toBe(true);
    expect(orderedDoors(h)[2].name).toBe('Session b2'); // a booked door shows the session's title
  });

  it('a room with a meeting running outranks a busier room with no call', () => {
    // THE DEFECT: ordering was by open browser tabs alone, so a real call lost its
    // place on the wall to a room where more people happened to have a page open.
    const mixed = H([room('busy', { inside_count: 9 }), room('calling', { inside_count: 1, live_since: '2026-11-02T15:00:00.000Z' })]);
    expect(orderedDoors(mixed).map((d) => `${d.roomId}:${d.state}`)).toEqual(['calling:live', 'busy:occupied']);
  });

  it('shows a live room that nobody has the page open for', () => {
    // The normal shape of a real call: everyone is in Zoom, nobody is on the website.
    // Such a room used to have no door at all.
    const empty = H([room('calling', { inside_count: 0, live_since: '2026-11-02T15:00:00.000Z' })]);
    expect(orderedDoors(empty).map((d) => `${d.roomId}:${d.state}`)).toEqual(['calling:live']);
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

  it('signs: "n here" for presence, "Booked · Wed 10:00 AM" (Central), "Available"', () => {
    // "inside" overclaimed. These people have a browser tab open; no call is running,
    // so the sign must not imply one.
    const [f, l, b, fr] = hallwayDoors(h) as Door[];
    expect(doorSign(f)).toBe('2 here');
    expect(doorSign(l)).toBe('5 here');
    expect(doorSign(b)).toBe('Booked · Wed 10:00 AM');
    expect(doorSign(fr)).toBe('Available');
  });

  it('only a running meeting gets the live dot', () => {
    const [live, alone] = hallwayDoors(H([
      room('a', { inside_count: 4, live_since: '2026-11-02T15:00:00.000Z' }),
      room('b', { inside_count: 0, live_since: '2026-11-02T15:00:00.000Z' }),
    ])) as Door[];
    expect(doorSign(live)).toBe('● Live · 4 here');
    expect(doorSign(alone)).toBe('● Live now');
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
    expect(q('[data-testid="cm-door-1"]')!.textContent).toContain('2 here');
    act(() => { (q('[data-testid="cm-door-1"]') as HTMLButtonElement).click(); });
    expect(seen).toEqual([{ mode: 'peek', roomId: 'f' }]);
    window.removeEventListener(MEET_SHEET_EVENT, on);
  });

  it('the board reports PEOPLE when no meeting is running, and Join goes to the room page', () => {
    // THE HEADLINE DEFECT: this said "2 open now" for two rooms in which nothing was
    // happening, because two people had a page open. It must not claim a call.
    const opened: string[] = [];
    render(<HallwayBoard hallway={h} onOpen={(r) => opened.push(r)} />);
    expect(q('[data-testid="cm-board-title"]')!.textContent).toBe('Meeting rooms · 3 people here');
    act(() => { (q('[data-testid="cm-board-room-f"] button') as HTMLButtonElement).click(); });
    expect(opened).toEqual(['/portal/rooms/f']);
  });

  it('the board says "live now" only once a meeting has actually started', () => {
    render(<HallwayBoard hallway={H([room('f', { inside_count: 3, live_since: '2026-11-02T15:00:00.000Z' })])} onOpen={() => undefined} />);
    expect(q('[data-testid="cm-board-title"]')!.textContent).toBe('Meeting rooms · 1 room live now');
  });

  it('C117: an empty hallway says so as a body line (not a headline the screen clipped), with + New room and Book a session', () => {
    render(<HallwayBoard hallway={H([])} onOpen={() => undefined} />);
    const empty = q('[data-testid="cm-board-empty"]')!;
    expect(empty.tagName).toBe('P');
    expect(empty.className).toBe('cm-hall-empty');
    expect(empty.textContent).toBe('Nobody is in a room right now. Open one, or book one for later.');
    expect(q('[data-testid="cm-board-new-room"]')).not.toBeNull();
    expect(q('[data-testid="cm-board-book-room"]')).not.toBeNull();
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

describe('the timetable reaches the door', () => {
  const door1 = (h: Hallway): Door => ({ ...orderedDoors(h)[0], n: 1 });

  it('a scheduled room outranks a busier room with nothing scheduled', () => {
    // The complaint was that the panel named a meeting that was not in the room being
    // looked at. The room the session is actually in now reads first.
    const h = H([room('busy', { inside_count: 9 }), room('standup', { session: sess() })]);
    expect(orderedDoors(h).map((d) => `${d.roomId}:${d.state}`)).toEqual(['standup:in_session', 'busy:occupied']);
  });

  it('a RUNNING call still outranks a scheduled session', () => {
    // A started meeting is the thing happening; the timetable only says one is due.
    const h = H([room('standup', { session: sess() }), room('calling', { live_since: '2026-11-02T15:02:00.000Z' })]);
    expect(orderedDoors(h).map((d) => `${d.roomId}:${d.state}`)).toEqual(['calling:live', 'standup:in_session']);
  });

  it('a room that is both live and scheduled reads as live, once', () => {
    const h = H([room('standup', { session: sess(), live_since: '2026-11-02T15:02:00.000Z' })]);
    expect(orderedDoors(h).map((d) => `${d.roomId}:${d.state}`)).toEqual(['standup:live']);
  });

  it('shows a scheduled room nobody has arrived in yet', () => {
    // The whole point: at 8:50 there is no presence and no call, and this is exactly
    // when someone opens the campus looking for the room.
    const h = H([room('standup', { session: sess({ in_progress: false }) })]);
    expect(orderedDoors(h)).toHaveLength(1);
    expect(door1(h).insideCount).toBe(0);
  });

  it('the door says what is happening, not just that something is', () => {
    const running = H([room('standup', { session: sess() })]);
    expect(doorSign(door1(running))).toBe('◆ In session');
    const withPeople = H([room('standup', { session: sess(), inside_count: 4 })]);
    expect(doorSign(door1(withPeople))).toBe('◆ In session · 4 here');
  });

  it('names the start time in CENTRAL before the session begins', () => {
    // 15:00Z on 2026-11-02 is 9:00 AM Central (CST). A UTC render would say 3:00 PM.
    const soon = H([room('standup', { session: sess({ in_progress: false }) })]);
    expect(doorSign(door1(soon))).toBe('Starts 9:00 AM');
  });

  it('uses a different marker from live, so the two cannot be confused', () => {
    const live = H([room('x', { live_since: '2026-11-02T15:02:00.000Z' })]);
    const scheduled = H([room('y', { session: sess() })]);
    expect(doorSign(door1(live))).toContain('●');
    expect(doorSign(door1(scheduled))).toContain('◆');
    expect(doorSign(door1(scheduled))).not.toContain('●');
  });

  it('the row names the SESSION, not the room tagline', () => {
    const h = H([room('standup', { sub: 'Some room tagline', session: sess({ title: 'Intern standup' }) })]);
    expect(rowLine(door1(h))).toBe('Intern standup · In session');
    const soon = H([room('standup', { sub: 'tagline', session: sess({ in_progress: false }) })]);
    expect(rowLine(door1(soon))).toBe('Intern standup · Starts 9:00 AM');
  });

  it('KEEPS the join button for a scheduled room', () => {
    // The regression this guards: adding a state without adding it to canJoin removes
    // the button from the one room everyone was told to be in.
    expect(canJoin({ state: 'in_session' })).toBe(true);
    expect(canJoin({ state: 'live' })).toBe(true);
    expect(canJoin({ state: 'occupied' })).toBe(true);
    expect(canJoin({ state: 'booked' })).toBe(false);
    expect(canJoin({ state: 'idle' })).toBe(false);
  });

  it('the board reports a scheduled session rather than counting browser tabs', () => {
    const h = H([room('standup', { session: sess() }), room('busy', { inside_count: 7 })]);
    expect(boardSummary(h)).toEqual({ count: 1, label: 'session scheduled now' });
  });

  it('the board still prefers a running call over a scheduled one', () => {
    const h = H([room('standup', { session: sess() }), room('calling', { live_since: '2026-11-02T15:02:00.000Z' })]);
    expect(boardSummary(h)).toEqual({ count: 1, label: 'room live now' });
  });

  it('pluralises the scheduled count', () => {
    const h = H([room('a', { session: sess() }), room('b', { session: sess({ title: 'AI Session' }) })]);
    expect(boardSummary(h)).toEqual({ count: 2, label: 'sessions scheduled now' });
  });

  it('orders two scheduled rooms by start time, soonest first', () => {
    const h = H([
      room('later', { session: sess({ title: 'Later', start_at: '2026-11-02T16:00:00.000Z' }) }),
      room('sooner', { session: sess({ title: 'Sooner', start_at: '2026-11-02T15:00:00.000Z' }) }),
    ]);
    expect(orderedDoors(h).map((d) => d.roomId)).toEqual(['sooner', 'later']);
  });

  it('changes nothing for a hallway with no scheduled sessions', () => {
    const h = H([room('busy', { inside_count: 3 }), room('mine', { mine: true })]);
    expect(orderedDoors(h).map((d) => `${d.roomId}:${d.state}`)).toEqual(['busy:occupied', 'mine:idle']);
    expect(boardSummary(h)).toEqual({ count: 3, label: 'people here' });
  });
});
