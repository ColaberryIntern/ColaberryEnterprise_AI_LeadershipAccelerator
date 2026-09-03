/**
 * agentApprovalService — extracted from agentGovernanceController.ts
 * (AI Agent Dashboard redesign, Checkpoint B). First dedicated test coverage
 * this approve/reject logic has ever had — pins the exact behavior that was
 * previously only inline in the controller: expiry-before-status-check
 * ordering, the scheduled_emails-only real executor, and that every other
 * target_table only flips status without touching a downstream record.
 */
const mockFindByPk = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../../models/ProposedAgentAction', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockFindByPk(...a) },
}));

const mockEmailFindByPk = jest.fn();
const mockEmailUpdate = jest.fn();
jest.mock('../../models', () => ({
  ScheduledEmail: { findByPk: (...a: any[]) => mockEmailFindByPk(...a) },
}));

const mockLogAiEvent = jest.fn();
jest.mock('../aiEventService', () => ({ logAiEvent: (...a: any[]) => mockLogAiEvent(...a) }));

import { approveProposedAction, rejectProposedAction } from '../agentApprovalService';

function makeProposal(overrides: Record<string, any> = {}) {
  return {
    id: 'p1',
    agent_name: 'CoryStrategicAgent',
    action_type: 'propose_content_rewrite',
    target_table: 'onboarding_templates',
    target_id: 't1',
    proposed_changes: { body: 'new copy' },
    status: 'pending',
    expires_at: null,
    update: mockUpdate.mockImplementation(function (this: any, fields: any) {
      Object.assign(this, fields);
      return Promise.resolve(this);
    }),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('approveProposedAction', () => {
  it('not_found: a nonexistent proposal returns outcome not_found, updates nothing', async () => {
    mockFindByPk.mockResolvedValue(null);
    const result = await approveProposedAction('missing', 'ali@colaberry.com', null);
    expect(result.outcome).toBe('not_found');
  });

  it('not_pending: an already-decided proposal is untouched and returns its real current status', async () => {
    const proposal = makeProposal({ status: 'approved' });
    mockFindByPk.mockResolvedValue(proposal);
    const result: any = await approveProposedAction('p1', 'ali@colaberry.com', null);
    expect(result.outcome).toBe('not_pending');
    expect(result.proposal.status).toBe('approved');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('expired: an expired proposal is marked expired and never applied, checked BEFORE the executor runs', async () => {
    const proposal = makeProposal({ target_table: 'scheduled_emails', expires_at: new Date(Date.now() - 1000) });
    mockFindByPk.mockResolvedValue(proposal);

    const result: any = await approveProposedAction('p1', 'ali@colaberry.com', null);

    expect(result.outcome).toBe('expired');
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'expired' });
    expect(mockEmailFindByPk).not.toHaveBeenCalled();
  });

  it('real executor: target_table=scheduled_emails applies the proposed changes to the real record', async () => {
    const proposal = makeProposal({ target_table: 'scheduled_emails', target_id: 'email-1' });
    mockFindByPk.mockResolvedValue(proposal);
    mockEmailFindByPk.mockResolvedValue({ update: mockEmailUpdate.mockResolvedValue(undefined) });

    const result: any = await approveProposedAction('p1', 'ali@colaberry.com', 'looks fine');

    expect(mockEmailFindByPk).toHaveBeenCalledWith('email-1');
    expect(mockEmailUpdate).toHaveBeenCalledWith({ body: 'new copy' });
    expect(result.outcome).toBe('approved');
    expect(result.applied).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved', applied_at: expect.any(Date), review_notes: 'looks fine' }));
  });

  it('decorative approval: every other target_table only flips status, never touches a downstream record', async () => {
    const proposal = makeProposal({ target_table: 'onboarding_templates' });
    mockFindByPk.mockResolvedValue(proposal);

    const result: any = await approveProposedAction('p1', 'ali@colaberry.com', null);

    expect(mockEmailFindByPk).not.toHaveBeenCalled();
    expect(result.outcome).toBe('approved');
    expect(result.applied).toBe(false);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved', applied_at: null }));
  });

  it('real executor, target record missing: applied stays false, still marks approved (never throws on a dangling reference)', async () => {
    const proposal = makeProposal({ target_table: 'scheduled_emails', target_id: 'gone' });
    mockFindByPk.mockResolvedValue(proposal);
    mockEmailFindByPk.mockResolvedValue(null);

    const result: any = await approveProposedAction('p1', 'ali@colaberry.com', null);

    expect(result.applied).toBe(false);
    expect(mockEmailUpdate).not.toHaveBeenCalled();
  });

  it('logs a real ai_event on approval, tagged with the real reviewer', async () => {
    const proposal = makeProposal();
    mockFindByPk.mockResolvedValue(proposal);
    await approveProposedAction('p1', 'ali@colaberry.com', null);
    expect(mockLogAiEvent).toHaveBeenCalledWith('agent_governance', 'proposal_approved', undefined, undefined, expect.objectContaining({ proposal_id: 'p1', reviewed_by: 'ali@colaberry.com' }));
  });
});

describe('rejectProposedAction', () => {
  it('not_found: a nonexistent proposal returns outcome not_found', async () => {
    mockFindByPk.mockResolvedValue(null);
    const result = await rejectProposedAction('missing', 'ali@colaberry.com', null);
    expect(result.outcome).toBe('not_found');
  });

  it('not_pending: an already-decided proposal is untouched', async () => {
    const proposal = makeProposal({ status: 'rejected' });
    mockFindByPk.mockResolvedValue(proposal);
    const result: any = await rejectProposedAction('p1', 'ali@colaberry.com', null);
    expect(result.outcome).toBe('not_pending');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('happy path: flips status to rejected, never calls any executor', async () => {
    const proposal = makeProposal({ target_table: 'scheduled_emails' });
    mockFindByPk.mockResolvedValue(proposal);

    const result: any = await rejectProposedAction('p1', 'ali@colaberry.com', 'too risky');

    expect(result.outcome).toBe('rejected');
    expect(mockEmailFindByPk).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected', review_notes: 'too risky' }));
  });
});
