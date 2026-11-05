/**
 * deriveProposalDocuments(blueprint) — P2. With a blueprint the document set gains form documents (required forms),
 * a generated Compliance Matrix, the build-backed Pilot Demonstration Exhibit, page limits on the narrative volume,
 * and deterministic file names + the blueprint version on every document. hsp/execution-of-offer map onto the
 * existing derived documents rather than duplicating. Without a blueprint, the P1 behavior is unchanged.
 */
import { deriveProposalDocuments, slugFileName } from '../govProposalDocuments';
import type { ProposalBlueprint } from '../proposalBlueprintTypes';

const reqs = [
  { canonical_req_id: 'R1', statement: 'Provide a technical approach narrative for the solution.' },
  { canonical_req_id: 'R2', statement: 'Submit a HUB subcontracting plan with the proposal.' },
  { canonical_req_id: 'R3', statement: 'Provide the signed execution of offer.' },
];

const blueprint: ProposalBlueprint = {
  rules: [{ key: 'page_limit', value: '20', quote: 'shall not exceed 20 pages', sourceFile: 'rfp.pdf', severity: 'fatal' }],
  forms: [
    { key: 'hsp', label: 'HUB Subcontracting Plan (HSP)', disposition: 'required', timing: 'with_proposal', severity: 'fatal', triggerReason: 'x', citation: 'c' },
    { key: 'execution_of_offer', label: 'Execution of Offer', disposition: 'required', timing: 'with_proposal', severity: 'fatal', triggerReason: 'x', citation: 'c' },
    { key: 'no_boycott_israel_808', label: 'Non-boycott of Israel certification', disposition: 'required', timing: 'with_proposal', severity: 'fatal', triggerReason: 'x', citation: 'c' },
    { key: 'form_1295', label: 'Form 1295', disposition: 'at_award', timing: 'at_award', severity: 'curable', triggerReason: 'x', citation: 'c' },
    { key: 'ciq', label: 'CIQ', disposition: 'not_required', timing: 'with_proposal', severity: 'info', triggerReason: 'x', citation: 'c' },
  ],
  scoring: { basis: 'best_value', basisQuote: 'q', totalPoints: 100, factors: [] },
  addenda: [], eliminationRisks: [], buyerType: 'state_agency', droppedRuleCount: 0, sourceFiles: ['rfp.pdf'], generatedAt: '2026-11-04T12:00:00.000Z',
};

describe('deriveProposalDocuments with a blueprint', () => {
  const docs = deriveProposalDocuments(reqs, blueprint, { blueprintVersion: 2, allowSupplemental: true });
  const byKey = (k: string) => docs.find((d) => d.key === k);

  it('stamps the page limit on the technical volume and a file name + blueprint version on every document', () => {
    expect(byKey('technical')?.pageLimit).toBe(20);
    expect(byKey('technical')?.fileName).toBe('technical-proposal.pdf');
    expect(docs.every((d) => d.blueprintVersion === 2)).toBe(true);
    expect(docs.every((d) => typeof d.fileName === 'string' && d.fileName.length > 0)).toBe(true);
  });

  it('maps hsp/execution-of-offer onto existing derived docs (no duplicate form_* doc)', () => {
    expect(byKey('socioeconomic')?.docType).toBe('form');
    expect(byKey('execution_offer')?.docType).toBe('form');
    expect(byKey('form_hsp')).toBeUndefined();
    expect(byKey('form_execution_of_offer')).toBeUndefined();
  });

  it('adds a form document for a required form with no existing derived doc, gated when fatal', () => {
    const noBoycott = byKey('form_no_boycott_israel_808');
    expect(noBoycott?.docType).toBe('form');
    expect(noBoycott?.gate).toBe(true);
    expect(byKey('form_form_1295')?.docType).toBe('form'); // at_award still produces a form document
  });

  it('does NOT add a form document for a not_required form', () => {
    expect(byKey('form_ciq')).toBeUndefined();
  });

  it('adds the generated Compliance Matrix and the build-backed Pilot Demonstration Exhibit', () => {
    expect(byKey('compliance_matrix')?.docType).toBe('generated');
    expect(byKey('pilot_demo_exhibit')?.docType).toBe('build');
  });

  it('omits the Pilot Demonstration Exhibit when supplemental material is forbidden', () => {
    const noSupp = deriveProposalDocuments(reqs, blueprint, { blueprintVersion: 2, allowSupplemental: false });
    expect(noSupp.find((d) => d.key === 'pilot_demo_exhibit')).toBeUndefined();
  });
});

describe('deriveProposalDocuments without a blueprint (P1 behavior preserved)', () => {
  const docs = deriveProposalDocuments(reqs);
  it('keeps every document derived, with no page limit / file name / blueprint version', () => {
    expect(docs.every((d) => (d.docType ?? 'derived') === 'derived')).toBe(true);
    expect(docs.every((d) => (d.pageLimit ?? null) === null && (d.fileName ?? null) === null && (d.blueprintVersion ?? null) === null)).toBe(true);
    expect(docs.find((d) => d.key === 'compliance_matrix')).toBeUndefined();
    expect(docs.find((d) => d.key === 'pilot_demo_exhibit')).toBeUndefined();
    // P1 sections still present (one per covered requirement).
    expect(docs.find((d) => d.key === 'technical')?.sections.length).toBeGreaterThanOrEqual(1);
  });
});

describe('slugFileName', () => {
  it('slugs a title deterministically with the right extension', () => {
    expect(slugFileName('Technical Proposal')).toBe('technical-proposal.pdf');
    expect(slugFileName('Price / Cost Proposal', 'xlsx')).toBe('price-cost-proposal.xlsx');
    expect(slugFileName('')).toBe('document.pdf');
  });
});
