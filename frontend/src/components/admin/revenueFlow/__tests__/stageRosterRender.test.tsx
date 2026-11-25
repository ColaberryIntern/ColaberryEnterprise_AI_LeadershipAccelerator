import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import StreamCard from '../StreamCard';
import { StageRosterView } from '../StageRosterPanel';
import type { StageRoster } from '../StageRosterPanel';
import type { ClassMap, Stream } from '../flowBoardTypes';

jest.mock('../../../../utils/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

/**
 * R26 — the people behind a Revenue Room funnel count, as the page renders them.
 *
 * Taiwo Oludimimu, 25 Nov 2026: "can you make the data points clickable so they show a list
 * of students or leads that fall within each category?"
 *
 * These cover the ways the list could quietly stop being trustworthy:
 *
 *   - a list that is shorter than the count above it, rendered as if it agreed
 *   - a row with no name dropped, instead of shown with its absence stated
 *   - a name invented to fill a gap
 *   - a count made clickable on a stream that has no roster behind it, so it 404s
 *   - the overlap warning missing, which is the single most likely way to misread the card
 */
const ROSTER: StageRoster = {
  stageKey: 'paying',
  label: 'Paying now',
  count: 2,
  people: [
    {
      rowId: 'sub-1',
      name: 'Adeola Bello',
      email: 'adeola@example.com',
      detail: 'monthly plan, $199. Term runs to 2026-12-25.',
      unresolvedReason: null,
    },
    {
      rowId: 'sub-2',
      name: 'Zara Idris',
      email: 'zara@example.com',
      detail: 'annual plan, $1,788. Term runs to 2027-06-01.',
      unresolvedReason: null,
    },
  ],
  emptyNote: null,
  provenance: 'subscriptions, classified by the same rules that produce the count above.',
};

const view = (over: Partial<StageRoster> = {}) =>
  renderToStaticMarkup(<StageRosterView roster={{ ...ROSTER, ...over }} />);

describe('the list shows who is in the stage', () => {
  it('prints each person with their name, email and what the row is', () => {
    const html = view();
    expect(html).toContain('Adeola Bello');
    expect(html).toContain('mailto:adeola@example.com');
    expect(html).toContain('Term runs to 2026-12-25');
    expect(html).toContain('data-testid="roster-row-sub-1"');
  });

  it('reads correctly for one person', () => {
    const html = view({ count: 1, people: [ROSTER.people[0]] });
    expect(html).toContain('1 person');
    expect(html).not.toContain('1 people');
  });
});

describe('the count and the list are shown to agree, or shown not to', () => {
  it('states the number when they agree', () => {
    expect(view()).toContain('2 people');
  });

  /**
   * The failure this whole feature is built around. A count of 27 above a list of 32 does not
   * read as a bug in one of them; it reads as a reason to stop trusting the page. So a
   * disagreement is printed rather than smoothed over by showing whichever number is to hand.
   */
  it('says so plainly when they disagree, instead of printing one of them', () => {
    const html = view({ count: 27 });
    expect(html).toContain('Count says 27, this list holds 2');
    expect(html).not.toContain('27 people');
  });
});

describe('a row with no name is listed, never dropped and never invented', () => {
  const unnamed: StageRoster = {
    ...ROSTER,
    count: 1,
    people: [{
      rowId: 'sub-9',
      name: null,
      email: null,
      detail: 'monthly plan, $199. Started 2026-10-01.',
      unresolvedReason: 'This subscription does not resolve to an enrollment, so no name is recorded for it.',
    }],
  };

  it('renders the row and says why it has no name', () => {
    const html = renderToStaticMarkup(<StageRosterView roster={unnamed} />);
    expect(html).toContain('data-testid="roster-row-sub-9"');
    expect(html).toContain('No name recorded');
    expect(html).toContain('does not resolve to an enrollment');
  });

  it('invents nothing to fill the gap', () => {
    const html = renderToStaticMarkup(<StageRosterView roster={unnamed} />);
    expect(html).not.toContain('Unknown');
    expect(html).not.toContain('Anonymous');
    // Not the row id dressed up as a person either: it appears only as the test id.
    expect(html).not.toContain('>sub-9<');
  });
});

describe('an empty stage says which kind of empty it is', () => {
  it('prints the note and no table', () => {
    const html = view({
      count: 0,
      people: [],
      emptyNote: 'Nobody is at "Paying now" right now. That is a measured zero.',
    });
    expect(html).toContain('data-testid="roster-empty-paying"');
    expect(html).toContain('measured zero');
    expect(html).not.toContain('<tbody>');
  });
});

// ── THE CARD ─────────────────────────────────────────────────────────────────────────────

const CLASSES: ClassMap = {
  never_paid: { key: 'never_paid', label: 'Never paid', tone: 'warn', glyph: '●', direction: 'neutral' },
};

const stream = (over: Partial<Stream> = {}): Stream => ({
  key: 'membership',
  label: 'Membership',
  brandKey: 'colaberry-training',
  status: 'live',
  headline: { cents: 5_490_000, display: '$54,900', provenance: 'Annualized.' },
  funnel: [{
    key: 'paying',
    label: 'Paying now',
    count: 27,
    value: { cents: 5_490_000, display: '$54,900', provenance: 'Paying rows.' },
    classification: 'never_paid',
    definition: 'Active, paid, and the term is running.',
  }],
  provenance: 'subscriptions.',
  caveat: null,
  drillDownKey: null,
  ...over,
});

const card = (s: Stream) => renderToStaticMarkup(
  <StaticRouter location="/admin/revenue-room">
    <StreamCard stream={s} events={[]} classMap={CLASSES} windowDays={180} />
  </StaticRouter>,
);

describe('the count is a control only where there is a roster behind it', () => {
  it('makes the membership count clickable', () => {
    const html = card(stream());
    expect(html).toContain('data-testid="stage-people-membership-paying"');
    expect(html).toContain('aria-label="Show the 27 people at Paying now"');
  });

  /**
   * The government and enterprise funnels are different shapes from different tables and have
   * no roster endpoint. A count that looked clickable there would 404, which is worse than a
   * count that plainly is not a control.
   */
  it('leaves the government count as plain text', () => {
    const html = card(stream({ key: 'gov_pipeline', label: 'Government bids' }));
    expect(html).not.toContain('data-testid="stage-people-gov_pipeline-paying"');
    // The control: the row and its number did render.
    expect(html).toContain('data-testid="stage-gov_pipeline-paying"');
    expect(html).toContain('27');
  });
});

describe('the card warns that the column does not add up', () => {
  it('says so on the membership card, not only in an email', () => {
    // The person who asked got the explanation by reply; the next reader will not have it.
    const html = card(stream());
    expect(html).toContain('data-testid="funnel-overlap-note-membership"');
    expect(html).toContain('does not add up');
    expect(html).toContain('counted under both');
    expect(html).toContain('still read as active in the database');
  });

  it('does not claim it about a funnel whose stages do not overlap that way', () => {
    const html = card(stream({ key: 'gov_pipeline' }));
    expect(html).not.toContain('data-testid="funnel-overlap-note-gov_pipeline"');
  });
});
