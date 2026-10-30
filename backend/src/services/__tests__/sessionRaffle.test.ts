/**
 * Server-side giveaway draws: recorded once per draw number (idempotent),
 * only for the draw on screen, never past the prize count, and drawn
 * uniformly from entrants who have not already won.
 */
const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
const mockBroadcast = jest.fn();
jest.mock('../sessionLiveStateService', () => ({ getBroadcast: (...a: unknown[]) => mockBroadcast(...a) }));
jest.mock('../sessionPresenceService', () => ({ formatDisplayName: (n: string) => {
  const [f, l] = n.split(' '); return l ? `${f} ${l[0]}.` : f;
} }));

import { drawRaffleWinner, pickEntrant, RaffleError } from '../sessionRaffleService';

const S = '11111111-1111-4111-8111-111111111111';
const onScreen = { phase: 'question', question: { key: 'oh-raffle-books', answer: 0, options: ["I'm in"] } };
const stored = (n: number, name = 'Ana R.') => ({ poll_key: 'oh-raffle-books', draw_number: n, display_name: name, full_name: 'Ana Rivera', email: 'a@x.com', created_at: 'now' });

/** Route each SQL statement by its first keyword so tests read as a script. */
function db(handlers: { existing: unknown[][]; entrants?: unknown[]; insert?: unknown[] }) {
  let existingCall = 0;
  mockQuery.mockImplementation(async (sql: string) => {
    if (/^\s*INSERT/i.test(sql)) return handlers.insert ?? [{ id: 'w1' }];
    if (/session_guest_poll_responses r JOIN/.test(sql)) return handlers.entrants ?? [];
    return handlers.existing[Math.min(existingCall++, handlers.existing.length - 1)];
  });
}

beforeEach(() => { jest.clearAllMocks(); mockBroadcast.mockResolvedValue(onScreen); });

describe('drawRaffleWinner', () => {
  it('returns the stored winner for an already-drawn number, without drawing again', async () => {
    db({ existing: [[stored(1)]] });
    expect((await drawRaffleWinner(S, 'oh-raffle-books', 1, 3)).display_name).toBe('Ana R.');
    expect(mockQuery.mock.calls.some(([sql]) => /INSERT/.test(sql))).toBe(false);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it('draws from the remaining entrants and records the winner with full name and email', async () => {
    db({ existing: [[], [stored(2, 'Ben T.')]], entrants: [
      { guest_id: 'g1', enrollment_id: null, full_name: 'Ana Rivera', email: 'a@x.com' },
      { guest_id: null, enrollment_id: 'e2', full_name: 'Ben Tran', email: 'b@x.com' },
    ] });
    const w = await drawRaffleWinner(S, 'oh-raffle-books', 2, 3, () => 1);
    expect(w.display_name).toBe('Ben T.');
    const insert = mockQuery.mock.calls.find(([sql]) => /INSERT/.test(sql))!;
    expect(insert[1].replacements).toMatchObject({ n: 2, eid: 'e2', gid: null, fn: 'Ben Tran', email: 'b@x.com', dn: 'Ben T.' });
  });

  it('refuses a draw number beyond the prize count', async () => {
    await expect(drawRaffleWinner(S, 'oh-raffle-books', 4, 3)).rejects.toMatchObject({ status: 400 });
  });

  it('refuses a draw that is not on screen', async () => {
    db({ existing: [[]] });
    mockBroadcast.mockResolvedValue({ phase: 'question', question: { key: 'oh-where', answer: null, options: ['A'] } });
    await expect(drawRaffleWinner(S, 'oh-raffle-books', 1, 3)).rejects.toMatchObject({ status: 409 });
  });

  it('reports when nobody is left to draw', async () => {
    db({ existing: [[]], entrants: [] });
    const err = await drawRaffleWinner(S, 'oh-raffle-books', 1, 3).catch((e) => e);
    expect(err).toBeInstanceOf(RaffleError);
    expect(err.message).toMatch(/No entrants/);
  });
});

describe('pickEntrant', () => {
  it('is uniform over the pool via the injected random source, and null when empty', () => {
    expect(pickEntrant(['a', 'b', 'c'], () => 2)).toBe('c');
    expect(pickEntrant([], () => 0)).toBeNull();
  });
});
