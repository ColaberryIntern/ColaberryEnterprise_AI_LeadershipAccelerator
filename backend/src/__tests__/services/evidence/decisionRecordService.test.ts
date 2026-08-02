import { DecisionRecord } from '../../../models';
import { recordDecision, getDecisionsForTicket, DecisionRecordValidationError } from '../../../services/evidence/decisionRecordService';

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models', () => ({
  DecisionRecord: { create: jest.fn(), findAll: jest.fn() },
}));

const recordCreate = DecisionRecord.create as unknown as jest.Mock;
const recordFindAll = DecisionRecord.findAll as unknown as jest.Mock;

const TICKET_ID = '11111111-1111-4111-8111-111111111111';
const EVIDENCE_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('recordDecision', () => {
  it('happy path: creates a decision record with the given fields', async () => {
    const created = { id: 'dec-1', ticket_id: TICKET_ID, decision_type: 'approve' };
    recordCreate.mockResolvedValue(created);

    const result = await recordDecision({
      ticketId: TICKET_ID,
      decisionType: 'approve',
      actorType: 'human',
      actorId: 'ali@colaberry.com',
      rationale: 'Screenshot confirms the fix.',
      linkedEvidenceIds: [EVIDENCE_ID],
    } as any);

    expect(result).toBe(created);
    expect(recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: TICKET_ID,
        decision_type: 'approve',
        actor_id: 'ali@colaberry.com',
        linked_evidence_ids: [EVIDENCE_ID],
      }),
    );
  });

  it('boundary: rejects a decision_type outside the enum before writing anything', async () => {
    await expect(
      recordDecision({
        ticketId: TICKET_ID,
        decisionType: 'maybe',
        actorType: 'human',
        actorId: 'ali@colaberry.com',
      } as any),
    ).rejects.toThrow(DecisionRecordValidationError);
    expect(recordCreate).not.toHaveBeenCalled();
  });

  it('failure path: rejects a missing/empty actorId before writing anything', async () => {
    await expect(
      recordDecision({
        ticketId: TICKET_ID,
        decisionType: 'note',
        actorType: 'human',
        actorId: '',
      } as any),
    ).rejects.toThrow(DecisionRecordValidationError);
    expect(recordCreate).not.toHaveBeenCalled();
  });
});

describe('getDecisionsForTicket', () => {
  it('happy path: returns decisions for the ticket, most recent first', async () => {
    const rows = [{ id: 'dec-2' }, { id: 'dec-1' }];
    recordFindAll.mockResolvedValue(rows);

    const result = await getDecisionsForTicket(TICKET_ID);

    expect(result).toBe(rows);
    expect(recordFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ticket_id: TICKET_ID } }),
    );
  });

  it('boundary: a ticket with no decisions returns an empty array', async () => {
    recordFindAll.mockResolvedValue([]);

    const result = await getDecisionsForTicket(TICKET_ID);

    expect(result).toEqual([]);
  });
});
