/**
 * Contract tests for campaign → brand attribution.
 *
 * The model layer is MOCKED deliberately. CI runs this repo's suites with no
 * DATABASE_URL, so a test that touched Sequelize directly would fail for an
 * environmental reason and end up on jest.ci.config's ignore list — which is
 * exactly how a gate stops gating. Mocking keeps the rules under test as pure
 * assertions about precedence and failure posture.
 */

jest.mock('../../../models', () => ({ Campaign: { findAll: jest.fn() } }));
jest.mock('../../../models/Brand', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../../models/SenderProfile', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

import { Campaign } from '../../../models';
import Brand from '../../../models/Brand';
import SenderProfile from '../../../models/SenderProfile';
import {
  loadCampaignBrandMap,
  summarizeBrands,
  UNATTRIBUTED_BRAND_ID,
  UNATTRIBUTED_BRAND_NAME,
} from '../campaignBrandAttribution';

const campaignFindAll = Campaign.findAll as jest.Mock;
const brandFindAll = (Brand as any).findAll as jest.Mock;
const senderFindAll = (SenderProfile as any).findAll as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  campaignFindAll.mockResolvedValue([]);
  brandFindAll.mockResolvedValue([]);
  senderFindAll.mockResolvedValue([]);
});

describe('loadCampaignBrandMap — attribution precedence', () => {
  it('takes the brand declared on the campaign first', async () => {
    campaignFindAll.mockResolvedValue([{ id: 'c1', brand_id: 'b1', sender_profile_id: 'sp1' }]);
    brandFindAll.mockResolvedValue([{ id: 'b1', name: 'Colaberry Enterprise' }]);

    const { map } = await loadCampaignBrandMap(['c1']);
    expect(map.get('c1')).toEqual({
      brand_id: 'b1',
      brand_name: 'Colaberry Enterprise',
      attributed: true,
      resolved_from: 'campaign',
    });
    // The sender profile is not consulted when the campaign already declares one.
    expect(senderFindAll).not.toHaveBeenCalled();
  });

  it('falls back to the brand the campaign SENDS AS', async () => {
    campaignFindAll.mockResolvedValue([{ id: 'c1', brand_id: null, sender_profile_id: 'sp1' }]);
    senderFindAll.mockResolvedValue([{ id: 'sp1', brand_id: 'b2' }]);
    brandFindAll.mockResolvedValue([{ id: 'b2', name: 'Career Pathways Network' }]);

    const { map } = await loadCampaignBrandMap(['c1']);
    expect(map.get('c1')).toMatchObject({
      brand_id: 'b2',
      brand_name: 'Career Pathways Network',
      attributed: true,
      resolved_from: 'sender_profile',
    });
  });

  it('reports Unattributed when neither is set, rather than guessing', async () => {
    campaignFindAll.mockResolvedValue([{ id: 'c1', brand_id: null, sender_profile_id: null }]);
    const { map } = await loadCampaignBrandMap(['c1']);
    expect(map.get('c1')).toMatchObject({
      brand_id: UNATTRIBUTED_BRAND_ID,
      attributed: false,
      resolved_from: 'none',
    });
  });

  it('does not fold an unresolvable sender profile into a real brand', async () => {
    campaignFindAll.mockResolvedValue([{ id: 'c1', brand_id: null, sender_profile_id: 'missing' }]);
    senderFindAll.mockResolvedValue([]); // profile row gone
    const { map } = await loadCampaignBrandMap(['c1']);
    expect(map.get('c1')!.attributed).toBe(false);
  });

  it('keeps a brand identified by id when its name row is missing', async () => {
    campaignFindAll.mockResolvedValue([{ id: 'c1', brand_id: 'b9', sender_profile_id: null }]);
    brandFindAll.mockResolvedValue([]);
    const { map } = await loadCampaignBrandMap(['c1']);
    // Still a real brand — naming it by id beats calling it Unattributed, which
    // would be a different and false claim.
    expect(map.get('c1')).toMatchObject({ brand_id: 'b9', brand_name: 'b9', attributed: true });
  });

  it('marks a campaign the graph draws but the table no longer has', async () => {
    campaignFindAll.mockResolvedValue([]); // deleted since the paths were traced
    const { map } = await loadCampaignBrandMap(['ghost']);
    expect(map.get('ghost')!.attributed).toBe(false);
  });

  it('issues no queries for an empty campaign list', async () => {
    const { map, warnings } = await loadCampaignBrandMap([]);
    expect(map.size).toBe(0);
    expect(warnings).toEqual([]);
    expect(campaignFindAll).not.toHaveBeenCalled();
  });
});

describe('loadCampaignBrandMap — failure posture', () => {
  it('degrades to Unattributed WITH a warning when campaigns cannot be read', async () => {
    campaignFindAll.mockRejectedValue(Object.assign(new Error('no column'), { name: 'DatabaseError' }));
    const { map, warnings } = await loadCampaignBrandMap(['c1', 'c2']);
    expect(map.get('c1')!.attributed).toBe(false);
    expect(map.get('c2')!.attributed).toBe(false);
    // Never silent: an infrastructure failure must not look like real data.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('DatabaseError');
  });

  it('warns but still resolves declared brands when the sender fallback fails', async () => {
    campaignFindAll.mockResolvedValue([
      { id: 'c1', brand_id: 'b1', sender_profile_id: null },
      { id: 'c2', brand_id: null, sender_profile_id: 'sp1' },
    ]);
    senderFindAll.mockRejectedValue(Object.assign(new Error('boom'), { name: 'TimeoutError' }));
    brandFindAll.mockResolvedValue([{ id: 'b1', name: 'Brand One' }]);

    const { map, warnings } = await loadCampaignBrandMap(['c1', 'c2']);
    expect(map.get('c1')!.brand_name).toBe('Brand One');
    expect(map.get('c2')!.attributed).toBe(false);
    expect(warnings.join(' ')).toContain('TimeoutError');
  });

  it('warns but keeps ids when brand names cannot be read', async () => {
    campaignFindAll.mockResolvedValue([{ id: 'c1', brand_id: 'b1', sender_profile_id: null }]);
    brandFindAll.mockRejectedValue(Object.assign(new Error('boom'), { name: 'DatabaseError' }));
    const { map, warnings } = await loadCampaignBrandMap(['c1']);
    expect(map.get('c1')).toMatchObject({ brand_id: 'b1', brand_name: 'b1', attributed: true });
    expect(warnings.join(' ')).toMatch(/names could not be read/i);
  });

  it('never throws, whatever the model layer does', async () => {
    campaignFindAll.mockRejectedValue(new Error('total failure'));
    await expect(loadCampaignBrandMap(['c1'])).resolves.toBeDefined();
  });
});

describe('summarizeBrands', () => {
  const brandMap = new Map<string, any>([
    ['c1', { brand_id: 'b1', brand_name: 'Brand One', attributed: true, resolved_from: 'campaign' }],
    ['c2', { brand_id: 'b1', brand_name: 'Brand One', attributed: true, resolved_from: 'campaign' }],
    ['c3', { brand_id: 'b2', brand_name: 'Brand Two', attributed: true, resolved_from: 'campaign' }],
    [
      'c4',
      {
        brand_id: UNATTRIBUTED_BRAND_ID,
        brand_name: UNATTRIBUTED_BRAND_NAME,
        attributed: false,
        resolved_from: 'none',
      },
    ],
  ]);

  const nodes = [
    { id: 'campaign_c1', count: 30 },
    { id: 'campaign_c2', count: 20 },
    { id: 'campaign_c3', count: 40 },
    { id: 'campaign_c4', count: 5 },
  ];

  it('groups campaigns by brand and sums their leads', () => {
    const summary = summarizeBrands(nodes, brandMap);
    const one = summary.find((b) => b.brand_id === 'b1')!;
    expect(one).toMatchObject({ campaign_count: 2, lead_count: 50 });
  });

  it('sorts real brands by size and always puts Unattributed last', () => {
    const summary = summarizeBrands(nodes, brandMap);
    // b1 aggregates two campaigns to 50 leads and so outranks b2's single 40,
    // which is the point: brands are ranked by their total, not by their biggest
    // individual campaign.
    expect(summary.map((b) => b.brand_id)).toEqual(['b1', 'b2', UNATTRIBUTED_BRAND_ID]);
    expect(summary.map((b) => b.lead_count)).toEqual([50, 40, 5]);
  });

  it('keeps Unattributed last even when it is the largest bucket', () => {
    // The realistic production case: most campaigns carry no brand. A gap in the
    // data must not be ranked above the brands that do exist.
    const summary = summarizeBrands(
      [
        { id: 'campaign_c1', count: 1 },
        { id: 'campaign_c4', count: 9999 },
      ],
      brandMap,
    );
    expect(summary[summary.length - 1].brand_id).toBe(UNATTRIBUTED_BRAND_ID);
  });

  it('treats a campaign missing from the map as Unattributed', () => {
    const summary = summarizeBrands([{ id: 'campaign_unknown', count: 7 }], new Map());
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ brand_id: UNATTRIBUTED_BRAND_ID, lead_count: 7 });
  });

  it('returns nothing for no campaigns', () => {
    expect(summarizeBrands([], brandMap)).toEqual([]);
  });

  it('strips the campaign_ prefix when looking up the brand', () => {
    const summary = summarizeBrands([{ id: 'campaign_c3', count: 1 }], brandMap);
    expect(summary[0].brand_name).toBe('Brand Two');
  });
});
