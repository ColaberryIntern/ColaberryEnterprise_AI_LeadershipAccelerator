/**
 * The two Services Upgrade (SV1) publish rules, through the REAL gate: must-link (fail-closed, no override) and
 * outside = internal only. The reference input here has no snapshot on purpose - these rules sit before the content
 * rules and must fire regardless - so assertions are on these two codes only.
 */
import { evaluateCaseStudyPublishGate, formatCaseStudyPublishBlockers } from '../caseStudyPublishGate';
import type { CaseStudyPublishGateInput, CaseStudyPublishRecord } from '../caseStudyPublishGate';
import { Blockers } from '../caseStudyPublishRules';
import { ruleConfirmedServiceLink, ruleOutsideInternalOnly } from '../caseStudyPublishServiceLinkRule';

const record = (o: Partial<CaseStudyPublishRecord> = {}): CaseStudyPublishRecord => ({
  id: 'cs1', status: 'approved', organizationIdentityMode: 'hidden', organizationNamingConsent: false,
  builderIdentityMode: 'anonymous', builderNamingConsent: false, ...o,
});
const input = (o: Partial<CaseStudyPublishGateInput> = {}): CaseStudyPublishGateInput => ({
  surfaceKey: 'enterprise', caseStudy: record(), snapshot: null, serviceLinks: { confirmedCount: 1 }, ...o,
});
const codes = (i: CaseStudyPublishGateInput) => evaluateCaseStudyPublishGate(i).codes;

describe('no_confirmed_service_link (must link)', () => {
  it('passes with one confirmed link', () => {
    expect(codes(input())).not.toContain('no_confirmed_service_link');
  });

  it.each([
    ['zero', { confirmedCount: 0 }],
    ['null (lookup failed)', null],
    ['absent', undefined],
    ['NaN', { confirmedCount: Number.NaN }],
    ['negative', { confirmedCount: -1 }],
  ])('blocks when the confirmed count is %s - fail closed', (_label, serviceLinks) => {
    const i = input();
    if (serviceLinks === undefined) delete (i as { serviceLinks?: unknown }).serviceLinks;
    else (i as { serviceLinks?: unknown }).serviceLinks = serviceLinks;
    expect(codes(i)).toContain('no_confirmed_service_link');
  });

  it('names the field and says what closes it, in the house line format', () => {
    const d = evaluateCaseStudyPublishGate(input({ serviceLinks: { confirmedCount: 0 } }));
    const b = d.blockers.find((x) => x.code === 'no_confirmed_service_link');
    expect(b?.field).toBe('case_study_service_links');
    expect(b?.message).toMatch(/^no confirmed service link \(case_study_service_links has 0 confirmed rows/);
    expect(b?.message).toMatch(/attach this case study to at least one service in Our Services$/);
    expect(d.summary).toContain('- no confirmed service link (case_study_service_links');
    expect(b?.remedy.length).toBeGreaterThan(0);
  });

  it('applies on every surface, not only enterprise', () => {
    for (const surfaceKey of ['enterprise', 'training', 'ai-flotation', 'refactored', 'hire'] as const) {
      expect(codes(input({ surfaceKey, serviceLinks: { confirmedCount: 0 } }))).toContain('no_confirmed_service_link');
    }
  });

  it('has no override: no input field turns it off', () => {
    const i = { ...input({ serviceLinks: { confirmedCount: 0 } }), force: true, override: true } as unknown as CaseStudyPublishGateInput;
    expect(codes(i)).toContain('no_confirmed_service_link');
  });
});

describe('outside_case_study_internal_only', () => {
  it.each(['external_document', 'external_drive'])('blocks source_type %s on enterprise and on hire, even when linked', (sourceType) => {
    for (const surfaceKey of ['enterprise', 'hire'] as const) {
      const d = evaluateCaseStudyPublishGate(input({ surfaceKey, caseStudy: record({ sourceType }) }));
      const b = d.blockers.find((x) => x.code === 'outside_case_study_internal_only');
      expect(b?.field).toBe('case_studies.source_type');
      expect(b?.message).toContain(`"${sourceType}"`);
    }
  });

  it.each([['project'], ['repo_collection'], [null], [undefined], ['unknown_kind']])('does not fire for inside / unknown source_type %p', (sourceType) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(codes(input({ caseStudy: record({ sourceType: sourceType as string | null | undefined }) }))).not.toContain('outside_case_study_internal_only');
    warn.mockRestore();
  });
});

describe('the two rules as pure functions', () => {
  it('each adds exactly one blocker, or none', () => {
    const b = new Blockers();
    ruleConfirmedServiceLink(input(), b);
    ruleOutsideInternalOnly(input(), b);
    expect(b.all()).toHaveLength(0);
    ruleConfirmedServiceLink(input({ serviceLinks: null }), b);
    ruleOutsideInternalOnly(input({ caseStudy: record({ sourceType: 'external_document' }) }), b);
    expect(b.all().map((x) => x.code)).toEqual(['no_confirmed_service_link', 'outside_case_study_internal_only']);
    expect(formatCaseStudyPublishBlockers(b.all()).split('\n')).toHaveLength(3);
  });
});
