jest.mock('../../../models/PresentationAssignment', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findByPk: jest.fn() },
}));
jest.mock('../../../models/PresentationAttempt', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), create: jest.fn() },
}));
jest.mock('../../../models/RoomBooking', () => ({
  __esModule: true,
  default: { findByPk: jest.fn() },
}));

import PresentationAssignment from '../../../models/PresentationAssignment';
import PresentationAttempt from '../../../models/PresentationAttempt';
import RoomBooking from '../../../models/RoomBooking';
import { planSessionMap, commitSessionMap, SessionMapPlan } from '../presentationSessionMap';

const assignments = PresentationAssignment as unknown as { findAll: jest.Mock; findByPk: jest.Mock };
const attempts = PresentationAttempt as unknown as { findAll: jest.Mock; create: jest.Mock };
const bookings = RoomBooking as unknown as { findByPk: jest.Mock };

const NOW = Date.parse('2026-11-04T12:00:00Z');

const assignment = (over: Record<string, unknown> = {}) => ({
  id: 'as1', project_id: 'p1', story_id: 'PREP-6', cohort_id: 'c1', ...over,
});

function attemptRow(over: Record<string, unknown> = {}) {
  const r: Record<string, unknown> = {
    id: 'a1', assignment_id: 'as1', attempt_no: 1, mode: 'cohort_live', booking_id: null, ...over,
  };
  (r as any).update = jest.fn(async (patch: Record<string, unknown>) => { Object.assign(r, patch); return r; });
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  bookings.findByPk.mockResolvedValue({ id: 'b1', room_id: 'r1' });
  assignments.findAll.mockResolvedValue([assignment()]);
  assignments.findByPk.mockResolvedValue(assignment());
  attempts.findAll.mockResolvedValue([]);
  attempts.create.mockImplementation(async (v: Record<string, unknown>) => ({ ...v }));
});

const plan = () => planSessionMap({ cohortId: 'c1', storyId: 'PREP-6', bookingId: 'b1', nowMs: NOW });

describe('the dry run cannot write, by construction', () => {
  it('touches no mutator at all — not create, not update', async () => {
    const existing = attemptRow();
    attempts.findAll.mockResolvedValue([existing]);

    const p = await plan();

    expect(p.dry_run).toBe(true);
    expect(attempts.create).not.toHaveBeenCalled();
    expect((existing as any).update).not.toHaveBeenCalled();
  });

  it('lists the affected rows with a plain-English account of what would happen', async () => {
    const p = await plan();
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].outcome).toBe('will_map');
    expect(p.rows[0].actions.join(' ')).toMatch(/create cohort_live attempt/i);
    expect(p.summary.will_map).toBe(1);
  });

  it('reports a missing booking on every row instead of returning an empty plan', async () => {
    // An empty plan reads as "nothing to do". Forty blocked rows reads as "fix this".
    bookings.findByPk.mockResolvedValue(null);
    const p = await plan();
    expect(p.booking_exists).toBe(false);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].outcome).toBe('blocked_no_booking');
    expect(p.summary.blocked_no_booking).toBe(1);
  });

  it('adopts an existing unbooked attempt rather than minting a second one', async () => {
    attempts.findAll.mockResolvedValue([attemptRow({ id: 'a7', attempt_no: 7, booking_id: null })]);
    const p = await plan();
    expect(p.rows[0].attemptId).toBe('a7');
    expect(p.rows[0].actions.join(' ')).toMatch(/point existing attempt 7/i);
  });

  it('calls a move a remap, and says the recording stays put', async () => {
    attempts.findAll.mockResolvedValue([attemptRow({ id: 'a2', attempt_no: 2, booking_id: 'b-other' })]);
    const p = await plan();
    expect(p.rows[0].outcome).toBe('will_remap');
    expect(p.rows[0].currentBookingId).toBe('b-other');
    expect(p.rows[0].actions.join(' ')).toMatch(/recording already attached .* stays attached/i);
  });

  it('says already_mapped when the student is on this session, so a re-run is quiet', async () => {
    attempts.findAll.mockResolvedValue([attemptRow({ booking_id: 'b1' })]);
    const p = await plan();
    expect(p.rows[0].outcome).toBe('already_mapped');
    expect(p.summary.already_mapped).toBe(1);
  });

  it('reads every attempt in one query, not one per student', async () => {
    assignments.findAll.mockResolvedValue([assignment({ id: 'as1' }), assignment({ id: 'as2' }), assignment({ id: 'as3' })]);
    await plan();
    expect(attempts.findAll).toHaveBeenCalledTimes(1);
    expect(attempts.findAll.mock.calls[0][0].where.assignment_id).toEqual(['as1', 'as2', 'as3']);
  });
});

describe('commit re-verifies the plan it is handed', () => {
  const forged: SessionMapPlan = {
    dry_run: true, generated_at: '', booking_exists: true,
    bookingId: 'b1', cohortId: 'c1', storyId: 'PREP-6',
    rows: [{
      assignmentId: 'as-from-another-cohort', projectId: 'pX', storyId: 'PREP-6',
      cohortId: 'c1', attemptId: null, currentBookingId: null,
      outcome: 'will_map', actions: [], blocked_reason: null,
    }],
    summary: { will_map: 1, already_mapped: 0, will_remap: 0, blocked_no_booking: 0 },
  };

  it('refuses a row whose assignment really belongs to another cohort', async () => {
    // The plan comes back in as input. Trusting its own claim about the cohort would
    // let a forged row rebind a student in a cohort the instructor cannot touch.
    assignments.findByPk.mockResolvedValue(assignment({ id: 'as-from-another-cohort', cohort_id: 'c-OTHER' }));

    const r = await commitSessionMap({ plan: forged, actorId: 'admin1', nowMs: NOW });

    expect(r.summary).toEqual({ mapped: 0, skipped: 1, failed: 0 });
    expect(r.rows[0].detail).toMatch(/no longer matches this cohort/i);
    expect(attempts.create).not.toHaveBeenCalled();
  });

  it('refuses a row whose assignment is for a different task', async () => {
    assignments.findByPk.mockResolvedValue(assignment({ id: 'as-from-another-cohort', story_id: 'PREP-1' }));
    const r = await commitSessionMap({ plan: forged, actorId: 'admin1', nowMs: NOW });
    expect(r.summary.skipped).toBe(1);
    expect(attempts.create).not.toHaveBeenCalled();
  });

  it('skips every row when the booking vanished between plan and commit', async () => {
    bookings.findByPk.mockResolvedValue(null);
    const r = await commitSessionMap({ plan: forged, actorId: 'admin1', nowMs: NOW });
    expect(r.dry_run).toBe(false);
    expect(r.summary).toEqual({ mapped: 0, skipped: 1, failed: 0 });
    expect(assignments.findByPk).not.toHaveBeenCalled();
  });
});

describe('commit is safe to run twice', () => {
  const goodPlan = async (): Promise<SessionMapPlan> => plan();

  it('creates the attempt the first time and skips it the second', async () => {
    const p = await goodPlan();

    const first = await commitSessionMap({ plan: p, actorId: 'admin1', nowMs: NOW });
    expect(first.summary.mapped).toBe(1);
    expect(attempts.create).toHaveBeenCalledTimes(1);
    expect(attempts.create.mock.calls[0][0]).toMatchObject({
      assignment_id: 'as1', attempt_no: 1, mode: 'cohort_live', booking_id: 'b1', room_id: 'r1',
    });

    // Second run: the row now exists and is bound.
    attempts.findAll.mockResolvedValue([attemptRow({ booking_id: 'b1' })]);
    const second = await commitSessionMap({ plan: p, actorId: 'admin1', nowMs: NOW });
    expect(second.summary).toEqual({ mapped: 0, skipped: 1, failed: 0 });
    expect(attempts.create).toHaveBeenCalledTimes(1);
  });

  it('binds an existing unbooked attempt instead of creating a duplicate', async () => {
    const existing = attemptRow({ id: 'a7', attempt_no: 7, booking_id: null });
    attempts.findAll.mockResolvedValue([existing]);
    const p = await goodPlan();

    const r = await commitSessionMap({ plan: p, actorId: 'admin1', nowMs: NOW });

    expect(attempts.create).not.toHaveBeenCalled();
    expect((existing as any).update).toHaveBeenCalledWith({ booking_id: 'b1', room_id: 'r1' });
    expect(r.summary.mapped).toBe(1);
  });

  it('treats a racing unique violation as skipped, not failed', async () => {
    // Two instructors pressing the button at once is the index doing its job.
    const p = await goodPlan();
    attempts.create.mockRejectedValue(
      Object.assign(new Error('duplicate key value violates unique constraint "presentation_attempts_unique_try"'),
        { parent: { code: '23505' } }),
    );

    const r = await commitSessionMap({ plan: p, actorId: 'admin1', nowMs: NOW });

    expect(r.summary).toEqual({ mapped: 0, skipped: 1, failed: 0 });
    expect(r.rows[0].detail).toMatch(/concurrent map/i);
  });

  it('reports an unexpected database error as failed rather than swallowing it', async () => {
    const p = await goodPlan();
    attempts.create.mockRejectedValue(Object.assign(new Error('connection terminated'), { parent: { code: '08006' } }));

    const r = await commitSessionMap({ plan: p, actorId: 'admin1', nowMs: NOW });

    expect(r.summary).toEqual({ mapped: 0, skipped: 0, failed: 1 });
    expect(r.rows[0].detail).toMatch(/connection terminated/i);
  });
});
