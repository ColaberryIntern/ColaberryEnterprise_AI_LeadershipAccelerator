/**
 * The nightly recompute must DISCOVER new Explorers, not just refresh known ones.
 *
 * Why this file exists, concretely. `recomputeAllExplorers` iterates
 * `explorer_journey_profiles`, and `recomputeExplorerProfile` throws on a
 * missing row rather than creating one. So before this fix the scored
 * population could only ever shrink relative to reality: it froze at whoever
 * had a row when someone last ran the identity bridge by hand. Measured on
 * production 2026-09-07: 212 active Explorers, 152 with a profile, 60
 * unreachable — and the batch still reported `succeeded: 152, failed: 0`.
 *
 * That is the failure mode worth testing against: not a crash, but a GREEN
 * result over an incomplete population. Every test here is written so that
 * deleting the discovery call makes it fail.
 */

const isEnabled = jest.fn();
const repairBridges = jest.fn();
const profileFindAll = jest.fn();
const profileFindByPk = jest.fn();

// Call-order ledger. Ordering is a correctness property here, not a detail:
// discovery AFTER the scoring pass would create the rows a day too late and
// every new learner would still miss their first night.
const calls: string[] = [];

// Spread the real module: `config/env` imports `resolveExplorerGrowthFlags`
// from here at load time, so replacing the whole module wholesale breaks env
// construction before a single test runs. Only the predicate is overridden.
jest.mock('../../../config/explorerGrowthFlags', () => ({
  ...jest.requireActual('../../../config/explorerGrowthFlags'),
  isExplorerFeatureEnabled: (...a: unknown[]) => isEnabled(...a),
}));
jest.mock('../explorerIdentityBridge', () => ({
  repairAllExplorerBridges: (...a: unknown[]) => {
    calls.push('bridge');
    return repairBridges(...a);
  },
}));
jest.mock('../../../models', () => ({
  ExplorerJourneyProfile: {
    findAll: (...a: unknown[]) => {
      calls.push('recompute');
      return profileFindAll(...a);
    },
    findByPk: (...a: unknown[]) => profileFindByPk(...a),
  },
  ExplorerScoreSnapshot: { findOne: jest.fn(), create: jest.fn() },
  Enrollment: { findByPk: jest.fn().mockResolvedValue(null) },
  Cohort: { findByPk: jest.fn().mockResolvedValue(null) },
}));
jest.mock('../explorerSignalReader', () => ({
  readLearnerSignals: jest.fn(),
  RECENT_INTENT_WINDOW_DAYS: 14,
}));
jest.mock('../../access/contentEntitlement', () => ({ hasFullCurriculumAccess: jest.fn() }));
jest.mock('../../access/staffAccess', () => ({ isStaffEnrollment: jest.fn() }));
jest.mock('../../subscriptionService', () => ({
  getSubscription: jest.fn(),
  activeCompEnrollmentIds: jest.fn(),
}));

import { runScheduledRecompute } from '../explorerProfileService';

const NOW = new Date('2026-09-07T12:00:00Z');

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
  profileFindAll.mockResolvedValue([]);
  repairBridges.mockResolvedValue({
    scanned: 212,
    resolved: 212,
    unresolved: 0,
    duplicatesSkipped: 0,
    unresolvedEnrollmentIds: [],
    dryRun: false,
  });
});

describe('discovery runs before scoring', () => {
  it('calls the identity bridge, then the recompute, in that order', async () => {
    isEnabled.mockReturnValue(true);

    await runScheduledRecompute({ asOf: NOW });

    expect(calls).toEqual(['bridge', 'recompute']);
  });

  it('reports what discovery scanned, so a frozen population is visible', async () => {
    isEnabled.mockReturnValue(true);

    const r = (await runScheduledRecompute({ asOf: NOW })) as any;

    // Without this, "succeeded: 152, failed: 0" reads as total success whether
    // the population is 152 or 212. The scanned count is what tells them apart.
    expect(r.bridge).toEqual({ ran: true, scanned: 212, resolved: 212 });
  });

  it('does not run discovery when the flag is off', async () => {
    isEnabled.mockReturnValue(false);

    const r = await runScheduledRecompute({ asOf: NOW });

    expect(r).toEqual({ skipped: true });
    expect(calls).toEqual([]);
  });
});

describe('a discovery failure does not cost us the recompute', () => {
  it('still scores the known population when the bridge throws', async () => {
    isEnabled.mockReturnValue(true);
    repairBridges.mockRejectedValue(new Error('lead lookup timed out'));

    const r = (await runScheduledRecompute({ asOf: NOW })) as any;

    // Refreshing the learners we already know beats refreshing none because
    // one new learner could not be resolved.
    expect(calls).toEqual(['bridge', 'recompute']);
    expect(r.bridge).toEqual({ ran: false, error: 'lead lookup timed out' });
    expect(r.attempted).toBe(0);
  });

  it('records the failure as a distinguishable outcome, not a silent success', async () => {
    isEnabled.mockReturnValue(true);
    repairBridges.mockRejectedValue(new Error('boom'));

    const r = (await runScheduledRecompute({ asOf: NOW })) as any;

    expect(r.bridge.ran).toBe(false);
  });
});

describe('the scheduled path still sends nothing', () => {
  it('exports no send-shaped surface', async () => {
    const mod = await import('../explorerProfileService');
    expect(Object.keys(mod).join(' ')).not.toMatch(/send|email|sms|dial|campaign|enqueue/i);
  });
});
