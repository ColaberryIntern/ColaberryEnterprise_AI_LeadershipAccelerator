import { MAX_NAICS, WORK_NAICS, naicsPromptBlock, nonWorkCodeWarnings, pickNaics } from '../serviceGapNaics';
import { retrieveCandidates } from '../serviceGapRetrieval';
import { finalizeRecommendation } from '../serviceGapValidate';
import { CATALOG, ev } from './serviceGapFixtures';

describe('pickNaics - closed list only', () => {
  it('keeps work codes with their official titles, marked against the target service', () => {
    expect(pickNaics(['541511', '611420'], ['541511'])).toEqual([
      { code: '541511', title: 'Custom Computer Programming Services', onTarget: true },
      { code: '611420', title: 'Computer Training', onTarget: false },
    ]);
  });

  it('drops invented codes, client-industry codes, malformed and duplicate values', () => {
    const out = pickNaics(['221118', '999999', '54151', '5415111', 'abc', null, 541512, '541512', '541512 - Computer Systems Design']);
    expect(out.map((n) => n.code)).toEqual(['541512']);
  });

  it('reads a code out of "code - title" text and caps the list', () => {
    expect(pickNaics(['541511 Custom Computer Programming Services'])[0].code).toBe('541511');
    expect(pickNaics(Object.keys(WORK_NAICS))).toHaveLength(MAX_NAICS);
  });

  it('returns nothing for a non-array answer', () => {
    for (const v of [undefined, null, '541511', { a: 1 }]) expect(pickNaics(v)).toEqual([]);
  });

  it('every listed code is 6 digits with a title, and the prompt shows all of them', () => {
    const block = naicsPromptBlock();
    for (const [code, title] of Object.entries(WORK_NAICS)) {
      expect(code).toMatch(/^\d{6}$/);
      expect(title.length).toBeGreaterThan(5);
      expect(block).toContain(`${code} ${title}`);
    }
  });

  it('flags non-work codes already on a service, without removing anything', () => {
    expect(nonWorkCodeWarnings('Automated Customer Service Solutions', ['221118', '541511'])).toEqual([
      expect.stringContaining('NAICS 221118, which is not a work-performed code'),
    ]);
    expect(nonWorkCodeWarnings('X', ['541511'])).toEqual([]);
  });
});

describe('finalizeRecommendation - NAICS on every decision', () => {
  const ctxWith = (naicsByName: Record<string, string[]>) => {
    const catalog = CATALOG.map((s) => ({ ...s, naicsCodes: naicsByName[s.name] ?? [] }));
    const evidence = ev();
    const refs = new Map(retrieveCandidates(evidence, catalog).map((c, i) => [`S${i + 1}`, c] as const));
    return { refs, catalog, evidence };
  };
  const refOf = (ctx: ReturnType<typeof ctxWith>, name: string): string => Array.from(ctx.refs.entries()).find(([, s]) => s.name === name)![0];

  it('MATCH: suggested codes are marked on/not on the matched service, and its non-work codes are warned', () => {
    const ctx = ctxWith({ 'Computer Vision & Industrial AI': ['541511', '221118'] });
    const cv = refOf(ctx, 'Computer Vision & Industrial AI');
    const r = finalizeRecommendation({ decision: 'MATCH_EXISTING', targetRef: cv, naics: ['541511', '541330', '221118'] }, ctx);
    expect(r.naics).toEqual([
      { code: '541511', title: 'Custom Computer Programming Services', onTarget: true },
      { code: '541330', title: 'Engineering Services', onTarget: false },
    ]);
    expect(r.naicsWarnings).toEqual([expect.stringContaining('221118')]);
  });

  it('EXPAND: the codes the service lacks travel with the expansion as naicsToAdd', () => {
    const ctx = ctxWith({ 'Computer Vision & Industrial AI': ['541511'] });
    const cv = refOf(ctx, 'Computer Vision & Industrial AI');
    const r = finalizeRecommendation({ decision: 'EXPAND_EXISTING', targetRef: cv, naics: ['541511', '541715'], expansion: { keywordsToAdd: ['digital twin'] } }, ctx);
    expect(r.expansion?.naicsToAdd).toEqual(['541715']);
  });

  it('PROPOSE_NEW: the draft carries only closed-list codes, falling back to the proposal\'s own field', () => {
    const ctx = ctxWith({});
    const r = finalizeRecommendation({ decision: 'PROPOSE_NEW', proposedService: { name: 'Quantum Ledger Forensics', naics: ['221118', '541219'] } }, ctx);
    expect(r.proposedService?.naicsSuggestionsUnverified).toEqual(['541219']);
    expect(r.naics.map((n) => n.onTarget)).toEqual([false]);
    expect(r.naicsWarnings).toEqual([]);
  });

  it('no target, no warnings; no answer, no codes', () => {
    const r = finalizeRecommendation({ decision: 'INSUFFICIENT_EVIDENCE' }, ctxWith({}));
    expect(r.naics).toEqual([]);
    expect(r.naicsWarnings).toEqual([]);
  });
});
