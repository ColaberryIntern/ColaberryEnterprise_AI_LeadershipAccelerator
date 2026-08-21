import fs from 'fs';
import path from 'path';
import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { Brand, LeadSource, Tenant } from '../models';
import { buildSourceSlugMap, DELIBERATELY_UNCLASSIFIED_SOURCE_SLUGS } from '../seeds/ecosystemSeedData';

/**
 * Tenancy backfill — assigns tenant/brand to rows that predate the ecosystem model.
 *
 * NOT boot work. This is an explicitly invoked script because `page_events` is the
 * highest-row-count table in the database and a full-table update at container start
 * would turn every deploy into an outage. Boot only creates schema; data movement is a
 * deliberate act with a person watching.
 *
 * IDEMPOTENT: every statement is guarded by `WHERE tenant_id IS NULL`, so a second run
 * processes zero rows. Re-running after a partial failure resumes rather than redoing.
 *
 * NEVER GUESSES: sources with no deterministic owner are counted as `unresolved` and
 * listed in the audit artifact. `advisor` and `worldoftaxonomy` are explicitly excluded
 * — advisor.colaberry.ai is a separate product in its own repository, and asserting it
 * belongs to Colaberry Enterprise would be exactly the silent guess the migration plan
 * forbids.
 *
 * Run:  npx ts-node src/scripts/backfillTenancy.ts [--batch=50000] [--dry-run]
 */

interface StageResult {
  stage: string;
  processed: number;
  updated: number;
  already_correct: number;
  unresolved: number;
  failed: number;
  notes: string[];
}

function newStage(stage: string): StageResult {
  return { stage, processed: 0, updated: 0, already_correct: 0, unresolved: 0, failed: 0, notes: [] };
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BATCH_SIZE = (() => {
  const arg = args.find((a) => a.startsWith('--batch='));
  const parsed = arg ? parseInt(arg.split('=')[1], 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50_000;
})();

async function run(sql: string, replacements: Record<string, unknown> = {}): Promise<number> {
  if (DRY_RUN) return 0;
  const [, meta] = await sequelize.query(sql, { replacements });
  return (meta as any)?.rowCount ?? 0;
}

/** Stage 1: lead_sources gain tenant/brand from the declarative seed map. */
async function backfillLeadSources(): Promise<StageResult> {
  const result = newStage('lead_sources');
  const slugMap = buildSourceSlugMap();
  const sources = await LeadSource.findAll();

  for (const source of sources) {
    result.processed += 1;

    if ((source as any).tenant_id && (source as any).brand_id) {
      result.already_correct += 1;
      continue;
    }

    if (DELIBERATELY_UNCLASSIFIED_SOURCE_SLUGS.includes(source.slug)) {
      result.unresolved += 1;
      result.notes.push(`${source.slug}: deliberately unclassified — needs a human decision`);
      continue;
    }

    const target = slugMap.get(source.slug);
    if (!target) {
      result.unresolved += 1;
      result.notes.push(`${source.slug}: no deterministic owner in the seed map`);
      continue;
    }

    const tenant = await Tenant.findOne({ where: { slug: target.tenantSlug } });
    const brand = tenant
      ? await Brand.findOne({ where: { tenant_id: tenant.id, slug: target.brandSlug } })
      : null;

    if (!tenant || !brand) {
      result.failed += 1;
      result.notes.push(`${source.slug}: seed rows missing — run seedEcosystem first`);
      continue;
    }

    if (!DRY_RUN) {
      await source.update({ tenant_id: tenant.id, brand_id: brand.id } as any);
    }
    result.updated += 1;
  }

  return result;
}

/** Stage 2: visitor_sessions inherit tenant/brand from their site_slug's lead source. */
async function backfillVisitorSessions(): Promise<StageResult> {
  const result = newStage('visitor_sessions');

  const [rows] = await sequelize.query(
    `SELECT COUNT(*)::int AS c FROM visitor_sessions WHERE tenant_id IS NULL AND site_slug IS NOT NULL`,
  );
  result.processed = (rows as any[])[0]?.c ?? 0;

  // Joined update rather than a per-row loop: this is a single set-based statement the
  // planner can execute with an index scan, and the WHERE guard makes it resumable.
  result.updated = await run(
    `UPDATE visitor_sessions vs
        SET tenant_id = ls.tenant_id,
            brand_id  = ls.brand_id,
            source_id = ls.id
       FROM lead_sources ls
      WHERE ls.slug = vs.site_slug
        AND vs.tenant_id IS NULL
        AND ls.tenant_id IS NOT NULL`,
  );

  const [remaining] = await sequelize.query(
    `SELECT COUNT(*)::int AS c FROM visitor_sessions WHERE tenant_id IS NULL AND site_slug IS NOT NULL`,
  );
  result.unresolved = (remaining as any[])[0]?.c ?? 0;
  if (result.unresolved > 0) {
    result.notes.push(
      `${result.unresolved} sessions have a site_slug with no classified lead source`,
    );
  }

  return result;
}

/**
 * Stage 3: page_events inherit tenant/brand from their session.
 *
 * BATCHED. This is the largest table in the database, and one unbounded UPDATE would
 * hold a transaction open long enough to bloat the table and stall writes on a
 * high-write path. The ctid-keyed batch is bounded, repeatable, and safe to interrupt:
 * whatever was committed stays committed and the next run picks up the rest.
 */
async function backfillPageEvents(): Promise<StageResult> {
  const result = newStage('page_events');

  const [before] = await sequelize.query(
    `SELECT COUNT(*)::int AS c FROM page_events WHERE tenant_id IS NULL`,
  );
  result.processed = (before as any[])[0]?.c ?? 0;

  if (DRY_RUN) {
    result.notes.push(`dry run — would update up to ${result.processed} rows in batches of ${BATCH_SIZE}`);
    return result;
  }

  let totalUpdated = 0;
  for (;;) {
    const updated = await run(
      `UPDATE page_events pe
          SET tenant_id = vs.tenant_id,
              brand_id  = vs.brand_id,
              source_id = vs.source_id
         FROM visitor_sessions vs
        WHERE pe.session_id = vs.id
          AND pe.tenant_id IS NULL
          AND vs.tenant_id IS NOT NULL
          AND pe.ctid IN (
            SELECT ctid FROM page_events
             WHERE tenant_id IS NULL
             LIMIT :batch
          )`,
      { batch: BATCH_SIZE },
    );
    totalUpdated += updated;
    if (updated === 0) break;
    console.log(`  ... page_events: ${totalUpdated} updated`);
  }

  result.updated = totalUpdated;

  const [after] = await sequelize.query(
    `SELECT COUNT(*)::int AS c FROM page_events WHERE tenant_id IS NULL`,
  );
  result.unresolved = (after as any[])[0]?.c ?? 0;
  if (result.unresolved > 0) {
    result.notes.push(`${result.unresolved} events belong to sessions with no tenant`);
  }

  return result;
}

/**
 * Stage 4: campaigns and organizations default to Colaberry Enterprise.
 *
 * This is a deterministic assignment, not a guess: there has never been a second tenant,
 * so every campaign and organization currently in the database IS Colaberry Enterprise.
 * Logged as an assumption so it is auditable rather than silent.
 */
async function backfillCampaignsAndOrgs(): Promise<StageResult> {
  const result = newStage('campaigns_and_organizations');

  const tenant = await Tenant.findOne({ where: { slug: 'colaberry' } });
  const brand = tenant
    ? await Brand.findOne({ where: { tenant_id: tenant.id, slug: 'colaberry-enterprise' } })
    : null;

  if (!tenant || !brand) {
    result.failed += 1;
    result.notes.push('colaberry/colaberry-enterprise seed rows missing — run seedEcosystem first');
    return result;
  }

  const [campaignRows] = await sequelize.query(
    `SELECT COUNT(*)::int AS c FROM campaigns WHERE tenant_id IS NULL`,
  );
  const [orgRows] = await sequelize.query(
    `SELECT COUNT(*)::int AS c FROM organizations WHERE tenant_id IS NULL`,
  );
  result.processed = ((campaignRows as any[])[0]?.c ?? 0) + ((orgRows as any[])[0]?.c ?? 0);

  result.updated += await run(
    `UPDATE campaigns SET tenant_id = :tenantId, brand_id = :brandId WHERE tenant_id IS NULL`,
    { tenantId: tenant.id, brandId: brand.id },
  );
  result.updated += await run(
    `UPDATE organizations
        SET tenant_id = :tenantId, brand_id = :brandId,
            organization_type = COALESCE(organization_type, 'enterprise_customer')
      WHERE tenant_id IS NULL`,
    { tenantId: tenant.id, brandId: brand.id },
  );

  result.notes.push(
    'ASSUMPTION: every pre-ecosystem campaign and organization is Colaberry Enterprise, ' +
      'because no second tenant has ever existed in this database.',
  );

  return result;
}

async function main(): Promise<void> {
  await connectDatabase();
  console.log(
    `[BackfillTenancy] starting${DRY_RUN ? ' (DRY RUN)' : ''}, batch size ${BATCH_SIZE}\n`,
  );

  const stages: StageResult[] = [];
  // Order matters: sessions read from lead_sources, page_events read from sessions.
  stages.push(await backfillLeadSources());
  stages.push(await backfillVisitorSessions());
  stages.push(await backfillPageEvents());
  stages.push(await backfillCampaignsAndOrgs());

  for (const stage of stages) {
    console.log(
      `${stage.stage}: processed=${stage.processed} updated=${stage.updated} ` +
        `already_correct=${stage.already_correct} unresolved=${stage.unresolved} failed=${stage.failed}`,
    );
    for (const note of stage.notes) console.log(`    - ${note}`);
  }

  // Machine-readable artifact so unresolved rows can be reviewed rather than forgotten.
  const outDir = path.resolve(process.cwd(), 'tmp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'backfill-tenancy-report.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify({ dryRun: DRY_RUN, batchSize: BATCH_SIZE, stages }, null, 2),
    'utf8',
  );
  console.log(`\n[BackfillTenancy] report written to ${outPath}`);

  const failed = stages.reduce((sum, s) => sum + s.failed, 0);
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[BackfillTenancy] Failed:', err);
    process.exit(1);
  });
}

export { backfillLeadSources, backfillVisitorSessions, backfillPageEvents, backfillCampaignsAndOrgs };
