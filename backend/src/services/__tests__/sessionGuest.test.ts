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
  return { getBroadcast: (...a: unknown[]) => mockBroadcast(...a), PollLockedError };
});
const store = { upsertGuest: jest.fn(), findGuest: jest.fn(), getGuestChoice: jest.fn(), recordGuestVote: jest.fn() };
jest.mock('../sessionGuestStore', () => ({
  upsertGuest: (...a: unknown[]) => store.upsertGuest(...a),
  findGuest: (...a: unknown[]) => store.findGuest(...a),
  getGuestChoice: (...a: unknown[]) => store.getGuestChoice(...a),
  recordGuestVote: (...a: unknown[]) => store.recordGuestVote(...a),
}));

import { joinAsGuest, castGuestVote, getGuestState, mintGuestPass, verifyGuestPass, GuestError } from '../sessionGuestService';
import { PollLockedError } from '../sessionLiveStateService';

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const session = (title: string) => ({ get: (k: string) => (k === 'title' ? title : S1) });
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
    mockFindByPk.mockResolvedValue(session('Week 3 · Build Day — Agents'));
    await expect(joinAsGuest(S1, 'Ana', 'a@x.com')).rejects.toBeInstanceOf(GuestError);
    expect(store.upsertGuest).not.toHaveBeenCalled();
  });
  it('refuses an unknown session', async () => {
    mockFindByPk.mockResolvedValue(null);
    await expect(joinAsGuest(S1, 'Ana', 'a@x.com')).rejects.toMatchObject({ status: 404 });
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
});

