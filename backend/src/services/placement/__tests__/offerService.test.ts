// The offers' statements as an in-memory store that applies the same rules as the database (offerStore.ts; its SQL runs
// on Postgres in offerStore.integration.test.ts): client_key UNIQUE, one current version per group, one invoice per offer.
type Row = import('../offerStore').OfferRow;
const mockDb = { offers: [] as Row[], invoices: [] as Array<{ offer_id: string; fee_cents: number }>, n: 0 };
jest.mock('../offerStore', () => ({
  inTransaction: async <T>(fn: (t: unknown) => Promise<T>) => fn({}),
  byClientKey: async (key: string) => mockDb.offers.find((o) => o.client_key === key),
  lockCurrent: async (g: string) => mockDb.offers.find((o) => o.offer_group_id === g && !o.superseded_at),
  insertOffer: async (o: import('../offerStore').NewOffer) => {
    if (mockDb.offers.some((x) => x.client_key === o.clientKey)) throw Object.assign(new Error('Validation error'), { name: 'SequelizeUniqueConstraintError' });
    if (mockDb.offers.some((x) => x.offer_group_id === o.groupId && !x.superseded_at)) throw Object.assign(new Error('Validation error'), { name: 'SequelizeUniqueConstraintError' });
    mockDb.n += 1;
    const row = { id: `of-${mockDb.n}`, offer_group_id: o.groupId, version: o.version, superseded_at: null, client_key: o.clientKey, enrollment_id: o.enrollmentId,
      interview_id: o.interviewId, client_id: o.clientId, company: o.company, role: o.role, pay_basis: o.payBasis, salary_cents: o.salaryCents, hourly_rate_cents: o.hourlyRateCents,
      hours_per_week: o.hoursPerWeek, first_year_cents: o.firstYearCents, fee_rate_bp: o.feeRateBp, fee_cents: o.feeCents, start_date: o.startDate, respond_by: o.respondBy,
      fee_agreed_at: new Date(), agreed_by: o.agreedBy, agreement_text_version: o.agreementTextVersion, status: 'sent', decided_at: null, created_by: o.createdBy, created_at: new Date() } as Row;
    mockDb.offers.push(row);
    return row;
  },
  supersede: async (id: string) => { const r = mockDb.offers.find((o) => o.id === id); if (r && !r.superseded_at) r.superseded_at = new Date(); },
  setStatus: async (id: string, status: Row['status']) => { const r = mockDb.offers.find((o) => o.id === id) as Row; r.status = status; r.decided_at = new Date(); return r; },
  insertInvoice: async (o: Row) => {
    if (mockDb.invoices.some((i) => i.offer_id === o.id)) return false;
    mockDb.invoices.push({ offer_id: o.id, fee_cents: Number(o.fee_cents) });
    return true;
  },
}));
const mockSetting = jest.fn();
jest.mock('../../settingsService', () => ({ getSetting: (...a: unknown[]) => mockSetting(...a) }));

import { candidateOffer, createOffer, editOffer, feeRate, respondToOffer, withdrawOffer, type OfferInput } from '../offerService';

/** CP10.1 (kit F7): offers, versioned; accept makes one invoice record; the candidate never sees the fee. */
const K = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const input = (over: Partial<OfferInput> = {}): OfferInput => ({ enrollmentId: 'enr-ann', clientId: 'cl-1', company: 'Acme', role: 'AI Solutions Analyst',
  pay: { basis: 'yearly', salaryCents: 105_000_00 }, startDate: '2027-01-04', respondBy: '2026-11-27T23:00:00.000Z', feeAgreed: true,
  agreedBy: 'pat@acme.example', agreementTextVersion: 'f7-fee-2026-11', createdBy: 'client:cl-1', ...over });
const ok = <T extends { status: string }>(r: T) => { if (r.status !== 'ok') throw new Error(`expected ok, got ${r.status}`); return r as Extract<T, { status: 'ok' }>; };

beforeEach(() => {
  mockDb.offers = []; mockDb.invoices = []; mockDb.n = 0;
  mockSetting.mockReset().mockResolvedValue(null);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('create', () => {
  it('stores the fee computed now: $105,000 -> $115,500 at the default 1.1; the same click again is a replay', async () => {
    const a = ok(await createOffer(input(), K(1)));
    expect(a.offer).toMatchObject({ version: 1, status: 'sent', first_year_cents: 105_000_00, fee_cents: 115_500_00, fee_rate_bp: 11_000 });
    const b = ok(await createOffer(input(), K(1)));
    expect([b.replay, b.offer.id, mockDb.offers.length]).toEqual([true, a.offer.id, 1]);
  });
  it('stores who agreed and which agreement text they saw (kit F7: agreed_by, agreed_at, agreement_text_version)', async () => {
    const a = ok(await createOffer(input(), K(1))).offer;
    expect([a.agreed_by, a.agreement_text_version, a.fee_agreed_at instanceof Date]).toEqual(['pat@acme.example', 'f7-fee-2026-11', true]);
  });
  it('refuses an offer without agreed_by or agreement_text_version (missing, blank or too long); nothing stored', async () => {
    const noBy = { ...input() } as Partial<OfferInput>; delete noBy.agreedBy;
    const noVer = { ...input() } as Partial<OfferInput>; delete noVer.agreementTextVersion;
    expect(await createOffer(noBy as OfferInput, K(2))).toEqual({ status: 'invalid', reason: 'The offer must record who agreed to the fee and which agreement text they saw.' });
    expect(await createOffer(noVer as OfferInput, K(3))).toEqual({ status: 'invalid', reason: 'The offer must record who agreed to the fee and which agreement text they saw.' });
    expect(await createOffer(input({ agreedBy: '   ' }), K(4))).toMatchObject({ status: 'invalid' });
    expect(await createOffer(input({ agreementTextVersion: 'v'.repeat(41) }), K(5))).toMatchObject({ status: 'invalid' });
    expect(await createOffer(input({ agreedBy: 'a'.repeat(121) }), K(6))).toMatchObject({ status: 'invalid' });
    const v1 = ok(await createOffer(input(), K(7))).offer;
    expect(await editOffer(v1.offer_group_id, noVer as OfferInput, K(8))).toMatchObject({ status: 'invalid' });
    expect(mockDb.offers).toHaveLength(1);
  });
  it('the same Send racing: the loser hits client_key UNIQUE and gets the winner\'s offer as a replay, not an error', async () => {
    const store = jest.requireMock('../offerStore') as { byClientKey: (k: string) => Promise<Row | undefined> };
    const real = store.byClientKey;
    let calls = 0;
    const winner = ok(await createOffer(input(), K(9))).offer;
    store.byClientKey = async (k: string) => { calls += 1; return calls <= 2 ? undefined : real(k); }; // both checks miss, as in a race
    const r = ok(await createOffer(input(), K(9)));
    store.byClientKey = real;
    expect([r.replay, r.offer.id, mockDb.offers.length]).toEqual([true, winner.id, 1]);
  });
  it('refuses without the fee agreement, with bad pay, or without a company or role; nothing stored', async () => {
    expect(await createOffer(input({ feeAgreed: false }), K(2))).toEqual({ status: 'invalid', reason: 'The employer must agree to the placement fee before the offer is sent.' });
    expect(await createOffer(input({ pay: { basis: 'yearly', salaryCents: 0 } }), K(3))).toMatchObject({ status: 'invalid' });
    expect(await createOffer(input({ pay: { basis: 'hourly', rateCents: 50_00, hoursPerWeek: 81 } }), K(4))).toMatchObject({ status: 'invalid' });
    expect(await createOffer(input({ company: '  ' }), K(5))).toMatchObject({ status: 'invalid' });
    expect(mockDb.offers).toHaveLength(0);
  });
  it('the rate setting: a valid one is used; missing, unreadable or out of range = 1.1 (logged)', async () => {
    mockSetting.mockResolvedValue('1.2');
    expect(await feeRate()).toBe(1.2);
    mockSetting.mockResolvedValue(9);
    expect(await feeRate()).toBe(1.1);
    // Above 1.0 but rounds to 10000 basis points: refused here, so an offer never hits CHECK fee_rate_bp > 10000 (a 500).
    mockSetting.mockResolvedValue('1.00004');
    expect(await feeRate()).toBe(1.1);
    mockSetting.mockRejectedValue(Object.assign(new Error('x'), { name: 'SequelizeConnectionError' }));
    expect(await feeRate()).toBe(1.1);
    expect((console.warn as jest.Mock).mock.calls.map((c) => JSON.parse(c[0]).event)).toEqual(['placement_fee_rate_invalid', 'placement_fee_rate_invalid', 'placement_fee_rate_unreadable']);
    mockSetting.mockResolvedValue('1.00004');
    expect(ok(await createOffer(input(), K(1))).offer.fee_rate_bp).toBe(11_000);
  });
});

describe('edit = a new version', () => {
  it('supersedes the old version and sends version 2 with the new fee; the old version cannot be answered (stale)', async () => {
    const v1 = ok(await createOffer(input(), K(1))).offer;
    const v2 = ok(await editOffer(v1.offer_group_id, input({ pay: { basis: 'hourly', rateCents: 50_00, hoursPerWeek: 40 } }), K(2))).offer;
    expect([v2.version, v2.fee_cents, v1.superseded_at !== null]).toEqual([2, 114_400_00, true]);
    expect(await respondToOffer('enr-ann', v1.offer_group_id, 1, 'accept')).toEqual({ status: 'stale' });
    expect(ok(await editOffer(v1.offer_group_id, input(), K(2))).replay).toBe(true);
    expect(mockDb.offers.filter((o) => !o.superseded_at)).toHaveLength(1);
  });
  it('an accepted, declined or withdrawn offer is final; another learner\'s group is not found', async () => {
    const g = ok(await createOffer(input(), K(1))).offer.offer_group_id;
    expect(await editOffer(g, input({ enrollmentId: 'enr-bob' }), K(2))).toEqual({ status: 'not_found' });
    await respondToOffer('enr-ann', g, 1, 'decline');
    expect(await editOffer(g, input(), K(3))).toEqual({ status: 'final' });
  });
});

describe('respond', () => {
  it('accept makes ONE invoice record with the stored fee; accepting twice makes no second one', async () => {
    const o = ok(await createOffer(input(), K(1))).offer;
    const a = ok(await respondToOffer('enr-ann', o.offer_group_id, 1, 'accept'));
    const b = ok(await respondToOffer('enr-ann', o.offer_group_id, 1, 'accept'));
    expect([a.replay, (a as { invoiceCreated: boolean }).invoiceCreated, b.replay, (b as { invoiceCreated: boolean }).invoiceCreated]).toEqual([false, true, true, false]);
    expect(mockDb.invoices).toEqual([{ offer_id: o.id, fee_cents: 115_500_00 }]);
    expect(await respondToOffer('enr-ann', o.offer_group_id, 1, 'decline')).toEqual({ status: 'final' });
  });
  it('talk_first keeps it open (then accept works); decline makes no invoice; another learner cannot answer', async () => {
    const o = ok(await createOffer(input(), K(1))).offer;
    expect(await respondToOffer('enr-bob', o.offer_group_id, 1, 'accept')).toEqual({ status: 'not_found' });
    ok(await respondToOffer('enr-ann', o.offer_group_id, 1, 'talk_first'));
    ok(await respondToOffer('enr-ann', o.offer_group_id, 1, 'accept'));
    const d = ok(await createOffer(input(), K(2))).offer;
    ok(await respondToOffer('enr-ann', d.offer_group_id, 1, 'decline'));
    expect(mockDb.invoices.map((i) => i.offer_id)).toEqual([o.id]);
  });
  it('withdraw: only the employer who made it, only while open', async () => {
    const o = ok(await createOffer(input(), K(1))).offer;
    expect(await withdrawOffer(o.offer_group_id, 'cl-other')).toEqual({ status: 'not_found' });
    expect(ok(await withdrawOffer(o.offer_group_id, 'cl-1')).offer.status).toBe('withdrawn');
    expect(ok(await withdrawOffer(o.offer_group_id, 'cl-1')).replay).toBe(true);
    expect(await respondToOffer('enr-ann', o.offer_group_id, 1, 'accept')).toEqual({ status: 'final' });
    expect(mockDb.invoices).toHaveLength(0);
  });
});

describe('the candidate-facing offer', () => {
  it('has NO fee, rate, first-year or invoice field', async () => {
    const o = ok(await createOffer(input({ pay: { basis: 'hourly', rateCents: 50_00, hoursPerWeek: 40 } }), K(1))).offer;
    const c = candidateOffer(o);
    expect(Object.keys(c).sort()).toEqual(['company', 'groupId', 'hourlyRateCents', 'hoursPerWeek', 'id', 'payBasis', 'respondBy', 'role', 'salaryCents', 'startDate', 'status', 'version']);
    expect(JSON.stringify(c)).not.toMatch(/fee|rate_bp|first_year|invoice|11440000/i);
  });
});
