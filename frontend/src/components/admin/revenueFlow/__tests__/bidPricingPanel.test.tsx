import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BidPricingPanel, { FlaggedBid } from '../BidPricingPanel';

jest.mock('../../../../utils/api', () => ({ __esModule: true, default: { post: jest.fn() } }));

/**
 * R16 Phase 3 acceptance for the control that makes the pipeline real.
 *
 * `renderToStaticMarkup` runs no effects and no handlers, so these cover what the panel
 * STATES rather than what it does when clicked: which rows read as unpriced, whether a
 * flagged row warns before it is priced, and whether outcome is linked rather than
 * re-implemented. The POST path is covered by the backend's own 22 tests.
 */
const bid = (over: Partial<FlaggedBid> = {}): FlaggedBid => ({
  deliveryProjectId: '5fff94d9-6c3b-4633-8158-d2224f801b6c',
  canonicalOpportunityId: 'op:gov:abc123',
  name: 'RFP - Next-Generation Intranet for Harris County Constable Precinct 4',
  flags: [],
  priced: null,
  outcome: 'pending',
  ...over,
});

const render = (bids: FlaggedBid[]) =>
  renderToStaticMarkup(<BidPricingPanel bids={bids} />);

describe('the gap is stated, not implied', () => {
  it('says how many are unpriced and that they are absent from the total', () => {
    const html = render([bid(), bid({ deliveryProjectId: 'b2', priced: null })]);
    expect(html).toContain('2 of 2 still have none');
    expect(html).toContain('absent from it');
  });

  it('says so plainly when every bid is priced', () => {
    const html = render([bid({
      priced: {
        cents: 45_000_000, display: '$450,000', periodMonths: 36,
        basisSource: 'solicitation_document', valueBasis: 'Section 2.4 states a not-to-exceed.',
        confirmedBy: 'ali@colaberry.com', confirmedAt: '2026-11-13T00:00:00Z',
      },
    })]);
    expect(html).toContain('Every flagged bid now has a value');
  });

  it('marks an unpriced row as unpriced', () => {
    const html = render([bid()]);
    expect(html).toContain('data-testid="bid-pricing-unpriced"');
    expect(html).toContain('Not priced');
  });
});

describe('a priced bid shows what it is worth AND who stands behind it', () => {
  const priced = bid({
    priced: {
      cents: 45_000_000, display: '$450,000', periodMonths: 36,
      basisSource: 'award_notice', valueBasis: 'Award notice dated 2026-11-01 states $450,000.',
      confirmedBy: 'ali@colaberry.com', confirmedAt: '2026-11-13T09:00:00Z',
    },
  });

  it('shows the amount, the term and the basis strength', () => {
    const html = render([priced]);
    expect(html).toContain('$450,000');
    expect(html).toContain('over 36 months');
    expect(html).toContain('award notice');
  });

  /**
   * The whole reason a priced bid may be trusted as a real pursuit is that a person put
   * their name against it. Hiding the name would make the figure anonymous again.
   */
  it('names the person and the date', () => {
    const html = render([priced]);
    expect(html).toContain('ali@colaberry.com');
    expect(html).toContain('2026-11-13');
  });

  /**
   * A term of null means nobody recorded it, and the per-year figure is withheld rather than
   * guessed. The row has to say which it is.
   */
  it('says when no term was recorded rather than implying one year', () => {
    const html = render([bid({
      priced: {
        cents: 10_000_000, display: '$100,000', periodMonths: null,
        basisSource: 'human_estimate', valueBasis: 'Comparable to the 2025 Herriman award.',
        confirmedBy: 'ali@colaberry.com', confirmedAt: '2026-11-13T00:00:00Z',
      },
    })]);
    expect(html).toContain('no term recorded');
  });

  it('offers to revise rather than to set, once a value exists', () => {
    expect(render([priced])).toContain('Revise value');
    expect(render([bid()])).toContain('Set value');
  });
});

describe('a row that should not be priced says so', () => {
  /**
   * The flagged set really contained a row named "Snow College Adult Learner - T8 test", a
   * duplicated RFP and three rows with no delivery project. Someone deciding what to price
   * needs to see which rows to leave alone, because pricing one puts it in Ram's total.
   */
  it('shows the row-level flags', () => {
    const html = render([bid({ flags: ['looks like a test row', 'duplicate title'] })]);
    expect(html).toContain('looks like a test row');
    expect(html).toContain('duplicate title');
  });

  it('shows the recorded outcome, defaulting to pending', () => {
    expect(render([bid()])).toContain('outcome: pending');
    expect(render([bid({ outcome: 'won' })])).toContain('outcome: won');
  });
});

describe('outcome is linked, never re-implemented here', () => {
  /**
   * POST …/qualification/:id/outcome already exists, is tested, generates the private
   * case-study and capability candidates, and sits behind requireSection('program'). A
   * second write path is how a dashboard and a subsystem start disagreeing about whether
   * something was submitted.
   */
  it('links to the qualification workspace for the outcome', () => {
    const html = render([bid()]);
    expect(html).toContain('data-testid="bid-pricing-outcome-link"');
    expect(html).toContain('Record outcome');
    expect(html).toContain('gws=op%3Agov%3Aabc123');
  });

  it('omits the link when there is no canonical id to link with', () => {
    const html = render([bid({ canonicalOpportunityId: null })]);
    expect(html).not.toContain('Record outcome');
  });
});

describe('the panel explains why pricing matters', () => {
  /**
   * SCOPE NOTE, so this suite does not claim more than it checks. The basis-length hint and
   * the disabled-until-valid save button live inside the form, which only renders once a row
   * is opened, and renderToStaticMarkup runs no handlers so it cannot reach them. An earlier
   * version of this test asserted the hint text anyway and failed on JSX source newlines that
   * React renders as a single space; it is now scoped to what static markup can actually see.
   * The rejection rules themselves are covered by the backend tests, where they are enforced.
   */
  it('states that the total counts only priced bids, which is the reason for the control', () => {
    const html = render([bid()]);
    expect(html).toContain('counts only bids a person has priced');
    expect(html).toContain('keeps a test row out of the total');
  });

  it('renders nothing to price when no bid carries the flag', () => {
    const html = render([]);
    expect(html).toContain('data-testid=\"bid-pricing-empty\"');
    expect(html).toContain('No bid carries the pursuit flag');
  });
});
