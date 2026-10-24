/**
 * One tick of the replay promotion loop (L8.4).
 *
 * Separate from the health tick on purpose. That one asks a LIVE INPUT whether video is
 * arriving, for shows that are on air. This one asks a RECORDING whether it is playable, for
 * shows that are over. Same cadence, different question, different provider call — folding
 * them together would make one function that does two unrelated jobs and polls the wrong
 * endpoint for half its rows.
 *
 * It holds no rules of its own: `decideReplayPromotion` decides, `applyProducerCommand`
 * arbitrates the transition, and the database arbitrates the version. This is the I/O.
 *
 * Never throws. A promotion loop that dies on one bad occurrence stops publishing replays for
 * every class on the platform, and the symptom — replays that never appear — looks like a
 * product decision rather than a crash.
 */
import { runProducerCommand } from './broadcastCommandService';
import {
  decideReplayPromotion, narrowRecordingState, PROMOTABLE_STATES,
} from './broadcastReplayPolicy';

/** Just enough of the occurrence to decide and to issue a version-guarded command. */
export interface PromotableOccurrence {
  id: string;
  editorial_state: string;
  provider: string | null;
  provider_instance_uuid: string | null;
  version: number;
}

export interface ReplayRunnerDeps {
  /** Occurrences that have finished and might have a replay. Injected for tests. */
  loadPromotable: () => Promise<PromotableOccurrence[]>;
  /** Ask the provider about the recording. A rejection means unreadable, not failed. */
  readRecordingState: (videoUid: string) => Promise<string | null>;
  /** Issue the producer command. Defaults to the real, version-guarded command service. */
  runCommand?: (
    occurrenceId: string,
    command: 'begin_processing' | 'publish_replay',
    expectedVersion: number,
  ) => Promise<{ ok: boolean; reason?: string }>;
  log?: (line: string) => void;
}

export interface ReplayTickResult {
  examined: number;
  promoted: number;
  waiting: number;
  skipped: number;
  failed: number;
}

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
    ...(outcome === 'failure' ? { error_class: String(context.error_class ?? 'BroadcastReplayError') } : {}),
    context,
  });
}

export { PROMOTABLE_STATES };

export async function runReplayTick(deps: ReplayRunnerDeps): Promise<ReplayTickResult> {
  const log = deps.log ?? ((l: string) => console.warn(l));
  const runCommand = deps.runCommand
    ?? (async (occurrenceId, command, expectedVersion) => {
      // isProducer: publishing a replay IS a producer decision, taken on the producer's behalf
      // by the loop that watches for the recording to finish.
      const r = await runProducerCommand({ occurrenceId, command, expectedVersion, isProducer: true });
      return { ok: r.ok, reason: r.reason };
    });

  const result: ReplayTickResult = { examined: 0, promoted: 0, waiting: 0, skipped: 0, failed: 0 };

  let rows: PromotableOccurrence[];
  try {
    rows = await deps.loadPromotable();
  } catch (err: any) {
    log(logLine('broadcast_replay_tick_failed', { error: err?.message ?? 'unknown' }, 'failure'));
    return { ...result, failed: 1 };
  }

  for (const occ of rows) {
    // Nothing to ask about. Counted apart from a refusal so "no recording was ever captured"
    // does not read as "the provider said no".
    if (!occ.provider_instance_uuid) {
      result.skipped += 1;
      continue;
    }

    result.examined += 1;

    let raw: string | null;
    try {
      raw = await deps.readRecordingState(occ.provider_instance_uuid);
    } catch {
      // Our failure to ask. Deliberately NOT narrowed to 'error': Cloudflare being unreachable
      // must never read as Cloudflare saying the recording failed.
      raw = null;
    }
    const state = raw === null ? 'unreadable' : narrowRecordingState(raw);

    const decision = decideReplayPromotion(occ, state);
    if (!decision.command) {
      result.waiting += 1;
      if (decision.reason === 'recording_failed') {
        log(logLine('broadcast_replay_unavailable', {
          occurrenceId: occ.id, videoUid: occ.provider_instance_uuid, providerState: raw,
        }, 'failure'));
      }
      continue;
    }

    try {
      const r = await runCommand(occ.id, decision.command, occ.version);
      if (r.ok) {
        result.promoted += 1;
        log(logLine('broadcast_replay_promoted', {
          occurrenceId: occ.id, from: occ.editorial_state,
          command: decision.command, reason: decision.reason, providerState: raw,
        }));
      } else {
        // A version conflict here is ordinary: the auto-end or a producer may have moved the
        // row a moment ago. The next tick sees the new state and decides again.
        result.failed += 1;
        log(logLine('broadcast_replay_refused', {
          occurrenceId: occ.id, command: decision.command, reason: r.reason ?? 'unknown',
        }, 'failure'));
      }
    } catch (err: any) {
      result.failed += 1;
      log(logLine('broadcast_replay_failed', {
        occurrenceId: occ.id, error: err?.message ?? 'unknown',
      }, 'failure'));
    }
  }

  return result;
}
