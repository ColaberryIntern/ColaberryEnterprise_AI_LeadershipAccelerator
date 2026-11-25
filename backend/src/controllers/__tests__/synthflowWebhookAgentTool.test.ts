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
  claim: jest.fn(),
  extract: jest.fn(),
  claimEffect: jest.fn(),
  review: jest.fn(),
  release: jest.fn(),
  done: jest.fn(),
  contact: jest.fn(),
};

jest.mock('../../config/env', () => ({ env: { synthflowWebhookToken: 't' } }));
jest.mock('../../services/voice/synthflowWebhookAuth', () => ({ ...jest.requireActual('../../services/voice/synthflowWebhookAuth'), webhookTokenOk: () => true }));
jest.mock('../../models', () => ({
  CommunicationLog: { findOne: (...a: unknown[]) => m.findOne(...a), findByPk: jest.fn().mockResolvedValue(null) },
  CampaignSimulationStep: { findOne: jest.fn() },
  Lead: { findByPk: jest.fn().mockResolvedValue({ id: 42, name: 'Pat Doe' }) },
  InteractionOutcome: { create: jest.fn() },
  CallContactLog: { update: (...a: unknown[]) => m.contact(...a) },
  Activity: { findOne: jest.fn().mockResolvedValue(null) },
}));
jest.mock('../../services/scheduling/cancelScheduledMessage', () => ({ cancelScheduledMessagesWhere: jest.fn() }));
jest.mock('../../services/callTranscriptProcessor', () => ({ processCallTranscript: (...a: unknown[]) => m.extract(...a) }));
jest.mock('../../services/voice/postcall/effectClaims', () => ({
  claimEffect: (...a: unknown[]) => m.claimEffect(...a), markEffectDone: (...a: unknown[]) => m.done(...a),
  markTranscriptReview: (...a: unknown[]) => m.review(...a), releaseEffect: (...a: unknown[]) => m.release(...a),
  clearTranscriptReview: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/ghlService', () => ({ sendSmsViaGhl: (...a: unknown[]) => m.sms(...a), syncLeadToGhl: jest.fn(), findContactByEmail: jest.fn() }));
jest.mock('../../services/activityService', () => ({ logActivity: (...a: unknown[]) => m.activity(...a) }));
jest.mock('../../services/delivery/flotationCallCompletion', () => ({ completeFlotationCall: jest.fn(), isIntakeCallSource: () => false }));
jest.mock('../../services/openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../../services/settingsService', () => ({ getTestOverrides: (...a: unknown[]) => m.testOverrides(...a) }));
jest.mock('../../utils/piiRedaction', () => ({ redactForLogs: (s: string) => s }));
jest.mock('../../services/ghlMirrorService', () => ({ mirrorToGhlInBackground: jest.fn(), resolveGhlContactId: jest.fn().mockResolvedValue(null) }));
jest.mock('../../services/agents/tools/agentCallCompletion', () => ({ completeAgentToolCallFromWebhook: (...a: unknown[]) => m.complete(...a) }));
// VS3.2: the real payload normalizer, a faked DB claim (its SQL is proven in completion.integration).
jest.mock('../../services/voice/postcall/completion', () => ({
  ...jest.requireActual('../../services/voice/postcall/completion'),
  claimCompletion: (...a: unknown[]) => m.claim(...a),
}));

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
  m.claim.mockResolvedValue({ firstDelivery: true });
  m.extract.mockResolvedValue(undefined);
  m.claimEffect.mockResolvedValue(true);
  for (const fn of [m.review, m.release, m.done]) fn.mockResolvedValue(undefined);
  m.contact.mockResolvedValue([0]);
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

it('VS3.2 replay: a redelivered completion sends no second text and writes no second timeline entry', async () => {
  m.findOne.mockResolvedValue(row({ source: 'interest' }));
  m.claim.mockResolvedValue({ firstDelivery: false });
  const r = res();
  await handleSynthflowCallComplete(req(), r as never);
  await flush();
  expect(m.claim).toHaveBeenCalledWith('log-9', expect.objectContaining({ providerCallId: 'call-9', status: 'completed', completed: true }));
  expect(m.activity).not.toHaveBeenCalled();
  expect(m.testOverrides).not.toHaveBeenCalled(); // post-call SMS path never starts
  expect(m.sms).not.toHaveBeenCalled();
  expect(r.json).toHaveBeenCalledWith({ ok: true, matched: true });
});

it('VS3.2 replay: idempotent branches still run, so a retry after a mid-way failure can finish them', async () => {
  m.findOne.mockResolvedValue(row({ source: 'agent-tool', agent_name: 'Reese' }));
  m.claim.mockResolvedValue({ firstDelivery: false });
  await handleSynthflowCallComplete(req(), res() as never);
  await flush();
  expect(m.complete).toHaveBeenCalledTimes(1);
  expect(m.activity).not.toHaveBeenCalled();
});

it('VS3.2: the old unconditional row update is gone (the claim is the only write of the completion)', async () => {
  m.findOne.mockResolvedValue(row({ source: 'interest' }));
  await handleSynthflowCallComplete(req(), res() as never);
  await flush();
  expect(m.update).not.toHaveBeenCalled();
  expect(m.claim).toHaveBeenCalledTimes(1);
});

it('VS3.2 failed extraction: the transcript is marked pending review and the claim released for a retry', async () => {
  m.findOne.mockResolvedValue(row({ source: 'interest' }));
  m.extract.mockRejectedValue(new Error('openai 503'));
  await handleSynthflowCallComplete(req(), res() as never);
  await flush(); await flush();
  expect(m.claimEffect).toHaveBeenCalledWith('log-9', 'extraction');
  expect(m.review).toHaveBeenCalledWith('log-9', 'extraction_failed');
  expect(m.release).toHaveBeenCalledWith('log-9', 'extraction');
  expect(m.done).not.toHaveBeenCalled();
});

it('VS3.2 a replay retries a released extraction once, and never re-runs a done one', async () => {
  m.findOne.mockResolvedValue(row({ source: 'interest' }));
  m.claim.mockResolvedValue({ firstDelivery: false });
  m.claimEffect.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await handleSynthflowCallComplete(req(), res() as never);
  await flush();
  expect(m.extract).toHaveBeenCalledTimes(1);
  expect(m.done).toHaveBeenCalledWith('log-9', 'extraction');
  await handleSynthflowCallComplete(req(), res() as never);
  await flush();
  expect(m.extract).toHaveBeenCalledTimes(1);
  expect(m.activity).not.toHaveBeenCalled();
});

it('VS3.2 a claim failure (DB down) skips extraction without failing the webhook', async () => {
  m.findOne.mockResolvedValue(row({ source: 'interest' }));
  m.claimEffect.mockRejectedValue(Object.assign(new Error('db'), { name: 'ConnectionError' }));
  const r = res();
  await handleSynthflowCallComplete(req(), r as never);
  await flush();
  expect(m.extract).not.toHaveBeenCalled();
  expect(r.json).toHaveBeenCalledWith({ ok: true, matched: true });
});

it('VS4.2 an unmatched delivery changes nothing, including the contact log', async () => {
  m.findOne.mockResolvedValue(null);
  const r = res();
  await handleSynthflowCallComplete(req(), r as never);
  await flush();
  expect(r.json).toHaveBeenCalledWith({ ok: true, matched: false });
  expect(m.contact).not.toHaveBeenCalled();
  expect(m.claim).not.toHaveBeenCalled();
});

it('VS4.2 a matched delivery still backfills the contact log', async () => {
  m.findOne.mockResolvedValue(row({ source: 'interest' }));
  await handleSynthflowCallComplete(req(), res() as never);
  expect(m.contact).toHaveBeenCalledTimes(1);
});

it('VS4.2 no word of the conversation and no forged line reaches the logs', async () => {
  m.findOne.mockResolvedValue(row({ source: 'agent-tool', agent_name: 'Reese' }));
  const b = { query: { token: 't' }, body: { call: { call_id: 'call-9', status: 'completed\nforged line', duration: 65, transcript: TRANSCRIPT, end_call_reason: 'x\nforged line' }, 'evil\nkey': 1 } } as never;
  await handleSynthflowCallComplete(b, res() as never);
  await flush();
  const out = [...(console.log as jest.Mock).mock.calls, ...(console.warn as jest.Mock).mock.calls].flat().map(String);
  expect(out.join(' ')).not.toContain('How long is a pilot');
  expect(out.some((l) => /\nforged line|evil\nkey/.test(l))).toBe(false);
});

it.each([[['a', 'b']], [{ $ne: null }], [null]])('VS4.2 a call id that is not plain text (%j) is not looked up', async (id) => {
  const r = res();
  await handleSynthflowCallComplete({ query: { token: 't' }, body: { call: { call_id: id, status: 'completed' } } } as never, r as never);
  expect(m.findOne).not.toHaveBeenCalled();
  expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ matched: false, reason: 'no_call_id' }));
});
