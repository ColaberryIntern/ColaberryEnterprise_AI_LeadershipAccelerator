const m = {
  schedule: jest.fn(),
  instrument: jest.fn(),
  recompute: jest.fn(),
  governor: jest.fn(),
  draft: jest.fn(),
};
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: (...a: unknown[]) => m.schedule(...a) } }));
jest.mock('../../cronInstrumentation', () => ({ instrumentCronJob: (...a: unknown[]) => m.instrument(...a) }));
jest.mock('../../explorerGrowth/explorerProfileService', () => ({ runScheduledRecompute: (...a: unknown[]) => m.recompute(...a) }));
jest.mock('../../explorerGrowth/governor/runGovernor', () => ({ runScheduledGovernor: (...a: unknown[]) => m.governor(...a) }));
jest.mock('../../explorerGrowth/drafts/runDraftRender', () => ({ runScheduledDraftRender: (...a: unknown[]) => m.draft(...a) }));

import { registerExplorerNightlySequence, runExplorerNightlySequence } from '../explorerNightlySequence';

/**
 * C108. The property under test is ORDER WITH A SLOW FIRST STEP, which is the bug:
 * a clock-time schedule also passes every test where the recompute is quick.
 */

const STARTED_AT = new Date('2026-11-05T03:20:00Z');
const AGENTS = ['ExplorerProfileRecompute', 'ExplorerGovernorDecide', 'ExplorerDraftRender'];

/** A promise the test finishes by hand, standing in for a 34-minute recompute. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.instrument.mockImplementation(async (_name: string, body: () => Promise<void>) => body());
});

describe('each step starts when the one before it ends', () => {
  it('does not start the Governor while the recompute is still running', async () => {
    const recompute = deferred();
    m.recompute.mockReturnValue(recompute.promise);

    const run = runExplorerNightlySequence(STARTED_AT);
    await flush();
    expect(m.recompute).toHaveBeenCalledTimes(1);
    expect(m.governor).not.toHaveBeenCalled();
    expect(m.draft).not.toHaveBeenCalled();

    recompute.resolve();
    await run;
    expect(m.governor).toHaveBeenCalledTimes(1);
  });

  it('does not start draft render while the Governor is still running', async () => {
    const governor = deferred();
    m.governor.mockReturnValue(governor.promise);

    const run = runExplorerNightlySequence(STARTED_AT);
    await flush();
    expect(m.governor).toHaveBeenCalledTimes(1);
    expect(m.draft).not.toHaveBeenCalled();

    governor.resolve();
    await run;
    expect(m.draft).toHaveBeenCalledTimes(1);
  });

  it('tells the Governor when the sequence started, so last night\'s scores are refused', async () => {
    await runExplorerNightlySequence(STARTED_AT);
    expect(m.governor).toHaveBeenCalledWith({ scoredSince: STARTED_AT });
  });
});

describe('each step stays separately pausable', () => {
  it('runs every step under its own registry name, in order', async () => {
    await runExplorerNightlySequence(STARTED_AT);
    expect(m.instrument.mock.calls.map((c) => c[0])).toEqual(AGENTS);
  });

  it('a paused recompute does not stop the Governor, which refuses what was not scored', async () => {
    m.instrument.mockImplementation(async (name: string, body: () => Promise<void>) => {
      if (name !== 'ExplorerProfileRecompute') await body();
    });
    await runExplorerNightlySequence(STARTED_AT);
    expect(m.recompute).not.toHaveBeenCalled();
    expect(m.governor).toHaveBeenCalledWith({ scoredSince: STARTED_AT });
  });

  it('pausing draft render, the step that costs money, leaves the Governor running', async () => {
    m.instrument.mockImplementation(async (name: string, body: () => Promise<void>) => {
      if (name !== 'ExplorerDraftRender') await body();
    });
    await runExplorerNightlySequence(STARTED_AT);
    expect(m.governor).toHaveBeenCalledTimes(1);
    expect(m.draft).not.toHaveBeenCalled();
  });
});

describe('a failed step does not end the night', () => {
  let errorLog: jest.SpyInstance;
  beforeEach(() => { errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
  afterEach(() => errorLog.mockRestore());

  it.each(AGENTS)('%s throwing is logged, later steps still run, and nothing rejects', async (failing) => {
    m.instrument.mockImplementation(async (name: string, body: () => Promise<void>) => {
      if (name === failing) throw new Error('boom');
      await body();
    });

    await expect(runExplorerNightlySequence(STARTED_AT)).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(`[Scheduler] ${failing} failed:`, expect.any(Error));
    const ran = m.instrument.mock.calls.map((c) => c[0]);
    expect(ran).toEqual(AGENTS);
  });
});

describe('running it twice', () => {
  it('runs each step once per run, with the same Governor cutoff for the same start', async () => {
    await runExplorerNightlySequence(STARTED_AT);
    await runExplorerNightlySequence(STARTED_AT);
    expect(m.recompute).toHaveBeenCalledTimes(2);
    expect(m.governor.mock.calls).toEqual([[{ scoredSince: STARTED_AT }], [{ scoredSince: STARTED_AT }]]);
    expect(m.draft).toHaveBeenCalledTimes(2);
  });
});

describe('registration', () => {
  it('schedules one nightly job, and the callback runs the sequence with a cutoff taken at fire time', async () => {
    registerExplorerNightlySequence();
    expect(m.schedule).toHaveBeenCalledTimes(1);
    expect(m.schedule.mock.calls[0][0]).toBe('20 3 * * *');
    expect(m.governor).not.toHaveBeenCalled();

    const before = Date.now();
    m.schedule.mock.calls[0][1]();
    await flush();
    await flush();
    const { scoredSince } = m.governor.mock.calls[0][0] as { scoredSince: Date };
    expect(scoredSince.getTime()).toBeGreaterThanOrEqual(before);
  });
});
