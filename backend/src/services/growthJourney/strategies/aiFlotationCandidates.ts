import { flotationExclusionReason } from '../lifecycle/aiFlotationLifecycle';
import { makeB2bStrategy, type B2bProgramme } from './b2bCandidates';

/**
 * AI Flotation's Layer-1 candidates (§5.4, §8; Phase 3 T310).
 *
 * The state groups partition §5.4's nine states exactly — a test pins it
 * against `FLOTATION_STATES`:
 *
 *   * fresh — `NEW_PROJECT_LEAD`: ask.
 *   * problem known — `IDEA_OR_PROBLEM_CAPTURED`: solution education, §8's
 *     "capability/solution education for B2B programs".
 *   * exploring — `PROBLEM_CLARIFIED`, `SOLUTION_VISUALIZED`: a case study.
 *     `SOLUTION_VISUALIZED` means a concept was PRODUCED for them (T308's
 *     caveat), and a case study is the honest follow-up to a concept nobody
 *     has yet engaged with.
 *   * commercial — `BUILD_QUALIFIED` onward: §8 Layer 4, "Solution Architect
 *     for technically credible build opportunities", named in
 *     `deferred_actions` and never applied.
 *   * terminal — `PROJECT_STARTED`: a hard stop.
 *
 * The family gate IS T308's exclusion — `flotationExclusionReason` — so the
 * one boundary that matters most in this system (no business training, no
 * learner offer, under AI Flotation) is enforced here at generation and again
 * by `decideForSubject` at selection. A classification that names
 * `business_training` for a Flotation subject produces no candidate, and the
 * reason is recorded per generator.
 */

export const FLOTATION_PROGRAMME: B2bProgramme = Object.freeze({
  program_kind: 'consulting' as const,
  brand_slug: 'ai-flotation',
  ruleset_version: 'p3-flotation-v1',
  states: Object.freeze({
    fresh: Object.freeze(['NEW_PROJECT_LEAD']),
    problemKnown: Object.freeze(['IDEA_OR_PROBLEM_CAPTURED']),
    exploring: Object.freeze(['PROBLEM_CLARIFIED', 'SOLUTION_VISUALIZED']),
    commercial: Object.freeze(['BUILD_QUALIFIED', 'DISCOVERY_READY', 'SCOPE_IN_PROGRESS', 'PROPOSAL_OR_PAYMENT_READY']),
    terminal: 'PROJECT_STARTED',
  }),
  handoff: Object.freeze({ owner: 'solution_architect' }),
  familyGate: flotationExclusionReason,
});

export const flotationStrategy = makeB2bStrategy(FLOTATION_PROGRAMME);
