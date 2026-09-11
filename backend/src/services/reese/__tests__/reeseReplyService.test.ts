/**
 * Reese Phase 1 — reeseReplyService is the ONLY place a Reese-authored DM
 * message is ever produced. These tests exist to prove the Phase 1 hard
 * boundary (no autonomous outreach) is structural, not just policy:
 *   - a message in a non-Reese room never invokes the LLM (cost + scope guard)
 *   - a message FROM Reese's own identity can never retrigger a second reply
 *     (loop guard — this is what makes an autonomous send-loop impossible)
 */
jest.mock('../../../models/RoomMembership', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/RoomMessage', () => ({ findAll: jest.fn() }));
jest.mock('../reeseIdentitySeed', () => ({ getReeseEnrollmentId: jest.fn(), getReeseAdminUserId: jest.fn(), getReeseAgentId: jest.fn() }));
jest.mock('../reeseSystemPrompt', () => ({ buildReeseSystemPrompt: jest.fn() }));
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../../communityRooms/dmService', () => ({ sendDmMessage: jest.fn() }));
jest.mock('../reeseTicketLinkService', () => ({
  ensureReeseTicketForRoom: jest.fn(),
  logReeseExchangeActivity: jest.fn(),
}));
jest.mock('../../studentHealthAssessment', () => ({ maybeRefreshStudentAssessment: jest.fn() }));
jest.mock('../reeseTools', () => ({
  REESE_TOOLS: [{ type: 'function', function: { name: 'read_student_success_snapshot', parameters: {} } }],
  executeReeseTool: jest.fn(),
}));
jest.mock('../../agentBlueprint/agentActivityLogService', () => ({ logAgentActivity: jest.fn() }));
jest.mock('../../workLedger/agentActionAuthorizationBridge', () => ({ authorizeTicketDispatch: jest.fn() }));

import RoomMembership from '../../../models/RoomMembership';
import RoomMessage from '../../../models/RoomMessage';
import { getReeseEnrollmentId, getReeseAdminUserId, getReeseAgentId } from '../reeseIdentitySeed';
import { buildReeseSystemPrompt } from '../reeseSystemPrompt';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { sendDmMessage } from '../../communityRooms/dmService';
import { ensureReeseTicketForRoom, logReeseExchangeActivity } from '../reeseTicketLinkService';
import { authorizeTicketDispatch } from '../../workLedger/agentActionAuthorizationBridge';
import { maybeRefreshStudentAssessment } from '../../studentHealthAssessment';
import { executeReeseTool } from '../reeseTools';
import { logAgentActivity } from '../../agentBlueprint/agentActivityLogService';
import { maybeTriggerReeseReply } from '../reeseReplyService';

const mockMembershipFindOne = RoomMembership.findOne as unknown as jest.Mock;
const mockMessageFindAll = RoomMessage.findAll as unknown as jest.Mock;
const mockGetReeseEnrollmentId = getReeseEnrollmentId as unknown as jest.Mock;
const mockGetReeseAdminUserId = getReeseAdminUserId as unknown as jest.Mock;
const mockGetReeseAgentId = getReeseAgentId as unknown as jest.Mock;
const mockBuildReeseSystemPrompt = buildReeseSystemPrompt as unknown as jest.Mock;
const mockGetInstrumentedOpenAI = getInstrumentedOpenAI as unknown as jest.Mock;
const mockSendDmMessage = sendDmMessage as unknown as jest.Mock;
const mockEnsureTicket = ensureReeseTicketForRoom as unknown as jest.Mock;
const mockLogExchange = logReeseExchangeActivity as unknown as jest.Mock;
const mockMaybeRefreshAssessment = maybeRefreshStudentAssessment as unknown as jest.Mock;
const mockExecuteReeseTool = executeReeseTool as unknown as jest.Mock;
const mockLogAgentActivity = logAgentActivity as unknown as jest.Mock;
const mockAuthorizeTicketDispatch = authorizeTicketDispatch as unknown as jest.Mock;

const REESE_ADMIN_ID = 'reese-admin-1';
const REESE_AGENT_ID = 'reese-agent-1';

const REESE_ID = 'reese-enrollment-1';
const STUDENT_ID = 'student-enrollment-1';
const ROOM_ID = 'dm-room-1';

// IMPORTANT: getOpenAI() inside reeseReplyService.ts caches its client at
// MODULE scope (`let _openai`, same pattern as mentorService.ts) — it only
// ever calls getInstrumentedOpenAI() once per process/test-file lifetime. A
// fresh `jest.fn()` created in every beforeEach would silently orphan itself
// after the first test (the cached client keeps pointing at the FIRST test's
// mock function forever). This must be ONE stable function reference, reset
// (not replaced) between tests.
const mockCreateCompletion = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockGetReeseEnrollmentId.mockResolvedValue(REESE_ID);
  mockGetReeseAdminUserId.mockResolvedValue(REESE_ADMIN_ID);
  mockGetReeseAgentId.mockResolvedValue(REESE_AGENT_ID);
  mockBuildReeseSystemPrompt.mockResolvedValue('SYSTEM PROMPT');
  mockMessageFindAll.mockResolvedValue([
    { id: 'student-msg-1', enrollment_id: STUDENT_ID, content: 'Hi Reese, I am stuck on my project.' },
  ]);
  mockCreateCompletion.mockReset(); // clear any per-test override from a PRIOR test
  mockCreateCompletion.mockResolvedValue({
    choices: [{ message: { content: 'Here is your next move.' } }],
  });
  mockGetInstrumentedOpenAI.mockReturnValue({
    chat: { completions: { create: mockCreateCompletion } },
  });
  mockSendDmMessage.mockResolvedValue({ id: 'reply-msg-1', content: 'Here is your next move.' });
  mockEnsureTicket.mockResolvedValue({ id: 'ticket-1' });
  mockLogExchange.mockResolvedValue(undefined);
  mockMaybeRefreshAssessment.mockResolvedValue(undefined);
  mockExecuteReeseTool.mockResolvedValue('{}');
  mockLogAgentActivity.mockResolvedValue(undefined);
  mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: 'auth-1', verdict: 'would_allow', reason: 'ok' });
});

describe('maybeTriggerReeseReply', () => {
  it('happy path: a student message in a real Reese DM room produces exactly one Reese-authored reply, posted via sendDmMessage', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' }); // Reese IS a member

    await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

    expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
    expect(mockSendDmMessage).toHaveBeenCalledTimes(1);
    expect(mockSendDmMessage).toHaveBeenCalledWith(
      { enrollmentId: REESE_ID, cohortId: null, isAdmin: false },
      ROOM_ID,
      'Here is your next move.',
    );
    // Cost-tracking fix (2026-08-27) — the real agent_id must be resolved and
    // passed at client construction, not left null (see the module-scope
    // singleton caveat above: this is the ONLY test where a fresh
    // construction can be observed, since it's the first to trigger one).
    expect(mockGetInstrumentedOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ workflow_id: 'reese', agent_id: REESE_AGENT_ID }),
    );
  });

  it('ProofDesk linkage: the triggering student message AND the Reese reply are both logged to the same ticket', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });

    await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

    expect(mockEnsureTicket).toHaveBeenCalledWith(ROOM_ID, STUDENT_ID, 'Hi Reese, I am stuck on my project.');
    expect(mockLogExchange).toHaveBeenCalledTimes(2);
    expect(mockLogExchange).toHaveBeenNthCalledWith(1, 'ticket-1', 'human', STUDENT_ID, 'student-msg-1', 'Hi Reese, I am stuck on my project.');
    expect(mockLogExchange).toHaveBeenNthCalledWith(2, 'ticket-1', 'ai_staff', REESE_ADMIN_ID, 'reply-msg-1', 'Here is your next move.');
  });

  it('ProofDesk linkage boundary: if ticket-ensure fails, the reply is still generated and sent (ticket layer never blocks messaging)', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
    mockEnsureTicket.mockRejectedValue(new Error('ticket service down'));

    await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

    expect(mockSendDmMessage).toHaveBeenCalledTimes(1); // reply still sent
    expect(mockLogExchange).not.toHaveBeenCalled(); // no ticket id to log against
  });

  it('scope guard: a message in a room Reese is NOT a member of never invokes the LLM (cost + scope protection)', async () => {
    mockMembershipFindOne.mockResolvedValue(null); // Reese is not in this room

    await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

    expect(mockCreateCompletion).not.toHaveBeenCalled();
    expect(mockSendDmMessage).not.toHaveBeenCalled();
    expect(mockEnsureTicket).not.toHaveBeenCalled(); // no ticket noise for non-Reese rooms
  });

  it('loop guard (the core Phase-1 non-goal-boundary proof): a message whose SENDER is Reese\'s own identity never triggers a second reply', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' }); // even if Reese IS a member

    await maybeTriggerReeseReply(ROOM_ID, REESE_ID); // sender === Reese

    expect(mockMembershipFindOne).not.toHaveBeenCalled(); // loop guard short-circuits before any further lookup
    expect(mockCreateCompletion).not.toHaveBeenCalled();
    expect(mockSendDmMessage).not.toHaveBeenCalled();
    expect(mockEnsureTicket).not.toHaveBeenCalled();
  });

  it('boundary: no identity seeded yet — no-ops safely rather than throwing', async () => {
    mockGetReeseEnrollmentId.mockResolvedValue(null);

    await expect(maybeTriggerReeseReply(ROOM_ID, STUDENT_ID)).resolves.toBeUndefined();
    expect(mockCreateCompletion).not.toHaveBeenCalled();
  });

  it('boundary/failure: an LLM error is caught and logged, never thrown into the caller (the student\'s own send must still succeed)', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
    mockCreateCompletion.mockRejectedValue(new Error('OpenAI is down'));

    await expect(maybeTriggerReeseReply(ROOM_ID, STUDENT_ID)).resolves.toBeUndefined();
    expect(mockSendDmMessage).not.toHaveBeenCalled();
  });

  it('boundary: an empty/whitespace-only completion never posts an empty reply', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
    mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: '   ' } }] });

    await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);
    expect(mockSendDmMessage).not.toHaveBeenCalled();
  });

  it('Checkpoint D: a successful reply also fires the opportunistic assessment refresh for the sender, fire-and-forget', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });

    await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

    expect(mockMaybeRefreshAssessment).toHaveBeenCalledWith(STUDENT_ID);
  });

  it('Checkpoint D boundary: an assessment-refresh failure never breaks or delays the reply itself (fire-and-forget)', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
    mockMaybeRefreshAssessment.mockRejectedValue(new Error('LLM provider timeout'));

    await expect(maybeTriggerReeseReply(ROOM_ID, STUDENT_ID)).resolves.toBeUndefined();
    expect(mockSendDmMessage).toHaveBeenCalledTimes(1); // the reply itself still went out
  });

  it('Checkpoint E happy path: a tool_calls response triggers real tool execution and a second completion call that produces the final reply', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
    mockCreateCompletion
      .mockResolvedValueOnce({
        choices: [{ message: {
          role: 'assistant', content: null,
          tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'read_student_success_snapshot', arguments: '{}' } }],
        } }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Based on your progress, here is my suggestion.' } }] });
    mockExecuteReeseTool.mockResolvedValue('{"known":[{"category":"attendance","summary":"8/10"}]}');

    await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

    expect(mockCreateCompletion).toHaveBeenCalledTimes(2);
    expect(mockExecuteReeseTool).toHaveBeenCalledWith('read_student_success_snapshot', STUDENT_ID);
    expect(mockSendDmMessage).toHaveBeenCalledWith(
      { enrollmentId: REESE_ID, cohortId: null, isAdmin: false }, ROOM_ID, 'Based on your progress, here is my suggestion.',
    );
    // The second call must include the tool's real result and must NOT offer
    // tools again — this is what makes a second tool-call round structurally
    // impossible, not just unlikely.
    const secondCallArgs = mockCreateCompletion.mock.calls[1][0];
    expect(secondCallArgs.tools).toBeUndefined();
    const toolMessage = secondCallArgs.messages.find((m: any) => m.role === 'tool');
    expect(toolMessage.content).toBe('{"known":[{"category":"attendance","summary":"8/10"}]}');
    expect(toolMessage.tool_call_id).toBe('call-1');
  });

  it('Checkpoint E boundary: no tool_calls in the response never triggers a second completion call (backward compatible with the pre-tool-calling path)', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });

    await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

    expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
    expect(mockExecuteReeseTool).not.toHaveBeenCalled();
  });

  it('Checkpoint E security boundary: the tool always executes against the real sender enrollment id, never anything the model could supply', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
    mockCreateCompletion
      .mockResolvedValueOnce({
        choices: [{ message: {
          role: 'assistant', content: null,
          // A malicious/confused model tries to pass an id in its arguments —
          // executeReeseTool's real signature has no parameter for it to land in.
          tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'assess_student_health', arguments: '{"enrollmentId":"someone-elses-enrollment"}' } }],
        } }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Here is what I found.' } }] });

    await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

    expect(mockExecuteReeseTool).toHaveBeenCalledWith('assess_student_health', STUDENT_ID);
    expect(mockExecuteReeseTool).not.toHaveBeenCalledWith(expect.anything(), 'someone-elses-enrollment');
  });

  it('conversation history is passed to the LLM with correct role mapping (Reese = assistant, everyone else = user)', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
    mockMessageFindAll.mockResolvedValue([
      { enrollment_id: REESE_ID, content: 'Earlier Reese reply' },
      { enrollment_id: STUDENT_ID, content: 'Latest student message' },
    ]);

    await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

    const callArgs = mockCreateCompletion.mock.calls[0][0];
    const roles = callArgs.messages.map((m: any) => m.role);
    // system prompt first, then history in chronological order (findAll comes
    // back DESC and is reversed before use — oldest message role-mapped first).
    expect(roles[0]).toBe('system');
    expect(roles).toContain('assistant');
    expect(roles).toContain('user');
  });

  describe('GOALS scorecard activity logging (Ali: "improve the 3.8/5 Trust score for Reese")', () => {
    it('happy path: a real reply logs a real AiAgentActivityLog row under Reese\'s OWN agent id, decoupled from ticket-linking', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });

      await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

      expect(mockLogAgentActivity).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: REESE_AGENT_ID, action: 'reese_dm_reply', result: 'success' }),
      );
    });

    it('still logs success even when ticket-linking fails (decoupled from the ProofDesk layer)', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockEnsureTicket.mockRejectedValue(new Error('ticket service down'));

      await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

      expect(mockLogAgentActivity).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: REESE_AGENT_ID, action: 'reese_dm_reply', result: 'success' }),
      );
    });

    it('failure path: a caught LLM error also logs a real "failed" row — real signal for the Solid dimension', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockCreateCompletion.mockRejectedValue(new Error('OpenAI is down'));

      await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

      expect(mockLogAgentActivity).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: REESE_AGENT_ID, action: 'reese_dm_reply', result: 'failed', reason: 'OpenAI is down' }),
      );
    });

    it('boundary: no messages sent (e.g. empty completion) never logs a reply activity row', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: '   ' } }] });

      await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

      expect(mockLogAgentActivity).not.toHaveBeenCalled();
    });
  });

  describe('authorization audit coverage (Ali: "shouldn\'t Reese not be audited with everything we\'re tracking?")', () => {
    it('happy path: a real reply runs the real ABAC chokepoint, ticket-scoped, before the send', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });

      await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

      expect(mockAuthorizeTicketDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ ticketId: 'ticket-1', agentName: 'Reese', action: 'reese_dm_reply' }),
      );
      // Ordering: authorized before the real send, mirroring the outreach
      // path's own ordering fix — never logged after the fact.
      const authorizeOrder = mockAuthorizeTicketDispatch.mock.invocationCallOrder[0];
      const sendOrder = mockSendDmMessage.mock.invocationCallOrder[0];
      expect(authorizeOrder).toBeLessThan(sendOrder);
    });

    it('boundary: no resolvable ticket (ticket-ensure failed) skips the check rather than throwing — it is ticket-scoped', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockEnsureTicket.mockRejectedValue(new Error('ticket service down'));

      await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

      expect(mockAuthorizeTicketDispatch).not.toHaveBeenCalled();
      expect(mockSendDmMessage).toHaveBeenCalledTimes(1); // reply still sent — never gates
    });

    it('boundary: no messages sent (e.g. empty completion) never runs an authorization check for an action that never happened', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: '   ' } }] });

      await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

      expect(mockAuthorizeTicketDispatch).not.toHaveBeenCalled();
    });

    it('never gates: a "would_block" verdict still lets the real reply send (shadow mode, advisory only)', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: 'auth-1', verdict: 'would_block', reason: 'would_block_in_enforce' });

      await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

      expect(mockSendDmMessage).toHaveBeenCalledTimes(1);
    });
  });
});
