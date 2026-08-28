import * as fs from 'fs';
import * as path from 'path';

const flagMock = jest.fn();
const syncMock = jest.fn();
const retireMock = jest.fn();
const queryMock = jest.fn();

jest.mock('../../../../config/explorerGrowthFlags', () => ({
  isExplorerFeatureEnabled: (...a: unknown[]) => flagMock(...a),
}));
// The real signature takes (feature, flags). An earlier mock here took one
// argument, every test passed, and only `tsc` noticed - the mock was encoding
// my assumption about the function rather than the function.
jest.mock('../../../../config/env', () => ({ env: { explorerGrowth: {} } }));
jest.mock('../syncTimelineCards', () => ({
  syncTimelineCards: (...a: unknown[]) => syncMock(...a),
  retireMissingCards: (...a: unknown[]) => retireMock(...a),
}));
jest.mock('../../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => queryMock(...a) },
}));

import { runContentSync } from '../runContentSync';

beforeEach(() => {
  flagMock.mockReset().mockReturnValue(true);
  syncMock.mockReset().mockResolvedValue({ scanned: 585, written: 585, skipped: [] });
  retireMock.mockReset().mockResolvedValue(0);
  queryMock.mockReset().mockResolvedValue([{ id: 'card-1' }]);
});

/**
 * EPIC 5 T006. The assertion that matters most here is the first one: this
 * subsystem must ship dark, and a prod-writing cron with no gate would break
 * that on the first deploy.
 */
describe('it ships dark', () => {
  it('writes NOTHING when the feature flag is off', async () => {
    flagMock.mockReturnValue(false);
    const result = await runContentSync();
    expect(syncMock).not.toHaveBeenCalled();
    expect(retireMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      scanned: 0,
      written: 0,
      skipped: [],
      retired: 0,
      skippedReason: 'flag_off',
    });
  });

  it('says WHY it did nothing, so a no-op is not mistaken for a failure', async () => {
    // A cron that returns silently on a disabled feature and one that returns
    // silently on an error look identical in a log. This is the difference.
    flagMock.mockReturnValue(false);
    const result = await runContentSync();
    expect(result.skippedReason).toBe('flag_off');
  });

  it('gates on journeyIntelligence, the same sub-flag as the recompute', async () => {
    await runContentSync();
    expect(flagMock).toHaveBeenCalledWith('journeyIntelligence', expect.anything());
  });

  it('reads the flag ONLY through isExplorerFeatureEnabled', () => {
    // The dark-launch guard test scans backend source and fails on any direct
    // sub-flag property read. This asserts the same thing locally, where the
    // failure names this file rather than a repo-wide sweep.
    const src = fs.readFileSync(path.join(__dirname, '..', 'runContentSync.ts'), 'utf8');
    expect(src).toContain('isExplorerFeatureEnabled');
    expect(src).not.toContain('journeyIntelligenceEnabled');
    expect(src).not.toContain('EXPLORER_JOURNEY_INTELLIGENCE_ENABLED');
  });
});

describe('it projects, and nothing more', () => {
  it('runs the sync when the flag is on', async () => {
    const result = await runContentSync();
    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(result.written).toBe(585);
    expect(result.skippedReason).toBeUndefined();
  });

  it('retires only after a sync that actually saw content', async () => {
    // A scan reaching nothing means the sync failed to read the source, not
    // that 585 cards were withdrawn overnight. Retiring on that reading would
    // deactivate the whole registry.
    syncMock.mockResolvedValue({ scanned: 0, written: 0, skipped: [] });
    await runContentSync();
    expect(retireMock).not.toHaveBeenCalled();
  });

  it('passes the source ids it re-read, not a list built during the sync', async () => {
    queryMock.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    await runContentSync();
    expect(retireMock).toHaveBeenCalledWith(['a', 'b']);
  });

  it('reports how many rows it retired', async () => {
    retireMock.mockResolvedValue(4);
    const result = await runContentSync();
    expect(result.retired).toBe(4);
  });
});

describe('it is registered where a human can stop it', () => {
  it('appears in agentRegistrySeed so Admin > Agents can pause it', () => {
    // Without this the job runs but has no row to pause, and stopping it needs
    // a redeploy — which is exactly the situation the registry exists to avoid.
    const seed = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'agentRegistrySeed.ts'),
      'utf8',
    );
    expect(seed).toContain("agent_name: 'ExplorerContentSync'");
    expect(seed).toContain('runContentSync.ts');
  });

  it('is scheduled BEFORE the recompute and the Governor', async () => {
    // 02:50 sync -> 03:20 recompute -> 03:50 decide. The Governor resolves
    // content at decision time, so a registry refreshed after it ran would
    // serve yesterday's catalogue for a day.
    const scheduler = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'schedulerService.ts'),
      'utf8',
    );
    const syncAt = scheduler.indexOf("cron.schedule('50 2 * * *'");
    expect(syncAt).toBeGreaterThan(-1);
    expect(scheduler).toContain("instrumentCronJob('ExplorerContentSync'");
  });

  it('the sync tree never imports the scheduler back', () => {
    // scheduler -> sync is fine; sync -> scheduler would put a cron registrar
    // inside a module the no-send guard requires to stay inert.
    const src = fs.readFileSync(path.join(__dirname, '..', 'runContentSync.ts'), 'utf8');
    expect(src).not.toContain('schedulerService');
  });
});
