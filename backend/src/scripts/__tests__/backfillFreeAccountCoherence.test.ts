/**
 * T207 AC1 — "a dry run writes nothing, proved by before/after counts".
 *
 * The script already PRINTS before/after counts, but printing two equal numbers
 * is not a proof: a dry run that issued an UPDATE and re-counted would print
 * two DIFFERENT numbers and still exit 0, and a dry run whose counts were read
 * from a stale snapshot would print two equal ones while having written. So the
 * assertion here is on the statements that reach the database, with the printed
 * counts as corroboration rather than as the evidence.
 *
 * This is the test the module was restructured for: `confirm` used to be a
 * module-level `process.argv.includes(...)`, which made the committing path
 * unreachable from a test and left AC1 resting on prose.
 */
import { QueryTypes } from 'sequelize';

const query = jest.fn();
const close = jest.fn();

jest.mock('../../config/database', () => ({ sequelize: { query, close } }));

// eslint-disable-next-line @typescript-eslint/no-var-requires -- after jest.mock
const { runForward } = require('../backfillFreeAccountCoherence');

const COUNTS = { shape_a: '2', shape_b: '1', coherent_free: '0', total: '3' };

/** One Shape A row the predicate writes, one org row it must not. */
const ROWS = [
  {
    id: 'shape-a', email: 'learner@example.com', status: 'active',
    tier: 'member', enrollment_type: 'explorer', payment_status: 'pending',
    amount_paid: 0, subscription_status: null, is_org_member: false,
    community_role: null, mgmt_role: null, lead_source: null,
    lead_form_type: null, cohort_name: null, explorer_entered_at: null,
  },
  {
    id: 'org-row', email: 'teammate@acme.com', status: 'active',
    tier: 'guest', enrollment_type: 'standard', payment_status: 'pending',
    amount_paid: 0, subscription_status: null, is_org_member: true,
    community_role: null, mgmt_role: null, lead_source: 'free_signup',
    lead_form_type: 'free_signup', cohort_name: null, explorer_entered_at: null,
  },
];

beforeEach(() => {
  query.mockReset();
  close.mockReset();
  query.mockImplementation((sql: string, opts?: { type?: unknown }) => {
    if (/^\s*UPDATE/i.test(sql)) return Promise.resolve([[], 1]);
    if (sql.includes('FILTER (WHERE')) return Promise.resolve([COUNTS]);
    if (opts?.type === QueryTypes.SELECT) return Promise.resolve(ROWS);
    return Promise.resolve([[], 0]);
  });
});

const updates = (): string[] => query.mock.calls
  .map((c) => String(c[0]))
  .filter((sql) => /^\s*UPDATE/i.test(sql));

describe('T207 AC1 — dry run is the default and it writes nothing', () => {
  it('issues no UPDATE when confirm is false', async () => {
    await runForward({ confirm: false });
    expect(updates()).toEqual([]);
  });

  it('still reads, so the empty UPDATE list is not an empty run', async () => {
    // The control: without this, "no UPDATEs" would also pass if the script had
    // crashed before touching the database at all.
    await runForward({ confirm: false });
    expect(query).toHaveBeenCalled();
    expect(query.mock.calls.some((c) => String(c[0]).includes('FROM enrollments e'))).toBe(true);
  });

  it('plans the write it is declining to make', async () => {
    const ledger = await runForward({ confirm: false });
    expect(ledger).toEqual([{ id: 'shape-a', column: 'tier', from: 'member', to: 'guest' }]);
  });
});

describe('T207 — the committing path, so the dry-run proof has a counterpart', () => {
  it('issues exactly one pinned UPDATE per ledger entry when confirmed', async () => {
    await runForward({ confirm: true });
    const sent = updates();
    expect(sent).toHaveLength(1);
    // Pinned to the value that was read: a row changed underneath us is skipped,
    // not overwritten with a decision made about a different value.
    expect(sent[0]).toContain('UPDATE enrollments SET tier = :to WHERE id = :id AND tier = :from');
  });

  it('never issues an UPDATE for an excluded row', async () => {
    await runForward({ confirm: true });
    const replacements = query.mock.calls
      .filter((c) => /^\s*UPDATE/i.test(String(c[0])))
      .map((c) => (c[1] as { replacements: { id: string } }).replacements.id);
    expect(replacements).toEqual(['shape-a']);
    expect(replacements).not.toContain('org-row');
  });
});
