/**
 * Real-enforcement scoping, Phase 1 slice 1 — the first real approve/reject
 * mechanism for ApprovalRequest. Pins the not-found/not-pending guards (an
 * id from a different flow, or a row already decided, is never silently
 * re-decided), the real who/when/how fields getting set, and bulk-approve's
 * best-effort-per-id contract (one bad id never fails the whole batch).
 */
import { ApprovalRequest } from '../../../models';
import {
  listPendingApprovalRequests,
  approveApprovalRequest,
  rejectApprovalRequest,
  bulkApproveApprovalRequests,
} from '../../../services/workLedger/approvalRequestResolutionService';

jest.mock('../../../models', () => ({
  ApprovalRequest: { findByPk: jest.fn(), findAll: jest.fn() },
}));

const findByPk = ApprovalRequest.findByPk as unknown as jest.Mock;
const findAll = ApprovalRequest.findAll as unknown as jest.Mock;

function pendingRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'approval-1',
    status: 'pending',
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listPendingApprovalRequests', () => {
  it('happy path: lists real pending rows, oldest first', async () => {
    findAll.mockResolvedValue([pendingRow(), pendingRow({ id: 'approval-2' })]);

    const rows = await listPendingApprovalRequests();

    expect(rows).toHaveLength(2);
    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'pending' }, order: [['created_at', 'ASC']] }),
    );
  });
});

describe('approveApprovalRequest', () => {
  it('happy path: a real pending row transitions to approved with the real decider recorded', async () => {
    const row = pendingRow();
    findByPk.mockResolvedValue(row);

    const result = await approveApprovalRequest('approval-1', 'ali@colaberry.com');

    expect(result.outcome).toBe('approved');
    expect(row.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', decided_by: 'ali@colaberry.com', decision_channel: 'admin_ui' }),
    );
    expect(row.update.mock.calls[0][0].decided_at).toBeInstanceOf(Date);
  });

  it('boundary: an id that does not exist returns not_found rather than throwing', async () => {
    findByPk.mockResolvedValue(null);

    const result = await approveApprovalRequest('does-not-exist', 'ali@colaberry.com');

    expect(result).toEqual({ outcome: 'not_found' });
  });

  it('boundary: an already-decided row is never re-decided', async () => {
    const row = pendingRow({ status: 'rejected' });
    findByPk.mockResolvedValue(row);

    const result = await approveApprovalRequest('approval-1', 'ali@colaberry.com');

    expect(result.outcome).toBe('not_pending');
    expect(row.update).not.toHaveBeenCalled();
  });
});

describe('rejectApprovalRequest', () => {
  it('happy path: a real pending row transitions to rejected with the real decider recorded', async () => {
    const row = pendingRow();
    findByPk.mockResolvedValue(row);

    const result = await rejectApprovalRequest('approval-1', 'ali@colaberry.com');

    expect(result.outcome).toBe('rejected');
    expect(row.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', decided_by: 'ali@colaberry.com' }),
    );
  });

  it('boundary: an already-approved row is never re-decided', async () => {
    const row = pendingRow({ status: 'approved' });
    findByPk.mockResolvedValue(row);

    const result = await rejectApprovalRequest('approval-1', 'ali@colaberry.com');

    expect(result.outcome).toBe('not_pending');
    expect(row.update).not.toHaveBeenCalled();
  });
});

describe('bulkApproveApprovalRequests', () => {
  it('happy path: every real pending id in the batch gets approved', async () => {
    findByPk.mockImplementation((id: string) => Promise.resolve(pendingRow({ id })));

    const result = await bulkApproveApprovalRequests(['a1', 'a2', 'a3'], 'ali@colaberry.com');

    expect(result.approved).toEqual(['a1', 'a2', 'a3']);
    expect(result.skipped).toEqual([]);
  });

  it('boundary: one bad id in the batch is reported, never fails the whole batch', async () => {
    findByPk.mockImplementation((id: string) =>
      Promise.resolve(id === 'missing' ? null : pendingRow({ id })),
    );

    const result = await bulkApproveApprovalRequests(['a1', 'missing', 'a3'], 'ali@colaberry.com');

    expect(result.approved).toEqual(['a1', 'a3']);
    expect(result.skipped).toEqual([{ id: 'missing', reason: 'not_found' }]);
  });
});
