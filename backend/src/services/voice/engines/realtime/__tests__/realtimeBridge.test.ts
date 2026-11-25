import { RealtimeBridge, MAX_PREBUFFER_FRAMES, MAX_MALFORMED_FRAMES, MAX_TOOL_CALLS_PER_CALL, MAX_TOOL_FOLLOW_UPS_PER_TURN, type ModelHandlers, type RealtimeDeps } from '../openaiRealtimeEngine';
import { ToolBroker, nextOpenSlotsTool } from '../../toolBroker';
import { TEST_PROFILE } from '../../voiceProfiles';
import { SessionWorker } from '../../../session/sessionWorker';
import { correlationKey, mintToken } from '../../../twilio/correlationToken';
import { mulawSilenceBase64 } from '../mulaw';

const ACCOUNT = 'AC' + 'a1'.repeat(16);
const SID = 'CA' + 'b2'.repeat(16);
const CALL = '0b1c2d3e-4f50-4617-8899-aabbccddeeff';
const T0 = Date.parse('2026-11-24T20:00:00Z');
const chunk20ms = mulawSilenceBase64(20); // 160 bytes = 20 ms of mu-law

function harness(over: Partial<RealtimeDeps> = {}) {
  const twilio: Array<Record<string, unknown>> = [];
  const model: Array<Record<string, unknown>> = [];
  const twilioCloses: number[] = [];
  let modelClosed = 0;
  const logs: Record<string, unknown>[] = [];
  const tools: Record<string, unknown>[] = [];
  let slotRuns = 0;
  let handlers: ModelHandlers | null = null;
  let now = 0;
  const worker = new SessionWorker({ now: () => now, log: (l) => logs.push(l), reconcile: async () => undefined, recordTool: (c, r) => tools.push({ c, ...r }) });
  const used = new Set<string>();
  const deps: RealtimeDeps = {
    worker, profile: TEST_PROFILE,
    broker: () => new ToolBroker([nextOpenSlotsTool(async () => { slotRuns++; return { timezone: 'America/Chicago', dates: [] }; })]),
    accountSid: () => ACCOUNT,
    consumeSessionRef: async (c) => { if (used.has(c.nonce)) return 'replay'; used.add(c.nonce); return 'consumed'; },
    callMatches: async (_id, sid) => sid === SID,
    connectModel: (h) => { handlers = h; return { send: (t) => model.push(JSON.parse(t)), close: () => { modelClosed++; } }; },
    now: () => T0,
    log: (l) => logs.push(l),
    ...over,
  };
  const bridge = new RealtimeBridge({ send: (t) => twilio.push(JSON.parse(t)), close: (c) => twilioCloses.push(c ?? 1000) }, deps);
  const ref = mintToken(CALL, 'session', 120, T0, correlationKey());
  const tw = (m: Record<string, unknown>) => bridge.onTwilio(JSON.stringify(m));
  const start = (r = ref) => tw({ event: 'start', streamSid: 'MZ1', start: { streamSid: 'MZ1', callSid: SID, accountSid: ACCOUNT, customParameters: { ref: r }, mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 } } });
  const media = (payload = chunk20ms) => tw({ event: 'media', media: { track: 'inbound', payload } });
  const ev = async (e: Record<string, unknown>) => { handlers!.onMessage(JSON.stringify(e)); await new Promise((r) => setImmediate(r)); };
  const of = (list: Array<Record<string, unknown>>, key: string, val: string) => list.filter((m) => m[key] === val);
  /** Start, model ready, greeting played and done: the call is listening. */
  const ready = async () => {
    await start();
    await ev({ type: 'session.updated' });
    await ev({ type: 'response.created', response: { id: 'resp_greet' } });
    await ev({ type: 'response.output_audio.delta', response_id: 'resp_greet', item_id: 'item_greet', delta: chunk20ms });
    await tw({ event: 'mark', mark: { name: 'item_greet|20' } }); // the greeting finished playing
    await ev({ type: 'response.done', response: { id: 'resp_greet', status: 'completed' } });
  };
  /** A caller turn and an answer with n 20 ms chunks. */
  const answer = async (resp: string, item: string, n: number) => {
    await ev({ type: 'input_audio_buffer.speech_started', item_id: 'u1', audio_start_ms: 100 });
    await ev({ type: 'response.created', response: { id: resp } });
    for (let i = 0; i < n; i++) await ev({ type: 'response.output_audio.delta', response_id: resp, item_id: item, delta: chunk20ms });
  };
  return { bridge, twilio, model, twilioCloses, logs, tools, worker, tw, start, media, ev, of, ready, answer,
    modelDrops: (reason: string) => handlers!.onClose(reason),
    modelClosed: () => modelClosed, slotRuns: () => slotRuns, advance: (ms: number) => { now += ms; } };
}

describe('Engine B: setup and session (VS2.4)', () => {
  it('configures the model for mu-law in and out, server VAD with interruption, and the broker tools', async () => {
    const h = harness();
    await h.start();
    const upd = h.model[0] as { type: string; session: { type: string; audio: { input: { format: unknown; turn_detection: unknown }; output: { format: unknown } }; tools: Array<{ name: string }> } };
    expect(upd.type).toBe('session.update');
    expect(upd.session.type).toBe('realtime');
    expect(upd.session.audio.input.format).toEqual({ type: 'audio/pcmu' });
    expect(upd.session.audio.output.format).toEqual({ type: 'audio/pcmu' });
    expect(upd.session.audio.input.turn_detection).toMatchObject({ type: 'server_vad', interrupt_response: true });
    expect(upd.session.tools.map((t) => t.name)).toEqual(['next_open_strategy_slots']);
  });

  it('caller audio before the model is ready is prebuffered in order, then flushed; the greeting discloses the AI', async () => {
    const h = harness();
    await h.start();
    await h.media('AAAA'); await h.media('BBBB');
    expect(h.of(h.model, 'type', 'input_audio_buffer.append')).toHaveLength(0);
    await h.ev({ type: 'session.updated' });
    expect(h.of(h.model, 'type', 'input_audio_buffer.append').map((m) => m.audio)).toEqual(['AAAA', 'BBBB']);
    const greet = h.of(h.model, 'type', 'response.create')[0] as { response: { instructions: string } };
    expect(greet.response.instructions).toContain("I'm an AI, not a person");
  });

  it(`the prebuffer is bounded at ${MAX_PREBUFFER_FRAMES} frames (oldest dropped, logged once)`, async () => {
    const h = harness();
    await h.start();
    for (let i = 0; i < MAX_PREBUFFER_FRAMES + 50; i++) await h.media(`F${i}`);
    await h.ev({ type: 'session.updated' });
    const sent = h.of(h.model, 'type', 'input_audio_buffer.append').map((m) => m.audio);
    expect(sent).toHaveLength(MAX_PREBUFFER_FRAMES);
    expect(sent[0]).toBe('F50');
    expect(h.logs.filter((l) => l.error_class === 'PrebufferOverflow')).toHaveLength(1);
  });

  it.each([
    ['a forged ref', 'x.y', 'session_ref_bad_signature'],
  ])('refuses %s and opens neither a session nor a model connection', async (_n, ref, reason) => {
    const h = harness();
    await h.start(ref);
    expect(h.worker.size).toBe(0);
    expect(h.model).toHaveLength(0);
    expect(h.twilioCloses).toEqual([1008]);
    expect(h.logs).toContainEqual(expect.objectContaining({ reason }));
  });

  it('media before start closes the stream', async () => {
    const h = harness();
    await h.media();
    expect(h.twilioCloses).toEqual([1008]);
  });
});

describe('Engine B: playback, marks and barge-in (VS2.4)', () => {
  it('each audio chunk goes to Twilio as raw base64 media followed by a mark of ms sent so far (no header)', async () => {
    const h = harness();
    await h.ready();
    await h.answer('resp_1', 'item_1', 3);
    const outs = h.twilio.filter((m) => m.event === 'media' || m.event === 'mark').slice(-6);
    expect(outs.map((m) => m.event)).toEqual(['media', 'mark', 'media', 'mark', 'media', 'mark']);
    expect(outs.filter((m) => m.event === 'mark').map((m) => (m.mark as { name: string }).name)).toEqual(['item_1|20', 'item_1|40', 'item_1|60']);
    expect((outs[0].media as { payload: string }).payload).toBe(chunk20ms);
  });

  it('barge-in with DELAYED marks: truncation equals audio actually PLAYED (acked), not audio sent', async () => {
    const h = harness();
    await h.ready();
    await h.answer('resp_1', 'item_1', 3); // 60 ms sent
    await h.tw({ event: 'mark', mark: { name: 'item_1|20' } });
    await h.tw({ event: 'mark', mark: { name: 'item_1|40' } }); // 40 ms played; the 60 ms mark has not come back
    await h.ev({ type: 'input_audio_buffer.speech_started', item_id: 'u2', audio_start_ms: 900 });
    expect(h.twilio[h.twilio.length - 1]).toEqual({ event: 'clear', streamSid: 'MZ1' });
    expect(h.of(h.model, 'type', 'conversation.item.truncate')).toEqual([{ type: 'conversation.item.truncate', item_id: 'item_1', content_index: 0, audio_end_ms: 40 }]);
    expect(h.of(h.model, 'type', 'response.cancel')).toEqual([{ type: 'response.cancel', response_id: 'resp_1' }]);
    // Twilio returns the pending mark because of the clear: it means discarded, not played.
    await h.tw({ event: 'mark', mark: { name: 'item_1|60' } });
    const before = h.twilio.length;
    await h.ev({ type: 'response.output_audio.delta', response_id: 'resp_1', item_id: 'item_1', delta: chunk20ms }); // late audio of the canceled answer
    expect(h.twilio.length).toBe(before); // never played
  });

  it('no marks back yet: truncation is 0 ms (nothing is known to have been heard)', async () => {
    const h = harness();
    await h.ready();
    await h.answer('resp_1', 'item_1', 2);
    await h.ev({ type: 'input_audio_buffer.speech_started', item_id: 'u2' });
    expect(h.of(h.model, 'type', 'conversation.item.truncate')[0]).toMatchObject({ audio_end_ms: 0 });
  });

  it('repeated interrupts: the second one clears and truncates nothing (nothing is playing)', async () => {
    const h = harness();
    await h.ready();
    await h.answer('resp_1', 'item_1', 2);
    await h.ev({ type: 'input_audio_buffer.speech_started', item_id: 'u2' });
    await h.ev({ type: 'input_audio_buffer.speech_started', item_id: 'u3' });
    expect(h.of(h.twilio, 'event', 'clear')).toHaveLength(1);
    expect(h.of(h.model, 'type', 'conversation.item.truncate')).toHaveLength(1);
    expect(h.worker.size).toBe(1);
  });

  it('a fully played answer is not cleared or truncated when the caller then speaks', async () => {
    const h = harness();
    await h.ready();
    await h.answer('resp_1', 'item_1', 2);
    await h.tw({ event: 'mark', mark: { name: 'item_1|40' } });
    await h.ev({ type: 'response.done', response: { id: 'resp_1', status: 'completed' } });
    await h.ev({ type: 'input_audio_buffer.speech_started', item_id: 'u2' });
    expect(h.of(h.twilio, 'event', 'clear')).toHaveLength(0);
    expect(h.of(h.model, 'type', 'conversation.item.truncate')).toHaveLength(0);
    expect(h.of(h.model, 'type', 'response.cancel')).toHaveLength(0);
  });

  it('silence and noise frames are just forwarded; they change nothing by themselves', async () => {
    const h = harness();
    await h.ready();
    const noise = Buffer.from(Array.from({ length: 160 }, (_, i) => (i * 73) % 256)).toString('base64');
    await h.media(chunk20ms); await h.media(noise);
    expect(h.of(h.model, 'type', 'input_audio_buffer.append').slice(-2).map((m) => m.audio)).toEqual([chunk20ms, noise]);
    expect(h.worker.size).toBe(1);
  });
});

describe('Engine B: tools (VS2.4)', () => {
  it('a function call runs once, its output is always returned, and the answer continues', async () => {
    const h = harness();
    await h.ready();
    await h.answer('resp_1', 'item_1', 0);
    await h.ev({ type: 'response.function_call_arguments.done', response_id: 'resp_1', call_id: 'call_1', name: 'next_open_strategy_slots', arguments: '{}' });
    await h.ev({ type: 'response.function_call_arguments.done', response_id: 'resp_1', call_id: 'call_1', name: 'next_open_strategy_slots', arguments: '{}' });
    expect(h.slotRuns()).toBe(1);
    expect(h.logs).toContainEqual(expect.objectContaining({ error_class: 'DuplicateToolCall' }));
    const outputs = h.of(h.model, 'type', 'conversation.item.create');
    expect(outputs[0]).toMatchObject({ item: { type: 'function_call_output', call_id: 'call_1' } });
    expect(h.tools).toEqual([expect.objectContaining({ toolCallId: 'call_1', committed: false })]);
    const creates = h.of(h.model, 'type', 'response.create');
    expect(creates.length).toBeGreaterThanOrEqual(2); // greeting + the follow-up
  });

  function gatedHarness(n = 1) {
    const opens: Array<() => void> = [];
    const gates = Array.from({ length: n }, () => new Promise<void>((r) => opens.push(r)));
    let i = 0;
    const h = harness({ broker: () => new ToolBroker([nextOpenSlotsTool(async () => { await gates[Math.min(i++, n - 1)]; return { timezone: 'UTC', dates: [] }; })]) });
    return { h, open: (k: number) => opens[k]() };
  }
  const settle = () => new Promise((r) => setImmediate(r));

  it('REAL wire order: response.done (completed) arrives before the tool returns; the answer still continues (verifier attempt 1)', async () => {
    const { h, open } = gatedHarness();
    await h.ready();
    await h.answer('resp_1', 'item_1', 0);
    const creates = () => h.of(h.model, 'type', 'response.create').length;
    const before = creates();
    const pending = h.ev({ type: 'response.function_call_arguments.done', response_id: 'resp_1', call_id: 'call_r', name: 'next_open_strategy_slots', arguments: '{}' });
    await h.ev({ type: 'response.done', response: { id: 'resp_1', status: 'completed' } }); // the model's turn ends while the lookup runs
    expect(h.worker.size).toBe(1);
    open(0);
    await pending; await settle();
    expect(h.of(h.model, 'type', 'conversation.item.create')).toContainEqual(expect.objectContaining({ item: expect.objectContaining({ call_id: 'call_r' }) }));
    expect(creates()).toBe(before + 1); // exactly one follow-up answer requested
    // The follow-up's audio is played as part of the same answer.
    await h.ev({ type: 'response.created', response: { id: 'resp_2' } });
    const n = h.twilio.length;
    await h.ev({ type: 'response.output_audio.delta', response_id: 'resp_2', item_id: 'item_2', delta: chunk20ms });
    expect(h.twilio.length).toBe(n + 2); // media + mark
  });

  it('two tool calls in one response: both outputs returned, ONE follow-up, after the last one finishes', async () => {
    const { h, open } = gatedHarness(2);
    await h.ready();
    await h.answer('resp_1', 'item_1', 0);
    const creates = () => h.of(h.model, 'type', 'response.create').length;
    const before = creates();
    const a = h.ev({ type: 'response.function_call_arguments.done', response_id: 'resp_1', call_id: 'c_a', name: 'next_open_strategy_slots', arguments: '{}' });
    const b = h.ev({ type: 'response.function_call_arguments.done', response_id: 'resp_1', call_id: 'c_b', name: 'next_open_strategy_slots', arguments: '{}' });
    await h.ev({ type: 'response.done', response: { id: 'resp_1', status: 'completed' } });
    open(0); await a; await settle();
    expect(creates()).toBe(before); // one still running: no follow-up yet
    open(1); await b; await settle();
    expect(h.of(h.model, 'type', 'conversation.item.create').map((m) => (m.item as { call_id?: string }).call_id).filter(Boolean)).toEqual(['c_a', 'c_b']);
    expect(creates()).toBe(before + 1);
  });

  it('a tool that finishes after the caller moved on still returns its output but requests no stale answer', async () => {
    let open: () => void = () => undefined;
    const gate = new Promise<void>((r) => { open = r; });
    const h = harness({ broker: () => new ToolBroker([nextOpenSlotsTool(async () => { await gate; return { timezone: 'UTC', dates: [] }; })]) });
    await h.ready();
    await h.answer('resp_1', 'item_1', 0);
    const creates = () => h.of(h.model, 'type', 'response.create').length;
    const pending = h.ev({ type: 'response.function_call_arguments.done', response_id: 'resp_1', call_id: 'call_2', name: 'next_open_strategy_slots', arguments: '{}' });
    await h.ev({ type: 'input_audio_buffer.speech_started', item_id: 'u9' }); // caller moved on
    const before = creates();
    open();
    await pending; await new Promise((r) => setImmediate(r));
    expect(h.of(h.model, 'type', 'conversation.item.create')).toContainEqual(expect.objectContaining({ item: expect.objectContaining({ call_id: 'call_2' }) }));
    expect(creates()).toBe(before);
  });

  it('a keypad press becomes a user message and a response', async () => {
    const h = harness();
    await h.ready();
    await h.tw({ event: 'dtmf', dtmf: { track: 'inbound_track', digit: '7' } });
    expect(h.of(h.model, 'type', 'conversation.item.create').pop()).toMatchObject({ item: { role: 'user', content: [{ type: 'input_text', text: '(The caller pressed 7 on the keypad.)' }] } });
  });
});

describe('Engine B: disconnect and teardown (VS2.4)', () => {
  it('the model disconnecting mid-call ends the stream and the session (no leak)', async () => {
    const h = harness();
    await h.ready();
    h.modelDrops('code_1006'); // the OpenAI socket closes under us
    expect(h.twilioCloses).toEqual([1000]);
    expect(h.worker.size).toBe(0);
    expect(h.logs).toContainEqual(expect.objectContaining({ error_class: 'RealtimeDisconnected' }));
  });

  it('Twilio stop closes the model and the session; teardown is idempotent; later frames are ignored', async () => {
    const h = harness();
    await h.ready();
    await h.tw({ event: 'stop', stop: { callSid: SID } });
    h.bridge.onTwilioClose();
    expect(h.modelClosed()).toBe(1);
    expect(h.twilioCloses).toEqual([1000]);
    expect(h.worker.size).toBe(0);
    const n = h.model.length;
    await h.media();
    expect(h.model.length).toBe(n);
  });

  it('the max call duration ends the stream', async () => {
    const h = harness();
    await h.ready();
    h.advance(180_000);
    h.worker.tick();
    expect(h.twilioCloses).toEqual([1000]);
    expect(h.modelClosed()).toBe(1);
  });

  it(`${MAX_MALFORMED_FRAMES} malformed Twilio frames close the stream (1007); a bad model event is only logged`, async () => {
    const h = harness();
    await h.ready();
    await h.ev({ type: 'response.output_audio.delta' }); // missing fields
    expect(h.logs).toContainEqual(expect.objectContaining({ event: 'voice_realtime_event_rejected', error_class: 'ContractViolation' }));
    for (let i = 0; i < MAX_MALFORMED_FRAMES; i++) await h.bridge.onTwilio('nope');
    expect(h.twilioCloses).toEqual([1007]);
  });

  it('logs carry no audio payload', async () => {
    const h = harness();
    await h.ready();
    await h.answer('resp_1', 'item_1', 2);
    expect(JSON.stringify(h.logs)).not.toContain(chunk20ms.slice(0, 40));
  });
});

it('VS3.5: a tool the broker refuses reaches the durable record with its error class', async () => {
  const h = harness();
  await h.ready();
  await h.answer('resp_1', 'item_1', 0);
  await h.ev({ type: 'response.function_call_arguments.done', response_id: 'resp_1', call_id: 'no', name: 'book_meeting', arguments: '{}' });
  expect(h.tools).toEqual([expect.objectContaining({ name: 'book_meeting', errorClass: 'UnknownTool' })]);
});

describe('VS4.2: a caller cannot loop paid answers through tools', () => {
  const settle = () => new Promise((r) => setTimeout(r, 5));
  /** The model asks for a tool in every answer it is given. Returns how many answers it was given. */
  async function loop(h: ReturnType<typeof harness>, rounds: number, tag: string) {
    const asked = () => h.of(h.model, 'type', 'response.create').length;
    await h.ev({ type: 'input_audio_buffer.speech_started', item_id: 'u' + tag, audio_start_ms: 1 });
    let given = 0;
    for (let i = 0; i < rounds; i++) {
      const id = `${tag}_${i}`;
      const before = asked();
      await h.ev({ type: 'response.created', response: { id } });
      await h.ev({ type: 'response.function_call_arguments.done', response_id: id, call_id: 'c_' + id, name: 'next_open_strategy_slots', arguments: '{}' });
      await h.ev({ type: 'response.done', response: { id, status: 'completed' } });
      await settle();
      given++;
      if (asked() === before) break;
    }
    return given;
  }

  it('stops asking for follow-ups after the limit, and goes back to listening', async () => {
    const h = harness();
    await h.ready();
    expect(await loop(h, 20, 'a')).toBe(MAX_TOOL_FOLLOW_UPS_PER_TURN + 1);
    expect(h.worker.size).toBe(1);
    expect(h.logs.some((l) => l.event === 'voice_tool_follow_up_limit')).toBe(true);
    expect(h.logs.some((l) => l.error_class === 'InvalidTransition')).toBe(false);
    // every call the model made was still answered, so its conversation stays valid
    expect(h.of(h.model, 'type', 'conversation.item.create')).toHaveLength(MAX_TOOL_FOLLOW_UPS_PER_TURN + 1);
  });

  it('a new caller turn gets a fresh allowance, but the whole call has a limit', async () => {
    const h = harness();
    await h.ready();
    expect(await loop(h, 20, 'a')).toBe(MAX_TOOL_FOLLOW_UPS_PER_TURN + 1);
    expect(await loop(h, 20, 'b')).toBe(MAX_TOOL_FOLLOW_UPS_PER_TURN + 1);
    for (const t of ['c', 'd', 'e', 'f', 'g']) await loop(h, 20, t);
    expect(h.slotRuns()).toBeLessThanOrEqual(MAX_TOOL_CALLS_PER_CALL);
    expect(h.tools.some((t) => t.errorClass === 'ToolLimitReached')).toBe(true);
  });

  it.each(['incomplete', 'failed'])('an answer that ends %s returns the call to listening', async (status) => {
    const h = harness();
    await h.ready();
    await h.answer('resp_x', 'item_x', 2);
    await h.ev({ type: 'response.done', response: { id: 'resp_x', status } });
    await h.ev({ type: 'response.created', response: { id: 'resp_y' } }); // a fresh answer is accepted
    expect(h.logs.some((l) => l.error_class === 'InvalidTransition')).toBe(false);
    expect(h.of(h.model, 'type', 'response.cancel')).toHaveLength(0);
  });

  it('bounds one spoken answer', async () => {
    const h = harness();
    await h.start();
    expect((h.model[0] as { session: { max_output_tokens: number } }).session.max_output_tokens).toBe(2048);
  });
});
