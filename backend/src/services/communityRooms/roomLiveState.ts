/**
 * Whether a meeting is actually happening in a room.
 *
 * ── WHAT "OPEN NOW" USED TO MEAN ───────────────────────────────────────────────
 * The campus hallway called a room open when `inside_count > 0`, and `inside_count`
 * counts fresh `room_presence` heartbeats — which the room PAGE writes every 30
 * seconds while it is open in a browser. So "2 OPEN NOW" meant two people had a tab
 * open. A full Zoom call with nobody on the web page read as closed, and six idle
 * tabs read as a live session. `room_presence.in_video` exists for exactly this
 * distinction and is written `false` by its only caller.
 *
 * Nothing in the platform ever learned that a meeting started: the sole Zoom webhook
 * handled was `recording.completed`, which arrives long after everyone has left.
 *
 * ── WHERE THE TRUTH COMES FROM ─────────────────────────────────────────────────
 * Zoom's `meeting.started` / `meeting.ended` events, through the existing webhook
 * endpoint — signature verification, replay-window freshness and occurrence-keyed
 * delivery ids are already built and are not re-invented here.
 *
 * ── AN UNCLOSED MEETING MUST NOT STAY LIVE FOREVER ─────────────────────────────
 * The dangerous failure is a `meeting.ended` that never arrives: a dropped delivery,
 * a redeploy mid-meeting, a Zoom outage. Trusting stored state indefinitely would
 * reproduce the original defect in a new place — a room claiming to be live with
 * nobody in it, which is precisely the lie this module exists to end. So liveness
 * EXPIRES ON READ. A started-at older than `MAX_LIVE_MS` reads as not live, whatever
 * the stored row says, and the state self-heals without anyone intervening.
 *
 * ── OUT-OF-ORDER DELIVERIES ────────────────────────────────────────────────────
 * Zoom does not guarantee order, and an `ended` for a meeting that finished an hour
 * ago can land after the `started` for the one running now. Every event therefore
 * carries its occurrence uuid, and an `ended` clears the room only when it names the
 * occurrence currently recorded. Clearing on any `ended` would let a late delivery
 * switch off a call that is genuinely in progress.
 */

/** Longer than any real session, short enough that a missed `ended` heals the same day. */
export const MAX_LIVE_MS = 6 * 60 * 60 * 1000;

/** Where liveness is recorded on the room. JSONB, so no migration. */
export const LIVE_METADATA_KEY = 'live';

export interface RoomLive {
  /** The Zoom occurrence this liveness belongs to. The arbiter for out-of-order events. */
  occurrence_uuid: string;
  meeting_id: string;
  /** ISO 8601, when the meeting started. */
  since: string;
}

export type ZoomLiveEvent =
  | { kind: 'started'; occurrenceUuid: string; meetingId: string; atMs: number }
  | { kind: 'ended'; occurrenceUuid: string; meetingId: string; atMs: number };

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

function readLive(metadata: unknown): RoomLive | null {
  const raw = (metadata as Record<string, unknown> | null | undefined)?.[LIVE_METADATA_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const live = raw as Partial<RoomLive>;
  if (typeof live.since !== 'string' || !live.since) return null;
  return {
    occurrence_uuid: String(live.occurrence_uuid ?? ''),
    meeting_id: String(live.meeting_id ?? ''),
    since: live.since,
  };
}

/**
 * Is this recorded liveness still believable?
 *
 * Pure, and deliberately separate from reading it: the expiry rule is the part that
 * has to be right, and it is tested without a database anywhere near it.
 */
export function isStillLive(live: RoomLive | null, now: Date = new Date()): boolean {
  if (!live) return false;
  const since = Date.parse(live.since);
  if (!Number.isFinite(since)) return false;
  // A start in the future is a clock problem, not a live meeting. Treating it as live
  // would pin the room open until the skew exceeded the window.
  if (since > now.getTime()) return false;
  return now.getTime() - since <= MAX_LIVE_MS;
}

/**
 * The liveness a room should hold after this event, or `null` for not live.
 *
 * Pure. Returns the CURRENT value unchanged when the event changes nothing, so the
 * caller can skip a pointless write.
 */
export function nextLiveState(current: RoomLive | null, event: ZoomLiveEvent): RoomLive | null {
  if (event.kind === 'started') {
    // A repeat of the same occurrence must not move `since` — a Zoom retry would
    // otherwise extend the meeting's apparent start and defeat the expiry above.
    if (current && current.occurrence_uuid === event.occurrenceUuid) return current;
    return {
      occurrence_uuid: event.occurrenceUuid,
      meeting_id: event.meetingId,
      since: new Date(event.atMs).toISOString(),
    };
  }
  // 'ended' — only the occurrence that is actually recorded may end it.
  if (!current) return null;
  if (current.occurrence_uuid !== event.occurrenceUuid) return current;
  return null;
}

/** True when the stored value would change, so an unchanged event costs no write. */
export function wouldChange(current: RoomLive | null, next: RoomLive | null): boolean {
  if (current === next) return false;
  if (!current || !next) return true;
  return current.occurrence_uuid !== next.occurrence_uuid || current.since !== next.since;
}

/**
 * Record a Zoom liveness event against a room.
 *
 * IDEMPOTENT by construction: `nextLiveState` returns the current value for a repeat
 * delivery and `wouldChange` then skips the write, so Zoom's own retries cost nothing
 * and cannot move a meeting's start time.
 *
 * Returns what the room now holds, for the caller to log.
 */
export async function applyZoomLiveEvent(roomId: string, event: ZoomLiveEvent): Promise<RoomLive | null> {
  const sequelize = await db();
  const [rows] = await sequelize.query(
    'SELECT metadata FROM community_rooms WHERE id = :id',
    { replacements: { id: roomId } },
  ) as [Array<{ metadata: unknown }>, unknown];
  if (!rows?.length) return null;

  const current = readLive(rows[0].metadata);
  const next = nextLiveState(current, event);
  if (!wouldChange(current, next)) return current;

  if (next) {
    await sequelize.query(
      `UPDATE community_rooms
          SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(:key, CAST(:live AS jsonb)),
              updated_at = NOW()
        WHERE id = :id`,
      { replacements: { id: roomId, key: LIVE_METADATA_KEY, live: JSON.stringify(next) } },
    );
  } else {
    await sequelize.query(
      `UPDATE community_rooms
          SET metadata = COALESCE(metadata, '{}'::jsonb) - :key,
              updated_at = NOW()
        WHERE id = :id`,
      { replacements: { id: roomId, key: LIVE_METADATA_KEY } },
    );
  }
  return next;
}

/**
 * When this room's meeting started, or `null` if no meeting is running.
 *
 * Takes metadata the caller already has rather than querying: the hallway loads every
 * room row anyway, so liveness costs no additional round trip.
 */
export function liveSince(metadata: unknown, now: Date = new Date()): string | null {
  const live = readLive(metadata);
  return isStillLive(live, now) ? live!.since : null;
}
