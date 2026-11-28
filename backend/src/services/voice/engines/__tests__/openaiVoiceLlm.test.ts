import OpenAI from 'openai';
import { classifyOpenAiError, createOpenAiVoiceLlm, toOpenAiMessages, toOpenAiTools } from '../openaiVoiceLlm';
import { ENGINE_A_LIMITS, type VoiceMessage, type VoiceToolDef } from '../claudeVoiceLlm';

type Chunk = { choices: Array<{ delta: Record<string, unknown>; finish_reason?: string | null }> };
const chunk = (delta: Record<string, unknown>, finish: string | null = null): Chunk => ({ choices: [{ delta, finish_reason: finish }] });
async function* streamOf(chunks: Chunk[], onEach?: (i: number) => void) { for (const [i, c] of chunks.entries()) { onEach?.(i); yield c; } }

const client = (impl: (body: Record<string, unknown>, opts: Record<string, unknown>) => unknown) => {
  const create = jest.fn(async (b: Record<string, unknown>, o: Record<string, unknown>) => impl(b, o));
  return { create, make: () => ({ chat: { completions: { create } } }) as never };
};
const TOOL: VoiceToolDef = { name: 'next_open_strategy_slots', description: 'Open slots', input_schema: { type: 'object', properties: { days: { type: 'number' } } } } as VoiceToolDef;
const turn = (over: Partial<{ tools: VoiceToolDef[]; messages: VoiceMessage[]; signal: AbortSignal }> = {}) => {
  const heard: string[] = [];
  return { heard, args: { system: 'Be brief.', messages: [{ role: 'user', content: 'When can we talk?' }] as VoiceMessage[], tools: [TOOL], signal: new AbortController().signal, onText: (d: string) => heard.push(d), ...over } };
};

describe('translation to Chat Completions', () => {
  it('tools become functions with the same schema', () => {
    expect(toOpenAiTools([TOOL])).toEqual([{ type: 'function', function: { name: 'next_open_strategy_slots', description: 'Open slots', parameters: TOOL.input_schema } }]);
  });
  it('history keeps its order; a tool use and its result pair up by id', () => {
    const msgs: VoiceMessage[] = [
      { role: 'user', content: 'Book me' },
      { role: 'assistant', content: [{ type: 'text', text: 'Checking.' }, { type: 'tool_use', id: 'call_1', name: 'next_open_strategy_slots', input: { days: 3 } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: [{ type: 'text', text: 'Tue 2 PM' }] }] },
      { role: 'user', content: [{ type: 'text', text: 'Tuesday works' }] },
    ] as VoiceMessage[];
    expect(toOpenAiMessages('S', msgs)).toEqual([
      { role: 'system', content: 'S' },
      { role: 'user', content: 'Book me' },
      { role: 'assistant', content: 'Checking.', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'next_open_strategy_slots', arguments: '{"days":3}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: 'Tue 2 PM' },
      { role: 'user', content: 'Tuesday works' },
    ]);
  });
  it('a tool use with no text sends null content; a failed tool result still answers its call', () => {
    const out = toOpenAiMessages('S', [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'c', name: 'x', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c', is_error: true, content: '' }] },
    ] as VoiceMessage[]);
    expect(out.slice(1)).toEqual([{ role: 'assistant', content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'x', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'c', content: 'error' }]);
  });
  it('a block it cannot carry is refused, not dropped', () => {
    expect(() => toOpenAiMessages('S', [{ role: 'user', content: [{ type: 'image', source: {} }] }] as unknown as VoiceMessage[])).toThrow(expect.objectContaining({ name: 'ContractViolation' }));
  });
});

describe('a streamed turn', () => {
  it('speaks each word as it arrives, with the same limits as the Claude path and no retries', async () => {
    const c = client(() => streamOf([chunk({ content: 'Tuesday ' }), chunk({ content: 'at two.' }), chunk({}, 'stop')]));
    const t = turn();
    const r = await createOpenAiVoiceLlm('gpt-4o', c.make).streamTurn(t.args);
    expect(t.heard).toEqual(['Tuesday ', 'at two.']);
    expect(r).toEqual({ ok: true, stopReason: 'end_turn', text: 'Tuesday at two.', toolCalls: [], assistantContent: [{ type: 'text', text: 'Tuesday at two.' }] });
    const [body, opts] = c.create.mock.calls[0];
    expect(body).toMatchObject({ model: 'gpt-4o', stream: true, max_completion_tokens: ENGINE_A_LIMITS.maxTokens, parallel_tool_calls: false });
    expect(opts).toMatchObject({ timeout: ENGINE_A_LIMITS.timeoutMs, maxRetries: 0, signal: t.args.signal });
  });
  it('assembles a tool call streamed in pieces and returns it in the shape the engine keeps', async () => {
    const c = client(() => streamOf([
      chunk({ tool_calls: [{ index: 0, id: 'call_9', function: { name: 'next_open_strategy_slots', arguments: '{"da' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: 'ys":3}' } }] }),
      chunk({}, 'tool_calls'),
    ]));
    const r = await createOpenAiVoiceLlm('gpt-4o', c.make).streamTurn(turn().args);
    expect(r).toEqual({ ok: true, stopReason: 'tool_use', text: '', toolCalls: [{ id: 'call_9', name: 'next_open_strategy_slots', input: { days: 3 } }], assistantContent: [{ type: 'tool_use', id: 'call_9', name: 'next_open_strategy_slots', input: { days: 3 } }] });
  });
  it.each([['arguments that are not JSON', '{"days":'], ['arguments that are not an object', '[1]']])('%s are a ContractViolation, never a guessed call', async (_n, args) => {
    const c = client(() => streamOf([chunk({ tool_calls: [{ index: 0, id: 'c', function: { name: 'x', arguments: args } }] }), chunk({}, 'tool_calls')]));
    expect(await createOpenAiVoiceLlm('gpt-4o', c.make).streamTurn(turn().args)).toEqual({ ok: false, errorClass: 'ContractViolation', aborted: false });
  });
  it.each([['a refusal', [chunk({ refusal: 'I cannot help' }), chunk({}, 'stop')], 'refusal'], ['a filtered answer', [chunk({}, 'content_filter')], 'refusal'], ['a cut-off answer', [chunk({ content: 'a' }), chunk({}, 'length')], 'max_tokens']])('%s is reported', async (_n, chunks, stop) => {
    const r = await createOpenAiVoiceLlm('gpt-4o', client(() => streamOf(chunks as Chunk[])).make).streamTurn(turn().args);
    expect(r).toMatchObject({ ok: true, stopReason: stop });
  });
  it('after an interruption nothing more is spoken', async () => {
    const ac = new AbortController();
    const c = client(() => streamOf([chunk({ content: 'one ' }), chunk({ content: 'two ' }), chunk({ content: 'three' })], (i) => { if (i === 1) ac.abort(); }));
    const t = turn({ signal: ac.signal });
    expect(await createOpenAiVoiceLlm('gpt-4o', c.make).streamTurn(t.args)).toEqual({ ok: false, errorClass: 'Aborted', aborted: true });
    expect(t.heard).toEqual(['one ']);
  });
  it('no tools means no tool settings are sent', async () => {
    const c = client(() => streamOf([chunk({}, 'stop')]));
    await createOpenAiVoiceLlm('gpt-4o', c.make).streamTurn(turn({ tools: [] }).args);
    expect(c.create.mock.calls[0][0]).not.toHaveProperty('tools');
    expect(c.create.mock.calls[0][0]).not.toHaveProperty('parallel_tool_calls');
  });
  it('a missing key is ConfigMissing on the turn, not a crash when the call is set up', async () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const llm = createOpenAiVoiceLlm('gpt-4o');
      expect(await llm.streamTurn(turn().args)).toEqual({ ok: false, errorClass: 'ConfigMissing', aborted: false });
    } finally { if (saved !== undefined) process.env.OPENAI_API_KEY = saved; }
  });
  it('the client is made once, on the first turn', async () => {
    const c = client(() => streamOf([chunk({}, 'stop')]));
    const make = jest.fn(c.make);
    const llm = createOpenAiVoiceLlm('gpt-4o', make);
    expect(make).not.toHaveBeenCalled();
    await llm.streamTurn(turn().args);
    await llm.streamTurn(turn().args);
    expect(make).toHaveBeenCalledTimes(1);
  });
});

describe('error classes', () => {
  const live = new AbortController().signal;
  const h = new Headers();
  it.each<[string, unknown, string]>([
    ['rate limited', new OpenAI.RateLimitError(429, {}, 'x', h), 'RateLimitError'],
    ['bad key', new OpenAI.AuthenticationError(401, {}, 'x', h), 'AuthError'],
    ['no permission', new OpenAI.PermissionDeniedError(403, {}, 'x', h), 'AuthError'],
    ['timeout', new OpenAI.APIConnectionTimeoutError(), 'TimeoutError'],
    ['no connection', new OpenAI.APIConnectionError({ message: 'x' }), 'UpstreamUnavailable'],
    ['server error', new OpenAI.InternalServerError(500, {}, 'x', h), 'UpstreamUnavailable'],
    ['bad request', new OpenAI.BadRequestError(400, {}, 'x', h), 'LlmRequestRejected'],
    ['anything else', new Error('x'), 'LlmStreamError'],
  ])('%s', (_n, e, cls) => expect(classifyOpenAiError(e, live)).toEqual({ errorClass: cls, aborted: false }));
  it('an abort wins over anything else', () => {
    const ac = new AbortController();
    ac.abort();
    expect(classifyOpenAiError(new Error('x'), ac.signal)).toEqual({ errorClass: 'Aborted', aborted: true });
    expect(classifyOpenAiError(new OpenAI.APIUserAbortError(), live)).toEqual({ errorClass: 'Aborted', aborted: true });
  });
  it('a failing provider is an outcome, never a throw', async () => {
    const c = client(() => { throw new OpenAI.RateLimitError(429, {}, 'x', h); });
    expect(await createOpenAiVoiceLlm('gpt-4o', c.make).streamTurn(turn().args)).toEqual({ ok: false, errorClass: 'RateLimitError', aborted: false });
  });
});
