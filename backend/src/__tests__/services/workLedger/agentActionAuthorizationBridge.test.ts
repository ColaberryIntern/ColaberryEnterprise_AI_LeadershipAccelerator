import { ApprovalRequest } from '../../../models';
import { authorizeAgentAction } from '../../../services/agentAuthorizationService';
import { authorizeTicketDispatch } from '../../../services/workLedger/agentActionAuthorizationBridge';

jest.mock('../../../models', () => ({
  ApprovalRequest: { findOrCreate: jest.fn() },
}));
jest.mock('../../../services/agentAuthorizationService', () => ({
  authorizeAgentAction: jest.fn(),
}));

const findOrCreate = ApprovalRequest.findOrCreate as unknown as jest.Mock;
const mockAuthorize = authorizeAgentAction as unknown as jest.Mock;

const baseInput = {
  eventId: '11111111-1111-4111-8111-111111111111',
  ticketId: '22222222-2222-4222-8222-222222222222',
  agentName: 'CurriculumArchitectAgent',
  action: 'ticket_dispatch',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authorizeTicketDispatch — happy path (R1, would_allow)', () => {
  it('returns would_allow and creates NO approval_requests row', async () => {
    mockAuthorize.mockResolvedValue({
      allowed: true,
      enforced: false,
      reason: 'ok',
      requiresApproval: false,
      level: 'act_audited',
      wouldDeny: false,
      mode: 'shadow',
    });

    const result = await authorizeTicketDispatch({ ...baseInput, riskTier: 'R1' });

    expect(result).toEqual({ decisionId: null, verdict: 'would_allow', reason: 'ok', allowed: true });
    expect(findOrCreate).not.toHaveBeenCalled();
  });
});

describe('authorizeTicketDispatch — boundary (R3, would_require_approval)', () => {
  it('returns would_require_approval and creates exactly one REAL, actionable approval_requests row (not the inert shadow_logged status)', async () => {
    mockAuthorize.mockResolvedValue({
      allowed: true, // shadow mode never actually denies
      enforced: false,
      reason: 'requires_approval:high_risk_tier',
      requiresApproval: true,
      level: 'act_audited',
      wouldDeny: true,
      mode: 'shadow',
    });
    findOrCreate.mockResolvedValue([{ id: 'approval-row-1' }, true]);

    const result = await authorizeTicketDispatch({ ...baseInput, riskTier: 'R3' });

    expect(result).toEqual({
      decisionId: 'approval-row-1',
      verdict: 'would_require_approval',
      reason: 'requires_approval:high_risk_tier',
      allowed: true, // shadow mode — mirrors authorizeAgentAction()'s own allowed
    });
    expect(findOrCreate).toHaveBeenCalledTimes(1);
    expect(findOrCreate.mock.calls[0][0]).toMatchObject({
      where: { event_id: baseInput.eventId },
      defaults: expect.objectContaining({
        event_id: baseInput.eventId,
        ticket_id: baseInput.ticketId,
        risk_tier: 'R3',
        verdict: 'would_require_approval',
        status: 'pending',
      }),
    });
  });

  it('a hard block (wouldDeny + no requiresApproval) is recorded as would_block', async () => {
    mockAuthorize.mockResolvedValue({
      allowed: true,
      enforced: false,
      reason: 'kill_switch_active',
      requiresApproval: false,
      level: 'observe',
      wouldDeny: true,
      mode: 'shadow',
    });
    findOrCreate.mockResolvedValue([{ id: 'approval-row-2' }, true]);

    const result = await authorizeTicketDispatch(baseInput);

    expect(result.verdict).toBe('would_block');
    expect(result.decisionId).toBe('approval-row-2');
  });
});

describe('authorizeTicketDispatch — allowed (Real-enforcement Phase 2, mode-aware signal)', () => {
  it('allowed mirrors authorizeAgentAction()\'s real allowed field — NOT re-derived from wouldDeny/verdict here', async () => {
    // Forced-enforce-mode scenario, exercised ONLY by mocking authorizeAgentAction()'s
    // return value directly — this test never touches the real abac_enforcement setting.
    mockAuthorize.mockResolvedValue({
      allowed: false, // enforced: true and wouldDeny: true => a real hold
      enforced: true,
      reason: 'requires_approval:high_risk_tier',
      requiresApproval: true,
      level: 'act_audited',
      wouldDeny: true,
      mode: 'enforce',
    });
    findOrCreate.mockResolvedValue([{ id: 'approval-row-6' }, true]);

    const result = await authorizeTicketDispatch({ ...baseInput, riskTier: 'R3' });

    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe('would_require_approval'); // verdict stays mode-independent
  });

  it('allowed is true in shadow mode even on a would_require_approval verdict — the real, current, unconditional default', async () => {
    mockAuthorize.mockResolvedValue({
      allowed: true, // shadow mode never actually denies
      enforced: false,
      reason: 'requires_approval:high_risk_tier',
      requiresApproval: true,
      level: 'act_audited',
      wouldDeny: true,
      mode: 'shadow',
    });
    findOrCreate.mockResolvedValue([{ id: 'approval-row-7' }, true]);

    const result = await authorizeTicketDispatch({ ...baseInput, riskTier: 'R3' });

    expect(result.allowed).toBe(true);
  });
});

describe('authorizeTicketDispatch — prepared_action / expires_at (Real-enforcement Phase 1)', () => {
  it('happy path: a real preparedAction is written to prepared_action verbatim, and a real future expires_at is set', async () => {
    mockAuthorize.mockResolvedValue({
      allowed: true, enforced: false, reason: 'requires_approval:high_risk_tier',
      requiresApproval: true, level: 'act_audited', wouldDeny: true, mode: 'shadow',
    });
    findOrCreate.mockResolvedValue([{ id: 'approval-row-4' }, true]);
    const before = Date.now();

    await authorizeTicketDispatch({
      ...baseInput, riskTier: 'R3',
      preparedAction: { studentEnrollmentId: 'enrollment-1', content: 'Hi!' },
    });

    const defaults = findOrCreate.mock.calls[0][0].defaults;
    expect(defaults.prepared_action).toEqual({ studentEnrollmentId: 'enrollment-1', content: 'Hi!' });
    expect(defaults.expires_at).toBeInstanceOf(Date);
    expect(defaults.expires_at.getTime()).toBeGreaterThan(before);
  });

  it('boundary: omitting preparedAction is honestly null, never fabricated — every existing caller keeps working unchanged', async () => {
    mockAuthorize.mockResolvedValue({
      allowed: true, enforced: false, reason: 'requires_approval:high_risk_tier',
      requiresApproval: true, level: 'act_audited', wouldDeny: true, mode: 'shadow',
    });
    findOrCreate.mockResolvedValue([{ id: 'approval-row-5' }, true]);

    await authorizeTicketDispatch({ ...baseInput, riskTier: 'R3' });

    expect(findOrCreate.mock.calls[0][0].defaults.prepared_action).toBeNull();
  });
});

describe('authorizeTicketDispatch — idempotency (same eventId twice = one row, not two)', () => {
  it('a second call with the same eventId returns the existing row via findOrCreate, no duplicate', async () => {
    mockAuthorize.mockResolvedValue({
      allowed: true,
      enforced: false,
      reason: 'requires_approval:high_risk_tier',
      requiresApproval: true,
      level: 'act_audited',
      wouldDeny: true,
      mode: 'shadow',
    });
    // Sequelize's findOrCreate itself is what guarantees this at the DB layer (proven
    // against real Postgres in T002); here we assert the bridge calls it with the
    // SAME where-clause both times, which is what makes that guarantee reachable.
    findOrCreate.mockResolvedValueOnce([{ id: 'approval-row-3' }, true]);
    findOrCreate.mockResolvedValueOnce([{ id: 'approval-row-3' }, false]);

    const first = await authorizeTicketDispatch({ ...baseInput, riskTier: 'R4' });
    const second = await authorizeTicketDispatch({ ...baseInput, riskTier: 'R4' });

    expect(first.decisionId).toBe('approval-row-3');
    expect(second.decisionId).toBe('approval-row-3');
    expect(findOrCreate).toHaveBeenCalledTimes(2);
    expect(findOrCreate.mock.calls[0][0].where).toEqual({ event_id: baseInput.eventId });
    expect(findOrCreate.mock.calls[1][0].where).toEqual({ event_id: baseInput.eventId });
  });
});

describe('authorizeTicketDispatch — failure (authorizeAgentAction throws)', () => {
  it('degrades to the safe would_allow default, never throws, never writes a row', async () => {
    mockAuthorize.mockRejectedValue(new Error('registry lookup failed'));

    const result = await authorizeTicketDispatch(baseInput);

    // allowed: true here is the load-bearing assertion (Real-enforcement Phase 2) — a
    // transient bridge error must never look like a real policy hold to a caller
    // branching on .allowed (reeseAutonomousOutreachService.ts, reeseReplyService.ts).
    expect(result).toEqual({ decisionId: null, verdict: 'would_allow', reason: 'bridge_error', allowed: true });
    expect(findOrCreate).not.toHaveBeenCalled();
  });
});

describe('authorizeTicketDispatch — failure (approval_requests write itself throws)', () => {
  it('degrades to the safe default rather than propagating a DB error', async () => {
    mockAuthorize.mockResolvedValue({
      allowed: true,
      enforced: false,
      reason: 'requires_approval:high_risk_tier',
      requiresApproval: true,
      level: 'act_audited',
      wouldDeny: true,
      mode: 'shadow',
    });
    findOrCreate.mockRejectedValue(new Error('connection lost'));

    const result = await authorizeTicketDispatch({ ...baseInput, riskTier: 'R3' });

    // allowed: true here too — the policy call itself said allowed:true/wouldDeny:true
    // (a real would-require-approval verdict), but the DB write failing must still
    // degrade to the same fail-open default, not leak a stale/partial allowed value.
    expect(result).toEqual({ decisionId: null, verdict: 'would_allow', reason: 'bridge_error', allowed: true });
  });
});
