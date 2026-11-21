const m = { query: jest.fn() };
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => m.query(...a) },
}));

import { buildEnterpriseFlow } from '../enterpriseFlow';
import { CLASSIFICATIONS, classificationFor } from '../revenueClassifications';

/**
 * R23 — enterprise.colaberry.ai as a revenue stream, on Ram's Revenue Flow board.
 *
 * What these tests hold, in order of how badly it would hurt to get them wrong:
 *
 * 1. AN EMPTY TABLE AND A MISSING TABLE ARE DIFFERENT ANSWERS. On 2026-11-21
 *    `enterprise_intakes` existed and held 0 rows, which is a measured zero. If the table
 *    were absent the honest answer would be `unmeasurable`. Collapsing those two is the
 *    specific mistake this board has had to unlearn twice (R2's conversion rate, R16's
 *    unpriced bids), so both states are pinned here.
 *
 * 2. NOTHING ON THIS STREAM MAY PRINT A DOLLAR. No column on `enterprise_intakes` holds a
 *    value, so every stage value and every event value must be null, and the registry must
 *    agree. A test that only checked the service would let the registry drift into saying
 *    the opposite.
 *
 * 3. THE FUNNEL IS CUMULATIVE. A signed prospect is also an interviewed one. If the stages
 *    were exclusive the funnel would sum to the total and read like a pie chart, hiding the
 *    only thing a funnel is for.
 *
 * 4. AN UNRECORDED PLAN IS NOT THE FIRST PLAN. The W28 form does not constrain its free-text
 *    service field, so the breakdown must undercount visibly rather than default a blank to
 *    Build.
 */

const WINDOW_START = new Date('2026-05-25T00:00:00Z');

function intake(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'i1',
    company: 'Acme Industrial',
    service: '',
    status: 'form',
    created_at: '2026-11-01T10:00:00Z',
    call_requested_at: null,
    interviewed_at: null,
    proposal_sent_at: null,
    signed_at: null,
    lost_at: null,
    ...over,
  };
}

/** Wires the two queries buildEnterpriseFlow makes: tableExists, then the rows. */
function withRows(rows: unknown[], tableThere = true) {
  m.query.mockImplementation((sql: string) => {
    if (String(sql).includes('information_schema.tables')) {
      return Promise.resolve([{ n: tableThere ? 1 : 0 }]);
    }
    return Promise.resolve(rows);
  });
}

type Flow = Awaited<ReturnType<typeof buildEnterpriseFlow>>;

const stage = (flow: Flow, key: string) => {
  const found = flow.stream.funnel.find((f) => f.key === key);
  if (!found) throw new Error(`no stage ${key}; have ${flow.stream.funnel.map((f) => f.key).join(', ')}`);
  return found;
};

beforeEach(() => {
  m.query.mockReset();
});

describe('enterprise site stream: empty is not the same as absent', () => {
  it('an EMPTY table reports measured_zero, and says the offer is live with no takers', async () => {
    withRows([]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    expect(flow.stream.status).toBe('measured_zero');
    expect(flow.stream.headline.cents).toBeNull();
    expect(flow.stream.headline.display).toBe('No inquiries yet');
    // The provenance must say the source was READ, not that it was missing.
    expect(flow.stream.headline.provenance).toMatch(/holds 0 rows/i);
    expect(flow.stream.headline.provenance).toMatch(/measured zero, not a missing measurement/i);
    // A funnel still renders, all zeros, because 0 is the answer.
    expect(stage(flow, 'inquired').count).toBe(0);
    expect(stage(flow, 'signed').count).toBe(0);
    expect(flow.events).toEqual([]);
  });

  it('a MISSING table reports unmeasurable and an empty funnel, never zero inquiries', async () => {
    withRows([], false);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    expect(flow.stream.status).toBe('unmeasurable');
    expect(flow.stream.headline.display).toBe('Cannot be read');
    expect(flow.stream.caveat).toMatch(/A missing source is not an empty one/i);
    // No funnel at all: a stage reading 0 here would assert a count nobody took.
    expect(flow.stream.funnel).toEqual([]);
  });
});

describe('enterprise site stream: no figure can ever be printed', () => {
  it('every stage value and every event value is null, even for a signed deal', async () => {
    withRows([
      intake({
        id: 'i-signed', service: 'build', status: 'signed',
        interviewed_at: '2026-11-03T10:00:00Z',
        proposal_sent_at: '2026-11-05T10:00:00Z',
        signed_at: '2026-11-08T10:00:00Z',
      }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    expect(stage(flow, 'signed').count).toBe(1);
    for (const s of flow.stream.funnel) {
      expect(s.value.cents).toBeNull();
    }
    for (const e of flow.events) {
      expect(e.valueCents).toBeNull();
    }
    // The headline names the gap rather than printing 0.
    expect(flow.stream.headline.cents).toBeNull();
    expect(flow.stream.headline.display).toMatch(/value not recorded/i);
    expect(flow.stream.caveat).toMatch(/absent from every figure on this page rather than counted as zero/i);
  });

  it('the registry agrees: no enterprise classification claims to carry a value', async () => {
    const enterprise = CLASSIFICATIONS.filter((c) => c.stream === 'enterprise_site');
    expect(enterprise.length).toBeGreaterThan(0);
    for (const c of enterprise) {
      expect(c.carriesValue).toBe(false);
    }
    // And the classifications the stream actually emits all exist, so an event cannot
    // reference a key the legend has no entry for.
    for (const key of [
      'enterprise_inquiry', 'enterprise_interviewed',
      'enterprise_proposal_sent', 'enterprise_signed', 'enterprise_lost',
    ]) {
      expect(classificationFor(key).stream).toBe('enterprise_site');
    }
  });
});

describe('enterprise site stream: the funnel is cumulative', () => {
  it('a signed prospect is counted at every earlier stage too', async () => {
    withRows([
      intake({
        id: 'i-far', service: 'guide', status: 'signed',
        call_requested_at: '2026-11-02T10:00:00Z',
        interviewed_at: '2026-11-03T10:00:00Z',
        proposal_sent_at: '2026-11-05T10:00:00Z',
        signed_at: '2026-11-08T10:00:00Z',
      }),
      intake({ id: 'i-near', service: 'train' }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    expect(stage(flow, 'inquired').count).toBe(2);
    expect(stage(flow, 'call_requested').count).toBe(1);
    expect(stage(flow, 'interviewed').count).toBe(1);
    expect(stage(flow, 'proposal_sent').count).toBe(1);
    expect(stage(flow, 'signed').count).toBe(1);
  });

  it('a drafted-but-unsent proposal does not reach the proposal stage', async () => {
    // The intake stores an AI-written draft separately from the sent timestamp. Only a real
    // send sets proposal_sent_at, and only Ali performs one.
    withRows([intake({ id: 'i-draft', interviewed_at: '2026-11-03T10:00:00Z' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    expect(stage(flow, 'interviewed').count).toBe(1);
    expect(stage(flow, 'proposal_sent').count).toBe(0);
  });

  it('lost is reported apart from the funnel, not as a stage of it', async () => {
    withRows([intake({ id: 'i-lost', status: 'lost', lost_at: '2026-11-09T10:00:00Z' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    expect(flow.stream.funnel.find((f) => f.key === 'lost')).toBeUndefined();
    expect(flow.events.some((e) => e.classification === 'enterprise_lost')).toBe(true);
  });
});

describe('enterprise site stream: the three plans', () => {
  it('counts the three plans and never defaults a blank to the first one', async () => {
    withRows([
      intake({ id: 'a', service: 'build' }),
      intake({ id: 'b', service: 'Training your team' }),
      intake({ id: 'c', service: 'we want to work with your team' }),
      intake({ id: 'd', service: '' }),
      intake({ id: 'e', service: 'something nobody anticipated' }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    expect(stage(flow, 'plan_build').count).toBe(1);
    expect(stage(flow, 'plan_train').count).toBe(1);
    expect(stage(flow, 'plan_guide').count).toBe(1);
    // The blank and the unreadable are both unattributed, and counted apart in the words.
    expect(stage(flow, 'plan_unattributed').count).toBe(2);
    expect(stage(flow, 'plan_unattributed').definition).toMatch(/1 inquiry\(ies\) left the service field empty/);
    expect(stage(flow, 'plan_unattributed').definition).toMatch(/1 carried text matching none/);
    expect(flow.stream.caveat).toMatch(/cannot be attributed to one of the three plans/i);
  });

  it('the plan stages are not cumulative, and say so', async () => {
    withRows([intake({ id: 'a', service: 'build' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    expect(stage(flow, 'plan_build').definition).toMatch(/not cumulative reach/i);
  });
});

describe('enterprise site stream: events', () => {
  it('bounds events by the window but never the funnel', async () => {
    // Inquired long before the window opened, interviewed inside it. The funnel must still
    // count the inquiry: a funnel that dropped anyone older than the timeline would report a
    // smaller business than we have.
    withRows([
      intake({
        id: 'old', service: 'build',
        created_at: '2026-01-05T10:00:00Z',
        interviewed_at: '2026-11-03T10:00:00Z',
      }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    expect(stage(flow, 'inquired').count).toBe(1);
    expect(flow.events.map((e) => e.classification)).toEqual(['enterprise_interviewed']);
  });

  it('labels an event with the company and the plan, and names an unrecorded plan', async () => {
    withRows([
      intake({ id: 'a', company: 'Acme Industrial', service: 'train' }),
      intake({ id: 'b', company: '  ', service: '' }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    const labels = flow.events.map((e) => e.label);

    expect(labels).toContain('Acme Industrial enquired (Training your team)');
    expect(labels).toContain('an unnamed company enquired (plan not recorded)');
    // Every event carries the row it belongs to, for drill-through.
    for (const e of flow.events) expect(e.entityKey).toBeTruthy();
  });

  it('every event declares the enterprise_site stream', async () => {
    withRows([intake({ id: 'a', service: 'build', signed_at: '2026-11-08T10:00:00Z' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    expect(flow.events.length).toBeGreaterThan(0);
    for (const e of flow.events) expect(e.stream).toBe('enterprise_site');
  });
});
