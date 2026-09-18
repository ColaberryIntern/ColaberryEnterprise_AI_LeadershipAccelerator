/**
 * Dara v2 Phase 4 — "mandatory inter-agent ticket handoff, never off-ledger."
 * Every real escalation creates its OWN standalone agent_handoff ticket.
 */
jest.mock('../../ticketService', () => ({ createTicket: jest.fn() }));
jest.mock('../../reese/resolveStudentDisplayName', () => ({ resolveStudentDisplayName: jest.fn() }));
jest.mock('../daraBasecampGatewayService', () => ({ createBasecampTodoForHandoff: jest.fn() }));

import { createTicket } from '../../ticketService';
import { resolveStudentDisplayName } from '../../reese/resolveStudentDisplayName';
import { createBasecampTodoForHandoff } from '../daraBasecampGatewayService';
import { createDaraHandoff } from '../daraHandoffService';

const mockCreateTicket = createTicket as unknown as jest.Mock;
const mockResolveStudentDisplayName = resolveStudentDisplayName as unknown as jest.Mock;
const mockCreateBasecampTodo = createBasecampTodoForHandoff as unknown as jest.Mock;

const DARA_ADMIN_ID = 'dara-admin-1';
const STUDENT_ID = 'student-enrollment-1';
const CONVERSATION_TICKET_ID = 'conversation-ticket-1';
const MESSAGE_ID = 'msg-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveStudentDisplayName.mockResolvedValue('Jordan Rivera');
  mockCreateTicket.mockResolvedValue({ id: 'handoff-ticket-1' });
  mockCreateBasecampTodo.mockResolvedValue({ created: false, reason: 'basecamp_gateway_not_configured' });
});

describe('createDaraHandoff', () => {
  it('happy path: creates a real, standalone agent_handoff ticket, high priority, linked to the conversation ticket as its parent', async () => {
    const result = await createDaraHandoff(
      DARA_ADMIN_ID, STUDENT_ID, 'This is a homework question.', CONVERSATION_TICKET_ID, MESSAGE_ID,
    );

    expect(result.id).toBe('handoff-ticket-1');
    expect(mockCreateTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent_handoff',
        priority: 'high',
        created_by_type: 'ai_staff',
        created_by_id: DARA_ADMIN_ID,
        parent_ticket_id: CONVERSATION_TICKET_ID,
        entity_type: 'room_message',
        entity_id: MESSAGE_ID,
      }),
    );
    expect(mockCreateTicket.mock.calls[0][0].title).toContain('Jordan Rivera');
    expect(mockCreateTicket.mock.calls[0][0].description).toContain('This is a homework question.');
  });

  it('does not hardcode a recipient — relies on createTicket()\'s own reports_to resolution, not an explicit assigned_to', async () => {
    await createDaraHandoff(DARA_ADMIN_ID, STUDENT_ID, 'x', CONVERSATION_TICKET_ID, MESSAGE_ID);

    const call = mockCreateTicket.mock.calls[0][0];
    expect(call.assigned_to_type).toBeUndefined();
    expect(call.assigned_to_id).toBeUndefined();
  });

  it('idempotency/dedup key: entity_type/entity_id are the stable triggering-message id, never a per-call/per-cycle value', async () => {
    await createDaraHandoff(DARA_ADMIN_ID, STUDENT_ID, 'first', CONVERSATION_TICKET_ID, MESSAGE_ID);
    await createDaraHandoff(DARA_ADMIN_ID, STUDENT_ID, 'second', CONVERSATION_TICKET_ID, MESSAGE_ID);

    const [callA, callB] = mockCreateTicket.mock.calls;
    expect(callA[0].entity_type).toBe(callB[0].entity_type);
    expect(callA[0].entity_id).toBe(callB[0].entity_id);
    expect(callA[0].type).toBe(callB[0].type);
  });

  it('happy path: title/description contain the resolved student name, never the raw enrollment id', async () => {
    await createDaraHandoff(DARA_ADMIN_ID, STUDENT_ID, 'x', CONVERSATION_TICKET_ID, MESSAGE_ID);

    expect(mockResolveStudentDisplayName).toHaveBeenCalledWith(STUDENT_ID);
    expect(mockCreateTicket.mock.calls[0][0].title).not.toContain(STUDENT_ID);
  });

  it('boundary: no conversation ticket yet still creates the handoff ticket, with a null parent_ticket_id', async () => {
    await createDaraHandoff(DARA_ADMIN_ID, STUDENT_ID, 'x', null, MESSAGE_ID);

    expect(mockCreateTicket.mock.calls[0][0].parent_ticket_id).toBeNull();
  });

  it('boundary: an empty/missing reason falls back to an honest default, never a blank description', async () => {
    await createDaraHandoff(DARA_ADMIN_ID, STUDENT_ID, '', CONVERSATION_TICKET_ID, MESSAGE_ID);

    expect(mockCreateTicket.mock.calls[0][0].description).toContain("curriculum/certification scope");
  });

  it('boundary: a very long reason is truncated to a snippet, not stored unbounded', async () => {
    const longReason = 'x'.repeat(1000);
    await createDaraHandoff(DARA_ADMIN_ID, STUDENT_ID, longReason, CONVERSATION_TICKET_ID, MESSAGE_ID);

    const description = mockCreateTicket.mock.calls[0][0].description as string;
    expect(description).not.toContain(longReason);
  });

  // Phase 7 activation — every real handoff also attempts a Basecamp echo.
  describe('Basecamp echo (Phase 7 activation)', () => {
    it('happy path: calls the gateway with the real new ticket id, title, student name, and reason, after the internal ticket already exists', async () => {
      mockCreateBasecampTodo.mockResolvedValue({ created: true, reason: 'created', basecampTodoId: 999, basecampAppUrl: 'https://app.basecamp.com/1/buckets/2/todos/999' });

      const result = await createDaraHandoff(DARA_ADMIN_ID, STUDENT_ID, 'This is a homework question.', CONVERSATION_TICKET_ID, MESSAGE_ID);

      expect(mockCreateBasecampTodo).toHaveBeenCalledWith('handoff-ticket-1', expect.stringContaining('Jordan Rivera'), 'Jordan Rivera', 'This is a homework question.');
      expect(result.basecampTodoUrl).toBe('https://app.basecamp.com/1/buckets/2/todos/999');
    });

    it('"never off-ledger" for the internal ticket: the gateway being unconfigured never prevents or undoes the real ticket already created', async () => {
      mockCreateBasecampTodo.mockResolvedValue({ created: false, reason: 'basecamp_gateway_not_configured' });

      const result = await createDaraHandoff(DARA_ADMIN_ID, STUDENT_ID, 'x', CONVERSATION_TICKET_ID, MESSAGE_ID);

      expect(result.id).toBe('handoff-ticket-1');
      expect(result.basecampTodoUrl).toBeUndefined();
    });

    it('boundary: createBasecampTodoForHandoff is called with the ticket AFTER it is created, never before (dedup key depends on the real ticket id)', async () => {
      const callOrder: string[] = [];
      mockCreateTicket.mockImplementation(async () => { callOrder.push('createTicket'); return { id: 'handoff-ticket-1' }; });
      mockCreateBasecampTodo.mockImplementation(async () => { callOrder.push('createBasecampTodo'); return { created: false, reason: 'basecamp_gateway_not_configured' }; });

      await createDaraHandoff(DARA_ADMIN_ID, STUDENT_ID, 'x', CONVERSATION_TICKET_ID, MESSAGE_ID);

      expect(callOrder).toEqual(['createTicket', 'createBasecampTodo']);
    });
  });
});
