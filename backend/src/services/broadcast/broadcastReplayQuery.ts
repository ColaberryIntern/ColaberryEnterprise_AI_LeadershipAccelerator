import { Op } from 'sequelize';
import BroadcastOccurrence from '../../models/BroadcastOccurrence';
import type { DiscoverableOccurrence } from './broadcastDiscovery';
import { findSessionIds } from './broadcastActiveQuery';

/**
 * The "what can I watch back" read (L8.3).
 *
 * Deliberately a SIBLING of `findActiveOccurrences` rather than a widening of it. That query
 * asks a question with a bounded answer — a partial UNIQUE index permits one airing per room,
 * so "what is live" is a handful of rows and is polled every 45 seconds by every open tab.
 * A replay list grows for the life of the product and is read when somebody opens a page. Same
 * shape, different economics, and folding them together would mean the ticker inherits a query
 * that scans a year of classes.
 *
 * ONLY WHAT CAN ACTUALLY PLAY IS LISTED, and that is the whole reason this ticket waited on
 * L8.4. A `replay_ready` occurrence with no bound recording produces a signed url that resolves
 * to nothing: the entry looks real, the click fails, and the student concludes the recording is
 * lost. The ticket says it plainly — built on the original premise, every entry in the list
 * would 404. So the binding is part of the WHERE clause, not an afterthought at render time.
 *
 * `ended` and `processing` are excluded for the same reason `backstage` is excluded from the
 * active list: they are states on the way to somewhere, not states a viewer should be offered.
 * `broadcastEntitlement` already answers `not_watchable` for both, so listing them would offer
 * a row that refuses itself on click.
 */
export const REPLAY_DISCOVERY_STATES = ['replay_ready'] as const;

const COLUMNS = [
  'id', 'title', 'room_id', 'access_mode', 'editorial_state',
  'scheduled_start_at', 'content_started_at', 'ended_at', 'preview_seconds',
] as const;

/**
 * A page, not a feed.
 *
 * Unlike the active list this has no natural ceiling, so the limit is a ceiling. It bounds the
 * QUERY; the retention window below bounds the POLICY, and the two are not the same thing — a
 * busy room can air more than twenty-five classes inside the window, and a quiet one fewer than
 * twenty-five in a year.
 */
export const REPLAY_DISCOVERY_LIMIT = 25;

/**
 * How long a class stays watchable back. **Ali's decision, 27 Oct 2026: 25 days.**
 *
 * The ticket asked "what appears in the list and for how long" and the code had no answer to
 * the second half: the row cap bounded size, not age, so a class from a year ago stayed listed
 * until twenty-five newer ones displaced it. This is the policy.
 *
 * A CONSTANT, NOT AN ENV KNOB. The discovery poll cadence is env-tunable because an operator
 * needs to slow every client mid-incident without a deploy. Retention is not an incident lever;
 * it is a commitment to students that interacts with billing, and it belongs somewhere a reader
 * can see it and a diff can record changing it.
 *
 * WHAT IT COSTS, recorded because it is a real consequence rather than a detail: 25 days is
 * shorter than a cohort's term, so a student revisiting Week 2 during Week 8 will not find it.
 * The ticket's stated objective is learning continuity, and this window serves "I missed last
 * week" rather than "let me rewatch the course". Changing it is this one number.
 */
export const REPLAY_RETENTION_DAYS = 25;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The oldest `ended_at` still listed.
 *
 * Takes `nowMs` rather than reading the clock, and is exported, because a retention boundary
 * that cannot be tested at a chosen instant cannot be tested at all. The repo's date rule also
 * forbids a `Date.now()` at module scope — a cutoff frozen at import would drift further from
 * correct for every hour the process stayed up.
 */
export function replayRetentionCutoff(nowMs: number): Date {
  return new Date(nowMs - REPLAY_RETENTION_DAYS * DAY_MS);
}

export type ReplayOccurrence = DiscoverableOccurrence & {
  preview_seconds: number;
  /** When it finished. The only sensible sort key for a list of past classes. */
  ended_at: Date | null;
};

export async function findReplayOccurrences(
  limit: number = REPLAY_DISCOVERY_LIMIT,
  nowMs: number = Date.now(),
): Promise<ReplayOccurrence[]> {
  const rows = await BroadcastOccurrence.findAll({
    where: {
      editorial_state: { [Op.in]: REPLAY_DISCOVERY_STATES as unknown as string[] },
      // The L8.4 join. Without a bound recording there is nothing to sign, so the row is not a
      // replay yet however finished the class is.
      provider_instance_uuid: { [Op.ne]: null },
      // The retention window, enforced in the QUERY for the same reason the recording binding
      // is: a row filtered out after the fact is a row that was still read, still sorted and
      // still counted against the limit, so an expired class could push a live one off the
      // page. A NULL ended_at cannot be aged and so cannot be shown to be inside the window —
      // `Op.gte` excludes it, which is the fail-closed answer and the right one for a policy
      // that touches billing. `ended_at` has been written since L7.4, so this only concerns
      // rows that predate it.
      ended_at: { [Op.gte]: replayRetentionCutoff(nowMs) },
    },
    attributes: COLUMNS as unknown as string[],
    // Most recent first: somebody looking for a replay is looking for the class they just
    // missed, not the first one of the course.
    order: [['ended_at', 'DESC']],
    limit,
  });

  const sessions = await findSessionIds(rows.map((row) => row.id));

  // Mapped explicitly rather than spread, for the same reason the active query does it: the
  // values live behind getters on the Sequelize prototype, so a spread loses every column.
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    room_id: row.room_id,
    access_mode: row.access_mode,
    editorial_state: row.editorial_state,
    scheduled_start_at: row.scheduled_start_at,
    content_started_at: row.content_started_at,
    ended_at: row.ended_at,
    preview_seconds: row.preview_seconds,
    session_id: sessions.get(row.id) ?? null,
  }));
}
