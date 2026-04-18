import { connectDatabase } from '../config/database';
import '../models';
import { LeadSource, EntryPoint, FormDefinition } from '../models';

interface SeedEntryPoint {
  slug: string;
  name: string;
  page?: string;
  form_name?: string;
  description?: string;
  field_map: Record<string, string>;
  required_fields?: string[];
}

interface SeedSource {
  slug: string;
  name: string;
  domain: string;
  hmac_secret?: string;
  entry_points: SeedEntryPoint[];
}

const SEEDS: SeedSource[] = [
  {
    slug: 'trustbeforeintelligence',
    name: 'Trust Before Intelligence',
    domain: 'trustbeforeintelligence.ai',
    hmac_secret: 'TRUST_WEBHOOK_SECRET',
    entry_points: [
      {
        slug: 'get_book_modal',
        name: 'Get the Book — Modal',
        page: '/',
        form_name: 'book-download',
        description: 'Home-page modal requesting the book PDF',
        field_map: { full_name: 'name', email: 'email', company: 'company', role: 'role' },
        required_fields: ['email'],
      },
      {
        slug: 'newsletter_footer',
        name: 'Newsletter Signup (footer)',
        page: '*',
        form_name: 'newsletter',
        description: 'Footer newsletter form',
        field_map: { email: 'email' },
        required_fields: ['email'],
      },
    ],
  },
  {
    slug: 'colaberry',
    name: 'Colaberry',
    domain: 'colaberry.ai',
    entry_points: [
      {
        slug: 'request_demo_form',
        name: 'Request Demo',
        page: '/demo',
        form_name: 'request-demo',
        description: 'Primary enterprise demo request',
        field_map: {
          name: 'name',
          email: 'email',
          phone: 'phone',
          company: 'company',
          company_size: 'company_size',
          message: 'metadata.message',
        },
        required_fields: ['email', 'company'],
      },
      {
        slug: 'executive_overview_download',
        name: 'Executive Overview Download',
        page: '/',
        form_name: 'executive-overview',
        description: 'Home-page executive overview PDF form',
        field_map: {
          name: 'name',
          email: 'email',
          company: 'company',
          title: 'title',
        },
        required_fields: ['email'],
      },
    ],
  },
  {
    slug: 'advisor',
    name: 'AI Workforce Designer (advisor.colaberry.ai)',
    domain: 'advisor.colaberry.ai',
    hmac_secret: 'ADVISORY_WEBHOOK_SECRET',
    entry_points: [
      {
        slug: 'advisory_inline_form',
        name: 'Advisor inline capture',
        page: '/',
        form_name: 'advisory-inline',
        description: 'Fallback for advisor forms that are NOT full advisory webhooks',
        field_map: {
          name: 'name',
          email: 'email',
          idea_input: 'idea_input',
          maturity_score: 'metadata.maturity_score',
        },
        required_fields: ['email'],
      },
    ],
  },
];

async function run() {
  await connectDatabase();
  // Tables are created by server.ts:ensureIngestionSchema() on startup.
  // Skipping sequelize.sync() here — it would scan all 170+ models (slow).

  let created = 0;
  let updated = 0;

  for (const seed of SEEDS) {
    let source = await LeadSource.findOne({ where: { slug: seed.slug } });
    if (!source) {
      source = await LeadSource.create({
        slug: seed.slug,
        name: seed.name,
        domain: seed.domain,
        hmac_secret: seed.hmac_secret || null,
        is_active: true,
      } as any);
      created++;
      console.log(`[SeedLeadSources] Created source "${seed.slug}" (${source.id})`);
    } else {
      await source.update({
        name: seed.name,
        domain: seed.domain,
        hmac_secret: seed.hmac_secret || source.hmac_secret,
        is_active: true,
        updated_at: new Date(),
      } as any);
      updated++;
      console.log(`[SeedLeadSources] Updated source "${seed.slug}"`);
    }

    for (const ep of seed.entry_points) {
      let entry = await EntryPoint.findOne({ where: { source_id: source.id, slug: ep.slug } });
      if (!entry) {
        entry = await EntryPoint.create({
          source_id: source.id,
          slug: ep.slug,
          name: ep.name,
          page: ep.page || null,
          form_name: ep.form_name || null,
          description: ep.description || null,
          is_active: true,
        } as any);
        console.log(`  + entry_point "${ep.slug}" (${entry.id})`);
      } else {
        await entry.update({
          name: ep.name,
          page: ep.page || null,
          form_name: ep.form_name || null,
          description: ep.description || null,
          is_active: true,
          updated_at: new Date(),
        } as any);
        console.log(`  · entry_point "${ep.slug}" updated`);
      }

      // Ensure an active FormDefinition exists with the seed field_map. We
      // don't destructively replace — if field_map differs, bump the version.
      const existingDefs = await FormDefinition.findAll({
        where: { entry_point_id: entry.id },
        order: [['version', 'DESC']],
      });
      const current = existingDefs.find(d => d.is_active);
      const desiredMap = JSON.stringify(ep.field_map);
      const desiredRequired = JSON.stringify(ep.required_fields || ['email']);
      if (!current) {
        await FormDefinition.create({
          entry_point_id: entry.id,
          field_map: ep.field_map,
          required_fields: ep.required_fields || ['email'],
          version: 1,
          is_active: true,
        } as any);
        console.log(`    + form_definition v1`);
      } else if (
        JSON.stringify(current.field_map) !== desiredMap ||
        JSON.stringify(current.required_fields) !== desiredRequired
      ) {
        await current.update({ is_active: false, updated_at: new Date() } as any);
        const nextVersion = (existingDefs[0]?.version || 0) + 1;
        await FormDefinition.create({
          entry_point_id: entry.id,
          field_map: ep.field_map,
          required_fields: ep.required_fields || ['email'],
          version: nextVersion,
          is_active: true,
        } as any);
        console.log(`    + form_definition v${nextVersion} (superseded v${current.version})`);
      } else {
        console.log(`    · form_definition v${current.version} unchanged`);
      }
    }
  }

  console.log(`\n[SeedLeadSources] Done. Sources: ${created} created, ${updated} updated.`);
  process.exit(0);
}

run().catch((err) => {
  console.error('[SeedLeadSources] Failed:', err);
  process.exit(1);
});
