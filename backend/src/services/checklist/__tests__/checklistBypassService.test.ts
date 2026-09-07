const mockFindByPk = jest.fn();
jest.mock('../../../models/ChecklistInstance', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockFindByPk(...a) },
}));

const mockEmitLedgerEventSafe = jest.fn();
jest.mock('../../workLedger/emitLedgerEventSafe', () => ({ emitLedgerEventSafe: (...a: any[]) => mockEmitLedgerEventSafe(...a) }));

import { bypassChecklistInstance, ChecklistInstanceNotFoundError } from '../checklistBypassService';

function fakeInstance(overrides: Record<string, any> = {}) {
  return {
    id: 'checklist-1',
    complete: false,
    bypassed_at: null,
    bypassed_by_email: null,
    bypass_reason: null,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEmitLedgerEventSafe.mockResolvedValue(undefined);
});

describe('bypassChecklistInstance', () => {
  it('happy path: a real actor + real reason updates the instance with the bypass fields and emits a real audit event', async () => {
    const instance = fakeInstance();
    mockFindByPk.mockResolvedValue(instance);

    const result = await bypassChecklistInstance('checklist-1', 'ali@colaberry.com', 'Identity confirmed manually via a direct call with the student.');

    expect(result.granted).toBe(true);
    expect(instance.update).toHaveBeenCalledWith(expect.objectContaining({
      bypassed_by_email: 'ali@colaberry.com',
      bypass_reason: 'Identity confirmed manually via a direct call with the student.',
    }));
    expect(mockEmitLedgerEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      actorType: 'human', actorId: 'ali@colaberry.com', domain: 'checklist', actionClass: 'checklist_bypass',
      targetType: 'checklist_instance', targetId: 'checklist-1', result: 'success',
      idempotencyKey: 'checklist_bypass:checklist-1',
    }));
  });

  it('BREAK: a nonexistent checklist instance throws ChecklistInstanceNotFoundError and never calls update or the ledger', async () => {
    mockFindByPk.mockResolvedValue(null);

    await expect(bypassChecklistInstance('does-not-exist', 'ali@colaberry.com', 'A real, sufficiently long reason.'))
      .rejects.toBeInstanceOf(ChecklistInstanceNotFoundError);
    expect(mockEmitLedgerEventSafe).not.toHaveBeenCalled();
  });

  it('BREAK: an insufficient reason is refused, never updates the row, never emits an audit event', async () => {
    const instance = fakeInstance();
    mockFindByPk.mockResolvedValue(instance);

    const result = await bypassChecklistInstance('checklist-1', 'ali@colaberry.com', 'too short');

    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.refusals.map((r) => r.rule)).toContain('reason_insufficient');
    expect(instance.update).not.toHaveBeenCalled();
    expect(mockEmitLedgerEventSafe).not.toHaveBeenCalled();
  });

  it('idempotency: the ledger event key is keyed only on the checklist instance id, so a retried bypass call cannot double-record the audit event', async () => {
    const instance = fakeInstance();
    mockFindByPk.mockResolvedValue(instance);

    await bypassChecklistInstance('checklist-1', 'ali@colaberry.com', 'Identity confirmed manually via a direct call.');
    await bypassChecklistInstance('checklist-1', 'ali@colaberry.com', 'Identity confirmed manually via a direct call.');

    expect(mockEmitLedgerEventSafe.mock.calls[0][0].idempotencyKey).toBe(mockEmitLedgerEventSafe.mock.calls[1][0].idempotencyKey);
  });
});
