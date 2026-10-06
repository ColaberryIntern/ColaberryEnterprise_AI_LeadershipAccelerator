import fs from 'fs';
import path from 'path';

// Built with `new RegExp` from explicit character codes rather than written as regex
// literals: a literal containing backslash escapes was mangled in transit while this
// file was being edited, which produced a real newline inside the pattern.
const blockComment = new RegExp('/\\*[\\s\\S]*?\\*/', 'g');
const lineComment = new RegExp('//[^\\r\\n]*', 'g');
const enrollmentFindByPk = jest.fn();
const enrollmentFindOne = jest.fn();
const cohortIncrement = jest.fn();
const subscriptionFindOne = jest.fn();
const subscriptionCreate = jest.fn();

jest.mock('../../models', () => ({
  Enrollment: {
    findByPk: (...a: unknown[]) => enrollmentFindByPk(...a),
    findOne: (...a: unknown[]) => enrollmentFindOne(...a),
    findAll: jest.fn().mockResolvedValue([]),
  },
  Cohort: { increment: (...a: unknown[]) => cohortIncrement(...a), findByPk: jest.fn() },
  Subscription: {
    findOne: (...a: unknown[]) => subscriptionFindOne(...a),
    create: (...a: unknown[]) => subscriptionCreate(...a),
    findAll: jest.fn().mockResolvedValue([]),
  },
  Campaign: { findOne: jest.fn() },
  Lead: { findOrCreate: jest.fn().mockResolvedValue([{ id: 1 }, true]) },
  AccountCredit: { findOne: jest.fn() },
  CommunityMember: {},
}));

// `config/database` is deliberately NOT mocked. A stub cannot stand in for it: this import
// graph reaches `SystemSetting.init(...)`, and Sequelize's `Model.init` calls
// `this.sequelize.modelManager.getModel`, so anything short of a real instance fails the
// whole suite before a single test runs. Constructing a real Sequelize parses the URL and
// opens no connection, so `query` is spied per-test instead.
jest.mock('../../config/env', () => ({ env: { jwtSecret: 't', databaseUrl: 'postgres://u:p@localhost:5432/t' } }));

import { convertExplorerToStandard, markEnrollmentPaid } from '../enrollmentService';
import { reconcilePayment } from '../paymentReconciliationService';
// THE REAL CONSUMER, imported rather than re-implemented. Re-declaring a predicate inside a
// test is the tautology that cost T203 five of its tests: inverting the real function left
// the suite green. `isEnrolledMember` is what the partner app actually calls.
import { isEnrolledMember } from '../../controllers/v1EnrollmentLookupController';
import { sequelize } from '../../config/database';

// The raw-SQL writer calls `sequelize.query` on the module-level instance, so spying on
// that instance's method is what intercepts it.

/**
 * Phase 2 T206 — WRITER-PAIR COHERENCE.
 *
 * `enrollment_type` is the PROGRAMME and `tier` is the ACCESS LEVEL. A writer that moves one
 * without the other leaves a row no consumer reads correctly, and there are two distinct
 * broken states, neither of which implies the other:
 *
 *   1. **paid-but-guest** — `payment_status: 'paid'` with `tier: 'guest'`.
 *   2. **standard + guest** — moved off `'explorer'` without being granted `'member'`.
 *      This row is **never paid**, so no paid-but-guest check can see it. That is why
 *      T206 has two tripwires rather than one.
 *
 * `grantMembership` (`subscriptionService.ts:525`) is the reference implementation and its own
 * comment says it is "kept in one place so the two callers can never drift apart". This task
 * makes the other writers agree with it rather than adding a second opinion.
 *
 * HOW THESE TESTS ARE BUILT. For each writer that goes through the model, the test captures
 * the patch the REAL function writes, applies it to a realistic starting row, and feeds the
 * result to the REAL consumer. Nothing re-declares the invariant: if `isEnrolledMember`
 * changed its mind about what enrolled means, these tests would change with it.
 */

/**
 * A free Explorer: the row every coherence failure starts from.
 *
 * EXPLICITLY TYPED, because the inferred version shipped two `TS2339 Property 'save' does
 * not exist` errors in attempt 2. `...over` typed as `Record<string, unknown>` widens nothing
 * onto the result, so `row.save` did not exist on the type even where a test passed one in.
 * Nothing in this repo catches that: `tsconfig.json` excludes `__tests__`, and ts-jest runs
 * with `isolatedModules`, so the canonical `tsc` is honestly green while the test code is not
 * type-correct. Typing the fixture is the fix; citing the canonical typecheck would not have
 * been evidence for it.
 */
type FixtureRow = {
  id: string;
  email: string;
  status: 'active';
  tier: string;
  enrollment_type: string;
  payment_status: string;
  cohort_id: string | null;
  enrolled_at: Date | null;
  paysimple_external_id?: string;
  update: jest.Mock;
  save: jest.Mock;
};

const freeExplorer = (over: Partial<FixtureRow> = {}): FixtureRow => ({
  id: 'enr-1',
  email: 'maya@example.com',
  status: 'active',
  tier: 'guest',
  enrollment_type: 'explorer',
  payment_status: 'pending',
  cohort_id: 'coh-1',
  enrolled_at: null,
  update: jest.fn(),
  save: jest.fn(),
  ...over,
});

/**
 * Read a sibling service's source with comments removed.
 *
 * ONE copy, used by both raw-SQL writers' tests. Comments are stripped because a guard that
 * reads prose measures the wrong text - T205 had a truthful docblock break a token scan, and
 * T203 had an explanatory comment make a structural assertion pass. `[^\r\n]*` rather than
 * `.*` for line comments: JS `.` does not match a carriage return and these files are CRLF
 * here, so `.*` would strip nothing and leave the assertion reading commented-out code.
 */
const stripSource = (file: string): string => {
  const raw = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  return raw.replace(blockComment, ' ').replace(lineComment, ' ');
};

/** Apply a captured patch to a row, the way a real Sequelize instance would. */
const applied = (row: Record<string, unknown>, patch: Record<string, unknown>) => ({ ...row, ...patch });

describe('T206 writer 1 — convertExplorerToStandard (the LATENT one)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes BOTH columns, so the conversion cannot produce standard + guest', async () => {
    const row = freeExplorer();
    enrollmentFindByPk.mockResolvedValue(row);

    await convertExplorerToStandard('enr-1');

    expect(row.update).toHaveBeenCalledTimes(1);
    const patch = row.update.mock.calls[0][0];
    expect(patch).toEqual({ enrollment_type: 'standard', tier: 'member' });
  });

  it('and the converted row reads as ENROLLED to the real partner-app predicate', async () => {
    // The composition that matters: writer output -> real consumer input. Before T206 this
    // produced `standard` + `guest`, which `isEnrolledMember` reports as NOT enrolled - a
    // converted student the partner app refuses to log in.
    const row = freeExplorer();
    enrollmentFindByPk.mockResolvedValue(row);

    await convertExplorerToStandard('enr-1');
    const after = applied(row, row.update.mock.calls[0][0]);

    expect(isEnrolledMember([after as never])).toBe(true);
  });

  it('leaves a row that is already standard completely alone', async () => {
    const row = freeExplorer({ enrollment_type: 'standard', tier: 'member' });
    enrollmentFindByPk.mockResolvedValue(row);

    await convertExplorerToStandard('enr-1');

    expect(row.update).not.toHaveBeenCalled();
  });
});

describe('T206 writer 5 — markEnrollmentPaid (LIVE; the one attempt 1 MISSED)', () => {
  /**
   * THE PLAN NAMED THIS WRITER and attempt 1 neither fixed nor named it, while the session
   * log claimed an exhaustive derivation. Worth being exact about the cause, because it is a
   * better lesson than the omission: this path writes by PROPERTY ASSIGNMENT followed by
   * `.save()`, not through an object literal or raw SQL. Two write syntaxes were being
   * thought about and there are three.
   *
   * The tripwire patterns DID match this file. What was wrong was the determination written
   * for it, which described only the create sitting beside this function. A population guard
   * is worth exactly what its determinations are worth.
   *
   * Latent, not live: the lookup is by `paysimple_external_id`, written only by
   * `createPendingEnrollment`, whose rows inherit the column default `tier: 'member'`. So no
   * paid-but-guest row can exist through here today. Fixed for the same reason
   * `convertExplorerToStandard` was - the coherence must not rest on a column default that
   * nothing at the call site states.
   */
  beforeEach(() => {
    jest.clearAllMocks();
    cohortIncrement.mockResolvedValue(undefined);
  });

  it('assigns the pair onto the row before saving it', async () => {
    const row = freeExplorer({ paysimple_external_id: 'CB-1-2' });
    enrollmentFindOne.mockResolvedValue(row);

    await markEnrollmentPaid('CB-1-2', { paymentId: 9, amount: 1500 });

    // Assignment syntax, so the evidence is the ROW ITSELF after the call, not a patch object.
    expect(row.save).toHaveBeenCalledTimes(1);
    expect(row.payment_status).toBe('paid');
    expect(row.tier).toBe('member');
    expect(row.enrollment_type).toBe('standard');
  });

  it('and the saved row reads as ENROLLED to the real partner-app predicate', async () => {
    const row = freeExplorer({ paysimple_external_id: 'CB-1-2' });
    enrollmentFindOne.mockResolvedValue(row);

    await markEnrollmentPaid('CB-1-2', { paymentId: 9, amount: 1500 });

    expect(isEnrolledMember([row as never])).toBe(true);
  });

  it('stays idempotent: an already-paid row is returned without a second save', async () => {
    const row = freeExplorer({ payment_status: 'paid', paysimple_external_id: 'CB-1-2' });
    enrollmentFindOne.mockResolvedValue(row);

    await markEnrollmentPaid('CB-1-2');

    expect(row.save).not.toHaveBeenCalled();
    expect(cohortIncrement).not.toHaveBeenCalled();
  });
});

describe('T206 writer 2 — reconcilePayment (LIVE)', () => {
  const payment = { Id: 9001, Amount: 1500, PaymentDate: '2026-10-01T00:00:00Z' };

  beforeEach(() => {
    jest.clearAllMocks();
    cohortIncrement.mockResolvedValue(undefined);
  });

  it('marks paid AND grants the pair in the same write', async () => {
    const row = freeExplorer();
    enrollmentFindByPk.mockResolvedValue(row);

    const did = await reconcilePayment('enr-1', payment as never, 77);

    expect(did).toBe(true);
    const patch = row.update.mock.calls[0][0];
    expect(patch.payment_status).toBe('paid');
    expect(patch.tier).toBe('member');
    expect(patch.enrollment_type).toBe('standard');
  });

  it('and the paid row reads as ENROLLED to the real partner-app predicate', async () => {
    const row = freeExplorer();
    enrollmentFindByPk.mockResolvedValue(row);

    await reconcilePayment('enr-1', payment as never, 77);
    const after = applied(row, row.update.mock.calls[0][0]);

    // Before T206 this row was paid + guest + explorer: paid in the ledger, locked out of
    // the partner app, and read as not-a-customer by the Growth Journey.
    expect(isEnrolledMember([after as never])).toBe(true);
    expect(after.tier).not.toBe('guest');
  });

  it('is still idempotent: an already-paid row is a no-op and writes nothing', async () => {
    // The pre-existing guarantee this task must not break - two overlapping runs must never
    // double-increment `seats_taken`.
    const row = freeExplorer({ payment_status: 'paid' });
    enrollmentFindByPk.mockResolvedValue(row);

    const did = await reconcilePayment('enr-1', payment as never, 77);

    expect(did).toBe(false);
    expect(row.update).not.toHaveBeenCalled();
    expect(cohortIncrement).not.toHaveBeenCalled();
  });
});

describe('T206 writer 3 — paymentSyncService, RAW SQL (LIVE, and the weaker seam)', () => {
  /**
   * STATED PLAINLY: this writer does not go through the model, so there is no patch object to
   * inspect and these assertions are on the SQL TEXT and its replacements. That is a weaker
   * seam than writers 1 and 2, and it is described as weaker rather than presented as
   * equivalent. No suite in this repo runs against a real database, so nothing here proves
   * the statement is valid SQL - T215 (deploy) and T216 (read-only production verification)
   * are where that gets observed.
   *
   * It is also the reason T206's tripwires are derived over BOTH write syntaxes: a guard
   * scanning for `.create` / `.update` cannot see this site at all.
   */
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * A test asserting only "some query was issued" was written here first and then DELETED
   * rather than propped up. It asserted almost nothing - `syncPaySimplePayments` bails before
   * its update loop when the PaySimple client is unmocked, so the assertion passed or failed
   * on an unrelated early return. A test that cannot fail for the reason it names is the
   * exact class this phase keeps being caught on, and keeping a weak one next to a real one
   * only lends it credibility.
   *
   * Behavioural coverage of this sweep already exists and passes in
   * `src/__tests__/services/paymentSyncService.test.ts` (part of the verification run). What
   * is new in T206 is the two column assignments, asserted below on the statement text.
   */

  it('the UPDATE statement gates BOTH columns on :status = paid, never unconditionally', () => {
    // Read from the module's own source: the statement is a template literal, so this is the
    // text that will be sent. Declared as a source assertion for exactly that reason.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'paymentSyncService.ts'), 'utf8',
    ) as string;
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\r\n]*/g, ' ');

    expect(stripped).toContain("tier = CASE WHEN :status = 'paid' THEN 'member' ELSE tier END");
    expect(stripped).toContain(
      "enrollment_type = CASE WHEN :status = 'paid' THEN 'standard' ELSE enrollment_type END",
    );
    // A FAILED payment must move neither column. The `ELSE tier END` / `ELSE enrollment_type
    // END` arms are what guarantee that, so their absence is the thing to catch.
    expect(stripped).not.toContain("tier = 'member',");
    // POSITIVE CONTROL: the read found the statement at all.
    expect(stripped).toContain('UPDATE enrollments SET');
  });
});

describe('T206 writer 4 — appPaymentReconcileService, RAW SQL (LIVE; the FIFTH writer)', () => {
  /**
   * NOT IN THE PLAN, which named three sites. Found by deriving the paid-status writer set
   * from source instead of trusting the written list - the fifth time in this phase that a
   * population in the plan came up short when derived, and the reason T206's tripwires pin a
   * population rather than check a number anyone chose.
   *
   * In the happy path `activateByRef` has already granted membership before this statement
   * runs (its own comment says so). It matters on the ERROR path: if activation threw or was
   * skipped, this would mark a row paid while leaving `tier: 'guest'`.
   *
   * Same declared limitation as writer 3: raw SQL has no patch object, so this asserts the
   * statement text. Weaker than a model seam, and described as weaker.
   */
  const src = () => stripSource('appPaymentReconcileService.ts');

  it('writes the pair alongside the paid flag', () => {
    expect(src()).toContain("tier = 'member'");
    expect(src()).toContain("enrollment_type = 'standard'");
  });

  it('and they sit in the SAME statement as payment_status, not a separate one', () => {
    // A separate UPDATE would reintroduce the gap this closes: two statements can be
    // interrupted between, leaving paid-but-guest for exactly as long as that takes.
    const stmt = src().match(/UPDATE enrollments[\s\S]*?WHERE id = :id/);
    expect(stmt).not.toBeNull();
    expect(stmt![0]).toContain("payment_status = 'paid'");
    expect(stmt![0]).toContain("tier = 'member'");
    expect(stmt![0]).toContain("enrollment_type = 'standard'");
  });
});

describe('T206 AC3 — grantMembership remains the reference: both columns, one place', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    subscriptionFindOne.mockResolvedValue(null);
    subscriptionCreate.mockImplementation(async (a: Record<string, unknown>) => ({ id: 'sub-1', ...a }));
  });

  it('a comped member is granted the pair, through the reference path', async () => {
    // Driven through `grantFreeAccess`, the exported entry point that reaches the private
    // `grantMembership`, rather than asserting on its source.
    const row = freeExplorer();
    enrollmentFindByPk.mockResolvedValue(row);
    const { grantFreeAccess } = await import('../subscriptionService');

    await grantFreeAccess('enr-1', Date.parse('2026-10-06T00:00:00Z'));

    const patches = row.update.mock.calls.map((c: unknown[]) => c[0] as Record<string, unknown>);
    const paired = patches.find((p) => 'tier' in p && 'enrollment_type' in p);
    expect(paired).toBeDefined();
    expect(paired!.tier).toBe('member');
    expect(paired!.enrollment_type).toBe('standard');
  });
});

describe('T206 AC6 — an org teammate rests at standard + guest LEGITIMATELY', () => {
  /**
   * THE SCOPING THAT MATTERS, and the thing a careless tripwire 2 would destroy.
   *
   * `standard` + `guest` is a perfectly correct resting state: an org teammate invited by
   * their employer has a non-learner programme and free access, has paid nothing, and must
   * stay exactly as they are. A tripwire that condemned that state would fire on the
   * population this phase exists to protect.
   *
   * So tripwire 2 keys on a **transition off `'explorer'`**, not on the resting state. This
   * test records the distinction as an executable fact rather than a comment.
   */
  it('is NOT a customer, is NOT enrolled, and nothing about T206 changes that', () => {
    const teammate = { id: 'enr-9', tier: 'guest', enrollment_type: 'standard', payment_status: 'pending', status: 'active' };

    // The real partner-app predicate: correctly not enrolled, because they bought nothing.
    expect(isEnrolledMember([teammate as never])).toBe(false);
    //
    // Two further assertions stood here and were REMOVED after verification: they re-read
    // `payment_status` and `enrollment_type` off the object literal declared a few lines above,
    // so they restated the fixture rather than testing anything, while their comments presented
    // the result as a finding. A fixture asserting itself is the class this phase keeps being
    // caught on, and a small instance is no more acceptable than a large one.
  });
});
