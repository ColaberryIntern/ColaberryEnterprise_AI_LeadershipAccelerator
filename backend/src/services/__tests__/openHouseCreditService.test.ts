import { reconcileOpenHousePayer, grantOpenHouseCreditsBatch, resolveDepositCohort } from '../openHouseCreditService';
import { Enrollment, Cohort, AccountCredit } from '../../models';
import { grantCredit } from '../accountCreditService';

jest.mock('../../models', () => ({
  Enrollment: { findAll: jest.fn(), create: jest.fn() },
  Cohort: { findByPk: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
  AccountCredit: { findOne: jest.fn() },
}));
jest.mock('../accountCreditService', () => ({ grantCredit: jest.fn() }));
jest.mock('../subscriptionService', () => ({
  isNonPayingCohortName: (n: string) => /explorer|prospect|demo|test|sandbox/i.test(n || ''),
}));

const JULY = { id: 'c-july', name: 'Cohort - July 2026', start_date: '2026-07-23' };
const EXPLORER = { id: 'c-explorer', name: 'Explorer — Prospects', start_date: '2026-01-01' };

describe('openHouseCreditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (grantCredit as jest.Mock).mockResolvedValue({ granted: true, credit: { id: 'cr1' } });
    (Cohort.findByPk as jest.Mock).mockImplementation(async (id: string) => ({ 'c-july': JULY, 'c-explorer': EXPLORER }[id] || null));
    (AccountCredit.findOne as jest.Mock).mockResolvedValue(null);
  });

  const payer = { email: 'Payer@Example.com', name: 'Pat Payer', sourceEventId: 'OH716-1' };

  describe('reconcileOpenHousePayer (apply)', () => {
    it('grants credit + reserves the July seat for a brand-new payer', async () => {
      (Enrollment.findAll as jest.Mock).mockResolvedValue([]);
      (Enrollment.create as jest.Mock).mockResolvedValue({ id: 'e-new' });
      const o = await reconcileOpenHousePayer(payer, { cohort: JULY as any, grantedBy: 'oh', apply: true });
      expect(o.matched).toBe('created');
      expect(o.cohortSet).toBe(true);
      expect(o.creditGranted).toBe(true);
      // Created as an Explorer (deposit ≠ subscription) placed in the paid cohort, lowercased email.
      const created = (Enrollment.create as jest.Mock).mock.calls[0][0];
      expect(created.email).toBe('payer@example.com');
      expect(created.cohort_id).toBe('c-july');
      expect(created.enrollment_type).toBe('explorer');
      expect((grantCredit as jest.Mock).mock.calls[0][0]).toMatchObject({ enrollmentId: 'e-new', amountCents: 5000, sourceEventId: 'OH716-1' });
    });

    it('places an existing Explorer-bucket enrollment into July + grants credit', async () => {
      const enr = { id: 'e1', cohort_id: 'c-explorer', update: jest.fn() };
      (Enrollment.findAll as jest.Mock).mockResolvedValue([enr]);
      const o = await reconcileOpenHousePayer(payer, { cohort: JULY as any, grantedBy: 'oh', apply: true });
      expect(o.matched).toBe('existing');
      expect(o.cohortSet).toBe(true);
      expect(enr.update).toHaveBeenCalledWith({ cohort_id: 'c-july' });
      expect(o.creditGranted).toBe(true);
    });

    it('leaves an enrollment already in a real paid cohort where it is', async () => {
      const enr = { id: 'e1', cohort_id: 'c-july', update: jest.fn() };
      (Enrollment.findAll as jest.Mock).mockResolvedValue([enr]);
      const o = await reconcileOpenHousePayer(payer, { cohort: JULY as any, grantedBy: 'oh', apply: true });
      expect(o.cohortSet).toBe(false);
      expect(enr.update).not.toHaveBeenCalled();
      expect(o.creditGranted).toBe(true);
    });

    it('picks the TARGET-cohort enrollment when a payer has duplicates across cohorts', async () => {
      // Payer has a stale April row (newer) AND the July row — credit must land on July.
      const april = { id: 'e-apr', cohort_id: 'c-april', update: jest.fn() };
      const july = { id: 'e-jul', cohort_id: 'c-july', update: jest.fn() };
      (Enrollment.findAll as jest.Mock).mockResolvedValue([april, july]); // newest-first order
      const o = await reconcileOpenHousePayer(payer, { cohort: JULY as any, grantedBy: 'oh', apply: true });
      expect(o.enrollmentId).toBe('e-jul');
      expect((grantCredit as jest.Mock).mock.calls[0][0].enrollmentId).toBe('e-jul');
      expect(o.note).toMatch(/2 enrollments matched/);
      expect(o.cohortSet).toBe(false); // already the target cohort
    });

    it('reports credit already present (idempotent grant)', async () => {
      (Enrollment.findAll as jest.Mock).mockResolvedValue([{ id: 'e1', cohort_id: 'c-july', update: jest.fn() }]);
      (grantCredit as jest.Mock).mockResolvedValue({ granted: false, credit: { id: 'cr1' } });
      const o = await reconcileOpenHousePayer(payer, { cohort: JULY as any, grantedBy: 'oh', apply: true });
      expect(o.creditGranted).toBe(false);
      expect(o.creditAlreadyPresent).toBe(true);
    });

    it('skips a payer with no email', async () => {
      const o = await reconcileOpenHousePayer({ email: '', sourceEventId: 'OH716-x' }, { cohort: JULY as any, grantedBy: 'oh', apply: true });
      expect(o.matched).toBe('skipped');
      expect(Enrollment.findAll).not.toHaveBeenCalled();
      expect(grantCredit).not.toHaveBeenCalled();
    });
  });

  describe('reconcileOpenHousePayer (dry run)', () => {
    it('writes nothing but predicts the outcome', async () => {
      (Enrollment.findAll as jest.Mock).mockResolvedValue([]);
      const o = await reconcileOpenHousePayer(payer, { cohort: JULY as any, grantedBy: 'oh', apply: false });
      expect(o.matched).toBe('created');
      expect(o.cohortSet).toBe(true);
      expect(o.creditGranted).toBe(true);       // would grant (none exists)
      expect(Enrollment.create).not.toHaveBeenCalled();
      expect(grantCredit).not.toHaveBeenCalled();
    });

    it('dry run detects an already-present credit', async () => {
      (Enrollment.findAll as jest.Mock).mockResolvedValue([{ id: 'e1', cohort_id: 'c-july', update: jest.fn() }]);
      (AccountCredit.findOne as jest.Mock).mockResolvedValue({ id: 'existing' });
      const o = await reconcileOpenHousePayer(payer, { cohort: JULY as any, grantedBy: 'oh', apply: false });
      expect(o.creditAlreadyPresent).toBe(true);
      expect(o.creditGranted).toBe(false);
    });
  });

  describe('grantOpenHouseCreditsBatch', () => {
    it('summarizes across payers', async () => {
      (Cohort.findOne as jest.Mock).mockResolvedValue(JULY); // resolveDepositCohort by name
      (Enrollment.findAll as jest.Mock)
        .mockResolvedValueOnce([{ id: 'e1', cohort_id: 'c-july', update: jest.fn() }])   // existing, in July
        .mockResolvedValueOnce([]);                                                       // new
      (Enrollment.create as jest.Mock).mockResolvedValue({ id: 'e2' });
      const summary = await grantOpenHouseCreditsBatch(
        [{ email: 'a@x.com', sourceEventId: 'OH716-a' }, { email: 'b@x.com', sourceEventId: 'OH716-b' }],
        { grantedBy: 'oh', apply: true },
      );
      expect(summary.total).toBe(2);
      expect(summary.matched_existing).toBe(1);
      expect(summary.created).toBe(1);
      expect(summary.credits_granted).toBe(2);
      expect(summary.credited_cents).toBe(10000);
    });

    it('sums ACTUAL amounts when a payer paid more than $50 (full-year payer)', async () => {
      (Cohort.findOne as jest.Mock).mockResolvedValue(JULY);
      (Enrollment.findAll as jest.Mock).mockResolvedValue([{ id: 'e1', cohort_id: 'c-july', update: jest.fn() }]);
      const summary = await grantOpenHouseCreditsBatch(
        [
          { email: 'a@x.com', sourceEventId: 'ps-1', amountCents: 5000 },     // $50 deposit
          { email: 'a@x.com', sourceEventId: 'ps-2', amountCents: 178800 },   // + $1,788 annual
        ],
        { grantedBy: 'oh', apply: true },
      );
      expect(summary.credits_granted).toBe(2);
      expect(summary.credited_cents).toBe(183800); // $1,838, not 2×$50
      expect(summary.outcomes[1].amountCents).toBe(178800);
    });
  });

  describe('resolveDepositCohort', () => {
    it('falls back to the canonical July cohort by name', async () => {
      delete process.env.SUBSCRIPTION_TARGET_COHORT_ID;
      (Cohort.findOne as jest.Mock).mockResolvedValue(JULY);
      expect(await resolveDepositCohort()).toBe(JULY);
    });

    it('honors the env override', async () => {
      process.env.SUBSCRIPTION_TARGET_COHORT_ID = 'c-july';
      const r = await resolveDepositCohort();
      expect(r).toEqual(JULY);
      delete process.env.SUBSCRIPTION_TARGET_COHORT_ID;
    });
  });
});
