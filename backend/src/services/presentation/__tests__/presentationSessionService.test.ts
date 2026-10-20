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
jest.mock('../../../models/PresentationRecordingView', () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../../../models/PresentationShowcase', () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) },
}));

import { getOwnedProjectTree } from '../../projects/projectReadService';
import PresentationAssignment from '../../../models/PresentationAssignment';
import PresentationAttempt from '../../../models/PresentationAttempt';
import PresentationRecording from '../../../models/PresentationRecording';
import PresentationShowcase from '../../../models/PresentationShowcase';
import PresentationRecordingView from '../../../models/PresentationRecordingView';
import RoomBooking from '../../../models/RoomBooking';
import { resolveSessionForAssignment, listSessionsForAssignment, recordingsForAttempt } from '../presentationSessionService';

const mockTree = getOwnedProjectTree as unknown as jest.Mock;
const assignments = PresentationAssignment as unknown as { findOne: jest.Mock };
const attempts = PresentationAttempt as unknown as { findAll: jest.Mock };
const recordings = PresentationRecording as unknown as { findAll: jest.Mock };
const showcases = PresentationShowcase as unknown as { findAll: jest.Mock };
const views = PresentationRecordingView as unknown as { findAll: jest.Mock };
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
  showcases.findAll.mockResolvedValue([]);
  views.findAll.mockResolvedValue([]);
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

describe('each take knows how far IT has got towards being public', () => {
  /**
   * Step 4 labelled every take "Private - only you can see this". That assurance has
   * to follow the fact, and it has to follow it PER TAKE.
   *
   * The showcase was keyed on the attempt until 2026-10-18, so publishing one take
   * marked every take from that booked room as published. Ali's PREP-4 attempt holds
   * three takes recorded across five days; a switch on the third would have flipped
   * the first two while appearing to flip one. These tests exist to keep the state
   * attached to the recording.
   *
   * THREE STATES, because the middle one is what a student misreads: having asked to
   * share, they must not believe it is already public, nor that nothing happened.
   */
  const takeA = { id: 'aaaaaaa1-1111-4111-8111-111111111111', part_no: 1, created_at: new Date('2026-10-12T18:00:00Z') };
  const takeB = { id: 'bbbbbbb2-2222-4222-8222-222222222222', part_no: 1, created_at: new Date('2026-10-17T17:00:00Z') };
  const ticketFor = { enrollmentId: 'e1', projectId: 'p1', storyId: 'PREP-4' };

  it('is PRIVATE when no showcase names it', async () => {
    recordings.findAll.mockResolvedValue([takeA]);
    showcases.findAll.mockResolvedValue([]);
    const out = await recordingsForAttempt('a1', ticketFor);
    expect(out[0].shareState).toBe('private');
    expect(out[0].showcaseId).toBeNull();
  });

  it('is PENDING when its showcase exists but is unpublished', async () => {
    recordings.findAll.mockResolvedValue([takeA]);
    showcases.findAll.mockResolvedValue([{ id: 's1', recording_id: 'aaaaaaa1-1111-4111-8111-111111111111', published_at: null }]);
    const out = await recordingsForAttempt('a1', ticketFor);
    expect(out[0].shareState).toBe('pending');
    expect(out[0].showcaseId).toBe('s1');
  });

  it('is PUBLISHED once its showcase carries a published_at', async () => {
    recordings.findAll.mockResolvedValue([takeA]);
    showcases.findAll.mockResolvedValue([{ id: 's1', recording_id: 'aaaaaaa1-1111-4111-8111-111111111111', published_at: new Date() }]);
    expect((await recordingsForAttempt('a1', ticketFor))[0].shareState).toBe('published');
  });

  it('THE SIBLING TAKE STAYS PRIVATE - the whole reason for this change', async () => {
    // Publishing take B must not mark take A as published. Under attempt-level
    // keying both came back published and the switch lied about two of three takes.
    recordings.findAll.mockResolvedValue([takeA, takeB]);
    showcases.findAll.mockResolvedValue([{ id: 's2', recording_id: 'bbbbbbb2-2222-4222-8222-222222222222', published_at: new Date() }]);

    const out = await recordingsForAttempt('a1', ticketFor);
    const byId = Object.fromEntries(out.map((t) => [t.id, t]));
    expect(byId['bbbbbbb2-2222-4222-8222-222222222222'].shareState).toBe('published');
    expect(byId['aaaaaaa1-1111-4111-8111-111111111111'].shareState).toBe('private');
    expect(byId['aaaaaaa1-1111-4111-8111-111111111111'].showcaseId).toBeNull();
  });

  it('ignores a legacy showcase with no recording_id rather than guessing', async () => {
    // Rows written before this change name no take. Attaching one to an arbitrary
    // recording would resurrect exactly the bug being fixed.
    recordings.findAll.mockResolvedValue([takeA]);
    showcases.findAll.mockResolvedValue([{ id: 'old', recording_id: null, published_at: new Date() }]);
    expect((await recordingsForAttempt('a1', ticketFor))[0].shareState).toBe('private');
  });

  it('asks ONCE for the attempt, not once per take', async () => {
    recordings.findAll.mockResolvedValue([takeA, takeB]);
    await recordingsForAttempt('a1', ticketFor);
    expect(showcases.findAll).toHaveBeenCalledTimes(1);
    expect(views.findAll).toHaveBeenCalledTimes(1);
  });

  it('scopes to LIVE showcases, because a withdrawn take is private again', async () => {
    recordings.findAll.mockResolvedValue([takeA]);
    await recordingsForAttempt('a1', ticketFor);
    expect(showcases.findAll.mock.calls[0][0].where.withdrawn_at).toBeNull();
  });

  it('reads published_at, or it could never tell pending from published', async () => {
    recordings.findAll.mockResolvedValue([takeA]);
    await recordingsForAttempt('a1', ticketFor);
    expect(showcases.findAll.mock.calls[0][0].attributes).toContain('published_at');
    expect(showcases.findAll.mock.calls[0][0].attributes).toContain('recording_id');
  });

  it('carries a view label for every take, so the page never renders a blank', async () => {
    recordings.findAll.mockResolvedValue([takeA]);
    const out = await recordingsForAttempt('a1', ticketFor);
    expect(out[0].viewCount).toBe(0);
    expect(out[0].viewLabel).toBe('No views yet');
  });

  it('reads through the MODEL, never a raw connection', async () => {
    recordings.findAll.mockResolvedValue([takeA]);
    await recordingsForAttempt('a1', ticketFor);
    expect(showcases.findAll).toHaveBeenCalled();
  });
});

describe('each take carries a poster, not just a player', () => {
  /**
   * The Practice panel rendered black rectangles for days while the thumbnail
   * route and the frame-scoring both already existed. They were wired to the
   * community card and not to the page a learner actually reviews their takes on
   * — the same "correct unit, unchecked wiring" shape as the resolver with no
   * callers and the feed DTO that never carried `ritual_meta`.
   *
   * So these assert the URLs, which is the part that was missing.
   */
  const take = { id: 'aaaaaaa1-1111-4111-8111-111111111111', part_no: 1, created_at: new Date() };
  const ticketFor = { enrollmentId: 'e1', projectId: 'p1', storyId: 'PREP-4' };

  it('offers a thumbnail url beside the playback url', async () => {
    recordings.findAll.mockResolvedValue([take]);
    const out = await recordingsForAttempt('a1', ticketFor);
    expect(out[0].playbackUrl).toContain('/recordings/' + take.id + '/file?t=');
    expect(out[0].thumbnailUrl).toContain('/recordings/' + take.id + '/thumbnail?t=');
  });

  it('does NOT produce /file/thumbnail — the base ends at the recording', async () => {
    // The bug in the first version of this fix. Both leaves hang off the
    // recording, and a base that already ended in `/file` produced a 404 path.
    recordings.findAll.mockResolvedValue([take]);
    const out = await recordingsForAttempt('a1', ticketFor);
    expect(out[0].thumbnailUrl).not.toContain('/file/');
    expect(out[0].playbackUrl).not.toContain('/file/file');
  });

  it('both urls carry a ticket, because neither can send a bearer', async () => {
    recordings.findAll.mockResolvedValue([take]);
    const out = await recordingsForAttempt('a1', ticketFor);
    expect(out[0].playbackUrl).toMatch(/\?t=.+/);
    expect(out[0].thumbnailUrl).toMatch(/\?t=.+/);
  });

  it('emits empty urls rather than unsigned ones when no viewer is given', async () => {
    // A caller that did not pass `ticketFor` must not get a URL that would 404 or,
    // worse, look like it should work without authority.
    recordings.findAll.mockResolvedValue([take]);
    const out = await recordingsForAttempt('a1');
    expect(out[0].playbackUrl).toBe('');
    expect(out[0].thumbnailUrl).toBe('');
  });
});
