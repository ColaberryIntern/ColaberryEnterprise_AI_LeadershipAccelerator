jest.mock('../ledger', () => ({ recordJourneyEvent: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.ledger(...a) }));
jest.mock('../../../models', () => require('./fixtures/phase4Harness').modelsMock);
jest.mock('../../../models/BrandOfferPolicy', () => require('./fixtures/phase3Harness').policyModelMock);
jest.mock('../../../models/Brand', () => ({ __esModule: true, default: { findAll: jest.fn(), findByPk: jest.fn() } }));
jest.mock('../subjectResolver', () => ({ resolveSubject: (...a: unknown[]) => require('./fixtures/phase3Harness').m.resolveSubject(...a) }));
jest.mock('../governor/contactEvidence', () => ({
  ...jest.requireActual('../governor/contactEvidence'),
  resolveContactEvidence: (...a: unknown[]) => require('./fixtures/phase4Harness').resolveContactEvidence(...a),
}));
jest.mock('../decision/lifecycleInputs', () => ({ loadLifecycleSourceCounts: (...a: unknown[]) => require('./fixtures/phase3Harness').m.loadLifecycleSourceCounts(...a) }));
jest.mock('../strategies/learnerFacts', () => ({ loadLearnerFacts: (...a: unknown[]) => require('./fixtures/phase3Harness').m.loadLearnerFacts(...a) }));
jest.mock('../profileService', () => ({ upsertProfile: (...a: unknown[]) => require('./fixtures/phase3Harness').m.upsertProfile(...a) }));
jest.mock('../classificationService', () => ({
  ...jest.requireActual('../classificationService'),
  latestClassification: (...a: unknown[]) => require('./fixtures/phase3Harness').m.classificationFindOne(...a),
}));
jest.mock('../../ticketService', () => ({ createTicket: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.createTicket(...a) }));
jest.mock('../../launchSafety', () => ({ ...jest.requireActual('../../launchSafety'), isKillSwitchActive: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.killSwitch(...a) }));
jest.mock('../../agentBlueprint/agentIdentitySeed', () => ({ seedAgentIdentity: jest.fn(), getAgentAdminUserId: jest.fn() }));
jest.mock('../../agentBlueprint/ticketCreatorIdentitySeed', () => ({
  ...jest.requireActual('../../agentBlueprint/ticketCreatorIdentitySeed'),
  getTicketCreatorAdminUserId: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.creatorId(...a),
}));
jest.mock('../../../modules/tenancy/leadContextService', () => ({
  ...jest.requireActual('../../../modules/tenancy/leadContextService'),
  ensureLeadTenantContext: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.ensureContext(...a),
}));
jest.mock('../../pipelineService', () => ({ ...jest.requireActual('../../pipelineService'), advancePipelineStage: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.advanceStage(...a) }));
jest.mock('../../delivery/leadConversion', () => ({ convertLeadToClient: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.convertLead(...a) }));

import { anchorOf4, AS_OF_4, arrangeWorld, clock, flags4, handoffsOf, lineFor, m4, printTable, T, tally, UNIQUES, writes, type TableLine } from './fixtures/phase4Harness';
import { allowedFor, brandRow, programRow } from './fixtures/phase3Fixtures';
import { classifyArrival, exitTwins, twoTriggerSubject, type HandoffFixture } from './fixtures/phase4Fixtures';
import { sequelize } from '../../../config/database';
import { decideForSubjectAndRecord } from '../decisionService';
import { acceptHandoff, dispositionHandoff, HandoffTransitionError, type DispositionResult } from '../handoffs/dispositionService';
import { createHandoff } from '../handoffs/handoffService';
import { PACKET_FIELDS } from '../handoffs/evidencePacket';

/**
 * T414 — the Phase 4 exit criterion, literally, as tests and as the demo table.
 *
 * "A high-intent fixture travels source → classification → decision → the
 * sales queue with a complete packet → a human `qualified` disposition → one
 * organisation, one context patch, one pipeline advance - and, for the AI
 * Flotation twin, one engagement and project - with the whole run replayed
 * once and every count unchanged." Each twin runs in its own world
 * (`phase4Harness.ts`): Phase 2's real ladder classifies the arrival, T311's
 * writer decides, T404 hands off and assigns, T405 accepts and dispositions,
 * T406 integrates - and then the whole run is driven again.
 *
 * The §16 A–L scenarios are `handoffRuns.phase4.scenarios.test.ts`.
 */

const sqlSpy = jest.spyOn(sequelize, 'query').mockResolvedValue([] as never);
const HUMAN = { id: 'au-sales-7' };
const table: TableLine[] = [];
type Row = Record<string, unknown> & { id: string; status: string };

async function decide(f: HandoffFixture, asOf: Date = clock.now) {
  clock.now = asOf;
  const r = await decideForSubjectAndRecord({ anchor: anchorOf4(f), brandId: brandRow(f.brand).id, trigger: 'nightly', flags: flags4(), asOf });
  if (r.status !== 'recorded') throw new Error(`${f.key}: ${r.status}`);
  return r;
}

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterAll(() => {
  printTable('Phase 4 exit criterion — fixture → queue → status → assigned → integrations', table);
  sqlSpy.mockRestore();
  jest.restoreAllMocks();
});

/* ── the world honours the DDL, or it proves nothing ────────────────────────── */

describe('the world enforces the unique indexes T401 ships', () => {
  it('every unique index on the handoff, ownership and outcome tables is read from the DDL - the one-open indexes partial on their open states', () => {
    const on = (table: string) => UNIQUES.filter((u) => u.table === table).map((u) => u.name).sort();
    // T501 added the per-PERSON index beside T401's per-subject one; the world reads it from the Phase 5 statements.
    expect(on('growth_journey_handoffs')).toEqual(['growth_journey_handoffs_idempotency_unique', 'growth_journey_handoffs_open_lead_unique', 'growth_journey_handoffs_open_subject_unique']);
    expect(on('growth_journey_conversation_ownership')).toEqual(['growth_journey_conversation_ownership_open_unique']);
    expect(on('growth_journey_outcomes')).toEqual(['growth_journey_outcomes_source_unique']);
    const open = UNIQUES.find((u) => u.name === 'growth_journey_handoffs_open_subject_unique')!;
    expect(open.columns).toEqual(['subject_ref', 'brand_id']);
    expect(['queued', 'assigned', 'accepted'].map((status) => open.applies({ status }))).toEqual([true, true, true]);
    expect(['dispositioned', 'returned_to_ai', 'expired', 'cancelled'].some((status) => open.applies({ status }))).toBe(false);
  });
});

/* ── the exit criterion, twice ───────────────────────────────────────────────── */

for (const f of exitTwins()) {
  describe(`exit: ${f.key}`, () => {
    const run: Record<string, unknown> = {};
    let handoff: Row;
    let disposition: DispositionResult;
    let first: Record<string, number>;

    beforeAll(async () => {
      const classification = await classifyArrival(f);
      f.classification = classification;
      arrangeWorld([f], { asOf: AS_OF_4 });
      run.decision = await decide(f, AS_OF_4);
      [handoff] = handoffsOf(f) as Row[];
      run.assignedAt = handoff ? { status: handoff.status, ticket_id: handoff.ticket_id } : null;
      run.afterAccept = handoff ? await acceptHandoff(handoff as never, HUMAN, new Date(AS_OF_4.getTime() + 3_600_000)) : null;
      run.openAfterAccept = T.ownership.rows.filter((r) => r.cleared_at === null).length;
      disposition = await dispositionHandoff(handoff as never, { disposition: 'qualified', reason: 'budget and a named owner' }, HUMAN, new Date(AS_OF_4.getTime() + 7_200_000));
      first = tally();
      table.push(lineFor(f.key, handoff, disposition.integration?.writes.join('+') || '-'));
    });

    it(`arrives through ${f.source?.source}/${f.source?.entry}, and Phase 2's real ladder places it in the brand, under a family the brand may offer`, () => {
      expect(f.classification?.brand_relationship).toBe(f.brand);
      expect(f.classification?.primary_path).not.toBeNull();
      expect(allowedFor(f.brand)).toContain(f.classification?.primary_path);
    });

    it(`the decision: ${f.expect.state}, WAIT (Layer 4 is a person's), and a create_handoff to ${f.expect.queue}`, () => {
      const r = run.decision as Awaited<ReturnType<typeof decide>>;
      expect(r.row.state_at_decision).toBe(f.expect.state);
      expect(r.row.selected_action).toBe('WAIT');
      expect(r.row.executed).toBe(false);
      const owners = (r.row.deferred_actions as Array<{ would: string; payload: { owner?: string } }>).filter((d) => d.would === 'create_handoff').map((d) => d.payload.owner);
      expect(owners).toEqual([f.expect.queue]);
    });

    it(`ONE handoff, in ${f.expect.queue}, assigned through the ticket system - and a packet with every §9 field present or explicitly unavailable`, () => {
      expect(handoffsOf(f)).toHaveLength(1);
      expect(handoff.owner_queue).toBe(f.expect.queue);
      expect(run.assignedAt).toEqual({ status: 'assigned', ticket_id: 'tk-1' });
      expect(writes.tickets).toHaveLength(1);
      expect(writes.tickets[0]).toMatchObject({ entity_id: handoff.id, assigned_to_id: `om-${f.expect.queue}`, created_by_type: 'ai_staff' });
      const packet = handoff.evidence as Record<string, unknown>;
      for (const field of PACKET_FIELDS) {
        expect(packet).toHaveProperty(field);
        const v = packet[field] as { available?: unknown; reason?: unknown } | null;
        if (v && typeof v === 'object' && 'available' in v) expect(typeof v.reason).toBe('string');
      }
      expect(packet.brand_program_path).toMatchObject({ brand_slug: f.brand, path: f.classification?.primary_path });
      expect(packet.urgent).toMatchObject({ value: true });
      expect(JSON.stringify(packet)).not.toContain('@');
    });

    it(`a human accepts (the thread theirs, the AI paused) and dispositions qualified: ${f.expect.integration?.writes.join(' + ')}`, () => {
      const want = f.expect.integration!;
      expect(run.openAfterAccept).toBe(1);
      expect(disposition.status).toBe('dispositioned');
      expect(disposition.integration?.status).toBe('written');
      expect(disposition.integration?.writes).toEqual(want.writes);
      expect({ organizations: first.organizations, context_patches: first.context_patches, pipeline_advances: first.pipeline_advances, engagements: first.engagements, projects: first.projects }).toEqual({
        organizations: want.organizations, context_patches: want.context_patches, pipeline_advances: want.pipeline_advances, engagements: want.engagements, projects: want.projects,
      });
      expect(first.open_ownership).toBe(0);
      expect(first.open_handoffs).toBe(0);
      const types = T.outcomes.rows.map((r) => r.outcome_type).sort();
      expect(types).toEqual(['handoff_accepted', 'handoff_dispositioned', want.pipeline_advances ? 'opportunity_stage' : 'project_started'].sort());
    });

    it('the whole run, replayed: the decision and the handoff land on their rows, the human\'s moves are refused as moves already made - and every count is unchanged', async () => {
      const again = await decide(f, AS_OF_4);
      expect(again.replayed).toBe(true);
      expect(again.handoffs).toMatchObject({ status: 'materialized', handoffs: [{ handoff_id: handoff.id, replayed: true }] });
      await expect(acceptHandoff(handoff as never, HUMAN, AS_OF_4)).rejects.toBeInstanceOf(HandoffTransitionError);
      await expect(dispositionHandoff(handoff as never, { disposition: 'qualified', reason: 'again' }, HUMAN, AS_OF_4)).rejects.toBeInstanceOf(HandoffTransitionError);
      expect(tally()).toEqual(first);
    });
  });
}

/* ── a writer failing midway, and the retry ─────────────────────────────────── */

describe('exit, the retry path: a writer failing midway leaves the handoff accepted, and the retry finds what was written', () => {
  it('one organisation, one context patch, one pipeline advance - across a failed attempt and its retry', async () => {
    const [f] = exitTwins();
    f.classification = await classifyArrival(f);
    arrangeWorld([f], { asOf: AS_OF_4 });
    await decide(f, AS_OF_4);
    const [row] = handoffsOf(f) as Row[];
    await acceptHandoff(row as never, HUMAN, AS_OF_4);
    m4.advanceStage.mockRejectedValueOnce(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    await expect(dispositionHandoff(row as never, { disposition: 'qualified', reason: 'r' }, HUMAN, AS_OF_4)).rejects.toThrow('connection reset');
    expect(row.status).toBe('accepted');
    expect(T.ownership.rows.filter((r) => r.cleared_at === null)).toHaveLength(1);
    expect({ organizations: tally().organizations, context_patches: tally().context_patches, pipeline_advances: tally().pipeline_advances }).toEqual({ organizations: 1, context_patches: 1, pipeline_advances: 0 });

    const retry = await dispositionHandoff(row as never, { disposition: 'qualified', reason: 'r' }, HUMAN, AS_OF_4);
    expect(retry.integration?.ids).toMatchObject({ organization_created: false, context_created: false, context_updated: false, advanced: true });
    expect({ organizations: tally().organizations, context_patches: tally().context_patches, pipeline_advances: tally().pipeline_advances }).toEqual({ organizations: 1, context_patches: 1, pipeline_advances: 1 });
  });
});

/* ── one open handoff per subject per brand ──────────────────────────────────── */

/**
 * TWO indexes, and they are not interchangeable (the T414 verifier's finding): two deferrals of ONE
 * decision share `[subject_ref, brand_id, source, decision_id]`, so the second is collapsed by
 * `growth_journey_handoffs_idempotency_unique` - the partial `..._open_subject_unique` index never runs.
 * The rule the plan names ("one open handoff per subject per brand") is only exercised by a trigger
 * whose KEY differs while a row is open, which is what the second test here does.
 */
describe('one open handoff per subject per brand', () => {
  it('two deferrals of ONE decision share an idempotency key: the second lands on the first row (the idempotency index, not the partial one)', async () => {
    const f = twoTriggerSubject();
    arrangeWorld([f], { asOf: AS_OF_4 });
    const r = await decide(f, AS_OF_4);
    expect(r.handoffs.status).toBe('materialized');
    const made = (r.handoffs as { handoffs: Array<{ trigger: { owner_queue: string; source: string }; handoff_id: string; replayed: boolean }> }).handoffs;
    expect(made.map((h) => h.trigger.owner_queue)).toEqual(['sales', 'human_review']);
    // Both are decision deferrals, so both compute the SAME idempotency key - this is the index that collapses them.
    expect(made.map((h) => h.trigger.source)).toEqual(['decision_deferral', 'decision_deferral']);
    expect(made.map((h) => h.replayed)).toEqual([false, true]);
    expect(new Set(made.map((h) => h.handoff_id)).size).toBe(1);
    const open = handoffsOf(f).filter((h) => ['queued', 'assigned', 'accepted'].includes(String(h.status)));
    expect(open).toHaveLength(1);
    expect(open[0].owner_queue).toBe(f.expect.queue);
    // T501 (8A): the review the decision ALSO asked for is on the row, not only an overlay elsewhere in the packet.
    const triggers = (open[0].evidence as { escalation_reason: Array<{ source: string; queue: string; reason: string }> }).escalation_reason;
    expect(triggers.map((t) => [t.source, t.queue, t.reason])).toEqual([
      ['decision_deferral', 'sales', `commercial_state:${f.expect.state}`],
      ['decision_deferral', 'human_review', 'human_review_overlay'],
    ]);
    table.push(lineFor(f.key, open[0], '-'));
  });

  it('a DIFFERENTLY keyed trigger for the same subject while its row is open - an operator routing it by hand - is refused by the partial unique index and lands on the open row', async () => {
    const f = twoTriggerSubject();
    arrangeWorld([f], { asOf: AS_OF_4 });
    await decide(f, AS_OF_4);
    const [row] = handoffsOf(f) as Row[];
    const refs = {
      tenant_id: String(row.tenant_id), brand_id: String(row.brand_id), brand_slug: f.brand,
      program: { id: String(row.program_id), slug: programRow(f.brand).slug, kind: 'business' as const },
      subject_ref: String(row.subject_ref), lead_id: f.subject.lead_id, enrollment_id: null, path: null,
    };
    // A manual trigger: another source, another event - a different idempotency key by construction.
    const manual = await createHandoff({ refs, trigger: { source: 'manual', owner_queue: 'human_review', reason: 'routing_rule:rp-1', event_ref: 'rule:rp-1' }, decision: null, asOf: AS_OF_4 });
    expect(manual.replayed).toBe(true);
    expect(manual.row.id).toBe(row.id);
    expect(manual.row.owner_queue).toBe('sales'); // the OPEN row, not the queue the manual trigger asked for
    expect(handoffsOf(f)).toHaveLength(1);
    // T501 (8A): the operator's trigger is the row's third entry, with one ledger row saying so; replaying it adds nothing.
    const reasonsOf = () => (row.evidence as { escalation_reason: Array<{ reason: string }> }).escalation_reason.map((t) => t.reason);
    expect(reasonsOf()).toEqual([`commercial_state:${f.expect.state}`, 'human_review_overlay', 'routing_rule:rp-1']);
    const appended = () => m4.ledger.mock.calls.filter((c) => c[0] === 'growth_journey.handoff.trigger_appended' && c[2] === row.id).length;
    expect(appended()).toBe(2);
    await createHandoff({ refs, trigger: { source: 'manual', owner_queue: 'human_review', reason: 'routing_rule:rp-1', event_ref: 'rule:rp-1' }, decision: null, asOf: AS_OF_4 });
    expect(reasonsOf()).toHaveLength(3);
    expect(appended()).toBe(2);
    // Non-vacuity: the manual trigger's key really is different - the same key would have been collapsed by the
    // idempotency index instead, and once the open row is CLOSED the same trigger is free to make a new one.
    await (row as unknown as { update: (p: Record<string, unknown>) => Promise<unknown> }).update({ status: 'dispositioned' });
    const after = await createHandoff({ refs, trigger: { source: 'manual', owner_queue: 'human_review', reason: 'routing_rule:rp-1', event_ref: 'rule:rp-2' }, decision: null, asOf: AS_OF_4 });
    expect(after.replayed).toBe(false);
    expect(after.row.id).not.toBe(row.id);
    expect(after.row.owner_queue).toBe('human_review');
  });
});
