/**
 * ProofDesk linkage tests — the core success criterion: first message creates a
 * ticket + a ledger event; a second message in the same thread updates the SAME
 * ticket (idempotency), never a duplicate.
 */
jest.mock('../../ticketService', () => ({ createTicket: jest.fn(), addTicketComment: jest.fn() }));
jest.mock('../../workLedger/workLedgerService', () => ({ emitEvent: jest.fn() }));
jest.mock('../reeseIdentitySeed', () => ({ getReeseAdminUserId: jest.fn() }));

import { createTicket, addTicketComment } from '../../ticketService';
import { emitEvent } from '../../workLedger/workLedgerService';
import { getReeseAdminUserId } from '../reeseIdentitySeed';
import { ensureReeseTicketForRoom, logReeseExchangeActivity } from '../reeseTicketLinkService';

const mockCreateTicket = createTicket as unknown as jest.Mock;
const mockAddComment = addTicketComment as unknown as jest.Mock;
const mockEmitEvent = emitEvent as unknown as jest.Mock;
const mockGetReeseAdminUserId = getReeseAdminUserId as unknown as jest.Mock;

const REESE_ADMIN_ID = 'reese-admin-1';
const ROOM_ID = 'dm-room-1';
const STUDENT_ID = 'student-enrollment-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetReeseAdminUserId.mockResolvedValue(REESE_ADMIN_ID);
  mockAddComment.mockResolvedValue({ id: 'activity-1' });
  mockEmitEvent.mockResolvedValue({ event_id: 'evt-1' });
});

describe('ensureReeseTicketForRoom', () => {
  it('happy path: creates a real student_support ticket, assigned to and created by Reese, entity-linked to the DM room', async () => {
    mockCreateTicket.mockResolvedValue({ id: 'ticket-1' });

    const ticket = await ensureReeseTicketForRoom(ROOM_ID, STUDENT_ID, 'I am stuck on my project.');

    expect(ticket).toEqual({ id: 'ticket-1' });
    expect(mockCreateTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'student_support',
        entity_type: 'community_room',
        entity_id: ROOM_ID,
        created_by_type: 'ai_staff',
        created_by_id: REESE_ADMIN_ID,
        assigned_to_type: 'ai_staff',
        assigned_to_id: REESE_ADMIN_ID,
      }),
    );
  });

  it('idempotency: calling it twice for the SAME room relies on (and does not fight) createTicket\'s own entity+type dedup — every call passes the identical entity_type/entity_id/type triple', async () => {
    mockCreateTicket.mockResolvedValue({ id: 'ticket-1' }); // simulates createTicket's dedup returning the same ticket both times

    const first = await ensureReeseTicketForRoom(ROOM_ID, STUDENT_ID, 'first message');
    const second = await ensureReeseTicketForRoom(ROOM_ID, STUDENT_ID, 'second message');

    expect(first.id).toBe(second.id); // same ticket, not a new one
    expect(mockCreateTicket).toHaveBeenCalledTimes(2);
    const [callA, callB] = mockCreateTicket.mock.calls;
    expect(callA[0].entity_type).toBe(callB[0].entity_type);
    expect(callA[0].entity_id).toBe(callB[0].entity_id);
    expect(callA[0].type).toBe(callB[0].type);
  });

  it('failure path: throws a clear error if Reese\'s AdminUser identity is not seeded yet, rather than creating an orphaned/misattributed ticket', async () => {
    mockGetReeseAdminUserId.mockResolvedValue(null);
    await expect(ensureReeseTicketForRoom(ROOM_ID, STUDENT_ID, 'hi')).rejects.toThrow(/AdminUser identity was seeded/);
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  it('boundary: a very long opening message is truncated to a snippet in the description, not stored unbounded', async () => {
    mockCreateTicket.mockResolvedValue({ id: 'ticket-1' });
    const longMessage = 'x'.repeat(1000);

    await ensureReeseTicketForRoom(ROOM_ID, STUDENT_ID, longMessage);

    const description = mockCreateTicket.mock.calls[0][0].description as string;
    // The 1000-char raw message must NOT appear verbatim — only a bounded
    // snippet (<= 301 chars: 300 + the truncation ellipsis) is embedded.
    expect(description).not.toContain(longMessage);
    const embeddedRun = description.match(/x+/)?.[0] ?? '';
    expect(embeddedRun.length).toBeLessThanOrEqual(300);
  });
});

describe('logReeseExchangeActivity', () => {
  it('happy path: adds a comment AND emits exactly one ledger event, keyed on the message id', async () => {
    await logReeseExchangeActivity('ticket-1', 'human', STUDENT_ID, 'msg-1', 'Hello Reese');

    expect(mockAddComment).toHaveBeenCalledWith('ticket-1', 'Hello Reese', 'human', STUDENT_ID);
    expect(mockEmitEvent).toHaveBeenCalledTimes(1);
    expect(mockEmitEvent.mock.calls[0][0]).toMatchObject({
      ticketId: 'ticket-1',
      idempotencyKey: 'reese-exchange:msg-1',
      sourceRecordId: 'msg-1',
    });
  });

  it('boundary/failure: never throws even if the comment/ledger write fails (message delivery already happened by this point)', async () => {
    mockAddComment.mockRejectedValue(new Error('DB write failed'));
    await expect(logReeseExchangeActivity('ticket-1', 'ai_staff', REESE_ADMIN_ID, 'msg-2', 'reply text')).resolves.toBeUndefined();
  });
});
