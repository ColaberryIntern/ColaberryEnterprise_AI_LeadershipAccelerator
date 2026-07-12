import { computeCostUsd, resolvePricingKey } from '../../utils/aiCost';

describe('aiCost (TBI audit P1-3)', () => {
  it('computes gpt-4o-mini cost (1000 in + 500 out)', () => {
    // 1000/1e6*0.15 + 500/1e6*0.60 = 0.00015 + 0.0003 = 0.00045
    expect(computeCostUsd('gpt-4o-mini', 1000, 500)).toBeCloseTo(0.00045, 6);
  });

  it('computes gpt-4o cost (1000 in + 1000 out)', () => {
    // 1000/1e6*2.5 + 1000/1e6*10 = 0.0025 + 0.01 = 0.0125
    expect(computeCostUsd('gpt-4o', 1000, 1000)).toBeCloseTo(0.0125, 6);
  });

  it('prices embeddings by the input rate', () => {
    expect(computeCostUsd('text-embedding-3-small', 1_000_000, 0)).toBeCloseTo(0.02, 6);
  });

  it('resolves date-suffixed model ids by prefix', () => {
    expect(resolvePricingKey('gpt-4o-2024-08-06')).toBe('gpt-4o');
    expect(resolvePricingKey('gpt-4o-mini-2024-07-18')).toBe('gpt-4o-mini');
  });

  it('prefers the longer key so mini never resolves to gpt-4o', () => {
    expect(resolvePricingKey('gpt-4o-mini')).toBe('gpt-4o-mini');
  });

  it('returns null for unknown models (never fabricates a cost)', () => {
    expect(computeCostUsd('some-unknown-model', 100, 100)).toBeNull();
    expect(resolvePricingKey('llama-3')).toBeNull();
  });
});
