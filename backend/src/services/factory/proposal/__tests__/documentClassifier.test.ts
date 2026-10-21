/**
 * documentClassifier — deterministic routing of solicitation-package files into roles, so a W-9's tax instructions
 * and a boilerplate T&C template are NOT scanned like the RFP body (the ~45%-noise problem). These pin each role's
 * signal, the precedence (solicitation beats a terms template that quotes terms language), and near-duplicate
 * detection of the same RFP shipped as both .pdf and .docx. Pure + total.
 */
import { classifyDocuments, FULL_SCAN_ROLES, SINGLE_ITEM_ROLES, roleLabel } from '../documentClassifier';

const role = (name: string, text = '') => classifyDocuments([{ name, text }])[0].role;

describe('classifyDocuments — role by filename + text', () => {
  it('a W-9 is a tax_form (by filename or by its taxpayer-ID text)', () => {
    expect(role('2-W9-2024.pdf')).toBe('tax_form');
    expect(role('taxinfo.pdf', 'Form W-9 Request for Taxpayer Identification Number and Certification')).toBe('tax_form');
  });
  it('a standard terms & conditions / master template is contract_terms', () => {
    expect(role('4-Master - Standard Terms and Conditions.pdf')).toBe('contract_terms');
    expect(role('5-Master - Goods and Service Template.pdf')).toBe('contract_terms');
  });
  it('a vendor registration / confidentiality claim is a form', () => {
    expect(role('3-Snow College Vendor Registration.pdf')).toBe('form');
    expect(role('1-Claim of Business Confidentiality.pdf')).toBe('form');
  });
  it('a cost/pricing sheet is a pricing_form', () => {
    expect(role('Cost Proposal Form.xlsx')).toBe('pricing_form');
    expect(role('attachmentA.xlsx', 'Vendor response to Cost Information Submission')).toBe('pricing_form');
  });
  it('an amendment / addendum is an addendum', () => {
    expect(role('Addendum No. 1.pdf')).toBe('addendum');
    expect(role('RFP Amendment 2.pdf')).toBe('addendum');
  });
  it('the RFP body is a solicitation — and BEATS the terms template even though it quotes terms language', () => {
    expect(role('6-RFP - Adult Learner Consulting - SNOC26271024.pdf')).toBe('solicitation');
    // no RFP in the filename, but strong solicitation TEXT + length
    const body = 'Scope of Work. '.repeat(10) + 'Proposal evaluation criteria follow. '.repeat(400);
    expect(role('document.pdf', body)).toBe('solicitation');
  });
  it('a substantial un-signalled document falls back to solicitation (so the RFP is never skipped); a short one is a reference', () => {
    expect(role('mystery.pdf', 'x '.repeat(3000))).toBe('solicitation'); // >= 4000 chars
    expect(role('note.txt', 'A short note with nothing to route on.')).toBe('reference');
  });
});

describe('classifyDocuments — near-duplicate detection (same RFP as .pdf and .docx)', () => {
  it('flags the second copy as a duplicate of the first (order-stable), by content not name', () => {
    const body = Array.from({ length: 60 }, (_, i) => `The vendor shall provide capability ${i} to the platform.`).join(' ');
    const out = classifyDocuments([
      { name: '6-RFP.pdf', text: body },
      { name: '7-RFP.docx', text: body + ' ' }, // same content, trivially different whitespace
    ]);
    expect(out[0].duplicateOf).toBeNull();
    expect(out[1].duplicateOf).toBe('6-RFP.pdf');
    expect(out[1].signals).toContain('duplicate');
  });
  it('does NOT flag two genuinely different documents as duplicates', () => {
    const out = classifyDocuments([
      { name: 'rfp.txt', text: Array.from({ length: 50 }, (_, i) => `The vendor shall build module ${i}.`).join(' ') },
      { name: 'terms.txt', text: Array.from({ length: 50 }, (_, i) => `Clause ${i}: the contractor indemnifies the state entirely.`).join(' ') },
    ]);
    expect(out[1].duplicateOf).toBeNull();
  });
});

describe('role routing sets', () => {
  it('full-scan vs single-item roles are partitioned as expected', () => {
    expect(FULL_SCAN_ROLES.has('solicitation')).toBe(true);
    expect(FULL_SCAN_ROLES.has('addendum')).toBe(true);
    expect(FULL_SCAN_ROLES.has('reference')).toBe(true);
    expect(SINGLE_ITEM_ROLES.has('form')).toBe(true);
    expect(SINGLE_ITEM_ROLES.has('tax_form')).toBe(true);
    expect(SINGLE_ITEM_ROLES.has('pricing_form')).toBe(true);
    // contract_terms is neither — it gets a review item + material clauses only
    expect(FULL_SCAN_ROLES.has('contract_terms')).toBe(false);
    expect(SINGLE_ITEM_ROLES.has('contract_terms')).toBe(false);
  });
  it('is total on garbage input', () => {
    expect(classifyDocuments(undefined as any)).toEqual([]);
    expect(classifyDocuments([null as any, { name: 'x.txt', text: null as any }])).toHaveLength(1);
    expect(roleLabel('tax_form')).toMatch(/tax/i);
  });
});
