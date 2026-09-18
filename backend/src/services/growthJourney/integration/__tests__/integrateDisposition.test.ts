import * as fs from 'fs';
import * as path from 'path';

/**
 * T406 — existing-system integration on a human disposition.
 *
 * The three writers, the orchestrator, T401's outcome recorder and the
 * EXISTING pipeline writer (`pipelineService.advancePipelineStage`, whose
 * forward-only rank table is the property under test) are REAL. The rows they
 * touch are in-memory stores that behave like the tables: `organizations`
 * found by `lead_id`, `lead_tenant_contexts` keyed on (lead, tenant, brand)
 * with `organization_id` set only when null, `leads.pipeline_stage` on the
 * row, the conversion chain found on the second run. The kill switch, the
 * ledger and the conversion module are mocked at their boundaries.
 */

type LeadRow = { id: number; email: string; company: string | null; pipeline_stage: string | null; update: (patch: Record<string, unknown>) => Promise<LeadRow> };
const leads = new Map<number, LeadRow>();
const organizations: Array<Record<string, unknown>> = [];
const contexts: Array<Record<string, unknown>> = [];
const outcomes: Array<Record<string, unknown>> = [];
const conversions = new Map<number, Record<string, string>>();
const activities: Array<Record<string, unknown>> = [];
let killSwitch = false;
let seq = 0;
const uniqueError = () => Object.assign(new Error('duplicate key'), { name: 'SequelizeUniqueConstraintError' });

const LeadModel = {
  findByPk: jest.fn(async (id: number) => leads.get(id) ?? null),
};
const orgFindOne = jest.fn(async ({ where }: { where: { lead_id: number } }) => organizations.find((o) => o.lead_id === where.lead_id) ?? null);
const orgCreate = jest.fn(async (row: Record<string, unknown>) => { const stored = { id: `org-${++seq}`, ...row }; organizations.push(stored); return stored; });
jest.mock('../../../../models', () => ({
  Lead: LeadModel,
  Organization: { findOne: (...a: unknown[]) => orgFindOne(...(a as [{ where: { lead_id: number } }])), create: (...a: unknown[]) => orgCreate(...(a as [Record<string, unknown>])) },
  GrowthJourneyOutcome: {
    create: async (row: Record<string, unknown>) => {
      if (outcomes.some((r) => r.source === row.source && r.source_ref === row.source_ref)) throw uniqueError();
      const stored = { id: `out-${++seq}`, ...row };
      outcomes.push(stored);
      return stored;
    },
    findOne: async ({ where }: { where: Record<string, unknown> }) => outcomes.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null,
  },
}));
// pipelineService imports the Lead model file directly.
jest.mock('../../../../models/Lead', () => ({ __esModule: true, default: LeadModel }));
const logActivity = jest.fn(async (a: Record<string, unknown>) => { activities.push(a); });
jest.mock('../../../activityService', () => ({ logActivity: (...a: unknown[]) => logActivity(...(a as [Record<string, unknown>])) }));
const ensureLeadTenantContext = jest.fn(async (input: { leadId: number; tenantId: string; brandId: string; relationshipType: string; organizationId?: string | null }) => {
  const existing = contexts.find((c) => c.lead_id === input.leadId && c.tenant_id === input.tenantId && c.brand_id === input.brandId);
  if (!existing) {
    const context = { id: `ctx-${++seq}`, lead_id: input.leadId, tenant_id: input.tenantId, brand_id: input.brandId, relationship_type: input.relationshipType, organization_id: input.organizationId ?? null };
    contexts.push(context);
    return { context, created: true, updated: false };
  }
  let updated = false;
  if (input.organizationId && !existing.organization_id) { existing.organization_id = input.organizationId; updated = true; }
  return { context: existing, created: false, updated };
});
jest.mock('../../../../modules/tenancy/leadContextService', () => ({ ensureLeadTenantContext: (...a: unknown[]) => ensureLeadTenantContext(...(a as [never])) }));
const convertLeadToClient = jest.fn(async (input: { leadId: number; tenantId: string; brandId?: string | null; actorIdentityId?: string | null; correlationId?: string }) => {
  const lead = leads.get(input.leadId);
  if (!lead) return { refused: true as const, reason: 'no_such_lead' as const, detail: 'the lead does not exist' };
  if (!lead.company) return { refused: true as const, reason: 'lead_has_no_company' as const, detail: 'a client needs a company' };
  const found = conversions.get(input.leadId);
  if (found) return { refused: false as const, created: false, organizationId: found.org, engagementId: found.eng, identityId: found.idn, projectId: found.prj, membershipId: found.mem };
  const ids = { org: `org-${++seq}`, eng: `eng-${++seq}`, idn: `idn-${++seq}`, prj: `prj-${++seq}`, mem: `mem-${++seq}` };
  conversions.set(input.leadId, ids);
  return { refused: false as const, created: true, organizationId: ids.org, engagementId: ids.eng, identityId: ids.idn, projectId: ids.prj, membershipId: ids.mem };
});
jest.mock('../../../delivery/leadConversion', () => ({ convertLeadToClient: (...a: unknown[]) => convertLeadToClient(...(a as [never])) }));
const isKillSwitchActive = jest.fn(async () => killSwitch);
jest.mock('../../../launchSafety', () => ({ isKillSwitchActive: () => isKillSwitchActive() }));
const logEvent = jest.fn<Promise<void>, unknown[]>(async () => undefined);
jest.mock('../../../ledgerService', () => ({ logEvent: (...a: unknown[]) => logEvent(...a) }));

import { integrateDisposition, programKindOf } from '../integrateDisposition';
import { rollUpAccount, ROLLUP_ORGANIZATION_TYPE, ROLLUP_RELATIONSHIP_TYPE, UNNAMED_ORGANIZATION } from '../accountRollup';
import { advanceForDisposition, pipelineTrigger } from '../pipelineAdvance';
import { intakeFlotationClient } from '../flotationIntake';
import { STAGE_BY_DISPOSITION, isIntegratingDisposition } from '../dispositions';

const AS_OF = new Date('2026-09-16T15:00:00Z');
const ACTOR = { id: 'staff-1', platformIdentityId: 'pid-1' };
const HANDOFF_ID = '30000000-0000-4000-8000-000000000001';

function lead(id: number, over: Partial<LeadRow> = {}): LeadRow {
  const row: LeadRow = { id, email: `lead${id}@example.com`, company: 'Acme Logistics', pipeline_stage: 'contacted', update: async (patch) => Object.assign(row, patch), ...over };
  leads.set(id, row);
  return row;
}
const handoff = (kind: string | null, over: Record<string, unknown> = {}) => ({
  id: HANDOFF_ID, tenant_id: 't-col', brand_id: 'b-ent', subject_ref: 'lead:501', lead_id: 501 as number | null, decision_id: 'd-1',
  evidence: kind ? { brand_program_path: { brand: 'x', program: { slug: 'p', kind }, path: null } } : { brand_program_path: { program: null } },
  ...over,
});
const run = (kind: string | null, disposition: string, over: Record<string, unknown> = {}) => integrateDisposition({ handoff: handoff(kind, over), disposition, actor: ACTOR, asOf: AS_OF });
// The integration's own ledger rows; the recorder's row per outcome indexed (T410) is asserted apart.
const events = () => logEvent.mock.calls.map((c: unknown[]) => c[0] as string).filter((e) => e.startsWith('growth_journey.integration.'));
const integrationCalls = () => logEvent.mock.calls.filter((c: unknown[]) => (c[0] as string).startsWith('growth_journey.integration.'));
const outcomeRows = () => logEvent.mock.calls.filter((c: unknown[]) => c[0] === 'growth_journey.outcome.recorded');
const nothingWritten = () => {
  expect(orgCreate).not.toHaveBeenCalled();
  expect(ensureLeadTenantContext).not.toHaveBeenCalled();
  expect(convertLeadToClient).not.toHaveBeenCalled();
  expect(activities).toEqual([]);
  expect(outcomes).toEqual([]);
};

beforeEach(() => {
  leads.clear(); organizations.length = 0; contexts.length = 0; outcomes.length = 0; conversions.clear(); activities.length = 0; killSwitch = false; seq = 0;
  for (const fn of [LeadModel.findByPk, orgFindOne, orgCreate, logActivity, ensureLeadTenantContext, convertLeadToClient, isKillSwitchActive, logEvent]) fn.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the vocabulary', () => {
  it('two dispositions integrate, and the stage each implies is fixed', () => {
    expect(STAGE_BY_DISPOSITION).toEqual({ qualified: 'meeting_scheduled', converted: 'proposal_sent' });
    expect(['qualified', 'converted'].every(isIntegratingDisposition)).toBe(true);
    expect(['not_ready', 'nurture', 'no_contact', 'disqualified', 'toString', 'constructor'].some(isIntegratingDisposition)).toBe(false);
    expect(pipelineTrigger('h-1')).toBe('growth_journey:handoff:h-1');
    expect(programKindOf({ brand_program_path: { program: { kind: 'business' } } })).toBe('business');
    expect(programKindOf({ brand_program_path: { program: null } })).toBeNull();
    expect(programKindOf({})).toBeNull();
  });
});

describe('what never integrates', () => {
  it.each(['not_ready', 'nurture', 'no_contact', 'disqualified'])('%s on a Business subject writes nothing and is skipped by name', async (d) => {
    lead(501);
    expect(await run('business', d)).toMatchObject({ status: 'skipped', reason: `disposition_${d}`, writes: [], refusals: [] });
    nothingWritten();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('a learner disposition writes nothing to any of the four systems - their systems are Explorer\'s', async () => {
    lead(501);
    for (const d of ['qualified', 'converted']) {
      expect(await run('learner', d)).toMatchObject({ status: 'skipped', reason: 'learner_program', program_kind: 'learner' });
    }
    nothingWritten();
    expect(orgFindOne).not.toHaveBeenCalled();
    expect(LeadModel.findByPk).not.toHaveBeenCalled();
  });

  it('a packet with no programme kind, or a subject with no lead anchor, is skipped by name', async () => {
    lead(501);
    expect(await run(null, 'qualified')).toMatchObject({ status: 'skipped', reason: 'program_kind_unknown', program_kind: null });
    expect(await run('business', 'qualified', { lead_id: null, subject_ref: 'enrollment:e-1' })).toMatchObject({ status: 'skipped', reason: 'no_lead_anchor' });
    nothingWritten();
  });
});

describe('a Business subject', () => {
  it('qualified: one organisation from the lead, the brand relationship carries it, the stage moves to meeting_scheduled, one opportunity_stage outcome, two ledger rows with tenant and brand', async () => {
    const l = lead(501, { pipeline_stage: 'contacted' });
    const s = await run('business', 'qualified');
    expect(s).toMatchObject({ status: 'written', reason: null, program_kind: 'business', writes: ['account_rollup', 'pipeline_advance'], refusals: [] });
    expect(orgCreate).toHaveBeenCalledWith({ lead_id: 501, tenant_id: 't-col', brand_id: 'b-ent', name: 'Acme Logistics', organization_type: ROLLUP_ORGANIZATION_TYPE, owner_enrollment_id: null });
    expect(ensureLeadTenantContext).toHaveBeenCalledWith({ leadId: 501, tenantId: 't-col', brandId: 'b-ent', relationshipType: ROLLUP_RELATIONSHIP_TYPE, organizationId: 'org-1' });
    expect(l.pipeline_stage).toBe('meeting_scheduled');
    expect(activities[0]).toMatchObject({ lead_id: 501, type: 'status_change', metadata: { from_stage: 'contacted', to_stage: 'meeting_scheduled', trigger: `growth_journey:handoff:${HANDOFF_ID}` } });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ outcome_type: 'opportunity_stage', source: 'leads.pipeline_stage', source_ref: '501:meeting_scheduled', handoff_id: HANDOFF_ID, decision_id: 'd-1', lead_id: 501, subject_ref: 'lead:501', tenant_id: 't-col', brand_id: 'b-ent', occurred_at: AS_OF, metadata: { stage: 'meeting_scheduled', trigger: `growth_journey:handoff:${HANDOFF_ID}`, disposition: 'qualified' } });
    expect(s.ids).toEqual({ organization_id: 'org-1', organization_created: true, context_id: 'ctx-2', context_created: true, context_updated: false, stage: 'meeting_scheduled', advanced: true });
    expect(s.outcome_ids).toEqual([outcomes[0].id]);
    expect(events()).toEqual(['growth_journey.integration.account_rollup', 'growth_journey.integration.pipeline_advance']);
    // T410: the outcome indexed is one ledger row of its own - the recorder's, actor growth_journey, entity the outcome - between the two writers'.
    expect(outcomeRows()).toHaveLength(1);
    expect(outcomeRows()[0].slice(1, 4)).toEqual(['growth_journey', 'growth_journey_outcome', outcomes[0].id]);
    expect(outcomeRows()[0][4]).toMatchObject({ outcome_type: 'opportunity_stage', source: 'leads.pipeline_stage', source_ref: '501:meeting_scheduled', handoff_id: HANDOFF_ID, lead_id: 501 });
    expect(logEvent.mock.calls.map((c: unknown[]) => c[0])).toEqual(['growth_journey.integration.account_rollup', 'growth_journey.outcome.recorded', 'growth_journey.integration.pipeline_advance']);
    for (const call of integrationCalls()) {
      expect(call[1]).toBe('admin:staff-1');
      expect(call[2]).toBe('growth_journey_handoff');
      expect(call[3]).toBe(HANDOFF_ID);
      expect(call[5]).toEqual({ tenant_id: 't-col', brand_id: 'b-ent' });
    }
    // Ids only: the lead's address is in the store and reaches nothing.
    expect(JSON.stringify([logEvent.mock.calls, outcomes, organizations, contexts, s])).not.toContain('@');
  });

  it('the same disposition twice: one organisation, one context patch, one pipeline advance, one outcome; the second run finds everything', async () => {
    lead(501, { pipeline_stage: 'contacted' });
    const first = await run('business', 'qualified');
    const second = await run('business', 'qualified');
    expect(orgCreate).toHaveBeenCalledTimes(1);
    expect(orgFindOne).toHaveBeenCalledTimes(2);
    expect(organizations).toHaveLength(1);
    expect(ensureLeadTenantContext).toHaveBeenCalledTimes(2);
    expect(contexts).toHaveLength(1);
    expect(activities).toHaveLength(1);
    expect(outcomes).toHaveLength(1);
    expect(second).toMatchObject({ status: 'written', writes: ['account_rollup', 'pipeline_advance'], ids: { organization_id: first.ids.organization_id, organization_created: false, context_created: false, context_updated: false, stage: 'meeting_scheduled', advanced: false }, outcome_ids: [] });
  });

  it('the stage never moves backward: a negotiation lead dispositioned qualified stays negotiation, and a lost lead stays lost - no outcome, no activity', async () => {
    const l = lead(501, { pipeline_stage: 'negotiation' });
    const s = await run('business', 'qualified');
    expect(l.pipeline_stage).toBe('negotiation');
    expect(s).toMatchObject({ status: 'written', writes: ['account_rollup', 'pipeline_advance'], ids: { stage: 'meeting_scheduled', advanced: false }, outcome_ids: [] });
    expect(activities).toEqual([]);
    expect(outcomes).toEqual([]);
    const lost = lead(502, { pipeline_stage: 'lost' });
    await run('business', 'converted', { lead_id: 502, subject_ref: 'lead:502' });
    expect(lost.pipeline_stage).toBe('lost');
    expect(activities).toEqual([]);
    // And never PAST what a human's verdict implies: a proposal_sent lead dispositioned qualified stays where it is -
    // qualified implies meeting_scheduled and nothing later, whatever a human might have meant.
    const ahead = lead(503, { pipeline_stage: 'proposal_sent' });
    const s3 = await run('business', 'qualified', { lead_id: 503, subject_ref: 'lead:503' });
    expect(ahead.pipeline_stage).toBe('proposal_sent');
    expect(s3.ids).toMatchObject({ stage: 'meeting_scheduled', advanced: false });
    expect(activities).toEqual([]);
  });

  it('converted: the stage moves to proposal_sent and no further - no organisation, no context; a lead already at negotiation stays', async () => {
    const l = lead(501, { pipeline_stage: 'meeting_scheduled' });
    const s = await run('business', 'converted');
    expect(l.pipeline_stage).toBe('proposal_sent');
    expect(s).toMatchObject({ status: 'written', writes: ['pipeline_advance'], ids: { stage: 'proposal_sent', advanced: true } });
    expect(orgFindOne).not.toHaveBeenCalled();
    expect(orgCreate).not.toHaveBeenCalled();
    expect(ensureLeadTenantContext).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ outcome_type: 'opportunity_stage', source_ref: '501:proposal_sent' });
    const ahead = lead(503, { pipeline_stage: 'negotiation' });
    await run('business', 'converted', { lead_id: 503, subject_ref: 'lead:503' });
    expect(ahead.pipeline_stage).toBe('negotiation');
  });

  it('a lead with no company still rolls up, as <unnamed>; the account is found again by lead_id', async () => {
    lead(501, { company: '  ' });
    await run('business', 'qualified');
    expect(orgCreate).toHaveBeenCalledWith(expect.objectContaining({ name: UNNAMED_ORGANIZATION, lead_id: 501 }));
    expect((await rollUpAccount({ lead: { id: 501, company: null }, tenantId: 't-col', brandId: 'b-ent' })).status).toBe('written');
    expect(orgCreate).toHaveBeenCalledTimes(1);
  });
});

describe('an AI Flotation subject', () => {
  it('qualified: the existing conversion runs once with the human as actor and the handoff as correlation id; one project_started outcome; one ledger row', async () => {
    lead(501);
    const s = await run('consulting', 'qualified');
    expect(convertLeadToClient).toHaveBeenCalledWith({ leadId: 501, tenantId: 't-col', brandId: 'b-ent', actorIdentityId: 'pid-1', correlationId: HANDOFF_ID });
    expect(s).toMatchObject({ status: 'written', writes: ['flotation_intake'], ids: { conversion_created: true }, refusals: [] });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ outcome_type: 'project_started', source: 'delivery_engagements', source_ref: s.ids.engagement_id, handoff_id: HANDOFF_ID, metadata: { created: true, organization_id: s.ids.organization_id, project_id: s.ids.project_id, disposition: 'qualified' } });
    expect(events()).toEqual(['growth_journey.integration.flotation_intake']);
    expect(outcomeRows()).toHaveLength(1);
    expect(outcomeRows()[0][4]).toMatchObject({ outcome_type: 'project_started', source: 'delivery_engagements', source_ref: s.ids.engagement_id, handoff_id: HANDOFF_ID });
    expect(orgCreate).not.toHaveBeenCalled();
    expect(activities).toEqual([]);
    expect(JSON.stringify([logEvent.mock.calls, outcomes, s])).not.toContain('@');
  });

  it('the same disposition twice: one conversion - the second run is the existing writer\'s replay and the outcome is the same row', async () => {
    lead(501);
    const first = await run('consulting', 'converted');
    const second = await run('consulting', 'converted');
    expect(convertLeadToClient).toHaveBeenCalledTimes(2);
    expect(conversions.size).toBe(1);
    expect(second.ids).toMatchObject({ engagement_id: first.ids.engagement_id, organization_id: first.ids.organization_id, conversion_created: false });
    expect(outcomes).toHaveLength(1);
    expect(second.outcome_ids).toEqual(first.outcome_ids);
    // The replay is the existing writer's own contract: its audit event names it.
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'delivery', 'leadConversion.ts'), 'utf8');
    expect(src).toContain("result.created ? 'lead.converted' : 'lead.conversion_replayed'");
  });

  it('a lead with no company: the writer refuses lead_has_no_company, nothing is written, the refusal is on the summary and the ledger', async () => {
    lead(501, { company: null });
    const s = await run('consulting', 'qualified');
    expect(s).toMatchObject({ status: 'refused', reason: 'lead_has_no_company', writes: [], refusals: [{ writer: 'flotation_intake', reason: 'lead_has_no_company' }], outcome_ids: [] });
    expect(conversions.size).toBe(0);
    expect(outcomes).toEqual([]);
    expect(events()).toEqual(['growth_journey.integration.refused']);
    expect(outcomeRows()).toEqual([]);
    expect(logEvent.mock.calls[0][4]).toMatchObject({ writer: 'flotation_intake', reason: 'lead_has_no_company', disposition: 'qualified', handoff_id: HANDOFF_ID });
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain('@');
  });

  it('the actor may have no platform identity: null reaches the conversion, never the admin id', async () => {
    lead(501);
    await integrateDisposition({ handoff: handoff('consulting'), disposition: 'qualified', actor: { id: 'staff-1' }, asOf: AS_OF });
    expect(convertLeadToClient).toHaveBeenCalledWith(expect.objectContaining({ actorIdentityId: null }));
  });
});

describe('the kill switch', () => {
  beforeEach(() => { killSwitch = true; lead(501); });

  it('every writer refuses kill_switch_active before touching anything', async () => {
    expect(await rollUpAccount({ lead: { id: 501, company: 'Acme' }, tenantId: 't-col', brandId: 'b-ent' })).toEqual({ status: 'refused', reason: 'kill_switch_active' });
    expect(await advanceForDisposition({ leadId: 501, disposition: 'qualified', handoffId: HANDOFF_ID })).toEqual({ status: 'refused', reason: 'kill_switch_active' });
    expect(await intakeFlotationClient({ leadId: 501, tenantId: 't-col', brandId: 'b-ent', actorIdentityId: null, handoffId: HANDOFF_ID })).toEqual({ status: 'refused', reason: 'kill_switch_active' });
    nothingWritten();
    expect(orgFindOne).not.toHaveBeenCalled();
    expect(leads.get(501)!.pipeline_stage).toBe('contacted');
    expect(isKillSwitchActive).toHaveBeenCalledTimes(3);
  });

  it('through the orchestrator: Business qualified, Business converted and Flotation each refuse by name with the writer named, and the refusal is a ledger row', async () => {
    expect(await run('business', 'qualified')).toMatchObject({ status: 'refused', reason: 'kill_switch_active', refusals: [{ writer: 'account_rollup', reason: 'kill_switch_active' }], writes: [] });
    expect(await run('business', 'converted')).toMatchObject({ status: 'refused', refusals: [{ writer: 'pipeline_advance', reason: 'kill_switch_active' }] });
    expect(await run('consulting', 'qualified')).toMatchObject({ status: 'refused', refusals: [{ writer: 'flotation_intake', reason: 'kill_switch_active' }] });
    nothingWritten();
    expect(events()).toEqual(['growth_journey.integration.refused', 'growth_journey.integration.refused', 'growth_journey.integration.refused']);
  });
});
