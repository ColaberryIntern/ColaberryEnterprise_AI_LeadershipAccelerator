/**
 * deliveryProfiles — versioned delivery profiles. PURE, no I/O.
 *
 * Master plan §Gate 13: a profile injects required requirement categories, architecture
 * checks, evidence, reviewers, release gates, documents and operations controls. Three
 * profiles to start: `commercial_standard`, `internal_tool`, `government_public_sector`.
 *
 * And one instruction that shapes the whole module:
 *
 *   > **Do not claim universal compliance.**
 *
 * ## What a profile is, and what it is not
 *
 * A profile is **a list of things we check**. It is not a certification, an attestation,
 * or a statement that a delivery satisfies any named standard. Meeting the
 * `government_public_sector` profile does not make a system FedRAMP authorized, Section
 * 508 conformant, StateRAMP approved, or CJIS compliant — those are determinations made by
 * assessors and authorizing officials, not by a table in this repo.
 *
 * That distinction survives contact with a sales conversation only if it is structural, so
 * every resolved profile carries `complianceClaim: 'none'` and `assertNoComplianceClaim`
 * refuses to describe a profile as compliance with a named standard. The same reasoning as
 * Gate 12's unvalidated ratio: a caveat in a document is read once, a caveat bound to the
 * object travels with it.
 *
 * ## Why profiles are versioned and pinned
 *
 * Requirements must not shift under a signed contract. A project pins a profile *version*
 * at engagement start, exactly as `delivery_client_acceptances` snapshots what was
 * promised. If the government baseline gains a thirteenth category next year, an
 * in-flight engagement keeps the twelve it was scoped and priced against, and adopting the
 * new version is a decision someone makes rather than something that happens to them.
 */

export type DeliveryProfileKey =
  | 'commercial_standard'
  | 'internal_tool'
  | 'government_public_sector';

export const DELIVERY_PROFILE_KEYS: readonly DeliveryProfileKey[] = [
  'commercial_standard',
  'internal_tool',
  'government_public_sector',
];

export function isDeliveryProfileKey(value: string): value is DeliveryProfileKey {
  return (DELIVERY_PROFILE_KEYS as readonly string[]).includes(value);
}

/** The seven things a profile injects (master plan §Gate 13). */
export type ProfileInjection =
  | 'requirement_categories'
  | 'architecture_checks'
  | 'evidence'
  | 'reviewers'
  | 'release_gates'
  | 'documents'
  | 'operations_controls';

export const PROFILE_INJECTIONS: readonly ProfileInjection[] = [
  'requirement_categories',
  'architecture_checks',
  'evidence',
  'reviewers',
  'release_gates',
  'documents',
  'operations_controls',
];

/**
 * The government/public-sector baseline categories from master plan §Gate 13.
 *
 * Twelve areas we commit to *examining*. Naming them is a scope statement, not a
 * compliance claim — see the module header.
 */
export type GovernmentBaselineCategory =
  | 'accessibility'
  | 'security'
  | 'privacy'
  | 'records_retention'
  | 'identity_authorization'
  | 'auditability'
  | 'ai_transparency'
  | 'human_oversight'
  | 'data_handling'
  | 'availability'
  | 'documentation'
  | 'procurement_hosting_constraints';

export const GOVERNMENT_BASELINE_CATEGORIES: readonly GovernmentBaselineCategory[] = [
  'accessibility',
  'security',
  'privacy',
  'records_retention',
  'identity_authorization',
  'auditability',
  'ai_transparency',
  'human_oversight',
  'data_handling',
  'availability',
  'documentation',
  'procurement_hosting_constraints',
];

export interface DeliveryProfileDefinition {
  key: DeliveryProfileKey;
  /** Bumped whenever the content changes. Projects pin a version. */
  version: number;
  label: string;
  /** What this profile is for, in one line. */
  intent: string;
  requirementCategories: readonly string[];
  architectureChecks: readonly string[];
  /** Quality dimensions that must be evidenced beyond the story-level baseline. */
  evidence: readonly string[];
  /** Delivery roles that must review before release. */
  reviewers: readonly string[];
  releaseGates: readonly string[];
  documents: readonly string[];
  operationsControls: readonly string[];
  /**
   * Categories that may never be silently dropped by a contract. A contract can WAIVE one
   * with a recorded reason and approver; it cannot delete it. See `profileResolution.ts`.
   */
  nonWaivableWithoutRecord: readonly string[];
}

const COMMERCIAL_STANDARD: DeliveryProfileDefinition = {
  key: 'commercial_standard',
  version: 1,
  label: 'Commercial standard',
  intent: 'Default profile for a paying commercial client.',
  requirementCategories: ['functional', 'security', 'privacy', 'documentation'],
  architectureChecks: ['no_secrets_in_source', 'documented_failure_paths'],
  evidence: ['requirements_coverage', 'acceptance_coverage', 'unit_tests', 'security'],
  reviewers: ['delivery_owner'],
  releaseGates: ['quality_gate_passed', 'client_acceptance_recorded'],
  documents: ['scope_summary', 'release_notes'],
  operationsControls: ['error_monitoring'],
  nonWaivableWithoutRecord: ['security'],
};

const INTERNAL_TOOL: DeliveryProfileDefinition = {
  key: 'internal_tool',
  version: 1,
  label: 'Internal tool',
  intent: 'Software built for our own staff, where the client and the builder are us.',
  // Deliberately lighter, and deliberately NOT empty. An internal tool that mishandles
  // staff data is still a breach; "internal" lowers the ceremony, not the floor.
  requirementCategories: ['functional', 'security'],
  architectureChecks: ['no_secrets_in_source'],
  evidence: ['requirements_coverage', 'unit_tests'],
  reviewers: ['delivery_owner'],
  releaseGates: ['quality_gate_passed'],
  documents: ['release_notes'],
  operationsControls: ['error_monitoring'],
  nonWaivableWithoutRecord: ['security'],
};

const GOVERNMENT_PUBLIC_SECTOR: DeliveryProfileDefinition = {
  key: 'government_public_sector',
  version: 1,
  label: 'Government / public sector',
  intent:
    'Delivery for a public body. Names twelve areas we commit to examining. NOT a claim of ' +
    'compliance with any named standard.',
  requirementCategories: [...GOVERNMENT_BASELINE_CATEGORIES],
  architectureChecks: [
    'no_secrets_in_source',
    'documented_failure_paths',
    'data_residency_declared',
    'audit_log_immutable',
    'human_oversight_documented',
  ],
  evidence: [
    'requirements_coverage',
    'acceptance_coverage',
    'unit_tests',
    'integration',
    'security',
    'accessibility',
    'architecture_drift',
    'client_acceptance',
  ],
  reviewers: ['delivery_owner', 'security_reviewer', 'accessibility_reviewer'],
  releaseGates: [
    'quality_gate_passed',
    'security_review_signed',
    'accessibility_review_signed',
    'client_acceptance_recorded',
  ],
  documents: [
    'scope_summary',
    'security_summary',
    'accessibility_conformance_statement',
    'data_handling_statement',
    'ai_transparency_statement',
    'records_retention_statement',
    'release_notes',
  ],
  operationsControls: [
    'error_monitoring',
    'audit_log_retention',
    'availability_target_declared',
    'incident_response_contact',
  ],
  // The whole baseline. A government engagement that drops accessibility or auditability
  // silently is the failure this list exists to prevent.
  nonWaivableWithoutRecord: [...GOVERNMENT_BASELINE_CATEGORIES],
};

export const DELIVERY_PROFILES: Record<DeliveryProfileKey, DeliveryProfileDefinition> = {
  commercial_standard: COMMERCIAL_STANDARD,
  internal_tool: INTERNAL_TOOL,
  government_public_sector: GOVERNMENT_PUBLIC_SECTOR,
};

/**
 * The compliance claim a profile makes. Exactly one value is legal.
 *
 * Modelled as a type rather than a comment so that "we are FedRAMP compliant" cannot be
 * expressed by this system at all.
 */
export type ComplianceClaim = 'none';

export const PROFILE_COMPLIANCE_CLAIM: ComplianceClaim = 'none';

export const COMPLIANCE_DISCLAIMER =
  'A delivery profile lists what we examine. It is not a certification or attestation, and ' +
  'meeting it does not establish conformance with FedRAMP, StateRAMP, Section 508, WCAG, ' +
  'CJIS, HIPAA, SOC 2 or any other named standard. Those determinations are made by ' +
  'assessors and authorizing officials.';

/** Named standards a profile must never be described as satisfying. */
const NAMED_STANDARDS = [
  'fedramp',
  'stateramp',
  'section 508',
  '508 compliant',
  'wcag',
  'cjis',
  'hipaa',
  'soc 2',
  'soc2',
  'iso 27001',
  'fisma',
  'nist 800-53',
];

export interface ComplianceClaimRefusal {
  rule: string;
  detail: string;
}

/**
 * Refuse language that turns a profile into a compliance claim.
 *
 * Checks the words someone would actually write on a capability statement or a bid
 * response. It is a tripwire, not a language model — it cannot catch every phrasing, and
 * saying so is part of the control rather than a weakness in it.
 */
export function assertNoComplianceClaim(text: string): ComplianceClaimRefusal[] {
  const refusals: ComplianceClaimRefusal[] = [];
  const lowered = text.toLowerCase();

  for (const standard of NAMED_STANDARDS) {
    if (!lowered.includes(standard)) continue;

    const claimsConformance = /\b(compliant|compliance|certified|accredited|conformant|authorized|meets)\b/.test(
      lowered,
    );
    if (claimsConformance) {
      refusals.push({
        rule: 'named_standard_compliance_claim',
        detail:
          `Text asserts conformance with '${standard}'. A delivery profile lists what we ` +
          'examine; it does not certify. Master plan §Gate 13: do not claim universal compliance.',
      });
    }
  }

  if (/\b(fully|universally|all)\s+compliant\b/.test(lowered)) {
    refusals.push({
      rule: 'universal_compliance_claim',
      detail: 'Universal compliance is never claimed by a delivery profile.',
    });
  }

  return refusals;
}
