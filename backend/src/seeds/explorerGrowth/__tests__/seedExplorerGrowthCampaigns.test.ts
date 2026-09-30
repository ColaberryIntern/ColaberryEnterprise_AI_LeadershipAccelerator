import * as fs from 'fs';
import * as path from 'path';

const campaignFindOne = jest.fn();
const campaignCreate = jest.fn();
const sequenceFindOne = jest.fn();
const sequenceCreate = jest.fn();

jest.mock('../../../models', () => ({
  Campaign: {
    findOne: (...a: unknown[]) => campaignFindOne(...a),
    create: (...a: unknown[]) => campaignCreate(...a),
  },
  FollowUpSequence: {
    findOne: (...a: unknown[]) => sequenceFindOne(...a),
    create: (...a: unknown[]) => sequenceCreate(...a),
  },
}));

import { seedExplorerGrowthCampaigns } from '../seedExplorerGrowthCampaigns';

/**
 * EPIC 6 T003.
 *
 * WHERE EACH HALF OF THE GUARD RUNS — because a database read cannot run in this
 * repo's CI. `.github/workflows/ci.yml` runs jest with no Postgres service and no
 * `DATABASE_URL`, so a test calling `FollowUpSequence.findAll()` would burn the
 * 30s pool acquire and throw. It would land either red on every PR or silenced on
 * `jest.ci.config.ts`'s ignore-list — a guard-shaped object either way.
 *
 *   THIS FILE          source scan + query spy      runs in CI, every PR
 *   T006 step 5        persisted rows on dev1/prod  live verification, not a unit test
 *
 * Both halves here catch a `createSequence()` swap on the PR that introduces it.
 */

const SEED_SRC = fs.readFileSync(path.join(__dirname, '..', 'seedExplorerGrowthCampaigns.ts'), 'utf8');

const sequenceRow = (over: Record<string, unknown> = {}) => ({
  id: 'seq-1',
  update: jest.fn().mockResolvedValue(undefined),
  ...over,
});

beforeEach(() => {
  campaignFindOne.mockReset().mockResolvedValue(null);
  campaignCreate.mockReset().mockResolvedValue({ id: 'camp-1' });
  sequenceFindOne.mockReset().mockResolvedValue(null);
  sequenceCreate.mockReset().mockImplementation(() => Promise.resolve(sequenceRow()));
});

/** Every `FollowUpSequence.create` payload the seed produced. */
const sequencePayloads = () => sequenceCreate.mock.calls.map((c) => c[0] as Record<string, unknown>);

describe('THE INVARIANT: every sequence is created inactive', () => {
  it('writes is_active: false on all eight', async () => {
    await seedExplorerGrowthCampaigns();
    const payloads = sequencePayloads();
    expect(payloads).toHaveLength(8);
    for (const p of payloads) expect(p.is_active).toBe(false);
  });

  it('states it EXPLICITLY rather than relying on a default', async () => {
    // FollowUpSequence.ts:71-75 declares `defaultValue: true`. Omitting the field
    // ships the sequence live, so its presence is the assertion, not its value.
    await seedExplorerGrowthCampaigns();
    for (const p of sequencePayloads()) expect(Object.keys(p)).toContain('is_active');
  });

  it('re-asserts it on a PRE-EXISTING sequence rather than inheriting its state', async () => {
    // A row may survive a rollback that removed the campaigns, or an earlier
    // partial run. Inheriting whatever state it is in makes the invariant a
    // matter of history rather than of code.
    const existing = sequenceRow();
    sequenceFindOne.mockResolvedValue(existing);
    await seedExplorerGrowthCampaigns();
    expect(sequenceCreate).not.toHaveBeenCalled();
    expect((existing.update as jest.Mock).mock.calls[0][0]).toMatchObject({ is_active: false });
  });

  /**
   * NEGATIVE CONTROL — the exact mistake the codebase invites.
   *
   * `sequenceService.createSequence()` hardcodes `is_active: true` and its param
   * type has no such field, so routing this seed through it would silently drop
   * the `false` with tsc clean and every other test green.
   */
  it('does not CALL createSequence — scanned over code, not prose', () => {
    // The seed's doc comment deliberately names `createSequence()` to warn the
    // next person off it, so a whole-file substring scan flags the warning itself.
    // Strip comments first: that can only ever remove candidates that were never
    // code, never add one. (EPIC 5 hit the identical false positive when a doc
    // comment reading `different from "match nothing"` was reported as an import.)
    const code = SEED_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    expect(code).not.toContain('createSequence');
    expect(code).toContain('is_active: false');
    // Anti-vacuity: prove the stripper left real code behind, or the two
    // assertions above are satisfied by an empty string.
    expect(code).toContain('FollowUpSequence.create');
    expect(code.length).toBeGreaterThan(500);
  });
});

describe('an operator hand is never overridden', () => {
  const existingCampaign = (settings: Record<string, unknown>) => ({
    id: 'camp-1',
    get: (k: string) => (k === 'settings' ? settings : undefined),
    update: jest.fn().mockResolvedValue(undefined),
  });

  it.each([true, false])(
    'never CHANGES test_mode_enabled on update — carried through as %p',
    async (operatorValue) => {
      // NOT "never writes it". The settings write is a merge, so the key is
      // necessarily present in the payload — that is what preserves it. The
      // property that matters is that the value is unchanged. An earlier version
      // of this test asserted absence and failed against correct code, which is
      // the more dangerous kind of wrong assertion: it would have pushed the fix
      // toward a whole-object write.
      const camp = existingCampaign({ campaign_key: 'x', test_mode_enabled: operatorValue });
      campaignFindOne.mockResolvedValue(camp);
      await seedExplorerGrowthCampaigns();

      for (const call of (camp.update as jest.Mock).mock.calls) {
        expect(call[0].settings.test_mode_enabled).toBe(operatorValue);
      }
    },
  );

  it('never writes status or approval_status on update at all', async () => {
    // These two ARE absent-not-unchanged: nothing in the update payload should
    // mention them, so an operator's pause survives every boot.
    const camp = existingCampaign({ campaign_key: 'x', test_mode_enabled: true });
    campaignFindOne.mockResolvedValue(camp);
    await seedExplorerGrowthCampaigns();

    for (const call of (camp.update as jest.Mock).mock.calls) {
      expect(call[0]).not.toHaveProperty('status');
      expect(call[0]).not.toHaveProperty('approval_status');
    }
  });

  it('MERGES settings rather than replacing them', async () => {
    // Sequelize replaces JSONB wholesale. A fresh object here drops campaign_key
    // AND test_mode_enabled together; the next boot's lookup then misses, creates
    // a duplicate, and the paused original goes invisible. One line, three failures.
    const camp = existingCampaign({ campaign_key: 'explorer_weekly_digest', test_mode_enabled: false });
    campaignFindOne.mockResolvedValue(camp);
    await seedExplorerGrowthCampaigns();

    const written = (camp.update as jest.Mock).mock.calls[0][0].settings;
    expect(written.campaign_key).toBe('explorer_weekly_digest');
    expect(written.test_mode_enabled).toBe(false); // an operator's false survives
  });

  it('resolves by campaign_key, never by name', async () => {
    await seedExplorerGrowthCampaigns();
    for (const call of campaignFindOne.mock.calls) {
      expect(call[0].where).toHaveProperty('settings');
      expect(call[0].where).not.toHaveProperty('name');
    }
  });
});

describe('creation ships inert', () => {
  it('sets status, approval_status and test_mode_enabled on create', async () => {
    await seedExplorerGrowthCampaigns();
    expect(campaignCreate).toHaveBeenCalledTimes(8);
    for (const call of campaignCreate.mock.calls) {
      expect(call[0]).toMatchObject({ status: 'draft', approval_status: 'draft' });
      expect(call[0].settings.test_mode_enabled).toBe(true);
    }
  });

  it('stamps the campaign_key into settings so the Governor can find it', async () => {
    await seedExplorerGrowthCampaigns();
    const keys = campaignCreate.mock.calls.map((c) => c[0].settings.campaign_key);
    expect(new Set(keys).size).toBe(8);
    expect(keys).toContain('explorer_activation_never_started');
  });
});

describe('one failure cannot take down the other seven', () => {
  it('reports the failure and keeps going — this runs on the boot path', async () => {
    sequenceCreate
      .mockImplementationOnce(() => Promise.reject(new Error('boom')))
      .mockImplementation(() => Promise.resolve(sequenceRow()));

    const result = await seedExplorerGrowthCampaigns();
    expect(result.failed).toHaveLength(1);
    expect(result.created).toBe(7);
  });

  it('never rejects, whatever happens', async () => {
    // A seed that throws on the boot path is worse than a seed that reports a gap:
    // seedAllCampaigns is fire-and-forget and the backend is still starting up.
    campaignFindOne.mockRejectedValue(new Error('db down'));
    await expect(seedExplorerGrowthCampaigns()).resolves.toMatchObject({ created: 0 });
  });
});
