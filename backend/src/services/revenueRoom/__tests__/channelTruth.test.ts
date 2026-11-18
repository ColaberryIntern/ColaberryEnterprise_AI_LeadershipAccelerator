const m = { query: jest.fn() };
const ledger = { listSpend: jest.fn(), toFacts: jest.fn() };
const alloc = { allocateSpend: jest.fn() };

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => m.query(...a) },
}));
jest.mock('../../marketing/adSpend/spendLedger', () => ({
  listSpend: (...a: unknown[]) => ledger.listSpend(...a),
  toFacts: (...a: unknown[]) => ledger.toFacts(...a),
}));
jest.mock('../../marketing/adSpend/spendAllocation', () => ({
  allocateSpend: (...a: unknown[]) => alloc.allocateSpend(...a),
}));
jest.mock('../../marketing/adSpend/metaSpendSync', () => ({
  centralToday: () => '2026-11-17',
}));

import {
  assertNoChannelShowsAnUnmeasuredCost,
  channelStatus,
  costPerPayingMemberCents,
  costStatus,
  labelForChannel,
  noteForChannel,
  sortChannels,
  type ChannelRow,
} from '../channelTruth';
import { getChannelTruth, PAID_LANDING_KEY } from '../channelTruthService';

/**
 * R19 acceptance. These prove the RULES: which status a channel lands on, when a cost may be
 * shown at all, and that recorded spend never spreads to a channel it was not spent on.
 *
 * They do NOT prove the SQL is valid - `sequelize.query` is mocked, so no statement reaches
 * Postgres. The queries were measured read-only against production on 2026-11-17, which is
 * where the figures in these fixtures come from: open house 16 members, CCPP winback 5 from
 * 20,837 leads, paid landing 0 members against $3,894.80.
 */
const row = (over: Partial<ChannelRow> = {}): ChannelRow => ({
  key: 'open_house', label: 'Open house', leads: 815, payingMembers: 16, mrrCents: 298400,
  spendCents: null, costPerPayingMemberCents: null, status: 'live', costStatus: 'unmeasurable',
  note: '', ...over,
});

describe('channel status vocabulary', () => {
  it('tells a channel that produced nobody from one nobody has tried', () => {
    // The distinction the panel exists for: 20,837 leads and 5 members is a finding;
    // no leads at all is an absence of data, and they must not render the same.
    expect(channelStatus(20837, 5)).toBe('live');
    expect(channelStatus(591, 0)).toBe('measured_zero');
    expect(channelStatus(0, 0)).toBe('unmeasurable');
  });

  it('treats spend with no payers as an undefined rate, not a big number and not zero', () => {
    expect(costStatus(389480, 0)).toBe('undefined_rate');
    expect(costStatus(389480, 16)).toBe('live');
    // Never recorded is not the same as measured as zero.
    expect(costStatus(null, 16)).toBe('unmeasurable');
  });

  it('computes a cost only where both sides were measured', () => {
    expect(costPerPayingMemberCents(389480, 0)).toBeNull();
    expect(costPerPayingMemberCents(null, 16)).toBeNull();
    expect(costPerPayingMemberCents(389480, 16)).toBe(24343);
  });

  it('falls back to the raw source rather than inventing a label', () => {
    expect(labelForChannel('ccpp_winback')).toBe('CCPP winback');
    expect(labelForChannel('some_new_source')).toBe('some_new_source');
  });
});

describe('the invariant that stops an invented cost reaching the page', () => {
  it('refuses a cost shown beside a status saying the cost is unknowable', () => {
    expect(() => assertNoChannelShowsAnUnmeasuredCost([
      row({ costStatus: 'undefined_rate', costPerPayingMemberCents: 24343 }),
    ])).toThrow(/not knowable/);
  });

  it('refuses a row that claims a knowable cost and carries none', () => {
    expect(() => assertNoChannelShowsAnUnmeasuredCost([
      row({ costStatus: 'live', costPerPayingMemberCents: null }),
    ])).toThrow(/claims a knowable cost but carries none/);
  });

  it('refuses spend of 0 reported as never recorded, because those are different claims', () => {
    expect(() => assertNoChannelShowsAnUnmeasuredCost([
      row({ spendCents: 0, costStatus: 'unmeasurable' }),
    ])).toThrow(/different statement from no spend recorded/);
  });

  it('accepts the honest shapes', () => {
    expect(() => assertNoChannelShowsAnUnmeasuredCost([
      row(),
      row({ key: 'paid_landing', payingMembers: 0, spendCents: 389480, costStatus: 'undefined_rate', costPerPayingMemberCents: null }),
      row({ key: 'x', spendCents: 389480, costStatus: 'live', costPerPayingMemberCents: 24343 }),
    ])).not.toThrow();
  });
});

describe('wording', () => {
  it('says plainly that blank spend is not the same as costing nothing', () => {
    const r = row({ spendCents: null });
    expect(noteForChannel(r)).toMatch(/not the same as it having cost nothing/);
  });

  it('calls a channel with spend and no payers a measured zero', () => {
    const r = row({ key: PAID_LANDING_KEY, leads: 591, payingMembers: 0, spendCents: 389480, status: 'measured_zero' });
    expect(noteForChannel(r)).toMatch(/measured zero, not a gap in the data/);
  });

  it('says the lead ratio is lifetime rather than a cohort', () => {
    expect(noteForChannel(row())).toMatch(/Lifetime, not a cohort/);
  });
});

describe('ordering', () => {
  it('is deterministic, so the panel cannot wobble between loads', () => {
    const rows = [
      row({ key: 'b', mrrCents: 100, payingMembers: 1 }),
      row({ key: 'a', mrrCents: 100, payingMembers: 1 }),
      row({ key: 'c', mrrCents: 900, payingMembers: 1 }),
    ];
    expect(sortChannels(rows).map((r) => r.key)).toEqual(['c', 'a', 'b']);
    expect(sortChannels([...rows].reverse()).map((r) => r.key)).toEqual(['c', 'a', 'b']);
  });
});

describe('getChannelTruth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ledger.listSpend.mockResolvedValue([{ id: 1 }]);
    ledger.toFacts.mockReturnValue([{ id: 1 }]);
    alloc.allocateSpend.mockReturnValue({ totalCents: 389480 });
  });

  /** members query first, then leads. Mirrors the Promise.all order in the service. */
  const give = (members: unknown[], leads: unknown[]) => {
    m.query.mockImplementation((sql: string) => {
      if (/FROM member_lead/.test(sql)) return Promise.resolve(members);
      if (/FROM leads l/.test(sql)) return Promise.resolve(leads);
      throw new Error(`unexpected query: ${String(sql).slice(0, 60)}`);
    });
  };

  it('attaches recorded spend ONLY to the landing group, and leaves the rest null', async () => {
    give(
      [{ source: 'open_house', members: 16, mrr: 2984 }, { source: 'free_signup', members: 0, mrr: 0 }],
      [{ source: 'open_house', leads: 815 }, { source: 'free_signup', leads: 591 }],
    );
    const out = await getChannelTruth(new Date('2026-11-17T00:00:00Z'));
    const landing = out.rows.find((r) => r.key === PAID_LANDING_KEY)!;
    const oh = out.rows.find((r) => r.key === 'open_house')!;

    expect(landing.spendCents).toBe(389480);
    // The whole point. The open house was not costless; we simply never recorded a cost.
    expect(oh.spendCents).toBeNull();
    expect(oh.costPerPayingMemberCents).toBeNull();
    expect(oh.costStatus).toBe('unmeasurable');
  });

  it('reports spend against zero payers as a measured zero with an undefined cost', async () => {
    give([{ source: 'free_signup', members: 0, mrr: 0 }], [{ source: 'free_signup', leads: 591 }]);
    const out = await getChannelTruth();
    const landing = out.rows.find((r) => r.key === PAID_LANDING_KEY)!;
    expect(landing.payingMembers).toBe(0);
    expect(landing.spendCents).toBe(389480);
    expect(landing.status).toBe('measured_zero');
    expect(landing.costStatus).toBe('undefined_rate');
    expect(landing.costPerPayingMemberCents).toBeNull();
  });

  it('collapses every landing source into one paid group', async () => {
    give(
      [{ source: 'free_signup', members: 0, mrr: 0 }, { source: 'popup', members: 0, mrr: 0 }],
      [{ source: 'free_signup', leads: 591 }, { source: 'popup', leads: 3 }],
    );
    const out = await getChannelTruth();
    expect(out.rows.filter((r) => r.key === PAID_LANDING_KEY)).toHaveLength(1);
    expect(out.rows.find((r) => r.key === PAID_LANDING_KEY)!.leads).toBe(594);
    expect(out.rows.some((r) => r.key === 'free_signup')).toBe(false);
  });

  it('gives a paying member with no lead its own row instead of folding them into a channel', async () => {
    give([{ source: null, members: 2, mrr: 398 }], [{ source: 'open_house', leads: 815 }]);
    const out = await getChannelTruth();
    const unlinked = out.rows.find((r) => r.key === 'unlinked')!;
    expect(unlinked.payingMembers).toBe(2);
    expect(unlinked.note).toMatch(/quietly inflate every other channel/);
  });

  it('converts MRR dollars to cents and totals what it shows', async () => {
    give(
      [{ source: 'open_house', members: 16, mrr: 2984 }, { source: 'ccpp_alumni', members: 5, mrr: 895 }],
      [{ source: 'open_house', leads: 815 }, { source: 'ccpp_alumni', leads: 690 }],
    );
    const out = await getChannelTruth();
    expect(out.rows.find((r) => r.key === 'open_house')!.mrrCents).toBe(298400);
    expect(out.totals.payingMembers).toBe(21);
    expect(out.totals.mrrCents).toBe(298400 + 89500);
  });

  it('degrades to no cost anywhere rather than failing the panel when spend cannot be read', async () => {
    alloc.allocateSpend.mockImplementation(() => { throw new Error('ledger down'); });
    give([{ source: 'free_signup', members: 0, mrr: 0 }], [{ source: 'free_signup', leads: 591 }]);
    const out = await getChannelTruth();
    expect(out.rows.find((r) => r.key === PAID_LANDING_KEY)!.spendCents).toBeNull();
    expect(out.caveats.some((c) => /Ad spend could not be read/.test(c))).toBe(true);
  });

  it('tells the reader where campaign-level return lives, so this is not read as the whole story', async () => {
    give([], []);
    const out = await getChannelTruth();
    expect(out.caveats.some((c) => /admin\/marketing\/performance/.test(c))).toBe(true);
    expect(out.caveats.some((c) => /lifetime rate rather than a cohort conversion/.test(c))).toBe(true);
  });
});
