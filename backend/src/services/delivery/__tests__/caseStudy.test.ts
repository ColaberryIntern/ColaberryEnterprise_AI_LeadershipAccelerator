/**
 * Gate 15 — Case Study + Attribution.
 *
 * Two properties carry this gate: **delivery acceptance is not publication consent**, and
 * **private client facts never reach marketing analytics**. Both are asserted against
 * behaviour, and both have negative controls so the suite cannot pass on a module that
 * simply refuses everything.
 */

import {
  CASE_STUDY_FACTS,
  findClientIdentifiers,
  guardAnalyticsPayload,
  isCaseStudyFact,
  type CaseStudyConsent,
} from '../../../modules/delivery/caseStudy';
import { approveForPublication, buildCaseStudyCandidate } from '../caseStudyAdapter';

const fullConsent: CaseStudyConsent = {
  deliveryAccepted: true,
  publicationApproved: true,
  nameUseApproved: true,
  publicationApprovedByIdentityId: 'client-comms-1',
};

const baseInput = {
  deliveryProjectId: 'project-1',
  clientName: 'Northgate Transit Authority',
  clientDescriptor: 'a regional transit authority',
  consent: fullConsent,
  facts: {
    problem_statement: 'Riders could not see real-time arrivals.',
    stories_delivered: 24,
    release_count: 3,
  },
};

// ---------------------------------------------------------------------------
// Publishable facts
// ---------------------------------------------------------------------------

describe('case study vocabulary', () => {
  it('declares the publishable facts', () => {
    expect(CASE_STUDY_FACTS.length).toBeGreaterThan(0);
    expect(isCaseStudyFact('problem_statement')).toBe(true);
  });

  it('rejects a fact that is not publishable', () => {
    expect(isCaseStudyFact('contract_value')).toBe(false);
    expect(isCaseStudyFact('builder_assessment')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Building a candidate
// ---------------------------------------------------------------------------

describe('buildCaseStudyCandidate', () => {
  it('builds a named candidate when every consent is present', () => {
    const result = buildCaseStudyCandidate(baseInput);
    expect(result.built).toBe(true);
    if (result.built) {
      expect(result.candidate.status).toBe('draft_candidate');
      expect(result.candidate.clientName).toBe('Northgate Transit Authority');
      expect(result.candidate.anonymous).toBe(false);
    }
  });

  it('REFUSES a case study about work the client never accepted', () => {
    // Not a marketing shortcut — a claim the client can contradict.
    const result = buildCaseStudyCandidate({
      ...baseInput,
      consent: { ...fullConsent, deliveryAccepted: false },
    });
    expect(result.built).toBe(false);
    if (!result.built) expect(result.refusals.map((r) => r.rule)).toContain('delivery_not_accepted');
  });

  it('runs ANONYMOUS when name-use was not approved, even though a name is on file', () => {
    // A name in the database is not permission to print it.
    const result = buildCaseStudyCandidate({
      ...baseInput,
      consent: { ...fullConsent, nameUseApproved: false },
    });
    expect(result.built).toBe(true);
    if (result.built) {
      expect(result.candidate.anonymous).toBe(true);
      expect(result.candidate.clientName).toBeNull();
      expect(result.candidate.clientDescriptor).toBe('a regional transit authority');
    }
    if (result.built) expect(result.warnings.map((w) => w.rule)).toContain('name_withheld');
  });

  it('requires a descriptor even when the client is named', () => {
    // It is what the study falls back to if name-use is later withdrawn.
    const result = buildCaseStudyCandidate({ ...baseInput, clientDescriptor: 'a co' });
    expect(result.built).toBe(false);
    if (!result.built) expect(result.refusals.map((r) => r.rule)).toContain('descriptor_required');
  });

  it('drops non-publishable facts and SAYS it dropped them', () => {
    // Silently discarding something the caller thought they were publishing is its own
    // kind of surprise.
    const result = buildCaseStudyCandidate({
      ...baseInput,
      facts: { ...baseInput.facts, contract_value: 250_000, mentor_notes: 'intern struggled' },
    });
    expect(result.built).toBe(true);
    if (result.built) {
      expect(result.candidate.facts).not.toHaveProperty('contract_value');
      expect(result.candidate.facts).not.toHaveProperty('mentor_notes');
      expect(result.warnings.filter((w) => w.rule === 'fact_not_publishable')).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Publication is a separate decision
// ---------------------------------------------------------------------------

describe('approveForPublication', () => {
  const draft = () => {
    const r = buildCaseStudyCandidate(baseInput);
    if (!r.built) throw new Error('expected a candidate');
    return r.candidate;
  };

  it('approves when publication consent is present and recorded', () => {
    // The negative control: a gate that refused everything would pass every test below.
    const result = approveForPublication(draft(), fullConsent);
    expect(result.approved).toBe(true);
    if (result.approved) expect(result.candidate.status).toBe('approved_for_publication');
  });

  it('DELIVERY ACCEPTANCE IS NOT PUBLICATION CONSENT', () => {
    // The property the whole module turns on.
    const result = approveForPublication(draft(), {
      deliveryAccepted: true,
      publicationApproved: false,
      nameUseApproved: true,
      publicationApprovedByIdentityId: 'client-comms-1',
    });
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.refusals.map((r) => r.rule)).toContain('publication_not_approved');
    }
  });

  it('refuses publication consent with no recorded approver', () => {
    const result = approveForPublication(draft(), {
      ...fullConsent,
      publicationApprovedByIdentityId: null,
    });
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.refusals.map((r) => r.rule)).toContain('approver_not_recorded');
    }
  });

  it('refuses to publish a NAMED study on publication consent alone', () => {
    // Publication permission alone permits the anonymous version, not the one with a logo.
    const result = approveForPublication(draft(), { ...fullConsent, nameUseApproved: false });
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.refusals.map((r) => r.rule)).toContain('name_use_not_approved');
    }
  });

  it('refuses to re-approve something already approved', () => {
    const first = approveForPublication(draft(), fullConsent);
    if (!first.approved) throw new Error('expected approval');
    const second = approveForPublication(first.candidate, fullConsent);
    expect(second.approved).toBe(false);
    if (!second.approved) expect(second.refusals.map((r) => r.rule)).toContain('not_a_draft');
  });

  it('exposes no way to publish', () => {
    // Gate 15 says publication remains separately approved. The way to make that true is
    // for this module to be structurally incapable of publishing.
    const adapter = require('../caseStudyAdapter');
    expect(Object.keys(adapter)).not.toContain('publish');
    expect(Object.keys(adapter)).not.toContain('publishCaseStudy');
  });
});

// ---------------------------------------------------------------------------
// Marketing analytics
// ---------------------------------------------------------------------------

describe('marketing analytics guard', () => {
  it('finds client-identifying fields at any depth', () => {
    const hits = findClientIdentifiers({ event: 'page_view', ctx: { client_name: 'Northgate' } });
    expect(hits).toHaveLength(1);
    expect(hits[0].path).toBe('ctx.client_name');
  });

  it('catches the fields that are legitimate on the delivery surface', () => {
    // These are fine on a delivery API and a disclosure in a marketing payload. That is
    // exactly why they need their own list rather than reusing Gate 10's.
    for (const field of ['engagement_id', 'repo_url', 'contract_value', 'preview_ref']) {
      expect(findClientIdentifiers({ [field]: 'x' }).length).toBeGreaterThan(0);
    }
  });

  it('REFUSES the whole payload rather than stripping it', () => {
    // An analytics event carrying client_name was built by code that thinks client
    // identity belongs in analytics. Removing the field leaves that code in place.
    const refusals = guardAnalyticsPayload({ event: 'signup', client_name: 'Northgate' });
    expect(refusals).toHaveLength(1);
    expect(refusals[0].rule).toBe('client_facts_in_analytics');
  });

  it('passes an ordinary marketing payload', () => {
    // The negative control. A guard that flagged everything would be turned off.
    expect(
      guardAnalyticsPayload({ event: 'page_view', path: '/case-studies/transit', referrer: 'google' }),
    ).toEqual([]);
  });

  it('reports truncation rather than returning clean', () => {
    let deep: any = { leaf: true };
    for (let i = 0; i < 12; i += 1) deep = { nested: deep };
    expect(findClientIdentifiers(deep, 4).some((h) => h.fragment === '(walk truncated)')).toBe(true);
  });

  it('terminates on a cyclic payload', () => {
    const cyclic: any = { event: 'x' };
    cyclic.self = cyclic;
    expect(() => findClientIdentifiers(cyclic)).not.toThrow();
  });
});
