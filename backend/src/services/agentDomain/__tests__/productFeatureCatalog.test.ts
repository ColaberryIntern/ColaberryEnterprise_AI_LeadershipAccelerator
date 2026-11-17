/**
 * AF11.9 — the front door: can the product already do this?
 *
 * The property worth protecting is the EXPENSIVE DIRECTION. Answering `not_built` about something
 * that exists costs a scope sheet Ali then reads, and he is the backstop the whole ladder is
 * built around. Answering `in_app` about something that does not exist sends a builder to a
 * screen that is not there, and they will not trust the next answer either.
 *
 * So the matcher is deliberately literal, and these tests pin that it stays literal rather than
 * getting clever.
 */

import {
  CURATED_DOMAINS,
  PRODUCT_FEATURES,
  answerFrontDoor,
  catalogCoverage,
  featuresForDomain,
  type ProductFeature,
} from '../productFeatureCatalog';

const ask = (candidate: string, domainKey = 'marketing', features?: ReadonlyArray<ProductFeature>) =>
  answerFrontDoor({ candidate, domainKey, features });

describe('THE CONTROL — the catalog is real, and it is honest about being partial', () => {
  it('has entries, and every one carries the evidence for its claim', () => {
    // An entry with no route file and no date is a claim nobody checked, which is the thing that
    // makes a front door untrustworthy. Asserted per entry rather than in prose.
    expect(PRODUCT_FEATURES.length).toBeGreaterThan(0);
    for (const f of PRODUCT_FEATURES) {
      expect(f.feature_key).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
      expect(f.backed_by.length).toBeGreaterThan(10);
      expect(f.verified_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.product_route.startsWith('/')).toBe(true);
      expect(f.what_it_does.length).toBeGreaterThan(20);
    }
  });

  it('every `partly` entry says WHY a ruling is needed, and no `in_app` entry pretends one is', () => {
    // `partly` with no reason is just a shrug, and it is the state that decides whether Ali is
    // asked a question at all.
    for (const f of PRODUCT_FEATURES) {
      if (f.state === 'partly') expect(String(f.ruling_needed).length).toBeGreaterThan(20);
      else expect(f.ruling_needed).toBeNull();
    }
  });

  it('REPORTS ITS OWN COVERAGE, so an unmapped domain is not read as an empty product', () => {
    const c = catalogCoverage();
    expect(c.features).toBe(PRODUCT_FEATURES.length);
    expect(c.domains).toEqual([...CURATED_DOMAINS]);
    // And it is genuinely partial today: this is a statement of fact, not a target.
    expect(c.domains.length).toBeLessThan(10);
  });
});

describe('the landing page case, which is the one that proved the gap', () => {
  it('answers IN THE APP for drafting, and points at the real screen', () => {
    const a = ask('draft a landing page from a campaign brief');
    expect(a.state).toBe('in_app');
    expect(a.feature?.product_route).toBe('/admin/landing-pages');
    expect(a.route_to).toBe('use_it_then_ask_for_a_grant');
  });

  it('DOES NOT claim the builder has used it, which is AF11.7\'s question and not this one', () => {
    // The product having the feature is not the builder having tried it. "Go and use it first"
    // only means something if trying it is what produces the answer.
    expect(ask('draft a landing page').implies_tried_in_product).toBeNull();
  });

  it('answers PARTLY for publishing, because that puts something on the public internet', () => {
    const a = ask('publish a landing page when the copy is approved');
    expect(a.state).toBe('partly');
    expect(a.route_to).toBe('ask_for_a_ruling');
    expect(a.feature?.ruling_needed).toMatch(/public internet/i);
    // It must not pre-empt the ruling by implying a grant or a build.
    expect(a.implies_tried_in_product).toBeNull();
  });

  it('THE WHOLE POINT: a landing page request is never routed to a build', () => {
    for (const c of [
      'draft a landing page',
      'create a landing page from a brief',
      'I want the agent to draft a landing page each week',
    ]) {
      expect(ask(c).route_to).not.toBe('write_a_scope_sheet');
    }
  });
});

describe('the matcher refuses to guess, and answers not_built when it is unsure', () => {
  it('one shared word is not a match', () => {
    // "page" alone must not match the landing page feature. A fuzzy matcher that half-recognised
    // this would tell a builder the product already does something it does not.
    const a = ask('build a page of weekly metrics for the team');
    expect(a.state).toBe('not_built');
    expect(a.route_to).toBe('write_a_scope_sheet');
  });

  it('answers not_built for something genuinely absent, and implies the AF11.7 value', () => {
    const a = ask('scan the repository for colors outside the approved palette');
    expect(a.state).toBe('not_built');
    expect(a.implies_tried_in_product).toBe('not_built');
  });

  it('does NOT match a feature from another domain', () => {
    // Sarbjit asking for a case study must not be told marketing already has one.
    const a = ask('build a case study', 'marketing');
    expect(a.state).toBe('not_built');
    expect(ask('build a case study', 'product_experience').state).toBe('in_app');
  });

  it('matches on the feature key exactly, so a stored answer resolves back', () => {
    const a = ask('marketing.landing_page.draft');
    expect(a.feature?.feature_key).toBe('marketing.landing_page.draft');
  });

  it('is case and space insensitive, because a builder types prose', () => {
    expect(ask('  DRAFT A LANDING PAGE  ').state).toBe('in_app');
  });
});

describe('an unmapped domain is unmapped, never an empty product', () => {
  it('says the domain is not mapped rather than implying nothing exists', () => {
    const a = ask('do the thing', 'learner_success');
    expect(a.state).toBe('not_built');
    expect(a.domain_is_mapped).toBe(false);
  });

  it('says a MAPPED domain is mapped even when this particular candidate misses', () => {
    // The difference matters: "we have not looked at your domain" and "we looked and it is not
    // there" should not read the same to the person deciding whether to trust the answer.
    const a = ask('something nobody has built', 'marketing');
    expect(a.state).toBe('not_built');
    expect(a.domain_is_mapped).toBe(true);
  });

  it('lists what a domain already has, for the browse view behind the door', () => {
    const marketing = featuresForDomain('marketing');
    expect(marketing.length).toBeGreaterThanOrEqual(2);
    expect(marketing.every((f) => f.domain_key === 'marketing')).toBe(true);
    expect(featuresForDomain('learner_success')).toEqual([]);
  });
});

describe('the boundary with AF11.2 and AF11.7, as behaviour rather than a comment', () => {
  it('answers about the PRODUCT, not about registered tools', () => {
    // AF11.2 compares against registered tools and would wave a landing page request through to
    // a build, because no agent has been granted those endpoints. This is the check that can see
    // it, and it is the most expensive mistake in the path: paying to build what we already own.
    const a = ask('draft a landing page');
    expect(a.state).toBe('in_app');
    expect(a.feature?.backed_by).toContain('landingPageRoutes.ts');
  });

  it('never writes the AF11.7 field for a feature that exists: that is the builder\'s answer', () => {
    // AF11.7 is the gate, this is the signpost. The only state it implies is `not_built`, which
    // nobody has to try anything to establish.
    const implied = PRODUCT_FEATURES.map((f) => ask(f.feature_key, f.domain_key).implies_tried_in_product);
    expect(implied.every((v) => v === null)).toBe(true);
    expect(ask('something absent').implies_tried_in_product).toBe('not_built');
  });
});

describe('a caller can supply its own catalog, so the matcher is testable without the real list', () => {
  it('uses the features it is given', () => {
    const fake: ProductFeature[] = [{
      feature_key: 'sales.quote.build',
      domain_key: 'sales',
      label: 'Build a quote',
      what_it_does: 'Assemble a priced quote from a template and send it for review.',
      state: 'in_app',
      product_route: '/admin/quotes',
      matches: ['build quote', 'quote'],
      backed_by: 'test fixture',
      verified_on: '2026-11-17',
      ruling_needed: null,
    }];
    expect(ask('build a quote for the client', 'sales', fake).state).toBe('in_app');
    expect(ask('build a quote for the client', 'sales').state).toBe('not_built');
  });
});
