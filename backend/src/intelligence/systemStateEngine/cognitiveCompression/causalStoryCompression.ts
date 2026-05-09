/**
 * causalStoryCompression — Phase 24. Compresses Phase 22 propagation
 * walks + Phase 21 isolation events + Phase 23 envelope chains into
 * a deterministic `CausalStoryReplay`.
 *
 * Architectural commitment:
 *   - Walks ALREADY-EXISTING attribution chains. Never infers a chain.
 *   - Each step in the chain cites a Phase-13-23 attribution row by ID.
 *   - Bounded at MAX_CAUSAL_CHAIN_DEPTH=16.
 */

import { randomUUID } from 'crypto';
import type {
  CausalStoryReplay, CompressionSourcePhase, NarrativeCitation,
} from './cognitiveCompressionTypes';
import { MAX_CAUSAL_CHAIN_DEPTH } from './cognitiveCompressionTypes';
import { listRecentAttributions } from '../topology/runtimePropagationTopology';
import { listEnvelopes } from '../executionSubstrate/executionRuntimeCoordinator';
import { listAttributionsForOrg as listExecGovernanceAttributions } from '../executionSubstrate/executionGovernanceSupervisor';
import { buildIsolationProfile as buildBrokerIsolationProfile } from '../distributedRuntime/brokerIsolationEngine';
import { getActiveAdapterKind } from '../distributedRuntime/distributedBrokerRuntime';
import {
  buildBlock, buildOperationalNarrative,
} from './operationalNarrativeBuilder';

export interface BuildCausalStoryInput {
  readonly organization_id: string;
  readonly kind?: CausalStoryReplay['kind'];
  readonly limit?: number;
}

export function buildCausalStoryReplay(input: BuildCausalStoryInput): CausalStoryReplay | null {
  const limit = Math.max(1, Math.min(MAX_CAUSAL_CHAIN_DEPTH, input.limit ?? 8));
  const kind = input.kind ?? 'topology_chain';

  const causal_chain: Array<{
    step_index: number;
    source_phase: CompressionSourcePhase;
    source_id: string;
    summary: string;
    observed_at: string;
  }> = [];
  const blocks: any[] = [];
  let source_event_count = 0;

  // 1. Phase 21 broker isolation context (only if relevant to this org).
  const brokerProfile = buildBrokerIsolationProfile(getActiveAdapterKind());
  const orgBrokerIsolations = brokerProfile.isolated_namespaces.filter(
    i => i.organization_id === input.organization_id || i.organization_id === null,
  );
  source_event_count += orgBrokerIsolations.length;
  for (const iso of orgBrokerIsolations.slice(0, 3)) {
    const stepIndex = causal_chain.length;
    causal_chain.push({
      step_index: stepIndex,
      source_phase: 'phase_21_runtime',
      source_id: `${iso.namespace}::${iso.organization_id ?? '*'}`,
      summary: iso.explanation,
      observed_at: iso.isolated_since,
    });
    const cite: NarrativeCitation = {
      source_kind: 'broker_isolation',
      source_id: `${iso.namespace}::${iso.organization_id ?? '*'}`,
      source_phase: 'phase_21_runtime',
      recorded_at: iso.isolated_since,
      fragment_quoted: iso.explanation,
    };
    blocks.push(buildBlock({
      template_id: iso.reason === 'operator_quarantine' ? 'broker.quarantined.v1' : 'broker.isolated.v1',
      vars: iso.reason === 'operator_quarantine'
        ? { namespace: iso.namespace, organization_id: iso.organization_id ?? 'global', isolated_since: iso.isolated_since }
        : { namespace: iso.namespace, organization_id: iso.organization_id ?? 'global', reason: iso.reason, isolated_since: iso.isolated_since, consecutive_failures: iso.consecutive_failures },
      source_attributions: [cite],
      selection_rule: 'broker_isolation_present',
    }));
  }

  // 2. Phase 22 propagation attributions (most recent first).
  const propagations = listRecentAttributions(input.organization_id).slice(0, limit);
  source_event_count += propagations.length;
  for (const att of propagations.slice(0, 5)) {
    const stepIndex = causal_chain.length;
    causal_chain.push({
      step_index: stepIndex,
      source_phase: 'phase_22_topology',
      source_id: `prop:${att.originating_namespace}@${att.recorded_at}`,
      summary: att.propagation_reason,
      observed_at: att.recorded_at,
    });
    const cite: NarrativeCitation = {
      source_kind: 'topology_replay_attribution',
      source_id: `prop:${att.originating_namespace}@${att.recorded_at}`,
      source_phase: 'phase_22_topology',
      recorded_at: att.recorded_at,
      fragment_quoted: att.propagation_reason,
    };
    blocks.push(buildBlock({
      template_id: 'topology.propagation.v1',
      vars: {
        origin: att.originating_namespace,
        impacted_count: att.impacted_namespaces.length,
        dependency_depth: att.dependency_depth,
        reason: att.propagation_reason,
      },
      source_attributions: [cite],
      selection_rule: 'recent_topology_propagation',
      confidence: {
        low: att.replay_confidence.confidence_low,
        high: att.replay_confidence.confidence_high,
        drivers: att.replay_confidence.uncertainty_drivers,
        inherited_from_source_id: `prop:${att.originating_namespace}@${att.recorded_at}`,
        inherited_from_phase: 'phase_22_topology',
        aggregation_rule: 'single_source',
      },
    }));
  }

  // 3. Phase 23 worker envelopes (failed/interrupted/rolled_back only).
  const envelopes = listEnvelopes(input.organization_id).filter(
    e => e.lifecycle_state === 'failed' || e.lifecycle_state === 'interrupted' || e.lifecycle_state === 'rolled_back',
  );
  source_event_count += envelopes.length;
  for (const env of envelopes.slice(-5).reverse()) {
    const stepIndex = causal_chain.length;
    const summary = env.lifecycle_state === 'failed'
      ? `Worker ${env.kind} failed: ${env.failure_reason ?? 'unknown'}`
      : env.lifecycle_state === 'interrupted'
        ? `Worker ${env.kind} was interrupted`
        : `Worker ${env.kind} was rolled back`;
    causal_chain.push({
      step_index: stepIndex,
      source_phase: 'phase_23_execution_substrate',
      source_id: env.worker_id,
      summary,
      observed_at: env.attribution[env.attribution.length - 1]?.recorded_at ?? env.started_at,
    });
    const cite: NarrativeCitation = {
      source_kind: 'execution_worker_envelope',
      source_id: env.worker_id,
      source_phase: 'phase_23_execution_substrate',
      recorded_at: env.attribution[env.attribution.length - 1]?.recorded_at ?? env.started_at,
      fragment_quoted: summary,
    };
    let template_id = 'exec.worker.failed.v1';
    let vars: Record<string, string | number> = {};
    if (env.lifecycle_state === 'failed') {
      template_id = 'exec.worker.failed.v1';
      vars = {
        worker_id: env.worker_id, kind: env.kind,
        started_at: env.started_at,
        failed_at: env.failed_at ?? env.started_at,
        failure_reason: env.failure_reason ?? 'unknown',
      };
    } else if (env.lifecycle_state === 'interrupted') {
      template_id = 'exec.worker.interrupted.v1';
      vars = {
        worker_id: env.worker_id, kind: env.kind,
        started_at: env.started_at,
        interrupted_at: env.interrupted_at ?? env.started_at,
        note: env.attribution[env.attribution.length - 1]?.note ?? 'unspecified',
      };
    } else {
      template_id = 'exec.worker.rolled_back.v1';
      vars = {
        worker_id: env.worker_id, kind: env.kind,
        rollback_chain_id: env.attribution[env.attribution.length - 1]?.note?.replace('rolled_back_via_chain:', '') ?? 'unknown',
      };
    }
    blocks.push(buildBlock({
      template_id, vars,
      source_attributions: [cite],
      selection_rule: 'recent_failure_or_interruption',
    }));
  }

  // 4. Phase 23 governance rejections (recent).
  const govRows = listExecGovernanceAttributions(input.organization_id)
    .filter(d => d.decision === 'rejected' || d.decision === 'isolated')
    .slice(0, 3);
  source_event_count += govRows.length;
  for (const g of govRows) {
    const stepIndex = causal_chain.length;
    causal_chain.push({
      step_index: stepIndex,
      source_phase: 'phase_23_execution_substrate',
      source_id: g.worker_id,
      summary: `Governance ${g.decision}: ${g.reason}`,
      observed_at: g.recorded_at,
    });
    const cite: NarrativeCitation = {
      source_kind: 'execution_governance_attribution',
      source_id: g.worker_id,
      source_phase: 'phase_23_execution_substrate',
      recorded_at: g.recorded_at,
      fragment_quoted: g.reason,
    };
    blocks.push(buildBlock({
      template_id: 'exec.governance.rejected.v1',
      vars: {
        worker_id: g.worker_id, kind: g.kind,
        rule_violated: g.supervisor_rule_violated ?? 'unknown',
        reason: g.reason,
      },
      source_attributions: [cite],
      selection_rule: 'recent_governance_rejection',
    }));
  }

  if (causal_chain.length === 0) return null;

  const narrative = buildOperationalNarrative({
    organization_id: input.organization_id,
    kind: 'causal_replay',
    source_event_count,
    blocks,
    bounded_reason: causal_chain.length >= MAX_CAUSAL_CHAIN_DEPTH ? 'max_chain_depth_reached' : undefined,
  });
  if (!narrative) return null;

  return {
    story_id: `cstory_${randomUUID()}`,
    organization_id: input.organization_id,
    kind,
    narrative,
    causal_chain: causal_chain.slice(0, MAX_CAUSAL_CHAIN_DEPTH),
    bounded_reason: causal_chain.length >= MAX_CAUSAL_CHAIN_DEPTH ? 'truncated_to_max_depth' : undefined,
    built_at: new Date().toISOString(),
  };
}
