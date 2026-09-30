import { Table, UNIQUES } from './phase4Tables';

/**
 * T503 — the Phase 5 tables in the in-memory world the Phase 4 harness is made
 * of (`phase4Tables.ts`).
 *
 * There is nothing to teach these tables: `Table` looks its own unique indexes
 * up in `UNIQUES`, which is parsed from the SHIPPED statements (Phase 4's and,
 * since T501, Phase 5's). So "one receipt per decision", "one open receipt per
 * person per brand per channel" and "one active control per scope" are the
 * DATABASE's rules in this world, not the test's - change the DDL and the world
 * changes with it, and a predicate the parser cannot read throws rather than
 * being quietly ignored.
 */

export const T5 = {
  executions: new Table('growth_journey_executions', 'ex'),
  controls: new Table('growth_journey_execution_controls', 'ctl'),
  nudges: new Table('growth_journey_in_app_nudges', 'nudge'),
};

export const resetPhase5Tables = (): void => {
  for (const table of Object.values(T5)) table.reset();
};

/** The model mock the Phase 5 services are driven through, merged into the Phase 4 one. */
export const phase5ModelsMock = {
  GrowthJourneyExecution: T5.executions,
  GrowthJourneyExecutionControl: T5.controls,
  GrowthJourneyInAppNudge: T5.nudges,
};

/** The unique indexes this world enforces for a Phase 5 table, by name - for the tests that assert them. */
export const uniquesOn = (table: string): string[] =>
  UNIQUES.filter((u) => u.table === table).map((u) => u.name).sort();
