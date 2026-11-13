/**
 * ONE EVENT, ONE JOIN (2026-11-13, AI Friday). With a session due in "Colaberry AI
 * Sessions" and one person sitting in "Help Session", the Meeting Rooms board showed
 * two red Join buttons and people could not tell which was the class.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { boardRooms, boardSummary, eventInProgress, showJoin } from '../hallway/hallwayModel';
import { HallwayBoard, HallwayRows } from '../hallway/Hallway';
import type { Hallway, HallwayRoom } from '../hallway/hallwayApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const person = (id: string) => ({ enrollment_id: id, display_name: `Person ${id}`, avatar_url: null, friend: false });
const room = (id: string, o: Partial<HallwayRoom> = {}): HallwayRoom => ({ room_id: id, name: `Room ${id}`, sub: '', emoji: null, privacy: 'cohort', mine: false, inside_count: 0, inside: [], live_since: null, session: null, ...o });
const H = (rooms: HallwayRoom[]): Hallway => ({ rooms, bookings: [], reese_id: 'reese-1' });
const sess = { title: 'AI Friday Trends', start_at: '2026-11-13T15:00:00.000Z', end_at: '2026-11-13T16:00:00.000Z', in_progress: false };

// The exact shape from the screenshot: the event room is scheduled, the help room has one person.
const aiFriday = H([
  room('ai-sessions', { name: 'Colaberry AI Sessions', session: sess }),
  room('help', { name: 'Help Session', inside_count: 1, inside: [person('bk')] }),
]);

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const joinButtons = () => Array.from(container.querySelectorAll('button')).filter((b) => b.textContent?.trim() === 'Join');

describe('one event, one Join', () => {
  it('the board lists only the event room while a session is due', () => {
    expect(eventInProgress(aiFriday)).toBe(true);
    expect(boardRooms(aiFriday).map((d) => d.roomId)).toEqual(['ai-sessions']);
    expect(boardSummary(aiFriday)).toEqual({ count: 1, label: 'session scheduled now' });
  });

  it('a running call also counts as the event', () => {
    const h = H([room('call', { live_since: '2026-11-13T15:00:00.000Z' }), room('help', { inside_count: 2 })]);
    expect(boardRooms(h).map((d) => d.roomId)).toEqual(['call']);
  });

  it('with no event, occupied rooms keep their rows and Joins (unchanged behavior)', () => {
    const h = H([room('a', { inside_count: 2 }), room('b', { inside_count: 1 })]);
    expect(eventInProgress(h)).toBe(false);
    expect(boardRooms(h).map((d) => d.roomId)).toEqual(['a', 'b']);
    expect(showJoin({ state: 'occupied' }, false)).toBe(true);
  });

  it('showJoin: only event rooms while an event is on; never booked/idle', () => {
    expect(showJoin({ state: 'in_session' }, true)).toBe(true);
    expect(showJoin({ state: 'live' }, true)).toBe(true);
    expect(showJoin({ state: 'occupied' }, true)).toBe(false);
    expect(showJoin({ state: 'booked' }, false)).toBe(false);
    expect(showJoin({ state: 'idle' }, false)).toBe(false);
  });

  it('renders exactly one Join on the back-wall board', () => {
    act(() => { root.render(<HallwayBoard hallway={aiFriday} onOpen={() => undefined} />); });
    expect(joinButtons()).toHaveLength(1);
    expect(container.textContent).toContain('Colaberry AI Sessions');
    expect(container.textContent).not.toContain('Help Session');
  });

  it('renders exactly one Join in the arrival card rows; the side room keeps its row', () => {
    act(() => { root.render(<HallwayRows hallway={aiFriday} error={false} onOpen={() => undefined} />); });
    expect(joinButtons()).toHaveLength(1);
    expect(container.textContent).toContain('Help Session');
  });
});
