/**
 * buildProposalBlueprint + sectionLDetectors + the never-fabricate drop rail. A fixture solicitation drives the
 * detectors; the test asserts (1) every emitted rule's quote is LITERALLY present in the source, (2) a planted
 * fabricated-quote rule is dropped and counted, (3) scoring, Section L mechanics, buyer type and the Texas forms
 * (upgraded when the solicitation names one) all come through.
 */
import { buildProposalBlueprint, verifyBlueprintRules, detectBuyerType, detectJurisdiction, type BlueprintSourceFile } from '../buildProposalBlueprint';
import { detectSectionLRules } from '../sectionLDetectors';
import { normalizeForMatch } from '../verifyQuotes';
import type { BlueprintRule } from '../proposalBlueprintTypes';

const SOLICITATION = `RFP DIR-2027-ASSET — STATE OF TEXAS, Department of Information Resources (DIR)
Request for Proposals: Enterprise Asset Management Software.

Proposals will be evaluated on the following criteria: Technical Approach (40 points), Cost (30 points),
Qualifications (20 points), and Past Performance (10 points). Award will be made on a best value basis.

Section L - Submission Instructions.
The technical proposal shall not exceed 20 pages. Use Times New Roman 12 point font on 8.5 x 11 letter-size pages.
Submit the proposal as a searchable PDF. Proposals are due by January 15, 2027 at 2:00 PM CST. Submit electronically
through the ESBD portal. Provide one (1) original and five copies. Name the file as follows: Vendor-Technical.pdf.

The cost proposal must be submitted as a separate sealed cost volume. A redacted copy of the proposal must accompany
the submission for Public Information Act purposes.

Respondents must complete a HUB Subcontracting Plan. The Execution of Offer must be signed. Vendors must certify
they do not boycott Israel.`;

const files: BlueprintSourceFile[] = [{ name: 'RFP-DIR-2027-Asset.pdf', text: SOLICITATION }];
const NOW = new Date('2026-11-04T12:00:00Z');

describe('buildProposalBlueprint — every stored rule literally quotes the source', () => {
  const bp = buildProposalBlueprint({ files, buyer: {} }, { now: NOW });

  it('emits the Section L mechanics with the right values', () => {
    const byKey = (k: string) => bp.rules.find((r) => r.key === k);
    expect(byKey('page_limit')?.value).toBe('20');
    expect(byKey('page_limit')?.severity).toBe('fatal');
    expect(byKey('min_font')?.value).toBe('12pt');
    expect(byKey('page_size')?.value).toBe('letter');
    expect(byKey('file_format')?.value).toMatch(/PDF/i);
    expect(byKey('copies')?.value).toBe('five');
    expect(byKey('separate_cost_file')).toBeDefined();
    expect(byKey('redacted_copy')?.severity).toBe('fatal');
  });

  it('every emitted rule quote is literally present in the source (never-fabricate holds)', () => {
    const haystack = normalizeForMatch(SOLICITATION);
    for (const r of bp.rules) expect(haystack.includes(normalizeForMatch(r.quote))).toBe(true);
    expect(bp.droppedRuleCount).toBe(0);
  });

  it('reads Section M scoring (best value, four weighted factors)', () => {
    expect(bp.scoring.basis).toBe('best_value');
    expect(bp.scoring.factors.length).toBeGreaterThanOrEqual(3);
    expect(bp.scoring.factors.some((f) => /technical/i.test(f.label) && f.points === 40)).toBe(true);
  });

  it('detects the Texas state-agency buyer and upgrades a solicitation-named form to required with a quote', () => {
    expect(bp.buyerType).toBe('state_agency');
    const hsp = bp.forms.find((f) => f.key === 'hsp');
    expect(hsp?.disposition).toBe('required');
    expect(hsp?.quote).toBeTruthy();
    expect(hsp?.sourceFile).toBe('RFP-DIR-2027-Asset.pdf');
    expect(bp.forms.find((f) => f.key === 'execution_of_offer')?.disposition).toBe('required');
  });

  it('is deterministic with injected now (generatedAt reflects it)', () => {
    expect(bp.generatedAt).toBe('2026-11-04T12:00:00.000Z');
    expect(buildProposalBlueprint({ files, buyer: {} }, { now: NOW })).toEqual(bp);
  });
});

describe('buildProposalBlueprint — elimination risk + empty input', () => {
  it('surfaces an elimination-risk requirement', () => {
    const bp = buildProposalBlueprint({
      files,
      requirements: [{ statement: 'Failure to submit the HSP will render the proposal nonresponsive.' }],
    }, { now: NOW });
    expect(bp.eliminationRisks.length).toBeGreaterThanOrEqual(1);
  });
  it('a garbage / empty input yields an empty-but-valid blueprint, never throws', () => {
    const bp = buildProposalBlueprint({ files: [] }, { now: NOW });
    expect(bp.rules).toEqual([]);
    expect(bp.forms.length).toBeGreaterThan(0); // the engine still reports every form as not_required
    expect(bp.sourceFiles).toEqual([]);
  });
});

describe('verifyBlueprintRules — the drop-and-count rail', () => {
  it('drops a rule whose quote is not literally in the source, and counts it', () => {
    const real: BlueprintRule = { key: 'page_limit', value: '20', quote: 'shall not exceed 20 pages', sourceFile: 'f', severity: 'fatal' };
    const fabricated: BlueprintRule = { key: 'min_font', value: '14pt', quote: 'use a 14 point font nowhere in this document', sourceFile: 'f', severity: 'curable' };
    const { kept, droppedCount } = verifyBlueprintRules([real, fabricated], files);
    expect(kept).toHaveLength(1);
    expect(kept[0].key).toBe('page_limit');
    expect(droppedCount).toBe(1);
  });
});

describe('detectSectionLRules — direct', () => {
  it('returns [] for empty text and tags the source file', () => {
    expect(detectSectionLRules('', 'x.pdf')).toEqual([]);
    const rules = detectSectionLRules(SOLICITATION, 'x.pdf');
    expect(rules.every((r) => r.sourceFile === 'x.pdf')).toBe(true);
    expect(rules.some((r) => r.key === 'page_limit')).toBe(true);
  });
});

describe('detectBuyerType — jurisdiction-aware', () => {
  it('maps text cues to buyer types; null when unclear', () => {
    expect(detectBuyerType('State of Texas Department of Information Resources')).toBe('state_agency');
    expect(detectBuyerType('The University of Texas System')).toBe('university');
    expect(detectBuyerType('an ordinary sentence with no buyer cue')).toBeNull();
  });
  it('a local-government cue is a TEXAS class only in a Texas jurisdiction; otherwise out-of-scope (other)', () => {
    // The Saratoga Springs (UT) production bug: a non-Texas / undetermined local must NOT be keyed as a Texas local
    // (which pulled the Texas CIQ). It is now `other`.
    expect(detectBuyerType('City of Saratoga Springs')).toBe('other');
    expect(detectBuyerType('City of Provo, Utah')).toBe('other');
    expect(detectBuyerType('Harris County, Texas')).toBe('local_government');
  });
  it('a university cue off-jurisdiction is out-of-scope', () => {
    expect(detectBuyerType('University of Utah, Salt Lake City, Utah')).toBe('other');
  });
});

describe('detectJurisdiction', () => {
  it('reads the state from the solicitation text', () => {
    expect(detectJurisdiction('RFP — State of Texas, Department of Information Resources').state).toBe('Texas');
    expect(detectJurisdiction('City of Provo, Utah — Request for Proposals').state).toBe('Utah');
    expect(detectJurisdiction('Harris County, Texas purchasing office').state).toBe('Texas');
    expect(detectJurisdiction('resolves to Texas via an acronym: HHSC solicitation').state).toBe('Texas');
    expect(detectJurisdiction('an address line, UT 84043 for delivery').state).toBe('Utah');
    expect(detectJurisdiction('nothing identifying a state here').state).toBeNull();
    expect(detectJurisdiction('').state).toBeNull();
  });
  it('carries the literal source quote', () => {
    expect(detectJurisdiction('City of Provo, Utah').quote).toMatch(/Utah/);
  });
});

describe('buildProposalBlueprint — jurisdiction gates the Texas forms engine (C.1 fix)', () => {
  const UTAH_MUNI = `City of Provo, Utah — Request for Proposals
RFP for Municipal Asset Management and Permitting Software Solution.
The City of Provo is a municipal government in the State of Utah. Award on a best value basis.
Submit a signed proposal as a searchable PDF.`;
  const TEXAS_COUNTY = `Harris County, Texas — Request for Proposals
RFP for Permitting Software. The County will award on a best value basis.
A Conflict of Interest Questionnaire (CIQ) must accompany the proposal.`;

  it('a Utah municipality pulls NO Texas form (the CIQ bug) and reports no state rulebook loaded', () => {
    const bp = buildProposalBlueprint({ files: [{ name: 'provo.pdf', text: UTAH_MUNI }], buyer: {} }, { now: NOW });
    expect(bp.jurisdiction?.state).toBe('Utah');
    expect(bp.buyerType).toBe('other');
    expect(bp.stateFormsStatus?.loaded).toBe(false);
    expect(bp.stateFormsStatus?.note).toMatch(/Utah/);
    expect(bp.forms.find((f) => f.key === 'ciq')?.disposition).toBe('not_required');
    // No Texas form is asserted required/at-award for an off-jurisdiction buyer.
    expect(bp.forms.every((f) => f.disposition === 'not_required')).toBe(true);
  });

  it('a Texas county still gets the Texas CIQ required and reports the Texas rulebook loaded', () => {
    const bp = buildProposalBlueprint({ files: [{ name: 'harris.pdf', text: TEXAS_COUNTY }], buyer: {} }, { now: NOW });
    expect(bp.jurisdiction?.state).toBe('Texas');
    expect(bp.buyerType).toBe('local_government');
    expect(bp.stateFormsStatus?.loaded).toBe(true);
    expect(bp.forms.find((f) => f.key === 'ciq')?.disposition).toBe('required');
  });
});
