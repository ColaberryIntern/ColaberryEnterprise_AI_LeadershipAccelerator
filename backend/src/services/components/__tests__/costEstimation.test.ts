import { estimateTokens, estimate, estimateComponent, MODEL_PRICING } from '../costEstimationService';
import { resolvePrompt } from '../promptTesterService';

describe('costEstimationService', () => {
  it('estimates tokens at ~4 chars/token; empty -> 0', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('prices input + output against the model table', () => {
    const e = estimate('a'.repeat(4000), 1000, 'gpt-4o-mini'); // 1000 input tokens
    const p = MODEL_PRICING['gpt-4o-mini'];
    const expected = (1000 * p.input_per_1m + 1000 * p.output_per_1m) / 1_000_000;
    expect(e.input_tokens).toBe(1000);
    expect(e.output_tokens).toBe(1000);
    expect(e.cost_usd).toBeCloseTo(Number(expected.toFixed(6)), 6);
    expect(e.runtime_ms).toBeGreaterThan(p.base_latency_ms);
  });

  it('unknown model falls back to the default pricing (never throws)', () => {
    const e = estimate('hello', 100, 'nonexistent-model');
    expect(e.cost_usd).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(e.runtime_ms)).toBe(true);
  });

  it('scales expected output by component difficulty', () => {
    const base = { generation_prompt: 'x'.repeat(400) };
    const intro = estimateComponent({ ...base, difficulty: 'intro' });
    const stretch = estimateComponent({ ...base, difficulty: 'stretch' });
    expect(stretch.output_tokens).toBeGreaterThan(intro.output_tokens);
    expect(stretch.cost_usd).toBeGreaterThan(intro.cost_usd);
  });
});

describe('resolvePrompt', () => {
  it('substitutes {{var}} and {var} placeholders', () => {
    expect(resolvePrompt('Week {{week}} on {topic}', { week: '2', topic: 'RAG' })).toBe('Week 2 on RAG');
  });
  it('leaves unknown placeholders visible (never crashes on missing vars)', () => {
    expect(resolvePrompt('Hi {{name}}', {})).toBe('Hi {{name}}');
  });
});
