/**
 * The publish gate now reads the governance config rather than counting it (C0.12).
 *
 * Before this change `validateCampaignForPublish` asked `findOne(...)` and pushed an error
 * only when the result was null. Since every column in `campaign_governance_configs` has a
 * database default, the row an empty admin PUT creates satisfied that check completely.
 * This suite is the regression wall: a present-but-empty config must still block.
 */
const m = {
  campaignFindByPk: jest.fn(),
  govFindOne: jest.fn(),
};

jest.mock('../../models/Campaign', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => m.campaignFindByPk(...a) },
}));
jest.mock('../../models/CampaignGovernanceConfig', () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => m.govFindOne(...a) },
}));
jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock('../executiveAwarenessService', () => ({ emitExecutiveEvent: jest.fn() }));
jest.mock('../adminOs/metricRegistry', () => ({
  getMetric: jest.fn(),
  mayComputeWith: jest.fn(() => false),
}));

import { validateCampaignForPublish } from '../campaignLinkService';

/** A campaign that satisfies every non-governance requirement. */
function publishableCampaign(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'camp-1',
    channel: 'email',
    destination_path: '/enterprise',
    objective: 'Secure one director-level engagement',
    approval_status: 'approved',
    budget_cap: 500,
    budget_spent: 0,
    ...over,
  };
}

/** The row the database produces when the admin route is called with an empty body. */
const HOLLOW_CONFIG = {
  max_unsubscribe_rate: '1.50',
  max_bounce_rate: '5.00',
  max_sms_failure_rate: '10.00',
  min_open_rate: '0.1000',
  min_reply_rate: '0.0100',
  ramp_profile: null,
};

/** The CEO-direct config as declared in campaignGovernanceDeclarations.ts. */
const REAL_CONFIG = {
  max_unsubscribe_rate: '10.00',
  max_bounce_rate: '10.00',
  max_sms_failure_rate: '0.01',
  min_open_rate: '0.2500',
  min_reply_rate: '0.1000',
  ramp_profile: {
    phase_sizes: [3, 3, 3],
    advance_threshold: 70,
    hold_threshold: 50,
    evaluation_window_hours: 72,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  m.campaignFindByPk.mockResolvedValue(publishableCampaign());
});

describe('validateCampaignForPublish, governance branch', () => {
  it('blocks when no config exists, with the message operators already know', async () => {
    m.govFindOne.mockResolvedValue(null);
    const r = await validateCampaignForPublish('camp-1');
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('Campaign governance config must be created before going live');
  });

  it('BLOCKS a present config made of column defaults', async () => {
    m.govFindOne.mockResolvedValue(HOLLOW_CONFIG);
    const r = await validateCampaignForPublish('camp-1');
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain('ramp_profile');
  });

  it('prefixes a substance failure so it is not read as a missing row', async () => {
    m.govFindOne.mockResolvedValue(HOLLOW_CONFIG);
    const r = await validateCampaignForPublish('camp-1');
    expect(r.errors.every((e) => !e.includes('must be created before going live'))).toBe(true);
    expect(r.errors.some((e) => e.startsWith('Campaign governance config: '))).toBe(true);
  });

  it('passes a config whose every field was decided', async () => {
    m.govFindOne.mockResolvedValue(REAL_CONFIG);
    const r = await validateCampaignForPublish('camp-1');
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('blocks a config with a real ramp but a zero ceiling', async () => {
    m.govFindOne.mockResolvedValue({ ...REAL_CONFIG, max_bounce_rate: '0.00' });
    const r = await validateCampaignForPublish('camp-1');
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain('max_bounce_rate');
  });

  it('blocks a config whose ramp profile cannot be parsed', async () => {
    m.govFindOne.mockResolvedValue({ ...REAL_CONFIG, ramp_profile: { phase_sizes: [] } });
    const r = await validateCampaignForPublish('camp-1');
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain('ramp_profile');
  });

  it('still reports the non-governance failures alongside', async () => {
    m.campaignFindByPk.mockResolvedValue(publishableCampaign({ approval_status: 'draft', channel: null }));
    m.govFindOne.mockResolvedValue(null);
    const r = await validateCampaignForPublish('camp-1');
    expect(r.errors).toContain('Campaign channel is required');
    expect(r.errors.join(' ')).toContain('must be approved before going live');
    expect(r.errors).toContain('Campaign governance config must be created before going live');
  });

  it('reports a missing campaign without consulting governance at all', async () => {
    m.campaignFindByPk.mockResolvedValue(null);
    const r = await validateCampaignForPublish('nope');
    expect(r.errors).toEqual(['Campaign not found']);
    expect(m.govFindOne).not.toHaveBeenCalled();
  });
});
