jest.mock('../../projects/projectReadService', () => ({ getOwnedProjectTree: jest.fn() }));
jest.mock('../../../models/PresentationAssignment', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));
jest.mock('../../../models/PresentationAttempt', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));
jest.mock('../../../models/RoomBooking', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), findAll: jest.fn() },
}));
// The session read now also looks up the learner's ingested takes, so the panel can
// offer a player. Default to none: these tests are about room resolution, and an
// attempt with no recording is the ordinary case before anyone rehearses.
jest.mock('../../../models/PresentationRecording', () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) },
}));
// Each take now reports whether its attempt is PUBLISHED, so the Practice panel can
// stop calling it private once the cohort can watch it. Mocked here for the reason
// `recordingsForAttempt` states in its own comment: this module reads through
// models, and the first version of that lookup used `sequelize.query` instead, which
// opened a real Postgres connection in this suite and failed four tests with
// `SequelizeConnectionRefusedError`.
jest.mock('../../../models/PresentationShowcase', () => ({
  __esModule: true,
  default: { findOne: jest.fn().mockResolvedValue(null) },
}));

import { getOwnedProjectTree } from '../../projects/projectReadService';
import PresentationAssignment from '../../../models/PresentationAssignment';
import PresentationAttempt from '../../../models/PresentationAttempt';
import PresentationRecording from '../../../models/PresentationRecording';
import PresentationShowcase from '../../../models/PresentationShowcase';
import RoomBooking from '../../../models/RoomBooking';
import { resolveSessionForAssignment, listSessionsForAssignment, recordingsForAttempt } from '../presentationSessionService';

const mockTree = getOwnedProjectTree as unknown as jest.Mock;
const assignments = PresentationAssignment as unknown as { findOne: jest.Mock };
const attempts = PresentationAttempt as unknown as { findAll: jest.Mock };
const recordings = PresentationRecording as unknown as { findAll: jest.Mock };
const showcases = PresentationShowcase as unknown as { findOne: jest.Mock };
const bookings = RoomBooking as unknown as { findByPk: jest.Mock; findAll: jest.Mock };

const attempt = (over: Record<string, unknown> = {}) => ({
  id: 'a1', assignment_id: 'as1', attempt_no: 1, mode: 'practice_solo',
  booking_id: null, room_id: null, attempt_state: 'draft', recording_state: 'expected',
  ...over,
});

const booking = (over: Record<string, unknown> = {}) => ({
  id: 'b1', room_id: 'r1', title: 'Practice run', state: 'scheduled',
  start_at: new Date('2026-11-04T19:00:00Z'), end_at: new Date('2026-11-04T19:30:00Z'),
  timezone: 'America/Chicago', meeting_link: 'https://zoom.us/j/123', recording_policy: 'always',
  related_project_id: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockTree.mockResolvedValue({ id: 'p1', name: 'Load Intake Agent', lists: [] });
  assignments.findOne.mockResolvedValue({ id: 'as1', project_id: 'p1', story_id: 'PREP-4' });
  attempts.findAll.mockResolvedValue([]);
  // `clearAllMocks` wipes the resolved values set in the module factories above, so
  // both are re-armed here rather than relying on the production code's `|| []`.
  recordings.findAll.mockResolvedValue([]);
  showcases.findOne.mockResolvedValue(null);
  bookings.findByPk.mockResolvedValue(null);
  bookings.findAll.mockResolvedValue([]);
});

describe('resolving the room a demo actually happens in', () => {
  it('a project that is not yours is indistinguishable from one that does not exist', async () => {
    mockTree.mockResolvedValue(null);
    const r = await resolveSessionForAssignment('e1', 'someone-elses', 'PREP-4');
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    // And nothing was read about the assignment on the way to finding that out —
    // a 404 that still queried the row would leak timing about whether it exists.
    expect(assignments.findOne).not.toHaveBeenCalled();
    expect(attempts.findAll).not.toHaveBeenCalled();
  });

  it('your task with nothing booked yet is a 200 with no session, not a 404', async () => {
    const r = await resolveSessionForAssignment('e1', 'p1', 'PREP-4');
    expect(r).toEqual({ ok: true, session: null });
  });

  it('resolves the highest attempt number carrying a booking, not the newest row', async () => {
    // Deliberately returned in DESC order the way the query asks for it, with the
    // high-numbered attempt unbooked: the answer must be attempt 2, not attempt 3.
    attempts.findAll.mockResolvedValue([
      attempt({ id: 'a3', attempt_no: 3, booking_id: null }),
      attempt({ id: 'a2', attempt_no: 2, booking_id: 'b1' }),
      attempt({ id: 'a1', attempt_no: 1, booking_id: 'b-old' }),
    ]);
    bookings.findByPk.mockResolvedValue(booking());

    const r = await resolveSessionForAssignment('e1', 'p1', 'PREP-4');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.session?.attemptId).toBe('a2');
    expect(r.session?.attemptNo).toBe(2);
    expect(bookings.findByPk).toHaveBeenCalledWith('b1');
  });

  it('NEVER puts a meeting URL in the payload — only whether one exists', async () => {
    // The whole point: entitlement is re-checked when the student asks to join. A URL
    // sitting in a page payload stays valid after access is revoked.
    attempts.findAll.mockResolvedValue([attempt({ booking_id: 'b1' })]);
    bookings.findByPk.mockResolvedValue(booking({ meeting_link: 'https://zoom.us/j/123' }));

    const r = await resolveSessionForAssignment('e1', 'p1', 'PREP-4');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.session?.meetingReady).toBe(true);

    const serialized = JSON.stringify(r.session);
    expect(serialized).not.toContain('zoom.us');
    expect(serialized).not.toContain('https://');
    for (const leak of ['meeting_link', 'join_url', 'joinUrl', 'start_url', 'startUrl']) {
      expect(Object.keys(r.session as object)).not.toContain(leak);
    }
  });

  it('meetingReady is false while the outbox has not provisioned the link yet', async () => {
    // createBooking returns BEFORE the link exists. A UI gating on the booking's
    // existence would render a dead join button for those seconds.
    attempts.findAll.mockResolvedValue([attempt({ booking_id: 'b1' })]);
    bookings.findByPk.mockResolvedValue(booking({ meeting_link: null }));

    const r = await resolveSessionForAssignment('e1', 'p1', 'PREP-4');
    if (!r.ok) return;
    expect(r.session?.meetingReady).toBe(false);
    expect(r.session?.bookingId).toBe('b1');
  });

  it('a booking belonging to another project is not rendered into this one', async () => {
    // Otherwise a mis-set booking_id leaks another project's room title and timing.
    attempts.findAll.mockResolvedValue([attempt({ booking_id: 'b1' })]);
    bookings.findByPk.mockResolvedValue(booking({ related_project_id: 'p-other', title: 'Someone elses demo' }));

    const r = await resolveSessionForAssignment('e1', 'p1', 'PREP-4');
    if (!r.ok) return;
    expect(r.session?.title).toBeNull();
    expect(r.session?.startAt).toBeNull();
    expect(JSON.stringify(r.session)).not.toContain('Someone elses demo');
  });

  it('a cohort booking that names no project at all is still rendered', async () => {
    // Only a MISMATCH is rejected. Demo day is one booking for forty students and
    // legitimately carries no related_project_id.
    attempts.findAll.mockResolvedValue([attempt({ booking_id: 'b1', mode: 'cohort_live' })]);
    bookings.findByPk.mockResolvedValue(booking({ related_project_id: null, title: 'Demo Day' }));

    const r = await resolveSessionForAssignment('e1', 'p1', 'PREP-4');
    if (!r.ok) return;
    expect(r.session?.title).toBe('Demo Day');
  });
});

describe('the attempt history list', () => {
  it('fetches every booking in one query rather than one per attempt', async () => {
    attempts.findAll.mockResolvedValue([
      attempt({ id: 'a3', attempt_no: 3, booking_id: 'b2' }),
      attempt({ id: 'a2', attempt_no: 2, booking_id: 'b1' }),
      attempt({ id: 'a1', attempt_no: 1, booking_id: 'b1' }),
    ]);
    bookings.findAll.mockResolvedValue([booking({ id: 'b1' }), booking({ id: 'b2', title: 'Second run' })]);

    const r = await listSessionsForAssignment('e1', 'p1', 'PREP-4');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sessions).toHaveLength(3);
    expect(bookings.findAll).toHaveBeenCalledTimes(1);
    expect(bookings.findByPk).not.toHaveBeenCalled();
    // Deduplicated: b1 is referenced twice but asked for once.
    expect(bookings.findAll.mock.calls[0][0].where.id).toEqual(['b2', 'b1']);
  });

  it('asks for no bookings at all when no attempt has one', async () => {
    attempts.findAll.mockResolvedValue([attempt({ booking_id: null })]);
    const r = await listSessionsForAssignment('e1', 'p1', 'PREP-4');
    if (!r.ok) return;
    expect(bookings.findAll).not.toHaveBeenCalled();
    expect(r.sessions[0].meetingReady).toBe(false);
  });

  it('is 404 for a foreign project, like every other read on this surface', async () => {
    mockTree.mockResolvedValue(null);
    const r = await listSessionsForAssignment('e1', 'nope', 'PREP-4');
    expect(r).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('a take knows whether it is published', () => {
  /**
   * Step 4 labels every take "Private - only you can see this". That assurance has
   * to follow the fact: once the learner publishes the attempt in Step 5 the cohort
   * can watch it, and a lock icon beside it is then a false promise rather than a
   * stale label. The flag is resolved here, server-side, because the showcase is
   * the only place that knows.
   */
  const take = { id: 'rec1', part_no: 1, created_at: new Date('2026-10-16T12:00:00Z') };
  const ticketFor = { enrollmentId: 'e1', projectId: 'p1', storyId: 'PREP-4' };

  it('is NOT published when no showcase exists', async () => {
    recordings.findAll.mockResolvedValue([take]);
    showcases.findOne.mockResolvedValue(null);
    const out = await recordingsForAttempt('a1', ticketFor);
    expect(out).toHaveLength(1);
    expect(out[0].published).toBe(false);
  });

  it('IS published when a live showcase exists', async () => {
    recordings.findAll.mockResolvedValue([take]);
    showcases.findOne.mockResolvedValue({ id: 's1' });
    const out = await recordingsForAttempt('a1', ticketFor);
    expect(out[0].published).toBe(true);
  });

  it('asks only about THIS attempt, published and not withdrawn', async () => {
    // A withdrawn demo really is private again, so `withdrawn_at` matters as much
    // as `published_at`. Dropping either half of this predicate makes the label
    // wrong in one direction or the other.
    recordings.findAll.mockResolvedValue([take]);
    await recordingsForAttempt('a1', ticketFor);
    const where = showcases.findOne.mock.calls[0][0].where;
    expect(where.attempt_id).toBe('a1');
    expect(where.withdrawn_at).toBeNull();
    expect(where.published_at).toBeDefined();
  });

  it('asks ONCE for the whole attempt, not once per take', async () => {
    // Publication is an attempt-level fact. A query per take would multiply the
    // round trips on exactly the rehearsals that have the most of them.
    recordings.findAll.mockResolvedValue([take, { ...take, id: 'rec2', part_no: 2 }]);
    const out = await recordingsForAttempt('a1', ticketFor);
    expect(out).toHaveLength(2);
    expect(showcases.findOne).toHaveBeenCalledTimes(1);
  });

  it('reads through the MODEL, never a raw connection', async () => {
    // The regression guard. A `sequelize.query` here opens a real Postgres
    // connection under this suite and takes four unrelated tests red; that is how
    // this flag first shipped.
    recordings.findAll.mockResolvedValue([take]);
    await recordingsForAttempt('a1', ticketFor);
    expect(showcases.findOne).toHaveBeenCalled();
  });
});
