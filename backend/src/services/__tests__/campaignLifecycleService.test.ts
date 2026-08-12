/**
 * campaignLifecycleService — GHL sync gap (Valentine Obiora investigation).
 *
 * detectInactiveLeads() moved leads into the re-engagement campaign via
 * CampaignLead.create() directly, bypassing enrollLeadsInCampaign's GHL
 * sync entirely. A lead could get emailed by the campaign and logged to
 * CommunicationLog with no corresponding GHL contact ever created, so
 * admissions/sales — who work exclusively out of GHL — never saw it.
 * Verifies the lifecycle transition now syncs the lead to GHL too, and
 * that a GHL outage doesn't block the transition itself.
 */
jest.mock('../../models', () => ({
  Campaign: { findAll: jest.fn(), findByPk: jest.fn() },
  CampaignLead: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  Lead: { findByPk: jest.fn() },
  InteractionOutcome: { findOne: jest.fn() },
}));
jest.mock('../sequenceService', () => ({ enrollLeadInSequence: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../interactionService', () => ({ recordOutcome: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../settingsService', () => ({ getSetting: jest.fn() }));
jest.mock('../ghlService', () => ({ syncLeadToGhl: jest.fn() }));

import { detectInactiveLeads } from '../campaignLifecycleService';
import { Campaign, CampaignLead, Lead, InteractionOutcome } from '../../models';
import { getSetting } from '../settingsService';
import { syncLeadToGhl } from '../ghlService';

const mockCampaignFindAll = Campaign.findAll as jest.Mock;
const mockCampaignFindByPk = Campaign.findByPk as jest.Mock;
const mockCampaignLeadFindAll = CampaignLead.findAll as jest.Mock;
const mockCampaignLeadFindOne = CampaignLead.findOne as jest.Mock;
const mockCampaignLeadCreate = CampaignLead.create as jest.Mock;
const mockLeadFindByPk = Lead.findByPk as jest.Mock;
const mockInteractionOutcomeFindOne = InteractionOutcome.findOne as jest.Mock;
const mockGetSetting = getSetting as jest.Mock;
const mockSyncLeadToGhl = syncLeadToGhl as jest.Mock;

const primaryCampaign = {
  id: 'campaign-1',
  status: 'active',
  type: 'alumni',
  targeting_criteria: { lifecycle_enabled: true, paired_campaign_id: 'campaign-2', inactivity_days: 30 },
};
const reengageCampaign = {
  id: 'campaign-2',
  status: 'active',
  interest_group: 'alumni_winback',
  sequence_id: null,
};

describe('detectInactiveLeads — GHL sync on lifecycle transition', () => {
  let inactiveCampaignLead: any;

  beforeEach(() => {
    jest.clearAllMocks();
    inactiveCampaignLead = { lead_id: 42, campaign_cycle_number: 1, update: jest.fn().mockResolvedValue(undefined) };
    mockCampaignFindAll.mockResolvedValue([primaryCampaign]);
    mockCampaignLeadFindAll.mockResolvedValue([inactiveCampaignLead]);
    mockCampaignFindByPk.mockResolvedValue(reengageCampaign);
    mockCampaignLeadFindOne.mockResolvedValue(null); // not already enrolled in re-engagement
    mockCampaignLeadCreate.mockResolvedValue(undefined);
    mockInteractionOutcomeFindOne.mockResolvedValue(null);
  });

  it('happy path: a lead transitioning to re-engagement is synced to GHL and its contact ID persisted', async () => {
    const leadUpdate = jest.fn().mockResolvedValue(undefined);
    mockLeadFindByPk
      .mockResolvedValueOnce({ id: 42, pipeline_stage: 'active', status: 'active' }) // checkExitConditions (raw)
      .mockResolvedValueOnce({ id: 42, name: 'Valentine Obiora', email: 'val@example.com', ghl_contact_id: null, update: leadUpdate }); // GHL sync lookup
    mockGetSetting.mockResolvedValue(true); // ghl_enabled
    mockSyncLeadToGhl.mockResolvedValue({ contactId: 'ghl-contact-123', isTestMode: false });

    const stats = await detectInactiveLeads();

    expect(mockSyncLeadToGhl).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), 'alumni_winback');
    expect(leadUpdate).toHaveBeenCalledWith({ ghl_contact_id: 'ghl-contact-123' });
    expect(stats.moved_to_reengagement).toBe(1);
  });

  it('failure path: a GHL outage does not block the lifecycle transition', async () => {
    mockLeadFindByPk
      .mockResolvedValueOnce({ id: 42, pipeline_stage: 'active', status: 'active' })
      .mockResolvedValueOnce({ id: 42, name: 'Valentine Obiora', email: 'val@example.com', ghl_contact_id: null, update: jest.fn() });
    mockGetSetting.mockResolvedValue(true);
    mockSyncLeadToGhl.mockRejectedValue(new Error('GHL API down'));

    const stats = await detectInactiveLeads();

    expect(stats.moved_to_reengagement).toBe(1);
    expect(stats.exited).toBe(0);
  });

  it('boundary: GHL sync is skipped (not called) when ghl_enabled is off', async () => {
    mockLeadFindByPk.mockResolvedValueOnce({ id: 42, pipeline_stage: 'active', status: 'active' });
    mockGetSetting.mockResolvedValue(false);

    const stats = await detectInactiveLeads();

    expect(mockSyncLeadToGhl).not.toHaveBeenCalled();
    expect(stats.moved_to_reengagement).toBe(1);
  });
});
