/**
 * stabilizationGuidanceSurface — Phase 30. Advisory cross-archetype
 * guidance surface. Phase 24-compliant citation-required output.
 *
 * Architectural commitment:
 *   - `advisory_only: true` typed-as-literal.
 *   - `engine_never_ranks: true` typed-as-literal.
 *   - 5 static templates with deterministic interpolation.
 *   - Every block requires ≥1 citation.
 *   - Guidance MAY explain tradeoffs / narrate implications / expose
 *     replay history / summarize survivability / compare governance
 *     requirements. Guidance MUST NOT steer choice / prioritize / imply
 *     authority preference / auto-suppress / optimize selection.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  StabilizationGuidanceSurface, StabilizationGuidanceBlock,
} from './recoveryForesightTypes';
import { MAX_GUIDANCE_PER_PARTITION } from './recoveryForesightTypes';
import { buildRecoveryForesightComposite } from './recoveryForesightCoordinator';

interface PartitionStore {
  surfaces: StabilizationGuidanceSurface[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { surfaces: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

const TEMPLATES = {
  comparison_summary: 'foresight.comparison.summary.v1',
  survivability_overview: 'foresight.survivability.overview.v1',
  tradeoff_overview: 'foresight.tradeoff.overview.v1',
  archaeology_summary: 'foresight.archaeology.summary.v1',
  governance_visibility: 'foresight.governance.visibility.v1',
} as const;

export interface BuildGuidanceInput {
  readonly organization_id: string;
  readonly operator_id: string;
  readonly archetype_ids?: ReadonlyArray<string>;
}

export function buildStabilizationGuidanceSurface(
  input: BuildGuidanceInput,
): StabilizationGuidanceSurface {
  const composite = buildRecoveryForesightComposite(input);

  const blocks: StabilizationGuidanceBlock[] = [];

  blocks.push(makeBlock(TEMPLATES.comparison_summary,
    `Comparison surface — ${composite.comparison.rows.length} archetype(s) side-by-side, tier=${composite.comparison.tier}, engine_never_ranks=true. Operators sort UI side; engine never ranks.`,
    [{
      source_kind: 'phase_30_comparison',
      source_id: composite.comparison.comparison_hash,
      source_phase: 'phase_30_foresight',
    }],
  ));

  blocks.push(makeBlock(TEMPLATES.survivability_overview,
    `Survivability — ${composite.survivability.rows.length} archetype rollback profiles, heuristic_only=true. Each row exposes uncertainty bounds + inherited confidence (capped at 80).`,
    [{
      source_kind: 'phase_30_survivability',
      source_id: composite.survivability.survivability_hash,
      source_phase: 'phase_30_foresight',
    }],
  ));

  blocks.push(makeBlock(TEMPLATES.tradeoff_overview,
    `Tradeoffs — ${composite.tradeoff.rows.length} archetype tradeoff rows. duration / strain / replay-amplification / topology-strain — every metric individually citable.`,
    [{
      source_kind: 'phase_30_tradeoff',
      source_id: composite.tradeoff.tradeoff_hash,
      source_phase: 'phase_30_foresight',
    }],
  ));

  blocks.push(makeBlock(TEMPLATES.archaeology_summary,
    `Archaeology — ${composite.archaeology.archetype_count} archetype(s), ${composite.archaeology.governance_attribution_count} governance decision(s), ${composite.archaeology.finality_proof_count} finality proof(s). Phase 29-only scope; cross_phase_archaeology=false.`,
    [{
      source_kind: 'phase_30_archaeology',
      source_id: composite.archaeology.archaeology_hash,
      source_phase: 'phase_30_foresight',
    }],
  ));

  blocks.push(makeBlock(TEMPLATES.governance_visibility,
    `Governance visibility — every comparison row exposes governance_passed + governance_reason. Hard veto preserved: forbidden_foresight_action rejects at gate. operator_mediation_required=true on every attribution.`,
    [{
      source_kind: 'phase_30_governance_visibility',
      source_id: composite.boundary_proof_chain.replay_hash,
      source_phase: 'phase_30_foresight',
    }],
  ));

  const surface: StabilizationGuidanceSurface = {
    guidance_id: `guid_${randomUUID()}`,
    organization_id: input.organization_id,
    blocks,
    advisory_only: true,
    engine_never_ranks: true,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.surfaces.push(surface);
  if (store.surfaces.length > MAX_GUIDANCE_PER_PARTITION) store.surfaces.shift();
  return surface;
}

function makeBlock(
  template_id: string, rendered_text: string,
  citations: ReadonlyArray<StabilizationGuidanceBlock['citations'][number]>,
): StabilizationGuidanceBlock {
  if (citations.length === 0) {
    throw new Error(
      'phase 30 guidance block requires at least one citation (Phase 24 inheritance)',
    );
  }
  return {
    block_id: `gblk_${randomUUID()}`,
    template_id,
    rendered_text,
    citations,
    deterministic_hash: deterministicHash(`${template_id}::${rendered_text}::${JSON.stringify(citations)}`),
  };
}

export function listGuidanceSurfaces(
  organization_id: string,
): ReadonlyArray<StabilizationGuidanceSurface> {
  return [...(partitions.get(organization_id)?.surfaces ?? [])].reverse();
}

export function recentGuidanceCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.surfaces ?? [];
    total += arr.filter(s => Date.parse(s.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetGuidanceSurfaceForTests(): void {
  partitions.clear();
}
