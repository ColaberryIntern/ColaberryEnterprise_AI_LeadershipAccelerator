/**
 * C121 — mayaReplyService is the only place a Maya-authored portal DM is produced. These pin the structural guards
 * (chat flag, loop guard, scope guard), that tools run for the SENDER only, the one tool round, the booking link, and
 * the honest fallback.
 */
const mockEnv = { enableChat: true };
jest.mock('../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../../models/RoomMembership', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/RoomMessage', () => ({ findAll: jest.fn(), count: jest.fn(async () => 1) }));
// M31: the reply's mode comes from the M37 switch. Off when chat is off, as before; live otherwise (Q2: A).
jest.mock('../mayaPromotion', () => ({
  resolveMayaMode: jest.fn(async (cap: string) => ({ capability: cap, mode: cap === 'respondToExplorerDm' && mockEnv.enableChat ? 'live' : (cap === 'respondToExplorerDm' ? 'off' : 'shadow'), reason: 'test' })),
}));
jest.mock('../../mayaIdentitySeed', () => ({ getMayaEnrollmentId: jest.fn(), getMayaAgentId: jest.fn() }));
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../../communityRooms/dmService', () => ({ sendDmMessage: jest.fn() }));
jest.mock('../../agentBlueprint/agentActivityLogService', () => ({ logAgentActivity: jest.fn() }));
jest.mock('../mayaPortalPrompt', () => ({ buildMayaPortalSystemPrompt: jest.fn(async () => 'SYSTEM') }));
jest.mock('../mayaCallbackService', () => ({ requestPortalCallback: jest.fn() }));
jest.mock('../mayaJourneyHandoff', () => ({ createJourneyHandoff: jest.fn(async () => ({ handoff: false, reason: 'disabled' })) }));
jest.mock('../mayaPortalTools', () => {
  const actual = jest.requireActual('../mayaPortalTools');
  return { ...actual, executeMayaPortalTool: jest.fn() };
});

import RoomMembership from '../../../models/RoomMembership';
import RoomMessage from '../../../models/RoomMessage';
import { getMayaEnrollmentId, getMayaAgentId } from '../../mayaIdentitySeed';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { sendDmMessage } from '../../communityRooms/dmService';
import { logAgentActivity } from '../../agentBlueprint/agentActivityLogService';
import { executeMayaPortalTool, BOOK_CALL_LINK, BOOK_CALL_PATH, TOUR_LINK, TOUR_PATH } from '../mayaPortalTools';
import { maybeTriggerMayaReply, MAYA_REPLY_FAILURE_MESSAGE, withBookingLink, withTourLink, __resetMayaReplyClientForTests } from '../mayaReplyService';

const MAYA = 'maya-enr-1';
const LEARNER = 'learner-enr-1';
const ROOM = 'dm-room-1';
const create = jest.fn();
const findOne = RoomMembership.findOne as unknown as jest.Mock;
const findAll = RoomMessage.findAll as unknown as jest.Mock;
const send = sendDmMessage as unknown as jest.Mock;
const tool = executeMayaPortalTool as unknown as jest.Mock;

const answer = (content: string) => ({ choices: [{ message: { role: 'assistant', content } }] });
const toolCall = (name: string, args: Record<string, unknown>) => ({
  choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
});

beforeEach(() => {
  jest.clearAllMocks();
  __resetMayaReplyClientForTests();
  mockEnv.enableChat = true;
  (getMayaEnrollmentId as jest.Mock).mockResolvedValue(MAYA);
  (getMayaAgentId as jest.Mock).mockResolvedValue('maya-agent-1');
  (getInstrumentedOpenAI as jest.Mock).mockReturnValue({ chat: { completions: { create } } });
  findOne.mockResolvedValue({ room_id: ROOM, enrollment_id: MAYA });
  findAll.mockResolvedValue([{ id: 'm1', enrollment_id: LEARNER, content: 'Have someone call me' }]);
  send.mockResolvedValue({ id: 'reply-1' });
});

describe('guards: no LLM call, no message', () => {
  it('the site chat flag is off', async () => {
    mockEnv.enableChat = false;
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(findOne).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it('the sender is Maya (loop guard)', async () => {
    await maybeTriggerMayaReply(ROOM, MAYA);
    expect(findOne).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  it('Maya is not a member of the room', async () => {
    findOne.mockResolvedValue(null);
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(findOne).toHaveBeenCalledWith({ where: { room_id: ROOM, enrollment_id: MAYA, access_state: 'active' } });
    expect(create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it('her identity is not seeded', async () => {
    (getMayaEnrollmentId as jest.Mock).mockResolvedValue(null);
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('a reply', () => {
  it('answers through sendDmMessage as Maya, offering only the five portal tools', async () => {
    create.mockResolvedValue(answer('Membership is billed annually.'));
    await maybeTriggerMayaReply(ROOM, LEARNER);
    const names = create.mock.calls[0][0].tools.map((t: { function: { name: string } }) => t.function.name);
    expect(names).toEqual(['retrieve_knowledge', 'book_admissions_call', 'request_callback', 'create_journey_handoff', 'start_campus_tour']);
    expect(send).toHaveBeenCalledWith({ enrollmentId: MAYA, cohortId: null, isAdmin: false }, ROOM, 'Membership is billed annually.');
    expect(logAgentActivity).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'maya-agent-1', action: 'maya_dm_reply', result: 'success' }));
  });

  it('a tool runs for the SENDER, never for an id the model supplies, and the follow-up offers no tools', async () => {
    create
      .mockResolvedValueOnce(toolCall('request_callback', { phone: '214-555-0100', enrollmentId: 'someone-else', enrollment_id: 'x' }))
      .mockResolvedValueOnce(answer('Done, the team will call the number ending in 0100.'));
    tool.mockResolvedValue(JSON.stringify({ recorded: true, phone_last4: '0100' }));
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(tool).toHaveBeenCalledTimes(1);
    expect(tool.mock.calls[0][2]).toEqual({ senderEnrollmentId: LEARNER });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].tools).toBeUndefined();
    expect(send.mock.calls[0][2]).toContain('0100');
  });

  it('book_admissions_call: the reply always carries the real booking link, even when the model paraphrased it away', async () => {
    create
      .mockResolvedValueOnce(toolCall('book_admissions_call', {}))
      .mockResolvedValueOnce(answer('Happy to set that up. Pick a time that suits you.'));
    tool.mockResolvedValue(JSON.stringify({ offered: true, link: BOOK_CALL_LINK }));
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(send.mock.calls[0][2]).toContain(BOOK_CALL_PATH);
  });

  it('withBookingLink does not add a second copy, and adds nothing when no booking was offered', () => {
    expect(withBookingLink(`See ${BOOK_CALL_LINK}`, true)).toBe(`See ${BOOK_CALL_LINK}`);
    expect(withBookingLink('Hi', false)).toBe('Hi');
  });

  it('C123 start_campus_tour: the reply always carries the real tour link, even when the model left it out', async () => {
    create
      .mockResolvedValueOnce(toolCall('start_campus_tour', {}))
      .mockResolvedValueOnce(answer('Happy to show you around. The tour walks you through each place on campus.'));
    tool.mockResolvedValue(JSON.stringify({ offered: true, link: TOUR_LINK }));
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(send.mock.calls[0][2]).toContain(TOUR_PATH);
    expect(send.mock.calls[0][2]).not.toContain(BOOK_CALL_PATH);
  });

  it('C123 withTourLink does not add a second copy, and adds nothing when no tour was offered', () => {
    expect(withTourLink(`Here: ${TOUR_LINK}`, true)).toBe(`Here: ${TOUR_LINK}`);
    expect(withTourLink('Hi', false)).toBe('Hi');
  });

  it('a tour answer that never called the tool: her invented link is replaced by the real one', async () => {
    /**
     * 2026-11-08, observed in production. She answered "Let me get that started for you. Here's
     * the link to begin the tour: [Start Campus Tour](/portal/campus/map)" WITHOUT calling
     * start_campus_tour, so `tourOffered` was false and `withTourLink` never fired. The path she
     * invented does not exist, the renderer's allowlist refused it, and the learner was shown
     * raw markdown for a dead link.
     */
    create.mockResolvedValueOnce(answer(
      "Yes, I can help you start a guided tour of our campus! Here's the link to begin the tour: " +
      '[Start Campus Tour](/portal/campus/map). Enjoy exploring!',
    ));
    await maybeTriggerMayaReply(ROOM, LEARNER);

    const sent = send.mock.calls[0][2];
    expect(sent).toContain(TOUR_PATH);
    expect(sent).not.toContain('/portal/campus/map');
    // The control: the tool really was not called, so this is the ungated path and not just
    // withTourLink doing its existing job.
    expect(tool).not.toHaveBeenCalled();
    // And only one tour link, not the real one appended beside a repaired one.
    expect(sent.split(TOUR_PATH).length - 1).toBe(1);
  });

  it('C123 the tour tool exists, takes nothing from the model, and returns the exact link', async () => {
    const real = jest.requireActual('../mayaPortalTools') as typeof import('../mayaPortalTools');
    const def = real.MAYA_PORTAL_TOOLS.find((t) => t.type === 'function' && t.function.name === 'start_campus_tour');
    expect(def).toBeDefined();
    expect(real.isMayaPortalTool('start_campus_tour')).toBe(true);
    expect(JSON.parse(await real.executeMayaPortalTool('start_campus_tour', { anything: 'x' }, { senderEnrollmentId: LEARNER })).link).toBe(TOUR_LINK);
    expect(TOUR_LINK).toBe(`[Take the campus tour](${TOUR_PATH})`);
  });

  it('an empty model answer sends nothing', async () => {
    create.mockResolvedValue(answer('   '));
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('failure: never throws, never silent', () => {
  it('a database failure mid-reply posts the one deterministic, honest line (never LLM text)', async () => {
    findAll.mockRejectedValue(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(maybeTriggerMayaReply(ROOM, LEARNER)).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({ enrollmentId: MAYA, cohortId: null, isAdmin: false }, ROOM, MAYA_REPLY_FAILURE_MESSAGE);
    const ev = warn.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(ev).toEqual(expect.arrayContaining([expect.objectContaining({ event: 'reply_failed', error_class: 'SequelizeConnectionError' })]));
    warn.mockRestore();
  });

  it('a membership lookup failure posts nothing: Maya is not confirmed to be in that room', async () => {
    findOne.mockRejectedValue(new TypeError('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(send).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('the completion fails twice (one bounded retry): the fallback line, and the failure is logged', async () => {
    create.mockRejectedValue(Object.assign(new Error('503'), { name: 'APIError' }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await maybeTriggerMayaReply(ROOM, LEARNER);
    expect(create).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][2]).toBe(MAYA_REPLY_FAILURE_MESSAGE);
    expect(logAgentActivity).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed' }));
    warn.mockRestore();
  });

  it('even the fallback failing is swallowed and logged', async () => {
    findAll.mockRejectedValue(new Error('x'));
    send.mockRejectedValue(new Error('y'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(maybeTriggerMayaReply(ROOM, LEARNER)).resolves.toBeUndefined();
    expect(warn.mock.calls.map((c) => JSON.parse(String(c[0])).event)).toContain('reply_failure_fallback_also_failed');
    warn.mockRestore();
  });
});
