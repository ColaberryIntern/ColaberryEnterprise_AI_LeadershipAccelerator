/**
 * broadcastIdentity — occurrence identity and instant derivation for Colaberry Live.
 *
 * PURE — no DB reads, no clock of its own — so it is exhaustively unit-testable and the
 * callers load rows and pass them in (same contract as roomEntitlementService). Everything
 * about *which* airing this is, and *when* it really starts, is decided here exactly once.
 *
 * Two bugs this module exists to not repeat:
 *
 * 1. THE WALL-CLOCK BUG. live_sessions stores no timestamp and no timezone: session_date is
 *    DATEONLY and start_time/end_time are STRING(20) Central wall-clock text ("6:30 PM").
 *    communityCalendarService.ts:34-40 reconstructs an instant with
 *    `new Date(\`${date}T${convertTo24h(time)}:00\`)` — no offset, no Central conversion — so
 *    in a UTC container that wall-clock is parsed AS UTC, 5-6 hours off. That exact mistake
 *    was root-caused on 2026-07-23 when an Orientation was auto-marked 'completed' hours
 *    before its real 6:30pm CT start and blocked check-in. The fix already exists as
 *    classInstant() in centralDate.ts, which deliberately takes the RAW stored string so a
 *    caller cannot forget the normalization step. We call it; we do not re-derive it.
 *
 * 2. THE '10:00' FALLBACK. convertTo24h returns '10:00' for anything it cannot parse.
 *    centralDate's copy tolerates the trailing seconds a Sequelize TIME column returns
 *    ("18:30:00"); the private copy in communityCalendarService.ts:12 does NOT, so a
 *    seconds-bearing value there silently becomes 10:00 AM. Scheduling math needs *some*
 *    instant, so the fallback itself is defensible — but it must be VISIBLE, which is why
 *    deriveStartInstant reports `derived: false` rather than quietly returning a time.
 *
 * The third thing decided here is that "is it live" is a STATE question, never a time
 * question. Every existing feed asks `starts_at >= now` and therefore cannot see an event
 * that has already begun (communityCalendarService.ts:93-95; publicEventsService.ts:188).
 * selectActive() asks the editorial state instead.
 */
import { classInstant, centralWallClockToInstant } from '../centralDate';

export type BroadcastSourceType =
  | 'live_session' | 'open_house_event' | 'community_event' | 'room_booking' | 'ccpp_event';

/** Editorial states in which an occurrence is on air or about to be. */
export const ACTIVE_STATES = ['backstage', 'live', 'reconnecting'] as const;
export type ActiveState = (typeof ACTIVE_STATES)[number];

/** The shape a caller passes in after loading a source row. Deliberately minimal. */
export interface SourceDescriptor {
  sourceType: BroadcastSourceType;
  sourceId: string;
  /** live_session only: DATEONLY 'YYYY-MM-DD'. */
  sessionDate?: string | null;
  /** live_session only: RAW stored wall-clock, e.g. '18:30' or '6:30 PM' or '18:30:00'. */
  rawStartTime?: string | null;
  /** Sources that already store a real instant (open_house_event, community_event, room_booking). */
  startsAt?: Date | null;
  /** ccpp_event only: a naive Central wall-clock the mssql driver read into UTC fields. */
  naiveCentralStartsAt?: Date | null;
}

export interface DerivedInstant {
  /** The true UTC instant, or null when it genuinely cannot be determined. */
  startsAt: Date | null;
  /** False when a fallback or a missing input was involved — never silently true. */
  derived: boolean;
  /** Machine-readable reason when derived is false. */
  reason?: 'missing_input' | 'unparseable_time' | 'invalid_date';
}

const TIME_SHAPE = /^\d{1,2}:\d{2}(?::\d{2})?\s*(AM|PM)?$/i;

/**
 * The real instant a source event starts.
 *
 * Each source type stores time differently, and that difference is the whole reason a
 * canonical occurrence exists. Returning {derived:false} rather than a plausible-looking
 * Date is deliberate: the caller must choose to quarantine the row (request §5 P1-06:
 * "quarantine ambiguous links instead of guessing").
 */
export function deriveStartInstant(src: SourceDescriptor): DerivedInstant {
  switch (src.sourceType) {
    case 'live_session': {
      if (!src.sessionDate || !src.rawStartTime) {
        return { startsAt: null, derived: false, reason: 'missing_input' };
      }
      // Report the '10:00' fallback instead of hiding it. classInstant still returns a
      // usable instant, but the caller is told the time was not actually parsed.
      if (!TIME_SHAPE.test(src.rawStartTime.trim())) {
        return { startsAt: classInstant(src.sessionDate, src.rawStartTime), derived: false, reason: 'unparseable_time' };
      }
      const d = classInstant(src.sessionDate, src.rawStartTime);
      if (Number.isNaN(d.getTime())) return { startsAt: null, derived: false, reason: 'invalid_date' };
      return { startsAt: d, derived: true };
    }
    case 'ccpp_event': {
      if (!src.naiveCentralStartsAt) return { startsAt: null, derived: false, reason: 'missing_input' };
      const d = centralWallClockToInstant(src.naiveCentralStartsAt);
      if (Number.isNaN(d.getTime())) return { startsAt: null, derived: false, reason: 'invalid_date' };
      return { startsAt: d, derived: true };
    }
    case 'open_house_event':
    case 'community_event':
    case 'room_booking': {
      if (!src.startsAt) return { startsAt: null, derived: false, reason: 'missing_input' };
      if (Number.isNaN(src.startsAt.getTime())) return { startsAt: null, derived: false, reason: 'invalid_date' };
      return { startsAt: src.startsAt, derived: true };
    }
    default: {
      // An unknown source type is a quarantine case, never a guess.
      return { startsAt: null, derived: false, reason: 'missing_input' };
    }
  }
}

/**
 * The stable identity of ONE airing.
 *
 * Includes the instant, because a recurring series reuses one persistent meeting id for
 * every episode: keying on (type, id) alone would collapse a whole season into a single
 * occurrence. Minute precision — a source that jitters by seconds is the same airing.
 */
export function occurrenceKeyFor(sourceType: BroadcastSourceType, sourceId: string, startsAt: Date | null): string {
  const stamp = startsAt && !Number.isNaN(startsAt.getTime())
    ? new Date(Math.floor(startsAt.getTime() / 60000) * 60000).toISOString().slice(0, 16)
    : 'unscheduled';
  return `${sourceType}:${sourceId}:${stamp}`;
}

export function isActiveState(state: string): state is ActiveState {
  return (ACTIVE_STATES as ReadonlyArray<string>).includes(state);
}

export interface OccurrenceLike {
  id: string;
  editorial_state: string;
  scheduled_start_at?: Date | null;
  content_started_at?: Date | null;
}

/**
 * The occurrences a viewer should see as on-air.
 *
 * Asks the STATE, not the clock. Every pre-existing feed filters `starts_at >= now`, which
 * is why a session that began ten minutes ago is invisible today even when its own status
 * column says 'live'. A broadcast that has started is the single most important thing this
 * product has to be able to show, so time is not a filter here at all.
 */
export function selectActive<T extends OccurrenceLike>(occurrences: ReadonlyArray<T>): T[] {
  return occurrences.filter((o) => isActiveState(o.editorial_state));
}

/**
 * Seconds of free preview remaining, from the SERVER's clock and content_started_at.
 *
 * Anchored to content_started_at and never to scheduled_start_at, so a waiting-room
 * countdown does not consume the window. Returns 0 once spent, and null when content has
 * not started — which is not the same as 0 and must not be collapsed into it.
 */
export function previewSecondsRemaining(
  occurrence: OccurrenceLike,
  previewSeconds: number,
  nowMs: number,
): number | null {
  const started = occurrence.content_started_at;
  if (!started || Number.isNaN(started.getTime())) return null;
  const elapsed = Math.floor((nowMs - started.getTime()) / 1000);
  if (elapsed < 0) return previewSeconds;
  return Math.max(0, previewSeconds - elapsed);
}
