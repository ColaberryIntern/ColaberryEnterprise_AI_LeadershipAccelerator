/**
 * topologyNarrativeEngine — Phase 24. Renders Phase 22 topology data
 * (graph + fragmentation + dependencies + propagations + stabilizations
 * + forecast) into a deterministic `TopologyNarrativeReplay`.
 *
 * Architectural commitment:
 *   - Cites every source attribution from Phase 22.
 *   - Confidence inherited from Phase 22 `PropagationConfidenceBounds`.
 *   - Never expands the dependency graph.
 */

import type {
  TopologyNarrativeReplay, NarrativeCitation,
} from './cognitiveCompressionTypes';
import { buildTopologyVisibilityReplay } from '../topology/topologyReplayEngine';
import { buildBlock, buildOperationalNarrative } from './operationalNarrativeBuilder';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

export interface BuildTopologyNarrativeInput {
  readonly organization_id: string;
}

export function buildTopologyNarrativeReplay(input: BuildTopologyNarrativeInput): TopologyNarrativeReplay | null {
  const visibility = buildTopologyVisibilityReplay({ organization_id: input.organization_id });
  const blocks: any[] = [];

  // 1. Fragmentation tier block
  const fragCite: NarrativeCitation = {
    source_kind: 'topology_fragmentation_profile',
    source_id: `${visibility.fragmentation.organization_id}:${visibility.fragmentation.built_at}`,
    source_phase: 'phase_22_topology',
    recorded_at: visibility.fragmentation.built_at,
    fragment_quoted: `tier=${visibility.fragmentation.tier}, pressure=${visibility.fragmentation.fragmentation_pressure_score}`,
  };
  blocks.push(buildBlock({
    template_id: 'topology.fragmentation.v1',
    vars: {
      organization_id: visibility.fragmentation.organization_id,
      tier: visibility.fragmentation.tier,
      fragmentation_pressure_score: visibility.fragmentation.fragmentation_pressure_score,
      active_isolation_count: visibility.fragmentation.active_isolation_count,
      isolated_root_count: visibility.fragmentation.isolated_root_count,
    },
    source_attributions: [fragCite],
    selection_rule: 'topology_visibility_root',
  }));

  // 2. Recent propagations (up to 3)
  for (const p of visibility.recent_propagations.slice(0, 3)) {
    for (const entry of p.entries.slice(0, 1)) {
      const cite: NarrativeCitation = {
        source_kind: 'topology_replay_attribution',
        source_id: `prop:${entry.attribution.originating_namespace}@${entry.attribution.recorded_at}`,
        source_phase: 'phase_22_topology',
        recorded_at: entry.attribution.recorded_at,
        fragment_quoted: entry.attribution.propagation_reason,
      };
      blocks.push(buildBlock({
        template_id: 'topology.propagation.v1',
        vars: {
          origin: entry.attribution.originating_namespace,
          impacted_count: entry.attribution.impacted_namespaces.length,
          dependency_depth: entry.attribution.dependency_depth,
          reason: entry.attribution.propagation_reason,
        },
        source_attributions: [cite],
        selection_rule: 'topology_recent_propagation',
        confidence: {
          low: entry.attribution.replay_confidence.confidence_low,
          high: entry.attribution.replay_confidence.confidence_high,
          drivers: entry.attribution.replay_confidence.uncertainty_drivers,
          inherited_from_source_id: cite.source_id,
          inherited_from_phase: 'phase_22_topology',
          aggregation_rule: 'single_source',
        },
      }));
    }
  }

  // 3. Recent stabilizations (up to 2)
  for (const s of visibility.recent_stabilizations.slice(0, 2)) {
    const cite: NarrativeCitation = {
      source_kind: 'stabilization_influence_path',
      source_id: `stab:${s.originating_namespace}@${s.observed_at}`,
      source_phase: 'phase_22_topology',
      recorded_at: s.observed_at,
      fragment_quoted: `${s.recovery_kind} stabilized ${s.stabilized_namespaces.length} downstream namespace(s)`,
    };
    blocks.push(buildBlock({
      template_id: 'topology.stabilization.v1',
      vars: {
        origin: s.originating_namespace,
        stabilized_count: s.stabilized_namespaces.length,
        recovery_kind: s.recovery_kind,
      },
      source_attributions: [cite],
      selection_rule: 'topology_recent_stabilization',
    }));
  }

  // 4. Forecast block
  const fc = visibility.forecast;
  const fcCite: NarrativeCitation = {
    source_kind: 'topology_forecast_profile',
    source_id: `fc:${fc.organization_id}:${fc.built_at}`,
    source_phase: 'phase_22_topology',
    recorded_at: fc.built_at,
    fragment_quoted: `${fc.current_tier} → ${fc.forecast_tier} in ${fc.forecast_horizon_minutes}min`,
  };
  blocks.push(buildBlock({
    template_id: 'topology.forecast.v1',
    vars: {
      organization_id: fc.organization_id,
      current_tier: fc.current_tier,
      forecast_tier: fc.forecast_tier,
      horizon_minutes: fc.forecast_horizon_minutes,
      confidence_low: fc.bounds.confidence_low,
      confidence_high: fc.bounds.confidence_high,
    },
    source_attributions: [fcCite],
    selection_rule: 'topology_forecast',
    confidence: {
      low: fc.bounds.confidence_low,
      high: fc.bounds.confidence_high,
      drivers: fc.bounds.uncertainty_drivers,
      inherited_from_source_id: fcCite.source_id,
      inherited_from_phase: 'phase_22_topology',
      aggregation_rule: 'single_source',
    },
  }));

  const validBlocks = blocks.filter(b => b !== null);
  if (validBlocks.length === 0) return null;

  const narrative = buildOperationalNarrative({
    organization_id: input.organization_id,
    kind: 'topology_degradation',
    source_event_count: 1 + visibility.recent_propagations.length + visibility.recent_stabilizations.length + 1,
    blocks,
  });
  if (!narrative) return null;

  try {
    publishCognitiveEvent({
      kind: 'topology.explained',
      project_id: 'system',
      severity: 'info',
      payload: {
        narrative_id: narrative.narrative_id,
        organization_id: input.organization_id,
        tier: visibility.fragmentation.tier,
      },
    });
  } catch { /* noop */ }

  return {
    narrative,
    fragmentation_tier: visibility.fragmentation.tier,
    fragmentation_pressure_score: visibility.fragmentation.fragmentation_pressure_score,
    active_isolation_count: visibility.fragmentation.active_isolation_count,
    built_at: new Date().toISOString(),
  };
}
