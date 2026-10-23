/**
 * One tick of the provider health loop: look at every occurrence that is on air or about to
 * be, ask the provider what it sees, and fold the answer in through the EXISTING command
 * service.
 *
 * It holds no state rules of its own: every rule lives in a pure policy or in the state
 * machine. `applyProviderEvent` already decides that health may move freely, that only the
 * live/reconnecting pair may be entered this way, that a webhook can never publish or end a
 * broadcast, and that a stale delivery is ignored. `decideHealth` decides when to stop
 * believing a stream is healthy, and `decideAutoEnd` decides when to stop believing it is
 * coming back. Re-implementing any of that here would be a second source of truth.
 *
 * THE AUTO-END IS NOT A WEBHOOK ENDING A BROADCAST. It is a timeout with hysteresis that then
 * issues a PRODUCER command, which is why it does not break the rule it looks like it breaks.
 * Ending stays a producer decision; this stands in for the producer who has gone home.
 *
 * MISS COUNTS AND ABSENCE CLOCKS LIVE IN MEMORY, DELIBERATELY. They exist to avoid reacting to
 * a single blip, and a process restart losing them costs at most one extra window of patience
 * — which errs toward not ending a class that is still running, the safe direction. Persisting
 * them would add a write per occurrence per tick to buy nothing.
 */
import { runProducerCommand, runProviderEvent } from './broadcastCommandService';
import { decideHealth, DEFAULT_MISS_THRESHOLD, Observation, ObservedState } from './broadcastHealthPolicy';
import { decideAutoEnd, resolveAutoEndWindowMs } from './broadcastAutoEndPolicy';
import type { ProviderHealth } from './broadcastStateMachine';

/** The occurrences worth observing. Terminal ones are never polled. */
export const OBSERVED_STATES: readonly ObservedState[] = ['backstage', 'live', 'reconnecting'];

export interface ObservableOccurrence {
  id: string;
  editorial_state: string;
  provider: string | null;
  provider_session_id: string | null;
  /** Needed to end it: producer commands are version-guarded, and a stale version is a 409. */
  version: number;
}

export interface HealthRunnerDeps {
  /** Occurrences currently worth observing. Injected so a tick needs no database in tests. */
  loadObservable: () => Promise<ObservableOccurrence[]>;
  /** Ask the provider whether a stream is arriving. Rejection means unreadable, not absent. */
  observe: (occurrence: ObservableOccurrence) => Promise<boolean>;
  /** Fold a health event in. Defaults to the real command service. */
  applyEvent?: (occurrenceId: string, health: ProviderHealth, atMs: number) => Promise<unknown>;
  /**
   * End an occurrence that has been gone past the window. Defaults to the real producer
   * command path, tagged so the row records that nobody pressed the button.
   */
  endOccurrence?: (occ: ObservableOccurrence, atMs: number) => Promise<{ ok: boolean; reason?: string }>;
  now?: () => number;
  threshold?: number;
  /** How long the stream must be continuously gone. Defaults to the configured window. */
  autoEndWindowMs?: number;
  log?: (line: string) => void;
}

export interface TickResult {
  observed: number;
  reported: number;
  held: number;
  skipped: number;
  failed: number;
  /** Occurrences this tick ended because the stream had been gone past the window. */
  ended: number;
}

/** Consecutive non-live observations, per occurrence. Cleared when an occurrence goes quiet. */
const misses = new Map<string, number>();

/**
 * When the stream was FIRST seen absent in the current unbroken run, per occurrence.
 *
 * Separate from `misses` because they answer different questions over different scales: misses
 * counts observations and decides when to say the stream is down, this holds an instant and
 * decides when to stop waiting for it to come back. Folding them into one counter would tie
 * the auto-end window to the polling cadence, so changing the cron would silently change how
 * long a class waits before ending itself.
 */
const goneSince = new Map<string, number>();

/** Test-only: a tick's memory must not leak between cases. */
export function __resetHealthMemory(): void {
  misses.clear();
  goneSince.clear();
}

/**
 * One structured line.
 *
 * `outcome` is a parameter rather than a constant because this helper previously stamped
 * `success` on every line it produced, including the ones reporting that something had
 * failed. A failure logged as a success is worse than no log: it is a line that will be
 * believed, and it makes "how often does the health loop fail" unanswerable.
 */
function logLine(
  event: string,
  context: Record<string, unknown>,
  outcome: 'success' | 'failure' = 'success',
): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'warn' : 'info',
    service: 'broadcast',
    event,
    outcome,
    ...(outcome === 'failure' ? { error_class: String(context.error_class ?? 'BroadcastHealthError') } : {}),
    context,
  });
}

/**
 * Run one tick. Never throws: a health loop that dies on one bad occurrence stops watching
 * every other class on the platform.
 */
export async function runHealthTick(deps: HealthRunnerDeps): Promise<TickResult> {
  const now = deps.now ?? (() => Date.now());
  const threshold = deps.threshold ?? DEFAULT_MISS_THRESHOLD;
  const log = deps.log ?? ((l: string) => console.warn(l));
  const applyEvent = deps.applyEvent
    ?? ((id: string, health: ProviderHealth, atMs: number) =>
      runProviderEvent(id, { health, occurredAtMs: atMs }, 0));
  const autoEndWindowMs = deps.autoEndWindowMs ?? resolveAutoEndWindowMs();
  const endOccurrence = deps.endOccurrence
    ?? (async (occ: ObservableOccurrence, atMs: number) => {
      // isProducer is true because this IS the producer decision, taken on the producer's
      // behalf by the safety net they asked for. endReason is what keeps the two honest
      // about which one it was.
      const r = await runProducerCommand({
        occurrenceId: occ.id,
        command: 'end',
        expectedVersion: occ.version,
        isProducer: true,
        endReason: 'auto_stream_gone',
        nowMs: atMs,
      });
      return { ok: r.ok, reason: r.reason };
    });

  const result: TickResult = { observed: 0, reported: 0, held: 0, skipped: 0, failed: 0, ended: 0 };

  let occurrences: ObservableOccurrence[];
  try {
    occurrences = await deps.loadObservable();
  } catch (err: any) {
    log(logLine('broadcast_health_tick_failed', { error: err?.message ?? 'unknown' }, 'failure'));
    return { ...result, failed: 1 };
  }

  // Stop tracking anything no longer on air, so the map cannot grow for the life of the
  // process. An occurrence that ended last week must not keep a counter forever.
  const liveIds = new Set(occurrences.map((o) => o.id));
  Array.from(misses.keys()).forEach((id) => { if (!liveIds.has(id)) misses.delete(id); });
  Array.from(goneSince.keys()).forEach((id) => { if (!liveIds.has(id)) goneSince.delete(id); });

  for (const occ of occurrences) {
    // An occurrence with no provider binding cannot be observed at all. That is L5.4's gap,
    // not a health fault, so it is skipped rather than reported as down.
    if (!occ.provider_session_id) {
      result.skipped += 1;
      continue;
    }

    result.observed += 1;
    let observation: Observation;
    try {
      observation = (await deps.observe(occ)) ? 'live' : 'absent';
    } catch {
      observation = 'unreadable';
    }

    const decision = decideHealth(
      observation,
      occ.editorial_state as ObservedState,
      misses.get(occ.id) ?? 0,
      threshold,
    );
    misses.set(occ.id, decision.misses);

    /**
     * Ending is considered BEFORE reporting health, and the two are mutually exclusive for a
     * given tick. Reporting first would bump the row's version, leaving the version this tick
     * is holding stale and every auto-end losing to its own health write with a 409 — a bug
     * that would look exactly like "the safety net does not work" and would only ever appear
     * in production. There is also nothing to say about the health of a broadcast that is
     * about to be over.
     */
    const autoEnd = decideAutoEnd({
      state: occ.editorial_state as ObservedState,
      observation,
      goneSinceMs: goneSince.get(occ.id) ?? null,
      nowMs: now(),
      windowMs: autoEndWindowMs,
    });
    if (autoEnd.goneSinceMs === null) goneSince.delete(occ.id);
    else goneSince.set(occ.id, autoEnd.goneSinceMs);

    if (autoEnd.end) {
      try {
        const outcome = await endOccurrence(occ, now());
        if (outcome.ok) {
          result.ended += 1;
          // Forget the clock immediately. The occurrence leaves the observed set next tick,
          // but a failed read in between must not find a stale run of absence waiting.
          goneSince.delete(occ.id);
          misses.delete(occ.id);
          log(logLine('broadcast_auto_ended', {
            occurrenceId: occ.id, from: occ.editorial_state,
            goneForMs: autoEnd.goneForMs, windowMs: autoEndWindowMs,
            end_reason: 'auto_stream_gone',
          }));
        } else {
          // A refusal is not a crash: a producer may have ended it a second earlier, in which
          // case the command noops and this never runs. Anything else is worth seeing.
          result.failed += 1;
          log(logLine('broadcast_auto_end_refused', {
            occurrenceId: occ.id, reason: outcome.reason ?? 'unknown',
          }, 'failure'));
        }
      } catch (err: any) {
        result.failed += 1;
        log(logLine('broadcast_auto_end_failed', {
          occurrenceId: occ.id, error: err?.message ?? 'unknown',
        }, 'failure'));
      }
      continue;
    }

    if (decision.report === null) { result.held += 1; continue; }

    try {
      await applyEvent(occ.id, decision.report, now());
      result.reported += 1;
      log(logLine('broadcast_health_reported', {
        occurrenceId: occ.id, health: decision.report, reason: decision.reason,
        from: occ.editorial_state,
      }));
    } catch (err: any) {
      // A failure to record health must not stop the loop reaching the next class.
      result.failed += 1;
      log(logLine('broadcast_health_apply_failed', {
        occurrenceId: occ.id, error: err?.message ?? 'unknown',
      }, 'failure'));
    }
  }

  return result;
}
