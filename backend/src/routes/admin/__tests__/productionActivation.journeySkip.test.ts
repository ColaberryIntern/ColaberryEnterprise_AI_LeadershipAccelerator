/**
 * T602 (Growth Journey Phase 6, the hardening set) — `production-activate`
 * never activates a journey campaign.
 *
 * The T522 audit found that the route's campaign loop would have activated
 * every draft campaign, the journey's registered ones included: the setup
 * script seeds them as drafts on purpose, and their activation is a governed
 * move (an approval, a rollout row), never this route's. So the loop skips any
 * row whose `settings.campaign_key` the registry knows, whatever its status.
 *
 * The control is the byte-identical unregistered path: a database with no
 * journey campaign gets exactly the report it got before this task - the same
 * `plan`, the same `activationResults`, no new key - and the journey rows, when
 * present, change nothing about the unregistered rows' own entries.
 */
const mockCampaignFindAll = jest.fn();
const mockCampaignUpdate = jest.fn();
const mockCampaignLeadCount = jest.fn();
const mockActivateCampaign = jest.fn();
const mockGetSetting = jest.fn();
const mockSetSetting = jest.fn();
const mockKillSwitch = jest.fn();
const mockQuery = jest.fn();

jest.mock('../../../models', () => ({
  Cohort: { findAll: jest.fn().mockResolvedValue([]) },
  Enrollment: { count: jest.fn().mockResolvedValue(0) },
  Campaign: { findAll: (...a: unknown[]) => mockCampaignFindAll(...a), update: (...a: unknown[]) => mockCampaignUpdate(...a) },
  CampaignLead: { count: (...a: unknown[]) => mockCampaignLeadCount(...a) },
  ScheduledEmail: { count: jest.fn().mockResolvedValue(0) },
  AiAgent: { findAll: jest.fn().mockResolvedValue([]), update: jest.fn() },
}));
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
jest.mock('../../../services/campaignService', () => ({ activateCampaign: (...a: unknown[]) => mockActivateCampaign(...a) }));
jest.mock('../../../services/settingsService', () => ({ getSetting: (...a: unknown[]) => mockGetSetting(...a), setSetting: (...a: unknown[]) => mockSetSetting(...a) }));
jest.mock('../../../services/launchSafety', () => ({ isKillSwitchActive: (...a: unknown[]) => mockKillSwitch(...a) }));
jest.mock('../../../middlewares/authMiddleware', () => ({ requireAdmin: (req: unknown, _res: unknown, next: () => void) => next() }));

import express from 'express';
import request from 'supertest';
import { ALI_OUTREACH_CAMPAIGN_KEY, FLOW_CAMPAIGN_KEYS, isRegisteredJourneyCampaignKey } from '../../../services/growthJourney/execution/campaignKeys';
import productionActivationRoute from '../productionActivationRoute';

type Row = Record<string, unknown>;
const app = express().use(express.json()).use(productionActivationRoute);
const post = (mode: 'dry-run' | 'execute') => request(app).post(`/api/admin/production-activate?mode=${mode}`).send({});

const DRAFT = { id: 'c-draft', name: 'Cold Outbound Q4', status: 'draft', type: 'cold_outbound', settings: {} };
const ACTIVE = { id: 'c-active', name: 'Nurture', status: 'active', type: 'nurture', settings: {} };
const DONE = { id: 'c-done', name: 'Spring', status: 'completed', type: 'nurture', settings: {} };
const UNREGISTERED = [DRAFT, ACTIVE, DONE];
const BIZ_FLOW = FLOW_CAMPAIGN_KEYS.colaberryBusinessDiscoveryQuestions;
const JOURNEY_DRAFT = { id: 'c-j-draft', name: 'Business discovery (journey)', status: 'draft', type: 'nurture', settings: { campaign_key: BIZ_FLOW } };
const JOURNEY_ACTIVE = { id: 'c-j-active', name: 'Ali outreach (journey)', status: 'active', type: 'outreach', settings: JSON.stringify({ campaign_key: ALI_OUTREACH_CAMPAIGN_KEY }) };
const LOOKALIKE = { id: 'c-look', name: 'Explorer something else', status: 'draft', type: 'nurture', settings: { campaign_key: 'explorer_something_else_entirely' } };

/** What the pre-change route reported for the three unregistered rows - written out, not derived. */
const PRE_CHANGE_DRY_RUN_PLAN = { status: 'dry-run preview', plan: { will_activate: 1, already_active: 1, skip: 1 } };
const PRE_CHANGE_EXECUTE = {
  activated: 1, already_active: 1, skipped: 1, errors: [],
  details: [{ name: 'Cold Outbound Q4', result: 'activated' }, { name: 'Nurture', result: 'already_active' }, { name: 'Spring', result: 'skipped' }],
};

let info: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  mockCampaignLeadCount.mockResolvedValue(0);
  mockActivateCampaign.mockResolvedValue(undefined);
  mockGetSetting.mockResolvedValue(null);
  mockSetSetting.mockResolvedValue(undefined);
  mockKillSwitch.mockResolvedValue(false);
  mockQuery.mockResolvedValue([]);
  mockCampaignUpdate.mockResolvedValue([0]);
});
afterEach(() => info.mockRestore());

const world = (rows: Row[]) => mockCampaignFindAll.mockResolvedValue(rows);
const skipLines = () => info.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('production_activate.journey_campaign_skipped')).map((l) => JSON.parse(l) as Row);

describe('control: a database with no journey campaign gets the report it always got', () => {
  it('dry run: the plan is the pre-change plan, with no journey key on it', async () => {
    world(UNREGISTERED);
    const res = await post('dry-run');
    expect(res.status).toBe(200);
    expect(res.body.phase_3_campaigns).toEqual(PRE_CHANGE_DRY_RUN_PLAN);
    expect(JSON.stringify(res.body)).not.toContain('journey');
    expect(skipLines()).toEqual([]);
  });

  it('execute: the activation results are the pre-change results, one activation, the draft', async () => {
    world(UNREGISTERED);
    const res = await post('execute');
    expect(res.status).toBe(200);
    expect(res.body.phase_3_campaigns).toEqual(PRE_CHANGE_EXECUTE);
    expect(mockActivateCampaign.mock.calls).toEqual([['c-draft']]);
    expect(JSON.stringify(res.body)).not.toContain('journey');
  });

  it('a campaign with SOME key the registry does not know is unregistered, and is activated as before', async () => {
    expect(isRegisteredJourneyCampaignKey('explorer_something_else_entirely')).toBe(false);
    world([LOOKALIKE]);
    const res = await post('execute');
    expect(res.body.phase_3_campaigns).toEqual({ activated: 1, already_active: 0, skipped: 0, errors: [], details: [{ name: 'Explorer something else', result: 'activated' }] });
    expect(mockActivateCampaign.mock.calls).toEqual([['c-look']]);
  });
});

describe('a registered journey key is skipped, whatever the status', () => {
  it('dry run: the journey rows are listed under skipped_journey and nowhere else; the unregistered counts are unchanged', async () => {
    world([...UNREGISTERED, JOURNEY_DRAFT, JOURNEY_ACTIVE]);
    const res = await post('dry-run');
    expect(res.status).toBe(200);
    expect(res.body.phase_3_campaigns).toEqual({ status: 'dry-run preview', plan: { ...PRE_CHANGE_DRY_RUN_PLAN.plan, skipped_journey: 2 } });
    const details = res.body.phase_1_system_state.campaigns.details as Row[];
    expect(details.filter((d) => d.action === 'skipped_journey').map((d) => [d.id, d.journey_key])).toEqual([['c-j-draft', BIZ_FLOW], ['c-j-active', ALI_OUTREACH_CAMPAIGN_KEY]]);
    expect(details.filter((d) => d.action !== 'skipped_journey').every((d) => !('journey_key' in d))).toBe(true);
  });

  it('execute: the journey draft is never activated - the one activation is the unregistered draft - and the skip is logged by key and id, never by name', async () => {
    world([...UNREGISTERED, JOURNEY_DRAFT, JOURNEY_ACTIVE]);
    const res = await post('execute');
    expect(res.status).toBe(200);
    expect(mockActivateCampaign.mock.calls).toEqual([['c-draft']]);
    expect(res.body.phase_3_campaigns).toEqual({
      ...PRE_CHANGE_EXECUTE,
      skipped_journey: 2,
      details: [...PRE_CHANGE_EXECUTE.details, { name: 'Business discovery (journey)', result: 'skipped_journey' }, { name: 'Ali outreach (journey)', result: 'skipped_journey' }],
    });
    const lines = skipLines();
    expect(lines.map((l) => [l.event, l.campaign_id, l.campaign_key, l.status])).toEqual([
      ['production_activate.journey_campaign_skipped', 'c-j-draft', BIZ_FLOW, 'draft'],
      ['production_activate.journey_campaign_skipped', 'c-j-active', ALI_OUTREACH_CAMPAIGN_KEY, 'active'],
    ]);
    for (const l of lines) expect(JSON.stringify(l)).not.toContain('journey)');
  });

  it('the unregistered rows\' own entries are identical with and without journey rows beside them', async () => {
    world(UNREGISTERED);
    const alone = (await post('dry-run')).body.phase_1_system_state.campaigns.details as Row[];
    world([JOURNEY_DRAFT, ...UNREGISTERED, JOURNEY_ACTIVE]);
    const beside = ((await post('dry-run')).body.phase_1_system_state.campaigns.details as Row[]).filter((d) => d.action !== 'skipped_journey');
    expect(beside).toEqual(alone);
  });

  it('settings stored as a JSON string are read the same way (the row above carried a string)', async () => {
    world([JOURNEY_ACTIVE]);
    const res = await post('dry-run');
    expect(res.body.phase_3_campaigns.plan).toEqual({ will_activate: 0, already_active: 0, skip: 0, skipped_journey: 1 });
  });
});
