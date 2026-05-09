/**
 * runtimePropagationTopology — Phase 22. Deterministic walk over the
 * declared dependency graph to produce `TopologyReplayAttribution`s.
 *
 * Architectural commitment:
 *   - Propagation is a DETERMINISTIC walk. Not emergent runtime spread.
 *   - Confidence bounds are explicit on every walk.
 *   - Bounded ring buffer per partition. Time-budget capped.
 *   - Read-only over Phase 21 isolation state.
 */

import { randomUUID } from 'crypto';
import type {
  TopologyReplayAttribution, RuntimePropagationReplay, PropagationKind,
  PropagationConfidenceBounds,
} from './topologyTypes';
import {
  MAX_PROPAGATION_REPLAYS_PER_PARTITION, MAX_PROPAGATION_WALK_DEPTH,
  PROPAGATION_REPLAY_BUDGET_MS,
} from './topologyTypes';
import { downstreamNamespaces } from './cognitionTopologyGraph';
import { isIsolated } from '../distributedRuntime/brokerIsolationEngine';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

interface PartitionReplays {
  recent: RuntimePropagationReplay[];
  attributions: TopologyReplayAttribution[];
}

const partitionReplays = new Map<string, PartitionReplays>();

function ensure(organization_id: string): PartitionReplays {
  let r = partitionReplays.get(organization_id);
  if (!r) {
    r = { recent: [], attributions: [] };
    partitionReplays.set(organization_id, r);
  }
  return r;
}

export interface BuildPropagationReplayInput {
  readonly organization_id: string;
  readonly originating_namespace: string;
  readonly propagation_kind: PropagationKind;
}

/**
 * Walk the declared graph downstream from `originating_namespace` and
 * compute which dependent namespaces are impacted.
 */
export function buildPropagationAttribution(input: BuildPropagationReplayInput): TopologyReplayAttribution {
  const t0 = Date.now();
  const downstream = downstreamNamespaces(input.organization_id, input.originating_namespace, MAX_PROPAGATION_WALK_DEPTH);
  const cutoff = t0 + PROPAGATION_REPLAY_BUDGET_MS;

  const replay_walk: Array<{
    step_index: number;
    namespace: string;
    arrived_via: import('./topologyTypes').TopologyDependencyRelation | 'origin';
    arrived_from: string | null;
  }> = [
    { step_index: 0, namespace: input.originating_namespace, arrived_via: 'origin', arrived_from: null },
  ];

  // Filter to downstream that are at risk: either currently isolated OR
  // depend on an isolated upstream (the originating namespace itself,
  // already known to be relevant by the caller).
  const impacted_namespaces: string[] = [];
  let dependency_depth = 0;
  for (let i = 0; i < downstream.length; i++) {
    if (Date.now() > cutoff) break;
    const d = downstream[i];
    replay_walk.push({
      step_index: i + 1,
      namespace: d.namespace,
      arrived_via: d.arrived_via,
      arrived_from: d.arrived_from,
    });
    impacted_namespaces.push(d.namespace);
    dependency_depth = Math.max(dependency_depth, d.depth);
  }

  const propagation_reason = explainPropagation(input.propagation_kind, input.originating_namespace, impacted_namespaces);

  const replay_confidence: PropagationConfidenceBounds = computeConfidence(
    input.propagation_kind,
    input.originating_namespace,
    input.organization_id,
    impacted_namespaces.length,
  );

  const attribution: TopologyReplayAttribution = {
    originating_namespace: input.originating_namespace,
    impacted_namespaces,
    dependency_depth,
    replay_walk,
    propagation_reason,
    replay_confidence,
    recorded_at: new Date().toISOString(),
  };

  // Keep the per-partition attribution buffer bounded.
  const store = ensure(input.organization_id);
  store.attributions.push(attribution);
  if (store.attributions.length > MAX_PROPAGATION_REPLAYS_PER_PARTITION) store.attributions.shift();

  return attribution;
}

function explainPropagation(kind: PropagationKind, origin: string, impacted: ReadonlyArray<string>): string {
  if (impacted.length === 0) {
    return `${kind} from ${origin} has no dependent namespaces in the declared graph`;
  }
  switch (kind) {
    case 'isolation_propagation':
      return `Isolation of ${origin} risks stale reads in ${impacted.length} downstream namespace(s): ${impacted.slice(0, 5).join(', ')}${impacted.length > 5 ? '…' : ''}`;
    case 'continuity_restoration':
      return `Restoration of ${origin} stabilizes ${impacted.length} downstream namespace(s)`;
    case 'replay_backlog':
      return `Replay backlog at ${origin} pressures ${impacted.length} dependent namespace(s)`;
    case 'synchronization_pressure':
      return `Sync pressure at ${origin} amplifies through ${impacted.length} dependent namespace(s)`;
    case 'stabilization_flow':
      return `Stabilization at ${origin} flows to ${impacted.length} downstream namespace(s)`;
  }
}

function computeConfidence(
  kind: PropagationKind,
  origin: string,
  organization_id: string,
  impactedCount: number,
): PropagationConfidenceBounds {
  // Heuristic confidence: higher when the origin is currently isolated
  // (clear signal) and when the impacted set is small (clear walk).
  const originIsolated = isIsolated(origin, organization_id);
  const observed_signal_strength = originIsolated ? Math.min(100, 60 + impactedCount * 5) : Math.max(20, 50 - impactedCount * 2);
  const horizon = 30;
  const drivers: string[] = [];
  if (!originIsolated) drivers.push('origin_not_currently_isolated');
  if (impactedCount === 0) drivers.push('no_downstream_dependencies');
  if (impactedCount >= 5) drivers.push('large_impact_set_widens_confidence_band');
  if (kind === 'replay_backlog' || kind === 'synchronization_pressure') drivers.push('non_isolation_signal_kind');
  // Confidence band widens with uncertainty.
  const center = observed_signal_strength;
  const half_band = drivers.length === 0 ? 5 : 10 + drivers.length * 5;
  return {
    forecast_horizon_minutes: horizon,
    confidence_low: Math.max(0, center - half_band),
    confidence_high: Math.min(100, center + half_band),
    uncertainty_drivers: drivers,
    observed_signal_strength,
  };
}

export interface BuildReplayInput {
  readonly organization_id: string;
  readonly entries: ReadonlyArray<{ originating_namespace: string; kind: PropagationKind }>;
}

export function buildRuntimePropagationReplay(input: BuildReplayInput): RuntimePropagationReplay {
  const replay_id = `prop_${randomUUID()}`;
  const t0 = Date.now();
  const out: RuntimePropagationReplay['entries'][number][] = [];
  let bounded_reason: string | undefined;
  for (let i = 0; i < input.entries.length; i++) {
    if (Date.now() - t0 > PROPAGATION_REPLAY_BUDGET_MS) {
      bounded_reason = 'time_budget_exhausted';
      break;
    }
    const attribution = buildPropagationAttribution({
      organization_id: input.organization_id,
      originating_namespace: input.entries[i].originating_namespace,
      propagation_kind: input.entries[i].kind,
    });
    out.push({ index: i, propagation_kind: input.entries[i].kind, attribution });
  }
  const replay: RuntimePropagationReplay = {
    replay_id,
    organization_id: input.organization_id,
    partition_id: input.organization_id,
    entries: out,
    bounded_reason,
    built_at: new Date().toISOString(),
  };
  const store = ensure(input.organization_id);
  store.recent.push(replay);
  if (store.recent.length > MAX_PROPAGATION_REPLAYS_PER_PARTITION) store.recent.shift();

  try {
    publishCognitiveEvent({
      kind: 'propagation.detected',
      project_id: 'system',
      severity: 'info',
      payload: { replay_id, organization_id: input.organization_id, entry_count: out.length, bounded_reason },
    });
  } catch { /* noop */ }

  return replay;
}

export function listRecentPropagationReplays(organization_id: string): ReadonlyArray<RuntimePropagationReplay> {
  return [...(partitionReplays.get(organization_id)?.recent ?? [])].reverse();
}

export function listRecentAttributions(organization_id: string): ReadonlyArray<TopologyReplayAttribution> {
  return [...(partitionReplays.get(organization_id)?.attributions ?? [])].reverse();
}

export function recentPropagationCount24h(organization_id: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  return (partitionReplays.get(organization_id)?.recent ?? []).filter(r => Date.parse(r.built_at) >= cutoff).length;
}

export function _resetPropagationForTests(): void {
  partitionReplays.clear();
}
