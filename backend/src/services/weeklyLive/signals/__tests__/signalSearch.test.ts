const create = jest.fn(); const emit = jest.fn().mockResolvedValue(undefined); const options: unknown[] = [];
jest.mock('../../../openaiInstrumented', () => ({ getInstrumentedOpenAI: (_c: unknown, o: unknown) => { options.push(o); return { responses: { create } }; } }));
jest.mock('../../../aiEventService', () => ({ emitAiEvent: (e: unknown) => emit(e) }));
jest.mock('../researchBudget', () => ({ withBudget: async (_p: unknown, _n: unknown, _e: unknown, call: () => Promise<{ value: unknown }>) => (await call()).value }));
import { MAX_CANDIDATES, searchGroup } from '../signalSearch';

/** WL3.1: the one Responses API call records its cost, redacts user text, and never retries on one reservation. */
const input = { planId: 'p1', from: '2026-11-16', to: '2026-11-24', airDate: '2026-11-30', forceNews: 'my card 4111 1111 1111 1111' };
beforeEach(() => { create.mockReset(); emit.mockClear(); });

it('records the call, redacts the prompt and does not retry', async () => {
  create.mockResolvedValue({ output: [{ type: 'web_search_call' }], output_text: '{"items":[]}', usage: { input_tokens: 10_000, output_tokens: 1000, total_tokens: 11_000 } });
  expect(await searchGroup([1, 6], input)).toEqual([]);
  expect(create.mock.calls[0][0].input).not.toContain('4111 1111 1111 1111');
  expect(options[0]).toMatchObject({ maxRetries: 0 });
  expect(emit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'success', workflow_id: 'weekly_live_signals', total_tokens: 11_000, cost_usd: expect.closeTo(0.045, 5) }));
});
it('records a failed call and rethrows', async () => {
  create.mockRejectedValue(Object.assign(new Error('slow down'), { status: 429 }));
  await expect(searchGroup([1, 6], input)).rejects.toThrow('slow down');
  expect(emit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure', error_class: expect.any(String) }));
});
it('limits the searches it pays for and the stories it hands on', async () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ headline: `Story number ${i}`, url: `https://a.com/${i}`, factors: [1] }));
  create.mockResolvedValue({ output: [], output_text: JSON.stringify({ items }), usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } });
  expect(await searchGroup([1, 6], input)).toHaveLength(MAX_CANDIDATES);
  expect(create.mock.calls[0][0]).toMatchObject({ max_tool_calls: 10, max_output_tokens: 8000 });
});
