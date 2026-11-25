import { decodeMulaw, encodeMulaw, linearToMulaw, mulawBase64DurationMs, mulawSilenceBase64, mulawToLinear } from '../mulaw';
import { buildStreamTwiml, clearOut, markOut, mediaOut, parseStreamMessage } from '../streamProtocol';
import { parseRealtimeEvent, sessionUpdate, truncateItem } from '../realtimeProtocol';
import { decideUpgrade, signHandshake, STREAM_PATH } from '../../voiceWsServer';

describe('mu-law codec (VS2.4)', () => {
  it('round-trips a 1 kHz tone within G.711 quantization error', () => {
    const pcm = Int16Array.from({ length: 800 }, (_, i) => Math.round(12000 * Math.sin((2 * Math.PI * 1000 * i) / 8000)));
    const back = decodeMulaw(encodeMulaw(pcm));
    for (let i = 0; i < pcm.length; i++) expect(Math.abs(back[i] - pcm[i])).toBeLessThanOrEqual(Math.max(16, Math.abs(pcm[i]) * 0.07));
  });

  it('decoding is stable: every byte decodes and re-encodes to itself (except the two zero codes)', () => {
    for (let b = 0; b < 256; b++) {
      const again = linearToMulaw(mulawToLinear(b));
      if (b !== 0x7f && b !== 0xff) expect(again).toBe(b);
    }
  });

  it('silence is 0xFF and duration is 8 bytes per ms', () => {
    expect(decodeMulaw(Buffer.from([0xff]))[0]).toBe(0);
    expect(mulawBase64DurationMs(mulawSilenceBase64(20))).toBe(20);
    expect(mulawBase64DurationMs(Buffer.alloc(161).toString('base64'))).toBeCloseTo(20.125);
    expect(mulawBase64DurationMs('')).toBe(0);
  });
});

describe('Media Streams protocol (VS2.4)', () => {
  it('builds raw media, mark and clear frames exactly as documented', () => {
    expect(JSON.parse(mediaOut('MZ1', 'AAAA'))).toEqual({ event: 'media', streamSid: 'MZ1', media: { payload: 'AAAA' } });
    expect(JSON.parse(markOut('MZ1', 'item|20'))).toEqual({ event: 'mark', streamSid: 'MZ1', mark: { name: 'item|20' } });
    expect(JSON.parse(clearOut('MZ1'))).toEqual({ event: 'clear', streamSid: 'MZ1' });
  });

  it('TwiML: bidirectional Connect/Stream, ref as a Parameter, no query string allowed', () => {
    const t = buildStreamTwiml('wss://enterprise.colaberry.ai/api/voice-ws/stream', 'r.s');
    expect(t).toContain('<Connect><Stream url="wss://enterprise.colaberry.ai/api/voice-ws/stream">');
    expect(t).toContain('<Parameter name="ref" value="r.s"/>');
    expect(() => buildStreamTwiml('wss://x/y?ref=1', 'r')).toThrow(/query/);
    expect(() => buildStreamTwiml('https://x/y', 'r')).toThrow(/wss/);
  });

  it.each([
    ['not JSON', '{', 'MalformedJson'],
    ['an unknown event', JSON.stringify({ event: 'boom' }), 'ContractViolation'],
    ['a start with a bad CallSid', JSON.stringify({ event: 'start', streamSid: 'MZ', start: { streamSid: 'MZ', callSid: 'x', accountSid: 'AC' + '1'.repeat(32), mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 } } }), 'ContractViolation'],
  ])('rejects %s', (_n, raw, cls) => expect(parseStreamMessage(raw)).toEqual({ ok: false, errorClass: cls }));
});

describe('Realtime protocol (VS2.4)', () => {
  it('truncation is floored to whole ms and never negative', () => {
    expect(JSON.parse(truncateItem('i', 40.9))).toEqual({ type: 'conversation.item.truncate', item_id: 'i', content_index: 0, audio_end_ms: 40 });
    expect(JSON.parse(truncateItem('i', -5)).audio_end_ms).toBe(0);
  });

  it('unhandled server events are ignored, not errors; malformed handled events are rejected', () => {
    expect(parseRealtimeEvent(JSON.stringify({ type: 'rate_limits.updated' }))).toEqual({ ok: true, ev: null });
    expect(parseRealtimeEvent('nope')).toEqual({ ok: false, errorClass: 'MalformedJson' });
    expect(parseRealtimeEvent(JSON.stringify({ type: 'response.done' }))).toEqual({ ok: false, errorClass: 'ContractViolation' });
  });

  it('a configured voice is set; unset leaves the API default', () => {
    expect(JSON.parse(sessionUpdate({ instructions: 'x', tools: [] })).session.audio.output.voice).toBeUndefined();
    expect(JSON.parse(sessionUpdate({ instructions: 'x', voice: 'marin', tools: [] })).session.audio.output.voice).toBe('marin');
  });
});

describe('Media Streams handshake (VS2.4)', () => {
  const TOKEN = 'auth-token-for-tests-0123456789';
  const ON = { VOICE_TEST_ENABLED: 'true', VOICE_TEST_ALLOWED_NUMBER: '+15555550100', VOICE_WS_BASE_URL: 'wss://enterprise.colaberry.ai', TWILIO_AUTH_TOKEN: TOKEN };
  const req = (sig: string) => ({ url: STREAM_PATH, headers: { 'x-twilio-signature': sig } });
  it('accepts a signature over our URL with or without the trailing slash (Twilio\'s Media Streams advice)', () => {
    expect(decideUpgrade(req(signHandshake(TOKEN, `wss://enterprise.colaberry.ai${STREAM_PATH}`)), ON)).toEqual({ accept: true });
    expect(decideUpgrade(req(signHandshake(TOKEN, `wss://enterprise.colaberry.ai${STREAM_PATH}/`)), ON)).toEqual({ accept: true });
    expect(decideUpgrade(req(signHandshake(TOKEN, `wss://other.example${STREAM_PATH}/`)), ON)).toMatchObject({ status: 403 });
  });
});
