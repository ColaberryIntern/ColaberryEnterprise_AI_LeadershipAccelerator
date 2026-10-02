/**
 * Reese ticket follow-up message generation. Confirms every check-in message
 * is a real LLM completion grounded in the REAL room conversation history
 * (never a templated string), and that an empty completion is a hard
 * failure, not a silently swallowed fallback — same discipline
 * reeseOutreachMessageService.test.ts already establishes for the sibling
 * message type.
 */
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../../../models/RoomMessage', () => ({ findAll: jest.fn() }));
jest.mock('../reeseIdentitySeed', () => ({ getReeseAgentId: jest.fn(), getReeseEnrollmentId: jest.fn() }));
jest.mock('../resolveStudentDisplayName', () => ({ resolveStudentDisplayName: jest.fn() }));
// reeseSystemPrompt.ts (imported here only for the pure REESE_PERSONA_BLOCK
// string constant) has MULTIPLE real transitive paths into the 215-model
// models/index.ts barrel (agentSystemPrompt.ts -> learnerContextService.ts,
// AND reeseStudentSuccessHighlights.ts -> studentSuccessSnapshot ->
// acceleratorService.ts) — both crash under this file's plain-object model
// mocks. Mocking the module directly (rather than chasing each transitive
// dependency) severs every path at once; the exact prose doesn't matter to
// these tests, only that a real string flows through.
jest.mock('../reeseSystemPrompt', () => ({ REESE_PERSONA_BLOCK: 'You are Reese, the student\'s dedicated AI Systems Architect mentor.' }));

import RoomMessage from '../../../models/RoomMessage';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { getReeseAgentId, getReeseEnrollmentId } from '../reeseIdentitySeed';
import { resolveStudentDisplayName } from '../resolveStudentDisplayName';
import { generateTicketFollowUpMessage } from '../reeseTicketFollowUpMessageService';

const mockMessageFindAll = RoomMessage.findAll as unknown as jest.Mock;
const mockGetInstrumentedOpenAI = getInstrumentedOpenAI as unknown as jest.Mock;
const mockGetReeseAgentId = getReeseAgentId as unknown as jest.Mock;
const mockGetReeseEnrollmentId = getReeseEnrollmentId as unknown as jest.Mock;
const mockResolveStudentDisplayName = resolveStudentDisplayName as unknown as jest.Mock;

const REESE_AGENT_ID = 'reese-agent-1';
const REESE_ID = 'reese-enrollment-1';
const STUDENT_ID = 'student-enrollment-1';
const ROOM_ID = 'dm-room-1';

const mockCreateCompletion = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockGetReeseAgentId.mockResolvedValue(REESE_AGENT_ID);
  mockGetReeseEnrollmentId.mockResolvedValue(REESE_ID);
  mockResolveStudentDisplayName.mockResolvedValue('Gwendolyn');
  mockMessageFindAll.mockResolvedValue([
    { enrollment_id: REESE_ID, content: 'Happy to help with Power BI training — what have you tried so far?', created_at: new Date('2026-09-29T10:00:00Z') },
    { enrollment_id: STUDENT_ID, content: 'I am looking for Power BI training and would like to enroll via TWC', created_at: new Date('2026-09-29T09:00:00Z') },
  ]);
  mockCreateCompletion.mockReset();
  mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: 'A real, grounded check-in message.' } }] });
  mockGetInstrumentedOpenAI.mockReturnValue({ chat: { completions: { create: mockCreateCompletion } } });
});

describe('generateTicketFollowUpMessage', () => {
  it('grounds the prompt in the REAL room conversation history, not a fixed string', async () => {
    await generateTicketFollowUpMessage({
      roomId: ROOM_ID, studentEnrollmentId: STUDENT_ID, ticketTitle: 'Student support', quietDays: 3, attemptNumber: 1,
    });

    expect(mockMessageFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { room_id: ROOM_ID, deleted_at: null } }));
    const [{ messages }] = mockCreateCompletion.mock.calls[0];
    const systemPrompt = messages[0].content as string;
    expect(systemPrompt).toContain('Power BI training');
    expect(systemPrompt).toContain('3 day(s)');
    expect(mockGetInstrumentedOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ workflow_id: 'reese_ticket_followup', agent_id: REESE_AGENT_ID }),
    );
  });

  it('frames a first check-in differently from a later one, referencing the real attempt number', async () => {
    await generateTicketFollowUpMessage({
      roomId: ROOM_ID, studentEnrollmentId: STUDENT_ID, ticketTitle: 'Student support', quietDays: 3, attemptNumber: 2,
    });

    const [{ messages }] = mockCreateCompletion.mock.calls[0];
    expect(messages[0].content).toContain('check-in 2 of at most 3');
  });

  it('boundary: no real message history found — degrades to an honest placeholder, never fabricated prior content', async () => {
    mockMessageFindAll.mockResolvedValue([]);

    await generateTicketFollowUpMessage({
      roomId: ROOM_ID, studentEnrollmentId: STUDENT_ID, ticketTitle: 'Student support', quietDays: 3, attemptNumber: 1,
    });

    const [{ messages }] = mockCreateCompletion.mock.calls[0];
    expect(messages[0].content).toContain('no real message history found');
  });

  it('failure path: throws (never returns a fallback template) when the completion is empty', async () => {
    mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: '' } }] });

    await expect(
      generateTicketFollowUpMessage({
        roomId: ROOM_ID, studentEnrollmentId: STUDENT_ID, ticketTitle: 'Student support', quietDays: 3, attemptNumber: 1,
      }),
    ).rejects.toThrow(/empty completion/);
  });
});
