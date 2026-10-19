import { Op } from 'sequelize';

/**
 * C7 idempotency, proven against the REAL Growth Journey writer (createHandoff + assignHandoff) over an in-memory handoff store
 * that enforces all three unique indexes: the idempotency key, one open row per (subject_ref, brand_id), and one open row per
 * (lead_id, brand_id). Same harness shape as growthJourney/handoffs/__tests__/handoffService.test.ts, so replays are real.
 */
type Row = Record<string, unknown> & { id: string; status: string; created_at: Date; update: (p: Record<string, unknown>) => Promise<Row> };
const store: Row[] = [];
let seq = 0;
const OPEN = ['queued', 'assigned', 'accepted'];
const uniqueError = () => Object.assign(new Error('duplicate key'), { name: 'SequelizeUniqueConstraintError' });

function matches(row: Record<string, unknown>, where: Record<string | symbol, unknown>): boolean {
  for (const key of Reflect.ownKeys(where)) {
    const cond = (where as Record<string | symbol, unknown>)[key];
    if (key === Op.or) { if (!(cond as Record<string, unknown>[]).some((alt) => matches(row, alt))) return false; continue; }
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

jest.mock('../../../models', () => ({
  GrowthJourneyHandoff: {
    create: async (attrs: Record<string, unknown>) => {
      if (store.some((r) => r.idempotency_key === attrs.idempotency_key)) throw uniqueError();
      if (store.some((r) => r.subject_ref === attrs.subject_ref && r.brand_id === attrs.brand_id && OPEN.includes(r.status))) throw uniqueError();
      if (attrs.lead_id != null && store.some((r) => r.lead_id === attrs.lead_id && r.brand_id === attrs.brand_id && OPEN.includes(r.status))) throw uniqueError();
      const row: Row = { ...attrs, id: `h-${++seq}`, status: String(attrs.status ?? 'queued'), created_at: new Date(Date.UTC(2026, 9, 19) + seq), assignment_blocked_reason: null,
        assigned_to_type: null, assigned_to_id: null, ticket_id: null, update: async (p) => Object.assign(row, p) };
      store.push(row);
      return row;
    },
    findOne: async ({ where }: { where: Record<string, unknown> }) => store.filter((r) => matches(r, where)).sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0] ?? null,
    findAll: async ({ where }: { where: Record<string, unknown> }) => store.filter((r) => matches(r, where)),
    count: async ({ where }: { where: Record<string, unknown> }) => store.filter((r) => matches(r, where)).length,
    // The writer's guarded trigger append on an open row: update(values, { where: { id, updated_at } }) -> [affected].
    update: async (values: Record<string, unknown>, { where }: { where: Record<string, unknown> }) => {
      const hit = store.filter((r) => matches(r, where));
      for (const r of hit) Object.assign(r, values, { updated_at: new Date(Date.UTC(2026, 9, 19) + (++seq)) });
      return [hit.length];
    },
  },
  GrowthJourneyPolicy: { findOne: async () => null },
  Lead: { findByPk: async () => null },
  LeadTenantContext: { findOne: async () => null },
  CommunicationLog: { findAll: async () => [] },
  InteractionOutcome: { count: async () => 0 },
}));
jest.mock('../../growthJourney/decision/lifecycleInputs', () => ({
  loadLifecycleSourceCounts: async () => ({ inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 0 }, appointments: { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 }, hasDeliveryEngagement: false }),
}));
jest.mock('../../ledgerService', () => ({ logEvent: async () => undefined }));
jest.mock('../../ticketService', () => ({ createTicket: async () => { throw new Error('no ticket expected without a policy'); } }));
jest.mock('../../launchSafety', () => ({ isKillSwitchActive: async () => false }));
jest.mock('../../agentBlueprint/agentIdentitySeed', () => ({ seedAgentIdentity: jest.fn(), getAgentAdminUserId: jest.fn() }));
jest.mock('../../agentBlueprint/ticketCreatorIdentitySeed', () => ({
  ...jest.requireActual('../../agentBlueprint/ticketCreatorIdentitySeed'),
  getTicketCreatorAdminUserId: async () => null,
}));

import type { GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { createHandoff, assignHandoff } from '../../growthJourney/handoffs/handoffService';
import { requestTourHandoff, TourHandoffDeps } from '../campusTourHandoff';

const ON: GrowthJourneyFlags = { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyDecisions: false, journeyHandoffs: true, journeyExecution: false };
const DAY1 = new Date('2026-10-19T15:00:00Z');
const DAY1_LATER = new Date('2026-10-19T22:00:00Z');
const DAY2 = new Date('2026-10-20T15:00:00Z');
const DAY3 = new Date('2026-10-21T15:00:00Z');

let leadId: number | null = 77;
const deps: TourHandoffDeps = {
  EXPLORER_PROGRAM: { tenantSlug: 'colaberry', brandSlug: 'colaberry-training', programSlug: 'explorer' } as unknown as TourHandoffDeps['EXPLORER_PROGRAM'],
  resolveBrandBySlug: async () => ({ id: 'b-train', tenant_id: 't-col', slug: 'colaberry-training' }),
  findProgram: async () => ({ id: 'p-exp', slug: 'explorer', kind: 'learner' }),
  resolveLeadId: async () => leadId,
  createHandoff,
  assignHandoff,
};
const optIn = (asOf: Date) => requestTourHandoff('enr-7', ON, asOf, deps);

beforeEach(() => { store.length = 0; seq = 0; leadId = 77; jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());

describe('completing twice creates one handoff (real writer)', () => {
  it('twice the same day: one row, the second click replays it', async () => {
    expect(await optIn(DAY1)).toEqual({ handoff: true, reason: 'created' });
    expect(await optIn(DAY1_LATER)).toEqual({ handoff: true, reason: 'already_open' });
    expect(store).toHaveLength(1);
    expect(store[0]).toMatchObject({ subject_ref: 'enrollment:enr-7', owner_queue: 'admissions', status: 'queued', lead_id: 77 });
  });

  it('the next day while the first is still open: still one row', async () => {
    await optIn(DAY1);
    expect(await optIn(DAY2)).toEqual({ handoff: true, reason: 'already_open' });
    expect(store).toHaveLength(1);
  });

  it('closed the same day: the replay is honest (closed, false), and no new row', async () => {
    await optIn(DAY1);
    store[0].status = 'dispositioned';
    expect(await optIn(DAY1_LATER)).toEqual({ handoff: false, reason: 'closed' });
    expect(store).toHaveLength(1);
  });

  it('after admissions closes it, a later day can opt in again: a second row', async () => {
    await optIn(DAY1);
    store[0].status = 'dispositioned';
    expect(await optIn(DAY3)).toEqual({ handoff: true, reason: 'created' });
    expect(store).toHaveLength(2);
  });

  it('an open row already exists for the Explorer\'s LEAD (another queue, lead:<id> subject): replayed onto it, no new row', async () => {
    const pre = { id: 'h-pre', subject_ref: 'lead:77', lead_id: 77, brand_id: 'b-train', owner_queue: 'sales', status: 'assigned', idempotency_key: 'pre',
      evidence: {}, created_at: new Date('2026-10-01T00:00:00Z'), updated_at: new Date('2026-10-01T00:00:00Z') } as unknown as Row;
    pre.update = async (p) => Object.assign(pre, p);
    store.push(pre);
    expect(await optIn(DAY1)).toEqual({ handoff: true, reason: 'already_open' });
    expect(store).toHaveLength(1);
    // The person on that row sees that the Explorer asked admissions: the writer appended the opt-in as a trigger.
    expect(JSON.stringify(store[0].evidence)).toContain('campus_tour_opt_in');
  });

  it('an open row in ANOTHER queue for the same enrollment subject: replayed onto it, no new row', async () => {
    const pre = { id: 'h-sub', subject_ref: 'enrollment:enr-7', lead_id: null, brand_id: 'b-train', owner_queue: 'support', status: 'queued', idempotency_key: 'pre-sub',
      evidence: {}, created_at: new Date('2026-10-02T00:00:00Z'), updated_at: new Date('2026-10-02T00:00:00Z') } as unknown as Row;
    pre.update = async (p) => Object.assign(pre, p);
    store.push(pre);
    expect(await optIn(DAY1)).toEqual({ handoff: true, reason: 'already_open' });
    expect(store).toHaveLength(1);
    expect(JSON.stringify(store[0].evidence)).toContain('campus_tour_opt_in');
  });

  it('no matching lead: written with lead_id null, still one row on a repeat', async () => {
    leadId = null;
    expect(await optIn(DAY1)).toEqual({ handoff: true, reason: 'created' });
    expect(await optIn(DAY2)).toEqual({ handoff: true, reason: 'already_open' });
    expect(store).toHaveLength(1);
    expect(store[0].lead_id).toBeNull();
  });
});
