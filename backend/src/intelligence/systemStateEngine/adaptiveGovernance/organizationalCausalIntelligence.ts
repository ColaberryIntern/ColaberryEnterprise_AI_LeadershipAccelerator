/**
 * organizationalCausalIntelligence — Phase 17 PROJECT-LOCAL recurring
 * pattern detector.
 *
 * Architectural commitment (per the Phase 17 stress-test):
 *   - This module operates STRICTLY per-project. There is NO cross-project
 *     trust contamination. The Phase 13 `federatedTrustProfiles` surface
 *     stays the only cross-project channel — and is NOT extended here.
 *   - Outputs are read-only summaries. The module does NOT mutate state.
 *
 * Detected archetypes (per the addendum):
 *   - recurring_contradiction_kind   (same kind appearing repeatedly)
 *   - unstable_mutation_pattern      (same intent class repeatedly contained)
 *   - governance_drift_signature     (recurring policy_changed audit pattern)
 *   - rollback_failure_pattern       (mutations that always end in rollback)
 *   - propagation_archetype          (same hotspot signature recurring)
 */

import type { ContradictionFlag } from '../types/systemState.types';
import type {
  OrganizationalArchetypeEntry,
  OrganizationalCausalIntelligenceReport,
} from './adaptiveGovernanceTypes';

export interface BuildOrganizationalCausalInput {
  readonly project_id: string;
  /** Recent contradictions (last 7d). */
  readonly contradictions: ReadonlyArray<ContradictionFlag>;
  /** Audit-row payloads of kind `mutation_contained` for this project. */
  readonly contained_mutations: ReadonlyArray<{ intent_class: string; subject_id?: string; recorded_at: string }>;
  /** Audit-row payloads of kind `mutation_rolled_back`. */
  readonly rolled_back_mutations: ReadonlyArray<{ intent_class: string; subject_id?: string; recorded_at: string }>;
  /** Audit-row payloads of kind `policy_changed`. */
  readonly policy_changes: ReadonlyArray<{ scope?: string; recorded_at: string }>;
  /** Recent contradiction propagation hotspots. */
  readonly hotspots: ReadonlyArray<{ subject_id: string; count: number }>;
}

const RECURRENCE_THRESHOLD = 3;     // ≥3 occurrences = "recurring"

export function buildOrganizationalCausalIntelligence(input: BuildOrganizationalCausalInput): OrganizationalCausalIntelligenceReport {
  const entries: OrganizationalArchetypeEntry[] = [];
  const now = new Date().toISOString();

  // 1. recurring_contradiction_kind — group by `kind`.
  const byContradictionKind = groupBy(input.contradictions, c => c.kind);
  for (const [kind, flags] of byContradictionKind.entries()) {
    if (flags.length < RECURRENCE_THRESHOLD) continue;
    entries.push({
      archetype: 'recurring_contradiction_kind',
      signature: kind,
      occurrences: flags.length,
      last_observed_at: now,
      project_id: input.project_id,
      examples: flags.slice(0, 3).map(f => f.message).filter(Boolean),
    });
  }

  // 2. unstable_mutation_pattern — group contained_mutations by intent_class.
  const byContainedIntent = groupBy(input.contained_mutations, m => m.intent_class);
  for (const [intent, list] of byContainedIntent.entries()) {
    if (list.length < RECURRENCE_THRESHOLD) continue;
    entries.push({
      archetype: 'unstable_mutation_pattern',
      signature: intent,
      occurrences: list.length,
      last_observed_at: list[list.length - 1]?.recorded_at ?? now,
      project_id: input.project_id,
      examples: list.slice(0, 3).map(m => m.subject_id ?? '(no subject)'),
    });
  }

  // 3. rollback_failure_pattern — group rolled_back_mutations by intent_class.
  const byRollbackIntent = groupBy(input.rolled_back_mutations, m => m.intent_class);
  for (const [intent, list] of byRollbackIntent.entries()) {
    if (list.length < RECURRENCE_THRESHOLD) continue;
    entries.push({
      archetype: 'rollback_failure_pattern',
      signature: intent,
      occurrences: list.length,
      last_observed_at: list[list.length - 1]?.recorded_at ?? now,
      project_id: input.project_id,
      examples: list.slice(0, 3).map(m => m.subject_id ?? '(no subject)'),
    });
  }

  // 4. governance_drift_signature — repeated policy_changed scopes.
  const byPolicyScope = groupBy(input.policy_changes, p => p.scope ?? '(unscoped)');
  for (const [scope, list] of byPolicyScope.entries()) {
    if (list.length < RECURRENCE_THRESHOLD) continue;
    entries.push({
      archetype: 'governance_drift_signature',
      signature: scope,
      occurrences: list.length,
      last_observed_at: list[list.length - 1]?.recorded_at ?? now,
      project_id: input.project_id,
      examples: list.slice(0, 3).map((_, i) => `policy change #${i + 1} on ${scope}`),
    });
  }

  // 5. propagation_archetype — hotspots with sustained high count.
  for (const h of input.hotspots) {
    if (h.count < RECURRENCE_THRESHOLD) continue;
    entries.push({
      archetype: 'propagation_archetype',
      signature: h.subject_id,
      occurrences: h.count,
      last_observed_at: now,
      project_id: input.project_id,
      examples: [`subject_id ${h.subject_id} carries ${h.count} contradictions`],
    });
  }

  return {
    project_id: input.project_id,
    entries: entries.sort((a, b) => b.occurrences - a.occurrences),
    built_at: now,
  };
}

function groupBy<T, K>(items: ReadonlyArray<T>, keyFn: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

export const _RECURRENCE_THRESHOLD_FOR_TESTS = RECURRENCE_THRESHOLD;

