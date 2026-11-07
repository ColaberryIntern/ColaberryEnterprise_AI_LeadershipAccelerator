import { outlineSectionsForDoc, assembleDraftHtml, createFirstProposalDraft, type DraftDocInput } from '../createProposalDraft';

const emptyGrounding: any = { title: 't', scoringFactors: [], rules: [], pageBudget: null, requirements: [], sections: [], artifacts: [], facts: [] };

describe('outlineSectionsForDoc', () => {
  it('uses the document sections when it has them', () => {
    const doc: DraftDocInput = { docKey: 'technical', title: 'T', requirementIds: ['R-1'], pageLimit: 10, sections: [{ sectionKey: 'a', heading: 'Approach', requirementIds: ['R-1'], order: 0, plan: 'p' }] };
    const out = outlineSectionsForDoc(doc);
    expect(out).toEqual([{ sectionKey: 'a', heading: 'Approach', requirementIds: ['R-1'], order: 0 }]);
  });

  it('falls back to one section per requirement when the document has no sections', () => {
    const out = outlineSectionsForDoc({ docKey: 'd', title: 'T', requirementIds: ['R-1', 'R-2'], pageLimit: null, sections: [] });
    expect(out.map((s) => s.sectionKey)).toEqual(['R-1', 'R-2']);
    expect(out[0].requirementIds).toEqual(['R-1']);
  });

  it('falls back to a single document-level section when there is nothing', () => {
    const out = outlineSectionsForDoc({ docKey: 'cover_letter', title: 'Cover', requirementIds: [], pageLimit: null, sections: [] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ sectionKey: 'document', heading: 'Cover', requirementIds: [] });
  });
});

describe('assembleDraftHtml (D2: no gap is lost)', () => {
  it('joins sections and leaves content untouched when every gap already has a marker', () => {
    const html = assembleDraftHtml(
      ['<h3>A</h3><p>[PLACEHOLDER: years in business]</p>', '<h3>B</h3>'],
      [{ question: 'years in business', suggestions: [] }],
      'd',
    );
    expect(html).toContain('<h3>A</h3>');
    expect(html).toContain('<h3>B</h3>');
    // the one gap is already a marker, so no extra marker is appended
    expect(html.match(/\[PLACEHOLDER:/g)).toHaveLength(1);
  });

  it('appends a marker for any structured gap the drafter did not placeholder in the content', () => {
    const html = assembleDraftHtml(
      ['<h3>A</h3><p>no markers here</p>'],
      [{ question: 'Who is the project manager?', suggestions: ['Jane Doe'] }],
      'd',
    );
    expect(html).toMatch(/\[PLACEHOLDER: Who is the project manager\?\]/);
  });

  it('is total on empty input', () => {
    expect(assembleDraftHtml([], [], 'd')).toBe('');
  });
});

describe('createFirstProposalDraft', () => {
  const doc: DraftDocInput = {
    docKey: 'technical', title: 'Technical Proposal', requirementIds: ['R-1', 'R-2'], pageLimit: 10,
    sections: [
      { sectionKey: 'a', heading: 'Approach', requirementIds: ['R-1'], order: 0, plan: 'hot button' },
      { sectionKey: 'b', heading: 'Plan', requirementIds: ['R-2'], order: 1 },
    ],
  };

  it('drafts every section in order, assembles + saves one version, and reports progress', async () => {
    const progress: string[] = [];
    const saveDraft = jest.fn(async () => {});
    const draftSection = jest.fn(async (s: { heading: string }) => ({ html: `<h3>${s.heading}</h3><p>body</p>`, gaps: [] as any[] }));
    const html = await createFirstProposalDraft({ doc, grounding: emptyGrounding, draftSection, saveDraft, onProgress: (m) => progress.push(m) });
    expect(draftSection).toHaveBeenCalledTimes(2);
    expect(html).toContain('<h3>Approach</h3>');
    expect(html).toContain('<h3>Plan</h3>');
    expect(saveDraft).toHaveBeenCalledWith(html);
    expect(progress[0]).toMatch(/Building the outline/);
    expect(progress.some((m) => /Drafting section 1\/2: Approach/.test(m))).toBe(true);
    expect(progress.some((m) => /Drafting section 2\/2: Plan/.test(m))).toBe(true);
  });

  it('carries the section plan through to the drafter', async () => {
    const seen: Array<string | null | undefined> = [];
    const draftSection = jest.fn(async (s: { heading: string; plan?: string | null }) => { seen.push(s.plan); return { html: `<h3>${s.heading}</h3>`, gaps: [] as any[] }; });
    await createFirstProposalDraft({ doc, grounding: emptyGrounding, draftSection, saveDraft: async () => {} });
    expect(seen).toEqual(['hot button', null]); // section a has a plan, section b does not
  });

  it('folds section gaps into the saved draft as markers (D2)', async () => {
    let saved = '';
    const draftSection = jest.fn(async (s: { heading: string }) => ({ html: `<h3>${s.heading}</h3>`, gaps: [{ question: `fact for ${s.heading}`, suggestions: [] }] }));
    await createFirstProposalDraft({ doc, grounding: emptyGrounding, draftSection, saveDraft: async (h) => { saved = h; } });
    expect(saved).toMatch(/\[PLACEHOLDER: fact for Approach\]/);
    expect(saved).toMatch(/\[PLACEHOLDER: fact for Plan\]/);
  });

  it('returns null (build failed) and saves nothing when no section could be drafted', async () => {
    const saveDraft = jest.fn(async () => {});
    const html = await createFirstProposalDraft({ doc, grounding: emptyGrounding, draftSection: async () => ({ html: '', gaps: [], error: 'no key' }), saveDraft });
    expect(html).toBeNull();
    expect(saveDraft).not.toHaveBeenCalled();
  });
});
