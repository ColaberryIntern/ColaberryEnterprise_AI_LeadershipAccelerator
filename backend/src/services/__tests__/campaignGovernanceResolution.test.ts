/**
 * `resolveCampaignGovernance` no longer widens a stored threshold on read (C0.12).
 *
 * It used `Number(row.max_unsubscribe_rate) || HARDCODED_CAMPAIGN_DEFAULTS.max_unsubscribe_rate`
 * for all five rates. `0 || 1.5` is `1.5`, so a stored zero was replaced by a LOOSER
 * platform default - the resolver silently relaxed the only value it chose to ignore. The
 * band in `validateGovernanceConfig` is what refuses a zero now, at the point of writing,
 * where somebody can be told why.
 *
 * The second half covers the other half of the change: a `ramp_profile` the ramp service
 * cannot consume resolves to null rather than being handed over unparsed.
 */
const m = { govFindOne: jest.fn() };

jest.mock('../../models', () => ({
  GovernanceConfig: { findOne: jest.fn() },
  CronScheduleConfig: { findAll: jest.fn() },
  CampaignGovernanceConfig: { findOne: (...a: unknown[]) => m.govFindOne(...a) },
  RiskScoringConfig: { findOne: jest.fn() },
}));
jest.mock('../../models/GovernanceConfig', () => ({ __esModule: true, default: {} }));

import {
  HARDCODED_CAMPAIGN_DEFAULTS,
  resolveCampaignGovernance,
} from '../governanceResolutionService';

const RAMP = {
  phase_sizes: [3, 3, 3],
  advance_threshold: 70,
  hold_threshold: 50,
  evaluation_window_hours: 72,
};

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    max_unsubscribe_rate: '10.00',
    max_bounce_rate: '10.00',
    max_sms_failure_rate: '0.01',
    min_open_rate: '0.2500',
    min_reply_rate: '0.1000',
    ramp_profile: { ...RAMP },
    ...over,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('resolveCampaignGovernance', () => {
  it('reports the hardcoded floor when no config exists', async () => {
    m.govFindOne.mockResolvedValue(null);
    const r = await resolveCampaignGovernance('camp-1');
    expect(r.source).toBe('hardcoded');
    expect(r.max_unsubscribe_rate).toBe(HARDCODED_CAMPAIGN_DEFAULTS.max_unsubscribe_rate);
    expect(r.ramp_profile).toBeNull();
  });

  it('reads a decided config straight through', async () => {
    m.govFindOne.mockResolvedValue(row());
    const r = await resolveCampaignGovernance('camp-1');
    expect(r.source).toBe('database');
    expect(r.max_unsubscribe_rate).toBe(10);
    expect(r.max_sms_failure_rate).toBe(0.01);
    expect(r.min_reply_rate).toBe(0.1);
    expect(r.ramp_profile).toEqual(RAMP);
  });

  it('does NOT widen a stored zero into the looser platform default', async () => {
    // The old `||` form returned 1.5 here. A caller comparing with `>=` would then allow
    // unsubscribes the config had set out to forbid entirely.
    m.govFindOne.mockResolvedValue(row({ max_unsubscribe_rate: '0.00' }));
    const r = await resolveCampaignGovernance('camp-1');
    expect(r.max_unsubscribe_rate).toBe(0);
    expect(r.max_unsubscribe_rate).not.toBe(HARDCODED_CAMPAIGN_DEFAULTS.max_unsubscribe_rate);
  });

  it('falls back per field only when a column is genuinely unreadable', async () => {
    m.govFindOne.mockResolvedValue(row({ max_bounce_rate: null, min_open_rate: 'nonsense' }));
    const r = await resolveCampaignGovernance('camp-1');
    expect(r.max_bounce_rate).toBe(HARDCODED_CAMPAIGN_DEFAULTS.max_bounce_rate);
    expect(r.min_open_rate).toBe(HARDCODED_CAMPAIGN_DEFAULTS.min_open_rate);
    // The readable fields are untouched by a neighbour's fallback.
    expect(r.max_unsubscribe_rate).toBe(10);
  });

  it('resolves an unusable ramp profile to null rather than passing it on', async () => {
    m.govFindOne.mockResolvedValue(row({ ramp_profile: { phase_sizes: [-1, 25], advance_threshold: 70, hold_threshold: 50, evaluation_window_hours: 12 } }));
    const r = await resolveCampaignGovernance('camp-1');
    expect(r.ramp_profile).toBeNull();
    // The rest of the config still resolves: one bad column is not a reason to discard
    // the thresholds that were decided correctly.
    expect(r.source).toBe('database');
    expect(r.max_bounce_rate).toBe(10);
  });

  it('falls back to the floor when the read throws', async () => {
    m.govFindOne.mockRejectedValue(new Error('connection terminated'));
    const r = await resolveCampaignGovernance('camp-1');
    expect(r.source).toBe('hardcoded');
    expect(r.ramp_profile).toBeNull();
  });
});
