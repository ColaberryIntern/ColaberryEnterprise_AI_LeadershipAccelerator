const m = { query: jest.fn(), transaction: jest.fn() };
jest.mock('../../../config/database', () => ({
  sequelize: {
    query: (...a: unknown[]) => m.query(...a),
    transaction: (...a: unknown[]) => m.transaction(...a),
  },
}));

import {
  DealValueRejected,
  annualizedCents,
  confirmDealValue,
  dealValueTableExists,
  monthlyCents,
  getDealValueHistory,
  getLiveDealValues,
} from '../enterpriseDealValueService';

/**
 * R23 Phase 2 — the service that is the only way a deal value gets written.
 *
 * What these hold, in the order it would hurt to get wrong:
 *
 * 1. **A value must be attributable to a named human.** The W28 intake is AI-driven end to
 *    end: an agent runs the interview, drafts the options and drafts the proposal. A value
 *    written without a person's name would be the model's estimate of its own pipeline,
 *    printed on a board whose headline is money.
 * 2. **Cents, not dollars.** A caller passing 45000 meaning $45,000 would understate the deal
 *    by a hundredfold, and nothing downstream could detect it. The message names the cause.
 * 3. **A basis somebody else could check.** A figure with no basis is the figure-on-a-slide
 *    this whole surface exists to prevent.
 * 4. **A revision supersedes, in ONE transaction.** The partial unique index means a crash
 *    between the two writes leaves the deal either double-valued or unvalued.
 * 5. **A missing table is not an empty one.** Reads degrade to empty; the WRITE throws,
 *    because silently accepting a value nobody can store is the worst of the three.
 */

const GOOD = {
  enterpriseIntakeId: '11111111-1111-4111-8111-111111111111',
  valueKind: 'total_contract' as const,
  dealValueCents: 4500000,
  valueBasis: 'SOW dated 2026-12-02, three phases at $15,000 each, countersigned by their CTO',
  basisSource: 'statement_of_work' as const,
  periodMonths: 12,
  confirmedBy: 'ali@colaberry.com',
};

/** Table present unless a test says otherwise. */
function tablePresent(present = true) {
  m.query.mockImplementation((sql: string) => {
    if (String(sql).includes('information_schema.tables')) {
      return Promise.resolve([{ n: present ? 1 : 0 }]);
    }
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  m.query.mockReset();
  m.transaction.mockReset();
  tablePresent();
});

describe('a deal value must be a human claim', () => {
  it('refuses an unattributed value, and says why that matters here', async () => {
    tablePresent();
    await expect(confirmDealValue({ ...GOOD, confirmedBy: '' }))
      .rejects.toThrow(/name the person confirming it/);
    await expect(confirmDealValue({ ...GOOD, confirmedBy: '   ' }))
      .rejects.toThrow(DealValueRejected);
    // The reason is in the message, not only in a comment: this intake is AI-run.
    await expect(confirmDealValue({ ...GOOD, confirmedBy: '' }))
      .rejects.toThrow(/run by an AI/);
  });

  it('never reaches the database when validation fails', async () => {
    await expect(confirmDealValue({ ...GOOD, confirmedBy: '' })).rejects.toThrow();
    expect(m.transaction).not.toHaveBeenCalled();
  });
});

describe('cents, not dollars', () => {
  it('refuses a non-integer and names the usual cause', async () => {
    await expect(confirmDealValue({ ...GOOD, dealValueCents: 45000.5 }))
      .rejects.toThrow(/whole number of CENTS/);
    await expect(confirmDealValue({ ...GOOD, dealValueCents: 45000.5 }))
      .rejects.toThrow(/\$45,000 is 4500000/);
  });

  it('refuses a negative deal but accepts zero', async () => {
    await expect(confirmDealValue({ ...GOOD, dealValueCents: -1 }))
      .rejects.toThrow(/less than nothing/);
    // Zero is a real answer - work taken at no charge - and must not be rejected.
    m.transaction.mockImplementation(async (fn: any) => fn({}));
    m.query.mockImplementation((sql: string) => {
      if (String(sql).includes('information_schema.tables')) return Promise.resolve([{ n: 1 }]);
      if (String(sql).includes('SELECT * FROM enterprise_deal_values')) return Promise.resolve([]);
      if (String(sql).includes('INSERT INTO')) {
        return Promise.resolve([{
          id: 'v1', enterprise_intake_id: GOOD.enterpriseIntakeId, deal_value_cents: '0',
          currency: 'USD', period_months: 12, value_basis: GOOD.valueBasis,
          basis_source: 'statement_of_work', confirmed_by: 'ali@colaberry.com',
          confirmed_at: '2026-11-21T00:00:00Z', superseded_at: null, superseded_by_id: null,
          notes: null,
        }]);
      }
      return Promise.resolve([]);
    });
    const out = await confirmDealValue({ ...GOOD, dealValueCents: 0 });
    expect(out.value.dealValueCents).toBe(0);
  });
});

describe('a basis somebody else could check', () => {
  it('refuses a token basis and shows what a usable one looks like', async () => {
    await expect(confirmDealValue({ ...GOOD, valueBasis: 'SOW' }))
      .rejects.toThrow(/at least 25 characters/);
    await expect(confirmDealValue({ ...GOOD, valueBasis: 'SOW' }))
      .rejects.toThrow(/"SOW" is not a basis/);
    await expect(confirmDealValue({ ...GOOD, valueBasis: '    ' }))
      .rejects.toThrow(DealValueRejected);
  });

  it('refuses a basis source outside the vocabulary', async () => {
    await expect(confirmDealValue({ ...GOOD, basisSource: 'vibes' as any }))
      .rejects.toThrow(/basisSource must be one of/);
    // Including the gov vocabulary, which is deliberately NOT shared.
    await expect(confirmDealValue({ ...GOOD, basisSource: 'award_notice' as any }))
      .rejects.toThrow(DealValueRejected);
  });

  it('refuses a nonsense term but allows the term to be absent', async () => {
    await expect(confirmDealValue({ ...GOOD, periodMonths: 0 }))
      .rejects.toThrow(/positive whole number of months/);
    await expect(confirmDealValue({ ...GOOD, periodMonths: -3 }))
      .rejects.toThrow(DealValueRejected);
    await expect(confirmDealValue({ ...GOOD, periodMonths: 1.5 }))
      .rejects.toThrow(DealValueRejected);
  });
});

describe('a missing table is not an empty one', () => {
  it('the WRITE throws rather than silently accepting a value nobody can store', async () => {
    tablePresent(false);
    await expect(confirmDealValue(GOOD))
      .rejects.toThrow(/A missing table is not an empty one/);
  });

  it('the READS degrade to empty, so one optional table cannot take the board down', async () => {
    tablePresent(false);
    await expect(getLiveDealValues()).resolves.toEqual([]);
    await expect(getDealValueHistory('any')).resolves.toEqual([]);
    await expect(dealValueTableExists()).resolves.toBe(false);
  });
});

describe('a revision supersedes rather than overwrites', () => {
  it('inserts the new row, then stamps the old one, inside one transaction', async () => {
    const prior = {
      id: 'v-old', enterprise_intake_id: GOOD.enterpriseIntakeId, deal_value_cents: '3000000',
      currency: 'USD', period_months: 12, value_basis: GOOD.valueBasis,
      basis_source: 'human_estimate', confirmed_by: 'ali@colaberry.com',
      confirmed_at: '2026-11-01T00:00:00Z', superseded_at: null, superseded_by_id: null,
      notes: null,
    };
    const fresh = { ...prior, id: 'v-new', deal_value_cents: '4500000', basis_source: 'statement_of_work' };

    const calls: string[] = [];
    m.transaction.mockImplementation(async (fn: any) => fn({ id: 'tx' }));
    m.query.mockImplementation((sql: string) => {
      const s = String(sql);
      if (s.includes('information_schema.tables')) return Promise.resolve([{ n: 1 }]);
      if (s.includes('SELECT * FROM enterprise_deal_values')) {
        calls.push('select_for_update');
        expect(s).toContain('FOR UPDATE');
        expect(s).toContain('superseded_at IS NULL');
        return Promise.resolve([prior]);
      }
      if (s.includes('INSERT INTO enterprise_deal_values')) {
        calls.push('insert');
        return Promise.resolve([fresh]);
      }
      if (s.includes('UPDATE enterprise_deal_values')) {
        calls.push('supersede');
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const out = await confirmDealValue(GOOD);

    // All three reads/writes happened, and in the order that keeps superseded_by_id pointing
    // at a row that exists.
    expect(calls).toEqual(['select_for_update', 'insert', 'supersede']);
    expect(m.transaction).toHaveBeenCalledTimes(1);
    expect(out.value.dealValueCents).toBe(4500000);
    expect(out.superseded?.dealValueCents).toBe(3000000);
  });

  it('reports no prior value on a first valuation, so a caller can tell the two apart', async () => {
    m.transaction.mockImplementation(async (fn: any) => fn({}));
    m.query.mockImplementation((sql: string) => {
      const s = String(sql);
      if (s.includes('information_schema.tables')) return Promise.resolve([{ n: 1 }]);
      if (s.includes('SELECT * FROM enterprise_deal_values')) return Promise.resolve([]);
      if (s.includes('INSERT INTO')) {
        return Promise.resolve([{
          id: 'v1', enterprise_intake_id: GOOD.enterpriseIntakeId, deal_value_cents: '4500000',
          currency: 'usd', period_months: 12, value_basis: GOOD.valueBasis,
          basis_source: 'statement_of_work', confirmed_by: 'ali@colaberry.com',
          confirmed_at: '2026-11-21T00:00:00Z', superseded_at: null, superseded_by_id: null,
          notes: null,
        }]);
      }
      return Promise.resolve([]);
    });

    const out = await confirmDealValue(GOOD);
    expect(out.superseded).toBeNull();
    // No supersede UPDATE is issued when there was nothing to supersede. Matched on the
    // statement head rather than the word "UPDATE", because the SELECT above legitimately
    // contains `FOR UPDATE` and a looser filter matches it (it did, first run).
    const updates = m.query.mock.calls
      .filter((c: any[]) => /UPDATE enterprise_deal_values/.test(String(c[0])));
    expect(updates).toHaveLength(0);
  });
});

describe('a monthly retainer is Plan A, and cannot be filed as a one-month deal', () => {
  const RETAINER = {
    enterpriseIntakeId: GOOD.enterpriseIntakeId,
    valueKind: 'monthly_retainer' as const,
    monthlyFeeCents: 450000, // $4,500 a month - the Middlesex shape
    periodMonths: 12,
    valueBasis: 'Retainer agreement dated 2026-12-01, $4,500 per month for twelve months',
    basisSource: 'signed_agreement' as const,
    confirmedBy: 'ali@colaberry.com',
  };

  function wireInsert(capture: { cents?: unknown; period?: unknown }) {
    m.transaction.mockImplementation(async (fn: any) => fn({}));
    m.query.mockImplementation((sql: string, opts: any) => {
      const s = String(sql);
      if (s.includes('information_schema.tables')) return Promise.resolve([{ n: 1 }]);
      if (s.includes('SELECT * FROM enterprise_deal_values')) return Promise.resolve([]);
      if (s.includes('INSERT INTO enterprise_deal_values')) {
        capture.cents = opts.replacements.cents;
        capture.period = opts.replacements.period;
        return Promise.resolve([{
          id: 'v1', enterprise_intake_id: RETAINER.enterpriseIntakeId,
          deal_value_cents: String(opts.replacements.cents), currency: 'USD',
          period_months: opts.replacements.period, value_basis: RETAINER.valueBasis,
          basis_source: 'signed_agreement', confirmed_by: 'ali@colaberry.com',
          confirmed_at: '2026-11-21T00:00:00Z', superseded_at: null, superseded_by_id: null,
          notes: null,
        }]);
      }
      return Promise.resolve([]);
    });
  }

  it('stores the TOTAL, not the monthly fee - the defect this shape exists to prevent', async () => {
    const got: { cents?: unknown; period?: unknown } = {};
    wireInsert(got);
    const out = await confirmDealValue(RETAINER);

    // $4,500 x 12 = $54,000. Before this change the same intent stored 450000 ($4,500) and
    // understated the engagement by its own term.
    expect(got.cents).toBe(5400000);
    expect(got.period).toBe(12);
    expect(out.value.dealValueCents).toBe(5400000);
  });

  it('round-trips back to the negotiated monthly fee exactly', async () => {
    const got: { cents?: unknown } = {};
    wireInsert(got);
    const out = await confirmDealValue(RETAINER);
    // Exact, because the total was built by multiplying this figure by the term.
    expect(monthlyCents(out.value)).toBe(450000);
    expect(annualizedCents(out.value)).toBe(5400000);
  });

  it('REFUSES a retainer with no term, instead of treating it as one month', async () => {
    await expect(confirmDealValue({ ...RETAINER, periodMonths: undefined as any }))
      .rejects.toThrow(/A monthly retainer needs periodMonths/);
    await expect(confirmDealValue({ ...RETAINER, periodMonths: 0 }))
      .rejects.toThrow(/understate the deal by the length of its own term/);
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it('names the field the caller actually passed when the amount is wrong', async () => {
    await expect(confirmDealValue({ ...RETAINER, monthlyFeeCents: 4500.5 }))
      .rejects.toThrow(/monthlyFeeCents must be a whole number of CENTS/);
    // And the total-contract shape names its own field, not the retainer's.
    await expect(confirmDealValue({ ...GOOD, dealValueCents: 45000.5 }))
      .rejects.toThrow(/dealValueCents must be a whole number of CENTS/);
  });

  it('refuses a shape it does not recognise rather than guessing one', async () => {
    await expect(confirmDealValue({ ...GOOD, valueKind: 'whatever' as any }))
      .rejects.toThrow(/valueKind must be/);
    await expect(confirmDealValue({ ...GOOD, valueKind: 'whatever' as any }))
      .rejects.toThrow(/twelve-month retainer being filed as a single month/);
  });
});

describe('annualizedCents withholds rather than guesses', () => {
  const base = {
    id: 'v', enterpriseIntakeId: 'i', currency: 'USD', valueBasis: 'x', notes: null,
    basisSource: 'statement_of_work' as const, confirmedBy: 'a', confirmedAt: 'z',
    supersededAt: null, supersededById: null,
  };

  it('returns null when the term was not recorded', () => {
    expect(annualizedCents({ ...base, dealValueCents: 4500000, periodMonths: null })).toBeNull();
  });

  it('divides by the recorded term and scales to twelve months', () => {
    // $45,000 over 12 months is $45,000 a year.
    expect(annualizedCents({ ...base, dealValueCents: 4500000, periodMonths: 12 })).toBe(4500000);
    // $45,000 over 6 months annualizes to $90,000 - which is exactly why assuming twelve
    // months for an unrecorded term would be wrong in both directions.
    expect(annualizedCents({ ...base, dealValueCents: 4500000, periodMonths: 6 })).toBe(9000000);
    // $45,000 over 36 months is $15,000 a year.
    expect(annualizedCents({ ...base, dealValueCents: 4500000, periodMonths: 36 })).toBe(1500000);
  });

  it('treats a nonsense term as unrecorded rather than dividing by it', () => {
    expect(annualizedCents({ ...base, dealValueCents: 100, periodMonths: 0 })).toBeNull();
    expect(annualizedCents({ ...base, dealValueCents: 100, periodMonths: -6 })).toBeNull();
  });
});
