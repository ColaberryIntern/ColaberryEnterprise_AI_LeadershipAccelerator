import { WorkLedgerEvent } from '../../../models';
import { emitEvent } from '../../../services/workLedger/workLedgerService';
import { checkSeparationOfDuty, recordSeparationOfDutyFlag } from '../../../services/workLedger/separationOfDutyService';

jest.mock('../../../models', () => ({
  WorkLedgerEvent: { findAll: jest.fn() },
}));
jest.mock('../../../services/workLedger/workLedgerService', () => ({ emitEvent: jest.fn() }));

const findAll = WorkLedgerEvent.findAll as unknown as jest.Mock;
const mockEmit = emitEvent as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('checkSeparationOfDuty — happy/no-flag (different agents)', () => {
  it('returns flagged:false when this agent has no prior R2+ event on the ticket', async () => {
    findAll.mockResolvedValue([]); // this agent has zero prior high-risk events here

    const result = await checkSeparationOfDuty('tk1', 'CurriculumQAAgent');

    expect(result).toEqual({ flagged: false, priorEventIds: [] });
    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ticket_id: 'tk1', actor_id: 'CurriculumQAAgent' }),
      }),
    );
  });
});

describe('checkSeparationOfDuty — violation (same agent did prior R2+ work)', () => {
  it('returns flagged:true with the prior event ids when a match exists', async () => {
    findAll.mockResolvedValue([{ event_id: 'evt-prior-1' }, { event_id: 'evt-prior-2' }]);

    const result = await checkSeparationOfDuty('tk2', 'CurriculumArchitectAgent');

    expect(result.flagged).toBe(true);
    expect(result.priorEventIds).toEqual(['evt-prior-1', 'evt-prior-2']);
  });
});

describe('checkSeparationOfDuty — boundary (ticket with no prior events at all)', () => {
  it('does not crash and returns flagged:false for a brand-new ticket', async () => {
    findAll.mockResolvedValue([]);

    await expect(checkSeparationOfDuty('tk-brand-new', 'CurriculumQAAgent')).resolves.toEqual({
      flagged: false,
      priorEventIds: [],
    });
  });
});

describe('checkSeparationOfDuty — failure (query throws)', () => {
  it('degrades to flagged:false rather than propagating the error', async () => {
    findAll.mockRejectedValue(new Error('DB unavailable'));

    const result = await checkSeparationOfDuty('tk3', 'CurriculumQAAgent');

    expect(result).toEqual({ flagged: false, priorEventIds: [] });
  });
});

describe('recordSeparationOfDutyFlag — writes a log-only ledger event', () => {
  it('calls emitEvent with the expected shape', async () => {
    mockEmit.mockResolvedValue({ event_id: 'flag-evt-1' });

    await recordSeparationOfDutyFlag({
      ticketId: 'tk4',
      runId: 'run4',
      traceId: '11111111-1111-4111-8111-111111111111',
      agentName: 'CurriculumQAAgent',
      idempotencyKey: 'separation-of-duty:evt-abc',
      priorEventIds: ['evt-prior-1'],
    });

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit.mock.calls[0][0]).toMatchObject({
      ticketId: 'tk4',
      actionClass: 'separation_of_duty_flag',
      result: 'skipped',
      reasonCode: 'same_agent_prior_r2plus_action',
      idempotencyKey: 'separation-of-duty:evt-abc',
    });
  });

  it('a write failure is caught locally and never propagates', async () => {
    mockEmit.mockRejectedValue(new Error('ledger unavailable'));

    await expect(
      recordSeparationOfDutyFlag({
        ticketId: 'tk5',
        traceId: '22222222-2222-4222-8222-222222222222',
        agentName: 'CurriculumQAAgent',
        idempotencyKey: 'separation-of-duty:evt-def',
        priorEventIds: [],
      }),
    ).resolves.toBeUndefined();
  });
});
