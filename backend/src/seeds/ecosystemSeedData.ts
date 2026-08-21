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
        // Recorded here so the assignment is auditable rather than assumed.
        lead_source_slugs: ['enterprise', 'colaberry', 'trustbeforeintelligence'],
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
        lead_source_slugs: ['training', 'myfreeaiclass'],
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
        default_public_url: 'https://cpn.org',
        default_theme_key: 'cpn',
        domains: [
          { hostname: 'cpn.org', purpose: 'web', is_primary: true },
          { hostname: 'cpn.org', purpose: 'email', is_primary: true },
          { hostname: 'links.cpn.org', purpose: 'tracking', is_primary: true },
        ],
        sender_profiles: [
          {
            name: 'CPN Scholar Communications',
            from_name: 'Career Pathways Network',
            from_email: 'scholars@cpn.org',
            reply_to_email: 'scholars@cpn.org',
            sending_hostname: 'cpn.org',
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
 * `advisor` is advisor.colaberry.ai — a separate FastAPI product in its own repository.
 * `worldoftaxonomy` is an independent microsite. Asserting either belongs to Colaberry
 * Enterprise would be a guess, and the migration plan is explicit: do not silently guess.
 */
export const DELIBERATELY_UNCLASSIFIED_SOURCE_SLUGS: readonly string[] = [
  'advisor',
  'worldoftaxonomy',
];

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
