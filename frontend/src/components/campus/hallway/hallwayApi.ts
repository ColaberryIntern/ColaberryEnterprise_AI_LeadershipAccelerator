import portalApi from '../../../utils/portalApi';
import { createBooking, createRoom, inviteToRoom, type RoomPrivacy } from '../../../services/roomsApi';

/**
 * The Meeting Rooms hallway (Basecamp C29, v7 R2). Reading: GET /api/portal/campus/hallway (backend services/campus/campusHallway.ts).
 * Writing never goes through the campus: "+ New room" and "Book a session" call the existing Community Rooms endpoints that back
 * the same buttons on /portal/rooms (createRoom, createBooking, inviteToRoom), so a room is never faked. The sheet opener is a
 * window event, like the admissions booking sheet: the board, the doors and the arrival card all open the one host.
 */
export interface HallwayPerson { enrollment_id: string; display_name: string; avatar_url: string | null; friend: boolean }
export interface HallwayRoom {
  room_id: string; name: string; sub: string; emoji: string | null; privacy: string; mine: boolean;
  inside_count: number; inside: HallwayPerson[];
}
export interface HallwayBooking { booking_id: string; room_id: string; title: string; start_at: string; end_at: string | null; state: string; hosting: boolean }
export interface Hallway { rooms: HallwayRoom[]; bookings: HallwayBooking[]; reese_id: string | null }

export async function fetchHallway(): Promise<Hallway> {
  return (await portalApi.get<Hallway>('/api/portal/campus/hallway')).data;
}

/**
 * The sheet's "Who can join" choices and the room privacy each one creates. The spec's "Anyone on campus" is not offered: the
 * rooms service lets only staff create public rooms and quietly makes a learner's private, so the choice would be a false promise.
 * "Invite only" is the rooms page's own 'private' (invite only).
 */
export const WHO_CAN_JOIN: { label: string; privacy: RoomPrivacy }[] = [
  { label: 'Cohort', privacy: 'cohort' }, { label: 'Invite only', privacy: 'private' },
];

/** + New room: creates the room (existing endpoint), then invites the picked people. Returns the new room's id. */
export async function openNewRoom(name: string, privacy: RoomPrivacy, invite: string[]): Promise<string> {
  const room = await createRoom({ name, privacy, category: 'build_together', is_video: true });
  if (invite.length) await inviteToRoom(room.id, invite);
  return room.id;
}

/** Book a session: books a room for later (existing endpoint; idempotent on the key, so a double tap books once), then invites. */
export async function bookSession(input: { title: string; privacy: RoomPrivacy; startIso: string; endIso: string; invite: string[]; key: string }): Promise<{ roomId: string; bookingId: string }> {
  const b = await createBooking({ title: input.title, variant: 'study', privacy: input.privacy, start_at: input.startIso, end_at: input.endIso, timezone: 'America/Chicago', idempotency_key: input.key });
  if (input.invite.length) await inviteToRoom(b.room_id, input.invite);
  return { roomId: b.room_id, bookingId: b.id };
}

export const HALLWAY_CHANGED_EVENT = 'cm-hallway-changed';
export const MEET_SHEET_EVENT = 'cm-meet-sheet';
export type MeetSheetMode = 'peek' | 'new' | 'book';
export interface MeetSheetOpen { mode: MeetSheetMode; roomId?: string }

export function hallwayChanged(): void {
  try { window.dispatchEvent(new CustomEvent(HALLWAY_CHANGED_EVENT)); } catch { /* non-DOM environment */ }
}
export function openMeetSheet(open: MeetSheetOpen): void {
  try { window.dispatchEvent(new CustomEvent<MeetSheetOpen>(MEET_SHEET_EVENT, { detail: open })); } catch { /* non-DOM environment */ }
}
export function onMeetSheet(cb: (open: MeetSheetOpen) => void): () => void {
  const h = (e: Event) => { const d = (e as CustomEvent<MeetSheetOpen>).detail; if (d) cb(d); };
  window.addEventListener(MEET_SHEET_EVENT, h);
  return () => window.removeEventListener(MEET_SHEET_EVENT, h);
}
