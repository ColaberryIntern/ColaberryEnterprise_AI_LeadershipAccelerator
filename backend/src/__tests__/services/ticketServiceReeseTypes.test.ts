/**
 * Reese Phase 1 — confirms createTicket() accepts the new 'student_support'
 * TicketType and 'ai_staff' TicketActorType literals added to
 * backend/src/models/Ticket.ts. Same mocking convention as ticketService.test.ts.
 */
import { Ticket, TicketActivity } from '../../models';
import { emitEvent } from '../../services/workLedger/workLedgerService';
import { createTicket } from '../../services/ticketService';
import { decisionRecordInputSchema } from '../../schemas/decisionRecordSchema';

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../models', () => ({
  Ticket: { findOne: jest.fn(), create: jest.fn(), findByPk: jest.fn() },
  TicketActivity: { create: jest.fn() },
}));
jest.mock('../../services/workLedger/workLedgerService', () => ({
  emitEvent: jest.fn(),
}));
jest.mock('../../services/outcomes/outcomeMeasurementService', () => ({
  scheduleOutcomeMeasurement: jest.fn(),
}));

const ticketFindOne = Ticket.findOne as unknown as jest.Mock;
const ticketCreate = Ticket.create as unknown as jest.Mock;
const activityCreate = TicketActivity.create as unknown as jest.Mock;
const mockEmit = emitEvent as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockEmit.mockResolvedValue({ event_id: 'evt-mock' });
});

describe('createTicket — Reese TicketType/TicketActorType literals', () => {
  it('happy path: accepts type "student_support" and assigned_to_type "ai_staff"', async () => {
    ticketFindOne.mockResolvedValue(null);
    const createdTicket = {
      id: 'reese-t1',
      status: 'backlog',
      priority: 'medium',
      type: 'student_support',
      assigned_to_type: 'ai_staff',
      title: 'Student DM with Reese',
    };
    ticketCreate.mockResolvedValue(createdTicket);
    activityCreate.mockResolvedValue({ id: 'a-reese-1' });

    const result = await createTicket({
      title: 'Student DM with Reese',
      type: 'student_support',
      created_by_type: 'human',
      created_by_id: 'student-enrollment-1',
      assigned_to_type: 'ai_staff',
      assigned_to_id: 'reese-agent-1',
      entity_type: 'community_room',
      entity_id: 'dm-room-1',
    });

    expect(result).toBe(createdTicket);
    expect(ticketCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'student_support', assigned_to_type: 'ai_staff' })
    );
    expect(mockEmit).toHaveBeenCalledTimes(1);
  });

  it('boundary: an unrelated type ("bug") is still accepted unchanged — the new literal is additive, not exclusive', async () => {
    ticketFindOne.mockResolvedValue(null);
    const createdTicket = { id: 'bug-t1', status: 'backlog', priority: 'medium', type: 'bug', title: 'Existing type still works' };
    ticketCreate.mockResolvedValue(createdTicket);
    activityCreate.mockResolvedValue({ id: 'a-bug-1' });

    const result = await createTicket({
      title: 'Existing type still works',
      type: 'bug',
      created_by_type: 'human',
      created_by_id: 'ali',
    });

    expect(result).toBe(createdTicket);
    expect(ticketCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'bug' }));
  });
});

describe('decisionRecordInputSchema — Reese ai_staff actorType literal', () => {
  const base = {
    ticketId: '11111111-1111-4111-8111-111111111111',
    decisionType: 'note' as const,
    actorId: 'reese-agent-1',
  };

  it('happy path: actorType "ai_staff" is accepted (a real decision record can be attributed to Reese)', () => {
    const parsed = decisionRecordInputSchema.safeParse({ ...base, actorType: 'ai_staff' });
    expect(parsed.success).toBe(true);
  });

  it('existing literals still accepted unchanged (additive, not a breaking change)', () => {
    expect(decisionRecordInputSchema.safeParse({ ...base, actorType: 'human' }).success).toBe(true);
    expect(decisionRecordInputSchema.safeParse({ ...base, actorType: 'cory' }).success).toBe(true);
    expect(decisionRecordInputSchema.safeParse({ ...base, actorType: 'agent' }).success).toBe(true);
  });

  it('boundary/failure: an invalid, made-up actorType is still rejected', () => {
    const parsed = decisionRecordInputSchema.safeParse({ ...base, actorType: 'robot' });
    expect(parsed.success).toBe(false);
  });
});
