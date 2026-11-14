/**
 * What Zoom actually stored for a meeting, compared with what we asked for.
 *
 * ── THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────────
 * On 2026-11-02 two persistent rooms were minted in the same second, by the same
 * code, asking for the same settings. One came back `waiting_room: false` and one
 * came back `waiting_room: true`. A waiting room overrides join-before-host, so the
 * second room could only be opened by the host account itself — and nobody signs in
 * as a pool host. The room was `always_open: true` and permanently shut. It was not
 * discovered by a monitor; it was discovered by Ali being unable to start a class in
 * front of the people who had turned up for it.
 *
 * `createMeeting` had always ASKED for `waiting_room: false, join_before_host: true`
 * and never once looked at the answer. A host account may force a waiting room on,
 * and when it does Zoom accepts the request, ignores that field, and returns 201.
 * The same quirk was already known for `auto_recording` and noted in a comment —
 * acknowledged in prose, enforced nowhere. This module is the enforcement.
 *
 * ── ABSENCE OF EVIDENCE IS NOT EVIDENCE ───────────────────────────────────────
 * Every function here distinguishes three answers, never two: it applied, it did not
 * apply, and we cannot tell. A response that carries no `settings` block at all must
 * not be read as a failure, or a Zoom API change would take down every room mint on
 * the platform at once. `null` means unknown and callers are expected to degrade to
 * today's behaviour, loudly.
 *
 * PURE. No I/O, no ORM, no clock. The judgement is the part worth testing and the
 * HTTP around it is not.
 */

/**
 * The settings fields this codebase cares about on a meeting Zoom has stored.
 *
 * Deliberately open-ended: Zoom returns dozens of fields and adds more over time, and
 * a closed type would mean this file had to change every time one of them mattered
 * somewhere else.
 */
export interface ZoomStoredSettings {
  waiting_room?: boolean;
  join_before_host?: boolean;
  auto_recording?: string;
  [key: string]: unknown;
}

export interface SettingMismatch {
  setting: string;
  requested: unknown;
  stored: unknown;
}

/**
 * The settings a persistent, always-open room cannot work without.
 *
 * Named rather than written inline at the mint site because this is the definition of
 * "enterable", and a room link that does not satisfy it is a dead link no matter how
 * successful the API call looked.
 */
export const OPEN_ROOM_REQUIRED_SETTINGS = Object.freeze({
  waiting_room: false,
  join_before_host: true,
});

/**
 * Which of the settings we asked for did not come back the way we asked.
 *
 * Only fields present in BOTH sides are judged. A field Zoom did not return is
 * unverifiable, not wrong — see the header. Fields Zoom returned that we never asked
 * about are none of our business and are ignored, so this does not become a diff of
 * Zoom's entire settings object.
 */
export function settingsMismatches(
  requested: Readonly<Record<string, unknown>> | null | undefined,
  stored: ZoomStoredSettings | null | undefined,
): SettingMismatch[] {
  if (!requested || !stored) return [];
  const out: SettingMismatch[] = [];
  for (const [setting, want] of Object.entries(requested)) {
    if (want === undefined) continue;
    if (!(setting in stored)) continue;
    const got = stored[setting];
    if (got !== want) out.push({ setting, requested: want, stored: got });
  }
  return out;
}

/**
 * Can a participant get into this meeting when the host is not there?
 *
 * `true` yes, `false` no, `null` Zoom did not tell us enough to say.
 *
 * A WAITING ROOM BEATS JOIN-BEFORE-HOST. Both can be on at once, and people reading
 * only `join_before_host: true` conclude the room is open; it is not, because
 * everyone who arrives is parked in the waiting room until a host admits them. That
 * misreading is exactly how a room with `join_before_host: true` sat unusable for
 * eleven days, so the waiting room is checked first and on its own.
 *
 * A missing `join_before_host` is NOT assumed to be fine. Zoom's own default for it
 * varies by account, and `support@colaberry.com` carries it off — a second way to
 * mint a room nobody can enter, with no waiting room involved at all.
 */
export function isEnterableWithoutHost(
  stored: ZoomStoredSettings | null | undefined,
): boolean | null {
  if (!stored) return null;
  if (stored.waiting_room === true) return false;
  if (stored.join_before_host === false) return false;
  if (stored.waiting_room === false && stored.join_before_host === true) return true;
  return null;
}

/**
 * A one-line reason for a log or a `last_error` column, never for a user.
 *
 * Says which setting made it unenterable rather than "verification failed", because
 * the two causes need different fixes: a forced waiting room is a host-account toggle,
 * and join-before-host off is a different one on a different page.
 */
export function unenterableReason(stored: ZoomStoredSettings | null | undefined): string {
  if (stored?.waiting_room === true) {
    return 'host forces a waiting room on, so nobody can enter until the host signs in';
  }
  if (stored?.join_before_host === false) {
    return 'host has join-before-host off, so nobody can enter until the host signs in';
  }
  return 'zoom did not return enough settings to prove the meeting is enterable';
}

/**
 * Thrown when a meeting that HAD to be enterable came back unenterable.
 *
 * Carries `error_class` so it classifies in the structured logs the same way every
 * other typed failure in this codebase does, and carries the host so the failover can
 * demote exactly the account that produced it.
 */
export class ZoomMeetingNotEnterableError extends Error {
  readonly error_class = 'ZoomMeetingNotEnterable';

  readonly hostEmail: string;

  readonly meetingId: string | null;

  readonly stored: ZoomStoredSettings | null;

  constructor(hostEmail: string, meetingId: string | null, stored: ZoomStoredSettings | null) {
    super(`Zoom meeting minted under ${hostEmail} is not enterable: ${unenterableReason(stored)}`);
    this.name = 'ZoomMeetingNotEnterableError';
    this.hostEmail = hostEmail;
    this.meetingId = meetingId;
    this.stored = stored ?? null;
  }
}
