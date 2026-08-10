/**
 * Generic ticket-linkage tests. Reese's own reeseTicketLinkService.test.ts still
 * covers the Reese-wrapper's exact behavior unchanged; this file proves the
 * EXTRACTED generic core works for an arbitrary agent config, not just Reese's.
 */
jest.mock('../../ticketService', () => ({ createTicket: jest.fn(), addTicketComment: jest.fn() }));
jest.mock('../../workLedger/workLedgerService', () => ({ emitEvent: jest.fn() }));

import { createTicket, addTicketComment } from '../../ticketService';
import { emitEvent } from '../../workLedger/workLedgerService';
import { ensureAgentTicketForRoom, logAgentExchangeActivity, snippet } from '../agentTicketLinkService';

const mockCreateTicket = createTicket as unknown as jest.Mock;
const mockAddComment = addTicketComment as unknown as jest.Mock;
const mockEmitEvent = emitEvent as unknown as jest.Mock;

const AGENT_ADMIN_ID = 'cqa-admin-1';
const ROOM_ID = 'review-room-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockAddComment.mockResolvedValue({ id: 'activity-1' });
  mockEmitEvent.mockResolvedValue({ event_id: 'evt-1' });
});

describe('ensureAgentTicketForRoom', () => {
  it('happy path: creates a ticket with the supplied shape, assigned to and created by the agent', async () => {
    mockCreateTicket.mockResolvedValue({ id: 'ticket-1' });

    const ticket = await ensureAgentTicketForRoom({
      roomId: ROOM_ID,
      agentAdminUserId: AGENT_ADMIN_ID,
      agentLabel: 'CurriculumQA',
      title: 'Curriculum review — Week 3 Overview',
      description: 'CurriculumQA flagged a factual issue in Week 3 Overview.',
      type: 'curriculum',
      entityType: 'curriculum_review',
    });

    expect(ticket).toEqual({ id: 'ticket-1' });
    expect(mockCreateTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'curriculum',
        entity_type: 'curriculum_review',
        entity_id: ROOM_ID,
        created_by_type: 'ai_staff',
        created_by_id: AGENT_ADMIN_ID,
        assigned_to_type: 'ai_staff',
        assigned_to_id: AGENT_ADMIN_ID,
      }),
    );
  });

  it('idempotency: calling it twice for the SAME room passes the identical entity_type/entity_id/type triple', async () => {
    mockCreateTicket.mockResolvedValue({ id: 'ticket-1' });
    const input = {
      roomId: ROOM_ID, agentAdminUserId: AGENT_ADMIN_ID, agentLabel: 'CurriculumQA',
      title: 't', description: 'd', type: 'curriculum' as const, entityType: 'curriculum_review',
    };

    const first = await ensureAgentTicketForRoom(input);
    const second = await ensureAgentTicketForRoom(input);

    expect(first.id).toBe(second.id);
    const [callA, callB] = mockCreateTicket.mock.calls;
    expect(callA[0].entity_type).toBe(callB[0].entity_type);
    expect(callA[0].entity_id).toBe(callB[0].entity_id);
    expect(callA[0].type).toBe(callB[0].type);
  });

  it('failure path: throws a clear error if the agent\'s AdminUser identity is not seeded yet', async () => {
    await expect(ensureAgentTicketForRoom({
      roomId: ROOM_ID, agentAdminUserId: null, agentLabel: 'CurriculumQA',
      title: 't', description: 'd', type: 'curriculum', entityType: 'curriculum_review',
    })).rejects.toThrow(/AdminUser identity was seeded/);
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });
});

describe('snippet', () => {
  it('boundary: truncates content longer than the max length with an ellipsis', () => {
    const long = 'x'.repeat(1000);
    const result = snippet(long);
    expect(result.length).toBeLessThanOrEqual(301);
    expect(result.endsWith('…')).toBe(true);
  });

  it('boundary: content at or under the max length is returned unchanged (trimmed)', () => {
    expect(snippet('  short message  ')).toBe('short message');
  });
});

describe('logAgentExchangeActivity', () => {
  it('happy path: adds a comment AND emits exactly one ledger event with the supplied intent prefix and domain', async () => {
    await logAgentExchangeActivity('ticket-1', 'human', 'user-1', 'msg-1', 'Hello', 'curriculumqa', 'curriculum_review');

    expect(mockAddComment).toHaveBeenCalledWith('ticket-1', 'Hello', 'human', 'user-1');
    expect(mockEmitEvent).toHaveBeenCalledTimes(1);
    expect(mockEmitEvent.mock.calls[0][0]).toMatchObject({
      ticketId: 'ticket-1',
      intent: 'curriculumqa.student_message',
      domain: 'curriculum_review',
      idempotencyKey: 'curriculumqa-exchange:msg-1',
      sourceRecordId: 'msg-1',
    });
  });

  it('happy path: ai_staff actor produces the .reply intent variant', async () => {
    await logAgentExchangeActivity('ticket-1', 'ai_staff', AGENT_ADMIN_ID, 'msg-2', 'Reviewed.', 'curriculumqa', 'curriculum_review');
    expect(mockEmitEvent.mock.calls[0][0].intent).toBe('curriculumqa.reply');
  });

  it('boundary/failure: never throws even if the comment/ledger write fails', async () => {
    mockAddComment.mockRejectedValue(new Error('DB write failed'));
    await expect(
      logAgentExchangeActivity('ticket-1', 'ai_staff', AGENT_ADMIN_ID, 'msg-3', 'reply text', 'curriculumqa', 'curriculum_review'),
    ).resolves.toBeUndefined();
  });
});
