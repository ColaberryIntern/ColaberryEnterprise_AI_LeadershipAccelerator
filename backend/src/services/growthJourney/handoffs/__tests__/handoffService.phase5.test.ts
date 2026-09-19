import { Op } from 'sequelize';

/**
 * T501 — the Phase 5 packet's 7A and 8A at the writer, against an in-memory
 * handoff store that enforces all three unique rules (the idempotency key; one
 * open row per subject per brand; one open row per PERSON per brand) and whose
 * static `update` honours the `updated_at` guard, so the concurrency cases are
 * real lost-update races rather than mocked answers. The fixture-world twins
 * are in `handoffRuns.phase4.test.ts` and `handoffRuns.phase4.scenarios.test.ts`.
 */

type Row = Record<string, unknown> & { id: string; status: string; created_at: Date; updated_at: Date; evidence: Record<string, unknown> };
const store: Row[] = [];
let seq = 0;
let tick = 0;
const OPEN = ['queued', 'assigned', 'accepted'];
/** Runs just before a static update is applied: a test plays "the other writer" here. */
const race: { beforeUpdate: ((row: Row) => void) | null } = { beforeUpdate: null };
const m = {
  leadFindByPk: jest.fn(),
  contextFindOne: jest.fn(),
  logFindAll: jest.fn(),
  outcomeCount: jest.fn(),
  loadCounts: jest.fn(),
  logEvent: jest.fn(),
  update: jest.fn(),
};

const uniqueError = () => Object.assign(new Error('duplicate key'), { name: 'SequelizeUniqueConstraintError' });
const now = () => new Date(Date.UTC(2026, 8, 16, 12) + (tick += 1));

function matches(row: Record<string, unknown>, where: Record<string | symbol, unknown>): boolean {
  for (const key of Reflect.ownKeys(where)) {
    const cond = where[key];
    if (key === Op.or) {
      if (!(cond as Record<string, unknown>[]).some((alt) => matches(row, alt))) return false;
      continue;
    }
    const v = row[key as string];
    if (cond instanceof Date) {
      if (!(v instanceof Date) || v.getTime() !== cond.getTime()) return false;
    } else if (cond && typeof cond === 'object') {
      if (Op.in in (cond as object) && !((cond as Record<symbol, unknown[]>)[Op.in]).includes(v)) return false;
    } else if (v !== cond) return false;
  }
  return true;
}

jest.mock('../../../../models', () => ({
  GrowthJourneyHandoff: {
    create: async (attrs: Record<string, unknown>) => {
      const openRows = store.filter((r) => r.brand_id === attrs.brand_id && OPEN.includes(r.status));
      if (store.some((r) => r.idempotency_key === attrs.idempotency_key)) throw uniqueError();
      if (openRows.some((r) => r.subject_ref === attrs.subject_ref)) throw uniqueError();
      if (attrs.lead_id !== null && openRows.some((r) => r.lead_id === attrs.lead_id)) throw uniqueError();
      const at = now();
      const row = { ...attrs, id: `h-${++seq}`, status: String(attrs.status ?? 'queued'), created_at: at, updated_at: at } as Row;
      store.push(row);
      return row;
    },
    findOne: async ({ where }: { where: Record<string | symbol, unknown> }) =>
      store.filter((r) => matches(r, where)).sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0] ?? null,
    update: async (patch: Record<string, unknown>, { where }: { where: Record<string | symbol, unknown> }) => {
      m.update(patch, where);
      const hit = store.find((r) => r.id === where.id);
      if (hit && race.beforeUpdate) race.beforeUpdate(hit);
      if (!hit || !matches(hit, where)) return [0];
      Object.assign(hit, patch, { updated_at: now() });
      return [1];
    },
  },
  GrowthJourneyPolicy: { findOne: async () => null },
  Lead: { findByPk: (...a: unknown[]) => m.leadFindByPk(...a) },
  LeadTenantContext: { findOne: (...a: unknown[]) => m.contextFindOne(...a) },
  CommunicationLog: { findAll: (...a: unknown[]) => m.logFindAll(...a) },
  InteractionOutcome: { count: (...a: unknown[]) => m.outcomeCount(...a) },
}));
jest.mock('../../decision/lifecycleInputs', () => ({ loadLifecycleSourceCounts: (...a: unknown[]) => m.loadCounts(...a) }));
jest.mock('../../../ledgerService', () => ({ logEvent: (...a: unknown[]) => m.logEvent(...a) }));
jest.mock('../../../ticketService', () => ({ createTicket: jest.fn() }));
jest.mock('../../../launchSafety', () => ({ isKillSwitchActive: jest.fn().mockResolvedValue(false) }));
jest.mock('../../../agentBlueprint/agentIdentitySeed', () => ({ seedAgentIdentity: jest.fn(), getAgentAdminUserId: jest.fn() }));
jest.mock('../../../agentBlueprint/ticketCreatorIdentitySeed', () => ({
  ...jest.requireActual('../../../agentBlueprint/ticketCreatorIdentitySeed'),
  getTicketCreatorAdminUserId: jest.fn().mockResolvedValue(null),
}));

import { findAddressLikeValue } from '../../noAddress';
import { escalationTriggersOf, withEscalationTrigger, type EscalationTrigger } from '../escalationTriggers';
import { createHandoff, TRIGGER_APPEND_ATTEMPTS } from '../handoffService';
import type { DecisionRowView, HandoffTrigger, SubjectRefs } from '../types';

const AS_OF = new Date('2026-09-16T12:00:00Z');
const decision = (over: Partial<DecisionRowView> = {}): DecisionRowView => ({
  id: 'd-1', tenant_id: 't-col', brand_id: 'b-trn', program_id: 'p-trn', subject_ref: 'enrollment:e-1', lead_id: 501, enrollment_id: 'e-1',
  classification_id: 'c-1', decision_date: '2026-09-16', selected_action: 'WAIT', selected_path: null, state_at_decision: 'ENROLLMENT_READY',
  overlays_at_decision: [], scores: null, score_gaps: [], contact_evidence: null, human_conversation: 'no', sales_capacity: 'unknown',
  deferred_actions: [], requires_human_review: false, reason: 'enrollment_ready_in_conversation', ruleset_version: 'learner-1', created_at: AS_OF,
  ...over,
});
const refs = (over: Partial<SubjectRefs> = {}): SubjectRefs => ({
  tenant_id: 't-col', brand_id: 'b-trn', brand_slug: 'colaberry-training', program: { id: 'p-trn', slug: 'colaberry-training', kind: 'learner' },
  subject_ref: 'enrollment:e-1', lead_id: 501, enrollment_id: 'e-1', path: null, ...over,
});
const LEARNER: HandoffTrigger = { source: 'decision_deferral', owner_queue: 'admissions', reason: 'enrollment_ready_in_conversation' };
const REPLY: HandoffTrigger = { source: 'reply_route', owner_queue: 'admissions', reason: 'reply_class:READY_TO_ENROLL', event_ref: 'provider_message:pm-1' };
const REVIEW: HandoffTrigger = { source: 'manual', owner_queue: 'human_review', reason: 'routing_rule:rp-1', event_ref: 'rule:rp-1' };
const replyRefs = () => refs({ subject_ref: 'lead:501', enrollment_id: null });

const events = (name: string) => m.logEvent.mock.calls.filter((c) => c[0] === name);
const reasonsOf = (row: Row) => escalationTriggersOf(row.evidence).map((t) => t.reason);

beforeEach(() => {
  store.length = 0;
  seq = 0;
  race.beforeUpdate = null;
  for (const fn of Object.values(m)) fn.mockReset();
  m.leadFindByPk.mockResolvedValue({ id: 501, pipeline_stage: null, industry: null, employee_count: null, annual_revenue: null, company: null });
  m.contextFindOne.mockResolvedValue(null);
  m.logFindAll.mockResolvedValue([]);
  m.outcomeCount.mockResolvedValue(0);
  m.loadCounts.mockResolvedValue(null);
  m.logEvent.mockResolvedValue(undefined);
});

describe('7A: one open handoff per PERSON per brand, whatever ref the trigger used', () => {
  it('the learner opens under enrollment:<id>; a reply for the same lead under lead:<id> lands on that row', async () => {
    const first = await createHandoff({ refs: refs(), trigger: LEARNER, decision: decision(), asOf: AS_OF });
    const reply = await createHandoff({ refs: replyRefs(), trigger: REPLY, decision: null, asOf: AS_OF });
    expect(first.replayed).toBe(false);
    expect(reply).toMatchObject({ replayed: true, row: { id: first.row.id, subject_ref: 'enrollment:e-1', owner_queue: 'admissions' } });
    expect(store).toHaveLength(1);
  });

  it('a different lead in the same brand, and the same lead in another brand, each get their own row (non-vacuity)', async () => {
    await createHandoff({ refs: refs(), trigger: LEARNER, decision: decision(), asOf: AS_OF });
    expect((await createHandoff({ refs: refs({ subject_ref: 'lead:777', lead_id: 777, enrollment_id: null }), trigger: REPLY, decision: null, asOf: AS_OF })).replayed).toBe(false);
    expect((await createHandoff({ refs: replyRefs(), trigger: REPLY, decision: null, asOf: AS_OF })).replayed).toBe(true);
    expect((await createHandoff({ refs: { ...replyRefs(), brand_id: 'b-cpn', brand_slug: 'cpn' }, trigger: REPLY, decision: null, asOf: AS_OF })).replayed).toBe(false);
    expect(store).toHaveLength(3);
  });

  it('once the person\'s row is closed, the next trigger opens a new one', async () => {
    const first = await createHandoff({ refs: refs(), trigger: LEARNER, decision: decision(), asOf: AS_OF });
    (store.find((r) => r.id === first.row.id) as Row).status = 'dispositioned';
    const next = await createHandoff({ refs: replyRefs(), trigger: REPLY, decision: null, asOf: AS_OF });
    expect(next.replayed).toBe(false);
    expect(next.row.id).not.toBe(first.row.id);
  });
});

describe('8A: every trigger that lands on the open row is recorded on it', () => {
  it('a second trigger is appended, with one ledger row carrying ids and reasons only', async () => {
    const first = await createHandoff({ refs: refs(), trigger: LEARNER, decision: decision(), asOf: AS_OF });
    const again = await createHandoff({ refs: replyRefs(), trigger: REPLY, decision: null, asOf: AS_OF });
    expect(reasonsOf(again.row as unknown as Row)).toEqual(['enrollment_ready_in_conversation', 'reply_class:READY_TO_ENROLL']);
    expect(reasonsOf(store[0])).toEqual(['enrollment_ready_in_conversation', 'reply_class:READY_TO_ENROLL']);
    const [appended] = events('growth_journey.handoff.trigger_appended');
    expect(events('growth_journey.handoff.trigger_appended')).toHaveLength(1);
    expect(appended[4]).toEqual({ handoff_id: first.row.id, source: 'reply_route', owner_queue: 'admissions', reason: 'reply_class:READY_TO_ENROLL', decision_id: null, triggers: 2 });
    expect(appended[5]).toEqual({ tenant_id: 't-col', brand_id: 'b-trn' });
    expect(findAddressLikeValue(store[0].evidence, 'evidence')).toBeNull();
  });

  it('the same trigger twice is one entry, no second update and no second ledger row', async () => {
    await createHandoff({ refs: refs(), trigger: LEARNER, decision: decision(), asOf: AS_OF });
    await createHandoff({ refs: replyRefs(), trigger: REPLY, decision: null, asOf: AS_OF });
    await createHandoff({ refs: replyRefs(), trigger: { ...REPLY, event_ref: 'provider_message:pm-2' }, decision: null, asOf: AS_OF });
    expect(reasonsOf(store[0])).toHaveLength(2);
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(events('growth_journey.handoff.trigger_appended')).toHaveLength(1);
  });

  it('dedupe is on (source, queue, reason): the same reason asked of another queue is a second entry', () => {
    const a: EscalationTrigger = { source: 'manual', queue: 'sales', reason: 'x', decision_id: null, decision_reason: null, at: '' };
    const packet = { escalation_reason: [a] };
    expect(withEscalationTrigger(packet, { ...a, at: 'later' }).appended).toBe(false);
    expect(withEscalationTrigger(packet, { ...a, queue: 'human_review' })).toMatchObject({ appended: true, count: 2 });
    expect(withEscalationTrigger(packet, { ...a, source: 'reply_route' })).toMatchObject({ appended: true, count: 2 });
  });

  it('a row found only through its idempotency key but already CLOSED takes no entry', async () => {
    const first = await createHandoff({ refs: refs(), trigger: LEARNER, decision: decision(), asOf: AS_OF });
    (store[0] as Row).status = 'dispositioned';
    const replay = await createHandoff({ refs: refs(), trigger: LEARNER, decision: decision(), asOf: AS_OF });
    expect(replay).toMatchObject({ replayed: true, row: { id: first.row.id } });
    expect(m.update).not.toHaveBeenCalled();
    expect(reasonsOf(store[0])).toHaveLength(1);
  });

  it('a Phase 4 packet (ONE object, not a list) keeps its first trigger as the list\'s first entry', () => {
    const legacy = { owner_queue: 'sales', built_at: '2026-09-15T00:00:00.000Z', escalation_reason: { source: 'decision_deferral', reason: 'commercial_state:DISCOVERY_READY', decision_id: 'd-0', decision_reason: 'r' } };
    const r = withEscalationTrigger(legacy, { source: 'manual', queue: 'human_review', reason: 'routing_rule:rp-1', decision_id: null, decision_reason: null, at: '2026-09-16T12:00:00.000Z' });
    expect(r.count).toBe(2);
    expect(r.packet.escalation_reason).toEqual([
      { source: 'decision_deferral', queue: 'sales', reason: 'commercial_state:DISCOVERY_READY', decision_id: 'd-0', decision_reason: 'r', at: '2026-09-15T00:00:00.000Z' },
      { source: 'manual', queue: 'human_review', reason: 'routing_rule:rp-1', decision_id: null, decision_reason: null, at: '2026-09-16T12:00:00.000Z' },
    ]);
  });
});

describe('8A under concurrency: the append never overwrites another writer', () => {
  it('another writer between our read and our update: the guard misses, the row is re-read, and BOTH triggers survive', async () => {
    await createHandoff({ refs: refs(), trigger: LEARNER, decision: decision(), asOf: AS_OF });
    let raced = false;
    race.beforeUpdate = (row) => {
      if (raced) return;
      raced = true;
      // The other writer: a routing rule's trigger lands and bumps updated_at first.
      row.evidence = withEscalationTrigger(row.evidence, { source: 'manual', queue: 'human_review', reason: 'routing_rule:rp-1', decision_id: null, decision_reason: null, at: '' }).packet;
      row.updated_at = now();
    };
    await createHandoff({ refs: replyRefs(), trigger: REPLY, decision: null, asOf: AS_OF });
    expect(m.update).toHaveBeenCalledTimes(2);
    expect(reasonsOf(store[0])).toEqual(['enrollment_ready_in_conversation', 'routing_rule:rp-1', 'reply_class:READY_TO_ENROLL']);
    expect(events('growth_journey.handoff.trigger_appended')).toHaveLength(1);
    expect(events('growth_journey.handoff.trigger_append_conflict')).toHaveLength(0);
  });

  it('a row that moves on every attempt: bounded at TRIGGER_APPEND_ATTEMPTS, the packet untouched by us, the trigger kept in the ledger as a conflict', async () => {
    await createHandoff({ refs: refs(), trigger: LEARNER, decision: decision(), asOf: AS_OF });
    race.beforeUpdate = (row) => {
      row.updated_at = now();
    };
    const r = await createHandoff({ refs: replyRefs(), trigger: REPLY, decision: null, asOf: AS_OF });
    expect(r.replayed).toBe(true);
    expect(TRIGGER_APPEND_ATTEMPTS).toBe(3);
    expect(m.update).toHaveBeenCalledTimes(TRIGGER_APPEND_ATTEMPTS);
    expect(reasonsOf(store[0])).toEqual(['enrollment_ready_in_conversation']);
    expect(events('growth_journey.handoff.trigger_appended')).toHaveLength(0);
    const [conflict] = events('growth_journey.handoff.trigger_append_conflict');
    expect(conflict[4]).toEqual({ handoff_id: store[0].id, source: 'reply_route', owner_queue: 'admissions', reason: 'reply_class:READY_TO_ENROLL', decision_id: null, attempts: 3 });
  });

  it('a row closed by the other writer takes no entry and no conflict row', async () => {
    await createHandoff({ refs: refs(), trigger: LEARNER, decision: decision(), asOf: AS_OF });
    race.beforeUpdate = (row) => {
      row.status = 'dispositioned';
      row.updated_at = now();
    };
    await createHandoff({ refs: replyRefs(), trigger: REPLY, decision: null, asOf: AS_OF });
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(reasonsOf(store[0])).toEqual(['enrollment_ready_in_conversation']);
    expect(events('growth_journey.handoff.trigger_append_conflict')).toHaveLength(0);
  });
});

describe('the merged packet is re-checked for an address before it is written', () => {
  it('a stored packet that somehow carries an address is refused on the append, and nothing is written', async () => {
    await createHandoff({ refs: refs(), trigger: LEARNER, decision: decision(), asOf: AS_OF });
    store[0].evidence = { ...store[0].evidence, likely_need: 'call jane@example.com' };
    await expect(createHandoff({ refs: replyRefs(), trigger: REPLY, decision: null, asOf: AS_OF })).rejects.toMatchObject({ name: 'AddressInPayloadError' });
    expect(m.update).not.toHaveBeenCalled();
    expect(events('growth_journey.handoff.trigger_appended')).toHaveLength(0);
  });
});
