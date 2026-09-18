import * as fs from 'fs';
import * as path from 'path';
import { Op } from 'sequelize';

/**
 * T404 — the handoff writer, the queue and the gated assignment, driven
 * against an IN-MEMORY handoff store that enforces T401's two unique indexes
 * (the idempotency key; one open row per subject per brand) and evaluates the
 * `where` clauses the writer and the capacity reader send, so counts and
 * replays are real rather than mocked answers.
 */

type Row = Record<string, unknown> & { id: string; status: string; created_at: Date; update: (p: Record<string, unknown>) => Promise<Row> };
const store: Row[] = [];
let seq = 0;
const policies: Record<string, unknown>[] = [];
const m = {
  leadFindByPk: jest.fn(),
  contextFindOne: jest.fn(),
  logFindAll: jest.fn(),
  outcomeCount: jest.fn(),
  loadCounts: jest.fn(),
  logEvent: jest.fn(),
  createTicket: jest.fn(),
  killSwitch: jest.fn(),
  creatorId: jest.fn(),
};

const uniqueError = () => Object.assign(new Error('duplicate key'), { name: 'SequelizeUniqueConstraintError' });

/** A tiny where-evaluator for the shapes this module sends: equality, Op.in, Op.gte/gt/lt/lte, Op.or. */
function matches(row: Record<string, unknown>, where: Record<string | symbol, unknown>): boolean {
  for (const key of Reflect.ownKeys(where)) {
    const cond = (where as Record<string | symbol, unknown>)[key];
    if (key === Op.or) {
      if (!(cond as Record<string, unknown>[]).some((alt) => matches(row, alt))) return false;
      continue;
    }
    const v = row[key as string];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<symbol, unknown>;
      if (Op.in in c && !(c[Op.in] as unknown[]).includes(v)) return false;
      if (Op.gte in c && !((v as Date) >= (c[Op.gte] as Date))) return false;
      if (Op.gt in c && !((v as Date) > (c[Op.gt] as Date))) return false;
      if (Op.lt in c && !((v as Date) < (c[Op.lt] as Date))) return false;
      if (Op.lte in c && !((v as Date) <= (c[Op.lte] as Date))) return false;
      if (Op.ne in c && v === c[Op.ne]) return false;
    } else if (v !== cond) return false;
  }
  return true;
}

jest.mock('../../../../models', () => ({
  GrowthJourneyHandoff: {
    create: async (attrs: Record<string, unknown>) => {
      const open = ['queued', 'assigned', 'accepted'];
      if (store.some((r) => r.idempotency_key === attrs.idempotency_key)) throw uniqueError();
      if (store.some((r) => r.subject_ref === attrs.subject_ref && r.brand_id === attrs.brand_id && open.includes(r.status))) throw uniqueError();
      const row: Row = { ...attrs, id: `h-${++seq}`, status: String(attrs.status ?? 'queued'), created_at: new Date(CLOCK.getTime() + seq), assignment_blocked_reason: null, assigned_to_type: null, assigned_to_id: null, ticket_id: null, update: async (p) => Object.assign(row, p) };
      store.push(row);
      return row;
    },
    findOne: async ({ where }: { where: Record<string, unknown> }) => store.filter((r) => matches(r, where)).sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0] ?? null,
    findAll: async ({ where }: { where: Record<string, unknown> }) => store.filter((r) => matches(r, where)),
    count: async ({ where }: { where: Record<string, unknown> }) => store.filter((r) => matches(r, where)).length,
  },
  GrowthJourneyPolicy: { findOne: async ({ where }: { where: Record<string, unknown> }) => policies.find((p) => matches(p, where)) ?? null },
  Lead: { findByPk: (...a: unknown[]) => m.leadFindByPk(...a) },
  LeadTenantContext: { findOne: (...a: unknown[]) => m.contextFindOne(...a) },
  CommunicationLog: { findAll: (...a: unknown[]) => m.logFindAll(...a) },
  InteractionOutcome: { count: (...a: unknown[]) => m.outcomeCount(...a) },
}));
jest.mock('../../decision/lifecycleInputs', () => ({ loadLifecycleSourceCounts: (...a: unknown[]) => m.loadCounts(...a) }));
jest.mock('../../../ledgerService', () => ({ logEvent: (...a: unknown[]) => m.logEvent(...a) }));
jest.mock('../../../ticketService', () => ({ createTicket: (...a: unknown[]) => m.createTicket(...a) }));
jest.mock('../../../launchSafety', () => ({ isKillSwitchActive: (...a: unknown[]) => m.killSwitch(...a) }));
// The identity module is REAL (its list is asserted below); only the admin-user lookup is stubbed, and the
// generic identity seed beneath it is mocked away from the models, as ticketCreatorIdentitySeed.test.ts does.
jest.mock('../../../agentBlueprint/agentIdentitySeed', () => ({ seedAgentIdentity: jest.fn(), getAgentAdminUserId: jest.fn() }));
jest.mock('../../../agentBlueprint/ticketCreatorIdentitySeed', () => ({
  ...jest.requireActual('../../../agentBlueprint/ticketCreatorIdentitySeed'),
  getTicketCreatorAdminUserId: (...a: unknown[]) => m.creatorId(...a),
}));

import type { GrowthJourneyFlags } from '../../../../config/growthJourneyFlags';
import { TICKET_CREATOR_IDENTITIES } from '../../../agentBlueprint/ticketCreatorIdentitySeed';
import { PACKET_FIELDS } from '../evidencePacket';
import { findAddressLikeValue } from '../../noAddress';
import { CREATOR_AGENT_NAME } from '../assignment';
import {
  AWAITING_RANKED_PASS,
  assignHandoff,
  assignRankedQueue,
  createHandoff,
  handoffTriggersOf,
  materializeHandoffs,
  rankQueue,
} from '../handoffService';
import type { DecisionRowView, SubjectRefs } from '../types';

const CLOCK = new Date('2026-09-16T12:00:00Z');
const ON: GrowthJourneyFlags = { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyDecisions: true, journeyHandoffs: true, journeyExecution: false };
const OFF: GrowthJourneyFlags = { ...ON, journeyHandoffs: false };

/** The exit fixture: a DISCOVERY_READY Colaberry Enterprise subject (T313's `colaberry-enterprise/DISCOVERY_READY`). */
const decision = (over: Partial<DecisionRowView> = {}): DecisionRowView => ({
  id: 'd-1', tenant_id: 't-col', brand_id: 'b-ent', program_id: 'p-ent', subject_ref: 'lead:501', lead_id: 501, enrollment_id: null,
  classification_id: 'c-1', decision_date: '2026-09-16', selected_action: 'WAIT', selected_path: null, state_at_decision: 'DISCOVERY_READY',
  overlays_at_decision: [], scores: { summary: 40, available: true, computed_at: null, dimensions: [] }, score_gaps: ['urgency'],
  contact_evidence: { channels: { email: { eligible: true, reason: 'express_consent', evaluator: 'consent' } } },
  human_conversation: 'no', sales_capacity: 'unknown',
  deferred_actions: [{ would: 'create_handoff', reason: 'commercial_state:DISCOVERY_READY', payload: { brand: 'colaberry-enterprise', state: 'DISCOVERY_READY', path: 'ai_consulting', layer: 4, owner: 'sales' } }],
  requires_human_review: false, reason: 'no_candidate:commercial_state_needs_layer_4:DISCOVERY_READY', ruleset_version: 'business-1', created_at: CLOCK,
  ...over,
});
const refs = (over: Partial<SubjectRefs> = {}): SubjectRefs => ({
  tenant_id: 't-col', brand_id: 'b-ent', brand_slug: 'colaberry-enterprise', program: { id: 'p-ent', slug: 'business-growth', kind: 'business' },
  subject_ref: 'lead:501', lead_id: 501, enrollment_id: null, path: 'ai_consulting', ...over,
});
const capacityPolicy = (daily: number | null, queue = 'sales') => ({ brand_id: 'b-ent', policy_type: 'queue_capacity', owner_queue: queue, status: 'active', daily_capacity: daily, sla_hours: 24 });
const assigneePolicy = (queue = 'sales') => ({ brand_id: 'b-ent', policy_type: 'queue_assignee', owner_queue: queue, status: 'active', assigned_to_type: 'org_member', assigned_to_id: 'om-sales-1' });

/** Everything open: flag on, no kill switch, an assignee, capacity 5, a creator. Tests close one gate at a time. */
function arrangeOpen() {
  policies.push(capacityPolicy(5), assigneePolicy());
  m.killSwitch.mockResolvedValue(false);
  m.creatorId.mockResolvedValue('admin-gj');
}

beforeEach(() => {
  store.length = 0;
  seq = 0;
  policies.length = 0;
  for (const fn of Object.values(m)) fn.mockReset();
  m.leadFindByPk.mockResolvedValue({ id: 501, pipeline_stage: 'meeting_scheduled', industry: 'logistics', employee_count: 120, annual_revenue: null, company: 'Acme' });
  m.contextFindOne.mockResolvedValue({ organization_id: null, first_source_id: 'src-1', first_entry_point_id: null, first_campaign_id: null, first_touch_at: new Date('2026-08-01T00:00:00Z') });
  m.logFindAll.mockResolvedValue([{ channel: 'email', direction: 'outbound', created_at: new Date('2026-09-10T00:00:00Z') }]);
  m.outcomeCount.mockResolvedValue(0);
  m.loadCounts.mockResolvedValue({ inbound: { replied: 1, booked_meeting: 0, answered: 0, declined: 0 }, appointments: { scheduled: 1, completed: 0, no_show: 0, cancelled: 0 }, hasDeliveryEngagement: false });
  m.logEvent.mockResolvedValue(undefined);
  m.createTicket.mockImplementation(async (d: { entity_id: string }) => ({ id: `t-${d.entity_id}` }));
  m.killSwitch.mockResolvedValue(false);
  m.creatorId.mockResolvedValue(null);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const events = (name: string) => m.logEvent.mock.calls.filter((c) => c[0] === name);

describe('the exit fixture: a DISCOVERY_READY Business subject', () => {
  it('yields exactly one queued handoff in sales, evidence-complete, no @, with the ledger row scoped to tenant and brand', async () => {
    policies.push(capacityPolicy(null));
    const r = await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK });
    expect(r.status).toBe('materialized');
    expect(store).toHaveLength(1);
    const row = store[0];
    expect(row).toMatchObject({ status: 'queued', owner_queue: 'sales', source: 'decision_deferral', decision_id: 'd-1', subject_ref: 'lead:501', lead_id: 501, brand_id: 'b-ent', tenant_id: 't-col', program_id: 'p-ent', reason: 'commercial_state:DISCOVERY_READY', urgent: false });
    expect(row.expected_value).toBe(4 * 10 + 4 * 5 + 4);
    expect(row.priority).toBe('high');
    for (const f of PACKET_FIELDS) expect(row.evidence).toHaveProperty(f);
    expect(findAddressLikeValue(row.evidence, 'evidence')).toBeNull();
    expect(row.sla_due_at).toEqual(new Date('2026-09-17T12:00:00Z'));
    // No assignee policy and no number: queued, and the row says why.
    expect(row.assignment_blocked_reason).toBe('no_assignee_policy');
    const [created] = events('growth_journey.handoff.created');
    expect(created.slice(1, 4)).toEqual(['growth_journey', 'growth_journey_handoff', 'h-1']);
    expect(created[4]).toMatchObject({ handoff_id: 'h-1', decision_id: 'd-1', owner_queue: 'sales', source: 'decision_deferral', lead_id: 501 });
    expect(findAddressLikeValue(created[4], 'payload')).toBeNull();
    expect(created[5]).toEqual({ tenant_id: 't-col', brand_id: 'b-ent' });
  });

  it('run twice → one row, the second is replayed: true, one ledger row', async () => {
    const a = await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK });
    const b = await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK });
    expect(store).toHaveLength(1);
    expect(a.status === 'materialized' && a.handoffs[0].replayed).toBe(false);
    expect(b.status === 'materialized' && b.handoffs[0].replayed).toBe(true);
    expect(events('growth_journey.handoff.created')).toHaveLength(1);
  });

  it('T414: ranked_pass mode creates the row and offers it to NOTHING - no gate is asked, no ticket is written; the caller\'s pass assigns in rank order', async () => {
    arrangeOpen();
    const r = await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK, assignment: 'ranked_pass' });
    expect(r).toEqual({ status: 'materialized', handoffs: [{ trigger: expect.objectContaining({ owner_queue: 'sales' }), handoff_id: 'h-1', replayed: false, assignment: { status: 'queued', reason: AWAITING_RANKED_PASS } }] });
    expect(store[0]).toMatchObject({ status: 'queued', assignment_blocked_reason: null });
    expect(m.killSwitch).not.toHaveBeenCalled();
    expect(m.createTicket).not.toHaveBeenCalled();
    // The pass the nightly runs afterwards is what assigns it.
    const pass = await assignRankedQueue({ brandId: 'b-ent', ownerQueue: 'sales', flags: ON, asOf: CLOCK });
    expect(pass).toEqual([{ handoff_id: 'h-1', assignment: expect.objectContaining({ status: 'assigned' }) }]);
  });

  it('T414: in ranked_pass mode a replay onto a row already assigned answers not_queued, never queued', async () => {
    arrangeOpen();
    await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK });
    expect(store[0].status).toBe('assigned');
    const r = await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK, assignment: 'ranked_pass' });
    expect(r.status === 'materialized' && r.handoffs[0]).toMatchObject({ replayed: true, assignment: { status: 'not_queued', current: 'assigned' } });
  });

  it('a NEW decision for the same subject while the first handoff is still open lands on that row (one open per subject per brand)', async () => {
    await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK });
    const r = await materializeHandoffs({ decision: decision({ id: 'd-2' }), refs: refs(), flags: ON, asOf: CLOCK });
    expect(store).toHaveLength(1);
    expect(r.status === 'materialized' && r.handoffs[0]).toMatchObject({ handoff_id: 'h-1', replayed: true });
  });

  it('a stored column that somehow carries an address never reaches a row: the packet is refused before the create, nothing is written', async () => {
    m.leadFindByPk.mockResolvedValue({ id: 501, pipeline_stage: 'reply to buyer@example.com', industry: null, employee_count: null, annual_revenue: null, company: null });
    await expect(createHandoff({ refs: refs(), trigger: { source: 'manual', owner_queue: 'sales', reason: 'r' }, decision: decision(), asOf: CLOCK })).rejects.toMatchObject({ name: 'AddressInPayloadError', path: 'evidence.signals.pipeline_stage' });
    expect(store).toHaveLength(0);
    expect(m.logEvent).not.toHaveBeenCalled();
  });

  it('a decision-less trigger is keyed on its EVENT: a second NEEDS_ALI reply after the first handoff was dispositioned is a NEW row; the same message id replays', async () => {
    const reply = (event_ref: string) => ({ source: 'reply_route' as const, owner_queue: 'ali' as const, reason: 'reply_class:NEEDS_ALI', event_ref });
    const first = await createHandoff({ refs: refs(), trigger: reply('provider_message:m-1'), decision: null, asOf: CLOCK });
    expect(first.replayed).toBe(false);
    // The same message again while the row is open: a replay.
    expect((await createHandoff({ refs: refs(), trigger: reply('provider_message:m-1'), decision: null, asOf: CLOCK })).replayed).toBe(true);
    // A different message while the row is open: still one open per subject per brand.
    expect((await createHandoff({ refs: refs(), trigger: reply('provider_message:m-2'), decision: null, asOf: CLOCK })).replayed).toBe(true);
    expect(store).toHaveLength(1);
    // The human dispositions it; the next reply is a new handoff a human will see.
    await store[0].update({ status: 'dispositioned' });
    const later = await createHandoff({ refs: refs(), trigger: reply('provider_message:m-3'), decision: null, asOf: CLOCK });
    expect(later.replayed).toBe(false);
    expect(store).toHaveLength(2);
    expect(store[1]).toMatchObject({ status: 'queued', source: 'reply_route' });
    // A routing rule firing again on a later event behaves the same way.
    await store[1].update({ status: 'dispositioned' });
    const rule = (event_ref: string) => ({ source: 'manual' as const, owner_queue: 'human_review' as const, reason: 'rule', event_ref });
    expect((await createHandoff({ refs: refs(), trigger: rule('routing_rule:raw-1'), decision: null, asOf: CLOCK })).replayed).toBe(false);
    await store[2].update({ status: 'dispositioned' });
    expect((await createHandoff({ refs: refs(), trigger: rule('routing_rule:raw-2'), decision: null, asOf: CLOCK })).replayed).toBe(false);
    expect(store).toHaveLength(4);
  });

  it('with the flag off the writer returns disabled and creates nothing', async () => {
    const r = await materializeHandoffs({ decision: decision(), refs: refs(), flags: OFF, asOf: CLOCK });
    expect(r).toEqual({ status: 'disabled' });
    expect(store).toHaveLength(0);
    expect(m.logEvent).not.toHaveBeenCalled();
    expect(m.createTicket).not.toHaveBeenCalled();
  });

  it('a decision with no create_handoff deferral and no review flag yields none', async () => {
    const r = await materializeHandoffs({ decision: decision({ deferred_actions: [{ would: 'scheduling_offer', reason: 'x', payload: {} }] }), refs: refs(), flags: ON, asOf: CLOCK });
    expect(r).toEqual({ status: 'none', reason: 'no_handoff_trigger' });
    expect(store).toHaveLength(0);
  });

  it('requires_human_review alone yields a human_review handoff with its own source', async () => {
    const r = await materializeHandoffs({ decision: decision({ deferred_actions: [], requires_human_review: true }), refs: refs(), flags: ON, asOf: CLOCK });
    expect(r.status).toBe('materialized');
    expect(store[0]).toMatchObject({ owner_queue: 'human_review', source: 'human_review', reason: 'requires_human_review:no_candidate:commercial_state_needs_layer_4:DISCOVERY_READY' });
  });

  it('handoffTriggersOf reads only create_handoff deferrals with a real queue, in order, and adds review once', () => {
    const d = decision({
      deferred_actions: [
        { would: 'scheduling_offer', reason: 'x', payload: { owner: 'sales' } },
        { would: 'create_handoff', reason: 'a', payload: { owner: 'sales' } },
        { would: 'create_handoff', reason: 'b', payload: { owner: 'not_a_queue' } },
        { would: 'create_handoff', reason: 'human_review_overlay', payload: { owner: 'human_review' } },
      ],
      requires_human_review: true,
    });
    expect(handoffTriggersOf(d)).toEqual([
      { source: 'decision_deferral', owner_queue: 'sales', reason: 'a' },
      { source: 'decision_deferral', owner_queue: 'human_review', reason: 'human_review_overlay' },
    ]);
  });
});

describe('urgency and ranking', () => {
  it('an explicit request in 72 h (a booked meeting) makes the handoff urgent and critical, and the packet says why', async () => {
    m.outcomeCount.mockResolvedValue(1);
    await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK });
    expect(store[0]).toMatchObject({ urgent: true, priority: 'critical' });
    expect((store[0].evidence as { urgent: unknown }).urgent).toEqual({ value: true, reasons: ['request_outcome_in_72h:1'] });
    expect(m.outcomeCount.mock.calls[0][0]).toEqual({ where: { lead_id: 501, outcome: { [Op.in]: ['booked_meeting', 'answered'] }, created_at: { [Op.gt]: new Date('2026-09-13T12:00:00Z'), [Op.lte]: CLOCK } } });
  });

  it('a proposal_sent pipeline stage is an explicit request too', async () => {
    m.leadFindByPk.mockResolvedValue({ id: 501, pipeline_stage: 'proposal_sent', industry: null, employee_count: null, annual_revenue: null, company: null });
    await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK });
    expect(store[0].urgent).toBe(true);
  });

  it('rankQueue: an urgent lower-value subject outranks a higher-value non-urgent one; then value; then age', async () => {
    await createHandoff({ refs: refs({ subject_ref: 'lead:1', lead_id: 1 }), trigger: { source: 'manual', owner_queue: 'sales', reason: 'r' }, decision: decision({ id: 'd-a', state_at_decision: 'PROPOSAL_OR_PAYMENT_READY', scores: { summary: 90 } }), asOf: CLOCK });
    m.outcomeCount.mockResolvedValue(1);
    await createHandoff({ refs: refs({ subject_ref: 'lead:2', lead_id: 2, path: null }), trigger: { source: 'manual', owner_queue: 'sales', reason: 'r' }, decision: decision({ id: 'd-b', state_at_decision: 'NEW_BUSINESS_LEAD', scores: null }), asOf: CLOCK });
    m.outcomeCount.mockResolvedValue(0);
    await createHandoff({ refs: refs({ subject_ref: 'lead:3', lead_id: 3 }), trigger: { source: 'manual', owner_queue: 'sales', reason: 'r' }, decision: decision({ id: 'd-c', state_at_decision: 'PROPOSAL_OR_PAYMENT_READY', scores: { summary: 90 } }), asOf: CLOCK });
    const ranked = await rankQueue({ brandId: 'b-ent', ownerQueue: 'sales' });
    expect(ranked.map((r) => r.subject_ref)).toEqual(['lead:2', 'lead:1', 'lead:3']);
    expect(ranked[0].urgent).toBe(true);
    expect(Number(ranked[0].expected_value)).toBeLessThan(Number(ranked[1].expected_value));
  });
});

describe('assignment — every gate, in order, and the ticket', () => {
  it('with every gate open: a tickets row via createTicket with the exact argument object, the row assigned, the ledger row', async () => {
    arrangeOpen();
    const r = await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK });
    expect(r.status === 'materialized' && r.handoffs[0].assignment).toEqual({ status: 'assigned', ticket_id: 't-h-1', assigned_to_type: 'org_member', assigned_to_id: 'om-sales-1' });
    expect(m.createTicket).toHaveBeenCalledTimes(1);
    expect(m.createTicket.mock.calls[0][0]).toEqual({
      title: 'Growth Journey handoff · sales · colaberry-enterprise · lead:501',
      type: 'growth_journey_handoff',
      entity_type: 'growth_journey_handoff',
      entity_id: 'h-1',
      created_by_type: 'ai_staff',
      created_by_id: 'admin-gj',
      assigned_to_type: 'org_member',
      assigned_to_id: 'om-sales-1',
      priority: 'high',
      due_date: new Date('2026-09-17T12:00:00Z'),
      source: 'growth_journey',
      metadata: { handoff_id: 'h-1', decision_id: 'd-1', brand_id: 'b-ent' },
    });
    expect(store[0]).toMatchObject({ status: 'assigned', assigned_to_type: 'org_member', assigned_to_id: 'om-sales-1', ticket_id: 't-h-1', assignment_blocked_reason: null });
    const [assigned] = events('growth_journey.handoff.assigned');
    expect(assigned[4]).toMatchObject({ handoff_id: 'h-1', ticket_id: 't-h-1', owner_queue: 'sales', assigned_to_id: 'om-sales-1' });
    expect(assigned[5]).toEqual({ tenant_id: 't-col', brand_id: 'b-ent' });
    expect(m.creatorId).toHaveBeenCalledWith(CREATOR_AGENT_NAME);
  });

  it('never creates a ticket twice for one handoff: a second pass over an assigned row is not_queued', async () => {
    arrangeOpen();
    await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK });
    await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK });
    expect(await assignHandoff(store[0] as never, ON, CLOCK)).toEqual({ status: 'not_queued', current: 'assigned' });
    expect(m.createTicket).toHaveBeenCalledTimes(1);
  });

  it('two subjects, capacity 1 → the higher expected value is assigned, the other queued with capacity_full', async () => {
    arrangeOpen();
    policies[0] = capacityPolicy(1);
    // Created in LOW then HIGH order, so first-come would pick the wrong one.
    await createHandoff({ refs: refs({ subject_ref: 'lead:9', lead_id: 9, path: null }), trigger: { source: 'decision_deferral', owner_queue: 'sales', reason: 'r' }, decision: decision({ id: 'd-low', state_at_decision: 'QUALIFIED_OPPORTUNITY', scores: null }), asOf: CLOCK });
    await createHandoff({ refs: refs(), trigger: { source: 'decision_deferral', owner_queue: 'sales', reason: 'r' }, decision: decision(), asOf: CLOCK });
    const pass = await assignRankedQueue({ brandId: 'b-ent', ownerQueue: 'sales', flags: ON, asOf: CLOCK });
    expect(pass).toEqual([
      { handoff_id: 'h-2', assignment: expect.objectContaining({ status: 'assigned' }) },
      { handoff_id: 'h-1', assignment: { status: 'queued', reason: 'capacity_full' } },
    ]);
    expect(store.find((r) => r.id === 'h-2')?.status).toBe('assigned');
    expect(store.find((r) => r.id === 'h-1')).toMatchObject({ status: 'queued', assignment_blocked_reason: 'capacity_full' });
    expect(m.createTicket).toHaveBeenCalledTimes(1);
  });

  it('with the kill switch active nothing is assigned and the reason says so — the row still exists', async () => {
    arrangeOpen();
    m.killSwitch.mockResolvedValue(true);
    const r = await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK });
    expect(r.status === 'materialized' && r.handoffs[0].assignment).toEqual({ status: 'queued', reason: 'kill_switch_active' });
    expect(store[0]).toMatchObject({ status: 'queued', assignment_blocked_reason: 'kill_switch_active' });
    expect(m.createTicket).not.toHaveBeenCalled();
  });

  it('with no creator identity the handoff stays queued with creator_unregistered and createTicket is never called', async () => {
    arrangeOpen();
    m.creatorId.mockResolvedValue(null);
    const r = await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK });
    expect(r.status === 'materialized' && r.handoffs[0].assignment).toEqual({ status: 'queued', reason: 'creator_unregistered' });
    expect(m.createTicket).not.toHaveBeenCalled();
  });

  it('an unset capacity (the seeded state) blocks: unknown is not permission', async () => {
    arrangeOpen();
    policies[0] = capacityPolicy(null);
    const r = await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK });
    expect(r.status === 'materialized' && r.handoffs[0].assignment).toEqual({ status: 'queued', reason: 'capacity_unknown:capacity_not_set_by_operator' });
    expect(m.createTicket).not.toHaveBeenCalled();
  });

  it('a createTicket failure (the reports-to gate, say) leaves the row queued with the class, never throws', async () => {
    arrangeOpen();
    m.createTicket.mockRejectedValue(Object.assign(new Error('creator must report to a human'), { name: 'TicketCreatorNotReportableError' }));
    const r = await materializeHandoffs({ decision: decision(), refs: refs(), flags: ON, asOf: CLOCK });
    expect(r.status === 'materialized' && r.handoffs[0].assignment.status).toBe('queued');
    expect(String(store[0].assignment_blocked_reason)).toMatch(/^ticket_create_failed:/);
    expect(store[0].status).toBe('queued');
  });

  it('the flag alone never assigns: flag off on an already-queued row → flag_off', async () => {
    arrangeOpen();
    await createHandoff({ refs: refs(), trigger: { source: 'manual', owner_queue: 'sales', reason: 'r' }, decision: null, asOf: CLOCK });
    expect(await assignHandoff(store[0] as never, OFF, CLOCK)).toEqual({ status: 'queued', reason: 'flag_off' });
  });
});

describe('the creator identity is registered and reports through AI Leadership', () => {
  /** The registry list is not exported; its source is the record, read the way ticketCreatorAgentRegistry.test.ts reads capability traces. */
  const registrySrc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'agentRegistrySeed.ts'), 'utf8');
  const entryBlock = (): string => {
    const at = registrySrc.indexOf(`agent_name: '${CREATOR_AGENT_NAME}'`);
    expect(at).toBeGreaterThan(-1);
    return registrySrc.slice(at, registrySrc.indexOf('\n  },', at));
  };

  it('the registry entry has non-empty tools_granted naming real exports of handoffService.ts', () => {
    const block = entryBlock();
    expect(block).toContain("agent_type: 'ticket_creator_identity'");
    expect(block).toContain("module: 'growthJourney'");
    expect(block).toContain("source_file: 'backend/src/services/growthJourney/handoffs/handoffService.ts'");
    const tools = [...(block.match(/tools_granted: \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([A-Za-z]+)'/g)].map((x) => x[1]);
    expect(tools.length).toBeGreaterThan(0);
    const src = fs.readFileSync(path.join(__dirname, '..', 'handoffService.ts'), 'utf8');
    // Each tool is an export of the writer: declared there, or re-exported from the sibling that holds the gates.
    for (const t of tools) expect(src).toMatch(new RegExp(`export (async )?function ${t}\\(|export \\{ ${t} \\}`));
  });

  it('the identity entry is ai_staff at growth-journey@colaberry.com, reporting through workforce_intelligence_engine', () => {
    const id = TICKET_CREATOR_IDENTITIES.find((c) => c.agentName === CREATOR_AGENT_NAME);
    expect(id).toMatchObject({ role: 'ai_staff', email: 'growth-journey@colaberry.com', legacyCreatorIds: ['GrowthJourneyHandoffs'], reportsToAgentName: 'workforce_intelligence_engine' });
    // The registry row must exist for seedAgentIdentity to link the identity to an agent - and it must come
    // BEFORE the identity seed runs, which the registry seed guarantees by calling seedTicketCreatorIdentities itself.
    expect(entryBlock()).toContain(CREATOR_AGENT_NAME);
    expect(registrySrc).toMatch(/seedTicketCreatorIdentities\(\)/);
  });
});

describe('what the writer is, and is not', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'handoffService.ts'), 'utf8');

  it('never imports the decision model (it updates the mutable handoff row; the append-only guard would refuse the pair)', () => {
    expect(src).not.toMatch(/GrowthJourneyDecision\b/);
    expect(src).not.toMatch(/GrowthJourneyOutcome\b/);
  });

  it('creates the human task through ticketService.createTicket and nothing else — no notification, no second task system', () => {
    const gates = fs.readFileSync(path.join(__dirname, '..', 'assignment.ts'), 'utf8');
    expect(gates).toMatch(/createTicket\(/);
    for (const s of [src, gates]) {
      expect(s).not.toMatch(/sendNewLeadAlert|requestInstantCallback|basecamp|nodemailer|sendEmail|notify/i);
      expect(s).not.toMatch(/owner_type\b|owner_id\b/);
    }
  });
});
