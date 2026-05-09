/**
 * recoveryArchetypeRegistry — Phase 29. Built-in static archetypes
 * (frozen + hash-verified) + operator-set augmented archetypes
 * (with full governance lineage).
 *
 * Architectural commitment:
 *   - 5 built-in archetypes are FROZEN at module load. Hashes are
 *     computed once and verified on every read.
 *   - Operator-set archetypes are mutable ONLY via `setOperatorArchetype`,
 *     which records a `RecoveryArchetypeGovernanceAttribution` per change.
 *   - No runtime-derived / auto-discovered archetypes (would trigger
 *     `playbook_self_evolution` from the forbidden registry).
 *   - Every archetype has a deterministic_hash; same definition → same hash.
 *   - Cross-organization isolation: every operator-set archetype is per-org.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  RecoveryArchetypeProfile, RecoveryArchetypeStep,
  RecoveryArchetypeGovernanceAttribution,
} from './stabilizationIntelligenceTypes';
import {
  MAX_OPERATOR_ARCHETYPES_PER_PARTITION,
  MAX_ARCHETYPE_GOVERNANCE_PER_PARTITION,
  MAX_STEPS_PER_ARCHETYPE,
} from './stabilizationIntelligenceTypes';

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function hashStep(step: Omit<RecoveryArchetypeStep, 'deterministic_hash'>): string {
  return deterministicHash(JSON.stringify({
    step_index: step.step_index,
    action_kind: step.action_kind,
    rationale: step.rationale,
    parameter_template: step.parameter_template,
    required_rollback_chain_id_param: step.required_rollback_chain_id_param,
  }));
}

function hashArchetype(profile: Omit<RecoveryArchetypeProfile, 'deterministic_hash'>): string {
  return deterministicHash(JSON.stringify({
    archetype_id: profile.archetype_id,
    name: profile.name,
    description: profile.description,
    provenance: profile.provenance,
    is_built_in: profile.is_built_in,
    steps: profile.steps,
    applicable_when: profile.applicable_when,
  }));
}

// ─── Built-in archetypes (frozen) ──────────────────────────────────

function buildStep(
  step_index: number,
  action_kind: RecoveryArchetypeStep['action_kind'],
  rationale: string,
  parameter_template: RecoveryArchetypeStep['parameter_template'] = {},
  required_rollback_chain_id_param = true,
): RecoveryArchetypeStep {
  const without_hash: Omit<RecoveryArchetypeStep, 'deterministic_hash'> = {
    step_index, action_kind, rationale, parameter_template,
    required_rollback_chain_id_param,
  };
  return { ...without_hash, deterministic_hash: hashStep(without_hash) };
}

function buildArchetype(input: Omit<RecoveryArchetypeProfile, 'deterministic_hash' | 'registered_at' | 'provenance' | 'is_built_in'>): RecoveryArchetypeProfile {
  const registered_at = '1970-01-01T00:00:00.000Z';     // built-ins frozen
  const profile_without_hash: Omit<RecoveryArchetypeProfile, 'deterministic_hash'> = {
    ...input,
    provenance: 'built_in',
    is_built_in: true,
    registered_at,
  };
  return { ...profile_without_hash, deterministic_hash: hashArchetype(profile_without_hash) };
}

const BUILT_IN_ARCHETYPES: ReadonlyArray<RecoveryArchetypeProfile> = Object.freeze([
  buildArchetype({
    archetype_id: 'broker_isolation_lift_then_replay',
    name: 'Lift broker isolation, then continuity replay',
    description: 'When a broker namespace has been auto-isolated and the upstream cause has been resolved, lift the isolation and run a continuity replay to re-converge state.',
    steps: [
      buildStep(0, 'lift_broker_isolation',
        'Lift the active broker isolation for the target namespace once upstream is healthy.'),
      buildStep(1, 'force_continuity_replay',
        'Replay continuity events to re-converge brokered state across partitions.'),
    ],
    applicable_when: [
      'broker_isolations_active >= 1',
      'upstream cause resolved',
      'pressure tier <= elevated',
    ],
    source_lineage: [
      { source_kind: 'phase_21_broker_isolation', source_id: 'liftIsolation', source_phase: 'phase_21_runtime' },
      { source_kind: 'phase_21_continuity_replay', source_id: 'performContinuityReplay', source_phase: 'phase_21_runtime' },
    ],
  }),
  buildArchetype({
    archetype_id: 'topology_recovery_step_sequence',
    name: 'Topology recovery — single step',
    description: 'Apply one operator-selected step from a Phase 22 topology recovery plan.',
    steps: [
      buildStep(0, 'execute_topology_recovery_step',
        'Execute one specific Phase 22 topology recovery step. Operator selects plan_id + step_id.',
        { /* operator fills target_plan_id + target_step_id */ }),
    ],
    applicable_when: [
      'topology fragmentation present',
      'operator-selected Phase 22 plan exists',
    ],
    source_lineage: [
      { source_kind: 'phase_22_topology_recovery', source_id: 'executeTopologyRecoveryStep', source_phase: 'phase_22_topology' },
    ],
  }),
  buildArchetype({
    archetype_id: 'distributed_recovery_step_sequence',
    name: 'Distributed recovery — single step',
    description: 'Apply one operator-selected step from a Phase 21 distributed recovery plan.',
    steps: [
      buildStep(0, 'execute_distributed_recovery_step',
        'Execute one specific Phase 21 distributed recovery step. Operator selects plan_id + step_id.',
        { /* operator fills target_plan_id + target_step_id */ }),
    ],
    applicable_when: [
      'distributed runtime instability',
      'operator-selected Phase 21 plan exists',
    ],
    source_lineage: [
      { source_kind: 'phase_21_distributed_recovery', source_id: 'executeRecoveryStep', source_phase: 'phase_21_runtime' },
    ],
  }),
  buildArchetype({
    archetype_id: 'execution_isolation_lift',
    name: 'Lift execution kind isolation',
    description: 'Lift a Phase 23 execution-kind isolation once upstream cause has been resolved.',
    steps: [
      buildStep(0, 'lift_execution_isolation',
        'Lift active execution-kind isolation for the target_kind. Operator selects target_kind.',
        { /* operator fills target_kind */ }),
    ],
    applicable_when: [
      'execution kind isolated',
      'upstream cause resolved',
    ],
    source_lineage: [
      { source_kind: 'phase_23_execution_isolation', source_id: 'liftIsolation', source_phase: 'phase_23_execution_substrate' },
    ],
  }),
  buildArchetype({
    archetype_id: 'continuity_replay_only',
    name: 'Continuity replay only',
    description: 'Run a single continuity replay across brokered state without lifting any isolation.',
    steps: [
      buildStep(0, 'force_continuity_replay',
        'Single continuity replay to re-converge brokered state. Use when no isolations are active but state divergence is suspected.'),
    ],
    applicable_when: [
      'no active broker isolations',
      'state divergence suspected',
    ],
    source_lineage: [
      { source_kind: 'phase_21_continuity_replay', source_id: 'performContinuityReplay', source_phase: 'phase_21_runtime' },
    ],
  }),
]);

// ─── Operator-set archetype storage (per-org) ──────────────────────

interface PartitionStore {
  archetypes: RecoveryArchetypeProfile[];
  governance_log: RecoveryArchetypeGovernanceAttribution[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { archetypes: [], governance_log: [] }; partitions.set(organization_id, s); }
  return s;
}

// ─── Read APIs ─────────────────────────────────────────────────────

/** Returns all archetypes available for the organization (built-in + operator-set). */
export function listArchetypes(organization_id: string): ReadonlyArray<RecoveryArchetypeProfile> {
  const operator_set = partitions.get(organization_id)?.archetypes ?? [];
  return [...BUILT_IN_ARCHETYPES, ...operator_set];
}

export function listBuiltInArchetypes(): ReadonlyArray<RecoveryArchetypeProfile> {
  return BUILT_IN_ARCHETYPES;
}

export function listOperatorArchetypes(organization_id: string): ReadonlyArray<RecoveryArchetypeProfile> {
  return [...(partitions.get(organization_id)?.archetypes ?? [])];
}

export function getArchetype(organization_id: string, archetype_id: string): RecoveryArchetypeProfile | null {
  return listArchetypes(organization_id).find(a => a.archetype_id === archetype_id) ?? null;
}

export function listArchetypeGovernanceAttributions(
  organization_id: string,
): ReadonlyArray<RecoveryArchetypeGovernanceAttribution> {
  return [...(partitions.get(organization_id)?.governance_log ?? [])].reverse();
}

// ─── Operator-driven mutation ──────────────────────────────────────

export interface SetOperatorArchetypeInput {
  readonly organization_id: string;
  readonly archetype_id?: string;                            // optional — assigned if omitted
  readonly name: string;
  readonly description: string;
  readonly steps: ReadonlyArray<{
    readonly step_index: number;
    readonly action_kind: RecoveryArchetypeStep['action_kind'];
    readonly rationale: string;
    readonly parameter_template?: RecoveryArchetypeStep['parameter_template'];
    readonly required_rollback_chain_id_param?: boolean;
  }>;
  readonly applicable_when: ReadonlyArray<string>;
  readonly registered_by: string;                            // operator_id
  readonly reason: string;
}

export interface SetOperatorArchetypeResult {
  readonly applied: boolean;
  readonly archetype?: RecoveryArchetypeProfile;
  readonly attribution?: RecoveryArchetypeGovernanceAttribution;
  readonly reason?: string;
}

export function setOperatorArchetype(input: SetOperatorArchetypeInput): SetOperatorArchetypeResult {
  if (!input.registered_by || input.registered_by.trim().length === 0) {
    return { applied: false, reason: 'registered_by_missing' };
  }
  if (input.steps.length === 0 || input.steps.length > MAX_STEPS_PER_ARCHETYPE) {
    return { applied: false, reason: `step_count_out_of_bounds (1..${MAX_STEPS_PER_ARCHETYPE})` };
  }

  const store = ensure(input.organization_id);
  const archetype_id = input.archetype_id ?? `op_arch_${randomUUID()}`;
  const previous = store.archetypes.find(a => a.archetype_id === archetype_id) ?? null;

  // Cannot overwrite a built-in archetype id.
  if (BUILT_IN_ARCHETYPES.some(a => a.archetype_id === archetype_id)) {
    return { applied: false, reason: 'archetype_id_collides_with_built_in' };
  }

  const steps: RecoveryArchetypeStep[] = input.steps.map(s => {
    const without_hash: Omit<RecoveryArchetypeStep, 'deterministic_hash'> = {
      step_index: s.step_index,
      action_kind: s.action_kind,
      rationale: s.rationale,
      parameter_template: s.parameter_template ?? {},
      required_rollback_chain_id_param: s.required_rollback_chain_id_param ?? true,
    };
    return { ...without_hash, deterministic_hash: hashStep(without_hash) };
  });

  const registered_at = new Date().toISOString();
  const profile_without_hash: Omit<RecoveryArchetypeProfile, 'deterministic_hash'> = {
    archetype_id,
    name: input.name,
    description: input.description,
    provenance: 'operator_set',
    is_built_in: false,
    steps,
    applicable_when: input.applicable_when,
    source_lineage: [{
      source_kind: 'phase_29_operator_set',
      source_id: archetype_id,
      source_phase: 'phase_29_stabilization',
    }],
    registered_at,
    registered_by: input.registered_by,
  };
  const archetype: RecoveryArchetypeProfile = {
    ...profile_without_hash,
    deterministic_hash: hashArchetype(profile_without_hash),
  };

  // Replace or append.
  const i = store.archetypes.findIndex(a => a.archetype_id === archetype_id);
  if (i >= 0) {
    store.archetypes[i] = archetype;
  } else {
    store.archetypes.push(archetype);
    if (store.archetypes.length > MAX_OPERATOR_ARCHETYPES_PER_PARTITION) {
      store.archetypes.shift();
    }
  }

  const attribution: RecoveryArchetypeGovernanceAttribution = {
    attribution_id: `arch_gov_${randomUUID()}`,
    organization_id: input.organization_id,
    archetype_id,
    previous_hash: previous?.deterministic_hash,
    updated_hash: archetype.deterministic_hash,
    updated_by: input.registered_by,
    reason: input.reason,
    recorded_at: registered_at,
    deterministic_hash: deterministicHash(
      `${input.organization_id}::${archetype_id}::${previous?.deterministic_hash ?? ''}->${archetype.deterministic_hash}::${input.registered_by}::${input.reason}`,
    ),
  };
  store.governance_log.push(attribution);
  if (store.governance_log.length > MAX_ARCHETYPE_GOVERNANCE_PER_PARTITION) {
    store.governance_log.shift();
  }

  return { applied: true, archetype, attribution };
}

export function recentArchetypeGovernanceCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const log = partitions.get(o)?.governance_log ?? [];
    total += log.filter(r => Date.parse(r.recorded_at) >= cutoff).length;
  }
  return total;
}

/**
 * Verify a built-in archetype's deterministic_hash — used at startup
 * + per-read to detect any tampering (would indicate a code-path
 * mutation, not a runtime mutation).
 */
export function verifyBuiltInIntegrity(): { all_valid: boolean; mismatches: ReadonlyArray<string> } {
  const mismatches: string[] = [];
  for (const a of BUILT_IN_ARCHETYPES) {
    const recomputed = hashArchetype({
      archetype_id: a.archetype_id, name: a.name, description: a.description,
      provenance: a.provenance, is_built_in: a.is_built_in, steps: a.steps,
      applicable_when: a.applicable_when, source_lineage: a.source_lineage,
      registered_at: a.registered_at, registered_by: a.registered_by,
    });
    if (recomputed !== a.deterministic_hash) mismatches.push(a.archetype_id);
  }
  return { all_valid: mismatches.length === 0, mismatches };
}

export function _resetArchetypeRegistryForTests(): void {
  partitions.clear();
}
