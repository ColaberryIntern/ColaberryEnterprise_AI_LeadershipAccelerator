jest.mock('../../ticketService', () => ({ addTicketComment: jest.fn() }));
jest.mock('../daraHandoffService', () => ({ createDaraHandoff: jest.fn() }));

import { addTicketComment } from '../../ticketService';
import { createDaraHandoff } from '../daraHandoffService';
import { DARA_TOOLS, isDaraTool, executeDaraTool } from '../daraTools';

const mockAddComment = addTicketComment as unknown as jest.Mock;
const mockCreateHandoff = createDaraHandoff as unknown as jest.Mock;

const TICKET_ID = 'ticket-1';
const DARA_ADMIN_ID = 'dara-admin-1';
const STUDENT_ID = 'student-enrollment-1';
const MESSAGE_ID = 'msg-1';

const baseContext = { ticketId: TICKET_ID, daraAdminUserId: DARA_ADMIN_ID, studentEnrollmentId: STUDENT_ID, triggeringMessageId: MESSAGE_ID };

beforeEach(() => {
  jest.clearAllMocks();
  mockAddComment.mockResolvedValue({ id: 'activity-1' });
  mockCreateHandoff.mockResolvedValue({ id: 'handoff-1' });
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

describe('executeDaraTool — escalate_to_human (Dara v2 Phase 4: real, standalone agent_handoff ticket)', () => {
  it('happy path: creates a real handoff ticket, comments on the conversation ticket cross-referencing it, returns an honest confirmation', async () => {
    const result = JSON.parse(await executeDaraTool(
      'escalate_to_human', { reason: 'This is a homework question.' }, baseContext,
    ));

    expect(mockCreateHandoff).toHaveBeenCalledWith(DARA_ADMIN_ID, STUDENT_ID, 'This is a homework question.', TICKET_ID, MESSAGE_ID);
    expect(mockAddComment).toHaveBeenCalledWith(
      TICKET_ID, expect.stringContaining('handoff-1'), 'ai_staff', DARA_ADMIN_ID,
    );
    expect(result).toEqual({ escalated: true, reason: 'This is a homework question.', handoffTicketId: 'handoff-1' });
  });

  it('boundary: no conversation ticket yet still creates the real handoff ticket, just skips the cross-reference comment', async () => {
    const result = JSON.parse(await executeDaraTool(
      'escalate_to_human', { reason: 'x' }, { ...baseContext, ticketId: null },
    ));

    expect(mockCreateHandoff).toHaveBeenCalledWith(DARA_ADMIN_ID, STUDENT_ID, 'x', null, MESSAGE_ID);
    expect(mockAddComment).not.toHaveBeenCalled();
    expect(result.escalated).toBe(true);
  });

  it('"never off-ledger" boundary: no admin id yet -> an HONEST non-escalation, never a fabricated ticket', async () => {
    const result = JSON.parse(await executeDaraTool(
      'escalate_to_human', { reason: 'x' }, { ...baseContext, daraAdminUserId: null },
    ));

    expect(mockCreateHandoff).not.toHaveBeenCalled();
    expect(mockAddComment).not.toHaveBeenCalled();
    expect(result.escalated).toBe(false);
  });

  it('"never off-ledger" boundary: no triggering-message id (no stable dedup key) -> an HONEST non-escalation, never a fabricated ticket', async () => {
    const result = JSON.parse(await executeDaraTool(
      'escalate_to_human', { reason: 'x' }, { ...baseContext, triggeringMessageId: null },
    ));

    expect(mockCreateHandoff).not.toHaveBeenCalled();
    expect(result.escalated).toBe(false);
  });

  it('boundary: a missing/empty reason still escalates with an honest default reason, never a blank one', async () => {
    const result = JSON.parse(await executeDaraTool('escalate_to_human', {}, baseContext));

    expect(result.reason).toContain('curriculum/certification scope');
    expect(mockCreateHandoff).toHaveBeenCalledWith(DARA_ADMIN_ID, STUDENT_ID, expect.stringContaining('curriculum/certification scope'), TICKET_ID, MESSAGE_ID);
  });

  it('failure path: a handoff-creation rejection degrades to an honest error payload, never throws into the reply pipeline', async () => {
    mockCreateHandoff.mockRejectedValue(new Error('DB write failed'));

    const result = JSON.parse(await executeDaraTool('escalate_to_human', { reason: 'x' }, baseContext));

    expect(result.error).toBe('Tool execution failed');
    expect(result.message).toContain('DB write failed');
  });
});

describe('executeDaraTool — unknown tool name', () => {
  it('an unrecognized tool name returns an honest error, never silently no-ops or throws', async () => {
    const result = JSON.parse(await executeDaraTool('delete_everything', {}, baseContext));

    expect(result.error).toContain('Unknown tool');
    expect(mockCreateHandoff).not.toHaveBeenCalled();
  });
});
