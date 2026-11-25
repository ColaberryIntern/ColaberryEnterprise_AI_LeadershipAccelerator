/**
 * VS4.1 load and chaos: the server under test. The REAL upgrade handler, signature check, engines,
 * session worker, state machine and tool broker, on a loopback HTTP server. Only the providers are
 * replaced (Claude, OpenAI Realtime) and the two database lookups. Nothing here can reach a network:
 * the mock model is a function call and the HTTP server listens on 127.0.0.1.
 *
 * Every mock output carries the time it was emitted, so the client can measure what OUR code adds
 * between a provider's output and the caller's socket. Provider thinking time is not part of it.
 */
import http from 'http';
import type { AddressInfo } from 'net';
import { performance } from 'perf_hooks';
import type { LlmTurnResult, VoiceLlm } from '../engines/claudeVoiceLlm';
import type { ModelHandlers, SocketLike } from '../engines/realtime/openaiRealtimeEngine';
import { ToolBroker, nextOpenSlotsTool } from '../engines/toolBroker';
import { TEST_PROFILE } from '../engines/voiceProfiles';
import { attachVoiceWsServer } from '../engines/voiceWsServer';
import { SessionWorker, type WorkerConfig } from '../session/sessionWorker';

export const LOAD_ACCOUNT = 'AC' + 'a1'.repeat(16);
export const LOAD_HOST = 'voice-load.invalid'; // RFC 2606: can never resolve
export const LOAD_AUTH_TOKEN = 'voice-load-not-a-real-token';
export const CHUNK_BYTES = 160; // 20 ms of mu-law
export const CHUNKS_PER_ANSWER = 25;
/** The mock model treats this many caller frames (20 ms each) as one finished utterance. */
export const FRAMES_PER_TURN = 25;

export interface Faults {
  /** Extra time each database lookup takes. */
  dbDelayMs?: number;
  dbDown?: boolean;
  /** Engine A: every nth model turn fails with this class. */
  llmFailEvery?: number;
  llmErrorClass?: 'RateLimitError' | 'UpstreamUnavailable';
  /** Engine B: the model socket drops after this many answers. */
  modelDropAfter?: number;
  /** The durable tool-record sink (queue or database) throws. */
  toolSinkDown?: boolean;
  /** Engine A: the model asks for a tool on every turn. */
  useTool?: boolean;
  thinkMs?: number;
}

export interface LoadServer {
  url: string;
  worker: SessionWorker;
  /** Open server-side sockets plus open mock model connections. */
  openSockets(): number;
  openModels(): number;
  readonly modelsOpened: number;
  readonly reconciled: string[];
  readonly toolRecords: number;
  readonly errorClasses: Record<string, number>;
  close(): Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

/** A mu-law-sized chunk whose first 8 bytes are the emit time. */
export function stampedChunk(now: number = performance.now()): string {
  const b = Buffer.alloc(CHUNK_BYTES, 0xff);
  b.writeDoubleBE(now, 0);
  return b.toString('base64');
}
export const readStamp = (payload: string): number => Buffer.from(payload, 'base64').readDoubleBE(0);

function mockLlm(f: Faults): VoiceLlm {
  let turns = 0;
  return {
    async streamTurn({ messages, tools, signal, onText }): Promise<LlmTurnResult> {
      const n = ++turns;
      await sleep(f.thinkMs ?? 20);
      if (signal.aborted) return { ok: false, errorClass: 'Aborted', aborted: true };
      if (f.llmFailEvery && n % f.llmFailEvery === 0) return { ok: false, errorClass: f.llmErrorClass ?? 'RateLimitError', aborted: false };
      const last = messages[messages.length - 1];
      if (f.useTool && tools.length > 0 && typeof last?.content === 'string') {
        const id = `toolu_${n}`;
        const input = {};
        return { ok: true, stopReason: 'tool_use', text: '', toolCalls: [{ id, name: tools[0].name, input }], assistantContent: [{ type: 'tool_use', id, name: tools[0].name, input }] };
      }
      let text = '';
      for (let i = 0; i < 12 && !signal.aborted; i++) {
        const delta = `${performance.now().toFixed(3)} `;
        text += delta;
        onText(delta);
        await sleep(5); // eslint-disable-line no-await-in-loop -- a stream arrives over time
      }
      if (signal.aborted) return { ok: false, errorClass: 'Aborted', aborted: true };
      return { ok: true, stopReason: 'end_turn', text, toolCalls: [], assistantContent: text };
    },
  };
}

/** OpenAI Realtime stand-in: greets, then answers after each FRAMES_PER_TURN caller frames. */
function mockModel(h: ModelHandlers, f: Faults, onOpen: () => void, onClose: () => void): SocketLike {
  let open = true;
  let frames = 0;
  let responses = 0;
  let busy = false;
  onOpen();
  const emit = (m: object) => { if (open) h.onMessage(JSON.stringify(m)); };
  const shut = () => { if (open) { open = false; onClose(); } };
  const answer = async () => {
    const id = `resp_${++responses}`;
    busy = true;
    await sleep(f.thinkMs ?? 20);
    emit({ type: 'response.created', response: { id } });
    for (let i = 0; i < CHUNKS_PER_ANSWER && open; i++) {
      emit({ type: 'response.output_audio.delta', response_id: id, item_id: `item_${responses}`, delta: stampedChunk() });
      await sleep(4); // eslint-disable-line no-await-in-loop -- a stream arrives over time
    }
    emit({ type: 'response.done', response: { id, status: 'completed' } });
    busy = false;
    frames = 0;
    if (f.modelDropAfter && responses >= f.modelDropAfter && open) { shut(); h.onClose('code_1011'); }
  };
  return {
    send(raw) {
      const m = JSON.parse(raw) as { type: string };
      if (m.type === 'session.update') setImmediate(() => emit({ type: 'session.updated' }));
      else if (m.type === 'response.create') void answer();
      else if (m.type === 'input_audio_buffer.append' && !busy && ++frames >= FRAMES_PER_TURN) {
        emit({ type: 'input_audio_buffer.speech_started' });
        void answer();
      }
    },
    close: shut,
  };
}

const LOAD_ENV: Record<string, string> = {
  VOICE_STUDIO_ENABLED: 'true', VOICE_TEST_ENABLED: 'false',
  VOICE_WS_BASE_URL: `wss://${LOAD_HOST}`, VOICE_PUBLIC_BASE_URL: `https://${LOAD_HOST}`,
  TWILIO_AUTH_TOKEN: LOAD_AUTH_TOKEN, TWILIO_ACCOUNT_SID: LOAD_ACCOUNT,
};

export async function startLoadServer(cfg: WorkerConfig, f: Faults = {}): Promise<LoadServer> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(LOAD_ENV)) { saved[k] = process.env[k]; process.env[k] = LOAD_ENV[k]; }

  const reconciled: string[] = [];
  const errorClasses: Record<string, number> = {};
  let toolRecords = 0;
  let openModels = 0;
  let modelsOpened = 0;
  const log = (l: Record<string, unknown>) => {
    if (typeof l.error_class === 'string') errorClasses[l.error_class] = (errorClasses[l.error_class] ?? 0) + 1;
  };
  const worker = new SessionWorker({
    now: () => performance.now(), log,
    reconcile: async (s) => { reconciled.push(s.callId); },
    recordTool: () => { if (f.toolSinkDown) throw Object.assign(new Error('sink down'), { name: 'SinkUnavailable' }); toolRecords++; },
  }, cfg);
  const used = new Set<string>();
  const db = async () => {
    await sleep(f.dbDelayMs ?? 1);
    if (f.dbDown) throw Object.assign(new Error('database down'), { name: 'SequelizeConnectionError' });
  };
  const shared = {
    worker, profile: TEST_PROFILE, accountSid: () => LOAD_ACCOUNT, now: () => Date.now(), log,
    broker: () => new ToolBroker([nextOpenSlotsTool(async () => ({ timezone: 'America/Chicago', dates: [] }))]),
    consumeSessionRef: async (c: { nonce: string }) => { await db(); if (used.has(c.nonce)) return 'replay' as const; used.add(c.nonce); return 'consumed' as const; },
    callMatches: async () => { await db(); return true; },
  };
  const llm = mockLlm(f);
  const server = http.createServer((_q, s) => { s.statusCode = 404; s.end(); });
  const wss = attachVoiceWsServer(server, {
    relay: () => ({ ...shared, llm }),
    stream: () => ({ ...shared, connectModel: (h) => mockModel(h, f, () => { openModels++; modelsOpened++; }, () => { openModels--; }) }),
  }, log);
  await new Promise<void>((r) => { server.listen(0, '127.0.0.1', r); });
  return {
    url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
    worker, reconciled, errorClasses,
    get toolRecords() { return toolRecords; },
    get modelsOpened() { return modelsOpened; },
    openSockets: () => wss.clients.size,
    openModels: () => openModels,
    async close() {
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((r) => { server.close(() => r()); server.closeAllConnections(); });
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    },
  };
}
