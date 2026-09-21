/**
 * T509 — acceptance 6: an approve or reject of a growth-journey proposal by a
 * caller without access to the receipt's brand is a 403 on BOTH approval
 * surfaces (Admin > Agents and the Manager Inbox), and the caller's identity is
 * what each handler hands to its service. The services are mocked: what is
 * pinned here is the wiring and the status code, nothing else.
 */
const m = { approve: jest.fn(), reject: jest.fn(), inboxApprove: jest.fn(), inboxReject: jest.fn() };
jest.mock('../../services/agentApprovalService', () => ({
  approveProposedAction: (...a: unknown[]) => m.approve(...a),
  rejectProposedAction: (...a: unknown[]) => m.reject(...a),
}));
jest.mock('../../services/managerInboxService', () => ({
  getManagerInboxItems: jest.fn(),
  approveManagerInboxItem: (...a: unknown[]) => m.inboxApprove(...a),
  rejectManagerInboxItem: (...a: unknown[]) => m.inboxReject(...a),
}));
// agentGovernanceController pulls the models barrel and a handful of services for its other handlers; none run here.
jest.mock('../../models', () => ({ ScheduledEmail: {}, AiAgent: {} }));
jest.mock('../../models/ProposedAgentAction', () => ({ __esModule: true, default: {} }));
jest.mock('../../models/AgentWriteAudit', () => ({ __esModule: true, default: {} }));
jest.mock('../../intelligence/agents/agentFactory', () => ({ activatePendingAgent: jest.fn() }));
jest.mock('../../services/agentPermissionService', () => ({ emergencyStopAllAgents: jest.fn(), resumeAgentsAfterStop: jest.fn(), getAgentPermission: jest.fn() }));
jest.mock('../../services/agentResourceMonitor', () => ({ evaluateAllAgents: jest.fn() }));
jest.mock('../../services/proposalCleanupService', () => ({ getProposalStats: jest.fn() }));
jest.mock('../../services/agentSafetyAlertService', () => ({ runSafetySweep: jest.fn() }));
jest.mock('../../services/aiEventService', () => ({ logAiEvent: jest.fn() }));

import { handleApproveProposal, handleRejectProposal } from '../agentGovernanceController';
import { handleApproveManagerInboxItem, handleRejectManagerInboxItem } from '../managerInboxController';

const ADMIN = { id: 'au-1', email: 'reviewer@example.com', role: 'admin' };
const res = () => {
  const r: { statusCode: number; body: unknown; status: (c: number) => typeof r; json: (b: unknown) => typeof r } = {
    statusCode: 200, body: null,
    status(c: number) { r.statusCode = c; return r; },
    json(b: unknown) { r.body = b; return r; },
  };
  return r;
};
const next = jest.fn();

beforeEach(() => { for (const fn of Object.values(m)) fn.mockReset(); next.mockReset(); });

describe('Admin > Agents (agentGovernanceController)', () => {
  it('approve: hands req.admin to the service; not_authorized -> 403, nothing else in the body', async () => {
    m.approve.mockResolvedValue({ outcome: 'not_authorized', proposal: { id: 'pa-1', status: 'pending' } });
    const r = res();
    await handleApproveProposal({ params: { id: 'pa-1' }, body: { notes: 'ok' }, admin: ADMIN } as never, r as never, next);
    expect(m.approve).toHaveBeenCalledWith('pa-1', ADMIN.email, 'ok', ADMIN);
    expect([r.statusCode, r.body]).toEqual([403, { error: 'Not authorized to approve this proposal' }]);
    expect(next).not.toHaveBeenCalled();
  });

  it('reject: the same', async () => {
    m.reject.mockResolvedValue({ outcome: 'not_authorized', proposal: { id: 'pa-1', status: 'pending' } });
    const r = res();
    await handleRejectProposal({ params: { id: 'pa-1' }, body: {}, admin: ADMIN } as never, r as never, next);
    expect(m.reject).toHaveBeenCalledWith('pa-1', ADMIN.email, null, ADMIN);
    expect([r.statusCode, r.body]).toEqual([403, { error: 'Not authorized to reject this proposal' }]);
  });

  it('the pre-existing mappings hold: not_found 404, not_pending 400, expired 400, approved 200', async () => {
    for (const [outcome, code] of [['not_found', 404], ['not_pending', 400], ['expired', 400], ['approved', 200]] as Array<[string, number]>) {
      m.approve.mockResolvedValue({ outcome, applied: false, proposal: { id: 'pa-1', status: 'x' } });
      const r = res();
      await handleApproveProposal({ params: { id: 'pa-1' }, body: {}, admin: ADMIN } as never, r as never, next);
      expect([outcome, r.statusCode]).toEqual([outcome, code]);
    }
  });
});

describe('Manager Inbox (managerInboxController)', () => {
  it('approve: hands req.admin to the inbox service; not_authorized -> 403', async () => {
    m.inboxApprove.mockResolvedValue({ outcome: 'not_authorized', item: { status: 'pending' } });
    const r = res();
    await handleApproveManagerInboxItem({ params: { id: 'agent-1', proposalId: 'pa-1' }, body: {}, admin: ADMIN } as never, r as never);
    expect(m.inboxApprove).toHaveBeenCalledWith('agent-1', 'pa-1', ADMIN.email, null, ADMIN);
    expect([r.statusCode, r.body]).toEqual([403, { error: 'Not authorized to approve this proposal' }]);
  });

  it('reject: the same', async () => {
    m.inboxReject.mockResolvedValue({ outcome: 'not_authorized', item: { status: 'pending' } });
    const r = res();
    await handleRejectManagerInboxItem({ params: { id: 'agent-1', proposalId: 'pa-1' }, body: { notes: 'no' }, admin: ADMIN } as never, r as never);
    expect(m.inboxReject).toHaveBeenCalledWith('agent-1', 'pa-1', ADMIN.email, 'no', ADMIN);
    expect([r.statusCode, r.body]).toEqual([403, { error: 'Not authorized to reject this proposal' }]);
  });

  it('the pre-existing mappings hold: not_found 404, not_pending 400, expired 400, approved 200', async () => {
    for (const [outcome, code] of [['not_found', 404], ['not_pending', 400], ['expired', 400], ['approved', 200]] as Array<[string, number]>) {
      m.inboxApprove.mockResolvedValue({ outcome, applied: false, item: { status: 'x' } });
      const r = res();
      await handleApproveManagerInboxItem({ params: { id: 'agent-1', proposalId: 'pa-1' }, body: {}, admin: ADMIN } as never, r as never);
      expect([outcome, r.statusCode]).toEqual([outcome, code]);
    }
  });
});
