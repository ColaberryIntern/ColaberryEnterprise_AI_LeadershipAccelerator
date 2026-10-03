import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ReceiptsPanel from '../ReceiptsPanel';
import OutcomesPanel from '../OutcomesPanel';
import ByJourneyPanel from '../ByJourneyPanel';
import { expectNoA11yViolations } from '../../../__fixtures__/a11yRules';
import type {
  ReceiptsResponse, ReceiptRow, OutcomesResponse, OutcomeRow,
  ByJourneyResponse, JourneyMetricRow,
} from '../../../services/growthJourneyPerformanceApi';

/**
 * The three performance panels T615's first pass forgot to build
 * (Phase 6, T615 attempt 2).
 *
 * ── WHY THIS FILE EXISTS, STATED PLAINLY ────────────────────────────────────
 *
 * Attempt 1 shipped `getReceipts`, `getOutcomes`, `getByJourney` and `percentValue`
 * with NO CONSUMER. The client functions existed, nothing called them, and three of
 * the four performance reads the plan names had no operator-visible surface at all -
 * including the execution receipts that are T606's whole audit trail. The verifier
 * found it by grepping for callers. A producer without a consumer reads as finished
 * work, which is this project's own doctrine.
 *
 * Worse, the session log claimed "A NULL IS NEVER A ZERO, four times over … and
 * `has_leads: false` on by-journey". Three absences were rendered. The fourth lived
 * only in a comment inside a file nothing imported. These cells make the claim true.
 *
 * Every cell names the mutation it kills.
 */

jest.setTimeout(30000);

jest.mock('../../../services/growthJourneyPerformanceApi', () => {
  const actual = jest.requireActual('../../../services/growthJourneyPerformanceApi');
  return {
    // The two formatters are the contract under test - a stubbed `percentValue`
    // would let the two-scale trap pass.
    percentValue: actual.percentValue,
    fractionPct: actual.fractionPct,
    rateAbsentReason: actual.rateAbsentReason,
    RATE_MEANINGS: actual.RATE_MEANINGS,
    getReceipts: jest.fn(),
    getOutcomes: jest.fn(),
    getByJourney: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../services/growthJourneyPerformanceApi') as {
  getReceipts: jest.Mock;
  getOutcomes: jest.Mock;
  getByJourney: jest.Mock;
};

const SCOPE = { tenant_id: 't-1', brand_id: 'b-1', program_id: null };

const receipt = (over: Partial<ReceiptRow> = {}): ReceiptRow => ({
  id: 'r-1',
  brand_id: 'b-1',
  program_id: 'p-1',
  channel: 'email',
  action_type: 'SEND_EDUCATION',
  status: 'sent',
  // NON-NULLABLE on the wire: `safeField` turns a NULL into the literal 'unknown'.
  status_reason: 'delivered',
  status_reason_redacted: false,
  campaign_key: 'explorer_weekly_digest',
  created_at: '2026-10-01T08:00:00.000Z',
  updated_at: '2026-10-01T08:00:00.000Z',
  ...over,
});

const receipts = (over: Partial<ReceiptsResponse> = {}): ReceiptsResponse => ({
  rows: [receipt()], total: 6, limit: 25, offset: 0, scope: SCOPE, ...over,
});

const outcome = (over: Partial<OutcomeRow> = {}): OutcomeRow => ({
  id: 'o-1',
  brand_id: 'b-1',
  subject_ref: 'lead:4711',
  outcome_type: 'enrolled',
  source: 'portal',
  occurred_at: '2026-10-01T08:00:00.000Z',
  handoff_id: 'h-1',
  decision_id: null,
  ...over,
});

const outcomes = (over: Partial<OutcomesResponse> = {}): OutcomesResponse => ({
  rows: [outcome()], total: 2, limit: 25, offset: 0, scope: SCOPE, ...over,
});

const running = (over: Partial<JourneyMetricRow> = {}): JourneyMetricRow => ({
  brand_id: 'b-1',
  program_slug: 'cpn-learner',
  program_name: 'CPN Learner',
  program_status: 'active',
  path_slug: 'ai_leadership',
  has_leads: true,
  leads_count: 80,
  classified_count: 80,
  campaigns_count: 3,
  emails_sent: 240,
  opens_count: 96,
  clicks_count: 24,
  replies_count: 6,
  meetings_count: 2,
  enrollments_count: 1,
  // PERCENTAGES 0..100 on this read, unlike /rates which returns fractions.
  open_rate: 40,
  click_rate: 10,
  reply_rate: 2.5,
  conversion_rate: 1.25,
  ...over,
});

const notRunning = (): JourneyMetricRow => ({
  ...running(),
  program_slug: 'flotation-business',
  program_name: 'AI Flotation Business',
  path_slug: null,
  has_leads: false,
  leads_count: null,
  classified_count: null,
  campaigns_count: null,
  emails_sent: null,
  opens_count: null,
  clicks_count: null,
  replies_count: null,
  meetings_count: null,
  enrollments_count: null,
  open_rate: null,
  click_rate: null,
  reply_rate: null,
  conversion_rate: null,
});

const byJourney = (over: Partial<ByJourneyResponse> = {}): ByJourneyResponse => ({
  journeys: [running()],
  scope: { ...SCOPE, start: null, end: null },
  ...over,
});

let container: HTMLDivElement;
let root: Root;
const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');
const bodyText = () => (container.querySelector('tbody')?.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.getReceipts.mockResolvedValue(receipts());
  api.getOutcomes.mockResolvedValue(outcomes());
  api.getByJourney.mockResolvedValue(byJourney());
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

const renderReceipts = async (props = {}) => {
  await act(async () => { root.render(<ReceiptsPanel {...props} />); });
};
const renderOutcomes = async (props = {}) => {
  await act(async () => { root.render(<OutcomesPanel {...props} />); });
};
const renderByJourney = async (props = {}) => {
  await act(async () => { root.render(<ByJourneyPanel {...props} />); });
};

describe('receipts: the audit trail, which had no surface at all until now', () => {
  // KILLS: reading the receipts envelope as `controls` (the verifier named this one),
  // or not rendering the panel at all - which is what attempt 1 shipped.
  it('renders rows from the paged envelope', async () => {
    await renderReceipts();
    expect(bodyText()).toContain('SEND_EDUCATION');
    expect(bodyText()).toContain('delivered');
    expect(text()).toContain('of 6 receipts');
  });

  it('and a second page proves the figures are read', async () => {
    api.getReceipts.mockResolvedValue(receipts({ total: 61, limit: 10, offset: 30 }));
    await renderReceipts();
    expect(text()).toContain('of 61 receipts');
    expect(text()).toContain('limit 10, offset 30');
  });

  // KILLS: treating `status_reason` as nullable. It never is: a NULL arrives as the
  // literal 'unknown', so a null-check would never fire and the word would render
  // as though an operator had typed it.
  it('renders the API-redacted reason as redacted, with its flag', async () => {
    api.getReceipts.mockResolvedValue(receipts({
      rows: [receipt({ status_reason: 'redacted', status_reason_redacted: true })],
    }));
    await renderReceipts();
    expect(bodyText()).toContain('redacted by the API');
  });

  it('renders the literal "unknown" as not recorded, not as the word unknown', async () => {
    api.getReceipts.mockResolvedValue(receipts({
      rows: [receipt({ status_reason: 'unknown', status_reason_redacted: false })],
    }));
    await renderReceipts();
    expect(bodyText()).toContain('not recorded');
    expect(bodyText()).not.toContain('unknown');
  });

  it('positive control: a real reason renders verbatim', async () => {
    await renderReceipts();
    expect(bodyText()).toContain('delivered');
  });

  it('is scoped to the brand and programme it was given', async () => {
    await renderReceipts({ brandId: 'b-9', programId: 'p-9' });
    expect(api.getReceipts).toHaveBeenCalledWith(
      expect.objectContaining({ brand_id: 'b-9', program_id: 'p-9' }),
    );
  });

  it('says an empty trail is expected while the system is dark', async () => {
    api.getReceipts.mockResolvedValue(receipts({ rows: [], total: 0 }));
    await renderReceipts();
    expect(text()).toContain('No execution receipts in scope');
    expect(text()).toContain('expected answer, not a gap in the audit trail');
  });
});

describe('outcomes: what happened to people, not what the system did', () => {
  it('renders the row and what it traces back to', async () => {
    await renderOutcomes();
    expect(bodyText()).toContain('lead:4711');
    expect(bodyText()).toContain('enrolled');
    expect(bodyText()).toContain('h-1');
  });

  it('says so when an outcome traces to nothing in the journey', async () => {
    // KILLS: rendering an empty cell. "This enrolment had no journey behind it" is
    // a finding about attribution, not a missing value.
    api.getOutcomes.mockResolvedValue(outcomes({
      rows: [outcome({ handoff_id: null, decision_id: null })],
    }));
    await renderOutcomes();
    expect(bodyText()).toContain('nothing in the journey');
  });

  it('masks an address that reached the subject pointer', async () => {
    api.getOutcomes.mockResolvedValue(outcomes({
      rows: [outcome({ subject_ref: 'lead:who@example.com' })],
    }));
    await renderOutcomes();
    expect(bodyText()).not.toContain('who@example.com');
  });

  it('names the scope when empty, and distinguishes it from an empty receipt list', async () => {
    api.getOutcomes.mockResolvedValue(outcomes({ rows: [], total: 0 }));
    await renderOutcomes();
    expect(text()).toContain('No outcomes in scope');
    expect(text()).toContain('different fact from an empty receipt list');
  });

  it('and a second page proves the figures are read', async () => {
    api.getOutcomes.mockResolvedValue(outcomes({ total: 33, limit: 10, offset: 10 }));
    await renderOutcomes();
    expect(text()).toContain('of 33 outcomes');
    expect(text()).toContain('limit 10, offset 10');
  });
});

describe('by-journey: the FOURTH absence, which the log claimed before it existed', () => {
  // KILLS the verifier's named mutant: `has_leads: false` rendered as 0. A
  // programme with leads_count 0 means nobody arrived; has_leads false means the
  // programme is not running. Printing 0 turns "we have not started" into "we
  // started and nobody came".
  it('renders a not-running programme with NO zero anywhere in its row', async () => {
    api.getByJourney.mockResolvedValue(byJourney({ journeys: [notRunning()] }));
    await renderByJourney();
    expect(bodyText()).toContain('Not running yet');
    expect(bodyText()).toContain('absent rather than zero');
    expect(bodyText()).not.toContain('0');
  });

  it('a running programme shows its real counts and percentages', async () => {
    await renderByJourney();
    expect(bodyText()).toContain('80');
    expect(bodyText()).toContain('240');
    expect(bodyText()).toContain('40.0%');
  });

  // KILLS the verifier's other named mutant: `percentValue` multiplied by 100. This
  // read is ALREADY 0..100, so multiplying yields 4000% - plausible-looking enough
  // that only an explicit assertion catches it.
  it('does NOT multiply a percentage that is already a percentage', async () => {
    await renderByJourney();
    expect(bodyText()).toContain('40.0%');
    expect(bodyText()).not.toContain('4000');
    expect(bodyText()).not.toContain('0.4%');
  });

  it('a second set of rates proves the formatting is derived', async () => {
    api.getByJourney.mockResolvedValue(byJourney({
      journeys: [running({ open_rate: 12.5, click_rate: 3.75 })],
    }));
    await renderByJourney();
    expect(bodyText()).toContain('12.5%');
    expect(bodyText()).toContain('3.8%');
  });

  it('a running programme with nothing sent shows the rate as absent with its reason', async () => {
    api.getByJourney.mockResolvedValue(byJourney({
      journeys: [running({ emails_sent: 0, open_rate: null, click_rate: null, reply_rate: null })],
    }));
    await renderByJourney();
    expect(bodyText()).toContain('nothing sent to divide by');
  });

  it('renders both a running and a not-running programme in one table', async () => {
    // The pair is the point: the two rows must look different, and a reader must be
    // able to tell which is which without the caption.
    api.getByJourney.mockResolvedValue(byJourney({ journeys: [running(), notRunning()] }));
    await renderByJourney();
    expect(bodyText()).toContain('CPN Learner');
    expect(bodyText()).toContain('AI Flotation Business');
    expect(bodyText()).toContain('Not running yet');
    expect(bodyText()).toContain('40.0%');
  });

  it('says the read is not paged, because it has no limit or offset', async () => {
    await renderByJourney();
    expect(text()).toContain('not paged');
  });

  it('names the scope when there is no programme at all', async () => {
    api.getByJourney.mockResolvedValue(byJourney({ journeys: [] }));
    await renderByJourney();
    expect(text()).toContain('No programmes in scope');
    expect(text()).toContain('seeding answer rather than a funnel of zero');
  });
});

describe('the mechanical accessibility rules on all three panels', () => {
  it.each([
    ['receipts', renderReceipts],
    ['outcomes', renderOutcomes],
    ['by-journey', renderByJourney],
  ])('%s passes with rows, and its table is table-light with scoped headers', async (_n, render) => {
    await render();
    const tables = Array.from(container.querySelectorAll('table'));
    expect(tables.length).toBeGreaterThan(0);
    tables.forEach((t) => {
      expect(t.querySelector('thead')?.className ?? '').toContain('table-light');
      const cols = Array.from(t.querySelectorAll('thead th'));
      expect(cols.length).toBeGreaterThan(0);
      cols.forEach((th) => expect(th.getAttribute('scope')).toBe('col'));
    });
    expectNoA11yViolations(container);
  });

  it('by-journey passes with a not-running row, whose cell spans the table', async () => {
    /*
     * The title used to claim more than the body checked. `expectNoA11yViolations` does
     * not inspect `colSpan` - `a11yRules.ts` has no rule that can see one - so the
     * attempt-3 verifier changed `colSpan={7}` to `colSpan={2}` and this cell passed
     * while the not-running row's explanation stopped covering the table. Either assert
     * the span or drop the clause; asserting it is better, because a short span leaves
     * the remaining columns as empty cells, which reads as missing data rather than as
     * "this programme has not started".
     */
    api.getByJourney.mockResolvedValue(byJourney({ journeys: [notRunning()] }));
    await renderByJourney();
    const spanned = container.querySelector('tbody td[colspan]');
    expect(spanned).not.toBeNull();
    const headerCols = container.querySelectorAll('thead th').length;
    // The row's own <th> holds the programme, so the message covers the rest.
    expect(Number(spanned!.getAttribute('colspan'))).toBe(headerCols - 1);
    expectNoA11yViolations(container);
  });
});
