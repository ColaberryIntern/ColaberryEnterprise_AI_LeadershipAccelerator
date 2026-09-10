/**
 * managerApprovalDecisionIntentService — Reese Agentic AI Employee mission,
 * Capability 8's APPROVE/REJECT slices of the manager-intent classifier.
 * Pure logic: pins real trigger-phrase detection for both directions, the
 * conservative entity-resolution rule (exactly one pending item required,
 * zero/many surfaced honestly rather than guessed), the honest
 * confirmation-card text, and that a confirmed decision actually calls the
 * real approveProposedAction()/rejectProposedAction() with the pending
 * record's exact proposal id — including the honest "no longer pending"
 * path rather than a fabricated success.
 *
 * Mocks agentApprovalService and managerInboxService wholesale so this file
 * never loads the real Ticket/ScheduledEmail models (agentApprovalService.ts
 * imports { ScheduledEmail } from models/index.ts, the full Sequelize
 * association barrel) — same isolation reasoning already applied to every
 * sibling intent-service test in this directory.
 */
const mockGetManagerInboxItems = jest.fn();
jest.mock('../managerInboxService', () => ({
  getManagerInboxItems: (...a: any[]) => mockGetManagerInboxItems(...a),
}));

const mockApproveProposedAction = jest.fn();
const mockRejectProposedAction = jest.fn();
jest.mock('../agentApprovalService', () => ({
  approveProposedAction: (...a: any[]) => mockApproveProposedAction(...a),
  rejectProposedAction: (...a: any[]) => mockRejectProposedAction(...a),
}));

import {
  applyConfirmedApprove,
  applyConfirmedReject,
  buildApproveConfirmationCardText,
  buildRejectConfirmationCardText,
  detectApproveIntent,
  detectRejectIntent,
  resolvePendingApprovalTarget,
  toPendingApproveConfirmation,
  toPendingRejectConfirmation,
} from '../managerApprovalDecisionIntentService';

const fakeItem = {
  id: 'proposal-1',
  actionType: 'content_optimization',
  reason: 'Subject line underperforming by 40%.',
  confidence: 0.8,
  priorityScore: null,
  riskScore: null,
  impactScore: null,
  status: 'pending' as const,
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  expiresAt: null,
  targetTable: 'scheduled_emails',
  targetId: 'email-1',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApproveProposedAction.mockResolvedValue({ outcome: 'approved', applied: true, proposal: {} });
  mockRejectProposedAction.mockResolvedValue({ outcome: 'rejected', proposal: {} });
});

describe('detectApproveIntent', () => {
  it.each(['Approve it.', 'Please approve that.', 'Yes, approve.', 'Go ahead and approve.', 'Approve the proposal.'])('trigger phrase: %p', (message) => {
    expect(detectApproveIntent(message)).toEqual({ matched: true });
  });

  it('honesty boundary: an ordinary sentence with no approve-trigger phrase — no detection, no guessing', () => {
    expect(detectApproveIntent('I approve of how CoryBrain handled this generally.')).toBeNull();
  });

  it('boundary: empty message', () => {
    expect(detectApproveIntent('')).toBeNull();
  });
});

describe('detectRejectIntent', () => {
  it.each(['Reject it.', 'Please reject that.', 'Deny it.', 'Turn it down.', 'Reject the proposal.'])('trigger phrase: %p', (message) => {
    expect(detectRejectIntent(message)).toEqual({ matched: true });
  });

  it('honesty boundary: an ordinary sentence with no reject-trigger phrase — no detection, no guessing', () => {
    expect(detectRejectIntent('This is a bad idea overall.')).toBeNull();
  });

  it('approve and reject triggers never both match the same real message', () => {
    const messages = ['Approve it.', 'Please approve that.', 'Reject it.', 'Deny that.'];
    for (const m of messages) {
      expect(detectApproveIntent(m) && detectRejectIntent(m)).toBeFalsy();
    }
  });
});

describe('resolvePendingApprovalTarget', () => {
  it("returns 'none' when the agent has zero pending proposals", async () => {
    mockGetManagerInboxItems.mockResolvedValue([]);
    expect(await resolvePendingApprovalTarget('agent-1')).toBe('none');
  });

  it("returns 'ambiguous' when more than one proposal is pending — never guesses which one", async () => {
    mockGetManagerInboxItems.mockResolvedValue([fakeItem, { ...fakeItem, id: 'proposal-2' }]);
    expect(await resolvePendingApprovalTarget('agent-1')).toBe('ambiguous');
  });

  it('returns the real item when exactly one is pending', async () => {
    mockGetManagerInboxItems.mockResolvedValue([fakeItem]);
    expect(await resolvePendingApprovalTarget('agent-1')).toEqual(fakeItem);
  });

  it("returns 'none' when the agent itself does not exist (getManagerInboxItems returns null)", async () => {
    mockGetManagerInboxItems.mockResolvedValue(null);
    expect(await resolvePendingApprovalTarget('agent-1')).toBe('none');
  });
});

describe('confirmation card text', () => {
  it('approve: restates the real reason, states the real effect, asks for confirmation', () => {
    const text = buildApproveConfirmationCardText(fakeItem);
    expect(text).toContain('Subject line underperforming by 40%.');
    expect(text).toContain('approved');
    expect(text).toContain('apply the change');
    expect(text).toContain('confirm');
  });

  it('approve: a non-scheduled_emails target never claims it applies a change', () => {
    const text = buildApproveConfirmationCardText({ ...fakeItem, targetTable: 'campaigns' });
    expect(text).not.toContain('apply the change');
  });

  it('reject: restates the real reason, states nothing changes, asks for confirmation', () => {
    const text = buildRejectConfirmationCardText(fakeItem);
    expect(text).toContain('Subject line underperforming by 40%.');
    expect(text).toContain('rejected');
    expect(text).toContain('Nothing changes');
    expect(text).toContain('confirm');
  });
});

describe('toPendingApproveConfirmation / toPendingRejectConfirmation', () => {
  it('carries the real proposal id and reason forward, tags intentType', () => {
    const approvePending = toPendingApproveConfirmation(fakeItem);
    expect(approvePending.intentType).toBe('APPROVE');
    expect(approvePending.proposalId).toBe('proposal-1');
    expect(approvePending.reason).toBe('Subject line underperforming by 40%.');

    const rejectPending = toPendingRejectConfirmation(fakeItem);
    expect(rejectPending.intentType).toBe('REJECT');
    expect(rejectPending.proposalId).toBe('proposal-1');
  });
});

describe('applyConfirmedApprove', () => {
  const pending = { intentType: 'APPROVE' as const, proposalId: 'proposal-1', reason: 'Subject line underperforming by 40%.', detectedAt: '2026-09-10T00:00:00.000Z' };

  it('calls the real approveProposedAction() with the pending record\'s exact proposal id', async () => {
    const result = await applyConfirmedApprove(pending, 'ali@colaberry.com');
    expect(mockApproveProposedAction).toHaveBeenCalledWith('proposal-1', 'ali@colaberry.com', null);
    expect(result.summary).toContain('Subject line underperforming by 40%.');
    expect(result.summary).toContain('applied');
  });

  it('a proposal that stopped being pending between turns is surfaced honestly, not silently re-approved', async () => {
    mockApproveProposedAction.mockResolvedValue({ outcome: 'not_pending' });
    const result = await applyConfirmedApprove(pending, 'ali@colaberry.com');
    expect(result.summary).toContain("couldn't approve");
    expect(result.summary).toContain('Manager Inbox');
  });
});

describe('applyConfirmedReject', () => {
  const pending = { intentType: 'REJECT' as const, proposalId: 'proposal-1', reason: 'Subject line underperforming by 40%.', detectedAt: '2026-09-10T00:00:00.000Z' };

  it('calls the real rejectProposedAction() with the pending record\'s exact proposal id', async () => {
    const result = await applyConfirmedReject(pending, 'ali@colaberry.com');
    expect(mockRejectProposedAction).toHaveBeenCalledWith('proposal-1', 'ali@colaberry.com', null);
    expect(result.summary).toContain('Subject line underperforming by 40%.');
  });

  it('an expired proposal is surfaced honestly, not silently rejected anyway', async () => {
    mockRejectProposedAction.mockResolvedValue({ outcome: 'expired' });
    const result = await applyConfirmedReject(pending, 'ali@colaberry.com');
    expect(result.summary).toContain("couldn't reject");
  });
});
