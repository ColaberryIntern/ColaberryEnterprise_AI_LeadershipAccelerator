import type { GrowthJourneyFlags } from '../../../../config/growthJourneyFlags';
import type { GrowthJourneyOwnerQueue } from '../../../../models/GrowthJourneyHandoff';
import type { SubjectAnchor } from '../../subjectResolver';
import { m as m3, modelsMock as models3, persisted } from './phase3Harness';
import { brandRow, contactFor, GJ_BRANDS, policyRowFor, programRow, type GjBrandSlug } from './phase3Fixtures';
import type { HandoffFixture } from './phase4Fixtures';
import { AS_OF_4, clock, stamp, Table, uniqueViolation, type Query, type Row } from './phase4Tables';

/**
 * T414 — the Phase 4 world: T313's harness extended with the handoff, policy,
 * ownership, outcome, ticket, organisation, pipeline and conversion boundaries.
 *
 * ─── WHAT IS REAL NOW, BEYOND PHASE 3 ───────────────────────────────────────
 *
 * The decision writer's handoff step (T404), the packet, the ranked queue and
 * the gated assignment; the human's accept / disposition / release machine
 * (T405); the integration orchestrator and its three writers' own logic
 * (T406: the roll-up finds before it creates, the stage only moves forward,
 * the conversion is keyed on the lead); the outcome recorder (T401/T409); the
 * conversation-ownership answer (T402) and the queue-capacity answer (T403) -
 * both asked by the contact evidence exactly as `resolveContactEvidence` asks
 * them; the return-to-AI cooldown; the reply-route hook; the nightly runner.
 *
 * ─── THE TABLES ENFORCE THE INDEXES THE DDL DECLARES ────────────────────────
 *
 * Every table here is `phase4Tables.ts`'s: T401's shipped unique indexes, parsed
 * from the statement list and honoured on create and on update, so the one-open
 * rules are the database's, not the test's.
 *
 * ─── WHAT ANSWERS AS A JEST FUNCTION, AT A BOUNDARY WITH ITS OWN SUITE ──────
 *
 * `ticketService.createTicket`, the kill switch, the creator identity,
 * `ensureLeadTenantContext`, `advancePipelineStage`, `convertLeadToClient`,
 * `resolveBrandBySlug` and the ledger adapter. The three writers are emulated
 * by their documented contracts (find before create; forward-only by rank;
 * idempotent on the lead) and counted, because "one organisation, one context
 * patch, one pipeline advance" is the exit criterion.
 *
 * A test file declares the `jest.mock` lines itself (hoisted per file) with
 * factories that `require` this module - the same pattern as Phase 3.
 */

export { AS_OF_4, clock, UNIQUES } from './phase4Tables';
const HOUR = 3_600_000;

export const T = {
  handoffs: new Table('growth_journey_handoffs', 'h'),
  policies: new Table('growth_journey_policies', 'pol'),
  ownership: new Table('growth_journey_conversation_ownership', 'own'),
  outcomes: new Table('growth_journey_outcomes', 'out'),
  organizations: new Table('organizations', 'org'),
  contexts: new Table('lead_tenant_contexts', 'ctx'),
  engagements: new Table('delivery_engagements', 'eng'),
  projects: new Table('projects', 'prj'),
  communication: new Table('communication_logs', 'cl'),
  interactions: new Table('interaction_outcomes', 'io'),
  activities: new Table('activities', 'act'),
};

/* ── the boundaries, as jest functions ──────────────────────────────────────── */

export const m4 = {
  ledger: jest.fn(),
  createTicket: jest.fn(),
  killSwitch: jest.fn(),
  creatorId: jest.fn(),
  ensureContext: jest.fn(),
  advanceStage: jest.fn(),
  convertLead: jest.fn(),
  resolveBrandBySlug: jest.fn(),
  outcomesPass: jest.fn(),
};

/** What the writers did, for the counts the exit criterion names. */
export const writes = {
  tickets: [] as Array<Record<string, unknown>>,
  contextPatches: 0,
  advances: [] as Array<{ lead_id: number; stage: string; trigger: string }>,
  conversions: 0,
};

/* ── the world ──────────────────────────────────────────────────────────────── */

export const world = {
  fixtures: [] as HandoffFixture[],
  leads: new Map<number, Record<string, unknown>>(),
};

export const subjectRefOf = (f: HandoffFixture): string => ('enrollmentId' in f.anchor ? `enrollment:${f.anchor.enrollmentId}` : `lead:${f.anchor.leadId}`);
export const anchorOf4 = (f: HandoffFixture): SubjectAnchor => ('enrollmentId' in f.anchor ? { enrollmentId: f.anchor.enrollmentId } : { leadId: f.anchor.leadId });
const brandSlugOfId = (brandId: string): GjBrandSlug | undefined => GJ_BRANDS.find((s) => brandRow(s).id === brandId);
const fixtureAt = (subjectRef: string, brandId: string) => world.fixtures.find((f) => subjectRefOf(f) === subjectRef && brandRow(f.brand).id === brandId);
const fixtureForLead = (leadId: number | null, brandId: string) => world.fixtures.find((f) => f.subject.lead_id === leadId && brandRow(f.brand).id === brandId);

export const flags4 = (over: Partial<GrowthJourneyFlags> = {}): GrowthJourneyFlags => ({
  growthJourneyEnabled: true,
  journeySignalIngest: false,
  journeyClassification: false,
  journeyDecisions: true,
  journeyHandoffs: true,
  journeyExecution: false,
  ...over,
});

export interface WorldOptions {
  /** `daily_capacity` per `brand/queue`; unnamed queues take `defaultCapacity`. */
  capacity?: Record<string, number | null>;
  /** Default 5: every queue has room unless a test says otherwise. */
  defaultCapacity?: number | null;
  /** `brand/queue` pairs with NO assignee policy row. */
  noAssignee?: string[];
  killSwitch?: boolean;
  /** The ticket creator's admin user id; null = the identity is not registered. */
  creator?: string | null;
  /** Handoffs already on the board before the run (e.g. a slot taken earlier today). */
  seedHandoffs?: Array<{ brand: GjBrandSlug; queue: GrowthJourneyOwnerQueue; status: 'queued' | 'assigned' | 'accepted'; subject_ref: string }>;
  asOf?: Date;
}

/** Stage order, as `pipelineService.advancePipelineStage` ranks it: forward only, never from `lost`. */
const STAGE_ORDER: Record<string, number> = { new_lead: 0, contacted: 1, meeting_scheduled: 2, proposal_sent: 3, negotiation: 4, enrolled: 5 };

/** Make every boundary answer for a set of fixtures that share one world. */
export function arrangeWorld(fixtures: HandoffFixture[], opts: WorldOptions = {}): void {
  for (const fn of Object.values(m3)) fn.mockReset();
  for (const fn of Object.values(m4)) fn.mockReset();
  for (const t of Object.values(T)) t.reset();
  persisted.clear();
  writes.tickets = [];
  writes.contextPatches = 0;
  writes.advances = [];
  writes.conversions = 0;
  clock.now = opts.asOf ?? AS_OF_4;
  world.fixtures = fixtures;
  world.leads = new Map();

  // A lead's own facts (its requests, replies, a human's activity) are the lead's, whatever brand
  // looks at them: seeded once per lead, from the first fixture that names it.
  for (const f of fixtures) {
    if (!f.lead || world.leads.has(f.lead.id)) continue;
    const leadId = f.lead.id;
    world.leads.set(leadId, { company: null, industry: null, employee_count: null, annual_revenue: null, ...f.lead });
    const requests = f.recentRequests ?? f.counts.inbound.booked_meeting + f.counts.inbound.answered;
    for (let i = 0; i < requests; i += 1) T.interactions.insert({ lead_id: leadId, outcome: 'booked_meeting', created_at: new Date(clock.now.getTime() - 24 * HOUR) });
    for (let i = 0; i < (f.replies ?? 0); i += 1) T.communication.insert({ lead_id: leadId, channel: 'email', direction: 'inbound', metadata: {}, created_at: new Date(clock.now.getTime() - 20 * HOUR) });
    if (f.humanActivity) {
      T.activities.insert({ lead_id: leadId, admin_user_id: 'au-sales-7', type: f.humanActivity.type, created_at: new Date(clock.now.getTime() - f.humanActivity.hoursAgo * HOUR) });
    }
  }

  // The operator's policy rows: capacity and an assignee for every brand × queue, unless a test withholds one.
  const { OWNER_QUEUES } = require('../../../../models/GrowthJourneyHandoff') as { OWNER_QUEUES: readonly GrowthJourneyOwnerQueue[] };
  for (const slug of GJ_BRANDS) {
    const brandId = brandRow(slug).id;
    for (const queue of OWNER_QUEUES) {
      const key = `${slug}/${queue}`;
      const daily = key in (opts.capacity ?? {}) ? (opts.capacity as Record<string, number | null>)[key] : opts.defaultCapacity === undefined ? 5 : opts.defaultCapacity;
      T.policies.insert({ brand_id: brandId, policy_type: 'queue_capacity', owner_queue: queue, status: 'active', daily_capacity: daily, sla_hours: 24 });
      if (!(opts.noAssignee ?? []).includes(key)) {
        T.policies.insert({ brand_id: brandId, policy_type: 'queue_assignee', owner_queue: queue, status: 'active', assigned_to_type: 'org_member', assigned_to_id: `om-${queue}` });
      }
    }
  }
  for (const s of opts.seedHandoffs ?? []) {
    const b = brandRow(s.brand);
    T.handoffs.insert({ tenant_id: b.tenant_id, brand_id: b.id, subject_ref: s.subject_ref, lead_id: null, owner_queue: s.queue, status: s.status, urgent: false, expected_value: 0, priority: 'low', idempotency_key: `seed:${s.subject_ref}:${s.queue}`, evidence: {}, source: 'manual' });
  }

  /* Phase 3's boundaries, routed across every fixture in the world. */
  m3.resolveSubject.mockImplementation(async (anchor: SubjectAnchor) => {
    const f = world.fixtures.find((x) => ('enrollmentId' in anchor ? 'enrollmentId' in x.anchor && x.anchor.enrollmentId === anchor.enrollmentId : 'leadId' in x.anchor && x.anchor.leadId === anchor.leadId));
    if (!f) return { status: 'unresolved', reason: 'no_such_subject' };
    return {
      status: 'resolved',
      subject: {
        lead_id: f.subject.lead_id,
        enrollment_id: 'enrollmentId' in anchor ? f.subject.enrollment_id : null,
        visitor_id: null,
        org_member_id: null,
        email_normalized: f.subject.email,
        brand_relationships: [],
        customer: f.subject.customer ?? { paid: false, basis: 'none' },
      },
    };
  });
  m3.brandFindByPk.mockImplementation(async (id: string) => {
    const slug = brandSlugOfId(id);
    return slug ? { ...brandRow(slug) } : null;
  });
  m3.programFindOne.mockImplementation(async (q: { where: { brand_id: string } }) => {
    const slug = brandSlugOfId(q.where.brand_id);
    return slug ? { ...programRow(slug) } : null;
  });
  m3.leadFindByPk.mockImplementation(async (id: number) => {
    const l = world.leads.get(Number(id));
    return l ? { ...l } : null;
  });
  m3.classificationFindOne.mockImplementation(async (subjectRef: string, brandId: string) => {
    const f = fixtureAt(subjectRef, brandId);
    return f?.classification ? { ...f.classification } : null;
  });
  m3.profileFindOne.mockImplementation(async (q: { where: { subject_ref: string; brand_id: string } }) => {
    const f = fixtureAt(q.where.subject_ref, q.where.brand_id);
    return f?.profile ? { ...f.profile } : null;
  });
  // Explorer recomputed this morning: a profile is fresh relative to THIS world's clock, never Phase 3's date.
  m3.explorerProfileFindByPk.mockImplementation(async (id: string) =>
    world.fixtures.some((f) => f.learner && f.learner.enrollment_id === id) ? { created_at: new Date('2026-08-01T00:00:00Z'), scores_computed_at: new Date(clock.now.getTime() - 6 * HOUR) } : null,
  );
  m3.loadLifecycleSourceCounts.mockImplementation(async (leadId: number | null) => {
    const f = world.fixtures.find((x) => x.subject.lead_id === leadId);
    return f ? { ...f.counts } : null;
  });
  m3.loadLearnerFacts.mockImplementation(async (anchor: SubjectAnchor) => {
    const f = world.fixtures.find((x) => 'enrollmentId' in anchor && 'enrollmentId' in x.anchor && x.anchor.enrollmentId === anchor.enrollmentId);
    return f?.learner ? { status: 'learner', facts: f.learner } : { status: 'no_learner_profile', reason: 'no_profile_row' };
  });
  m3.policyFindOne.mockImplementation(async (q: { where: { brand_id: string; offer_family: string } }) => policyRowFor(q.where.brand_id, q.where.offer_family));
  m3.handoffFindOne.mockImplementation((q: Query) => T.handoffs.findOne(q));
  m3.enrollmentFindAll.mockResolvedValue([]);
  m3.explorerProfileFindOne.mockResolvedValue(null);
  m3.enrollmentLeadFindOne.mockResolvedValue(null);
  m3.subscriptionFindOne.mockResolvedValue(null);
  m3.contentRuleFindAll.mockResolvedValue([]);
  m3.contentAssetFindAll.mockResolvedValue([]);
  m3.leadTenantContextFindAll.mockImplementation((q: Query) => T.contexts.findAll(q));
  m3.upsertProfile.mockImplementation(async (a: { subjectRef: string }) => ({ profileId: `gp-${a.subjectRef}`, previousState: null, stateChanged: true, transitionId: 't-1', transitionReplayed: false }));
  m3.decisionCreate.mockImplementation(async (row: Record<string, unknown>) => {
    const key = String(row.idempotency_key);
    if (persisted.has(key)) throw uniqueViolation('growth_journey_decisions_idempotency_unique');
    const stored = { id: `d-${persisted.size + 1}`, created_at: stamp(), ...row };
    persisted.set(key, stored);
    return stored;
  });
  m3.decisionFindOne.mockImplementation(async (q: { where: { idempotency_key: string } }) => persisted.get(q.where.idempotency_key) ?? null);

  /* Phase 4's boundaries. */
  m4.ledger.mockResolvedValue({ recorded: true });
  m4.killSwitch.mockResolvedValue(opts.killSwitch ?? false);
  m4.creatorId.mockResolvedValue(opts.creator === undefined ? 'au-growth-journey-handoffs' : opts.creator);
  m4.createTicket.mockImplementation(async (data: Record<string, unknown>) => {
    const ticket = { id: `tk-${writes.tickets.length + 1}`, ...data };
    writes.tickets.push(ticket);
    return ticket;
  });
  m4.ensureContext.mockImplementation(async (input: { leadId: number; tenantId: string; brandId: string; relationshipType: string; organizationId: string | null }) => {
    const where = { lead_id: input.leadId, tenant_id: input.tenantId, brand_id: input.brandId };
    const existing = await T.contexts.findOne({ where });
    if (!existing) {
      writes.contextPatches += 1;
      const context = await T.contexts.create({ ...where, relationship_type: input.relationshipType, organization_id: input.organizationId ?? null, first_source_id: null, first_entry_point_id: null, first_campaign_id: null, first_touch_at: null });
      return { context, created: true, updated: false };
    }
    if (existing.organization_id === null && input.organizationId) {
      writes.contextPatches += 1;
      await (existing as unknown as { update: (p: Record<string, unknown>) => Promise<Row> }).update({ organization_id: input.organizationId });
      return { context: existing, created: false, updated: true };
    }
    return { context: existing, created: false, updated: false };
  });
  m4.advanceStage.mockImplementation(async (leadId: number, target: string, trigger: string) => {
    const lead = world.leads.get(leadId);
    if (!lead) return false;
    const current = (lead.pipeline_stage as string | null) || 'new_lead';
    if (current === 'lost' || STAGE_ORDER[target] === undefined) return false;
    if (STAGE_ORDER[current] !== undefined && STAGE_ORDER[current] >= STAGE_ORDER[target]) return false;
    lead.pipeline_stage = target;
    writes.advances.push({ lead_id: leadId, stage: target, trigger });
    return true;
  });
  m4.convertLead.mockImplementation(async (a: { leadId: number; tenantId: string; brandId: string; correlationId: string }) => {
    const lead = world.leads.get(a.leadId);
    if (!lead) return { refused: true, reason: 'no_such_lead' };
    if (!lead.company) return { refused: true, reason: 'lead_has_no_company' };
    const org = (await T.organizations.findOne({ where: { lead_id: a.leadId } })) ?? (await T.organizations.create({ lead_id: a.leadId, tenant_id: a.tenantId, brand_id: a.brandId, organization_type: 'client' }));
    const found = await T.engagements.findOne({ where: { source_lead_id: a.leadId } });
    const engagement = found ?? (await T.engagements.create({ source_lead_id: a.leadId, organization_id: org.id, correlation_id: a.correlationId }));
    const project = (await T.projects.findOne({ where: { engagement_id: engagement.id } })) ?? (await T.projects.create({ engagement_id: engagement.id }));
    if (!found) writes.conversions += 1;
    return { refused: false, created: !found, organizationId: org.id, engagementId: engagement.id, identityId: `pi-${a.leadId}`, projectId: project.id, membershipId: `tm-${a.leadId}` };
  });
  m4.resolveBrandBySlug.mockImplementation(async (_tenant: string, slug: string) => ((GJ_BRANDS as readonly string[]).includes(slug) ? { ...brandRow(slug as GjBrandSlug) } : null));
  m4.outcomesPass.mockResolvedValue({ skipped: false });
}

/**
 * The contact evidence as `resolveContactEvidence` composes it: the fixture's
 * channels, and the two Phase 4 answers asked of the REAL services over this
 * world's tables - who owns the thread (T402), and the queue's capacity (T403).
 */
export async function resolveContactEvidence(args: { subject: { lead_id: number | null }; brandId: string; tenantId: string; asOf: Date; programKind?: 'learner' | 'business' | 'consulting' }): Promise<unknown> {
  const f = fixtureForLead(args.subject.lead_id, args.brandId);
  const base = contactFor(f?.contact ?? 'open');
  const { resolveHumanConversation } = require('../../conversationOwnershipService') as typeof import('../../conversationOwnershipService');
  const { resolveSalesCapacityFor } = require('../../capacityService') as typeof import('../../capacityService');
  const human = await resolveHumanConversation({ leadId: args.subject.lead_id, brandId: args.brandId, tenantId: args.tenantId, asOf: args.asOf });
  const capacity = args.programKind ? await resolveSalesCapacityFor({ brandId: args.brandId, programKind: args.programKind, asOf: args.asOf }) : { value: 'unknown' as const, reason: 'program_kind_not_supplied' };
  return { ...base, human_conversation: human.value, human_conversation_reason: human.reason, sales_capacity: capacity.value, sales_capacity_reason: capacity.reason };
}

/* ── the `../../../models` index, as every Phase 4 module sees it ───────────── */

export const modelsMock = {
  ...models3,
  JourneyProgram: {
    ...models3.JourneyProgram,
    // The nightly's brand list: the programmes of the brands this world holds, slug order.
    findAll: async () =>
      [...new Set(world.fixtures.map((f) => f.brand))].map((slug) => ({ ...programRow(slug) })).sort((a, b) => a.slug.localeCompare(b.slug)),
  },
  GrowthJourneyClassification: {
    ...models3.GrowthJourneyClassification,
    // The batch runner's population: every subject classified under the brand, in fixture order.
    findAll: async (q: { where: { brand_id: string } }) =>
      world.fixtures.filter((f) => brandRow(f.brand).id === q.where.brand_id && f.classification).map((f) => ({ get: () => subjectRefOf(f) })),
  },
  GrowthJourneyHandoff: T.handoffs,
  GrowthJourneyPolicy: T.policies,
  GrowthJourneyConversationOwnership: T.ownership,
  GrowthJourneyOutcome: T.outcomes,
  Organization: T.organizations,
  LeadTenantContext: { findAll: (q: Query) => T.contexts.findAll(q), findOne: (q: Query) => T.contexts.findOne(q) },
  CommunicationLog: T.communication,
  InteractionOutcome: T.interactions,
  Activity: T.activities,
};

/* ── reading the world back ─────────────────────────────────────────────────── */

const OPEN = ['queued', 'assigned', 'accepted'];

/** Every count the exit criterion names, from the tables and the writers. */
export function tally(): Record<string, number> {
  return {
    decisions: persisted.size,
    handoffs: T.handoffs.rows.length,
    open_handoffs: T.handoffs.rows.filter((r) => OPEN.includes(String(r.status))).length,
    tickets: writes.tickets.length,
    ownership_rows: T.ownership.rows.length,
    open_ownership: T.ownership.rows.filter((r) => r.cleared_at === null || r.cleared_at === undefined).length,
    outcomes: T.outcomes.rows.length,
    organizations: T.organizations.rows.length,
    context_patches: writes.contextPatches,
    pipeline_advances: writes.advances.length,
    engagements: T.engagements.rows.length,
    projects: T.projects.rows.length,
  };
}

/** The handoff rows of one subject in one brand. */
export const handoffsOf = (f: HandoffFixture): Row[] => T.handoffs.rows.filter((r) => r.subject_ref === subjectRefOf(f) && r.brand_id === brandRow(f.brand).id);

/** One line of the demo table: fixture → queue → status → assigned → integrations. */
export interface TableLine { fixture: string; queue: string; status: string; assigned: string; integrations: string }
export function lineFor(key: string, row: Row | undefined, integrations: string): TableLine {
  return {
    fixture: key,
    queue: row ? String(row.owner_queue) : '-',
    status: row ? String(row.status) : 'no handoff',
    assigned: !row ? '-' : row.ticket_id ? `${String(row.assigned_to_type)}:${String(row.assigned_to_id)} (${String(row.ticket_id)})` : row.assigned_to_type === 'human' ? `human:${String(row.assigned_to_id)}` : `blocked:${String(row.assignment_blocked_reason ?? '-')}`,
    integrations,
  };
}
export function printTable(title: string, lines: TableLine[]): void {
  const w = (k: keyof TableLine) => Math.max(k.length, ...lines.map((l) => l[k].length));
  const cols: Array<keyof TableLine> = ['fixture', 'queue', 'status', 'assigned', 'integrations'];
  const fmt = (l: Record<keyof TableLine, string>) => cols.map((c) => l[c].padEnd(w(c))).join('  ');
  const header = Object.fromEntries(cols.map((c) => [c, c])) as Record<keyof TableLine, string>;
  console.info(`\n${title}\n${[fmt(header), ...lines.map(fmt)].join('\n')}\n`);
}
