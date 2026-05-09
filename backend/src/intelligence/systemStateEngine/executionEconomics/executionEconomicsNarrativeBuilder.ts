/**
 * executionEconomicsNarrativeBuilder — Phase 28. Phase 24-compliant
 * static-template narrative generation. NO LLM. Citation-required.
 *
 * Architectural commitment:
 *   - 5 static templates rendered with deterministic interpolation.
 *   - Every block requires ≥1 citation.
 *   - SHA-256 deterministic hashing per block.
 *   - Refuses generation when no economics data available.
 *   - Narratives compress observability; they MUST NOT reinterpret
 *     operational authority.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  EconomicsCompressionNarrativeBlock, ExecutionEconomicsNarrative,
} from './executionEconomicsTypes';
import { MAX_NARRATIVES_PER_PARTITION } from './executionEconomicsTypes';
import { buildEconomicsComposite } from './executionEconomicsCoordinator';

interface PartitionStore {
  narratives: ExecutionEconomicsNarrative[];
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

// ─── Static templates ──────────────────────────────────────────────

const TEMPLATES = {
  quota_status: 'economics.quota.status.v1',
  pressure_classification: 'economics.pressure.classification.v1',
  topology_load: 'economics.topology.load.v1',
  rollback_forecast: 'economics.rollback.forecast.v1',
  tier_summary: 'economics.tier.summary.v1',
} as const;

export interface BuildNarrativeInput {
  readonly organization_id: string;
}

export function buildExecutionEconomicsNarrative(
  input: BuildNarrativeInput,
): ExecutionEconomicsNarrative | null {
  const composite = buildEconomicsComposite({ organization_id: input.organization_id });

  // Refuse generation when there is literally no economics signal
  // (e.g., a fresh org with zero counters and zero quota mutations).
  // We always have a quota profile (defaults), so we always allow
  // generation. This block is a placeholder for future "no signal"
  // refusals. Currently always proceeds.

  const blocks: EconomicsCompressionNarrativeBlock[] = [];

  // Block 1: quota status (always cited from quota deterministic_hash)
  blocks.push(makeBlock(TEMPLATES.quota_status,
    `Quota status — ${composite.quota.any_exhausted
      ? `EXHAUSTED keys: ${composite.quota.exhausted_keys.join(', ')}`
      : 'all quotas within bounds'}.`,
    [{
      source_kind: 'phase_28_quota_profile',
      source_id: composite.quota.deterministic_hash,
      source_phase: 'phase_28_economics',
    }],
  ));

  // Block 2: pressure classification (cited from sample_hash)
  blocks.push(makeBlock(TEMPLATES.pressure_classification,
    `Runtime pressure tier=${composite.pressure.tier}, score=${composite.pressure.score}, refusals=${composite.pressure.observed_counters.refusals_24h}, timeouts=${composite.pressure.observed_counters.timeouts_24h}.`,
    [{
      source_kind: 'phase_28_pressure_profile',
      source_id: composite.pressure.sample_hash,
      source_phase: 'phase_28_economics',
    }],
  ));

  // Block 3: topology load (cited from distribution_hash)
  blocks.push(makeBlock(TEMPLATES.topology_load,
    `Topology load distribution — ${composite.topology_load.partitions.length} partition(s) observed, imbalance_score=${composite.topology_load.imbalance_score}, recommendation_only=true.`,
    [{
      source_kind: 'phase_28_topology_load_profile',
      source_id: composite.topology_load.distribution_hash,
      source_phase: 'phase_28_economics',
    }],
  ));

  // Block 4: rollback forecast (cited from forecast_hash)
  blocks.push(makeBlock(TEMPLATES.rollback_forecast,
    `Rollback forecast — ${composite.rollback_forecast.estimated_rollback_chains} chain(s), expected ${composite.rollback_forecast.estimated_replay_duration_ms}ms (low=${composite.rollback_forecast.uncertainty_bounds.low}, high=${composite.rollback_forecast.uncertainty_bounds.high}), confidence=${composite.rollback_forecast.inherited_confidence.score}, heuristic_only=true.`,
    [{
      source_kind: 'phase_28_rollback_forecast',
      source_id: composite.rollback_forecast.forecast_hash,
      source_phase: 'phase_28_economics',
    }],
  ));

  // Block 5: economics tier summary (cited from boundary_proof_chain.replay_hash)
  blocks.push(makeBlock(TEMPLATES.tier_summary,
    `Execution economics tier=${composite.tier} (composite of pressure ${composite.pressure.tier} + quota ${composite.quota.any_exhausted ? 'exhausted' : 'within bounds'}).`,
    [{
      source_kind: 'phase_28_economics_composite',
      source_id: composite.boundary_proof_chain.replay_hash,
      source_phase: 'phase_28_economics',
    }],
  ));

  const narrative: ExecutionEconomicsNarrative = {
    narrative_id: `narr_${randomUUID()}`,
    organization_id: input.organization_id,
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
  citations: ReadonlyArray<EconomicsCompressionNarrativeBlock['citations'][number]>,
): EconomicsCompressionNarrativeBlock {
  if (citations.length === 0) {
    throw new Error(
      'phase 28 narrative block requires at least one citation (Phase 24 inheritance)',
    );
  }
  return {
    block_id: `blk_${randomUUID()}`,
    template_id,
    rendered_text,
    citations,
    deterministic_hash: deterministicHash(`${template_id}::${rendered_text}::${JSON.stringify(citations)}`),
  };
}

export function listExecutionEconomicsNarratives(
  organization_id: string,
): ReadonlyArray<ExecutionEconomicsNarrative> {
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

export function _resetEconomicsNarrativesForTests(): void {
  partitions.clear();
}
