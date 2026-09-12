import { GROWTH_JOURNEY_ACTION_TYPES } from '../../services/routing/growthJourneyActions';

/**
 * The default Phase 2 routing rules — DEFINED, NOT SEEDED (T227).
 *
 * Nothing at boot reads this file, and a test asserts that. Production keeps
 * its three live rules exactly as they are until an operator runs
 * `seedPhase2RoutingRules` deliberately (documented in the Phase 2 handoff),
 * because a rule that assigns journeys is a behaviour change to every inbound
 * lead of that brand, and that is a decision, not a side effect of a deploy.
 *
 * Shape notes, so the rules compose with the live ones:
 *   - priority 50 runs BEFORE the live rules (priority 100), and
 *     `continue_on_match: true` lets them still run afterwards — the sales
 *     alert and the callback keep firing exactly as today.
 *   - `brand_slug` is the T226 fact: a rule matches the brand the SOURCE
 *     resolves to, never a claim in the payload.
 *   - `assign_journey_program` needs the brand's default programme ACTIVE;
 *     all four are draft as shipped, so until a human activates one the action
 *     reports `program_not_active` — visible in the execution audit, not silent.
 */

export interface Phase2RoutingRuleDefinition {
  name: string;
  priority: number;
  conditions: Record<string, unknown>;
  actions: Array<{ type: (typeof GROWTH_JOURNEY_ACTION_TYPES)[number]; [key: string]: unknown }>;
  continue_on_match: boolean;
  is_active: boolean;
}

const forBrand = (slug: string): Phase2RoutingRuleDefinition => ({
  name: `Growth Journey: assign programme and path on ${slug} lead`,
  priority: 50,
  conditions: { brand_slug: slug },
  actions: [{ type: 'assign_journey_program' }, { type: 'assign_service_path' }],
  continue_on_match: true,
  is_active: true,
});

export const PHASE2_ROUTING_RULES: readonly Phase2RoutingRuleDefinition[] = [
  forBrand('cpn'),
  forBrand('colaberry-training'),
  forBrand('colaberry-enterprise'),
  forBrand('ai-flotation'),
];
