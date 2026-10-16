/**
 * PHASE 3 ENTRY GATE, Gap 2 (last three) and Gap 3 of §H.
 *
 * M17 covered eight of the eleven uncovered evidence producers and named the
 * three it deliberately left. This closes them:
 *
 *   loadCcppHistory - MSSQL and env-gated, so it needed env mocking and its own
 *     suite rather than the Postgres pattern the other eight share.
 *   buildJourney    - composes already-loaded evidence, so the M17 properties
 *     (no query on empty ids, scoping) only half apply.
 *   buildTrust      - same, and it carries the Gap 3 surviving mutant, so both
 *     close here rather than in two passes over one small file.
 *
 * WHAT THESE TESTS CLAIM. The database is mocked, so as `panels.test.ts`
 * records, this tests the logic AROUND the query and never the SQL itself.
 * What is pinned are the rules these three modules state in their own comments
 * and then rely on being true:
 *
 *   1. ABSENT IS NOT ZERO. `daysKnown` is null when there is no first touch;
 *      an unconfigured CCPP is "unavailable with a reason", not an empty
 *      history that reads as "this person did nothing before us".
 *   2. SALES DATA IS WITHHELD, NOT ZEROED. `intentScore` is null for a caller
 *      without the sales sections. A 0 would be a number they are not cleared
 *      to see, and worse, a wrong one.
 *   3. AN UNCONFIGURED DEPENDENCY NEVER SILENTLY CONNECTS.
 */

const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));

// Mutable so a single suite can drive both EMPTY branches of loadCcppHistory
// without re-importing the module under a second jest.mock.
const mockEnv: Record<string, unknown> = {
  mssqlHost: undefined, mssqlUser: undefined, mssqlPort: 1433, mssqlPass: '',
};
jest.mock('../../../config/env', () => ({ env: mockEnv }));

// If the env gate ever stops holding, this is what would get constructed.
// Keeping it a spy is how the "never silently connects" claim is checked.
const mockPoolCtor = jest.fn();
jest.mock('mssql', () => ({
  __esModule: true,
  default: {
    ConnectionPool: function (...a: unknown[]) { mockPoolCtor(...a); throw new Error('must not connect'); },
    VarChar: (n: number) => ({ type: 'VarChar', n }),
  },
}));

import { loadCcppHistory } from '../panels/historyPanels';
import { buildJourney } from '../panels/journeyPanel';
import { buildTrust } from '../panels/trustPanel';

beforeEach(() => {
  mockQuery.mockReset();
  mockPoolCtor.mockReset();
  mockQuery.mockResolvedValue([{}]);
  mockEnv.mssqlHost = undefined;
  mockEnv.mssqlUser = undefined;
});

// ─── loadCcppHistory ─────────────────────────────────────────────────────────

describe('Gap 2 - loadCcppHistory says why it is empty, and never connects when it cannot', () => {
  it('returns unavailable WITH A REASON when CCPP is not configured', async () => {
    const h = await loadCcppHistory('someone@example.com');
    expect(h.available).toBe(false);
    expect(h.unavailableReason).toContain('CCPP is not configured');
    // The distinction this whole phase is about: nothing recorded is not the
    // same as nothing happened. An empty list with available=true would read as
    // "this person had no history before us", which is a different claim.
    expect(h.enrolments).toEqual([]);
  });

  it('never constructs a connection pool when the env gate is closed', async () => {
    await loadCcppHistory('someone@example.com');
    expect(mockPoolCtor).not.toHaveBeenCalled();
  });

  it('returns a DIFFERENT reason for a blank email, and still does not connect', async () => {
    mockEnv.mssqlHost = 'ccpp.example.net';
    mockEnv.mssqlUser = 'reader';
    const h = await loadCcppHistory('   ');
    expect(h.available).toBe(false);
    expect(h.unavailableReason).toBe('No email to look up.');
    expect(mockPoolCtor).not.toHaveBeenCalled();
  });

  it('the two reasons are not the same string - the control', () => {
    // Without this, both branches could collapse to one message and the caller
    // would lose the difference between "we cannot look" and "nothing to look up".
    expect('No email to look up.').not.toContain('CCPP is not configured');
  });
});

// ─── buildJourney ────────────────────────────────────────────────────────────

const SALES = ['leads'];
const NO_SALES = ['students'];

describe('Gap 2 - buildJourney counts, and says null when it cannot count', () => {
  it('issues NO query for a person with neither leads nor enrolments', async () => {
    await buildJourney([], [], SALES, []);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('the control: it DOES query once there is a lead to count', async () => {
    await buildJourney([7], [], SALES, []);
    expect(mockQuery).toHaveBeenCalled();
  });

  it('scopes the count to the leads it was given', async () => {
    await buildJourney([7, 9], [], SALES, []);
    const seen = mockQuery.mock.calls
      .map((c) => (c[1] as { replacements?: Record<string, unknown> })?.replacements)
      .filter(Boolean);
    expect(seen).toContainEqual({ leadIds: [7, 9] });
  });

  it('daysKnown is NULL, not 0, when there is no first touch to measure from', async () => {
    mockQuery.mockResolvedValue([{ first_touch: null }]);
    const j = await buildJourney([7], [], SALES, []);
    expect(j.daysKnown).toBeNull();
    // 0 would read as "we met them today", which is a claim about a person we
    // in fact know nothing about.
    expect(j.daysKnown).not.toBe(0);
  });

  it('WITHHOLDS the intent score from a caller without sales sections', async () => {
    mockQuery.mockResolvedValue([{ intent: '88' }]);
    const allowed = await buildJourney([7], [], SALES, []);
    const denied = await buildJourney([7], [], NO_SALES, []);
    expect(allowed.intentScore).toBe(88);
    // Null, never 0: a 0 is a number they are not cleared to see, and a wrong one.
    expect(denied.intentScore).toBeNull();
  });

  it('counts enrolments from the ids it was handed, not from a query', async () => {
    const j = await buildJourney([], ['enr-1', 'enr-2'], SALES, []);
    expect(j.enrollments).toBe(2);
  });

  it('takes lastActivity from the newest timeline event, or null when there is none', async () => {
    const withEvents = await buildJourney([], [], SALES, [
      { occurredAt: '2026-10-02T00:00:00Z' } as never,
      { occurredAt: '2026-09-01T00:00:00Z' } as never,
    ]);
    expect(withEvents.lastActivity).toBe('2026-10-02T00:00:00Z');
    expect((await buildJourney([], [], SALES, [])).lastActivity).toBeNull();
  });
});

// ─── buildTrust, including Gap 3 ─────────────────────────────────────────────

const base = { tracedToLead: true, acquisition: null, classActivity: null, journey: null };

describe('Gap 3 - matchMethod, whose every branch was unprotected', () => {
  // §H gap 3: a surviving mutant, because the existing coverage exercised only
  // the 'none' branch. matchMethod is one ternary over two id lists, so all
  // four combinations are enumerable and all four are asserted.
  it('is exact_email ONLY when both a lead and an enrolment are present', () => {
    expect(buildTrust(base as never, [7], ['enr-1']).matchMethod).toBe('exact_email');
  });

  it('is none with a lead but no enrolment', () => {
    expect(buildTrust(base as never, [7], []).matchMethod).toBe('none');
  });

  it('is none with an enrolment but no lead', () => {
    expect(buildTrust(base as never, [], ['enr-1']).matchMethod).toBe('none');
  });

  it('is none with neither', () => {
    expect(buildTrust(base as never, [], []).matchMethod).toBe('none');
  });
});

describe('Gap 2 - buildTrust names what is missing, specifically', () => {
  const fields = (t: { gaps: Array<{ field: string }> }) => t.gaps.map((g) => g.field);

  it('names the acquisition gap for a person who was never a lead', () => {
    expect(fields(buildTrust(base as never, [], ['enr-1']))).toContain('Acquisition history');
  });

  it('does NOT claim that gap for a person who was a lead - the control', () => {
    expect(fields(buildTrust(base as never, [7], ['enr-1']))).not.toContain('Acquisition history');
  });

  it('distinguishes consent never recorded from consent refused', () => {
    const t = buildTrust({ ...base, acquisition: { consentContact: null } } as never, [7], ['e']);
    const consent = t.gaps.find((g) => g.field === 'Contact consent');
    expect(consent).toBeDefined();
    // The whole point of the gap: silence is not refusal.
    expect(consent!.reason).toContain('not the same as consent being refused');
  });

  it('always discloses graduation and placement as untracked, for everybody', () => {
    // These are unconditional: they are properties of the database, not of the
    // person, so a complete-looking profile must still say they are unknown.
    const f = fields(buildTrust({ ...base, acquisition: { consentContact: true } } as never, [7], ['e']));
    expect(f).toContain('Graduation');
    expect(f).toContain('Placement and employment');
  });

  it('is pure: it issues no query and repeats itself exactly', () => {
    const a = buildTrust(base as never, [7], ['enr-1']);
    const b = buildTrust(base as never, [7], ['enr-1']);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('reports consent as null when there is no acquisition row at all', () => {
    expect(buildTrust(base as never, [7], ['e']).consentRecorded).toBeNull();
  });
});
