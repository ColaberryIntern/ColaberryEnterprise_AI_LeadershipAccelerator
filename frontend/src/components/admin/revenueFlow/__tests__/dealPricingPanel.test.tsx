import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DealPricingPanel, {
  EnterpriseDealRow,
  dealValuePayload,
  flagWarning,
  initialMode,
  retainerTotalCents,
} from '../DealPricingPanel';

jest.mock('../../../../utils/api', () => ({ __esModule: true, default: { post: jest.fn() } }));

/**
 * R23 Phase 3 acceptance for the control that records what an enterprise deal is worth.
 *
 * Two kinds of test, for two reasons.
 *
 * The ARITHMETIC is tested directly, as pure functions, because it is the part that can lose
 * money and because a click cannot be simulated here: `@testing-library/react` is not a
 * dependency of this frontend, and adding one is an escalation-tier decision rather than a
 * step in a feature. The precedent panel was tested only through `renderToStaticMarkup` and
 * its own dollars-to-cents conversion has consequently never been asserted.
 *
 * The RENDERED OUTPUT is tested through `renderToStaticMarkup`, which runs no effects and no
 * handlers, so those cases cover what the panel STATES: that an unvalued deal reads as
 * unvalued, that an empty roster explains itself instead of disappearing, and that a missing
 * table is distinguished from an empty one.
 */

const deal = (over: Partial<EnterpriseDealRow> = {}): EnterpriseDealRow => ({
  enterpriseIntakeId: 'f7b2c4e1-3a5d-4b8c-9e0f-1a2b3c4d5e6f',
  company: 'Middlesex Glass',
  planKey: 'build',
  planLabel: 'A new build',
  shape: 'monthly_retainer',
  stage: 'signed',
  signed: true,
  // Clean by default, so a case that says nothing about flags gets a row with none.
  flags: [],
  priced: null,
  ...over,
});

const render = (deals: EnterpriseDealRow[], unmeasurable = false) =>
  renderToStaticMarkup(<DealPricingPanel deals={deals} unmeasurable={unmeasurable} />);

describe('a retainer is multiplied out, and this is where $4,500 stops becoming $54,000', () => {
  it('turns a monthly fee and a term into the total contract value', () => {
    // The Middlesex shape: $4,500 a month for a year is a $54,000 engagement, not a $4,500 one.
    expect(retainerTotalCents(4500, 12)).toBe(5_400_000);
  });

  it('refuses to produce a total when the term is missing, zero or fractional', () => {
    // Null, not the monthly fee. Falling back to the fee would be the whole error, silently.
    expect(retainerTotalCents(4500, 0)).toBeNull();
    expect(retainerTotalCents(4500, -12)).toBeNull();
    expect(retainerTotalCents(4500, 1.5)).toBeNull();
    expect(retainerTotalCents(4500, Number.NaN)).toBeNull();
  });

  it('rounds to cents BEFORE multiplying, so a part-cent fee cannot drift over the term', () => {
    // $1,234.567 a month. Rounded once to 123457 cents, then times 36. Rounding after the
    // multiplication would give a different answer, and the drift grows with the term.
    expect(retainerTotalCents(1234.567, 36)).toBe(123457 * 36);
  });

  it('handles a fee with ordinary cents exactly', () => {
    expect(retainerTotalCents(4500.5, 12)).toBe(450050 * 12);
  });
});

describe('the form opens on the field the plan actually uses', () => {
  it('a retainer plan opens on the monthly fee', () => {
    expect(initialMode('monthly_retainer')).toBe('monthly_retainer');
  });

  it('every other shape opens on one total figure', () => {
    expect(initialMode('guided_project')).toBe('total_contract');
    expect(initialMode('training_program')).toBe('total_contract');
  });

  it('an unrecorded plan opens on one total figure rather than guessing a retainer', () => {
    // A deal nobody has classified must not default into the recurring shape: that would
    // invite a monthly figure in a field the server will store as a total.
    expect(initialMode(null)).toBe('total_contract');
    expect(initialMode(undefined)).toBe('total_contract');
  });
});

describe('the request body matches the server\'s discriminated union', () => {
  const base = {
    enterpriseIntakeId: 'f7b2c4e1-3a5d-4b8c-9e0f-1a2b3c4d5e6f',
    valueBasis: '  SOW dated 2026-12-02, $4,500 per month for 12 months, signed by their COO. ',
    basisSource: 'statement_of_work',
  };

  it('a retainer sends the monthly fee and a term, and NEVER a total', () => {
    const body = dealValuePayload({
      ...base, mode: 'monthly_retainer', amountDollars: 4500, months: '12',
    });
    expect(body.valueKind).toBe('monthly_retainer');
    expect(body.monthlyFeeCents).toBe(450_000);
    expect(body.periodMonths).toBe(12);
    // The server's `.strict()` would reject this field on a retainer, and more importantly
    // the total is the service's job to compute. Two places multiplying is two answers.
    expect(body).not.toHaveProperty('dealValueCents');
  });

  it('a total-contract deal sends the total and NEVER a monthly fee', () => {
    const body = dealValuePayload({
      ...base, mode: 'total_contract', amountDollars: 54000, months: '12',
    });
    expect(body.valueKind).toBe('total_contract');
    expect(body.dealValueCents).toBe(5_400_000);
    expect(body).not.toHaveProperty('monthlyFeeCents');
  });

  it('a blank term on a total-contract deal is sent as null, not as zero or omitted', () => {
    const body = dealValuePayload({
      ...base, mode: 'total_contract', amountDollars: 54000, months: '   ',
    });
    // Explicit null means "the term was not recorded", which withholds the per-year figure.
    // Zero would be a term, and a missing key would be a different request.
    expect(body.periodMonths).toBeNull();
  });

  it('trims the basis so leading whitespace cannot pad it past the 25-character floor', () => {
    const body = dealValuePayload({
      ...base, mode: 'total_contract', amountDollars: 1, months: '',
    });
    expect(body.valueBasis).toBe(
      'SOW dated 2026-12-02, $4,500 per month for 12 months, signed by their COO.',
    );
  });
});

describe('what the panel states', () => {
  it('marks an unvalued deal as unvalued', () => {
    const html = render([deal()]);
    expect(html).toContain('data-testid="deal-pricing-unpriced"');
    expect(html).toContain('Not valued');
  });

  it('names how many signed deals carry no value and that they are absent from the total', () => {
    const html = render([deal(), deal({ enterpriseIntakeId: 'b', signed: true })]);
    expect(html).toContain('2 signed deal(s) carry no value');
    expect(html).toContain('absent from it');
  });

  it('a priced deal shows the figure, the monthly fee behind it, and who stands behind it', () => {
    const html = render([deal({
      priced: {
        cents: 5_400_000,
        display: '$54,000',
        periodMonths: 12,
        monthlyCents: 450_000,
        basisSource: 'statement_of_work',
        valueBasis: 'SOW dated 2026-12-02, $4,500 per month for 12 months.',
        confirmedBy: 'ali@colaberry.com',
        confirmedAt: '2026-11-21T22:00:00Z',
      },
    })]);
    expect(html).toContain('$54,000');
    expect(html).toContain('over 12 months');
    // The negotiated number, recoverable from the stored total.
    expect(html).toContain('$4,500/mo');
    expect(html).toContain('ali@colaberry.com');
    expect(html).toContain('statement of work');
  });

  it('says plainly when a priced deal has no recorded term', () => {
    const html = render([deal({
      priced: {
        cents: 5_400_000, display: '$54,000', periodMonths: null, monthlyCents: null,
        basisSource: 'signed_agreement', valueBasis: 'Countersigned order form, 2026-12-02.',
        confirmedBy: 'ali@colaberry.com', confirmedAt: '2026-11-21T22:00:00Z',
      },
    })]);
    expect(html).toContain('no term recorded');
    expect(html).not.toContain('/mo');
  });

  it('flags a deal whose plan was never recorded instead of showing it as a plan', () => {
    const html = render([deal({ planKey: null, planLabel: null, shape: null })]);
    expect(html).toContain('data-testid="deal-pricing-no-plan"');
    expect(html).toContain('plan not recorded');
  });

  it('explains an empty roster rather than rendering nothing', () => {
    // Rendering nothing would be indistinguishable from there being no write path at all,
    // which is the state this phase exists to end.
    const html = render([]);
    expect(html).toContain('data-testid="deal-pricing-empty"');
    expect(html).toContain('no deal to value');
    expect(html).toContain('enterprise.colaberry.ai');
  });

  it('distinguishes a table it cannot read from a table that is empty', () => {
    const html = render([], true);
    expect(html).toContain('data-testid="deal-pricing-unmeasurable"');
    expect(html).toContain('not a measured zero');
    // And it must NOT also claim the measured-zero wording.
    expect(html).not.toContain('data-testid="deal-pricing-empty"');
  });

  it('says every signed deal is valued when that is true', () => {
    const html = render([deal({
      priced: {
        cents: 5_400_000, display: '$54,000', periodMonths: 12, monthlyCents: 450_000,
        basisSource: 'signed_agreement', valueBasis: 'Countersigned order form, 2026-12-02.',
        confirmedBy: 'ali@colaberry.com', confirmedAt: '2026-11-21T22:00:00Z',
      },
    })]);
    expect(html).toContain('Every signed deal that exists is valued');
  });
});

/**
 * Phase 4 — the warning that stands between a test row and a revenue total.
 *
 * `flagWarning` is tested directly because it renders only inside an opened form, which no
 * test here can reach. The chip and the summary line ARE statically rendered, so those go
 * through `renderToStaticMarkup`.
 */
describe('a flagged row says so before anybody prices it', () => {
  it('returns null for a clean row, so nothing is drawn', () => {
    expect(flagWarning([])).toBeNull();
  });

  it('names every reason in one warning, joined so they read as a list', () => {
    const w = flagWarning(['looks like a test row (company name)', 'duplicate company name']);
    expect(w).toContain('looks like a test row (company name); duplicate company name');
  });

  it('tells the reader what pricing it would DO, not merely that it is flagged', () => {
    // The actionable half. "This row is flagged" alone leaves the reader to guess whether
    // that is a warning or a label.
    const w = flagWarning(['looks like a test row (company name)']) ?? '';
    expect(w).toContain('price it only if it is a real deal');
    expect(w).toContain('Nothing else downstream can tell a test row from a real one');
  });

  it('marks the row itself, so the list is readable without opening anything', () => {
    const html = render([deal({
      company: 'Acme Test Logistics',
      flags: ['looks like a test row (company name)'],
    })]);
    expect(html).toContain('data-testid="deal-pricing-flagged"');
    expect(html).toContain('may not be a real inquiry');
    // And the reasons in full, on the row, not hidden behind the chip.
    expect(html).toContain('data-testid="deal-pricing-flag-reasons"');
    expect(html).toContain('looks like a test row (company name)');
  });

  it('leaves a clean row unmarked', () => {
    const html = render([deal()]);
    expect(html).not.toContain('data-testid="deal-pricing-flagged"');
    expect(html).not.toContain('data-testid="deal-pricing-flag-reasons"');
  });

  it('counts the flagged rows at the top, and says they still count in the funnel', () => {
    const html = render([
      deal({ enterpriseIntakeId: 'a', company: 'Northside Glass', flags: [] }),
      deal({ enterpriseIntakeId: 'b', company: 'Acme Test Logistics', flags: ['looks like a test row (company name)'] }),
    ]);
    expect(html).toContain('data-testid="deal-pricing-flagged-count"');
    expect(html).toContain('1 of 2 row(s) are flagged');
    // The sentence that stops the count being read as a promise that they were removed.
    expect(html).toContain('They still count in the funnel');
  });

  it('says nothing about flags when no row carries one', () => {
    expect(render([deal()])).not.toContain('data-testid="deal-pricing-flagged-count"');
  });
});
