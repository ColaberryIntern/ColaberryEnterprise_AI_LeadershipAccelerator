import { recordDecision } from '../../../services/evidence/decisionRecordService';
import { recordAutoDecisionOnStatusChange } from '../../../services/evidence/ticketDecisionAutoRecorder';

// ProofDesk Decisions-tab gap fix (2026-08-23) — Ali, live: "there have been
// tickets opened and closed over the last few days, but I still don't see
// any ... nothing in the decisions tab." recordDecision() had zero automated
// callers before this change; this module is the fix. Tested in isolation
// (getEvidenceExpectations() is the REAL, pure, side-effect-free classifier —
// not mocked, so these tests exercise the real classification table rather
// than an assumption about it).

jest.mock('../../../services/evidence/decisionRecordService', () => ({
  recordDecision: jest.fn(),
}));

const mockRecordDecision = recordDecision as unknown as jest.Mock;

const TICKET_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
  mockRecordDecision.mockResolvedValue({ id: 'dec-1' });
});

describe('recordAutoDecisionOnStatusChange', () => {
  it("happy path: a 'strategic' ticket (decisions:'expected' per evidenceExpectationService) reaching 'in_review' auto-records an honest 'note'", async () => {
    await recordAutoDecisionOnStatusChange(
      { type: 'strategic', source: 'cory', created_by_type: 'cory' },
      TICKET_ID,
      'in_progress',
      'in_review',
      'cory',
      'cory-engine',
    );

    expect(mockRecordDecision).toHaveBeenCalledWith({
      ticketId: TICKET_ID,
      decisionType: 'note',
      actorType: 'cory',
      actorId: 'cory-engine',
      rationale: 'Ticket transitioned from in_progress to in_review.',
    });
  });

  it("happy path: a 'strategic' ticket reaching 'done' also auto-records", async () => {
    await recordAutoDecisionOnStatusChange(
      { type: 'strategic', source: 'cory', created_by_type: 'cory' },
      TICKET_ID,
      'in_review',
      'done',
      'human',
      'ali@colaberry.com',
    );

    expect(mockRecordDecision).toHaveBeenCalledTimes(1);
    expect(mockRecordDecision.mock.calls[0][0]).toMatchObject({ decisionType: 'note', actorType: 'human', actorId: 'ali@colaberry.com' });
  });

  it("boundary: a 'task' ticket (decisions:'not_applicable' by default) reaching 'done' never calls recordDecision — this is the honesty gate, not a new source of noise on every routine ticket", async () => {
    await recordAutoDecisionOnStatusChange(
      { type: 'task', source: 'cory', created_by_type: 'agent' },
      TICKET_ID,
      'in_progress',
      'done',
      'agent',
      'PlatformFixAgent',
    );

    expect(mockRecordDecision).not.toHaveBeenCalled();
  });

  it("boundary: transitions to any status OTHER than in_review/done never call recordDecision, even for a decisions:'expected' type", async () => {
    await recordAutoDecisionOnStatusChange(
      { type: 'strategic', source: 'cory', created_by_type: 'cory' },
      TICKET_ID,
      'todo',
      'in_progress',
      'cory',
      'cory-engine',
    );

    expect(mockRecordDecision).not.toHaveBeenCalled();
  });

  it('honesty: a human-filed ticket of ANY type is always decisions:expected (the created_by_type===human override), so it auto-records too', async () => {
    await recordAutoDecisionOnStatusChange(
      { type: 'task', source: 'manual', created_by_type: 'human' },
      TICKET_ID,
      'in_progress',
      'done',
      'human',
      'ali@colaberry.com',
    );

    expect(mockRecordDecision).toHaveBeenCalledTimes(1);
  });

  it('failure isolation: recordDecision rejecting never throws out of this function', async () => {
    mockRecordDecision.mockRejectedValue(new Error('DB unavailable'));

    await expect(
      recordAutoDecisionOnStatusChange(
        { type: 'strategic', source: 'cory', created_by_type: 'cory' },
        TICKET_ID,
        'in_review',
        'done',
        'human',
        'ali@colaberry.com',
      ),
    ).resolves.toBeUndefined();
  });
});
