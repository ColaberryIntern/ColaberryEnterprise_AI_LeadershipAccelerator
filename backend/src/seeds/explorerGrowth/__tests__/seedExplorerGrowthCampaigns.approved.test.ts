const campaignFindOne = jest.fn();
const campaignCreate = jest.fn();
const sequenceFindOne = jest.fn();
const sequenceCreate = jest.fn();

jest.mock('../../../models', () => ({
  Campaign: { findOne: (...a: unknown[]) => campaignFindOne(...a), create: (...a: unknown[]) => campaignCreate(...a) },
  FollowUpSequence: { findOne: (...a: unknown[]) => sequenceFindOne(...a), create: (...a: unknown[]) => sequenceCreate(...a) },
}));

import { seedExplorerGrowthCampaigns } from '../seedExplorerGrowthCampaigns';
import { EXPLORER_CAMPAIGNS } from '../explorerCampaignDefinitions';

/**
 * T505 — the boot seed stops switching off a sequence whose campaign a human
 * APPROVED. Everything else it did before, it still does: an unapproved
 * campaign's sequence is re-asserted inactive on every boot, and a new sequence
 * is created inactive.
 */

type Row = Record<string, unknown> & { update: jest.Mock; get: (k: string) => unknown };
const campaignRow = (key: string, approval_status: string | null): Row => {
  const attrs: Record<string, unknown> = { id: `c-${key}`, approval_status, settings: { campaign_key: key, test_mode_enabled: true } };
  return { ...attrs, update: jest.fn().mockResolvedValue(undefined), get: (k: string) => attrs[k] };
};
const sequenceRow = (name: string, is_active: boolean): Row => {
  const attrs: Record<string, unknown> = { id: `s-${name}`, name, is_active };
  return { ...attrs, update: jest.fn().mockResolvedValue(undefined), get: (k: string) => attrs[k] };
};

/** A world where every campaign exists with the given approval status and every sequence exists ACTIVE (an operator's hand). */
function arrange(approvalFor: (key: string) => string | null) {
  const campaigns = new Map(EXPLORER_CAMPAIGNS.map((c) => [c.key, campaignRow(c.key, approvalFor(c.key))]));
  const sequences = new Map(EXPLORER_CAMPAIGNS.map((c) => [c.sequenceName, sequenceRow(c.sequenceName, true)]));
  campaignFindOne.mockImplementation(async ({ where }: { where: { settings: { campaign_key: string } } }) => campaigns.get(where.settings.campaign_key) ?? null);
  sequenceFindOne.mockImplementation(async ({ where }: { where: { name: string } }) => sequences.get(where.name) ?? null);
  return { campaigns, sequences };
}

const isActiveWrittenAs = (seq: Row) => (seq.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined)?.is_active;

beforeEach(() => {
  for (const fn of [campaignFindOne, campaignCreate, sequenceFindOne, sequenceCreate]) fn.mockReset();
  campaignCreate.mockResolvedValue({ id: 'camp-new' });
  sequenceCreate.mockImplementation(async (attrs: Record<string, unknown>) => ({ id: 's-new', ...attrs }));
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('an APPROVED campaign keeps the sequence a human switched on', () => {
  it.each([['approved'], ['live']])('%s: the sequence update refreshes steps and description and leaves is_active alone', async (status) => {
    const { sequences } = arrange(() => status);
    const result = await seedExplorerGrowthCampaigns();
    expect(result).toMatchObject({ created: 0, updated: 8, failed: [] });
    for (const seq of sequences.values()) {
      expect(seq.update).toHaveBeenCalledTimes(1);
      const patch = seq.update.mock.calls[0][0] as Record<string, unknown>;
      expect(patch).toHaveProperty('description');
      expect(patch).toHaveProperty('steps');
      expect(patch).not.toHaveProperty('is_active');
    }
  });
});

describe('the invariant for everything else is untouched (the control)', () => {
  it.each([['draft'], ['pending_approval'], ['paused'], [null]])('approval_status %s: the sequence is re-asserted INACTIVE on every boot', async (status) => {
    const { sequences } = arrange(() => status);
    await seedExplorerGrowthCampaigns();
    for (const seq of sequences.values()) expect(isActiveWrittenAs(seq)).toBe(false);
  });

  it('mixed: only the approved campaign\'s sequence is spared - the decision is per campaign, read from ITS row', async () => {
    const { sequences } = arrange((key) => (key === 'explorer_next_lesson' ? 'approved' : 'draft'));
    await seedExplorerGrowthCampaigns();
    const spared = EXPLORER_CAMPAIGNS.find((c) => c.key === 'explorer_next_lesson')!.sequenceName;
    for (const [name, seq] of sequences) {
      if (name === spared) expect(seq.update.mock.calls[0][0]).not.toHaveProperty('is_active');
      else expect(isActiveWrittenAs(seq)).toBe(false);
    }
  });

  it('a campaign that does not exist yet: the sequence is CREATED inactive, and the campaign is created draft', async () => {
    campaignFindOne.mockResolvedValue(null);
    sequenceFindOne.mockResolvedValue(null);
    const result = await seedExplorerGrowthCampaigns();
    expect(result).toMatchObject({ created: 8, updated: 0 });
    for (const [attrs] of sequenceCreate.mock.calls) expect((attrs as Record<string, unknown>).is_active).toBe(false);
    for (const [attrs] of campaignCreate.mock.calls) expect(attrs).toMatchObject({ status: 'draft', approval_status: 'draft' });
  });

  it('the campaign is read BEFORE its sequence is touched, so the approval can protect it', async () => {
    const order: string[] = [];
    arrange(() => 'approved');
    campaignFindOne.mockImplementation(async () => { order.push('campaign'); return campaignRow('explorer_next_lesson', 'approved'); });
    sequenceFindOne.mockImplementation(async () => { order.push('sequence'); return sequenceRow('x', true); });
    await seedExplorerGrowthCampaigns();
    expect(order.slice(0, 2)).toEqual(['campaign', 'sequence']);
  });
});
