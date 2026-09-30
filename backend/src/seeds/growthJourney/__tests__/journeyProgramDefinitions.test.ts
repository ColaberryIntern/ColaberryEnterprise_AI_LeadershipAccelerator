import {
  JOURNEY_PROGRAMS,
  PROGRAM_SLUGS,
  pathsForProgram,
} from '../journeyProgramDefinitions';
import { allowedFamiliesFor } from '../offerPolicyDefinitions';
import { LEARNER_OFFER_FAMILIES, AI_FLOTATION_DENIED_FAMILIES } from '../../../models/OfferFamily';
import { JOURNEY_PROGRAM_KINDS } from '../../../models/JourneyProgram';

/**
 * T212 — §5's four programs, and the join that keeps them honest.
 *
 * The interesting assertions are not "there are four programs". They are:
 *
 *   1. THE PATHS ARE DERIVED from T202's policy, so §4 and §5 cannot disagree.
 *      A literal path list per programme is how AI Flotation would eventually
 *      acquire a `business_training` path that the runtime gate then refuses —
 *      a contradiction that reads as a policy bug rather than as two lists
 *      drifting apart.
 *
 *   2. THE SLUGS ARE EXPORTED, because T205 seeds a programme on
 *      `colaberry-training` too. If it invents its own slug there will be two
 *      programmes on that brand and the unique index on `(brand_id, slug)`
 *      will NOT catch it — two different slugs are two legal rows.
 */

const find = (brandSlug: string) => JOURNEY_PROGRAMS.find((p) => p.brand_slug === brandSlug)!;

describe('the four programs §5 defines', () => {
  it('covers exactly the four brands, one program each', () => {
    expect(JOURNEY_PROGRAMS).toHaveLength(4);
    expect(JOURNEY_PROGRAMS.map((p) => p.brand_slug).sort()).toEqual([
      'ai-flotation',
      'colaberry-enterprise',
      'colaberry-training',
      'cpn',
    ]);
  });

  it('gives each the kind §5 describes', () => {
    expect(find('cpn').kind).toBe('learner');
    expect(find('colaberry-training').kind).toBe('learner');
    // §5.3 "Colaberry Business Growth Journey" — sells training AND services.
    expect(find('colaberry-enterprise').kind).toBe('business');
    // §5.4 — consulting and AI build leads, never training.
    expect(find('ai-flotation').kind).toBe('consulting');
  });

  it('uses only kinds the model permits', () => {
    for (const p of JOURNEY_PROGRAMS) expect(JOURNEY_PROGRAM_KINDS).toContain(p.kind);
  });

  it('carries both slugs, since brand slugs are unique only per tenant', () => {
    for (const p of JOURNEY_PROGRAMS) {
      expect(p.tenant_slug).toMatch(/^[a-z0-9-]+$/);
      expect(p.brand_slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('has no duplicate (brand, slug) pair — the pair the unique index enforces', () => {
    const pairs = JOURNEY_PROGRAMS.map((p) => `${p.brand_slug}/${p.slug}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});

describe('the slugs are exported so a second file cannot invent one', () => {
  it('every definition takes its slug from PROGRAM_SLUGS', () => {
    expect(find('cpn').slug).toBe(PROGRAM_SLUGS.cpn);
    expect(find('colaberry-training').slug).toBe(PROGRAM_SLUGS.colaberryTraining);
    expect(find('colaberry-enterprise').slug).toBe(PROGRAM_SLUGS.colaberryEnterprise);
    expect(find('ai-flotation').slug).toBe(PROGRAM_SLUGS.aiFlotation);
  });

  it('exports the colaberry-training slug T205 has to reuse', () => {
    // plan.md:191 has T205 seeding Explorer as program #1 on this brand. A
    // literal there instead of this constant produces a SECOND programme that
    // the database accepts, and the brand default then points at whichever
    // landed first.
    expect(PROGRAM_SLUGS.colaberryTraining).toBe('learner');
    expect(find('colaberry-training').slug).toBe(PROGRAM_SLUGS.colaberryTraining);
  });

  it('lets the two learner brands share a slug, because uniqueness is per BRAND', () => {
    expect(PROGRAM_SLUGS.cpn).toBe(PROGRAM_SLUGS.colaberryTraining);
    // Same slug, different brands — two distinct programmes, both legal.
    expect(find('cpn').brand_slug).not.toBe(find('colaberry-training').brand_slug);
  });
});

describe('the paths are DERIVED from the offer policy, not listed again', () => {
  it('matches allowedFamiliesFor exactly, for every brand', () => {
    for (const p of JOURNEY_PROGRAMS) {
      expect(pathsForProgram(p)).toEqual(allowedFamiliesFor(p.tenant_slug, p.brand_slug));
    }
  });

  it('gives each brand the count §4 permits', () => {
    expect(pathsForProgram(find('cpn'))).toHaveLength(2);
    expect(pathsForProgram(find('colaberry-training'))).toHaveLength(5);
    expect(pathsForProgram(find('colaberry-enterprise'))).toHaveLength(6);
    expect(pathsForProgram(find('ai-flotation'))).toHaveLength(5);
  });

  it('produces a non-empty path list for every program', () => {
    // Non-vacuity: a helper returning [] would satisfy every "does not contain"
    // assertion below.
    for (const p of JOURNEY_PROGRAMS) expect(pathsForProgram(p).length).toBeGreaterThan(0);
  });

  it('is stable in catalog order rather than definition order', () => {
    // Path priority is the array index, so an unstable order would silently
    // renumber priorities on a re-run.
    for (const p of JOURNEY_PROGRAMS) {
      expect(pathsForProgram(p)).toEqual(pathsForProgram(p));
    }
    expect(pathsForProgram(find('colaberry-enterprise'))).toEqual([
      'business_training',
      'ai_consulting',
      'workflow_automation',
      'application_build',
      'ai_project',
      'paid_discovery',
    ]);
  });
});

describe('§4:287 holds at the PATH layer too, not only at the runtime gate', () => {
  it('AI Flotation gets no denied family as a path', () => {
    // The denial is subtracted before the list is returned, so this cannot be
    // satisfied by the eligibility gate refusing it later at runtime. A path
    // that exists and is then refused is a contradiction an operator would read
    // as a policy bug.
    const paths = pathsForProgram(find('ai-flotation'));
    for (const denied of AI_FLOTATION_DENIED_FAMILIES) {
      expect(paths).not.toContain(denied);
    }
  });

  it('AI Flotation gets no business_training path, named specifically', () => {
    expect(pathsForProgram(find('ai-flotation'))).not.toContain('business_training');
  });

  it('neither business brand gets a learner path', () => {
    for (const brand of ['colaberry-enterprise', 'ai-flotation']) {
      const paths = pathsForProgram(find(brand));
      for (const learner of LEARNER_OFFER_FAMILIES) expect(paths).not.toContain(learner);
    }
  });

  it('AI Flotation is Colaberry Enterprise minus exactly business_training', () => {
    const enterprise = pathsForProgram(find('colaberry-enterprise'));
    const flotation = pathsForProgram(find('ai-flotation'));
    expect(flotation).toEqual(enterprise.filter((f) => f !== 'business_training'));
  });

  it('CPN gets no paid training path', () => {
    // §4's "only" — CPN is free training and community, nothing else.
    expect(pathsForProgram(find('cpn'))).toEqual([
      'learner_free_training',
      'learner_community_subscription',
    ]);
  });
});
