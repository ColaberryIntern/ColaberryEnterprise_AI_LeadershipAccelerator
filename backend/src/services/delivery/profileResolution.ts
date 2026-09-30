/**
 * profileResolution — a pinned profile plus contract-specific requirements. PURE, no I/O.
 *
 * Master plan §Gate 13: *"Contract-specific requirements override/add."*
 *
 * ## Add and tighten freely. Removing is a waiver, and a waiver is a record.
 *
 * The dangerous reading of "override" is deletion: a contract that quietly drops
 * accessibility from a government engagement, and nobody notices until an assessor does.
 * The mundane version is worse — nobody deletes anything on purpose, a category just never
 * makes it into the resolved set because an override replaced a list instead of extending
 * it.
 *
 * So this module distinguishes three operations:
 *
 *   **add**      — a contract requires something the profile does not. Always allowed.
 *   **tighten**  — a contract raises the bar on something the profile already requires.
 *   **waive**    — a contract removes a baseline requirement. Allowed ONLY with a reason
 *                  and a named approver, and refused outright for categories the profile
 *                  marks non-waivable-without-record.
 *
 * A waiver is not a loophole; it is the honest form of a decision that would otherwise
 * happen silently. Public bodies do sometimes waive a requirement for good reason. What
 * they cannot do is discover afterwards that nobody recorded it.
 *
 * ## Pinning
 *
 * A resolution is computed against a **pinned profile version**. Requirements must not
 * shift under a signed contract, so a profile revision is adopted by decision, not by
 * being deployed.
 */

import {
  COMPLIANCE_DISCLAIMER,
  DELIVERY_PROFILES,
  PROFILE_COMPLIANCE_CLAIM,
  isDeliveryProfileKey,
  type ComplianceClaim,
  type DeliveryProfileDefinition,
  type DeliveryProfileKey,
} from '../../modules/delivery/deliveryProfiles';

export type ContractRequirementOperation = 'add' | 'tighten' | 'waive';

export interface ContractRequirement {
  operation: ContractRequirementOperation;
  /** The requirement category this touches. */
  category: string;
  /** What the contract demands, or why the waiver applies. */
  detail: string;
  /** Required for `waive`. */
  waiverReason?: string | null;
  /** Required for `waive`. A waiver is an act by a named person. */
  waiverApprovedByIdentityId?: string | null;
}

export interface ProfileResolutionInput {
  profileKey: string;
  /** The version the engagement pinned. Refused if it does not match the current definition. */
  pinnedVersion: number;
  contractRequirements?: readonly ContractRequirement[];
}

export interface ResolutionIssue {
  rule: string;
  detail: string;
  severity: 'blocking' | 'warning';
}

export interface RecordedWaiver {
  category: string;
  reason: string;
  approvedByIdentityId: string;
}

export interface ResolvedProfile {
  profileKey: DeliveryProfileKey;
  version: number;
  requirementCategories: string[];
  architectureChecks: string[];
  evidence: string[];
  reviewers: string[];
  releaseGates: string[];
  documents: string[];
  operationsControls: string[];
  /** Contract additions and tightenings, kept distinct from the baseline. */
  contractAdditions: ContractRequirement[];
  /** Every waiver, with its reason and approver. Never silent. */
  waivers: RecordedWaiver[];
  /** Always 'none'. See deliveryProfiles.ts. */
  complianceClaim: ComplianceClaim;
  disclaimer: string;
}

export type ProfileResolution =
  | { resolved: true; profile: ResolvedProfile; issues: ResolutionIssue[] }
  | { resolved: false; issues: ResolutionIssue[] };

const MIN_WAIVER_REASON_LENGTH = 20;

/**
 * Resolve a profile against a contract.
 *
 * Fails closed on a version mismatch rather than resolving against whatever is current.
 * Silently upgrading a pinned engagement to a newer baseline is precisely the drift the
 * pin exists to prevent — and it would be invisible, because the result would look
 * perfectly reasonable.
 */
export function resolveProfile(input: ProfileResolutionInput): ProfileResolution {
  const issues: ResolutionIssue[] = [];
  const add = (rule: string, detail: string, severity: ResolutionIssue['severity'] = 'blocking') =>
    issues.push({ rule, detail, severity });

  if (!isDeliveryProfileKey(input.profileKey)) {
    add('unknown_profile', `'${input.profileKey}' is not a delivery profile.`);
    return { resolved: false, issues };
  }

  const definition: DeliveryProfileDefinition = DELIVERY_PROFILES[input.profileKey];

  if (input.pinnedVersion !== definition.version) {
    add(
      'profile_version_mismatch',
      `Engagement pinned '${input.profileKey}' v${input.pinnedVersion}; the current ` +
        `definition is v${definition.version}. Adopting a new baseline is a decision, not a ` +
        'side effect of a deploy.',
    );
    return { resolved: false, issues };
  }

  const categories = new Set<string>(definition.requirementCategories);
  const contractAdditions: ContractRequirement[] = [];
  const waivers: RecordedWaiver[] = [];

  for (const requirement of input.contractRequirements ?? []) {
    switch (requirement.operation) {
      case 'add':
        categories.add(requirement.category);
        contractAdditions.push(requirement);
        break;

      case 'tighten':
        if (!categories.has(requirement.category)) {
          // Tightening something the profile never required is an addition wearing the
          // wrong label. Accepted, but flagged — the label matters when someone later asks
          // what the baseline actually was.
          categories.add(requirement.category);
          add(
            'tighten_of_absent_category',
            `Contract tightens '${requirement.category}', which the profile does not require. ` +
              'Recorded as an addition.',
            'warning',
          );
        }
        contractAdditions.push(requirement);
        break;

      case 'waive': {
        const nonWaivable = definition.nonWaivableWithoutRecord.includes(requirement.category);
        const reasonOk =
          !!requirement.waiverReason &&
          requirement.waiverReason.trim().length >= MIN_WAIVER_REASON_LENGTH;
        const approverOk = !!requirement.waiverApprovedByIdentityId;

        if (!reasonOk) {
          add(
            'waiver_reason_required',
            `Waiving '${requirement.category}' requires a reason a reviewer could evaluate later.`,
          );
        }
        if (!approverOk) {
          add(
            'waiver_approver_required',
            `Waiving '${requirement.category}' requires a named approver.`,
          );
        }

        if (reasonOk && approverOk) {
          categories.delete(requirement.category);
          waivers.push({
            category: requirement.category,
            reason: requirement.waiverReason!.trim(),
            approvedByIdentityId: requirement.waiverApprovedByIdentityId!,
          });
          if (nonWaivable) {
            // Allowed, because a public body can genuinely waive a requirement — but never
            // quietly. The warning is what makes it visible in every downstream report.
            add(
              'baseline_category_waived',
              `'${requirement.category}' is a baseline category for this profile and has been ` +
                'waived. This must appear in the release documentation.',
              'warning',
            );
          }
        }
        break;
      }

      default:
        add('unknown_operation', `'${String(requirement.operation)}' is not a known operation.`);
    }
  }

  if (issues.some((i) => i.severity === 'blocking')) {
    return { resolved: false, issues };
  }

  return {
    resolved: true,
    issues,
    profile: {
      profileKey: definition.key,
      version: definition.version,
      requirementCategories: [...categories],
      architectureChecks: [...definition.architectureChecks],
      evidence: [...definition.evidence],
      reviewers: [...definition.reviewers],
      releaseGates: [...definition.releaseGates],
      documents: [...definition.documents],
      operationsControls: [...definition.operationsControls],
      contractAdditions,
      waivers,
      complianceClaim: PROFILE_COMPLIANCE_CLAIM,
      disclaimer: COMPLIANCE_DISCLAIMER,
    },
  };
}

/**
 * Whether verified work under this profile can count as builder specialization evidence.
 *
 * Master plan §Gate 13: *"Verified government work can become builder specialization
 * evidence."* Gate 11's ledger already has the `government_projects` claim; this is the
 * condition under which it may be earned.
 *
 * A waived baseline category does not disqualify the claim — the work still happened — but
 * the claim records how many were waived, because "delivered a government project" and
 * "delivered a government project with four baseline categories waived" describe different
 * amounts of demonstrated experience.
 */
export interface SpecializationEvidence {
  eligible: boolean;
  profileKey: DeliveryProfileKey;
  waivedCategoryCount: number;
  reason: string;
}

export function specializationEvidenceFor(
  profile: ResolvedProfile,
  clientAccepted: boolean,
): SpecializationEvidence {
  if (profile.profileKey !== 'government_public_sector') {
    return {
      eligible: false,
      profileKey: profile.profileKey,
      waivedCategoryCount: profile.waivers.length,
      reason: 'Specialization evidence is specific to the government/public-sector profile.',
    };
  }

  if (!clientAccepted) {
    return {
      eligible: false,
      profileKey: profile.profileKey,
      waivedCategoryCount: profile.waivers.length,
      reason: 'Work must be accepted by the client before it evidences specialization.',
    };
  }

  return {
    eligible: true,
    profileKey: profile.profileKey,
    waivedCategoryCount: profile.waivers.length,
    reason: `Accepted delivery under the government profile with ${profile.waivers.length} waived baseline categories.`,
  };
}
