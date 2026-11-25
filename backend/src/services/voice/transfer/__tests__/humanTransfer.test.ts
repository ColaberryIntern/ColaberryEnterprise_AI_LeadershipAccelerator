import express from 'express';
import request from 'supertest';
import {
  FALLBACK_TWIML, END_TWIML, TRANSFER_REASON, decideConnectAction, decideDialAction, dialTwiml, isTransferHandoff, withinTransferHours,
} from '../humanTransfer';
import { makeTransferHandlers, type TransferDeps } from '../../../../controllers/voiceTransferController';
import { correlationKey, mintToken } from '../../twilio/correlationToken';
import { buildRelayTwiml } from '../../engines/relayProtocol';

const HANDOFF = JSON.stringify({ reason: TRANSFER_REASON });
const TUE_10_CT = new Date('2026-12-01T16:00:00Z');   // CST (UTC-6)
const TUE_1659_CT = new Date('2026-12-01T22:59:00Z');
const TUE_17_CT = new Date('2026-12-01T23:00:00Z');
const SAT_10_CT = new Date('2026-12-05T16:00:00Z');
const JUL_9_CDT = new Date('2026-07-07T14:00:00Z');   // CDT (UTC-5): 9:00 local
const JUL_8_CDT = new Date('2026-07-07T13:59:00Z');

describe('transfer hours and decisions (pure)', () => {
  it('Mon-Fri 9:00-17:00 Central, DST-aware', () => {
    expect(withinTransferHours(TUE_10_CT)).toBe(true);
    expect(withinTransferHours(TUE_1659_CT)).toBe(true);
    expect(withinTransferHours(TUE_17_CT)).toBe(false);
    expect(withinTransferHours(SAT_10_CT)).toBe(false);
    expect(withinTransferHours(JUL_9_CDT)).toBe(true);
    expect(withinTransferHours(JUL_8_CDT)).toBe(false);
  });
  it('only our exact handoff is a transfer', () => {
    expect(isTransferHandoff(HANDOFF)).toBe(true);
    for (const v of [undefined, '', 'transfer_to_human', '{"reason":"other"}', '{bad', 42, 'x'.repeat(3000)]) expect(isTransferHandoff(v)).toBe(false);
  });
  it('connect decision: dial only with a number AND inside hours; otherwise fallback; no handoff = end', () => {
    expect(decideConnectAction(HANDOFF, '+15555550199', TUE_10_CT)).toBe('dial');
    expect(decideConnectAction(HANDOFF, undefined, TUE_10_CT)).toBe('fallback');
    expect(decideConnectAction(HANDOFF, '+15555550199', SAT_10_CT)).toBe('fallback');
    expect(decideConnectAction(undefined, '+15555550199', TUE_10_CT)).toBe('end');
  });
  it('dial decision: answered ends the call; every failure gets the fallback', () => {
    expect(decideDialAction('completed')).toBe('end');
    expect(decideDialAction('answered')).toBe('end');
    for (const s of ['busy', 'no-answer', 'failed', 'canceled', undefined, 'weird']) expect(decideDialAction(s)).toBe('fallback');
  });
  it('dial TwiML refuses a non-E.164 target or a non-https action, and escapes the action', () => {
    expect(() => dialTwiml('5555550199', 'https://x/a')).toThrow();
    expect(() => dialTwiml('+15555550199', 'http://x/a')).toThrow();
    expect(dialTwiml('+15555550199', 'https://x/a?ref=a&b=1')).toContain('action="https://x/a?ref=a&amp;b=1"');
  });
  it('relay TwiML carries the signed Connect action only when given, https only', () => {
    const base = { wsUrl: 'wss://x/api/voice-ws/relay', sessionRef: 'r', welcomeGreeting: "Hi, I'm an AI." };
    expect(buildRelayTwiml(base)).toContain('<Connect><ConversationRelay');
    expect(buildRelayTwiml({ ...base, actionUrl: 'https://x/c?ref=t' })).toContain('<Connect action="https://x/c?ref=t" method="POST">');
    expect(() => buildRelayTwiml({ ...base, actionUrl: 'http://x/c' })).toThrow();
  });
});

describe('transfer webhooks (handlers, after the shared Twilio checks)', () => {
  const CALL = '2d3e4f50-6172-4839-9aab-ccddeeff0011';
  const ref = () => mintToken(CALL, 'status', 3600, TUE_10_CT.getTime(), correlationKey());
  function app(over: Partial<TransferDeps> = {}) {
    const d: TransferDeps = {
      target: () => '+15555550199', publicBaseUrl: () => 'https://enterprise.example', now: () => TUE_10_CT.getTime(),
      recordFallback: jest.fn().mockResolvedValue(undefined), closeInbound: jest.fn().mockResolvedValue(undefined), log: jest.fn(), ...over,
    };
    const h = makeTransferHandlers(d);
    const a = express();
    a.use(express.urlencoded({ extended: false }));
    a.post('/c', h.connectAction);
    a.post('/d', h.dialAction);
    return { a, d };
  }

  it('transfer asked and a teammate is free: Dial with a signed dial-action URL; the number is not logged', async () => {
    const { a, d } = app();
    const r = await request(a).post(`/c?ref=${encodeURIComponent(ref())}`).type('form').send({ HandoffData: HANDOFF });
    expect(r.status).toBe(200);
    expect(r.text).toContain('<Dial timeout="20" action="https://enterprise.example/api/webhook/voice/twilio/dial-action?ref=');
    expect(r.text).toContain('>+15555550199</Dial>');
    expect(JSON.stringify((d.log as jest.Mock).mock.calls)).not.toContain('5555550199');
    expect(d.recordFallback).not.toHaveBeenCalled();
  });

  it('unavailable agent: fallback TwiML and the call is marked for a callback', async () => {
    const { a, d } = app({ target: () => undefined });
    const r = await request(a).post(`/c?ref=${encodeURIComponent(ref())}`).type('form').send({ HandoffData: HANDOFF });
    expect(r.text).toBe(FALLBACK_TWIML);
    expect(d.recordFallback).toHaveBeenCalledWith(CALL);
  });

  it.each(['busy', 'no-answer', 'failed', 'canceled'])('transfer failure (%s): fallback, recorded', async (status) => {
    const { a, d } = app();
    const r = await request(a).post(`/d?ref=${encodeURIComponent(ref())}`).type('form').send({ DialCallStatus: status });
    expect(r.text).toBe(FALLBACK_TWIML);
    expect(d.recordFallback).toHaveBeenCalledWith(CALL);
  });

  it('answered dial: hang up after the conversation, no fallback', async () => {
    const { a, d } = app();
    const r = await request(a).post(`/d?ref=${encodeURIComponent(ref())}`).type('form').send({ DialCallStatus: 'completed' });
    expect(r.text).toBe(END_TWIML);
    expect(d.recordFallback).not.toHaveBeenCalled();
  });

  it('a failure to record the fallback still gives the caller the fallback (never an error)', async () => {
    const { a } = app({ recordFallback: jest.fn().mockRejectedValue(Object.assign(new Error('db'), { name: 'ConnectionError' })) });
    const r = await request(a).post(`/d?ref=${encodeURIComponent(ref())}`).type('form').send({ DialCallStatus: 'busy' });
    expect(r.status).toBe(200);
    expect(r.text).toBe(FALLBACK_TWIML);
  });

  it('bad or missing ref, or no transfer requested: hang up with 200 (never a 4xx spoken to the caller)', async () => {
    const { a, d } = app();
    for (const path of ['/c?ref=bad', '/c', '/d?ref=bad']) {
      const r = await request(a).post(path).type('form').send({ HandoffData: HANDOFF, DialCallStatus: 'busy' });
      expect(r.status).toBe(200);
      expect(r.text).toBe(END_TWIML);
    }
    const plain = await request(a).post(`/c?ref=${encodeURIComponent(ref())}`).type('form').send({});
    expect(plain.text).toBe(END_TWIML);
    expect(d.recordFallback).not.toHaveBeenCalled();
  });
});
