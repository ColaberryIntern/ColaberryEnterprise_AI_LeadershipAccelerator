const create = jest.fn(); const emit = jest.fn().mockResolvedValue(undefined); const options: unknown[] = []; const settled: number[] = [];
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: (_c: unknown, o: unknown) => { options.push(o); return { responses: { create } }; } }));
jest.mock('../../aiEventService', () => ({ emitAiEvent: (e: unknown) => emit(e) }));
jest.mock('../signals/researchBudget', () => ({ withBudget: async (_p: unknown, _n: unknown, _e: unknown, call: () => Promise<{ value: unknown; costUsd: number }>) => { const r = await call(); settled.push(r.costUsd); return r.value; } }));
import { askAi, callCost } from '../aiCall';

/** WL3.3: paid calls are strict, redacted, logged, never retried, and never priced at zero. */
const call = { planId: 'p', purpose: 'topic_write', model: 'gpt-6.2-sol', system: 's', user: 'card 4111 1111 1111 1111', schema: {}, maxTokens: 10, reserveUsd: 0.3 };
beforeEach(() => { create.mockReset(); emit.mockClear(); settled.length = 0; });

it('prices by model, and at the reservation when the price or usage is unknown', () => {
  expect(callCost('gpt-6.2-sol', { input_tokens: 10_000, output_tokens: 10_000 }, 0.3)).toBeCloseTo(0.12, 6);
  expect([callCost('new-model', { input_tokens: 1 }, 0.3), callCost('gpt-6.2-sol', undefined, 0.3)]).toEqual([0.3, 0.3]);
});
it('sends a strict schema, redacts, records the event and settles the real cost', async () => {
  create.mockResolvedValue({ output_text: '{"a":1}', usage: { input_tokens: 10_000, output_tokens: 10_000, total_tokens: 20_000 } });
  expect(await askAi(call)).toEqual({ a: 1 });
  expect(create.mock.calls[0][0]).toMatchObject({ text: { format: { type: 'json_schema', strict: true } } });
  expect(create.mock.calls[0][0].input).not.toContain('4111 1111 1111 1111');
  expect(options[0]).toMatchObject({ maxRetries: 0 });
  expect(settled[0]).toBeCloseTo(0.12, 6);
  expect(emit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'success', workflow_id: 'weekly_live_topic_write' }));
});
it('a cut-off answer is null and still paid for', async () => {
  create.mockResolvedValue({ output_text: '{"a":', usage: { input_tokens: 1000, output_tokens: 10 } });
  expect(await askAi(call)).toBeNull();
  expect(settled[0]).toBeGreaterThan(0);
});
it('a failed call is recorded and rethrown', async () => {
  create.mockRejectedValue(new Error('down'));
  await expect(askAi(call)).rejects.toThrow('down');
  expect(emit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure' }));
});
