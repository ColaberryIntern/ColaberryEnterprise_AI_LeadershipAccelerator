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
jest.mock('../reeseIdentitySeed', () => ({
  getReeseEnrollmentId: jest.fn(),
  getReeseAdminUserId: jest.fn(),
  getReeseAgentId: jest.fn(),
  isReeseEnabled: jest.fn(),
}));
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
jest.mock('../resolveStudentDisplayName', () => ({ resolveStudentDisplayName: jest.fn() }));
jest.mock('../../workGraph/workGraphService', () => ({ createWorkUnit: jest.fn(), updateWorkUnitStatus: jest.fn() }));

import RoomMembership from '../../../models/RoomMembership';
import RoomMessage from '../../../models/RoomMessage';
import { getReeseEnrollmentId, getReeseAdminUserId, getReeseAgentId, isReeseEnabled } from '../reeseIdentitySeed';
import { buildReeseSystemPrompt } from '../reeseSystemPrompt';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { sendDmMessage } from '../../communityRooms/dmService';
import { ensureReeseTicketForRoom, logReeseExchangeActivity } from '../reeseTicketLinkService';
import { maybeRefreshStudentAssessment } from '../../studentHealthAssessment';
import { executeReeseTool } from '../reeseTools';
import { logAgentActivity } from '../../agentBlueprint/agentActivityLogService';
import { authorizeTicketDispatch } from '../../workLedger/agentActionAuthorizationBridge';
import { resolveStudentDisplayName } from '../resolveStudentDisplayName';
import { createWorkUnit, updateWorkUnitStatus } from '../../workGraph/workGraphService';
import { maybeTriggerReeseReply } from '../reeseReplyService';

const mockMembershipFindOne = RoomMembership.findOne as unknown as jest.Mock;
const mockMessageFindAll = RoomMessage.findAll as unknown as jest.Mock;
const mockGetReeseEnrollmentId = getReeseEnrollmentId as unknown as jest.Mock;
const mockGetReeseAdminUserId = getReeseAdminUserId as unknown as jest.Mock;
const mockGetReeseAgentId = getReeseAgentId as unknown as jest.Mock;
const mockIsReeseEnabled = isReeseEnabled as unknown as jest.Mock;
const mockBuildReeseSystemPrompt = buildReeseSystemPrompt as unknown as jest.Mock;
const mockGetInstrumentedOpenAI = getInstrumentedOpenAI as unknown as jest.Mock;
const mockSendDmMessage = sendDmMessage as unknown as jest.Mock;
const mockEnsureTicket = ensureReeseTicketForRoom as unknown as jest.Mock;
const mockLogExchange = logReeseExchangeActivity as unknown as jest.Mock;
const mockMaybeRefreshAssessment = maybeRefreshStudentAssessment as unknown as jest.Mock;
const mockExecuteReeseTool = executeReeseTool as unknown as jest.Mock;
const mockLogAgentActivity = logAgentActivity as unknown as jest.Mock;
const mockAuthorizeTicketDispatch = authorizeTicketDispatch as unknown as jest.Mock;
const mockResolveStudentDisplayName = resolveStudentDisplayName as unknown as jest.Mock;
const mockCreateWorkUnit = createWorkUnit as unknown as jest.Mock;
const mockUpdateWorkUnitStatus = updateWorkUnitStatus as unknown as jest.Mock;

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
  mockIsReeseEnabled.mockResolvedValue(true);
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
  mockResolveStudentDisplayName.mockResolvedValue('Jordan Rivera');
  mockCreateWorkUnit.mockResolvedValue({ id: 'wu-1', update: jest.fn().mockResolvedValue(undefined) });
  mockUpdateWorkUnitStatus.mockResolvedValue(undefined);
  mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: 'auth-1', verdict: 'would_allow', reason: 'ok', allowed: true });
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
    // 6th arg is the real work unit id (Workspace mission, Phase 2 slice 1) —
    // createWorkUnit() resolves to { id: 'wu-1', ... } under the default mocks.
    expect(mockLogExchange).toHaveBeenNthCalledWith(1, 'ticket-1', 'human', STUDENT_ID, 'student-msg-1', 'Hi Reese, I am stuck on my project.', 'wu-1');
    expect(mockLogExchange).toHaveBeenNthCalledWith(2, 'ticket-1', 'ai_staff', REESE_ADMIN_ID, 'reply-msg-1', 'Here is your next move.', 'wu-1');
  });

  it('ProofDesk linkage boundary: if ticket-ensure fails, the reply is still generated and sent (ticket layer never blocks messaging)', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
    mockEnsureTicket.mockRejectedValue(new Error('ticket service down'));

    await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

    expect(mockSendDmMessage).toHaveBeenCalledTimes(1); // reply still sent
    expect(mockLogExchange).not.toHaveBeenCalled(); // no ticket id to log against
    // Workspace mission, Phase 2 slice 1: no ticketId means no work unit either —
    // nothing real to attach it to, and this must never become a new blocking path.
    expect(mockCreateWorkUnit).not.toHaveBeenCalled();
    expect(mockUpdateWorkUnitStatus).not.toHaveBeenCalled();
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

  it('Product Phase 1, R2 kill switch: Reese disabled (ai_agents.enabled=false) stops the reply before any DB/LLM work', async () => {
    mockIsReeseEnabled.mockResolvedValue(false);
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });

    await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

    expect(mockGetReeseEnrollmentId).not.toHaveBeenCalled();
    expect(mockCreateCompletion).not.toHaveBeenCalled();
    expect(mockSendDmMessage).not.toHaveBeenCalled();
    // The health-assessment behaviour has no independent switch of its own —
    // it only ever fires after a reply, so disabling Reese also stops it.
    expect(mockMaybeRefreshAssessment).not.toHaveBeenCalled();
  });

  it('Product Phase 1, R2 kill switch: Reese enabled (ai_agents.enabled=true) leaves the reply path unchanged', async () => {
    mockIsReeseEnabled.mockResolvedValue(true);
    mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });

    await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

    expect(mockSendDmMessage).toHaveBeenCalledTimes(1);
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

  describe('Real-enforcement Phase 2 (respects authorizeTicketDispatch().allowed — this function\'s FIRST authorization call ever)', () => {
    it('shadow-mode no-op proof: allowed:true (the real, current, unconditional shadow-mode value) leaves the reply byte-for-byte unchanged', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: 'auth-1', verdict: 'would_require_approval', reason: 'requires_approval:high_risk_tier', allowed: true });

      await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

      expect(mockAuthorizeTicketDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ ticketId: 'ticket-1', agentName: 'Reese', action: 'reese_dm_reply', riskTier: 'R3' }),
      );
      expect(mockSendDmMessage).toHaveBeenCalledTimes(1);
      expect(mockSendDmMessage).toHaveBeenCalledWith(
        { enrollmentId: REESE_ID, cohortId: null, isAdmin: false }, ROOM_ID, 'Here is your next move.',
      );
    });

    it('a held reply (allowed:false) never sends — an honest hold, not a silent drop', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: 'auth-1', verdict: 'would_require_approval', reason: 'requires_approval:high_risk_tier', allowed: false });

      await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

      expect(mockSendDmMessage).not.toHaveBeenCalled();
      // No downstream reply-side-effect bookkeeping either — nothing was sent.
      expect(mockLogAgentActivity).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'reese_dm_reply', result: 'success' }),
      );
      // Workspace mission, Phase 2 slice 1: a held reply transitions the real
      // work unit to 'blocked' — never 'done' or 'failed'.
      expect(mockUpdateWorkUnitStatus).toHaveBeenCalledWith('wu-1', 'blocked');
      expect(mockUpdateWorkUnitStatus).not.toHaveBeenCalledWith('wu-1', 'done');
      expect(mockUpdateWorkUnitStatus).not.toHaveBeenCalledWith('wu-1', 'failed');
    });

    it('ticketId === null (ticket-ensure already failed and was swallowed) skips the authorization call entirely and sends exactly as today — the disclosed design decision, not a new blocking condition', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockEnsureTicket.mockRejectedValue(new Error('ticket service down'));

      await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

      expect(mockAuthorizeTicketDispatch).not.toHaveBeenCalled();
      expect(mockSendDmMessage).toHaveBeenCalledTimes(1); // reply still sent, exactly as before this phase
    });
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

  describe('Workspace mission, Phase 2 slice 1 (real, persisted TicketWorkUnit lifecycle — first slice: Reese\'s reactive DM reply)', () => {
    it('happy path: a real work unit is created for the reply, assigned to Reese, and transitions to \'done\' after a successful send', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      const mockWorkUnitUpdate = jest.fn().mockResolvedValue(undefined);
      mockCreateWorkUnit.mockResolvedValue({ id: 'wu-42', update: mockWorkUnitUpdate });

      await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

      expect(mockResolveStudentDisplayName).toHaveBeenCalledWith(STUDENT_ID);
      expect(mockCreateWorkUnit).toHaveBeenCalledWith('ticket-1', expect.objectContaining({
        title: 'Reply to Jordan Rivera',
        requiredCapability: 'student_support.reply',
        riskTier: 'R3',
        status: 'in_progress',
        approvalPolicy: 'auto',
      }));
      // assigned_agent_name cannot be set at creation (not part of
      // createWorkUnitInputSchema) — set via the same post-create .update()
      // pattern inboxCaseWorkGraphAutoRecorder.ts's own real precedent uses.
      expect(mockWorkUnitUpdate).toHaveBeenCalledWith({ assigned_agent_name: 'Reese' });
      expect(mockUpdateWorkUnitStatus).toHaveBeenCalledWith('wu-42', 'done');
    });

    it('empty completion (no reply needed): the work unit still transitions to \'done\' — a genuine non-error outcome, never \'failed\'', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: '   ' } }] });

      await maybeTriggerReeseReply(ROOM_ID, STUDENT_ID);

      expect(mockSendDmMessage).not.toHaveBeenCalled();
      expect(mockUpdateWorkUnitStatus).toHaveBeenCalledWith('wu-1', 'done');
    });

    it('a thrown error after the work unit was created (e.g. the LLM call fails) transitions the work unit to \'failed\'', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockCreateCompletion.mockRejectedValue(new Error('OpenAI is down'));

      await expect(maybeTriggerReeseReply(ROOM_ID, STUDENT_ID)).resolves.toBeUndefined();

      expect(mockUpdateWorkUnitStatus).toHaveBeenCalledWith('wu-1', 'failed');
    });

    it('a failure inside updateWorkUnitStatus() itself (e.g. during the failed-path transition) is swallowed and never masks the original error or breaks the caller', async () => {
      mockMembershipFindOne.mockResolvedValue({ id: 'membership-1' });
      mockCreateCompletion.mockRejectedValue(new Error('OpenAI is down'));
      mockUpdateWorkUnitStatus.mockRejectedValue(new Error('DB is down'));

      await expect(maybeTriggerReeseReply(ROOM_ID, STUDENT_ID)).resolves.toBeUndefined();

      // The original failure is still recorded on the GOALS scorecard —
      // the work-unit bookkeeping failure never masks it.
      expect(mockLogAgentActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'reese_dm_reply', result: 'failed', reason: 'OpenAI is down' }),
      );
    });
  });
});
