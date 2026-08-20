const profileFindByPk = jest.fn();
const profileFindAll = jest.fn();
const snapFindOne = jest.fn();
const snapCreate = jest.fn();
const readSignals = jest.fn();
const resolveAccess = jest.fn();
const getSub = jest.fn();

jest.mock('../../../models', () => ({
  ExplorerJourneyProfile: {
    findByPk: (...a: unknown[]) => profileFindByPk(...a),
    findAll: (...a: unknown[]) => profileFindAll(...a),
  },
  ExplorerScoreSnapshot: {
    findOne: (...a: unknown[]) => snapFindOne(...a),
    create: (...a: unknown[]) => snapCreate(...a),
  },
}));
jest.mock('../explorerSignalReader', () => ({
  readLearnerSignals: (...a: unknown[]) => readSignals(...a),
  RECENT_INTENT_WINDOW_DAYS: 14,
}));
jest.mock('../../access/contentEntitlement', () => ({
  resolveContentPageAccess: (...a: unknown[]) => resolveAccess(...a),
}));
jest.mock('../../subscriptionService', () => ({
  getSubscription: (...a: unknown[]) => getSub(...a),
}));
jest.mock('../../../config/explorerGrowthFlags', () => {
  const actual = jest.requireActual('../../../config/explorerGrowthFlags');
  return { ...actual };
});

import {
  recomputeExplorerProfile,
  recomputeAllExplorers,
  runScheduledRecompute,
} from '../explorerProfileService';

const ENR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW = new Date('2026-08-20T12:00:00Z');

function emptyReadout(over: Record<string, unknown> = {}) {
  const band = (b: string) => ({ band: b, total: 0, signals: [] });
  return {
    enrollment_id: ENR,
    lead_id: null,
    asOf: NOW,
    bands: { engagement: band('engagement'), intent: band('intent'), friction: band('friction') },
    highestIntentTier: 0,
    recentIntentTier: 0,
    lastEngagementAt: null,
    ...over,
  };
}

let profileUpdate: jest.Mock;

beforeEach(() => {
  [profileFindByPk, profileFindAll, snapFindOne, snapCreate, readSignals, resolveAccess, getSub]
    .forEach((m) => m.mockReset());
  profileUpdate = jest.fn().mockResolvedValue(undefined);
  profileFindByPk.mockResolvedValue({
    enrollment_id: ENR,
    primary_state: 'NEW_EXPLORER',
    state_entered_at: null,
    created_at: NOW,
    update: profileUpdate,
  });
  readSignals.mockResolvedValue(emptyReadout());
  resolveAccess.mockResolvedValue({ isStaff: false, hasFullAccess: false });
  getSub.mockResolvedValue({ subscription: null });
  snapFindOne.mockResolvedValue(null);
  snapCreate.mockResolvedValue({});
});

describe('idempotency — the property that makes shadow mode trustworthy', () => {
  it('produces IDENTICAL output on two consecutive runs with the same asOf', async () => {
    const a = await recomputeExplorerProfile(ENR, { asOf: NOW });
    const b = await recomputeExplorerProfile(ENR, { asOf: NOW });
    expect(b).toEqual(a);
  });

  it('writes the same profile columns both times — scores are recomputed, never incremented', async () => {
    await recomputeExplorerProfile(ENR, { asOf: NOW });
    await recomputeExplorerProfile(ENR, { asOf: NOW });
    expect(profileUpdate.mock.calls[1][0]).toEqual(profileUpdate.mock.calls[0][0]);
  });

  it('UPDATES rather than duplicating when a snapshot for the day already exists', async () => {
    const snapUpdate = jest.fn().mockResolvedValue(undefined);
    snapFindOne.mockResolvedValue({ update: snapUpdate });
    await recomputeExplorerProfile(ENR, { asOf: NOW });
    expect(snapUpdate).toHaveBeenCalled();
    expect(snapCreate).not.toHaveBeenCalled();
  });

  it('creates exactly one snapshot keyed on the UTC date', async () => {
    await recomputeExplorerProfile(ENR, { asOf: NOW });
    expect(snapCreate).toHaveBeenCalledTimes(1);
    expect(snapCreate.mock.calls[0][0]).toMatchObject({ enrollment_id: ENR, as_of_date: '2026-08-20' });
  });
});

describe('dryRun writes nothing', () => {
  it('computes and returns without touching either table', async () => {
    const r = await recomputeExplorerProfile(ENR, { asOf: NOW, dryRun: true });
    expect(r.written).toBe(false);
    expect(r.primary_state).toBeDefined();
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(snapCreate).not.toHaveBeenCalled();
  });
});

describe('the profile write is column-scoped', () => {
  it('never writes lead_id or last_contacted_at', async () => {
    // lead_id is EPIC 1's identity bridge; last_contacted_at belongs to EPIC 4.
    // A whole-row replace would silently drop both.
    await recomputeExplorerProfile(ENR, { asOf: NOW });
    const written = profileUpdate.mock.calls[0][0];
    expect(written).not.toHaveProperty('lead_id');
    expect(written).not.toHaveProperty('last_contacted_at');
    expect(written).not.toHaveProperty('email_normalized');
  });

  it('stamps scores_computed_at so EPIC 4 can detect a stale profile', async () => {
    await recomputeExplorerProfile(ENR, { asOf: NOW });
    expect(profileUpdate.mock.calls[0][0].scores_computed_at).toEqual(NOW);
  });

  it('records days_since_last_activity, and null when never active', async () => {
    await recomputeExplorerProfile(ENR, { asOf: NOW });
    expect(profileUpdate.mock.calls[0][0].days_since_last_activity).toBeNull();

    readSignals.mockResolvedValue(
      emptyReadout({ lastEngagementAt: new Date(NOW.getTime() - 5 * 86_400_000) }),
    );
    await recomputeExplorerProfile(ENR, { asOf: NOW });
    expect(profileUpdate.mock.calls[1][0].days_since_last_activity).toBe(5);
  });
});

describe('CONVERTED via entitlement OR subscription', () => {
  it('converts on full curriculum access alone', async () => {
    resolveAccess.mockResolvedValue({ isStaff: false, hasFullAccess: true });
    const r = await recomputeExplorerProfile(ENR, { asOf: NOW });
    expect(r.primary_state).toBe('CONVERTED');
  });

  it('converts on an active non-comp subscription alone', async () => {
    getSub.mockResolvedValue({ subscription: { status: 'active', plan: 'monthly' } });
    const r = await recomputeExplorerProfile(ENR, { asOf: NOW });
    expect(r.primary_state).toBe('CONVERTED');
  });

  it('does NOT convert on a comped subscription', async () => {
    // A comped learner is exactly the population EPIC 4 still needs to convert.
    getSub.mockResolvedValue({ subscription: { status: 'active', plan: 'comp' } });
    const r = await recomputeExplorerProfile(ENR, { asOf: NOW });
    expect(r.primary_state).not.toBe('CONVERTED');
  });

  it('does NOT convert on an inactive subscription', async () => {
    getSub.mockResolvedValue({ subscription: { status: 'cancelled', plan: 'monthly' } });
    const r = await recomputeExplorerProfile(ENR, { asOf: NOW });
    expect(r.primary_state).not.toBe('CONVERTED');
  });

  it('fails CLOSED when entitlement lookup throws — not converted', async () => {
    // Worst case must be a paying learner briefly scored as a prospect, never
    // a prospect wrongly marked converted and dropped from every campaign.
    resolveAccess.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await recomputeExplorerProfile(ENR, { asOf: NOW });
    expect(r.primary_state).not.toBe('CONVERTED');
  });
});

describe('batch behaviour', () => {
  it('does not abort the batch when one learner fails', async () => {
    // A single bad row must not leave every other learner stale.
    profileFindAll.mockResolvedValue([
      { enrollment_id: 'good-1' },
      { enrollment_id: 'bad' },
      { enrollment_id: 'good-2' },
    ]);
    profileFindByPk.mockImplementation((id: string) =>
      id === 'bad'
        ? Promise.resolve(null)
        : Promise.resolve({
            enrollment_id: id,
            primary_state: 'NEW_EXPLORER',
            state_entered_at: null,
            created_at: NOW,
            update: jest.fn().mockResolvedValue(undefined),
          }),
    );

    const r = await recomputeAllExplorers({ asOf: NOW });

    expect(r.attempted).toBe(3);
    expect(r.succeeded).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.errors[0].enrollment_id).toBe('bad');
  });
});

describe('the scheduled entry point is dark by default', () => {
  it('skips entirely when the flag is off, reading and writing nothing', async () => {
    const r = await runScheduledRecompute({ asOf: NOW });
    expect(r).toEqual({ skipped: true });
    expect(profileFindAll).not.toHaveBeenCalled();
    expect(profileUpdate).not.toHaveBeenCalled();
  });
});

describe('nothing in this service sends', () => {
  it('exports no send path', async () => {
    const mod = await import('../explorerProfileService');
    const names = Object.keys(mod).join(' ');
    expect(names).not.toMatch(/send|email|sms|dial|campaign|enqueue/i);
  });
});
