import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { buildVoiceWebhookRouter, VOICE_ROUTE_TABLE } from '../../../../routes/voiceWebhookRoutes';
import { HANGUP_TWIML, INBOUND_FALLBACK_TWIML, type VoiceWebhookDeps } from '../../../../controllers/voiceTwilioWebhookController';
import { loadVoiceConfig } from '../../voiceConfig';
import { computeTwilioSignature } from '../twilioSignature';
import { mintToken, type TokenClaims } from '../correlationToken';
import { reduceCallEvents } from '../../contracts/callStateReducer';
import type { CanonicalCallEvent } from '../../contracts/schemas';

const BASE = 'https://enterprise.colaberry.ai';
const TOKEN = 'auth-token-for-tests-0123456789';
const ACCOUNT = 'AC' + 'c3'.repeat(16);
const CALL = '0b1c2d3e-4f50-4617-8899-aabbccddeeff';
const SID = 'CA' + 'd4'.repeat(16);
const PHONES = /5555550100|5555550199|5555550177/;
const OURS = '+15555550199'; // the Twilio number we own in these tests (From outbound, To inbound)

function harness(over: Partial<VoiceWebhookDeps> = {}, env: Record<string, string> = { VOICE_TEST_ENABLED: 'true', VOICE_TEST_ALLOWED_NUMBER: '+15555550100', VOICE_PUBLIC_BASE_URL: BASE }) {
  const stored: CanonicalCallEvent[] = [];
  const keys = new Set<string>();
  const nonces = new Set<string>();
  const logs: Record<string, unknown>[] = [];
  const deps: VoiceWebhookDeps = {
    config: () => loadVoiceConfig(env),
    authToken: () => TOKEN,
    accountSid: () => ACCOUNT,
    appendCallEvents: async (events) => {
      let inserted = 0; let duplicates = 0;
      for (const e of events) { if (keys.has(e.eventKey)) duplicates++; else { keys.add(e.eventKey); stored.push(e); inserted++; } }
      return { inserted, duplicates, unknownCall: false };
    },
    consumeToken: async (c: TokenClaims) => { if (nonces.has(c.nonce)) return 'replay'; nonces.add(c.nonce); return 'consumed'; },
    recomputeCall: async () => null,
    ownsNumber: async (n: string) => n === OURS,
    connectTwiml: async () => '<Response><Connect/></Response>',
    now: () => Date.now(),
    log: (l) => logs.push(l),
    ...over,
  };
  const app = express();
  app.use(buildVoiceWebhookRouter(deps));
  app.use((_req, res) => res.status(404).json({ error: 'fell through' }));
  return { app, stored, logs };
}

function signed(app: express.Express, path: string, params: Record<string, string>, opts: { token?: string } = {}) {
  const sig = computeTwilioSignature(opts.token ?? TOKEN, BASE + path, params);
  return request(app).post(path).type('form').set('X-Twilio-Signature', sig).send(params);
}

const status = (CallStatus: string, SequenceNumber: string, extra: Record<string, string> = {}) => ({
  AccountSid: ACCOUNT, CallSid: SID, CallStatus, SequenceNumber, To: '+15555550100', From: '+15555550199', Caller: '+15555550199', ...extra,
});
const statusPath = () => `/api/webhook/voice/twilio/status?ref=${encodeURIComponent(mintToken(CALL, 'status', 3600))}`;

describe('voice webhook route table (VS2.1)', () => {
  it('every route on the router is declared, Twilio-signed, and takes no destination number', () => {
    const router = buildVoiceWebhookRouter({} as VoiceWebhookDeps); // building the router calls no dependency
    const mounted = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean> } }>)
      .filter((l) => l.route).map((l) => `${Object.keys(l.route!.methods)[0]} ${l.route!.path}`).sort();
    expect(mounted).toEqual(VOICE_ROUTE_TABLE.map((r) => `${r.method} ${r.path}`).sort());
    for (const r of VOICE_ROUTE_TABLE) {
      expect(r.auth).toBe('twilio_signature');
      expect(r.path).toMatch(/^\/api\/webhook\/voice\//);
    }
  });

  it('static: no handler reads a number field except ownedNumberOf (the ownership check)', () => {
    const file = path.resolve(__dirname, '../../../../controllers/voiceTwilioWebhookController.ts');
    const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const start = src.indexOf('export function ownedNumberOf');
    const end = src.indexOf('\n}\n', start);
    expect(start).toBeGreaterThan(-1);
    const outside = src.slice(0, start) + src.slice(end);
    // Schema declarations name the fields; any READ (body.To, params['From'], query.phone, ...) is a violation.
    const reads = outside.match(/\.(To|From|Caller|Called|phone|destination\w*)\b|\[\s*['"`](To|From|Caller|Called|phone|destination\w*)['"`]\s*\]/g) || [];
    expect(reads).toEqual([]);
    expect(fs.readFileSync(path.resolve(__dirname, '../../../../routes/voiceWebhookRoutes.ts'), 'utf8')).not.toMatch(/req\.(body|query|params)/);
  });

  it('behavioral: a different destination (To) on an outbound callback changes nothing that is stored', async () => {
    const a = harness();
    const b = harness();
    await signed(a.app, statusPath(), status('completed', '3', { Timestamp: 'Mon, 24 Nov 2026 20:00:05 +0000' }));
    await signed(b.app, statusPath(), status('completed', '3', { Timestamp: 'Mon, 24 Nov 2026 20:00:05 +0000', To: '+15555550177', destination: '+15555550177' }));
    expect(b.stored).toEqual(a.stored);
    expect(JSON.stringify(b.stored)).not.toMatch(PHONES);
  });

  it.each(VOICE_ROUTE_TABLE.map((r) => [r.path]))('%s does not exist while every voice flag is off', async (path) => {
    const { app } = harness({}, {});
    const res = await signed(app, path, status('ringing', '1'));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'fell through' });
  });

  it.each(VOICE_ROUTE_TABLE.map((r) => [r.path]))('%s refuses an unsigned request with 403 and logs the error class', async (path) => {
    const { app, logs } = harness();
    const res = await request(app).post(path).type('form').send(status('ringing', '1'));
    expect(res.status).toBe(403);
    expect(logs).toContainEqual(expect.objectContaining({ error_class: 'TwilioSignatureInvalid' }));
  });
});

describe('voice webhooks: signature, account, token (VS2.1)', () => {
  it('a signature made with the wrong token is refused', async () => {
    const { app, logs } = harness();
    expect((await signed(app, statusPath(), status('ringing', '1'), { token: 'wrong-token-0123456789' })).status).toBe(403);
    expect(logs[0]).toMatchObject({ error_class: 'TwilioSignatureInvalid' });
  });

  it('a validly signed request for another Twilio account is refused', async () => {
    const { app, logs } = harness();
    expect((await signed(app, statusPath(), status('ringing', '1', { AccountSid: 'AC' + 'e5'.repeat(16) }))).status).toBe(403);
    expect(logs[0]).toMatchObject({ error_class: 'TwilioAccountMismatch' });
  });

  it('a correctly signed request whose number is not one we own is refused, and the number is not logged', async () => {
    const { app, logs, stored } = harness();
    const res = await signed(app, statusPath(), status('ringing', '1', { From: '+15555550177' }));
    expect(res.status).toBe(403);
    expect(logs).toContainEqual(expect.objectContaining({ error_class: 'TwilioNumberMismatch' }));
    expect(stored).toHaveLength(0);
    expect(JSON.stringify(logs)).not.toMatch(PHONES);
  });

  it('inbound checks To (our number), not From; an inbound-direction status checks To as well', async () => {
    const { app } = harness();
    const base = { AccountSid: ACCOUNT, CallSid: SID };
    expect((await signed(app, '/api/webhook/voice/twilio/inbound', { ...base, To: '+15555550177', From: OURS })).status).toBe(403);
    expect((await signed(app, '/api/webhook/voice/twilio/inbound', { ...base, To: OURS, From: '+15555550177' })).status).toBe(200);
    expect((await signed(app, statusPath(), status('ringing', '1', { Direction: 'inbound', To: OURS, From: '+15555550177' }))).status).toBe(204);
  });

  it('a body that fails the schema is a 400 ValidationError (malformed account id, missing owned number)', async () => {
    const { app, logs } = harness();
    expect((await signed(app, statusPath(), status('ringing', '1', { AccountSid: 'not-an-account' }))).status).toBe(400);
    const { From: _f, ...noFrom } = status('ringing', '1');
    expect((await signed(app, statusPath(), noFrom)).status).toBe(400);
    expect(logs.every((l) => l.error_class === 'ValidationError')).toBe(true);
  });

  it('a failed ownership lookup answers 503 (Twilio retries), never lets the request through', async () => {
    const { app, stored, logs } = harness({ ownsNumber: async () => { throw Object.assign(new Error('db'), { name: 'SequelizeConnectionError' }); } });
    expect((await signed(app, statusPath(), status('ringing', '1'))).status).toBe(503);
    expect(stored).toHaveLength(0);
    expect(logs).toContainEqual(expect.objectContaining({ error_class: 'SequelizeConnectionError' }));
  });

  it('fails closed with no auth token or no public URL configured', async () => {
    const a = harness({ authToken: () => undefined });
    expect((await signed(a.app, statusPath(), status('ringing', '1'))).status).toBe(403);
    expect(a.logs[0]).toMatchObject({ error_class: 'ConfigMissing' });
    const b = harness({}, { VOICE_TEST_ENABLED: 'true', VOICE_TEST_ALLOWED_NUMBER: '+15555550100' });
    expect((await signed(b.app, statusPath(), status('ringing', '1'))).status).toBe(403);
  });

  it('a missing or forged correlation ref is refused even when Twilio-signed', async () => {
    const { app, logs } = harness();
    expect((await signed(app, '/api/webhook/voice/twilio/status', status('ringing', '1'))).status).toBe(403);
    expect((await signed(app, `/api/webhook/voice/twilio/status?ref=${encodeURIComponent(mintToken(CALL, 'twiml', 60))}`, status('ringing', '1'))).status).toBe(403);
    expect(logs.every((l) => l.error_class === 'CorrelationTokenInvalid')).toBe(true);
  });
});

describe('voice webhooks: status ingestion (VS2.1)', () => {
  it('duplicate and out-of-order status callbacks yield the same final state', async () => {
    const ordered = harness();
    for (const [s, n] of [['initiated', '0'], ['ringing', '1'], ['in-progress', '2'], ['completed', '3']]) {
      expect((await signed(ordered.app, statusPath(), status(s, n, { AnsweredBy: 'human' }))).status).toBe(204);
    }
    const shuffled = harness();
    for (const [s, n] of [['completed', '3'], ['ringing', '1'], ['completed', '3'], ['initiated', '0'], ['in-progress', '2'], ['ringing', '1']]) {
      expect((await signed(shuffled.app, statusPath(), status(s, n, { AnsweredBy: 'human' }))).status).toBe(204);
    }
    expect(shuffled.stored).toHaveLength(4); // the two redeliveries were deduplicated
    expect(reduceCallEvents(CALL, shuffled.stored).state).toBe(reduceCallEvents(CALL, ordered.stored).state);
    expect(reduceCallEvents(CALL, shuffled.stored).state).toBe('completed');
  });

  it('nothing persisted carries a phone number (To/From/Caller are validation-only)', async () => {
    const { app, stored, logs } = harness();
    await signed(app, statusPath(), status('completed', '3', { AnsweredBy: 'human' }));
    expect(JSON.stringify(stored)).not.toMatch(PHONES);
    expect(JSON.stringify(logs)).not.toMatch(PHONES);
  });

  it('an unrecognized status is logged and acknowledged (204), not a 500 retry loop', async () => {
    const { app, stored, logs } = harness();
    expect((await signed(app, statusPath(), status('exploded', '1'))).status).toBe(204);
    expect(stored).toHaveLength(0);
    expect(logs).toContainEqual(expect.objectContaining({ error_class: 'UnrecognizedStatus' }));
  });

  it('a database failure answers 500 so Twilio redelivers (writes are idempotent)', async () => {
    const { app, logs } = harness({ appendCallEvents: async () => { throw Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }); } });
    expect((await signed(app, statusPath(), status('ringing', '1'))).status).toBe(500);
    expect(logs).toContainEqual(expect.objectContaining({ error_class: 'SequelizeConnectionError' }));
  });
});

describe('voice webhooks: answer TwiML and inbound (VS2.1)', () => {
  it('serves the engine TwiML once; a replay of the same signed request hangs up', async () => {
    const { app, logs } = harness();
    const path = `/api/webhook/voice/twilio/twiml?ref=${encodeURIComponent(mintToken(CALL, 'twiml', 300))}`;
    const params = { AccountSid: ACCOUNT, CallSid: SID, CallStatus: 'in-progress', To: '+15555550100', From: OURS };
    const first = await signed(app, path, params);
    expect(first.status).toBe(200);
    expect(first.text).toBe('<Response><Connect/></Response>');
    const replay = await signed(app, path, params);
    expect(replay.text).toBe(HANGUP_TWIML);
    expect(logs).toContainEqual(expect.objectContaining({ error_class: 'ReplayRejected' }));
  });

  it('an expired answer ref is refused', async () => {
    const { app } = harness();
    const path = `/api/webhook/voice/twilio/twiml?ref=${encodeURIComponent(mintToken(CALL, 'twiml', 60, Date.now() - 120_000))}`;
    expect((await signed(app, path, { AccountSid: ACCOUNT, CallSid: SID, From: OURS })).status).toBe(403);
  });

  it('a broken engine still ends the call cleanly (never leaves the caller waiting)', async () => {
    const { app } = harness({ connectTwiml: async () => { throw new Error('engine down'); } });
    const path = `/api/webhook/voice/twilio/twiml?ref=${encodeURIComponent(mintToken(CALL, 'twiml', 300))}`;
    expect((await signed(app, path, { AccountSid: ACCOUNT, CallSid: SID, From: OURS })).text).toBe(HANGUP_TWIML);
  });

  it('inbound gets the safe fallback until VS3.6 routing exists', async () => {
    const { app } = harness();
    const res = await signed(app, '/api/webhook/voice/twilio/inbound', { AccountSid: ACCOUNT, CallSid: SID, To: OURS, From: '+15555550100' });
    expect(res.status).toBe(200);
    expect(res.text).toBe(INBOUND_FALLBACK_TWIML);
  });
});
