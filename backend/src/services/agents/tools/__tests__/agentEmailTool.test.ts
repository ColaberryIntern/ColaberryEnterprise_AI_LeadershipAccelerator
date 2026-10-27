const findOne = jest.fn();
const query = jest.fn();
const evaluateSend = jest.fn();

jest.mock('../../../../models', () => ({
  AiAgent: { findOne: (...a: unknown[]) => findOne(...a) },
}));
jest.mock('../../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => query(...a) },
}));
jest.mock('../../../communicationSafetyService', () => ({
  evaluateSend: (...a: unknown[]) => evaluateSend(...a),
}));

// `agentAutonomy` is NOT mocked. Its own docblock calls it "pure, dependency-free policy", so the
// real 4-rung ladder runs here. Mocking it would leave the single most important question of this
// suite - does `observe` actually refuse to send - answered by a stub.
import {
  sendAgentEmail, readAgentGate, AGENT_EMAIL_TOOL, AGENT_DRAFT_STATUS,
} from '../agentEmailTool';

/**
 * The shared agent email tool.
 *
 * ── WHAT THIS SUITE IS REALLY FOR ───────────────────────────────────────────
 *
 * Two of the three things that should gate an AI mailing a stranger do not:
 * `authorizeAgentAction` is shadow-mode and fails open (production
 * `abac_enforcement = "shadow"`), and `tools_granted` is read by nothing. So this tool's own
 * decision IS the control, and these assertions are the only thing standing between a model's
 * output and a real person's inbox.
 *
 * Ordered by what it would cost to get wrong:
 *
 *  1. A SUPPRESSED recipient produces NO DRAFT. Not a block-and-draft - nothing. A draft to
 *     someone who unsubscribed is an unsubscribe waiting to be overridden by a tired reviewer.
 *  2. `observe` NEVER SENDS. That is 264 of 266 production agents, including every admissions one.
 *  3. A draft is never stored as `'pending'`, because the sender claims exactly that status.
 *  4. Every uncertainty - no grant, unknown autonomy, unreadable agent, no brand scope - drafts.
 */

const REQ = {
  agentName: 'AdmissionsAssistantAgent',
  leadId: 42,
  toEmail: 'dana@example.com',
  subject: 'Following up on your AI course',
  body: 'Hello Dana,',
  campaignId: 'camp-training-1',
};

function agentRow(over: Record<string, unknown> = {}) {
  return {
    autonomy_level: 'communicate',
    tools_granted: [AGENT_EMAIL_TOOL],
    enabled: true,
    status: 'active',
    ...over,
  };
}

/** The INSERT's bind values, i.e. what would actually be written. */
function draftBind(): Record<string, unknown> {
  return (query.mock.calls[0][1] as { bind: Record<string, unknown> }).bind;
}

beforeEach(() => {
  findOne.mockReset();
  query.mockReset();
  evaluateSend.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});

  findOne.mockResolvedValue(agentRow());
  query.mockResolvedValue([{ id: 'draft-1' }]);
  evaluateSend.mockResolvedValue({
    allowed: true, redirect: null, testMode: false, deliveryMode: 'live',
  });
});

describe('a suppressed recipient', () => {
  it('is BLOCKED and produces NO DRAFT', async () => {
    evaluateSend.mockResolvedValue({
      allowed: false, blockedReason: 'unsubscribed', redirect: null,
      testMode: false, deliveryMode: 'blocked',
    });

    const r = await sendAgentEmail(REQ);

    expect(r.outcome).toBe('blocked');
    expect(r.reason).toBe('unsubscribed');
    expect(r.draftId).toBeNull();
    // The whole point: nothing was written for a human to later approve.
    expect(query).not.toHaveBeenCalled();
  });

  it('is blocked before the agent gate even matters', async () => {
    // A suppressed address plus a fully privileged agent is still a block.
    evaluateSend.mockResolvedValue({
      allowed: false, blockedReason: 'brand_no_relationship', redirect: null,
      testMode: false, deliveryMode: 'blocked',
    });

    expect((await sendAgentEmail(REQ)).outcome).toBe('blocked');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('the autonomy ladder, run for real', () => {
  it.each(['observe', 'suggest', 'act_audited'])('%s drafts and never sends', async (level) => {
    findOne.mockResolvedValue(agentRow({ autonomy_level: level }));

    const r = await sendAgentEmail(REQ);

    expect(r.outcome).toBe('drafted');
    expect(r.reason).toBe(`autonomy_insufficient:${level}`);
    expect(r.autonomyLevel).toBe(level);
  });

  it('observe is the production default for 264 of 266 agents, so this is the live behaviour', async () => {
    findOne.mockResolvedValue(agentRow({ autonomy_level: 'observe' }));
    expect((await sendAgentEmail(REQ)).outcome).toBe('drafted');
  });

  it('an unrecognised level is not treated as privileged', async () => {
    findOne.mockResolvedValue(agentRow({ autonomy_level: 'superuser' }));

    const r = await sendAgentEmail(REQ);

    expect(r.reason).toBe('autonomy_unknown');
    expect(r.autonomyLevel).toBeNull();
  });

  it('communicate is the only rung that clears the gate', async () => {
    const gate = await readAgentGate(REQ.agentName);
    expect(gate.usable).toBe(true);
    expect(gate.level).toBe('communicate');
  });
});

describe('the grant, which nothing else in the codebase enforces', () => {
  it('refuses when send_email is absent from tools_granted', async () => {
    findOne.mockResolvedValue(agentRow({ tools_granted: [] }));

    const r = await sendAgentEmail(REQ);

    expect(r.outcome).toBe('drafted');
    expect(r.reason).toBe('tool_not_granted');
    expect(r.toolGranted).toBe(false);
  });

  it('is the live state: every production agent holds an empty array', async () => {
    findOne.mockResolvedValue(agentRow({ tools_granted: [], autonomy_level: 'communicate' }));

    const r = await sendAgentEmail(REQ);

    // Asserting the REASON, not just the outcome. An earlier version of this test checked only
    // `outcome === 'drafted'` and kept passing when the grant check was mutated to always-true -
    // because everything drafts in this change anyway. It proved nothing. The reason is the only
    // part of the result that distinguishes "refused for want of a grant" from "drafted for some
    // other reason", and it is what will still bite once the transport is wired.
    expect(r.reason).toBe('tool_not_granted');
    expect(r.toolGranted).toBe(false);
  });

  it('does not accept a JSON STRING as a grant', async () => {
    // jsonb round-trips differently depending on who wrote it. A string that merely CONTAINS the
    // grant name is not an array containing it, and must not read as permission.
    findOne.mockResolvedValue(agentRow({ tools_granted: '["send_email"]' }));

    expect((await sendAgentEmail(REQ)).reason).toBe('tool_not_granted');
  });

  it('does not accept null', async () => {
    findOne.mockResolvedValue(agentRow({ tools_granted: null }));
    expect((await sendAgentEmail(REQ)).reason).toBe('tool_not_granted');
  });

  it('accepts a grant alongside other tools', async () => {
    findOne.mockResolvedValue(agentRow({ tools_granted: ['retrieve_knowledge', AGENT_EMAIL_TOOL] }));
    expect((await readAgentGate(REQ.agentName)).usable).toBe(true);
  });
});

describe('an agent that cannot be read or used', () => {
  it('drafts when the agent does not exist', async () => {
    findOne.mockResolvedValue(null);
    expect((await sendAgentEmail(REQ)).reason).toBe('agent_not_found');
  });

  it('drafts when the lookup THROWS, rather than assuming permission', async () => {
    findOne.mockRejectedValue(new Error('db down'));
    expect((await sendAgentEmail(REQ)).reason).toBe('agent_lookup_failed');
  });

  it('drafts when the agent is disabled', async () => {
    findOne.mockResolvedValue(agentRow({ enabled: false }));
    expect((await sendAgentEmail(REQ)).reason).toBe('agent_disabled');
  });

  it('drafts when the agent is paused', async () => {
    findOne.mockResolvedValue(agentRow({ status: 'paused' }));
    expect((await sendAgentEmail(REQ)).reason).toBe('agent_paused');
  });
});

describe('brand scope', () => {
  it('drafts without a campaign, because the brand and consent checks could not run', async () => {
    const r = await sendAgentEmail({ ...REQ, campaignId: null });

    expect(r.outcome).toBe('drafted');
    expect(r.reason).toBe('no_brand_scope');
  });

  it('passes the campaign through so the gate can derive tenant and brand', async () => {
    await sendAgentEmail(REQ);
    expect(evaluateSend.mock.calls[0][0]).toMatchObject({
      leadId: 42, campaignId: 'camp-training-1', channel: 'email', toEmail: 'dana@example.com',
    });
  });
});

describe('the draft row itself', () => {
  it('is NOT stored as pending, which is the only status the sender claims', async () => {
    findOne.mockResolvedValue(agentRow({ autonomy_level: 'observe' }));
    await sendAgentEmail(REQ);

    expect(draftBind().status).toBe(AGENT_DRAFT_STATUS);
    expect(draftBind().status).not.toBe('pending');
  });

  it('carries the agent, the reason and the tool, so a reviewer knows what they are reading', async () => {
    findOne.mockResolvedValue(agentRow({ autonomy_level: 'observe' }));
    await sendAgentEmail(REQ);

    const meta = JSON.parse(draftBind().metadata as string);
    expect(meta).toMatchObject({
      agent_name: 'AdmissionsAssistantAgent',
      draft_reason: 'autonomy_insufficient:observe',
      tool: AGENT_EMAIL_TOOL,
    });
  });

  it('keeps the composed subject and body verbatim', async () => {
    findOne.mockResolvedValue(agentRow({ autonomy_level: 'observe' }));
    await sendAgentEmail(REQ);

    expect(draftBind()).toMatchObject({
      leadId: 42,
      toEmail: 'dana@example.com',
      subject: 'Following up on your AI course',
      body: 'Hello Dana,',
    });
  });

  it('returns a null draftId when the write fails, without throwing', async () => {
    findOne.mockResolvedValue(agentRow({ autonomy_level: 'observe' }));
    query.mockRejectedValue(new Error('insert failed'));

    const r = await sendAgentEmail(REQ);

    expect(r.outcome).toBe('drafted');
    expect(r.draftId).toBeNull();
  });
});

describe('an unevaluable send gate', () => {
  it('drafts rather than sending when evaluateSend throws', async () => {
    evaluateSend.mockRejectedValue(new Error('safety service down'));

    const r = await sendAgentEmail(REQ);

    expect(r.outcome).toBe('drafted');
    expect(r.reason).toBe('send_evaluation_failed');
  });
});

describe('the fully-cleared path', () => {
  it('still drafts, because the transport is deliberately not wired yet', async () => {
    // Granted, `communicate`, enabled, brand-scoped, not suppressed - and it STILL does not mail.
    // The decision logic and its tests land before the ability to mail strangers does.
    const r = await sendAgentEmail(REQ);

    expect(r.outcome).toBe('drafted');
    expect(r.reason).toBe('transport_not_wired');
    expect(r.toolGranted).toBe(true);
    expect(r.autonomyLevel).toBe('communicate');
  });

  it('never returns sent anywhere in this change', async () => {
    const cases = [
      agentRow(),
      agentRow({ autonomy_level: 'observe' }),
      agentRow({ tools_granted: [] }),
    ];
    for (const row of cases) {
      findOne.mockResolvedValue(row);
      // eslint-disable-next-line no-await-in-loop
      expect((await sendAgentEmail(REQ)).outcome).not.toBe('sent');
    }
  });
});
