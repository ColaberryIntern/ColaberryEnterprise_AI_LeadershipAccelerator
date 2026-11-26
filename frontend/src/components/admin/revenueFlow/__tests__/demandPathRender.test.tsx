import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import StreamCard from '../StreamCard';
import DemandPath from '../DemandPath';
import DemandSourceDetail, { statusReading } from '../DemandSourceDetail';
import StreamTimelinePanel from '../StreamTimelinePanel';
import FlowTimeline from '../FlowTimeline';
import type { TimelineClassification, TimelineEvent } from '../FlowTimeline';
import type { ClassMap, DemandBand, DemandSource, Stream } from '../flowBoardTypes';

/**
 * R24 Phase 3 acceptance: the path renders in front of the number, and the drill-in exists.
 *
 * Ali, 2026-11-23: "Can we show that so we can see the path before they reach the final revenue
 * number. Also when i drill into a source, I want to see a timeline of all color coordinated
 * events."
 *
 * These test the things that break SILENTLY. A headline moved back above the funnel, a band
 * that acquires a dollar figure, a null measure rendered as zero, the attribution break removed
 * as clutter, a legend that stops being scoped, a timeline cut off without saying so: every one
 * of those looks like tidying in a diff and like a working page on screen.
 *
 * No click is simulated anywhere here. `@testing-library/react` is not a dependency of this
 * frontend and adding one is escalation-tier, so the panels are pure functions of their props
 * and both states of each drill-in are reached by passing them.
 */

const CLASSES: ClassMap = {
  member_started: { key: 'member_started', label: 'Member started paying', tone: 'good', glyph: '▲', direction: 'in' },
  never_paid: { key: 'never_paid', label: 'Signed up, never paid', tone: 'warn', glyph: '○', direction: 'none' },
  refunded: { key: 'refunded', label: 'Refunded', tone: 'danger', glyph: '⤺', direction: 'out' },
};

const source = (over: Partial<DemandSource> = {}): DemandSource => ({
  key: 'alumni_re_engagement:ab12cd34',
  label: 'Alumni Re-Engagement',
  count: 557,
  countLabel: 'people asked',
  measures: [
    { label: 'Emails sent', count: 1200, note: 'Sends, not people. This campaign emailed its list more than once.' },
    { label: 'Opened', count: 201, note: 'Opens recorded by the mail provider.' },
    { label: 'Converted', count: null, note: 'Nothing writes this outcome, so it is not recorded rather than zero.' },
  ],
  status: 'live',
  attributable: false,
  note: 'Active, and the only alumni campaign still sending.',
  tone: 'muted',
  ...over,
});

const channel = (over: Partial<DemandSource> = {}): DemandSource => ({
  key: 'open_house',
  label: 'Open house',
  count: 17,
  countLabel: 'paying members',
  measures: [{ label: 'Leads', count: 320, note: 'Registrations linked to an enrollment.' }],
  status: 'live',
  attributable: true,
  note: 'The largest single channel into membership.',
  tone: 'good',
  ...over,
});

const BREAK = 'Nothing records that a subscription exists because a campaign asked for it.';

const bands = (over: Partial<DemandBand>[] = []): DemandBand[] => [
  {
    key: 'asked',
    label: 'Who we asked',
    definition: 'Campaign reach. This is not revenue and cannot be added to it.',
    sources: [source()],
    attributionBreak: BREAK,
    ...(over[0] ?? {}),
  },
  {
    key: 'arrived',
    label: 'Who arrived and paid',
    definition: 'The channel each paying member is recorded against.',
    sources: [channel()],
    attributionBreak: null,
    ...(over[1] ?? {}),
  },
];

const stream = (over: Partial<Stream> = {}): Stream => ({
  key: 'membership',
  label: 'Membership',
  brandKey: 'colaberry-training',
  status: 'live',
  headline: { cents: 7_881_600, display: '$78,816', provenance: 'Active rows carrying a PaySimple payment id.' },
  funnel: [
    {
      key: 'signed_up',
      label: 'Signed up',
      count: 274,
      value: { cents: null, display: 'not revenue', provenance: 'subscriptions' },
      classification: 'never_paid',
      definition: 'A subscriptions row exists.',
    },
    {
      key: 'paying',
      label: 'Paying',
      count: 33,
      value: { cents: 7_881_600, display: '$78,816', provenance: 'subscriptions' },
      classification: 'member_started',
      definition: 'Carries a payment id.',
    },
  ],
  provenance: 'Measured from subscriptions on 2026-11-23.',
  caveat: null,
  drillDownKey: 'membership',
  demand: bands(),
  ...over,
});

const ev = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  at: '2026-11-12',
  classification: 'member_started',
  stream: 'membership',
  label: 'monthly member started',
  entityKey: 's-1',
  valueCents: 19_900,
  ...over,
});

/**
 * `StaticRouter`, not `MemoryRouter`. The card renders a `<Link>`, whose navigate hook runs a
 * layout effect that React warns about under `renderToStaticMarkup`. The warning is harmless
 * and this suite passed with it, but a suite that prints a page of stack trace on every run
 * trains everyone reading CI to skim past warnings, which is how a real one gets missed.
 */
const card = (s: Stream, events: TimelineEvent[] = [ev()]) => renderToStaticMarkup(
  <StaticRouter location="/admin/revenue-room">
    <StreamCard stream={s} events={events} classMap={CLASSES} windowDays={180} />
  </StaticRouter>,
);

const path = (b: DemandBand[], open: string | null = null) => renderToStaticMarkup(
  <DemandPath streamKey="membership" bands={b} openSourceKey={open} onPickSource={() => {}} />,
);

describe('the path is in front of the number, not behind it', () => {
  /**
   * The ask, as an index comparison. This card printed its headline in the header until
   * 2026-11-23, so the page read conclusion-then-working. Moving it back would break nothing
   * else that is asserted anywhere.
   */
  it('renders the demand path, then the funnel, then the revenue figure', () => {
    const html = card(stream());
    const demand = html.indexOf('data-testid="demand-path-membership"');
    const stage = html.indexOf('data-testid="stage-membership-signed_up"');
    const headline = html.indexOf('data-testid="headline-membership"');
    expect(demand).toBeGreaterThan(-1);
    expect(stage).toBeGreaterThan(demand);
    expect(headline).toBeGreaterThan(stage);
  });

  it('labels the figure so a number at the foot of a card is not mistaken for a total', () => {
    expect(card(stream())).toContain('What this stream is worth');
  });

  /**
   * A stream with no measurable demand path must render no band at all. An empty band would
   * read as "nobody was asked", which is a claim about the business rather than about the data,
   * and five of the six streams on this board are in exactly that position.
   */
  it('draws nothing where there is no demand path, rather than an empty band', () => {
    const html = card(stream({ key: 'gov_pipeline', demand: undefined, drillDownKey: null }));
    expect(html).not.toContain('demand-path-');
    expect(html).not.toContain('demand-break-');
    expect(html).toContain('data-testid="headline-gov_pipeline"');
  });

  it('keeps the existing drill-down link beside the new timeline toggle', () => {
    const html = card(stream());
    expect(html).toContain('data-testid="drill-membership"');
    expect(html).toContain('data-testid="timeline-toggle-membership"');
  });
});

describe('the break between the bands is drawn, not footnoted', () => {
  it('states the break and carries the sentence the backend sent', () => {
    const html = path(bands());
    expect(html).toContain('the chain of evidence stops here');
    expect(html).toContain(BREAK);
  });

  /** It belongs between the two bands. Below both, it would read as a caveat on the channels. */
  it('places the break after the asked band and before the arrived band', () => {
    const html = path(bands());
    const asked = html.indexOf('data-testid="demand-band-membership-asked"');
    const brk = html.indexOf('data-testid="demand-break-membership"');
    const arrived = html.indexOf('data-testid="demand-band-membership-arrived"');
    expect(asked).toBeGreaterThan(-1);
    expect(brk).toBeGreaterThan(asked);
    expect(arrived).toBeGreaterThan(brk);
  });

  it('draws exactly one break, because only the asked band carries one', () => {
    const html = path(bands());
    expect(html.split('data-testid="demand-break-membership"').length - 1).toBe(1);
  });
});

describe('a band never carries a money figure', () => {
  /**
   * Structural, not stylistic. `channelTruth` can total the MRR of a channel's members, but
   * this stream's headline is derived per person and annualized, so the two do not reconcile.
   * Two revenue figures disagreeing by a reconciliation step on one screen is how a reader
   * stops trusting both.
   */
  it('renders no dollar amount anywhere in the path', () => {
    expect(path(bands())).not.toContain('$');
  });

  it('renders none in an expanded source detail either', () => {
    expect(path(bands(), source().key)).not.toContain('$');
  });

  /**
   * The positive control for the two assertions above. A check for an absence passes just as
   * happily when it is looking in the wrong place, so this proves the same render WOULD show a
   * dollar figure if one reached it.
   */
  it('control: the same render does surface a figure that is present in the data', () => {
    const withMoney = bands([{ sources: [source({ note: 'worth $199 a month' })] }]);
    expect(path(withMoney, source().key)).toContain('$199');
  });
});

describe('a measure nobody records is not zero', () => {
  const detail = renderToStaticMarkup(
    <DemandSourceDetail streamKey="membership" source={source()} />,
  );

  it('says it is not recorded', () => {
    expect(detail).toContain('Not recorded');
  });

  /**
   * `interaction_outcomes.outcome = 'converted'` returned 0 rows across all four campaigns
   * because nothing writes that vocabulary. Printing 0 would turn a missing instrument into a
   * measured failure.
   */
  it('prints no digit for it', () => {
    const converted = detail.slice(detail.indexOf('Converted'));
    const cell = converted.slice(0, converted.indexOf('</tr>'));
    expect(cell).not.toMatch(/>\s*0\s*</);
  });

  it('shows the recorded measures as numbers', () => {
    // Comma separated since R27, on Ali's instruction: 1200 reads as a part number and
    // 1,200 reads as a quantity. The figure is unchanged; only its formatting is.
    expect(detail).toContain('1,200');
    expect(detail).toContain('201');
  });

  it('says sends are not people, because 1,200 sends went to 557 people', () => {
    expect(detail).toContain('Sends, not people');
  });
});

describe('a demand source explains why it has no timeline of its own', () => {
  const campaignDetail = renderToStaticMarkup(
    <DemandSourceDetail streamKey="membership" source={source()} />,
  );
  const channelDetail = renderToStaticMarkup(
    <DemandSourceDetail streamKey="membership" source={channel()} />,
  );

  /**
   * The honest half of the ask. A campaign has no dated row tying it to a person, so an empty
   * timeline here would read as "this campaign produced nothing" when the absence is a fact
   * about the schema.
   */
  it('says a campaign keeps running totals only', () => {
    expect(campaignDetail).toContain('no dated events exist for this source');
    expect(campaignDetail).toContain('running totals only');
  });

  it('says a channel is tied to payers but is not carried on the event', () => {
    expect(channelDetail).toContain('not split by channel');
  });

  it('distinguishes the two cases rather than printing one sentence for both', () => {
    expect(campaignDetail).not.toContain('not split by channel');
    expect(channelDetail).not.toContain('running totals only');
  });

  it('reads a measurement state in the words of its own declaration', () => {
    expect(statusReading('measured_zero')).toContain('genuinely zero');
    expect(statusReading('unmeasurable')).toContain('Nothing of the right shape');
  });

  /** An unknown status falls through to its raw key rather than being glossed into a guess. */
  it('does not invent a reading for a status it does not know', () => {
    expect(statusReading('not_a_status')).toBe('not_a_status');
  });
});

describe('the drilled-in timeline is scoped to the source', () => {
  const panel = (events: TimelineEvent[], focus: string | null = null) => renderToStaticMarkup(
    <StreamTimelinePanel
      streamKey="membership"
      streamLabel="Membership"
      events={events}
      classMap={CLASSES}
      focusEntityKey={focus}
      onPickEntity={() => {}}
      onClearFocus={() => {}}
      windowDays={180}
    />,
  );

  /**
   * The legend at the top of the board explains every classification on it. Beside one
   * stream's timeline that is noise at best: it names outcomes this stream cannot produce.
   */
  it('lists only the classifications these events actually carry', () => {
    const html = panel([ev(), ev({ classification: 'never_paid', entityKey: 's-2' })]);
    expect(html).toContain('Member started paying');
    expect(html).toContain('Signed up, never paid');
    expect(html).not.toContain('Refunded');
  });

  it('gives every scoped tone its word, so identity is never colour alone', () => {
    const html = panel([ev(), ev({ classification: 'never_paid', entityKey: 's-2' })]);
    expect(html).toContain('(Good)');
    expect(html).toContain('(Needs attention)');
  });

  /**
   * `FlowTimeline` has carried `onPickEntity` since R16 with no caller, so every pill rendered
   * unclickable. This panel is the first caller; the role is what makes it reachable.
   */
  it('makes each pill operable, which no caller did before', () => {
    expect(panel([ev()])).toContain('role="button"');
  });

  it('hides the rest of the stream when one record is focused, and offers a way back', () => {
    const html = panel([ev({ label: 'first member' }), ev({ entityKey: 's-2', label: 'second member' })], 's-2');
    expect(html).toContain('second member');
    expect(html).not.toContain('first member');
    expect(html).toContain('data-testid="stream-focus-clear-membership"');
  });
});

describe('a cut-off timeline says it is cut off', () => {
  const manyDays = Array.from({ length: 6 }, (_, i) => ev({
    at: `2026-11-0${i + 1}`,
    entityKey: `s-${i}`,
  }));

  /**
   * `maxDays` dropped the remainder in silence until 2026-11-23. The reader saw the oldest
   * drawn day and read the window as having started there, on a surface whose whole doctrine is
   * that an absence must explain itself.
   */
  it('names how many active days are not drawn', () => {
    const html = renderToStaticMarkup(
      <FlowTimeline events={manyDays} classifications={CLASSES} maxDays={4} />,
    );
    expect(html).toContain('data-testid="flow-timeline-truncated"');
    expect(html).toContain('this timeline is cut off');
    expect(html).toContain('2 earlier days');
  });

  it('says day, not days, when exactly one is hidden', () => {
    const html = renderToStaticMarkup(
      <FlowTimeline events={manyDays} classifications={CLASSES} maxDays={5} />,
    );
    expect(html).toContain('1 earlier day');
  });

  it('stays silent when nothing is hidden', () => {
    const html = renderToStaticMarkup(
      <FlowTimeline events={manyDays} classifications={CLASSES} maxDays={6} />,
    );
    expect(html).not.toContain('cut off');
  });
});

/**
 * R27 — the two sub-KPIs on a campaign tile.
 *
 * Ali, 25 Nov 2026: "show bottom left and right sub kpi's showing the read and click rates and
 * format the numbers with commas."
 *
 * The click was recorded all along and simply never read. These cover the ways a rate on a
 * card becomes a lie: a zero denominator printed as 0%, a rate shown without the numbers that
 * made it, and a rate appearing on a channel, which sends nothing.
 */
const RATES = [
  {
    key: 'read_rate',
    label: 'read rate',
    numerator: 1191,
    denominator: 8518,
    display: '14.0%',
    basis: 'opened over emails sent',
    defined: true,
  },
  {
    key: 'click_rate',
    label: 'click rate',
    numerator: 420,
    denominator: 8518,
    display: '4.9%',
    basis: 'clicked over emails sent',
    defined: true,
  },
];

const campaignBand = (rates: DemandSource['rates']): DemandBand[] => [{
  key: 'asked',
  label: 'Who we asked',
  definition: 'Campaigns that went out.',
  attributionBreak: null,
  sources: [{
    key: 'alumni_champion',
    label: 'Colaberry Alumni AI Champion Campaign',
    count: 10343,
    countLabel: 'people asked',
    measures: [{ label: 'emails sent', count: 8518, note: 'Emails, not people.' }],
    rates,
    status: 'live',
    attributable: false,
    note: 'Reach only.',
    tone: 'info',
  }],
}];

describe('a campaign tile carries its read and click rates', () => {
  it('puts the read rate first and the click rate second', () => {
    const html = path(campaignBand(RATES));
    expect(html).toContain('data-testid="demand-rates-membership-alumni_champion"');
    const read = html.indexOf('demand-rate-membership-alumni_champion-read_rate');
    const click = html.indexOf('demand-rate-membership-alumni_champion-click_rate');
    expect(read).toBeGreaterThan(-1);
    expect(click).toBeGreaterThan(read);
    expect(html).toContain('14.0%');
    expect(html).toContain('4.9%');
  });

  /**
   * A rate without its basis is the easiest number on this page to misuse: 14% over 8,518
   * emails and 14% over 7 are the same figure and not the same fact.
   */
  it('shows the numerator and denominator under each rate, with commas', () => {
    const html = path(campaignBand(RATES));
    expect(html).toContain('1,191');
    expect(html).toContain('8,518');
    expect(html).toContain('420');
  });

  it('prints words, not 0 percent, when nothing has been sent', () => {
    const undefinedRates = RATES.map((r) => ({
      ...r, numerator: 0, denominator: 0, display: 'No emails sent yet', defined: false,
    }));
    const html = path(campaignBand(undefinedRates));
    expect(html).toContain('No emails sent yet');
    expect(html).not.toContain('0.0%');
    // And no basis line, because there is no basis to show.
    expect(html).not.toContain('0 of 0');
  });

  it('draws no rate row on a source that has none', () => {
    // A channel sends nothing, so it has no denominator and a read rate there would be a
    // number about something that did not happen.
    const html = path(campaignBand(undefined));
    expect(html).not.toContain('data-testid="demand-rates-membership-alumni_champion"');
    // The control: the tile itself rendered.
    expect(html).toContain('data-testid="demand-source-membership-alumni_champion"');
  });
});

describe('counts on the demand path read as quantities', () => {
  it('separates thousands on the headline count', () => {
    const html = path(campaignBand(RATES));
    expect(html).toContain('10,343');
    expect(html).not.toContain('>10343<');
  });
});
