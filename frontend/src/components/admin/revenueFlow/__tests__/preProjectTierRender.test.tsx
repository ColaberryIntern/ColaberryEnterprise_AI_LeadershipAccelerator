import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import StreamCard from '../StreamCard';
import PreProjectTierBlock from '../PreProjectTierBlock';
import type { ClassMap, PreProjectTier, Stream } from '../flowBoardTypes';

/**
 * R12 — the government pipeline behind the pipeline, as the page renders it.
 *
 * The ticket's gate was to find out WHY the assessment-stage rows have no delivery project
 * before linking any. Measured on production: a project is created at approval, and 0 of 246
 * rows at the two pre-approval stages has ever carried one. So the ticket's branch applies —
 * "render them as a count with no names rather than pretending they are nameable
 * opportunities" — and these tests cover the ways that rendering could become a lie:
 *
 *   - a dollar figure appearing beside a count of unassessed opportunities, which is how
 *     "pipeline behind pipeline" silently becomes "pipeline"
 *   - the count rendered with no explanation, so the missing names read as a page that failed
 *     to load rather than as a known gap
 *   - the block drawn as a funnel row, which would assert a flow of 14 into 14
 *   - a lifecycle change passing unmentioned
 */
const TIER: PreProjectTier = {
  count: 14,
  linkedCount: 0,
  nameableCount: 0,
  label: 'Being assessed, not yet a pursuit',
  definition:
    'gov_qualifications at decision=needs_evidence and status=active. The AI vetting has read '
    + 'the opportunity and asked for more evidence before a bid/no-bid call. It is not a '
    + 'pursuit, and it is not a rejection.',
  whyNoNames:
    'None of these 14 can be named yet. None carries a delivery project, none kept a snapshot '
    + 'of the opportunity it came from, and no alias has been recorded for any of them, so the '
    + 'only identifier that exists is an internal opportunity id.',
  unlockedBy:
    'A delivery project is created when a bid is approved for pursuit, so these have none by '
    + 'design. Nothing is linked automatically, and nothing here is guessed.',
  provenance: 'Counted from gov_qualifications on every read. No value is shown because '
    + 'gov_qualifications holds no value column.',
};

const block = (over: Partial<PreProjectTier> = {}) => renderToStaticMarkup(
  <PreProjectTierBlock streamKey="gov_pipeline" tier={{ ...TIER, ...over }} />,
);

describe('the tier shows a count and says why it has no names', () => {
  it('prints the count', () => {
    const html = block();
    expect(html).toContain('data-testid="pre-project-count-gov_pipeline"');
    expect(html).toContain('>14<');
    expect(html).toContain('Being assessed, not yet a pursuit');
  });

  it('prints the reason the names are missing, so the gap reads as known', () => {
    const html = block();
    expect(html).toContain('data-testid="pre-project-why-gov_pipeline"');
    expect(html).toContain('None of these 14 can be named yet');
  });

  it('prints what a human would do to name one', () => {
    const html = block();
    expect(html).toContain('data-testid="pre-project-unlock-gov_pipeline"');
    expect(html).toContain('approved for pursuit');
    expect(html).toContain('nothing here is guessed');
  });

  it('says what the stage is, in the schema\'s own words', () => {
    expect(block()).toContain('needs_evidence');
  });
});

describe('the tier cannot show money', () => {
  /**
   * The failure this phase exists to prevent. These rows have no recorded value anywhere —
   * gov_qualifications holds no value column — so any figure here would be invented, and a
   * number beside "14 opportunities" reads as pipeline worth that much.
   */
  it('prints no currency amount anywhere', () => {
    const html = block();
    expect(html).not.toMatch(/\$[\d,]/);

    // The positive control: the count IS rendered, so the absence above is about money and
    // not about a component that rendered nothing.
    expect(html).toContain('>14<');
  });

  it('prints no figure even when the count is large', () => {
    expect(block({ count: 9999 })).not.toMatch(/\$[\d,]/);
    expect(block({ count: 9999 })).toContain('>9999<');
  });
});

describe('a lifecycle change is surfaced, not hidden', () => {
  it('says so when a row at this stage has acquired a project', () => {
    const html = block({ linkedCount: 2 });
    expect(html).toContain('data-testid="pre-project-linked-gov_pipeline"');
    expect(html).toContain('2 of these now carry a delivery project');
  });

  it('reads correctly for exactly one', () => {
    const html = block({ linkedCount: 1 });
    expect(html).toContain('1 of these now carries a delivery project');
    expect(html).not.toContain('1 of these now carry a delivery project');
  });

  it('stays silent when none have, which is the expected state', () => {
    // The control for the two above: the warning is a consequence of the data, not a
    // permanent fixture.
    expect(block({ linkedCount: 0 })).not.toContain('data-testid="pre-project-linked-gov_pipeline"');
  });
});

// ── THE CARD ─────────────────────────────────────────────────────────────────────────────

const CLASSES: ClassMap = {
  bid_flagged: { key: 'bid_flagged', label: 'Flagged', tone: 'info', glyph: '●', direction: 'neutral' },
};

const stream = (over: Partial<Stream> = {}): Stream => ({
  key: 'gov_pipeline',
  label: 'Government bids in pursuit',
  brandKey: 'colaberry-enterprise',
  status: 'proxy',
  headline: { cents: 1_200_000, display: '$12,000', provenance: 'Priced bids.' },
  funnel: [
    {
      key: 'flagged',
      label: 'Flagged for pursuit',
      count: 14,
      value: { cents: null, display: '3 unpriced', provenance: 'No value until a human records one.' },
      classification: 'bid_flagged',
      definition: 'gov_qualifications at decision=approved_bid_pursuit and status=active.',
    },
  ],
  provenance: 'gov_qualifications for the flag.',
  caveat: null,
  drillDownKey: 'gov_bid_pursuit',
  ...over,
});

const card = (s: Stream) => renderToStaticMarkup(
  <StaticRouter location="/admin/revenue-room">
    <StreamCard stream={s} events={[]} classMap={CLASSES} windowDays={180} />
  </StaticRouter>,
);

describe('the card places the tier upstream of the funnel', () => {
  it('renders the tier when the stream carries one', () => {
    const html = card(stream({ preProject: TIER }));
    expect(html).toContain('data-testid="pre-project-gov_pipeline"');
  });

  it('renders nothing when the stream carries none', () => {
    // Undefined means the qualification table could not be read. A zero-count block would
    // read as "every opportunity has been assessed", which is the opposite of unknown.
    const html = card(stream());
    expect(html).not.toContain('data-testid="pre-project-gov_pipeline"');
    // The control: the card itself rendered.
    expect(html).toContain('data-testid="stream-gov_pipeline"');
  });

  /**
   * ABOVE the funnel, because these opportunities are upstream of it. Asserted as an index
   * comparison rather than by eye, because the order is the claim: the funnel's counts
   * partition the flagged bids, and this is a different population feeding into them.
   */
  it('puts the tier before the funnel table, not after it', () => {
    const html = card(stream({ preProject: TIER }));
    const tier = html.indexOf('data-testid="pre-project-gov_pipeline"');
    const stage = html.indexOf('data-testid="stage-gov_pipeline-flagged"');
    expect(tier).toBeGreaterThan(-1);
    expect(stage).toBeGreaterThan(-1);
    expect(tier).toBeLessThan(stage);
  });

  /**
   * And it must NOT be a funnel row. A row in that table would inherit the funnel's meaning,
   * which is one population whose counts partition.
   */
  it('is not rendered as a funnel stage', () => {
    const html = card(stream({ preProject: TIER }));
    expect(html).not.toContain('data-testid="stage-gov_pipeline-needs_evidence"');
    expect(html).not.toContain('data-testid="stage-gov_pipeline-pre_project"');
  });
});
