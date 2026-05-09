/**
 * recoveryNarrativeWalkthrough — Phase 30. Phase 24-compliant
 * cross-archetype walkthrough narrative. NO LLM. Citation-required.
 *
 * Architectural commitment:
 *   - 5 static templates rendered with deterministic interpolation.
 *   - Every block requires ≥1 citation.
 *   - SHA-256 deterministic hashing per block.
 *   - Narratives MAY compress observability, MUST NOT reinterpret
 *     recovery authority.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  RecoveryNarrativeWalkthrough, RecoveryNarrativeWalkthroughBlock,
} from './recoveryForesightTypes';
import { MAX_WALKTHROUGHS_PER_PARTITION } from './recoveryForesightTypes';
import { buildRecoveryForesightComposite } from './recoveryForesightCoordinator';

interface PartitionStore {
  walkthroughs: RecoveryNarrativeWalkthrough[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { walkthroughs: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

const TEMPLATES = {
  comparison_intro: 'walkthrough.comparison.intro.v1',
  archetype_row: 'walkthrough.archetype.row.v1',
  survivability_callout: 'walkthrough.survivability.callout.v1',
  tradeoff_callout: 'walkthrough.tradeoff.callout.v1',
  governance_callout: 'walkthrough.governance.callout.v1',
} as const;

export interface BuildWalkthroughInput {
  readonly organization_id: string;
  readonly operator_id: string;
  readonly archetype_ids?: ReadonlyArray<string>;
}

export function buildRecoveryNarrativeWalkthrough(
  input: BuildWalkthroughInput,
): RecoveryNarrativeWalkthrough {
  const composite = buildRecoveryForesightComposite(input);
  const archetype_ids = composite.comparison.rows.map(r => r.archetype_id);

  const blocks: RecoveryNarrativeWalkthroughBlock[] = [];

  // Block 1 — comparison intro
  blocks.push(makeBlock(TEMPLATES.comparison_intro, undefined,
    `Walkthrough — ${composite.comparison.rows.length} archetype(s), tier=${composite.comparison.tier}. Operator reviews each row, decides via Phase 29 sequencing → Phase 27 envelope.`,
    [{
      source_kind: 'phase_30_comparison',
      source_id: composite.comparison.comparison_hash,
      source_phase: 'phase_30_foresight',
    }],
  ));

  // Block 2 — per-archetype rows (one block aggregating; one citation per archetype)
  const rowText = composite.comparison.rows.slice(0, 5).map(r =>
    `${r.archetype_name} (${r.provenance}) — duration=${r.duration_ms}ms, strain=${r.strain_pressure}/100, confidence=${r.confidence}, governance=${r.governance_passed ? 'permitted' : 'rejected'}`,
  ).join(' · ');
  blocks.push(makeBlock(TEMPLATES.archetype_row, undefined,
    `Per-archetype rows: ${rowText || '(no archetypes)'}`,
    composite.comparison.rows.length > 0
      ? composite.comparison.rows.slice(0, 5).map(r => ({
          source_kind: 'phase_30_comparison_row',
          source_id: r.deterministic_hash,
          source_phase: 'phase_30_foresight' as const,
        }))
      : [{
          source_kind: 'phase_30_comparison',
          source_id: composite.comparison.comparison_hash,
          source_phase: 'phase_30_foresight' as const,
        }],
  ));

  // Block 3 — survivability callout
  const survText = composite.survivability.rows.slice(0, 3).map(r =>
    `${r.archetype_name}: ${r.rollback_chain_source_phase}, ${r.rollback_steps_count} step(s), confidence ${r.inherited_confidence.score}/100`,
  ).join(' · ');
  blocks.push(makeBlock(TEMPLATES.survivability_callout, undefined,
    `Survivability — ${survText || '(no rows)'}`,
    [{
      source_kind: 'phase_30_survivability',
      source_id: composite.survivability.survivability_hash,
      source_phase: 'phase_30_foresight',
    }],
  ));

  // Block 4 — tradeoff callout
  const tradeText = composite.tradeoff.rows.slice(0, 3).map(r =>
    `${r.archetype_name}: replay_amp=${r.estimated_replay_amplification}, topology_strain=${r.estimated_topology_strain}`,
  ).join(' · ');
  blocks.push(makeBlock(TEMPLATES.tradeoff_callout, undefined,
    `Tradeoffs — ${tradeText || '(no rows)'}`,
    [{
      source_kind: 'phase_30_tradeoff',
      source_id: composite.tradeoff.tradeoff_hash,
      source_phase: 'phase_30_foresight',
    }],
  ));

  // Block 5 — governance callout
  const passed = composite.comparison.rows.filter(r => r.governance_passed).length;
  const rejected = composite.comparison.rows.length - passed;
  blocks.push(makeBlock(TEMPLATES.governance_callout, undefined,
    `Governance — ${passed} permitted / ${rejected} rejected. operator_mediation_required=true on every gate. Engine never selects; operator clicks → Phase 29 sequencing → Phase 27 envelope.`,
    [{
      source_kind: 'phase_30_governance_visibility',
      source_id: composite.boundary_proof_chain.replay_hash,
      source_phase: 'phase_30_foresight',
    }],
  ));

  const walkthrough: RecoveryNarrativeWalkthrough = {
    walkthrough_id: `wt_${randomUUID()}`,
    organization_id: input.organization_id,
    archetype_ids,
    blocks,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.walkthroughs.push(walkthrough);
  if (store.walkthroughs.length > MAX_WALKTHROUGHS_PER_PARTITION) store.walkthroughs.shift();
  return walkthrough;
}

function makeBlock(
  template_id: string, archetype_id: string | undefined, rendered_text: string,
  citations: ReadonlyArray<RecoveryNarrativeWalkthroughBlock['citations'][number]>,
): RecoveryNarrativeWalkthroughBlock {
  if (citations.length === 0) {
    throw new Error(
      'phase 30 walkthrough block requires at least one citation (Phase 24 inheritance)',
    );
  }
  return {
    block_id: `wblk_${randomUUID()}`,
    archetype_id,
    template_id,
    rendered_text,
    citations,
    deterministic_hash: deterministicHash(`${template_id}::${rendered_text}::${JSON.stringify(citations)}`),
  };
}

export function listWalkthroughs(
  organization_id: string,
): ReadonlyArray<RecoveryNarrativeWalkthrough> {
  return [...(partitions.get(organization_id)?.walkthroughs ?? [])].reverse();
}

export function recentWalkthroughCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.walkthroughs ?? [];
    total += arr.filter(w => Date.parse(w.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetWalkthroughsForTests(): void {
  partitions.clear();
}
