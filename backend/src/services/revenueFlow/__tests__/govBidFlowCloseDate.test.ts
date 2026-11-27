/**
 * govBidFlow x M5 - a submitted bid is a potential-win in the Revenue Room, and it must show WHEN it closes next to
 * its value. These tests pin the honest surfacing: a priced submitted bid shows its amount AND its close date; an
 * unpriced submitted bid shows its close date with NO amount (outcome pending, priced null) - never a fabricated value.
 */
const query = jest.fn();
jest.mock('../../../config/database', () => ({ __esModule: true, sequelize: { query: (...a: any[]) => query(...a) } }));

const getLiveBidValues = jest.fn();
const annualizedCents = jest.fn();
jest.mock('../govBidValueService', () => ({
  __esModule: true,
  getLiveBidValues: (...a: any[]) => getLiveBidValues(...a),
  annualizedCents: (...a: any[]) => annualizedCents(...a),
}));

jest.mock('../tableExists', () => ({ __esModule: true, tableExists: async () => true }));
jest.mock('../govPreProjectTier', () => ({ __esModule: true, buildPreProjectTier: async () => null }));

import { buildGovFlow } from '../govBidFlow';

const flaggedRows = [
  { delivery_project_id: 'dp-priced', canonical_opportunity_id: 'op1', project_name: 'Priced RFP', flagged_at: '2026-01-01' },
  { delivery_project_id: 'dp-unpriced', canonical_opportunity_id: 'op2', project_name: 'Unpriced RFP', flagged_at: '2026-01-02' },
];
const submissionRows = [
  { delivery_project_id: 'dp-priced', status: 'externally_submitted', outcome: 'pending', exported_at: '2026-02-01', externally_submitted_at: '2026-02-02', acknowledged_at: null, outcome_recorded_at: null, close_date: '2026-04-01' },
  { delivery_project_id: 'dp-unpriced', status: 'externally_submitted', outcome: 'pending', exported_at: '2026-02-03', externally_submitted_at: '2026-02-04', acknowledged_at: null, outcome_recorded_at: null, close_date: '2026-05-01' },
];
const liveValues = [
  { id: 'v1', deliveryProjectId: 'dp-priced', proposalValueCents: 5_000_000, currency: 'USD', periodMonths: 12, valueBasis: 'A stated basis long enough to pass.', basisSource: 'vendor_quote', confirmedBy: 'Ram', confirmedAt: '2026-03-01', supersededAt: null, notes: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  getLiveBidValues.mockResolvedValue(liveValues);
  annualizedCents.mockImplementation((v: any) => v.proposalValueCents);
  query.mockImplementation((sql: string) => {
    if (sql.includes('gov_qualifications')) return Promise.resolve(flaggedRows);
    if (sql.includes('gov_submission')) return Promise.resolve(submissionRows);
    if (sql.includes('gov_proposal_documents')) return Promise.resolve([]);
    return Promise.resolve([]);
  });
});

describe('buildGovFlow surfaces the close date on a submitted potential-win', () => {
  it('selects close_date from gov_submission', async () => {
    await buildGovFlow(new Date('2025-01-01'));
    const subSql = query.mock.calls.map((c) => String(c[0])).find((s) => s.includes('gov_submission')) ?? '';
    expect(subSql).toContain('close_date');
  });

  it('a PRICED submitted bid shows its amount AND its close date', async () => {
    const flow = await buildGovFlow(new Date('2025-01-01'));
    const bid = flow.stream.bids!.find((b) => b.deliveryProjectId === 'dp-priced')!;
    expect(bid.priced).not.toBeNull();
    expect(bid.priced!.cents).toBe(5_000_000);
    expect(bid.closeDate).toBe('2026-04-01');
    expect(bid.outcome).toBe('pending');
  });

  it('an UNPRICED submitted bid shows its close date with NO amount (pending, never fabricated)', async () => {
    const flow = await buildGovFlow(new Date('2025-01-01'));
    const bid = flow.stream.bids!.find((b) => b.deliveryProjectId === 'dp-unpriced')!;
    expect(bid.priced).toBeNull();
    expect(bid.closeDate).toBe('2026-05-01');
    expect(bid.outcome).toBe('pending');
  });

  it('the submitted timeline event carries the priced value only when the bid is priced', async () => {
    const flow = await buildGovFlow(new Date('2025-01-01'));
    const submitted = flow.events.filter((e) => e.classification === 'bid_submitted');
    const priced = submitted.find((e) => e.entityKey === 'dp-priced')!;
    const unpriced = submitted.find((e) => e.entityKey === 'dp-unpriced')!;
    expect(priced.valueCents).toBe(5_000_000);
    expect(unpriced.valueCents).toBeNull();
    const submittedStage = flow.stream.funnel.find((f) => f.key === 'submitted')!;
    expect(submittedStage.count).toBe(2);
  });
});
