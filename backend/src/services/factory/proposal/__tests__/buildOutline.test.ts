import { buildOutline } from '../buildOutline';

const sec = (over: Partial<Parameters<typeof buildOutline>[0]['sections'][number]> & { sectionKey: string; order: number }) => ({
  heading: `H ${over.sectionKey}`, requirementIds: [over.sectionKey], ...over,
});

describe('buildOutline', () => {
  it('orders sections by order and carries their requirement ids', () => {
    const out = buildOutline({
      docKey: 'technical',
      sections: [sec({ sectionKey: 'b', order: 2 }), sec({ sectionKey: 'a', order: 1 })],
    });
    expect(out.sections.map((s) => s.sectionKey)).toEqual(['a', 'b']);
    expect(out.sections[0].requirementIds).toEqual(['a']);
  });

  it('splits the page budget evenly when there is no factor share, rounded to the half, floored at 0.5', () => {
    const out = buildOutline({
      docKey: 'technical',
      pageLimit: 10,
      sections: [sec({ sectionKey: 'a', order: 1 }), sec({ sectionKey: 'b', order: 2 }), sec({ sectionKey: 'c', order: 3 }), sec({ sectionKey: 'd', order: 4 })],
    });
    // 10 / 4 = 2.5 each
    expect(out.sections.map((s) => s.pageBudget)).toEqual([2.5, 2.5, 2.5, 2.5]);
  });

  it('weights the budget by factor share and never budgets below 0.5', () => {
    const out = buildOutline({
      docKey: 'technical',
      pageLimit: 10,
      sections: [
        sec({ sectionKey: 'big', order: 1, factorShare: 0.8 }),
        sec({ sectionKey: 'tiny', order: 2, factorShare: 0.02 }),
      ],
    });
    expect(out.sections[0].pageBudget).toBe(8); // 10 * 0.8
    expect(out.sections[1].pageBudget).toBe(0.5); // 10 * 0.02 = 0.2 -> floored to 0.5
  });

  it('uses a null budget when there is no page limit', () => {
    const out = buildOutline({ docKey: 'technical', sections: [sec({ sectionKey: 'a', order: 1 })] });
    expect(out.pageLimit).toBeNull();
    expect(out.sections[0].pageBudget).toBeNull();
  });

  it('judges coverage: ok when every required id has a section, else lists the missing', () => {
    const base = { docKey: 'technical', sections: [sec({ sectionKey: 'a', order: 1 }), sec({ sectionKey: 'b', order: 2 })] };
    expect(buildOutline(base).coverage.ok).toBe(true); // required defaults to the covered union
    const gap = buildOutline({ ...base, requiredReqIds: ['a', 'b', 'c'] });
    expect(gap.coverage.ok).toBe(false);
    expect(gap.coverage.missingReqIds).toEqual(['c']);
    expect(gap.coverage).toMatchObject({ required: 3, covered: 2 });
  });

  it('names the document-level suggested artifacts, empty for an unknown doc', () => {
    expect(buildOutline({ docKey: 'past_performance', sections: [] }).suggestedArtifacts).toEqual(['reference project sheet']);
    expect(buildOutline({ docKey: 'mystery', sections: [] }).suggestedArtifacts).toEqual([]);
  });

  it('is total on garbage input', () => {
    const out = buildOutline({ docKey: '', sections: undefined as any, pageLimit: -4 });
    expect(out.sections).toEqual([]);
    expect(out.coverage.ok).toBe(true);
  });
});
