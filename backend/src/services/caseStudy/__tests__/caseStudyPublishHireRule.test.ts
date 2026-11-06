/**
 * hire_no_linked_person - a hire record must resolve to a person.
 *
 * The rule is pure, so it is asserted directly AND through the real gate, because a rule
 * that is correct but never called is the failure the gate's own header warns about.
 */
import { Blockers } from '../caseStudyPublishRules';
import { HIRE_NO_LINKED_PERSON_REMEDY, ruleHireLinkedPerson } from '../caseStudyPublishHireRule';
import { CASE_STUDY_PUBLISH_BLOCKER_CODES, evaluateCaseStudyPublishGate } from '../caseStudyPublishGate';
import type { CaseStudyPublishGateInput } from '../caseStudyPublishGate';
import type { CaseStudySurfaceKey } from '../../../types/caseStudy';

const input = (
  surfaceKey: CaseStudySurfaceKey,
  hire?: CaseStudyPublishGateInput['hire'],
): CaseStudyPublishGateInput => ({
  surfaceKey,
  caseStudy: {
    id: 'cs-1', status: 'approved',
    organizationIdentityMode: 'anonymized', organizationNamingConsent: false,
    builderIdentityMode: 'named', builderNamingConsent: true,
  },
  snapshot: null,
  ...(hire !== undefined ? { hire } : {}),
});

const codesOf = (i: CaseStudyPublishGateInput): readonly string[] => {
  const b = new Blockers();
  ruleHireLinkedPerson(i, b);
  return b.all().map((x) => x.code);
};

describe('ruleHireLinkedPerson', () => {
  it('refuses hire when nobody is linked', () => {
    expect(codesOf(input('hire', { linkedPeople: 0 }))).toEqual(['hire_no_linked_person']);
  });

  it('fails CLOSED when the fact is absent or null - a lookup that failed is not a person', () => {
    expect(codesOf(input('hire'))).toEqual(['hire_no_linked_person']);
    expect(codesOf(input('hire', null))).toEqual(['hire_no_linked_person']);
  });

  it('allows hire when at least one person is linked', () => {
    expect(codesOf(input('hire', { linkedPeople: 1 }))).toEqual([]);
    expect(codesOf(input('hire', { linkedPeople: 3 }))).toEqual([]);
  });

  it('is a no-op on every other surface, linked or not', () => {
    for (const s of ['enterprise', 'training', 'ai-flotation', 'refactored'] as const) {
      expect(codesOf(input(s))).toEqual([]);
      expect(codesOf(input(s, { linkedPeople: 0 }))).toEqual([]);
    }
  });

  it('tells the admin exactly how to link the person', () => {
    const b = new Blockers();
    ruleHireLinkedPerson(input('hire', { linkedPeople: 0 }), b);
    const [blocker] = b.all();
    expect(blocker.remedy).toBe(HIRE_NO_LINKED_PERSON_REMEDY);
    expect(HIRE_NO_LINKED_PERSON_REMEDY).toBe(
      "link the case study's repository to the builder's project (github_connections) or set case_studies.project_id",
    );
  });
});

describe('the real gate runs the rule', () => {
  it('reports hire_no_linked_person on hire with no person, alongside the other blockers', () => {
    const decision = evaluateCaseStudyPublishGate(input('hire', { linkedPeople: 0 }));
    expect(decision.allowed).toBe(false);
    expect(decision.codes).toContain('hire_no_linked_person');
    // hire is publishable now, so the surface itself is never the reason
    expect(decision.codes).not.toContain('surface_not_publishable');
  });

  it('does not raise it once a person is linked, nor on enterprise', () => {
    expect(evaluateCaseStudyPublishGate(input('hire', { linkedPeople: 1 })).codes)
      .not.toContain('hire_no_linked_person');
    expect(evaluateCaseStudyPublishGate(input('enterprise')).codes)
      .not.toContain('hire_no_linked_person');
  });

  it('declares the code, so a log line carrying it is a known code', () => {
    expect(CASE_STUDY_PUBLISH_BLOCKER_CODES).toContain('hire_no_linked_person');
  });
});
