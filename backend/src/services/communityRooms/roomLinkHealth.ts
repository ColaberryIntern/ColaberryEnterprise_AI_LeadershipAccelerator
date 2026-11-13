/**
 * Is a stored always-open room's Zoom link still a real meeting?
 *
 * Found live 2026-11-13 (AI Friday): a hand-entered Zoom link pointed at a meeting
 * Zoom no longer had ("Invalid meeting ID"), and nothing in the platform could tell.
 * Rooms store one link forever (roomService.joinVideoRoom), so a deleted or expired
 * meeting would strand everyone who clicks Join the same way.
 *
 * Three answers, and only one of them licenses replacing a link:
 *   - 'alive'   Zoom returned the meeting.
 *   - 'dead'    Zoom answered 404 / code 3001 "Meeting does not exist". The link
 *               already leads nowhere, so replacing it moves nobody.
 *   - 'unknown' Anything else: not a Zoom link, Zoom not configured, timeout, 5xx,
 *               auth/scope error. Callers MUST keep the stored link on 'unknown';
 *               a Zoom outage must never cause a working link to be swapped.
 *
 * Failure modes handled: Zoom down/slow (bounded by zoomApiClient's request
 * timeout, answered 'unknown'), missing scope (403, 'unknown'), non-Zoom links.
 * Not handled: a meeting that exists but is locked/ended by its host (Zoom still
 * returns it, so it reads 'alive').
 *
 * 'alive' answers are cached per process for ALIVE_TTL_MS so a busy room does not
 * cost one Zoom call per click. 'dead' and 'unknown' are never cached.
 */
import { extractZoomMeetingId, getMeetingJoinUrl, isZoomConfigured } from '../zoomService';
import { log } from './roomShared';

export type RoomLinkStatus = 'alive' | 'dead' | 'unknown';

export const ALIVE_TTL_MS = 10 * 60 * 1000;

const aliveUntil = new Map<string, number>();

/** Test-only: forget cached 'alive' answers. */
export function __resetRoomLinkHealthCacheForTests(): void {
  aliveUntil.clear();
}

/** True only for Zoom's explicit "this meeting does not exist" answer. */
export function isMeetingGoneError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Zoom API error 404\b/.test(msg) && /"code"\s*:\s*3001\b/.test(msg);
}

export async function checkRoomLink(link: string, now: number = Date.now()): Promise<RoomLinkStatus> {
  const meetingId = extractZoomMeetingId(link);
  if (!meetingId || !isZoomConfigured()) return 'unknown';

  const cachedUntil = aliveUntil.get(meetingId);
  if (cachedUntil !== undefined && cachedUntil > now) return 'alive';

  try {
    await getMeetingJoinUrl(meetingId);
    aliveUntil.set(meetingId, now + ALIVE_TTL_MS);
    return 'alive';
  } catch (err) {
    aliveUntil.delete(meetingId);
    if (isMeetingGoneError(err)) {
      log('warn', 'room_link_dead', { meeting_id: meetingId });
      return 'dead';
    }
    log('warn', 'room_link_check_inconclusive', {
      meeting_id: meetingId,
      error_class: err instanceof Error && /timeout|abort/i.test(err.message) ? 'TimeoutError' : 'UpstreamUnavailable',
      message: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
    });
    return 'unknown';
  }
}
