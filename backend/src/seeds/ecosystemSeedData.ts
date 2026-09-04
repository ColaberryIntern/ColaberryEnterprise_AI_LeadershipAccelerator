/**
 * Declarative ecosystem seed data.
 *
 * Separated from the seed runner so the shape can be unit-tested without a database and
 * so the backfill script can import the same slug map instead of keeping a second copy
 * that drifts. There is exactly one definition of "which tenant owns which hostname" in
 * this codebase, and it is here.
 */

export interface SeedBrandDomain {
  hostname: string;
  purpose: 'web' | 'app' | 'email' | 'tracking' | 'reply';
  is_primary?: boolean;
}

export interface SeedSenderProfile {
  name: string;
  from_name: string;
  from_email: string;
  reply_to_email?: string;
  /** hostname of the BrandDomain with purpose 'email' that this profile sends over. */
  sending_hostname?: string;
  provider_subaccount?: string;
  is_default?: boolean;
}

export interface SeedBrand {
  slug: string;
  name: string;
  default_public_url?: string;
  default_theme_key?: string;
  support_email?: string;
  domains: SeedBrandDomain[];
  sender_profiles: SeedSenderProfile[];
  /** lead_sources.slug values that belong to this brand. Drives the backfill. */
  lead_source_slugs: string[];
  /**
   * Tracking-only sources this seed CREATES when they do not already exist.
   *
   * Distinct from `lead_source_slugs`, and the difference matters. That list says
   * "these slugs belong to this brand" and drives the backfill; it covers sources
   * created elsewhere, chiefly by `seedLeadSources.ts`, which owns sources that carry
   * forms and field mappings.
   *
   * These are different animals: they exist purely so tracking can attribute a
   * hostname to a brand. They have no entry points and no form definitions, because
   * no form posts to them. `enterprise` is the clearest case — the tracker has been
   * emitting `site_slug=enterprise` from the server-side host map since long before
   * this project, but no row was ever registered, so 1,751 sessions had nothing to
   * attach to.
   */
  tracking_sources?: Array<{ slug: string; name: string; domain: string }>;
}

export interface SeedTenant {
  slug: string;
  name: string;
  tenant_type: 'commercial' | 'nonprofit' | 'platform';
  legal_name?: string;
  brands: SeedBrand[];
}

/**
 * Sender profiles are seeded as 'draft', never 'active'. An active profile with an
 * unverified domain would be a live send waiting to happen; promotion to 'active' is a
 * deliberate admin action taken after DNS is verified. The one exception is the
 * Colaberry Enterprise legacy profile, which reflects mail that is already sending
 * today from an already-verified domain.
 */
export const ECOSYSTEM_SEED: SeedTenant[] = [
  {
    slug: 'colaberry',
    name: 'Colaberry',
    tenant_type: 'commercial',
    legal_name: 'Colaberry Inc.',
    brands: [
      {
        slug: 'colaberry-enterprise',
        name: 'Colaberry Enterprise',
        default_public_url: 'https://enterprise.colaberry.ai',
        default_theme_key: 'enterprise',
        support_email: 'support@colaberry.com',
        domains: [
          { hostname: 'enterprise.colaberry.ai', purpose: 'web', is_primary: true },
          { hostname: 'colaberry.ai', purpose: 'web' },
          { hostname: 'www.colaberry.ai', purpose: 'web' },
          { hostname: 'colaberry.com', purpose: 'email', is_primary: true },
        ],
        sender_profiles: [
          {
            name: 'Colaberry Enterprise (legacy default)',
            from_name: 'Colaberry AI',
            from_email: 'ali@colaberry.com',
            reply_to_email: 'ali@colaberry.com',
            sending_hostname: 'colaberry.com',
            is_default: true,
          },
        ],
        // trustbeforeintelligence is Ram's book microsite feeding enterprise demand.
        //
        // DECISION HISTORY, kept because the earlier note asked that this not be
        // re-litigated silently.
        //
        // 2026-08-21 (DEC-06): Ali classified `advisor` and `worldoftaxonomy` to
        // Colaberry Enterprise. Recorded then as a business fact the code cannot derive.
        //
        // 2026-09-04: REVERSED, by Ali, on evidence. Pooling meant five properties
        // reported as one brand and every brand-keyed view showed their sum.
        // `worldoftaxonomy` alone carried 161,881 events in thirty days - more than half
        // of everything the estate records - so "Colaberry Enterprise: 317,231 events"
        // was a true number mostly about a site nobody would think to name. The three
        // distinct products are now their own brands.
        //
        // `colaberry` and `enterprise` deliberately stay TOGETHER. They are two
        // hostnames for one company brand, which is what `domains` above already models;
        // splitting a brand from itself over a hostname would be the opposite mistake.
        lead_source_slugs: ['enterprise', 'colaberry'],
        // `enterprise` is the slug the server-side host map has been stamping on
        // enterprise.colaberry.ai traffic all along, with no matching row to attach to.
        tracking_sources: [
          {
            slug: 'enterprise',
            name: 'Colaberry Enterprise (enterprise.colaberry.ai)',
            domain: 'enterprise.colaberry.ai',
          },
        ],
      },
      {
        slug: 'colaberry-training',
        name: 'Colaberry Training',
        default_public_url: 'https://training.colaberry.com',
        default_theme_key: 'training',
        support_email: 'support@colaberry.com',
        domains: [
          { hostname: 'training.colaberry.com', purpose: 'web', is_primary: true },
          { hostname: 'myfreeaiclass.com', purpose: 'web' },
        ],
        sender_profiles: [],
        // `winback` is "Alumni Win-Back (CCPP)" and its registered domain is
        // training.colaberry.com, so it is Training rather than Enterprise. Confirmed
        // by Ali 2026-08-23 rather than inferred from the domain alone, because the two
        // Colaberry brands are exactly where a wrong guess would be least visible.
        lead_source_slugs: ['training', 'myfreeaiclass', 'winback'],
        // Training is a live external site (training.colaberry.com). It is tracked, not
        // built here. This registers the source so the brand is ready the moment the
        // tracker snippet goes on that site; until then it will simply receive nothing.
        tracking_sources: [
          {
            slug: 'training',
            name: 'Colaberry Training (training.colaberry.com)',
            domain: 'training.colaberry.com',
          },
        ],
      },
      // The three properties split out of Colaberry Enterprise on 2026-09-04. Each is a
      // distinct product with its own audience; none of them sends email, so none has a
      // sender profile. They are tracked, not built here.
      {
        slug: 'worldoftaxonomy',
        name: 'World of Taxonomy',
        default_public_url: 'https://worldoftaxonomy.com',
        default_theme_key: 'enterprise',
        support_email: 'support@colaberry.com',
        domains: [
          { hostname: 'worldoftaxonomy.com', purpose: 'web', is_primary: true },
          { hostname: 'www.worldoftaxonomy.com', purpose: 'web' },
        ],
        sender_profiles: [],
        lead_source_slugs: ['worldoftaxonomy'],
      },
      {
        slug: 'advisor',
        name: 'AI Workforce Designer',
        default_public_url: 'https://advisor.colaberry.ai',
        default_theme_key: 'enterprise',
        support_email: 'support@colaberry.com',
        // A separate FastAPI product in its own repository. It reports here; it is not
        // served from this codebase.
        domains: [
          { hostname: 'advisor.colaberry.ai', purpose: 'web', is_primary: true },
        ],
        sender_profiles: [],
        lead_source_slugs: ['advisor'],
      },
      {
        slug: 'trustbeforeintelligence',
        name: 'Trust Before Intelligence',
        default_public_url: 'https://trustbeforeintelligence.ai',
        default_theme_key: 'enterprise',
        support_email: 'support@colaberry.com',
        domains: [
          { hostname: 'trustbeforeintelligence.ai', purpose: 'web', is_primary: true },
          { hostname: 'www.trustbeforeintelligence.ai', purpose: 'web' },
        ],
        sender_profiles: [],
        lead_source_slugs: ['trustbeforeintelligence'],
      },
    ],
  },
  {
    slug: 'cpn',
    name: 'Career Pathways Network',
    tenant_type: 'nonprofit',
    legal_name: 'Career Pathways Network',
    brands: [
      {
        slug: 'cpn',
        name: 'Career Pathways Network',
        default_public_url: 'https://opportunitylift.org',
        default_theme_key: 'cpn',
        domains: [
          // CPN'S DOMAIN IS opportunitylift.org, NOT cpn.org.
          //
          // These originally read `cpn.org`, which the nonprofit does not own - it
          // resolves to a different Cloudflare account entirely. That was not a cosmetic
          // error: SPF and DKIM can only be published for a domain you control, so mail
          // sent as `@cpn.org` could never have authenticated, and `links.cpn.org` pointed
          // tracked links at someone else's host.
          //
          // Registered and brought under CPN's own Cloudflare account 2026-08-31, kept
          // separate from both Colaberry's and AI Flotation's because the nonprofit's
          // independence is a donor and grant commitment rather than a preference.
          { hostname: 'opportunitylift.org', purpose: 'web', is_primary: true },
          { hostname: 'www.opportunitylift.org', purpose: 'web', is_primary: false },
          { hostname: 'opportunitylift.org', purpose: 'email', is_primary: true },
          { hostname: 'links.opportunitylift.org', purpose: 'tracking', is_primary: true },
        ],
        sender_profiles: [
          {
            name: 'CPN Scholar Communications',
            from_name: 'Career Pathways Network',
            from_email: 'scholars@opportunitylift.org',
            reply_to_email: 'scholars@opportunitylift.org',
            sending_hostname: 'opportunitylift.org',
            provider_subaccount: 'cpn',
            is_default: true,
          },
        ],
        lead_source_slugs: ['cpn'],
      },
    ],
  },
  {
    slug: 'ai-flotation',
    name: 'AI Flotation',
    tenant_type: 'commercial',
    legal_name: 'AI Flotation LLC',
    brands: [
      {
        slug: 'ai-flotation',
        name: 'AI Flotation',
        default_public_url: 'https://aiflotation.com',
        default_theme_key: 'ai-flotation',
        domains: [
          { hostname: 'aiflotation.com', purpose: 'web', is_primary: true },
          // The www host is served and must resolve to the same brand. Without a row
          // here a visitor arriving on www resolves to no tenant, and the lead their
          // form submits is attributed to nothing.
          { hostname: 'www.aiflotation.com', purpose: 'web', is_primary: false },
          { hostname: 'aiflotation.com', purpose: 'email', is_primary: true },
          { hostname: 'links.aiflotation.com', purpose: 'tracking', is_primary: true },
        ],
        sender_profiles: [
          {
            name: 'AI Flotation Build Team',
            from_name: 'AI Flotation',
            from_email: 'build@aiflotation.com',
            reply_to_email: 'build@aiflotation.com',
            sending_hostname: 'aiflotation.com',
            provider_subaccount: 'ai-flotation',
            is_default: true,
          },
        ],
        lead_source_slugs: ['ai-flotation'],
      },
    ],
  },
  {
    slug: 'refactored',
    name: 'Refactored.ai',
    tenant_type: 'platform',
    legal_name: 'Colaberry Inc.',
    brands: [
      {
        slug: 'refactored',
        name: 'Refactored.ai',
        default_public_url: 'https://refactored.ai',
        default_theme_key: 'refactored',
        domains: [
          { hostname: 'refactored.ai', purpose: 'web', is_primary: true },
          // `www` is a SEPARATE A record on the live site, not a redirect to the apex —
          // both hostnames serve the page independently today. Without this row, traffic
          // arriving on www resolves to no brand and silently records a null context,
          // while apex traffic attributes correctly. That is the worst kind of gap: it
          // does not fail, it just quietly under-counts one half of the audience.
          // Non-primary, matching how colaberry-enterprise carries www.colaberry.ai.
          { hostname: 'www.refactored.ai', purpose: 'web', is_primary: false },
          // The logged-in product lives at enterprise.colaberry.ai today, behind the
          // login. Same hostname as Colaberry Consulting's public site, different
          // brand — which is exactly why brand_domains is keyed on (hostname, purpose)
          // rather than hostname alone. The `web` row on that host stays with
          // Colaberry Enterprise; this `app` row is what /portal paths resolve to.
          // refactored.ai itself still needs its own customer-facing site built.
          { hostname: 'enterprise.colaberry.ai', purpose: 'app', is_primary: true },
          { hostname: 'refactored.ai', purpose: 'email', is_primary: true },
          { hostname: 'track.refactored.ai', purpose: 'tracking', is_primary: true },
        ],
        sender_profiles: [
          {
            name: 'Refactored Platform',
            from_name: 'Refactored.ai',
            from_email: 'platform@refactored.ai',
            reply_to_email: 'platform@refactored.ai',
            sending_hostname: 'refactored.ai',
            provider_subaccount: 'refactored',
            is_default: true,
          },
        ],
        lead_source_slugs: ['refactored'],
      },
    ],
  },
];

/**
 * Sources whose ownership is genuinely ambiguous. They are NOT assigned to a tenant by
 * the backfill; they are reported as unresolved so a human can classify them.
 *
 * Currently empty, and that is the point rather than an oversight. `advisor` and
 * `worldoftaxonomy` sat here until 2026-08-21, when Ali classified both to Colaberry
 * Enterprise (DEC-06). Every lead source in the database now has a deterministic owner,
 * so the backfill reports zero unresolved rows instead of two known-unknowns.
 *
 * Keep the list. The next microsite that appears without an obvious owner belongs here,
 * not in a guess: the migration plan is explicit that ambiguous ownership is reported,
 * never assumed.
 */
export const DELIBERATELY_UNCLASSIFIED_SOURCE_SLUGS: readonly string[] = [];

/** Flat hostname -> {tenantSlug, brandSlug} map derived from ECOSYSTEM_SEED. */
export function buildHostnameMap(): Map<string, { tenantSlug: string; brandSlug: string }> {
  const map = new Map<string, { tenantSlug: string; brandSlug: string }>();
  for (const tenant of ECOSYSTEM_SEED) {
    for (const brand of tenant.brands) {
      for (const domain of brand.domains) {
        // Web domains win when a hostname serves more than one purpose: resolving a
        // browser request is what this map is for.
        if (domain.purpose === 'web' || !map.has(domain.hostname)) {
          map.set(domain.hostname, { tenantSlug: tenant.slug, brandSlug: brand.slug });
        }
      }
    }
  }
  return map;
}

/** Flat lead_sources.slug -> {tenantSlug, brandSlug} map derived from ECOSYSTEM_SEED. */
export function buildSourceSlugMap(): Map<string, { tenantSlug: string; brandSlug: string }> {
  const map = new Map<string, { tenantSlug: string; brandSlug: string }>();
  for (const tenant of ECOSYSTEM_SEED) {
    for (const brand of tenant.brands) {
      for (const slug of brand.lead_source_slugs) {
        map.set(slug, { tenantSlug: tenant.slug, brandSlug: brand.slug });
      }
    }
  }
  return map;
}
