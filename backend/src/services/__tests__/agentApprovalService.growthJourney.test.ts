/**
 * T509 — the growth-journey branch of approveProposedAction / rejectProposedAction.
 *
 * Every other target_table is byte-for-byte the pre-existing behaviour (pinned by
 * agentApprovalService.test.ts); this suite pins the one new branch: the receipt
 * is flipped through approvalApply (never enrolled), `not_authorized` leaves the
 * proposal `pending`, and a receipt that is no longer pending records the
 * approval unapplied.
 */
const mockFindByPk = jest.fn();
jest.mock('../../models/ProposedAgentAction', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => mockFindByPk(...a) } }));
const mockEmailFindByPk = jest.fn();
jest.mock('../../models', () => ({ ScheduledEmail: { findByPk: (...a: any[]) => mockEmailFindByPk(...a) } }));
const mockLogAiEvent = jest.fn();
jest.mock('../aiEventService', () => ({ logAiEvent: (...a: any[]) => mockLogAiEvent(...a) }));
const mockApply = jest.fn();
const mockReject = jest.fn();
jest.mock('../growthJourney/execution/approvalApply', () => ({
  applyExecutionApproval: (...a: any[]) => mockApply(...a),
  applyExecutionRejection: (...a: any[]) => mockReject(...a),
}));

import { approveProposedAction, rejectProposedAction } from '../agentApprovalService';
import { PROPOSAL_TARGET_TABLE } from '../growthJourney/execution/proposalFiler';

const ADMIN = { id: 'au-1', email: 'reviewer@example.com', role: 'admin' };

function proposal(overrides: Record<string, any> = {}) {
  const update = jest.fn(function (this: any, fields: any) { Object.assign(this, fields); return Promise.resolve(this); });
  return {
    id: 'pa-1', agent_name: 'GrowthJourneyExecutor', action_type: 'growth_journey_execution',
    target_table: PROPOSAL_TARGET_TABLE, target_id: 'ex-1', proposed_changes: { status: 'approved' }, before_state: { status: 'pending_review' },
    status: 'pending', expires_at: null, update, ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEmailFindByPk.mockResolvedValue(null);
});

describe('approve', () => {
  it('acceptance 3: with access, the receipt is approved through approvalApply (the identity handed through), the proposal is approved and applied - and nothing here enrols', async () => {
    const p = proposal();
    mockFindByPk.mockResolvedValue(p);
    mockApply.mockResolvedValue({ outcome: 'approved', receipt: { id: 'ex-1' } });
    const r = await approveProposedAction('pa-1', 'reviewer@example.com', 'ok', ADMIN);
    expect(r.outcome).toBe('approved');
    expect(mockApply).toHaveBeenCalledWith('ex-1', ADMIN);
    expect(p.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved', reviewed_by: 'reviewer@example.com', review_notes: 'ok', applied_at: expect.any(Date) }));
    expect((r as { applied: boolean }).applied).toBe(true);
    expect(mockEmailFindByPk).not.toHaveBeenCalled();
    expect(mockLogAiEvent).toHaveBeenCalledWith('agent_governance', 'proposal_approved', undefined, undefined, expect.objectContaining({ proposal_id: 'pa-1', applied: true }));
  });

  it('acceptance 1: no admin -> not_authorized, and the proposal stays pending (no update, no event)', async () => {
    const p = proposal();
    mockFindByPk.mockResolvedValue(p);
    mockApply.mockResolvedValue({ outcome: 'not_authorized' });
    const r = await approveProposedAction('pa-1', 'reviewer@example.com', null);
    expect(r).toEqual({ outcome: 'not_authorized', proposal: p });
    expect(mockApply).toHaveBeenCalledWith('ex-1', undefined);
    expect(p.update).not.toHaveBeenCalled();
    expect(p.status).toBe('pending');
    expect(mockLogAiEvent).not.toHaveBeenCalled();
  });

  it('a receipt that is no longer pending (expired by the reconciler, say): the proposal records the approval UNAPPLIED', async () => {
    const p = proposal();
    mockFindByPk.mockResolvedValue(p);
    mockApply.mockResolvedValue({ outcome: 'not_pending', status: 'expired' });
    const r = await approveProposedAction('pa-1', 'reviewer@example.com', null, ADMIN);
    expect(r.outcome).toBe('approved');
    expect((r as { applied: boolean }).applied).toBe(false);
    expect(p.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved', applied_at: null }));
  });

  it('the pre-existing order holds: expiry is checked before the branch, so an expired journey proposal never reaches the receipt', async () => {
    const p = proposal({ expires_at: new Date(Date.now() - 1000) });
    mockFindByPk.mockResolvedValue(p);
    const r = await approveProposedAction('pa-1', 'reviewer@example.com', null, ADMIN);
    expect(r.outcome).toBe('expired');
    expect(mockApply).not.toHaveBeenCalled();
    expect(p.update).toHaveBeenCalledWith({ status: 'expired' });
  });

  it('acceptance 5: every other target_table ignores the identity and only flips status, exactly as before', async () => {
    const p = proposal({ target_table: 'onboarding_templates', target_id: 't1' });
    mockFindByPk.mockResolvedValue(p);
    const r = await approveProposedAction('pa-1', 'reviewer@example.com', null, ADMIN);
    expect(r.outcome).toBe('approved');
    expect((r as { applied: boolean }).applied).toBe(false);
    expect(mockApply).not.toHaveBeenCalled();
    expect(p.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved', applied_at: null }));
  });
});

describe('reject', () => {
  it('acceptance 4: with access, the receipt is rejected through approvalApply and the proposal is rejected', async () => {
    const p = proposal();
    mockFindByPk.mockResolvedValue(p);
    mockReject.mockResolvedValue({ outcome: 'rejected', receipt: { id: 'ex-1' } });
    const r = await rejectProposedAction('pa-1', 'reviewer@example.com', 'no', ADMIN);
    expect(r.outcome).toBe('rejected');
    expect(mockReject).toHaveBeenCalledWith('ex-1', ADMIN);
    expect(p.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected', reviewed_by: 'reviewer@example.com', review_notes: 'no' }));
  });

  it('no admin -> not_authorized, the proposal stays pending', async () => {
    const p = proposal();
    mockFindByPk.mockResolvedValue(p);
    mockReject.mockResolvedValue({ outcome: 'not_authorized' });
    expect(await rejectProposedAction('pa-1', 'reviewer@example.com', null)).toEqual({ outcome: 'not_authorized', proposal: p });
    expect(p.update).not.toHaveBeenCalled();
  });

  it('a receipt already past pending_review: the proposal is still rejected (the reviewer said no), nothing else moves', async () => {
    const p = proposal();
    mockFindByPk.mockResolvedValue(p);
    mockReject.mockResolvedValue({ outcome: 'not_pending', status: 'approved' });
    const r = await rejectProposedAction('pa-1', 'reviewer@example.com', null, ADMIN);
    expect(r.outcome).toBe('rejected');
    expect(p.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }));
  });

  it('every other target_table rejects exactly as before, the identity ignored', async () => {
    const p = proposal({ target_table: 'onboarding_templates' });
    mockFindByPk.mockResolvedValue(p);
    const r = await rejectProposedAction('pa-1', 'reviewer@example.com', null, ADMIN);
    expect(r.outcome).toBe('rejected');
    expect(mockReject).not.toHaveBeenCalled();
  });
});
