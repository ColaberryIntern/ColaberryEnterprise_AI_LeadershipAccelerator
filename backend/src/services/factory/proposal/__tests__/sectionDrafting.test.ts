import {
  docTypeTemplate,
  sectionReferenceLine,
  buildSectionDraftPrompt,
  gapsToNeeds,
  draftProposalSectionAI,
} from '../sectionDrafting';
import { buildGrounding } from '../proposalGrounding';

describe('docTypeTemplate', () => {
  it('returns a type-specific instruction for a known document, and a safe default otherwise', () => {
    expect(docTypeTemplate('past_performance')).toMatch(/reference as a structured entry/i);
    expect(docTypeTemplate('cover_letter')).toMatch(/transmittal letter/i);
    expect(docTypeTemplate('mystery')).toMatch(/clear, professional government-proposal narrative/i);
  });
});

describe('sectionReferenceLine', () => {
  it('names the requirement(s) the section answers, singular vs plural, empty when none', () => {
    expect(sectionReferenceLine(['R-1'])).toBe('This section responds to requirement R-1.');
    expect(sectionReferenceLine(['R-1', 'R-2'])).toBe('This section responds to requirements R-1, R-2.');
    expect(sectionReferenceLine([])).toBe('');
    expect(sectionReferenceLine(undefined as any)).toBe('');
  });
});

describe('buildSectionDraftPrompt', () => {
  const grounding = buildGrounding({
    blueprint: null,
    document: { title: 'Technical Proposal', requirements: [{ canonicalReqId: 'R-1', statement: 'Provide a transition plan.' }], sections: [] },
    approvedFacts: ['Years in business: 8'],
  });

  it('assembles the grounding, the reference line, the doc-type guidance, and the page budget into the user prompt', () => {
    const { system, user } = buildSectionDraftPrompt({
      docKey: 'past_performance',
      docTitle: 'Past Performance',
      section: { heading: 'Reference Projects', requirementIds: ['R-1', 'R-2'], pageBudget: 2, plan: 'hot button → feature → benefit' },
      grounding,
    });
    expect(system).toMatch(/draft ONE section/i);
    expect(user).toMatch(/Section to draft: "Reference Projects"/);
    expect(user).toMatch(/responds to requirements R-1, R-2/);
    expect(user).toMatch(/reference as a structured entry/i); // the doc-type template
    expect(user).toMatch(/about 2 page\(s\)/);
    expect(user).toMatch(/hot button → feature → benefit/);
    expect(user).toMatch(/Years in business: 8/); // grounding facts are the only assertable facts
  });

  it('omits the budget and plan lines when they are absent, and still carries the grounding', () => {
    const { user } = buildSectionDraftPrompt({
      docKey: 'technical',
      docTitle: 'Technical',
      section: { heading: 'Approach', requirementIds: ['R-9'] },
      grounding,
    });
    expect(user).not.toMatch(/Target length/);
    expect(user).not.toMatch(/Section plan/);
    expect(user).toMatch(/responds to requirement R-9/);
  });
});

describe('gapsToNeeds', () => {
  it('turns structured gaps into typed fact needs, deduped by fact key, suggestions → options, usedIn tagged', () => {
    const needs = gapsToNeeds(
      [
        { question: 'How many years in business?', suggestions: ['8'] },
        { question: 'How many years in business?', suggestions: ['8 years'] }, // same key, merges
        { question: 'Name the project reference', suggestions: [] },
      ],
      'past_performance',
      { sectionKey: 'refs' },
    );
    expect(needs).toHaveLength(2);
    const years = needs.find((n) => n.ask.startsWith('How many years'))!;
    expect(years.need.kind).toBe('fact');
    expect(years.need.blocking).toBe('fatal');
    expect(years.need.options).toEqual(['8', '8 years']); // merged across the two gaps
    expect(years.need.usedIn).toEqual([{ docKey: 'past_performance', sectionKey: 'refs' }]);
    const ref = needs.find((n) => n.ask.startsWith('Name the project'))!;
    expect(ref.need.options).toBeUndefined(); // no suggestions ⇒ no options key
  });

  it('is total on empty / junk input', () => {
    expect(gapsToNeeds([], 'd')).toEqual([]);
    expect(gapsToNeeds(undefined, 'd')).toEqual([]);
    expect(gapsToNeeds([{ question: '   ' }, { suggestions: ['x'] } as any], 'd')).toEqual([]);
  });
});

describe('draftProposalSectionAI (fail-soft)', () => {
  const OLD = process.env.OPENAI_API_KEY;
  afterEach(() => { if (OLD === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = OLD; });

  it('returns an error (never throws) when no API key is configured', async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await draftProposalSectionAI({ docKey: 'technical', docTitle: 'T', section: { heading: 'Approach', requirementIds: ['R-1'] }, grounding: {} as any });
    expect(r.error).toMatch(/unavailable/i);
    expect(r.html).toBe('');
  });

  it('returns an error when the section has nothing to draft from', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const r = await draftProposalSectionAI({ docKey: 'technical', docTitle: 'T', section: { heading: '', requirementIds: [] }, grounding: {} as any });
    expect(r.error).toMatch(/nothing to draft/i);
  });
});
