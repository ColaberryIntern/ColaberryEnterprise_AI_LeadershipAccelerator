/**
 * VS4.1: one synthetic caller, speaking Twilio's wire protocol over a real (loopback) WebSocket with
 * a valid handshake signature. Returns what the caller experienced; never throws.
 */
import { randomBytes, randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import WebSocket from 'ws';
import { mulawSilenceBase64 } from '../engines/realtime/mulaw';
import { RELAY_PATH, signHandshake, STREAM_PATH } from '../engines/voiceWsServer';
import { correlationKey, mintToken } from '../twilio/correlationToken';
import { CHUNKS_PER_ANSWER, LOAD_ACCOUNT, LOAD_AUTH_TOKEN, LOAD_HOST, readStamp } from './loadServer';

export type LoadEngine = 'conversation_relay' | 'openai_realtime';

export interface CallScript {
  engine: LoadEngine;
  turns: number;
  /** Hang up abruptly: while setup is being checked, or in the middle of the first answer. */
  hangUp?: 'during_setup' | 'mid_answer';
  /** Random extra delay per outgoing message (network jitter), in order. */
  jitterMs?: number;
  timeoutMs?: number;
}

export interface CallResult {
  completed: boolean;
  turnsDone: number;
  closeCode: number | null;
  timedOut: boolean;
  /** Provider output to caller socket, ms. */
  overheadMs: number[];
  /** Engine A: caller turn to the first spoken token, ms (includes the mock model's thinking time). */
  turnMs: number[];
}

const FRAME = mulawSilenceBase64(20);

export function runCall(base: string, s: CallScript): Promise<CallResult> {
  const relay = s.engine === 'conversation_relay';
  const path = relay ? RELAY_PATH : STREAM_PATH;
  const ref = mintToken(randomUUID(), 'session', 120, Date.now(), correlationKey());
  const callSid = `CA${randomBytes(16).toString('hex')}`;
  const out: CallResult = { completed: false, turnsDone: 0, closeCode: null, timedOut: false, overheadMs: [], turnMs: [] };

  return new Promise((resolve) => {
    const ws = new WebSocket(base + path, { headers: { 'X-Twilio-Signature': signHandshake(LOAD_AUTH_TOKEN, `wss://${LOAD_HOST}${path}`) } });
    let frames: ReturnType<typeof setInterval> | null = null;
    let finished = false;
    let turnAt = 0;
    let firstToken = true;
    let chunks = 0;
    let line: Promise<void> = Promise.resolve(); // jittered messages leave one after another, in order, as on TCP

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      if (frames) clearInterval(frames);
      out.completed = out.turnsDone >= s.turns;
      resolve(out);
    };
    const guard = setTimeout(() => { out.timedOut = true; ws.terminate(); finish(); }, s.timeoutMs ?? 30_000);
    const send = (m: object) => {
      const go = () => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
      if (!s.jitterMs) return go();
      const due = performance.now() + Math.random() * s.jitterMs;
      line = line.then(() => new Promise<void>((r) => { setTimeout(r, Math.max(0, due - performance.now())); })).then(go);
    };
    const prompt = () => { turnAt = performance.now(); firstToken = true; send({ type: 'prompt', voicePrompt: 'When could we talk?', last: true }); };
    const turnDone = () => {
      out.turnsDone++;
      if (out.turnsDone < s.turns) { if (relay) prompt(); return; }
      if (relay) ws.close(1000);
      else send({ event: 'stop' });
    };

    ws.on('open', () => {
      if (relay) {
        send({ type: 'setup', sessionId: 'VX1', callSid, accountSid: LOAD_ACCOUNT, customParameters: { ref } });
        prompt(); // at once: a real caller does not wait for our database
      } else {
        send({ event: 'connected' });
        send({ event: 'start', streamSid: 'MZ1', start: { streamSid: 'MZ1', callSid, accountSid: LOAD_ACCOUNT, customParameters: { ref }, mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 } } });
        send({ event: 'media', media: { payload: FRAME } });
        frames = setInterval(() => send({ event: 'media', media: { payload: FRAME } }), 20);
      }
      if (s.hangUp === 'during_setup') setTimeout(() => ws.terminate(), 5);
    });
    ws.on('message', (raw: Buffer) => {
      const now = performance.now();
      const m = JSON.parse(raw.toString()) as { type?: string; token?: string; last?: boolean; event?: string; media?: { payload: string }; mark?: { name: string } };
      if (relay) {
        if (m.type === 'end') { ws.close(1000); return; }
        if (m.type !== 'text') return;
        const stamp = Number((m.token ?? '').trim());
        if (m.token && Number.isFinite(stamp) && stamp > 0) {
          out.overheadMs.push(now - stamp);
          if (firstToken) { firstToken = false; out.turnMs.push(now - turnAt); }
          if (s.hangUp === 'mid_answer') ws.terminate();
        }
        if (m.last) turnDone();
      } else if (m.event === 'media' && m.media) {
        out.overheadMs.push(now - readStamp(m.media.payload));
        if (s.hangUp === 'mid_answer') ws.terminate();
        if (++chunks % CHUNKS_PER_ANSWER === 0) turnDone();
      } else if (m.event === 'mark') {
        send({ event: 'mark', mark: m.mark });
      }
    });
    ws.on('close', (code) => { out.closeCode = code; finish(); });
    ws.on('error', () => { /* a close event always follows; the result reports it */ });
  });
}
