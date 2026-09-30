import { Op } from 'sequelize';

/**
 * T409 - the outcome normaliser, behaviourally, over in-memory tables and the
 * REAL recorder (its unique index on `(source, source_ref)` simulated by the
 * outcome store): each source's mapping, the untyped `no_answer` literal
 * counted and never guessed at, the same lead twice being one row per fact,
 * one source failing and the others still indexing, and no address anywhere
 * in what lands.
 */

type Row = Record<string, unknown>;

/** The subset of a Sequelize where a reader here uses: equality, arrays, Op.ne / Op.lt / Op.lte / Op.gte / Op.gt. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (Array.isArray(cond)) return cond.includes(v);
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<symbol, unknown>;
      if (Op.ne in c) return v !== c[Op.ne];
      if (Op.lt in c) return (v as Date) < (c[Op.lt] as Date);
      if (Op.lte in c) return (v as Date) <= (c[Op.lte] as Date);
      if (Op.gte in c) return (v as Date) >= (c[Op.gte] as Date);
      if (Op.gt in c) return (v as Date) > (c[Op.gt] as Date);
    }
    return v === cond;
  });
}

const asModel = (r: Row) => ({ ...r, get: (k: string) => r[k] });

function table(name: string) {
  const rows: Row[] = [];
  const findAll = jest.fn(async (...a: unknown[]) => { const { where } = a[0] as { where: Row }; return rows.filter((r) => matches(r, where)).map(asModel); });
  const findByPk = jest.fn(async (...a: unknown[]) => { const r = rows.find((x) => x.id === a[0]); return r ? asModel(r) : null; });
  return { name, rows, findAll, findByPk, seed: (...rs: Row[]) => { rows.push(...rs); } };
}

const t = {
  InteractionOutcome: table('interaction_outcomes'),
  Appointment: table('appointments'),
  StrategyCall: table('strategy_calls'),
  Activity: table('activities'),
  DeliveryEngagement: table('delivery_engagements'),
  Enrollment: table('enrollments'),
  Subscription: table('subscriptions'),
  Brand: table('brands'),
};

/** `growth_journey_outcomes` with the unique index on (source, source_ref) the real table has. */
const store: Row[] = [];
const outcomeCreate = jest.fn(async (...a: unknown[]) => {
  const row = a[0] as Row;
  if (store.some((r) => r.source === row.source && r.source_ref === row.source_ref)) {
    throw Object.assign(new Error('duplicate key value violates unique constraint'), { name: 'SequelizeUniqueConstraintError' });
  }
  const created = { id: `o-${store.length + 1}`, ...row };
  store.push(created);
  return created;
});
const outcomeFindOne = jest.fn(async (...a: unknown[]) => { const { where } = a[0] as { where: Row }; return store.find((r) => matches(r, where)) ?? null; });

jest.mock('../../ledger', () => ({ recordJourneyEvent: jest.fn(async () => ({ recorded: true })) }));  // T410: the ledger adapter, at its boundary
jest.mock('../../../../models', () => ({
  InteractionOutcome: { findAll: (...a: unknown[]) => t.InteractionOutcome.findAll(...a) },
  Appointment: { findAll: (...a: unknown[]) => t.Appointment.findAll(...a) },
  StrategyCall: { findAll: (...a: unknown[]) => t.StrategyCall.findAll(...a) },
  Activity: { findAll: (...a: unknown[]) => t.Activity.findAll(...a) },
  DeliveryEngagement: { findAll: (...a: unknown[]) => t.DeliveryEngagement.findAll(...a) },
  Enrollment: { findByPk: (...a: unknown[]) => t.Enrollment.findByPk(...a) },
  Subscription: { findAll: (...a: unknown[]) => t.Subscription.findAll(...a) },
  Brand: { findByPk: (...a: unknown[]) => t.Brand.findByPk(...a) },
  GrowthJourneyOutcome: { create: (...a: unknown[]) => outcomeCreate(...a), findOne: (...a: unknown[]) => outcomeFindOne(...a) },
}));
const resolveSubject = jest.fn();
jest.mock('../../subjectResolver', () => ({ resolveSubject: (...a: unknown[]) => resolveSubject(...a) }));
const redactForLogs = jest.fn((s: string) => jest.requireActual('../../../../utils/piiRedaction').redactForLogs(s));
jest.mock('../../../../utils/piiRedaction', () => ({ redactForLogs: (s: string) => redactForLogs(s) }));

import { APPOINTMENT_STATUS_MAP, INTERACTION_OUTCOME_MAP, normalizeExistingOutcomes, STRATEGY_CALL_STATUS_MAP } from '../outcomeNormalizer';

const LEAD = 501;
const BRAND = 'b-ent';
const TENANT = 't-colaberry';
const D = (s: string) => new Date(s);
const notCustomer = { paid: false, basis: 'none' };
const resolved = (over: Row = {}) => ({ status: 'resolved', sources: ['lead'], subject: { lead_id: LEAD, enrollment_id: null, visitor_id: null, org_member_id: null, email_normalized: null, brand_relationships: [], customer: notCustomer, ...over } });
const warned = () => (console.warn as jest.Mock).mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  for (const tb of Object.values(t)) { tb.rows.length = 0; tb.findAll.mockClear(); tb.findByPk.mockClear(); }
  store.length = 0;
  outcomeCreate.mockClear();
  outcomeFindOne.mockClear();
  redactForLogs.mockClear();
  resolveSubject.mockReset().mockResolvedValue(resolved());
  t.Brand.seed({ id: BRAND, tenant_id: TENANT });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const run = () => normalizeExistingOutcomes({ leadId: LEAD, brandId: BRAND });
const byRef = (source: string, ref: string) => store.find((r) => r.source === source && r.source_ref === ref);

describe('interaction outcomes', () => {
  it('maps replied and answered to reply, booked_meeting to meeting_booked, declined to declined - the outcome literal and the channel in metadata', async () => {
    t.InteractionOutcome.seed(
      { id: 1, lead_id: LEAD, outcome: 'replied', channel: 'email', created_at: D('2026-09-01T10:00:00Z') },
      { id: 2, lead_id: LEAD, outcome: 'answered', channel: 'voice', created_at: D('2026-09-02T10:00:00Z') },
      { id: 3, lead_id: LEAD, outcome: 'booked_meeting', channel: 'email', created_at: D('2026-09-03T10:00:00Z') },
      { id: 4, lead_id: LEAD, outcome: 'declined', channel: 'sms', created_at: D('2026-09-04T10:00:00Z') },
      { id: 9, lead_id: 999, outcome: 'replied', channel: 'email', created_at: D('2026-09-04T10:00:00Z') },
    );
    const r = await run();
    expect(r).toMatchObject({ status: 'normalized', created: 4, replayed: 0, unmapped: [], failed: [] });
    expect(r.by_type).toEqual({ reply: 2, meeting_booked: 1, declined: 1 });
    expect(byRef('interaction_outcomes', '1')).toMatchObject({ outcome_type: 'reply', metadata: { outcome: 'replied', channel: 'email' }, occurred_at: D('2026-09-01T10:00:00Z') });
    expect(byRef('interaction_outcomes', '2')).toMatchObject({ outcome_type: 'reply', metadata: { outcome: 'answered', channel: 'voice' } });
    expect(byRef('interaction_outcomes', '3')).toMatchObject({ outcome_type: 'meeting_booked' });
    expect(byRef('interaction_outcomes', '4')).toMatchObject({ outcome_type: 'declined' });
    expect(store.every((row) => row.lead_id === LEAD)).toBe(true);
  });

  it('the untyped no_answer voice literal maps to nothing and is COUNTED in unmapped - as are sent, opened, clicked, converted, no_response, bounced, unsubscribed, voicemail', async () => {
    const literals = ['no_answer', 'sent', 'opened', 'clicked', 'converted', 'no_response', 'bounced', 'unsubscribed', 'voicemail'];
    t.InteractionOutcome.seed(...literals.map((outcome, i) => ({ id: 10 + i, lead_id: LEAD, outcome, channel: 'voice', created_at: D('2026-09-01T10:00:00Z') })));
    const r = await run();
    expect(r.created).toBe(0);
    expect(store).toEqual([]);
    expect(r.unmapped).toHaveLength(literals.length);
    expect(r.unmapped.find((u) => u.literal === 'no_answer')).toEqual({ source: 'interaction_outcomes', source_ref: '10', literal: 'no_answer' });
    expect(Object.keys(INTERACTION_OUTCOME_MAP).sort()).toEqual(['answered', 'booked_meeting', 'declined', 'replied']);
  });
});

describe('appointments and strategy calls', () => {
  it('scheduled maps to meeting_booked (occurred when it was booked) and completed to meeting_completed (occurred when it was held); cancelled is unmapped', async () => {
    t.Appointment.seed(
      { id: 'a-1', lead_id: LEAD, status: 'scheduled', scheduled_at: D('2026-09-20T15:00:00Z'), created_at: D('2026-09-10T09:00:00Z') },
      { id: 'a-2', lead_id: LEAD, status: 'completed', scheduled_at: D('2026-09-05T15:00:00Z'), created_at: D('2026-09-01T09:00:00Z') },
      { id: 'a-3', lead_id: LEAD, status: 'cancelled', scheduled_at: D('2026-09-06T15:00:00Z'), created_at: D('2026-09-01T09:00:00Z') },
    );
    t.StrategyCall.seed(
      { id: 'sc-1', lead_id: LEAD, status: 'scheduled', scheduled_at: D('2026-09-21T15:00:00Z'), created_at: D('2026-09-11T09:00:00Z') },
      { id: 'sc-2', lead_id: LEAD, status: 'completed', scheduled_at: D('2026-09-07T15:00:00Z'), created_at: D('2026-09-02T09:00:00Z') },
      { id: 'sc-3', lead_id: LEAD, status: 'cancelled', scheduled_at: D('2026-09-08T15:00:00Z'), created_at: D('2026-09-02T09:00:00Z') },
    );
    const r = await run();
    expect(r.by_type).toEqual({ meeting_booked: 2, meeting_completed: 2 });
    expect(byRef('appointments', 'a-1')).toMatchObject({ outcome_type: 'meeting_booked', occurred_at: D('2026-09-10T09:00:00Z'), metadata: { status: 'scheduled' } });
    expect(byRef('appointments', 'a-2')).toMatchObject({ outcome_type: 'meeting_completed', occurred_at: D('2026-09-05T15:00:00Z') });
    expect(byRef('strategy_calls', 'sc-1')).toMatchObject({ outcome_type: 'meeting_booked', occurred_at: D('2026-09-11T09:00:00Z') });
    expect(byRef('strategy_calls', 'sc-2')).toMatchObject({ outcome_type: 'meeting_completed', occurred_at: D('2026-09-07T15:00:00Z') });
    expect(r.unmapped).toEqual([
      { source: 'appointments', source_ref: 'a-3', literal: 'cancelled' },
      { source: 'strategy_calls', source_ref: 'sc-3', literal: 'cancelled' },
    ]);
  });

  it('no_show maps to meeting_no_show, on appointments and strategy calls alike, occurring when the meeting was scheduled for', async () => {
    t.Appointment.seed({ id: 'a-ns', lead_id: LEAD, status: 'no_show', scheduled_at: D('2026-09-05T15:00:00Z'), created_at: D('2026-09-01T09:00:00Z') });
    t.StrategyCall.seed({ id: 'sc-ns', lead_id: LEAD, status: 'no_show', scheduled_at: D('2026-09-06T15:00:00Z'), created_at: D('2026-09-01T09:00:00Z') });
    const r = await run();
    expect(r.by_type).toEqual({ meeting_no_show: 2 });
    expect(byRef('appointments', 'a-ns')).toMatchObject({ outcome_type: 'meeting_no_show', occurred_at: D('2026-09-05T15:00:00Z'), metadata: { status: 'no_show' } });
    expect(byRef('strategy_calls', 'sc-ns')).toMatchObject({ outcome_type: 'meeting_no_show', occurred_at: D('2026-09-06T15:00:00Z') });
    expect(APPOINTMENT_STATUS_MAP.no_show).toBe('meeting_no_show');
    expect(STRATEGY_CALL_STATUS_MAP.no_show).toBe('meeting_no_show');
  });
});

describe('the paid relationship', () => {
  it("payment_status='paid' (the resolver's customer fact, basis payment_status) is enrolled_paid with the enrolment id as the ref, occurring when the enrolment was created", async () => {
    resolveSubject.mockResolvedValue(resolved({ enrollment_id: 'e-1', customer: { paid: true, basis: 'payment_status' } }));
    t.Enrollment.seed({ id: 'e-1', tier: 'member', payment_status: 'paid', email: 'paid.learner@example.com', created_at: D('2026-08-01T00:00:00Z') });
    const r = await run();
    expect(r.by_type).toEqual({ enrolled_paid: 1 });
    expect(byRef('enrollments', 'e-1')).toMatchObject({ outcome_type: 'enrolled_paid', occurred_at: D('2026-08-01T00:00:00Z'), metadata: { tier: 'member' } });
    expect(resolveSubject).toHaveBeenCalledWith({ leadId: LEAD });
  });

  it('an active subscription on the enrolment is subscription_active with the subscription id as the ref; a paid-by-subscription customer gets that and no enrolled_paid', async () => {
    resolveSubject.mockResolvedValue(resolved({ enrollment_id: 'e-2', customer: { paid: true, basis: 'subscription' } }));
    t.Enrollment.seed({ id: 'e-2', tier: 'member', payment_status: 'pending', created_at: D('2026-08-01T00:00:00Z') });
    t.Subscription.seed(
      { id: 's-1', enrollment_id: 'e-2', status: 'active', plan: 'monthly', started_at: D('2026-08-15T00:00:00Z'), created_at: D('2026-08-14T00:00:00Z') },
      { id: 's-0', enrollment_id: 'e-2', status: 'cancelled', plan: 'monthly', started_at: D('2026-07-01T00:00:00Z'), created_at: D('2026-07-01T00:00:00Z') },
      { id: 's-x', enrollment_id: 'e-other', status: 'active', plan: 'annual', started_at: D('2026-08-15T00:00:00Z'), created_at: D('2026-08-14T00:00:00Z') },
    );
    const r = await run();
    expect(r.by_type).toEqual({ subscription_active: 1 });
    expect(byRef('subscriptions', 's-1')).toMatchObject({ outcome_type: 'subscription_active', occurred_at: D('2026-08-15T00:00:00Z'), metadata: { plan: 'monthly' } });
    expect(t.Enrollment.findByPk).not.toHaveBeenCalled();
  });

  it('a lead with no enrolment, or one the resolver says is not a customer, yields nothing from enrolments or subscriptions', async () => {
    t.Subscription.seed({ id: 's-1', enrollment_id: 'e-3', status: 'active', plan: 'monthly', started_at: D('2026-08-15T00:00:00Z'), created_at: D('2026-08-14T00:00:00Z') });
    expect((await run()).by_type).toEqual({});
    resolveSubject.mockResolvedValue(resolved({ enrollment_id: 'e-3', customer: notCustomer }));
    expect((await run()).by_type).toEqual({ subscription_active: 1 });
    resolveSubject.mockResolvedValue({ status: 'unresolved', reason: 'anchor_not_found' });
    expect((await run()).by_type).toEqual({});
  });
});

describe('delivery engagements and pipeline history', () => {
  it('a delivery engagement sourced from the lead is project_started with the engagement id as the ref; a cancelled one is not', async () => {
    t.DeliveryEngagement.seed(
      { id: 'de-1', source_lead_id: LEAD, status: 'active', created_at: D('2026-09-01T00:00:00Z') },
      { id: 'de-2', source_lead_id: LEAD, status: 'cancelled', created_at: D('2026-09-02T00:00:00Z') },
      { id: 'de-3', source_lead_id: 777, status: 'active', created_at: D('2026-09-02T00:00:00Z') },
    );
    const r = await run();
    expect(r.by_type).toEqual({ project_started: 1 });
    expect(byRef('delivery_engagements', 'de-1')).toMatchObject({ outcome_type: 'project_started', occurred_at: D('2026-09-01T00:00:00Z'), metadata: { status: 'active' } });
    expect(t.DeliveryEngagement.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { source_lead_id: LEAD, status: { [Op.ne]: 'cancelled' } } }));
  });

  it("a status_change activity is opportunity_stage with the stage in metadata and T406's ref `<lead>:<stage>` - both writers' metadata shapes read; one without a stage is unmapped; other activity types are ignored", async () => {
    t.Activity.seed(
      { id: 'act-1', lead_id: LEAD, type: 'status_change', metadata: { from_stage: 'new', to_stage: 'contacted', trigger: 'manual' }, created_at: D('2026-09-01T00:00:00Z') },
      { id: 'act-2', lead_id: LEAD, type: 'status_change', metadata: { from: 'contacted', to: 'meeting_scheduled' }, created_at: D('2026-09-03T00:00:00Z') },
      { id: 'act-3', lead_id: LEAD, type: 'status_change', metadata: { note: 'no stage here' }, created_at: D('2026-09-04T00:00:00Z') },
      { id: 'act-4', lead_id: LEAD, type: 'note', metadata: { to: 'proposal_sent' }, created_at: D('2026-09-05T00:00:00Z') },
    );
    const r = await run();
    expect(r.by_type).toEqual({ opportunity_stage: 2 });
    expect(byRef('leads.pipeline_stage', `${LEAD}:contacted`)).toMatchObject({ outcome_type: 'opportunity_stage', occurred_at: D('2026-09-01T00:00:00Z'), metadata: { stage: 'contacted', from_stage: 'new', activity_id: 'act-1' } });
    expect(byRef('leads.pipeline_stage', `${LEAD}:meeting_scheduled`)).toMatchObject({ metadata: { stage: 'meeting_scheduled', from_stage: 'contacted', activity_id: 'act-2' } });
    expect(r.unmapped).toEqual([{ source: 'leads.pipeline_stage', source_ref: 'act-3', literal: 'status_change_without_stage' }]);
    expect(t.Activity.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { lead_id: LEAD, type: 'status_change' } }));
  });

  it("a stage T406's advance already indexed (same source, same ref) replays rather than duplicating - the two writers share one convention", async () => {
    store.push({ id: 'o-t406', tenant_id: TENANT, brand_id: BRAND, subject_ref: `lead:${LEAD}`, lead_id: LEAD, handoff_id: 'h-1', outcome_type: 'opportunity_stage', source: 'leads.pipeline_stage', source_ref: `${LEAD}:meeting_scheduled`, occurred_at: D('2026-09-03T00:00:00Z'), metadata: { stage: 'meeting_scheduled', trigger: 'growth_journey:handoff:h-1', disposition: 'qualified' } });
    t.Activity.seed({ id: 'act-2', lead_id: LEAD, type: 'status_change', metadata: { from_stage: 'contacted', to_stage: 'meeting_scheduled', trigger: 'growth_journey:handoff:h-1' }, created_at: D('2026-09-03T00:00:00Z') });
    const r = await run();
    expect(r).toMatchObject({ created: 0, replayed: 1, by_type: { opportunity_stage: 1 } });
    expect(store).toHaveLength(1);
    expect(store[0].handoff_id).toBe('h-1');
  });
});

describe('idempotency, scope and failure', () => {
  const seedEverything = () => {
    t.InteractionOutcome.seed({ id: 1, lead_id: LEAD, outcome: 'replied', channel: 'email', created_at: D('2026-09-01T10:00:00Z') }, { id: 2, lead_id: LEAD, outcome: 'no_answer', channel: 'voice', created_at: D('2026-09-01T11:00:00Z') });
    t.Appointment.seed({ id: 'a-1', lead_id: LEAD, status: 'completed', scheduled_at: D('2026-09-05T15:00:00Z'), created_at: D('2026-09-01T09:00:00Z') });
    t.StrategyCall.seed({ id: 'sc-1', lead_id: LEAD, status: 'scheduled', scheduled_at: D('2026-09-21T15:00:00Z'), created_at: D('2026-09-11T09:00:00Z') });
    t.Activity.seed({ id: 'act-1', lead_id: LEAD, type: 'status_change', metadata: { to_stage: 'contacted' }, created_at: D('2026-09-01T00:00:00Z') });
    t.DeliveryEngagement.seed({ id: 'de-1', source_lead_id: LEAD, status: 'active', created_at: D('2026-09-01T00:00:00Z') });
    resolveSubject.mockResolvedValue(resolved({ enrollment_id: 'e-1', customer: { paid: true, basis: 'payment_status' } }));
    t.Enrollment.seed({ id: 'e-1', tier: 'member', payment_status: 'paid', email: 'paid.learner@example.com', created_at: D('2026-08-01T00:00:00Z') });
    t.Subscription.seed({ id: 's-1', enrollment_id: 'e-1', status: 'active', plan: 'monthly', started_at: D('2026-08-15T00:00:00Z'), created_at: D('2026-08-14T00:00:00Z') });
  };

  it('normalising the same lead twice is one row per source_ref: the second run creates nothing and replays every fact', async () => {
    seedEverything();
    const first = await run();
    expect(first).toMatchObject({ created: 7, replayed: 0 });
    expect(first.unmapped).toEqual([{ source: 'interaction_outcomes', source_ref: '2', literal: 'no_answer' }]);
    const refs = store.map((r) => `${r.source}/${r.source_ref}`).sort();
    const second = await run();
    expect(second).toMatchObject({ created: 0, replayed: 7, by_type: first.by_type });
    expect(store.map((r) => `${r.source}/${r.source_ref}`).sort()).toEqual(refs);
    expect(new Set(refs).size).toBe(7);
  });

  it('every row carries the brand, the tenant read from the brand, subject_ref lead:<id> and the lead id - and no address anywhere, whatever the source rows carry', async () => {
    seedEverything();
    await run();
    for (const row of store) expect(row).toMatchObject({ tenant_id: TENANT, brand_id: BRAND, subject_ref: `lead:${LEAD}`, lead_id: LEAD, handoff_id: null });
    expect(JSON.stringify(store)).not.toContain('@');
  });

  it('an unknown brand is no_brand: nothing read from any source, nothing written', async () => {
    seedEverything();
    const r = await normalizeExistingOutcomes({ leadId: LEAD, brandId: 'b-nope' });
    expect(r).toEqual({ status: 'no_brand', created: 0, replayed: 0, unmapped: [], failed: [], by_type: {} });
    expect(t.InteractionOutcome.findAll).not.toHaveBeenCalled();
    expect(store).toEqual([]);
  });

  it('one source throwing is one failed entry with its error class, logged through the redactor; every other source still indexes', async () => {
    seedEverything();
    t.Appointment.findAll.mockRejectedValueOnce(Object.assign(new Error('relation "appointments" does not exist'), { name: 'SequelizeDatabaseError' }));
    const r = await run();
    expect(r.failed).toEqual([{ source: 'appointments', error_class: expect.any(String) }]);
    expect(r.created).toBe(6);
    expect(byRef('appointments', 'a-1')).toBeUndefined();
    expect(byRef('strategy_calls', 'sc-1')).toBeDefined();
    const line = warned().find((l) => l.includes('growth_journey.outcome.normalize_source_failed'));
    expect(line).toBeDefined();
    expect(JSON.parse(line as string)).toMatchObject({ source: 'appointments', lead_id: LEAD, brand_id: BRAND, error_class: expect.any(String) });
    expect(redactForLogs).toHaveBeenCalledTimes(1);
  });

  it('a write the recorder refuses is one failed entry for that fact; the rest of the source still indexes', async () => {
    t.InteractionOutcome.seed({ id: 1, lead_id: LEAD, outcome: 'replied', channel: 'email', created_at: D('2026-09-01T10:00:00Z') }, { id: 2, lead_id: LEAD, outcome: 'declined', channel: 'sms', created_at: D('2026-09-02T10:00:00Z') });
    outcomeCreate.mockRejectedValueOnce(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    const r = await run();
    expect(r.failed).toEqual([{ source: 'interaction_outcomes', error_class: expect.any(String) }]);
    expect(r.created).toBe(1);
    expect(store).toHaveLength(1);
    expect(warned().some((l) => l.includes('growth_journey.outcome.normalize_write_failed') && l.includes('"source_ref":"1"'))).toBe(true);
  });
});
