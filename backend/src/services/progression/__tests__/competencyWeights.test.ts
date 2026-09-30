import { deriveCompetencyWeights } from '../competencyWeights';

describe('deriveCompetencyWeights', () => {
  it('passes through explicit [{domain_id, weight}] on the card', () => {
    const w = deriveCompetencyWeights({
      type: 'prompt_lab',
      competencies: [{ domain_id: 'architecture', weight: 3 }, { domain_id: 'testing', weight: 2 }],
    });
    expect(w).toEqual([
      { domain_id: 'architecture', weight: 3 },
      { domain_id: 'testing', weight: 2 },
    ]);
  });

  it('defaults a missing weight to 1', () => {
    const w = deriveCompetencyWeights({ type: 'prompt_lab', competencies: [{ domain_id: 'architecture' } as any] });
    expect(w).toEqual([{ domain_id: 'architecture', weight: 1 }]);
  });

  it('falls back to the type registry competencies at unit weight', () => {
    const w = deriveCompetencyWeights({ type: 'implementation_task', competencies: [] });
    const ids = w.map((x) => x.domain_id);
    expect(ids).toEqual(expect.arrayContaining(['architecture', 'testing', 'deployment']));
    expect(w.every((x) => x.weight === 1)).toBe(true);
  });

  it('returns [] for an unknown type with no explicit competencies', () => {
    expect(deriveCompetencyWeights({ type: 'no_such_type', competencies: [] })).toEqual([]);
  });
});
