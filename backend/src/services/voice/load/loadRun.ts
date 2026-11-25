/**
 * VS4.1: load steps, chaos scenarios and the capacity they support. Pure measurement: no provider,
 * no database, no phone. The load client runs in the same process, so CPU and latency include the
 * cost of playing the callers and the result is conservative.
 */
import { monitorEventLoopDelay, performance } from 'perf_hooks';
import { DEFAULT_WORKER_CONFIG, type WorkerConfig } from '../session/sessionWorker';
import { startLoadServer, type Faults, type LoadServer } from './loadServer';
import { runCall, type CallResult, type CallScript, type LoadEngine } from './syntheticCall';

export const ENGINES: LoadEngine[] = ['conversation_relay', 'openai_realtime'];
/** A step supports its concurrency only if all of these hold. */
export const STEP_LIMITS = { minCompletion: 0.99, maxOverheadP95Ms: 50, maxLoopP99Ms: 100 } as const;
/** Planned live concurrency is the measured value divided by this: real providers, TLS and other work share the process. */
export const SAFETY_FACTOR = 2;
/** Heap kept after repeated waves at 20 callers may exceed the first wave's by at most this. */
export const MAX_HEAP_GROWTH_MB = 8;

const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });
const round = (n: number) => Math.round(n * 100) / 100;

export function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]);
}
export const summarize = (xs: number[]) => ({ n: xs.length, p50: percentile(xs, 50), p95: percentile(xs, 95), p99: percentile(xs, 99) });

export interface Leaks { sessions: number; sockets: number; models: number; timer: boolean; orphanTools: number }
export const noLeaks = (l: Leaks): boolean => !l.sessions && !l.sockets && !l.models && !l.timer && !l.orphanTools;

/** What is still held after the callers are gone (given up to 2 s to wind down). */
export async function leaksOf(s: LoadServer): Promise<Leaks> {
  const now = (): Leaks => ({ sessions: s.worker.size, sockets: s.openSockets(), models: s.openModels(), timer: s.worker.hasTimer, orphanTools: s.worker.orphanCount });
  const until = performance.now() + 2000;
  while (!noLeaks(now()) && performance.now() < until) await sleep(20); // eslint-disable-line no-await-in-loop -- polling
  return now();
}

const roomy = (n: number): WorkerConfig => ({ ...DEFAULT_WORKER_CONFIG, maxSessions: n, maxPerAgent: n });
const callers = (s: LoadServer, n: number, script: CallScript): Promise<CallResult[]> => Promise.all(Array.from({ length: n }, () => runCall(s.url, script)));

export interface StepResult {
  engine: LoadEngine; concurrency: number; calls: number; completed: number; completion: number;
  overheadMs: ReturnType<typeof summarize>; turnMs: ReturnType<typeof summarize>;
  loopDelayP99Ms: number; cpuPercent: number; peakRssMb: number;
  errors: Record<string, number>; leaks: Leaks; pass: boolean;
}

export async function loadStep(engine: LoadEngine, concurrency: number, turns = 3): Promise<StepResult> {
  const s = await startLoadServer(roomy(concurrency), { dbDelayMs: 15 });
  const loop = monitorEventLoopDelay({ resolution: 10 });
  let peak = 0;
  const sample = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 100);
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  loop.enable();
  try {
    const rs = await callers(s, concurrency, { engine, turns });
    loop.disable();
    const cpu = process.cpuUsage(cpu0);
    const wall = performance.now() - t0;
    const leaks = await leaksOf(s);
    const completed = rs.filter((r) => r.completed).length;
    const overheadMs = summarize(rs.flatMap((r) => r.overheadMs));
    const loopDelayP99Ms = round(loop.percentile(99) / 1e6);
    const completion = completed / rs.length;
    return {
      engine, concurrency, calls: rs.length, completed, completion, overheadMs, turnMs: summarize(rs.flatMap((r) => r.turnMs)),
      loopDelayP99Ms, cpuPercent: round((100 * (cpu.user + cpu.system)) / 1000 / wall), peakRssMb: round(peak / 1048576),
      errors: { ...s.errorClasses }, leaks,
      pass: completion >= STEP_LIMITS.minCompletion && noLeaks(leaks) && overheadMs.p95 !== null && overheadMs.p95 <= STEP_LIMITS.maxOverheadP95Ms && loopDelayP99Ms <= STEP_LIMITS.maxLoopP99Ms,
    };
  } finally {
    clearInterval(sample);
    await s.close();
  }
}

export interface SoakResult { waves: number; heapMbAfterWave: number[]; growthMb: number | null; measured: boolean; leaks: Leaks; completion: number; pass: boolean }

/** Repeated waves of 20 callers (half per engine). Needs --expose-gc: without it, memory is NOT measured and this fails. */
export async function soak(waves = 6): Promise<SoakResult> {
  const gc = (globalThis as { gc?: () => void }).gc;
  const s = await startLoadServer(roomy(20), { dbDelayMs: 5 });
  const heap: number[] = [];
  let done = 0;
  let total = 0;
  try {
    for (let i = 0; i < waves; i++) {
      const rs = (await Promise.all(ENGINES.map((engine) => callers(s, 10, { engine, turns: 2 })))).flat(); // eslint-disable-line no-await-in-loop -- waves in sequence
      done += rs.filter((r) => r.completed).length;
      total += rs.length;
      await leaksOf(s); // eslint-disable-line no-await-in-loop
      gc?.();
      heap.push(round(process.memoryUsage().heapUsed / 1048576));
    }
    const leaks = await leaksOf(s);
    const growthMb = gc && heap.length > 1 ? round(heap[heap.length - 1] - heap[0]) : null;
    const completion = total ? done / total : 0;
    return { waves, heapMbAfterWave: heap, growthMb, measured: Boolean(gc), leaks, completion, pass: growthMb !== null && growthMb <= MAX_HEAP_GROWTH_MB && noLeaks(leaks) && completion >= STEP_LIMITS.minCompletion };
  } finally { await s.close(); }
}

export interface ChaosResult { scenario: string; engine: LoadEngine; expected: string; calls: number; asExpected: boolean; detail: Record<string, unknown>; leaks: Leaks; pass: boolean }
interface Scenario {
  name: string; expected: string; engines?: LoadEngine[]; n: number; cfg?: WorkerConfig; faults: Faults; script: Omit<CallScript, 'engine'>;
  during?: (s: LoadServer) => Promise<Record<string, unknown>>;
  ok: (rs: CallResult[], s: LoadServer, during: Record<string, unknown>) => boolean;
}

const allDone = (rs: CallResult[]) => rs.every((r) => r.completed);
const A: LoadEngine[] = ['conversation_relay'];
const B: LoadEngine[] = ['openai_realtime'];
const waitFor = async (cond: () => boolean) => { const until = performance.now() + 3000; while (!cond() && performance.now() < until) await sleep(5); }; // eslint-disable-line no-await-in-loop

export const SCENARIOS: Scenario[] = [
  { name: 'slow database at setup', expected: 'every call completes though audio and turns arrive first', n: 10, faults: { dbDelayMs: 150 }, script: { turns: 2 }, ok: allDone },
  { name: 'hang-up during setup', expected: 'nothing is opened', n: 10, faults: { dbDelayMs: 100 }, script: { turns: 1, hangUp: 'during_setup' }, during: async () => { await sleep(600); return {}; } /* past both lookups: a leak opens only then */, ok: (_rs, s) => s.modelsOpened === 0 && s.worker.size === 0 },
  { name: 'hang-up mid-answer', expected: 'every session and model connection is released', n: 10, faults: {}, script: { turns: 3, hangUp: 'mid_answer' }, ok: (rs) => rs.every((r) => !r.completed && !r.timedOut) },
  { name: 'packet delay and jitter', expected: 'every call completes', n: 10, faults: {}, script: { turns: 2, jitterMs: 120 }, ok: allDone },
  { name: 'model rate limited (429)', expected: 'the caller hears an apology and the call continues', engines: A, n: 10, faults: { llmFailEvery: 3, llmErrorClass: 'RateLimitError' }, script: { turns: 3 }, ok: (rs, s) => allDone(rs) && (s.errorClasses.RateLimitError ?? 0) > 0 },
  { name: 'model unavailable (5xx)', expected: 'the caller hears an apology and the call continues', engines: A, n: 10, faults: { llmFailEvery: 2, llmErrorClass: 'UpstreamUnavailable' }, script: { turns: 3 }, ok: (rs, s) => allDone(rs) && (s.errorClasses.UpstreamUnavailable ?? 0) > 0 },
  { name: 'model connection drops', expected: 'the call ends cleanly', engines: B, n: 10, faults: { modelDropAfter: 2 }, script: { turns: 4 }, ok: (rs, s) => rs.every((r) => r.closeCode === 1000 && !r.completed) && s.errorClasses.RealtimeDisconnected === rs.length },
  { name: 'database down', expected: 'refused (1011) with no session', n: 10, faults: { dbDown: true }, script: { turns: 1 }, ok: (rs, s) => rs.every((r) => r.closeCode === 1011) && s.modelsOpened === 0 },
  { name: 'tool record sink down', expected: 'every call completes and each lost record is logged', engines: A, n: 10, faults: { useTool: true, toolSinkDown: true }, script: { turns: 2 }, ok: (rs, s) => allDone(rs) && s.errorClasses.SinkUnavailable === rs.length * 2 },
  { name: 'more callers than capacity', expected: '20 complete, 5 refused (1013)', n: 25, cfg: roomy(20), faults: {}, script: { turns: 2 }, ok: (rs) => rs.filter((r) => r.completed).length === 20 && rs.filter((r) => r.closeCode === 1013).length === 5 },
  { name: 'one agent at its limit', expected: 'the default per-agent limit holds; the rest are refused (1013)', n: 6, cfg: DEFAULT_WORKER_CONFIG, faults: {}, script: { turns: 2 }, ok: (rs) => rs.filter((r) => r.completed).length === DEFAULT_WORKER_CONFIG.maxPerAgent && rs.filter((r) => r.closeCode === 1013).length === 6 - DEFAULT_WORKER_CONFIG.maxPerAgent },
  {
    name: 'graceful deploy drain', expected: 'live calls finish, none forced, new calls refused', n: 10, faults: {}, script: { turns: 2 },
    during: async (s) => { await waitFor(() => s.worker.size === 10); const d = s.worker.drain(20_000); const late = await runCall(s.url, { engine: 'conversation_relay', turns: 1 }); return { ...(await d), lateCode: late.closeCode }; },
    ok: (rs, _s, d) => allDone(rs) && d.forced === 0 && d.drained === 10 && d.lateCode === 1013,
  },
  {
    name: 'worker restart cuts live calls', expected: 'every cut call is closed and handed to reconcile', n: 10, faults: { thinkMs: 60 }, script: { turns: 200, timeoutMs: 15_000 },
    during: async (s) => { await waitFor(() => s.worker.size === 10); return { ...(await s.worker.drain(200)), reconciled: new Set(s.reconciled).size }; },
    ok: (rs, _s, d) => d.forced === 10 && d.reconciled === 10 && rs.every((r) => !r.completed && !r.timedOut),
  },
];

export async function runScenario(sc: Scenario, engine: LoadEngine): Promise<ChaosResult> {
  const s = await startLoadServer(sc.cfg ?? roomy(sc.n), sc.faults);
  try {
    const during = sc.during ? sc.during(s) : Promise.resolve<Record<string, unknown>>({});
    const rs = await callers(s, sc.n, { engine, ...sc.script });
    const d = await during;
    const leaks = await leaksOf(s);
    const asExpected = sc.ok(rs, s, d);
    const codes: Record<string, number> = {};
    for (const r of rs) { const k = r.timedOut ? 'timeout' : String(r.closeCode); codes[k] = (codes[k] ?? 0) + 1; }
    return { scenario: sc.name, engine, expected: sc.expected, calls: rs.length, asExpected, detail: { completed: rs.filter((r) => r.completed).length, closeCodes: codes, errors: { ...s.errorClasses }, ...d }, leaks, pass: asExpected && noLeaks(leaks) };
  } finally { await s.close(); }
}

export async function runChaos(): Promise<ChaosResult[]> {
  const out: ChaosResult[] = [];
  for (const sc of SCENARIOS) for (const e of sc.engines ?? ENGINES) out.push(await runScenario(sc, e)); // eslint-disable-line no-await-in-loop -- one at a time: each measures alone
  return out;
}

/** Largest concurrency up to which EVERY tested step passed on both engines, and the planned value under the safety factor. */
export function capacityFrom(steps: Array<Pick<StepResult, 'concurrency' | 'pass'>>): { measured: number; planned: number } {
  let measured = 0;
  for (const c of [...new Set(steps.map((x) => x.concurrency))].sort((a, b) => a - b)) {
    if (!steps.filter((x) => x.concurrency === c).every((x) => x.pass)) break;
    measured = c;
  }
  return { measured, planned: Math.floor(measured / SAFETY_FACTOR) };
}
