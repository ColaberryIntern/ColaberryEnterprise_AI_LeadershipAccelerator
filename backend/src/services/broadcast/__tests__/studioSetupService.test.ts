/**
 * Studio setup (D4) — the configuration a class needs before it can air.
 *
 * The cases that matter here are the REFUSALS. Every one of them is something an operator can
 * ask for and must be told about in a sentence, and one of them — the access mode — is a
 * decision with no undo anywhere in the product. A silently-dropped change here is worse than
 * an error, because the operator walks away believing the broadcast is configured.
 */
const mockFindByPk = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../../../models/LiveSession', () => ({
  __esModule: true,
  default: {
    findByPk: (...a: unknown[]) => mockFindByPk(...a),
    update: (...a: unknown[]) => mockUpdate(...a),
  },
}));

const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));

const mockEnsure = jest.fn();
jest.mock('../broadcastSessionOccurrence', () => ({
  ensureOccurrenceForSession: (...a: unknown[]) => mockEnsure(...a),
}));

const mockResolveRoom = jest.fn();
jest.mock('../../acceleratorService', () => ({
  resolveRoomId: (...a: unknown[]) => mockResolveRoom(...a),
}));

import { readStudioConfig, writeStudioConfig } from '../studioSetupService';

const S = '11111111-1111-4111-8111-111111111111';
const P1 = 'aaaaaaaa-1111-4111-8111-111111111111';
const P2 = 'bbbbbbbb-2222-4222-8222-222222222222';

const sessionRow = (over: Record<string, unknown> = {}) => {
  const base: Record<string, unknown> = {
    id: S,
    title: 'Architecture day, week 3',
    cohort_id: 'cohort-1',
    session_date: '2026-11-19',
    start_time: '14:00',
    end_time: '16:00',
    presenter_enrollment_id: null,
    producer_enrollment_id: null,
    guest_access: null,
    ...over,
  };
  return { get: (k: string) => base[k] };
};

/** No occurrence linked to this session. */
const noOccurrence = () => mockQuery.mockResolvedValue([[]]);
/** One occurrence linked, with whatever fields the case needs. */
const withOccurrence = (over: Record<string, unknown> = {}) => mockQuery.mockResolvedValue([[{
  id: 'occ-1', access_mode: 'private', editorial_state: 'scheduled', version: 3,
  provider_session_id: 'live-input-1', ...over,
}]]);

beforeEach(() => {
  jest.clearAllMocks();
  mockFindByPk.mockResolvedValue(sessionRow());
  mockResolveRoom.mockResolvedValue('room-1');
  mockEnsure.mockResolvedValue({ outcome: 'created', occurrenceId: 'occ-new' });
  noOccurrence();
});

describe('readStudioConfig — everything the screen needs, from an id alone', () => {
  it('returns null for a session that does not exist', async () => {
    mockFindByPk.mockResolvedValue(null);
    expect(await readStudioConfig(S)).toBeNull();
  });

  /**
   * The screen opens in its own browser tab, so it starts with no in-app state whatsoever. A
   * field missing from this payload is a field the screen cannot render, and the deep link is
   * broken for it. This asserts the shape rather than any one value.
   */
  it('returns every field the screen renders', async () => {
    const c = await readStudioConfig(S);
    expect(Object.keys(c!.session).sort()).toEqual(
      ['cohort_id', 'end_time', 'id', 'session_date', 'start_time', 'title'],
    );
    expect(c).toHaveProperty('presenter_enrollment_id');
    expect(c).toHaveProperty('producer_enrollment_id');
    expect(c).toHaveProperty('guest_access');
    expect(c).toHaveProperty('occurrence');
    expect(c).toHaveProperty('canSetAccessMode');
  });

  it('says the access mode is still choosable when no broadcast exists', async () => {
    const c = await readStudioConfig(S);
    expect(c!.occurrence).toBeNull();
    expect(c!.canSetAccessMode).toBe(true);
  });

  it('says it is NOT choosable once a broadcast exists', async () => {
    withOccurrence();
    const c = await readStudioConfig(S);
    expect(c!.canSetAccessMode).toBe(false);
    expect(c!.occurrence!.version).toBe(3);
  });

  it('surfaces a null provider_session_id rather than hiding it', async () => {
    // The 20 October finding: an occurrence can be real, private, correctly timed and
    // unplayable. A screen that does not carry this field cannot warn anybody.
    withOccurrence({ provider_session_id: null });
    const c = await readStudioConfig(S);
    expect(c!.occurrence!.provider_session_id).toBeNull();
  });
});

describe('writeStudioConfig — the refusals', () => {
  it('refuses a producer who is also the presenter', async () => {
    const r = await writeStudioConfig(S, { presenter_enrollment_id: P1, producer_enrollment_id: P1 });
    expect(r).toMatchObject({ ok: false, refusal: 'producer_is_presenter' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  /**
   * The rule is resolved against what the write WOULD LEAVE BEHIND, not against the body alone.
   * Sending only one of the two fields must not sneak past by leaving the other unmentioned —
   * which is exactly how a half-filled form would arrive.
   */
  it('refuses when only the producer is sent and it collides with the stored presenter', async () => {
    mockFindByPk.mockResolvedValue(sessionRow({ presenter_enrollment_id: P1 }));
    const r = await writeStudioConfig(S, { producer_enrollment_id: P1 });
    expect(r).toMatchObject({ ok: false, refusal: 'producer_is_presenter' });
  });

  it('allows a producer who is a different person', async () => {
    const r = await writeStudioConfig(S, { presenter_enrollment_id: P1, producer_enrollment_id: P2 });
    expect(r.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('refuses to change the access mode once a broadcast exists', async () => {
    withOccurrence({ access_mode: 'private' });
    const r = await writeStudioConfig(S, { access_mode: 'free' });
    expect(r).toMatchObject({ ok: false, refusal: 'access_mode_is_permanent' });
  });

  it('accepts a no-op resend of the same access mode', async () => {
    // A form that re-sends every field must not be punished for repeating what is already true.
    withOccurrence({ access_mode: 'paid' });
    const r = await writeStudioConfig(S, { access_mode: 'paid' });
    expect(r.ok).toBe(true);
  });

  it('refuses a stale version rather than overwriting another tab', async () => {
    withOccurrence({ version: 7 });
    const r = await writeStudioConfig(S, { guest_access: true, expected_version: 3 });
    expect(r).toMatchObject({ ok: false, refusal: 'version_conflict' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns null-ish for a session that does not exist', async () => {
    mockFindByPk.mockResolvedValue(null);
    const r = await writeStudioConfig(S, { guest_access: true });
    expect(r).toEqual({ ok: false });
  });
});

describe('writeStudioConfig — creating the broadcast', () => {
  it('passes the chosen access mode to creation', async () => {
    await writeStudioConfig(S, { access_mode: 'preview', create: true });
    expect(mockEnsure).toHaveBeenCalledWith(expect.anything(), 'room-1', 'preview');
  });

  it('defaults to the most restrictive mode when none was chosen', async () => {
    await writeStudioConfig(S, { create: true });
    expect(mockEnsure).toHaveBeenCalledWith(expect.anything(), 'room-1', 'private');
  });

  /**
   * Every refusal `ensureOccurrenceForSession` can produce has to reach the operator. These are
   * the five the union declares; a sixth added later without a sentence would be a silent 500.
   */
  it.each(['no_room', 'undeterminable_start', 'already_aired', 'cancelled', 'no_live_input'])(
    'surfaces the %s refusal instead of swallowing it',
    async (reason) => {
      mockEnsure.mockResolvedValue({ outcome: 'refused', occurrenceId: null, reason });
      const r = await writeStudioConfig(S, { create: true });
      expect(r).toMatchObject({ ok: false, refusal: reason });
    },
  );

  it('keeps the saved configuration when creation is refused', async () => {
    // An operator who fixes the room and presses Create again should not have to re-enter
    // everything they already typed.
    mockEnsure.mockResolvedValue({ outcome: 'refused', occurrenceId: null, reason: 'no_room' });
    const r = await writeStudioConfig(S, { guest_access: true, create: true });
    expect(mockUpdate).toHaveBeenCalled();
    expect(r.config).toBeDefined();
  });

  it('is idempotent: creating twice converges rather than minting a second broadcast', async () => {
    mockEnsure.mockResolvedValue({ outcome: 'unchanged', occurrenceId: 'occ-1' });
    const a = await writeStudioConfig(S, { create: true });
    const b = await writeStudioConfig(S, { create: true });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });
});
