import {
  BELOW_MIN_SAMPLES,
  computeHandoffRates,
  computeHandoffRatesByQueue,
  medianHours,
  MIN_MEDIAN_SAMPLES,
  NO_DENOMINATOR,
  rate,
  type HandoffRates,
  type RateHandoffRow,
  type RateOutcomeRow,
} from '../handoffRates';

/**
 * T409 - the rates, pure: a zero denominator is `null` with a reason and never
 * `0`; a median below three samples is `null`; a brand with no handoffs answers
 * `null` for every rate; and each rate's numerator and denominator are exactly
 * the rows the header says they are.
 */

const D = (s: string) => new Date(s);
const WINDOW = { from: D('2026-09-01T00:00:00Z'), to: D('2026-10-01T00:00:00Z') };
const BRAND = 'b-ent';

const h = (over: Partial<RateHandoffRow> & { id: string }): RateHandoffRow => ({
  owner_queue: 'sales', status: 'queued', disposition: null, subject_ref: `lead:${over.id}`, created_at: D('2026-09-05T00:00:00Z'), accepted_at: null, disposition_at: null, ...over,
});
const o = (over: Partial<RateOutcomeRow> & { subject_ref: string; outcome_type: RateOutcomeRow['outcome_type'] }): RateOutcomeRow => ({
  handoff_id: null, occurred_at: D('2026-09-06T00:00:00Z'), metadata: null, ...over,
});

const RATE_KEYS = ['acceptance_rate', 'expiry_rate', 'connection_rate', 'meeting_rate', 'qualification_rate', 'proposal_rate', 'conversion_rate', 'false_positive_handoff_rate'] as const;
const MEDIAN_KEYS = ['time_to_accept_hours', 'time_to_disposition_hours', 'time_to_first_connection_hours'] as const;

describe('never zero for nothing', () => {
  it('rate(n, 0) is null with reason no_denominator - never 0 - and rate(0, n) is the genuine 0', () => {
    expect(rate(0, 0)).toEqual({ value: null, numerator: 0, denominator: 0, reason: NO_DENOMINATOR });
    expect(rate(0, 0).value).not.toBe(0);
    expect(rate(3, 0).value).toBeNull();
    expect(rate(0, 2)).toEqual({ value: 0, numerator: 0, denominator: 2 });
    expect(rate(3, 4)).toEqual({ value: 0.75, numerator: 3, denominator: 4 });
    expect(rate(1, 1).reason).toBeUndefined();
  });

  it('a median below MIN_MEDIAN_SAMPLES (3) is null with reason below_min_samples; at three it is the middle; at four the mean of the middle two', () => {
    expect(MIN_MEDIAN_SAMPLES).toBe(3);
    expect(medianHours([])).toEqual({ value: null, samples: 0, reason: BELOW_MIN_SAMPLES });
    expect(medianHours([4])).toEqual({ value: null, samples: 1, reason: BELOW_MIN_SAMPLES });
    expect(medianHours([4, 100])).toEqual({ value: null, samples: 2, reason: BELOW_MIN_SAMPLES });
    expect(medianHours([100, 4, 7])).toEqual({ value: 7, samples: 3 });
    expect(medianHours([100, 4, 7, 9])).toEqual({ value: 8, samples: 4 });
  });

  it('a brand with no handoffs returns every rate null with no_denominator, every median null with below_min_samples, and zero counts', () => {
    const r = computeHandoffRates({ brandId: BRAND, window: WINDOW, handoffs: [], outcomes: [o({ subject_ref: 'lead:9', outcome_type: 'reply' })] });
    expect(r).toMatchObject({ brand_id: BRAND, owner_queue: 'all', handoffs: 0, accepted: 0, verdicts: 0, window: { from: WINDOW.from.toISOString(), to: WINDOW.to.toISOString() } });
    for (const k of RATE_KEYS) {
      expect(r[k]).toEqual({ value: null, numerator: 0, denominator: 0, reason: NO_DENOMINATOR });
      expect(r[k].value).not.toBe(0);
    }
    for (const k of MEDIAN_KEYS) expect(r[k]).toEqual({ value: null, samples: 0, reason: BELOW_MIN_SAMPLES });
  });

  it('handoffs nobody accepted or ruled on: acceptance is the genuine 0 of N, and the rates over accepted / verdicts are null, not 0', () => {
    const r = computeHandoffRates({ brandId: BRAND, window: WINDOW, handoffs: [h({ id: '1' }), h({ id: '2' })], outcomes: [] });
    expect(r.acceptance_rate).toEqual({ value: 0, numerator: 0, denominator: 2 });
    expect(r.expiry_rate).toEqual({ value: 0, numerator: 0, denominator: 2 });
    for (const k of ['connection_rate', 'meeting_rate', 'qualification_rate', 'proposal_rate', 'conversion_rate', 'false_positive_handoff_rate'] as const) {
      expect(r[k]).toEqual({ value: null, numerator: 0, denominator: 0, reason: NO_DENOMINATOR });
    }
  });
});

describe('what each rate counts', () => {
  // Eight handoffs in the window: 6 accepted; 5 verdicts (2 qualified, 1 converted, 1 disqualified, 1 nurture returned); 1 expired; 1 still queued.
  const HANDOFFS: RateHandoffRow[] = [
    h({ id: 'q1', status: 'dispositioned', disposition: 'qualified', accepted_at: D('2026-09-05T10:00:00Z'), disposition_at: D('2026-09-06T10:00:00Z') }),
    h({ id: 'q2', status: 'dispositioned', disposition: 'qualified', accepted_at: D('2026-09-05T02:00:00Z'), disposition_at: D('2026-09-07T02:00:00Z') }),
    h({ id: 'c1', status: 'dispositioned', disposition: 'converted', accepted_at: D('2026-09-05T04:00:00Z'), disposition_at: D('2026-09-05T16:00:00Z') }),
    h({ id: 'd1', status: 'dispositioned', disposition: 'disqualified', accepted_at: D('2026-09-05T20:00:00Z'), disposition_at: D('2026-09-05T21:00:00Z') }),
    h({ id: 'n1', status: 'returned_to_ai', disposition: 'nurture', accepted_at: D('2026-09-05T01:00:00Z'), disposition_at: D('2026-09-05T02:00:00Z') }),
    h({ id: 'a1', status: 'accepted', accepted_at: D('2026-09-05T08:00:00Z') }),
    h({ id: 'x1', status: 'expired' }),
    h({ id: 'w1', status: 'queued', owner_queue: 'admissions' }),
  ];
  const OUTCOMES: RateOutcomeRow[] = [
    o({ subject_ref: 'lead:q1', outcome_type: 'reply', occurred_at: D('2026-09-05T12:00:00Z') }),
    o({ subject_ref: 'lead:q1', outcome_type: 'meeting_booked', occurred_at: D('2026-09-05T13:00:00Z') }),
    o({ subject_ref: 'lead:q1', outcome_type: 'opportunity_stage', metadata: { stage: 'proposal_sent' }, occurred_at: D('2026-09-08T00:00:00Z') }),
    o({ subject_ref: 'lead:q2', outcome_type: 'meeting_completed', occurred_at: D('2026-09-06T00:00:00Z') }),
    o({ subject_ref: 'lead:q2', outcome_type: 'opportunity_stage', metadata: { stage: 'meeting_scheduled' }, occurred_at: D('2026-09-06T00:00:00Z') }),
    o({ subject_ref: 'lead:c1', outcome_type: 'reply', occurred_at: D('2026-09-05T06:00:00Z') }),
    o({ subject_ref: 'lead:c1', outcome_type: 'handoff_dispositioned', handoff_id: 'c1', occurred_at: D('2026-09-05T16:00:00Z') }),
    o({ subject_ref: 'lead:a1', outcome_type: 'meeting_no_show', occurred_at: D('2026-09-09T00:00:00Z') }),
    o({ subject_ref: 'lead:d1', outcome_type: 'reply', occurred_at: D('2026-09-04T00:00:00Z') }),
    o({ subject_ref: 'lead:x1', outcome_type: 'reply', occurred_at: D('2026-09-07T00:00:00Z') }),
    o({ subject_ref: 'lead:zz', outcome_type: 'reply', occurred_at: D('2026-09-07T00:00:00Z') }),
  ];
  let r: HandoffRates;
  beforeAll(() => { r = computeHandoffRates({ brandId: BRAND, window: WINDOW, handoffs: HANDOFFS, outcomes: OUTCOMES }); });

  it('acceptance = accepted / handoffs; expiry = expired / handoffs', () => {
    expect(r).toMatchObject({ handoffs: 8, accepted: 6, verdicts: 5 });
    expect(r.acceptance_rate).toEqual({ value: 0.75, numerator: 6, denominator: 8 });
    expect(r.expiry_rate).toEqual({ value: 0.125, numerator: 1, denominator: 8 });
  });

  it('connection = accepted handoffs with a reply or meeting outcome AFTER creation / accepted (a reply before the handoff, or on an unaccepted row, does not count)', () => {
    // q1 (reply), q2 (meeting_completed), c1 (reply), a1 (no_show) connected; d1's reply predates the handoff; n1 nothing; x1 is not accepted.
    expect(r.connection_rate).toEqual({ value: 4 / 6, numerator: 4, denominator: 6 });
  });

  it('meeting = accepted handoffs with meeting_booked or meeting_completed / accepted (a no-show is a connection, not a meeting)', () => {
    expect(r.meeting_rate).toEqual({ value: 2 / 6, numerator: 2, denominator: 6 });
  });

  it('qualification = qualified | converted / verdicts, where a verdict is ANY disposition - a nurture return is a ruling too', () => {
    expect(r.qualification_rate).toEqual({ value: 0.6, numerator: 3, denominator: 5 });
  });

  it('false_positive_handoff_rate = disqualified | no_contact / verdicts; conversion = converted / verdicts', () => {
    expect(r.false_positive_handoff_rate).toEqual({ value: 0.2, numerator: 1, denominator: 5 });
    expect(r.conversion_rate).toEqual({ value: 0.2, numerator: 1, denominator: 5 });
  });

  it('proposal = qualified | converted handoffs with an opportunity_stage proposal_sent outcome / qualified | converted (another stage is not a proposal)', () => {
    expect(r.proposal_rate).toEqual({ value: 1 / 3, numerator: 1, denominator: 3 });
  });

  it('time_to_accept over the six accepted (hours from creation), time_to_disposition over the five verdicts (hours from acceptance), time_to_first_connection over the four connected', () => {
    // accept: q1 10, q2 2, c1 4, d1 20, n1 1, a1 8 -> sorted 1 2 4 8 10 20 -> (4+8)/2
    expect(r.time_to_accept_hours).toEqual({ value: 6, samples: 6 });
    // disposition: q1 24, q2 48, c1 12, d1 1, n1 1 -> sorted 1 1 12 24 48 -> 12
    expect(r.time_to_disposition_hours).toEqual({ value: 12, samples: 5 });
    // first connection from creation (09-05T00): q1 12, q2 24, c1 6, a1 96 -> sorted 6 12 24 96 -> 18
    expect(r.time_to_first_connection_hours).toEqual({ value: 18, samples: 4 });
  });
});

describe('attachment, window and queue', () => {
  it('an outcome stamped with a handoff_id attaches to that handoff only; an unstamped one attaches by subject_ref at or after creation and no later than the window end', () => {
    const handoffs = [
      h({ id: 'h1', subject_ref: 'lead:1', status: 'accepted', accepted_at: D('2026-09-05T01:00:00Z') }),
      h({ id: 'h2', subject_ref: 'lead:1', status: 'accepted', accepted_at: D('2026-09-20T01:00:00Z'), created_at: D('2026-09-20T00:00:00Z') }),
    ];
    const outcomes = [
      o({ subject_ref: 'lead:1', outcome_type: 'reply', handoff_id: 'h2', occurred_at: D('2026-09-05T02:00:00Z') }),
      o({ subject_ref: 'lead:1', outcome_type: 'meeting_booked', occurred_at: D('2026-10-02T00:00:00Z') }),
    ];
    const r = computeHandoffRates({ brandId: BRAND, window: WINDOW, handoffs, outcomes });
    // The stamped reply belongs to h2 whatever its time; the October booking is past the window end for both.
    expect(r.connection_rate).toEqual({ value: 0.5, numerator: 1, denominator: 2 });
    expect(r.meeting_rate).toEqual({ value: 0, numerator: 0, denominator: 2 });
  });

  it('only handoffs created inside [from, to) count; the window end is exclusive', () => {
    const handoffs = [
      h({ id: 'before', created_at: D('2026-08-31T23:59:59Z'), status: 'expired' }),
      h({ id: 'at-from', created_at: WINDOW.from, status: 'expired' }),
      h({ id: 'at-to', created_at: WINDOW.to, status: 'expired' }),
      h({ id: 'inside', created_at: D('2026-09-15T00:00:00Z') }),
    ];
    const r = computeHandoffRates({ brandId: BRAND, window: WINDOW, handoffs, outcomes: [] });
    expect(r.handoffs).toBe(2);
    expect(r.expiry_rate).toEqual({ value: 0.5, numerator: 1, denominator: 2 });
  });

  it('by queue: each queue sees only its rows, an idle queue answers null everywhere, and all is the brand', () => {
    const handoffs = [
      h({ id: 's1', owner_queue: 'sales', status: 'dispositioned', disposition: 'no_contact', accepted_at: D('2026-09-05T01:00:00Z'), disposition_at: D('2026-09-05T02:00:00Z') }),
      h({ id: 's2', owner_queue: 'sales', status: 'dispositioned', disposition: 'qualified', accepted_at: D('2026-09-05T01:00:00Z'), disposition_at: D('2026-09-05T02:00:00Z') }),
      h({ id: 'ad1', owner_queue: 'admissions', status: 'dispositioned', disposition: 'converted', accepted_at: D('2026-09-05T01:00:00Z'), disposition_at: D('2026-09-05T02:00:00Z') }),
    ];
    const { all, by_queue } = computeHandoffRatesByQueue({ brandId: BRAND, window: WINDOW, handoffs, outcomes: [] }, ['sales', 'admissions', 'support']);
    expect(all).toMatchObject({ owner_queue: 'all', handoffs: 3, false_positive_handoff_rate: { value: 1 / 3, numerator: 1, denominator: 3 } });
    expect(by_queue.sales).toMatchObject({ owner_queue: 'sales', handoffs: 2, false_positive_handoff_rate: { value: 0.5, numerator: 1, denominator: 2 }, qualification_rate: { value: 0.5 } });
    expect(by_queue.admissions).toMatchObject({ owner_queue: 'admissions', handoffs: 1, conversion_rate: { value: 1, numerator: 1, denominator: 1 }, false_positive_handoff_rate: { value: 0, numerator: 0, denominator: 1 } });
    expect(by_queue.support).toMatchObject({ handoffs: 0, false_positive_handoff_rate: { value: null, reason: NO_DENOMINATOR } });
    expect(by_queue.ali).toBeUndefined();
  });
});
