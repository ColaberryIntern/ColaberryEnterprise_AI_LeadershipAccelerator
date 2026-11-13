/**
 * D18 — a Colaberry Live setup failure has to reach the person who ticked the box.
 *
 * The sibling file (acceleratorService.liveOccurrence.test.ts) already proves the occurrence
 * side effect is non-fatal. That is exactly the problem this file exists for: "non-fatal" was
 * implemented as "swallowed". An admin ticked live, got a 201, and the class had no broadcast.
 * The only record was a console line in a container log.
 *
 * So the assertions here are deliberately about the RETURN VALUE, not the log. A test that
 * asserts on console.warn would still pass if the warning never left the function, which is
 * the precise bug being fixed.
 *
 * Four questions:
 *   1. does a refusal come back as a sentence?
 *   2. does a thrown error come back as a sentence?
 *   3. does a SUCCESS come back as null, so the surface has nothing to show?
 *   4. does the session still save in every one of those cases?
 *
 * (3) is the one that keeps this honest. Without it, `return 'something went wrong'`
 * unconditionally would pass the other three.
 */

const mockEnv = { communityRoomsEnabled: true };
jest.mock('../../config/env', () => ({ env: mockEnv }));

jest.spyOn(console, 'warn').mockImplementation(() => undefined);

jest.mock('../../models', () => ({
  __esModule: true,
  Cohort: {}, Enrollment: {}, AttendanceRecord: {}, AssignmentSubmission: {},
  Lead: {}, CampaignLead: {}, ScheduledEmail: {}, Subscription: {}, ProgramBlueprint: {},
  LiveSession: { create: jest.fn(), findByPk: jest.fn() },
}));

jest.mock('../communityRooms/roomService', () => ({
  ensureRoomForSession: jest.fn().mockResolvedValue({ id: 'room-1' }),
}));

const mockEnsureOccurrence = jest.fn();
const mockIsLiveEnabled = jest.fn();
jest.mock('../broadcast/broadcastSessionOccurrence', () => ({
  ensureOccurrenceForSession: (...a: any[]) => mockEnsureOccurrence(...a),
  isLiveEnabledForSession: (...a: any[]) => mockIsLiveEnabled(...a),
}));

import { LiveSession } from '../../models';
import { createSession, updateSession } from '../acceleratorService';

const liveSessionCreate = LiveSession.create as jest.Mock;
const liveSessionFindByPk = LiveSession.findByPk as jest.Mock;

const NEW_SESSION = {
  cohort_id: 'c1', session_number: 3, title: 'Week 3 Build Day',
  session_date: '2026-10-20', start_time: '09:00', end_time: '09:30',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.communityRoomsEnabled = true;
  mockIsLiveEnabled.mockResolvedValue(false);
  mockEnsureOccurrence.mockResolvedValue({ outcome: 'created', occurrenceId: 'occ-1' });
  liveSessionCreate.mockImplementation((d: any) => Promise.resolve({ id: 'session-1', ...d }));
  liveSessionFindByPk.mockResolvedValue({
    id: 'session-1', title: 'Week 3 Build Day',
    update: jest.fn().mockResolvedValue(undefined),
  });
});

describe('createSession — the live warning travels with the saved session', () => {
  it('reports a refusal, naming the machine-readable reason', async () => {
    mockEnsureOccurrence.mockResolvedValue({
      outcome: 'refused', occurrenceId: null, reason: 'no_live_input',
      detail: 'the cohort room has no Cloudflare input',
    });

    const session: any = await createSession(NEW_SESSION as any, { liveEnabled: true });

    // The session is still a real saved row. That part was never in doubt and must not change.
    expect(session).toEqual(expect.objectContaining({ id: 'session-1' }));
    expect(session.liveWarning).toContain('no_live_input');
    // The detail is the only part that tells the admin WHICH thing to go fix.
    expect(session.liveWarning).toContain('the cohort room has no Cloudflare input');
  });

  it('reports a thrown error rather than swallowing it', async () => {
    mockEnsureOccurrence.mockRejectedValue(new Error('broadcast tables missing'));

    const session: any = await createSession(NEW_SESSION as any, { liveEnabled: true });

    expect(session).toEqual(expect.objectContaining({ id: 'session-1' }));
    expect(typeof session.liveWarning).toBe('string');
    expect(session.liveWarning).toMatch(/Studio setup/);
    // The raw exception text is a developer artifact; it belongs in the structured log, not in
    // a sentence an admin reads. The log assertion is in the log test below.
    expect(session.liveWarning).not.toContain('broadcast tables missing');
  });

  it('reports NOTHING when the occurrence was created, so the surface stays quiet', async () => {
    const session: any = await createSession(NEW_SESSION as any, { liveEnabled: true });

    expect(session.liveWarning).toBeNull();
  });

  it('reports nothing when live was never asked for', async () => {
    const session: any = await createSession(NEW_SESSION as any);

    expect(session.liveWarning).toBeNull();
    expect(mockEnsureOccurrence).not.toHaveBeenCalled();
  });
});

describe('updateSession — the live warning travels with the saved edit', () => {
  it('reports a refusal raised while re-timing an already-live class', async () => {
    // This is the path nobody ticks a box for: the admin only changed the date. If the
    // re-timing is refused and says nothing, the class keeps its OLD start instant, which is
    // what the access decision and the preview window are both measured from.
    mockIsLiveEnabled.mockResolvedValue(true);
    mockEnsureOccurrence.mockResolvedValue({
      outcome: 'refused', occurrenceId: null, reason: 'undeterminable_start',
    });

    const session: any = await updateSession('session-1', { session_date: '2026-10-21' });

    expect(session).toEqual(expect.objectContaining({ id: 'session-1' }));
    expect(session.liveWarning).toContain('undeterminable_start');
  });

  it('reports nothing on a clean edit of a live class', async () => {
    mockIsLiveEnabled.mockResolvedValue(true);

    const session: any = await updateSession('session-1', { title: 'Renamed' });

    expect(session.liveWarning).toBeNull();
  });

  it('reports nothing for a class that is not live and never was', async () => {
    const session: any = await updateSession('session-1', { title: 'Renamed' });

    expect(session.liveWarning).toBeNull();
    expect(mockEnsureOccurrence).not.toHaveBeenCalled();
  });
});

describe('the structured log survives alongside the returned sentence', () => {
  // The sentence is for the admin; the log line is for whoever has to diagnose it later.
  // Returning the sentence must not have cost us the log, so both are asserted.
  it('logs the refusal reason as JSON with an error_class', async () => {
    mockEnsureOccurrence.mockResolvedValue({
      outcome: 'refused', occurrenceId: null, reason: 'no_room',
    });

    await createSession(NEW_SESSION as any, { liveEnabled: true });

    const lines = (console.warn as jest.Mock).mock.calls
      .map((c) => c[0])
      .filter((l) => typeof l === 'string' && l.startsWith('{'))
      .map((l) => JSON.parse(l));
    const refusal = lines.find((l) => l.event === 'live_occurrence_refused');
    expect(refusal).toBeDefined();
    expect(refusal.error_class).toBe('OccurrenceRefused');
    expect(refusal.context.sessionId).toBe('session-1');
    expect(refusal.context.reason).toBe('no_room');
  });

  it('logs a thrown error with the message the sentence deliberately omits', async () => {
    mockEnsureOccurrence.mockRejectedValue(new Error('broadcast tables missing'));

    await createSession(NEW_SESSION as any, { liveEnabled: true });

    const lines = (console.warn as jest.Mock).mock.calls
      .map((c) => c[0])
      .filter((l) => typeof l === 'string' && l.startsWith('{'))
      .map((l) => JSON.parse(l));
    const failure = lines.find((l) => l.event === 'live_occurrence_failed');
    expect(failure).toBeDefined();
    expect(failure.context.error).toBe('broadcast tables missing');
  });
});
