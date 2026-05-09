/**
 * topologyExperimentationGraph — Phase 25. Read-only annotation layer
 * over the existing Phase 22 cognition topology graph + Phase 23
 * execution topology graph.
 *
 * Architectural commitment:
 *   - Annotations are EPHEMERAL — they live for the duration of one
 *     sandbox call, never persist.
 *   - Validates that hypothetical edge additions don't create cycles
 *     escape the partition.
 */

import type {
  TopologyExperimentationAnnotation,
} from './experimentationTypes';
import {
  buildCognitionTopologyGraph, downstreamNamespaces,
} from '../topology/cognitionTopologyGraph';
import {
  buildExecutionTopologyProfile,
} from '../executionSubstrate/executionTopologyGraph';

export interface TopologyExperimentationView {
  readonly organization_id: string;
  readonly base_cognition_node_count: number;
  readonly base_cognition_edge_count: number;
  readonly base_execution_node_count: number;
  readonly base_execution_edge_count: number;
  readonly hypothetical_annotations: TopologyExperimentationAnnotation;
  readonly cycle_detected: boolean;
  readonly built_at: string;
}

export interface BuildTopologyExperimentationViewInput {
  readonly organization_id: string;
  readonly hypothetical_annotation?: TopologyExperimentationAnnotation;
}

export function buildTopologyExperimentationView(
  input: BuildTopologyExperimentationViewInput,
): TopologyExperimentationView {
  const cognition = buildCognitionTopologyGraph(input.organization_id);
  const execution = buildExecutionTopologyProfile(input.organization_id);

  let cycle_detected = false;
  if (input.hypothetical_annotation?.hypothetical_edge_added) {
    const { from, to } = input.hypothetical_annotation.hypothetical_edge_added;
    // Cycle check: if the proposed `to` already reaches `from` downstream,
    // adding from→to would create a cycle.
    const downstreamFromTo = downstreamNamespaces(input.organization_id, to, 16);
    if (downstreamFromTo.some(d => d.namespace === from)) {
      cycle_detected = true;
    }
  }

  return {
    organization_id: input.organization_id,
    base_cognition_node_count: cognition.nodes.length,
    base_cognition_edge_count: cognition.edges.length,
    base_execution_node_count: execution.nodes.length,
    base_execution_edge_count: execution.edges.length,
    hypothetical_annotations: input.hypothetical_annotation ?? {},
    cycle_detected,
    built_at: new Date().toISOString(),
  };
}
