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
jest.mock('../reeseIdentitySeed', () => ({ getReeseEnrollmentId: jest.fn(), getReeseAdminUserId: jest.fn() }));
jest.mock('../reeseSystemPrompt', () => ({ buildReeseSystemPrompt: jest.fn() }));
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../../communityRooms/dmService', () => ({ sendDmMessage: jest.fn() }));
jest.mock('../reeseTicketLinkService', () => ({
  ensureReeseTicketForRoom: jest.fn(),
  logReeseExchangeActivity: jest.fn(),
}));

import RoomMembership from '../../../models/RoomMembership';
import RoomMessage from '../../../models/RoomMessage';
import { getReeseEnrollmentId, getReeseAdminUserId } from '../reeseIdentitySeed';
import { buildReeseSystemPrompt } from '../reeseSystemPrompt';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { sendDmMessage } from '../../communityRooms/dmService';
import { ensureReeseTicketForRoom, logReeseExchangeActivity } from '../reeseTicketLinkService';
import { maybeTriggerReeseReply } from '../reeseReplyService';

const mockMembershipFindOne = RoomMembership.findOne as unknown as jest.Mock;
const mockMessageFindAll = RoomMessage.findAll as unknown as jest.Mock;
const mockGetReeseEnrollmentId = getReeseEnrollmentId as unknown as jest.Mock;
const mockGetReeseAdminUserId = getReeseAdminUserId as unknown as jest.Mock;
const mockBuildReeseSystemPrompt = buildReeseSystemPrompt as unknown as jest.Mock;
const mockGetInstrumentedOpenAI = getInstrumentedOpenAI as unknown as jest.Mock;
const mockSendDmMessage = sendDmMessage as unknown as jest.Mock;
const mockEnsureTicket = ensureReeseTicketForRoom as unknown as jest.Mock;
const mockLogExchange = logReeseExchangeActivity as unknown as jest.Mock;

const REESE_ADMIN_ID = 'reese-admin-1';

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
});
