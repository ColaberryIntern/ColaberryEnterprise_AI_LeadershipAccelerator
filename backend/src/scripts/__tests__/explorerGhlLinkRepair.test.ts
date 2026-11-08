/**
 * The I/O half of Phase 3A of the Explorer GHL backfill: the link repair driver.
 *
 * This script writes to production, so the tests guard the three ways that write can go wrong.
 * The rule that decides WHICH rows get written is pure and tested without mocks in
 * `lib/__tests__/explorerGhlLinkPlan.test.ts`; what is tested here is everything that touches
 * the outside world.
 *
 *   1. IT MUST NOT BE ABLE TO REACH THE CRM. Phase 1 proved its matcher read-only by asserting
 *      its ghlService import names exactly `findContactByEmail` and `findContactByPhone`. This
 *      file must not import ghlService AT ALL, so that contract holds transitively and cannot
 *      be reopened by a later edit here.
 *
 *   2. EVERY WRITE MUST BE GUARDED IN THE SQL, not in the caller. `AND ghl_contact_id IS NULL`
 *      is what makes a second run a no-op and what lets a concurrent writer win. Asserted
 *      against the source text, because a condition written in TypeScript can be refactored
 *      away while the statement survives, and then the script overwrites live links.
 *
 *   3. THE AUDIT RECORD MUST FOLLOW THE TRANSITION, NOT THE ATTEMPT. An activity row written
 *      when nothing changed would log a repair that never happened.
 */

/**
 * Makes this file a MODULE rather than a script. Without it, a suite that uses only `require`
 * and `jest.mock` has no import or export, so TypeScript puts every top-level `const` here into
 * the GLOBAL scope, where common names collide with the same names in other script-mode suites
 * and the redeclaration is reported against BOTH files. That is invisible in a single-file
 * check and appears only in the whole-program one.
 */
export {};

const query = jest.fn();
jest.mock('../../config/database', () => ({
  sequelize: { query, transaction: jest.fn(), close: jest.fn() },
}));
jest.mock('../explorerGhlBackfillDryRun', () => ({
  loadCohorts: jest.fn(),
  classifyOne: jest.fn(),
  runControls: jest.fn(),
  failedControls: jest.fn(() => []),
  resolveAccounts: jest.fn(),
}));
jest.mock('../../services/settingsService', () => ({ getSetting: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires -- after jest.mock
const { applyOne, loadExistingLinks, reverse, main } = require('../explorerGhlLinkRepair');

const fs = require('fs');
const path = require('path');
const os = require('os');

const source: string = fs.readFileSync(
  path.join(__dirname, '..', 'explorerGhlLinkRepair.ts'),
  'utf8'
);

const link = {
  enrollment_id: 'enr-42',
  lead_id: 42,
  source: 'open_house',
  account: 'school_of_data_analytics',
  matched_by: 'email' as const,
  contact_id: 'ghl-42',
  callable: true,
  consent_contact: false,
  previous_contact_id: null,
};

beforeEach(() => {
  query.mockReset();
});

describe('it cannot reach the CRM', () => {
  it('does not import the GHL service at all', () => {
    expect(source).not.toMatch(/from '\.\.\/services\/ghlService'/);
    expect(source).not.toMatch(/require\(['"]\.\.\/services\/ghlService['"]\)/);
  });

  it('the control: it DOES import the Phase 1 matcher, so the check can report presence', () => {
    // Without this, a typo in the assertion above would pass against any file at all.
    expect(source).toMatch(/from '\.\/explorerGhlBackfillDryRun'/);
  });

  it.each(['createContact', 'updateContact', 'addContactTag', 'addContactNote', 'syncLeadToGhl'])(
    'never calls %s',
    (name: string) => {
      expect(source).not.toContain(`${name}(`);
    }
  );
});

describe('every write is guarded in the SQL', () => {
  const updates: string[] = source.match(/UPDATE leads[\s\S]*?(?=`)/g) || [];

  it('finds the two UPDATE statements it expects, and no others', () => {
    // The control for the checks below: a renamed table or a third statement fails here rather
    // than letting the next three pass vacuously.
    expect(updates).toHaveLength(2);
  });

  it('the forward write only ever touches a row whose link is still empty', () => {
    const forward = updates.find((u) => u.includes('ghl_contact_id = :contactId'));
    expect(forward).toBeDefined();
    expect(forward).toContain('AND ghl_contact_id IS NULL');
  });

  it('the reversal only clears the exact id it wrote', () => {
    const back = updates.find((u) => u.includes('ghl_contact_id = NULL'));
    expect(back).toBeDefined();
    expect(back).toContain('AND ghl_contact_id = :contactId');
  });

  it('no UPDATE is unbounded by a lead id', () => {
    expect(updates).not.toHaveLength(0);
    for (const u of updates) expect(u).toContain('WHERE id = :leadId');
  });
});

describe('applyOne is idempotent and always leaves a record', () => {
  const tx = {} as never;

  it('writes the link and one activity when the guard lets the row through', async () => {
    query.mockResolvedValueOnce([undefined, 1]).mockResolvedValueOnce([undefined, 1]);
    await expect(applyOne(link, tx)).resolves.toBe('linked');

    expect(query).toHaveBeenCalledTimes(2);
    const [, opts] = query.mock.calls[0];
    expect(opts.replacements).toMatchObject({ contactId: 'ghl-42', leadId: 42 });
    expect(opts.transaction).toBe(tx);
    expect(query.mock.calls[1][0]).toContain('INSERT INTO activities');
    expect(JSON.parse(query.mock.calls[1][1].replacements.meta)).toMatchObject({
      action: 'ghl_link_repair',
      status: 'linked',
      phase: '3A',
      ghl_contact_id: 'ghl-42',
      matched_by: 'email',
      account: 'school_of_data_analytics',
    });
  });

  it('writes NO activity when the row was already linked by somebody else', async () => {
    // The activity follows the transition, not the attempt, or a second run would log a repair
    // that never happened and Phase 4 would verify against a fiction.
    query.mockResolvedValueOnce([undefined, 0]);
    await expect(applyOne(link, tx)).resolves.toBe('already_linked_concurrently');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('runs the activity insert inside the same transaction as the update', async () => {
    query.mockResolvedValueOnce([undefined, 1]).mockResolvedValueOnce([undefined, 1]);
    await applyOne(link, tx);
    expect(query.mock.calls[1][1].transaction).toBe(tx);
  });
});

describe('loadExistingLinks', () => {
  it('asks for nothing when there is nothing to ask about', async () => {
    await expect(loadExistingLinks([])).resolves.toEqual(new Map());
    expect(query).not.toHaveBeenCalled();
  });

  it('groups the lead rows that already carry each contact id', async () => {
    query.mockResolvedValueOnce([
      { lead_id: 1, ghl_contact_id: 'a' },
      { lead_id: 2, ghl_contact_id: 'a' },
      { lead_id: 3, ghl_contact_id: 'b' },
    ]);
    const map = await loadExistingLinks(['a', 'b']);
    expect(map.get('a')).toEqual([1, 2]);
    expect(map.get('b')).toEqual([3]);
  });
});

describe('reverse', () => {
  const ledgerPath = path.join(os.tmpdir(), `phase3a-test-${process.pid}.json`);

  afterAll(() => {
    try {
      fs.unlinkSync(ledgerPath);
    } catch {
      /* the subject is reverse(), not the cleanup */
    }
  });

  it('only undoes rows it actually wrote, and counts the ones that moved on', async () => {
    fs.writeFileSync(
      ledgerPath,
      JSON.stringify({
        applied: [
          { lead_id: 1, contact_id: 'a', outcome: 'linked', applied_at: 'x' },
          { lead_id: 2, contact_id: 'b', outcome: 'linked', applied_at: 'x' },
          // Never written by this run, so clearing it would unlink something we did not create.
          { lead_id: 3, contact_id: 'c', outcome: 'already_linked_concurrently', applied_at: 'x' },
        ],
      })
    );
    query.mockResolvedValueOnce([undefined, 1]).mockResolvedValueOnce([undefined, 0]);

    await expect(reverse(ledgerPath)).resolves.toEqual({ reversed: 1, skipped: 1 });
    expect(query).toHaveBeenCalledTimes(2);
  });
});

describe('the --apply pre-flight', () => {
  it('refuses to write without being told how many rows to expect', async () => {
    // A write whose size nobody stated in advance is a write nobody reviewed. The guard fires
    // before any database or settings access, which is why it is testable without either.
    await expect(main(['node', 'script', '--apply'])).rejects.toThrow(/--expect/);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses to write without a ledger, because then there is nothing to reverse', async () => {
    await expect(main(['node', 'script', '--apply', '--expect', '192'])).rejects.toThrow(/--json/);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', 'all'])('refuses a --batch of %s rather than looping for ever', async (bad: string) => {
    // `--batch 0` advances the write loop by nothing. An infinite retry loop is prohibited
    // outright; an infinite WRITE loop is worse.
    const argv = ['node', 'script', '--apply', '--expect', '192', '--json', '/tmp/x.json', '--batch', bad];
    await expect(main(argv)).rejects.toThrow(/--batch must be a positive integer/);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a --limit that is not a positive integer', async () => {
    // A NaN limit slices the cohort to nothing, which reads as "there is no work to do".
    await expect(main(['node', 'script', '--limit', 'twenty'])).rejects.toThrow(/--limit must be a positive integer/);
    expect(query).not.toHaveBeenCalled();
  });

  it('the control: a valid --batch gets past these guards and on to the settings check', async () => {
    // Without this, a typo making every argv throw would read as all four guards passing.
    const { getSetting } = require('../../services/settingsService');
    getSetting.mockResolvedValueOnce(false);
    const argv = ['node', 'script', '--apply', '--expect', '192', '--json', '/tmp/x.json', '--batch', '5'];
    await expect(main(argv)).rejects.toThrow(/ghl_enabled/);
  });
});

describe('the ledger carries no personal data, because it leaves the container', () => {
  // The ledger is written to a file and read back off the box, so the row it is built from must
  // not be able to carry an address or a phone number. Asserted on the declared FIELD NAMES:
  // `matched_by: 'email' | 'phone'` means a substring search over the interface would fail
  // against a perfectly clean type.
  const planSource: string = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'explorerGhlLinkPlan.ts'),
    'utf8'
  );
  const body = /export interface MatchRow \{([\s\S]*?)\n\}/.exec(planSource);
  const fieldNames: string[] = String(body ? body[1] : '')
    .split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => /^[a-z_]+\??:/.test(l))
    .map((l: string) => l.split(/\??:/)[0]);

  it('the control: MatchRow was found and declares the fields the plan needs', () => {
    expect(body).not.toBeNull();
    expect(fieldNames).toContain('enrollment_id');
    expect(fieldNames).toContain('contact_id');
    expect(fieldNames.length).toBeGreaterThan(4);
  });

  it.each(['email', 'name', 'phone'])('declares no %s field', (pii: string) => {
    expect(fieldNames).not.toContain(pii);
  });
});
