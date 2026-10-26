const bridge = jest.fn().mockResolvedValue(true);
jest.mock('../explorerProfileAtRegistration', () => ({
  bridgeExplorerProfileAtRegistration: (...a: unknown[]) => bridge(...a),
}));

const enrollmentCreate = jest.fn();
const enrollmentFindAll = jest.fn();
const enrollmentFindOne = jest.fn();
const leadFindOrCreate = jest.fn();
const cohortFindOne = jest.fn();

jest.mock('../../../models', () => ({
  Enrollment: {
    create: (...a: unknown[]) => enrollmentCreate(...a),
    findAll: (...a: unknown[]) => enrollmentFindAll(...a),
    findOne: (...a: unknown[]) => enrollmentFindOne(...a),
  },
  Lead: { findOrCreate: (...a: unknown[]) => leadFindOrCreate(...a) },
  // `findByPk` too: the deposit path's `needsCohortPlacement` resolves the current cohort
  // to decide whether a row needs placing, and that runs on the MATCHED-existing branch
  // which the new dry-run test exercises.
  Cohort: {
    findOne: (...a: unknown[]) => cohortFindOne(...a),
    findByPk: async () => ({ id: 'coh-1', name: 'Paid Cohort' }),
    increment: async () => undefined,
  },
  Campaign: {},
  // The deposit path's DRY-RUN branch checks credit existence via the model instead of
  // writing, so a preview needs this even though it writes nothing.
  AccountCredit: { findOne: async () => null },
  // `findAll` added 2026-10-25, when the welcome moved onto the shared
  // `sendPortalWelcome`. That module checks whether this address was already
  // welcomed and FAILS CLOSED when it cannot tell, so a missing `findAll` made the
  // guard refuse and this suite's "pre-existing sends intact" assertion saw zero
  // sends. Empty list = nobody welcomed yet, which is what this test assumes.
  CommunicationLog: { create: async () => ({}), findAll: async () => [] },
}));

/**
 * The /enroll path DOES send, by design and long before T205: a training welcome with
 * `delivery_mode: 'live'` and a GHL push. Both are mocked here, so this suite reaches no
 * real recipient.
 *
 * CORRECTED AFTER VERIFICATION. Attempt 1 asserted `not.toHaveBeenCalled()` on both, and
 * that was wrong twice over. The GHL spy was named `syncLeadToGhl` while `pushLeadToGhl`
 * imports **`syncNewLeadToGhl`** (`enrollmentService.ts:15`), so the spy sat off the call
 * path and the assertion could never fail. And the welcome assertion passed only because
 * the fixture's enrollment had no `update`, so `enrollment.update(...)` threw at
 * `enrollmentService.ts:402` BEFORE the send at `:407` - the path never reached the send,
 * which is not what 'it stayed quiet' means.
 *
 * Both are now mocked under the names the code imports, the fixture reaches them, and the
 * assertion is the true one: these pre-existing sends STILL HAPPEN, which proves T205 did
 * not silently disable them. Whether T205's own addition sends is a question about the
 * bridge, answered behaviourally in `explorerProfileAtRegistration.test.ts`.
 */
const sendTrainingWelcome = jest.fn().mockResolvedValue({ ok: true });
jest.mock('../../emailService', () => ({ sendTrainingWelcome: (...a: unknown[]) => sendTrainingWelcome(...a) }));
const syncNewLeadToGhl = jest.fn().mockResolvedValue(undefined);
jest.mock('../../ghlService', () => ({ syncNewLeadToGhl: (...a: unknown[]) => syncNewLeadToGhl(...a) }));

const grantCredit = jest.fn().mockResolvedValue({ granted: true, alreadyPresent: false });
jest.mock('../../accountCreditService', () => ({ grantCredit: (...a: unknown[]) => grantCredit(...a) }));
jest.mock('../../subscriptionService', () => ({ isNonPayingCohortName: () => false }));

jest.mock('../../../config/env', () => ({ env: { jwtSecret: 't', databaseUrl: 'postgres://u:p@localhost:5432/t' } }));
jest.mock('../../participantService', () => ({
  signParticipantJwt: () => 'jwt',
  pickBestEnrollment: (rows: unknown[]) => rows[0] ?? null,
}));
jest.mock('../../reese/reeseWelcomeService', () => ({ maybeSendWelcomes: jest.fn() }), { virtual: true });

import { createFreeAccount } from '../../freeSignupService';
import { createExplorerEnrollment } from '../../enrollmentService';
import { reconcileOpenHousePayer } from '../../openHouseCreditService';

/**
 * Phase 2 T205 — all THREE registration paths reach the profile bridge.
 *
 * The plan names them individually on purpose, because "the other paths are handled
 * elsewhere" is how T202b failed twice:
 *   1. `freeSignupService`        — the portal free signup
 *   2. `enrollmentService`        — the `/enroll` page (createExplorerEnrollment)
 *   3. `openHouseCreditService`   — the $50 Open House seat deposit
 *
 * WHAT THESE THREE ARE NOT. An earlier version of this docblock asserted that this list
 * was the identical set to T203's learner-semantics writer allow-list, and that the two
 * were therefore coupled so neither could drift without the other failing. Both halves
 * were false. Worse, the correction reached the commit message and the session log while
 * this file went on shipping the claim - which is its own lesson: a retraction that does
 * not reach the artifact is not a retraction.
 *
 * The tripwire's set is `{freeAccountRegistration (canonical), enrollmentService,
 * openHouseCreditService}` (`learnerWriterTripwire.test.ts:60-64`). These bridge call sites
 * are `{freeSignupService, enrollmentService, openHouseCreditService}`. They differ in one
 * entry, for a sound reason - the tripwire names the service that DECIDES the two columns,
 * this list names the service that REGISTERS someone - and the portal path is still fully
 * covered because `freeSignupService` is the only caller of `resolveFreeAccount`.
 *
 * But **nothing couples the two lists**. A fourth registration path could be added, bridge
 * nothing, and no tripwire would notice. That is a real gap, stated here rather than
 * papered over with a claim of coupling that does not exist.
 */
describe('T205 — path 1: the portal free signup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bridge.mockResolvedValue(true);
    enrollmentFindAll.mockResolvedValue([]);
    enrollmentCreate.mockImplementation(async (attrs: any) => ({ id: 'enr-1', ...attrs }));
    leadFindOrCreate.mockResolvedValue([{ id: 1 }, true]);
  });

  it('bridges the profile, tagged with its entry point', async () => {
    await createFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });
    expect(bridge).toHaveBeenCalledWith('enr-1', 'portal_free_signup');
  });

  it('bridges AFTER lead capture, because the bridge resolves lead_id by email', async () => {
    // Ordering is load-bearing, not cosmetic: called first, the profile would be written
    // with `lead_id: null` and the link left for the nightly repair to acquire — exactly
    // the behaviour this task removes.
    const order: string[] = [];
    leadFindOrCreate.mockImplementation(async () => { order.push('lead'); return [{ id: 1 }, true]; });
    bridge.mockImplementation(async () => { order.push('bridge'); return true; });

    await createFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });

    expect(order).toEqual(['lead', 'bridge']);
  });

  it('does NOT bridge a standard account — an org teammate has entered no journey', async () => {
    // The conscription guard, at the profile layer. Giving a non-learner a journey profile
    // would make them visible to Explorer Growth, which is the precise thing the required
    // `programme` argument exists to prevent.
    await createFreeAccount({ full_name: 'Dee', email: 'dee@acme.com', programme: 'standard' });
    expect(bridge).not.toHaveBeenCalled();
  });

  it('does not bridge a REUSED non-learner row either', async () => {
    // Keyed on the resolved row, not on the input: a standard/guest row reused by a
    // learner request is only upgraded when `needsProgrammeUpgrade` allows it, and when it
    // is not, there is no Explorer to bridge.
    enrollmentFindAll.mockResolvedValue([
      { id: 'enr-old', email: 'dee@acme.com', full_name: 'Dee', tier: 'member',
        enrollment_type: 'standard', payment_status: 'pending', update: jest.fn() },
    ]);

    await createFreeAccount({ full_name: 'Dee', email: 'dee@acme.com', programme: 'learner' });

    expect(bridge).not.toHaveBeenCalled();
  });

  it('a bridge failure does not fail the signup', async () => {
    bridge.mockResolvedValue(false);
    const res = await createFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });
    expect(res.jwt).toBe('jwt');
  });

  it('writes the entry timestamp on the new learner row, and never on a standard one', async () => {
    await createFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });
    expect(enrollmentCreate.mock.calls[0][0].explorer_entered_at).toBeInstanceOf(Date);

    jest.clearAllMocks();
    enrollmentFindAll.mockResolvedValue([]);
    enrollmentCreate.mockImplementation(async (attrs: any) => ({ id: 'enr-2', ...attrs }));
    leadFindOrCreate.mockResolvedValue([{ id: 1 }, true]);
    await createFreeAccount({ full_name: 'Dee', email: 'dee@acme.com', programme: 'standard' });
    expect(enrollmentCreate.mock.calls[0][0].explorer_entered_at).toBeNull();
  });
});

describe('T205 — path 2: the /enroll page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bridge.mockResolvedValue(true);
    cohortFindOne.mockResolvedValue({ id: 'coh-1', name: 'Explorer', seats_taken: 0 });
    enrollmentFindAll.mockResolvedValue([]);
    // `update` is REQUIRED on this fixture: `createExplorerEnrollment` writes a portal
    // token via `enrollment.update(...)` before sending, and without it the path throws
    // there and never reaches the send - exactly how attempt 1's assertion passed for the
    // wrong reason.
    enrollmentCreate.mockImplementation(async (attrs: any) => ({ id: 'enr-9', ...attrs, update: jest.fn() }));
    leadFindOrCreate.mockResolvedValue([{ id: 5 }, true]);
  });

  it('bridges the profile, tagged with its entry point', async () => {
    await createExplorerEnrollment({ name: 'Maya', email: 'maya@example.com' });
    expect(bridge).toHaveBeenCalledWith('enr-9', 'enroll_explorer');
  });

  it('writes the entry timestamp at registration', async () => {
    await createExplorerEnrollment({ name: 'Maya', email: 'maya@example.com' });
    expect(enrollmentCreate.mock.calls[0][0].explorer_entered_at).toBeInstanceOf(Date);
  });

  it('leaves this path PRE-EXISTING sends intact, so T205 did not silently disable them', async () => {
    await createExplorerEnrollment({ name: 'Maya', email: 'maya@example.com' });

    // `pushLeadToGhl(lead)` is fire-and-forget (not awaited, `enrollmentService.ts:372`),
    // so without flushing the microtask queue this assertion leans on scheduling order. It
    // was green three runs in a row, which is exactly how a flake hides.
    await new Promise((resolve) => setImmediate(resolve));

    // Both under the names the production code imports, and both reached. Had T205's
    // insertion landed in the wrong place - inside the lead-capture try/catch, or before
    // it - one of these would stop being called and this test fails.
    expect(syncNewLeadToGhl).toHaveBeenCalledTimes(1);
    expect(sendTrainingWelcome).toHaveBeenCalledTimes(1);
    expect(sendTrainingWelcome.mock.calls[0][0]).toMatchObject({ to: 'maya@example.com' });
  });

  it('bridges AFTER the lead capture here too, so lead_id can resolve', async () => {
    const order: string[] = [];
    leadFindOrCreate.mockImplementation(async () => { order.push('lead'); return [{ id: 5 }, true]; });
    bridge.mockImplementation(async () => { order.push('bridge'); return true; });

    await createExplorerEnrollment({ name: 'Maya', email: 'maya@example.com' });

    expect(order).toEqual(['lead', 'bridge']);
  });
});

describe('T205 — path 3: the $50 Open House deposit', () => {
  const payer = { email: 'maya@example.com', name: 'Maya', amountCents: 5000, sourceEventId: 'evt-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    bridge.mockResolvedValue(true);
    enrollmentFindAll.mockResolvedValue([]);
    enrollmentFindOne.mockResolvedValue(null);
    enrollmentCreate.mockImplementation(async (attrs: any) => ({ id: 'enr-dep', ...attrs, update: jest.fn() }));
  });

  it('bridges the profile, tagged with its entry point', async () => {
    await reconcileOpenHousePayer(payer as any, { cohort: null, grantedBy: 'test', apply: true });
    expect(bridge).toHaveBeenCalledWith('enr-dep', 'open_house_deposit');
  });

  it('writes the entry timestamp, honouring the injected clock', async () => {
    const nowMs = Date.parse('2026-10-06T12:00:00Z');
    await reconcileOpenHousePayer(payer as any, { cohort: null, grantedBy: 'test', apply: true, nowMs });
    expect(enrollmentCreate.mock.calls[0][0].explorer_entered_at).toEqual(new Date(nowMs));
  });

  it('writes NOTHING on a dry run when there is nobody to match', async () => {
    await reconcileOpenHousePayer(payer as any, { cohort: null, grantedBy: 'test', apply: false });
    expect(bridge).not.toHaveBeenCalled();
    expect(enrollmentCreate).not.toHaveBeenCalled();
  });

  /**
   * THE CASE THAT ACTUALLY PROTECTS THE GUARD, added after verification.
   *
   * The test above leaves `enrollment` null, so `if (opts.apply && enrollment)` is false
   * either way - deleting `opts.apply` from that condition passed every test in the suite.
   * The guard is only exercised when a dry run HAS a matched enrollment, which is exactly
   * the preview that would otherwise write a profile row.
   */
  it('writes NOTHING on a dry run that MATCHES an existing enrollment', async () => {
    const existing = { id: 'enr-existing', cohort_id: 'coh-1', update: jest.fn() };
    enrollmentFindAll.mockResolvedValue([existing]);
    enrollmentFindOne.mockResolvedValue(existing);

    const out = await reconcileOpenHousePayer(payer as any, { cohort: null, grantedBy: 'test', apply: false });

    expect(out.enrollmentId).toBe('enr-existing');   // it really did match
    expect(bridge).not.toHaveBeenCalled();           // and still wrote nothing
    expect(existing.update).not.toHaveBeenCalled();
  });
});
