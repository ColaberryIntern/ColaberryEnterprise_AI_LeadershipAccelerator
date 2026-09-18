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
jest.mock('../outcomes/nightlyOutcomesPass', () => ({ runOutcomesPass: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.outcomesPass(...a) }));
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
jest.mock('../../../modules/tenancy/tenantResolver', () => ({ resolveBrandBySlug: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.resolveBrandBySlug(...a) }));
jest.mock('../../pipelineService', () => ({ ...jest.requireActual('../../pipelineService'), advancePipelineStage: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.advanceStage(...a) }));
jest.mock('../../delivery/leadConversion', () => ({ convertLeadToClient: (...a: unknown[]) => require('./fixtures/phase4Harness').m4.convertLead(...a) }));

import { anchorOf4, AS_OF_4, arrangeWorld, clock, flags4, handoffsOf, lineFor, m4, printTable, T, tally, writes, type TableLine } from './fixtures/phase4Harness';
import { brandRow, counts } from './fixtures/phase3Fixtures';
import {
  flotationTrainingScenarios,
  fullQueueLearner,
  humanInThreadSubject,
  killSwitchSubject,
  learnerScenarios,
  oneSlotTwoSubjects,
  programmeScenarios,
  replyOnlySubject,
  samePersonTwoBrands,
  untrustedTextSubject,
  UNTRUSTED,
  type HandoffFixture,
} from './fixtures/phase4Fixtures';
import { sequelize } from '../../../config/database';
import { decideForSubjectAndRecord } from '../decisionService';
import { acceptHandoff, dispositionHandoff } from '../handoffs/dispositionService';
import { assignRankedQueue } from '../handoffs/handoffService';
import { recordReplyHandoff } from '../replyHandoffHook';
import { runScheduledShadowDecisions } from '../runShadowDecisionsNightly';

/**
 * T414 — §16 A–L at handoff level, each through the real Phase 4 modules in
 * `phase4Harness.ts`'s world. Every fixture STATES the queue it expects
 * (`phase4Fixtures.ts`); the demo table prints what each one became.
 */

const sqlSpy = jest.spyOn(sequelize, 'query').mockResolvedValue([] as never);
const HUMAN = { id: 'au-sales-7' };
const table: TableLine[] = [];
type Row = Record<string, unknown> & { id: string; status: string };
type Decided = Extract<Awaited<ReturnType<typeof decideForSubjectAndRecord>>, { status: 'recorded' }>;

async function decide(f: HandoffFixture, asOf: Date = clock.now): Promise<Decided> {
  clock.now = asOf;
  const r = await decideForSubjectAndRecord({ anchor: anchorOf4(f), brandId: brandRow(f.brand).id, trigger: 'nightly', flags: flags4(), asOf });
  if (r.status !== 'recorded') throw new Error(`${f.key}: ${r.status}`);
  return r;
}

const open = (rows: Array<Record<string, unknown>>) => rows.filter((r) => ['queued', 'assigned', 'accepted'].includes(String(r.status)));
const note = (f: HandoffFixture, integrations = '-') => table.push(lineFor(f.key, handoffsOf(f)[0] as Row | undefined, integrations));

/** The queue a fixture's decision handed it to - or null - and the row's state as the world holds it. */
async function handedTo(f: HandoffFixture): Promise<{ queue: string | null; decided: Decided }> {
  const decided = await decide(f, AS_OF_4);
  expect(decided.row.state_at_decision).toBe(f.expect.state);
  const rows = handoffsOf(f);
  expect(rows.length).toBeLessThanOrEqual(1);
  return { queue: rows[0] ? String(rows[0].owner_queue) : null, decided };
}

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterAll(() => {
  printTable('Phase 4 §16 A–L — fixture → queue → status → assigned → integrations', table);
  sqlSpy.mockRestore();
  jest.restoreAllMocks();
});

/* ── A / B: learners hand off through T404's learner deferral hook ──────────── */

describe('A/B: learners hand off through the learner deferral, and only with Explorer\'s evidence', () => {
  for (const f of learnerScenarios()) {
    it(`${f.key}: ${f.expect.state} → ${f.expect.queue ?? 'no handoff'}`, async () => {
      arrangeWorld([f]);
      const { queue } = await handedTo(f);
      expect(queue).toBe(f.expect.queue);
      note(f);
    });
  }

  it('A: a NEEDS_ALI reply reaches the ali queue through the reply-route hook - keyed on the message, so the same message twice is one row - and a NOT_INTERESTED reply hands nothing to anyone', async () => {
    const [, activating] = learnerScenarios();
    arrangeWorld([activating]);
    const leadId = activating.subject.lead_id as number;
    const first = await recordReplyHandoff({ leadId, replyClass: 'NEEDS_ALI', providerMessageId: 'pm-100' }, flags4(), AS_OF_4);
    const again = await recordReplyHandoff({ leadId, replyClass: 'NEEDS_ALI', providerMessageId: 'pm-100' }, flags4(), AS_OF_4);
    expect(first).toMatchObject({ status: 'recorded', owner_queue: 'ali', replayed: false, assignment: 'assigned' });
    expect(again).toMatchObject({ status: 'recorded', replayed: true });
    const rows = T.handoffs.rows.filter((r) => r.subject_ref === `lead:${leadId}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ owner_queue: 'ali', source: 'reply_route', brand_id: brandRow('colaberry-training').id });
    expect(await recordReplyHandoff({ leadId, replyClass: 'NOT_INTERESTED', providerMessageId: 'pm-101' }, flags4(), AS_OF_4)).toEqual({ status: 'no_handoff', reason: 'class_not_routed:NOT_INTERESTED' });
    table.push(lineFor(`${activating.key} + NEEDS_ALI reply`, rows[0] as Row, '-'));
  });
});

/* ── C / D / E: the queue follows the programme ──────────────────────────────── */

describe('C/D/E: the queue follows the programme, whatever the path inside it', () => {
  for (const f of programmeScenarios()) {
    it(`${f.key}: ${f.classification?.primary_path} at ${f.expect.state} → ${f.expect.queue}`, async () => {
      arrangeWorld([f]);
      const { queue } = await handedTo(f);
      expect(queue).toBe(f.expect.queue);
      note(f);
    });
  }
});

/* ── F: an AI Flotation training request never speaks for business training ── */

describe('F: an AI Flotation training request never becomes a sales handoff, and no packet speaks for business training', () => {
  for (const f of flotationTrainingScenarios()) {
    it(`${f.key} → ${f.expect.queue}, never sales, and the packet speaks for no business-training need`, async () => {
      arrangeWorld([f]);
      const { queue } = await handedTo(f);
      expect(queue).toBe(f.expect.queue);
      expect(T.handoffs.rows.some((r) => r.owner_queue === 'sales')).toBe(false);
      const packet = handoffsOf(f)[0].evidence as { brand_program_path: { path: string | null }; likely_need: unknown; talking_points: string[]; qualification_gaps: string[] };
      expect(packet.brand_program_path.path).toBeNull();
      expect(packet.likely_need).toEqual({ available: false, reason: 'no_path' });
      expect(packet.talking_points).toEqual([]);
      // The one place the family may appear is the gap that says the brand refused it.
      const refused = packet.qualification_gaps.filter((g) => g.startsWith('path_not_offered_by_brand:'));
      expect(refused).toEqual(f.classification?.primary_path ? [`path_not_offered_by_brand:${f.classification.primary_path}:explicit_deny`] : []);
      const rest = JSON.stringify({ ...packet, qualification_gaps: packet.qualification_gaps.filter((g) => !refused.includes(g)) });
      expect(rest).not.toMatch(/business_training|a team that can use AI in its own work|a first cohort date/);
      note(f);
    });
  }
});

/* ── G: a reply opens no human conversation by itself ────────────────────────── */

describe('G: a reply is the lead\'s act', () => {
  it('a subject whose only signal is a reply: human_conversation no, no ownership row, and one reply is not yet a person\'s time - no handoff', async () => {
    const f = replyOnlySubject();
    arrangeWorld([f]);
    const { queue, decided } = await handedTo(f);
    expect(T.communication.rows.filter((r) => r.direction === 'inbound')).toHaveLength(1); // non-vacuity: the reply IS in the log
    expect(decided.row.human_conversation).toBe('no');
    expect(T.ownership.rows).toHaveLength(0);
    expect(queue).toBe(f.expect.queue);
    note(f);
  });
});

/* ── H: one person, two brands ───────────────────────────────────────────────── */

describe('H: one person, two relationships - two independent handoffs, two ownership rows, never one', () => {
  it('Enterprise and Training each hand the same person to their own queue; accepting both opens one ownership row PER BRAND', async () => {
    const [ent, trn] = samePersonTwoBrands();
    arrangeWorld([ent, trn]);
    await decide(ent, AS_OF_4);
    await decide(trn, AS_OF_4);
    const [e] = handoffsOf(ent) as Row[];
    const [t] = handoffsOf(trn) as Row[];
    expect([e.owner_queue, t.owner_queue]).toEqual([ent.expect.queue, trn.expect.queue]);
    expect(e.id).not.toBe(t.id);
    await acceptHandoff(e as never, HUMAN, AS_OF_4);
    await acceptHandoff(t as never, { id: 'au-admissions-2' }, AS_OF_4);
    const owners = open(T.ownership.rows.map((r) => ({ ...r, status: r.cleared_at ? 'cleared' : 'accepted' })));
    expect(owners.map((r) => [r.lead_id, r.brand_id, r.owner_id]).sort()).toEqual(
      [[ent.subject.lead_id, brandRow('colaberry-enterprise').id, HUMAN.id], [trn.subject.lead_id, brandRow('colaberry-training').id, 'au-admissions-2']].sort(),
    );
    note(ent);
    note(trn);
  });

  it('a later decision for the same person in the same brand - new inputs, a NEW decision row - lands on the open handoff: still one open per brand', async () => {
    const [ent, trn] = samePersonTwoBrands();
    arrangeWorld([ent, trn]);
    const first = await decide(ent, AS_OF_4);
    ent.counts = counts({ inbound: { replied: 3, booked_meeting: 1 }, appointments: { scheduled: 1 } });
    const second = await decide(ent, AS_OF_4);
    expect(second.row.id).not.toBe(first.row.id); // non-vacuity: a different decision, a different idempotency key
    expect(second.handoffs).toMatchObject({ status: 'materialized', handoffs: [{ replayed: true }] });
    expect(open(handoffsOf(ent))).toHaveLength(1);
    await decide(trn, AS_OF_4);
    expect(open(T.handoffs.rows)).toHaveLength(2);
  });
});

/* ── I: capacity 1, two eligible - the urgent one first ─────────────────────── */

describe('I: two eligible handoffs, one slot - the urgent one is assigned, whichever was decided first', () => {
  it('through the nightly: the subject decided FIRST has no request in the window; the second booked a meeting - the second gets the slot', async () => {
    const [first, second] = oneSlotTwoSubjects();
    arrangeWorld([first, second], { capacity: { 'colaberry-enterprise/sales': 1 } });
    const r = await runScheduledShadowDecisions({ flags: flags4(), asOf: AS_OF_4 });
    expect(r.skipped).toBe(false);
    const [a] = handoffsOf(first) as Row[];
    const [b] = handoffsOf(second) as Row[];
    expect([a.urgent, b.urgent]).toEqual([false, true]);
    // Non-vacuity: the subject that lost the slot is worth MORE - urgency decided it, not value, not arrival.
    expect(Number(a.expected_value)).toBeGreaterThan(Number(b.expected_value));
    expect(b.status).toBe('assigned');
    expect(a).toMatchObject({ status: 'queued', assignment_blocked_reason: 'capacity_full' });
    expect(writes.tickets).toHaveLength(1);
    note(first);
    note(second);
  });
});

/* ── J: untrusted text never reaches a packet ───────────────────────────────── */

describe('J: untrusted text on the lead never reaches a packet a human reads', () => {
  it('the idea text and the company name are on the lead row; the packet carries neither - only has_company, counts and ids - and no address', async () => {
    const f = untrustedTextSubject();
    arrangeWorld([f]);
    await decide(f, AS_OF_4);
    const [row] = handoffsOf(f);
    const packet = JSON.stringify(row.evidence);
    for (const fragment of ['<script', 'alert(1)', 'DROP TABLE', 'ignore previous instructions', 'Robert', 'onerror']) expect(packet).not.toContain(fragment);
    expect(packet).not.toContain('@');
    expect(JSON.stringify(row)).not.toContain(UNTRUSTED.company);
    expect(row.qualification_gaps).not.toContain('firmographic:company'); // the company IS known - as a fact, not as text
    note(f);
  });
});

/* ── K: a human in the thread pauses; the kill switch blocks ────────────────── */

describe('K: a human in the thread pauses every commercial candidate; the kill switch blocks assignment and integration', () => {
  it('an admin\'s call two hours ago: human_conversation yes, derived and recorded as an ownership row, and the education email is withheld by name', async () => {
    const f = humanInThreadSubject();
    arrangeWorld([f]);
    const { decided, queue } = await handedTo(f);
    expect(decided.row.human_conversation).toBe('yes');
    expect(T.ownership.rows).toHaveLength(1);
    expect(T.ownership.rows[0]).toMatchObject({ lead_id: f.subject.lead_id, source: 'human_activity', owner_id: 'au-sales-7', cleared_at: null });
    expect(decided.row.candidates).toEqual([]);
    const withheld = (decided.row.eligibility as { not_emitted: Array<{ generator: string; reason: string }> }).not_emitted.filter((n) => n.reason === 'human_in_conversation');
    expect(withheld.map((n) => n.generator)).toEqual(['capabilityEducation']);
    expect(queue).toBe(f.expect.queue);
    note(f);
  });

  it('the kill switch thrown: the handoff is recorded but NOT assigned; thrown again at disposition, the verdict records and no existing system is written', async () => {
    const f = killSwitchSubject();
    arrangeWorld([f], { killSwitch: true });
    await decide(f, AS_OF_4);
    const [row] = handoffsOf(f) as Row[];
    expect(row).toMatchObject({ owner_queue: f.expect.queue, status: 'queued', assignment_blocked_reason: 'kill_switch_active' });
    expect(writes.tickets).toHaveLength(0);

    m4.killSwitch.mockResolvedValue(false);
    await assignRankedQueue({ brandId: brandRow(f.brand).id, ownerQueue: 'sales', flags: flags4(), asOf: AS_OF_4 });
    expect(row.status).toBe('assigned');
    await acceptHandoff(row as never, HUMAN, AS_OF_4);
    m4.killSwitch.mockResolvedValue(true);
    const d = await dispositionHandoff(row as never, { disposition: 'qualified', reason: 'r' }, HUMAN, AS_OF_4);
    expect(d.status).toBe('dispositioned');
    expect(d.integration).toMatchObject({ status: 'refused', reason: 'kill_switch_active', writes: [] });
    expect(row.integration_refused).toBe('kill_switch_active');
    const t = tally();
    expect([t.organizations, t.context_patches, t.pipeline_advances, t.engagements]).toEqual([0, 0, 0, 0]);
    expect(T.outcomes.rows.map((r) => r.outcome_type)).toContain('handoff_dispositioned');
    table.push(lineFor(f.key, row, 'refused:kill_switch_active'));
  });
});

/* ── L: a full queue ─────────────────────────────────────────────────────────── */

describe('L: capacity full suppresses CREATE_HUMAN_TASK, and the queue still records the handoff', () => {
  it('admissions has one slot and it was taken earlier today: the human task is suppressed by name, the handoff is queued with capacity_full', async () => {
    const f = fullQueueLearner();
    arrangeWorld([f], { capacity: { 'colaberry-training/admissions': 1 }, seedHandoffs: [{ brand: 'colaberry-training', queue: 'admissions', status: 'assigned', subject_ref: 'enrollment:taken-this-morning' }] });
    const { decided, queue } = await handedTo(f);
    expect(decided.row.sales_capacity).toBe('full');
    const suppressed = decided.row.suppressed as Array<{ action_type: string; reason: string }>;
    expect(suppressed.filter((s) => s.action_type === 'CREATE_HUMAN_TASK').map((s) => s.reason)).toEqual(['sales_capacity_full']);
    expect(queue).toBe(f.expect.queue);
    expect(handoffsOf(f)[0]).toMatchObject({ status: 'queued', assignment_blocked_reason: 'capacity_full' });
    note(f);
  });
});
