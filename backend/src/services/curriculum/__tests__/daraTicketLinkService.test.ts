/**
 * ProofDesk linkage tests for Dara — mirrors reeseTicketLinkService.test.ts's
 * structure exactly, swapped for Dara's own type ('curriculum_support') and
 * identity.
 */
jest.mock('../../ticketService', () => ({ createTicket: jest.fn(), addTicketComment: jest.fn() }));
jest.mock('../../workLedger/workLedgerService', () => ({ emitEvent: jest.fn() }));
jest.mock('../daraIdentitySeed', () => ({ getDaraAdminUserId: jest.fn() }));
jest.mock('../../reese/resolveStudentDisplayName', () => ({ resolveStudentDisplayName: jest.fn() }));

import { createTicket, addTicketComment } from '../../ticketService';
import { emitEvent } from '../../workLedger/workLedgerService';
import { getDaraAdminUserId } from '../daraIdentitySeed';
import { resolveStudentDisplayName } from '../../reese/resolveStudentDisplayName';
import { ensureDaraTicketForRoom, logDaraExchangeActivity } from '../daraTicketLinkService';

const mockCreateTicket = createTicket as unknown as jest.Mock;
const mockAddComment = addTicketComment as unknown as jest.Mock;
const mockEmitEvent = emitEvent as unknown as jest.Mock;
const mockGetDaraAdminUserId = getDaraAdminUserId as unknown as jest.Mock;
const mockResolveStudentDisplayName = resolveStudentDisplayName as unknown as jest.Mock;

const DARA_ADMIN_ID = 'dara-admin-1';
const ROOM_ID = 'dm-room-1';
const STUDENT_ID = 'd6a4b017-6716-4673-96b5-ab3074b70191';
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDaraAdminUserId.mockResolvedValue(DARA_ADMIN_ID);
  mockAddComment.mockResolvedValue({ id: 'activity-1' });
  mockEmitEvent.mockResolvedValue({ event_id: 'evt-1' });
  mockResolveStudentDisplayName.mockResolvedValue('Jordan Rivera');
});

describe('ensureDaraTicketForRoom', () => {
  it('happy path: creates a real curriculum_support ticket, assigned to and created by Dara, entity-linked to the DM room', async () => {
    mockCreateTicket.mockResolvedValue({ id: 'ticket-1' });

    const ticket = await ensureDaraTicketForRoom(ROOM_ID, STUDENT_ID, 'What does Module 3 cover?');

    expect(ticket).toEqual({ id: 'ticket-1' });
    expect(mockCreateTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'curriculum_support',
        entity_type: 'community_room',
        entity_id: ROOM_ID,
        created_by_type: 'ai_staff',
        created_by_id: DARA_ADMIN_ID,
        assigned_to_type: 'ai_staff',
        assigned_to_id: DARA_ADMIN_ID,
      }),
    );
  });

  it('idempotency: two calls for the SAME room pass the identical entity_type/entity_id/type triple, relying on createTicket\'s own dedup', async () => {
    mockCreateTicket.mockResolvedValue({ id: 'ticket-1' });

    const first = await ensureDaraTicketForRoom(ROOM_ID, STUDENT_ID, 'first message');
    const second = await ensureDaraTicketForRoom(ROOM_ID, STUDENT_ID, 'second message');

    expect(first.id).toBe(second.id);
    const [callA, callB] = mockCreateTicket.mock.calls;
    expect(callA[0].entity_type).toBe(callB[0].entity_type);
    expect(callA[0].entity_id).toBe(callB[0].entity_id);
    expect(callA[0].type).toBe(callB[0].type);
  });

  it('failure path: throws a clear error if Dara\'s AdminUser identity is not seeded yet, rather than creating an orphaned/misattributed ticket', async () => {
    mockGetDaraAdminUserId.mockResolvedValue(null);
    await expect(ensureDaraTicketForRoom(ROOM_ID, STUDENT_ID, 'hi')).rejects.toThrow(/AdminUser identity was seeded/);
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  it('happy path: title/description contain the resolved student name, never the raw enrollment UUID', async () => {
    mockCreateTicket.mockResolvedValue({ id: 'ticket-1' });

    await ensureDaraTicketForRoom(ROOM_ID, STUDENT_ID, 'What does Module 3 cover?');

    expect(mockResolveStudentDisplayName).toHaveBeenCalledWith(STUDENT_ID);
    const call = mockCreateTicket.mock.calls[0][0];
    expect(call.title).toContain('Jordan Rivera');
    expect(call.title).not.toMatch(UUID_PATTERN);
  });
});

describe('logDaraExchangeActivity', () => {
  it('happy path: adds a comment AND emits exactly one ledger event, keyed on the message id, under the curriculum_support domain', async () => {
    await logDaraExchangeActivity('ticket-1', 'human', STUDENT_ID, 'msg-1', 'Hello Dara');

    expect(mockAddComment).toHaveBeenCalledWith('ticket-1', 'Hello Dara', 'human', STUDENT_ID);
    expect(mockEmitEvent).toHaveBeenCalledTimes(1);
    expect(mockEmitEvent.mock.calls[0][0]).toMatchObject({
      ticketId: 'ticket-1',
      domain: 'curriculum_support',
      idempotencyKey: 'dara-exchange:msg-1',
      sourceRecordId: 'msg-1',
    });
  });

  it('boundary/failure: never throws even if the comment/ledger write fails (message delivery already happened by this point)', async () => {
    mockAddComment.mockRejectedValue(new Error('DB write failed'));
    await expect(logDaraExchangeActivity('ticket-1', 'ai_staff', DARA_ADMIN_ID, 'msg-2', 'reply text')).resolves.toBeUndefined();
  });
});
