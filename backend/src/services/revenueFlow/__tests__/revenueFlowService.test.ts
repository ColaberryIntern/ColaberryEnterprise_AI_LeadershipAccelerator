const mem = { buildMembershipFlow: jest.fn() };
const gov = { buildGovFlow: jest.fn() };
const dem = { getMembershipDemandPath: jest.fn() };
const dir = { getBrandDirectory: jest.fn() };

jest.mock('../membershipFlow', () => ({
  buildMembershipFlow: (...a: unknown[]) => mem.buildMembershipFlow(...a),
}));
jest.mock('../govBidFlow', () => ({
  buildGovFlow: (...a: unknown[]) => gov.buildGovFlow(...a),
}));
/**
 * Mocked because it queries. Before it was mocked here it ran for real against no database on
 * every test in this file, threw, and was swallowed into a caveat nothing asserted. Every test
 * still passed, which is precisely the failure this file exists to catch elsewhere: a check
 * that passes because there was nothing to check.
 */
jest.mock('../demandPathService', () => ({
  getMembershipDemandPath: (...a: unknown[]) => dem.getMembershipDemandPath(...a),
}));
/** Mocked for the same reason: it reads the brands table. */
jest.mock('../brandDirectoryService', () => ({
  getBrandDirectory: (...a: unknown[]) => dir.getBrandDirectory(...a),
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

/** Two bands in the shape `demandPath` builds them, small enough to read in an assertion. */
function demandPath() {
  return [
    {
      key: 'asked',
      label: 'Who we asked',
      definition: 'A campaign that went out.',
      attributionBreak: 'Nothing joins these to a payment.',
      sources: [{
        key: 'alumni:da243a23',
        label: 'Colaberry Alumni AI Champion Campaign',
        count: 10_343,
        countLabel: 'people asked',
        measures: [{ label: 'emails sent', count: 8_518, note: 'Emails, not people.' }],
        status: 'live',
        attributable: false,
        note: 'Reach only.',
        tone: 'muted',
      }],
    },
    {
      key: 'arrived',
      label: 'Where the people who pay came from',
      definition: 'The channel on the lead of each person who pays today.',
      attributionBreak: null,
      sources: [{
        key: 'open_house',
        label: 'Open house',
        count: 17,
        countLabel: 'paying members',
        measures: [{ label: 'leads ever recorded', count: 320, note: 'A crude denominator.' }],
        status: 'live',
        attributable: true,
        note: 'The open house produced more paying members than any other channel.',
        tone: 'good',
      }],
    },
  ];
}

beforeEach(() => {
  mem.buildMembershipFlow.mockReset();
  gov.buildGovFlow.mockReset();
  dem.getMembershipDemandPath.mockReset();
  dir.getBrandDirectory.mockReset();
  mem.buildMembershipFlow.mockResolvedValue(membershipFlow());
  gov.buildGovFlow.mockResolvedValue(govFlow());
  // Undefined by default, which is the state of every stream but membership, so the existing
  // assertions in this file keep measuring what they were written to measure.
  dem.getMembershipDemandPath.mockResolvedValue(undefined);
  dir.getBrandDirectory.mockResolvedValue([
    { slug: 'colaberry-training', name: 'Colaberry Training', url: 'https://training.colaberry.com', status: 'active' },
    { slug: 'colaberry-enterprise', name: 'Colaberry Enterprise', url: 'https://enterprise.colaberry.ai', status: 'active' },
    { slug: 'refactored', name: 'Refactored.ai', url: 'https://refactored.ai', status: 'active' },
  ]);
});

describe('the path in front of the membership number', () => {
  const membershipOf = async () => {
    const board = await getRevenueFlowBoard(NOW);
    return board.streams.find((s) => s.key === 'membership');
  };

  it('rides on the membership stream when it can be built', async () => {
    dem.getMembershipDemandPath.mockResolvedValue(demandPath());
    const stream = await membershipOf();
    expect(stream?.demand).toHaveLength(2);
    expect(stream?.demand?.map((b) => b.key)).toEqual(['asked', 'arrived']);
    expect(stream?.demand?.[1].sources[0].count).toBe(17);
  });

  /**
   * Undefined, not an empty array. An empty path would render as "nobody was asked and nobody
   * arrived", which is a claim; no path at all is the truth when nothing could be measured.
   */
  it('is absent rather than empty when there is nothing to show', async () => {
    dem.getMembershipDemandPath.mockResolvedValue(undefined);
    const stream = await membershipOf();
    expect(stream).toBeDefined();
    expect(stream?.demand).toBeUndefined();
  });

  it('never attaches to a stream whose demand nobody can measure', async () => {
    dem.getMembershipDemandPath.mockResolvedValue(demandPath());
    const board = await getRevenueFlowBoard(NOW);
    for (const s of board.streams.filter((x) => x.key !== 'membership')) {
      expect(s.demand).toBeUndefined();
    }
  });

  /**
   * `demandPath` throws by design when a band would claim a campaign earned money. The cost of
   * that has to be the band and a caveat, never the stream and never the page.
   */
  it('costs the band and not the page when it throws', async () => {
    dem.getMembershipDemandPath.mockRejectedValue(new Error('a campaign claimed attribution'));
    const board = await getRevenueFlowBoard(NOW);
    const stream = board.streams.find((s) => s.key === 'membership');
    expect(stream).toBeDefined();
    expect(stream?.headline.display).not.toBe('Cannot be read');
    expect(stream?.demand).toBeUndefined();
    expect(board.caveats.join(' ')).toMatch(/could not be built/);
    expect(board.caveats.join(' ')).toMatch(/a campaign claimed attribution/);
  });

  it('does not disturb the membership stream it attaches to', async () => {
    dem.getMembershipDemandPath.mockResolvedValue(demandPath());
    const stream = await membershipOf();
    const pristine = membershipFlow().stream as Record<string, unknown>;
    for (const field of ['key', 'label', 'status', 'provenance', 'drillDownKey']) {
      expect((stream as unknown as Record<string, unknown>)[field]).toEqual(pristine[field]);
    }
  });
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
  /**
   * These two assert that the FAILED stream is gone and the surviving one is still there,
   * rather than pinning the full stream list.
   *
   * They used to read `toEqual(['membership'])`, which was accurate when the board had
   * exactly two streams and became a false failure the moment a third arrived: the
   * declared-but-unbuilt sources read no database, so they survive any database failure and
   * are always present. Asserting the whole list made every new source look like a
   * regression in partial-failure handling, which is not what this describe block is about.
   */
  it('still renders membership when the government pipeline throws', async () => {
    gov.buildGovFlow.mockRejectedValue(new Error('gov_qualifications exploded'));
    const board = await getRevenueFlowBoard(NOW);
    const keys = board.streams.map((s) => s.key);
    expect(keys).toContain('membership');
    expect(keys).not.toContain('gov_pipeline');
    expect(board.caveats.join(' ')).toMatch(/government pipeline could not be built: gov_qualifications exploded/);
    expect(board.headline.possibleWinnings.display).toMatch(/Cannot be read/);
  });

  it('still renders the pipeline when membership throws', async () => {
    mem.buildMembershipFlow.mockRejectedValue(new Error('subscriptions exploded'));
    const board = await getRevenueFlowBoard(NOW);
    const keys = board.streams.map((s) => s.key);
    expect(keys).toContain('gov_pipeline');
    expect(keys).not.toContain('membership');
    expect(board.headline.bookedAnnualized.display).toMatch(/Cannot be read/);
  });

  /**
   * The converse, and the reason the idea streams are worth having on this board at all:
   * when both database-backed streams fail, the page still says what we are trying to build.
   * It also proves the streams really are database-free, which `buildIdeaFlows` only claims.
   */
  it('still renders the declared sources when both database streams throw', async () => {
    gov.buildGovFlow.mockRejectedValue(new Error('gov_qualifications exploded'));
    mem.buildMembershipFlow.mockRejectedValue(new Error('subscriptions exploded'));
    const board = await getRevenueFlowBoard(NOW);
    expect(board.streams.map((s) => s.key)).toEqual([
      'hypotheses', 'hire_fde', 'subscription_conversion',
    ]);
    // And not one of them invents a figure to fill the empty headline.
    for (const s of board.streams) expect(s.headline.cents).toBeNull();
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


describe('the board is broken down by brand', () => {
  /**
   * Ali, 2026-11-24: "Everything in the revenue tab should be broken down by brand."
   *
   * The assembly is the only place a brand is attached, by design: a builder returns a
   * `BuiltStream` with no brand and cannot invent one. So this is where the attachment is
   * proved, and where a stream reaching the page unbranded would be caught.
   */
  it('gives every stream a brand key', async () => {
    const board = await getRevenueFlowBoard(NOW);
    expect(board.streams.length).toBeGreaterThan(0);
    for (const s of board.streams) {
      expect(typeof s.brandKey).toBe('string');
      expect(s.brandKey.length).toBeGreaterThan(0);
    }
  });

  /**
   * R25 Phase 2. The strongest form of this check available: the figure keys are read off the
   * headline the service ACTUALLY BUILT, so a figure added to the headline without a declared
   * source fails here even though nothing else would notice.
   *
   * Why it matters: the frontend decides whether to show a top tile by asking which stream its
   * figure came from. An undeclared figure matches no brand, so a real number would vanish
   * from every brand-filtered view of the page with nothing logged anywhere.
   */
  it('declares the source stream of every figure it puts in the headline', async () => {
    const board = await getRevenueFlowBoard(NOW);

    const figures = Object.keys(board.headline)
      // The sentence that explains the win rate, not a figure of its own.
      .filter((k) => k !== 'winRateBasis')
      .sort();
    expect(figures.length).toBeGreaterThan(0);
    expect(Object.keys(board.headlineFigureStreams).sort()).toEqual(figures);

    // And each declared stream is one the board can actually group under a brand.
    // Widened to a string lookup deliberately: `figures` is read off the headline at run time
    // so that an undeclared figure is caught, which means it cannot be typed as the key union
    // that is itself derived from the headline.
    const declared: Record<string, string> = board.headlineFigureStreams;
    const streamKeys = board.streams.map((s) => s.key);
    for (const figure of figures) {
      const stream = declared[figure];
      expect(typeof stream).toBe('string');
      expect(streamKeys).toContain(stream);
    }
  });

  it('groups the streams under headings with nothing empty', async () => {
    const board = await getRevenueFlowBoard(NOW);
    expect(board.brands[0].key).toBe('colaberry-training');
    expect(board.brands.every((b) => b.streamKeys.length > 0)).toBe(true);
  });

  it('files membership under Colaberry Training and FDE hiring under Refactored', async () => {
    const board = await getRevenueFlowBoard(NOW);
    const brandOf = (k: string) => board.brands.find((b) => b.streamKeys.includes(k))?.key;
    expect(brandOf('membership')).toBe('colaberry-training');
    expect(brandOf('hire_fde')).toBe('refactored');
    expect(brandOf('gov_pipeline')).toBe('colaberry-enterprise');
  });

  it('accounts for every stream exactly once across the headings', async () => {
    const board = await getRevenueFlowBoard(NOW);
    const grouped = board.brands.flatMap((b) => b.streamKeys).sort();
    expect(grouped).toEqual(board.streams.map((s) => s.key).sort());
  });

  it('ships the basis for what a brand heading means', async () => {
    const board = await getRevenueFlowBoard(NOW);
    expect(board.brandBasis).toMatch(/property of the stream/i);
  });

  /**
   * A brands-table failure must cost the WORDING, never the grouping. The map lives in code,
   * so the page still groups correctly and each heading says its name may be stale.
   */
  it('still groups when the brands table cannot be read, and flags the names as fallbacks', async () => {
    dir.getBrandDirectory.mockRejectedValue(new Error('connection refused'));
    const board = await getRevenueFlowBoard(NOW);

    expect(board.brands.length).toBeGreaterThan(0);
    expect(board.brands.find((b) => b.key === 'colaberry-training')!.label)
      .toBe('Colaberry Training');
    expect(board.brands.filter((b) => b.isBrand).every((b) => b.resolved === false)).toBe(true);
    expect(board.caveats.some((c) => /brands table could not be read/i.test(c))).toBe(true);
  });

  /** Positive control: with the directory present the same assertion flips. */
  it('control: a working directory marks the headings resolved', async () => {
    const board = await getRevenueFlowBoard(NOW);
    expect(board.brands.filter((b) => b.isBrand).every((b) => b.resolved === true)).toBe(true);
  });

  it('puts no money on a brand heading', async () => {
    const board = await getRevenueFlowBoard(NOW);
    expect(JSON.stringify(board.brands)).not.toMatch(/cents/i);
  });
});
