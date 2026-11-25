import Anthropic from '@anthropic-ai/sdk';
import { buildRelayTwiml, endSession, parseRelayMessage, textToken, MAX_INBOUND_BYTES } from '../../relayProtocol';
import { decideUpgrade, signHandshake, RELAY_PATH } from '../../voiceWsServer';
import { classifyLlmError } from '../../claudeVoiceLlm';
import { formatSlotsForSpeech } from '../../toolBroker';
import { persistToolRun } from '../../voiceRuntime';
import { TEST_PROFILE } from '../../voiceProfiles';

const TOKEN = 'auth-token-for-tests-0123456789';
const ON = { VOICE_TEST_ENABLED: 'true', VOICE_TEST_ALLOWED_NUMBER: '+15555550100', VOICE_WS_BASE_URL: 'wss://enterprise.colaberry.ai', TWILIO_AUTH_TOKEN: TOKEN };

describe('ConversationRelay TwiML (VS2.3)', () => {
  const twiml = buildRelayTwiml({ wsUrl: 'wss://enterprise.colaberry.ai/api/voice-ws/relay', sessionRef: 'ref.sig', welcomeGreeting: TEST_PROFILE.greeting });

  it('connects to our wss URL with the disclosure greeting, ElevenLabs TTS, interruptible, DTMF on', () => {
    expect(twiml).toContain('<Connect><ConversationRelay url="wss://enterprise.colaberry.ai/api/voice-ws/relay"');
    expect(twiml).toContain('ttsProvider="ElevenLabs"');
    expect(twiml).toContain('interruptible="any"');
    expect(twiml).toContain('dtmfDetection="true"');
    expect(twiml).toContain("I&apos;m an AI".replace('&apos;', "'"));
  });

  it('the session ref rides in a <Parameter>, never in the URL', () => {
    expect(twiml).toContain('<Parameter name="ref" value="ref.sig"/>');
    expect(twiml).not.toMatch(/url="[^"]*ref/);
  });

  it('escapes attribute values and refuses a non-wss URL', () => {
    expect(buildRelayTwiml({ wsUrl: 'wss://x/y', sessionRef: 'a"b<c>&d', welcomeGreeting: 'Hi "you"' })).toContain('value="a&quot;b&lt;c&gt;&amp;d"');
    expect(() => buildRelayTwiml({ wsUrl: 'https://x/y', sessionRef: 'r', welcomeGreeting: 'g' })).toThrow(/wss/);
  });

  it('a configured voice is passed through; unset uses Twilio\'s documented default', () => {
    expect(twiml).not.toContain('voice=');
    expect(buildRelayTwiml({ wsUrl: 'wss://x/y', sessionRef: 'r', welcomeGreeting: 'g', voice: 'UgBBYS2sOqTuMpoF3BR0' })).toContain('voice="UgBBYS2sOqTuMpoF3BR0"');
  });
});

describe('ConversationRelay messages (VS2.3)', () => {
  it('parses each documented inbound type', () => {
    for (const m of [
      { type: 'setup', sessionId: 's', callSid: 'CA' + '1'.repeat(32), accountSid: 'AC' + '2'.repeat(32), customParameters: { ref: 'x' } },
      { type: 'prompt', voicePrompt: 'hi', lang: 'en-US', last: true },
      { type: 'interrupt', utteranceUntilInterrupt: 'Our next', durationUntilInterruptMs: 640 },
      { type: 'dtmf', digit: '5' }, { type: 'error', description: 'x' }, { type: 'info', name: 'configUpdated', value: 'x' },
    ]) expect(parseRelayMessage(JSON.stringify(m)).ok).toBe(true);
  });

  it.each([
    ['not JSON', '{', 'MalformedJson'],
    ['an unknown type', JSON.stringify({ type: 'hack' }), 'ContractViolation'],
    ['a bad CallSid', JSON.stringify({ type: 'setup', sessionId: 's', callSid: 'x', accountSid: 'AC' + '2'.repeat(32) }), 'ContractViolation'],
    ['a bad DTMF digit', JSON.stringify({ type: 'dtmf', digit: 'Z' }), 'ContractViolation'],
    ['an oversized frame', JSON.stringify({ type: 'prompt', voicePrompt: 'x'.repeat(MAX_INBOUND_BYTES) }), 'FrameTooLarge'],
  ])('rejects %s', (_n, raw, cls) => expect(parseRelayMessage(raw)).toEqual({ ok: false, errorClass: cls }));

  it('builds outbound text and end frames', () => {
    expect(JSON.parse(textToken('Hi', false))).toEqual({ type: 'text', token: 'Hi', last: false });
    expect(JSON.parse(endSession())).toEqual({ type: 'end' });
  });
});

describe('WebSocket upgrade decision (VS2.3)', () => {
  const url = `${RELAY_PATH}`;
  const req = (sig?: string) => ({ url, headers: sig ? { 'x-twilio-signature': sig } : {} });

  it('does not exist while every voice flag is off', () => {
    expect(decideUpgrade(req(signHandshake(TOKEN, `wss://enterprise.colaberry.ai${url}`)), { TWILIO_AUTH_TOKEN: TOKEN })).toEqual({ accept: false, status: 404, errorClass: 'NotEnabled' });
  });

  it('fails closed without the auth token or the WS base URL', () => {
    expect(decideUpgrade(req('x'), { ...ON, TWILIO_AUTH_TOKEN: '' })).toMatchObject({ status: 403, errorClass: 'ConfigMissing' });
    const { VOICE_WS_BASE_URL: _w, ...noWs } = ON;
    expect(decideUpgrade(req('x'), noWs)).toMatchObject({ status: 403, errorClass: 'ConfigMissing' });
  });

  it('accepts a valid signature over our wss URL or its https form; refuses anything else', () => {
    expect(decideUpgrade(req(signHandshake(TOKEN, `wss://enterprise.colaberry.ai${url}`)), ON)).toEqual({ accept: true });
    expect(decideUpgrade(req(signHandshake(TOKEN, `https://enterprise.colaberry.ai${url}`)), ON)).toEqual({ accept: true });
    expect(decideUpgrade(req(signHandshake(TOKEN, `wss://evil.example${url}`)), ON)).toMatchObject({ status: 403, errorClass: 'TwilioSignatureInvalid' });
    expect(decideUpgrade(req(signHandshake('wrong-token-0123456789', `wss://enterprise.colaberry.ai${url}`)), ON)).toMatchObject({ status: 403 });
    expect(decideUpgrade(req(), ON)).toMatchObject({ status: 403 });
  });
});

describe('support pieces (VS2.3)', () => {
  it('LLM errors map to stable classes; an abort is never reported as a failure', () => {
    const live = new AbortController().signal;
    const gone = AbortSignal.abort();
    expect(classifyLlmError(new Error('x'), gone)).toEqual({ errorClass: 'Aborted', aborted: true });
    expect(classifyLlmError(new Anthropic.APIConnectionTimeoutError(), live).errorClass).toBe('TimeoutError');
    expect(classifyLlmError(new Anthropic.APIConnectionError({ message: 'x' }), live).errorClass).toBe('UpstreamUnavailable');
    expect(classifyLlmError(new Error('weird'), live).errorClass).toBe('LlmStreamError');
  });

  it('slots are offered as at most three Central-time options, never booked', () => {
    const slots = Array.from({ length: 6 }, (_, i) => ({ start: `2026-12-01T${14 + i}:00:00Z`, end: `2026-12-01T${14 + i}:30:00Z` }));
    const s = formatSlotsForSpeech([{ date: '2026-12-01', slots: [] }, { date: '2026-12-01', slots }], 'America/Chicago');
    expect(s.split(';')).toHaveLength(3);
    expect(s).toMatch(/do not book/);
    expect(s).toContain('8:00 AM');
  });

  it('tool runs persist idempotently with bounded retry; a permanent failure is logged, not thrown', async () => {
    let n = 0;
    const flaky = async () => { if (++n < 3) throw Object.assign(new Error('db'), { name: 'SequelizeConnectionError' }); };
    const rec = { toolCallId: 't1', name: 'next_open_strategy_slots', turnId: 1, committed: true, afterClose: true };
    await expect(persistToolRun('c1', rec, flaky, 3, 1)).resolves.toBe(true);
    expect(n).toBe(3);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(persistToolRun('c1', rec, async () => { throw Object.assign(new Error('db'), { name: 'SequelizeConnectionError' }); }, 2, 1)).resolves.toBe(false);
    expect(warn.mock.calls.map((c) => String(c[0])).join('')).toContain('voice_tool_record_lost');
    warn.mockRestore();
  });

  it('the insert is ON CONFLICT DO NOTHING keyed on the tool-call id (replay-safe)', async () => {
    let sql = '';
    await persistToolRun('c1', { toolCallId: 't1', name: 'x', turnId: 1, committed: false, afterClose: false }, async (s) => { sql = s; });
    expect(sql).toMatch(/ON CONFLICT \(call_id, idempotency_key\) DO NOTHING/);
  });
});
