import {
  caseStudyFingerprint, catalogFingerprint, evidenceText, nameSimilarity, retrieveCandidates, thinEvidence, tokens,
} from '../serviceGapRetrieval';
import { CATALOG, ev, svc } from './serviceGapFixtures';

describe('serviceGapRetrieval', () => {
  it('abstains on an outside document that could not be read (no model call needed)', () => {
    expect(thinEvidence(ev({ analysis: null, analysisError: 'unreadable' }))?.reasonCode).toBe('extraction_failed');
  });

  it('abstains on a title-only record: never guess a service from the title (boundary)', () => {
    const thin = thinEvidence(ev({ sourceKind: 'inside', analysis: null, canonicalSummary: 'Short.' }));
    expect(thin?.reasonCode).toBe('thin_source');
    expect(thin?.missing.length).toBeGreaterThan(0);
  });

  it('a substantive record is judged', () => {
    expect(thinEvidence(ev())).toBeNull();
  });

  it('retrieval never offers a retired service and is capped', () => {
    const c = retrieveCandidates(ev(), CATALOG);
    expect(c.map((s) => s.status)).not.toContain('retired');
    expect(c).toHaveLength(4);
    const many = Array.from({ length: 30 }, (_, i) => svc(`id-${i}`, `Service ${i}`, 'active', []));
    expect(retrieveCandidates(ev(), many, 12)).toHaveLength(12);
  });

  it('ranks the industrial service first for the digital-twin case, deterministically', () => {
    const a = retrieveCandidates(ev(), CATALOG).map((s) => s.name);
    const b = retrieveCandidates(ev(), [...CATALOG].reverse()).map((s) => s.name);
    expect(a[0]).toBe('Computer Vision & Industrial AI');
    expect(a).toEqual(b);
  });

  it('fingerprints are stable, and change when the case study or the catalog changes', () => {
    expect(caseStudyFingerprint(ev())).toBe(caseStudyFingerprint(ev()));
    expect(caseStudyFingerprint(ev({ title: 'Other' }))).not.toBe(caseStudyFingerprint(ev()));
    expect(catalogFingerprint(CATALOG)).toBe(catalogFingerprint([...CATALOG].reverse()));
    const edited = CATALOG.map((s, i) => (i === 0 ? { ...s, keywords: [...s.keywords, 'thermal'] } : s));
    expect(catalogFingerprint(edited)).not.toBe(catalogFingerprint(CATALOG));
  });

  it('marks outside material as unverified claims in the text the model reads', () => {
    expect(evidenceText(ev())).toMatch(/claims, unverified/);
  });

  it('name similarity treats reordered names as the same, and unrelated names as different', () => {
    expect(nameSimilarity('AI Governance & Assurance', 'Assurance and Governance for AI')).toBe(1);
    expect(nameSimilarity('Geospatial Analytics', 'Predictive Maintenance')).toBe(0);
    expect(tokens('Services and the data')).toEqual(new Set());
  });
});
