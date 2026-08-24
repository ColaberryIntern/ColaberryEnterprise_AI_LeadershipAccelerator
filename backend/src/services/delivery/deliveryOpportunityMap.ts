/**
 * deliveryOpportunityMap — validation and analysis for the AI-native Opportunity Map.
 *
 * PURE. No I/O. Callers load rows and pass them in.
 *
 * Master plan §Gate 4 ends with a one-line instruction that this module exists to
 * enforce: **"Do not force AI everywhere."** A map where every capability is an agent
 * opportunity is not an ambitious plan, it is an unexamined one — and it is what an LLM
 * asked to "find AI opportunities" will produce every time unless something checks.
 *
 * The checks below are deliberately about *coherence*, not taste. They do not judge
 * whether a capability should use AI; they catch rows that claim a disposition without
 * saying what it means, or that assign autonomy without naming the trust it needs.
 */

import { INPACT_DIMENSIONS, type InpactDimension } from '../../modules/delivery/inpact';
import type {
  DeliveryOpportunityAttributes,
  OpportunityDisposition,
} from '../../models/DeliveryOpportunity';

export interface OpportunityIssue {
  capability: string;
  rule: string;
  detail: string;
  severity: 'blocking' | 'warning';
}

/** Dispositions where an agent takes action rather than only advising. */
const AUTONOMOUS: readonly OpportunityDisposition[] = ['agent_acts', 'full_automation'];

export function isAutonomous(disposition: OpportunityDisposition): boolean {
  return AUTONOMOUS.includes(disposition);
}

const SCORE_MIN = 1;
const SCORE_MAX = 5;

function validScore(value: number | null | undefined): boolean {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= SCORE_MIN && value <= SCORE_MAX
  );
}

/**
 * Validate one row.
 *
 * The blocking/warning split follows `sbp/planGate.ts`'s reasoning: a rule blocks when it
 * would **mislead about what is being built or write broken data**, and warns when the
 * row is merely untidy. An opportunity map with a missing value score still tells the
 * truth about what the system will do; one that assigns agent autonomy with no trust
 * requirement does not.
 */
export function validateOpportunity(row: DeliveryOpportunityAttributes): OpportunityIssue[] {
  const issues: OpportunityIssue[] = [];
  const capability = row.capability?.trim() || '(unnamed)';
  const disposition = row.disposition ?? 'traditional_software';

  const add = (rule: string, detail: string, severity: OpportunityIssue['severity']) =>
    issues.push({ capability, rule, detail, severity });

  if (!row.capability?.trim()) {
    add('capability_unnamed', 'A capability with no name cannot be traced to a story.', 'blocking');
  }

  // Trust requirements must reference the INPACT registry, not free text — otherwise
  // Gate 9's "Trust Before Intelligence coverage" cannot be answered by query.
  const trust = row.trust_requirement ?? [];
  const unknown = trust.filter(
    (t) => !INPACT_DIMENSIONS.includes(t as InpactDimension),
  );
  if (unknown.length > 0) {
    add(
      'trust_requirement_not_an_inpact_dimension',
      `Unrecognised: ${unknown.join(', ')}. Must be one of ${INPACT_DIMENSIONS.join(', ')}.`,
      'blocking',
    );
  }

  // An agent that acts on someone's behalf without a declared trust requirement is
  // exactly what Trust Before Intelligence exists to prevent.
  if (isAutonomous(disposition) && trust.length === 0) {
    add(
      'autonomy_without_trust_requirement',
      `Disposition '${disposition}' grants an agent the ability to act, but names no INPACT requirement.`,
      'blocking',
    );
  }

  // 'Permitted' is the authorization dimension. An acting agent that has not declared it
  // has not said who may stop it.
  if (isAutonomous(disposition) && trust.length > 0 && !trust.includes('permitted')) {
    add(
      'autonomy_without_permitted',
      `An acting agent must declare the 'permitted' (authorization) requirement.`,
      'blocking',
    );
  }

  // Each disposition has to say what it actually means for this capability.
  const described: Record<OpportunityDisposition, unknown> = {
    traditional_software: row.traditional_software,
    ai_recommends: row.ai_recommendation,
    agent_acts: row.agent_opportunity,
    full_automation: row.automation,
    human_only: row.human_only_decision,
  };
  if (!String(described[disposition] ?? '').trim()) {
    add(
      'disposition_undescribed',
      `Disposition is '${disposition}' but the matching field is empty.`,
      'blocking',
    );
  }

  if (!validScore(row.value_score)) {
    add('value_score_missing_or_invalid', 'Expected an integer 1-5.', 'warning');
  }
  if (!validScore(row.complexity_score)) {
    add('complexity_score_missing_or_invalid', 'Expected an integer 1-5.', 'warning');
  }

  return issues;
}

export interface OpportunityMapAssessment {
  total: number;
  byDisposition: Record<string, number>;
  autonomousCount: number;
  humanOnlyCount: number;
  issues: OpportunityIssue[];
  blockingIssues: OpportunityIssue[];
  /** True when nothing is reserved for humans and nothing is plain software. */
  aiEverywhere: boolean;
  passes: boolean;
}

/**
 * Assess a whole map.
 *
 * `aiEverywhere` is a **warning, not a block**, and that restraint is deliberate. There
 * are real projects where nearly everything is an agent opportunity, and a gate that
 * refused them would be wrong. What it must not do is let that pass *unremarked* — the
 * signal exists so a human looks, not so the tool decides.
 */
export function assessOpportunityMap(
  rows: DeliveryOpportunityAttributes[],
): OpportunityMapAssessment {
  const issues = rows.flatMap(validateOpportunity);
  const byDisposition: Record<string, number> = {};

  for (const row of rows) {
    const d = row.disposition ?? 'traditional_software';
    byDisposition[d] = (byDisposition[d] ?? 0) + 1;
  }

  const autonomousCount = rows.filter((r) =>
    isAutonomous(r.disposition ?? 'traditional_software'),
  ).length;
  const humanOnlyCount = byDisposition.human_only ?? 0;
  const traditionalCount = byDisposition.traditional_software ?? 0;

  const aiEverywhere = rows.length > 0 && humanOnlyCount === 0 && traditionalCount === 0;
  if (aiEverywhere) {
    issues.push({
      capability: '(map)',
      rule: 'ai_everywhere',
      detail:
        'No capability is reserved for a human decision or for traditional software. ' +
        'Master plan §Gate 4: do not force AI everywhere. Confirm this is deliberate.',
      severity: 'warning',
    });
  }

  const blockingIssues = issues.filter((i) => i.severity === 'blocking');

  return {
    total: rows.length,
    byDisposition,
    autonomousCount,
    humanOnlyCount,
    issues,
    blockingIssues,
    aiEverywhere,
    passes: blockingIssues.length === 0,
  };
}

/**
 * Every INPACT dimension the map requires, de-duplicated.
 *
 * Feeds Gate 5: these are the dimensions the project's agent definitions must address,
 * and Gate 7 orders the work by their build phases.
 */
export function requiredInpactDimensions(
  rows: DeliveryOpportunityAttributes[],
): InpactDimension[] {
  const found = new Set<InpactDimension>();
  for (const row of rows) {
    for (const t of row.trust_requirement ?? []) {
      if (INPACT_DIMENSIONS.includes(t as InpactDimension)) found.add(t as InpactDimension);
    }
  }
  return INPACT_DIMENSIONS.filter((d) => found.has(d));
}
