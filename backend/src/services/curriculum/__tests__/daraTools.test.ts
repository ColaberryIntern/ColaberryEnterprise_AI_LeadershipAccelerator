jest.mock('../../ticketService', () => ({ addTicketComment: jest.fn() }));
jest.mock('../../../models', () => ({ Ticket: { update: jest.fn() } }));

import { addTicketComment } from '../../ticketService';
import { Ticket } from '../../../models';
import { DARA_TOOLS, isDaraTool, executeDaraTool } from '../daraTools';

const mockAddComment = addTicketComment as unknown as jest.Mock;
const mockTicketUpdate = Ticket.update as unknown as jest.Mock;

const TICKET_ID = 'ticket-1';
const DARA_ADMIN_ID = 'dara-admin-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockAddComment.mockResolvedValue({ id: 'activity-1' });
  mockTicketUpdate.mockResolvedValue([1]);
});

describe('DARA_TOOLS / isDaraTool', () => {
  it('exposes exactly one tool: escalate_to_human, requiring a reason', () => {
    const functionTools = DARA_TOOLS.filter((t): t is Extract<typeof t, { type: 'function' }> => t.type === 'function');
    expect(functionTools.map((t) => t.function.name)).toEqual(['escalate_to_human']);
    expect((functionTools[0].function.parameters as any).required).toEqual(['reason']);
  });

  it('isDaraTool recognizes only the real tool name', () => {
    expect(isDaraTool('escalate_to_human')).toBe(true);
    expect(isDaraTool('delete_everything')).toBe(false);
  });
});

describe('executeDaraTool — escalate_to_human', () => {
  it('happy path: adds a labeled comment under Dara\'s own admin id and raises priority, returns an honest confirmation', async () => {
    const result = JSON.parse(await executeDaraTool(
      'escalate_to_human',
      { reason: 'This is a homework question.' },
      { ticketId: TICKET_ID, daraAdminUserId: DARA_ADMIN_ID },
    ));

    expect(mockAddComment).toHaveBeenCalledWith(TICKET_ID, expect.stringContaining('This is a homework question.'), 'ai_staff', DARA_ADMIN_ID);
    expect(mockTicketUpdate).toHaveBeenCalledWith({ priority: 'high' }, { where: { id: TICKET_ID } });
    expect(result).toEqual({ escalated: true, reason: 'This is a homework question.' });
  });

  it('boundary: no ticket available this turn returns an honest non-escalation, never throws or writes', async () => {
    const result = JSON.parse(await executeDaraTool(
      'escalate_to_human',
      { reason: 'whatever' },
      { ticketId: null, daraAdminUserId: DARA_ADMIN_ID },
    ));

    expect(result.escalated).toBe(false);
    expect(mockAddComment).not.toHaveBeenCalled();
    expect(mockTicketUpdate).not.toHaveBeenCalled();
  });

  it('boundary: no admin id yet still raises priority (best-effort) but skips the comment write', async () => {
    const result = JSON.parse(await executeDaraTool(
      'escalate_to_human',
      { reason: 'whatever' },
      { ticketId: TICKET_ID, daraAdminUserId: null },
    ));

    expect(mockAddComment).not.toHaveBeenCalled();
    expect(mockTicketUpdate).toHaveBeenCalledWith({ priority: 'high' }, { where: { id: TICKET_ID } });
    expect(result.escalated).toBe(true);
  });

  it('boundary: a missing/empty reason still escalates with an honest default reason, never a blank comment', async () => {
    const result = JSON.parse(await executeDaraTool(
      'escalate_to_human', {}, { ticketId: TICKET_ID, daraAdminUserId: DARA_ADMIN_ID },
    ));

    expect(result.reason).toContain('curriculum/certification scope');
    expect(mockAddComment).toHaveBeenCalledWith(TICKET_ID, expect.any(String), 'ai_staff', DARA_ADMIN_ID);
  });

  it('failure path: a comment-write rejection degrades to an honest error payload, never throws into the reply pipeline', async () => {
    mockAddComment.mockRejectedValue(new Error('DB write failed'));

    const result = JSON.parse(await executeDaraTool(
      'escalate_to_human', { reason: 'x' }, { ticketId: TICKET_ID, daraAdminUserId: DARA_ADMIN_ID },
    ));

    expect(result.error).toBe('Tool execution failed');
    expect(result.message).toContain('DB write failed');
  });
});

describe('executeDaraTool — unknown tool name', () => {
  it('an unrecognized tool name returns an honest error, never silently no-ops or throws', async () => {
    const result = JSON.parse(await executeDaraTool('delete_everything', {}, { ticketId: TICKET_ID, daraAdminUserId: DARA_ADMIN_ID }));

    expect(result.error).toContain('Unknown tool');
    expect(mockAddComment).not.toHaveBeenCalled();
  });
});
