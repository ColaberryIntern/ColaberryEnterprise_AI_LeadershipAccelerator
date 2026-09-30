import type { ExplorerGrowthFlags } from '../../../../config/explorerGrowthFlags';
import type { GrowthJourneyFlags } from '../../../../config/growthJourneyFlags';
import { m as m3 } from './phase3Harness';
import { brandRow, programRow, type GjBrandSlug } from './phase3Fixtures';
import type { HandoffFixture } from './phase4Fixtures';
import { arrangeWorld, flags4, m4, modelsMock as models4, T, world, type WorldOptions } from './phase4Harness';
import { AS_OF_4, clock, Table, uniqueViolation, type Query, type Row } from './phase4Tables';
import { phase5ModelsMock, resetPhase5Tables, T5 } from './phase5Tables';

/**
 * T519 — the Phase 5 world: the Phase 4 harness (the real decision pipeline
 * over fixtures) extended with T503's tables and every row the execution chain
 * reads or writes after a decision. Built so a test drives the WHOLE chain
 * through the real modules:
 *
 *   source -> classification -> a live decision      (Phase 3/4 harness + T507's stamp)
 *   plan -> receipt (+ a REVIEW proposal)            (T508, T509)
 *   approve                                          (T509's applyExecutionApproval)
 *   execute -> the adapter -> a scheduled_emails row (T510, T513; the sequence service is the spy)
 *   the real evaluateSend, hold included             (T511, communicationSafetyService)
 *   -> the MOCKED transport                          (m5.sendMail; nodemailer.createTransport stays at 0)
 *   -> reconcile -> completed + contact_sent         (T512)
 *
 * ─── WHAT IS REAL ───────────────────────────────────────────────────────────
 *
 * Every journey module, the ladder, the guards, `evaluateSend` and its lead,
 * campaign and rate-limit reads. The tables enforce the shipped unique
 * indexes (the Phase 4 ones, T503's three, and - enforced here by hand - the
 * decisions' idempotency index, whose DDL predates the parser).
 *
 * ─── WHAT ANSWERS AS A JEST FUNCTION ────────────────────────────────────────
 *
 * `m5`: the transaction (a pass-through with a lock token), the sequence and
 * campaign enrolment services (each writes the `scheduled_emails` row the real
 * one would), the executor's registry row, the sequence row, the strict kill
 * switch, the settings reads `evaluateSend` makes, the consent and brand-preference
 * gates (their own systems, their own suites), the admin scope bridge and the
 * access audit for approvals, and the three transports - mail, SMS, voice - as
 * spies that the standing rule keeps at 0 for SMS and voice, always.
 *
 * This module imports NO production module (the models factory requires it);
 * the drivers that do live in `phase5Drivers.ts`.
 */

export const HOUR = 3_600_000;
export const MINUTE = 60_000;

/* ── the tables the chain reads and writes after the decision ─────────────── */

export const T5x = {
  decisions: new Table('growth_journey_decisions', 'd'),
  scheduled: new Table('scheduled_emails', 'se'),
  proposals: new Table('proposed_agent_actions', 'pa'),
  ledger: new Table('event_ledger', 'ev'),
  domains: new Table('brand_domains', 'bd'),
  enrollments: new Table('growth_journey_enrollments', 'gje'),
  unsubscribes: new Table('unsubscribe_events', 'ue'),
};

/* ── the boundaries, as jest functions ──────────────────────────────────────── */

export const m5 = {
  transaction: jest.fn(),
  enrol: jest.fn(),
  enrolCampaign: jest.fn(),
  agentFindOne: jest.fn(),
  sequenceFindByPk: jest.fn(),
  killSwitchStrict: jest.fn(),
  sendMail: jest.fn(),
  createTransport: jest.fn(),
  sms: jest.fn(),
  voice: jest.fn(),
  getSetting: jest.fn(),
  testOverrides: jest.fn(),
  consent: jest.fn(),
  brandPref: jest.fn(),
  contextFromAdminRequest: jest.fn(),
  recordAccessDecision: jest.fn(),
  aliSends: jest.fn(),
  lastAliOutreach: jest.fn(),
  explorerProfileFindOne: jest.fn(),
  aiMessage: jest.fn(),
};

/* ── campaigns: one registry, read by key (the loader, the validator) and by id (the sender, the reply) ── */

export interface CampaignRow {
  id: string;
  tenant_id: string;
  brand_id: string;
  status: string;
  approval_status: string;
  sequence_id: string;
  settings: Record<string, unknown>;
}
export const campaigns = new Map<string, CampaignRow>();
const asModel = (r: CampaignRow) => ({ ...r, get: (k: string) => (r as unknown as Record<string, unknown>)[k] });
export function registerCampaign(row: CampaignRow): CampaignRow {
  campaigns.set(row.id, row);
  return row;
}
export const campaignByKey = (key: string): CampaignRow | undefined => [...campaigns.values()].find((c) => c.settings.campaign_key === key);

/** An ACTIVE, approved journey campaign of a brand - the state after Ali's activation, which is what `limited` and the send step require. */
export function activeCampaign(brand: GjBrandSlug, key: string, id = `c-${key}`): CampaignRow {
  return registerCampaign({ id, tenant_id: brandRow(brand).tenant_id, brand_id: brandRow(brand).id, status: 'active', approval_status: 'approved', sequence_id: `s-${key}`, settings: { campaign_key: key } });
}

/* ── the `../../../models` index, as every Phase 5 module sees it ──────────── */

const communication = {
  // T516's Ali branch asks for the last outreach marker by a nested JSON where the table cannot evaluate; it is a spy.
  findOne: (q: Query & { where: Record<string, unknown> }) => ('metadata' in q.where ? m5.lastAliOutreach(q) : T.communication.findOne(q)),
  findAll: (q: Query) => T.communication.findAll(q),
  count: (q: Query) => T.communication.count(q),
  create: (attrs: Record<string, unknown>) => T.communication.create(attrs),
};

export const modelsMock = {
  ...models4,
  ...phase5ModelsMock,
  // The decisions table: the Phase 3 spies (arrangeWorld resets and re-points them) write and replay through it; the
  // executor's window read and the adapter's re-read are the table's own.
  GrowthJourneyDecision: {
    create: (...a: unknown[]) => m3.decisionCreate(...a),
    findOne: (...a: unknown[]) => m3.decisionFindOne(...a),
    findAll: (q: Query) => T5x.decisions.findAll(q),
  },
  JourneyProgram: {
    ...models4.JourneyProgram,
    // The executor plans for ACTIVE programmes: the world's programmes, activated.
    findAll: async (q?: { where?: { status?: string } }) => {
      const rows = [...new Set(world.fixtures.map((f) => f.brand))].map((slug) => ({ ...programRow(slug), status: 'active' })).sort((a, b) => a.slug.localeCompare(b.slug));
      const wanted = q?.where?.status;
      return rows.filter((r) => !wanted || r.status === wanted).map((r) => ({ ...r, get: (k: string) => (r as unknown as Record<string, unknown>)[k] }));
    },
  },
  ScheduledEmail: T5x.scheduled,
  ProposedAgentAction: T5x.proposals,
  EventLedger: T5x.ledger,
  BrandDomain: T5x.domains,
  GrowthJourneyEnrollment: T5x.enrollments,
  UnsubscribeEvent: T5x.unsubscribes,
  CommunicationLog: communication,
  AiAgent: { findOne: (...a: unknown[]) => m5.agentFindOne(...a) },
  Campaign: {
    findOne: (...a: unknown[]) => m3.campaignFindOne(...a),
    findByPk: async (id: string) => { const c = campaigns.get(id); return c ? asModel(c) : null; },
  },
  FollowUpSequence: { findByPk: (...a: unknown[]) => m5.sequenceFindByPk(...a) },
  Lead: { findByPk: (...a: unknown[]) => m3.leadFindByPk(...a) },
  CampaignLead: { count: (...a: unknown[]) => m5.aliSends(...a) },
  ExplorerJourneyProfile: { ...models4.ExplorerJourneyProfile, findOne: (...a: unknown[]) => m5.explorerProfileFindOne(...a) },
  __tables: T5x,
};

/* ── flags ──────────────────────────────────────────────────────────────────── */

export const flags5 = (over: Partial<GrowthJourneyFlags> = {}): GrowthJourneyFlags => flags4({ journeyExecution: true, ...over });
export const explorerFlags5 = (over: Partial<ExplorerGrowthFlags> = {}): ExplorerGrowthFlags => ({
  growthOsEnabled: true, signalIngestEnabled: false, journeyIntelligenceEnabled: false, journeyGovernorEnabled: false, commercialEnabled: false,
  aliOutreachEnabled: true, smsEnabled: false, autoDialEnabled: false, inAppNudgeEnabled: true, aiRankingEnabled: false, ...over,
} as ExplorerGrowthFlags);

/** The send-time hold reads the flags from the process environment, as production does. */
export const ENV_ON: Record<string, string> = {
  GROWTH_JOURNEY_ENABLED: 'true', GROWTH_JOURNEY_DECISIONS_ENABLED: 'true', GROWTH_JOURNEY_HANDOFFS_ENABLED: 'true', GROWTH_JOURNEY_EXECUTION_ENABLED: 'true',
  EXPLORER_GROWTH_OS_ENABLED: 'true', EXPLORER_ALI_OUTREACH_ENABLED: 'true', EXPLORER_IN_APP_NUDGE_ENABLED: 'true', EXPLORER_SMS_ENABLED: 'false', EXPLORER_AUTO_DIAL_ENABLED: 'false',
};

/* ── arranging the world ────────────────────────────────────────────────────── */

export interface World5Options extends WorldOptions {
  /** A lead whose status blocks the send (`unsubscribed`, `dnd`, `bounced`), by id. */
  leadStatus?: Record<number, string>;
}

/** The Phase 4 world, then everything Phase 5 adds; every boundary answers as production would with nothing switched on. */
export function arrangeWorld5(fixtures: HandoffFixture[], opts: World5Options = {}): void {
  arrangeWorld(fixtures, opts);
  resetPhase5Tables();
  for (const t of Object.values(T5x)) t.reset();
  campaigns.clear();
  for (const fn of Object.values(m5)) fn.mockReset();
  Object.assign(process.env, ENV_ON);

  // The decisions' idempotency index, honoured by the table's create: a replay is the row it replays.
  m3.decisionCreate.mockImplementation(async (row: Record<string, unknown>) => {
    const key = String(row.idempotency_key);
    if (T5x.decisions.rows.some((r) => r.idempotency_key === key)) throw uniqueViolation('growth_journey_decisions_idempotency_unique');
    return T5x.decisions.insert(row);
  });
  m3.decisionFindOne.mockImplementation(async (q: Query) => T5x.decisions.findOne(q));
  // The campaign registry: the strategies' loader and the validator ask by key.
  m3.campaignFindOne.mockImplementation(async (q: { where: { settings?: { campaign_key?: string } } }) => {
    const key = q.where.settings?.campaign_key;
    const c = key ? campaignByKey(key) : undefined;
    return c ? asModel(c) : null;
  });
  // A lead row that answers both `.status` (the send's lead check) and `.get('email')` (the address read).
  m3.leadFindByPk.mockImplementation(async (id: number) => {
    const l = world.leads.get(Number(id));
    if (!l) return null;
    const row: Record<string, unknown> = { ...l, status: opts.leadStatus?.[Number(id)] ?? 'new', source: 'website' };
    return { ...row, get: (k: string) => row[k] };
  });

  m5.transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn({ LOCK: { UPDATE: 'UPDATE' } }));
  m5.killSwitchStrict.mockResolvedValue(opts.killSwitch ?? false);
  m4.killSwitch.mockResolvedValue(opts.killSwitch ?? false);
  m5.agentFindOne.mockResolvedValue({ get: () => 'agent-executor' });
  m5.sequenceFindByPk.mockImplementation(async (id: string) => ({ id, is_active: true }));
  m5.getSetting.mockImplementation(async (key: string) => (key === 'scheduler_paused' ? false : key === 'max_sends_per_minute' ? 20 : null));
  m5.testOverrides.mockResolvedValue({ enabled: false, email: '', phone: '' });
  m5.consent.mockResolvedValue({ enforced: false, verdict: 'allow', reason: 'shadow' });
  m5.brandPref.mockResolvedValue({ allowed: true });
  m5.aliSends.mockResolvedValue(0);
  m5.lastAliOutreach.mockResolvedValue(null);
  m5.explorerProfileFindOne.mockResolvedValue(null);
  m5.recordAccessDecision.mockResolvedValue(undefined);
  m5.sendMail.mockResolvedValue({ messageId: 'mid', accepted: [], rejected: [], response: 'ok' });
  // The two enrolment services' one visible effect: the step-0 row the scheduler will later send.
  m5.enrol.mockImplementation(async (leadId: number, sequenceId: string, campaignId: string) => {
    T5x.scheduled.insert({ lead_id: leadId, campaign_id: campaignId, sequence_id: sequenceId, step_index: 0, status: 'pending', sent_at: null, metadata: null });
  });
  m5.enrolCampaign.mockImplementation(async (campaignId: string, leadIds: number[]) => {
    for (const leadId of leadIds) T5x.scheduled.insert({ lead_id: leadId, campaign_id: campaignId, sequence_id: `s-${campaignId}`, step_index: 0, status: 'pending', sent_at: null, metadata: null });
    return leadIds.map((leadId) => ({ leadId, status: 'enrolled' }));
  });
  // The ledger mock writes the row the real ledger would: the planner's refusals are what the executor reads back.
  m4.ledger.mockImplementation(async (type: string, entity: string, id: string, scope: Record<string, unknown>, payload: Record<string, unknown>, actor?: string) => {
    T5x.ledger.insert({ event_type: type, entity_type: entity, entity_id: id, tenant_id: scope?.tenant_id ?? null, brand_id: scope?.brand_id ?? null, payload, actor: actor ?? 'growth_journey' });
    return { recorded: true };
  });
}

/* ── controls ───────────────────────────────────────────────────────────────── */

export function rolloutRow(brand: GjBrandSlug, channel: string, mode: 'review' | 'limited', over: Record<string, unknown> = {}): Row {
  const b = brandRow(brand);
  const p = programRow(brand);
  return T5.controls.insert({
    tenant_id: b.tenant_id, kind: 'rollout', scope_key: `rollout|${b.id}|${p.id}|${channel}`, brand_id: b.id, program_id: p.id, channel, subject_ref: null,
    mode, cohort_lead_ids: mode === 'limited' ? [] : null, daily_limit: mode === 'limited' ? 5 : null, reason: 'fixture', set_by_admin_id: 'admin:fixture', cleared_at: null, cleared_by_admin_id: null, ...over,
  });
}

export type StopKind = 'kill_switch' | 'pause:brand' | 'pause:programme' | 'pause:channel' | 'pause:subject';
export const STOPS: readonly StopKind[] = ['kill_switch', 'pause:brand', 'pause:programme', 'pause:channel', 'pause:subject'];

/** Apply one of the five stops to a scope; a pause is a control row, the kill switch is the strict read. Returns the row (or null). */
export function applyStop(kind: StopKind, brand: GjBrandSlug, channel: string, subjectRef: string): Row | null {
  const b = brandRow(brand);
  const p = programRow(brand);
  if (kind === 'kill_switch') {
    m5.killSwitchStrict.mockResolvedValue(true);
    m4.killSwitch.mockResolvedValue(true);
    return null;
  }
  const dims: Record<StopKind, { brand_id: string | null; program_id: string | null; channel: string | null; subject_ref: string | null }> = {
    kill_switch: { brand_id: null, program_id: null, channel: null, subject_ref: null },
    'pause:brand': { brand_id: b.id, program_id: null, channel: null, subject_ref: null },
    'pause:programme': { brand_id: null, program_id: p.id, channel: null, subject_ref: null },
    'pause:channel': { brand_id: null, program_id: null, channel, subject_ref: null },
    'pause:subject': { brand_id: null, program_id: null, channel: null, subject_ref: subjectRef },
  };
  const d = dims[kind];
  const key = ['pause', d.brand_id ?? '*', d.program_id ?? '*', d.channel ?? '*', d.subject_ref ?? '*'].join('|');
  return T5.controls.insert({ tenant_id: b.tenant_id, kind: 'pause', scope_key: key, ...d, mode: 'off', cohort_lead_ids: null, daily_limit: null, reason: 'fixture', set_by_admin_id: 'admin:fixture', cleared_at: null, cleared_by_admin_id: null });
}

/** The reason the ladder names for a stop - on a receipt, in the ledger, on a cancelled send. */
export const stopReason = (kind: StopKind): string => kind;

/* ── reading the world back ─────────────────────────────────────────────────── */

export const receiptsOf = (leadId: number): Row[] => T5.executions.rows.filter((r) => r.lead_id === leadId);
export const receiptStatuses = (): Array<[number | null, string, string]> => T5.executions.rows.map((r) => [r.lead_id as number | null, String(r.status), String(r.status_reason)]);
export const scheduledOf = (leadId: number): Row[] => T5x.scheduled.rows.filter((r) => r.lead_id === leadId);
export const transportCalls = (): number => m5.sendMail.mock.calls.length;

/** The ledger's transition rows for one receipt (`growth_journey.execution.<to>`): `[from, to, reason]`, in order. */
export function transitionsOf(receiptId: string): Array<[string, string, string]> {
  return T5x.ledger.rows
    .filter((r) => r.entity_type === 'growth_journey_execution' && r.entity_id === receiptId && typeof (r.payload as { from?: unknown })?.from === 'string')
    .map((r) => { const p = r.payload as { from: string; to: string; reason: string }; return [p.from, p.to, p.reason]; });
}
export const refusalsOf = (decisionId: string): string[] =>
  T5x.ledger.rows.filter((r) => r.event_type === 'growth_journey.execution.refused' && r.entity_id === decisionId).map((r) => String((r.payload as { refusal: string }).refusal));

export { AS_OF_4, clock, T, T5, m3, m4, world };
