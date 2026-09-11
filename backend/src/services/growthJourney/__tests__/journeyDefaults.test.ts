import * as fs from 'fs';
import * as path from 'path';

const resolvePublicContext = jest.fn();
const brandFindByPk = jest.fn();
const programFindByPk = jest.fn();

jest.mock('../../../modules/tenancy/tenantResolver', () => ({
  resolvePublicContext: (...a: unknown[]) => resolvePublicContext(...a),
}));

jest.mock('../../../models', () => ({
  Brand: { findByPk: (...a: unknown[]) => brandFindByPk(...a) },
}));

jest.mock('../../../models/JourneyProgram', () => ({
  JourneyProgram: { findByPk: (...a: unknown[]) => programFindByPk(...a) },
}));

import { resolveDefaultJourney, resolveDefaultJourneyProgramId } from '../journeyDefaults';

/**
 * T203 — the brand's default journey.
 *
 * Two properties carry the weight, and neither is "the happy path returns a
 * program":
 *
 *   1. IT ADDS NO HOST OR SLUG MAP. A third host-to-brand map is a hard stop for
 *      this run. The source-scan block at the bottom asserts it, because a map
 *      literal is easy to add and impossible to spot in a passing test suite.
 *
 *   2. WHEN NOTHING RESOLVES, NOTHING IS OFFERED. Not another brand's program.
 *      Choosing a brand for an unresolved visitor is choosing whose content a
 *      stranger sees, which is the harm §4 exists to prevent.
 */

const SRC = fs.readFileSync(path.join(__dirname, '..', 'journeyDefaults.ts'), 'utf8');

/** Source with comments stripped — what the module actually DOES. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const ctx = (brandSlug: string, over: Record<string, unknown> = {}) => ({
  tenantId: `tenant-${brandSlug}`,
  tenantSlug: brandSlug === 'colaberry-training' || brandSlug === 'colaberry-enterprise' ? 'colaberry' : brandSlug,
  brandId: `brand-${brandSlug}`,
  brandSlug,
  ...over,
});

const program = (over: Record<string, unknown> = {}) => ({
  id: 'program-1',
  slug: 'learner',
  status: 'active',
  ...over,
});

beforeEach(() => {
  resolvePublicContext.mockReset().mockResolvedValue({ context: null, path: 'unresolved' });
  brandFindByPk.mockReset().mockResolvedValue({ default_journey_program_id: 'program-1' });
  programFindByPk.mockReset().mockResolvedValue(program());
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** §4's four brands, each through both resolution paths. */
const BRANDS = ['cpn', 'colaberry-training', 'colaberry-enterprise', 'ai-flotation'] as const;

describe('every brand resolves through BOTH paths', () => {
  it.each(BRANDS)('%s resolves from a source slug alone', async (brandSlug) => {
    resolvePublicContext.mockResolvedValue({ context: ctx(brandSlug), path: 'source_slug' });
    brandFindByPk.mockResolvedValue({ default_journey_program_id: `program-${brandSlug}` });
    programFindByPk.mockResolvedValue(program({ id: `program-${brandSlug}` }));

    const r = await resolveDefaultJourney({ sourceSlug: brandSlug });

    expect(r.reason).toBe('resolved');
    expect(r.path).toBe('source_slug');
    expect(r.program?.id).toBe(`program-${brandSlug}`);
    expect(r.context?.brandSlug).toBe(brandSlug);
  });

  it.each(BRANDS)('%s resolves from a hostname alone', async (brandSlug) => {
    resolvePublicContext.mockResolvedValue({ context: ctx(brandSlug), path: 'brand_domain' });
    brandFindByPk.mockResolvedValue({ default_journey_program_id: `program-${brandSlug}` });
    programFindByPk.mockResolvedValue(program({ id: `program-${brandSlug}` }));

    const r = await resolveDefaultJourney({ hostname: `${brandSlug}.test` });

    expect(r.reason).toBe('resolved');
    expect(r.path).toBe('brand_domain');
    expect(r.program?.id).toBe(`program-${brandSlug}`);
  });

  it('resolves each brand to ITS OWN program, never a neighbour’s', async () => {
    // The cross-brand assertion. Two brands in the same tenant
    // (colaberry-training and colaberry-enterprise) are the pair most likely to
    // leak into each other.
    const seen: Record<string, string | undefined> = {};
    for (const brandSlug of BRANDS) {
      resolvePublicContext.mockResolvedValue({ context: ctx(brandSlug), path: 'brand_domain' });
      brandFindByPk.mockResolvedValue({ default_journey_program_id: `program-${brandSlug}` });
      programFindByPk.mockImplementation(async (id: string) => program({ id }));
      seen[brandSlug] = (await resolveDefaultJourney({ hostname: `${brandSlug}.test` })).program?.id;
    }
    expect(seen).toEqual({
      cpn: 'program-cpn',
      'colaberry-training': 'program-colaberry-training',
      'colaberry-enterprise': 'program-colaberry-enterprise',
      'ai-flotation': 'program-ai-flotation',
    });
    expect(new Set(Object.values(seen)).size).toBe(4);
  });
});

describe('it passes the RAW inputs straight through', () => {
  it('forwards all three fields untouched, resolving nothing itself', async () => {
    await resolveDefaultJourney({
      sourceSlug: 'Some-Slug',
      pageUrl: 'https://Example.TEST/a?b=c',
      hostname: 'Example.TEST',
    });
    expect(resolvePublicContext).toHaveBeenCalledWith({
      sourceSlug: 'Some-Slug',
      // Not lowercased, not parsed, not stripped. Normalisation belongs to the
      // resolver that owns the maps.
      pageUrl: 'https://Example.TEST/a?b=c',
      hostname: 'Example.TEST',
    });
  });

  it('asks the resolver exactly once', async () => {
    await resolveDefaultJourney({ hostname: 'a.test' });
    expect(resolvePublicContext).toHaveBeenCalledTimes(1);
  });
});

describe('when nothing resolves, nothing is offered', () => {
  it('returns no program for path=unresolved with context=null', async () => {
    resolvePublicContext.mockResolvedValue({ context: null, path: 'unresolved' });
    const r = await resolveDefaultJourney({ hostname: 'unknown.test' });
    expect(r.program).toBeNull();
    expect(r.reason).toBe('unresolved_context');
    expect(r.path).toBe('unresolved');
  });

  it('never reaches for a brand row when the context is null', async () => {
    // The specific failure this guards: falling through to "the first brand" or
    // a hardcoded default.
    resolvePublicContext.mockResolvedValue({ context: null, path: 'unresolved' });
    await resolveDefaultJourney({ hostname: 'unknown.test' });
    expect(brandFindByPk).not.toHaveBeenCalled();
    expect(programFindByPk).not.toHaveBeenCalled();
  });

  it('treats a null context as unresolved even if the path says otherwise', async () => {
    // Defensive: the invariant that these travel together lives in another
    // module, so it is checked rather than assumed.
    resolvePublicContext.mockResolvedValue({ context: null, path: 'brand_domain' });
    const r = await resolveDefaultJourney({ hostname: 'x.test' });
    expect(r.reason).toBe('unresolved_context');
    expect(brandFindByPk).not.toHaveBeenCalled();
  });
});

describe('legacy_host_map — the branch the resolver does not currently emit', () => {
  it('is handled as a resolved path, not as unresolved', async () => {
    // `resolvePublicContext` returns only source_slug, brand_domain or
    // unresolved today, so this is reachable ONLY with a stubbed resolver. Kept
    // because the value is in the exported type union and a future change there
    // must not silently start returning no program for every visitor.
    resolvePublicContext.mockResolvedValue({ context: ctx('cpn'), path: 'legacy_host_map' });
    const r = await resolveDefaultJourney({ hostname: 'legacy.test' });
    expect(r.reason).toBe('resolved');
    expect(r.path).toBe('legacy_host_map');
    expect(r.program?.id).toBe('program-1');
  });

  it('passes the legacy path through so its use stays measurable', async () => {
    resolvePublicContext.mockResolvedValue({ context: ctx('cpn'), path: 'legacy_host_map' });
    expect((await resolveDefaultJourney({ hostname: 'legacy.test' })).path).toBe('legacy_host_map');
  });
});

describe('a draft program is not a default', () => {
  it.each(['draft', 'paused', 'retired'])('refuses a %s program', async (status) => {
    // T201's docstring claims a mistakenly seeded program "cannot be resolved as
    // a brand's default until someone activates it deliberately". That was a
    // claim about resolution written before any resolution existed. This is
    // where it becomes true.
    resolvePublicContext.mockResolvedValue({ context: ctx('cpn'), path: 'source_slug' });
    programFindByPk.mockResolvedValue(program({ status }));

    const r = await resolveDefaultJourney({ sourceSlug: 'cpn' });

    expect(r.program).toBeNull();
    expect(r.reason).toBe('program_not_active');
  });

  it('accepts an active one', async () => {
    resolvePublicContext.mockResolvedValue({ context: ctx('cpn'), path: 'source_slug' });
    programFindByPk.mockResolvedValue(program({ status: 'active' }));
    expect((await resolveDefaultJourney({ sourceSlug: 'cpn' })).reason).toBe('resolved');
  });
});

describe('the other ways there is no default, each named separately', () => {
  it('brand row missing', async () => {
    resolvePublicContext.mockResolvedValue({ context: ctx('cpn'), path: 'source_slug' });
    brandFindByPk.mockResolvedValue(null);
    const r = await resolveDefaultJourney({ sourceSlug: 'cpn' });
    expect(r.reason).toBe('brand_row_missing');
    expect(r.program).toBeNull();
  });

  it('brand has no default set', async () => {
    resolvePublicContext.mockResolvedValue({ context: ctx('cpn'), path: 'source_slug' });
    brandFindByPk.mockResolvedValue({ default_journey_program_id: null });
    const r = await resolveDefaultJourney({ sourceSlug: 'cpn' });
    expect(r.reason).toBe('brand_has_no_default');
    expect(programFindByPk).not.toHaveBeenCalled();
  });

  it('the pointer dangles', async () => {
    resolvePublicContext.mockResolvedValue({ context: ctx('cpn'), path: 'source_slug' });
    programFindByPk.mockResolvedValue(null);
    expect((await resolveDefaultJourney({ sourceSlug: 'cpn' })).reason).toBe('program_row_missing');
  });

  it('distinguishes all six no-program reasons rather than collapsing them', async () => {
    // A single `null` return would make an operator unable to tell "this brand
    // has no journey yet" from "the programme is paused" from "the resolver is
    // down". Those need different responses.
    const reasons = new Set<string>();

    resolvePublicContext.mockResolvedValue({ context: null, path: 'unresolved' });
    reasons.add((await resolveDefaultJourney({})).reason);

    resolvePublicContext.mockResolvedValue({ context: ctx('cpn'), path: 'source_slug' });
    brandFindByPk.mockResolvedValue(null);
    reasons.add((await resolveDefaultJourney({})).reason);

    brandFindByPk.mockResolvedValue({ default_journey_program_id: null });
    reasons.add((await resolveDefaultJourney({})).reason);

    brandFindByPk.mockResolvedValue({ default_journey_program_id: 'p' });
    programFindByPk.mockResolvedValue(null);
    reasons.add((await resolveDefaultJourney({})).reason);

    programFindByPk.mockResolvedValue(program({ status: 'draft' }));
    reasons.add((await resolveDefaultJourney({})).reason);

    brandFindByPk.mockRejectedValue(new Error('connection terminated'));
    reasons.add((await resolveDefaultJourney({})).reason);

    expect(reasons.size).toBe(6);
  });
});

describe('it never throws, and never opens on failure', () => {
  it('returns lookup_failed when the brand query throws', async () => {
    resolvePublicContext.mockResolvedValue({ context: ctx('cpn'), path: 'source_slug' });
    brandFindByPk.mockRejectedValue(new Error('connection terminated'));
    const r = await resolveDefaultJourney({ sourceSlug: 'cpn' });
    expect(r.program).toBeNull();
    expect(r.reason).toBe('lookup_failed');
  });

  it('returns lookup_failed when the resolver itself throws', async () => {
    // The resolver documents that it returns null rather than throwing. This is
    // belt and braces: a future change there must not add a new failure mode to
    // a page-view path.
    resolvePublicContext.mockRejectedValue(new Error('boom'));
    const r = await resolveDefaultJourney({ hostname: 'a.test' });
    expect(r.reason).toBe('lookup_failed');
    expect(r.path).toBe('unresolved');
  });
});

describe('resolveDefaultJourneyProgramId', () => {
  it('returns the id only when the reason is resolved', async () => {
    resolvePublicContext.mockResolvedValue({ context: ctx('cpn'), path: 'source_slug' });
    await expect(resolveDefaultJourneyProgramId({ sourceSlug: 'cpn' })).resolves.toBe('program-1');
  });

  it('returns null for a paused program, not the id', async () => {
    // The reason a convenience accessor is worth testing: a caller reaching for
    // `.program?.id` on a `program_not_active` result would get a usable id.
    resolvePublicContext.mockResolvedValue({ context: ctx('cpn'), path: 'source_slug' });
    programFindByPk.mockResolvedValue(program({ status: 'paused' }));
    await expect(resolveDefaultJourneyProgramId({ sourceSlug: 'cpn' })).resolves.toBeNull();
  });

  it('returns null when nothing resolves', async () => {
    resolvePublicContext.mockResolvedValue({ context: null, path: 'unresolved' });
    await expect(resolveDefaultJourneyProgramId({ hostname: 'x.test' })).resolves.toBeNull();
  });
});

describe('it introduces no third host-to-brand map', () => {
  it('delegates to resolvePublicContext and nothing else', () => {
    expect(SRC).toContain('resolvePublicContext');
    // SCANNED WITHOUT COMMENTS. The module header EXPLAINS that it does not read
    // `brand_domains` or `lead_sources`, so scanning the raw source flagged the
    // explanation as the violation.
    expect(CODE).not.toMatch(/BrandDomain/);
    expect(CODE).not.toMatch(/LeadSource/);
    expect(CODE).not.toMatch(/brand_domains/);
    expect(CODE).not.toMatch(/lead_sources/);
  });

  it('contains no hostname literal and no map object', () => {
    // A map literal is trivial to add and invisible in a passing suite. The
    // `VALID_EVENT_TYPES` and flag-guard precedent: scan the source.
    expect(CODE).not.toMatch(/HOST_TO|_TO_BRAND|_TO_SITE|DOMAIN_MAP|BRAND_MAP/);
    // No bare domain literal — a `.com`/`.ai`/`.org` string here would mean a
    // hostname is being recognised locally.
    expect(CODE).not.toMatch(/['"`][a-z0-9.-]+\.(com|ai|org|net|io)['"`]/i);
  });

  it('declares no lookup object at module scope, whatever it is called', () => {
    // An independent review slipped a map past the name-based scan by calling it
    // BRAND_BY_ENTRY and using no domain literal. Names are not a control
    // surface, so this looks for the SHAPE instead: a module-scope object
    // literal with a quoted key, or a string-keyed Record type.
    expect(CODE).not.toMatch(/Record\s*<\s*string\s*,/);
    expect(CODE).not.toMatch(/^\s*(?:const|let|var)\s+\w+[^=\n]*=\s*\{\s*['"`]/m);

    // Y2/Y3. The two forms that got past the version above, both found by an
    // independent review rather than by me: a `new Map([[k, v], ...])`, and an
    // object literal with UNQUOTED keys (`{ cpn_entry: 'brand-cpn' }`). Neither
    // is a string-keyed Record and neither opens with a quote, so the claim as
    // written was true and simply did not reach them.
    expect(CODE).not.toMatch(/new\s+Map\s*\(/);
    expect(CODE).not.toMatch(/^\s*(?:const|let|var)\s+\w+[^=\n]*=\s*\{\s*\w+\s*:/m);
  });

  it('does not normalise the inputs it was given', () => {
    // Lowercasing or URL-parsing here would mean this module had started
    // interpreting a hostname, which is the tenancy module's job.
    expect(CODE).not.toMatch(/toLowerCase\(\)/);
    expect(CODE).not.toMatch(/new URL\(/);
  });
});
