/**
 * 2026 alumni offer: 50% off the ANNUAL membership for anyone labeled alumni or
 * with a CCPP placement date, through 31 Dec 2026 (Central). Covers the pure
 * rules, the eligibility/grant flow (deps stubbed: no DB, no CCPP), and the
 * ledger treating the credit as annual-only and expiring at year end.
 */
import {
  ALUMNI_REASON, ALUMNI_CENTS, ALUMNI_OFFER_END_MS, ALUMNI_SETTLE_GRACE_MS,
  isAlumniOfferOpen, isAlumniCreditExpired, leadMarksAlumni, alumniSourceId,
} from '../alumniDiscountRules';
import { ensureAlumniCredit, AlumniDiscountDeps, HALF_YEAR_CREDIT_REASONS } from '../alumniDiscountService';
import { availableCreditRows, creditUsableOnPlan, ANNUAL_ONLY_CREDIT_REASONS } from '../accountCreditService';
import { AccountCredit } from '../../models';

jest.mock('../../models', () => ({
  AccountCredit: { findAll: jest.fn(), findOne: jest.fn(), findOrCreate: jest.fn(), update: jest.fn() },
  Enrollment: { findByPk: jest.fn() }, Cohort: {},
}));
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

const NOV_20 = Date.parse('2026-11-20T17:00:00Z');
const DEC_31_LATE_CT = Date.parse('2027-01-01T05:59:00Z'); // 11:59 PM CST on 31 Dec
const JAN_1_CT = Date.parse('2027-01-01T06:00:00Z');       // midnight CST

function deps(over: Partial<AlumniDiscountDeps> = {}): AlumniDiscountDeps & { grant: jest.Mock } {
  return {
    findEmail: jest.fn(async () => ' Alum@Example.com '),
    countBlockers: jest.fn(async () => 0),
    findLeadSignals: jest.fn(async () => []),
    findCcppPlacementDate: jest.fn(async () => null),
    grant: jest.fn(async () => ({ granted: true, credit: {} as any })),
    ...over,
  } as any;
}

beforeEach(() => jest.clearAllMocks());

describe('alumni offer rules', () => {
  it('is 50% of the $1,788 year', () => {
    expect(ALUMNI_CENTS).toBe(89400);
  });

  it('is open through 11:59 PM CT on 31 Dec 2026 and closed at midnight CT', () => {
    expect(isAlumniOfferOpen(NOV_20)).toBe(true);
    expect(isAlumniOfferOpen(DEC_31_LATE_CT)).toBe(true);
    expect(isAlumniOfferOpen(JAN_1_CT)).toBe(false);
    expect(ALUMNI_OFFER_END_MS).toBe(JAN_1_CT);
  });

  it('an alumni credit expires at year end, with the settle grace; other credits never do', () => {
    expect(isAlumniCreditExpired(ALUMNI_REASON, DEC_31_LATE_CT)).toBe(false);
    expect(isAlumniCreditExpired(ALUMNI_REASON, JAN_1_CT)).toBe(true);
    expect(isAlumniCreditExpired(ALUMNI_REASON, JAN_1_CT, ALUMNI_SETTLE_GRACE_MS)).toBe(false);
    expect(isAlumniCreditExpired('open_house_deposit', JAN_1_CT + 1e10)).toBe(false);
  });

  it('a lead marks alumni by label, by source, or by a placement date', () => {
    expect(leadMarksAlumni({ lead_source_type: 'alumni' })).toBe(true);
    expect(leadMarksAlumni({ lead_source_type: 'ALUMNI' })).toBe(true);
    expect(leadMarksAlumni({ source: 'ccpp_alumni' })).toBe(true);
    expect(leadMarksAlumni({ lead_source_type: 'organic', hired_date: '2021-04-01' })).toBe(true);
    expect(leadMarksAlumni({ lead_source_type: 'organic', source: 'website', hired_date: '  ' })).toBe(false);
    expect(leadMarksAlumni(null)).toBe(false);
  });

  it('one idempotency key per enrollment', () => {
    expect(alumniSourceId('e-1')).toBe('ALUMNI2026-e-1');
  });
});

describe('ensureAlumniCredit', () => {
  it('grants $894 annual-only credit to a labeled alum without calling CCPP', async () => {
    const d = deps({ findLeadSignals: jest.fn(async () => [{ lead_source_type: 'alumni' }]) });
    const r = await ensureAlumniCredit('e-1', NOV_20, d);
    expect(r).toEqual({ granted: true, reason: 'granted', evidence: 'lead_label' });
    expect(d.findLeadSignals).toHaveBeenCalledWith('alum@example.com');
    expect(d.findCcppPlacementDate).not.toHaveBeenCalled();
    expect(d.grant).toHaveBeenCalledWith(expect.objectContaining({
      enrollmentId: 'e-1', amountCents: 89400, reason: ALUMNI_REASON, sourceEventId: 'ALUMNI2026-e-1',
    }));
  });

  it('grants on a CCPP placement date when no lead says alumni', async () => {
    const d = deps({ findCcppPlacementDate: jest.fn(async () => new Date('2020-06-01')) });
    const r = await ensureAlumniCredit('e-1', NOV_20, d);
    expect(r.evidence).toBe('ccpp_placement');
    expect(d.grant).toHaveBeenCalledTimes(1);
  });

  it('does not grant to a non-alum', async () => {
    const d = deps({ findLeadSignals: jest.fn(async () => [{ lead_source_type: 'organic', source: 'website' }]) });
    expect(await ensureAlumniCredit('e-1', NOV_20, d)).toEqual({ granted: false, reason: 'not_alumni' });
    expect(d.grant).not.toHaveBeenCalled();
  });

  it('does nothing after the offer closes (no lookups at all)', async () => {
    const d = deps({ findLeadSignals: jest.fn(async () => [{ lead_source_type: 'alumni' }]) });
    expect(await ensureAlumniCredit('e-1', JAN_1_CT, d)).toEqual({ granted: false, reason: 'offer_closed' });
    expect(d.findEmail).not.toHaveBeenCalled();
    expect(d.grant).not.toHaveBeenCalled();
  });

  it('never stacks on a scholarship, flash credit, earlier alumni credit, or an active annual plan', async () => {
    const d = deps({ countBlockers: jest.fn(async () => 1), findLeadSignals: jest.fn(async () => [{ lead_source_type: 'alumni' }]) });
    expect(await ensureAlumniCredit('e-1', NOV_20, d)).toEqual({ granted: false, reason: 'blocked' });
    expect(d.grant).not.toHaveBeenCalled();
    expect(HALF_YEAR_CREDIT_REASONS).toEqual(expect.arrayContaining(['open_house_scholarship_annual', 'open_house_flash_annual', ALUMNI_REASON]));
  });

  it('a CCPP outage or timeout is logged and treated as not-alumni, never thrown', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = deps({ findCcppPlacementDate: jest.fn(async () => { throw Object.assign(new Error('slow'), { name: 'TimeoutError' }); }) });
    expect(await ensureAlumniCredit('e-1', NOV_20, d)).toEqual({ granted: false, reason: 'not_alumni' });
    expect(String(err.mock.calls[0][0])).toContain('"error_class":"TimeoutError"');
    err.mockRestore();
  });

  it('is idempotent: a second call reports already_granted', async () => {
    const d = deps({
      findLeadSignals: jest.fn(async () => [{ source: 'ccpp_alumni' }]),
      grant: jest.fn(async () => ({ granted: false, credit: {} as any })),
    });
    expect(await ensureAlumniCredit('e-1', NOV_20, d)).toEqual({ granted: false, reason: 'already_granted', evidence: 'lead_label' });
  });

  it('skips an enrollment with no email', async () => {
    const d = deps({ findEmail: jest.fn(async () => null) });
    expect(await ensureAlumniCredit('e-1', NOV_20, d)).toEqual({ granted: false, reason: 'no_email' });
  });
});

describe('the ledger treats the alumni credit as annual-only and expiring', () => {
  const alumni = { id: 'a', amount_cents: ALUMNI_CENTS, reason: ALUMNI_REASON, source_event_id: 'ALUMNI2026-e-1' };
  const deposit = { id: 'd', amount_cents: 5000, reason: 'open_house_deposit', source_event_id: 'x' };

  it('is annual-only', () => {
    expect(ANNUAL_ONLY_CREDIT_REASONS).toContain(ALUMNI_REASON);
    expect(creditUsableOnPlan(ALUMNI_REASON, 'annual')).toBe(true);
    expect(creditUsableOnPlan(ALUMNI_REASON, 'monthly')).toBe(false);
  });

  it('drops out of available credit after 31 Dec 2026 CT, but the deposit stays', async () => {
    (AccountCredit.findAll as jest.Mock).mockResolvedValue([alumni, deposit]);
    expect((await availableCreditRows('e-1', 'annual', DEC_31_LATE_CT)).map((r) => r.id)).toEqual(['a', 'd']);
    expect((await availableCreditRows('e-1', 'annual', JAN_1_CT)).map((r) => r.id)).toEqual(['d']);
    expect((await availableCreditRows('e-1', 'monthly', NOV_20)).map((r) => r.id)).toEqual(['d']);
  });
});
