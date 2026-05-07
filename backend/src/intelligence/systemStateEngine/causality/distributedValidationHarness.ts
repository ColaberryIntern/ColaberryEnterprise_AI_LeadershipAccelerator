/**
 * distributedValidationHarness — Phase 16. Five pure-function validator
 * roles, each scoring a `MutationEnvelope` from a different lens, with
 * deterministic rationale + disagreement flags.
 *
 * Architectural commitment (per Phase 16 stress-test):
 *   - These are SCORING ALGORITHMS, NOT separate processes/agents.
 *   - "Distributed cognition" = 5 different lenses voting on the same
 *     evidence. The arbitration engine combines them into consensus.
 *   - Every verdict is deterministic + replay-safe + audit-logged.
 *
 * Validators:
 *   1. mutation_validator       — does the envelope itself look healthy?
 *   2. rollback_validator       — is the rollback chain credible?
 *   3. trust_validator          — is the per-intent trust sufficient?
 *   4. containment_validator    — is the class currently contained / frozen?
 *   5. blast_radius_validator   — is the blast forecast inside safe bounds?
 *
 * Each returns a `ValidatorVerdict` with confidence, recommendation,
 * rationale, evidence, disagreement_flags, propagation_concerns, and
 * stabilization_recommendations.
 */

import type {
  MutationEnvelope,
} from '../mutation/mutationTypes';
import type {
  ValidatorVerdict, ValidatorRole, ValidatorRecommendation,
} from './causalityTypes';

export interface ValidatorContext {
  readonly envelope: MutationEnvelope;
  /** Phase 15 trust score at evaluation time (0-100). */
  readonly current_trust_score: number;
  /** Whether the intent class is currently contained (Phase 15). */
  readonly is_contained: boolean;
  /** Whether the intent class is currently frozen (Phase 15). */
  readonly is_frozen: boolean;
  /** Average per-project mutation trust (Phase 15). */
  readonly avg_project_trust: number;
}

export const VALIDATOR_ROLES: ReadonlyArray<ValidatorRole> = [
  'mutation_validator',
  'rollback_validator',
  'trust_validator',
  'containment_validator',
  'blast_radius_validator',
];

export function runAllValidators(ctx: ValidatorContext): ReadonlyArray<ValidatorVerdict> {
  return [
    mutationValidator(ctx),
    rollbackValidator(ctx),
    trustValidator(ctx),
    containmentValidator(ctx),
    blastRadiusValidator(ctx),
  ];
}

// ─── 1. mutation_validator ────────────────────────────────────────────

export function mutationValidator(ctx: ValidatorContext): ValidatorVerdict {
  const env = ctx.envelope;
  const flags: string[] = [];
  const concerns: string[] = [];
  const stabilizations: string[] = [];

  // Confidence starts high; we deduct based on signals.
  let confidence = 80;

  if (env.provenance.entries.length === 0) {
    flags.push('no_provenance_chain');
    confidence -= 5;     // light deduction — empty provenance is normal for v1
  }
  if (env.provenance.inherited_severity === 'error') {
    flags.push('provenance_carries_error_severity');
    concerns.push('Provenance chain inherits an error-severity link.');
    confidence -= 5;
  }
  if (env.rollback_chain.length === 0) {
    flags.push('empty_rollback_chain');
    concerns.push('Envelope has no rollback chain — irreversible by design.');
    stabilizations.push('Reject envelopes without explicit rollback steps.');
    confidence -= 25;
  }
  if (env.scope.limits && Object.keys(env.scope.limits).length === 0) {
    flags.push('no_scope_limits');
    confidence -= 5;
  }

  const recommendation: ValidatorRecommendation =
    confidence >= 70 ? 'apply' :
    confidence >= 50 ? 'monitor' : 'reject';

  return finalize('mutation_validator', confidence, recommendation, env, flags, concerns, stabilizations,
    rationaleFor('mutation_validator', confidence, flags, env));
}

// ─── 2. rollback_validator ────────────────────────────────────────────

export function rollbackValidator(ctx: ValidatorContext): ValidatorVerdict {
  const env = ctx.envelope;
  const flags: string[] = [];
  const concerns: string[] = [];
  const stabilizations: string[] = [];
  let confidence = 80;

  if (env.rollback_chain.length === 0) {
    flags.push('rollback_chain_empty');
    confidence -= 40;
  } else {
    const noopOnly = env.rollback_chain.every(s => s.kind === 'noop');
    if (noopOnly) {
      flags.push('rollback_chain_only_noops');
      concerns.push('Rollback chain has only noop steps — effectively irreversible.');
      stabilizations.push('Require at least one substantive compensating step.');
      confidence -= 35;
    }
    if (env.reversibility === 'composite' && env.rollback_chain.length < 2) {
      flags.push('composite_with_short_chain');
      confidence -= 10;
    }
  }
  if (env.executed_at && env.verified_at && env.verification_status === 'failed') {
    concerns.push('Verification has already failed; rollback execution is the path forward.');
  }

  const recommendation: ValidatorRecommendation =
    env.verification_status === 'failed' ? 'rollback' :
    confidence >= 65 ? 'apply' :
    confidence >= 45 ? 'monitor' : 'reject';

  return finalize('rollback_validator', confidence, recommendation, env, flags, concerns, stabilizations,
    rationaleFor('rollback_validator', confidence, flags, env));
}

// ─── 3. trust_validator ───────────────────────────────────────────────

export function trustValidator(ctx: ValidatorContext): ValidatorVerdict {
  const flags: string[] = [];
  const concerns: string[] = [];
  const stabilizations: string[] = [];
  let confidence = 50 + Math.round(ctx.current_trust_score / 2);     // 50..100 range

  if (ctx.current_trust_score < 40) {
    flags.push('trust_below_floor');
    concerns.push(`Per-intent trust ${ctx.current_trust_score}/100 below safe floor 40.`);
    stabilizations.push('Defer to operator approval until trust recovers.');
    confidence -= 30;     // trust below floor is a hard signal, not a soft one
  } else if (ctx.current_trust_score < 60) {
    flags.push('trust_below_target');
    concerns.push('Per-intent trust below recommended target 60.');
    confidence -= 10;
  }
  if (ctx.avg_project_trust < 50) {
    flags.push('project_avg_trust_low');
    concerns.push(`Project-wide avg mutation trust ${ctx.avg_project_trust}/100 is low.`);
    confidence -= 10;
  }

  const recommendation: ValidatorRecommendation =
    confidence >= 75 ? 'apply' :
    confidence >= 55 ? 'monitor' : 'reject';

  return finalize('trust_validator', confidence, recommendation, ctx.envelope, flags, concerns, stabilizations,
    rationaleFor('trust_validator', confidence, flags, ctx.envelope, ctx));
}

// ─── 4. containment_validator ─────────────────────────────────────────

export function containmentValidator(ctx: ValidatorContext): ValidatorVerdict {
  const flags: string[] = [];
  const concerns: string[] = [];
  const stabilizations: string[] = [];
  let confidence = 90;
  let recommendation: ValidatorRecommendation = 'apply';

  if (ctx.is_frozen) {
    flags.push('intent_class_frozen');
    concerns.push(`Intent class ${ctx.envelope.mutation_class} is currently frozen.`);
    stabilizations.push('Lift containment via /admin/governance/mutation/lift before retrying.');
    recommendation = 'reject';
    confidence = 5;
  } else if (ctx.is_contained) {
    flags.push('intent_class_contained');
    concerns.push(`Intent class ${ctx.envelope.mutation_class} is currently contained.`);
    stabilizations.push('Wait for containment cooldown to expire (30 min default).');
    recommendation = 'contain';
    confidence = 25;
  }

  return finalize('containment_validator', confidence, recommendation, ctx.envelope, flags, concerns, stabilizations,
    rationaleFor('containment_validator', confidence, flags, ctx.envelope, ctx));
}

// ─── 5. blast_radius_validator ────────────────────────────────────────

export function blastRadiusValidator(ctx: ValidatorContext): ValidatorVerdict {
  const blast = ctx.envelope.blast_radius;
  const flags: string[] = [];
  const concerns: string[] = [];
  const stabilizations: string[] = [];
  let confidence = 100 - blast.score;

  if (blast.tier === 'high') {
    flags.push('blast_tier_high');
    concerns.push(`Blast score ${blast.score}/100 — autonomous mutation blocked at this tier.`);
    stabilizations.push('Either narrow scope or reduce active concurrency before retrying.');
  } else if (blast.tier === 'moderate') {
    flags.push('blast_tier_moderate');
    concerns.push(`Blast score ${blast.score}/100 — monitor for downstream destabilization.`);
  }
  if (blast.conflict_with_active_mutations >= 50) {
    flags.push('high_concurrency_conflict');
    concerns.push('Other mutations of the same intent class are still pending verification.');
  }

  const recommendation: ValidatorRecommendation =
    blast.tier === 'high' ? 'reject' :
    blast.tier === 'moderate' ? 'monitor' : 'apply';

  return finalize('blast_radius_validator', confidence, recommendation, ctx.envelope, flags, concerns, stabilizations,
    rationaleFor('blast_radius_validator', confidence, flags, ctx.envelope));
}

// ─── Helpers ──────────────────────────────────────────────────────────

function finalize(
  validator_type: ValidatorRole,
  rawConfidence: number,
  recommendation: ValidatorRecommendation,
  env: MutationEnvelope,
  flags: string[],
  concerns: string[],
  stabilizations: string[],
  rationale: string,
): ValidatorVerdict {
  const confidence = Math.max(0, Math.min(100, Math.round(rawConfidence)));
  return {
    validator_type,
    confidence,
    recommendation,
    rationale,
    evidence: {
      mutation_id: env.mutation_id,
      mutation_class: env.mutation_class,
      blast_score: env.blast_radius.score,
      verification_status: env.verification_status,
      containment_state: env.containment_state,
    },
    disagreement_flags: flags,
    propagation_concerns: concerns,
    stabilization_recommendations: stabilizations,
  };
}

function rationaleFor(
  role: ValidatorRole,
  confidence: number,
  flags: string[],
  env: MutationEnvelope,
  ctx?: ValidatorContext,
): string {
  const flagPart = flags.length > 0 ? ` flags: ${flags.join(', ')}.` : '';
  switch (role) {
    case 'mutation_validator':
      return `Envelope ${env.mutation_id.slice(0, 12)} (${env.mutation_class}); confidence ${confidence}/100.${flagPart}`;
    case 'rollback_validator':
      return `Reversibility ${env.reversibility}, rollback steps ${env.rollback_chain.length}; confidence ${confidence}/100.${flagPart}`;
    case 'trust_validator':
      return `Intent trust ${ctx?.current_trust_score ?? '?'}; project avg ${ctx?.avg_project_trust ?? '?'}; confidence ${confidence}/100.${flagPart}`;
    case 'containment_validator':
      return `Frozen=${ctx?.is_frozen ?? false}, contained=${ctx?.is_contained ?? false}; confidence ${confidence}/100.${flagPart}`;
    case 'blast_radius_validator':
      return `Blast tier ${env.blast_radius.tier}, score ${env.blast_radius.score}/100; confidence ${confidence}/100.${flagPart}`;
  }
}
