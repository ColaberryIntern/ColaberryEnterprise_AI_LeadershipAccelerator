/**
 * C7: the Explorer tour's opt-in handoff. The answer is exactly what the writer returned; the capability check comes before any
 * query; assignment failure after a successful create keeps the answer true; nothing written means unavailable.
 */
import { requestTourHandoff, centralDate, TourHandoffDeps } from '../campusTourHandoff';
import type { GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { resolveGrowthJourneyFlags } from '../../../config/growthJourneyFlags';

const ON: GrowthJourneyFlags = resolveGrowthJourneyFlags({ GROWTH_JOURNEY_ENABLED: 'true', GROWTH_JOURNEY_HANDOFFS_ENABLED: 'true' });
const MASTER_ONLY: GrowthJourneyFlags = resolveGrowthJourneyFlags({ GROWTH_JOURNEY_ENABLED: 'true' });
const OFF: GrowthJourneyFlags = resolveGrowthJourneyFlags({});
const AS_OF = new Date('2026-10-19T15:00:00Z');

type Calls = { create: unknown[]; assign: unknown[]; brand: number; lead: string[] };
function deps(over: Partial<TourHandoffDeps> = {}, row: { status: string } = { status: 'queued' }, replayed = false): { d: TourHandoffDeps; calls: Calls } {
  const calls: Calls = { create: [], assign: [], brand: 0, lead: [] };
  const d: TourHandoffDeps = {
    EXPLORER_PROGRAM: { tenantSlug: 'colaberry', brandSlug: 'colaberry-training', programSlug: 'explorer' } as unknown as TourHandoffDeps['EXPLORER_PROGRAM'],
    resolveBrandBySlug: async () => { calls.brand += 1; return { id: 'brand-1', tenant_id: 'ten-1', slug: 'colaberry-training' }; },
    findProgram: async () => ({ id: 'prog-1', slug: 'explorer', kind: 'learner' }),
    resolveLeadId: async (id) => { calls.lead.push(id); return 42; },
    createHandoff: async (a) => { calls.create.push(a); return { row: { id: 'h-1', ...row } as never, replayed }; },
    assignHandoff: async (r) => { calls.assign.push(r); return { status: 'queued', reason: 'no_policy' }; },
    ...over,
  };
  return { d, calls };
}

let errSpy: jest.SpyInstance;
beforeEach(() => { errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

describe('capability gate', () => {
  it.each([['both flags off', OFF], ['only the master flag', MASTER_ONLY]])('%s -> disabled, no dependency touched', async (_n, flags) => {
    const { d, calls } = deps();
    expect(await requestTourHandoff('enr-7', flags, AS_OF, d)).toEqual({ handoff: false, reason: 'disabled' });
    expect(calls).toEqual({ create: [], assign: [], brand: 0, lead: [] });
  });
});

describe('what is written', () => {
  it('one admissions handoff for the enrollment, consent recorded as the reason, keyed on the Central day', async () => {
    const { d, calls } = deps();
    expect(await requestTourHandoff('enr-7', ON, AS_OF, d)).toEqual({ handoff: true, reason: 'created' });
    expect(calls.create).toEqual([{
      refs: { tenant_id: 'ten-1', brand_id: 'brand-1', brand_slug: 'colaberry-training', program: { id: 'prog-1', slug: 'explorer', kind: 'learner' },
        subject_ref: 'enrollment:enr-7', lead_id: 42, enrollment_id: 'enr-7', path: null },
      trigger: { source: 'manual', owner_queue: 'admissions', reason: 'campus_tour_opt_in', urgent_hint: false, event_ref: 'campus_tour_opt_in:enr-7:2026-10-19' },
      decision: null,
      asOf: AS_OF,
    }]);
    expect(calls.lead).toEqual(['enr-7']);
    expect(calls.assign).toHaveLength(1);
    expect(JSON.stringify(calls.create)).not.toMatch(/@/); // never an address
  });

  it('no matching lead: written with lead_id null', async () => {
    const { d, calls } = deps({ resolveLeadId: async () => null });
    expect((await requestTourHandoff('enr-7', ON, AS_OF, d)).handoff).toBe(true);
    expect((calls.create[0] as { refs: { lead_id: unknown } }).refs.lead_id).toBeNull();
  });

  it('a 23:30 Central click still counts for that Central day', () => {
    expect(centralDate(new Date('2026-10-20T04:30:00Z'))).toBe('2026-10-19'); // 23:30 CDT on the 19th
    expect(centralDate(new Date('2026-10-20T05:30:00Z'))).toBe('2026-10-20');
  });
});

describe('never throws', () => {
  it('a writer module that fails to load -> unavailable, logged, not a rejected promise', async () => {
    let fn: typeof requestTourHandoff = requestTourHandoff;
    jest.isolateModules(() => {
      jest.doMock('../../growthJourney/explorerProgramBridge', () => { throw new Error('module failed to load'); });
      fn = require('../campusTourHandoff').requestTourHandoff;
    });
    await expect(fn('enr-7', ON, AS_OF)).resolves.toEqual({ handoff: false, reason: 'unavailable' });
    expect(JSON.parse(String(errSpy.mock.calls[0][0])).event).toBe('campus_tour_handoff_failed');
  });
});

describe('the answer is what the writer returned', () => {
  it('replayed onto an open row -> already_open, true, no second assignment', async () => {
    const { d, calls } = deps({}, { status: 'assigned' }, true);
    expect(await requestTourHandoff('enr-7', ON, AS_OF, d)).toEqual({ handoff: true, reason: 'already_open' });
    expect(calls.assign).toHaveLength(0);
  });

  it.each(['dispositioned', 'returned_to_ai', 'expired', 'cancelled'])('replayed onto a %s row -> closed, false', async (status) => {
    const { d } = deps({}, { status }, true);
    expect(await requestTourHandoff('enr-7', ON, AS_OF, d)).toEqual({ handoff: false, reason: 'closed' });
  });

  it('assignment throws after a successful create -> still true (the row exists), logged', async () => {
    const { d } = deps({ assignHandoff: async () => { throw new Error('policy read failed'); } });
    expect(await requestTourHandoff('enr-7', ON, AS_OF, d)).toEqual({ handoff: true, reason: 'created' });
    expect(errSpy.mock.calls.map((c) => JSON.parse(String(c[0])).event)).toEqual(['campus_tour_handoff_assign_failed']);
  });

  it('brand absent -> unavailable, the writer never called', async () => {
    const { d, calls } = deps({ resolveBrandBySlug: async () => null });
    expect(await requestTourHandoff('enr-7', ON, AS_OF, d)).toEqual({ handoff: false, reason: 'unavailable' });
    expect(calls.create).toEqual([]);
  });

  it.each([
    ['the writer throws', { createHandoff: async () => { throw Object.assign(new Error('timeout'), { name: 'SequelizeConnectionError' }); } }],
    ['the lead lookup throws', { resolveLeadId: async () => { throw new Error('db'); } }],
  ])('%s -> unavailable, logged with an error class, never thrown', async (_n, over) => {
    const { d } = deps(over as Partial<TourHandoffDeps>);
    expect(await requestTourHandoff('enr-7', ON, AS_OF, d)).toEqual({ handoff: false, reason: 'unavailable' });
    const log = JSON.parse(String(errSpy.mock.calls[0][0]));
    expect(log).toMatchObject({ event: 'campus_tour_handoff_failed', outcome: 'failure', context: { enrollment_id: 'enr-7' } });
    expect(typeof log.error_class).toBe('string');
  });
});
