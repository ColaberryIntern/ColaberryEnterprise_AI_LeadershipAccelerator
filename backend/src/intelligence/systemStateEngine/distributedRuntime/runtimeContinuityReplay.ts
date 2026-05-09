/**
 * runtimeContinuityReplay — Phase 21. Bounded re-read of broker state
 * across namespaces, used to restore caches after broker reconnect /
 * isolation lift / boot.
 *
 * Architectural commitment:
 *   - Replay is RECONSTRUCTIVE (re-read existing keys), not
 *     synchronization (no convergence with peer nodes — there are none).
 *   - Bounded by `ContinuityReplayBounds`: keys_replayed cap, namespaces
 *     cap, time-budget cap. The bounds are reported in the result so
 *     consumers know exactly what was visited.
 *   - Idempotent. A second replay reads the same keys; no side effects
 *     beyond the broker reads themselves.
 */

import { randomUUID } from 'crypto';
import type {
  BrokerAdapterKind, ContinuityReplayBounds, ReplayOutcome,
  RuntimeContinuityReplay,
} from './distributedRuntimeTypes';
import {
  MAX_REPLAY_KEYS_PER_RUN, MAX_REPLAY_NAMESPACES_PER_RUN, MAX_REPLAY_TIME_BUDGET_MS,
  MAX_RECOVERY_PLANS_PER_NODE,
} from './distributedRuntimeTypes';
import { getActiveAdapter, getActiveAdapterKind } from './distributedBrokerRuntime';
import { BROKER_NAMESPACES } from '../federatedLearning/persistentFederationBroker';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

const recentReplays: RuntimeContinuityReplay[] = [];

export interface PerformReplayInput {
  readonly trigger: RuntimeContinuityReplay['trigger'];
  /** When set, replay only this org. When null, replay all orgs. */
  readonly organization_id?: string | null;
  readonly operator_id?: string;
  /** Restrict to specific namespaces. Defaults to all known. */
  readonly namespaces?: ReadonlyArray<string>;
}

export async function performContinuityReplay(input: PerformReplayInput): Promise<RuntimeContinuityReplay> {
  const adapter = getActiveAdapter();
  const adapter_kind: BrokerAdapterKind = getActiveAdapterKind();
  const replay_id = `replay_${randomUUID()}`;
  const startedMs = Date.now();
  const started_at = new Date(startedMs).toISOString();

  const orgs = input.organization_id != null
    ? [input.organization_id]
    : await adapter.listOrganizations();

  const candidateNamespaces = input.namespaces && input.namespaces.length > 0
    ? input.namespaces
    : Object.values(BROKER_NAMESPACES);

  const namespaces = candidateNamespaces.slice(0, MAX_REPLAY_NAMESPACES_PER_RUN);

  let keys_replayed = 0;
  let namespaces_visited = 0;
  let bounded_reason: string | undefined;
  let outcome: ReplayOutcome = 'full';
  const per_namespace: Array<{ namespace: string; keys_visited: number; outcome: ReplayOutcome; notes?: string }> = [];

  outer: for (const org of orgs) {
    for (const ns of namespaces) {
      // Time budget check
      if (Date.now() - startedMs > MAX_REPLAY_TIME_BUDGET_MS) {
        bounded_reason = 'time_budget_exhausted';
        outcome = 'partial';
        break outer;
      }
      let keys: ReadonlyArray<string> = [];
      let perNsOutcome: ReplayOutcome = 'full';
      let notes: string | undefined;
      try {
        keys = await adapter.listKeys(org, ns);
      } catch (err: any) {
        const failedOutcome: ReplayOutcome = 'failed';
        perNsOutcome = failedOutcome;
        notes = err?.message ?? 'listKeys_failed';
        per_namespace.push({ namespace: `${org}:${ns}`, keys_visited: 0, outcome: perNsOutcome, notes });
        outcome = 'partial';
        continue;
      }

      // Cap per-run total
      const remaining = MAX_REPLAY_KEYS_PER_RUN - keys_replayed;
      if (remaining <= 0) {
        bounded_reason = 'key_cap_reached';
        outcome = 'partial';
        break outer;
      }
      const slice = keys.slice(0, remaining);
      for (const k of slice) {
        try {
          await adapter.get(org, ns, k);
          keys_replayed++;
        } catch (err: any) {
          perNsOutcome = perNsOutcome === 'full' ? 'partial' : perNsOutcome;
          notes = (notes ? notes + '; ' : '') + (err?.message ?? 'get_failed');
        }
      }
      if (slice.length < keys.length) {
        bounded_reason = bounded_reason ?? 'key_cap_reached';
        outcome = 'partial';
      }
      per_namespace.push({ namespace: `${org}:${ns}`, keys_visited: slice.length, outcome: perNsOutcome, notes });
      namespaces_visited++;
    }
  }

  const time_elapsed_ms = Date.now() - startedMs;
  const completed_at = new Date().toISOString();
  if (orgs.length === 0) {
    outcome = 'skipped';
    bounded_reason = bounded_reason ?? 'no_organizations';
  }

  const bounds: ContinuityReplayBounds = {
    keys_replayed,
    namespaces_visited,
    time_elapsed_ms,
    adapter_kind,
    replay_outcome: outcome,
    bounded_reason,
  };

  const replay: RuntimeContinuityReplay = {
    replay_id,
    organization_id: input.organization_id ?? null,
    bounds,
    started_at,
    completed_at,
    per_namespace,
    trigger: input.trigger,
    operator_id: input.operator_id,
  };

  recentReplays.push(replay);
  if (recentReplays.length > MAX_RECOVERY_PLANS_PER_NODE) recentReplays.shift();

  try {
    publishCognitiveEvent({
      kind: 'replay.restored',
      project_id: 'system',
      severity: outcome === 'partial' || per_namespace.some(n => n.outcome === 'failed') ? 'warning' : 'info',
      payload: { replay_id, trigger: input.trigger, bounds },
    });
  } catch { /* noop */ }

  return replay;
}

export function listRecentReplays(): ReadonlyArray<RuntimeContinuityReplay> {
  return [...recentReplays].reverse();
}

export function recentReplayCount24h(): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  return recentReplays.filter(r => Date.parse(r.completed_at) >= cutoff).length;
}

export function _resetReplayForTests(): void {
  recentReplays.length = 0;
}
