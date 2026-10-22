/**
 * mergeCandidates — the deterministic rows are kept EXACTLY (same ids, same order); AI candidates are appended with
 * continuing REQ-NNN; a quote that duplicates a deterministic sentence is dropped; the cap holds. The load-bearing
 * property: with no AI candidates the output is the deterministic list unchanged (the flag-off guarantee). Pure.
 */
import { mergeCandidates } from '../mergeCandidates';
import type { ExtractedRequirement } from '../proposalExtractor';
import type { VerifiedCandidate } from '../verifyQuotes';

const det = (id: string, text: string): ExtractedRequirement => ({
  canonicalReqId: id, statement: text, kind: 'compliance', priority: 'must', tracks: ['proposal', 'solution_build'],
  sourceDocument: 'rfp.pdf', section: 'rfp.pdf', extractedText: text, interpretation: null, humanConfirmed: false,
  evidenceState: 'unassessed', sourceEvidence: [],
});
const ver = (quote: string, statement = 's', document = 'rfp.pdf'): VerifiedCandidate => ({ statement, quote, document, documentCorrected: false });

describe('mergeCandidates', () => {
  it('keeps the deterministic rows EXACTLY and appends AI candidates with continuing REQ-NNN ids', () => {
    const out = mergeCandidates([det('REQ-001', 'A'), det('REQ-002', 'B')], [ver('a unique verified quote span here')]);
    expect(out).toHaveLength(3);
    expect(out.slice(0, 2).map((r) => r.canonicalReqId)).toEqual(['REQ-001', 'REQ-002']); // unchanged
    expect(out[2].canonicalReqId).toBe('REQ-003');                                        // continues the sequence
    expect(out[2].extractedText).toBe('a unique verified quote span here');               // the VERBATIM quote
    expect(out[2].evidenceState).toBe('unassessed');                                      // never a fabricated done
    expect(out[2].humanConfirmed).toBe(false);
  });

  it('DROPS an AI candidate whose quote duplicates a deterministic sentence (no double-count)', () => {
    const out = mergeCandidates([det('REQ-001', 'The vendor shall provide a dashboard.')], [ver('The vendor shall provide a dashboard.')]);
    expect(out).toHaveLength(1);
  });

  it('respects the cap — never exceeds it', () => {
    const dets = Array.from({ length: 3 }, (_, i) => det(`REQ-00${i + 1}`, `d${i}`));
    const ais = Array.from({ length: 5 }, (_, i) => ver(`ai unique verified quote number ${i} here`));
    expect(mergeCandidates(dets, ais, 5)).toHaveLength(5); // 3 deterministic + 2 AI (cap 5)
  });

  it('with NO AI candidates returns the deterministic list unchanged (the flag-off guarantee)', () => {
    const dets = [det('REQ-001', 'A'), det('REQ-002', 'B')];
    expect(mergeCandidates(dets, [])).toEqual(dets);
  });

  it('is total on garbage input', () => {
    expect(mergeCandidates(undefined as any, undefined as any)).toEqual([]);
  });
});
