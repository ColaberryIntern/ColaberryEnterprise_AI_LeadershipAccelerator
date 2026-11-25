import { RelayConnection, MAX_MALFORMED, type RelayDeps } from '../../conversationRelayEngine';
import type { LlmTurnResult, VoiceLlm, VoiceMessage } from '../../claudeVoiceLlm';
import { ToolBroker, nextOpenSlotsTool } from '../../toolBroker';
import { TEST_PROFILE } from '../../voiceProfiles';
import { SessionWorker } from '../../../session/sessionWorker';
import { correlationKey, mintToken } from '../../../twilio/correlationToken';

const ACCOUNT = 'AC' + 'a7'.repeat(16);
const SID = 'CA' + 'b8'.repeat(16);
const CALL = '0b1c2d3e-4f50-4617-8899-aabbccddeeff';

/**
 * The Messages API's structural rule, enforced by the fake exactly as the real API's 400 would:
 * every assistant tool_use is IMMEDIATELY followed by a user message whose content begins with the
 * matching tool_result blocks, and no tool_result appears anywhere else.
 */
export function historyIsValid(messages: VoiceMessage[]): boolean {
  const blocks = (m: VoiceMessage) => (Array.isArray(m.content) ? (m.content as Array<{ type: string; id?: string; tool_use_id?: string }>) : []);
  for (let i = 0; i < messages.length; i++) {
    const uses = blocks(messages[i]).filter((b) => b.type === 'tool_use').map((b) => b.id);
    const results = blocks(messages[i]).filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id);
    if (results.length) {
      const prevUses = i > 0 ? blocks(messages[i - 1]).filter((b) => b.type === 'tool_use').map((b) => b.id) : [];
      if (messages[i].role !== 'user' || JSON.stringify([...results].sort()) !== JSON.stringify([...prevUses].sort())) return false;
    }
    if (uses.length) {
      const next = messages[i + 1];
      if (!next || next.role !== 'user') return false;
      const nextResults = blocks(next).filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id);
      if (JSON.stringify([...nextResults].sort()) !== JSON.stringify([...uses].sort())) return false;
    }
  }
  return true;
}

/** A scripted model turn: deltas, optional gate before each delta, then a stop. */
interface Script { deltas?: string[]; gateAt?: number; ignoreAbort?: boolean; tool?: { id: string; name: string; input?: unknown }; stop?: string; fail?: string }
function scriptedLlm(scripts: Script[]) {
  const calls: Array<{ messages: VoiceMessage[]; tools: number }> = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => { release = r; });
  const llm: VoiceLlm = {
    async streamTurn({ messages, tools, signal, onText }): Promise<LlmTurnResult> {
      calls.push({ messages: JSON.parse(JSON.stringify(messages)), tools: tools.length });
      if (!historyIsValid(messages)) return { ok: false, errorClass: 'LlmRequestRejected', aborted: false }; // what the real API's 400 becomes
      const s = scripts.shift() ?? { deltas: ['ok.'] };
      if (s.fail) return { ok: false, errorClass: s.fail, aborted: false };
      const deltas = s.deltas ?? [];
      for (let i = 0; i < deltas.length; i++) {
        if (s.gateAt === i) await gate;
        if (signal.aborted && !s.ignoreAbort) return { ok: false, errorClass: 'Aborted', aborted: true };
        onText(deltas[i]); // a provider flushing buffered tokens may still deliver after the abort (ignoreAbort)
      }
      if (s.tool) {
        return { ok: true, stopReason: 'tool_use', text: deltas.join(''), toolCalls: [{ id: s.tool.id, name: s.tool.name, input: s.tool.input ?? {} }],
          assistantContent: [...(deltas.length ? [{ type: 'text' as const, text: deltas.join('') }] : []), { type: 'tool_use' as const, id: s.tool.id, name: s.tool.name, input: s.tool.input ?? {} }] };
      }
      return { ok: true, stopReason: s.stop ?? 'end_turn', text: deltas.join(''), toolCalls: [], assistantContent: [{ type: 'text', text: deltas.join('') }] };
    },
  };
  return { llm, calls, release: () => release() };
}

function harness(scripts: Script[], over: Partial<RelayDeps> = {}, slotGate?: Promise<void>) {
  const sent: Array<Record<string, unknown>> = [];
  const closes: number[] = [];
  const logs: Record<string, unknown>[] = [];
  const tools: Record<string, unknown>[] = [];
  let slotCalls = 0;
  let now = 0;
  const worker = new SessionWorker({ now: () => now, log: (l) => logs.push(l), reconcile: async () => undefined, recordTool: (c, r) => tools.push({ c, ...r }) });
  const { llm, calls, release } = scriptedLlm(scripts);
  const used = new Set<string>();
  const deps: RelayDeps = {
    worker, llm, profile: TEST_PROFILE,
    broker: () => new ToolBroker([nextOpenSlotsTool(async () => { slotCalls++; if (slotGate) await slotGate; return { timezone: 'America/Chicago', dates: [{ date: '2026-12-01', slots: [{ start: '2026-12-01T16:00:00Z', end: '2026-12-01T16:30:00Z' }] }] }; })]),
    accountSid: () => ACCOUNT,
    consumeSessionRef: async (c) => { if (used.has(c.nonce)) return 'replay'; used.add(c.nonce); return 'consumed'; },
    callMatches: async (_id, sid) => sid === SID,
    now: () => Date.parse('2026-11-24T20:00:00Z'),
    log: (l) => logs.push(l),
    ...over,
  };
  const conn = new RelayConnection({ send: (t) => sent.push(JSON.parse(t)), close: (code) => closes.push(code ?? 1000) }, deps);
  const ref = mintToken(CALL, 'session', 120, Date.parse('2026-11-24T20:00:00Z'), correlationKey());
  const setup = (o: Partial<{ ref: string; accountSid: string; callSid: string }> = {}) => conn.onMessage(JSON.stringify({
    type: 'setup', sessionId: 'VX1', callSid: o.callSid ?? SID, accountSid: o.accountSid ?? ACCOUNT, direction: 'outbound-api', customParameters: { ref: o.ref ?? ref },
  }));
  const prompt = (voicePrompt: string) => conn.onMessage(JSON.stringify({ type: 'prompt', voicePrompt, lang: 'en-US', last: true }));
  const spoken = () => sent.filter((m) => m.type === 'text').map((m) => m.token).join('');
  return { conn, sent, closes, logs, tools, worker, calls, release, setup, prompt, spoken, ref, slotCalls: () => slotCalls, advance: (ms: number) => { now += ms; } };
}

describe('Engine A protocol: greeting, answer, end (VS2.3)', () => {
  it('the greeting discloses the AI before anything else is said', () => {
    expect(TEST_PROFILE.greeting).toMatch(/\bAI\b/);
    expect(TEST_PROFILE.greeting).toMatch(/not a person/i);
  });

  it('setup opens one session; a final prompt streams tokens and closes the talk cycle with last=true', async () => {
    const h = harness([{ deltas: ['Colaberry runs ', 'the Forward Deployed ', 'AI Engineer Accelerator.'] }]);
    await h.setup();
    expect(h.worker.size).toBe(1);
    await h.prompt('What does Colaberry do?');
    const texts = h.sent.filter((m) => m.type === 'text');
    expect(texts.map((m) => m.last)).toEqual([false, false, false, true]);
    expect(h.spoken()).toBe('Colaberry runs the Forward Deployed AI Engineer Accelerator.');
    expect(h.calls[0].messages[0]).toEqual({ role: 'user', content: '(call connected)' });
    expect(h.calls[0].messages[1]).toEqual({ role: 'assistant', content: TEST_PROFILE.greeting });
  });

  it('a non-final (partial) prompt does not start an answer', async () => {
    const h = harness([]);
    await h.setup();
    await h.conn.onMessage(JSON.stringify({ type: 'prompt', voicePrompt: 'What', last: false }));
    expect(h.calls).toHaveLength(0);
  });

  it('max call duration: the worker ends the call and Twilio is told to end', async () => {
    const h = harness([]);
    await h.setup();
    h.advance(180_000);
    h.worker.tick();
    expect(h.sent).toContainEqual({ type: 'end' });
  });

  it('the socket closing closes the session (caller hung up)', async () => {
    const h = harness([]);
    await h.setup();
    h.conn.onClose();
    expect(h.worker.size).toBe(0);
  });
});

describe('Engine A protocol: interruption (VS2.3)', () => {
  it('interrupt mid-sentence: nothing after the interrupt is spoken, the generation never resumes, history keeps only what was heard', async () => {
    const h = harness([{ deltas: ['Our next ', 'session starts ', 'on Monday.'], gateAt: 1 }, { deltas: ['Sure, go ahead.'] }]);
    await h.setup();
    const answering = h.prompt('Tell me about it');
    await new Promise((r) => setImmediate(r)); // first delta sent, model now blocked at the gate
    expect(h.spoken()).toBe('Our next ');
    await h.conn.onMessage(JSON.stringify({ type: 'interrupt', utteranceUntilInterrupt: 'Our next', durationUntilInterruptMs: 640 }));
    h.release(); // the model would have continued; it must not be heard
    await answering;
    expect(h.spoken()).toBe('Our next ');
    expect(h.sent.filter((m) => m.type === 'text' && m.last === true)).toHaveLength(0);
    await h.prompt('Wait, one question');
    expect(h.spoken()).toBe('Our next Sure, go ahead.');
    const history = h.calls[1].messages;
    expect(history).toContainEqual({ role: 'assistant', content: 'Our next' });
    expect(JSON.stringify(history)).not.toContain('Monday');
  });

  it('interrupt AFTER the answer finished streaming (Twilio still speaking it): history is cut to what was heard', async () => {
    const h = harness([{ deltas: ['Our next session ', 'starts on Monday.'] }, { deltas: ['Okay.'] }]);
    await h.setup();
    await h.prompt('When is the next session?');
    expect(h.spoken()).toBe('Our next session starts on Monday.'); // all streamed; the model was faster than speech
    await h.conn.onMessage(JSON.stringify({ type: 'interrupt', utteranceUntilInterrupt: 'Our next session', durationUntilInterruptMs: 900 }));
    await h.prompt('Sorry, go on');
    const history = h.calls[1].messages;
    expect(history).toContainEqual({ role: 'assistant', content: 'Our next session' });
    expect(JSON.stringify(history)).not.toContain('Monday');
    expect(h.logs.filter((l) => l.error_class === 'InvalidTransition')).toHaveLength(0);
  });

  it('a provider that keeps delivering tokens after the abort is still never heard (engine-side guards)', async () => {
    const h = harness([{ deltas: ['Our next ', 'session starts ', 'on Monday.'], gateAt: 1, ignoreAbort: true }, { deltas: ['Sure.'] }]);
    await h.setup();
    const answering = h.prompt('Tell me');
    await new Promise((r) => setImmediate(r));
    await h.conn.onMessage(JSON.stringify({ type: 'interrupt', utteranceUntilInterrupt: 'Our next' }));
    h.release();
    await answering;
    expect(h.spoken()).toBe('Our next ');
    await h.prompt('Question');
    const assistant = h.calls[1].messages.filter((m) => m.role === 'assistant').map((m) => m.content);
    expect(assistant).toEqual([TEST_PROFILE.greeting, 'Our next']); // heard part once; the canceled answer never lands in history
  });

  it('double interrupt is harmless and the call keeps working', async () => {
    const h = harness([{ deltas: ['One ', 'two'], gateAt: 1 }, { deltas: ['Back.'] }]);
    await h.setup();
    const a = h.prompt('go');
    await new Promise((r) => setImmediate(r));
    await h.conn.onMessage(JSON.stringify({ type: 'interrupt', utteranceUntilInterrupt: 'One' }));
    await h.conn.onMessage(JSON.stringify({ type: 'interrupt', utteranceUntilInterrupt: 'One' }));
    h.release();
    await a;
    await h.prompt('hello?');
    expect(h.spoken()).toBe('One Back.');
  });
});

describe('Engine A protocol: the read-only tool (VS2.3)', () => {
  it('a tool request runs the tool once, records it, then speaks the answer', async () => {
    const h = harness([{ deltas: ['Let me check. '], tool: { id: 'toolu_1', name: 'next_open_strategy_slots' } }, { deltas: ['I have Tuesday at 10.'] }]);
    await h.setup();
    await h.prompt('When can I talk to someone?');
    expect(h.slotCalls()).toBe(1);
    expect(h.spoken()).toBe('Let me check. I have Tuesday at 10.');
    expect(h.tools).toEqual([expect.objectContaining({ toolCallId: 'toolu_1', name: 'next_open_strategy_slots', committed: false, afterClose: false })]);
    const second = h.calls[1].messages;
    const toolResult = second[second.length - 1];
    expect(JSON.stringify(toolResult)).toContain('Open strategy call times');
    expect(JSON.stringify(second)).not.toMatch(/Let me check\. Let me check/);
  });

  it('the same tool-call id is never run twice (idempotent broker)', async () => {
    const broker = new ToolBroker([nextOpenSlotsTool(async () => ({ timezone: 'America/Chicago', dates: [] }))]);
    let n = 0;
    const counting = new ToolBroker([{ ...nextOpenSlotsTool(async () => ({ timezone: 'America/Chicago', dates: [] })), run: async () => { n++; return 'x'; } }]);
    await Promise.all([counting.run('t1', 'next_open_strategy_slots', {}), counting.run('t1', 'next_open_strategy_slots', {})]);
    await counting.run('t1', 'next_open_strategy_slots', {});
    expect(n).toBe(1);
    expect((await broker.run('t9', 'next_open_strategy_slots', {})).content).toMatch(/No open strategy call times/);
  });

  it('unknown tool, invalid input, failure and timeout all become speakable error results, never throws', async () => {
    const slow = new ToolBroker([{ ...nextOpenSlotsTool(async () => ({ timezone: 'UTC', dates: [] })), run: () => new Promise<string>(() => undefined) }], 20);
    const failing = new ToolBroker([{ ...nextOpenSlotsTool(async () => ({ timezone: 'UTC', dates: [] })), run: async () => { throw new Error('503'); } }]);
    const b = new ToolBroker([nextOpenSlotsTool(async () => ({ timezone: 'UTC', dates: [] }))]);
    expect(await b.run('a', 'book_anything', {})).toMatchObject({ isError: true, errorClass: 'UnknownTool' });
    expect(await b.run('b', 'next_open_strategy_slots', { injected: 'x' })).toMatchObject({ isError: true, errorClass: 'ValidationError' });
    expect(await failing.run('c', 'next_open_strategy_slots', {})).toMatchObject({ isError: true, errorClass: 'ToolFailed', committed: false });
    expect(await slow.run('d', 'next_open_strategy_slots', {})).toMatchObject({ isError: true, errorClass: 'TimeoutError' });
  });

  it('a model that keeps calling tools is stopped after the round limit with a spoken apology', async () => {
    const loop = (id: string): Script => ({ tool: { id, name: 'next_open_strategy_slots' } });
    const h = harness([loop('t1'), loop('t2'), { deltas: ['final'] }]);
    await h.setup();
    await h.prompt('slots?');
    expect(h.calls.map((c) => c.tools)).toEqual([1, 1, 0]); // last round offers no tools
    expect(h.spoken()).toBe('final');
  });
});

describe('Engine A protocol: the caller acts while a tool is running (VS2.3, verifier attempt 1)', () => {
  const tick = () => new Promise((r) => setImmediate(r));
  function gated() { let open: () => void = () => undefined; const gate = new Promise<void>((r) => { open = r; }); return { gate, open: () => open() }; }

  it.each([
    ['speaks again (a new turn)', (h: ReturnType<typeof harness>) => h.prompt('actually never mind')],
    ['interrupts the filler line', (h: ReturnType<typeof harness>) => h.conn.onMessage(JSON.stringify({ type: 'interrupt', utteranceUntilInterrupt: 'Let me' }))],
  ])('caller %s mid-tool: history stays valid, the tool ran once, and later turns are answered normally', async (_n, act) => {
    const g = gated();
    const h = harness([
      { deltas: ['Let me check. '], tool: { id: 'toolu_9', name: 'next_open_strategy_slots' } },
      { deltas: ['No problem.'] }, { deltas: ['Sure, here.'] }, { deltas: ['Third answer.'] },
    ], {}, g.gate);
    await h.setup();
    const first = h.prompt('slots?');
    await tick(); await tick(); // the model asked for the tool; the tool is now blocked
    const during = act(h);
    g.open(); // the tool finishes AFTER the caller acted
    await first; await during;
    await h.prompt('one more thing');
    await h.prompt('and another');
    expect(h.slotCalls()).toBe(1);
    expect(h.calls.every((c) => historyIsValid(c.messages))).toBe(true);
    expect(h.spoken()).not.toMatch(/Sorry, I had trouble/);
    expect(h.logs.filter((l) => l.event === 'voice_llm_turn_failed')).toHaveLength(0);
    expect(h.tools).toEqual([expect.objectContaining({ toolCallId: 'toolu_9', afterClose: false })]); // still recorded
    // The round went stale while the tool ran: it is dropped, never replayed after the caller's newer words.
    expect(JSON.stringify(h.calls[h.calls.length - 1].messages)).not.toContain('toolu_9');
  });
});

describe('Engine A protocol: DTMF, provider errors, language (VS2.3)', () => {
  it('a keypad press becomes a caller turn the model can answer', async () => {
    const h = harness([{ deltas: ['You pressed five.'] }]);
    await h.setup();
    await h.conn.onMessage(JSON.stringify({ type: 'dtmf', digit: '5' }));
    expect(h.calls[0].messages[h.calls[0].messages.length - 1]).toEqual({ role: 'user', content: '(The caller pressed 5 on the keypad.)' });
    expect(h.spoken()).toBe('You pressed five.');
  });

  it('a provider error frame is logged with an error class and the call continues', async () => {
    const h = harness([{ deltas: ['Still here.'] }]);
    await h.setup();
    await h.conn.onMessage(JSON.stringify({ type: 'error', description: 'tts hiccup' }));
    expect(h.logs).toContainEqual(expect.objectContaining({ event: 'voice_relay_provider_error', error_class: 'RelayProviderError' }));
    await h.prompt('hello?');
    expect(h.spoken()).toBe('Still here.');
    expect(h.closes).toEqual([]);
  });

  it('a supported language change switches Relay once; an unsupported one is ignored', async () => {
    const h = harness([{ deltas: ['Hola.'] }, { deltas: ['Claro.'] }, { deltas: ['Ok.'] }]);
    await h.setup();
    await h.conn.onMessage(JSON.stringify({ type: 'prompt', voicePrompt: 'hola', lang: 'es-US', last: true }));
    await h.conn.onMessage(JSON.stringify({ type: 'prompt', voicePrompt: 'gracias', lang: 'es-US', last: true }));
    await h.conn.onMessage(JSON.stringify({ type: 'prompt', voicePrompt: 'bonjour', lang: 'fr-FR', last: true }));
    expect(h.sent.filter((m) => m.type === 'language')).toEqual([{ type: 'language', ttsLanguage: 'es-US', transcriptionLanguage: 'es-US' }]);
  });
});

describe('Engine A protocol: refusals, errors and limits (VS2.3)', () => {
  it('an LLM failure speaks a short apology and the call returns to listening', async () => {
    const h = harness([{ fail: 'UpstreamUnavailable' }]);
    await h.setup();
    await h.prompt('hello');
    expect(h.spoken()).toMatch(/Sorry, I had trouble/);
    expect(h.logs).toContainEqual(expect.objectContaining({ event: 'voice_llm_turn_failed', error_class: 'UpstreamUnavailable' }));
  });

  it('a refusal that survives the fallback chain gets a safe line, not silence', async () => {
    const h = harness([{ deltas: [], stop: 'refusal' }]);
    await h.setup();
    await h.prompt('something off-limits');
    expect(h.spoken()).toMatch(/teammate can follow up/);
  });

  it('a runaway answer is cut at the response-length limit and closed with last=true', async () => {
    const h = harness([{ deltas: Array.from({ length: 40 }, () => 'x'.repeat(50)) }]);
    await h.setup();
    await h.prompt('talk forever');
    expect(h.spoken().length).toBeLessThanOrEqual(1_200 + 50); // the limit plus at most the delta that crossed it
    expect(h.sent.filter((m) => m.type === 'text' && m.last === true).length).toBeGreaterThanOrEqual(1);
  });
});

describe('Engine A protocol: setup and malformed input (VS2.3)', () => {
  it.each([
    ['a forged ref', { ref: 'abc.def' }, 'session_ref_bad_signature'],
    ['another account', { accountSid: 'AC' + 'ff'.repeat(16) }, 'account_mismatch'],
    ['a CallSid that is not this call', { callSid: 'CA' + 'cc'.repeat(16) }, 'call_sid_mismatch'],
  ])('refuses %s and opens no session', async (_n, o, reason) => {
    const h = harness([]);
    await h.setup(o);
    expect(h.worker.size).toBe(0);
    expect(h.closes).toEqual([1008]);
    expect(h.logs).toContainEqual(expect.objectContaining({ reason }));
  });

  it('a replayed session ref (second socket, same ref) is refused', async () => {
    const h = harness([]);
    await h.setup();
    const h2 = harness([], { consumeSessionRef: async () => 'replay' });
    await h2.setup({ ref: h.ref });
    expect(h2.closes).toEqual([1008]);
  });

  it('a message before setup closes the socket', async () => {
    const h = harness([]);
    await h.prompt('hello');
    expect(h.closes).toEqual([1008]);
  });

  it(`one malformed frame is logged and ignored; ${MAX_MALFORMED} close the socket (1007)`, async () => {
    const h = harness([{ deltas: ['fine'] }]);
    await h.setup();
    await h.conn.onMessage('{not json');
    await h.conn.onMessage(JSON.stringify({ type: 'prompt', voicePrompt: 42 }));
    await h.prompt('still there?');
    expect(h.spoken()).toBe('fine');
    for (let i = 0; i < MAX_MALFORMED; i++) await h.conn.onMessage('garbage');
    expect(h.closes).toEqual([1007]);
    expect(h.logs.filter((l) => l.event === 'voice_relay_frame_rejected').length).toBeGreaterThanOrEqual(MAX_MALFORMED);
  });

  it('logs never contain the caller transcript', async () => {
    const h = harness([{ fail: 'TimeoutError' }]);
    await h.setup();
    await h.prompt('my secret account number is 12345');
    expect(JSON.stringify(h.logs)).not.toContain('secret account');
  });
});

it('VS3.5: a tool the broker refuses reaches the durable record with its error class', async () => {
  const h = harness([{ tool: { id: 'no', name: 'book_meeting' } }, { deltas: ['Sorry.'] }, { tool: { id: 'yes', name: 'next_open_strategy_slots' } }, { deltas: ['Ok.'] }]);
  await h.setup();
  await h.prompt('book me');
  await h.prompt('when are you free');
  expect(h.tools.map((t) => [t.name, t.errorClass])).toEqual([['book_meeting', 'UnknownTool'], ['next_open_strategy_slots', undefined]]);
});
