const m = { query: jest.fn() };
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => m.query(...a) },
}));
const mockLiveValues = jest.fn();
jest.mock('../enterpriseDealValueService', () => ({
  getLiveDealValues: (...a: unknown[]) => mockLiveValues(...a),
  annualizedCents: (v: { dealValueCents: number; periodMonths: number | null }) =>
    (v.periodMonths && v.periodMonths > 0
      ? Math.round((v.dealValueCents / v.periodMonths) * 12)
      : null),
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

/** One live, human-confirmed deal value, as the service returns it. */
function dealValue(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'v1',
    enterpriseIntakeId: 'i-signed',
    dealValueCents: 4500000,
    currency: 'USD',
    periodMonths: 12,
    valueBasis: 'SOW dated 2026-12-02, three phases at $15,000 each, countersigned by their CTO',
    basisSource: 'statement_of_work',
    confirmedBy: 'ali@colaberry.com',
    confirmedAt: '2026-11-10T10:00:00Z',
    supersededAt: null,
    supersededById: null,
    notes: null,
    ...over,
  };
}

beforeEach(() => {
  m.query.mockReset();
  mockLiveValues.mockReset();
  // Default: nothing priced. Each test that cares opts in.
  mockLiveValues.mockResolvedValue([]);
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

describe('enterprise site stream: an UNVALUED signed deal still prints no figure', () => {
  const SIGNED = () => intake({
    id: 'i-signed', service: 'build', status: 'signed',
    interviewed_at: '2026-11-03T10:00:00Z',
    proposal_sent_at: '2026-11-05T10:00:00Z',
    signed_at: '2026-11-08T10:00:00Z',
  });

  it('reports the win with no number, never as zero', async () => {
    withRows([SIGNED()]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    expect(stage(flow, 'signed').count).toBe(1);
    expect(stage(flow, 'signed').value.cents).toBeNull();
    expect(flow.stream.headline.cents).toBeNull();
    expect(flow.stream.headline.display).toBe('1 signed, none valued');
    expect(flow.stream.headline.provenance).toMatch(/would claim the work is worth nothing/i);

    // The signed EVENT still appears - a reader must see the win - carrying null, not 0.
    const signedEvent = flow.events.find((e) => e.classification === 'enterprise_signed');
    expect(signedEvent?.valueCents).toBeNull();
    expect(signedEvent?.label).toMatch(/value not recorded/i);
    // And no valuation event, because there is no valuation.
    expect(flow.events.some((e) => e.classification === 'enterprise_priced')).toBe(false);
  });

  it('stages that are not money still carry no figure even when a deal IS valued', async () => {
    withRows([SIGNED()]);
    mockLiveValues.mockResolvedValue([dealValue()]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    for (const key of ['inquired', 'call_requested', 'interviewed', 'proposal_sent',
      'plan_build', 'plan_guide', 'plan_train', 'plan_unattributed']) {
      expect(stage(flow, key).value.cents).toBeNull();
    }
    // Only the signed stage moved.
    expect(stage(flow, 'signed').value.cents).toBe(4500000);
  });
});

describe('enterprise site stream: a VALUED signed deal prints a real figure', () => {
  const SIGNED = (id: string, over: Partial<Record<string, unknown>> = {}) => intake({
    id, service: 'build', status: 'signed', signed_at: '2026-11-08T10:00:00Z', ...over,
  });

  it('sums only priced deals, and reports the unpriced ones beside the total', async () => {
    withRows([SIGNED('i-signed'), SIGNED('i-unvalued', { company: 'Second Co' })]);
    mockLiveValues.mockResolvedValue([dealValue()]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    expect(stage(flow, 'signed').count).toBe(2);
    // $45,000 - the one priced deal. The unvalued one is NOT added as zero.
    expect(flow.stream.headline.cents).toBe(4500000);
    expect(flow.stream.headline.provenance).toMatch(/1 signed deal\(s\) carry no value/i);
    expect(flow.stream.caveat).toMatch(/absent from the total rather than counted as zero/i);
    expect(flow.stream.caveat).toMatch(/closes by somebody pricing the deal/i);
  });

  it('says so explicitly when every signed deal is valued', async () => {
    withRows([SIGNED('i-signed')]);
    mockLiveValues.mockResolvedValue([dealValue()]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    expect(flow.stream.headline.provenance).toMatch(/Every signed deal is valued/i);
  });

  it('emits a dated valuation event naming the person and the basis', async () => {
    withRows([SIGNED('i-signed')]);
    mockLiveValues.mockResolvedValue([dealValue()]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    const priced = flow.events.find((e) => e.classification === 'enterprise_priced');
    expect(priced).toBeTruthy();
    expect(priced?.at).toBe('2026-11-10');
    expect(priced?.valueCents).toBe(4500000);
    expect(priced?.label).toContain('ali@colaberry.com');
    expect(priced?.label).toContain('statement of work');
    // The signed event now carries the figure too.
    const signedEvent = flow.events.find((e) => e.classification === 'enterprise_signed');
    expect(signedEvent?.valueCents).toBe(4500000);
    expect(signedEvent?.label).toContain('$45,000');
  });

  it('a value on a deal that is NOT signed never reaches the headline', async () => {
    // Pipeline is not revenue. A value may legitimately be recorded while a deal is still in
    // proposal, and it must not land in a total that sits beside booked membership revenue.
    withRows([intake({ id: 'i-proposal', proposal_sent_at: '2026-11-05T10:00:00Z' })]);
    mockLiveValues.mockResolvedValue([dealValue({ enterpriseIntakeId: 'i-proposal' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    expect(stage(flow, 'signed').count).toBe(0);
    expect(flow.stream.headline.cents).toBeNull();
    expect(flow.stream.headline.display).toBe('No signed deal yet');
  });

  it('EXCLUDES an unsigned deal\'s value even when another deal IS signed', async () => {
    // The case the test above cannot reach. With nothing signed, the headline short-circuits
    // on the count and the scoping of `signedRows` is never exercised - a mutation widening
    // it to every intake passed the whole suite on 2026-11-21. Here one deal is signed and
    // priced and a second is priced but only at proposal, so the total must be the first
    // alone. If the scoping breaks, this reads $75,000 instead of $45,000.
    withRows([
      SIGNED('i-signed'),
      intake({ id: 'i-proposal', company: 'Not Signed Co', proposal_sent_at: '2026-11-05T10:00:00Z' }),
    ]);
    mockLiveValues.mockResolvedValue([
      dealValue(),
      dealValue({ id: 'v2', enterpriseIntakeId: 'i-proposal', dealValueCents: 3000000 }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    expect(stage(flow, 'signed').count).toBe(1);
    expect(flow.stream.headline.cents).toBe(4500000);
    // And the unsigned deal is not reported as an unpriced signed one either.
    expect(flow.stream.headline.provenance).toMatch(/Every signed deal is valued/i);
  });

  it('withholds the annualized view when a term was not recorded, and says why', async () => {
    withRows([SIGNED('i-signed')]);
    mockLiveValues.mockResolvedValue([dealValue({ periodMonths: null })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    expect(flow.stream.headline.cents).toBe(4500000);
    expect(flow.stream.caveat).toMatch(/no recorded term/i);
    expect(flow.stream.caveat).toMatch(/Assuming twelve months would flatter a short engagement/i);
  });

  it('survives the value table being unreadable, rather than taking the board down', async () => {
    withRows([SIGNED('i-signed')]);
    mockLiveValues.mockRejectedValue(new Error('relation does not exist'));
    const flow = await buildEnterpriseFlow(WINDOW_START);

    // Degrades to the unvalued answer. One optional table must not 500 a ten-stream board.
    expect(flow.stream.headline.cents).toBeNull();
    expect(flow.stream.headline.display).toBe('1 signed, none valued');
  });
});

describe('enterprise site stream: the registry declares value-carrying honestly', () => {
  it('exactly the three money classifications carry a value, and no others', async () => {
    const enterprise = CLASSIFICATIONS.filter((c) => c.stream === 'enterprise_site');
    expect(enterprise.length).toBe(7);

    const carry = enterprise.filter((c) => c.carriesValue).map((c) => c.key).sort();
    expect(carry).toEqual(['enterprise_priced', 'enterprise_repriced', 'enterprise_signed']);

    // An inquiry, an interview, a sent proposal and a loss are not money, and no table will
    // make them so. These stay false permanently rather than as a staging state.
    for (const key of ['enterprise_inquiry', 'enterprise_interviewed',
      'enterprise_proposal_sent', 'enterprise_lost']) {
      expect(classificationFor(key).carriesValue).toBe(false);
    }
  });

  it('every classification the stream emits exists in the registry', async () => {
    for (const key of [
      'enterprise_inquiry', 'enterprise_interviewed', 'enterprise_proposal_sent',
      'enterprise_signed', 'enterprise_lost', 'enterprise_priced', 'enterprise_repriced',
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
