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
  const tables = {
    gov_qualifications: true, delivery_project_members: true, ...(opts.tables ?? {}),
  };
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
  docs: 3, drafted: 0, submissions: 0,
  assignees: 'Akiwam', roles: 'associate_builder', assigned_on: '2026-10-28',
  updated: '2026-11-02', ...over,
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

  // The scoping rule, in the query rather than in a warning on the page. Ali's correction
  // on 2026-11-04: only the projects in motion and assigned right now.
  it('requires a LIVE assignment, so an unassigned bid never reaches the roster', async () => {
    await getDrilldown('gov_bid_pursuit');
    const sql = m.query.mock.calls.map((c) => String(c[0])).find((s) => /FROM gov_qualifications q/.test(s))!;
    expect(sql).toMatch(/EXISTS \(SELECT 1 FROM delivery_project_members m/);
    expect(sql).toMatch(/m\.revoked_at IS NULL/);
  });

  it('leads each row with who holds it, since that is why it is on the list', async () => {
    mockDb({ bids: [bid({ assignees: 'Akiwam', roles: 'associate_builder' })] });
    const d = await getDrilldown('gov_bid_pursuit');
    expect(d.roster![0].flags[0]).toBe('assigned to Akiwam (associate_builder)');
  });

  it('says how long it has been assigned', async () => {
    mockDb({ bids: [bid({ assigned_on: '2026-10-28' })] });
    expect((await getDrilldown('gov_bid_pursuit')).roster![0].flags).toContain('since 2026-10-28');
  });

  it('reports drafted progress rather than a bare document count', async () => {
    mockDb({ bids: [bid({ docs: 3, drafted: 2 })] });
    expect((await getDrilldown('gov_bid_pursuit')).roster![0].flags)
      .toContain('2 of 3 documents drafted');
  });

  it('distinguishes documents that exist from documents that are written', async () => {
    mockDb({ bids: [bid({ docs: 3, drafted: 0 })] });
    expect((await getDrilldown('gov_bid_pursuit')).roster![0].flags)
      .toContain('3 documents, none drafted yet');
  });

  it('says plainly when a bid has no document at all', async () => {
    mockDb({ bids: [bid({ docs: 0, drafted: 0 })] });
    expect((await getDrilldown('gov_bid_pursuit')).roster![0].flags).toContain('no proposal document yet');
  });

  it('states that it has not been submitted, since gov_submission is empty', async () => {
    mockDb({ bids: [bid({ submissions: 0 })] });
    expect((await getDrilldown('gov_bid_pursuit')).roster![0].flags).toContain('not yet submitted');
  });

  it('carries no suspicion flags, because the definition excludes those rows', async () => {
    // A test row, a duplicate and an undocumented bid are all excluded by having no live
    // assignment, so the page does not have to warn about any of them.
    mockDb({ bids: [bid()] });
    const flags = (await getDrilldown('gov_bid_pursuit')).roster![0].flags.join(' ');
    expect(flags).not.toMatch(/test row|duplicate/i);
  });

  it('de-duplicates by project, so two qualification rows are one bid', async () => {
    mockDb({ bids: [bid()] });
    await getDrilldown('gov_bid_pursuit');
    const sql = m.query.mock.calls.map((c) => String(c[0])).find((s) => /FROM gov_qualifications q/.test(s))!;
    expect(sql).toMatch(/DISTINCT ON \(q\.delivery_project_id\)/);
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

  it.each(['gov_qualifications', 'delivery_project_members'])(
    'DEGRADES to absent when %s is missing, rather than falling back to the flag count',
    async (missing) => {
      // Falling back would reinstate exactly the behaviour this card was corrected away
      // from, and it would do it silently.
      mockDb({ tables: { [missing]: false } });
      const d = await getDrilldown('gov_bid_pursuit');
      expect(d.spine).toBe('absent');
      expect(d.note).toMatch(/A missing source is not an empty one/);
      expect(d.roster).toEqual([]);
    },
  );

  it('reports a measured zero when both tables are present and nothing is in motion', async () => {
    mockDb({ bids: [] });
    const d = await getDrilldown('gov_bid_pursuit');
    expect(d.spine).toBe('ready');
    expect(d.roster).toEqual([]);
    expect(d.note).toMatch(/No bid is in motion/);
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
    // An INNER join rather than a LEFT one plus an IS NOT NULL filter: a row with no
    // project cannot match, so the exclusion is structural instead of being a clause
    // somebody could drop. Three of the twelve flagged rows have no project at all.
    mockDb({ bids: [bid()] });
    await getDrilldown('gov_bid_pursuit');
    const sql = m.query.mock.calls.map((c) => String(c[0])).find((s) => /FROM gov_qualifications q/.test(s))!;
    expect(sql).toMatch(/\n\s*JOIN delivery_projects p ON p\.id = q\.delivery_project_id/);
    expect(sql).not.toMatch(/LEFT JOIN delivery_projects/);
  });
});
