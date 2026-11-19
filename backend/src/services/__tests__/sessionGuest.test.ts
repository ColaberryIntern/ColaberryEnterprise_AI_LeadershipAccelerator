/**
 * Open House guests: the pass is session-scoped and voting-only, guests are
 * refused on non-Open-House sessions, and votes respect the instructor's lock
 * and the question actually on screen. DB and broadcast are mocked.
 */
const mockFindByPk = jest.fn();
jest.mock('../../models/LiveSession', () => ({ __esModule: true, default: { findByPk: (...a: unknown[]) => mockFindByPk(...a) } }));
const mockBroadcast = jest.fn();
jest.mock('../sessionLiveStateService', () => {
  class PollLockedError extends Error { constructor() { super('POLL_LOCKED'); } }
  return {
    getBroadcast: (...a: unknown[]) => mockBroadcast(...a),
    PollLockedError,
    isValidPulseState: (s: unknown) => typeof s === 'string' && ['here', 'building', 'stuck', 'finished'].includes(s),
  };
});
const store = {
  upsertGuest: jest.fn(), findGuest: jest.fn(), getGuestChoice: jest.fn(), recordGuestVote: jest.fn(),
  setGuestPulse: jest.fn(), getGuestPulse: jest.fn(), addGuestQuestion: jest.fn(),
};
jest.mock('../sessionGuestStore', () => ({
  upsertGuest: (...a: unknown[]) => store.upsertGuest(...a),
  findGuest: (...a: unknown[]) => store.findGuest(...a),
  getGuestChoice: (...a: unknown[]) => store.getGuestChoice(...a),
  recordGuestVote: (...a: unknown[]) => store.recordGuestVote(...a),
  setGuestPulse: (...a: unknown[]) => store.setGuestPulse(...a),
  getGuestPulse: (...a: unknown[]) => store.getGuestPulse(...a),
  addGuestQuestion: (...a: unknown[]) => store.addGuestQuestion(...a),
}));
const mockRecordAttendance = jest.fn();
jest.mock('../liveSessionAttendanceService', () => ({
  recordAttendanceRow: (...a: unknown[]) => mockRecordAttendance(...a),
}));
jest.mock('../sessionPresenceService', () => ({
  formatDisplayName: (n: string) => { const [f, l] = n.split(' '); return l ? `${f} ${l[0]}.` : f; },
}));

import {
  joinAsGuest, castGuestVote, getGuestState, mintGuestPass, verifyGuestPass, GuestError, setGuestPulseFor, askAsGuest,
} from '../sessionGuestService';
import { PollLockedError } from '../sessionLiveStateService';

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
/**
 * D4: a session now carries `guest_access`, and that alone decides whether guests may join.
 * The title is still passed because callers display it, but it no longer gates anything — so
 * every case below states the flag explicitly rather than relying on what the class is called.
 */
const session = (title: string, guestAccess: boolean | null = true) => ({
  get: (k: string) => {
    if (k === 'title') return title;
    if (k === 'guest_access') return guestAccess;
    return S1;
  },
});
const question = (state: 'voting' | 'locked' | 'revealed', revealed = false) => ({
  phase: 'question', title: 'Poll', question: { key: 'oh-where', q: 'Where?', options: ['A', 'B'], answer: 1, revealed, theater: { state } },
});

beforeEach(() => {
  jest.clearAllMocks();
  store.findGuest.mockResolvedValue({ id: 'g1', session_id: S1, name: 'Ana R', email: 'a@x.com', enrollment_id: null });
  store.getGuestChoice.mockResolvedValue(null);
});

describe('guest pass', () => {
  it('is scoped to one session and to the guest role', () => {
    const p = mintGuestPass(S1, 'g1');
    expect(verifyGuestPass(p, S1)).toBe('g1');
    expect(verifyGuestPass(p, S2)).toBeNull();
    expect(verifyGuestPass('forged.token.value', S1)).toBeNull();
    expect(verifyGuestPass(undefined, S1)).toBeNull();
  });
});

describe('joinAsGuest', () => {
  it('joins an Open House session and returns a pass', async () => {
    mockFindByPk.mockResolvedValue(session('Open House — The Forward Deployed Engineer'));
    store.upsertGuest.mockResolvedValue({ id: 'g1', name: 'Ana R', enrollment_id: 'e1' });
    const r = await joinAsGuest(S1, 'Ana R', 'a@x.com');
    expect(verifyGuestPass(r.pass, S1)).toBe('g1');
    expect(r.matched).toBe(true);
  });
  it('refuses guests on a normal class', async () => {
    mockFindByPk.mockResolvedValue(session('Week 3 · Build Day — Agents', null));
    await expect(joinAsGuest(S1, 'Ana', 'a@x.com')).rejects.toBeInstanceOf(GuestError);
    expect(store.upsertGuest).not.toHaveBeenCalled();
  });
  it('refuses an unknown session', async () => {
    mockFindByPk.mockResolvedValue(null);
    await expect(joinAsGuest(S1, 'Ana', 'a@x.com')).rejects.toMatchObject({ status: 404 });
  });

  /**
   * D4 — the four cases that prove guest access is the SETTING and not the title.
   *
   * Before this change a class could only take guests by being called "Open House", so these
   * four were not expressible: the first was impossible, and the third was impossible in the
   * other direction, which is the one that matters. An operator must be able to turn guests OFF
   * on a class that happens to be named Open House; if the title could still admit them, the
   * setting would be decorative.
   */
  it('admits a guest to a class that is NOT called Open House, when the setting is on', async () => {
    mockFindByPk.mockResolvedValue(session('Architecture day, week 3', true));
    store.upsertGuest.mockResolvedValue({ id: 'g1', name: 'Ana R', enrollment_id: null });
    const r = await joinAsGuest(S1, 'Ana R', 'a@x.com');
    expect(verifyGuestPass(r.pass, S1)).toBe('g1');
  });

  it('refuses when the setting has never been configured (null)', async () => {
    mockFindByPk.mockResolvedValue(session('Architecture day, week 3', null));
    await expect(joinAsGuest(S1, 'Ana', 'a@x.com')).rejects.toMatchObject({ status: 404 });
    expect(store.upsertGuest).not.toHaveBeenCalled();
  });

  it('refuses when the setting is OFF even if the class is called Open House', async () => {
    mockFindByPk.mockResolvedValue(session('Open House — The Forward Deployed Engineer', false));
    await expect(joinAsGuest(S1, 'Ana', 'a@x.com')).rejects.toMatchObject({ status: 404 });
    expect(store.upsertGuest).not.toHaveBeenCalled();
  });

  it('still admits an existing Open House, because the backfill set its flag', async () => {
    // ensureStudioSetupSchema sets guest_access = TRUE for every title matching open house, so
    // no currently-working Open House loses its guests when the title match is deleted.
    mockFindByPk.mockResolvedValue(session('Open House — The Forward Deployed Engineer', true));
    store.upsertGuest.mockResolvedValue({ id: 'g1', name: 'Ana R', enrollment_id: 'e1' });
    await expect(joinAsGuest(S1, 'Ana R', 'a@x.com')).resolves.toMatchObject({ matched: true });
  });
});

describe('castGuestVote', () => {
  const pass = () => mintGuestPass(S1, 'g1');
  it('records a vote on the open question', async () => {
    mockBroadcast.mockResolvedValue(question('voting'));
    await castGuestVote(S1, pass(), 'oh-where', 1);
    expect(store.recordGuestVote).toHaveBeenCalledWith(S1, 'g1', 'oh-where', 1);
  });
  it('rejects after the instructor locks the vote', async () => {
    mockBroadcast.mockResolvedValue(question('locked'));
    await expect(castGuestVote(S1, pass(), 'oh-where', 1)).rejects.toBeInstanceOf(PollLockedError);
    expect(store.recordGuestVote).not.toHaveBeenCalled();
  });
  it('rejects a question that is not on screen, and an unknown option', async () => {
    mockBroadcast.mockResolvedValue(question('voting'));
    await expect(castGuestVote(S1, pass(), 'other-key', 0)).rejects.toMatchObject({ status: 409 });
    await expect(castGuestVote(S1, pass(), 'oh-where', 5)).rejects.toMatchObject({ status: 400 });
  });
  it('rejects a pass from another session (401)', async () => {
    mockBroadcast.mockResolvedValue(question('voting'));
    await expect(castGuestVote(S1, mintGuestPass(S2, 'g1'), 'oh-where', 1)).rejects.toMatchObject({ status: 401 });
  });
});

describe('getGuestState', () => {
  it('hides the answer until the reveal', async () => {
    mockBroadcast.mockResolvedValue(question('voting'));
    expect((await getGuestState(S1, mintGuestPass(S1, 'g1'))).question?.answer).toBeNull();
    mockBroadcast.mockResolvedValue(question('revealed', true));
    expect((await getGuestState(S1, mintGuestPass(S1, 'g1'))).question?.answer).toBe(1);
  });
  it('shows nothing to vote on between questions', async () => {
    mockBroadcast.mockResolvedValue({ phase: 'status', title: 'Welcome' });
    expect((await getGuestState(S1, mintGuestPass(S1, 'g1'))).question).toBeNull();
  });
  it('mirrors a Build Mode prompt and the guest\'s own status (additive for the check-in page)', async () => {
    mockBroadcast.mockResolvedValue({ phase: 'prompt', title: 'Build', prompt: { label: 'Make a skill', prompt: 'Create SKILL.md' } });
    store.getGuestPulse.mockResolvedValue('stuck');
    const s = await getGuestState(S1, mintGuestPass(S1, 'g1'));
    expect(s.phase).toBe('prompt');
    expect(s.prompt?.prompt).toBe('Create SKILL.md');
    expect(s.my_pulse).toBe('stuck');
  });
  it('carries the question kind and theater lock for the phone', async () => {
    mockBroadcast.mockResolvedValue(question('locked'));
    const s = await getGuestState(S1, mintGuestPass(S1, 'g1'));
    expect(s.phase).toBe('question');
    expect(s.question?.theater).toEqual({ state: 'locked' });
    expect(s.question?.locked).toBe(true);
  });
});

/**
 * The class QR check-in (2026-11-19). Ali scanned Session 3's QR signed in as an account in
 * another cohort and got "We couldn't check you in" (POST /join -> 404, not in this cohort).
 * The fix: the check-in door takes name + email on ANY class, not only an Open House.
 */
describe('joinAsGuest via the class check-in', () => {
  // Session 3, Cohort - November 2026: Tue 2026-11-24 18:30-19:30 Central (CST, UTC-6).
  const classSession = (over: Record<string, unknown> = {}) => {
    const v: Record<string, unknown> = {
      id: S1, title: 'Your Know-How Is Now a Product (Week 2 · Agent Skills)', guest_access: null,
      status: 'scheduled', session_date: '2026-11-24', start_time: '18:30', end_time: '19:30', ...over,
    };
    return { get: (k: string) => v[k] };
  };
  const DURING = new Date('2026-11-25T00:40:00Z'); // 6:40 PM CST
  const FIVE_DAYS_EARLY = new Date('2026-11-19T16:48:31Z'); // when Ali scanned it
  const AFTER = new Date('2026-11-25T03:00:00Z'); // 9:00 PM CST

  it('ADMITS a normal class whose guest setting was never configured (the Session 3 case)', async () => {
    mockFindByPk.mockResolvedValue(classSession());
    store.upsertGuest.mockResolvedValue({ id: 'g1', name: 'Ana R', enrollment_id: null });
    const r = await joinAsGuest(S1, 'Ana R', 'ana@x.com', { via: 'checkin', now: DURING });
    expect(verifyGuestPass(r.pass, S1)).toBe('g1');
    expect(r.class_window).toBe('open');
    expect(store.upsertGuest).toHaveBeenCalledWith(S1, 'Ana R', 'ana@x.com', { awaitingClass: false });
  });

  it('CONTROL: the Open House door still refuses that same class', async () => {
    mockFindByPk.mockResolvedValue(classSession());
    await expect(joinAsGuest(S1, 'Ana', 'ana@x.com')).rejects.toMatchObject({ status: 404 });
  });

  it('records attendance on the matching enrollment during class, without points', async () => {
    mockFindByPk.mockResolvedValue(classSession());
    store.upsertGuest.mockResolvedValue({ id: 'g1', name: 'Ana R', enrollment_id: 'e1' });
    const r = await joinAsGuest(S1, 'Ana R', 'ana@x.com', { via: 'checkin', now: DURING });
    expect(r.matched).toBe(true);
    expect(mockRecordAttendance).toHaveBeenCalledWith('e1', expect.objectContaining({ id: S1, session_date: '2026-11-24' }), DURING);
  });

  it('a non-matching email is a guest of the session and touches no attendance row', async () => {
    mockFindByPk.mockResolvedValue(classSession());
    store.upsertGuest.mockResolvedValue({ id: 'g2', name: 'Walk In', enrollment_id: null });
    await joinAsGuest(S1, 'Walk In', 'walkin@x.com', { via: 'checkin', now: DURING });
    expect(mockRecordAttendance).not.toHaveBeenCalled();
  });

  it('BEFORE the class: captures name + email, marks it awaiting, records no attendance', async () => {
    mockFindByPk.mockResolvedValue(classSession());
    store.upsertGuest.mockResolvedValue({ id: 'g1', name: 'Ali M', enrollment_id: 'e1' });
    const r = await joinAsGuest(S1, 'Ali M', 'ali@x.com', { via: 'checkin', now: FIVE_DAYS_EARLY });
    expect(r.class_window).toBe('before');
    expect(store.upsertGuest).toHaveBeenCalledWith(S1, 'Ali M', 'ali@x.com', { awaitingClass: true });
    expect(mockRecordAttendance).not.toHaveBeenCalled();
  });

  it('refuses after the class has ended (410), and on a cancelled class', async () => {
    mockFindByPk.mockResolvedValue(classSession());
    await expect(joinAsGuest(S1, 'Ana', 'ana@x.com', { via: 'checkin', now: AFTER })).rejects.toMatchObject({ status: 410 });
    mockFindByPk.mockResolvedValue(classSession({ status: 'cancelled' }));
    await expect(joinAsGuest(S1, 'Ana', 'ana@x.com', { via: 'checkin', now: DURING })).rejects.toMatchObject({ status: 410 });
    expect(store.upsertGuest).not.toHaveBeenCalled();
  });

  it('honours an operator\'s explicit "no guests" (D4) and an unknown session', async () => {
    mockFindByPk.mockResolvedValue(classSession({ guest_access: false }));
    await expect(joinAsGuest(S1, 'Ana', 'ana@x.com', { via: 'checkin', now: DURING })).rejects.toMatchObject({ status: 404 });
    mockFindByPk.mockResolvedValue(null);
    await expect(joinAsGuest(S1, 'Ana', 'ana@x.com', { via: 'checkin', now: DURING })).rejects.toMatchObject({ status: 404 });
    expect(store.upsertGuest).not.toHaveBeenCalled();
  });
});

describe('the guest pass also carries status and questions', () => {
  it('sets a valid status and rejects junk', async () => {
    await expect(setGuestPulseFor(S1, mintGuestPass(S1, 'g1'), 'building')).resolves.toBe('building');
    expect(store.setGuestPulse).toHaveBeenCalledWith(S1, 'g1', 'building');
    await expect(setGuestPulseFor(S1, mintGuestPass(S1, 'g1'), 'asleep')).rejects.toMatchObject({ status: 400 });
  });
  it('posts a question under the redacted name the projected deck uses', async () => {
    await askAsGuest(S1, mintGuestPass(S1, 'g1'), '  how do I install it?  ');
    expect(store.addGuestQuestion).toHaveBeenCalledWith(S1, 'g1', 'Ana R.', 'how do I install it?');
  });
  it('refuses both without a pass for THIS session', async () => {
    await expect(setGuestPulseFor(S1, mintGuestPass(S2, 'g1'), 'here')).rejects.toMatchObject({ status: 401 });
    await expect(askAsGuest(S1, undefined, 'hi')).rejects.toMatchObject({ status: 401 });
    expect(store.addGuestQuestion).not.toHaveBeenCalled();
  });
});

