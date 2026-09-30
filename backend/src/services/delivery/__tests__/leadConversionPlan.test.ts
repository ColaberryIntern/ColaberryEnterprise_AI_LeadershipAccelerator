import { planConversion, slugify, type LeadFacts } from '../leadConversionPlan';

/**
 * The decisions behind turning a lead into a delivery client.
 *
 * The case that matters most is the SECOND run. This is an operator action fired from a
 * screen, and the natural human response to an uncertain result is to press the button
 * again. A conversion that produced a second organization and a second engagement on that
 * press would surface weeks later as duplicate client records with real delivery work
 * hanging off both.
 */

const lead = (over: Partial<LeadFacts> = {}): LeadFacts => ({
  id: 7,
  email: 'dana@northgate.example',
  company: 'Northgate Transit',
  name: 'Dana Whitfield',
  message: 'Riders cannot see accurate arrival times.',
  ...over,
});

const full = {
  organizationId: 'o1', engagementId: 'e1', identityId: 'i1', projectId: 'p1', membershipId: 'm1',
};

describe('planConversion', () => {
  it('derives the whole chain from a lead', () => {
    const plan = planConversion({ lead: lead(), brandExists: true });
    if (plan.refused) throw new Error('expected a plan');

    expect(plan.organizationName).toBe('Northgate Transit');
    expect(plan.engagementName).toBe('Northgate Transit - delivery');
    expect(plan.projectName).toBe('Northgate Transit - initial build');
    expect(plan.projectSlug).toBe('northgate-transit-initial-build');
    expect(plan.engagementType).toBe('commercial_client');
    expect(plan.projectClass).toBe('commercial_client');
    expect(plan.projectStatus).toBe('discovery');
    expect(plan.businessProblem).toBe('Riders cannot see accurate arrival times.');
    expect(plan.createsAnything).toBe(true);
  });

  it('carries the client through, trimmed', () => {
    const plan = planConversion({ lead: lead({ email: '  Dana@Northgate.example  ', name: ' Dana ' }), brandExists: null });
    if (plan.refused) throw new Error('expected a plan');
    expect(plan.clientEmail).toBe('Dana@Northgate.example');
    expect(plan.clientDisplayName).toBe('Dana');
  });

  it('treats a blank message as no problem statement, not an empty one', () => {
    const plan = planConversion({ lead: lead({ message: '   ' }), brandExists: null });
    if (plan.refused) throw new Error('expected a plan');
    expect(plan.businessProblem).toBeNull();
  });

  it('honours operator-supplied names over the defaults', () => {
    const plan = planConversion({
      lead: lead(), brandExists: null,
      engagementName: '  Northgate 2027 programme ', projectName: '  Arrivals board  ',
    });
    if (plan.refused) throw new Error('expected a plan');
    expect(plan.engagementName).toBe('Northgate 2027 programme');
    expect(plan.projectName).toBe('Arrivals board');
    expect(plan.projectSlug).toBe('arrivals-board');
  });

  describe('refusals', () => {
    it('refuses a lead that does not exist', () => {
      expect(planConversion({ lead: null, brandExists: null })).toMatchObject({
        refused: true, reason: 'no_such_lead',
      });
    });

    it('refuses a lead with no email, because that client could never sign in', () => {
      expect(planConversion({ lead: lead({ email: '   ' }), brandExists: null })).toMatchObject({
        refused: true, reason: 'lead_has_no_email',
      });
    });

    it('refuses a lead with no company, because an organization needs a name', () => {
      expect(planConversion({ lead: lead({ company: null }), brandExists: null })).toMatchObject({
        refused: true, reason: 'lead_has_no_company',
      });
    });

    it('refuses a brand that was asked for and does not exist', () => {
      expect(planConversion({ lead: lead(), brandExists: false })).toMatchObject({
        refused: true, reason: 'no_such_brand',
      });
    });

    it('reports the missing email first when both are missing', () => {
      // Ordering is deliberate: no email is the blocking problem whatever else is present,
      // and an operator fixing one field at a time should hear about that one first.
      expect(planConversion({ lead: lead({ email: '', company: '' }), brandExists: null }))
        .toMatchObject({ reason: 'lead_has_no_email' });
    });

    it('allows no brand at all - the client room simply shows no brand', () => {
      expect(planConversion({ lead: lead(), brandExists: null }).refused).toBe(false);
    });
  });

  describe('running it twice', () => {
    it('creates nothing when the whole chain already exists', () => {
      const plan = planConversion({ lead: lead(), brandExists: true, existing: full });
      if (plan.refused) throw new Error('expected a plan');

      expect(plan.createsAnything).toBe(false);
      expect(plan.reuse).toEqual({
        organizationId: true, engagementId: true, identityId: true, projectId: true, membershipId: true,
      });
    });

    it('still creates when an earlier run died part-way', () => {
      // THE case this guards. A run that wrote the engagement and stopped leaves a lead
      // that looks converted and a client who cannot sign in. Reporting "already done"
      // would strand them permanently, so a partial chain must still be completable.
      const plan = planConversion({
        lead: lead(), brandExists: true,
        existing: { organizationId: 'o1', engagementId: 'e1', identityId: 'i1', projectId: 'p1' },
      });
      if (plan.refused) throw new Error('expected a plan');

      expect(plan.createsAnything).toBe(true);
      expect(plan.reuse.membershipId).toBe(false);
      expect(plan.reuse.engagementId).toBe(true);
    });

    it('returns identical derived values on both runs', () => {
      // Same input, same output - the plan itself must not drift between runs, or a
      // replay would rename the engagement it is supposed to be reusing.
      const first = planConversion({ lead: lead(), brandExists: true });
      const second = planConversion({ lead: lead(), brandExists: true, existing: full });
      if (first.refused || second.refused) throw new Error('expected plans');

      expect(second.engagementName).toBe(first.engagementName);
      expect(second.projectSlug).toBe(first.projectSlug);
    });
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Northgate Transit')).toBe('northgate-transit');
  });

  it('collapses punctuation rather than emitting it', () => {
    expect(slugify('Acme, Inc. // Rail')).toBe('acme-inc-rail');
  });

  it('never returns empty, because the column is NOT NULL', () => {
    // An all-symbol company name would otherwise fail at write time, a long way from
    // the thing that caused it.
    expect(slugify('!!! ???')).toBe('project');
    expect(slugify('')).toBe('project');
  });

  it('stays inside the column', () => {
    expect(slugify('a'.repeat(400)).length).toBeLessThanOrEqual(110);
  });

  it('does not leave a trailing hyphen after truncation', () => {
    expect(slugify(`${'a'.repeat(109)} tail`)).not.toMatch(/-$/);
  });
});
