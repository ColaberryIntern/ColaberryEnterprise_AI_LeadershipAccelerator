/**
 * SV0.1 (Services Upgrade, Basecamp todo 10506775179): freeze today's Our Services catalog and the Gov AI
 * capability-fit verdicts on the baseline pursuits, so every later ticket can prove it did not make the AI worse.
 *
 * READ-ONLY. It lists service_offerings and calls assessCapabilityFit (which persists nothing) with ACTIVE services
 * only, exactly as the Fit route and ZIP vetting do. It writes two JSON files to OUT_DIR and nothing to the database.
 *
 * Failure modes handled: gov container unresolvable -> exit 1, nothing written; a single pursuit's fit errors ->
 * recorded as `error` on that pursuit (fit fails soft); every fit errors -> exit 1, nothing written; invalid data ->
 * Zod throws before any write. Retries: none here beyond the fit client's own single retry; re-run the script.
 *
 * Run (inside the backend image):
 *   node dist/scripts/snapshotServiceCatalogBaseline.js --help
 *   OUT_DIR=/out node dist/scripts/snapshotServiceCatalogBaseline.js                 # catalog + 5 fit calls
 *   OUT_DIR=/tmp/x node dist/scripts/snapshotServiceCatalogBaseline.js --catalog-only # no OpenAI call
 */
import {
  BASELINE_USAGE, SELECTION_RULE, STORED_SELECTION_RULE, mapEstablished, parseBaselineArgs, selectBaselinePursuits, sqlRowToDto,
  toSnapshotRow, vettingToPursuit, writeBaseline,
} from '../services/servicesUpgrade/baseline';
import type { PursuitBaseline } from '../services/servicesUpgrade/schemas';

// any (below): Sequelize `where` typing and serviceCatalog's untyped DTOs; every value written is Zod-validated in
// writeBaseline before it reaches disk, so the untyped reads cannot produce an unvalidated artifact.
/** Offline mode: build the same artifacts from read-only psql exports (no DB connection, no OpenAI). */
async function fromExport(args: ReturnType<typeof parseBaselineArgs>): Promise<void> {
  const fs = await import('fs');
  const [catalogFile, vettingsFile] = args.fromExport as [string, string];
  const catalogRows: any[] = JSON.parse(fs.readFileSync(catalogFile, 'utf8')) || [];
  const exp = JSON.parse(fs.readFileSync(vettingsFile, 'utf8'));
  const rows = catalogRows.map((r) => toSnapshotRow(sqlRowToDto(r)));
  const snapshot = { kind: 'service_catalog_snapshot', takenOn: args.takenOn, tenantId: exp.tenant, rowCount: rows.length, rows };
  const stored = { kind: 'capability_fit_baseline', takenOn: args.takenOn, activeServiceCount: rows.filter((r) => r.status === 'active').length,
    selectionRule: STORED_SELECTION_RULE, pursuits: (exp.vettings || []).map(vettingToPursuit) };
  const written = writeBaseline(args.outDir, args.takenOn, snapshot, { capability_fit_stored: stored });
  console.log(JSON.stringify({ event: 'svc_baseline_written', outcome: 'success', files: written }));
  console.log(`catalog_rows=${rows.length} active=${stored.activeServiceCount} pursuits=${stored.pursuits.length}`);
}

async function main(): Promise<void> {
  const args = parseBaselineArgs(process.argv.slice(2), process.env, new Date().toISOString().slice(0, 10));
  if (args.help) { console.log(BASELINE_USAGE); return; }
  if (args.fromExport) { await fromExport(args); return; }

  const { sequelize } = await import('../config/database');
  try {
    const { lookupGovContractsContainer } = await import('./lib/factoryDemoContainer');
    const container = await lookupGovContractsContainer();
    if (!container) throw new Error('gov contracts container not resolvable (tenant slug "refactored")');
    const tenantId = container.tenant.id;

    const { listServiceOfferings } = await import('../services/factory/serviceCatalog');
    const { default: ServiceOffering } = await import('../models/ServiceOffering');
    const all = await listServiceOfferings({ tenantId, status: 'all' });
    const dbCount = await ServiceOffering.count({ where: { tenant_id: tenantId } as any });
    if (dbCount !== all.length) throw new Error(`catalog count mismatch: list=${all.length} db=${dbCount}`);
    const snapshot = { kind: 'service_catalog_snapshot', takenOn: args.takenOn, tenantId, rowCount: all.length, rows: all.map(toSnapshotRow) };
    const active = all.filter((s: any) => s.status === 'active');

    const fits: Record<string, unknown> = {};
    let pursuitCount = 0;
    if (!args.catalogOnly) {
      const { default: GovAiVetting } = await import('../models/GovAiVetting');
      const stored: any[] = await GovAiVetting.findAll({ where: { tenant_id: tenantId, status: 'completed' } as any, order: [['completed_at', 'DESC']] });
      fits.capability_fit_stored = { kind: 'capability_fit_baseline', takenOn: args.takenOn, activeServiceCount: active.length,
        selectionRule: STORED_SELECTION_RULE,
        pursuits: stored.map((r) => (r.get ? r.get() : r)).filter((r) => r.fit_json).map((r) => vettingToPursuit({ ...r, title: r.opportunity_json?.title })) };

      const { default: GovQualification } = await import('../models/GovQualification');
      const rows: any[] = await GovQualification.findAll({
        where: { tenant_id: tenantId, status: 'active' } as any,
        attributes: ['canonical_opportunity_id', 'status', 'version', 'updated_at', 'requirements_json'],
      });
      const picked = selectBaselinePursuits(rows.map((r) => (r.get ? r.get() : r)));
      const { assessCapabilityFit, __clearGovCapabilityFitCache } = await import('../services/factory/govCapabilityFit');
      __clearGovCapabilityFitCache();
      const services = active.map((s: any) => ({ id: s.id, name: s.name, description: s.description, category: s.category, keywords: s.keywords }));
      const pursuits: PursuitBaseline[] = [];
      for (const q of picked) {
        const requirements = mapEstablished(q.requirements_json?.established);
        const title = q.requirements_json?.provenance?.title ?? null;
        const r = await assessCapabilityFit({ requirements, services, title, buyer: q.requirements_json?.provenance?.agency ?? null });
        pursuits.push({
          canonicalOpportunityId: q.canonical_opportunity_id, source: 'fresh_run', title, requirementCount: requirements.length,
          verdict: null, coveragePct: null, completedAt: new Date().toISOString(), error: r.error ?? null,
          capabilities: (r.capabilities || []).map((c) => ({ id: c.id, name: c.name, assessment: c.assessment, matchedServiceId: c.matchedServiceId, rationale: c.rationale })),
        });
      }
      if (pursuits.length > 0 && pursuits.every((p) => p.error)) throw new Error(`every capability-fit call failed: ${pursuits[0].error}`);
      pursuitCount = pursuits.length;
      fits.capability_fit_fresh = { kind: 'capability_fit_baseline', takenOn: args.takenOn, activeServiceCount: active.length, selectionRule: SELECTION_RULE, pursuits };
    }

    const written = writeBaseline(args.outDir, args.takenOn, snapshot, fits);
    console.log(JSON.stringify({ event: 'svc_baseline_written', outcome: 'success', files: written }));
    console.log(`catalog_rows=${all.length} active=${active.length} pursuits=${pursuitCount}`);
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(JSON.stringify({ event: 'svc_baseline_failed', outcome: 'failure', error_class: e?.constructor?.name ?? 'Error', message: e instanceof Error ? e.message : String(e) }));
    process.exitCode = 1;
  });
}
