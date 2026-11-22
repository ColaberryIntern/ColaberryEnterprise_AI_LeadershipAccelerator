/**
 * Agent comms (T10) - the Synthflow call-complete webhook for a place_ai_call row: the result goes back to
 * the agent that called (completion + a timeline entry in its name) and NO post-call SMS is sent, because
 * the tool was granted for a call, not a text. A non-agent row keeps its old behavior (control).
 */
const m = {
  complete: jest.fn(),
  activity: jest.fn(),
  testOverrides: jest.fn(),
  sms: jest.fn(),
  update: jest.fn(),
  findOne: jest.fn(),
};

jest.mock('../../config/env', () => ({ env: { synthflowWebhookToken: 't' } }));
jest.mock('../../services/voice/synthflowWebhookAuth', () => ({ webhookTokenOk: () => true }));
jest.mock('../../models', () => ({
  CommunicationLog: { findOne: (...a: unknown[]) => m.findOne(...a), findByPk: jest.fn().mockResolvedValue(null) },
  CampaignSimulationStep: { findOne: jest.fn() },
  Lead: { findByPk: jest.fn().mockResolvedValue({ id: 42, name: 'Pat Doe' }) },
  InteractionOutcome: { create: jest.fn() },
  CallContactLog: { update: jest.fn().mockResolvedValue([0]) },
  Activity: { findOne: jest.fn().mockResolvedValue(null) },
}));
jest.mock('../../services/scheduling/cancelScheduledMessage', () => ({ cancelScheduledMessagesWhere: jest.fn() }));
jest.mock('../../services/callTranscriptProcessor', () => ({ processCallTranscript: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../services/ghlService', () => ({ sendSmsViaGhl: (...a: unknown[]) => m.sms(...a), syncLeadToGhl: jest.fn(), findContactByEmail: jest.fn() }));
jest.mock('../../services/activityService', () => ({ logActivity: (...a: unknown[]) => m.activity(...a) }));
jest.mock('../../services/delivery/flotationCallCompletion', () => ({ completeFlotationCall: jest.fn(), isIntakeCallSource: () => false }));
jest.mock('../../services/openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../../services/settingsService', () => ({ getTestOverrides: (...a: unknown[]) => m.testOverrides(...a) }));
jest.mock('../../utils/piiRedaction', () => ({ redactForLogs: (s: string) => s }));
jest.mock('../../services/ghlMirrorService', () => ({ mirrorToGhlInBackground: jest.fn(), resolveGhlContactId: jest.fn().mockResolvedValue(null) }));
jest.mock('../../services/agents/tools/agentCallCompletion', () => ({ completeAgentToolCallFromWebhook: (...a: unknown[]) => m.complete(...a) }));

import { handleSynthflowCallComplete } from '../synthflowWebhookController';

const TRANSCRIPT = 'Agent: Hi Pat, this is Reese from Colaberry. Pat: How long is a pilot?';

function req() {
  return { query: { token: 't' }, body: { call: { call_id: 'call-9', status: 'completed', duration: 65, transcript: TRANSCRIPT, end_call_reason: 'hangup' } } } as never;
}
function res() {
  const r = { status: jest.fn(), json: jest.fn() };
  r.status.mockReturnValue(r);
  return r;
}
function row(metadata: Record<string, unknown>) {
  return { id: 'log-9', lead_id: 42, campaign_id: null, provider_response: {}, metadata, update: (...a: unknown[]) => m.update(...a) };
}
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.update.mockResolvedValue(undefined);
  m.complete.mockResolvedValue({ outcome: 'summarized' });
  m.testOverrides.mockResolvedValue({ enabled: false });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('an agent-tool call goes back to its agent, in its name, and texts no one', async () => {
  m.findOne.mockResolvedValue(row({ source: 'agent-tool', agent_name: 'Reese' }));
  const r = res();
  await handleSynthflowCallComplete(req(), r as never);
  await flush();
  expect(m.complete).toHaveBeenCalledWith({ logId: 'log-9', meta: { source: 'agent-tool', agent_name: 'Reese' }, transcript: TRANSCRIPT, status: 'completed' });
  expect(m.activity.mock.calls[0][0]).toMatchObject({ lead_id: 42, subject: 'Reese called Pat (1m 5s)' });
  expect(m.testOverrides).not.toHaveBeenCalled(); // the post-call SMS path never started
  expect(m.sms).not.toHaveBeenCalled();
  expect(r.json).toHaveBeenCalledWith({ ok: true, matched: true });
});

it('CONTROL: a non-agent call keeps the old path (no agent completion; post-call SMS path starts)', async () => {
  m.findOne.mockResolvedValue(row({ source: 'interest' }));
  await handleSynthflowCallComplete(req(), res() as never);
  await flush();
  expect(m.complete).not.toHaveBeenCalled();
  expect(m.activity.mock.calls[0][0].subject).toBe('Maya called Pat (1m 5s)');
  expect(m.testOverrides).toHaveBeenCalled();
});
