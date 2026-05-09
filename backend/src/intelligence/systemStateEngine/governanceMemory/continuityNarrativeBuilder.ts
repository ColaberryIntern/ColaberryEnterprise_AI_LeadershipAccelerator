/**
 * continuityNarrativeBuilder — Phase 31. Phase 24-compliant
 * static-template narrative for governance memory continuity.
 *
 * Architectural commitment:
 *   - 5 static templates rendered with deterministic interpolation.
 *   - Every block requires ≥1 citation.
 *   - SHA-256 deterministic hashing per block. NO LLM.
 *   - Narratives MAY compress observability, MUST NOT reinterpret
 *     operator behavior. NO behavioral inference.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  ContinuityNarrative, ContinuityNarrativeBlock,
} from './governanceMemoryTypes';
import { MAX_NARRATIVES_PER_PARTITION } from './governanceMemoryTypes';
import { buildGovernanceMemoryComposite } from './governanceMemoryCoordinator';

interface PartitionStore {
  narratives: ContinuityNarrative[];
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
  continuity_summary: 'memory.continuity.summary.v1',
  timeline_overview: 'memory.timeline.overview.v1',
  archaeology_summary: 'memory.archaeology.summary.v1',
  replay_summary: 'memory.replay.summary.v1',
  compression_summary: 'memory.compression.summary.v1',
} as const;

export interface BuildContinuityNarrativeInput {
  readonly organization_id: string;
}

export function buildContinuityNarrative(
  input: BuildContinuityNarrativeInput,
): ContinuityNarrative {
  const composite = buildGovernanceMemoryComposite(input);

  const blocks: ContinuityNarrativeBlock[] = [];

  blocks.push(makeBlock(TEMPLATES.continuity_summary,
    `Continuity — ${composite.continuity.total_sessions} session(s), ${composite.continuity.total_events} event(s), ${composite.continuity.distinct_operator_count} distinct operator(s). Density tier: ${composite.continuity.density_tier}. engine_never_profiles=true.`,
    [{
      source_kind: 'phase_31_continuity',
      source_id: composite.continuity.profile_hash,
      source_phase: 'phase_31_memory',
    }],
  ));

  blocks.push(makeBlock(TEMPLATES.timeline_overview,
    `Timeline — ${composite.timeline.events.length} event(s) in append-only order. read_only=true, append_only=true. Chronological, no relevance reordering.`,
    [{
      source_kind: 'phase_31_timeline',
      source_id: composite.timeline.timeline_hash,
      source_phase: 'phase_31_memory',
    }],
  ));

  blocks.push(makeBlock(TEMPLATES.archaeology_summary,
    `Archaeology — Phase 27 envelopes=${composite.archaeology.source_phase_summaries.phase_27_envelope_count}, Phase 28 quota changes=${composite.archaeology.source_phase_summaries.phase_28_quota_governance_count}, Phase 29 gov decisions=${composite.archaeology.source_phase_summaries.phase_29_governance_attribution_count}, Phase 30 comparisons=${composite.archaeology.source_phase_summaries.phase_30_comparison_count}. read_only=true, bounded_to_organization=true.`,
    [{
      source_kind: 'phase_31_archaeology',
      source_id: composite.archaeology.archaeology_hash,
      source_phase: 'phase_31_memory',
    }],
  ));

  blocks.push(makeBlock(TEMPLATES.replay_summary,
    `Replay — ${composite.replay.events_replayed} event(s) replayed across ${composite.replay.sessions_replayed} session(s). deterministic=true, read_only=true. Same Phase 31 inputs → same replay_hash.`,
    [{
      source_kind: 'phase_31_replay',
      source_id: composite.replay.replay_hash,
      source_phase: 'phase_31_memory',
    }],
  ));

  blocks.push(makeBlock(TEMPLATES.compression_summary,
    `Compression — ${composite.compression.summary_blocks.length} summary block(s); ${composite.compression.omission_attribution.total_events_observed} observed, ${composite.compression.omission_attribution.events_retained} retained, ${composite.compression.omission_attribution.events_omitted} omitted. lossless=${composite.compression.omission_attribution.lossless}.`,
    [{
      source_kind: 'phase_31_compression',
      source_id: composite.compression.compression_hash,
      source_phase: 'phase_31_memory',
    }],
  ));

  const narrative: ContinuityNarrative = {
    narrative_id: `cnar_${randomUUID()}`,
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
  citations: ReadonlyArray<ContinuityNarrativeBlock['citations'][number]>,
): ContinuityNarrativeBlock {
  if (citations.length === 0) {
    throw new Error(
      'phase 31 narrative block requires at least one citation (Phase 24 inheritance)',
    );
  }
  return {
    block_id: `cblk_${randomUUID()}`,
    template_id,
    rendered_text,
    citations,
    deterministic_hash: deterministicHash(`${template_id}::${rendered_text}::${JSON.stringify(citations)}`),
  };
}

export function listContinuityNarratives(
  organization_id: string,
): ReadonlyArray<ContinuityNarrative> {
  return [...(partitions.get(organization_id)?.narratives ?? [])].reverse();
}

export function recentContinuityNarrativeCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.narratives ?? [];
    total += arr.filter(n => Date.parse(n.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetContinuityNarrativesForTests(): void {
  partitions.clear();
}
