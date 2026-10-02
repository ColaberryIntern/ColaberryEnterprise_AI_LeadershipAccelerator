import {
  suggestServicesForCaseStudy,
  expectedScore,
  W_CATEGORY,
  CaseStudyLinkSignals,
} from '../caseStudyServiceLinkSuggestor';
import { MatcherServiceInput } from '../../factory/serviceMatcher';
import * as matcher from '../../factory/serviceMatcher';

/**
 * The suggestor is pure, so these tests are the real gate on it: there is no integration path that would catch a
 * mis-scored suggestion before a reviewer saw it in the queue.
 *
 * The two tests that matter most here are the ones about reachability, because they guard the reason this module
 * exists at all:
 *   - 'strong' MUST be reachable. The matcher it delegates to bands 'strong' at a NAICS-weighted score of 10, which
 *     a case study can never reach, so if this module ever loses its own banding every good match silently
 *     downgrades to 'weak'.
 *   - the NAICS term MUST be inert. If the matcher starts contributing a term this module does not model, the score
 *     a reviewer sorts by stops being the score this module documents.
 */

const svc = (over: Partial<MatcherServiceInput> & { id: string; name: string }): MatcherServiceInput => ({
  category: null, keywords: [], naicsCodes: [], ...over,
});

const RECORD: CaseStudyLinkSignals = {
  title: 'The prompt was versioned, the text kept changing',
  canonicalSummary: 'A governance review of prompt versioning and release discipline for an admissions workflow.',
  industry: 'Education',
  primaryCapability: 'AI Governance',
  programKey: 'accelerator',
};

describe('suggestServicesForCaseStudy', () => {
  it('suggests a service whose capability and wording both overlap, and names what matched', () => {
    const [top] = suggestServicesForCaseStudy(RECORD, [
      svc({ id: 's1', name: 'AI Governance Advisory', category: 'AI Governance', keywords: ['governance', 'prompt'] }),
    ]);
    expect(top.serviceOfferingId).toBe('s1');
    expect(top.categoryMatched).toBe(true);
    expect(top.matchedKeywords).toEqual(['governance', 'prompt']);
    expect(top.matchScore).toBe(5); // capability 3 + two keywords
    expect(W_CATEGORY).toBe(3);
    expect(top.rationale).toContain('AI Governance');
    expect(top.rationale).toContain('governance, prompt');
    // Every row says out loud that nobody has agreed with it yet.
    expect(top.rationale).toContain('not confirmed');
  });

  it("reaches 'strong' — the band the underlying matcher cannot reach without NAICS", () => {
    const [top] = suggestServicesForCaseStudy(RECORD, [
      svc({ id: 's1', name: 'AI Governance Advisory', category: 'AI Governance', keywords: ['governance', 'prompt'] }),
    ]);
    expect(top.strength).toBe('strong');
  });

  it('bands moderate and weak distinctly, so the queue can be triaged', () => {
    const byId: Record<string, string> = {};
    for (const s of suggestServicesForCaseStudy(RECORD, [
      // capability agreement, one corroborating word -> moderate
      svc({ id: 'cat1', name: 'A Service', category: 'AI Governance', keywords: ['governance'] }),
      // no capability agreement, three words -> moderate
      svc({ id: 'kw3', name: 'B Service', keywords: ['prompt', 'versioning', 'admissions'] }),
      // no capability agreement, one word -> weak
      svc({ id: 'kw1', name: 'C Service', keywords: ['admissions'] }),
    ])) byId[s.serviceOfferingId] = s.strength;
    expect(byId).toEqual({ cat1: 'moderate', kw3: 'moderate', kw1: 'weak' });
  });

  it('never hands the matcher a NAICS signal, because a case study carries none', () => {
    // Asserted on the CALL, not on the output. Comparing results with and without codes on the service would pass
    // even if NAICS were piped through, because this module reports its own score and never the matcher's — so the
    // output-level check could not fail for the reason it appears to test. The argument can.
    const spy = jest.spyOn(matcher, 'matchServicesToOpportunity');
    try {
      suggestServicesForCaseStudy(RECORD, [
        svc({ id: 's1', name: 'AI Governance Advisory', category: 'AI Governance', keywords: ['governance'] }),
      ]);
      expect(spy).toHaveBeenCalledTimes(1);
      const [signals] = spy.mock.calls[0];
      expect(signals?.naics ?? null).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('scores only on the terms it models, so the review queue sorts by what it says it sorts by', () => {
    const [top] = suggestServicesForCaseStudy(RECORD, [
      svc({
        id: 's1', name: 'AI Governance Advisory', category: 'AI Governance', keywords: ['governance'],
        naicsCodes: ['541512', '611430'],
      }),
    ]);
    // Literal, not `expectedScore(true, 1)`: that would compare the function to itself and could not fail on a
    // weight change. Capability agreement counts 3, each matched keyword 1, so this is 3 + 1.
    expect(top.matchScore).toBe(4);
    // And the exported formula agrees with the literal, which is what the persisted score is documented to be.
    expect(expectedScore(true, 1)).toBe(4);
  });

  it('orders strongest first and breaks ties on name', () => {
    const got = suggestServicesForCaseStudy(RECORD, [
      svc({ id: 'weak', name: 'Zeta', keywords: ['admissions'] }),
      svc({ id: 'tieB', name: 'Beta', keywords: ['prompt', 'governance'] }),
      svc({ id: 'tieA', name: 'Alpha', keywords: ['prompt', 'governance'] }),
    ]).map((s) => s.serviceOfferingId);
    expect(got).toEqual(['tieA', 'tieB', 'weak']);
  });

  it('proposes nothing when nothing overlaps', () => {
    expect(suggestServicesForCaseStudy(RECORD, [
      svc({ id: 's1', name: 'Fleet Maintenance', category: 'Logistics', keywords: ['forklift', 'warehouse'] }),
    ])).toEqual([]);
  });

  it('never throws on missing or malformed input', () => {
    expect(suggestServicesForCaseStudy(null, null)).toEqual([]);
    expect(suggestServicesForCaseStudy(undefined, [])).toEqual([]);
    expect(suggestServicesForCaseStudy({}, [svc({ id: 's1', name: 'X', keywords: ['governance'] })])).toEqual([]);
    expect(
      suggestServicesForCaseStudy(RECORD, [
        { id: 's1', name: 'Broken', keywords: [null, '', '  ', 'governance'] as any, naicsCodes: null, category: null },
      ])[0].matchedKeywords,
    ).toEqual(['governance']);
  });

  it('does not match a short capability label inside an unrelated word', () => {
    // "AI" must not match inside "trAIning". Guards the matcher's whole-word category rule from this side too.
    const got = suggestServicesForCaseStudy(
      { primaryCapability: 'Training', title: 'A record about training' },
      [svc({ id: 's1', name: 'AI Work', category: 'AI' })],
    );
    expect(got).toEqual([]);
  });

  it('caps the queue so one record cannot flood the review list', () => {
    const many = Array.from({ length: 20 }, (_, i) => svc({
      id: `s${i}`, name: `Service ${String(i).padStart(2, '0')}`, keywords: ['governance'],
    }));
    expect(suggestServicesForCaseStudy(RECORD, many)).toHaveLength(6);
    expect(suggestServicesForCaseStudy(RECORD, many, { max: 3 })).toHaveLength(3);
  });
});
