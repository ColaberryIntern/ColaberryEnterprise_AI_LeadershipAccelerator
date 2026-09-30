import { connectDatabase } from '../config/database';
import '../models';
import { Tenant, Brand, BrandDomain, SenderProfile, LeadSource } from '../models';
import { ECOSYSTEM_SEED, SeedBrand, SeedTenant } from './ecosystemSeedData';

/**
 * Seed the ecosystem spine: tenants, brands, brand domains, sender profiles.
 *
 * Idempotent by construction. Every lookup is by stable slug or by
 * (hostname, purpose) / (brand, from_email), never by generated UUID, so the same
 * tenant has the same identity in dev, preview and production and a second run changes
 * nothing. Re-running is the normal case, not the exception — this seed is expected to
 * be executed on every environment refresh.
 *
 * Run: npx ts-node src/seeds/seedEcosystem.ts
 */

export interface SeedCounts {
  processed: number;
  created: number;
  already_correct: number;
  updated: number;
  failed: number;
}

function emptyCounts(): SeedCounts {
  return { processed: 0, created: 0, already_correct: 0, updated: 0, failed: 0 };
}

function merge(into: SeedCounts, from: SeedCounts): void {
  into.processed += from.processed;
  into.created += from.created;
  into.already_correct += from.already_correct;
  into.updated += from.updated;
  into.failed += from.failed;
}

async function seedDomains(tenantId: string, brandId: string, brand: SeedBrand): Promise<SeedCounts> {
  const counts = emptyCounts();
  for (const domain of brand.domains) {
    counts.processed += 1;
    // (hostname, purpose) is the natural key — the same hostname legitimately appears
    // twice with different purposes and different DNS state.
    const existing = await BrandDomain.findOne({
      where: { hostname: domain.hostname, purpose: domain.purpose },
    });
    if (!existing) {
      await BrandDomain.create({
        tenant_id: tenantId,
        brand_id: brandId,
        hostname: domain.hostname,
        purpose: domain.purpose,
        is_primary: domain.is_primary ?? false,
        // Never seeded as verified. Verification is a DNS fact established by the
        // health check, and pretending otherwise would let a live send through.
        verification_status: 'pending',
        activation_state: 'configured',
      } as any);
      counts.created += 1;
    } else if (existing.brand_id !== brandId) {
      // A hostname moving between brands is a real operation but not a silent one.
      counts.failed += 1;
      console.warn(
        `  ! ${domain.hostname}/${domain.purpose} already belongs to another brand — left unchanged`,
      );
    } else {
      counts.already_correct += 1;
    }
  }
  return counts;
}

async function seedSenderProfiles(
  tenantId: string,
  brandId: string,
  brand: SeedBrand,
): Promise<SeedCounts> {
  const counts = emptyCounts();
  for (const profile of brand.sender_profiles) {
    counts.processed += 1;
    const existing = await SenderProfile.findOne({
      where: { brand_id: brandId, from_email: profile.from_email },
    });
    if (existing) {
      counts.already_correct += 1;
      continue;
    }

    let sendingDomainId: string | null = null;
    if (profile.sending_hostname) {
      const domain = await BrandDomain.findOne({
        where: { hostname: profile.sending_hostname, purpose: 'email' },
      });
      sendingDomainId = domain ? domain.id : null;
    }

    await SenderProfile.create({
      tenant_id: tenantId,
      brand_id: brandId,
      name: profile.name,
      from_name: profile.from_name,
      from_email: profile.from_email,
      reply_to_email: profile.reply_to_email ?? null,
      sending_domain_id: sendingDomainId,
      provider: 'mandrill',
      provider_subaccount: profile.provider_subaccount ?? null,
      // Seeded as draft, never active. Promotion to 'active' is a deliberate admin
      // action taken after the domain health check passes; seeding it active would put
      // an unverified sender one campaign away from a live send.
      status: 'draft',
      is_default: profile.is_default ?? false,
    } as any);
    counts.created += 1;
  }
  return counts;
}

/**
 * Create the brand's tracking-only lead sources, if they are not already there.
 *
 * These carry no entry points and no form definitions on purpose: nothing posts a form
 * to them. They exist so tracking can attribute a hostname to a brand, which is a
 * different job from the form-bearing sources `seedLeadSources.ts` owns.
 *
 * An existing row is never re-pointed here, only stamped with tenant/brand if it has
 * none. A source that already belongs to another brand is reported rather than moved —
 * reassigning ownership silently is how attribution history gets rewritten by accident.
 */
async function seedTrackingSources(
  tenantId: string,
  brandId: string,
  brand: SeedBrand,
): Promise<SeedCounts> {
  const counts = emptyCounts();
  for (const source of brand.tracking_sources ?? []) {
    counts.processed += 1;
    const existing = await LeadSource.findOne({ where: { slug: source.slug } });

    if (!existing) {
      await LeadSource.create({
        slug: source.slug,
        name: source.name,
        domain: source.domain,
        is_active: true,
        tenant_id: tenantId,
        brand_id: brandId,
      } as any);
      counts.created += 1;
      console.log(`    + tracking source "${source.slug}"`);
      continue;
    }

    const currentBrand = (existing as any).brand_id as string | null;
    if (!currentBrand) {
      await existing.update({ tenant_id: tenantId, brand_id: brandId } as any);
      counts.updated += 1;
      console.log(`    · tracking source "${source.slug}" adopted`);
    } else if (currentBrand !== brandId) {
      counts.failed += 1;
      console.warn(`    ! tracking source "${source.slug}" belongs to another brand — left alone`);
    } else {
      counts.already_correct += 1;
    }
  }
  return counts;
}

async function seedBrandsFor(tenant: Tenant, seed: SeedTenant): Promise<SeedCounts> {
  const counts = emptyCounts();
  for (const brandSeed of seed.brands) {
    counts.processed += 1;
    let brand = await Brand.findOne({ where: { tenant_id: tenant.id, slug: brandSeed.slug } });
    if (!brand) {
      brand = await Brand.create({
        tenant_id: tenant.id,
        slug: brandSeed.slug,
        name: brandSeed.name,
        status: 'active',
        default_public_url: brandSeed.default_public_url ?? null,
        default_theme_key: brandSeed.default_theme_key ?? null,
        support_email: brandSeed.support_email ?? null,
      } as any);
      counts.created += 1;
      console.log(`  + brand "${brandSeed.slug}"`);
    } else {
      counts.already_correct += 1;
      console.log(`  · brand "${brandSeed.slug}" exists`);
    }

    merge(counts, await seedDomains(tenant.id, brand.id, brandSeed));
    merge(counts, await seedSenderProfiles(tenant.id, brand.id, brandSeed));
    merge(counts, await seedTrackingSources(tenant.id, brand.id, brandSeed));
  }
  return counts;
}

/** Seeds every tenant in ECOSYSTEM_SEED. Safe to call repeatedly. */
export async function seedEcosystem(): Promise<SeedCounts> {
  const totals = emptyCounts();

  for (const seed of ECOSYSTEM_SEED) {
    totals.processed += 1;
    let tenant = await Tenant.findOne({ where: { slug: seed.slug } });
    if (!tenant) {
      tenant = await Tenant.create({
        slug: seed.slug,
        name: seed.name,
        tenant_type: seed.tenant_type,
        status: 'active',
        legal_name: seed.legal_name ?? null,
      } as any);
      totals.created += 1;
      console.log(`+ tenant "${seed.slug}"`);
    } else {
      totals.already_correct += 1;
      console.log(`· tenant "${seed.slug}" exists`);
    }

    merge(totals, await seedBrandsFor(tenant, seed));
  }

  return totals;
}

async function run(): Promise<void> {
  await connectDatabase();
  console.log('[SeedEcosystem] Seeding tenants, brands, domains, sender profiles...\n');
  const counts = await seedEcosystem();
  console.log(
    `\n[SeedEcosystem] Done. processed=${counts.processed} created=${counts.created} ` +
      `already_correct=${counts.already_correct} failed=${counts.failed}`,
  );
  process.exit(counts.failed > 0 ? 1 : 0);
}

// Only run when invoked directly, so the exported seeder can be imported by tests and
// by the backfill script without triggering a process.exit.
if (require.main === module) {
  run().catch((err) => {
    console.error('[SeedEcosystem] Failed:', err);
    process.exit(1);
  });
}
