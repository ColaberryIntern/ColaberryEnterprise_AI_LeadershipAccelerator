/**
 * Mint a persistent room's Zoom link on a host that can actually produce one.
 *
 * ── WHY THIS IS NOT JUST `createMeeting` ──────────────────────────────────────
 * A persistent room is `always_open: true` and no host ever signs in to it. So a
 * meeting that needs its host present is not a degraded room, it is a dead one — and
 * before 2026-11-14 nothing could tell the difference, because the mint reported
 * success on both. On 2026-11-02 that produced a room that was shut for eleven days
 * across three weekly public sessions, discovered when a class could not be started
 * in front of the people who had turned up for it.
 *
 * The fix has three parts and this module is the third. `zoomMeetingSettings` decides
 * what enterable means; `createMeeting` reads back what Zoom stored and refuses to
 * call an unenterable meeting a success; this walks the pool so one bad host costs a
 * retry instead of a room.
 *
 * ── WHY FAIL OVER RATHER THAN FAIL ────────────────────────────────────────────
 * Three of seven pool hosts could not produce an enterable meeting, and the allocator
 * takes them in priority order, so the second host it ever reaches was one of them.
 * Stopping at the first bad host would have failed exactly as badly as not checking.
 * Each failure also demotes the host out of the pool, so the correction is permanent
 * rather than re-paid on every provisioning run.
 *
 * ── BOUNDED, ALWAYS ───────────────────────────────────────────────────────────
 * The walk is capped (CLAUDE.md prohibits unbounded retry) and every pass must either
 * consume a distinct host or stop. A host that has just been demoted cannot be
 * returned by the next `reserveRoomHost`, so the loop cannot spin on one bad account
 * even if the cap were wrong.
 *
 * ── AN EMPTY POOL STILL MEANS "USE THE DEFAULT" ───────────────────────────────
 * `reserveRoomHost` answers `null` when nothing is registered, which is the normal
 * state of a fresh install and must keep meaning "mint under ZOOM_HOST_EMAIL". There
 * is no pool to fail over within that case, so one attempt is made and its result —
 * success or a typed error — is the answer.
 */

import { createMeeting, type CreateZoomMeetingInput, type ZoomMeetingResult } from '../zoomService';
import { releaseRoomHost, reserveRoomHost } from './roomHostAllocator';
import { markHostUnusable } from './zoomHostRegistry';
import { ZoomMeetingNotEnterableError, unenterableReason } from './zoomMeetingSettings';

/**
 * How many hosts the walk will try before giving up.
 *
 * Four, because the live pool is seven and three were bad: a cap below four would
 * have failed on the real production data this was written for, and a cap far above
 * the pool size just means a longer wait for the same answer.
 */
export const MAX_HOST_ATTEMPTS = 4;

export interface MintEnterableRoomLinkInput {
  /** The `community_rooms` row the link belongs to. Its reservation is what moves. */
  roomId: string;
  meeting: Omit<CreateZoomMeetingInput, 'hostEmail' | 'requireEnterableWithoutHost'>;
}

export interface MintEnterableRoomLinkResult {
  result: ZoomMeetingResult;
  /** The host it finally landed on; `null` means the configured default was used. */
  hostEmail: string | null;
  /** Hosts demoted along the way. Empty on the happy path, and worth reporting. */
  demotedHosts: string[];
}

function logDemotion(roomId: string, hostEmail: string, reason: string, attempt: number): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'zoom',
    event: 'zoom_room_host_demoted',
    outcome: 'failure',
    error_class: 'ZoomMeetingNotEnterable',
    context: { room_id: roomId, host_email: hostEmail, attempt, reason },
  }));
}

/**
 * Mints an enterable link for a room, moving it off any host that cannot make one.
 *
 * Throws `ZoomMeetingNotEnterableError` only when every host it was allowed to try
 * produced an unenterable meeting. That is a real outage and must be loud: a room
 * with no link is recoverable, a room with a link nobody can use is not, because
 * nothing downstream ever looks at it again.
 *
 * Any other error from Zoom (timeout, 429, a bad topic) propagates untouched on the
 * first attempt. Those are not host faults and demoting a host for one would empty a
 * working pool during an unrelated outage.
 */
export async function mintEnterableRoomLink(
  input: MintEnterableRoomLinkInput,
): Promise<MintEnterableRoomLinkResult> {
  const demotedHosts: string[] = [];
  let lastError: ZoomMeetingNotEnterableError | null = null;

  for (let attempt = 1; attempt <= MAX_HOST_ATTEMPTS; attempt += 1) {
    // Reserved BEFORE the call, so a sibling room minting in parallel sees this host
    // as taken rather than reading a usage count that does not yet include it.
    const hostEmail = await reserveRoomHost(input.roomId);

    try {
      const result = await createMeeting({
        ...input.meeting,
        ...(hostEmail ? { hostEmail } : {}),
        requireEnterableWithoutHost: true,
      });
      return { result, hostEmail, demotedHosts };
    } catch (err: unknown) {
      if (!(err instanceof ZoomMeetingNotEnterableError)) throw err;
      lastError = err;

      // No pool to walk: the mint used the configured default host, and there is no
      // other host to move to. Reporting this as "ran out of hosts" would send an
      // operator to the registry when the fix is in the default account's settings.
      if (!hostEmail) break;

      const reason = unenterableReason(err.stored);
      await markHostUnusable(hostEmail, `unenterable mint: ${reason}`);
      await releaseRoomHost(input.roomId);
      demotedHosts.push(hostEmail);
      logDemotion(input.roomId, hostEmail, reason, attempt);
    }
  }

  throw lastError
    ?? new ZoomMeetingNotEnterableError('(none)', null, null);
}
