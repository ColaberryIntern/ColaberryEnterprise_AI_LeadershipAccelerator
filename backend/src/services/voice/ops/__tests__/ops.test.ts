import fs from 'fs';
import path from 'path';
import { ALERT_KEYS, evaluateAlerts, type AlertKey, type OpsFacts } from '../alertRules';
import { OpsMetrics, tapVoiceLog, WINDOW_MS } from '../opsMetrics';
import { guardCarrier, guardLlm, guardRealtime, realtimeAvailable } from '../providerGuards';
import { runOpsSweep, type SweepDeps } from '../opsSweep';
import type { ModelHandlers } from '../../engines/realtime/openaiRealtimeEngine';
import type { CarrierAdapter } from '../../contracts/providers';

const HEALTHY: OpsFacts = {
  ended: 20, failed: 1, busyOrNoAnswer: 5, acceptedNeverRang: 0, dispatchUnknown24h: 0, orphaned: 0, stalled: 0, queueStuck: 0, policyDenied: 2, webhookSignatureFailures: 1, silentAnswered: 0, transitionsRejected: 3,
  wrongVersion: 0, duplicateDials: 0, spend24hUsd: 3, spendAlertUsd: 25, turnLatencyP95Ms: 900, turnLatencySamples: 40, optOutsPending: 0, handlerFailures: 0, breakers: { twilio: 'CLOSED', anthropic: 'CLOSED', openai_realtime: 'CLOSED' },
};
/** The drill for each runbook incident: the smallest change from healthy that must raise it, and only it. */
const DRILLS: Record<AlertKey, Partial<OpsFacts>> = {
  no_ringing: { acceptedNeverRang: 1 }, busy_no_answer: { busyOrNoAnswer: 16 }, call_failures: { failed: 6 }, webhook_signature: { webhookSignatureFailures: 5 }, provider_circuit_open: { breakers: { ...HEALTHY.breakers, anthropic: 'OPEN' } },
  silent_audio: { silentAnswered: 1 }, interruption_failures: { transitionsRejected: 20 }, wrong_agent: { wrongVersion: 1 }, duplicate_calls: { duplicateDials: 1 }, dispatch_unknown: { dispatchUnknown24h: 1 }, orphaned_sessions: { orphaned: 1 },
  stalled_events: { stalled: 1 }, queue_stuck: { queueStuck: 1 }, runaway_cost: { spend24hUsd: 25 }, slow_turns: { turnLatencyP95Ms: 2501 }, policy_failures: { policyDenied: 10 }, opt_out_pending: { optOutsPending: 1 }, handler_failures: { handlerFailures: 1 },
};

describe('alert rules and the runbook', () => {
  it('a healthy hour raises nothing, and neither does an empty one', () => {
    expect(evaluateAlerts(HEALTHY)).toEqual([]);
    expect(evaluateAlerts({ ...HEALTHY, ended: 0, failed: 0, busyOrNoAnswer: 0, spend24hUsd: 0, turnLatencyP95Ms: null, turnLatencySamples: 0 })).toEqual([]);
  });
  it.each(ALERT_KEYS)('drill: %s raises exactly that alert, with its runbook section', (k) => {
    const out = evaluateAlerts({ ...HEALTHY, ...DRILLS[k] });
    expect(out.map((a) => a.key)).toEqual([k]);
    expect(out[0].description).toContain(`RUNBOOK.md, ${k}`);
    expect(out[0].title).not.toMatch(/\d/); // stable: repeats of one condition fold together by title
  });
  it('rates need a sample: one failed call of one is not an incident', () => {
    expect(evaluateAlerts({ ...HEALTHY, ended: 4, failed: 4, busyOrNoAnswer: 4 })).toEqual([]);
    expect(evaluateAlerts({ ...HEALTHY, turnLatencyP95Ms: 9000, turnLatencySamples: 9 })).toEqual([]);
  });
  it('the runbook has one complete section per alert and no section without one', () => {
    const md = fs.readFileSync(path.resolve(__dirname, '../../../../../../docs/voice-studio/RUNBOOK.md'), 'utf8').replace(/\r\n/g, '\n');
    const sections = md.split('\n## ').slice(1);
    const keyed = sections.map((s) => ({ key: /^[^\n]*\(`([a-z_]+)`\)/.exec(s)?.[1], s })).filter((x) => x.key);
    expect(keyed.map((x) => x.key).sort()).toEqual([...ALERT_KEYS].sort());
    for (const { s } of keyed) for (const part of ['Detection', 'Containment', 'Diagnostics', 'Remediation', 'Evidence']) expect(s).toMatch(new RegExp(`\\*\\*${part}:\\*\\* \\S`));
    expect(md).not.toMatch(/\+1\d{10}/);
  });
});

describe('metrics', () => {
  it('rates, retries and percentiles over one hour; neutral outcomes are volume only', () => {
    let t = 0;
    const m = new OpsMetrics(() => t);
    m.operation('op', 'failure', 999);
    t = WINDOW_MS + 1;
    for (const [o, ms] of [['success', 10], ['success', 20], ['failure', 30], ['neutral', 40]] as const) m.operation('op', o, ms, 1);
    expect(m.snapshot()).toEqual([{ operation: 'op', volume: 4, success_rate: 2 / 3, failure_rate: 1 / 3, retry_count: 4, latency_ms: { p50: 20, p95: 40, p99: 40 } }]);
  });
  it('no samples is null, not zero', () => {
    let t = 0;
    const m = new OpsMetrics(() => t);
    m.operation('op', 'success', 5);
    t = WINDOW_MS + 1;
    expect(m.snapshot()[0]).toMatchObject({ volume: 0, success_rate: null, failure_rate: null, latency_ms: { p50: null } });
  });
  it('memory is bounded by keys and samples', () => {
    const m = new OpsMetrics(() => 1);
    for (let i = 0; i < 5000; i++) { m.line({ event: `e${i}`, error_class: `c${i}` }); m.operation('op', 'success', 1); }
    expect((m as unknown as { events: Map<string, unknown> }).events.size).toBeLessThanOrEqual(300);
    expect(m.snapshot()[0].volume).toBe(2000);
  });
  it('a tapped line is counted and carries its call id as the correlation id', () => {
    const m = new OpsMetrics(() => 1);
    const out = tapVoiceLog({ event: 'voice_webhook_refused', error_class: 'TwilioSignatureInvalid', call_id: 'c1', level: 'warn' }, m);
    expect(out).toMatchObject({ service: 'voice-studio', correlation_id: 'c1', event: 'voice_webhook_refused' });
    expect(m.count('voice_webhook_refused:TwilioSignatureInvalid')).toBe(1);
    expect(tapVoiceLog({ event: 'x' }, m)).toMatchObject({ correlation_id: null });
  });
});

describe('provider guards', () => {
  const turn = { system: '', messages: [], tools: [], signal: new AbortController().signal, onText: () => undefined };
  const ok = { ok: true as const, stopReason: 'end_turn', text: '', toolCalls: [], assistantContent: '' };

  it.each(['RateLimitError', 'UpstreamUnavailable', 'TimeoutError', 'AuthError'])('Claude failing with %s opens the circuit; then it answers at once without calling', async (errorClass) => {
    const m = new OpsMetrics(() => 1);
    const streamTurn = jest.fn().mockResolvedValue({ ok: false, errorClass, aborted: false });
    const g = guardLlm({ streamTurn }, m);
    for (let i = 0; i < 5; i++) await g.streamTurn(turn); // eslint-disable-line no-await-in-loop
    expect(await g.streamTurn(turn)).toEqual({ ok: false, errorClass: 'CircuitOpen', aborted: false });
    expect(streamTurn).toHaveBeenCalledTimes(5);
  });
  it('a hang-up or a wrong request never opens it; a throw does', async () => {
    const m = new OpsMetrics(() => 1);
    for (const r of [{ ok: false as const, errorClass: 'Aborted', aborted: true }, { ok: false as const, errorClass: 'LlmRequestRejected', aborted: false }]) {
      const g = guardLlm({ streamTurn: async () => r }, m);
      for (let i = 0; i < 20; i++) await g.streamTurn(turn); // eslint-disable-line no-await-in-loop
    }
    expect(m.breakers.anthropic.current).toBe('CLOSED');
    const g = guardLlm({ streamTurn: async () => { throw new Error('x'); } }, m);
    for (let i = 0; i < 5; i++) await expect(g.streamTurn(turn)).rejects.toThrow('x'); // eslint-disable-line no-await-in-loop
    expect(m.breakers.anthropic.current).toBe('OPEN');
    expect(m.breakers.twilio.current).toBe('CLOSED');
  });
  it('time to the first word is measured once per turn, and every word is still delivered', async () => {
    const m = new OpsMetrics(() => 1);
    let t = 0;
    const heard: string[] = [];
    await guardLlm({ streamTurn: async (a) => { t = 300; a.onText('a'); t = 900; a.onText('b'); return ok; } }, m, () => t).streamTurn({ ...turn, onText: (d) => heard.push(d) });
    expect(heard).toEqual(['a', 'b']);
    expect(m.snapshot().find((o) => o.operation === 'anthropic.first_text')).toMatchObject({ volume: 1, latency_ms: { p95: 300 } });
  });
  it('a working provider is measured', async () => {
    const m = new OpsMetrics(() => 1);
    let t = 0;
    await guardLlm({ streamTurn: async () => { t = 40; return ok; } }, m, () => t).streamTurn(turn);
    expect(m.snapshot().find((o) => o.operation === 'anthropic.turn')).toMatchObject({ operation: 'anthropic.turn', volume: 1, success_rate: 1, latency_ms: { p50: 40 } });
  });

  const handlers: ModelHandlers = { onMessage: () => undefined, onClose: () => undefined };
  it('Engine B: closes before the session is ready open the circuit; after it they do not', () => {
    const m = new OpsMetrics(() => 1);
    let h: ModelHandlers = handlers;
    const g = guardRealtime((x) => { h = x; return { send: () => undefined, close: () => undefined }; }, m);
    for (let i = 0; i < 20; i++) { g(handlers); h.onMessage(JSON.stringify({ type: 'session.updated' })); h.onClose('code_1006'); }
    expect(realtimeAvailable(m)).toBe(true);
    const n = new OpsMetrics(() => 1);
    const g2 = guardRealtime((x) => { h = x; return { send: () => undefined, close: () => undefined }; }, n);
    for (let i = 0; i < 5; i++) { g2(handlers); h.onClose('code_1013'); h.onClose('code_1013'); }
    expect(realtimeAvailable(n)).toBe(false);
    expect(() => g2(handlers)).toThrow('circuit is open');
  });
  it('Engine B: our own hang-up before it is ready says nothing, and still closes the model', () => {
    const m = new OpsMetrics(() => 1);
    const close = jest.fn();
    const g = guardRealtime(() => ({ send: () => undefined, close }), m);
    for (let i = 0; i < 20; i++) g(handlers).close(1000);
    expect(close).toHaveBeenCalledTimes(20);
    expect(realtimeAvailable(m)).toBe(true);
  });

  const input = { callId: 'c1' } as Parameters<CarrierAdapter['placeCall']>[0];
  it('Twilio: unknown outcomes open it and the next dial is refused, never placed', async () => {
    const m = new OpsMetrics(() => 1);
    const placeCall = jest.fn().mockResolvedValue({ outcome: 'unknown', callId: 'c1', errorClass: 'TimeoutError', detail: '' });
    const g = guardCarrier({ placeCall } as unknown as CarrierAdapter, m);
    for (let i = 0; i < 5; i++) await g.placeCall(input, 'https://x'); // eslint-disable-line no-await-in-loop
    expect(await g.placeCall(input, 'https://x')).toMatchObject({ outcome: 'refused', errorClass: 'CircuitOpen' });
    expect(placeCall).toHaveBeenCalledTimes(5);
  });
  it('Twilio: a bad number never opens it', async () => {
    const m = new OpsMetrics(() => 1);
    const g = guardCarrier({ placeCall: async () => ({ outcome: 'refused', callId: 'c1', errorClass: 'TwilioInvalidTo', retryable: false, detail: '' }) } as unknown as CarrierAdapter, m);
    for (let i = 0; i < 20; i++) await g.placeCall(input, 'https://x'); // eslint-disable-line no-await-in-loop
    expect(m.breakers.twilio.current).toBe('CLOSED');
  });
  it('hanging up is never blocked by an open circuit', async () => {
    const m = new OpsMetrics(() => 1);
    for (let i = 0; i < 5; i++) m.breakers.twilio.record('failure');
    const hangup = jest.fn().mockResolvedValue(undefined);
    await guardCarrier({ hangup, placeCall: jest.fn() } as unknown as CarrierAdapter, m).hangup('CA1');
    expect(hangup).toHaveBeenCalled();
  });
});

describe('the sweep', () => {
  const deps = (over: Partial<SweepDeps> = {}) => ({ facts: async () => ({ ...HEALTHY, ...DRILLS.opt_out_pending, ...DRILLS.no_ringing }), raise: jest.fn().mockResolvedValue(undefined), metrics: () => [], log: jest.fn(), ...over });
  it('raises each alert once and logs the metrics', async () => {
    const d = deps();
    expect((await runOpsSweep(d)).sort()).toEqual(['no_ringing', 'opt_out_pending']);
    expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ event: 'voice_ops_metrics' }));
  });
  it('one alert failing does not stop the others; a failing read is logged, not thrown', async () => {
    const raise = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined);
    const d = deps({ raise });
    expect(await runOpsSweep(d)).toHaveLength(1);
    expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ event: 'voice_alert_failed' }));
    const f = deps({ facts: async () => { throw new Error('db'); } });
    expect(await runOpsSweep(f)).toEqual([]);
    expect(f.log).toHaveBeenCalledWith(expect.objectContaining({ event: 'voice_ops_facts_failed' }));
  });
});
