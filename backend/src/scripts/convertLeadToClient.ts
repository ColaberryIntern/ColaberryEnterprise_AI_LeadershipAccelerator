/**
 * convertLeadToClient — the operator surface for turning a real lead into a real client.
 *
 * `convertLeadToClient()` shipped with tests and no caller. This is the caller.
 *
 * ## This one is MEANT to run against production
 *
 * `seedDevClientReviewer` refuses to touch production, because inventing demo rows there
 * would be vandalism. This script is the opposite: converting an actual lead into an
 * actual client IS a production act, and refusing would defeat the point.
 *
 * So the protection is not a refusal, it is a **dry run by default**. Without `--commit`
 * it reads, reports exactly what it would write, and stops. Nothing is created unless the
 * operator asks for it in the same breath as seeing the plan.
 *
 * ## It is safe to run twice
 *
 * The service is idempotent on `organizations.lead_id` and
 * `delivery_engagements.source_lead_id`, so a second run finds the same five rows and
 * creates nothing. That is what makes the dry run honest: the thing you preview is the
 * thing that happens, and pressing it again does not multiply anything.
 *
 * ## What it does not do
 *
 * It sends nothing to the client. After conversion the client can sign in with Google on
 * the email the lead carried, because that address now has a delivery membership - the
 * same path a real client uses, with no back door added here.
 *
 * Usage:
 *   node dist/scripts/convertLeadToClient.js --lead 123 --brand ai-flotation
 *   node dist/scripts/convertLeadToClient.js --lead 123 --brand ai-flotation --commit
 *
 * Options:
 *   --lead <id>            required, the leads.id integer
 *   --brand <slug>         resolves both the brand and its tenant
 *   --tenant <slug>        override the tenant (rarely needed)
 *   --engagement "<name>"  defaults to "<Company> - delivery"
 *   --project "<name>"     defaults to "<Company> - initial build"
 *   --commit               actually write. Without it, nothing is created.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import Lead from '../models/Lead';
import { convertLeadToClient } from '../services/delivery/leadConversion';
import { planConversion } from '../services/delivery/leadConversionPlan';

export interface Args {
  leadId: number;
  brandSlug?: string;
  tenantSlug?: string;
  engagementName?: string;
  projectName?: string;
  commit: boolean;
}

export function parseArgs(argv: string[]): Args {
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const leadRaw = value('--lead');
  const leadId = Number(leadRaw);
  if (!leadRaw || !Number.isInteger(leadId)) {
    throw new Error('--lead <id> is required and must be an integer (leads.id)');
  }
  return {
    leadId,
    brandSlug: value('--brand'),
    tenantSlug: value('--tenant'),
    engagementName: value('--engagement'),
    projectName: value('--project'),
    commit: argv.includes('--commit'),
  };
}

/** Resolved from the real tables, never invented - the ids are NOT NULL foreign keys. */
async function resolveBrandAndTenant(args: Args): Promise<{ brandId: string | null; tenantId: string }> {
  let brandId: string | null = null;
  let tenantId: string | undefined;

  if (args.brandSlug) {
    const [brand] = await sequelize.query<{ id: string; name: string; tenant_id: string | null }>(
      'SELECT id, name, tenant_id FROM brands WHERE slug = :slug LIMIT 1',
      { type: QueryTypes.SELECT, replacements: { slug: args.brandSlug } },
    );
    if (!brand) throw new Error(`no brand with slug '${args.brandSlug}' in this database`);
    brandId = brand.id;
    tenantId = brand.tenant_id ?? undefined;
    console.log(`[convert] brand: ${brand.name} (${brand.id})`);
  }

  if (args.tenantSlug) {
    const [tenant] = await sequelize.query<{ id: string; name: string }>(
      'SELECT id, name FROM tenants WHERE slug = :slug LIMIT 1',
      { type: QueryTypes.SELECT, replacements: { slug: args.tenantSlug } },
    );
    if (!tenant) throw new Error(`no tenant with slug '${args.tenantSlug}' in this database`);
    tenantId = tenant.id;
    console.log(`[convert] tenant: ${tenant.name} (${tenant.id})`);
  }

  if (!tenantId) {
    throw new Error(
      'could not resolve a tenant. Pass --tenant <slug>, or --brand <slug> for a brand that has one. '
      + 'delivery_engagements.tenant_id is NOT NULL and a made-up id would point at nothing.',
    );
  }
  return { brandId, tenantId };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const [db] = await sequelize.query<{ name: string }>(
    'SELECT current_database() AS name', { type: QueryTypes.SELECT },
  );
  console.log(`[convert] database: ${db.name}`);

  const lead = await Lead.findByPk(args.leadId);
  if (!lead) throw new Error(`no lead ${args.leadId} in this database`);
  console.log(`[convert] lead ${lead.id}: ${lead.name || '(no name)'} <${lead.email || 'no email'}> — ${lead.company || '(no company)'} [source: ${lead.source || 'unknown'}]`);

  const { brandId, tenantId } = await resolveBrandAndTenant(args);

  // Two cheap reads so the preview can say "already converted" rather than guessing.
  const [org] = await sequelize.query<{ id: string }>(
    'SELECT id FROM organizations WHERE lead_id = :lead LIMIT 1',
    { type: QueryTypes.SELECT, replacements: { lead: lead.id } },
  );
  const [engagement] = await sequelize.query<{ id: string; name: string }>(
    'SELECT id, name FROM delivery_engagements WHERE source_lead_id = :lead LIMIT 1',
    { type: QueryTypes.SELECT, replacements: { lead: lead.id } },
  );

  const plan = planConversion({
    lead: { id: lead.id, email: lead.email, company: lead.company, name: lead.name, message: lead.message },
    brandExists: args.brandSlug ? true : null,
    existing: { organizationId: org?.id ?? null, engagementId: engagement?.id ?? null },
    engagementName: args.engagementName,
    projectName: args.projectName,
  });

  if (plan.refused) {
    console.error(`[convert] REFUSED (${plan.reason}): ${plan.detail}`);
    process.exitCode = 1;
    return;
  }

  console.log('[convert] plan:');
  console.log(`  organization : ${plan.organizationName}${org ? '  (exists)' : '  (create)'}`);
  console.log(`  engagement   : ${plan.engagementName}${engagement ? '  (exists)' : '  (create)'}`);
  console.log(`  project      : ${plan.projectName}  [${plan.projectSlug}]`);
  console.log(`  client       : ${plan.clientEmail}  as ${plan.clientDisplayName || '(no name)'}`);

  if (!args.commit) {
    console.log('\n[convert] DRY RUN — nothing was written. Re-run with --commit to apply.');
    return;
  }

  const result = await convertLeadToClient({
    leadId: lead.id,
    tenantId,
    brandId,
    engagementName: args.engagementName,
    projectName: args.projectName,
  });

  if (result.refused) {
    console.error(`[convert] REFUSED (${result.reason}): ${result.detail}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n[convert] ${result.created ? 'CONVERTED' : 'ALREADY CONVERTED (nothing created)'}`);
  console.log(`  organization : ${result.organizationId}`);
  console.log(`  engagement   : ${result.engagementId}`);
  console.log(`  identity     : ${result.identityId}`);
  console.log(`  project      : ${result.projectId}`);
  console.log(`  membership   : ${result.membershipId}`);
  console.log(`\n${plan.clientEmail} can now sign in with Google and will see this project.`);
}

// Guarded so the test can import parseArgs without the script connecting to a database
// and converting something. `require.main` is the entry module only when run directly.
if (require.main === module) {
  main()
    .then(() => sequelize.close())
    .catch(async (error) => {
      console.error(`[convert] failed: ${(error as Error).message}`);
      process.exitCode = 1;
      await sequelize.close();
    });
}
