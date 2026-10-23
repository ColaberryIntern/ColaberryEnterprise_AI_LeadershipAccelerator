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
import { readLiveLifecycle } from './providers/cloudflareStreamProvider';
import { runHealthTick, OBSERVED_STATES, ObservableOccurrence } from './broadcastHealthRunner';

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
    `SELECT id, editorial_state, provider, provider_session_id, version
       FROM broadcast_occurrences
      WHERE editorial_state IN (:states)
      ORDER BY scheduled_start_at NULLS LAST
      LIMIT 50`,
    { replacements: { states: [...OBSERVED_STATES] } },
  );
  return rows as ObservableOccurrence[];
}

/** Ask the provider whether a stream is arriving. A throw means unreadable, not absent. */
export async function observeOccurrence(occ: ObservableOccurrence): Promise<boolean> {
  const life = await readLiveLifecycle(occ.provider_session_id as string);
  return life.live === true;
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
    runHealthTick({
      loadObservable: loadObservableOccurrences,
      observe: observeOccurrence,
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
