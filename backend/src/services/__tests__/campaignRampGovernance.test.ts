/**
 * The ramp now reads the governance config instead of a hardcoded map (C0.12).
 *
 * Two behaviors are under test, and both were measurably absent before.
 *
 * 1. The unsubscribe, bounce and SMS-failure ceilings were gated on `isAlumni`, so they
 *    governed 1 of the 6 campaigns that were active in production on 2026-11-01 and none of
 *    the executive-outreach ones. A per-campaign config whose ceilings are consulted for
 *    two campaign types is the governs-nothing case the ticket was written to close.
 *
 * 2. `campaign_governance_configs.ramp_profile` was written by the admin route and read by
 *    the governance resolver, and then nothing used it - the ramp came from `RAMP_PROFILES`
 *    keyed on campaign type. The evaluation-window test below is the observable proof that
 *    the stored profile is what decides now, because 72 hours and 12 hours give opposite
 *    answers for the same campaign at the same moment.
 */
const m = {
  findByPk: jest.fn(),
  healthFindOne: jest.fn(),
  update: jest.fn(),
  resolve: jest.fn(),
  logSupervisor: jest.fn(),
};

jest.mock('../../models', () => ({
  Campaign: { findByPk: (...a: unknown[]) => m.findByPk(...a) },
  // Empty lead sets, so a healthy campaign walks through phase enrollment without the
  // enrollment path being what the test is about.
  CampaignLead: {
    findAll: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue([0]),
  },
  CampaignHealth: { findOne: (...a: unknown[]) => m.healthFindOne(...a) },
  Lead: { findAll: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../campaignService', () => ({ enrollLeadsInCampaign: jest.fn() }));
jest.mock('../governanceResolutionService', () => ({
  HARDCODED_CAMPAIGN_DEFAULTS: {
    max_unsubscribe_rate: 1.5,
    max_bounce_rate: 5.0,
    max_sms_failure_rate: 10.0,
    min_open_rate: 0.1,
    min_reply_rate: 0.01,
  },
  resolveCampaignGovernance: (...a: unknown[]) => m.resolve(...a),
}));
jest.mock('../alumniCampaignSupervisor', () => ({
  logSupervisorDecision: (...a: unknown[]) => m.logSupervisor(...a),
}));

import { evaluateRampPhase } from '../autonomousRampService';

const HOURS = 60 * 60 * 1000;

/** A campaign mid-ramp whose phase window has long since elapsed. */
function campaign(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'camp-1',
    name: 'AI Leadership Cold Outbound Q1',
    type: 'cold_outbound',
    ramp_state: {
      current_phase: 1,
      phase_sizes: [20, 80, 200, -1],
      leads_enrolled_per_phase: { 1: 20 },
      phase_started_at: new Date(Date.now() - 100 * HOURS).toISOString(),
      phase_health_score: null,
      status: 'ramping',
      evaluation_history: [],
    },
    ...over,
  };
}

/** Governance with no config: the hardcoded floor, and no ramp profile. */
const NO_CONFIG = {
  max_unsubscribe_rate: 1.5,
  max_bounce_rate: 5.0,
  max_sms_failure_rate: 10.0,
  min_open_rate: 0.1,
  min_reply_rate: 0.01,
  ramp_profile: null,
  source: 'hardcoded' as const,
};

function health(metrics: Record<string, number>, score = 80): Record<string, unknown> {
  return { campaign_id: 'camp-1', health_score: score, metrics };
}

beforeEach(() => {
  jest.clearAllMocks();
  m.resolve.mockResolvedValue(NO_CONFIG);
  m.update.mockResolvedValue(undefined);
  // The service reads the campaign twice: raw for the decision, then as a model to write.
  m.findByPk.mockImplementation((_id: string, opts?: { raw?: boolean }) =>
    Promise.resolve(opts && opts.raw ? campaign() : { ...campaign(), update: m.update }));
});

describe('the safety ceilings now reach every campaign type', () => {
  it('pauses a cold_outbound campaign that breaches the unsubscribe ceiling', async () => {
    // Before this change `isAlumni` was false here, so the whole block was skipped and a
    // breaching cold outbound campaign carried on ramping.
    m.healthFindOne.mockResolvedValue(health({ unsubscribe_rate: 2.0, bounce_rate: 0, sms_failure_rate: 0 }));
    const r = await evaluateRampPhase('camp-1');
    expect(r.decision).toBe('pause_for_review');
    expect(m.update).toHaveBeenCalledTimes(1);
    const written = m.update.mock.calls[0][0] as { ramp_state: { status: string; evaluation_history: Array<{ decision: string }> } };
    expect(written.ramp_state.status).toBe('paused_for_review');
    expect(written.ramp_state.evaluation_history[0].decision).toContain('safety_pause');
    expect(written.ramp_state.evaluation_history[0].decision).toContain('unsubscribe_rate=2');
  });

  it('pauses a warm_nurture campaign that breaches the bounce ceiling', async () => {
    m.findByPk.mockImplementation((_id: string, opts?: { raw?: boolean }) => {
      const c = campaign({ type: 'warm_nurture' });
      return Promise.resolve(opts && opts.raw ? c : { ...c, update: m.update });
    });
    m.healthFindOne.mockResolvedValue(health({ unsubscribe_rate: 0, bounce_rate: 7, sms_failure_rate: 0 }));
    const r = await evaluateRampPhase('camp-1');
    expect(r.decision).toBe('pause_for_review');
  });

  it('still pauses an alumni campaign, which is the behavior that already existed', async () => {
    m.findByPk.mockImplementation((_id: string, opts?: { raw?: boolean }) => {
      const c = campaign({ type: 'alumni_re_engagement' });
      return Promise.resolve(opts && opts.raw ? c : { ...c, update: m.update });
    });
    m.healthFindOne.mockResolvedValue(health({ unsubscribe_rate: 2.0, bounce_rate: 0, sms_failure_rate: 0 }));
    const r = await evaluateRampPhase('camp-1');
    expect(r.decision).toBe('pause_for_review');
  });

  it('does not pause a campaign within its ceilings', async () => {
    // All six campaigns active in production on 2026-11-01 read 0 on all three metrics,
    // which is why widening the check pauses nothing that is currently running.
    m.healthFindOne.mockResolvedValue(health({ unsubscribe_rate: 0, bounce_rate: 0, sms_failure_rate: 0 }));
    const r = await evaluateRampPhase('camp-1');
    expect(r.decision).not.toBe('pause_for_review');
  });

  it('uses the config ceiling rather than the platform default when one is set', async () => {
    // 0.5% would not breach the hardcoded 1.5% floor. The config is what makes it breach.
    m.resolve.mockResolvedValue({ ...NO_CONFIG, max_unsubscribe_rate: 0.5, source: 'database' });
    m.healthFindOne.mockResolvedValue(health({ unsubscribe_rate: 1.0, bounce_rate: 0, sms_failure_rate: 0 }));
    const r = await evaluateRampPhase('camp-1');
    expect(r.decision).toBe('pause_for_review');
  });
});

describe('the audit entry a safety pause writes', () => {
  it('files a non-alumni pause under the ramp supervisor, not the alumni one', async () => {
    m.healthFindOne.mockResolvedValue(health({ unsubscribe_rate: 2.0, bounce_rate: 0, sms_failure_rate: 0 }));
    await evaluateRampPhase('camp-1');
    expect(m.logSupervisor).toHaveBeenCalledTimes(1);
    expect(m.logSupervisor.mock.calls[0][1]).toBe('campaign_ramp_supervisor');
  });

  it('leaves an alumni pause filed where it always was', async () => {
    m.findByPk.mockImplementation((_id: string, opts?: { raw?: boolean }) => {
      const c = campaign({ type: 'alumni' });
      return Promise.resolve(opts && opts.raw ? c : { ...c, update: m.update });
    });
    m.healthFindOne.mockResolvedValue(health({ unsubscribe_rate: 2.0, bounce_rate: 0, sms_failure_rate: 0 }));
    await evaluateRampPhase('camp-1');
    expect(m.logSupervisor.mock.calls[0][1]).toBe('alumni_campaign_supervisor');
  });
});

describe('the stored ramp profile is what decides the evaluation window', () => {
  /** Mid-phase: 24 hours in, which is past the type map's 12 and short of the config's 72. */
  function midPhase(): Record<string, unknown> {
    const c = campaign();
    (c.ramp_state as { phase_started_at: string }).phase_started_at =
      new Date(Date.now() - 24 * HOURS).toISOString();
    return c;
  }

  beforeEach(() => {
    m.findByPk.mockImplementation((_id: string, opts?: { raw?: boolean }) => {
      const c = midPhase();
      return Promise.resolve(opts && opts.raw ? c : { ...c, update: m.update });
    });
    m.healthFindOne.mockResolvedValue(health({ unsubscribe_rate: 0, bounce_rate: 0, sms_failure_rate: 0 }));
  });

  it('holds at 24 hours when the config declares a 72-hour window', async () => {
    m.resolve.mockResolvedValue({
      ...NO_CONFIG,
      source: 'database',
      ramp_profile: { phase_sizes: [3, 3, 3], advance_threshold: 70, hold_threshold: 50, evaluation_window_hours: 72 },
    });
    const r = await evaluateRampPhase('camp-1');
    expect(r.decision).toBe('hold');
    expect(r.health_score).toBeNull();
    // Held before the health read, so the window genuinely gated it.
    expect(m.healthFindOne).not.toHaveBeenCalled();
  });

  it('proceeds past 24 hours with no config, because the type map window is 12', async () => {
    m.resolve.mockResolvedValue(NO_CONFIG);
    const r = await evaluateRampPhase('camp-1');
    expect(r.decision).not.toBe('hold');
    expect(m.healthFindOne).toHaveBeenCalled();
  });

  it('falls back to the type map when the governance read throws', async () => {
    m.resolve.mockRejectedValue(new Error('connection terminated'));
    const r = await evaluateRampPhase('camp-1');
    // A governance read that errors must not become an outage.
    expect(r.decision).not.toBe('hold');
    expect(m.healthFindOne).toHaveBeenCalled();
  });
});
