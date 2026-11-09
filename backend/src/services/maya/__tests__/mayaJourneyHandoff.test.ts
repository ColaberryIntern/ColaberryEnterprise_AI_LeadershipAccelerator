import * as fs from 'fs';
import * as path from 'path';
import {
  createJourneyHandoff, handoffReasonLabel, HANDOFF_REASON_LABELS, type JourneyHandoffDeps,
} from '../mayaJourneyHandoff';
import { resolveGrowthJourneyFlags, type GrowthJourneyFlags } from '../../../config/growthJourneyFlags';

/**
 * M33 - create_journey_handoff. Acceptance:
 *   - a handoff is created server-side and confirmed (handoff:true only on created | already_open)
 *   - success is claimed only on confirmation; otherwise the caller falls back (handoff:false)
 *   - idempotent: the same handoff twice yields one
 *   - human ownership pauses the journey: covered by the governor test (M35), referenced in the acceptance registry
 * And M30 "Q1: A": the never-fired voice handoff is gone.
 */

const ON: GrowthJourneyFlags = resolveGrowthJourneyFlags({ GROWTH_JOURNEY_ENABLED: 'true', GROWTH_JOURNEY_HANDOFFS_ENABLED: 'true' });
const OFF: GrowthJourneyFlags = resolveGrowthJourneyFlags({});
const AS_OF = new Date('2026-11-09T15:00:00Z');

/** An in-memory writer with the real writer's idempotency: one row per event_ref while open. */
function store() {
  const rows = new Map<string, { id: string; status: string }>();
  const created: unknown[] = [];
  const assigned: unknown[] = [];
  const d: JourneyHandoffDeps = {
    EXPLORER_PROGRAM: { tenantSlug: 'colaberry', brandSlug: 'colaberry-training', programSlug: 'explorer' } as unknown as JourneyHandoffDeps['EXPLORER_PROGRAM'],
    resolveBrandBySlug: async () => ({ id: 'brand-1', tenant_id: 'ten-1', slug: 'colaberry-training' }),
    findProgram: async () => ({ id: 'prog-1', slug: 'explorer', kind: 'learner' }),
    resolveLeadId: async () => null,
    createHandoff: async (a) => {
      created.push(a);
      const key = a.trigger.event_ref as string;
      const existing = rows.get(key);
      if (existing) return { row: existing as never, replayed: true };
      const row = { id: `h-${rows.size + 1}`, status: 'queued' };
      rows.set(key, row);
      return { row: row as never, replayed: false };
    },
    assignHandoff: async (r) => { assigned.push(r); return { status: 'queued', reason: 'no_policy' }; },
  };
  return { d, rows, created, assigned };
}

let errSpy: jest.SpyInstance;
beforeEach(() => { errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

describe('createJourneyHandoff', () => {
  it('creates one admissions handoff with the reason code, keyed on reason, enrollment and Central day', async () => {
    const s = store();
    expect(await createJourneyHandoff('enr-9', 'maya_dm_seat_count', ON, AS_OF, s.d)).toEqual({ handoff: true, reason: 'created' });
    const arg = s.created[0] as { trigger: Record<string, unknown>; refs: Record<string, unknown> };
    expect(arg.trigger).toEqual({ source: 'manual', owner_queue: 'admissions', reason: 'maya_dm_seat_count', urgent_hint: false,
      event_ref: 'maya_dm_seat_count:enr-9:2026-11-09' });
    expect(arg.refs.subject_ref).toBe('enrollment:enr-9');
    expect(arg.refs.lead_id).toBeNull(); // a null lead is fine: the subject is the enrollment
    expect(s.assigned).toHaveLength(1);
  });

  it('the same handoff twice yields ONE row, and the second answer is already_open (still true)', async () => {
    const s = store();
    await createJourneyHandoff('enr-9', 'maya_dm_deadline', ON, AS_OF, s.d);
    expect(await createJourneyHandoff('enr-9', 'maya_dm_deadline', ON, AS_OF, s.d)).toEqual({ handoff: true, reason: 'already_open' });
    expect(s.rows.size).toBe(1);
    expect(s.assigned).toHaveLength(1); // assignment runs once, for the row that was created
  });

  it('handoffs off -> handoff false, and nothing is queried or written', async () => {
    const s = store();
    const spy = jest.spyOn(s.d, 'resolveBrandBySlug');
    expect(await createJourneyHandoff('enr-9', 'maya_dm_request', OFF, AS_OF, s.d)).toEqual({ handoff: false, reason: 'disabled' });
    expect(spy).not.toHaveBeenCalled();
    expect(s.created).toHaveLength(0);
  });

  it('writer throws -> unavailable, false, logged with the reason code; never claims success', async () => {
    const s = store();
    s.d.createHandoff = async () => { throw new Error('db down'); };
    expect(await createJourneyHandoff('enr-9', 'maya_dm_consent', ON, AS_OF, s.d)).toEqual({ handoff: false, reason: 'unavailable' });
    const log = JSON.parse(String(errSpy.mock.calls[0][0]));
    expect(log).toMatchObject({ event: 'maya_journey_handoff_failed', context: { reason_code: 'maya_dm_consent' } });
  });

  it('a replay onto a CLOSED row -> false (the person is told nothing that is not true)', async () => {
    const s = store();
    s.d.createHandoff = async () => ({ row: { id: 'h-1', status: 'closed' } as never, replayed: true });
    expect(await createJourneyHandoff('enr-9', 'maya_dm_request', ON, AS_OF, s.d)).toEqual({ handoff: false, reason: 'closed' });
  });

  it('an assignment failure keeps the answer true: the row exists and stays queued', async () => {
    const s = store();
    s.d.assignHandoff = async () => { throw new Error('policy table missing'); };
    expect(await createJourneyHandoff('enr-9', 'maya_dm_request', ON, AS_OF, s.d)).toEqual({ handoff: true, reason: 'created' });
  });

  it('every reason code has a plain-English label, and the tour code reads "Finished the whole tour"', () => {
    expect(handoffReasonLabel('campus_tour_opt_in')).toBe('Finished the whole tour');
    for (const label of Object.values(HANDOFF_REASON_LABELS)) expect(label).toMatch(/^[\x20-\x7E]+$/);
    expect(handoffReasonLabel('something_else')).toBe('something_else');
  });
});

describe('M30 "Q1: A": the voice handoff is retired', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'controllers', 'synthflowWebhookController.ts'), 'utf8');
  it('no longer enrolls leads into an executive_outreach campaign or stamps trigger_source maya_conversation', () => {
    expect(SRC).not.toMatch(/trigger_source:\s*'maya_conversation'/);
    expect(SRC).not.toMatch(/type:\s*'executive_outreach'/);
  });
  it('still cancels the old campaign and enrolls in Strategy Call Readiness (only the handoff was removed)', () => {
    expect(SRC).toMatch(/enrollLeadInSequence\(commLog\.lead_id, strategyCampaignId\)/);
  });
});
