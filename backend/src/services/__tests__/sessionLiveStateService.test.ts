import { getPollCorrectResponders, getLiveState, BroadcastState, BroadcastQuestion } from '../sessionLiveStateService';
import { sequelize } from '../../config/database';

// Hermetic: no real DB. `sequelize.query` is mocked and dispatches on a
// distinguishing substring of the SQL text — the same shape as every other
// sequelize.query-based service test in this repo (see orgService.test.ts).
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

// Keep the REAL `formatDisplayName` (needed to prove the "Ali Muwwakkil" ->
// "Ali M." redaction actually happens, not just that an import exists) while
// stubbing out the DB-backed presence-ticker call, which these tests don't
// exercise.
jest.mock('../sessionPresenceService', () => {
  const actual = jest.requireActual('../sessionPresenceService');
  return { ...actual, getRecentPresenceEvents: jest.fn().mockResolvedValue([]) };
});

const mockQuery = sequelize.query as jest.Mock;

/** Dispatches each call to `sequelize.query` based on a distinguishing
 * substring of its SQL, matching `getLiveState`'s real call sequence
 * (pulse counts, present count, participated count, chat messages,
 * broadcast get, poll tally, correct responders). Any un-matched query
 * returns an empty result set rather than throwing, so tests only need to
 * override what they actually care about. */
function mockLiveStateQueries(overrides: {
  broadcast?: BroadcastState | null;
  tally?: { choice: number; n: string }[];
  correctResponders?: { full_name: string }[];
} = {}) {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM session_pulse WHERE session_id') && sql.includes('GROUP BY state')) return Promise.resolve([]);
    if (sql.includes('FROM attendance_records')) return Promise.resolve([{ n: '0' }]);
    if (sql.includes('UNION SELECT enrollment_id FROM session_poll_responses')) return Promise.resolve([{ n: '0' }]);
    if (sql.includes('FROM session_chat_messages') && sql.includes('ORDER BY created_at DESC')) return Promise.resolve([]);
    if (sql.includes('FROM session_broadcast WHERE session_id')) {
      if (!overrides.broadcast) return Promise.resolve([]);
      return Promise.resolve([{ state: JSON.stringify(overrides.broadcast), updated_at: '2026-08-01T00:00:00Z' }]);
    }
    if (sql.includes('FROM session_poll_responses') && sql.includes('GROUP BY choice')) {
      return Promise.resolve(overrides.tally || []);
    }
    if (sql.includes('JOIN enrollments e ON e.id = r.enrollment_id')) {
      return Promise.resolve(overrides.correctResponders || []);
    }
    return Promise.resolve([]);
  });
}

const baseQuestion: BroadcastQuestion = {
  key: 'poll-1', kind: 'trivia', q: 'A or B?', options: ['A', 'B'],
  answer: 1, revealed: false, theater: undefined,
};

const baseBroadcast = (question: BroadcastQuestion): BroadcastState => ({
  slide_index: 0, slide_id: 's1', title: 'Slide', segment_label: 'checkin',
  phase: 'question', question,
});

describe('getPollCorrectResponders', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns names redacted via formatDisplayName, not raw full_name', async () => {
    mockQuery.mockResolvedValueOnce([{ full_name: 'Ali Muwwakkil' }, { full_name: 'Zoe Bishop' }]);
    const names = await getPollCorrectResponders('sess-1', 'poll-1', 1);
    expect(names).toEqual(['Ali M.', 'Zoe B.']);
    // Never the raw full name — proves the redaction is actually applied.
    expect(names).not.toContain('Ali Muwwakkil');
  });

  it('scopes the query to the given session, poll key, and choice', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await getPollCorrectResponders('sess-42', 'poll-key-x', 2);
    const [, opts] = mockQuery.mock.calls[0];
    expect(opts.replacements).toEqual({ sid: 'sess-42', key: 'poll-key-x', choice: 2 });
  });
});

describe('getLiveState — poll.correctResponders gating', () => {
  beforeEach(() => mockQuery.mockReset());

  it('is populated for a revealed theater question with a numeric answer', async () => {
    const question = { ...baseQuestion, revealed: true, theater: { state: 'revealed' as const } };
    mockLiveStateQueries({
      broadcast: baseBroadcast(question),
      tally: [{ choice: 1, n: '3' }],
      correctResponders: [{ full_name: 'Ali Muwwakkil' }],
    });
    const state = await getLiveState('sess-1');
    expect(state.poll?.correctResponders).toEqual(['Ali M.']);
  });

  it('is null when the question has not been revealed yet (voting/locked)', async () => {
    const question = { ...baseQuestion, revealed: false, theater: { state: 'locked' as const } };
    mockLiveStateQueries({ broadcast: baseBroadcast(question), tally: [{ choice: 1, n: '3' }] });
    const state = await getLiveState('sess-1');
    expect(state.poll?.correctResponders).toBeNull();
  });

  it('is null for a revealed NON-theater poll (no server-tracked reveal moment)', async () => {
    const question = { ...baseQuestion, revealed: true, theater: undefined };
    mockLiveStateQueries({ broadcast: baseBroadcast(question), tally: [{ choice: 1, n: '3' }] });
    const state = await getLiveState('sess-1');
    expect(state.poll?.correctResponders).toBeNull();
  });

  it('is null when revealed but the question has no numeric answer (a plain poll, not trivia)', async () => {
    const question = { ...baseQuestion, answer: null, revealed: true, theater: { state: 'revealed' as const } };
    mockLiveStateQueries({ broadcast: baseBroadcast(question), tally: [{ choice: 1, n: '3' }] });
    const state = await getLiveState('sess-1');
    expect(state.poll?.correctResponders).toBeNull();
  });

  it('poll stays entirely null when no question is on screen (regression)', async () => {
    mockLiveStateQueries({ broadcast: null });
    const state = await getLiveState('sess-1');
    expect(state.poll).toBeNull();
  });
});
