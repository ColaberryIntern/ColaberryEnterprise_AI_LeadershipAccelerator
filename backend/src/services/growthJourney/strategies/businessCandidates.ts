import { allowedFamiliesFor } from '../../../seeds/growthJourney/offerPolicyDefinitions';
import { makeB2bStrategy, type B2bProgramme } from './b2bCandidates';

/**
 * Colaberry Enterprise's Layer-1 candidates (§5.3, §8; Phase 3 T310).
 *
 * The state groups partition §5.3's eight states exactly — a test pins it
 * against `BUSINESS_STATES` — and the split follows T307's own ladder:
 *
 *   * fresh — `NEW_BUSINESS_LEAD`: nothing is known, so ask.
 *   * problem known — `PROBLEM_IDENTIFIED`: educate on the capability.
 *   * exploring — `EXPLORING_SOLUTIONS`: a case study.
 *   * commercial — `QUALIFIED_OPPORTUNITY` onward: §8 Layer 4, "Sales for
 *     commercially qualified opportunities". T307 evidences that state from a
 *     counted inbound outcome — the buyer engaged — which is what "qualified"
 *     means here, so Layer-1 nurture stops and a `create_handoff` to sales is
 *     named in `deferred_actions`. Continuing to nurture a buyer who replied
 *     would be the wrong next step, and escalating one who did not would be
 *     the quota-filling §8 forbids.
 *   * terminal — `CUSTOMER`: a hard stop, never a candidate.
 *
 * The family gate is the brand's own seeded allow set (`allowedFamiliesFor`),
 * the generation-side half of the boundary; `decideForSubject` asks
 * `assertOfferAllowed` again for every candidate and for the winner.
 */

const ENTERPRISE_FAMILIES: readonly string[] = allowedFamiliesFor('colaberry', 'colaberry-enterprise');

export const BUSINESS_PROGRAMME: B2bProgramme = Object.freeze({
  program_kind: 'business' as const,
  brand_slug: 'colaberry-enterprise',
  ruleset_version: 'p3-business-v1',
  states: Object.freeze({
    fresh: Object.freeze(['NEW_BUSINESS_LEAD']),
    problemKnown: Object.freeze(['PROBLEM_IDENTIFIED']),
    exploring: Object.freeze(['EXPLORING_SOLUTIONS']),
    commercial: Object.freeze(['QUALIFIED_OPPORTUNITY', 'DISCOVERY_READY', 'SOLUTION_SCOPING', 'PROPOSAL_OR_PAYMENT_READY']),
    terminal: 'CUSTOMER',
  }),
  handoff: Object.freeze({ owner: 'sales' }),
  familyGate: (family: string) => (ENTERPRISE_FAMILIES.includes(family) ? null : `family_not_offered_by_brand:${family}`),
});

export const businessStrategy = makeB2bStrategy(BUSINESS_PROGRAMME);
