/**
 * validatorTrustCalibrator — Phase 16. Per-validator trust state with:
 *   - agreement_rate vs. eventual consensus
 *   - drift_signal classification (stable / over_triggering / under_detecting / inconsistent)
 *   - per-pair disagreement profile (which validators clash on which topics)
 *
 * Strictly in-memory + sync. GovernanceAuditEntry rows of kind
 * `arbitration_completed` and `validator_disagreement` remain the
 * historical source of truth.
 *
 * Per the addendum: persistence covers disagreement frequency,
 * categories, recurring splits, confidence divergence, arbitration
 * frequency, and escalation rates — NOT just final outcomes.
 */

import type {
  ValidatorRole, ValidatorVerdict, ValidationArbitrationResult,
  ValidatorTrustEntry, ValidatorTrustProfile, ValidatorDisagreementProfile,
} from './causalityTypes';
import { VALIDATOR_ROLES } from './distributedValidationHarness';

interface InternalCounters {
  observations: number;
  agreements: number;        // matched the eventual consensus
  over_triggers: number;     // recommended reject but consensus said apply
  under_detects: number;     // recommended apply but consensus said reject/contain/rollback
  total_confidence: number;
}

interface DisagreementCounters {
  total_arbitrations: number;
  pair_disagreements: number;
  topics: Map<string, number>;
  total_confidence_divergence: number;
  escalations: number;
}

const validatorStates = new Map<string, Map<ValidatorRole, InternalCounters>>();
const disagreementStates = new Map<string, Map<string, DisagreementCounters>>(); // project → pairKey → counters

function getValidatorMap(project_id: string): Map<ValidatorRole, InternalCounters> {
  let m = validatorStates.get(project_id);
  if (!m) {
    m = new Map();
    for (const role of VALIDATOR_ROLES) {
      m.set(role, { observations: 0, agreements: 0, over_triggers: 0, under_detects: 0, total_confidence: 0 });
    }
    validatorStates.set(project_id, m);
  }
  return m;
}

function getDisagreementMap(project_id: string): Map<string, DisagreementCounters> {
  let m = disagreementStates.get(project_id);
  if (!m) {
    m = new Map();
    disagreementStates.set(project_id, m);
  }
  return m;
}

function pairKey(a: ValidatorRole, b: ValidatorRole): string {
  return [a, b].sort().join('::');
}

/**
 * Record an arbitration outcome. Updates per-validator agreement +
 * per-pair disagreement profiles.
 */
export function recordArbitration(project_id: string, result: ValidationArbitrationResult): void {
  const validatorMap = getValidatorMap(project_id);
  const disagreementMap = getDisagreementMap(project_id);
  const consensus = result.consensus_recommendation;

  for (const v of result.verdicts) {
    const counters = validatorMap.get(v.validator_type)!;
    counters.observations++;
    counters.total_confidence += v.confidence;
    if (v.recommendation === consensus) {
      counters.agreements++;
    } else {
      // Heuristic split: if validator was more conservative than consensus,
      // count as over_trigger (false positive). If less conservative,
      // count as under_detect.
      if (priority(v.recommendation) > priority(consensus)) counters.over_triggers++;
      else counters.under_detects++;
    }
  }

  // Per-pair disagreement bookkeeping
  for (let i = 0; i < result.verdicts.length; i++) {
    for (let j = i + 1; j < result.verdicts.length; j++) {
      const a = result.verdicts[i];
      const b = result.verdicts[j];
      const key = pairKey(a.validator_type, b.validator_type);
      let entry = disagreementMap.get(key);
      if (!entry) {
        entry = { total_arbitrations: 0, pair_disagreements: 0, topics: new Map(), total_confidence_divergence: 0, escalations: 0 };
        disagreementMap.set(key, entry);
      }
      entry.total_arbitrations++;
      entry.total_confidence_divergence += Math.abs(a.confidence - b.confidence);
      if (a.recommendation !== b.recommendation) {
        entry.pair_disagreements++;
        // Topic = the most-divergent flag pair — record up to one topic per arbitration
        const topic = (a.disagreement_flags[0] || b.disagreement_flags[0] || a.recommendation + 'vs' + b.recommendation);
        entry.topics.set(topic, (entry.topics.get(topic) ?? 0) + 1);
      }
      if (result.escalation_required) entry.escalations++;
    }
  }
}

/** Build the read-side trust profile for the project. */
export function readValidatorTrustProfile(project_id: string): ValidatorTrustProfile {
  const m = getValidatorMap(project_id);
  const dis = getDisagreementMap(project_id);
  const entries: ValidatorTrustEntry[] = VALIDATOR_ROLES.map(role => {
    const counters = m.get(role)!;
    const obs = counters.observations;
    const agreement_rate = obs === 0 ? 100 : Math.round((counters.agreements / obs) * 100);
    const over_rate = obs === 0 ? 0 : counters.over_triggers / obs;
    const under_rate = obs === 0 ? 0 : counters.under_detects / obs;
    let drift_signal: ValidatorTrustEntry['drift_signal'] = 'stable';
    if (over_rate >= 0.5) drift_signal = 'over_triggering';
    else if (under_rate >= 0.5) drift_signal = 'under_detecting';
    else if (Math.abs(over_rate - under_rate) > 0.3) drift_signal = 'inconsistent';
    // Trust: cold-start 70; agreement_rate moves it.
    const trust_score = obs === 0 ? 70 : Math.max(0, Math.min(100, Math.round(agreement_rate * 0.8 + 20)));
    return { validator_type: role, trust_score, agreement_rate, observations: obs, drift_signal };
  });

  const disagreement_profiles: ValidatorDisagreementProfile[] = Array.from(dis.entries()).map(([key, c]) => {
    const [a, b] = key.split('::') as [ValidatorRole, ValidatorRole];
    const total = c.total_arbitrations;
    return {
      validator_pair: [a, b] as const,
      disagreement_rate: total === 0 ? 0 : Math.round((c.pair_disagreements / total) * 100),
      disagreement_topics: Array.from(c.topics.entries())
        .sort((x, y) => y[1] - x[1])
        .slice(0, 5)
        .map(([t]) => t),
      confidence_divergence: total === 0 ? 0 : Math.round(c.total_confidence_divergence / total),
      arbitration_frequency: total,
      escalation_rate: total === 0 ? 0 : Math.round((c.escalations / total) * 100),
    };
  });

  return {
    project_id,
    entries,
    disagreement_profiles,
    built_at: new Date().toISOString(),
  };
}

/** Per-role trust for the arbitration weight tuner (Phase 17+). */
export function validatorTrust(project_id: string, role: ValidatorRole): number {
  const counters = getValidatorMap(project_id).get(role)!;
  if (counters.observations === 0) return 70;
  const rate = counters.agreements / counters.observations;
  return Math.round(rate * 80 + 20);
}

export function _resetValidatorTrust(): void {
  validatorStates.clear();
  disagreementStates.clear();
}

function priority(r: import('./causalityTypes').ValidatorRecommendation): number {
  return ({ apply: 1, monitor: 2, contain: 3, rollback: 4, reject: 5 } as const)[r];
}

/** Export verdicts that materially diverged for a single arbitration —
 *  used for the `validator_disagreement` audit row payload. */
export function extractDisagreements(result: ValidationArbitrationResult): ReadonlyArray<{ validator: ValidatorRole; recommendation: string; confidence: number }> {
  if (result.verdicts.length === 0) return [];
  const consensusPriority = priority(result.consensus_recommendation);
  return result.verdicts
    .filter(v => Math.abs(priority(v.recommendation) - consensusPriority) >= 2)
    .map(v => ({ validator: v.validator_type, recommendation: v.recommendation, confidence: v.confidence }));
}

/** Persist a disagreement audit row when the arbitration result calls for it.
 *  Writes a `validator_disagreement` GovernanceAuditEntry row. Fail-soft. */
export async function persistDisagreementAudit(project_id: string, result: ValidationArbitrationResult, mutation_id: string): Promise<void> {
  const dissenters = extractDisagreements(result);
  if (dissenters.length === 0) return;
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id,
      kind: 'validator_disagreement',
      subject_id: mutation_id,
      payload: {
        consensus: result.consensus_recommendation,
        consensus_confidence: result.consensus_confidence,
        dissenters,
        arbitration_risk: result.arbitration_risk,
        confidence_range: result.confidence_range,
      },
      operator_id: null,
      recorded_at: new Date(),
    } as any);
  } catch (err: any) {
    console.warn('[validatorTrustCalibrator] disagreement audit failed:', err?.message);
  }
}
