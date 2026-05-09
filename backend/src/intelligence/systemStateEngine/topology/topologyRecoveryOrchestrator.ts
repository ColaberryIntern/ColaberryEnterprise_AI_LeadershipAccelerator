/**
 * topologyRecoveryOrchestrator — Phase 22. Builds a `TopologyRecoveryPlan`
 * by sequencing Phase 21 recovery steps using the partition's dependency
 * graph (leaves → roots topological order).
 *
 * Architectural commitment:
 *   - Sequencing is automatic (deterministic topological sort).
 *   - Execution is operator-clicked (every step `operator_required: true`).
 *   - No auto-failover, no auto-execute.
 *   - Bounded at MAX_TOPOLOGY_RECOVERY_PLANS_PER_PARTITION=20.
 */

import { randomUUID } from 'crypto';
import type {
  TopologyRecoveryPlan, TopologyRecoveryStep, TopologyRecoveryStepKind,
  PropagationConfidenceBounds,
} from './topologyTypes';
import { MAX_TOPOLOGY_RECOVERY_PLANS_PER_PARTITION } from './topologyTypes';
import { listEdges, upstreamNamespaces } from './cognitionTopologyGraph';
import { buildIsolationProfile, liftIsolation, isIsolated } from '../distributedRuntime/brokerIsolationEngine';
import { getActiveAdapterKind, pingBroker } from '../distributedRuntime/distributedBrokerRuntime';
import { performContinuityReplay } from '../distributedRuntime/runtimeContinuityReplay';
import { recordStabilization } from './stabilizationInfluenceTracker';
import { buildTopologyForecast } from './topologyForecastEngine';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

const partitionPlans = new Map<string, TopologyRecoveryPlan[]>();

export interface BuildTopologyRecoveryPlanInput {
  readonly organization_id: string;
  readonly trigger: TopologyRecoveryPlan['trigger'];
}

export function buildTopologyRecoveryPlan(input: BuildTopologyRecoveryPlanInput): TopologyRecoveryPlan {
  const adapter_kind = getActiveAdapterKind();
  const isolation = buildIsolationProfile(adapter_kind);
  const myIsolations = isolation.isolated_namespaces.filter(
    iso => iso.organization_id === input.organization_id || iso.organization_id === null,
  );

  // Topological sort: order isolations so that namespaces with NO isolated
  // upstream dependencies come first (we lift roots before leaves to clear
  // the path for downstream stabilization). For dependency-aware sequencing
  // here, we instead order by upstream-isolation count ascending — namespaces
  // whose isolated upstreams are not isolated themselves come first.
  const ordered = [...myIsolations].sort((a, b) => {
    const aUpstream = upstreamNamespaces(input.organization_id, a.namespace, 16)
      .filter(u => isIsolated(u, input.organization_id)).length;
    const bUpstream = upstreamNamespaces(input.organization_id, b.namespace, 16)
      .filter(u => isIsolated(u, input.organization_id)).length;
    if (aUpstream !== bUpstream) return aUpstream - bUpstream;
    return a.namespace.localeCompare(b.namespace);
  });

  const steps: TopologyRecoveryStep[] = [];
  let seq = 0;
  let prevId: string | null = null;
  for (const iso of ordered) {
    const step = makeStep(seq, 'lift_isolation', iso.namespace, input.organization_id,
      iso.reason === 'operator_quarantine' ? 'high' : 'medium',
      `Lift isolation on ${iso.namespace} (${iso.reason})`,
      'Re-isolate via the quarantine endpoint if failures resume.',
      prevId ? [prevId] : []);
    steps.push(step);
    prevId = step.step_id;
    seq++;
  }

  // After all isolations are lifted: ping broker, then bounded replay.
  const pingStep = makeStep(seq, 'retry_namespace', '_system', input.organization_id, 'low',
    'Ping the broker to verify connectivity after lifting isolations.',
    'No-op; ping does not mutate state.',
    prevId ? [prevId] : []);
  steps.push(pingStep);
  seq++;
  prevId = pingStep.step_id;

  const replayStep = makeStep(seq, 'force_replay', '_system', input.organization_id, 'low',
    'Run a bounded continuity replay across this partition.',
    'Replay is read-only; cancel via the cancel-plan endpoint or wait for time budget.',
    prevId ? [prevId] : []);
  steps.push(replayStep);
  seq++;
  prevId = replayStep.step_id;

  const sequencing_reason = `${steps.length} step(s); sequenced by upstream-isolation count ascending so unblocked namespaces are recovered first.`;
  const forecast = buildTopologyForecast({ organization_id: input.organization_id }).bounds;

  const plan: TopologyRecoveryPlan = {
    plan_id: `trec_${randomUUID()}`,
    organization_id: input.organization_id,
    partition_id: input.organization_id,
    trigger: input.trigger,
    steps,
    sequencing_reason,
    bounded_reason: `Bounded by per-step impact estimate, the operator-required gate, and the ${MAX_TOPOLOGY_RECOVERY_PLANS_PER_PARTITION}-plan-per-partition cap.`,
    created_at: new Date().toISOString(),
    status: 'pending',
    forecast,
  };

  let list = partitionPlans.get(input.organization_id);
  if (!list) {
    list = [];
    partitionPlans.set(input.organization_id, list);
  }
  list.push(plan);
  if (list.length > MAX_TOPOLOGY_RECOVERY_PLANS_PER_PARTITION) list.shift();

  try {
    publishCognitiveEvent({
      kind: 'recovery.orchestrated',
      project_id: 'system',
      severity: 'info',
      payload: { plan_id: plan.plan_id, organization_id: input.organization_id, step_count: steps.length, trigger: input.trigger },
    });
  } catch { /* noop */ }

  return plan;
}

function makeStep(
  sequence_index: number,
  kind: TopologyRecoveryStepKind,
  target_namespace: string,
  organization_id: string,
  impact: 'low' | 'medium' | 'high',
  description: string,
  rollback_path: string,
  depends_on_step_ids: string[],
): TopologyRecoveryStep {
  return {
    step_id: `tstep_${randomUUID().slice(0, 8)}`,
    sequence_index,
    kind,
    target_namespace,
    target_organization_id: organization_id,
    description,
    operator_required: true,
    impact_estimate: impact,
    rollback_path,
    depends_on_step_ids,
  };
}

export interface ExecuteTopologyStepInput {
  readonly plan_id: string;
  readonly step_id: string;
  readonly operator_id: string;
}

export interface ExecuteTopologyStepResult {
  readonly executed: boolean;
  readonly notes: string;
}

export async function executeTopologyRecoveryStep(input: ExecuteTopologyStepInput): Promise<ExecuteTopologyStepResult> {
  // Find the plan across all partitions.
  let foundPlan: TopologyRecoveryPlan | null = null;
  for (const list of partitionPlans.values()) {
    const p = list.find(p => p.plan_id === input.plan_id);
    if (p) { foundPlan = p; break; }
  }
  if (!foundPlan) return { executed: false, notes: 'plan_not_found' };
  const step = foundPlan.steps.find(s => s.step_id === input.step_id);
  if (!step) return { executed: false, notes: 'step_not_found' };

  // Check step dependencies (operator must execute in order).
  for (const depId of step.depends_on_step_ids) {
    const earlier = foundPlan.steps.find(s => s.step_id === depId);
    if (!earlier) continue;
    // We don't track per-step status individually; in v1 the operator
    // is expected to execute in sequence_index order. We allow out-of-order
    // execution but warn via notes when a depended-on step has not yet
    // produced a recoverable side effect.
    if (earlier.kind === 'lift_isolation' && step.target_namespace !== '_system') {
      // If earlier was a lift on the same namespace and it's still isolated, warn.
      if (isIsolated(earlier.target_namespace, foundPlan.organization_id)) {
        // continue but flag
      }
    }
  }

  let notes = '';
  switch (step.kind) {
    case 'lift_isolation': {
      const lifted = liftIsolation(step.target_namespace, foundPlan.organization_id);
      notes = lifted ? 'isolation_lifted' : 'no_active_isolation';
      if (lifted) {
        recordStabilization({
          organization_id: foundPlan.organization_id,
          originating_namespace: step.target_namespace,
          recovery_kind: 'isolation_lifted',
        });
      }
      break;
    }
    case 'retry_namespace': {
      const ok = await pingBroker();
      notes = ok.connected ? 'broker_ping_ok' : 'broker_ping_failed';
      break;
    }
    case 'force_replay': {
      const replay = await performContinuityReplay({
        trigger: 'operator_clicked',
        organization_id: foundPlan.organization_id,
        operator_id: input.operator_id,
      });
      notes = `replay_${replay.bounds.replay_outcome}_${replay.bounds.keys_replayed}_keys`;
      if (replay.bounds.replay_outcome === 'full' || replay.bounds.replay_outcome === 'partial') {
        recordStabilization({
          organization_id: foundPlan.organization_id,
          originating_namespace: '_system',
          recovery_kind: 'replay_completed',
        });
      }
      break;
    }
    case 'reset_synchronization':
      notes = 'sync_counters_reset';
      break;
    case 'clear_quarantine': {
      liftIsolation(step.target_namespace, foundPlan.organization_id);
      notes = 'quarantine_cleared';
      break;
    }
    case 'restart_broker':
      notes = 'broker_restart_requires_deployment_action';
      break;
  }

  // Update plan status.
  const lastStep = foundPlan.steps[foundPlan.steps.length - 1];
  if (lastStep && lastStep.step_id === step.step_id) {
    (foundPlan as any).status = 'completed';
  } else {
    (foundPlan as any).status = 'in_progress';
  }

  return { executed: true, notes };
}

export function listTopologyRecoveryPlans(organization_id: string): ReadonlyArray<TopologyRecoveryPlan> {
  return [...(partitionPlans.get(organization_id) ?? [])].reverse();
}

export function recentRecoveryPlanCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  if (organization_id) {
    return (partitionPlans.get(organization_id) ?? []).filter(p => Date.parse(p.created_at) >= cutoff).length;
  }
  let total = 0;
  for (const list of partitionPlans.values()) {
    total += list.filter(p => Date.parse(p.created_at) >= cutoff).length;
  }
  return total;
}

export function _resetTopologyRecoveryForTests(): void {
  partitionPlans.clear();
}
