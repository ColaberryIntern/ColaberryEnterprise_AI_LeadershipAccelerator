/**
 * decideBootAction unit tests — the pure boot-ingest catch-up rule for the AI
 * News Flash pipeline. Covers: initial seed (empty library), the cost gate,
 * nothing-pending, fresh vs stale windows, the null (no-card-yet) case, and the
 * staleHours boundary (off-by-one).
 */
import { decideBootAction } from '../aiNewsBootDecision';

const base = {
  total: 100,
  pending: 50,
  newestCardAgeHours: 30,
  materializeEnabled: true,
  staleHours: 20,
};

describe('decideBootAction', () => {
  it('seeds a fresh/empty library regardless of the flag', () => {
    expect(decideBootAction({ ...base, total: 0 }).action).toBe('initial');
    // initial wins even with the cost gate off — the empty-seed ingest is cheap
    expect(decideBootAction({ ...base, total: 0, materializeEnabled: false }).action).toBe('initial');
  });

  it('skips when materialization is disabled (cost gate off)', () => {
    const d = decideBootAction({ ...base, materializeEnabled: false });
    expect(d.action).toBe('skip');
    expect(d.reason).toMatch(/cost gate/i);
  });

  it('skips when there are no pending items to card', () => {
    expect(decideBootAction({ ...base, pending: 0 }).action).toBe('skip');
    expect(decideBootAction({ ...base, pending: -1 }).action).toBe('skip'); // defensive
  });

  it('skips when the newest card is still fresh', () => {
    const d = decideBootAction({ ...base, newestCardAgeHours: 5 });
    expect(d.action).toBe('skip');
    expect(d.reason).toMatch(/fresh/);
  });

  it('catches up when the newest card is stale', () => {
    const d = decideBootAction({ ...base, newestCardAgeHours: 30 });
    expect(d.action).toBe('catchup');
    expect(d.reason).toMatch(/stale/);
  });

  it('catches up when no generated card exists yet (null age)', () => {
    const d = decideBootAction({ ...base, newestCardAgeHours: null });
    expect(d.action).toBe('catchup');
    expect(d.reason).toMatch(/no card yet/);
  });

  it('treats exactly staleHours as stale (boundary: not < threshold)', () => {
    // 20h is NOT < 20h, so it must catch up, not skip.
    expect(decideBootAction({ ...base, newestCardAgeHours: 20 }).action).toBe('catchup');
    // just under the line stays fresh
    expect(decideBootAction({ ...base, newestCardAgeHours: 19.99 }).action).toBe('skip');
  });
});
