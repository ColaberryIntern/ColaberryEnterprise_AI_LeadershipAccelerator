/**
 * broadcastProducerState — what a producer needs to see before a class goes on air.
 *
 * WHY THIS EXISTS. Starting a broadcast had no control of any kind, and could not have one,
 * because the version every producer command requires was not obtainable before the stream
 * existed. The only endpoint that returned `version` was the playback grant, and on a
 * `scheduled` occurrence `resolvePlaybackTarget` is `'none'`, so it answers 503
 * `ProviderNotReady` with no version at all. Discovery could not fill the gap either:
 * `ACTIVE_DISCOVERY_STATES` is `['live','reconnecting']`, so a scheduled or backstage
 * occurrence is not in it, and its columns never included `version`. Since
 * `enter_backstage` is what makes the health loop start watching for a feed, it has to be
 * sent BEFORE a stream exists — so the first command in the sequence was the one command
 * whose version could not be read. That is the whole reason the procedure was three
 * hand-sent API calls at showtime. See docs/COLABERRY_LIVE_PROGRAM_SPEC.md §9.
 *
 * KEYED ON THE SESSION, NOT THE OCCURRENCE, for the reason broadcastSessionLinks:30 gives
 * about URLs: a producer opens the page for the class they are about to teach, and the
 * occurrence key changes when the show is re-timed or re-created. The caller holds a
 * session id; making it find an occurrence id first would be a second round trip whose only
 * purpose is to satisfy a route shape.
 *
 * THIS MODULE DECIDES NOTHING. Which commands are legal is `describeProducerCommands` in the
 * state machine, derived by running the real rules. This is the I/O half: find the
 * occurrence, project it, and hand the state to the machine.
 */
import { sequelize } from '../../config/database';
import {
  describeProducerCommands,
  type CommandAvailability,
  type EditorialState,
  type EndReason,
  type OccurrenceState,
  type ProducerCommand,
  type ProviderHealth,
} from './broadcastStateMachine';

/** The occurrence facts a producer control needs, and deliberately nothing else. */
export interface ProducerOccurrenceView {
  id: string;
  title: string;
  editorial_state: EditorialState;
  provider_health: ProviderHealth;
  /**
   * The version to send with the next command. Not a secret: the command route already
   * REQUIRES the caller to supply it, so the design always intended the client to hold one.
   * A stale one is the guard working — it answers 409 and the client re-reads.
   */
  version: number;
  content_started_at: string | null;
  ended_at: string | null;
  end_reason: EndReason | null;
  scheduled_start_at: string | null;
}

export interface ProducerStateResult {
  /** False when live was never enabled for this session, which is not an error. */
  found: boolean;
  occurrence: ProducerOccurrenceView | null;
  commands: CommandAvailability[];
}

const NOT_FOUND: ProducerStateResult = { found: false, occurrence: null, commands: [] };

interface OccurrenceRow {
  id: string;
  title: string;
  editorial_state: EditorialState;
  provider_health: ProviderHealth;
  version: number | string;
  content_started_at: Date | string | null;
  ended_at: Date | string | null;
  end_reason: EndReason | null;
  scheduled_start_at: Date | string | null;
}

/**
 * Normalize an instant for the wire.
 *
 * The driver hands back a `Date` for a timestamptz, but a raw query under a different
 * dialect or a stubbed test can hand back the string it read. Both are rendered as ISO-8601
 * rather than passed through, so a client never has to tell which one it got.
 */
function iso(value: Date | string | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * `version` is the one field a command is guarded on, so an unreadable one must not be
 * silently coerced to something a client would then send. `Number()` on a numeric string is
 * exact for every value Postgres can hold in an integer column; anything else is a defect
 * worth surfacing as a thrown error rather than a plausible-looking zero.
 */
function toVersion(value: number | string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n)) {
    throw Object.assign(new Error('occurrence version is not an integer'), {
      error_class: 'ContractViolation',
      status: 500,
    });
  }
  return n;
}

function toState(row: OccurrenceRow, version: number): OccurrenceState {
  return {
    editorial_state: row.editorial_state,
    provider_health: row.provider_health,
    version,
    // The machine compares these for presence and never formats them, so a Date is what it
    // wants; the ISO strings above are for the wire.
    content_started_at: row.content_started_at ? new Date(row.content_started_at) : null,
    ended_at: row.ended_at ? new Date(row.ended_at) : null,
    end_reason: row.end_reason,
  };
}

/**
 * Read the producer-facing state of the broadcast attached to this session.
 *
 * Returns `found: false` rather than throwing when the session has no occurrence. Live is
 * opt-in per session, so "no broadcast here" is the normal answer for most sessions and a
 * producer opening the wrong class should be told that, not shown an error.
 *
 * A database failure DOES throw, unlike `resolveSessionMoment` which degrades to `unknown`.
 * The difference is deliberate: that one answers a public landing page where a blip should
 * read as "we cannot tell you right now", while this one is about to be used to put a class
 * on air, and a producer must never be shown a confident, empty control built on a failed
 * read.
 */
export async function readProducerStateBySession(
  sessionId: string,
  nowMs: number = Date.now(),
  /**
   * Restrict the description to the commands the caller could actually send. The HTTP
   * surface accepts a subset of the machine's commands (`SENDABLE_PRODUCER_COMMANDS`), and
   * describing one the route would answer 400 to would be a control offering a button that
   * cannot work. Omitted means every command the machine knows.
   */
  only?: readonly ProducerCommand[],
): Promise<ProducerStateResult> {
  const [rows] = await sequelize.query(
    `SELECT o.id, o.title, o.editorial_state, o.provider_health, o.version,
            o.content_started_at, o.ended_at, o.end_reason, o.scheduled_start_at
       FROM broadcast_source_refs r
       JOIN broadcast_occurrences o ON o.id = r.occurrence_id
      WHERE r.source_type = 'live_session' AND r.source_id = :sid
      LIMIT 1`,
    { replacements: { sid: sessionId } },
  );

  const row = (rows as OccurrenceRow[])[0];
  if (!row) return NOT_FOUND;

  const version = toVersion(row.version);
  const described = describeProducerCommands(toState(row, version), nowMs);
  const commands = only ? described.filter((d) => only.includes(d.command)) : described;

  return {
    found: true,
    occurrence: {
      id: row.id,
      title: row.title,
      editorial_state: row.editorial_state,
      provider_health: row.provider_health,
      version,
      content_started_at: iso(row.content_started_at),
      ended_at: iso(row.ended_at),
      end_reason: row.end_reason,
      scheduled_start_at: iso(row.scheduled_start_at),
    },
    commands,
  };
}
