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
  Cohort: { findOne: (...a: unknown[]) => cohortFindOne(...a) },
  Campaign: {},
  // The deposit path's DRY-RUN branch checks credit existence via the model instead of
  // writing, so a preview needs this even though it writes nothing.
  AccountCredit: { findOne: async () => null },
  CommunicationLog: { create: async () => ({}) },
}));

// NOTHING SENDS. The /enroll path calls `sendTrainingWelcome` with
// `delivery_mode: 'live'` and pushes to GHL, so both are replaced by spies that this
// suite then ASSERTS were never called. A test that merely stubs a mailer proves the
// mailer was stubbed; asserting it was not called is what proves the path stayed quiet.
const sendTrainingWelcome = jest.fn();
jest.mock('../../emailService', () => ({ sendTrainingWelcome: (...a: unknown[]) => sendTrainingWelcome(...a) }));
const syncLeadToGhl = jest.fn();
jest.mock('../../ghlService', () => ({ syncLeadToGhl: (...a: unknown[]) => syncLeadToGhl(...a) }));

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
 * elsewhere" is how T202b failed twice. They are the same three files T203's tripwire
 * derives as the learner-semantics writer set, so the two lists cannot drift apart
 * without that tripwire failing:
 *   1. `freeSignupService`        — the portal free signup
 *   2. `enrollmentService`        — the `/enroll` page (createExplorerEnrollment)
 *   3. `openHouseCreditService`   — the $50 Open House seat deposit
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
    enrollmentCreate.mockImplementation(async (attrs: any) => ({ id: 'enr-9', ...attrs }));
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

  it('SENDS NOTHING while doing it', async () => {
    // This path really does send in production — `sendTrainingWelcome` with
    // `delivery_mode: 'live'` and a GHL push. T205 adds a call to it, so the no-send
    // property is re-asserted here rather than assumed to have survived.
    await createExplorerEnrollment({ name: 'Maya', email: 'maya@example.com' });
    expect(sendTrainingWelcome).not.toHaveBeenCalled();
    expect(syncLeadToGhl).not.toHaveBeenCalled();
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

  it('writes NOTHING on a dry run — a preview must stay side-effect free', async () => {
    // This service's contract is that `apply: false` previews without touching anything,
    // and a profile row is a side effect like any other.
    await reconcileOpenHousePayer(payer as any, { cohort: null, grantedBy: 'test', apply: false });
    expect(bridge).not.toHaveBeenCalled();
    expect(enrollmentCreate).not.toHaveBeenCalled();
  });
});
