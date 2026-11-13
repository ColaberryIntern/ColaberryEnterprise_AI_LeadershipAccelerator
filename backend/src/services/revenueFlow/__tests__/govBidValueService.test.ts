const m = { query: jest.fn(), transaction: jest.fn() };

jest.mock('../../../config/database', () => ({
  sequelize: {
    query: (...a: unknown[]) => m.query(...a),
    transaction: (...a: unknown[]) => m.transaction(...a),
  },
}));

import {
  BidValueRejected,
  annualizedCents,
  confirmBidValue,
  type BidValue,
} from '../govBidValueService';

/**
 * R16 acceptance for the write that makes the pipeline total trustworthy.
 *
 * The thesis of `gov_bid_values` is that a price is a named human's claim with a stated
 * basis, and that this is what lets "possible proposal winnings" exclude the test row and
 * the duplicate that were really in the flagged set on 2026-11-12. These tests are about
 * the ways that thesis can be quietly bypassed.
 */
const PROJECT = '5fff94d9-6c3b-4633-8158-d2224f801b6c';
const GOOD = {
  deliveryProjectId: PROJECT,
  proposalValueCents: 45_000_000,
  valueBasis: 'Section 2.4 of the RFP states a not-to-exceed of $450,000 over 3 years.',
  basisSource: 'solicitation_document' as const,
  confirmedBy: 'ali@colaberry.com',
  periodMonths: 36,
};

beforeEach(() => {
  m.query.mockReset();
  m.transaction.mockReset();
});

describe('a price without accountability is refused', () => {
  /**
   * The basis floor is the difference between a figure on a slide and a figure someone else
   * can check. "RFP" passes a "not empty" check and tells a reader nothing, which is why the
   * floor is a length and the message names what a real basis looks like.
   */
  it('rejects a basis too short to be checked, and says what one looks like', async () => {
    await expect(confirmBidValue({ ...GOOD, valueBasis: 'RFP' }))
      .rejects.toThrow(BidValueRejected);
    await expect(confirmBidValue({ ...GOOD, valueBasis: 'RFP' }))
      .rejects.toThrow(/not a basis/);
  });

  it('rejects an empty basis', async () => {
    await expect(confirmBidValue({ ...GOOD, valueBasis: '   ' })).rejects.toThrow(BidValueRejected);
  });

  /**
   * There is deliberately no job-writable path into this table. The whole reason a priced
   * bid reads as a confirmed pursuit is that a person is attached to it.
   */
  it('rejects a value with nobody attached to it', async () => {
    await expect(confirmBidValue({ ...GOOD, confirmedBy: '' })).rejects.toThrow(/name the person/);
    await expect(confirmBidValue({ ...GOOD, confirmedBy: '  ' })).rejects.toThrow(BidValueRejected);
  });

  it('rejects a basis source outside the declared vocabulary', async () => {
    await expect(confirmBidValue({ ...GOOD, basisSource: 'vibes' as never }))
      .rejects.toThrow(/basisSource must be one of/);
  });

  it('never reaches the database when validation fails', async () => {
    await expect(confirmBidValue({ ...GOOD, valueBasis: 'RFP' })).rejects.toThrow();
    expect(m.query).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });
});

describe('cents are cents, because dollars drift', () => {
  /**
   * 1234.56 dollars has no exact binary representation, and a pipeline total that drifts by
   * fractions of a cent per bid is a defect nobody finds for a year. The rejection message
   * names the usual cause so the caller fixes the right thing.
   */
  it('rejects a non-integer amount and blames the decimal point', async () => {
    await expect(confirmBidValue({ ...GOOD, proposalValueCents: 450_000.5 }))
      .rejects.toThrow(/whole number of cents/);
  });

  it('rejects a negative amount', async () => {
    await expect(confirmBidValue({ ...GOOD, proposalValueCents: -1 })).rejects.toThrow(BidValueRejected);
  });

  /**
   * Zero is a real answer, not a validation failure: a bid genuinely priced at nothing is
   * something a reader should see rather than have filtered out silently.
   */
  it('accepts zero, which is a measurement and not an error', async () => {
    m.transaction.mockImplementation(async (fn: any) => fn({}));
    m.query.mockImplementation((sql: string) => {
      if (/information_schema/.test(sql)) return Promise.resolve([{ n: 1 }]);
      if (/^\s*SELECT \* FROM gov_bid_values/.test(sql)) return Promise.resolve([]);
      if (/INSERT INTO gov_bid_values/.test(sql)) {
        return Promise.resolve([{
          id: 'new-1', delivery_project_id: PROJECT, proposal_value_cents: '0',
          currency: 'USD', period_months: 36, value_basis: GOOD.valueBasis,
          basis_source: GOOD.basisSource, confirmed_by: GOOD.confirmedBy,
          confirmed_at: '2026-11-12T00:00:00Z', superseded_at: null, notes: null,
        }]);
      }
      return Promise.resolve([]);
    });

    const { value } = await confirmBidValue({ ...GOOD, proposalValueCents: 0 });
    expect(value.proposalValueCents).toBe(0);
  });
});

describe('the term is recorded or admitted, never guessed', () => {
  it('rejects a zero or negative term rather than storing a meaningless one', async () => {
    await expect(confirmBidValue({ ...GOOD, periodMonths: 0 })).rejects.toThrow(/positive whole number/);
    await expect(confirmBidValue({ ...GOOD, periodMonths: -12 })).rejects.toThrow(BidValueRejected);
  });

  /**
   * This is the honesty rail that stops a $5M five-year contract being reported beside
   * $72.8K of annual membership revenue as though the two were comparable.
   */
  it('annualizes a priced bid over its recorded term', () => {
    const v = { proposalValueCents: 45_000_000, periodMonths: 36 } as BidValue;
    expect(annualizedCents(v)).toBe(15_000_000);
  });

  it('withholds an annualized figure when no term was recorded', () => {
    expect(annualizedCents({ proposalValueCents: 45_000_000, periodMonths: null } as BidValue))
      .toBeNull();
  });

  it('withholds rather than dividing by zero', () => {
    expect(annualizedCents({ proposalValueCents: 100, periodMonths: 0 } as BidValue)).toBeNull();
  });
});

describe('a missing table is not an empty one', () => {
  it('refuses to record a value when gov_bid_values is absent', async () => {
    m.query.mockImplementation((sql: string) => (
      /information_schema/.test(sql) ? Promise.resolve([{ n: 0 }]) : Promise.resolve([])
    ));
    await expect(confirmBidValue(GOOD)).rejects.toThrow(/not present in this database/);
  });
});

describe('a correction supersedes, it never overwrites', () => {
  function mockRepricing(prior: Record<string, unknown> | null) {
    m.transaction.mockImplementation(async (fn: any) => fn({ id: 'tx' }));
    m.query.mockImplementation((sql: string) => {
      if (/information_schema/.test(sql)) return Promise.resolve([{ n: 1 }]);
      if (/^\s*SELECT \* FROM gov_bid_values/.test(sql)) {
        return Promise.resolve(prior ? [prior] : []);
      }
      if (/INSERT INTO gov_bid_values/.test(sql)) {
        return Promise.resolve([{
          id: 'new-1', delivery_project_id: PROJECT, proposal_value_cents: '50000000',
          currency: 'USD', period_months: 36, value_basis: GOOD.valueBasis,
          basis_source: GOOD.basisSource, confirmed_by: GOOD.confirmedBy,
          confirmed_at: '2026-11-12T00:00:00Z', superseded_at: null, notes: null,
        }]);
      }
      return Promise.resolve([]);
    });
  }

  it('reports a first price as a first price', async () => {
    mockRepricing(null);
    const { superseded } = await confirmBidValue(GOOD);
    expect(superseded).toBeNull();
  });

  /**
   * Returning the replaced row is what lets the timeline classify the event as
   * `bid_repriced` rather than `bid_priced` without a second query — so a revision reads as
   * a revision.
   */
  it('returns the row it replaced, so a revision can be told from a first price', async () => {
    mockRepricing({
      id: 'old-1', delivery_project_id: PROJECT, proposal_value_cents: '45000000',
      currency: 'USD', period_months: 36, value_basis: GOOD.valueBasis,
      basis_source: 'human_estimate', confirmed_by: 'ali@colaberry.com',
      confirmed_at: '2026-11-01T00:00:00Z', superseded_at: null, notes: null,
    });

    const { value, superseded } = await confirmBidValue(GOOD);
    expect(superseded).not.toBeNull();
    expect((superseded as BidValue).proposalValueCents).toBe(45_000_000);
    expect(value.proposalValueCents).toBe(50_000_000);

    // The old row is stamped, not deleted: history survives a correction.
    const updates = m.query.mock.calls.filter(([sql]) => /UPDATE gov_bid_values/.test(String(sql)));
    expect(updates).toHaveLength(1);
    expect(String(updates[0][0])).toMatch(/superseded_at = :at[\s\S]*superseded_by_id = :newId/);
    expect(String(updates[0][0])).not.toMatch(/DELETE/);
  });

  /**
   * Both writes are halves of one fact. The partial unique index means a crash between them
   * would leave the bid either double-priced or unpriced, so they share a transaction.
   */
  it('does both writes inside one transaction', async () => {
    mockRepricing({
      id: 'old-1', delivery_project_id: PROJECT, proposal_value_cents: '45000000',
      currency: 'USD', period_months: 36, value_basis: GOOD.valueBasis,
      basis_source: 'human_estimate', confirmed_by: 'ali@colaberry.com',
      confirmed_at: '2026-11-01T00:00:00Z', superseded_at: null, notes: null,
    });
    await confirmBidValue(GOOD);
    expect(m.transaction).toHaveBeenCalledTimes(1);
  });

  /**
   * `proposal_value_cents` is BIGINT, which `pg` hands back as a STRING so precision above
   * 2^53 is not silently lost. A missing Number() here would turn a total into string
   * concatenation and produce a plausible but enormous figure, which is the worst kind of
   * wrong number on a revenue page.
   */
  it('parses the BIGINT column as a number, not a string', async () => {
    mockRepricing(null);
    const { value } = await confirmBidValue(GOOD);
    expect(typeof value.proposalValueCents).toBe('number');
    expect(value.proposalValueCents).toBe(50_000_000);
  });
});
