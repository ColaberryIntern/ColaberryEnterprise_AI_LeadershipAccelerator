/**
 * govRequirementItems must be DETERMINISTIC and NON-FABRICATING: it classifies each extracted requirement
 * into one of four categories and cites its real source fragment(s); scope -> solution_build, the rest ->
 * submission/award stages, so downstream gates and build-story derivation are unchanged.
 */
import {
  buildRequirementItems,
  classifyRequirementCategory,
  tracksForCategory,
  dueStageForCategory,
  type ReqItemCategory,
} from '../govRequirementItems';
import type { ExtractedRequirement } from '../proposalExtractor';

function req(extractedText: string, n = 1): ExtractedRequirement {
  return {
    canonicalReqId: `REQ-${String(n).padStart(3, '0')}`,
    statement: extractedText,
    kind: 'compliance',
    priority: 'must',
    tracks: ['proposal', 'solution_build'],
    sourceDocument: 'RFP.txt',
    section: 'RFP.txt',
    extractedText,
    interpretation: null,
    humanConfirmed: false,
    evidenceState: 'unassessed',
    sourceEvidence: [`blk-REQ-${String(n).padStart(3, '0')}`],
  };
}

describe('classifyRequirementCategory', () => {
  const cases: Array<[string, ReqItemCategory]> = [
    ['The proposal must include a signed cover letter.', 'submit'],
    ['Offerors are required to submit three references.', 'submit'],
    ['Pricing shall be provided on the attached fee schedule.', 'submit'],
    ['The vendor shall maintain $1,000,000 general liability insurance.', 'rule'],
    ['The contractor must comply with all applicable prevailing wage laws.', 'rule'],
    ['The vendor shall provide a work order management system integrated with the City GIS.', 'scope'],
    ['The solution shall expose a REST API and a reporting dashboard.', 'scope'],
    ['Upon award, the vendor shall provide 40 hours of on-site training.', 'after_award'],
    ['During the contract term, the vendor shall provide ongoing maintenance and support.', 'after_award'],
  ];
  for (const [text, expected] of cases) {
    it(`classifies "${text.slice(0, 40)}..." as ${expected}`, () => {
      expect(classifyRequirementCategory(text)).toBe(expected);
    });
  }

  it('defaults to rule when no signal matches (never a build story by accident)', () => {
    expect(classifyRequirementCategory('The contractor shall attend the kickoff gathering.')).toBe('rule');
  });

  it('submit beats scope when the sentence is about the PROPOSAL describing the system', () => {
    expect(classifyRequirementCategory('The proposal must include a description of the proposed system and dashboard.')).toBe('submit');
  });

  it('after_award beats scope for an ongoing post-award duty to run the system', () => {
    expect(classifyRequirementCategory('During the contract term, the vendor shall host the system and provide support.')).toBe('after_award');
  });
});

describe('buildRequirementItems', () => {
  const reqs = [
    req('The vendor shall provide a work order management system integrated with the City GIS.', 1),
    req('The proposal must include a signed cover letter and three references.', 2),
    req('The vendor shall maintain general liability insurance of $1,000,000.', 3),
    req('Upon award, the vendor shall provide 40 hours of training. Due March 15, 2026.', 4),
  ];

  it('produces one categorized, source-cited item per requirement', () => {
    const items = buildRequirementItems(reqs);
    expect(items).toHaveLength(4);
    const byCat = items.reduce((m, i) => ((m[i.category] = (m[i.category] || 0) + 1), m), {} as Record<string, number>);
    expect(byCat).toMatchObject({ scope: 1, submit: 1, rule: 1, after_award: 1 });
  });

  it('every item cites at least one real source fragment and never fabricates', () => {
    for (const item of buildRequirementItems(reqs)) {
      expect(item.sourceFragments.length).toBeGreaterThanOrEqual(1);
      expect(item.sourceFragments[0].reqId).toMatch(/^REQ-\d{3}$/);
      expect(item.sourceFragments[0].text.length).toBeGreaterThan(0);
      expect(item.sourceFragments[0].doc).toBe('RFP.txt');
      expect(item.inferred).toBe(false);
      expect(item.status).toBe('candidate');
      expect(item.id).toMatch(/^ITEM-(SUB|RUL|SCP|AWD)\d{2}$/);
    }
  });

  it('is deterministic — same fragments in, byte-identical items out', () => {
    expect(JSON.stringify(buildRequirementItems(reqs))).toBe(JSON.stringify(buildRequirementItems(reqs)));
  });

  it('sets dueAt from a date on a submit/rule item, null otherwise', () => {
    const items = buildRequirementItems([
      req('The proposal must include pricing by March 15, 2026.', 1), // submit + date
      req('The vendor shall provide a reporting system.', 2),         // scope, no date
    ]);
    const submit = items.find((i) => i.category === 'submit');
    const scope = items.find((i) => i.category === 'scope');
    expect(submit!.dueAt).toBe('March 15, 2026');
    expect(scope!.dueAt).toBeNull();
  });

  it('is total — garbage input yields an empty list, never a throw', () => {
    expect(buildRequirementItems(undefined as any)).toEqual([]);
    expect(buildRequirementItems([{ extractedText: '' } as any])).toEqual([]);
  });
});

describe('category -> downstream mapping (keeps gates and build stories unchanged)', () => {
  it('only scope carries the solution_build track', () => {
    expect(tracksForCategory('scope')).toEqual(['proposal', 'solution_build']);
    expect(tracksForCategory('submit')).toEqual(['proposal']);
    expect(tracksForCategory('rule')).toEqual(['proposal']);
    expect(tracksForCategory('after_award')).toEqual(['proposal']);
  });

  it('maps categories to the right due stage', () => {
    expect(dueStageForCategory('submit')).toBe('submission');
    expect(dueStageForCategory('rule')).toBe('submission');
    expect(dueStageForCategory('after_award')).toBe('award');
    expect(dueStageForCategory('scope')).toBe('delivery');
  });
});
