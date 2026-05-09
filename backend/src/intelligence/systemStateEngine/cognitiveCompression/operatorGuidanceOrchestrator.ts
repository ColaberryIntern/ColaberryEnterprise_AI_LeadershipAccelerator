/**
 * operatorGuidanceOrchestrator — Phase 24. Ranks the EXISTING
 * operator-clickable actions from Phases 21/22/23 by deterministic
 * urgency scores. Phase 24 changes the order, never the menu.
 *
 * Architectural commitment:
 *   - Item set is bounded: only the existing operator endpoints from
 *     Phases 21/22/23 may appear.
 *   - Every guidance item carries a `GuidanceRankingAttribution` that
 *     explains WHY it was ranked at its position.
 *   - Bounded at MAX_GUIDANCE_ITEMS_PER_PLAN.
 */

import { randomUUID } from 'crypto';
import type {
  OperatorGuidancePlan, GuidanceItem, GuidanceRankingAttribution,
  GuidanceActionKind, GuidanceRankingRule, NarrativeCitation,
} from './cognitiveCompressionTypes';
import {
  MAX_GUIDANCE_ITEMS_PER_PLAN, MAX_GUIDANCE_PLANS_PER_PARTITION,
} from './cognitiveCompressionTypes';
import { buildIsolationProfile as buildBrokerIsolationProfile } from '../distributedRuntime/brokerIsolationEngine';
import { getActiveAdapterKind } from '../distributedRuntime/distributedBrokerRuntime';
import { buildIsolationProfile as buildExecIsolationProfile } from '../executionSubstrate/executionIsolationEngine';
import { buildTopologyFragmentationProfile } from '../topology/topologyFragmentationDetector';
import { listTopologyRecoveryPlans } from '../topology/topologyRecoveryOrchestrator';
import { recentLifecycleCount24h } from '../executionSubstrate/executionRuntimeCoordinator';
import { recentReplayCount24h } from '../distributedRuntime/runtimeContinuityReplay';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

const partitionPlans = new Map<string, OperatorGuidancePlan[]>();

function ensure(organization_id: string): OperatorGuidancePlan[] {
  let p = partitionPlans.get(organization_id);
  if (!p) {
    p = [];
    partitionPlans.set(organization_id, p);
  }
  return p;
}

export interface BuildGuidancePlanInput {
  readonly organization_id: string;
}

export function buildOperatorGuidancePlan(input: BuildGuidancePlanInput): OperatorGuidancePlan {
  const items: GuidanceItem[] = [];

  // ── Rule 1: broker isolations block partitions → highest urgency ──
  const brokerIso = buildBrokerIsolationProfile(getActiveAdapterKind());
  const orgBrokerIso = brokerIso.isolated_namespaces.filter(
    i => i.organization_id === input.organization_id || i.organization_id === null,
  );
  for (const iso of orgBrokerIso.slice(0, 3)) {
    items.push(buildItem({
      action_kind: 'lift_broker_isolation',
      urgency_score: 90,
      ranked_by_rule: 'broker_isolation_blocks_partition',
      operator_clickable_phase: 'phase_21_runtime',
      target_namespace: iso.namespace,
      target_organization_id: input.organization_id,
      target_endpoint_hint: 'POST /api/portal/project/distributed-runtime/isolations/lift',
      ranking_reason: `broker namespace ${iso.namespace} for org=${iso.organization_id ?? 'global'} is currently isolated; lifting unblocks dependent workers`,
      sources: [{
        source_kind: 'broker_isolation', source_id: `${iso.namespace}::${iso.organization_id ?? '*'}`,
        source_phase: 'phase_21_runtime', recorded_at: iso.isolated_since,
        fragment_quoted: iso.explanation,
      }],
    }));
  }

  // ── Rule 2: topology fragmented above pressure threshold ──
  const fragmentation = buildTopologyFragmentationProfile(input.organization_id);
  const existingTopologyPlans = listTopologyRecoveryPlans(input.organization_id).filter(p => p.status === 'pending').length;
  if (fragmentation.tier === 'fragmented' || fragmentation.tier === 'shattered') {
    if (existingTopologyPlans > 0) {
      items.push(buildItem({
        action_kind: 'execute_topology_recovery_step',
        urgency_score: 80,
        ranked_by_rule: 'pending_recovery_plan_already_exists',
        operator_clickable_phase: 'phase_22_topology',
        target_organization_id: input.organization_id,
        target_endpoint_hint: 'POST /api/portal/project/topology/recovery-plans/:plan_id/steps/:step_id/execute',
        ranking_reason: `topology is ${fragmentation.tier} (pressure ${fragmentation.fragmentation_pressure_score}/100); ${existingTopologyPlans} pending recovery plan(s) — execute next step rather than build a new plan`,
        sources: [{
          source_kind: 'topology_fragmentation_profile',
          source_id: `frag:${fragmentation.organization_id}:${fragmentation.built_at}`,
          source_phase: 'phase_22_topology',
          recorded_at: fragmentation.built_at,
          fragment_quoted: `tier=${fragmentation.tier}, pressure=${fragmentation.fragmentation_pressure_score}`,
        }],
      }));
    } else {
      items.push(buildItem({
        action_kind: 'build_topology_recovery_plan',
        urgency_score: fragmentation.tier === 'shattered' ? 95 : 75,
        ranked_by_rule: 'topology_fragmented_above_pressure_threshold',
        operator_clickable_phase: 'phase_22_topology',
        target_organization_id: input.organization_id,
        target_endpoint_hint: 'POST /api/portal/project/topology/recovery-plans',
        ranking_reason: `topology is ${fragmentation.tier} (pressure ${fragmentation.fragmentation_pressure_score}/100) and no pending recovery plan exists`,
        sources: [{
          source_kind: 'topology_fragmentation_profile',
          source_id: `frag:${fragmentation.organization_id}:${fragmentation.built_at}`,
          source_phase: 'phase_22_topology',
          recorded_at: fragmentation.built_at,
          fragment_quoted: `tier=${fragmentation.tier}, pressure=${fragmentation.fragmentation_pressure_score}`,
        }],
      }));
    }
  }

  // ── Rule 3: execution kind isolations block workers ──
  const execIso = buildExecIsolationProfile();
  const orgExecIso = execIso.isolated_kinds.filter(i => i.organization_id === input.organization_id);
  for (const iso of orgExecIso.slice(0, 3)) {
    items.push(buildItem({
      action_kind: 'lift_execution_isolation',
      urgency_score: 70,
      ranked_by_rule: 'execution_kind_isolated_blocks_workers',
      operator_clickable_phase: 'phase_23_execution_substrate',
      target_kind: iso.kind,
      target_organization_id: input.organization_id,
      target_endpoint_hint: 'POST /api/portal/project/execution-substrate/isolation/lift',
      ranking_reason: `execution kind=${iso.kind} for org=${iso.organization_id} is isolated; lifting unblocks future registrations`,
      sources: [{
        source_kind: 'execution_isolation_profile',
        source_id: `exec_iso:${iso.kind}@${iso.organization_id}`,
        source_phase: 'phase_23_execution_substrate',
        recorded_at: iso.isolated_since,
        fragment_quoted: iso.explanation,
      }],
    }));
  }

  // ── Rule 4: recent worker failure burst ──
  const lifecycle = recentLifecycleCount24h();
  if (lifecycle.failed >= 3) {
    items.push(buildItem({
      action_kind: 'review_governance_decision',
      urgency_score: 60,
      ranked_by_rule: 'recent_worker_failures_burst',
      operator_clickable_phase: 'phase_23_execution_substrate',
      target_organization_id: input.organization_id,
      target_endpoint_hint: 'GET /api/portal/project/execution-substrate/governance',
      ranking_reason: `${lifecycle.failed} worker failures in 24h — review governance attributions for patterns`,
      sources: [{
        source_kind: 'execution_lifecycle_count_24h',
        source_id: `lifecycle:${new Date().toISOString().slice(0, 10)}`,
        source_phase: 'phase_23_execution_substrate',
        recorded_at: new Date().toISOString(),
        fragment_quoted: `failed_24h=${lifecycle.failed}`,
      }],
    }));
  }

  // ── Rule 5: replay backlog above threshold ──
  const replay_backlog = recentReplayCount24h();
  if (replay_backlog >= 5) {
    items.push(buildItem({
      action_kind: 'force_continuity_replay',
      urgency_score: 50,
      ranked_by_rule: 'replay_backlog_above_threshold',
      operator_clickable_phase: 'phase_21_runtime',
      target_organization_id: input.organization_id,
      target_endpoint_hint: 'POST /api/portal/project/distributed-runtime/replay',
      ranking_reason: `${replay_backlog} continuity replays in 24h indicates broker pressure; force a fresh replay to consolidate`,
      sources: [{
        source_kind: 'runtime_continuity_replay_count_24h',
        source_id: `replay24h:${new Date().toISOString().slice(0, 10)}`,
        source_phase: 'phase_21_runtime',
        recorded_at: new Date().toISOString(),
        fragment_quoted: `replay_count_24h=${replay_backlog}`,
      }],
    }));
  }

  // Sort by urgency descending, then bound.
  items.sort((a, b) => b.attribution.urgency_score - a.attribution.urgency_score);
  const bounded = items.slice(0, MAX_GUIDANCE_ITEMS_PER_PLAN);

  // Default-floor guidance when nothing is urgent.
  if (bounded.length === 0) {
    bounded.push(buildItem({
      action_kind: 'review_governance_decision',
      urgency_score: 10,
      ranked_by_rule: 'no_active_signal_default_floor',
      operator_clickable_phase: 'phase_23_execution_substrate',
      target_organization_id: input.organization_id,
      target_endpoint_hint: 'GET /api/portal/project/execution-substrate/governance',
      ranking_reason: 'no urgent operational signals detected; reviewing recent governance is a low-cost periodic check',
      sources: [{
        source_kind: 'no_signal_floor',
        source_id: `floor:${input.organization_id}:${new Date().toISOString()}`,
        source_phase: 'phase_23_execution_substrate',
        recorded_at: new Date().toISOString(),
        fragment_quoted: 'no urgent operational signals detected',
      }],
    }));
  }

  const plan: OperatorGuidancePlan = {
    plan_id: `guide_${randomUUID()}`,
    organization_id: input.organization_id,
    items: bounded,
    bounded_reason: items.length > MAX_GUIDANCE_ITEMS_PER_PLAN
      ? `truncated_to_${MAX_GUIDANCE_ITEMS_PER_PLAN}_of_${items.length}`
      : 'all_items_included',
    built_at: new Date().toISOString(),
  };

  const list = ensure(input.organization_id);
  list.push(plan);
  if (list.length > MAX_GUIDANCE_PLANS_PER_PARTITION) list.shift();

  try {
    publishCognitiveEvent({
      kind: 'guidance.generated',
      project_id: 'system',
      severity: 'info',
      payload: {
        plan_id: plan.plan_id,
        organization_id: input.organization_id,
        item_count: bounded.length,
      },
    });
  } catch { /* noop */ }

  return plan;
}

interface BuildItemSpec {
  action_kind: GuidanceActionKind;
  urgency_score: number;
  ranked_by_rule: GuidanceRankingRule;
  operator_clickable_phase: import('./cognitiveCompressionTypes').CompressionSourcePhase;
  target_namespace?: string;
  target_kind?: string;
  target_organization_id: string;
  target_endpoint_hint: string;
  ranking_reason: string;
  sources: ReadonlyArray<NarrativeCitation>;
}

function buildItem(spec: BuildItemSpec): GuidanceItem {
  const attribution: GuidanceRankingAttribution = {
    guidance_id: `g_${randomUUID().slice(0, 8)}`,
    action_kind: spec.action_kind,
    urgency_score: spec.urgency_score,
    ranked_by_rule: spec.ranked_by_rule,
    source_attributions: spec.sources,
    operator_clickable_phase: spec.operator_clickable_phase,
    ranking_reason: spec.ranking_reason,
  };
  const target_summary = spec.target_namespace
    ? `${spec.target_namespace}@${spec.target_organization_id}`
    : spec.target_kind
      ? `${spec.target_kind}@${spec.target_organization_id}`
      : spec.target_organization_id;
  return {
    attribution,
    description: `[urgency ${spec.urgency_score}/100] ${spec.action_kind} on ${target_summary} — ranked by ${spec.ranked_by_rule}.`,
    target_namespace: spec.target_namespace,
    target_kind: spec.target_kind,
    target_organization_id: spec.target_organization_id,
    target_endpoint_hint: spec.target_endpoint_hint,
  };
}

export function listOperatorGuidancePlans(organization_id: string): ReadonlyArray<OperatorGuidancePlan> {
  return [...(partitionPlans.get(organization_id) ?? [])].reverse();
}

export function recentGuidancePlanCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  if (organization_id) {
    return (partitionPlans.get(organization_id) ?? []).filter(p => Date.parse(p.built_at) >= cutoff).length;
  }
  let total = 0;
  for (const list of partitionPlans.values()) {
    total += list.filter(p => Date.parse(p.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetGuidanceForTests(): void {
  partitionPlans.clear();
}
