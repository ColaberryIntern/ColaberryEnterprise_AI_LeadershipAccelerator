/**
 * Real-enforcement scoping, Phase 1 (2026-09-20) — the auto-approve-timeout
 * sweep. Calls the real approveApprovalRequest() (mocked here so this file
 * stays scoped to the sweep's own query/loop logic; approveApprovalRequest's
 * own replay wiring is tested in its own file).
 */
import { ApprovalRequest } from '../../../models';
import { approveApprovalRequest } from '../../../services/workLedger/approvalRequestResolutionService';
import { sweepExpiredApprovalRequests } from '../../../services/workLedger/approvalRequestTimeoutJob';

jest.mock('../../../models', () => ({
  ApprovalRequest: { findAll: jest.fn() },
}));
jest.mock('../../../services/workLedger/approvalRequestResolutionService', () => ({
  approveApprovalRequest: jest.fn(),
}));

const findAll = ApprovalRequest.findAll as unknown as jest.Mock;
const mockApprove = approveApprovalRequest as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockApprove.mockResolvedValue({ outcome: 'approved' });
});

describe('sweepExpiredApprovalRequests', () => {
  it('happy path: queries only status=pending rows past their real expires_at, and approves each one via the real path', async () => {
    findAll.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);

    await sweepExpiredApprovalRequests();

    const callArgs = findAll.mock.calls[0][0];
    expect(callArgs.where.status).toBe('pending');
    expect(callArgs.where.expires_at).toBeDefined();
    expect(mockApprove).toHaveBeenCalledTimes(2);
    expect(mockApprove).toHaveBeenCalledWith('a1', 'system:auto_approve_timeout', 'auto_timeout');
    expect(mockApprove).toHaveBeenCalledWith('a2', 'system:auto_approve_timeout', 'auto_timeout');
  });

  it('boundary: no expired rows means no approve calls, never a fabricated action', async () => {
    findAll.mockResolvedValue([]);

    await sweepExpiredApprovalRequests();

    expect(mockApprove).not.toHaveBeenCalled();
  });
});
