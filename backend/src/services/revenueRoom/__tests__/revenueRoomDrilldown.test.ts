const m = { query: jest.fn() };
const e = { getEvidenceTimeline: jest.fn(), getEvidenceCounts: jest.fn() };

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => m.query(...a) },
}));
jest.mock('../evidenceLinkService', () => ({
  getEvidenceTimeline: (...a: unknown[]) => e.getEvidenceTimeline(...a),
  getEvidenceCounts: (...a: unknown[]) => e.getEvidenceCounts(...a),
}));

import { DrilldownNotFound, getDrilldown } from '../revenueRoomDrilldown';
import { INITIATIVE_DEFINITIONS } from '../revenueInitiatives';

/**
 * R4 acceptance: the page behind each card shows the timeline and documents for that
 * initiative.
 *
 * The thing worth testing hardest is the shape decision. Six cards are one initiative and
 * get a timeline; the government card aggregates twelve bids and gets a roster. Collapsing
 * those would have meant inventing a merged timeline across unrelated bids, or quietly
 * picking one — and either would look perfectly fine on screen.
 */
const BID_A = '3867b241-0761-4f1f-9a32-ffe3b47bf186';
const BID_B = '13ec298d-3fdc-41f3-97f9-76088d3eb418';

const timeline = (over: Record<string, unknown> = {}) => ({
  state: 'ready', initiativeType: 'hypothesis', initiativeKey: 'k', links: [], note: null, ...over,
});

function mockDb(opts: { tables?: Record<string, boolean>; bids?: Array<Record<string, unknown>> } = {}) {
  const tables = { gov_qualifications: true, ...(opts.tables ?? {}) };
  m.query.mockImplementation((sql: string, o?: { replacements?: Record<string, string> }) => {
    if (/FROM information_schema\.tables/.test(sql)) {
      const name = o?.replacements?.name ?? '';
      return Promise.resolve([{ n: tables[name as keyof typeof tables] ? 1 : 0 }]);
    }
    if (/FROM gov_qualifications q/.test(sql)) return Promise.resolve(opts.bids ?? []);
    return Promise.resolve([]);
  });
}

const bid = (over: Record<string, unknown> = {}) => ({
  delivery_project_id: BID_A, project_name: 'Saratoga Springs RFP',
  docs: 3, submissions: 0, updated: '2026-11-02', ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDb();
  e.getEvidenceTimeline.mockResolvedValue(timeline());
  e.getEvidenceCounts.mockResolvedValue({ state: 'ready', counts: {} });
});

describe('a card that does not exist is a 404, not an empty page', () => {
  it('throws DrilldownNotFound for an unknown card', async () => {
    await expect(getDrilldown('not_a_card')).rejects.toThrow(DrilldownNotFound);
  });

  it('resolves the card from the registry, so renaming one cannot strand a route', async () => {
    for (const d of INITIATIVE_DEFINITIONS) {
      await expect(getDrilldown(d.key)).resolves.toBeTruthy();
    }
  });
});

describe('six cards are a single initiative and get a timeline', () => {
  it('returns a single shape for a hypothesis, keyed on the card', async () => {
    const d = await getDrilldown('hypothesis_paid_accelerator');
    expect(d.shape).toBe('single');
    expect(d.roster).toBeNull();
    expect(d.timeline).not.toBeNull();
    expect(e.getEvidenceTimeline).toHaveBeenCalledWith('hypothesis', 'hypothesis_paid_accelerator');
  });

  it('returns a single shape for membership', async () => {
    const d = await getDrilldown('membership_subscriptions');
    expect(d.shape).toBe('single');
    expect(e.getEvidenceTimeline).toHaveBeenCalledWith('membership', 'membership_subscriptions');
  });

  it('carries the card provenance through, so the page need not restate it', async () => {
    const d = await getDrilldown('membership_subscriptions');
    expect(d.provenance).toMatch(/paysimple_payment_id/);
    expect(d.owner).toBe('Ali');
  });

  it('passes the spine state through rather than flattening it', async () => {
    e.getEvidenceTimeline.mockResolvedValue(timeline({ state: 'absent', note: 'missing' }));
    const d = await getDrilldown('membership_subscriptions');
    expect(d.spine).toBe('absent');
    expect(d.note).toBe('missing');
  });
});

describe('the government card is an aggregate and gets a roster', () => {
  it('returns a roster, not a timeline', async () => {
    mockDb({ bids: [bid()] });
    const d = await getDrilldown('gov_bid_pursuit');
    expect(d.shape).toBe('roster');
    expect(d.timeline).toBeNull();
    expect(d.roster).toHaveLength(1);
    expect(e.getEvidenceTimeline).not.toHaveBeenCalled();
  });

  it('flags a test row so it cannot be read as a deal', async () => {
    mockDb({ bids: [bid({ project_name: 'Snow College Adult Learner - T8 test', docs: 0 })] });
    const d = await getDrilldown('gov_bid_pursuit');
    expect(d.roster![0].flags).toContain('looks like a test row');
  });

  it('flags BOTH rows of a duplicated title, not neither', async () => {
    // The real failure: on 2026-11-03 one RFP appeared twice under two project ids. A
    // per-row check would see each as unique and flag neither.
    mockDb({ bids: [
      bid({ delivery_project_id: BID_A, project_name: 'RFP - Enterprise Work Order', docs: 1 }),
      bid({ delivery_project_id: BID_B, project_name: 'RFP - Enterprise Work Order', docs: 0 }),
    ] });
    const d = await getDrilldown('gov_bid_pursuit');
    expect(d.roster).toHaveLength(2);
    for (const r of d.roster!) expect(r.flags).toContain('duplicate title');
  });

  it('says plainly when a bid has no proposal document', async () => {
    mockDb({ bids: [bid({ docs: 0 })] });
    const d = await getDrilldown('gov_bid_pursuit');
    expect(d.roster![0].flags).toContain('no proposal document');
  });

  it('states that nothing has been submitted, since gov_submission is empty', async () => {
    mockDb({ bids: [bid({ submissions: 0 })] });
    expect((await getDrilldown('gov_bid_pursuit')).roster![0].flags).toContain('never submitted');
  });

  it('counts a documented bid in words rather than leaving it to the reader', async () => {
    mockDb({ bids: [bid({ docs: 1 })] });
    expect((await getDrilldown('gov_bid_pursuit')).roster![0].flags).toContain('1 proposal document');
    mockDb({ bids: [bid({ docs: 3 })] });
    expect((await getDrilldown('gov_bid_pursuit')).roster![0].flags).toContain('3 proposal documents');
  });

  it('shows the live evidence count per bid', async () => {
    mockDb({ bids: [bid()] });
    e.getEvidenceCounts.mockResolvedValue({ state: 'ready', counts: { [`gov_bid:${BID_A}`]: 3 } });
    expect((await getDrilldown('gov_bid_pursuit')).roster![0].evidenceCount).toBe(3);
  });

  it('orders the bids with the most evidence first', async () => {
    mockDb({ bids: [
      bid({ delivery_project_id: BID_B, project_name: 'Thin bid', docs: 0 }),
      bid({ delivery_project_id: BID_A, project_name: 'Real bid', docs: 3 }),
    ] });
    e.getEvidenceCounts.mockResolvedValue({ state: 'ready', counts: { [`gov_bid:${BID_A}`]: 5 } });
    const d = await getDrilldown('gov_bid_pursuit');
    expect(d.roster![0].label).toBe('Real bid');
  });

  it('names an unnamed project instead of rendering a blank row', async () => {
    mockDb({ bids: [bid({ project_name: null })] });
    expect((await getDrilldown('gov_bid_pursuit')).roster![0].label).toBe('(unnamed project)');
  });

  it('DEGRADES to absent when gov_qualifications is missing, rather than reporting zero bids', async () => {
    mockDb({ tables: { gov_qualifications: false } });
    const d = await getDrilldown('gov_bid_pursuit');
    expect(d.spine).toBe('absent');
    expect(d.note).toMatch(/A missing source is not an empty one/);
  });

  it('reports a measured zero when the table is present and nothing is flagged', async () => {
    mockDb({ bids: [] });
    const d = await getDrilldown('gov_bid_pursuit');
    expect(d.spine).toBe('ready');
    expect(d.roster).toEqual([]);
    expect(d.note).toMatch(/measured zero/);
  });

  it('survives the evidence counts being unreadable, rather than losing the roster', async () => {
    mockDb({ bids: [bid()] });
    e.getEvidenceCounts.mockRejectedValue(new Error('spine unreadable'));
    const d = await getDrilldown('gov_bid_pursuit');
    expect(d.roster).toHaveLength(1);
    expect(d.roster![0].evidenceCount).toBe(0);
  });
});

describe('one bid inside the aggregate becomes a single timeline', () => {
  it('returns a single shape keyed on the delivery project', async () => {
    const d = await getDrilldown('gov_bid_pursuit', BID_A);
    expect(d.shape).toBe('single');
    expect(e.getEvidenceTimeline).toHaveBeenCalledWith('gov_bid', BID_A);
  });

  it('refuses a bid key on a card that has no roster', async () => {
    await expect(getDrilldown('membership_subscriptions', BID_A))
      .rejects.toThrow(DrilldownNotFound);
  });
});

describe('it is a reporting surface', () => {
  it('issues no INSERT, UPDATE or DELETE', async () => {
    mockDb({ bids: [bid()] });
    await getDrilldown('gov_bid_pursuit');
    await getDrilldown('hypothesis_paid_accelerator');
    const sqls = m.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sqls).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/i);
  });

  it('only lists bids that have a delivery project, since the others cannot be named', async () => {
    mockDb({ bids: [bid()] });
    await getDrilldown('gov_bid_pursuit');
    const sql = m.query.mock.calls.map((c) => String(c[0])).find((s) => /FROM gov_qualifications q/.test(s))!;
    expect(sql).toMatch(/delivery_project_id IS NOT NULL/);
  });
});
