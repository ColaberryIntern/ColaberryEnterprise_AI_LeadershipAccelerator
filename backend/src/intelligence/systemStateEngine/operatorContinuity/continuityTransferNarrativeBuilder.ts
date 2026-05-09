/**
 * continuityTransferNarrativeBuilder — Phase 32. Phase 24-compliant
 * static-template narrative for handoff continuity. NO LLM.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  ContinuityTransferNarrative, ContinuityTransferNarrativeBlock,
} from './operatorContinuityTypes';
import { MAX_NARRATIVES_PER_PARTITION } from './operatorContinuityTypes';
import { buildMultiOperatorComposite } from './multiOperatorCoordinator';

interface PartitionStore {
  narratives: ContinuityTransferNarrative[];
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
  handoff_summary: 'handoff.continuity.summary.v1',
  transfer_overview: 'handoff.transfer.overview.v1',
  timeline_overview: 'handoff.timeline.overview.v1',
  archaeology_summary: 'handoff.archaeology.summary.v1',
  compression_summary: 'handoff.compression.summary.v1',
} as const;

export interface BuildContinuityTransferNarrativeInput {
  readonly organization_id: string;
}

export function buildContinuityTransferNarrative(
  input: BuildContinuityTransferNarrativeInput,
): ContinuityTransferNarrative {
  const composite = buildMultiOperatorComposite(input);
  const blocks: ContinuityTransferNarrativeBlock[] = [];

  blocks.push(makeBlock(TEMPLATES.handoff_summary,
    `Handoffs — ${composite.handoffs.length} total. Lifecycle: ${composite.archaeology.handoffs_by_lifecycle.started} started, ${composite.archaeology.handoffs_by_lifecycle.acknowledged} acknowledged, ${composite.archaeology.handoffs_by_lifecycle.completed} completed, ${composite.archaeology.handoffs_by_lifecycle.declined} declined, ${composite.archaeology.handoffs_by_lifecycle.expired} expired. authority_transfer_supported=false on every handoff.`,
    [{
      source_kind: 'phase_32_handoffs',
      source_id: composite.boundary_proof_chain.handoff_hash,
      source_phase: 'phase_32_handoff',
    }],
  ));

  blocks.push(makeBlock(TEMPLATES.transfer_overview,
    `Transfer bundles — ${composite.transfer_bundles.length} bundle(s). grants_authority=false on every bundle. Bundles surface read-only references to Phase 27/29/30/31 entities.`,
    [{
      source_kind: 'phase_32_transfers',
      source_id: composite.boundary_proof_chain.transfer_hash,
      source_phase: 'phase_32_handoff',
    }],
  ));

  blocks.push(makeBlock(TEMPLATES.timeline_overview,
    `Shared timeline — ${composite.timeline.points.length} chronological point(s). read_only=true, derived_from_phase_31=true. NO parallel mutation surface.`,
    [{
      source_kind: 'phase_32_timeline',
      source_id: composite.timeline.timeline_hash,
      source_phase: 'phase_32_handoff',
    }],
  ));

  blocks.push(makeBlock(TEMPLATES.archaeology_summary,
    `Archaeology — distinct from-operators=${composite.archaeology.distinct_from_operator_count}, distinct to-operators=${composite.archaeology.distinct_to_operator_count}. Counts only — NO ranking, NO scoring, NO inference.`,
    [{
      source_kind: 'phase_32_archaeology',
      source_id: composite.archaeology.archaeology_hash,
      source_phase: 'phase_32_handoff',
    }],
  ));

  blocks.push(makeBlock(TEMPLATES.compression_summary,
    `Compression — ${composite.compression.summary_blocks.length} summary block(s); ${composite.compression.omission_attribution.total_handoffs_observed} observed, ${composite.compression.omission_attribution.handoffs_retained} retained, ${composite.compression.omission_attribution.handoffs_omitted} omitted. lossless=${composite.compression.omission_attribution.lossless}.`,
    [{
      source_kind: 'phase_32_compression',
      source_id: composite.compression.compression_hash,
      source_phase: 'phase_32_handoff',
    }],
  ));

  const narrative: ContinuityTransferNarrative = {
    narrative_id: `tnar_${randomUUID()}`,
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
  citations: ReadonlyArray<ContinuityTransferNarrativeBlock['citations'][number]>,
): ContinuityTransferNarrativeBlock {
  if (citations.length === 0) {
    throw new Error(
      'phase 32 narrative block requires at least one citation (Phase 24 inheritance)',
    );
  }
  return {
    block_id: `tblk_${randomUUID()}`,
    template_id,
    rendered_text,
    citations,
    deterministic_hash: deterministicHash(`${template_id}::${rendered_text}::${JSON.stringify(citations)}`),
  };
}

export function listContinuityTransferNarratives(
  organization_id: string,
): ReadonlyArray<ContinuityTransferNarrative> {
  return [...(partitions.get(organization_id)?.narratives ?? [])].reverse();
}

export function recentContinuityTransferNarrativeCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.narratives ?? [];
    total += arr.filter(n => Date.parse(n.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetContinuityTransferNarrativesForTests(): void {
  partitions.clear();
}
