/**
 * deriveProposalDocuments turns the flat established requirements into the NAMED documents a bid must submit, each
 * carrying the requirements it must cover. A `scope` requirement is the buyer's functional/technical ask and is
 * routed to the Technical Proposal narrative (R2, F03) while still feeding the solution_build track; a pricing-kind
 * requirement is always the (admin-only) price document; requirements cluster and dedup under one document.
 */
import { deriveProposalDocuments } from '../govProposalDocuments';

const req = (id: string, statement: string, kind?: string): any => ({ canonical_req_id: id, statement, kind });

describe('deriveProposalDocuments', () => {
  it('routes submittal requirements to their named documents and sends scope (functional) requirements to the Technical Proposal', () => {
    const docs = deriveProposalDocuments([
      req('R1', 'Submit a cover letter signed by an authorized representative.'),
      req('R2', 'The proposal must include a technical approach describing the methodology.'),
      req('R3', 'Provide past performance for three similar contracts.'),
      req('R4', 'Complete the pricing schedule in Attachment B.'),
      req('R5', 'The vendor shall provide an online case management system with GIS integration.'), // scope ⇒ technical narrative (R2)
      req('R6', 'Submit audited financial statements for the last three years.'),
      req('R7', 'Submit a HUB subcontracting plan per State requirements.'),
    ]);
    const byKey = Object.fromEntries(docs.map((d) => [d.key, d]));
    expect(Object.keys(byKey).sort()).toEqual(['cover_letter', 'financial', 'past_performance', 'pricing', 'socioeconomic', 'technical'].sort());
    // R2 (narrative default) AND R5 (functional scope) now both get a written technical response.
    expect(byKey.technical.requirements.map((r) => r.canonicalReqId).sort()).toEqual(['R2', 'R5']);
    expect(byKey.past_performance.requirements.map((r) => r.canonicalReqId)).toEqual(['R3']);
    expect(byKey.socioeconomic.requirements.map((r) => r.canonicalReqId)).toEqual(['R7']); // HUB, not Past Performance
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

/**
 * F01 regression (HERRIMAN_ROOT_CAUSE_MATRIX.md): a submission-instruction obligation must never become a
 * Technical Proposal section. These are the EXACT passages that opened the Nov 21 Herriman 02-technical.pdf
 * ("This section responds to requirement REQ-003. Submission Requirement: One (1) electronic (PDF) copy ...
 * submitted by email"). Before the fix they fell through the Technical Proposal catch-all rule into the
 * narrative, because that rule matches any statement.
 */
describe('deriveProposalDocuments — submission-instruction requirements never leak into the Technical Proposal (F01)', () => {
  it('drops a submit-by-email / deadline obligation from derivation — it is covered by the generated Compliance Matrix, never drafted as Technical', () => {
    const docs = deriveProposalDocuments([
      req('REQ-003', 'One (1) electronic (PDF) copy of Responses are required to be submitted by email to Herriman City/Steven Brown.', 'administrative'),
      req('REQ-004', 'Proposals must be submitted no later than 5:00 p.m. MDT on November 30, 2026.', 'administrative'),
    ]);
    const byKey = Object.fromEntries(docs.map((d) => [d.key, d]));
    // The exact passages that OPENED the failing technical PDF are no longer drafted as a technical section (or any).
    expect(byKey.technical).toBeUndefined();
    expect(docs).toEqual([]);
  });

  it('still routes a genuine "the proposal must include a technical approach" requirement to the Technical Proposal', () => {
    const docs = deriveProposalDocuments([
      req('T1', 'The proposal must include a technical approach describing the methodology and architecture.'),
    ]);
    const byKey = Object.fromEntries(docs.map((d) => [d.key, d]));
    expect(byKey.technical.requirements.map((r) => r.canonicalReqId)).toEqual(['T1']);
  });

  it('does NOT drop a requirement that names a technical capability, even when it says "submit"', () => {
    const docs = deriveProposalDocuments([
      req('T2', 'Submit a description of the GIS integration and offline work-order sync.'),
    ]);
    const byKey = Object.fromEntries(docs.map((d) => [d.key, d]));
    expect(byKey.technical.requirements.map((r) => r.canonicalReqId)).toEqual(['T2']);
  });
});

/**
 * F03 regression (HERRIMAN_ROOT_CAUSE_MATRIX.md): the buyer's functional/technical requirements (scope) must be
 * answered IN WRITING in the Technical Proposal, not silently dropped as build-only work. These are the real
 * Herriman functional requirements that extraction captured and derivation was discarding.
 */
describe('deriveProposalDocuments — scope (functional) requirements become written Technical Proposal responses (F03)', () => {
  it('routes the real functional requirements (GIS, Bluestakes, citizen portal, API integration) to the Technical Proposal', () => {
    const docs = deriveProposalDocuments([
      req('REQ-023', 'System must support bidirectional GIS integration to select assets and autofill multiple fields into a work order.'),
      req('REQ-039', 'Provide the ability to update, complete, and respond to Bluestakes data within the platform.'),
      req('REQ-037', 'A public-facing reporting interface allowing citizens to submit requests or view public work order activities.'),
      req('REQ-038', 'The proposed solution must natively interface or provide verified API connections to the required systems.'),
    ]);
    const byKey = Object.fromEntries(docs.map((d) => [d.key, d]));
    const tech = byKey.technical;
    expect(tech).toBeDefined();
    expect(tech.requirements.map((r) => r.canonicalReqId).sort()).toEqual(['REQ-023', 'REQ-037', 'REQ-038', 'REQ-039']);
    // Each got a section the drafter will answer (one section per covered requirement).
    expect(tech.sections.length).toBe(4);
  });

  it('a pure build/config scope requirement still reaches the Technical Proposal (it is also on the solution_build track)', () => {
    const docs = deriveProposalDocuments([
      req('S1', 'System must actively read from and write to the primary GIS database.'),
    ]);
    const byKey = Object.fromEntries(docs.map((d) => [d.key, d]));
    expect(byKey.technical.requirements.map((r) => r.canonicalReqId)).toEqual(['S1']);
  });
});
