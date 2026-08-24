/**
 * deliveryDesignLoop — governed design decisions. PURE, no I/O.
 *
 * **This is not Figma and must not become it.** Master plan §Gate 6 is explicit: do not
 * build a design tool, build governed design *decisions*. What this module owns is the
 * order decisions are taken in, whether a decision may be approved yet, and whether an
 * approved one can be changed without anyone noticing.
 *
 * THE HIERARCHY IS AN ORDERING CONSTRAINT, NOT A LABEL:
 *
 *   1 Product Personality → 2 Design System (DNA) → 3 Page Families
 *     → 4 Critical Workflows → 5 Exceptions
 *
 * Approving a page family before the design system exists means the page family is
 * standing on nothing — every later DNA decision silently invalidates it, and nobody finds
 * out until the screens are built. Same shape as the INPACT dependency phases in
 * `modules/delivery/inpact.ts`, and enforced the same way: deterministically, before the
 * expensive work.
 *
 * SUPERSESSION, NEVER SILENT OVERWRITE. Master plan §24 lists "design approval can be
 * silently overwritten" as a stop condition. An approved decision changes by being
 * superseded, exactly like `deliveryDecisionService`.
 */

export type DesignTier =
  | 'product_personality'
  | 'design_system'
  | 'page_family'
  | 'critical_workflow'
  | 'exception';

/** Index + 1 is the tier level. Order is the dependency order. */
export const DESIGN_TIERS: readonly DesignTier[] = [
  'product_personality',
  'design_system',
  'page_family',
  'critical_workflow',
  'exception',
];

export function designTierLevel(tier: DesignTier): number {
  return DESIGN_TIERS.indexOf(tier) + 1;
}

export type DesignDecisionStatus =
  | 'draft'
  | 'variants_ready'
  | 'in_review'
  | 'approved'
  | 'superseded';

/**
 * The Design DNA facets from master plan §Gate 6.
 *
 * A checklist rather than a schema: the point is that a design system decision has
 * covered them, not that each is a column. `missingDnaFacets()` reports what a proposed
 * DNA has not spoken to, so "we forgot tables" surfaces before page families are built on
 * a DNA that never mentioned them.
 */
export const DESIGN_DNA_FACETS = [
  'theme',
  'typography',
  'density',
  'spacing',
  'navigation',
  'buttons',
  'forms',
  'tables',
  'cards',
  'modals_drawers',
  'charts',
  'ai_interaction_style',
  'accessibility',
] as const;

export type DesignDnaFacet = (typeof DESIGN_DNA_FACETS)[number];

export interface DesignDecisionLike {
  id: string;
  tier: DesignTier;
  title?: string | null;
  status: DesignDecisionStatus;
  variantCount?: number;
  approvedVariantId?: string | null;
  rationale?: string | null;
  approvedByIdentityId?: string | null;
  supersedesDecisionId?: string | null;
  /** For a design_system decision: which DNA facets it addresses. */
  dnaFacets?: string[] | null;
}

export interface DesignIssue {
  decisionId: string;
  rule: string;
  detail: string;
  severity: 'blocking' | 'warning';
}

/** Master plan §Gate 6: "Support 2-4 interactive variants for meaningful decisions." */
export const MIN_VARIANTS = 2;
export const MAX_VARIANTS = 4;

/**
 * Tiers where offering variants is meaningful.
 *
 * Product personality and exceptions are excluded deliberately. A personality is a
 * direction, not a layout to compare; an exception is by definition a one-off departure
 * from an approved rule, and demanding alternatives for it would be ceremony.
 */
const VARIANT_TIERS: readonly DesignTier[] = [
  'design_system',
  'page_family',
  'critical_workflow',
];

export function tierExpectsVariants(tier: DesignTier): boolean {
  return VARIANT_TIERS.includes(tier);
}

/** DNA facets a design_system decision has not addressed. */
export function missingDnaFacets(facets: readonly string[] | null | undefined): DesignDnaFacet[] {
  const present = new Set(facets ?? []);
  return DESIGN_DNA_FACETS.filter((f) => !present.has(f));
}

/**
 * Can this decision be approved, given what is already approved?
 *
 * Every tier below it must have at least one approved decision. `product_personality`
 * (level 1) has nothing beneath it and is always eligible.
 */
export function prerequisiteTiers(tier: DesignTier): DesignTier[] {
  return DESIGN_TIERS.slice(0, designTierLevel(tier) - 1);
}

export interface ApprovalEligibility {
  eligible: boolean;
  missingTiers: DesignTier[];
  reason: string;
}

export function checkApprovalEligibility(
  tier: DesignTier,
  approvedTiers: readonly DesignTier[],
): ApprovalEligibility {
  const missing = prerequisiteTiers(tier).filter((t) => !approvedTiers.includes(t));

  return {
    eligible: missing.length === 0,
    missingTiers: missing,
    reason:
      missing.length === 0
        ? 'prerequisites_approved'
        : `awaiting_approval_of:${missing.join(',')}`,
  };
}

/**
 * Validate one decision.
 *
 * Blocking vs warning follows `sbp/planGate.ts`'s line: a rule blocks when it would
 * mislead about what was agreed or let unapproved work proceed; it warns when the record
 * is merely thin.
 */
export function validateDesignDecision(
  decision: DesignDecisionLike,
  approvedTiers: readonly DesignTier[] = [],
): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const add = (rule: string, detail: string, severity: DesignIssue['severity'] = 'blocking') =>
    issues.push({ decisionId: decision.id, rule, detail, severity });

  const variantCount = decision.variantCount ?? 0;

  if (tierExpectsVariants(decision.tier)) {
    if (variantCount > 0 && variantCount < MIN_VARIANTS) {
      // One "option" is a proposal presented as a choice. The client cannot compare, so
      // the approval it produces is weaker than it looks.
      add(
        'too_few_variants',
        `${variantCount} variant(s); a comparable decision needs at least ${MIN_VARIANTS}.`,
        'warning',
      );
    }
    if (variantCount > MAX_VARIANTS) {
      add(
        'too_many_variants',
        `${variantCount} variants exceeds ${MAX_VARIANTS}; more options slow a decision rather than improving it.`,
        'warning',
      );
    }
  }

  if (decision.status === 'approved') {
    if (!decision.approvedByIdentityId) {
      add('approved_without_approver', 'An approval with no approver is not an approval.');
    }
    if (tierExpectsVariants(decision.tier) && variantCount > 0 && !decision.approvedVariantId) {
      // Variants were offered but none was chosen, so the record cannot say what was
      // agreed — which is the entire purpose of approving a design decision.
      add('approved_without_chosen_variant', 'Variants were offered but none is marked approved.');
    }
    if (!decision.rationale?.trim()) {
      add('approved_without_rationale', 'Why this was chosen is not recorded.', 'warning');
    }

    const eligibility = checkApprovalEligibility(decision.tier, approvedTiers);
    if (!eligibility.eligible) {
      add(
        'approved_out_of_order',
        `Tier '${decision.tier}' approved before ${eligibility.missingTiers.join(', ')}. ` +
          'Later decisions at those tiers can silently invalidate this one.',
      );
    }
  }

  if (decision.tier === 'design_system' && decision.status === 'approved') {
    const missing = missingDnaFacets(decision.dnaFacets);
    if (missing.length > 0) {
      add(
        'design_dna_incomplete',
        `Unaddressed facets: ${missing.join(', ')}.`,
        // A warning, not a block: a real design system is often agreed in stages, and
        // refusing the whole thing because charts are undecided would stall the work the
        // DNA exists to unblock. The gap is recorded so it cannot be forgotten.
        'warning',
      );
    }
  }

  return issues;
}

export interface VisualContractLike {
  decisionId: string;
  requiredRegions?: string[] | null;
  requiredActions?: string[] | null;
  hierarchy?: string | null;
  responsiveRules?: Record<string, any> | null;
  accessibilityRules?: Record<string, any> | null;
  referenceSnapshotRef?: string | null;
  /** Acceptable pixel/percentage variance for the visual diff at Gate 9. */
  acceptableVariance?: number | null;
}

/**
 * Validate a Visual Contract (master plan §Gate 6).
 *
 * The contract is what Gate 9's `visual_diff` evidence is compared against, so a contract
 * missing its reference snapshot or its variance threshold cannot gate anything — it
 * would pass every screen or fail every screen depending on which default someone picked.
 */
export function validateVisualContract(contract: VisualContractLike): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const add = (rule: string, detail: string, severity: DesignIssue['severity'] = 'blocking') =>
    issues.push({ decisionId: contract.decisionId, rule, detail, severity });

  if (!contract.referenceSnapshotRef?.trim()) {
    add('no_reference_snapshot', 'Nothing for a visual diff to compare an implementation to.');
  }
  if (contract.acceptableVariance === null || contract.acceptableVariance === undefined) {
    add(
      'no_acceptable_variance',
      'Without a threshold the diff passes everything or fails everything.',
    );
  } else if (contract.acceptableVariance < 0 || contract.acceptableVariance > 1) {
    add('variance_out_of_range', 'Expected a fraction between 0 and 1.');
  }
  if (!contract.requiredRegions?.length) {
    add('no_required_regions', 'No regions declared, so nothing is actually required.');
  }
  if (!contract.requiredActions?.length) {
    add('no_required_actions', 'No actions declared; a screen with no required action is rare.', 'warning');
  }
  if (!contract.accessibilityRules) {
    // Gate 13's government profile makes accessibility a mandatory release gate, and a
    // visual contract that never mentions it cannot supply that evidence.
    add('no_accessibility_rules', 'Accessibility is unspecified for this screen.');
  }

  return issues;
}

export interface DesignLoopAssessment {
  total: number;
  approvedTiers: DesignTier[];
  issues: DesignIssue[];
  blockingIssues: DesignIssue[];
  passes: boolean;
}

/** Assess a project's whole design decision set. */
export function assessDesignLoop(decisions: DesignDecisionLike[]): DesignLoopAssessment {
  const approvedTiers = [
    ...new Set(decisions.filter((d) => d.status === 'approved').map((d) => d.tier)),
  ];

  const issues = decisions.flatMap((d) => validateDesignDecision(d, approvedTiers));
  const blockingIssues = issues.filter((i) => i.severity === 'blocking');

  return {
    total: decisions.length,
    approvedTiers,
    issues,
    blockingIssues,
    passes: blockingIssues.length === 0,
  };
}
