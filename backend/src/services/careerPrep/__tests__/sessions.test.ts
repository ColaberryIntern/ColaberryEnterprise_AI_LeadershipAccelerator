const mockQuery = jest.fn();
const mockTransaction = jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn('tx'));
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a), transaction: (fn: (t: unknown) => Promise<unknown>) => mockTransaction(fn) } }));

import { applyUpdate, NotFoundError, startSession, updateSession, type SessionView } from '../sessions';

const NOW = new Date('2026-11-16T18:00:00Z');
const segs = [
  { kind: 'warmup', title: 'Warm up', minutes: 2, state: 'pending' }, { kind: 'learn', title: 'Learn', minutes: 4, state: 'pending' },
  { kind: 'cooldown', title: 'Cool down', minutes: 1, state: 'pending' },
] as SessionView['segments'];
const base: SessionView = { id: 's1', planId: 'p1', status: 'running', startedAt: '2026-11-16T17:50:00Z', secondsActive: 120, segments: segs };
const plan = { id: 'p1', days: [{ date: '2026-11-16', segments: segs.map(({ state: _s, ...x }) => x) }] };

beforeEach(() => { mockQuery.mockReset(); mockTransaction.mockClear(); });

describe('applyUpdate (pure)', () => {
  it('marks a segment done once; the same update again changes nothing', () => {
    const once = applyUpdate(base, { action: 'segment_done', segmentIndex: 1, secondsActive: 300 }, NOW);
    expect(once.segments[1].state).toBe('done');
    const twice = applyUpdate(once, { action: 'segment_done', segmentIndex: 1, secondsActive: 300 }, NOW);
    expect(twice).toEqual(once);
  });
  it('only grows seconds_active, and caps it at the real time since the start', () => {
    expect(applyUpdate(base, { action: 'pause', secondsActive: 60 }, NOW).secondsActive).toBe(120); // a late smaller report is ignored
    expect(applyUpdate(base, { action: 'pause', secondsActive: 9_999 }, NOW).secondsActive).toBe(600); // 10 minutes of wall time
  });
  it('pauses, resumes, finishes; a finished session never changes again', () => {
    expect(applyUpdate(base, { action: 'pause', secondsActive: 120 }, NOW).status).toBe('paused');
    expect(applyUpdate({ ...base, status: 'paused' }, { action: 'resume', secondsActive: 120 }, NOW).status).toBe('running');
    const done = applyUpdate(base, { action: 'finish', secondsActive: 400 }, NOW);
    expect(done.status).toBe('finished');
    expect(applyUpdate(done, { action: 'resume', secondsActive: 500 }, NOW)).toEqual(done);
  });
});

describe('startSession', () => {
  it('refuses a plan that is not this student\'s active plan', async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    await expect(startSession('e1', 'p9', NOW)).rejects.toBeInstanceOf(NotFoundError);
  });
  it('resumes today\'s open session instead of starting a second one', async () => {
    mockQuery.mockResolvedValueOnce([[plan], 1]).mockResolvedValueOnce([[], 0])
      .mockResolvedValueOnce([[{ id: 's1', plan_id: 'p1', status: 'paused', started_at: '2026-11-16T17:50:00Z', seconds_active: 120, segments: segs }], 1]);
    const r = await startSession('e1', 'p1', NOW);
    expect(r.resumed).toBe(true);
    expect(r.session.id).toBe('s1');
    expect(mockQuery).toHaveBeenCalledTimes(3); // plan, lock, open lookup: no insert
    expect(String(mockQuery.mock.calls[1][0])).toContain('pg_advisory_xact_lock');
  });
  it('starts a new session with today\'s segments, all pending', async () => {
    mockQuery.mockResolvedValueOnce([[plan], 1]).mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[], 0])
      .mockResolvedValueOnce([[{ id: 's2', plan_id: 'p1', status: 'running', started_at: NOW, seconds_active: 0, segments: segs }], 1]);
    const r = await startSession('e1', 'p1', NOW);
    expect(r).toMatchObject({ resumed: false, session: { id: 's2', status: 'running' } });
    expect(JSON.parse(mockQuery.mock.calls[3][1].replacements.s).every((s: { state: string }) => s.state === 'pending')).toBe(true);
  });
});

describe('updateSession', () => {
  const row = { id: 's1', plan_id: 'p1', status: 'running', started_at: '2026-11-16T17:50:00Z', seconds_active: 120, segments: segs };
  it('locks the row, applies the update and stamps ended_at once on finish', async () => {
    mockQuery.mockResolvedValueOnce([[row], 1]).mockResolvedValueOnce([[], 1]);
    const r = await updateSession('e1', 's1', { action: 'finish', secondsActive: 500 }, NOW);
    expect(r.status).toBe('finished');
    expect(String(mockQuery.mock.calls[0][0])).toContain('FOR UPDATE');
    expect(String(mockQuery.mock.calls[1][0])).toContain('ended_at = :now');
  });
  it('treats another student\'s session, and an out-of-range segment, as not found', async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    await expect(updateSession('e2', 's1', { action: 'pause', secondsActive: 1 }, NOW)).rejects.toBeInstanceOf(NotFoundError);
    mockQuery.mockResolvedValueOnce([[row], 1]);
    await expect(updateSession('e1', 's1', { action: 'segment_done', segmentIndex: 9, secondsActive: 1 }, NOW)).rejects.toBeInstanceOf(NotFoundError);
  });
});
