const mem = { buildMembershipFlow: jest.fn() };
const gov = { buildGovFlow: jest.fn() };

jest.mock('../membershipFlow', () => ({
  buildMembershipFlow: (...a: unknown[]) => mem.buildMembershipFlow(...a),
}));
jest.mock('../govBidFlow', () => ({
  buildGovFlow: (...a: unknown[]) => gov.buildGovFlow(...a),
}));

import { getRevenueFlowBoard } from '../revenueFlowService';
import { money, noMoney } from '../revenueFlowTypes';

/**
 * R16 acceptance for the assembly: the dashboard Ram reads across the top.
 *
 * WHAT THESE PROVE. The two stream builders are mocked, so these prove the ASSEMBLY
 * decisions — what the headline says, what it refuses to say, what happens when one stream
 * fails, and whether an event can smuggle a number onto a classification that production
 * holds no number for. The SQL in the builders is covered by its own census against
 * production, not by this file.
 */
const NOW = new Date('2026-11-12T12:00:00Z');

function membershipFlow(over: Record<string, unknown> = {}) {
  return {
    stream: {
      key: 'membership',
      label: 'Membership (annualized)',
      status: 'live',
      headline: money(7_281_600, 'annualizedRevenueCents()'),
      funnel: [],
      provenance: 'subscriptions',
      caveat: null,
      drillDownKey: 'membership_subscriptions',
    },
    events: [],
    annualizedCents: 7_281_600,
    ...over,
  };
}

function govFlow(over: Record<string, unknown> = {}) {
  return {
    stream: {
      key: 'gov_pipeline',
      label: 'Government bids in pursuit',
      status: 'proxy',
      headline: noMoney('14 flagged, none priced', 'no value column exists'),
      funnel: [],
      provenance: 'gov_qualifications',
      caveat: null,
      drillDownKey: 'gov_bid_pursuit',
    },
    events: [],
    openPricedCents: 0,
    openPricedAnnualizedCents: null,
    wonCents: 0,
    lostCents: 0,
    decidedWon: 0,
    decidedLost: 0,
    unpricedBids: 14,
    ...over,
  };
}

beforeEach(() => {
  mem.buildMembershipFlow.mockReset();
  gov.buildGovFlow.mockReset();
  mem.buildMembershipFlow.mockResolvedValue(membershipFlow());
  gov.buildGovFlow.mockResolvedValue(govFlow());
});

describe('booked revenue and possible winnings are never added together', () => {
  /**
   * The most misleading thing this page could do. One figure is money that exists; the other
   * is contract value that might arrive, over terms that may run five years. The absence of
   * a summing field is load-bearing, so it is asserted rather than left to taste.
   */
  it('exposes no field holding their sum', async () => {
    const board = await getRevenueFlowBoard(NOW);
    const keys = Object.keys(board.headline);
    expect(keys).not.toContain('total');
    expect(keys).not.toContain('totalRevenue');
    expect(keys).not.toContain('combined');
    expect(keys).not.toContain('grandTotal');

    // And no field happens to equal the sum, which would be the same mistake by another name.
    const booked = board.headline.bookedAnnualized.cents ?? 0;
    const possible = board.headline.possibleWinnings.cents ?? 0;
    for (const v of Object.values(board.headline)) {
      if (v && typeof v === 'object' && 'cents' in v && typeof (v as any).cents === 'number') {
        if (booked > 0 && possible > 0) expect((v as any).cents).not.toBe(booked + possible);
      }
    }
  });

  it('reports booked revenue from the membership stream unchanged', async () => {
    const board = await getRevenueFlowBoard(NOW);
    expect(board.headline.bookedAnnualized.cents).toBe(7_281_600);
  });
});

describe('a win rate nobody has earned is null, not zero', () => {
  /**
   * gov_submission held zero rows on 2026-11-12, so nothing has ever been decided. A 0% win
   * rate would be a claim that we lose; the truth is that we have not yet played, and the
   * basis sentence has to say so in words.
   */
  it('returns null and explains that nothing has been decided', async () => {
    const board = await getRevenueFlowBoard(NOW);
    expect(board.headline.winRate).toBeNull();
    expect(board.headline.winRateBasis).toMatch(/not a zero percent win rate/i);
  });

  it('computes a rate once outcomes exist', async () => {
    gov.buildGovFlow.mockResolvedValue(govFlow({
      decidedWon: 1, decidedLost: 3, wonCents: 10_000_000, lostCents: 30_000_000,
    }));
    const board = await getRevenueFlowBoard(NOW);
    expect(board.headline.winRate).toBeCloseTo(0.25);
    expect(board.headline.winRateBasis).toMatch(/1 won of 4 decided/);
  });
});

describe('the unpriced gap is always visible beside the total', () => {
  /**
   * Excluding a test row from the winnings total is correct. Excluding it SILENTLY is how a
   * reader comes to believe the pipeline is smaller than it is, so the count travels with
   * the number.
   */
  it('reports the count and says the bids are absent from the total', async () => {
    const board = await getRevenueFlowBoard(NOW);
    expect(board.headline.unpricedBids).toBe(14);
    expect(board.caveats.join(' ')).toMatch(/14 flagged bid\(s\) have no confirmed value/);
    expect(board.caveats.join(' ')).toMatch(/visible rather than silently excluded/);
  });

  it('says so in the winnings figure itself when nothing is priced', async () => {
    const board = await getRevenueFlowBoard(NOW);
    expect(board.headline.possibleWinnings.cents).toBeNull();
    expect(board.headline.possibleWinnings.display).toMatch(/14 bids, none priced/);
  });

  it('reports a real total once bids are priced', async () => {
    gov.buildGovFlow.mockResolvedValue(govFlow({ openPricedCents: 45_000_000, unpricedBids: 9 }));
    const board = await getRevenueFlowBoard(NOW);
    expect(board.headline.possibleWinnings.cents).toBe(45_000_000);
    expect(board.headline.possibleWinnings.display).toBe('$450,000');
  });
});

describe('an annualized pipeline is withheld when the term is unknown', () => {
  it('says the term was not recorded rather than assuming one year', async () => {
    const board = await getRevenueFlowBoard(NOW);
    expect(board.headline.possibleWinningsAnnualized.cents).toBeNull();
    expect(board.headline.possibleWinningsAnnualized.display).toMatch(/Term not recorded/);
  });

  it('reports it when the term is known', async () => {
    gov.buildGovFlow.mockResolvedValue(govFlow({
      openPricedCents: 45_000_000, openPricedAnnualizedCents: 15_000_000,
    }));
    const board = await getRevenueFlowBoard(NOW);
    expect(board.headline.possibleWinningsAnnualized.cents).toBe(15_000_000);
  });
});

describe('a value on a classification production cannot price is rejected', () => {
  /**
   * The registry declares, per classification, whether an event may carry a number at all.
   * `bid_flagged` may not, because gov_qualifications holds none. Enforced at the boundary
   * and loud outside production, because a producer that attaches a number there is a bug to
   * fix before it ships rather than a line in a caveat list nobody reads.
   */
  it('throws outside production, naming the offending event', async () => {
    gov.buildGovFlow.mockResolvedValue(govFlow({
      events: [{
        at: '2026-11-10', classification: 'bid_flagged', stream: 'gov_pipeline',
        label: 'Harris County', entityKey: 'p1', valueCents: 45_000_000,
      }],
    }));
    await expect(getRevenueFlowBoard(NOW)).rejects.toThrow(/carried a value of 45000000 cents/);
  });

  /**
   * In production the page must still render. The value is stripped, the reader is told, and
   * Ram sees the rest of the dashboard rather than a 500.
   */
  it('strips the value and caveats it in production, rather than failing the page', async () => {
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      gov.buildGovFlow.mockResolvedValue(govFlow({
        events: [{
          at: '2026-11-10', classification: 'bid_flagged', stream: 'gov_pipeline',
          label: 'Harris County', entityKey: 'p1', valueCents: 45_000_000,
        }],
      }));
      const board = await getRevenueFlowBoard(NOW);
      expect(board.events[0].valueCents).toBeNull();
      expect(board.caveats.join(' ')).toMatch(/dropped rather than shown/);
    } finally {
      process.env.NODE_ENV = prior;
    }
  });

  it('leaves a legitimate value alone', async () => {
    gov.buildGovFlow.mockResolvedValue(govFlow({
      events: [{
        at: '2026-11-10', classification: 'bid_priced', stream: 'gov_pipeline',
        label: 'Harris County', entityKey: 'p1', valueCents: 45_000_000,
      }],
    }));
    const board = await getRevenueFlowBoard(NOW);
    expect(board.events[0].valueCents).toBe(45_000_000);
  });
});

describe('one broken stream costs that stream, not the page', () => {
  /**
   * The rule revenueRoomService established: "A page that disappears under partial failure
   * teaches people not to trust it, which costs more than the missing section."
   */
  it('still renders membership when the government pipeline throws', async () => {
    gov.buildGovFlow.mockRejectedValue(new Error('gov_qualifications exploded'));
    const board = await getRevenueFlowBoard(NOW);
    expect(board.streams.map((s) => s.key)).toEqual(['membership']);
    expect(board.caveats.join(' ')).toMatch(/government pipeline could not be built: gov_qualifications exploded/);
    expect(board.headline.possibleWinnings.display).toMatch(/Cannot be read/);
  });

  it('still renders the pipeline when membership throws', async () => {
    mem.buildMembershipFlow.mockRejectedValue(new Error('subscriptions exploded'));
    const board = await getRevenueFlowBoard(NOW);
    expect(board.streams.map((s) => s.key)).toEqual(['gov_pipeline']);
    expect(board.headline.bookedAnnualized.display).toMatch(/Cannot be read/);
  });
});

describe('the timeline is ordered and the window is declared', () => {
  it('sorts newest first', async () => {
    gov.buildGovFlow.mockResolvedValue(govFlow({
      events: [
        { at: '2026-10-01', classification: 'bid_flagged', stream: 'gov_pipeline', label: 'a', entityKey: null, valueCents: null },
        { at: '2026-11-10', classification: 'bid_flagged', stream: 'gov_pipeline', label: 'b', entityKey: null, valueCents: null },
        { at: '2026-11-01', classification: 'bid_flagged', stream: 'gov_pipeline', label: 'c', entityKey: null, valueCents: null },
      ],
    }));
    const board = await getRevenueFlowBoard(NOW);
    expect(board.events.map((e) => e.at)).toEqual(['2026-11-10', '2026-11-01', '2026-10-01']);
  });

  /**
   * A stable tie-break makes a screenshot reproducible. Without it, two events on the same
   * day shuffle between requests and a reader comparing two screenshots sees a change that
   * is not there.
   */
  it('breaks same-day ties stably, by classification', async () => {
    gov.buildGovFlow.mockResolvedValue(govFlow({
      events: [
        { at: '2026-11-10', classification: 'bid_suspect', stream: 'gov_pipeline', label: 'b', entityKey: null, valueCents: null },
        { at: '2026-11-10', classification: 'bid_flagged', stream: 'gov_pipeline', label: 'a', entityKey: null, valueCents: null },
      ],
    }));
    const first = await getRevenueFlowBoard(NOW);
    const second = await getRevenueFlowBoard(NOW);
    expect(first.events.map((e) => e.classification)).toEqual(['bid_flagged', 'bid_suspect']);
    expect(second.events.map((e) => e.classification)).toEqual(first.events.map((e) => e.classification));
  });

  /**
   * Returned so an empty tail reads as "outside the window" rather than "nothing happened" —
   * two very different messages to put in front of someone judging the business.
   */
  it('declares the window it covers and passes it to the builders', async () => {
    const board = await getRevenueFlowBoard(NOW, 90);
    expect(board.windowDays).toBe(90);
    const passed = mem.buildMembershipFlow.mock.calls[0][0] as Date;
    expect(Math.round((NOW.getTime() - passed.getTime()) / 86_400_000)).toBe(90);
  });

  it('de-duplicates caveats, so a reader does not meet the same sentence three times', async () => {
    mem.buildMembershipFlow.mockResolvedValue(membershipFlow({
      stream: { ...membershipFlow().stream, caveat: 'Same sentence.' },
    }));
    gov.buildGovFlow.mockResolvedValue(govFlow({
      stream: { ...govFlow().stream, caveat: 'Same sentence.' },
      unpricedBids: 0,
    }));
    const board = await getRevenueFlowBoard(NOW);
    expect(board.caveats.filter((c) => c === 'Same sentence.')).toHaveLength(1);
  });
});
