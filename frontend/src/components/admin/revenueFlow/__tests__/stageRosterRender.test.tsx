import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import StreamCard from '../StreamCard';
import { StageRosterView } from '../StageRosterPanel';
import type { RosterPerson, StageRoster } from '../StageRosterPanel';
import { fmtCount, fmtCountOr } from '../fmtCount';
import type { ClassMap, Stream } from '../flowBoardTypes';

jest.mock('../../../../utils/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

/**
 * R26, extended by R27 — the people behind a Revenue Room funnel count.
 *
 * Taiwo asked to click a number and see who is in it. Ali, on testing it: group the repeats,
 * link each name to the 360, give every row a way to send email, and format the numbers.
 *
 * These cover the ways the list stops being trustworthy:
 *
 *   - a list that no longer accounts for every row, rendered as if it did
 *   - a name invented to fill a gap, or a link that 404s because the row has nothing to link on
 *   - repeats deduped away, which deletes the fact that somebody tried four times
 *   - a count made clickable on a stream that has no roster behind it
 *   - a rate printed as 0% when nothing was sent to be read
 */
const person = (over: Partial<RosterPerson> = {}): RosterPerson => ({
  personKey: 'adeola@example.com',
  name: 'Adeola Bello',
  email: 'adeola@example.com',
  enrollmentId: 'enr-1',
  rowCount: 1,
  rows: [{ rowId: 'sub-1', detail: 'monthly plan, $199. Term runs to 2026-12-25.' }],
  summary: null,
  unresolvedReason: null,
  ...over,
});

const ROSTER: StageRoster = {
  stageKey: 'paying',
  label: 'Paying now',
  subscriptionCount: 2,
  personCount: 2,
  people: [
    person(),
    person({
      personKey: 'zara@example.com',
      name: 'Zara Idris',
      email: 'zara@example.com',
      enrollmentId: 'enr-2',
      rows: [{ rowId: 'sub-2', detail: 'annual plan, $1,788. Term runs to 2027-06-01.' }],
    }),
  ],
  emptyNote: null,
  provenance: 'subscriptions, classified by the same rules that produce the count above.',
};

const view = (over: Partial<StageRoster> = {}) =>
  renderToStaticMarkup(
    <StaticRouter location="/admin/revenue-room">
      <StageRosterView roster={{ ...ROSTER, ...over }} />
    </StaticRouter>,
  );

describe('the list shows who is in the stage', () => {
  it('prints each person with their email and what their rows are', () => {
    const html = view();
    expect(html).toContain('Adeola Bello');
    expect(html).toContain('adeola@example.com');
    expect(html).toContain('Term runs to 2026-12-25');
    expect(html).toContain('data-testid="roster-row-sub-1"');
  });

  it('reads correctly for one subscription held by one person', () => {
    const html = view({ subscriptionCount: 1, personCount: 1, people: [person()] });
    expect(html).toContain('1 subscription, held by 1 person');
    expect(html).not.toContain('1 subscriptions');
    expect(html).not.toContain('1 people');
  });
});

describe('both counts are shown, and each says what it counts', () => {
  /**
   * Grouping broke R26's "the count equals the rows listed" invariant, because 296
   * subscription rows belong to 115 people. Printing both is the honest fix; quietly
   * reporting a different number under the same name is not.
   */
  it('names the subscriptions and the people separately', () => {
    const html = view({
      subscriptionCount: 8,
      personCount: 2,
      people: [
        person({ rowCount: 7, rows: Array.from({ length: 7 }, (_, i) => ({ rowId: `r${i}`, detail: 'row' })) }),
        person({ personKey: 'z@x.com', name: 'Zara', email: 'z@x.com', rowCount: 1 }),
      ],
    });
    expect(html).toContain('8 subscriptions, held by 2 people');
  });

  it('says so plainly when the rows listed do not account for the count', () => {
    // A list quietly shorter than its own count is the failure this feature guards.
    const html = view({ subscriptionCount: 27 });
    expect(html).toContain('Count says 27, this list holds 2');
    expect(html).not.toContain('27 subscriptions, held by');
  });
});

describe('repeats are grouped, and the repeat count is kept', () => {
  const repeat = person({
    rowCount: 4,
    summary: '4 subscription rows for this person in this stage.',
    rows: [
      { rowId: 'a', detail: 'attempt one' },
      { rowId: 'b', detail: 'attempt two' },
      { rowId: 'c', detail: 'attempt three' },
      { rowId: 'd', detail: 'attempt four' },
    ],
  });

  it('shows the person once with the number of rows behind them', () => {
    const html = view({ subscriptionCount: 4, personCount: 1, people: [repeat] });
    expect(html).toContain('data-testid="roster-rows-adeola@example.com"');
    expect(html).toContain('>4<');
    // Once, not four times.
    expect(html.match(/Adeola Bello/g)).toHaveLength(1);
  });

  it('keeps every row visible, because the repeats are the finding', () => {
    const html = view({ subscriptionCount: 4, personCount: 1, people: [repeat] });
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(html).toContain(`data-testid="roster-row-${id}"`);
    }
    expect(html).toContain('4 subscription rows for this person');
  });

  it('says nothing about repeats for somebody holding one row', () => {
    // The control: the explanation follows the data rather than being boilerplate.
    expect(view()).not.toContain('data-testid="roster-summary-adeola@example.com"');
  });
});

describe('the name opens the 360, or is plain text', () => {
  it('links the name to the person profile, on the billing tab', () => {
    // A reader who clicked a payment stage wants the payments, not the timeline.
    const html = view();
    expect(html).toContain('/admin/people/adeola%40example.com?tab=billing');
    expect(html).toContain('data-testid="roster-name-adeola@example.com"');
  });

  it('falls back to the enrolment when there is no email', () => {
    const html = view({
      people: [person({ personKey: 'enr-9', name: 'No Email', email: null, enrollmentId: 'a1b2c3d4-0000-4000-8000-000000000000' })],
    });
    expect(html).toContain('enrollment%3Aa1b2c3d4-0000-4000-8000-000000000000');
  });

  it('renders plain text rather than a link that would 404', () => {
    const html = view({
      people: [person({ personKey: 'row:x', name: null, email: null, enrollmentId: null })],
    });
    expect(html).toContain('data-testid="roster-name-row:x"');
    expect(html).toContain('No name recorded');
    expect(html).not.toContain('/admin/people/');

    /*
      Asserted as "not an anchor", because the two checks above do not distinguish it. A
      <Link to={null}> carries the same test id and does not contain /admin/people/ either,
      so both would pass while the page rendered a dead link. The mutation check found this
      by removing the guard and watching the test stay green.
    */
    const cell = html.slice(html.indexOf('data-testid="roster-name-row:x"') - 60);
    expect(cell.slice(0, 120)).not.toContain('<a ');
    expect(cell.slice(0, 120)).toContain('<span');
  });

  it('invents nothing to fill a missing name', () => {
    const html = view({
      people: [person({ personKey: 'row:x', name: null, email: null, enrollmentId: null })],
    });
    expect(html).not.toContain('Unknown');
    expect(html).not.toContain('Anonymous');
  });
});

describe('every row offers a way to send email', () => {
  it('offers a mailto for a person with an address', () => {
    const html = view();
    expect(html).toContain('data-testid="roster-email-adeola@example.com"');
    expect(html).toContain('mailto:adeola@example.com');
    expect(html).toContain('Send email');
  });

  it('offers nothing when there is no address, rather than a dead button', () => {
    const html = view({ people: [person({ personKey: 'row:x', email: null })] });
    expect(html).not.toContain('data-testid="roster-email-row:x"');
    expect(html).toContain('None recorded');
  });
});

describe('an empty stage says which kind of empty it is', () => {
  it('prints the note and no table', () => {
    const html = view({
      subscriptionCount: 0,
      personCount: 0,
      people: [],
      emptyNote: 'Nobody is at "Paying now" right now. That is a measured zero.',
    });
    expect(html).toContain('data-testid="roster-empty-paying"');
    expect(html).toContain('measured zero');
    expect(html).not.toContain('<tbody>');
  });
});

// ── NUMBER FORMATTING ────────────────────────────────────────────────────────────────────

describe('counts read as quantities', () => {
  it('separates thousands', () => {
    expect(fmtCount(10343)).toBe('10,343');
    expect(fmtCount(8518)).toBe('8,518');
    expect(fmtCount(3)).toBe('3');
  });

  it('refuses to invent a digit for a count nobody recorded', () => {
    // null means not recorded, which this page never renders as zero.
    expect(fmtCount(null)).toBeNull();
    expect(fmtCount(undefined)).toBeNull();
    expect(fmtCountOr(null, 'Not recorded')).toBe('Not recorded');
  });

  it('does not render a broken number as a figure', () => {
    expect(fmtCount(NaN)).toBeNull();
    expect(fmtCountOr(NaN, 'Not recorded')).toBe('Not recorded');
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

  it('leaves the government count as plain text', () => {
    // That funnel is a different shape from different tables and has no roster endpoint, so a
    // clickable count there would 404.
    const html = card(stream({ key: 'gov_pipeline', label: 'Government bids' }));
    expect(html).not.toContain('data-testid="stage-people-gov_pipeline-paying"');
    expect(html).toContain('data-testid="stage-gov_pipeline-paying"');
    expect(html).toContain('27');
  });
});

describe('the card warns that the column does not add up', () => {
  it('says so on the membership card, not only in an email', () => {
    const html = card(stream());
    expect(html).toContain('data-testid="funnel-overlap-note-membership"');
    expect(html).toContain('does not add up');
    expect(html).toContain('counted under both');
  });

  it('does not claim it about a funnel whose stages do not overlap that way', () => {
    expect(card(stream({ key: 'gov_pipeline' }))).not.toContain('data-testid="funnel-overlap-note-gov_pipeline"');
  });
});
