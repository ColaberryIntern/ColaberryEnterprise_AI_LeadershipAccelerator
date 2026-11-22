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
  // Phase 3. The real one divides the stored TOTAL by the term, which is exact for anything
  // entered as a retainer because that is how the total was built.
  monthlyCents: (v: { dealValueCents: number; periodMonths: number | null }) =>
    (v.periodMonths && v.periodMonths > 0
      ? Math.round(v.dealValueCents / v.periodMonths)
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
    // Phase 4 reads these for the suspect flags. The defaults are deliberately CLEAN, so a
    // test that says nothing about flags gets a row with none: the alternative is every
    // existing assertion in this file silently acquiring a 'no contact email' flag.
    full_name: 'Dana Reyes',
    email: 'dana.reyes@acme-industrial.com',
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
    // 8 since Phase 4 added `enterprise_suspect`. The literal is the point of the assertion:
    // it failed the moment that key landed, which is how a new classification is forced to
    // declare whether it carries money instead of inheriting an answer.
    expect(enterprise.length).toBe(8);

    const carry = enterprise.filter((c) => c.carriesValue).map((c) => c.key).sort();
    expect(carry).toEqual(['enterprise_priced', 'enterprise_repriced', 'enterprise_signed']);

    // An inquiry, an interview, a sent proposal and a loss are not money, and no table will
    // make them so. These stay false permanently rather than as a staging state.
    for (const key of ['enterprise_inquiry', 'enterprise_interviewed',
      'enterprise_proposal_sent', 'enterprise_lost', 'enterprise_suspect']) {
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
    expect(stage(flow, 'plan_unattributed').definition).toMatch(/1 inquiry\(ies\) carry no service answer/);
    expect(stage(flow, 'plan_unattributed').definition).toMatch(/1 carry text matching none/);
    // Phase 5 words the two apart in the caveat as well, because they call for different
    // actions: one is a row older than the form rule, the other is text to go and read.
    expect(flow.stream.caveat).toMatch(/carry no service answer at all/i);
    expect(flow.stream.caveat).toMatch(/matching none of the three plans and no "not sure"/i);
  });

  it('the plan stages are not cumulative, and say so', async () => {
    withRows([intake({ id: 'a', service: 'build' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    expect(stage(flow, 'plan_build').definition).toMatch(/not cumulative reach/i);
  });
});

/**
 * R23 Phase 5 — "they had not decided" is an answer, and the board must not file it under
 * our own missing data.
 *
 * The form now requires one of the three plans or "Not sure yet" and submits the plan key.
 * The reason that needed reporting changes here as well as on the form: before it, a
 * prospect who chose "Not sure yet" was counted as unreadable text, in the same number as
 * rows where nobody had ever been asked. Those lead to different actions, so one number
 * meaning both was a measurement defect, not a presentation one.
 */
describe('enterprise site stream: a recorded "not sure" is not a gap', () => {
  it('counts "not sure" as its own stage and keeps it OUT of the unattributed row', async () => {
    withRows([
      intake({ id: 'a', service: 'not_sure' }),
      intake({ id: 'b', service: 'Not sure yet' }),
      intake({ id: 'c', service: '' }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    expect(stage(flow, 'plan_not_sure').count).toBe(2);
    // The canonical key and the legacy display words land in the same bucket, which is what
    // lets the form change what it posts without re-basing the history beside it.
    expect(stage(flow, 'plan_unattributed').count).toBe(1);
    expect(stage(flow, 'plan_not_sure').definition).toMatch(/recorded answer, not a gap/i);
  });

  it('shows the "not sure" stage at zero rather than omitting it', async () => {
    // Same rule the flagged row follows: a zero is a measurement, and an absent row leaves a
    // reader unable to tell a clean breakdown from one nobody computed.
    withRows([intake({ id: 'a', service: 'build' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    expect(stage(flow, 'plan_not_sure').count).toBe(0);
  });

  it('says nothing in the caveat about a "not sure" answer, because it is not a caveat', async () => {
    withRows([intake({ id: 'a', service: 'not_sure' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    expect(flow.stream.caveat ?? '').not.toMatch(/not sure/i);
    expect(flow.stream.caveat ?? '').not.toMatch(/cannot be attributed/i);
  });

  it('every row lands in exactly one attribution bucket, so the breakdown cannot leak', async () => {
    // The invariant that makes the five numbers readable as a partition of the rows. Without
    // it a row could be counted twice, or vanish, and both read as a plausible funnel.
    withRows([
      intake({ id: 'a', service: 'build' }),
      intake({ id: 'b', service: 'guide' }),
      intake({ id: 'c', service: 'train' }),
      intake({ id: 'd', service: 'not_sure' }),
      intake({ id: 'e', service: '' }),
      intake({ id: 'f', service: 'something nobody anticipated' }),
      intake({ id: 'g', service: 'build' }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    const buckets = ['plan_build', 'plan_guide', 'plan_train', 'plan_not_sure', 'plan_unattributed'];
    const total = buckets.reduce((sum, key) => sum + stage(flow, key).count, 0);
    expect(total).toBe(7);
    expect(stage(flow, 'inquired').count).toBe(7);
  });

  it('gives a "not sure" deal the words but no plan key and no engagement shape', async () => {
    // The honest pair. They answered, and the answer does not say whether this is a retainer
    // or a total, so the pricing form must not open on the retainer shape off the back of it.
    withRows([intake({ id: 'a', company: 'Northside Glass', service: 'not_sure' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    const deal = (flow.stream.deals ?? [])[0];
    expect(deal.planLabel).toBe('Not sure yet');
    expect(deal.planKey).toBeNull();
    expect(deal.shape).toBeNull();
  });

  it('never prints a buyer\'s unmatched words as if they were one of our plans', async () => {
    // `serviceLabel` would echo the raw text; the roster deliberately does not use it here.
    // A chip reading "whatever they typed" invites a reader to price an offer we do not sell.
    withRows([intake({ id: 'a', service: 'something nobody anticipated' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    const deal = (flow.stream.deals ?? [])[0];
    expect(deal.planLabel).toBeNull();
    expect(deal.planKey).toBeNull();
  });

  it('separates THEIR undecided from OUR missing answer on the timeline', async () => {
    withRows([
      intake({ id: 'a', company: 'Northside Glass', service: 'not_sure' }),
      intake({ id: 'b', company: 'Acme Industrial', service: '' }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    const labels = flow.events.filter((e) => e.classification === 'enterprise_inquiry').map((e) => e.label);
    expect(labels).toContain('Northside Glass enquired (plan not chosen yet)');
    expect(labels).toContain('Acme Industrial enquired (plan not recorded)');
  });

  it('labels a chosen plan on the timeline with the plan, not the key', async () => {
    withRows([intake({ id: 'a', company: 'Northside Glass', service: 'build' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    expect(flow.events.map((e) => e.label)).toContain('Northside Glass enquired (A new build)');
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

/**
 * Phase 3 — the roster the pricing control is rendered from.
 *
 * Until this existed the table from Phase 2 had no write path at all, so the stream read zero
 * in production whether or not a deal had been signed. These hold the two properties the
 * control depends on, and both of them are about a person at a keyboard rather than a number:
 *
 *   The SHAPE travels with the row, so the form opens on the monthly fee for a retainer plan.
 *   Lose it and a $4,500 monthly retainer is filed as a $4,500 engagement.
 *
 *   The rows needing attention are at the TOP, signed-unpriced first, because a signed deal
 *   with no value is the one actually suppressing the headline.
 */
describe('the deal roster behind the pricing control', () => {
  it('carries one row per intake, with the company and the stage it reached', async () => {
    withRows([
      intake({ id: 'a', company: 'Acme Industrial', interviewed_at: '2026-11-05T10:00:00Z' }),
      intake({ id: 'b', company: 'Borden Glass', proposal_sent_at: '2026-11-06T10:00:00Z' }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    const deals = flow.stream.deals ?? [];
    expect(deals).toHaveLength(2);
    expect(deals.map((d) => d.company).sort()).toEqual(['Acme Industrial', 'Borden Glass']);
    const byId = new Map(deals.map((d) => [d.enterpriseIntakeId, d]));
    expect(byId.get('a')!.stage).toBe('interviewed');
    expect(byId.get('b')!.stage).toBe('proposal_sent');
  });

  it('reports the furthest stage reached, not the earliest box ticked', async () => {
    withRows([intake({
      id: 'a',
      call_requested_at: '2026-11-02T10:00:00Z',
      interviewed_at: '2026-11-03T10:00:00Z',
      proposal_sent_at: '2026-11-04T10:00:00Z',
      signed_at: '2026-11-05T10:00:00Z',
    })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    expect(flow.stream.deals![0].stage).toBe('signed');
  });

  it('a lost prospect reads as lost on the row, while still counting in the funnel', async () => {
    withRows([intake({
      id: 'a', interviewed_at: '2026-11-03T10:00:00Z', lost_at: '2026-11-09T10:00:00Z',
    })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    expect(flow.stream.deals![0].stage).toBe('lost');
    // The funnel is about how far a cohort GOT, so losing them later does not un-interview
    // them. Subtracting the lost from the stages would understate reach.
    expect(stage(flow, 'interviewed').count).toBe(1);
  });

  it('carries the plan SHAPE, which is what opens the form on a monthly fee', async () => {
    withRows([
      intake({ id: 'a', company: 'Retainer Co', service: 'build' }),
      intake({ id: 'b', company: 'Training Co', service: 'train' }),
      intake({ id: 'c', company: 'Blank Co', service: '' }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    const byId = new Map((flow.stream.deals ?? []).map((d) => [d.enterpriseIntakeId, d]));
    // Plan A is the Middlesex shape: "we are looking at a retainer, a monthly fee."
    expect(byId.get('a')!.shape).toBe('monthly_retainer');
    expect(byId.get('a')!.planLabel).toBe('A new build');
    expect(byId.get('b')!.shape).toBe('training_program');
    // An unrecorded plan gets NO shape rather than the first one. A defaulted shape here
    // would open the form on the wrong field for a deal nobody has classified.
    expect(byId.get('c')!.shape).toBeNull();
    expect(byId.get('c')!.planKey).toBeNull();
  });

  it('never hands the control a blank company, because a blank row cannot be chosen', async () => {
    withRows([intake({ id: 'a', company: '   ' }), intake({ id: 'b', company: null })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    for (const d of flow.stream.deals ?? []) expect(d.company.trim()).not.toBe('');
  });

  it('says whether a deal is signed, which is what decides if its value reaches the headline', async () => {
    withRows([
      intake({ id: 'i-signed', signed_at: '2026-11-08T10:00:00Z' }),
      intake({ id: 'i-open', proposal_sent_at: '2026-11-08T10:00:00Z' }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    const byId = new Map((flow.stream.deals ?? []).map((d) => [d.enterpriseIntakeId, d]));
    expect(byId.get('i-signed')!.signed).toBe(true);
    expect(byId.get('i-open')!.signed).toBe(false);
  });

  it('shows the live value, with the monthly fee recoverable behind the total', async () => {
    mockLiveValues.mockResolvedValue([dealValue({
      enterpriseIntakeId: 'a', dealValueCents: 5400000, periodMonths: 12,
    })]);
    withRows([intake({ id: 'a', signed_at: '2026-11-08T10:00:00Z' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    const priced = flow.stream.deals![0].priced!;
    expect(priced.cents).toBe(5400000);
    // $54,000 over 12 months is the $4,500 retainer that was actually negotiated. Exact,
    // because the total was built by multiplying it out.
    expect(priced.monthlyCents).toBe(450000);
    expect(priced.confirmedBy).toBe('ali@colaberry.com');
  });

  it('withholds the monthly figure when no term was recorded rather than assuming twelve', async () => {
    mockLiveValues.mockResolvedValue([dealValue({
      enterpriseIntakeId: 'a', dealValueCents: 5400000, periodMonths: null,
    })]);
    withRows([intake({ id: 'a', signed_at: '2026-11-08T10:00:00Z' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    expect(flow.stream.deals![0].priced!.monthlyCents).toBeNull();
    expect(flow.stream.deals![0].priced!.periodMonths).toBeNull();
  });

  it('an unvalued deal reads as null, never as a zero value', async () => {
    mockLiveValues.mockResolvedValue([]);
    withRows([intake({ id: 'a', signed_at: '2026-11-08T10:00:00Z' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    // Null, not { cents: 0 }. "Nobody has priced this" and "this is worth nothing" are
    // different statements and the control must not merge them.
    expect(flow.stream.deals![0].priced).toBeNull();
  });

  it('puts the rows that need attention first: signed and unvalued at the top', async () => {
    mockLiveValues.mockResolvedValue([dealValue({ enterpriseIntakeId: 'priced' })]);
    withRows([
      intake({ id: 'priced', company: 'A Priced', signed_at: '2026-11-08T10:00:00Z' }),
      intake({ id: 'open', company: 'B Open', proposal_sent_at: '2026-11-08T10:00:00Z' }),
      intake({ id: 'signed', company: 'C Signed', signed_at: '2026-11-09T10:00:00Z' }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    // Signed-unvalued, then unvalued-unsigned, then the one already priced. Deliberately
    // asserted as the whole order rather than just "the first one", because the middle rank
    // is the part a careless sort gets wrong.
    expect((flow.stream.deals ?? []).map((d) => d.enterpriseIntakeId))
      .toEqual(['signed', 'open', 'priced']);
  });

  it('offers no roster at all when the table cannot be read', async () => {
    withRows([], false);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    // Undefined, not []. An empty roster says "no deals to price"; this state is "the source
    // could not be read", which the control reports differently.
    expect(flow.stream.deals).toBeUndefined();
    expect(flow.stream.status).toBe('unmeasurable');
  });

  it('offers an EMPTY roster when the table is there and holds nothing', async () => {
    withRows([]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    expect(flow.stream.deals).toEqual([]);
    expect(flow.stream.status).toBe('measured_zero');
  });
});

/**
 * Phase 4 — a test row is counted and flagged, never silently dropped.
 *
 * The distinction these tests defend is the whole design. A row that looks like a test row
 * still appears in every funnel stage, because a heuristic with the power to delete rows would
 * eventually delete a real company called "Test Valve". What the flag buys is that a person
 * about to price it, and a person reading the funnel, can both see which rows are suspect.
 *
 * So there are two assertions here that look like they are testing nothing, and are the most
 * important ones in the block: the flagged row is still in `inquired`, and the headline is
 * unchanged by flagging.
 */
describe('enterprise site stream: rows that may not be real inquiries', () => {
  beforeEach(() => mockLiveValues.mockResolvedValue([]));

  it('flags nothing, and says so at zero, when every row is clean', async () => {
    withRows([intake({ id: 'a' }), intake({ id: 'b', company: 'Northside Glass' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);

    expect((flow.stream.deals ?? []).map((d) => d.flags)).toEqual([[], []]);
    // Present at zero deliberately: an absent row would leave a reader unable to tell a clean
    // funnel from one nobody checked.
    expect(stage(flow, 'rows_flagged').count).toBe(0);
    expect(flow.events.filter((e) => e.classification === 'enterprise_suspect')).toEqual([]);
    expect(flow.stream.caveat ?? '').not.toContain('may not be real inquiries');
  });

  it('flags the row that actually arrived in production', async () => {
    withRows([intake({ id: 'acme', company: 'Acme Test Logistics' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    expect(flow.stream.deals![0].flags).toContain('looks like a test row (company name)');
    expect(stage(flow, 'rows_flagged').count).toBe(1);
  });

  it('STILL COUNTS a flagged row in the funnel, because flagging is not filtering', async () => {
    withRows([
      intake({ id: 'real', company: 'Northside Glass' }),
      intake({ id: 'fake', company: 'Acme Test Logistics' }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    // 2, not 1. Subtracting flagged rows from the funnel would make the count depend on a
    // guess about company names, and a row missing from a funnel leaves no trace at all.
    expect(stage(flow, 'inquired').count).toBe(2);
    expect(stage(flow, 'rows_flagged').count).toBe(1);
  });

  it('does not let a flag change the headline, which is gated on pricing instead', async () => {
    withRows([intake({ id: 'fake', company: 'Test Co', signed_at: '2026-11-08T10:00:00Z' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    // A flagged SIGNED deal with no value reports as signed-and-unvalued, exactly as a clean
    // one would. The flag informs the person pricing it; it does not price it for them, and
    // it must not quietly withhold a win either.
    expect(flow.stream.headline.cents).toBeNull();
    expect(flow.stream.headline.display).toBe('1 signed, none valued');
  });

  it('emits one timeline event per reason, dated when the row arrived', async () => {
    withRows([intake({
      id: 'bad', company: 'Test Co', email: 'ali@colaberry.com',
      created_at: '2026-11-03T10:00:00Z',
    })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    const suspect = flow.events.filter((e) => e.classification === 'enterprise_suspect');
    expect(suspect).toHaveLength(2);
    expect(suspect.map((e) => e.at)).toEqual(['2026-11-03', '2026-11-03']);
    expect(suspect[0].label).toBe('Test Co: looks like a test row (company name)');
    // Not money, and the registry says so. A suspect event carrying a figure would be
    // rejected at the service boundary rather than rendered.
    for (const e of suspect) expect(e.valueCents).toBeNull();
  });

  it('keeps an em dash out of the event label, which is rendered copy', async () => {
    withRows([intake({ id: 'bad', company: 'Test Co' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    // The government stream's equivalent label uses an em dash. These strings reach the
    // screen, and an em dash in rendered copy is a defect this repo has a CI ratchet for.
    for (const e of flow.events) {
      expect(e.label).not.toMatch(/[–—]/);
    }
  });

  it('bounds suspect events by the window, like every other event on this stream', async () => {
    withRows([intake({ id: 'old', company: 'Test Co', created_at: '2026-01-04T10:00:00Z' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    expect(flow.events.filter((e) => e.classification === 'enterprise_suspect')).toEqual([]);
    // The FUNNEL is not windowed, so the row is still counted and still flagged. The timeline
    // and the funnel answer different questions.
    expect(stage(flow, 'rows_flagged').count).toBe(1);
  });

  it('names the gap in the caveat, with the count', async () => {
    withRows([
      intake({ id: 'real', company: 'Northside Glass' }),
      intake({ id: 'fake', company: 'Acme Test Logistics' }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    expect(flow.stream.caveat).toContain('1 of 2 enterprise inquiry(ies) carry a flag');
    expect(flow.stream.caveat).not.toContain('EVERY row in this table is flagged');
  });

  it('says so loudly when EVERY row is flagged, because "1 of 1" reads as nothing', async () => {
    withRows([intake({ id: 'fake', company: 'Acme Test Logistics' })]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    expect(flow.stream.caveat).toContain('EVERY row in this table is flagged');
    // Still `live`: the table genuinely holds a row. The caveat is what stops that reading as
    // demand, rather than the status lying about what is in the table.
    expect(flow.stream.status).toBe('live');
  });

  it('sinks a flagged row BELOW a clean one inside the same group', async () => {
    withRows([
      intake({ id: 'fake', company: 'A Test Co' }),
      intake({ id: 'real', company: 'Z Northside Glass' }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    // Alphabetically 'A Test Co' sorts first, so this also proves the flag beats the name
    // tiebreak rather than coinciding with it.
    expect((flow.stream.deals ?? []).map((d) => d.enterpriseIntakeId)).toEqual(['real', 'fake']);
  });

  it('does NOT let the flag outrank signed, which is the key that matters for money', async () => {
    withRows([
      intake({ id: 'clean-open', company: 'A Clean Open', proposal_sent_at: '2026-11-08T10:00:00Z' }),
      intake({ id: 'flagged-signed', company: 'Z Test Co', signed_at: '2026-11-09T10:00:00Z' }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    // The signed row is flagged AND it still comes first, because a signed deal with no value
    // is the row actually suppressing the headline. Demotion happens only WITHIN a group.
    expect((flow.stream.deals ?? []).map((d) => d.enterpriseIntakeId))
      .toEqual(['flagged-signed', 'clean-open']);
  });

  it('flags both halves of a duplicate company, end to end', async () => {
    withRows([
      intake({ id: 'one', company: 'Western Valve', email: 'a@western-valve.com' }),
      intake({ id: 'two', company: 'western valve', email: 'b@western-valve.com' }),
    ]);
    const flow = await buildEnterpriseFlow(WINDOW_START);
    for (const d of flow.stream.deals ?? []) {
      expect(d.flags).toContain('duplicate company name');
    }
    expect(stage(flow, 'rows_flagged').count).toBe(2);
  });
});
