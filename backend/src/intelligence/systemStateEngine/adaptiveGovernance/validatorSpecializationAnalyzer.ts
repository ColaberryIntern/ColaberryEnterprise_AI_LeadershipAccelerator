/**
 * validatorSpecializationAnalyzer — Phase 17. Per-validator-per-domain
 * reliability scoring. Detects WHERE validators are reliable
 * operationally without ever modifying their code.
 *
 * Architectural commitment:
 *   - Validator implementations are STATIC.
 *   - Specialization = reliability tracked per `MutationIntent` domain.
 *   - When a validator is consistently strong on POLICY_NUDGE but weak
 *     on QUEUE_STABILIZATION, the dashboard surfaces that; the
 *     validator code stays the same.
 *
 * Strictly in-memory + sync. Source-of-truth for history is the
 * `arbitration_completed` audit rows.
 */

import type {
  ValidatorRole, MutationIntent, ValidatorVerdict, ValidationArbitrationResult,
} from '../causality/causalityTypes';
import { MUTATION_INTENT_CLASSES } from '../mutation/mutationTypes';
import { VALIDATOR_ROLES } from '../causality/distributedValidationHarness';
import type { ValidatorSpecializationEntry, ValidatorSpecializationMap } from './adaptiveGovernanceTypes';

interface DomainObservation {
  agreements: number;
  observations: number;
}

const projectStates = new Map<string, Map<ValidatorRole, Map<MutationIntent, DomainObservation>>>();

function getProjectMap(project_id: string): Map<ValidatorRole, Map<MutationIntent, DomainObservation>> {
  let m = projectStates.get(project_id);
  if (!m) {
    m = new Map();
    for (const role of VALIDATOR_ROLES) {
      const inner = new Map<MutationIntent, DomainObservation>();
      for (const intent of MUTATION_INTENT_CLASSES) {
        inner.set(intent, { agreements: 0, observations: 0 });
      }
      m.set(role, inner);
    }
    projectStates.set(project_id, m);
  }
  return m;
}

/**
 * Observe an arbitration outcome scoped to a particular mutation
 * intent class. Each verdict's per-domain reliability is updated.
 */
export function observeForSpecialization(
  project_id: string,
  domain: MutationIntent,
  result: ValidationArbitrationResult,
): void {
  const map = getProjectMap(project_id);
  for (const v of result.verdicts) {
    const roleMap = map.get(v.validator_type);
    if (!roleMap) continue;
    const stats = roleMap.get(domain) ?? { agreements: 0, observations: 0 };
    stats.observations++;
    if (v.recommendation === result.consensus_recommendation) stats.agreements++;
    roleMap.set(domain, stats);
  }
}

export function buildSpecializationMap(project_id: string): ValidatorSpecializationMap {
  const map = getProjectMap(project_id);
  const entries: ValidatorSpecializationEntry[] = [];
  // Pre-compute each validator's overall accuracy across all domains.
  const overallByRole = new Map<ValidatorRole, number>();
  for (const role of VALIDATOR_ROLES) {
    const inner = map.get(role)!;
    let agree = 0, obs = 0;
    for (const stats of inner.values()) { agree += stats.agreements; obs += stats.observations; }
    overallByRole.set(role, obs === 0 ? 100 : Math.round((agree / obs) * 100));
  }

  for (const role of VALIDATOR_ROLES) {
    const inner = map.get(role)!;
    const overall = overallByRole.get(role)!;
    for (const domain of MUTATION_INTENT_CLASSES) {
      const stats = inner.get(domain)!;
      const accuracy_in_domain = stats.observations === 0 ? 100 :
        Math.round((stats.agreements / stats.observations) * 100);
      const relative = accuracy_in_domain - overall;
      const isStrong = stats.observations >= 3 && relative >= 10;
      const isWeak = stats.observations >= 3 && relative <= -10;
      const note = stats.observations === 0
        ? `cold-start: no observations yet for ${domain}.`
        : isStrong ? `strong: ${accuracy_in_domain}% (${relative >= 0 ? '+' : ''}${relative} vs overall ${overall}%).`
        : isWeak ? `weak: ${accuracy_in_domain}% (${relative} vs overall ${overall}%).`
        : `neutral: ${accuracy_in_domain}% (${relative >= 0 ? '+' : ''}${relative} vs overall ${overall}%).`;
      entries.push({
        validator_role: role,
        domain,
        observations: stats.observations,
        accuracy_in_domain,
        relative_strength: relative,
        is_strong: isStrong,
        is_weak: isWeak,
        note,
      });
    }
  }

  // Build per-domain strongest / weakest.
  const strongest: Partial<Record<MutationIntent, ValidatorRole>> = {};
  const weakest: Partial<Record<MutationIntent, ValidatorRole>> = {};
  for (const domain of MUTATION_INTENT_CLASSES) {
    const inDomain = entries.filter(e => e.domain === domain && e.observations >= 3);
    if (inDomain.length === 0) continue;
    inDomain.sort((a, b) => b.accuracy_in_domain - a.accuracy_in_domain);
    strongest[domain] = inDomain[0].validator_role;
    weakest[domain] = inDomain[inDomain.length - 1].validator_role;
  }

  return {
    project_id,
    entries,
    strongest_per_domain: strongest,
    weakest_per_domain: weakest,
    built_at: new Date().toISOString(),
  };
}

/** Per-validator-per-domain accuracy lookup for the adaptive engine. */
export function specializationAccuracy(project_id: string, role: ValidatorRole, domain: MutationIntent): { accuracy: number; observations: number } {
  const stats = getProjectMap(project_id).get(role)?.get(domain) ?? { agreements: 0, observations: 0 };
  if (stats.observations === 0) return { accuracy: 100, observations: 0 };
  return { accuracy: Math.round((stats.agreements / stats.observations) * 100), observations: stats.observations };
}

export function _resetSpecializationAnalyzer(): void {
  projectStates.clear();
}

/** Test helper — observe a single verdict directly. */
export function _testRecordSpecialization(
  project_id: string,
  domain: MutationIntent,
  verdict: ValidatorVerdict,
  consensus: string,
): void {
  const map = getProjectMap(project_id);
  const roleMap = map.get(verdict.validator_type);
  if (!roleMap) return;
  const stats = roleMap.get(domain) ?? { agreements: 0, observations: 0 };
  stats.observations++;
  if (verdict.recommendation === consensus) stats.agreements++;
  roleMap.set(domain, stats);
}
