import { allowedFamiliesFor } from '../../../seeds/growthJourney/offerPolicyDefinitions';
import { makeB2bStrategy, type B2bProgramme } from './b2bCandidates';

/**
 * Colaberry Enterprise's Layer-1 candidates (§5.3, §8; Phase 3 T310).
 *
 * The state groups partition §5.3's eight states exactly — a test pins it
 * against `BUSINESS_STATES` — and the split follows T307's own ladder:
 *
 *   * fresh — `NEW_BUSINESS_LEAD`: nothing is known, so ask.
 *   * problem known — `PROBLEM_IDENTIFIED`: the path-finding clarification
 *     (see the note below on why not education).
 *   * exploring — `EXPLORING_SOLUTIONS`: a path is known — education, then
 *     a case study once we have reached out.
 *   * qualified — `QUALIFIED_OPPORTUNITY`: T307 evidences it from ONE inbound
 *     outcome, which is §8's Layer-2 trigger (discovery questions, a
 *     scheduling offer), named and never applied. Nurture stops; the first
 *     draft named a handoff to Sales here and the verifier read §8 better.
 *   * commercial — `DISCOVERY_READY` onward: §8 Layer 4, "Sales for
 *     commercially qualified opportunities" — a `create_handoff` to sales is
 *     named in `deferred_actions`.
 *   * terminal — `CUSTOMER`: a hard stop, never a candidate.
 *
 * Note what `PROBLEM_IDENTIFIED` cannot carry: a `primary_path`, since T307
 * evidences `EXPLORING_SOLUTIONS` from one. So at that state the honest
 * candidate is the path-finding clarification, not education for a path.
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
    qualified: Object.freeze(['QUALIFIED_OPPORTUNITY']),
    commercial: Object.freeze(['DISCOVERY_READY', 'SOLUTION_SCOPING', 'PROPOSAL_OR_PAYMENT_READY']),
    terminal: 'CUSTOMER',
  }),
  handoff: Object.freeze({ owner: 'sales' }),
  familyGate: (family: string) => (ENTERPRISE_FAMILIES.includes(family) ? null : `family_not_offered_by_brand:${family}`),
});

export const businessStrategy = makeB2bStrategy(BUSINESS_PROGRAMME);
