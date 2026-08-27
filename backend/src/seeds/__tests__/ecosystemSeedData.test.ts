import { ECOSYSTEM_SEED } from '../ecosystemSeedData';

/**
 * Invariants of the ecosystem definition itself.
 *
 * `ECOSYSTEM_SEED` is a data file, so it had no tests — but it is the file that decides
 * which brand a request belongs to, and a mistake in it does not throw. It silently
 * attributes traffic to the wrong tenant, or to none at all.
 *
 * This exists because of a real bug: `www.refactored.ai` was missing while the apex was
 * present, and `www` is a SEPARATE A record on the live site rather than a redirect. Half
 * the audience would have resolved to no brand and recorded a null context, with nothing
 * failing anywhere. These tests pin the properties that would have caught it.
 *
 * Deliberately asserted on the DATA, not on a mock of the resolver: the resolver is
 * already tested, and what was wrong here was the input it reads.
 */

const allBrands = ECOSYSTEM_SEED.flatMap((t) =>
  t.brands.map((b) => ({ tenant: t.slug, brand: b.slug, brandData: b })),
);

const allDomains = allBrands.flatMap(({ tenant, brand, brandData }) =>
  (brandData.domains || []).map((d) => ({ tenant, brand, ...d })),
);

describe('(hostname, purpose) is unique across the whole ecosystem', () => {
  it('no two brands claim the same hostname for the same purpose', () => {
    // This is the key `brand_domains` is built on. Two brands claiming the same pair
    // makes resolution ambiguous, and which one wins would come down to row order.
    const seen = new Map<string, string>();
    const collisions: string[] = [];

    for (const d of allDomains) {
      const key = `${d.hostname}|${d.purpose}`;
      const owner = `${d.tenant}/${d.brand}`;
      if (seen.has(key) && seen.get(key) !== owner) {
        collisions.push(`${key} claimed by both ${seen.get(key)} and ${owner}`);
      }
      seen.set(key, owner);
    }

    expect(collisions).toEqual([]);
  });

  it('the SAME hostname may serve two brands on different purposes — that is the design', () => {
    // enterprise.colaberry.ai is Colaberry Consulting's public site (`web`) and the
    // Refactored.ai portal when logged in (`app`). If this ever stops being true the
    // keying on (hostname, purpose) has lost its reason to exist.
    const shared = allDomains.filter((d) => d.hostname === 'enterprise.colaberry.ai');
    const purposes = shared.map((d) => d.purpose).sort();
    const brands = new Set(shared.map((d) => d.brand));

    expect(purposes).toEqual(['app', 'web']);
    expect(brands.size).toBe(2);
  });
});

describe('a brand that has a web presence can actually be reached', () => {
  it('every brand declares at least one `web` domain', () => {
    const missing = allBrands
      .filter(({ brandData }) => !(brandData.domains || []).some((d) => d.purpose === 'web'))
      .map(({ tenant, brand }) => `${tenant}/${brand}`);

    expect(missing).toEqual([]);
  });

  it('exactly one primary per (brand, purpose) — never two, never zero', () => {
    // Two primaries makes "the canonical hostname" undefined; zero makes it unanswerable.
    const counts = new Map<string, number>();
    for (const d of allDomains) {
      if (!d.is_primary) continue;
      const key = `${d.tenant}/${d.brand}|${d.purpose}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const multiple = [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    expect(multiple).toEqual([]);

    const purposeGroups = new Set(allDomains.map((d) => `${d.tenant}/${d.brand}|${d.purpose}`));
    const withoutPrimary = [...purposeGroups].filter((g) => !counts.has(g));
    expect(withoutPrimary).toEqual([]);
  });
});

describe('www and apex are declared together', () => {
  /**
   * The regression this file was written for. A bare apex with no `www` sibling is only
   * safe if `www` redirects — and on refactored.ai it does not, it is an independent A
   * record serving the same page. Rather than assert "every apex needs www", which would
   * be wrong for hostnames that genuinely have no www, this pins the two we KNOW serve
   * both, verified against live DNS.
   */
  const webHosts = allDomains.filter((d) => d.purpose === 'web').map((d) => d.hostname);

  it.each([
    ['refactored.ai', 'www.refactored.ai'],
    ['colaberry.ai', 'www.colaberry.ai'],
  ])('%s and %s are both declared for web', (apex, www) => {
    expect(webHosts).toContain(apex);
    expect(webHosts).toContain(www);
  });

  it('www.refactored.ai belongs to the refactored brand, not to Colaberry', () => {
    const row = allDomains.find((d) => d.hostname === 'www.refactored.ai' && d.purpose === 'web');
    expect(row).toBeDefined();
    expect(row!.brand).toBe('refactored');
    // Non-primary: the apex is the canonical hostname, www is the alias that must still
    // attribute rather than the one the brand is named by.
    expect(row!.is_primary).toBe(false);
  });
});

describe('hostnames are hostnames', () => {
  it('no scheme, no path, no trailing dot, no uppercase', () => {
    // A stray "https://" or trailing slash here does not throw — it just never matches an
    // incoming Host header, so the brand silently stops resolving.
    const malformed = allDomains
      .filter((d) => !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d.hostname))
      .map((d) => `${d.brand}: ${d.hostname}`);

    expect(malformed).toEqual([]);
  });
});
