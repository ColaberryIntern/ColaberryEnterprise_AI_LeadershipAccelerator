/**
 * PHASE 3 ENTRY GATE, Gap 2 of §H — behavioural coverage for evidence groups
 * that had none.
 *
 * WHAT WAS MEASURED, 2026-10-15. §H said "several evidence groups have no test"
 * and named nine. Counted from the tree it is **eleven** loaders, and four panel
 * modules had no test file at all (`trustPanel`, `journeyPanel`, `workPanels`,
 * `historyPanels`). This suite covers eight of the eleven; the remaining three
 * are named at the bottom with why they are not here.
 *
 * A TRAP WORTH RECORDING. The obvious way to measure this — grep each loader
 * name across `__tests__` — now returns a hit for EVERY loader, because
 * `evidenceRegistry.test.ts` names all 22 in its registry map. A naive count
 * would have reported full coverage. The measurement above excludes that file,
 * which is the only reason the eleven are visible.
 *
 * WHAT THESE TESTS CLAIM, AND WHAT THEY DO NOT. `sequelize.query` is mocked, so
 * — exactly as `panels.test.ts` records — this can only test the logic AROUND
 * the query, never the SQL. Thirteen tests in this repo once passed against a
 * query that could not parse. So nothing here asserts a result shape derived
 * from real rows; what it pins are the two properties that have actually gone
 * wrong in this codebase and that an SRS depends on:
 *
 *   1. AN EMPTY ID LIST NEVER REACHES THE DATABASE. A person with no enrolments
 *      must cost zero queries, not a scan. `IN ()` with no ids is also how a
 *      scoped query quietly becomes an unscoped one.
 *   2. A QUERY IS SCOPED TO THE IDS IT WAS GIVEN. The replacements carry exactly
 *      those ids and nothing else — the difference between one person's evidence
 *      and somebody else's appearing on their profile.
 */

const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

// jest.mock is hoisted above these, so the mock is in place when they resolve.
import {
  loadSkills, loadMentor, loadContent, loadCommunity, loadProfileContext,
} from '../panels/growthPanels';
import { loadWork } from '../panels/workPanels';
import { loadAppointments, loadAutomation } from '../panels/acquisitionPanels';

beforeEach(() => {
  mockQuery.mockReset();
  // One empty row: enough for an aggregate loader to read `rows[0]` and for a
  // list loader to see no rows, without pretending to supply real data.
  mockQuery.mockResolvedValue([{}]);
});

/** Every `replacements` object the loader passed, across all its queries. */
function replacementsSeen(): Array<Record<string, unknown>> {
  return mockQuery.mock.calls
    .map((c) => (c[1] as { replacements?: Record<string, unknown> } | undefined)?.replacements)
    .filter((r): r is Record<string, unknown> => !!r);
}

/** True when some replacement value is exactly the id list handed in. */
function scopedTo(ids: string[]): boolean {
  return replacementsSeen().some((r) =>
    Object.values(r).some((v) => Array.isArray(v) && JSON.stringify(v) === JSON.stringify(ids)),
  );
}

const ENROLMENT_KEYED: Array<[string, (ids: string[]) => Promise<unknown>]> = [
  ['loadSkills', loadSkills],
  ['loadMentor', loadMentor],
  ['loadContent', loadContent],
  ['loadCommunity', loadCommunity],
  ['loadProfileContext', loadProfileContext],
  ['loadWork', loadWork],
];

describe('Gap 2 — an empty id list never reaches the database', () => {
  it.each(ENROLMENT_KEYED)('%s returns null and issues NO query', async (_n, fn) => {
    await expect(fn([])).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('the control: the same loaders DO query once given an id', async () => {
    // Without this, every assertion above would also pass if the loaders had
    // been emptied out entirely.
    for (const [, fn] of ENROLMENT_KEYED) {
      mockQuery.mockClear();
      await fn(['enr-1']);
      expect(mockQuery).toHaveBeenCalled();
    }
  });
});

describe('Gap 2 — evidence is scoped to the person asked about', () => {
  it.each(ENROLMENT_KEYED)('%s passes exactly the ids it was given', async (_n, fn) => {
    const ids = ['enr-1', 'enr-2'];
    await fn(ids);
    expect(scopedTo(ids)).toBe(true);
  });

  it('does not smuggle a different id list through', async () => {
    // The control for the control: the matcher must be capable of saying no.
    await loadCommunity(['enr-1']);
    expect(scopedTo(['enr-999'])).toBe(false);
  });
});

describe('Gap 2 — lead-keyed acquisition evidence', () => {
  it('loadAppointments binds the lead id, never a bare table read', async () => {
    mockQuery.mockResolvedValue([]);
    await loadAppointments(7);
    // Exact, because a looser assertion here passed while matching any "7"
    // anywhere in the payload — including one that scoping removal would leave.
    expect(replacementsSeen()).toEqual([{ leadId: 7 }]);
  });

  it('loadAutomation binds the lead id AS TEXT, which is how its column is keyed', async () => {
    mockQuery.mockResolvedValue([]);
    const rows = await loadAutomation(7);
    expect(replacementsSeen()).toEqual([{ leadIdText: '7' }]);
    // `related_id` is a text column; binding the number would match nothing and
    // read as "this person has no automation" rather than as a bug.
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe('Gap 2 — absent reads as absent, where the loader states that rule', () => {
  it('loadProfileContext returns NULL when every source is empty, not a hollow shape', async () => {
    // The rule is explicit in the loader: `if (!c && !o && repos.length === 0) return null`.
    // A hollow object here would render as a profile with blank fields rather
    // than as "we have nothing", which is the distinction this phase exists for.
    mockQuery.mockResolvedValue([]);
    await expect(loadProfileContext(['enr-1'])).resolves.toBeNull();
  });
});

/**
 * STILL UNCOVERED, and named rather than quietly skipped:
 *
 *   loadCcppHistory — MSSQL, not Postgres, and its first branch turns on
 *     `env.mssqlHost`. Needs env mocking, a different substrate, and its own
 *     suite; mocking it here would test the mock.
 *   buildJourney   — composes already-loaded evidence rather than loading any,
 *     so the properties above do not apply to it.
 *   buildTrust     — same shape, and it overlaps §H gap 3 (a surviving
 *     `matchMethod` mutant, where the existing coverage exercises only the
 *     'none' branch). It should be closed WITH gap 3, not separately.
 */
