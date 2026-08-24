/**
 * experienceLedger — evidence-backed claims about what a builder has actually done.
 * PURE, no I/O.
 *
 * Master plan §Gate 11 lists eleven claim types and one rule that governs all of them:
 *
 *   > **No credit solely for attendance.**
 *
 * That rule is the entire design constraint. A ledger that counts participation produces
 * a number that rises with time served, which is indistinguishable from a timesheet and
 * useless as a claim about capability. Every claim here therefore requires a **specific
 * piece of delivery evidence** to exist, and the claim is defined by what that evidence
 * proves rather than by what the builder was present for.
 *
 * ## Why claims are earned from delivery evidence, not self-reported
 *
 * Gate 9's `delivery_evidence` is the source. A claim cannot be authored directly — it is
 * derived from a row that already had to pass the quality gate's declaration rules. This
 * is why the one-way projection in `deliveryEvidenceProjection.ts` exists and why it is
 * narrow: progression credit follows work that was recorded as done, not work someone
 * says they did.
 *
 * ## Relationship to the existing competency system
 *
 * The platform already has `ArchitectureSkillDefinition`, `StudentArchitectureSkill` and a
 * four-band evidence model (claim / knowledge / application / judgment) with versioned
 * weights. This module does **not** duplicate or replace that. It maps a delivery claim to
 * the band it legitimately evidences, and stops there — the proficiency arithmetic stays
 * where it already is, versioned and auditable.
 *
 * Mapping to a band rather than awarding a number is deliberate: a number computed here
 * would silently compete with `capeEvidenceBandWeightsService`'s versioned weights, and
 * two systems producing "proficiency" is how a metric stops meaning anything.
 */

import type { DeliveryEvidenceType } from './deliveryEvidence';

/** The eleven claim types from master plan §Gate 11. */
export type ExperienceClaimType =
  | 'requirements_authored'
  | 'architecture_decisions'
  | 'design_decisions'
  | 'agent_definitions'
  | 'inpact_requirements'
  | 'stories_directed'
  | 'releases_shipped'
  | 'client_reviews'
  | 'client_acceptance'
  | 'government_projects'
  | 'production_incidents';

export const EXPERIENCE_CLAIM_TYPES: readonly ExperienceClaimType[] = [
  'requirements_authored',
  'architecture_decisions',
  'design_decisions',
  'agent_definitions',
  'inpact_requirements',
  'stories_directed',
  'releases_shipped',
  'client_reviews',
  'client_acceptance',
  'government_projects',
  'production_incidents',
];

export function isExperienceClaimType(value: string): value is ExperienceClaimType {
  return (EXPERIENCE_CLAIM_TYPES as readonly string[]).includes(value);
}

/**
 * The four evidence bands the platform's architecture-skill model already uses.
 *
 * Reused verbatim rather than renamed. A second vocabulary for the same concept would
 * force every future reader to hold a translation table in their head.
 */
export type EvidenceBand = 'claim' | 'knowledge' | 'application' | 'judgment';

export interface ClaimRubric {
  /** What the builder must have done. Written so a mentor could check it by hand. */
  standard: string;
  /**
   * Delivery evidence types that can substantiate this claim. A claim with no
   * substantiating evidence type would be unearnable, which a test asserts against.
   */
  substantiatedBy: readonly DeliveryEvidenceType[];
  /** Which band of the existing architecture-skill model this legitimately evidences. */
  band: EvidenceBand;
  /**
   * Whether the claim requires a human to have accepted or reviewed the work.
   *
   * Separated from `substantiatedBy` because "a machine recorded it" and "a person stood
   * behind it" are different strengths of proof, and the judgment band should not be
   * reachable without the second.
   */
  requiresHumanConfirmation: boolean;
}

/**
 * The rubrics.
 *
 * Note that `production_incidents` is a claim. Handling an incident is real, evidenced
 * experience — arguably the most transferable kind — and a ledger that only counts
 * successes would quietly teach people to avoid the work where things go wrong.
 */
export const CLAIM_RUBRICS: Record<ExperienceClaimType, ClaimRubric> = {
  requirements_authored: {
    standard: 'Authored a requirement that a shipped story traces back to.',
    substantiatedBy: ['pull_request', 'commit'],
    band: 'application',
    requiresHumanConfirmation: false,
  },
  architecture_decisions: {
    standard:
      'Made an architecture decision with a written rationale that was reviewed and not superseded for cause.',
    substantiatedBy: ['architecture_review'],
    band: 'judgment',
    requiresHumanConfirmation: true,
  },
  design_decisions: {
    standard: 'Made a design decision that was approved and built.',
    substantiatedBy: ['design_approval'],
    band: 'judgment',
    requiresHumanConfirmation: true,
  },
  agent_definitions: {
    standard: 'Defined an agent that passed its trust requirements.',
    substantiatedBy: ['ai_eval', 'architecture_review'],
    band: 'application',
    requiresHumanConfirmation: false,
  },
  inpact_requirements: {
    standard: 'Addressed an INPACT dimension with a requirement, an implementation and an evaluation.',
    substantiatedBy: ['ai_eval'],
    band: 'judgment',
    requiresHumanConfirmation: true,
  },
  stories_directed: {
    standard: 'Directed a story to completion, including its failure paths.',
    substantiatedBy: ['pull_request', 'test_run'],
    band: 'application',
    requiresHumanConfirmation: false,
  },
  releases_shipped: {
    standard: 'Shipped a release that passed its quality gate.',
    substantiatedBy: ['deployment_verification'],
    band: 'application',
    requiresHumanConfirmation: false,
  },
  client_reviews: {
    standard: 'Presented work to a client and handled the review.',
    substantiatedBy: ['client_acceptance'],
    band: 'judgment',
    requiresHumanConfirmation: true,
  },
  client_acceptance: {
    standard: 'Obtained a durable client acceptance for work they directed.',
    substantiatedBy: ['client_acceptance'],
    band: 'judgment',
    requiresHumanConfirmation: true,
  },
  government_projects: {
    standard: 'Delivered on a project under a government or regulated delivery profile.',
    substantiatedBy: ['client_acceptance', 'deployment_verification'],
    band: 'application',
    requiresHumanConfirmation: true,
  },
  production_incidents: {
    standard: 'Diagnosed and resolved a production incident, with the fix evidenced.',
    substantiatedBy: ['operational_metric', 'deployment_verification'],
    band: 'judgment',
    requiresHumanConfirmation: true,
  },
};

export interface ClaimCandidate {
  claimType: string;
  /** The delivery evidence row backing this claim. */
  evidenceType: string;
  evidenceOutcome: string;
  /** Whether a human accepted, approved or reviewed the underlying work. */
  humanConfirmed?: boolean;
  /** Whether the builder actually did this work, rather than being on the project. */
  builderDidTheWork?: boolean;
}

export interface ClaimRejection {
  rule: string;
  detail: string;
}

export type ClaimVerdict =
  | { earned: true; claimType: ExperienceClaimType; band: EvidenceBand }
  | { earned: false; rejections: ClaimRejection[] };

/**
 * Decide whether one claim is earned.
 *
 * Fails closed and explains itself. A rejected claim returns its reasons because a builder
 * being told "not yet" without being told what is missing learns nothing, and a ledger
 * that cannot explain a refusal will be argued with rather than trusted.
 */
export function evaluateClaim(candidate: ClaimCandidate): ClaimVerdict {
  const rejections: ClaimRejection[] = [];

  if (!isExperienceClaimType(candidate.claimType)) {
    return {
      earned: false,
      rejections: [
        { rule: 'unknown_claim_type', detail: `'${candidate.claimType}' is not a claim type.` },
      ],
    };
  }

  const rubric = CLAIM_RUBRICS[candidate.claimType];

  // THE RULE: no credit solely for attendance. Being on the project is not doing the work,
  // and this is the only check that cannot be satisfied by a system-generated row.
  if (candidate.builderDidTheWork === false) {
    rejections.push({
      rule: 'attendance_only',
      detail:
        'The builder was present but did not do this work. Master plan §Gate 11: no credit ' +
        'solely for attendance.',
    });
  }

  if (!(rubric.substantiatedBy as readonly string[]).includes(candidate.evidenceType)) {
    rejections.push({
      rule: 'evidence_cannot_substantiate',
      detail:
        `'${candidate.evidenceType}' cannot substantiate '${candidate.claimType}'. ` +
        `Accepted: ${rubric.substantiatedBy.join(', ')}.`,
    });
  }

  if (candidate.evidenceOutcome !== 'pass') {
    rejections.push({
      rule: 'evidence_not_passing',
      detail: `Backing evidence recorded '${candidate.evidenceOutcome}', not 'pass'.`,
    });
  }

  if (rubric.requiresHumanConfirmation && !candidate.humanConfirmed) {
    rejections.push({
      rule: 'human_confirmation_missing',
      detail:
        `'${candidate.claimType}' evidences the ${rubric.band} band, which requires a person ` +
        'to have stood behind the work rather than only a system having recorded it.',
    });
  }

  if (rejections.length > 0) return { earned: false, rejections };
  return { earned: true, claimType: candidate.claimType, band: rubric.band };
}

export interface LedgerSummary {
  /** Count of earned claims per type. Absent types are genuinely zero, not unknown. */
  earnedByType: Partial<Record<ExperienceClaimType, number>>;
  /** Bands evidenced at least once. */
  bandsEvidenced: EvidenceBand[];
  totalEarned: number;
  totalRejected: number;
}

/**
 * Summarize a set of candidates.
 *
 * Reports rejected count alongside earned. A summary that showed only what was earned
 * would make a ledger with 40 rejected claims look identical to a clean one, and the
 * difference is exactly what a mentor needs to see.
 */
export function summarizeLedger(candidates: readonly ClaimCandidate[]): LedgerSummary {
  const earnedByType: Partial<Record<ExperienceClaimType, number>> = {};
  const bands = new Set<EvidenceBand>();
  let totalEarned = 0;
  let totalRejected = 0;

  for (const candidate of candidates) {
    const verdict = evaluateClaim(candidate);
    if (verdict.earned) {
      earnedByType[verdict.claimType] = (earnedByType[verdict.claimType] ?? 0) + 1;
      bands.add(verdict.band);
      totalEarned += 1;
    } else {
      totalRejected += 1;
    }
  }

  return {
    earnedByType,
    bandsEvidenced: [...bands],
    totalEarned,
    totalRejected,
  };
}
