import {
  ATTRIBUTION_BREAK,
  CampaignReachRow,
  assertDemandPathIsHonest,
  buildDemandBands,
  campaignSource,
  campaignStatus,
  campaignTone,
  channelSource,
  channelTone,
  includeChannel,
  rateOf,
} from '../demandPath';
import type { ChannelRow } from '../../revenueRoom/channelTruth';

/**
 * The path in front of the membership number.
 *
 * These test the things that can break SILENTLY and still look right on screen: a campaign
 * appearing to have earned money, the attribution gap quietly closing, a channel that cost
 * money and produced nobody being dropped as noise, or a count of emails read as a count of
 * people.
 */
const campaign = (over: Partial<CampaignReachRow> = {}): CampaignReachRow => ({
  key: 'alumni:da243a23',
  name: 'Colaberry Alumni AI Champion Campaign',
  status: 'paused',
  approvalStatus: 'live',
  enrolledLeads: 10_343,
  sent: 8_518,
  opened: 1_191,
  replied: 3,
  ...over,
});

const channel = (over: Partial<ChannelRow> = {}): ChannelRow => ({
  key: 'open_house',
  label: 'Open house',
  leads: 320,
  payingMembers: 17,
  mrrCents: 338_300,
  spendCents: null,
  costPerPayingMemberCents: null,
  status: 'live',
  costStatus: 'unmeasurable',
  note: 'The open house produced more paying members than every other channel together.',
  ...over,
});

describe('a campaign never reads as revenue', () => {
  /**
   * The load-bearing absence. `DemandSource` has no money field, so a band cannot grow a
   * second opinion about revenue even if someone later wants it to. Asserted structurally
   * rather than left to the type, because a type is not what ships.
   */
  it('carries no money field of any kind', () => {
    const keys = Object.keys(campaignSource(campaign()));
    for (const banned of ['value', 'valueCents', 'cents', 'mrrCents', 'money', 'revenue']) {
      expect(keys).not.toContain(banned);
    }
  });

  it('is never marked attributable, however much it sent', () => {
    expect(campaignSource(campaign({ sent: 8_518 })).attributable).toBe(false);
    expect(campaignSource(campaign({ sent: 0 })).attributable).toBe(false);
  });

  it('refuses to build a path where a campaign claims attribution', () => {
    const bands = buildDemandBands([campaign()], [channel()]);
    bands[0].sources[0].attributable = true;
    expect(() => assertDemandPathIsHonest(bands)).toThrow(/marked attributable/);
  });

  /**
   * Measured on production 2026-11-23: the alumni re-engagement campaign sent 1,200 emails to
   * 557 people. Two columns of bare numbers invite a reader to subtract them, so the headline
   * count says what it counts and the sent measure says it is emails.
   */
  it('says plainly that sends are emails and not people', () => {
    const s = campaignSource(campaign({ enrolledLeads: 557, sent: 1_200 }));
    expect(s.count).toBe(557);
    expect(s.countLabel).toBe('people asked');
    const sent = s.measures.find((m) => m.label === 'emails sent');
    expect(sent?.count).toBe(1_200);
    expect(sent?.note).toMatch(/not people/i);
  });

  /**
   * `interaction_outcomes` has a `converted` outcome and nothing writes it. Reporting 0 would
   * be a real-looking number whose meaning is "no writer exists".
   */
  it('reports conversions as not recorded rather than as zero', () => {
    const converted = campaignSource(campaign()).measures.find((m) => m.label === 'converted');
    expect(converted).toBeDefined();
    expect(converted?.count).toBeNull();
    expect(converted?.note).toMatch(/not recorded/i);
    expect(converted?.note).not.toMatch(/\b0\b/);
  });
});

describe('a campaign that is running and has sent nothing is a finding', () => {
  /**
   * Measured on production 2026-11-23: `Open House Follow-up (Maya)` is active and approved,
   * holds 233 enrolled people, and has sent zero emails. That is the one case where an
   * activity row earns a colour, because it is a thing to fix rather than a thing to scroll
   * past.
   */
  const silent = campaign({
    key: 'open_house_followup:0dd752f2',
    name: 'Open House Follow-up (Maya)',
    status: 'active',
    approvalStatus: 'approved',
    enrolledLeads: 233,
    sent: 0,
    opened: 0,
    replied: 0,
  });

  it('is measured_zero, not unmeasurable: the audience exists and the sending does not', () => {
    expect(campaignStatus(silent)).toBe('measured_zero');
  });

  it('wears a warning tone', () => {
    expect(campaignTone(silent)).toBe('warn');
  });

  it('says both halves in its note', () => {
    const note = campaignSource(silent).note;
    expect(note).toMatch(/233 people/);
    expect(note).toMatch(/sent nothing/i);
  });

  it('a campaign with no audience at all is unmeasurable instead', () => {
    const empty = campaign({ enrolledLeads: 0, sent: 0, opened: 0, replied: 0 });
    expect(campaignStatus(empty)).toBe('unmeasurable');
    expect(campaignTone(empty)).toBe('muted');
  });

  /**
   * Reply rate is deliberately not judged. Replies are recorded for some channels and not
   * others, so a zero can be a property of the recorder; painting it as a failure would be
   * this module inventing a finding.
   */
  it('does not paint a campaign with sends and no replies as a failure', () => {
    expect(campaignTone(campaign({ sent: 8_518, replied: 0 }))).toBe('muted');
  });
});

describe('the gap between the bands is drawn, not omitted', () => {
  it('puts the break on the asked band and not on the arrived band', () => {
    const [asked, arrived] = buildDemandBands([campaign()], [channel()]);
    expect(asked.key).toBe('asked');
    expect(asked.attributionBreak).toBe(ATTRIBUTION_BREAK);
    expect(arrived.key).toBe('arrived');
    expect(arrived.attributionBreak).toBeNull();
  });

  it('names the column that is missing, so a reader can ask for it', () => {
    expect(ATTRIBUTION_BREAK).toMatch(/enrollment_id/);
    expect(ATTRIBUTION_BREAK).toMatch(/no campaign, source or UTM column/);
  });

  it('refuses a path whose asked band has lost its break', () => {
    const bands = buildDemandBands([campaign()], [channel()]);
    bands[0].attributionBreak = null;
    expect(() => assertDemandPathIsHonest(bands)).toThrow(/must carry the attribution break/);
  });

  /**
   * The reverse mistake is just as wrong and less obvious: a break on the arrived band would
   * understate what IS known, which is the channel of every single person paying today.
   */
  it('refuses a break on the arrived band', () => {
    const bands = buildDemandBands([campaign()], [channel()]);
    bands[1].attributionBreak = 'this should not be here';
    expect(() => assertDemandPathIsHonest(bands)).toThrow(/must not carry an attribution break/);
  });

  it('the bands are in reading order: what we did, then who arrived', () => {
    expect(buildDemandBands([], []).map((b) => b.key)).toEqual(['asked', 'arrived']);
  });
});

describe('a channel that cost money and produced nobody cannot be scrolled past', () => {
  const paidAds = channel({
    key: 'paid_landing',
    label: 'Paid ads and landing pages',
    leads: 262,
    payingMembers: 0,
    mrrCents: 0,
    spendCents: 389_480,
    status: 'measured_zero',
    note: 'Recorded spend and no paying member. Measured, not an absence.',
  });

  it('keeps it in the band', () => {
    expect(includeChannel(paidAds)).toBe(true);
  });

  it('paints it as a warning rather than as nothing', () => {
    expect(channelTone(paidAds)).toBe('warn');
  });

  it('drops a channel that neither produced a payer nor cost anything', () => {
    expect(includeChannel(channel({ payingMembers: 0, spendCents: null }))).toBe(false);
  });

  it('keeps a channel that produced payers', () => {
    expect(includeChannel(channel({ payingMembers: 17 }))).toBe(true);
    expect(channelTone(channel({ payingMembers: 17 }))).toBe('good');
  });
});

describe('the arrived band forms no second opinion about channels', () => {
  /**
   * Status and note are read straight off the ChannelRow. That is the whole reason this band
   * reads `channelTruth` instead of re-querying: the band and the channel panel further down
   * the same page are then structurally unable to disagree.
   */
  it('passes the row\'s own status and note through unchanged', () => {
    const row = channel({
      status: 'proxy',
      note: 'A sentence that exists only in this fixture, so it cannot have been recomputed.',
    });
    const s = channelSource(row);
    expect(s.status).toBe('proxy');
    expect(s.note).toBe(row.note);
  });

  it('counts paying members, and reports leads as the crude denominator it is', () => {
    const s = channelSource(channel({ payingMembers: 17, leads: 320 }));
    expect(s.count).toBe(17);
    expect(s.countLabel).toBe('paying members');
    const leads = s.measures.find((m) => m.label === 'leads ever recorded');
    expect(leads?.count).toBe(320);
    expect(leads?.note).toMatch(/crude/i);
  });

  it('marks a channel attributable, because it is', () => {
    expect(channelSource(channel()).attributable).toBe(true);
  });

  it('carries no money field either, though the row it came from has three', () => {
    const keys = Object.keys(channelSource(channel()));
    for (const banned of ['mrrCents', 'spendCents', 'costPerPayingMemberCents', 'value']) {
      expect(keys).not.toContain(banned);
    }
  });
});

describe('the path renders the same way twice', () => {
  it('orders campaigns by people asked, descending', () => {
    const [asked] = buildDemandBands(
      [
        campaign({ key: 'b:2', enrolledLeads: 233 }),
        campaign({ key: 'a:1', enrolledLeads: 10_343 }),
        campaign({ key: 'c:3', enrolledLeads: 557 }),
      ],
      [],
    );
    expect(asked.sources.map((s) => s.count)).toEqual([10_343, 557, 233]);
  });

  it('breaks a tie on the key, so a screenshot is reproducible', () => {
    const [asked] = buildDemandBands(
      [campaign({ key: 'z:9', enrolledLeads: 5 }), campaign({ key: 'a:1', enrolledLeads: 5 })],
      [],
    );
    expect(asked.sources.map((s) => s.key)).toEqual(['a:1', 'z:9']);
  });

  it('does not mutate its inputs', () => {
    const rows = [campaign({ key: 'b:2', enrolledLeads: 1 }), campaign({ key: 'a:1', enrolledLeads: 9 })];
    buildDemandBands(rows, []);
    expect(rows.map((r) => r.key)).toEqual(['b:2', 'a:1']);
  });
});

describe('the honesty assertion bites', () => {
  it('rejects two sources sharing a key in one band', () => {
    const bands = buildDemandBands([campaign({ key: 'same:1' }), campaign({ key: 'same:1' })], []);
    expect(() => assertDemandPathIsHonest(bands)).toThrow(/share the key/);
  });

  it('allows the same key in both bands, which is a different thing', () => {
    const bands = buildDemandBands(
      [campaign({ key: 'open_house' })],
      [channel({ key: 'open_house' })],
    );
    expect(() => assertDemandPathIsHonest(bands)).not.toThrow();
  });

  it('rejects a negative count', () => {
    const bands = buildDemandBands([campaign()], []);
    bands[0].sources[0].count = -1;
    expect(() => assertDemandPathIsHonest(bands)).toThrow(/count of -1/);
  });

  it('rejects a negative measure, while still allowing null', () => {
    const bands = buildDemandBands([campaign()], []);
    bands[0].sources[0].measures[0].count = -4;
    expect(() => assertDemandPathIsHonest(bands)).toThrow(/count of -4/);
  });

  it('passes a path built from the real production shape', () => {
    const bands = buildDemandBands(
      [
        campaign({ key: 'alumni:da243a23', enrolledLeads: 10_343, sent: 8_518, opened: 1_191, replied: 3 }),
        campaign({ key: 'alumni_re_engagement:56bf7412', enrolledLeads: 557, sent: 1_200, opened: 201, replied: 0 }),
        campaign({ key: 'open_house_countdown:45c68da0', enrolledLeads: 316, sent: 300, opened: 106, replied: 0 }),
        campaign({ key: 'open_house_followup:0dd752f2', enrolledLeads: 233, sent: 0, opened: 0, replied: 0 }),
      ],
      [
        channel({ key: 'open_house', payingMembers: 17 }),
        channel({ key: 'ccpp_alumni', label: 'CCPP alumni', payingMembers: 8 }),
        channel({ key: 'ccpp_winback', label: 'CCPP winback', payingMembers: 8 }),
      ],
    );
    expect(() => assertDemandPathIsHonest(bands)).not.toThrow();
    expect(bands[0].sources).toHaveLength(4);
    expect(bands[1].sources).toHaveLength(3);
    // The arrived band's counts are the people paying today, and they sum to that number.
    expect(bands[1].sources.reduce((a, s) => a + s.count, 0)).toBe(33);
  });
});

/**
 * R27 — read rate and click rate on a campaign card.
 *
 * Ali, 25 Nov 2026: "show bottom left and right sub kpi's showing the read and click rates".
 *
 * The click was recorded all along and never read: `interaction_outcomes` held 5,838 `clicked`
 * rows against 14,036 `opened` on the day this was built. So both rates come from the same
 * table and the same column, and a click rate rests on exactly the instrument a read rate does.
 *
 * These cover the ways a rate becomes a lie: a zero denominator printed as 0%, a rate quoted
 * without its basis, and a missing count rendering as a confident NaN.
 */
describe('a campaign rate carries the numbers that made it', () => {
  it('computes a percentage with its numerator and denominator', () => {
    const r = rateOf('read_rate', 'read rate', 1191, 8518, 'opened over emails sent');
    expect(r.defined).toBe(true);
    expect(r.display).toBe('14.0%');
    expect(r.numerator).toBe(1191);
    expect(r.denominator).toBe(8518);
    expect(r.basis).toBe('opened over emails sent');
  });

  /**
   * The one that matters. 0% claims nobody read it; the truth is that nothing was sent to be
   * read. Same reasoning as the government card's null win rate.
   */
  it('refuses to call a zero denominator 0 percent', () => {
    const r = rateOf('click_rate', 'click rate', 0, 0, 'clicked over emails sent');
    expect(r.defined).toBe(false);
    expect(r.display).toBe('No emails sent yet');
    expect(r.display).not.toContain('0%');
  });

  it('never renders a missing count as NaN', () => {
    // A count that arrives undefined would divide into "NaN%", which looks like a figure.
    const r = rateOf('click_rate', 'click rate', undefined as unknown as number, 100, 'x');
    expect(r.display).toBe('0.0%');
    expect(r.display).not.toContain('NaN');
    expect(r.numerator).toBe(0);
  });

  it('is zero percent when nothing was opened but something was sent', () => {
    // The control for the undefined case above: a real measured zero IS 0%, and must not be
    // confused with the undefined one.
    const r = rateOf('read_rate', 'read rate', 0, 500, 'opened over emails sent');
    expect(r.defined).toBe(true);
    expect(r.display).toBe('0.0%');
  });
});

describe('a campaign source carries both rates, a channel carries none', () => {
  const campaign = {
    key: 'alumni_champion',
    name: 'Colaberry Alumni AI Champion Campaign',
    status: 'paused',
    approvalStatus: 'live',
    enrolledLeads: 10343,
    sent: 8518,
    opened: 1191,
    replied: 3,
    clicked: 420,
  };

  it('puts read rate first and click rate second, for bottom left and bottom right', () => {
    const s = campaignSource(campaign);
    expect(s.rates.map((r) => r.key)).toEqual(['read_rate', 'click_rate']);
    expect(s.rates[0].display).toBe('14.0%');
    expect(s.rates[1].display).toBe('4.9%');
  });

  it('divides both by emails sent, so a rate can never exceed 100 percent', () => {
    // Dividing an event count by PEOPLE would break the moment a sequence sends twice.
    const s = campaignSource({ ...campaign, opened: 9000 });
    expect(s.rates[0].denominator).toBe(8518);
    expect(s.rates.every((r) => r.basis.includes('emails sent'))).toBe(true);
  });

  it('reports both as undefined on a campaign that has sent nothing', () => {
    const s = campaignSource({ ...campaign, sent: 0, opened: 0, clicked: 0 });
    expect(s.rates.every((r) => r.defined === false)).toBe(true);
    expect(s.rates.every((r) => r.display === 'No emails sent yet')).toBe(true);
  });
});
