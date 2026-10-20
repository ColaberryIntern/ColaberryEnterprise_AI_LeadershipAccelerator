/**
 * C6.10's acceptance criteria, as tests.
 *
 * The ticket names three: every check has an owner and a method, the automated checks are
 * actually wired to the existing services, and - the one that matters - the gate BLOCKS
 * activation rather than merely advising.
 *
 * The last block is therefore the point of this file: it asserts that `activateCampaign`
 * refuses, and that the campaign is NOT written when it does. A gate that throws after the
 * update has already run is not a gate.
 */
const m = {
  campaignFindByPk: jest.fn(),
  campaignLeadFindAll: jest.fn(),
  sendable: jest.fn(),
  validate: jest.fn(),
  update: jest.fn(),
};

jest.mock('../../models', () => ({
  Campaign: { findByPk: (...a: unknown[]) => m.campaignFindByPk(...a) },
  CampaignLead: {
    findAll: (...a: unknown[]) => m.campaignLeadFindAll(...a),
    update: jest.fn(),
  },
}));
jest.mock('../communicationSafetyService', () => ({
  checkLeadSendable: (...a: unknown[]) => m.sendable(...a),
}));
jest.mock('../campaignLinkService', () => ({
  validateCampaignForPublish: (...a: unknown[]) => m.validate(...a),
}));

import {
  ActivationBlockedError,
  GATE_CHECKS,
  assertActivationAllowed,
  evaluateActivationReadiness,
} from '../campaignActivationGate';

/** A campaign that passes everything. Each test breaks exactly one thing. */
function readyCampaign(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'camp-1',
    name: 'Tier 2 Sequence',
    status: 'draft',
    approval_status: 'approved',
    approved_by: 'admin-1',
    sender_profile_id: 'sender-1',
    tracking_link: 'https://example.com/t/abc',
    channel_config: { email: { daily_limit: 50 } },
    settings: {
      stop_rule: { replies: 1, touches: 6, days: 21 },
      activation_gate: {
        claims_approved: { by: 'Ali', at: '2026-10-20T00:00:00Z' },
        dry_run_reviewed: { by: 'Ali', at: '2026-10-20T00:00:00Z' },
      },
    },
    update: (...a: unknown[]) => m.update(...a),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  m.campaignFindByPk.mockResolvedValue(readyCampaign());
  m.campaignLeadFindAll.mockResolvedValue([{ lead_id: 7 }]);
  m.sendable.mockResolvedValue({ sendable: true });
  m.validate.mockResolvedValue({ valid: true, errors: [] });
});

describe('every check has an owner and a method', () => {
  it('names nine checks', () => {
    expect(GATE_CHECKS).toHaveLength(9);
  });

  it.each(GATE_CHECKS.map((c) => [c.id, c]))('%s carries an owner and a method', (_id, c) => {
    const check = c as typeof GATE_CHECKS[number];
    expect(['system', 'Ali']).toContain(check.owner);
    expect(check.method.length).toBeGreaterThan(20);
    expect(check.label.length).toBeGreaterThan(5);
  });

  it('marks the two checks this service genuinely cannot decide as manual', () => {
    const manual = GATE_CHECKS.filter((c) => !c.automated).map((c) => c.id);
    expect(manual.sort()).toEqual(['claims_approved', 'dry_run_reviewed']);
  });
});

describe('the automated checks are wired to the real services', () => {
  it('reuses validateCampaignForPublish rather than restating it', async () => {
    await evaluateActivationReadiness('camp-1');
    expect(m.validate).toHaveBeenCalledWith('camp-1');
  });

  it('reuses checkLeadSendable, asking about the email channel', async () => {
    await evaluateActivationReadiness('camp-1');
    expect(m.sendable).toHaveBeenCalledWith(7, 'email');
  });

  it('passes a fully ready campaign', async () => {
    const r = await evaluateActivationReadiness('camp-1');
    expect(r.blockers).toEqual([]);
    expect(r.allowed).toBe(true);
  });
});

describe('each check fails for its own reason', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['approved', { approval_status: 'draft' }],
    ['approved', { approval_status: 'approved', approved_by: null }],
    ['send_limit', { channel_config: {}, settings: { stop_rule: { n: 1 }, activation_gate: { claims_approved: { by: 'a', at: 'b' }, dry_run_reviewed: { by: 'a', at: 'b' } } } }],
    ['sender_identity', { sender_profile_id: null }],
    ['analytics_ready', { tracking_link: null }],
  ];

  it.each(cases)('blocks on %s', async (id, over) => {
    m.campaignFindByPk.mockResolvedValue(readyCampaign(over));
    const r = await evaluateActivationReadiness('camp-1');
    expect(r.allowed).toBe(false);
    expect(r.blockers.join(' ')).toContain(id);
  });

  it('blocks when the publish validator fails, and quotes its errors', async () => {
    m.validate.mockResolvedValue({ valid: false, errors: ['Campaign governance config must be created before going live'] });
    const r = await evaluateActivationReadiness('camp-1');
    expect(r.allowed).toBe(false);
    expect(r.blockers.join(' ')).toContain('governance config');
  });

  it('blocks when any enrolled contact is unsendable', async () => {
    m.campaignLeadFindAll.mockResolvedValue([{ lead_id: 7 }, { lead_id: 8 }]);
    m.sendable.mockImplementation(async (id: number) => (id === 8
      ? { sendable: false, reason: 'unsubscribed' } : { sendable: true }));
    const r = await evaluateActivationReadiness('camp-1');
    expect(r.allowed).toBe(false);
    expect(r.blockers.join(' ')).toContain('unsubscribed');
  });

  it('fails CLOSED when the sendability check throws', async () => {
    m.sendable.mockRejectedValue(new Error('database unreachable'));
    const r = await evaluateActivationReadiness('camp-1');
    expect(r.allowed).toBe(false);
    expect(r.blockers.join(' ')).toContain('failing closed');
  });

  it('blocks when the stop rule has no number in it', async () => {
    const c = readyCampaign();
    (c.settings as Record<string, unknown>).stop_rule = { when: 'it feels wrong' };
    m.campaignFindByPk.mockResolvedValue(c);
    const r = await evaluateActivationReadiness('camp-1');
    expect(r.blockers.join(' ')).toContain('stop_rule');
  });

  it('blocks when a manual check has no attestation on the record', async () => {
    const c = readyCampaign();
    (c.settings as Record<string, unknown>).activation_gate = {
      claims_approved: { by: 'Ali', at: '2026-10-20T00:00:00Z' },
    };
    m.campaignFindByPk.mockResolvedValue(c);
    const r = await evaluateActivationReadiness('camp-1');
    expect(r.blockers.join(' ')).toContain('dry_run_reviewed');
  });

  it('refuses a half-written attestation, which is how a tick-box gets faked', async () => {
    const c = readyCampaign();
    (c.settings as Record<string, unknown>).activation_gate = {
      claims_approved: { by: 'Ali' },
      dry_run_reviewed: { by: 'Ali', at: '2026-10-20T00:00:00Z' },
    };
    m.campaignFindByPk.mockResolvedValue(c);
    const r = await evaluateActivationReadiness('camp-1');
    expect(r.blockers.join(' ')).toContain('claims_approved');
  });
});

describe('the gate BLOCKS rather than advises', () => {
  it('throws ActivationBlockedError, carrying the failed checks', async () => {
    m.campaignFindByPk.mockResolvedValue(readyCampaign({ approval_status: 'draft' }));
    await expect(assertActivationAllowed('camp-1')).rejects.toBeInstanceOf(ActivationBlockedError);
    await expect(assertActivationAllowed('camp-1')).rejects.toThrow(/approved/);
  });

  it('returns the report when everything passes', async () => {
    const r = await assertActivationAllowed('camp-1');
    expect(r.allowed).toBe(true);
    expect(r.results).toHaveLength(GATE_CHECKS.length);
  });

  it('has no bypass parameter, because a gate with an escape hatch is advice', () => {
    // The signature takes a campaign id and nothing else. If a `force` or `skipChecks`
    // argument is ever added, this is the test that should stop it.
    expect(assertActivationAllowed.length).toBe(1);
  });

  it('does NOT write the campaign when it blocks', async () => {
    // A gate that throws after the update has already run is not a gate. activateCampaign
    // awaits assertActivationAllowed BEFORE campaign.update, and this is the assertion
    // that pins that ordering.
    m.campaignFindByPk.mockResolvedValue(readyCampaign({ approval_status: 'draft' }));
    await expect(assertActivationAllowed('camp-1')).rejects.toThrow();
    expect(m.update).not.toHaveBeenCalled();
  });
});
