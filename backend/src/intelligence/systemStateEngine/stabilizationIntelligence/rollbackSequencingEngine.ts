/**
 * rollbackSequencingEngine — Phase 29. Advisory ordered sequencing.
 *
 * Architectural commitment:
 *   - `advisory_only: true` + `never_auto_executes: true` typed-as-literal.
 *   - Produces typed `recommended_envelope_payload` Phase 27 envelope
 *     drafts that an operator clicks to apply through the existing
 *     issuance + quota gate flow.
 *   - The engine NEVER issues envelopes itself, NEVER invokes mutators,
 *     NEVER calls into Phase 27 executeDelegated.
 *   - Cross-organization isolation absolute.
 */

import { createHash } from 'crypto';
import type {
  RollbackSequencingProfile, RecommendedEnvelopePayload,
  RecoveryArchetypeProfile, RecoveryArchetypeStep,
} from './stabilizationIntelligenceTypes';
import { MAX_SEQUENCINGS_PER_PARTITION } from './stabilizationIntelligenceTypes';
import { getArchetype } from './recoveryArchetypeRegistry';

interface PartitionStore {
  sequencings: RollbackSequencingProfile[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { sequencings: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildSequencingInput {
  readonly organization_id: string;
  readonly archetype_id: string;
  readonly per_step_overrides?: ReadonlyArray<{
    readonly step_index: number;
    readonly target_namespace?: string;
    readonly target_kind?: string;
    readonly target_plan_id?: string;
    readonly target_step_id?: string;
    readonly suggested_rollback_chain_id_hint?: string;
  }>;
}

export type BuildSequencingResult =
  | { built: true; profile: RollbackSequencingProfile }
  | { built: false; reason: string };

/**
 * Build an advisory sequencing profile for a known archetype. NEVER
 * executes — produces typed envelope drafts only.
 */
export function buildRollbackSequencing(input: BuildSequencingInput): BuildSequencingResult {
  const archetype = getArchetype(input.organization_id, input.archetype_id);
  if (!archetype) return { built: false, reason: 'archetype_not_found' };

  const per_step = new Map<number, NonNullable<BuildSequencingInput['per_step_overrides']>[number]>();
  for (const o of input.per_step_overrides ?? []) per_step.set(o.step_index, o);

  const built_at = new Date().toISOString();
  const steps = archetype.steps.map((archStep): RollbackSequencingProfile['steps'][number] => {
    const override = per_step.get(archStep.step_index);
    const draft = buildRecommendedPayload(archStep, archetype, input.organization_id, override);
    return {
      step_index: archStep.step_index,
      recommended_payload: draft,
      rationale: archStep.rationale,
      // Confidence inherited from archetype provenance: built-in = 80,
      // operator-set = 70 (heuristic humility — operator-set has shorter
      // historical lineage). No ML; pure structural mapping.
      inherited_confidence_score: archetype.is_built_in ? 80 : 70,
    };
  });

  const sequencing_hash = deterministicHash(
    `${input.organization_id}::${archetype.archetype_id}::${archetype.deterministic_hash}::${JSON.stringify(steps.map(s => s.recommended_payload.draft_hash))}`,
  );

  const profile: RollbackSequencingProfile = {
    organization_id: input.organization_id,
    archetype_id: archetype.archetype_id,
    steps,
    advisory_only: true,
    never_auto_executes: true,
    sequencing_hash,
    built_at,
  };

  const store = ensure(input.organization_id);
  store.sequencings.push(profile);
  if (store.sequencings.length > MAX_SEQUENCINGS_PER_PARTITION) store.sequencings.shift();

  return { built: true, profile };
}

function buildRecommendedPayload(
  archStep: RecoveryArchetypeStep,
  archetype: RecoveryArchetypeProfile,
  organization_id: string,
  override?: NonNullable<BuildSequencingInput['per_step_overrides']>[number],
): RecommendedEnvelopePayload {
  const target_namespace = override?.target_namespace ?? archStep.parameter_template.target_namespace;
  const target_kind = override?.target_kind ?? archStep.parameter_template.target_kind;
  const target_plan_id = override?.target_plan_id ?? archStep.parameter_template.target_plan_id;
  const target_step_id = override?.target_step_id ?? archStep.parameter_template.target_step_id;
  const suggested_rollback_chain_id_hint =
    override?.suggested_rollback_chain_id_hint
    ?? `rollback_chain_${archetype.archetype_id}_step_${archStep.step_index}`;

  const draft_hash = deterministicHash(
    `${archetype.archetype_id}::${archStep.step_index}::${archStep.action_kind}::${target_namespace ?? ''}::${target_kind ?? ''}::${target_plan_id ?? ''}::${target_step_id ?? ''}::${suggested_rollback_chain_id_hint}`,
  );

  return {
    action_kind: archStep.action_kind,
    target_namespace,
    target_kind,
    target_organization_id: organization_id,
    target_plan_id,
    target_step_id,
    suggested_rollback_chain_id_hint,
    rationale: archStep.rationale,
    draft_hash,
  };
}

export function listSequencingProfiles(
  organization_id: string,
): ReadonlyArray<RollbackSequencingProfile> {
  return [...(partitions.get(organization_id)?.sequencings ?? [])].reverse();
}

export function recentSequencingCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.sequencings ?? [];
    total += arr.filter(s => Date.parse(s.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetSequencingEngineForTests(): void {
  partitions.clear();
}
