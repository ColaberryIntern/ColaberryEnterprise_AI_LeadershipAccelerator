/**
 * The first supported way to create a broadcast occurrence: from an Accelerator session.
 *
 * Before this, the only `BroadcastOccurrence.create` call in the backend lived inside
 * broadcastBackfillRunner — a dry-run-by-default historical migration with batch reversal — so
 * nobody, admin or engineer, had a supported way to create one. The backfill stays untouched:
 * its batch-reversal contract is for one-shot history, not for live operation.
 *
 * CREATION IS NOT A TRANSITION, so this deliberately does not go through `runProducerCommand`.
 * That service loads an existing row and 404s otherwise. Going live stays a producer command on
 * the existing route; this only brings the row into being, in the most restrictive state.
 *
 * IDEMPOTENCY IS THE DATABASE'S JOB. `uq_broadcast_source_ref` is UNIQUE on
 * (source_type, source_id), so a second "enable live" for the same session physically cannot
 * mint a second occurrence — the losing insert raises and we converge on the row that already
 * exists. That same constraint is why a re-timed session UPDATES its occurrence rather than
 * creating another: a session holds at most one source-linked occurrence by constraint, not by
 * convention.
 *
 * NOTHING HERE GUESSES A TIME. `deriveStartInstant` reports `derived: false` rather than
 * returning a plausible Date, and this refuses on that signal. An occurrence scheduled at a
 * guessed instant is worse than no occurrence: the preview window and the whole access decision
 * are measured from it.
 */
import { sequelize } from '../../config/database';
import BroadcastOccurrence from '../../models/BroadcastOccurrence';
import { deriveStartInstant, occurrenceKeyFor } from './broadcastIdentity';
import { resolveLiveInput } from './broadcastInputBinding';

/** States in which re-timing an occurrence is still honest. */
const RETIMEABLE = new Set(['scheduled', 'backstage']);

export type EnsureOutcome = 'created' | 'retimed' | 'unchanged' | 'refused';

export type EnsureRefusal =
  | 'no_room'
  | 'undeterminable_start'
  | 'already_aired'
  /** No live input could be resolved, so the occurrence would be unplayable. L5.4. */
  | 'no_live_input';

export interface EnsureOccurrenceResult {
  outcome: EnsureOutcome;
  occurrenceId: string | null;
  /** Present only when outcome is 'refused'. Machine-readable, for the caller's log. */
  reason?: EnsureRefusal;
  /** Present when the start instant could not be derived, straight from broadcastIdentity. */
  detail?: string;
}

/** Only the fields this module reads — so a test does not have to build a whole model. */
export interface SessionForOccurrence {
  id: string;
  title: string;
  session_date?: string | null;
  start_time?: string | null;
}

interface ExistingRow {
  id: string;
  occurrence_key: string;
  editorial_state: string;
}

function log(event: string, outcome: string, context: Record<string, unknown>): void {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'warn' : 'info',
    service: 'broadcast',
    event,
    outcome,
    context,
  }));
}

/** The occurrence already linked to this session, or null. */
async function findExisting(sessionId: string): Promise<ExistingRow | null> {
  const [rows] = await sequelize.query(
    `SELECT o.id, o.occurrence_key, o.editorial_state
       FROM broadcast_source_refs r
       JOIN broadcast_occurrences o ON o.id = r.occurrence_id
      WHERE r.source_type = 'live_session' AND r.source_id = :sid
      LIMIT 1`,
    { replacements: { sid: sessionId } },
  );
  const list = rows as ExistingRow[];
  return list.length ? list[0] : null;
}

/**
 * One occurrence plus its authoritative source ref, in one transaction.
 *
 * `batch_id` is left NULL: that column exists so a backfill run can be reversed with one
 * predicate, and a row created by normal operation must never look like backfill output.
 */
async function createLinked(
  session: SessionForOccurrence,
  roomId: string,
  key: string,
  startsAt: Date,
  provider: string,
  providerSessionId: string,
): Promise<string> {
  let createdId = '';
  await sequelize.transaction(async (tx) => {
    const occurrence = await BroadcastOccurrence.create(
      {
        occurrence_key: key,
        title: session.title,
        room_id: roomId,
        scheduled_start_at: startsAt,
        // Both stated explicitly even though they match the column defaults. The acceptance
        // criterion is that the default is the most restrictive, and an explicit value is what
        // a test can assert on; a silent reliance on a default cannot be distinguished from a
        // default that has since been changed.
        access_mode: 'private',
        editorial_state: 'scheduled',
        // L5.4: without these, playback has nothing telling it which live input to sign, and
        // the occurrence is real, correctly gated, and unplayable.
        provider,
        provider_session_id: providerSessionId,
        // L5.4: without these, playback has nothing telling it which live input to sign, and
        // the occurrence is real, correctly gated, and unplayable.
      } as any,
      { transaction: tx },
    );
    await sequelize.query(
      `INSERT INTO broadcast_source_refs (occurrence_id, source_type, source_id, is_authoritative, linked_reason)
       VALUES (:occurrenceId, 'live_session', :sourceId, true, :reason)`,
      {
        replacements: {
          occurrenceId: occurrence.id,
          sourceId: session.id,
          reason: 'live enabled on the session setup flow',
        },
        transaction: tx,
      },
    );
    createdId = occurrence.id;
  });
  return createdId;
}

/**
 * Ensure the broadcast occurrence for a session exists and is scheduled at the right instant.
 *
 * Never throws for an expected refusal — the caller logs the reason and carries on, because a
 * broadcast problem must not fail session creation. A genuine infrastructure error still throws.
 */
export async function ensureOccurrenceForSession(
  session: SessionForOccurrence,
  roomId: string | null,
): Promise<EnsureOccurrenceResult> {
  // A private occurrence with no room is unreachable by design: room eligibility fails closed
  // on a null room_id. Creating one would be an orphan nobody, Ali included, could ever watch.
  if (!roomId) {
    log('broadcast_occurrence_refused', 'failure', { sessionId: session.id, reason: 'no_room' });
    return { outcome: 'refused', occurrenceId: null, reason: 'no_room' };
  }

  const instant = deriveStartInstant({
    sourceType: 'live_session',
    sourceId: session.id,
    sessionDate: session.session_date ?? undefined,
    rawStartTime: session.start_time ?? undefined,
  } as any);

  if (!instant.derived || !instant.startsAt) {
    log('broadcast_occurrence_refused', 'failure', {
      sessionId: session.id, reason: 'undeterminable_start', detail: instant.reason,
    });
    return {
      outcome: 'refused', occurrenceId: null,
      reason: 'undeterminable_start', detail: instant.reason,
    };
  }

  const key = occurrenceKeyFor('live_session', session.id, instant.startsAt);

  // Resolved BEFORE anything is written. An occurrence that looks fine and cannot play is
  // worse than no occurrence: it is discovered by an audience rather than by an admin.
  const binding = resolveLiveInput();
  if (!binding.bound) {
    log('broadcast_occurrence_refused', 'failure', {
      sessionId: session.id, reason: 'no_live_input', detail: binding.reason,
    });
    return {
      outcome: 'refused', occurrenceId: null,
      reason: 'no_live_input', detail: binding.reason,
    };
  }

  const existing = await findExisting(session.id);

  if (!existing) {
    try {
      const id = await createLinked(
        session, roomId, key, instant.startsAt, binding.provider, binding.providerSessionId,
      );
      log('broadcast_occurrence_created', 'success', { sessionId: session.id, occurrenceId: id, key });
      return { outcome: 'created', occurrenceId: id };
    } catch (err: any) {
      // The unique indexes are the arbiter, not the read above: another request may have created
      // this between the SELECT and the INSERT. A lost race is convergence, not an error.
      if (err?.name === 'SequelizeUniqueConstraintError') {
        const now = await findExisting(session.id);
        log('broadcast_occurrence_converged', 'success', {
          sessionId: session.id, occurrenceId: now?.id ?? null,
        });
        return { outcome: 'unchanged', occurrenceId: now?.id ?? null };
      }
      throw err;
    }
  }

  if (existing.occurrence_key === key) {
    return { outcome: 'unchanged', occurrenceId: existing.id };
  }

  // The key embeds the start instant, so a rescheduled session produces a different key. Moving
  // a show that has already gone live or finished would rewrite history, so it is refused rather
  // than silently applied — and refused loudly, because the admin just changed the date.
  if (!RETIMEABLE.has(existing.editorial_state)) {
    log('broadcast_occurrence_refused', 'failure', {
      sessionId: session.id, occurrenceId: existing.id,
      reason: 'already_aired', editorial_state: existing.editorial_state,
    });
    return {
      outcome: 'refused', occurrenceId: existing.id,
      reason: 'already_aired', detail: existing.editorial_state,
    };
  }

  await sequelize.query(
    `UPDATE broadcast_occurrences
        SET occurrence_key = :key,
            scheduled_start_at = :startsAt,
            title = :title,
            version = version + 1,
            updated_at = now()
      WHERE id = :id`,
    {
      replacements: {
        key, startsAt: instant.startsAt, title: session.title, id: existing.id,
      },
    },
  );
  log('broadcast_occurrence_retimed', 'success', {
    sessionId: session.id, occurrenceId: existing.id, key,
  });
  return { outcome: 'retimed', occurrenceId: existing.id };
}

/** Whether live is enabled for a session — the occurrence's existence IS the flag. */
export async function isLiveEnabledForSession(sessionId: string): Promise<boolean> {
  return (await findExisting(sessionId)) !== null;
}
