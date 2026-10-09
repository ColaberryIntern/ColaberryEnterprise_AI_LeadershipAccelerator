import fs from 'fs';
import path from 'path';

/**
 * The Growth Journey's entry in `/health/full` (Phase 6, T609).
 *
 * Two things, because they fail in different ways:
 *
 *  - the SEVERITY LOGIC of `checkGrowthJourney`, exercised against fixture health
 *    reports. The load-bearing rule is that it never returns `critical` and
 *    returns `ok` for a correctly dark system: `runFullSystemHealthCheck` derives
 *    `overall_status` from its checks, so a dark subsystem that reported a
 *    problem would leave the whole platform permanently degraded;
 *  - the WIRING, asserted against the source of `systemHealthService.ts`. A unit
 *    test of the function cannot notice that nobody calls it, and running the
 *    real `runFullSystemHealthCheck` would mean standing up eight unrelated
 *    checks. So the call's presence in the `Promise.allSettled` list is asserted
 *    the same way `adminRoutes.order.test.ts` asserts a mount position - by
 *    reading the file. A producer nobody calls is the failure this catches.
 */

const buildJourneyHealth = jest.fn();
jest.mock('../../growthJourney/health/journeyHealth', () => ({ buildJourneyHealth: (...a: unknown[]) => buildJourneyHealth(...a) }));

import { checkGrowthJourney } from '../growthJourneyCheck';

type Check = { name: string; severity: string; detail: string; metric?: number };

const DARK = {
  receipts: [],
  stuck_pending_review: { count: 0, over_hours: 72 },
  held: { total: 0, by_reason: {} },
  refused: { total: 0, by_reason: {}, capped: false },
  crons: [
    { agent: 'GrowthJourneyShadowDecisions', schedule: '20 4 * * *', state: 'disabled', last_run_at: null, minutes_since: null },
    { agent: 'GrowthJourneyExecutor', schedule: '*/15 14-22 * * 1-5', state: 'disabled', last_run_at: null, minutes_since: null },
    { agent: 'GrowthJourneyHandoffDigest', schedule: '30 12 * * 1-5', state: 'disabled', last_run_at: null, minutes_since: null },
  ],
  controls: { pause: 0, rollout: 0 },
  journey_hold_rows: 0,
  ledger_read: 'ok' as const,
  window_hours: 24,
  as_of: '2026-09-29T18:00:00.000Z',
  truncated: [] as string[],
};

const run = async (health: unknown): Promise<Check[]> => {
  buildJourneyHealth.mockResolvedValue(health);
  const checks: Check[] = [];
  await checkGrowthJourney(checks as never);
  return checks;
};

beforeEach(() => jest.clearAllMocks());

describe('the entry is always present and never critical', () => {
  it('a correctly dark system -> ok, and says it is dark on purpose', async () => {
    const checks = await run(DARK);
    expect(checks).toHaveLength(1);
    expect(checks[0].name).toBe('growth_journey');
    expect(checks[0].severity).toBe('ok');
    expect(checks[0].detail).toContain('Dark as configured');
    expect(checks[0].metric).toBe(0);
  });

  it('every problem at once is still only a warning, never critical', async () => {
    const checks = await run({
      ...DARK,
      stuck_pending_review: { count: 9, over_hours: 72 },
      receipts: [{ status: 'failed', count: 4, max_age_hours: 30 }],
      ledger_read: 'timed_out',
      crons: DARK.crons.map((c) => ({ ...c, state: 'late' })),
    });
    expect(checks).toHaveLength(1);
    // The journey cannot cause an outage of the platform, and the one thing that
    // would be urgent - sending - it cannot do while the flags are off.
    expect(checks[0].severity).toBe('warning');
    expect(checks[0].severity).not.toBe('critical');
    expect(checks[0].metric).toBe(9);
  });

  it('the reader throwing -> a warning naming the class, not an absent entry', async () => {
    buildJourneyHealth.mockRejectedValue(Object.assign(new Error('nope'), { name: 'SequelizeDatabaseError' }));
    const checks: Check[] = [];
    await expect(checkGrowthJourney(checks as never)).resolves.toBeUndefined();
    expect(checks).toHaveLength(1);
    expect(checks[0].severity).toBe('warning');
    expect(checks[0].detail).toBe('Check failed: SequelizeDatabaseError');
    // the message itself is NOT interpolated: an error message can carry anything
    expect(checks[0].detail).not.toContain('nope');
  });
});

describe('what counts as a problem, one axis at a time', () => {
  it('a stuck receipt past the reconciler TTL', async () => {
    const checks = await run({ ...DARK, stuck_pending_review: { count: 3, over_hours: 72 } });
    expect(checks[0].severity).toBe('warning');
    expect(checks[0].detail).toContain('3 receipt(s) still pending review past 72h');
    expect(checks[0].metric).toBe(3);
  });

  it('a LATE cron is named; a disabled one is not', async () => {
    const checks = await run({
      ...DARK,
      crons: [
        { ...DARK.crons[0], state: 'disabled' },
        { ...DARK.crons[1], state: 'late' },
        { ...DARK.crons[2], state: 'disabled' },
      ],
    });
    expect(checks[0].severity).toBe('warning');
    expect(checks[0].detail).toContain('late cron(s): GrowthJourneyExecutor');
    expect(checks[0].detail).not.toContain('GrowthJourneyShadowDecisions');
  });

  it('an unreadable ledger is reported as a gap in the answer, not as health', async () => {
    const checks = await run({ ...DARK, ledger_read: 'timed_out' });
    expect(checks[0].severity).toBe('warning');
    expect(checks[0].detail).toContain('the event ledger answered timed_out');
  });

  it('receipts in failed', async () => {
    const checks = await run({ ...DARK, receipts: [{ status: 'failed', count: 2, max_age_hours: 5 }] });
    expect(checks[0].severity).toBe('warning');
    expect(checks[0].detail).toContain('2 receipt(s) in failed');
  });

  it('a TRUNCATED read is a problem: the numbers under it are floors, not totals', async () => {
    const checks = await run({ ...DARK, truncated: ['held', 'refused'] });
    expect(checks[0].severity).toBe('warning');
    expect(checks[0].detail).toContain('hit their row cap and report a floor, not a total: held, refused');
  });

  it('receipts in a NON-failed status are not a problem', async () => {
    const checks = await run({ ...DARK, receipts: [{ status: 'completed', count: 40, max_age_hours: 5 }] });
    expect(checks[0].severity).toBe('ok');
  });

  it('an enabled, on-time system with nothing wrong -> ok, and does not claim to be dark', async () => {
    const checks = await run({
      ...DARK,
      crons: DARK.crons.map((c) => ({ ...c, state: 'on_time', minutes_since: 3 })),
      receipts: [{ status: 'completed', count: 12, max_age_hours: 9 }],
    });
    expect(checks[0].severity).toBe('ok');
    expect(checks[0].detail).toContain('Journey crons on time');
    expect(checks[0].detail).not.toContain('Dark as configured');
  });

  it('a held message is NOT a problem - withholding is the feature working', async () => {
    const checks = await run({ ...DARK, held: { total: 14, by_reason: { 'journey_hold:pause:brand': 14 } }, journey_hold_rows: 14 });
    expect(checks[0].severity).toBe('ok');
  });
});

describe('the wiring: systemHealthService actually calls it', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'systemHealthService.ts'), 'utf8').replace(/\r\n/g, '\n');

  it('imports and calls checkGrowthJourney inside the allSettled list', () => {
    expect(source).toContain("import { checkGrowthJourney } from './health/growthJourneyCheck';");
    const settled = source.slice(source.indexOf('await Promise.allSettled(['), source.indexOf(']);', source.indexOf('await Promise.allSettled([')));
    expect(settled).toContain('checkGrowthJourney(checks),');
  });

  it('still calls the two extracted checks, from their new home', () => {
    expect(source).toContain("import { checkSequenceProgression } from './health/sequenceProgressionCheck';");
    expect(source).toContain("import { checkCampaignHealth } from './health/campaignHealthCheck';");
    const settled = source.slice(source.indexOf('await Promise.allSettled(['), source.indexOf(']);', source.indexOf('await Promise.allSettled([')));
    expect(settled).toContain('checkSequenceProgression(checks),');
    expect(settled).toContain('checkCampaignHealth(checks),');
    // nine checks now, and the journey is the one that was added
    expect(settled.match(/check\w+\(checks\),/g)).toHaveLength(9);
  });

  it('stays under the 500-line ceiling, which is why the split happened at all', () => {
    expect(source.split('\n').length).toBeLessThanOrEqual(500);
  });
});
