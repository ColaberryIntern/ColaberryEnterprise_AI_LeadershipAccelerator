/**
 * Contract tests for the governed design decision loop.
 *
 * The properties under test: the approval hierarchy is an ordering constraint, an
 * approved decision records what was actually chosen and by whom, and a Visual Contract
 * can actually gate a visual diff.
 */
import {
  DESIGN_DNA_FACETS,
  DESIGN_TIERS,
  MAX_VARIANTS,
  MIN_VARIANTS,
  assessDesignLoop,
  checkApprovalEligibility,
  designTierLevel,
  missingDnaFacets,
  prerequisiteTiers,
  tierExpectsVariants,
  validateDesignDecision,
  validateVisualContract,
  type DesignDecisionLike,
  type VisualContractLike,
} from '../deliveryDesignLoop';

const decision = (overrides: Partial<DesignDecisionLike> = {}): DesignDecisionLike => ({
  id: 'd1',
  tier: 'page_family',
  status: 'approved',
  variantCount: 3,
  approvedVariantId: 'v2',
  rationale: 'Fewest clicks for the primary task.',
  approvedByIdentityId: 'client-1',
  ...overrides,
});

const blocking = (d: DesignDecisionLike, approved: any[] = []) =>
  validateDesignDecision(d, approved).filter((i) => i.severity === 'blocking');

describe('the approval hierarchy is an ordering constraint', () => {
  it('has the five tiers in dependency order', () => {
    expect([...DESIGN_TIERS]).toEqual([
      'product_personality',
      'design_system',
      'page_family',
      'critical_workflow',
      'exception',
    ]);
    expect(designTierLevel('product_personality')).toBe(1);
    expect(designTierLevel('exception')).toBe(5);
  });

  it('product personality has no prerequisites', () => {
    expect(prerequisiteTiers('product_personality')).toEqual([]);
    expect(checkApprovalEligibility('product_personality', []).eligible).toBe(true);
  });

  it('a page family needs personality AND design system approved first', () => {
    const eligibility = checkApprovalEligibility('page_family', ['product_personality']);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.missingTiers).toEqual(['design_system']);
  });

  it('BLOCKS a page family approved before the design system exists', () => {
    // The page family would be standing on nothing: every later DNA decision silently
    // invalidates it, and nobody finds out until the screens are built.
    const issues = blocking(decision({ tier: 'page_family' }), ['product_personality']);
    expect(issues.map((i) => i.rule)).toContain('approved_out_of_order');
  });

  it('allows a page family once both lower tiers are approved', () => {
    const issues = blocking(decision({ tier: 'page_family' }), [
      'product_personality',
      'design_system',
    ]);
    expect(issues).toEqual([]);
  });

  it('an exception requires all four tiers beneath it', () => {
    expect(prerequisiteTiers('exception')).toHaveLength(4);
  });
});

describe('an approval must record what was agreed', () => {
  it('blocks an approval with no approver', () => {
    expect(blocking(decision({ approvedByIdentityId: null }), DESIGN_TIERS).map((i) => i.rule)).toContain(
      'approved_without_approver',
    );
  });

  it('blocks when variants were offered but none was chosen', () => {
    // The record cannot say what was agreed, which is the entire purpose of approving.
    const issues = blocking(decision({ approvedVariantId: null }), DESIGN_TIERS);
    expect(issues.map((i) => i.rule)).toContain('approved_without_chosen_variant');
  });

  it('a missing rationale WARNS rather than blocks', () => {
    const issues = validateDesignDecision(decision({ rationale: null }), DESIGN_TIERS);
    const found = issues.find((i) => i.rule === 'approved_without_rationale');
    expect(found!.severity).toBe('warning');
  });

  it('a draft decision is not held to approval rules', () => {
    const issues = blocking(
      decision({ status: 'draft', approvedByIdentityId: null, approvedVariantId: null }),
      [],
    );
    expect(issues).toEqual([]);
  });
});

describe('variants: 2-4 for comparable decisions', () => {
  it('tiers that expect variants', () => {
    expect(tierExpectsVariants('design_system')).toBe(true);
    expect(tierExpectsVariants('page_family')).toBe(true);
    expect(tierExpectsVariants('critical_workflow')).toBe(true);
  });

  it('personality and exceptions do NOT expect variants', () => {
    // A personality is a direction, not a layout to compare; an exception is by
    // definition a one-off departure, and demanding alternatives would be ceremony.
    expect(tierExpectsVariants('product_personality')).toBe(false);
    expect(tierExpectsVariants('exception')).toBe(false);
  });

  it('one variant warns — a single "option" is a proposal presented as a choice', () => {
    const issues = validateDesignDecision(decision({ variantCount: 1, approvedVariantId: 'v1' }), DESIGN_TIERS);
    const found = issues.find((i) => i.rule === 'too_few_variants');
    expect(found!.severity).toBe('warning');
  });

  it('more than four warns', () => {
    const issues = validateDesignDecision(decision({ variantCount: 6 }), DESIGN_TIERS);
    expect(issues.map((i) => i.rule)).toContain('too_many_variants');
  });

  it('two to four is clean', () => {
    for (let n = MIN_VARIANTS; n <= MAX_VARIANTS; n++) {
      const issues = validateDesignDecision(decision({ variantCount: n }), DESIGN_TIERS);
      expect(issues.filter((i) => i.rule.includes('variants'))).toEqual([]);
    }
  });

  it('zero variants is not flagged — not every decision is a comparison', () => {
    const issues = validateDesignDecision(
      decision({ variantCount: 0, approvedVariantId: null }),
      DESIGN_TIERS,
    );
    expect(issues.filter((i) => i.rule.includes('variant'))).toEqual([]);
  });
});

describe('Design DNA completeness', () => {
  it('lists every facet from the master plan', () => {
    expect(DESIGN_DNA_FACETS).toContain('accessibility');
    expect(DESIGN_DNA_FACETS).toContain('ai_interaction_style');
    expect(DESIGN_DNA_FACETS).toHaveLength(13);
  });

  it('reports unaddressed facets', () => {
    expect(missingDnaFacets(['theme', 'typography'])).toContain('tables');
    expect(missingDnaFacets(null)).toHaveLength(13);
    expect(missingDnaFacets([...DESIGN_DNA_FACETS])).toEqual([]);
  });

  it('an incomplete DNA WARNS rather than blocks', () => {
    // A real design system is agreed in stages; refusing it because charts are undecided
    // would stall the work the DNA exists to unblock. The gap is recorded, not ignored.
    const issues = validateDesignDecision(
      decision({ tier: 'design_system', dnaFacets: ['theme'] }),
      ['product_personality', 'design_system'],
    );
    const found = issues.find((i) => i.rule === 'design_dna_incomplete');
    expect(found!.severity).toBe('warning');
    expect(found!.detail).toContain('tables');
  });
});

describe('the Visual Contract must be able to gate a diff', () => {
  const contract = (overrides: Partial<VisualContractLike> = {}): VisualContractLike => ({
    decisionId: 'd1',
    requiredRegions: ['header', 'primary_content'],
    requiredActions: ['submit'],
    hierarchy: 'Primary action above the fold.',
    responsiveRules: { mobile: 'single column' },
    accessibilityRules: { contrast: 'AA' },
    referenceSnapshotRef: 'snap-1',
    acceptableVariance: 0.02,
    ...overrides,
  });

  it('a complete contract passes', () => {
    expect(validateVisualContract(contract())).toEqual([]);
  });

  it('blocks with no reference snapshot', () => {
    // Nothing for a visual diff to compare an implementation against.
    expect(
      validateVisualContract(contract({ referenceSnapshotRef: null })).map((i) => i.rule),
    ).toContain('no_reference_snapshot');
  });

  it('blocks with no variance threshold', () => {
    // Without one the diff passes everything or fails everything, depending on whichever
    // default someone picked.
    expect(
      validateVisualContract(contract({ acceptableVariance: null })).map((i) => i.rule),
    ).toContain('no_acceptable_variance');
  });

  it.each([-0.1, 1.5])('blocks a variance of %p', (variance) => {
    expect(
      validateVisualContract(contract({ acceptableVariance: variance })).map((i) => i.rule),
    ).toContain('variance_out_of_range');
  });

  it('blocks with no required regions — nothing is actually required', () => {
    expect(validateVisualContract(contract({ requiredRegions: [] })).map((i) => i.rule)).toContain(
      'no_required_regions',
    );
  });

  it('blocks with no accessibility rules', () => {
    // Gate 13's government profile makes accessibility a mandatory release gate, and a
    // contract that never mentions it cannot supply that evidence.
    expect(
      validateVisualContract(contract({ accessibilityRules: null })).map((i) => i.rule),
    ).toContain('no_accessibility_rules');
  });

  it('missing required actions only warns', () => {
    const issues = validateVisualContract(contract({ requiredActions: [] }));
    expect(issues.find((i) => i.rule === 'no_required_actions')!.severity).toBe('warning');
  });
});

describe('whole-project assessment', () => {
  it('derives the approved tiers from the decisions themselves', () => {
    const assessment = assessDesignLoop([
      decision({ id: 'a', tier: 'product_personality', variantCount: 0, approvedVariantId: null }),
      decision({
        id: 'b',
        tier: 'design_system',
        dnaFacets: [...DESIGN_DNA_FACETS],
      }),
    ]);
    expect(assessment.approvedTiers.sort()).toEqual(['design_system', 'product_personality']);
    expect(assessment.passes).toBe(true);
  });

  it('fails when any decision is approved out of order', () => {
    const assessment = assessDesignLoop([
      decision({ id: 'a', tier: 'critical_workflow' }),
    ]);
    expect(assessment.passes).toBe(false);
    expect(assessment.blockingIssues.map((i) => i.rule)).toContain('approved_out_of_order');
  });

  it('an empty design set passes', () => {
    expect(assessDesignLoop([]).passes).toBe(true);
  });
});
