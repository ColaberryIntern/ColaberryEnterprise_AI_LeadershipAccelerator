/**
 * Dara v2 Phase 3 — daraReplyService is the ONLY place a Dara-authored
 * student DM message is ever produced. Mirrors reeseReplyService.test.ts's
 * structure: these tests prove the same structural boundaries (no autonomous
 * outreach; loop guard; scope guard) plus Dara's own escalate_to_human tool
 * contract.
 */
jest.mock('../../../models/RoomMembership', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/RoomMessage', () => ({ findAll: jest.fn() }));
jest.mock('../daraIdentitySeed', () => ({ getDaraEnrollmentId: jest.fn(), getDaraAdminUserId: jest.fn(), getDaraAgentId: jest.fn() }));
jest.mock('../daraSystemPrompt', () => ({ buildDaraSystemPrompt: jest.fn() }));
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../../communityRooms/dmService', () => ({ sendDmMessage: jest.fn() }));
jest.mock('../daraTicketLinkService', () => ({
  ensureDaraTicketForRoom: jest.fn(),
  logDaraExchangeActivity: jest.fn(),
}));
jest.mock('../daraTools', () => ({
  DARA_TOOLS: [{ type: 'function', function: { name: 'escalate_to_human', parameters: {} } }],
  executeDaraTool: jest.fn(),
}));
jest.mock('../../agentBlueprint/agentActivityLogService', () => ({ logAgentActivity: jest.fn() }));

import RoomMembership from '../../../models/RoomMembership';
import RoomMessage from '../../../models/RoomMessage';
import { getDaraEnrollmentId, getDaraAdminUserId, getDaraAgentId } from '../daraIdentitySeed';
import { buildDaraSystemPrompt } from '../daraSystemPrompt';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { sendDmMessage } from '../../communityRooms/dmService';
import { ensureDaraTicketForRoom, logDaraExchangeActivity } from '../daraTicketLinkService';
import { executeDaraTool } from '../daraTools';
import { logAgentActivity } from '../../agentBlueprint/agentActivityLogService';
import { maybeTriggerDaraReply } from '../daraReplyService';

const mockMembershipFindOne = RoomMembership.findOne as unknown as jest.Mock;
const mockMessageFindAll = RoomMessage.findAll as unknown as jest.Mock;
const mockGetDaraEnrollmentId = getDaraEnrollmentId as unknown as jest.Mock;
const mockGetDaraAdminUserId = getDaraAdminUserId as unknown as jest.Mock;
const mockGetDaraAgentId = getDaraAgentId as unknown as jest.Mock;
const mockBuildDaraSystemPrompt = buildDaraSystemPrompt as unknown as jest.Mock;
const mockGetInstrumentedOpenAI = getInstrumentedOpenAI as unknown as jest.Mock;
const mockSendDmMessage = sendDmMessage as unknown as jest.Mock;
const mockEnsureTicket = ensureDaraTicketForRoom as unknown as jest.Mock;
const mockLogExchange = logDaraExchangeActivity as unknown as jest.Mock;
const mockExecuteDaraTool = executeDaraTool as unknown as jest.Mock;
const mockLogAgentActivity = logAgentActivity as unknown as jest.Mock;

const DARA_ADMIN_ID = 'dara-admin-1';
const DARA_AGENT_ID = 'dara-agent-1';

const DARA_ID = 'dara-enrollment-1';
const STUDENT_ID = 'student-enrollment-1';
const ROOM_ID = 'dm-room-1';

// Same module-scope OpenAI client caching caveat as reeseReplyService.ts —
// one stable mock function reference, reset (not replaced) between tests.
const mockCreateCompletion = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDaraEnrollmentId.mockResolvedValue(DARA_ID);
  mockGetDaraAdminUserId.mockResolvedValue(DARA_ADMIN_ID);
  mockGetDaraAgentId.mockResolvedValue(DARA_AGENT_ID);
  mockBuildDaraSystemPrompt.mockResolvedValue('SYSTEM PROMPT');
  mockMessageFindAll.mockResolvedValue([
    { id: 'student-msg-1', enrollment_id: STUDENT_ID, content: 'Hi Dara, what does Module 3 cover?' },
  ]);
  mockCreateCompletion.mockReset();
  mockCreateCompletion.mockResolvedValue({
    choices: [{ message: { content: 'Module 3 covers supervised learning fundamentals.' } }],
  });
  mockGetInstrumentedOpenAI.mockReturnValue({
    chat: { completions: { create: mockCreateCompletion } },
  });
  mockSendDmMessage.mockResolvedValue({ id: 'reply-msg-1', content: 'Module 3 covers supervised learning fundamentals.' });
  mockEnsureTicket.mockResolvedValue({ id: 'ticket-1' });
  mockLogExchange.mockResolvedValue(undefined);
  mockExecuteDaraTool.mockResolvedValue('{}');
  mockLogAgentActivity.mockResolvedValue(undefined);
});

describe('maybeTriggerDaraReply', () => {
  it('happy path: a student message in a real Dara DM room produces exactly one Dara-authored reply, posted via sendDmMessage', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });

    await maybeTriggerDaraReply(ROOM_ID, STUDENT_ID);

    expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
    expect(mockSendDmMessage).toHaveBeenCalledTimes(1);
    expect(mockSendDmMessage).toHaveBeenCalledWith(
      { enrollmentId: DARA_ID, cohortId: null, isAdmin: false },
      ROOM_ID,
      'Module 3 covers supervised learning fundamentals.',
    );
    expect(mockGetInstrumentedOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ workflow_id: 'dara', agent_id: DARA_AGENT_ID }),
    );
  });

  it('ProofDesk linkage: the triggering student message AND the Dara reply are both logged to the same ticket', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });

    await maybeTriggerDaraReply(ROOM_ID, STUDENT_ID);

    expect(mockEnsureTicket).toHaveBeenCalledWith(ROOM_ID, STUDENT_ID, 'Hi Dara, what does Module 3 cover?');
    expect(mockLogExchange).toHaveBeenCalledTimes(2);
    expect(mockLogExchange).toHaveBeenNthCalledWith(1, 'ticket-1', 'human', STUDENT_ID, 'student-msg-1', 'Hi Dara, what does Module 3 cover?');
    expect(mockLogExchange).toHaveBeenNthCalledWith(2, 'ticket-1', 'ai_staff', DARA_ADMIN_ID, 'reply-msg-1', 'Module 3 covers supervised learning fundamentals.');
  });

  it('ProofDesk linkage boundary: if ticket-ensure fails, the reply is still generated and sent (ticket layer never blocks messaging)', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
    mockEnsureTicket.mockRejectedValue(new Error('ticket service down'));

    await maybeTriggerDaraReply(ROOM_ID, STUDENT_ID);

    expect(mockSendDmMessage).toHaveBeenCalledTimes(1);
    expect(mockLogExchange).not.toHaveBeenCalled();
  });

  it('scope guard: a message in a room Dara is NOT a member of never invokes the LLM (cost + scope protection)', async () => {
    mockMembershipFindOne.mockResolvedValue(null);

    await maybeTriggerDaraReply(ROOM_ID, STUDENT_ID);

    expect(mockCreateCompletion).not.toHaveBeenCalled();
    expect(mockSendDmMessage).not.toHaveBeenCalled();
    expect(mockEnsureTicket).not.toHaveBeenCalled();
  });

  it('loop guard: a message whose SENDER is Dara\'s own identity never triggers a second reply', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });

    await maybeTriggerDaraReply(ROOM_ID, DARA_ID);

    expect(mockMembershipFindOne).not.toHaveBeenCalled();
    expect(mockCreateCompletion).not.toHaveBeenCalled();
    expect(mockSendDmMessage).not.toHaveBeenCalled();
    expect(mockEnsureTicket).not.toHaveBeenCalled();
  });

  it('boundary: no identity seeded yet — no-ops safely rather than throwing', async () => {
    mockGetDaraEnrollmentId.mockResolvedValue(null);

    await expect(maybeTriggerDaraReply(ROOM_ID, STUDENT_ID)).resolves.toBeUndefined();
    expect(mockCreateCompletion).not.toHaveBeenCalled();
  });

  it('boundary/failure: an LLM error that also fails on retry is caught and logged, never thrown into the caller — but a real, honest fallback message IS sent (never pure silence)', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
    mockCreateCompletion.mockRejectedValue(new Error('OpenAI is down'));

    await expect(maybeTriggerDaraReply(ROOM_ID, STUDENT_ID)).resolves.toBeUndefined();

    // Real production incident, 2026-09-17: a caught failure used to leave the
    // student with pure silence. Now it must send a real, deterministic
    // fallback via the exact same sendDmMessage() path a real reply uses.
    expect(mockSendDmMessage).toHaveBeenCalledTimes(1);
    expect(mockSendDmMessage).toHaveBeenCalledWith(
      { enrollmentId: DARA_ID, cohortId: null, isAdmin: false }, ROOM_ID,
      expect.stringContaining('technical issue'),
    );
  });

  it('retry: a completion failure that succeeds on the SECOND attempt produces a real reply, never falls through to the fallback message', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
    mockCreateCompletion
      .mockRejectedValueOnce(new Error('transient blip'))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Module 3 covers supervised learning fundamentals.' } }] });

    await maybeTriggerDaraReply(ROOM_ID, STUDENT_ID);

    expect(mockCreateCompletion).toHaveBeenCalledTimes(2);
    expect(mockSendDmMessage).toHaveBeenCalledTimes(1);
    expect(mockSendDmMessage).toHaveBeenCalledWith(
      { enrollmentId: DARA_ID, cohortId: null, isAdmin: false }, ROOM_ID, 'Module 3 covers supervised learning fundamentals.',
    );
  });

  it('boundary: the fallback message itself failing to send never throws into the caller', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
    mockCreateCompletion.mockRejectedValue(new Error('OpenAI is down'));
    mockSendDmMessage.mockRejectedValue(new Error('DM send also down'));

    await expect(maybeTriggerDaraReply(ROOM_ID, STUDENT_ID)).resolves.toBeUndefined();
  });

  it('boundary: an empty/whitespace-only completion never posts an empty reply', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
    mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: '   ' } }] });

    await maybeTriggerDaraReply(ROOM_ID, STUDENT_ID);
    expect(mockSendDmMessage).not.toHaveBeenCalled();
  });

  describe('escalate_to_human tool (Phase 2 decision: out-of-scope -> a human, never a guess)', () => {
    it('happy path: a tool_calls response triggers real tool execution, bound to this conversation\'s real ticket/admin ids, and a second completion produces the final reply', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockCreateCompletion
        .mockResolvedValueOnce({
          choices: [{ message: {
            role: 'assistant', content: null,
            tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'escalate_to_human', arguments: '{"reason":"This is a homework question, not a curriculum question."}' } }],
          } }],
        })
        .mockResolvedValueOnce({ choices: [{ message: { content: "I've flagged this for Swati to follow up." } }] });
      mockExecuteDaraTool.mockResolvedValue('{"escalated":true,"reason":"This is a homework question, not a curriculum question."}');

      await maybeTriggerDaraReply(ROOM_ID, STUDENT_ID);

      expect(mockCreateCompletion).toHaveBeenCalledTimes(2);
      expect(mockExecuteDaraTool).toHaveBeenCalledWith(
        'escalate_to_human',
        { reason: 'This is a homework question, not a curriculum question.' },
        { ticketId: 'ticket-1', daraAdminUserId: DARA_ADMIN_ID, studentEnrollmentId: STUDENT_ID, triggeringMessageId: 'student-msg-1' },
      );
      expect(mockSendDmMessage).toHaveBeenCalledWith(
        { enrollmentId: DARA_ID, cohortId: null, isAdmin: false }, ROOM_ID, "I've flagged this for Swati to follow up.",
      );
      const secondCallArgs = mockCreateCompletion.mock.calls[1][0];
      expect(secondCallArgs.tools).toBeUndefined();
      const toolMessage = secondCallArgs.messages.find((m: any) => m.role === 'tool');
      expect(toolMessage.tool_call_id).toBe('call-1');
    });

    it('boundary: malformed tool-call arguments degrade to an empty args object rather than throwing', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockCreateCompletion
        .mockResolvedValueOnce({
          choices: [{ message: {
            role: 'assistant', content: null,
            tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'escalate_to_human', arguments: 'not valid json' } }],
          } }],
        })
        .mockResolvedValueOnce({ choices: [{ message: { content: "I've flagged this for a human." } }] });

      await expect(maybeTriggerDaraReply(ROOM_ID, STUDENT_ID)).resolves.toBeUndefined();

      expect(mockExecuteDaraTool).toHaveBeenCalledWith(
        'escalate_to_human', {}, { ticketId: 'ticket-1', daraAdminUserId: DARA_ADMIN_ID, studentEnrollmentId: STUDENT_ID, triggeringMessageId: 'student-msg-1' },
      );
    });

    it('boundary: no tool_calls in the response never triggers a second completion call', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });

      await maybeTriggerDaraReply(ROOM_ID, STUDENT_ID);

      expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
      expect(mockExecuteDaraTool).not.toHaveBeenCalled();
    });
  });

  describe('activity logging (GOALS scorecard, same pattern as Reese)', () => {
    it('happy path: a real reply logs a real activity row under Dara\'s OWN agent id, decoupled from ticket-linking', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });

      await maybeTriggerDaraReply(ROOM_ID, STUDENT_ID);

      expect(mockLogAgentActivity).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: DARA_AGENT_ID, action: 'dara_dm_reply', result: 'success' }),
      );
    });

    it('failure path: a caught LLM error also logs a real "failed" row', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockCreateCompletion.mockRejectedValue(new Error('OpenAI is down'));

      await maybeTriggerDaraReply(ROOM_ID, STUDENT_ID);

      expect(mockLogAgentActivity).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: DARA_AGENT_ID, action: 'dara_dm_reply', result: 'failed', reason: 'OpenAI is down' }),
      );
    });

    it('boundary: no message sent (empty completion) never logs a reply activity row', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: '   ' } }] });

      await maybeTriggerDaraReply(ROOM_ID, STUDENT_ID);

      expect(mockLogAgentActivity).not.toHaveBeenCalled();
    });
  });

  it('conversation history is passed to the LLM with correct role mapping (Dara = assistant, everyone else = user)', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
    mockMessageFindAll.mockResolvedValue([
      { enrollment_id: DARA_ID, content: 'Earlier Dara reply' },
      { enrollment_id: STUDENT_ID, content: 'Latest student message' },
    ]);

    await maybeTriggerDaraReply(ROOM_ID, STUDENT_ID);

    const callArgs = mockCreateCompletion.mock.calls[0][0];
    const roles = callArgs.messages.map((m: any) => m.role);
    expect(roles[0]).toBe('system');
    expect(roles).toContain('assistant');
    expect(roles).toContain('user');
  });
});
