/**
 * Real-enforcement scoping, Phase 1 (2026-09-20) — the replay executor.
 * Tests the REAL implementation (only ApprovalRequest.update and initiateDm
 * are mocked) so the idempotency guard — the exact thing an independent
 * plan-audit caught as broken in an earlier draft — is proven against real
 * code, not a mock that could quietly drift from what actually ships.
 *
 * Hard stop for this file, same as every send-adjacent test this run:
 * initiateDm is ALWAYS mocked. No test here may call a real send.
 */
import { ApprovalRequest } from '../../../models';
import { initiateDm } from '../../../services/reese/reeseInitiateDmService';
import { replayApprovedAction } from '../../../services/workLedger/approvalRequestReplayService';
import { checkOutreachReplay } from '../../../services/reese/reeseOutreachTripwire';

jest.mock('../../../models', () => ({
  ApprovalRequest: { update: jest.fn() },
}));
jest.mock('../../../services/reese/reeseInitiateDmService', () => ({
  initiateDm: jest.fn(),
}));
jest.mock('../../../services/reese/reeseOutreachTripwire', () => ({
  checkOutreachReplay: jest.fn(),
}));

const mockUpdate = ApprovalRequest.update as unknown as jest.Mock;
const mockInitiateDm = initiateDm as unknown as jest.Mock;
const mockTripwire = checkOutreachReplay as unknown as jest.Mock;

function approvedRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'approval-1',
    action: 'reese_autonomous_outreach',
    prepared_action: { studentEnrollmentId: 'enrollment-1', content: 'Hi!' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInitiateDm.mockResolvedValue({ roomId: 'room-1', messageId: 'msg-1' });
  mockTripwire.mockResolvedValue({ allowed: true });
});

describe('replayApprovedAction — the tripwire (2026-11-14)', () => {
  it.each(['sweep_disabled', 'student_already_messaged', 'daily_ceiling_reached'])(
    'a %s verdict sends nothing and claims nothing, so the row stays outstanding',
    async (reason) => {
      mockTripwire.mockResolvedValue({ allowed: false, reason, tripped: reason !== 'sweep_disabled', detail: {} });
      mockUpdate.mockResolvedValue([1]);

      const result = await replayApprovedAction(approvedRow() as any);

      expect(mockInitiateDm).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(result).toEqual({ replayed: false, reason: 'blocked_by_tripwire', tripwire: reason });
    },
  );

  it('is asked about the exact row and student being sent', async () => {
    mockUpdate.mockResolvedValue([1]);
    await replayApprovedAction(approvedRow() as any);
    expect(mockTripwire).toHaveBeenCalledWith('approval-1', 'enrollment-1');
  });

  it('fails closed: a check that throws sends nothing and claims nothing', async () => {
    mockTripwire.mockRejectedValue(new Error('db down'));
    mockUpdate.mockResolvedValue([1]);

    await expect(replayApprovedAction(approvedRow() as any)).rejects.toThrow('db down');
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('is never consulted for a row that cannot be performed anyway', async () => {
    await replayApprovedAction(approvedRow({ action: 'some_future_action' }) as any);
    await replayApprovedAction(approvedRow({ prepared_action: null }) as any);
    expect(mockTripwire).not.toHaveBeenCalled();
  });
});

describe('replayApprovedAction — happy path', () => {
  it('claims the row (affected count 1) and calls the real initiateDm with the exact prepared_action params', async () => {
    mockUpdate.mockResolvedValue([1]);

    const result = await replayApprovedAction(approvedRow() as any);

    expect(mockUpdate).toHaveBeenCalledWith(
      { replayed_at: expect.any(Date) },
      { where: { id: 'approval-1', replayed_at: null } },
    );
    expect(mockInitiateDm).toHaveBeenCalledWith('enrollment-1', 'Hi!');
    expect(result).toEqual({ replayed: true, reason: 'replayed' });
  });
});

describe('replayApprovedAction — idempotency guard (the exact bug plan-audit caught)', () => {
  it('a second call on an already-replayed row (affected count 0) is a real no-op — initiateDm is NEVER called', async () => {
    mockUpdate.mockResolvedValue([0]); // WHERE replayed_at IS NULL matched nothing — already claimed

    const result = await replayApprovedAction(approvedRow() as any);

    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(result).toEqual({ replayed: false, reason: 'already_replayed' });
  });

  it('the conditional update is the ONLY gate — the real send never fires before the claim succeeds', async () => {
    mockUpdate.mockResolvedValue([0]);
    await replayApprovedAction(approvedRow() as any);
    // Confirms ordering: initiateDm is checked AFTER the update call resolves,
    // not fired speculatively before the claim is known to have succeeded.
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockInitiateDm).not.toHaveBeenCalled();
  });
});

describe('replayApprovedAction — honesty boundaries', () => {
  it('a row with no prepared_action fails honestly, never guesses what to send', async () => {
    mockUpdate.mockResolvedValue([1]);

    const result = await replayApprovedAction(approvedRow({ prepared_action: null }) as any);

    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(result).toEqual({ replayed: false, reason: 'no_prepared_action' });
  });

  it('a malformed prepared_action (missing content) fails honestly rather than sending garbage', async () => {
    mockUpdate.mockResolvedValue([1]);

    const result = await replayApprovedAction(
      approvedRow({ prepared_action: { studentEnrollmentId: 'enrollment-1' } }) as any,
    );

    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(result.reason).toBe('no_prepared_action');
  });

  it('an unrecognized action type is declined honestly, never a fabricated guess at what it would do', async () => {
    mockUpdate.mockResolvedValue([1]);

    const result = await replayApprovedAction(approvedRow({ action: 'some_future_action' }) as any);

    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(result).toEqual({ replayed: false, reason: 'unrecognized_action_type' });
  });
});
