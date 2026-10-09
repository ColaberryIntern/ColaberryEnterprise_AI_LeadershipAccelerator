/**
 * T211 attempt 2 — the evidence package tested BEHAVIOURALLY.
 *
 * Attempt 1 asserted these as source-text `toContain` checks and five of a
 * verifier's eight mutants survived: commenting out the Explorer load, the GHL
 * column, the `ORDER BY`, or the pre-registration stitch key all left the suite
 * green. A string assertion cannot tell whether code RUNS.
 *
 * Worse, I justified the shape-only assertions by claiming "no suite in this
 * repo runs against a database". That was FALSE — `panels.test.ts`, in this very
 * folder, mocks `sequelize.query` and tests loaders behaviourally, including the
 * exact null-boundary `loadExplorerScore` needed. The pattern was available and
 * in the same directory. It is used here.
 *
 * What mocking the database CAN and CANNOT prove, honestly: it proves the logic
 * around the query — whether a loader runs at all, what SQL it hands over, what
 * it does with the rows and with no rows. It cannot prove the SQL parses. That
 * limit is `panels.test.ts`'s own stated position and T216 is where execution is
 * observed.
 */
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import { loadExplorerScore } from '../panels/explorerPanel';
import { loadAcquisition } from '../panels/acquisitionPanels';
import { getPersonTimeline } from '../personTimelineService';

beforeEach(() => mockQuery.mockReset());

/**
 * The LIVE SQL of the nth query -- `--` comments stripped.
 *
 * This matters more than it looks. Three of a verifier's mutants commented SQL
 * out with `--` and my assertions still passed, because `toContain` happily
 * matches a commented line: the text is still in the string. An assertion that
 * cannot tell live SQL from dead SQL proves nothing about what the database was
 * actually asked. The same comments-versus-code trap as the role checker, one
 * layer down.
 */
const sqlOf = (n = 0): string => String(mockQuery.mock.calls[n][0])
  .replace(/--[^\n]*/g, '');
const replacementsOf = (n = 0): Record<string, unknown> =>
  (mockQuery.mock.calls[n][1] as { replacements: Record<string, unknown> }).replacements;

describe('T211 — Explorer E/I/F actually loads, and absent reads as absent', () => {
  it('issues no query at all for a person with no enrolments', async () => {
    await expect(loadExplorerScore([])).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns the scores from the row, not a shape', async () => {
    mockQuery.mockResolvedValue([{
      as_of_date: '2026-10-01', e_score: 42, i_score: 17, f_score: 88,
      primary_state: 'warming', overlays: ['price_sensitive'],
    }]);
    await expect(loadExplorerScore(['enr-1'])).resolves.toEqual({
      asOfDate: '2026-10-01',
      engagement: 42,
      intent: 17,
      fit: 88,
      primaryState: 'warming',
      overlays: ['price_sensitive'],
    });
  });

  it('returns NULL for an unscored person — never 0/0/0', async () => {
    // The distinction that matters: a person the scorer never ran for is not a
    // person scoring zero. Three confident zeros on the page would be a lie.
    mockQuery.mockResolvedValue([]);
    await expect(loadExplorerScore(['enr-1'])).resolves.toBeNull();
  });

  it('asks for the NEWEST snapshot and only one', async () => {
    mockQuery.mockResolvedValue([]);
    await loadExplorerScore(['enr-1', 'enr-2']);
    expect(sqlOf()).toMatch(/ORDER BY as_of_date DESC/);
    expect(sqlOf()).toMatch(/LIMIT 1/);
    expect(replacementsOf().enrollmentIds).toEqual(['enr-1', 'enr-2']);
  });

  it('treats a null overlays column as no overlays, not as a crash', async () => {
    mockQuery.mockResolvedValue([{
      as_of_date: '2026-10-01', e_score: 1, i_score: 2, f_score: 3,
      primary_state: 'new', overlays: null,
    }]);
    const panel = await loadExplorerScore(['enr-1']);
    expect(panel!.overlays).toEqual([]);
  });
});

describe('T211 — the GHL contact id reaches the caller', () => {
  it('selects the column and passes its value through', async () => {
    mockQuery.mockResolvedValue([{ leadId: 7, ghlContactId: 'ghl-abc' }]);
    const panel = await loadAcquisition('a@example.test');
    expect(panel!.ghlContactId).toBe('ghl-abc');
    // and the column really is asked for, so the value cannot come from nowhere
    expect(sqlOf()).toContain('ghl_contact_id');
  });

  it('degrades a missing linkage to null without throwing', async () => {
    // Null is a real and common state: a withheld GHL sync leaves it unset on
    // purpose (T214), so this must read as absent rather than as a failure.
    mockQuery.mockResolvedValue([{ leadId: 7, ghlContactId: null }]);
    const panel = await loadAcquisition('a@example.test');
    expect(panel!.ghlContactId).toBeNull();
  });

  it('degrades to a null PANEL for a person who was never a lead', async () => {
    mockQuery.mockResolvedValue([]);
    await expect(loadAcquisition('nobody@example.test')).resolves.toBeNull();
  });
});

describe('T211 — chronology is ORDER, asserted on the order it asks for', () => {
  it('orders the timeline by time descending, in the statement it issues', async () => {
    mockQuery.mockResolvedValue([]);
    await getPersonTimeline({
      leadIds: [7], enrollmentIds: ['enr-1'],
      domains: ['acquisition'], limit: 50,
    });
    const sql = sqlOf();
    // Order, not membership: the ORDER BY must be present AND must be the
    // timestamp, descending. Commenting it out fails this test.
    expect(sql).toMatch(/ORDER\s+BY\s+max\(occurred_at\)\s+DESC/);
    expect(sql).not.toMatch(/ORDER\s+BY\s+domain/);
  });

  it('keys pre-registration page events to the lead, which is the stitch', async () => {
    // Scenario 7: a visitor's page history becomes visible once identity
    // resolution has linked it to the lead. The key IS the stitch.
    mockQuery.mockResolvedValue([]);
    await getPersonTimeline({
      leadIds: [7], enrollmentIds: [],
      domains: ['acquisition'], limit: 50,
    });
    const sql = sqlOf();
    expect(sql).toContain('page_events');
    expect(sql).toMatch(/pe\.lead_id IN \(:leadIds\)/);
    expect(replacementsOf().leadIds).toEqual([7]);
  });

  it('asks for NO acquisition history when the person has no lead to stitch to', async () => {
    // The two-way control. An unstitched person has no pre-registration
    // history to show, and the absence must come from having no key — not from
    // the query silently returning everything.
    mockQuery.mockResolvedValue([]);
    const events = await getPersonTimeline({
      leadIds: [], enrollmentIds: ['enr-1'],
      domains: ['acquisition'], limit: 50,
    });
    expect(events).toEqual([]);
    // Either no query at all, or one that cannot match a lead-keyed row.
    if (mockQuery.mock.calls.length > 0) {
      expect(replacementsOf().leadIds ?? []).toEqual([]);
    }
  });
});

describe('T211 — cross-brand history appears only where stitching happened', () => {
  it('scopes every acquisition row to the stitched lead ids, not to a brand guess', () => {
    // The criterion attempt 1 had no test for. Cross-brand visits become
    // visible because the VISITOR was stitched to this lead — so the only key
    // is the lead id, and a person with no stitch gets nothing regardless of
    // how many brands they browsed.
    mockQuery.mockResolvedValue([]);
    return getPersonTimeline({
      leadIds: [7, 9], enrollmentIds: [], domains: ['acquisition'], limit: 50,
    }).then(() => {
      const sql = sqlOf();
      expect(sql).toMatch(/vs\.lead_id IN \(:leadIds\)/);
      expect(sql).toMatch(/pe\.lead_id IN \(:leadIds\)/);
      expect(replacementsOf().leadIds).toEqual([7, 9]);
      // No brand filter is applied here on purpose: the stitch decides what is
      // visible, and filtering by brand as well would HIDE the cross-brand
      // history this criterion exists to surface.
      expect(sql).not.toMatch(/brand_id\s*=/);
    });
  });

  it('shows no cross-brand history for an unstitched person — the control', () => {
    mockQuery.mockResolvedValue([]);
    return getPersonTimeline({
      leadIds: [], enrollmentIds: ['enr-1'], domains: ['acquisition'], limit: 50,
    }).then((events) => {
      expect(events).toEqual([]);
    });
  });
});
