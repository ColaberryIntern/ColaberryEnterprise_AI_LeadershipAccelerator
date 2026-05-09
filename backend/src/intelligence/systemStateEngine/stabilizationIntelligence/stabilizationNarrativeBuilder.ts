/**
 * stabilizationNarrativeBuilder — Phase 29. Phase 24-compliant static-
 * template narrative generation. NO LLM. Citation-required.
 *
 * Architectural commitment:
 *   - 5 static templates rendered with deterministic interpolation.
 *   - Every block requires ≥1 citation (refuses generation without one).
 *   - SHA-256 deterministic hashing per block.
 *   - Narratives compress observability; they MUST NOT reinterpret
 *     recovery authority.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  StabilizationCompressionNarrativeBlock, StabilizationNarrative,
} from './stabilizationIntelligenceTypes';
import { MAX_NARRATIVES_PER_PARTITION } from './stabilizationIntelligenceTypes';
import { buildStabilizationComposite } from './stabilizationPlaybookCoordinator';

interface PartitionStore {
  narratives: StabilizationNarrative[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { narratives: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

const TEMPLATES = {
  archetype: 'stabilization.archetype.summary.v1',
  sequencing: 'stabilization.sequencing.advisory.v1',
  forecast: 'stabilization.forecast.heuristic.v1',
  pressure: 'stabilization.pressure.classification.v1',
  containment: 'stabilization.containment.attribution.v1',
} as const;

export interface BuildNarrativeInput {
  readonly organization_id: string;
  readonly archetype_id?: string;
}

export function buildStabilizationNarrative(
  input: BuildNarrativeInput,
): StabilizationNarrative | null {
  const composite = buildStabilizationComposite({
    organization_id: input.organization_id,
    archetype_id: input.archetype_id,
  });

  const blocks: StabilizationCompressionNarrativeBlock[] = [];

  // Block 1: archetype summary (only if archetype specified)
  if (composite.archetype) {
    blocks.push(makeBlock(TEMPLATES.archetype,
      `Archetype "${composite.archetype.name}" (${composite.archetype.provenance}, ${composite.archetype.steps.length} step(s)) — ${composite.archetype.description}`,
      [{
        source_kind: 'phase_29_archetype',
        source_id: composite.archetype.deterministic_hash,
        source_phase: 'phase_29_stabilization',
      }],
    ));
  }

  // Block 2: sequencing advisory (only if archetype specified)
  if (composite.sequencing) {
    blocks.push(makeBlock(TEMPLATES.sequencing,
      `Sequencing — ${composite.sequencing.steps.length} advisory step(s), advisory_only=true, never_auto_executes=true. Operator clicks each step to issue a Phase 27 envelope.`,
      [{
        source_kind: 'phase_29_sequencing',
        source_id: composite.sequencing.sequencing_hash,
        source_phase: 'phase_29_stabilization',
      }],
    ));
  }

  // Block 3: forecast (only if archetype specified)
  if (composite.forecast) {
    blocks.push(makeBlock(TEMPLATES.forecast,
      `Forecast — expected duration ${composite.forecast.estimated_total_duration_ms}ms (low=${composite.forecast.uncertainty_bounds.low}, high=${composite.forecast.uncertainty_bounds.high}), confidence ${composite.forecast.inherited_confidence.score}/100, heuristic_only=true.`,
      [{
        source_kind: 'phase_29_forecast',
        source_id: composite.forecast.forecast_hash,
        source_phase: 'phase_29_stabilization',
      }],
    ));
  }

  // Block 4: pressure (always present)
  blocks.push(makeBlock(TEMPLATES.pressure,
    `Recovery pressure tier=${composite.pressure.tier}, score=${composite.pressure.score}/100. Sources: rollback_chains_24h=${composite.pressure.observed_counters.rollback_replay_count_24h}, broker_isolations_active=${composite.pressure.observed_counters.broker_isolations_active}.`,
    [{
      source_kind: 'phase_29_pressure',
      source_id: composite.pressure.sample_hash,
      source_phase: 'phase_29_stabilization',
    }],
  ));

  // Block 5: containment (always present)
  blocks.push(makeBlock(TEMPLATES.containment,
    `Containment — topology_contained=${composite.containment.topology_contained}, rollback_coverage_verified=${composite.containment.rollback_coverage_verified}, replay_integrity_verified=${composite.containment.replay_integrity_verified}.`,
    [{
      source_kind: 'phase_29_containment',
      source_id: composite.containment.deterministic_hash,
      source_phase: 'phase_29_stabilization',
    }],
  ));

  if (blocks.length === 0) return null;

  const narrative: StabilizationNarrative = {
    narrative_id: `snar_${randomUUID()}`,
    organization_id: input.organization_id,
    archetype_id: input.archetype_id,
    blocks,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.narratives.push(narrative);
  if (store.narratives.length > MAX_NARRATIVES_PER_PARTITION) store.narratives.shift();
  return narrative;
}

function makeBlock(
  template_id: string, rendered_text: string,
  citations: ReadonlyArray<StabilizationCompressionNarrativeBlock['citations'][number]>,
): StabilizationCompressionNarrativeBlock {
  if (citations.length === 0) {
    throw new Error(
      'phase 29 narrative block requires at least one citation (Phase 24 inheritance)',
    );
  }
  return {
    block_id: `sblk_${randomUUID()}`,
    template_id,
    rendered_text,
    citations,
    deterministic_hash: deterministicHash(`${template_id}::${rendered_text}::${JSON.stringify(citations)}`),
  };
}

export function listStabilizationNarratives(
  organization_id: string,
): ReadonlyArray<StabilizationNarrative> {
  return [...(partitions.get(organization_id)?.narratives ?? [])].reverse();
}

export function recentNarrativeCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.narratives ?? [];
    total += arr.filter(n => Date.parse(n.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetStabilizationNarrativesForTests(): void {
  partitions.clear();
}
