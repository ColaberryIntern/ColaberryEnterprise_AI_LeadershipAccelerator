/**
 * OH1m (T7): processVoiceAction for Open House countdown calls.
 *  - voice off: the countdown step is CANCELLED with reason voice_disabled, not marked sent
 *    (a non-countdown step keeps the old "sent + skipped" behavior);
 *  - voice on: the call goes to callType 'open_house';
 *  - a refused dial keeps Synthflow's HTTP status and raw body on the step's metadata.
 * Synthflow and every database write are mocked; nothing dials.
 */
const mockEnv: Record<string, any> = {
  jwtSecret: 't',
  databaseUrl: 'postgres://u:p@localhost:5432/t',
  enableVoiceCalls: false,
};
jest.mock('../../config/env', () => ({ env: mockEnv }));
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../models', () => ({
  Lead: { findByPk: jest.fn().mockResolvedValue({ id: 7, name: 'Pat Doe', email: 'pat@example.com' }) },
  Cohort: { findOne: jest.fn().mockResolvedValue(null) },
  ScheduledEmail: {}, Campaign: {}, CampaignLead: {}, StrategyCall: {}, Enrollment: {},
}));
jest.mock('../synthflowService', () => ({ triggerVoiceCall: jest.fn() }));
jest.mock('../scheduling/cancelScheduledMessage', () => ({
  cancelScheduledMessage: jest.fn().mockResolvedValue(true),
  cancelScheduledMessagesWhere: jest.fn().mockResolvedValue(0),
  pauseScheduledMessagesWhere: jest.fn().mockResolvedValue(0),
}));
jest.mock('../aiMessageService', () => ({
  generateMessage: jest.fn(),
  buildConversationHistory: jest.fn().mockResolvedValue('No prior interactions with this lead.'),
}));
jest.mock('../openHouseCountdown', () => ({ countdownCallBrief: jest.fn().mockReturnValue('BRIEF') }));
jest.mock('../openHouseCountdownContext', () => ({ gatherCallFacts: jest.fn().mockResolvedValue(null) }));
jest.mock('../activityService', () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../communicationLogService', () => ({ logCommunication: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../interactionService', () => ({ recordActionOutcome: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../pipelineService', () => ({ advancePipelineStage: jest.fn().mockResolvedValue(undefined) }));

import { __processVoiceActionForTests as processVoiceAction } from '../schedulerService';
import { triggerVoiceCall } from '../synthflowService';
import { cancelScheduledMessage } from '../scheduling/cancelScheduledMessage';

function makeAction(metadata: Record<string, any>) {
  const action: any = {
    id: 'act-1', lead_id: 7, campaign_id: 'camp-1', step_index: 0, subject: 'Countdown call',
    to_phone: '+15555550123', voice_agent_type: 'interest', attempts_made: 0, ai_generated: false,
    metadata,
  };
  action.update = jest.fn(async (patch: any) => { Object.assign(action, patch); return action; });
  return action;
}

describe('processVoiceAction: Open House countdown (OH1m)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('voice off: a countdown step is cancelled with voice_disabled, not marked sent, no dial', async () => {
    mockEnv.enableVoiceCalls = false;
    const action = makeAction({ event_countdown: true });
    await processVoiceAction(action);
    expect(cancelScheduledMessage).toHaveBeenCalledWith(action, 'voice_disabled');
    expect(action.update).not.toHaveBeenCalled();
    expect(triggerVoiceCall).not.toHaveBeenCalled();
  });

  it('voice off: a non-countdown step keeps the old sent + skipped behavior', async () => {
    mockEnv.enableVoiceCalls = false;
    const action = makeAction({});
    await processVoiceAction(action);
    expect(cancelScheduledMessage).not.toHaveBeenCalled();
    expect(action.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
    expect(action.metadata.reason).toBe('voice_disabled');
  });

  it('voice on: the countdown call targets the open_house agent', async () => {
    mockEnv.enableVoiceCalls = true;
    (triggerVoiceCall as jest.Mock).mockResolvedValue({ success: true, data: { call_id: 'c-1' } });
    const action = makeAction({ event_countdown: true, event_title: 'Open House' });
    await processVoiceAction(action);
    const args = (triggerVoiceCall as jest.Mock).mock.calls[0][0];
    expect(args.callType).toBe('open_house');
    expect(args.prompt).toBe('BRIEF');
    expect(action.status).toBe('sent');
  });

  it('voice on: a refused dial keeps HTTP status and raw body on the step, then throws for retry', async () => {
    mockEnv.enableVoiceCalls = true;
    (triggerVoiceCall as jest.Mock).mockResolvedValue({
      success: false, error: 'Synthflow HTTP 502: <html>bad</html>', status: 502, rawBody: '<html>bad</html>',
    });
    const action = makeAction({ event_countdown: true });
    await expect(processVoiceAction(action)).rejects.toThrow('Synthflow HTTP 502');
    expect(action.metadata.last_dial_error).toEqual(expect.objectContaining({ status: 502, body: '<html>bad</html>' }));
    expect(action.metadata.event_countdown).toBe(true);
  });

  it('voice on, open house agent unset: the refusal is recorded and thrown', async () => {
    mockEnv.enableVoiceCalls = true;
    (triggerVoiceCall as jest.Mock).mockResolvedValue({
      success: false, error: 'SYNTHFLOW_OPEN_HOUSE_AGENT_ID is not set: refusing', data: { skipped: true, reason: 'no_open_house_agent_id' },
    });
    const action = makeAction({ event_countdown: true });
    await expect(processVoiceAction(action)).rejects.toThrow(/SYNTHFLOW_OPEN_HOUSE_AGENT_ID/);
    expect(action.metadata.last_dial_error).toEqual(expect.objectContaining({ status: null, body: null }));
  });
});
