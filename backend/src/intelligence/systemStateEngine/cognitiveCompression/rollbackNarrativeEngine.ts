/**
 * rollbackNarrativeEngine — Phase 24. Generates `RollbackNarrativeReplay`
 * from Phase 23 rollback execution plans + continuity bounds.
 *
 * Architectural commitment:
 *   - Compresses ALREADY-EXISTING rollback chains. Never invents one.
 *   - Each block cites the chain ID + plan ID + bounds row.
 */

import type {
  RollbackNarrativeReplay, NarrativeCitation, CompressionSourcePhase,
} from './cognitiveCompressionTypes';
import {
  listRollbackPlans, listRollbackContinuityBounds,
} from '../executionSubstrate/rollbackExecutionCoordinator';
import { buildBlock, buildOperationalNarrative } from './operationalNarrativeBuilder';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

export interface BuildRollbackNarrativeInput {
  readonly organization_id: string;
  readonly limit?: number;
}

export function buildRollbackNarrativeReplay(input: BuildRollbackNarrativeInput): RollbackNarrativeReplay | null {
  const limit = Math.max(1, Math.min(20, input.limit ?? 5));
  const plans = listRollbackPlans(input.organization_id).slice(0, limit);
  const bounds = listRollbackContinuityBounds(input.organization_id).slice(0, limit);
  if (plans.length === 0 && bounds.length === 0) return null;

  const blocks: any[] = [];
  const rollback_chain_ids: string[] = [];
  const phaseBreakdown: Record<CompressionSourcePhase, number> = {
    phase_15_mutation: 0, phase_16_causality: 0, phase_17_calibration: 0,
    phase_18_governance_calibration: 0, phase_19_federation: 0,
    phase_20_federated_learning: 0, phase_21_runtime: 0, phase_22_topology: 0,
    phase_23_execution_substrate: 0,
  };
  let outcome_summary: RollbackNarrativeReplay['outcome_summary'] = 'unknown';

  // Plans
  for (const p of plans) {
    const cite: NarrativeCitation = {
      source_kind: 'rollback_execution_plan',
      source_id: p.plan_id,
      source_phase: 'phase_23_execution_substrate',
      recorded_at: p.created_at,
      fragment_quoted: p.aggregation_summary,
    };
    blocks.push(buildBlock({
      template_id: 'rollback.aggregated.v1',
      vars: {
        plan_id: p.plan_id, organization_id: p.organization_id,
        trigger: p.trigger,
        step_count: p.steps.length,
        phase_count: new Set(p.source_chains.map(c => c.source_phase)).size,
      },
      source_attributions: [cite],
      selection_rule: 'recent_rollback_plan',
    }));
    for (const c of p.source_chains) {
      rollback_chain_ids.push(c.chain_id);
      const phaseKey: CompressionSourcePhase =
        c.source_phase === 'mutation' ? 'phase_15_mutation' :
        c.source_phase === 'distributed_recovery' ? 'phase_21_runtime' :
        'phase_22_topology';
      phaseBreakdown[phaseKey]++;
    }
  }

  // Continuity bounds (each describes a rollback chain that ran)
  let full = 0, partial = 0, failed = 0;
  for (const b of bounds) {
    if (b.outcome === 'full') full++;
    else if (b.outcome === 'partial') partial++;
    else if (b.outcome === 'failed') failed++;
    rollback_chain_ids.push(b.rollback_chain_id);
    const cite: NarrativeCitation = {
      source_kind: 'rollback_continuity_bounds',
      source_id: b.rollback_chain_id,
      source_phase: 'phase_23_execution_substrate',
      recorded_at: new Date().toISOString(),
      fragment_quoted: `${b.source_phase} chain ${b.rollback_chain_id}: ${b.outcome}`,
    };
    blocks.push(buildBlock({
      template_id: 'rollback.continuity.bounds.v1',
      vars: {
        rollback_chain_id: b.rollback_chain_id,
        source_phase: b.source_phase,
        steps_replayed: b.steps_replayed,
        time_elapsed_ms: b.time_elapsed_ms,
        outcome: b.outcome,
      },
      source_attributions: [cite],
      selection_rule: 'recent_rollback_continuity',
    }));
  }

  if (bounds.length === 0) outcome_summary = 'unknown';
  else if (failed === bounds.length) outcome_summary = 'failed';
  else if (full === bounds.length) outcome_summary = 'all_full';
  else if (partial === bounds.length) outcome_summary = 'partial';
  else outcome_summary = 'mixed';

  const narrative = buildOperationalNarrative({
    organization_id: input.organization_id,
    kind: 'rollback_event',
    source_event_count: plans.length + bounds.length,
    blocks,
  });
  if (!narrative) return null;

  try {
    publishCognitiveEvent({
      kind: 'rollback.explained',
      project_id: 'system',
      severity: 'info',
      payload: {
        narrative_id: narrative.narrative_id,
        organization_id: input.organization_id,
        rollback_chain_count: rollback_chain_ids.length,
        outcome_summary,
      },
    });
  } catch { /* noop */ }

  return {
    narrative,
    rollback_chain_ids,
    source_phase_breakdown: phaseBreakdown,
    outcome_summary,
    built_at: new Date().toISOString(),
  };
}
