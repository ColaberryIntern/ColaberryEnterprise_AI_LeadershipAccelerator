/**
 * M31 at the reply level: mode from the M37 switch, governed topics never reach the model, shadow posts nothing and runs no
 * tool, the first message discloses she is an AI, and the handoff tool acts only for the sender.
 */
const mockMode = { value: 'live' as 'off' | 'shadow' | 'live' };
jest.mock('../../../models/RoomMembership', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/RoomMessage', () => ({ findAll: jest.fn(), count: jest.fn() }));
jest.mock('../mayaPromotion', () => ({
  resolveMayaMode: jest.fn(async (cap: string) => ({ capability: cap, mode: cap === 'respondToExplorerDm' ? mockMode.value : 'shadow', reason: 'test' })),
}));
jest.mock('../mayaJourneyHandoff', () => ({ createJourneyHandoff: jest.fn() }));
jest.mock('../../mayaIdentitySeed', () => ({ getMayaEnrollmentId: jest.fn(), getMayaAgentId: jest.fn() }));
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../../communityRooms/dmService', () => ({ sendDmMessage: jest.fn() }));
jest.mock('../../agentBlueprint/agentActivityLogService', () => ({ logAgentActivity: jest.fn() }));
jest.mock('../mayaPortalPrompt', () => ({ buildMayaPortalSystemPrompt: jest.fn(async () => 'SYSTEM') }));
jest.mock('../mayaCallbackService', () => ({ requestPortalCallback: jest.fn() }));

import RoomMembership from '../../../models/RoomMembership';
import RoomMessage from '../../../models/RoomMessage';
import { getMayaEnrollmentId, getMayaAgentId } from '../../mayaIdentitySeed';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { sendDmMessage } from '../../communityRooms/dmService';
import { logAgentActivity } from '../../agentBlueprint/agentActivityLogService';
import { createJourneyHandoff } from '../mayaJourneyHandoff';
import { executeMayaPortalTool } from '../mayaPortalTools';
import { AI_DISCLOSURE, HANDOFF_CONFIRMED_LINE } from '../mayaDmGovernance';
import { maybeTriggerMayaReply, __resetMayaReplyClientForTests } from '../mayaReplyService';

const MAYA = 'maya-enr-1';
const LEARNER = 'learner-enr-1';
const ROOM = 'dm-room-1';
const create = jest.fn();
const send = sendDmMessage as unknown as jest.Mock;
const handoff = createJourneyHandoff as unknown as jest.Mock;
const count = RoomMessage.count as unknown as jest.Mock;
const say = (content: string) => (RoomMessage.findAll as unknown as jest.Mock).mockResolvedValue([{ id: 'm1', enrollment_id: LEARNER, content }]);
const answer = (content: string) => ({ choices: [{ message: { role: 'assistant', content } }] });

beforeEach(() => {
  jest.clearAllMocks();
  __resetMayaReplyClientForTests();
  mockMode.value = 'live';
  (getMayaEnrollmentId as jest.Mock).mockResolvedValue(MAYA);
  (getMayaAgentId as jest.Mock).mockResolvedValue('maya-agent-1');
  (getInstrumentedOpenAI as jest.Mock).mockReturnValue({ chat: { completions: { create } } });
  (RoomMembership.findOne as unknown as jest.Mock).mockResolvedValue({ room_id: ROOM, enrollment_id: MAYA });
  count.mockResolvedValue(1);
  send.mockResolvedValue({ id: 'reply-1' });
  handoff.mockResolvedValue({ handoff: true, reason: 'created' });
});

describe('governed topics never reach the model', () => {
  it('REFUSAL: "how many seats are left?" -> a real handoff and a fixed reply, no model call, no number', async () => {
    say('How many seats are left?');
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(create).not.toHaveBeenCalled();
    expect(handoff).toHaveBeenCalledWith(LEARNER, 'maya_dm_seat_count', expect.anything());
    const posted = String(send.mock.calls[0][2]);
    expect(posted).toContain(HANDOFF_CONFIRMED_LINE);
    expect(posted.replace(/\[[^\]]*\]\([^)]*\)/g, '')).not.toMatch(/\d/);
    expect(logAgentActivity).toHaveBeenCalledWith(expect.objectContaining({ reason: 'reply_sent_governed:seat_count' }));
  });

  it('handoffs off: the reply never says someone will follow up', async () => {
    handoff.mockResolvedValue({ handoff: false, reason: 'disabled' });
    say('When does enrollment close?');
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(String(send.mock.calls[0][2])).not.toMatch(/follow up/i);
  });
});

describe('shadow (an admin reverted her DM reply)', () => {
  it('builds the reply, logs it, posts NOTHING and offers no tools', async () => {
    mockMode.value = 'shadow';
    say('Tell me about the program');
    create.mockResolvedValue(answer('It is self-paced.'));
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(send).not.toHaveBeenCalled();
    expect(create.mock.calls[0][0].tools).toBeUndefined();
    expect(logAgentActivity).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'shadow_not_posted', details: expect.objectContaining({ would_reply: 'It is self-paced.' }),
    }));
  });

  it('a governed topic in shadow writes no handoff', async () => {
    mockMode.value = 'shadow';
    say('Please delete my data');
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(handoff).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('a failure in shadow posts no fallback line', async () => {
    mockMode.value = 'shadow';
    say('Tell me about the program');
    create.mockRejectedValue(new Error('upstream 500'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('off', () => {
  it('reads nothing and posts nothing', async () => {
    mockMode.value = 'off';
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(RoomMembership.findOne).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('she says she is an AI', () => {
  it('her first message in a room starts with the disclosure', async () => {
    count.mockResolvedValue(0);
    say('hi');
    create.mockResolvedValue(answer('How can I help?'));
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(send.mock.calls[0][2]).toBe(`${AI_DISCLOSURE} How can I help?`);
  });
  it('later messages do not repeat it', async () => {
    say('thanks');
    create.mockResolvedValue(answer('Any time.'));
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(send.mock.calls[0][2]).toBe('Any time.');
  });
});

describe('create_journey_handoff tool', () => {
  it('acts for the SENDER only; an id in the model args is ignored', async () => {
    const out = JSON.parse(await executeMayaPortalTool('create_journey_handoff', { why: 'wants a human', enrollmentId: 'someone-else' }, { senderEnrollmentId: LEARNER }));
    expect(handoff).toHaveBeenCalledWith(LEARNER, 'maya_dm_request');
    expect(out.handed_off).toBe(true);
  });
  it('not confirmed -> handed_off false and the booking link, so she cannot claim one', async () => {
    handoff.mockResolvedValue({ handoff: false, reason: 'disabled' });
    const out = JSON.parse(await executeMayaPortalTool('create_journey_handoff', {}, { senderEnrollmentId: LEARNER }));
    expect(out).toMatchObject({ handed_off: false });
    expect(out.link).toContain('/portal/campus?book=call');
  });
});
