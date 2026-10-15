/**
 * Apollo credit guard.
 *
 * APOLLO_ENABLED is an on/off valve; this is the brake. The tests that matter are
 * the ones asserting a call is NOT made: a guard that lets the request through is
 * worse than no guard, because it looks like protection.
 *
 * Every test here was written to fail first against the unguarded service.
 */
import { jest } from '@jest/globals';

const queryMock = jest.fn<any>();
jest.mock('../../config/database', () => ({ sequelize: { query: queryMock } }));

const emitAiEventMock = jest.fn<any>();
jest.mock('../../services/aiEventService', () => ({ emitAiEvent: emitAiEventMock }));

import { env } from '../../config/env';
import {
  claimApolloCall, __resetPerRunCountForTests, getPerRunCount, APOLLO_GUARD_REASONS,
} from '../../services/apolloCreditGuard';

// one row back from the atomic upsert means "claim granted, here is the new count"
const granted = (count: number) => [[{ call_count: count }], {}];
// zero rows means the WHERE guard refused: the daily ceiling is already reached
const refused = () => [[], {}];

describe('Apollo credit guard', () => {
  const realDay = env.apolloMaxCallsPerDay;
  const realRun = env.apolloMaxCallsPerRun;
  const realFrac = env.apolloAlertFraction;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetPerRunCountForTests();
    (env as any).apolloMaxCallsPerDay = 100;
    (env as any).apolloMaxCallsPerRun = 3;
    (env as any).apolloAlertFraction = 0.8;
  });

  afterAll(() => {
    (env as any).apolloMaxCallsPerDay = realDay;
    (env as any).apolloMaxCallsPerRun = realRun;
    (env as any).apolloAlertFraction = realFrac;
  });

  describe('the daily ceiling', () => {
    it('allows a call and reports the new count when the ceiling is not reached', async () => {
      queryMock.mockResolvedValueOnce(granted(7));
      const d = await claimApolloCall('searchPeople');
      expect(d.allowed).toBe(true);
      if (d.allowed) expect(d.dailyCount).toBe(7);
    });

    it('REFUSES once the ceiling is reached, and the ceiling is enforced in SQL', async () => {
      queryMock.mockResolvedValueOnce(refused());
      const d = await claimApolloCall('searchPeople');
      expect(d.allowed).toBe(false);
      if (!d.allowed) expect(d.reason).toBe(APOLLO_GUARD_REASONS.DAILY);

      // The WHERE clause is what makes the claim atomic. Without it two processes
      // can both read the same count and both proceed past the limit.
      const sql = String(queryMock.mock.calls[0][0]);
      expect(sql).toMatch(/INSERT INTO apollo_credit_usage/i);
      expect(sql).toMatch(/ON CONFLICT/i);
      expect(sql).toMatch(/WHERE apollo_credit_usage\.call_count < :limit/i);
      expect(sql).toMatch(/RETURNING call_count/i);
    });

    it('counts per UTC day, so a server timezone change cannot widen the window', async () => {
      queryMock.mockResolvedValueOnce(granted(1));
      await claimApolloCall('searchPeople');
      const reps = (queryMock.mock.calls[0][1] as any).replacements;
      expect(reps.day).toBe(new Date().toISOString().slice(0, 10));
      expect(reps.limit).toBe(100);
    });
  });

  describe('the per-run ceiling', () => {
    it('stops one process after its own limit, without reaching the database again', async () => {
      queryMock.mockResolvedValue(granted(1));
      expect((await claimApolloCall('a')).allowed).toBe(true);
      expect((await claimApolloCall('b')).allowed).toBe(true);
      expect((await claimApolloCall('c')).allowed).toBe(true);
      expect(getPerRunCount()).toBe(3);

      const callsBefore = queryMock.mock.calls.length;
      const fourth = await claimApolloCall('d');
      expect(fourth.allowed).toBe(false);
      if (!fourth.allowed) expect(fourth.reason).toBe(APOLLO_GUARD_REASONS.PER_RUN);
      // refused before any query: the per-run cap must not cost a round trip
      expect(queryMock.mock.calls.length).toBe(callsBefore);
    });

    it('does not increment the per-run count when the daily ceiling refused the call', async () => {
      queryMock.mockResolvedValueOnce(refused());
      await claimApolloCall('searchPeople');
      expect(getPerRunCount()).toBe(0);
    });
  });

  describe('failing closed', () => {
    it('REFUSES the call when the counter cannot be read', async () => {
      queryMock.mockRejectedValueOnce(new Error('connection terminated'));
      const d = await claimApolloCall('searchPeople');
      expect(d.allowed).toBe(false);
      if (!d.allowed) expect(d.reason).toBe(APOLLO_GUARD_REASONS.COUNTER_UNAVAILABLE);
      // the whole point: a guard that fails open is not a guard
      expect(getPerRunCount()).toBe(0);
    });
  });

  describe('the alert', () => {
    it('fires once when usage crosses the threshold', async () => {
      queryMock
        .mockResolvedValueOnce(granted(80))        // the claim: 80 of 100 is the threshold
        .mockResolvedValueOnce([[{ usage_date: '2026-10-15' }], {}]);  // alerted_at claimed
      await claimApolloCall('searchPeople');
      await new Promise((r) => setImmediate(r));   // the alert is fired, not awaited
      expect(emitAiEventMock).toHaveBeenCalledTimes(1);
      const payload = (emitAiEventMock.mock.calls[0][0] as any);
      expect(payload.event_type).toBe('apollo_spend_threshold_crossed');
      expect(payload.payload.daily_count).toBe(80);
      expect(payload.payload.daily_limit).toBe(100);
    });

    it('does NOT fire below the threshold', async () => {
      queryMock.mockResolvedValueOnce(granted(79));
      await claimApolloCall('searchPeople');
      await new Promise((r) => setImmediate(r));
      expect(emitAiEventMock).not.toHaveBeenCalled();
    });

    it('does not fire twice in a day: the second claim finds alerted_at already set', async () => {
      queryMock
        .mockResolvedValueOnce(granted(90))
        .mockResolvedValueOnce([[], {}]);          // UPDATE ... WHERE alerted_at IS NULL matched nothing
      await claimApolloCall('searchPeople');
      await new Promise((r) => setImmediate(r));
      expect(emitAiEventMock).not.toHaveBeenCalled();
    });

    it('never fails the call when the alert itself throws', async () => {
      queryMock
        .mockResolvedValueOnce(granted(95))
        .mockRejectedValueOnce(new Error('alert table gone'));
      const d = await claimApolloCall('searchPeople');
      await new Promise((r) => setImmediate(r));
      expect(d.allowed).toBe(true);   // best-effort alerting must not block work
    });
  });
});
