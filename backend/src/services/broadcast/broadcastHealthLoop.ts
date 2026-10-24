/**
 * The wiring. This is the part L4.6, L7.1 and the provider fold itself all missed.
 *
 * Three times in one week this subsystem shipped a complete, tested unit that nothing called:
 * the heartbeat route, occurrence creation without a provider binding, and `runProviderEvent`.
 * Each was invisible to a passing test suite and obvious within minutes of a live stream. So
 * this module exists only to connect the tested pieces to the running process, and
 * `broadcastHealthLoop.wiring.test.ts` asserts the server actually starts it.
 */
import cron from 'node-cron';
import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { readLiveLifecycle, readVideoState } from './providers/cloudflareStreamProvider';
import { runHealthTick, OBSERVED_STATES, ObservableOccurrence } from './broadcastHealthRunner';
import { runReplayTick, PROMOTABLE_STATES, PromotableOccurrence } from './broadcastReplayRunner';

/** Every minute. node-cron's finest granularity, and the house scheduler in server.ts. */
export const HEALTH_CRON = '* * * * *';

/**
 * Occurrences worth observing: on air, or about to be.
 *
 * The state list comes from the runner rather than being retyped here, so a state added in one
 * place cannot be silently missed in the other.
 */
export async function loadObservableOccurrences(): Promise<ObservableOccurrence[]> {
  const [rows] = await sequelize.query(
    `SELECT id, editorial_state, provider, provider_session_id, provider_instance_uuid, version
       FROM broadcast_occurrences
      WHERE editorial_state IN (:states)
      ORDER BY scheduled_start_at NULLS LAST
      LIMIT 50`,
    { replacements: { states: [...OBSERVED_STATES] } },
  );
  return rows as ObservableOccurrence[];
}

/**
 * Ask the provider what it sees. A throw means unreadable, not absent.
 *
 * Returns the WHOLE lifecycle. The same call already carries the per-broadcast video uid,
 * and the previous version narrowed it to a boolean on the way out — which is why every
 * recording was unbound and an ended occurrence had nothing to play (L8.4).
 */
export async function observeOccurrence(occ: ObservableOccurrence) {
  const life = await readLiveLifecycle(occ.provider_session_id as string);
  return { live: life.live === true, videoUid: life.videoUid };
}

/**
 * Persist the recording uid against the occurrence.
 *
 * Deliberately does NOT bump `version`: this is an observation about the show, not a
 * producer command, and bumping it would invalidate the version a concurrent auto-end is
 * holding. The `IS NULL` guard makes the write idempotent at the database rather than
 * trusting the caller to have checked first.
 */
export async function bindRecording(occurrenceId: string, videoUid: string): Promise<void> {
  await sequelize.query(
    `UPDATE broadcast_occurrences
        SET provider_instance_uuid = :videoUid, updated_at = NOW()
      WHERE id = :id AND provider_instance_uuid IS NULL`
    , { replacements: { id: occurrenceId, videoUid } },
  );
}

/**
 * Shows that are over and might have a replay (L8.4).
 *
 * A different set from the observable one, and a different question: that asks a live
 * input whether video is arriving, this asks a recording whether it is playable.
 */
export async function loadPromotableOccurrences(): Promise<PromotableOccurrence[]> {
  const [rows] = await sequelize.query(
    `SELECT id, editorial_state, provider, provider_instance_uuid, version
       FROM broadcast_occurrences
      WHERE editorial_state IN (:states)
        AND provider_instance_uuid IS NOT NULL
      ORDER BY ended_at NULLS LAST
      LIMIT 50`
    , { replacements: { states: [...PROMOTABLE_STATES] } },
  );
  return rows as PromotableOccurrence[];
}

let task: { stop: () => void } | null = null;

/**
 * Start the loop. Idempotent, so a double call in a test or a reload cannot end up with two
 * schedules racing each other to report the same health.
 */
export function startBroadcastHealthLoop(): boolean {
  if (task) return false;
  // Gated on the feature flag: with broadcasting off there is nothing on air to watch, and a
  // provider call a minute against a dark feature is pure cost. The flag already requires a
  // container recreate to change, so this cannot leave the loop stopped on a live system.
  if (!env.broadcastEnabled) return false;

  task = cron.schedule(HEALTH_CRON, () => {
    /**
     * Two ticks on one schedule. Same cadence, different questions: one watches what is on
     * air, the other watches for a finished recording to become playable. Kept as separate
     * functions because they poll different endpoints and hold different rules.
     */
    runReplayTick({
      loadPromotable: loadPromotableOccurrences,
      readRecordingState: readVideoState,
    }).catch((err: any) => {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'warn', service: 'broadcast',
        event: 'broadcast_replay_loop_unhandled', outcome: 'failure',
        error_class: err?.name ?? 'UnexpectedError',
      }));
    });

    runHealthTick({
      loadObservable: loadObservableOccurrences,
      observe: observeOccurrence,
      bindRecording,
    }).catch((err: any) => {
      // runHealthTick does not throw by design; this is belt and braces, because an unhandled
      // rejection inside a cron tick takes the process down in some Node versions.
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'warn', service: 'broadcast',
        event: 'broadcast_health_loop_unhandled', outcome: 'failure',
        error_class: err?.name ?? 'UnexpectedError',
      }));
    });
  });
  console.log('[Broadcast] provider health loop started (' + HEALTH_CRON + ')');
  return true;
}

/** Test-only: stop and forget the schedule. */
export function __stopBroadcastHealthLoop(): void {
  if (task) { task.stop(); task = null; }
}
