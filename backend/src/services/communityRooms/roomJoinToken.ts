import { randomBytes } from 'crypto';

/**
 * A ROOM'S STABLE JOIN ADDRESS, so a calendar invite never has to be edited again.
 *
 * THE PROBLEM THIS EXISTS FOR. A room's Zoom link lives in three places: the
 * database (which `ensureInternshipMeetingRooms()` keeps in step with the cohort
 * schedule), a Google Calendar invite, and — in practice — somebody's personal
 * meeting room. Nothing syncs the calendar. On 2026-11-03 the recurring Tuesday
 * invite was found carrying the OLD public room in its location field and a
 * PERSONAL meeting room in its body, neither of them the room the portal served,
 * a disagreement that had stood since 2026-09-16 and that no code change could
 * have fixed. Re-minting a room changes its join URL, so every re-mint silently
 * stales every invite pointing at the old one.
 *
 * A token indirects that. The invite holds a URL that never changes; the link it
 * resolves to is read fresh on every click.
 *
 * THE TOKEN IS THE AUTHORIZATION, which is why nothing here consults the room's
 * `privacy`. The redirect has to work for someone opening a calendar invite, and
 * a calendar attendee is not logged in — an auth-gated redirect would be useless
 * for the one job it has. The exposure is therefore equivalent to the raw Zoom
 * link that sits in the invite body today, and strictly better than it: the link
 * behind the token can be rotated without touching the invite, and the token can
 * be rotated without touching the room.
 *
 * Minting is explicit per room (see `scripts/mintRoomJoinToken.ts`) rather than
 * backfilled across every room, so no room acquires a public address by accident.
 */

/** Where the token lives on `community_rooms.metadata`. */
export const ROOM_JOIN_TOKEN_KEY = 'join_token';

/** Mounted path. `rooms/join/` cannot collide with `/api/public/portfolio/:token`. */
export const ROOM_JOIN_PATH_PREFIX = '/api/public/rooms/join';

/** 128 bits, hex. Long enough that guessing is not a threat model. */
export function generateJoinToken(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Shape check, run before the token reaches a query. A token is an address, not
 * free text; rejecting a malformed one here keeps anything odd away from the
 * database rather than relying on the parameterised bind alone.
 */
export function isJoinTokenShape(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
}

/** The token stored on a room, or null when it has none. */
export function readJoinToken(metadata: Record<string, unknown> | null | undefined): string | null {
  const raw = metadata ? metadata[ROOM_JOIN_TOKEN_KEY] : undefined;
  return isJoinTokenShape(raw) ? raw : null;
}

/** The paste-into-a-calendar-invite URL. */
export function joinUrlForToken(origin: string, token: string): string {
  return `${String(origin).replace(/\/+$/, '')}${ROOM_JOIN_PATH_PREFIX}/${token}`;
}

/** The minimum of a room this module needs; keeps the logic free of Sequelize. */
export interface JoinableRoom {
  status?: string | null;
  meeting_link?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type RoomJoinRefusal =
  | 'bad_token_shape'
  | 'no_such_token'
  | 'token_mismatch'
  | 'room_not_active'
  | 'no_meeting_link';

export type RoomJoinResolution =
  | { ok: true; joinUrl: string }
  | { ok: false; reason: RoomJoinRefusal };

/**
 * Decide where a token sends someone. Pure: the caller does the lookup, this
 * decides, and the route turns every refusal into the same 404.
 *
 * `token_mismatch` cannot happen if the lookup queried on the token — which is
 * exactly why it is checked. A lookup that returned the wrong room would
 * otherwise redirect someone into a room they hold no token for, and the bug
 * would look like a working redirect.
 */
export function resolveRoomJoin(room: JoinableRoom | null | undefined, token: unknown): RoomJoinResolution {
  if (!isJoinTokenShape(token)) return { ok: false, reason: 'bad_token_shape' };
  if (!room) return { ok: false, reason: 'no_such_token' };

  const stored = readJoinToken(room.metadata);
  if (!stored) return { ok: false, reason: 'no_such_token' };
  if (stored !== token) return { ok: false, reason: 'token_mismatch' };

  // Only a live room. An archived, locked or removed room keeping a working
  // public address is a way back into a space someone closed on purpose.
  if (room.status !== 'active') return { ok: false, reason: 'room_not_active' };

  const link = typeof room.meeting_link === 'string' ? room.meeting_link.trim() : '';
  if (!link) return { ok: false, reason: 'no_meeting_link' };

  return { ok: true, joinUrl: link };
}
