/**
 * Overlap guard (single-flight) test for runPriorityEngine.
 *
 * A full scoring pass over all active todos can exceed the 2-min cron interval,
 * and node-cron does not prevent overlapping invocations. Before the guard,
 * stacked passes ran concurrently and each wrote a redundant audit row per todo
 * (same score, different row) — the mechanism that filled the prod disk on
 * 2026-06-15 even with dedup in place. This verifies a second call made while a
 * pass is in flight short-circuits without doing any work.
 */
jest.mock('../../../config/database', () => ({
  __esModule: true,
  sequelize: { query: jest.fn() },
}));
jest.mock('../../../models/OpsAiAssessment', () => ({
  __esModule: true,
  default: { bulkCreate: jest.fn().mockResolvedValue([]) },
}));

import { runPriorityEngine } from '../priorityEngineService';
import { sequelize } from '../../../config/database';

const queryMock = sequelize.query as jest.Mock;

describe('runPriorityEngine overlap guard', () => {
  beforeEach(() => queryMock.mockReset());

  it('skips a run that starts while another is in flight', async () => {
    let releaseFirst: () => void = () => undefined;
    const gate = new Promise<void>((r) => { releaseFirst = r; });

    // First run's initial page SELECT blocks on the gate, then returns no rows
    // (loop breaks). The trailing mock covers the retention DELETE.
    queryMock
      .mockImplementationOnce(async () => { await gate; return []; })
      .mockResolvedValue([[], { rowCount: 0 }]);

    const first = runPriorityEngine();      // enters, sets the flag, awaits gate
    const second = await runPriorityEngine(); // must short-circuit immediately

    expect(second.todos_scored).toBe(0);
    expect(second.audit_rows_written).toBe(0);
    // Only the first run has touched the DB so far; the second did no query.
    expect(queryMock).toHaveBeenCalledTimes(1);

    releaseFirst();
    await first;

    // After the first run releases the guard, a fresh run proceeds again.
    queryMock.mockReset();
    queryMock
      .mockResolvedValueOnce([])                  // page SELECT -> empty (loop breaks)
      .mockResolvedValue([[], { rowCount: 0 }]);  // retention DELETE -> tuple
    const third = await runPriorityEngine();
    expect(third.todos_scored).toBe(0);
    expect(queryMock).toHaveBeenCalled(); // it did run (not short-circuited)
  });
});
