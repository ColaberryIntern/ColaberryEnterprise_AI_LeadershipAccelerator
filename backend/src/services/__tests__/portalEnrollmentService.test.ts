import { getEnrollmentView, selectCohort } from '../portalEnrollmentService';
import { Enrollment, Cohort } from '../../models';

jest.mock('../../config/env', () => ({ env: { paysimpleApiUser: 'u', paysimpleApiKey: 'k', paymentMode: 'test' } }));
jest.mock('../../models', () => ({
  Enrollment: { findByPk: jest.fn() },
  Cohort: { findByPk: jest.fn(), findAll: jest.fn() },
  Subscription: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
}));
jest.mock('../paysimpleService', () => ({ findOrCreateCustomer: jest.fn(), createPaymentLink: jest.fn() }));
jest.mock('../openHouseService', () => ({ isDemoCohortName: (n: string) => /demo|test|sandbox/i.test(n || '') }));

const NOW = new Date(Date.UTC(2026, 6, 15, 12)); // July 15 2026
const JULY = { id: 'c-july', name: 'Cohort - July 2026', start_date: '2026-07-23', core_day: 'Thursday', core_time: '1:00–3:00 PM EST', max_seats: 30, seats_taken: 12, status: 'open' };
const NOV = { id: 'c-nov', name: 'Cohort - November 2026', start_date: '2026-11-05', core_day: 'Thursday', core_time: '1:00–3:00 PM EST', max_seats: 30, seats_taken: 0, status: 'open' };
const EXPLORER = { id: 'c-explorer', name: 'Explorer — Prospects', start_date: '2026-01-01', core_day: 'Self-paced', core_time: 'Anytime', max_seats: 100000, seats_taken: 5, status: 'open' };

const cohortsById: Record<string, any> = { 'c-july': JULY, 'c-nov': NOV, 'c-explorer': EXPLORER };

describe('portalEnrollmentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Cohort.findByPk as jest.Mock).mockImplementation(async (id: string) => cohortsById[id] || null);
    (Cohort.findAll as jest.Mock).mockResolvedValue([EXPLORER, JULY, NOV]);
  });

  describe('getEnrollmentView', () => {
    it('returns null when the enrollment does not exist', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(null);
      expect(await getEnrollmentView('nope', NOW)).toBeNull();
    });

    it('a fresh signup is not_enrolled and defaults to the soonest class date (July 23)', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'e1', cohort_id: null, payment_status: 'pending' });
      const v = await getEnrollmentView('e1', NOW);
      expect(v!.status).toBe('not_enrolled');
      expect(v!.cohorts.map((c) => c.id)).toEqual(['c-july', 'c-nov']); // Explorer bucket filtered out
      expect(v!.default_cohort_id).toBe('c-july');
      expect(v!.cohorts[0].seats_left).toBe(18);
    });

    it('the Explorer holding bucket does not count as enrolled', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'e1', cohort_id: 'c-explorer', payment_status: 'pending' });
      const v = await getEnrollmentView('e1', NOW);
      expect(v!.status).toBe('not_enrolled');
      expect(v!.enrolled_cohort).toBeNull();
      expect(v!.default_cohort_id).toBe('c-july');
    });

    it('a student with a real cohort is enrolled (unpaid)', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'e1', cohort_id: 'c-july', payment_status: 'pending' });
      const v = await getEnrollmentView('e1', NOW);
      expect(v!.status).toBe('enrolled');
      expect(v!.enrolled_cohort?.start_date).toBe('2026-07-23');
      expect(v!.paid).toBe(false);
      expect(v!.default_cohort_id).toBe('c-july');
    });

    it('a paid student is enrolled_paid', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'e1', cohort_id: 'c-july', payment_status: 'paid' });
      const v = await getEnrollmentView('e1', NOW);
      expect(v!.status).toBe('enrolled_paid');
      expect(v!.paid).toBe(true);
    });

    it("the student's own cohort stays visible even after it has started", async () => {
      const later = new Date(Date.UTC(2026, 7, 1)); // Aug 1 — July class already started
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ id: 'e1', cohort_id: 'c-july', payment_status: 'paid' });
      const v = await getEnrollmentView('e1', later);
      expect(v!.cohorts.map((c) => c.id)).toEqual(['c-july', 'c-nov']);
      expect(v!.status).toBe('enrolled_paid');
    });
  });

  describe('selectCohort', () => {
    const freshEnrollment = (over: Partial<any> = {}) => ({
      id: 'e1', cohort_id: null, payment_status: 'pending', update: jest.fn(), ...over,
    });

    it('404s when the enrollment is gone', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(null);
      expect(await selectCohort('nope', 'c-july', NOW)).toEqual({ ok: false, reason: 'enrollment_not_found' });
    });

    it('enrolls into an open upcoming cohort (happy path)', async () => {
      const e = freshEnrollment();
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(e);
      const r = await selectCohort('e1', 'c-july', NOW);
      expect(r.ok).toBe(true);
      expect((r as any).changed).toBe(true);
      expect(e.update).toHaveBeenCalledWith({ cohort_id: 'c-july' });
    });

    it('is idempotent — re-selecting the current cohort is a no-op success', async () => {
      const e = freshEnrollment({ cohort_id: 'c-july' });
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(e);
      const r = await selectCohort('e1', 'c-july', NOW);
      expect(r.ok).toBe(true);
      expect((r as any).changed).toBe(false);
      expect(e.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown cohort', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(freshEnrollment());
      expect(await selectCohort('e1', 'nope', NOW)).toEqual({ ok: false, reason: 'cohort_not_found' });
    });

    it('rejects a closed cohort', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(freshEnrollment());
      (Cohort.findByPk as jest.Mock).mockResolvedValue({ ...JULY, status: 'closed' });
      expect(await selectCohort('e1', 'c-july', NOW)).toEqual({ ok: false, reason: 'cohort_closed' });
    });

    it('rejects the Explorer/prospect bucket as a class choice', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(freshEnrollment());
      expect(await selectCohort('e1', 'c-explorer', NOW)).toEqual({ ok: false, reason: 'cohort_not_selectable' });
    });

    it('rejects a cohort that already started', async () => {
      const later = new Date(Date.UTC(2026, 7, 1)); // Aug 1
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(freshEnrollment());
      expect(await selectCohort('e1', 'c-july', later)).toEqual({ ok: false, reason: 'cohort_started' });
    });

    it('locks the class date once the student has paid', async () => {
      const e = freshEnrollment({ cohort_id: 'c-july', payment_status: 'paid' });
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(e);
      const r = await selectCohort('e1', 'c-nov', NOW);
      expect(r).toEqual({ ok: false, reason: 'locked_after_payment' });
      expect(e.update).not.toHaveBeenCalled();
    });

    it('a paid student still stuck in the Explorer bucket CAN pick a real class', async () => {
      const e = freshEnrollment({ cohort_id: 'c-explorer', payment_status: 'paid' });
      (Enrollment.findByPk as jest.Mock).mockResolvedValue(e);
      const r = await selectCohort('e1', 'c-july', NOW);
      expect(r.ok).toBe(true);
      expect(e.update).toHaveBeenCalledWith({ cohort_id: 'c-july' });
    });
  });
});
