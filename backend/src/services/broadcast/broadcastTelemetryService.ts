import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import {
  creditSeconds,
  resolveIntent,
  type MeasuredAccessMode,
  type PlaybackBeatState,
  type TelemetryConfig,
  type ViewerIntent,
} from './broadcastTelemetryPolicy';

/**
 * broadcastTelemetryService — the measurement WRITES and READS. Rules live in
 * `broadcastTelemetryPolicy`; this file only moves them to and from Postgres.
 *
 * EVERY WRITE HERE IS AN UPSERT, never an insert. That is the design claim of P3-06: a beat
 * updates the row for its tab and the row for its person, so storage is bounded by concurrent
 * tabs and unique attendees rather than by elapsed time. An append-only beat log — which is
 * what the repo's `session_presence_events` is — would be 240 000 rows an hour for one
 * broadcast at 1 000 viewers, and the "who is watching now" query would then scan a table
 * that grows for ever to answer a question about the last 45 seconds.
 *
 * TELEMETRY MUST NEVER BREAK THE THING IT MEASURES. `recordPlaybackBeat` is best-effort and
 * swallows its own failures after logging them, exactly like `sessionPresenceService`: a
 * viewer's playback must not fail because a metrics write did. The READ side is the opposite
 * — it propagates, because a read that silently returns zero would publish a fabricated zero,
 * and the metrics dictionary calls that a defect rather than a cosmetic issue.
 *
 * THE CREDIT IS COMPUTED IN NODE, NOT IN SQL, and deliberately so. `creditSeconds` is the
 * dedup rule, it is the single most consequential line in the feature's numbers, and in SQL
 * it would be untestable without a database. Here it is a pure function with a fixture suite
 * and a mutation that proves each branch matters. The cost is one extra round trip per beat,
 * which is the right trade for the one rule nobody will notice is wrong.
 */

export interface PlaybackBeat {
  occurrenceId: string;
  /** Opaque client-generated tab id. Never identity. */
  sessionId: string;
  state: PlaybackBeatState;
  intent: ViewerIntent;
}

/** Facts only the server may assert. Assembled by the controller, never by the client. */
export interface ServerViewerFacts {
  enrollmentId: string;
  isStaff: boolean;
  isTest: boolean;
  accessMode: MeasuredAccessMode | null;
}

const log = (event: string, context: Record<string, unknown>): void => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'broadcast-telemetry',
    event,
    outcome: 'failure',
    ...context,
  }));
};

/**
 * Record one playback beat. Best-effort: returns false on failure, never throws.
 *
 * Two upserts and one read, in a transaction so a credited second cannot be recorded without
 * the beat that earned it. The person row is read FIRST because the credit depends on that
 * person's `last_credited_at` — which is what makes a second tab add nothing a first already
 * did — and `FOR UPDATE` serialises two tabs beating in the same millisecond, which would
 * otherwise both read the same stale anchor and both credit the full gap.
 */
export async function recordPlaybackBeat(
  beat: PlaybackBeat, facts: ServerViewerFacts, cfg: TelemetryConfig, nowMs: number,
): Promise<boolean> {
  const now = new Date(nowMs);
  try {
    await sequelize.transaction(async (tx) => {
      const existing = await sequelize.query<{
        last_credited_at: Date | null; intent: ViewerIntent;
      }>(
        `SELECT last_credited_at, intent
           FROM broadcast_viewer_people
          WHERE occurrence_id = :occ AND enrollment_id = :enr
          FOR UPDATE`,
        {
          replacements: { occ: beat.occurrenceId, enr: facts.enrollmentId },
          type: QueryTypes.SELECT,
          transaction: tx,
        },
      );

      const prior = existing[0] ?? null;
      const lastCredited = prior?.last_credited_at ? new Date(prior.last_credited_at).getTime() : null;
      // Only a PLAYING beat earns watch time. A paused tab that keeps beating is keeping its
      // session alive, not accruing a viewing figure.
      const earned = beat.state === 'playing' ? creditSeconds(lastCredited, nowMs, cfg) : 0;
      const intent = resolveIntent(prior?.intent ?? null, beat.intent);

      await sequelize.query(
        `INSERT INTO broadcast_viewer_people (
           occurrence_id, enrollment_id, first_seen_at, last_beat_at, last_credited_at,
           playing_seconds, intent, access_mode, is_staff, is_test
         ) VALUES (
           -- CAST, not a bare :now. In a VALUES list both branches of this CASE are untyped,
           -- so Postgres resolves the whole expression to text and then refuses to put text
           -- in a timestamptz column: "column last_credited_at is of type timestamp with time
           -- zone but expression is of type text". The DO UPDATE below needs no cast because
           -- its ELSE branch IS the column, which types the CASE. Spelled CAST(x AS t) rather
           -- than the :: form, because Sequelize reads a trailing ::timestamptz as a named
           -- replacement and throws on the missing value.
           :occ, :enr, :now, :now, CASE WHEN :playing THEN CAST(:now AS TIMESTAMPTZ) ELSE NULL END,
           :earned, :intent, :mode, :staff, :test
         )
         ON CONFLICT (occurrence_id, enrollment_id) DO UPDATE SET
           last_beat_at     = :now,
           -- Only advance the credit anchor on a playing beat, or a paused viewer would
           -- silently reset their own baseline and lose the seconds they had earned.
           last_credited_at = CASE WHEN :playing THEN :now
                                   ELSE broadcast_viewer_people.last_credited_at END,
           playing_seconds  = broadcast_viewer_people.playing_seconds + :earned,
           intent           = :intent,
           -- COALESCE, not overwrite: once the server has decided a mode, a later beat
           -- arriving before that decision is available must not blank it.
           access_mode      = COALESCE(:mode, broadcast_viewer_people.access_mode),
           is_staff         = :staff,
           is_test          = :test`,
        {
          replacements: {
            occ: beat.occurrenceId,
            enr: facts.enrollmentId,
            now,
            playing: beat.state === 'playing',
            earned: Math.round(earned),
            intent,
            mode: facts.accessMode,
            staff: facts.isStaff,
            test: facts.isTest,
          },
          transaction: tx,
        },
      );

      await sequelize.query(
        `INSERT INTO broadcast_viewer_sessions (
           occurrence_id, session_id, enrollment_id, state, last_beat_at, last_playing_at, started_at
         ) VALUES (
           -- Same untyped-CASE trap as the people insert above, same cast.
           :occ, :sid, :enr, :state, :now, CASE WHEN :playing THEN CAST(:now AS TIMESTAMPTZ) ELSE NULL END, :now
         )
         ON CONFLICT (occurrence_id, session_id) DO UPDATE SET
           state           = :state,
           last_beat_at    = :now,
           -- Sticky: the buffering grace window is measured from the last REAL play, so a
           -- tab that stalls for a minute must not keep refreshing its own grace by beating.
           last_playing_at = CASE WHEN :playing THEN :now
                                  ELSE broadcast_viewer_sessions.last_playing_at END,
           -- A tab id is the client's; if two enrollments ever collide on one, the latest
           -- authenticated owner wins rather than the row silently reporting the wrong person.
           enrollment_id   = :enr`,
        {
          replacements: {
            occ: beat.occurrenceId,
            sid: beat.sessionId,
            enr: facts.enrollmentId,
            state: beat.state,
            now,
            playing: beat.state === 'playing',
          },
          transaction: tx,
        },
      );
    });
    return true;
  } catch (err) {
    // Classified and swallowed. A failed metrics write must not surface to a viewer who is
    // watching successfully, and must not retry into a struggling database.
    //
    // The MESSAGE is logged, not just the class. Without it this path reported
    // `SequelizeDatabaseError` and nothing else, which is the same line for a type error, a
    // constraint violation and a dropped connection - so a statement that could never succeed
    // was indistinguishable from a database having a bad minute. It is the error's own text,
    // not a row, and these tables hold no secret values.
    log('broadcast_beat_write_failed', {
      error_class: (err as Error)?.name ?? 'UnexpectedError',
      error_message: (err as Error)?.message ?? String(err),
      occurrence_id: beat.occurrenceId,
    });
    return false;
  }
}

export interface LiveAudience {
  watchingNow: number;
  deliberate: number;
  auto: number;
  byMode: Record<string, number>;
}

/**
 * `watching_now` and its splits, for one occurrence, right now.
 *
 * THE FRESHNESS WINDOW IS THE QUERY, not a filter applied afterwards — `last_beat_at >= :cut`
 * is what `idx_bvs_active` exists to serve, and it is why that index leads with
 * `(occurrence_id, last_beat_at DESC)`. P3-06's acceptance requires this plan be recorded;
 * `scripts/explainBroadcastTelemetry.js` runs it at deploy time, since there is no local
 * Postgres to EXPLAIN against.
 *
 * COUNT(DISTINCT enrollment_id), never COUNT(*): the unit is a PERSON, and counting sessions
 * would report someone with the player open in two tabs as two audience members.
 *
 * Buffering is counted here by the same grace rule the policy module states, expressed in
 * SQL because the filter must happen in the database to stay indexable. The two must agree,
 * which is why `broadcastTelemetryQuery.test.ts` asserts the SQL text contains the window.
 */
export async function readLiveAudience(
  occurrenceId: string, cfg: TelemetryConfig, nowMs: number, diagnostic = false,
): Promise<LiveAudience> {
  const cut = new Date(nowMs - cfg.viewerExpirySeconds * 1000);
  const graceCut = new Date(nowMs - cfg.bufferingGraceSeconds * 1000);

  const rows = await sequelize.query<{
    intent: ViewerIntent; access_mode: string | null; people: string;
  }>(
    `SELECT p.intent, p.access_mode, COUNT(DISTINCT s.enrollment_id)::text AS people
       FROM broadcast_viewer_sessions s
       JOIN broadcast_viewer_people p
         ON p.occurrence_id = s.occurrence_id AND p.enrollment_id = s.enrollment_id
      WHERE s.occurrence_id = :occ
        AND s.last_beat_at >= :cut
        AND (
          s.state = 'playing'
          OR (s.state = 'buffering' AND s.last_playing_at IS NOT NULL AND s.last_playing_at >= :grace)
        )
        AND (:diagnostic OR (p.is_staff = FALSE AND p.is_test = FALSE))
      GROUP BY p.intent, p.access_mode`,
    {
      replacements: { occ: occurrenceId, cut, grace: graceCut, diagnostic },
      type: QueryTypes.SELECT,
    },
  );

  const out: LiveAudience = { watchingNow: 0, deliberate: 0, auto: 0, byMode: {} };
  rows.forEach((r) => {
    const n = parseInt(r.people, 10);
    if (!Number.isFinite(n)) return;
    out.watchingNow += n;
    if (r.intent === 'deliberate') out.deliberate += n;
    else out.auto += n;
    const mode = r.access_mode ?? 'unknown';
    out.byMode[mode] = (out.byMode[mode] ?? 0) + n;
  });
  return out;
}

/**
 * Update the sampled peak, if this observation beats it.
 *
 * `peak_concurrency` is SAMPLED rather than continuous, and the dictionary's wording —
 * "maximum observed" — is what makes that honest rather than a shortfall. Computing a true
 * continuous peak would mean a COUNT on every beat, which is the one thing the bounded design
 * exists to avoid. Anyone reading the number needs to know it is a sample, which is why the
 * read surface labels it.
 */
export async function recordPeakSample(
  occurrenceId: string, watchingNow: number, nowMs: number,
): Promise<void> {
  try {
    await sequelize.query(
      `INSERT INTO broadcast_occurrence_metrics (occurrence_id, peak_concurrency, peak_at, updated_at)
         VALUES (:occ, :n, :now, :now)
       ON CONFLICT (occurrence_id) DO UPDATE SET
         peak_concurrency = GREATEST(broadcast_occurrence_metrics.peak_concurrency, :n),
         -- Only move the timestamp when the peak actually moved, or peak_at would drift to
         -- the time of the most recent sample and stop describing the peak at all.
         peak_at = CASE WHEN :n > broadcast_occurrence_metrics.peak_concurrency
                        THEN :now ELSE broadcast_occurrence_metrics.peak_at END,
         updated_at = :now`,
      { replacements: { occ: occurrenceId, n: watchingNow, now: new Date(nowMs) } },
    );
  } catch (err) {
    log('broadcast_peak_sample_failed', {
      error_class: (err as Error)?.name ?? 'UnexpectedError', occurrence_id: occurrenceId,
    });
  }
}

/**
 * Delete every telemetry row for one occurrence — the documented rollback for P3-06.
 *
 * Derived data, never billing or entitlement truth, so this is safe to run at any time and
 * costs only a report. The hot tables cascade from `broadcast_occurrences`, but this exists
 * so the rows can go WITHOUT deleting the occurrence itself, which is the actual operational
 * need: stop ingestion with the flag, then clear what was collected.
 */
export async function purgeOccurrenceTelemetry(occurrenceId: string): Promise<void> {
  await sequelize.transaction(async (tx) => {
    for (const table of [
      'broadcast_viewer_sessions', 'broadcast_viewer_people', 'broadcast_occurrence_metrics',
    ]) {
      await sequelize.query(
        `DELETE FROM ${table} WHERE occurrence_id = :occ`,
        { replacements: { occ: occurrenceId }, transaction: tx },
      );
    }
  });
}
