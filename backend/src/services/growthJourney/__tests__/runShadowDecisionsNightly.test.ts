const m = {
  programFindAll: jest.fn(),
  runShadowDecisions: jest.fn(),
  assignRankedQueue: jest.fn(),
  runOutcomesPass: jest.fn(),
};
jest.mock('../../../models', () => ({ JourneyProgram: { findAll: (...a: unknown[]) => m.programFindAll(...a) } }));
jest.mock('../../../models/GrowthJourneyHandoff', () => ({ OWNER_QUEUES: ['admissions', 'sales', 'solution_architect', 'support', 'ali', 'human_review'] }));
jest.mock('../decisionService', () => ({ runShadowDecisions: (...a: unknown[]) => m.runShadowDecisions(...a) }));
jest.mock('../handoffs/handoffService', () => ({ assignRankedQueue: (...a: unknown[]) => m.assignRankedQueue(...a) }));
jest.mock('../outcomes/nightlyOutcomesPass', () => ({ runOutcomesPass: (...a: unknown[]) => m.runOutcomesPass(...a) }));
// The redactor, REAL but observed: every line the runner prints must have gone through it.
const redactForLogs = jest.fn((s: string) => jest.requireActual('../../../utils/piiRedaction').redactForLogs(s));
jest.mock('../../../utils/piiRedaction', () => ({ redactForLogs: (s: string) => redactForLogs(s) }));
// The process flags: everything off, the way production is. Every test that wants the job to run hands in its own.
jest.mock('../../../config/env', () => ({ env: { growthJourney: { growthJourneyEnabled: false, journeySignalIngest: false, journeyClassification: false, journeyDecisions: false, journeyHandoffs: false, journeyExecution: false } } }));

import type { GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { runScheduledShadowDecisions, SHADOW_DECISIONS_AGENT, SHADOW_DECISIONS_SCHEDULE } from '../runShadowDecisionsNightly';

/**
 * T408 - the nightly batch, behaviourally: the gate before any read, one
 * `runShadowDecisions` per programme (draft included), a brand's failure that
 * stops nothing, the assignment pass only under `journeyHandoffs`, and a
 * summary that is counts and never a subject ref.
 */

const AS_OF = new Date('2026-09-17T04:20:00Z');
const flags = (over: Partial<GrowthJourneyFlags> = {}): GrowthJourneyFlags => ({
  growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyDecisions: true, journeyHandoffs: false, journeyExecution: false, ...over,
});
const PROGRAMS = [
  { id: 'p-cpn', brand_id: 'b-cpn', slug: 'cpn-scholars', status: 'draft' },
  { id: 'p-tr', brand_id: 'b-training', slug: 'training-learners', status: 'draft' },
  { id: 'p-ent', brand_id: 'b-ent', slug: 'business-growth', status: 'draft' },
  { id: 'p-fl', brand_id: 'b-flotation', slug: 'flotation-projects', status: 'active' },
];
const ran = (over: Record<string, unknown> = {}) => ({
  status: 'ran', subjects: 3, recorded: 2, replayed: 1, skipped: [{ subject_ref: 'lead:501', status: 'unresolved' }], errors: [],
  handoffs: { disabled: 2, none: 0, materialized: 0, assigned: 0, queued: 0 }, ...over,
});
const OUTCOMES = { normalized: { leads: 2, created: 3, replayed: 1, unmapped: 1, failed: 0, no_brand: 0 }, sla: { scanned: 1, expired: 1, failed: 0 }, rates: { window_days: 30, handoffs: 4, accepted: 2, verdicts: 1, acceptance_rate: 0.5, expiry_rate: 0.25, connection_rate: null, meeting_rate: null, qualification_rate: 1, conversion_rate: 0, false_positive_handoff_rate: 0, time_to_accept_hours: null, by_queue: {} } };
const logged = () => (console.log as jest.Mock).mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  redactForLogs.mockClear();
  m.programFindAll.mockResolvedValue(PROGRAMS);
  m.runShadowDecisions.mockResolvedValue(ran());
  m.assignRankedQueue.mockResolvedValue([]);
  m.runOutcomesPass.mockResolvedValue(OUTCOMES);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the gate', () => {
  it('the process flags (everything off) skip the job before any model read - the default a cron tick sees', async () => {
    expect(await runScheduledShadowDecisions()).toEqual({ skipped: true, reason: 'journeyDecisions_off' });
    expect(m.programFindAll).not.toHaveBeenCalled();
    expect(m.runShadowDecisions).not.toHaveBeenCalled();
    expect(logged()).toEqual([]);
  });

  it('the master on but journeyDecisions off, or the master off with journeyDecisions on, both skip', async () => {
    expect(await runScheduledShadowDecisions({ flags: flags({ journeyDecisions: false }) })).toEqual({ skipped: true, reason: 'journeyDecisions_off' });
    expect(await runScheduledShadowDecisions({ flags: flags({ growthJourneyEnabled: false }) })).toEqual({ skipped: true, reason: 'journeyDecisions_off' });
    expect(m.programFindAll).not.toHaveBeenCalled();
  });

  it('names the agent and the schedule the scheduler and the registry use', () => {
    expect(SHADOW_DECISIONS_AGENT).toBe('GrowthJourneyShadowDecisions');
    expect(SHADOW_DECISIONS_SCHEDULE).toBe('20 4 * * *');
  });
});

describe('with the capability on', () => {
  it('reads every programme whose status is draft, active or paused - draft included - and runs one batch per brand with trigger nightly, the flags and the clock', async () => {
    const r = await runScheduledShadowDecisions({ flags: flags(), asOf: AS_OF, limit: 50 });
    expect(m.programFindAll).toHaveBeenCalledWith({ where: { status: ['draft', 'active', 'paused'] }, attributes: ['id', 'brand_id', 'slug', 'status'], order: [['slug', 'ASC']] });
    expect(m.runShadowDecisions).toHaveBeenCalledTimes(4);
    for (const p of PROGRAMS) expect(m.runShadowDecisions).toHaveBeenCalledWith({ brandId: p.brand_id, trigger: 'nightly', flags: flags(), asOf: AS_OF, limit: 50 });
    if (r.skipped) throw new Error('skipped');
    expect(r).toMatchObject({ skipped: false, as_of: AS_OF.toISOString(), brands: 4, ran: 4, failed: 0, subjects: 12, recorded: 8, replayed: 4, skipped_subjects: 4, errors: 0 });
    expect(r.per_brand.map((b) => [b.brand_id, b.program_status, b.status])).toEqual([['b-cpn', 'draft', 'ran'], ['b-training', 'draft', 'ran'], ['b-ent', 'draft', 'ran'], ['b-flotation', 'active', 'ran']]);
    expect(r.per_brand[0]).toMatchObject({ program_slug: 'cpn-scholars', subjects: 3, recorded: 2, replayed: 1, skipped: 1, errors: 0, handoffs: { disabled: 2 }, assignment: null });
  });

  it('a failure in one brand does not stop the others: the brand is recorded as failed with its error class, the run continues, nothing throws', async () => {
    m.runShadowDecisions.mockImplementation(async ({ brandId }: { brandId: string }) => {
      if (brandId === 'b-training') throw new Error('connection reset');
      return ran();
    });
    const r = await runScheduledShadowDecisions({ flags: flags(), asOf: AS_OF });
    if (r.skipped) throw new Error('skipped');
    expect(m.runShadowDecisions).toHaveBeenCalledTimes(4);
    expect(r).toMatchObject({ brands: 4, ran: 3, failed: 1, subjects: 9, recorded: 6 });
    expect(r.per_brand[1]).toMatchObject({ brand_id: 'b-training', status: 'failed', error_class: expect.any(String), subjects: 0, recorded: 0, assignment: null });
    expect(logged().some((l) => l.includes('growth_journey.nightly.brand_failed') && l.includes('b-training'))).toBe(true);
    expect(redactForLogs).toHaveBeenCalledTimes(2); // the failure line and the summary
  });

  it('a brand whose batch answers disabled is recorded as such and gets no assignment pass', async () => {
    m.runShadowDecisions.mockResolvedValue({ status: 'disabled', subjects: 0, recorded: 0, replayed: 0, skipped: [], errors: [], handoffs: { disabled: 0, none: 0, materialized: 0, assigned: 0, queued: 0 } });
    const r = await runScheduledShadowDecisions({ flags: flags({ journeyHandoffs: true }), asOf: AS_OF });
    if (r.skipped) throw new Error('skipped');
    expect(r.ran).toBe(0);
    expect(r.per_brand.every((b) => b.status === 'disabled' && b.assignment === null && b.outcomes === null)).toBe(true);
    expect(m.assignRankedQueue).not.toHaveBeenCalled();
    expect(m.runOutcomesPass).not.toHaveBeenCalled();
  });
});

describe('the assignment pass', () => {
  it('runs only under journeyHandoffs: with it off no queue is offered; with it on every one of the six queues per brand is, ranked, and the counts land on the summary', async () => {
    await runScheduledShadowDecisions({ flags: flags(), asOf: AS_OF });
    expect(m.assignRankedQueue).not.toHaveBeenCalled();
    m.assignRankedQueue.mockImplementation(async ({ ownerQueue }: { ownerQueue: string }) =>
      ownerQueue === 'sales' ? [{ handoff_id: 'h-1', assignment: { status: 'assigned' } }, { handoff_id: 'h-2', assignment: { status: 'queued', reason: 'capacity_full' } }] : [],
    );
    const on = flags({ journeyHandoffs: true });
    const r = await runScheduledShadowDecisions({ flags: on, asOf: AS_OF });
    if (r.skipped) throw new Error('skipped');
    expect(m.assignRankedQueue).toHaveBeenCalledTimes(24);
    for (const q of ['admissions', 'sales', 'solution_architect', 'support', 'ali', 'human_review']) {
      expect(m.assignRankedQueue).toHaveBeenCalledWith({ brandId: 'b-ent', ownerQueue: q, flags: on, asOf: AS_OF });
    }
    expect(r.per_brand[2].assignment).toEqual({ offered: 2, assigned: 1 });
  });

  it('a pass that THROWS is its own failure: the brand keeps its decision counts and status ran, the pass is recorded failed with its class, the next brand runs', async () => {
    m.assignRankedQueue.mockImplementation(async ({ brandId }: { brandId: string }) => {
      if (brandId === 'b-ent') throw new Error('policy read failed');
      return [];
    });
    const r = await runScheduledShadowDecisions({ flags: flags({ journeyHandoffs: true }), asOf: AS_OF });
    if (r.skipped) throw new Error('skipped');
    expect(r).toMatchObject({ brands: 4, ran: 4, failed: 0, recorded: 8 });
    expect(r.per_brand[2]).toMatchObject({ brand_id: 'b-ent', status: 'ran', recorded: 2, subjects: 3, assignment: { failed: true, error_class: expect.any(String) } });
    expect(r.per_brand[3].assignment).toEqual({ offered: 0, assigned: 0 });
    expect(logged().some((l) => l.includes('growth_journey.nightly.assignment_failed') && l.includes('b-ent'))).toBe(true);
  });

  it('the pass runs AFTER the brand\'s decisions, never before', async () => {
    const order: string[] = [];
    m.runShadowDecisions.mockImplementation(async ({ brandId }: { brandId: string }) => { order.push(`decide:${brandId}`); return ran(); });
    m.assignRankedQueue.mockImplementation(async ({ brandId, ownerQueue }: { brandId: string; ownerQueue: string }) => { if (ownerQueue === 'admissions') order.push(`assign:${brandId}`); return []; });
    m.runOutcomesPass.mockImplementation(async ({ brandId }: { brandId: string }) => { order.push(`outcomes:${brandId}`); return OUTCOMES; });
    await runScheduledShadowDecisions({ flags: flags({ journeyHandoffs: true }), asOf: AS_OF });
    expect(order).toEqual(['decide:b-cpn', 'assign:b-cpn', 'outcomes:b-cpn', 'decide:b-training', 'assign:b-training', 'outcomes:b-training', 'decide:b-ent', 'assign:b-ent', 'outcomes:b-ent', 'decide:b-flotation', 'assign:b-flotation', 'outcomes:b-flotation']);
  });
});

describe('the outcomes stage (T409)', () => {
  it('runs only under journeyHandoffs - with it off no brand gets one - and with it on once per ran brand, with the clock, after the assignment pass; its summary lands on the brand line', async () => {
    await runScheduledShadowDecisions({ flags: flags(), asOf: AS_OF });
    expect(m.runOutcomesPass).not.toHaveBeenCalled();
    const r = await runScheduledShadowDecisions({ flags: flags({ journeyHandoffs: true }), asOf: AS_OF });
    if (r.skipped) throw new Error('skipped');
    expect(m.runOutcomesPass).toHaveBeenCalledTimes(4);
    for (const p of PROGRAMS) expect(m.runOutcomesPass).toHaveBeenCalledWith({ brandId: p.brand_id, asOf: AS_OF });
    expect(r.per_brand.every((b) => b.outcomes === OUTCOMES)).toBe(true);
  });

  it('a brand whose decisions failed gets no outcomes stage; the others still do', async () => {
    m.runShadowDecisions.mockImplementation(async ({ brandId }: { brandId: string }) => { if (brandId === 'b-training') throw new Error('down'); return ran(); });
    const r = await runScheduledShadowDecisions({ flags: flags({ journeyHandoffs: true }), asOf: AS_OF });
    if (r.skipped) throw new Error('skipped');
    expect(m.runOutcomesPass).toHaveBeenCalledTimes(3);
    expect(r.per_brand[1]).toMatchObject({ brand_id: 'b-training', status: 'failed', outcomes: null });
    expect(r.per_brand[2].outcomes).toEqual(OUTCOMES);
  });

  it('the stage answering a failed domain is carried as such on the brand line, the brand itself still ran', async () => {
    m.runOutcomesPass.mockResolvedValue({ normalized: { failed: true, error_class: 'SequelizeDatabaseError' }, sla: { skipped: true, reason: 'kill_switch_active' }, rates: OUTCOMES.rates });
    const r = await runScheduledShadowDecisions({ flags: flags({ journeyHandoffs: true }), asOf: AS_OF });
    if (r.skipped) throw new Error('skipped');
    expect(r).toMatchObject({ ran: 4, failed: 0 });
    expect(r.per_brand[0].outcomes).toMatchObject({ normalized: { failed: true }, sla: { skipped: true } });
  });
});

describe('the summary is counts only', () => {
  it('one JSON line, through the redactor, with brand ids, programme slugs, statuses and numbers - and no subject ref and no @ even when the batch reported both', async () => {
    m.runShadowDecisions.mockResolvedValue(ran({ skipped: [{ subject_ref: 'lead:501', status: 'unresolved' }, { subject_ref: 'enrollment:enr-9', status: 'no_program' }], errors: [{ subject_ref: 'lead:77', error_class: 'UpstreamUnavailable' }] }));
    const r = await runScheduledShadowDecisions({ flags: flags(), asOf: AS_OF });
    if (r.skipped) throw new Error('skipped');
    const summary = logged().filter((l) => l.includes('growth_journey.nightly.summary'));
    expect(summary).toHaveLength(1);
    const parsed = JSON.parse(summary[0]);
    expect(parsed).toMatchObject({ service: 'growth-journey', level: 'info', brands: 4, ran: 4, failed: 0, subjects: 12, recorded: 8, replayed: 4, skipped_subjects: 8, errors: 4 });
    expect(parsed.per_brand).toHaveLength(4);
    expect(parsed.per_brand[0]).toEqual({ brand_id: 'b-cpn', program_slug: 'cpn-scholars', program_status: 'draft', status: 'ran', subjects: 3, recorded: 2, replayed: 1, skipped: 2, errors: 1, handoffs: { disabled: 2, none: 0, materialized: 0, assigned: 0, queued: 0 }, assignment: null, outcomes: null });
    expect(summary[0]).not.toMatch(/lead:|enrollment:|subject_ref|@/);
    // Every printed line went through the redactor - the summary and (below) a brand failure line alike.
    expect(redactForLogs).toHaveBeenCalledTimes(logged().length);
    expect(redactForLogs.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining([expect.stringContaining('growth_journey.nightly.summary')]));
    // The returned result carries the same counts and no refs either.
    expect(JSON.stringify(r)).not.toMatch(/lead:|enrollment:|subject_ref/);
  });

  it('with the outcomes stage on, the brand line carries its counts and rate values (nulls kept) and still no ref', async () => {
    await runScheduledShadowDecisions({ flags: flags({ journeyHandoffs: true }), asOf: AS_OF });
    const parsed = JSON.parse(logged().find((l) => l.includes('growth_journey.nightly.summary')) as string);
    expect(parsed.per_brand[0].outcomes).toEqual(OUTCOMES);
    expect(parsed.per_brand[0].outcomes.rates.connection_rate).toBeNull();
    expect(JSON.stringify(parsed)).not.toMatch(/lead:|enrollment:|subject_ref|@/);
  });
});
