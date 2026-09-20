import * as models from '../index';
import * as growthJourneyModels from '../growthJourneyModels';

/**
 * T503 — every Growth Journey model still reaches callers through `models/index.ts`.
 *
 * The models moved into `models/growthJourneyModels.ts` and the index re-exports them with one
 * `export *`. Nothing else in the repo would notice if one of those re-exports were dropped: the
 * schema suites read the DDL, the service suites mock the barrel, and the three Phase 5 models have
 * no importer yet at all — a deleted line would leave every suite green and only surface as a
 * `TS2724` in a later task, or at runtime in production.
 *
 * So this test imports them the way callers do and checks each one is really a Sequelize model
 * bound to the table its DDL creates.
 */

const EXPECTED_TABLES: Readonly<Record<string, string>> = Object.freeze({
  GrowthJourneyEnrollment: 'growth_journey_enrollments',
  GrowthJourneyClassification: 'growth_journey_classifications',
  GrowthJourneyTransition: 'growth_journey_transitions',
  GrowthJourneyContentRule: 'growth_journey_content_rules',
  GrowthJourneyConversationOwnership: 'growth_journey_conversation_ownership',
  GrowthJourneyDecision: 'growth_journey_decisions',
  GrowthJourneyHandoff: 'growth_journey_handoffs',
  GrowthJourneyOutcome: 'growth_journey_outcomes',
  GrowthJourneyPolicy: 'growth_journey_policies',
  GrowthJourneyProfile: 'growth_journey_profiles',
  GrowthJourneyScoreSnapshot: 'growth_journey_score_snapshots',
  GrowthJourneyExecution: 'growth_journey_executions',
  GrowthJourneyExecutionControl: 'growth_journey_execution_controls',
  GrowthJourneyInAppNudge: 'growth_journey_in_app_nudges',
});

const barrel = models as unknown as Record<string, { getTableName?: () => unknown } | undefined>;

describe('the Growth Journey models reach callers through the index', () => {
  it.each(Object.entries(EXPECTED_TABLES))('%s is exported by the index and bound to %s', (name, table) => {
    const model = barrel[name];
    expect(model).toBeDefined();
    expect(typeof model!.getTableName).toBe('function');
    expect(model!.getTableName!()).toBe(table);
  });

  it('the sibling module exports exactly these fourteen, and the index re-exports every one of them', () => {
    expect(Object.keys(growthJourneyModels).sort()).toEqual(Object.keys(EXPECTED_TABLES).sort());
    for (const name of Object.keys(growthJourneyModels)) {
      expect(barrel[name]).toBe((growthJourneyModels as unknown as Record<string, unknown>)[name]);
    }
  });
});
