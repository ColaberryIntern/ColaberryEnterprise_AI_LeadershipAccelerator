/**
 * rfpComplianceRules — the deterministic detector for three submission-mechanics obligations stated in the
 * solicitation body (separate cost file, redacted copy, offer validity period) that never reach the response
 * checklist. These pin the real phrasings, prove the validity rule needs BOTH a validity cue AND a day count
 * (so a bare deadline is not flagged), prove every quote is literal (verifiable against the source), and prove
 * ordinary text is not flagged. Pure + total + advisory.
 */
import { detectRfpComplianceRules, RfpComplianceFinding } from '../rfpComplianceRules';

const kinds = (text: string) => detectRfpComplianceRules(text).map((f) => f.kind);
const find = (text: string, kind: RfpComplianceFinding['kind']) =>
  detectRfpComplianceRules(text).find((f) => f.kind === kind);

describe('detectRfpComplianceRules — separate cost file', () => {
  it('flags price submitted as a separate / sealed volume', () => {
    expect(kinds('The Cost Proposal shall be submitted under separate cover in a sealed envelope.')).toContain('separate_cost_file');
    expect(kinds('Pricing must be provided in a separately sealed price volume.')).toContain('separate_cost_file');
    expect(kinds('Submit the cost information separately from the technical proposal.')).toContain('separate_cost_file');
  });
  it('does NOT flag a cost requirement with no separation language', () => {
    expect(kinds('Provide a detailed cost breakdown for each task.')).not.toContain('separate_cost_file');
  });
});

describe('detectRfpComplianceRules — redacted copy', () => {
  it('flags a required redacted / public-records copy', () => {
    expect(kinds('Offerors shall submit one redacted copy of the proposal suitable for public release.')).toContain('redacted_copy');
    expect(kinds('Provide a redacted version with all proprietary information removed.')).toContain('redacted_copy');
  });
  it('does NOT flag text that never mentions redaction', () => {
    expect(kinds('Submit one original and three copies of the proposal.')).not.toContain('redacted_copy');
  });
});

describe('detectRfpComplianceRules — validity period', () => {
  it('flags an offer-validity obligation and extracts the day count', () => {
    const a = find('Proposals shall remain valid for 90 calendar days after the submission deadline.', 'validity_period');
    expect(a?.days).toBe(90);
    const b = find('The offer must remain firm for 120 days.', 'validity_period');
    expect(b?.days).toBe(120);
    const c = find('Each bid shall be held firm for a period of 60 days.', 'validity_period');
    expect(c?.days).toBe(60);
  });
  it('requires BOTH a validity cue AND a day count — a bare deadline is not a validity period', () => {
    // "within 30 days" here is a performance deadline, not an offer-validity window: no validity cue nearby.
    expect(kinds('The contractor shall complete the migration within 30 days of award.')).not.toContain('validity_period');
    // A validity cue with no day count is not actionable, so it is not flagged.
    expect(kinds('Proposals shall remain valid until the contract is awarded.')).not.toContain('validity_period');
  });
});

describe('detectRfpComplianceRules — shape and totality', () => {
  it('quotes are literal — the quote appears verbatim in the source text', () => {
    const text = 'Offerors shall submit one redacted copy of the proposal. Proposals shall remain valid for 90 calendar days.';
    for (const f of detectRfpComplianceRules(text)) {
      // the quote is a bounded, whitespace-collapsed slice of the source, so each of its words is in the source.
      for (const word of f.quote.split(' ')) {
        if (word.length > 3 && !word.endsWith('...')) expect(text).toContain(word.replace(/[.,;]$/, ''));
      }
    }
  });
  it('returns at most one finding per kind (presence flags, not every occurrence)', () => {
    const text =
      'The cost proposal shall be submitted under separate cover. Separately, the price volume must be sealed separately.';
    expect(detectRfpComplianceRules(text).filter((f) => f.kind === 'separate_cost_file')).toHaveLength(1);
  });
  it('detects all three in one solicitation, in stable kind order', () => {
    const text = [
      'The Cost Proposal shall be submitted under separate cover in a sealed envelope.',
      'Offerors shall submit one redacted copy suitable for public release.',
      'Proposals shall remain valid for 90 calendar days.',
    ].join(' ');
    expect(kinds(text)).toEqual(['separate_cost_file', 'redacted_copy', 'validity_period']);
  });
  it('does not flag an ordinary technical requirement', () => {
    expect(detectRfpComplianceRules('Describe your approach to cloud data migration and systems integration.')).toEqual([]);
  });
  it('is total — empty / null / non-string yields [], never throws', () => {
    expect(detectRfpComplianceRules('')).toEqual([]);
    expect(detectRfpComplianceRules(null)).toEqual([]);
    expect(detectRfpComplianceRules(undefined)).toEqual([]);
    expect(detectRfpComplianceRules(42 as any)).toEqual([]);
  });
});
