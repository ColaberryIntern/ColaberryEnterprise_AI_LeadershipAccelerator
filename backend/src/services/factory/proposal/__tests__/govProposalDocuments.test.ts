/**
 * deriveProposalDocuments turns the flat established requirements into the NAMED documents a bid must submit, each
 * carrying the requirements it must cover. A `scope` requirement is build work and is excluded; a pricing-kind
 * requirement is always the (admin-only) price document; requirements cluster and dedup under one document.
 */
import { deriveProposalDocuments } from '../govProposalDocuments';

const req = (id: string, statement: string, kind?: string): any => ({ canonical_req_id: id, statement, kind });

describe('deriveProposalDocuments', () => {
  it('routes submittal requirements to their named documents and excludes build (scope) requirements', () => {
    const docs = deriveProposalDocuments([
      req('R1', 'Submit a cover letter signed by an authorized representative.'),
      req('R2', 'The proposal must include a technical approach describing the methodology.'),
      req('R3', 'Provide past performance for three similar contracts.'),
      req('R4', 'Complete the pricing schedule in Attachment B.'),
      req('R5', 'The vendor shall provide an online case management system with GIS integration.'), // scope ⇒ build
      req('R6', 'Submit audited financial statements for the last three years.'),
      req('R7', 'Submit a HUB subcontracting plan per State requirements.'),
    ]);
    const byKey = Object.fromEntries(docs.map((d) => [d.key, d]));
    expect(Object.keys(byKey).sort()).toEqual(['cover_letter', 'financial', 'past_performance', 'pricing', 'socioeconomic', 'technical'].sort());
    expect(byKey.technical.requirements.map((r) => r.canonicalReqId)).toEqual(['R2']); // the narrative default
    expect(byKey.past_performance.requirements.map((r) => r.canonicalReqId)).toEqual(['R3']);
    expect(byKey.socioeconomic.requirements.map((r) => r.canonicalReqId)).toEqual(['R7']); // HUB, not Past Performance
    // the scope requirement became NO document (it's build work)
    expect(docs.some((d) => d.requirements.some((r) => r.canonicalReqId === 'R5'))).toBe(false);
  });

  it('files a pricing-kind requirement under the admin-only price document, whatever its wording', () => {
    const docs = deriveProposalDocuments([
      req('P1', 'Total contract value shall not be unreasonable.', 'pricing'),
      req('P2', 'Complete the cost proposal worksheet.'),
    ]);
    const pricing = docs.find((d) => d.key === 'pricing')!;
    expect(pricing.adminOnly).toBe(true);
    expect(pricing.requirements.map((r) => r.canonicalReqId).sort()).toEqual(['P1', 'P2']);
  });

  it('clusters multiple requirements under one document, dedups, and returns documents in volume order', () => {
    const docs = deriveProposalDocuments([
      req('A', 'Include references and past performance.'),
      req('B', 'Describe similar projects you have delivered.'),
      req('A', 'Include references and past performance.'), // dup id
      req('C', 'Submit a cover letter.'),
    ]);
    expect(docs.map((d) => d.key)).toEqual(['cover_letter', 'past_performance']); // order 1 then 5
    expect(docs.find((d) => d.key === 'past_performance')!.requirements.map((r) => r.canonicalReqId)).toEqual(['A', 'B']); // deduped
  });

  it('is total on empty / garbage', () => {
    expect(deriveProposalDocuments([])).toEqual([]);
    expect(deriveProposalDocuments(null as any)).toEqual([]);
    expect(deriveProposalDocuments([null, { statement: '' }, { canonical_req_id: 'X' }] as any)).toEqual([]);
  });
});
