/**
 * Phase 1 of the Explorer GHL backfill: the dry run.
 *
 * This script's job is to be believed, so the tests guard the three ways a dry run can lie
 * rather than the shape of its output:
 *
 *   1. IT MUST HAVE NO WRITE PATH. Not "must not be called" - must not exist. A previous
 *      backfill put a test fixture into the live School of Data and AI account and it was
 *      deleted from a customer-facing CRM by hand, so the absence of `createContact` from this
 *      module is a contract, not a convention, and it is asserted against the source text.
 *
 *   2. THE PARTITION MUST BE DISJOINT AND EXHAUSTIVE. A person who falls through every bucket
 *      is a person silently dropped from the plan's arithmetic, and the plan's own candidate
 *      count was wrong by 46 for exactly that reason: it partitioned on the sync audit, which
 *      only knows about the fixtures the guard refused.
 *
 *   3. "NOT IN GHL" MUST NOT BE REACHABLE BY ACCIDENT. A misconfigured credential returns null
 *      for every lookup, which reads identically to "nobody is in GHL". The control gate is
 *      what separates those two, so its failure predicate is tested in both directions.
 */

/**
 * Makes this file a MODULE rather than a script. Without it, a file that uses only `require`
 * and `jest.mock` has no import or export, so TypeScript puts every top-level `const` here
 * into the GLOBAL scope, where `fs`, `path` and `row` collide with the same names in other
 * script-mode suites. That collision is invisible when the file is checked on its own and
 * appears only in the whole-program check, which is why it is worth a comment: it is the same
 * reason `replyClassificationHook.test.ts` carries a baselined type error today.
 */
export {};

const findContactByEmail = jest.fn();
const findContactByPhone = jest.fn();
jest.mock('../../services/ghlService', () => ({ findContactByEmail, findContactByPhone }));
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn(), close: jest.fn() } }));
jest.mock('../../services/leads/ghlAccountRouting', () => ({ resolveGhlAccountForSource: jest.fn() }));
jest.mock('../../services/settingsService', () => ({ getSetting: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires -- after jest.mock
const { partitionCohorts, classifyOne, failedControls } = require('../explorerGhlBackfillDryRun');

const fs = require('fs');
const path = require('path');

const ACCOUNT = { accountKey: 'school_of_data_analytics', apiKey: 'test-key' };

type Row = {
  enrollment_id: string;
  lead_id: number;
  email: string | null;
  phone: string | null;
  name: string | null;
  source: string | null;
  consent_contact: boolean;
  last_sync_status: string | null;
  is_synthetic: boolean;
};

const row = (over: Partial<Row> = {}): Row => ({
  enrollment_id: `enr-${over.lead_id ?? 1}`,
  lead_id: 1,
  email: 'person@example.com',
  phone: '214-555-0100',
  name: 'A Person',
  source: 'open_house',
  consent_contact: false,
  last_sync_status: null,
  is_synthetic: false,
  ...over,
});

beforeEach(() => {
  findContactByEmail.mockReset();
  findContactByPhone.mockReset();
});

describe('the module has no write path at all', () => {
  const source: string = fs.readFileSync(
    path.join(__dirname, '..', 'explorerGhlBackfillDryRun.ts'),
    'utf8'
  );

  it.each(['createContact', 'updateContact', 'addContactTag', 'addContactNote', 'syncLeadToGhl'])(
    'never references %s',
    (name: string) => {
      expect(source).not.toContain(`${name}(`);
    }
  );

  it('the control: it DOES reference the two read calls, so the check can report presence', () => {
    // Without this, a typo in the assertions above would pass against any file at all.
    expect(source).toContain('findContactByEmail(');
    expect(source).toContain('findContactByPhone(');
  });

  it('imports exactly two symbols from ghlService, and both of them are reads', () => {
    // The real contract, stated at the module boundary rather than at the call sites. Grepping
    // for `createContact(` catches a call; this catches the import that would make one
    // possible, which is the earlier and stricter place to stop it.
    const match = /import \{([^}]*)\} from '\.\.\/services\/ghlService';/.exec(source);
    expect(match).not.toBeNull();
    const named = String((match as RegExpExecArray)[1])
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean)
      .sort();
    expect(named).toEqual(['findContactByEmail', 'findContactByPhone']);
  });
});

describe('the cohort partition is disjoint and exhaustive', () => {
  const rows = [
    row({ lead_id: 1 }),
    row({ lead_id: 2, last_sync_status: 'withheld' }),
    row({ lead_id: 3, is_synthetic: true }),
    row({ lead_id: 4, last_sync_status: 'success' }),
    // The case the plan got wrong: synthetic AND last status success.
    row({ lead_id: 5, is_synthetic: true, last_sync_status: 'success' }),
    row({ lead_id: 6, phone: null }),
  ];

  it('places every row in exactly one bucket', () => {
    const { synthetic, successNoId, candidates } = partitionCohorts(rows);
    const ids = [...synthetic, ...successNoId, ...candidates].map((r: Row) => r.lead_id).sort();
    expect(ids).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(ids).size).toBe(rows.length);
  });

  it('counts a synthetic row as a fixture even when its last sync said success', () => {
    const { synthetic, successNoId } = partitionCohorts(rows);
    expect(synthetic.map((r: Row) => r.lead_id)).toEqual([3, 5]);
    expect(successNoId.map((r: Row) => r.lead_id)).toEqual([4]);
  });

  it('reports counts that reconcile to the total', () => {
    const { counts } = partitionCohorts(rows);
    expect(counts.synthetic + counts.success_no_id + counts.candidates).toBe(counts.missing_total);
    expect(counts.missing_total).toBe(6);
    expect(counts.candidates).toBe(3);
  });

  it('counts callable by 10 digits, not by a non-empty string', () => {
    const { counts } = partitionCohorts([row({ lead_id: 7, phone: '555' }), row({ lead_id: 8 })]);
    expect(counts.callable_total).toBe(1);
  });
});

describe('classifyOne reports what a live run would do, and calls nothing else', () => {
  it('finds an existing contact by email and reuses its id', async () => {
    findContactByEmail.mockResolvedValue({ id: 'ghl-1', email: 'person@example.com' });
    const out = await classifyOne(row(), ACCOUNT);
    expect(out).toEqual({ disposition: 'already_in_ghl_by_email', existing_contact_id: 'ghl-1' });
    expect(findContactByPhone).not.toHaveBeenCalled();
  });

  it('falls back to phone only when email misses', async () => {
    findContactByEmail.mockResolvedValue(null);
    findContactByPhone.mockResolvedValue({ id: 'ghl-2', phone: '+12145550100' });
    const out = await classifyOne(row(), ACCOUNT);
    expect(out).toEqual({ disposition: 'already_in_ghl_by_phone', existing_contact_id: 'ghl-2' });
  });

  it('would create when neither lookup finds anybody', async () => {
    findContactByEmail.mockResolvedValue(null);
    findContactByPhone.mockResolvedValue(null);
    const out = await classifyOne(row(), ACCOUNT);
    expect(out).toEqual({ disposition: 'would_create', existing_contact_id: null });
  });

  it('does not search by phone for somebody with no usable phone', async () => {
    findContactByEmail.mockResolvedValue(null);
    const out = await classifyOne(row({ phone: '555' }), ACCOUNT);
    expect(out.disposition).toBe('would_create');
    expect(findContactByPhone).not.toHaveBeenCalled();
  });

  it('skips a lead with no email instead of searching on an empty string', async () => {
    const out = await classifyOne(row({ email: '  ' }), ACCOUNT);
    expect(out.disposition).toBe('skipped_no_email');
    expect(findContactByEmail).not.toHaveBeenCalled();
  });

  it('reports a thrown lookup as its own disposition rather than would_create', async () => {
    // would_create on an error is the dangerous answer: it is the one that puts a person
    // who may already exist back into the live run.
    findContactByEmail.mockRejectedValue(new Error('upstream exploded'));
    const out = await classifyOne(row(), ACCOUNT);
    expect(out).toEqual({ disposition: 'lookup_error', existing_contact_id: null });
  });

  it('passes the routed account credential, never a default', async () => {
    findContactByEmail.mockResolvedValue(null);
    findContactByPhone.mockResolvedValue(null);
    await classifyOne(row(), ACCOUNT);
    expect(findContactByEmail).toHaveBeenCalledWith('person@example.com', 'test-key');
    expect(findContactByPhone).toHaveBeenCalledWith('214-555-0100', 'test-key');
  });
});

describe('the control gate', () => {
  const ok = { account: 'a', control_source: 'open_house', present_found: true, present_id_matched: true, absent_found: false };

  it('passes when a known contact is found and an impossible one is not', () => {
    expect(failedControls([ok])).toEqual([]);
  });

  it('fails when the credential cannot find a contact it already owns', () => {
    expect(failedControls([{ ...ok, present_found: false }])).toHaveLength(1);
  });

  it('fails when an address under .invalid comes back as a match', () => {
    expect(failedControls([{ ...ok, absent_found: true }])).toHaveLength(1);
  });

  it('does not fail merely because the stored id differs from the one found', () => {
    // Worth reporting, not worth voiding the run: the contact exists either way, so
    // "already in GHL" is still the right answer for that person.
    expect(failedControls([{ ...ok, present_id_matched: false }])).toEqual([]);
  });

  it('names every failing account, not just the first', () => {
    const bad = failedControls([{ ...ok, account: 'x', present_found: false }, { ...ok, account: 'y', absent_found: true }]);
    expect(bad.map((c: { account: string }) => c.account)).toEqual(['x', 'y']);
  });
});
