const query = jest.fn();
const campaignFindOne = jest.fn();
const campaignUpdate = jest.fn();
const campaignCreate = jest.fn();
const sequenceCreate = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));
jest.mock('../../models', () => ({
  Campaign: { findOne: (...a: unknown[]) => campaignFindOne(...a), update: (...a: unknown[]) => campaignUpdate(...a), create: (...a: unknown[]) => campaignCreate(...a) },
  FollowUpSequence: { create: (...a: unknown[]) => sequenceCreate(...a) },
}));
jest.mock('../../services/aliPersonalOutreachService', () => ({ CAMPAIGN_NAME: 'Ali Personal Outreach', CAMPAIGN_TYPE: 'executive_outreach' }));

import { parseArgs, run } from '../growthJourneyExecutionSetup';
import { EXPLORER_CAMPAIGN_KEYS } from '../../services/growthJourney/execution/campaignKeys';

/**
 * T505 — the setup script never writes on a dry run, refuses a stale
 * expect-count, stops on a refusal, and only then applies the plan.
 */

const BRANDS = [
  { tenant_id: 't-col', tenant_slug: 'colaberry', brand_id: 'b-trn', brand_slug: 'colaberry-training' },
  { tenant_id: 't-col', tenant_slug: 'colaberry', brand_id: 'b-ent', brand_slug: 'colaberry-enterprise' },
  { tenant_id: 't-flo', tenant_slug: 'ai-flotation', brand_id: 'b-flo', brand_slug: 'ai-flotation' },
];

function arrangeShipped() {
  query.mockResolvedValue(BRANDS);
  campaignFindOne.mockImplementation(async ({ where }: { where: { settings?: { campaign_key?: string }; name?: string } }) => {
    if (where.name === 'Ali Personal Outreach') return { id: 'c-ali', name: 'Ali Personal Outreach', tenant_id: null, brand_id: null, settings: { daily_cap: 10 } };
    const key = where.settings?.campaign_key;
    if (key && (EXPLORER_CAMPAIGN_KEYS as readonly string[]).includes(key)) return { id: `c-${key}`, name: key, tenant_id: null, brand_id: null, settings: { campaign_key: key, test_mode_enabled: true } };
    return null;
  });
}

const writes = () => campaignUpdate.mock.calls.length + campaignCreate.mock.calls.length + sequenceCreate.mock.calls.length;

beforeEach(() => {
  for (const fn of [query, campaignFindOne, campaignUpdate, campaignCreate, sequenceCreate]) fn.mockReset();
  campaignUpdate.mockResolvedValue([1]);
  sequenceCreate.mockImplementation(async (attrs: Record<string, unknown>) => ({ id: 's-new', ...attrs }));
  campaignCreate.mockImplementation(async (attrs: Record<string, unknown>) => ({ id: 'c-new', ...attrs }));
  delete process.env.DATABASE_URL;
});

describe('parseArgs', () => {
  it('is a dry run unless --confirm-production, which needs --expect-count', () => {
    expect(parseArgs(['register-campaigns'])).toEqual({ subcommand: 'register-campaigns', dryRun: true, confirmProduction: false, expectCount: null });
    expect(parseArgs(['create-flow-drafts', '--dry-run'])).toMatchObject({ dryRun: true });
    expect(parseArgs(['register-campaigns', '--confirm-production', '--expect-count', '9'])).toEqual({ subcommand: 'register-campaigns', dryRun: false, confirmProduction: true, expectCount: 9 });
    expect(() => parseArgs(['register-campaigns', '--confirm-production'])).toThrow(/--expect-count/);
    expect(() => parseArgs(['nope'])).toThrow(/usage/);
    expect(() => parseArgs(['register-campaigns', '--force'])).toThrow(/unknown flag/);
  });
});

describe('run', () => {
  it('a dry run over the shipped state prints the 8 + 1 plan and writes NOTHING', async () => {
    arrangeShipped();
    const out: string[] = [];
    expect(await run(parseArgs(['register-campaigns', '--dry-run']), (l) => out.push(l))).toBe(0);
    expect(out[0]).toBe('[dry-run] register-campaigns: 9 write(s), 0 refusal(s)');
    expect(out.filter((l) => l.startsWith('  stamp'))).toHaveLength(8);
    expect(out.filter((l) => l.startsWith('  merge_key'))).toHaveLength(1);
    expect(out.at(-1)).toMatch(/nothing written.*--expect-count 9/);
    expect(writes()).toBe(0);
  });

  it('a dry run of the drafts prints 2 and writes nothing', async () => {
    arrangeShipped();
    const out: string[] = [];
    expect(await run(parseArgs(['create-flow-drafts']), (l) => out.push(l))).toBe(0);
    expect(out[0]).toBe('[dry-run] create-flow-drafts: 2 write(s), 0 refusal(s)');
    expect(writes()).toBe(0);
  });

  it('--confirm-production with a stale --expect-count refuses and writes nothing', async () => {
    arrangeShipped();
    const out: string[] = [];
    expect(await run(parseArgs(['register-campaigns', '--confirm-production', '--expect-count', '8']), (l) => out.push(l))).toBe(2);
    expect(out.at(-1)).toMatch(/--expect-count 8 but the plan would write 9/);
    expect(writes()).toBe(0);
  });

  it('a plan with a refusal stops before any write, even with the right count', async () => {
    arrangeShipped();
    campaignFindOne.mockImplementation(async ({ where }: { where: { settings?: { campaign_key?: string }; name?: string } }) => {
      if (where.name) return { id: 'c-ali', name: 'x', tenant_id: null, brand_id: null, settings: { campaign_key: 'other' } };
      const key = where.settings?.campaign_key;
      return key ? { id: `c-${key}`, name: key, tenant_id: null, brand_id: null, settings: { campaign_key: key } } : null;
    });
    const out: string[] = [];
    expect(await run(parseArgs(['register-campaigns', '--confirm-production', '--expect-count', '8']), (l) => out.push(l))).toBe(2);
    expect(out.some((l) => /REFUSE\s+ali_personal_outreach/.test(l))).toBe(true);
    expect(writes()).toBe(0);
  });

  it('with the right count it applies exactly the plan: 8 stamps and 1 merged settings write, each by campaign id', async () => {
    arrangeShipped();
    const out: string[] = [];
    expect(await run(parseArgs(['register-campaigns', '--confirm-production', '--expect-count', '9']), (l) => out.push(l))).toBe(0);
    expect(campaignUpdate).toHaveBeenCalledTimes(9);
    const stamps = campaignUpdate.mock.calls.filter((c) => !('settings' in (c[0] as object)));
    expect(stamps).toHaveLength(8);
    for (const [patch, opts] of stamps) expect([patch, opts]).toEqual([{ tenant_id: 't-col', brand_id: 'b-trn' }, { where: { id: expect.stringMatching(/^c-explorer_/) } }]);
    const [merge] = campaignUpdate.mock.calls.filter((c) => 'settings' in (c[0] as object));
    expect(merge).toEqual([{ settings: { daily_cap: 10, campaign_key: 'ali_personal_outreach' }, tenant_id: 't-col', brand_id: 'b-ent' }, { where: { id: 'c-ali' } }]);
    expect(campaignCreate).not.toHaveBeenCalled();
    expect(out.at(-1)).toBe('written: 9 row(s).');
  });

  it('the drafts are created draft, unapproved, test mode, brand-stamped, with an INACTIVE one-step sequence', async () => {
    arrangeShipped();
    expect(await run(parseArgs(['create-flow-drafts', '--confirm-production', '--expect-count', '2']), () => undefined)).toBe(0);
    expect(sequenceCreate).toHaveBeenCalledTimes(2);
    expect(campaignCreate).toHaveBeenCalledTimes(2);
    for (const [seq] of sequenceCreate.mock.calls) {
      expect(seq).toMatchObject({ is_active: false });
      expect((seq as { steps: unknown[] }).steps).toHaveLength(1);
    }
    const [[biz], [flo]] = campaignCreate.mock.calls;
    expect(biz).toMatchObject({ status: 'draft', approval_status: 'draft', type: 'warm_nurture', tenant_id: 't-col', brand_id: 'b-ent', sequence_id: 's-new', settings: { campaign_key: 'gj_colaberry_business_discovery_questions', test_mode_enabled: true } });
    expect(flo).toMatchObject({ status: 'draft', approval_status: 'draft', tenant_id: 't-flo', brand_id: 'b-flo', settings: { campaign_key: 'gj_ai_flotation_discovery_questions', test_mode_enabled: true } });
    expect(JSON.stringify(campaignCreate.mock.calls)).not.toMatch(/"status":"active"|"is_active":true/);
  });

  it('a write against what looks like production without the flag is refused before anything is read', async () => {
    process.env.DATABASE_URL = 'postgres://x@db/accelerator_prod';
    const args = { subcommand: 'register-campaigns' as const, dryRun: false, confirmProduction: false, expectCount: 9 };
    await expect(run(args, () => undefined)).rejects.toThrow(/--confirm-production/);
    expect(query).not.toHaveBeenCalled();
  });
});
