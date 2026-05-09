/**
 * propagationPreviewEngine — Phase 25. WRAPS Phase 22's deterministic
 * propagation walk against a hypothetical baseline.
 *
 * Architectural commitment:
 *   - Not a new propagation engine. Phase 25 hands a hypothetical
 *     origin to the same Phase 22 walk that already exists.
 *   - Confidence INHERITED from Phase 22 `PropagationConfidenceBounds`.
 */

import { randomUUID } from 'crypto';
import type {
  PropagationPreviewProfile, ExperimentReplayConfidenceBounds,
  HypotheticalActionKind,
} from './experimentationTypes';
import { MAX_PROPAGATION_PREVIEWS_PER_PARTITION } from './experimentationTypes';
import { buildPropagationAttribution } from '../topology/runtimePropagationTopology';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

const partitions = new Map<string, PropagationPreviewProfile[]>();

function ensure(organization_id: string): PropagationPreviewProfile[] {
  let s = partitions.get(organization_id);
  if (!s) { s = []; partitions.set(organization_id, s); }
  return s;
}

export interface BuildPropagationPreviewInput {
  readonly organization_id: string;
  readonly experiment_id?: string;
  readonly hypothetical_origin: string;
  readonly hypothetical_action_kind: HypotheticalActionKind;
}

export function buildPropagationPreview(input: BuildPropagationPreviewInput): PropagationPreviewProfile {
  const preview_id = `prev_${randomUUID()}`;
  const experiment_id = input.experiment_id ?? `exp_${randomUUID()}`;

  // Phase 22's propagation walk against the hypothetical origin. This
  // is read-only — `buildPropagationAttribution` walks the declared
  // graph and returns an attribution. Phase 25 only reuses its result.
  const phase22 = buildPropagationAttribution({
    organization_id: input.organization_id,
    originating_namespace: input.hypothetical_origin,
    propagation_kind: input.hypothetical_action_kind === 'add_broker_isolation'
      ? 'isolation_propagation'
      : input.hypothetical_action_kind === 'lift_broker_isolation'
        ? 'continuity_restoration'
        : 'isolation_propagation',
  });

  const inherited_confidence: ExperimentReplayConfidenceBounds = {
    low: phase22.replay_confidence.confidence_low,
    high: phase22.replay_confidence.confidence_high,
    drivers: phase22.replay_confidence.uncertainty_drivers,
    inherited_from_phase: 'phase_22_topology',
    inherited_from_source_id: `prop:${input.hypothetical_origin}@${phase22.recorded_at}`,
  };

  const projected_impact_score = Math.round((phase22.replay_confidence.confidence_low + phase22.replay_confidence.confidence_high) / 2);

  const preview: PropagationPreviewProfile = {
    preview_id,
    experiment_id,
    organization_id: input.organization_id,
    hypothetical_origin: input.hypothetical_origin,
    hypothetical_action_kind: input.hypothetical_action_kind,
    projected_impacted_namespaces: phase22.impacted_namespaces,
    projected_dependency_depth: phase22.dependency_depth,
    projected_impact_score,
    inherited_confidence,
    source_phase_22_attribution_id: `prop:${input.hypothetical_origin}@${phase22.recorded_at}`,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.push(preview);
  if (store.length > MAX_PROPAGATION_PREVIEWS_PER_PARTITION) store.shift();

  try {
    publishCognitiveEvent({
      kind: 'propagation.previewed',
      project_id: 'system',
      severity: 'info',
      payload: {
        preview_id, experiment_id, organization_id: input.organization_id,
        impacted_count: phase22.impacted_namespaces.length,
      },
    });
  } catch { /* noop */ }

  return preview;
}

export function listPropagationPreviews(organization_id: string): ReadonlyArray<PropagationPreviewProfile> {
  return [...(partitions.get(organization_id) ?? [])].reverse();
}

export function recentPropagationPreviewCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  if (organization_id) {
    return (partitions.get(organization_id) ?? []).filter(p => Date.parse(p.built_at) >= cutoff).length;
  }
  let total = 0;
  for (const list of partitions.values()) {
    total += list.filter(p => Date.parse(p.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetPropagationPreviewsForTests(): void {
  partitions.clear();
}
