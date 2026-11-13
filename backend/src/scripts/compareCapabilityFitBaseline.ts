/**
 * SV2.3 (Services Upgrade): re-run the Gov AI capability fit on the SV0.1 baseline pursuits with the SV2 code and
 * diff it against the frozen "before", so the upgrade can be shown to make the AI more honest, not worse.
 *
 * READ-ONLY on business data. It reads service_offerings, gov_qualifications (established requirements) and the
 * case-study proof, and calls the fit (which persists nothing). Its only writes are the two report files in OUT_DIR,
 * which must be outside the working directory, plus the standard ai_events telemetry row per LLM call that every
 * instrumented call writes (flushed before the pool closes). No Gov AI verdict or title is ever written to the repo.
 *
 * For each baseline pursuit it runs the fit RUNS times (cache cleared each time, so the runs are independent), and
 * applies the proof rules with the downgrade OFF (what ships) and ON (what ENABLE_GOV_FIT_REQUIRE_PROOF would do)
 * to the SAME model output. Diff + majority vote: services/servicesUpgrade/fitRegression.ts.
 *
 * Failure modes handled: bad args / unreadable or invalid baseline -> exit 1 before any DB access; gov container
 * unresolvable or the baseline taken for another tenant -> exit 1, nothing written; a pursuit no longer present ->
 * recorded as `pursuit_not_found` (others continue); a single run's fit error -> recorded on that run; EVERY run of
 * every pursuit failing -> exit 1, nothing written. Retries: the fit client's own single retry; re-run the script.
 *
 * Run (inside the backend container):
 *   node dist/scripts/compareCapabilityFitBaseline.js --help
 *   OUT_DIR=/tmp/svc-regression node dist/scripts/compareCapabilityFitBaseline.js \
 *     --baseline-fit /tmp/svc-baseline/capability_fit_fresh_2026-11-13.json --baseline-catalog /tmp/svc-baseline/catalog_2026-11-13.json
 */
import fs from 'fs';
import path from 'path';
import { parseRegressionArgs, REGRESSION_USAGE, RegressionArgs, RegressionRunError } from '../services/servicesUpgrade/fitRegressionArgs';
import { buildRegressionReport, diffPursuit, FitRun, PursuitRegression, RunCapability, summarizeRegression } from '../services/servicesUpgrade/fitRegression';
import { CapabilityFitBaseline, CatalogSnapshot } from '../services/servicesUpgrade/schemas';
import { mapEstablished } from '../services/servicesUpgrade/baseline';

const log = (event: string, outcome: string, context: Record<string, unknown> = {}): void =>
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'svc-regression', event, outcome, context }));

const lite = (caps: Array<RunCapability & Record<string, unknown>>): RunCapability[] => caps.map((c) => ({
  id: c.id, name: c.name, assessment: c.assessment, matchedServiceId: c.matchedServiceId,
  ...(c.evidence ? { evidence: c.evidence } : {}), ...(c.possibleProof ? { possibleProof: c.possibleProof } : {}),
  ...(c.downgradedFrom ? { downgradedFrom: c.downgradedFrom } : {}),
}));

async function run(args: RegressionArgs): Promise<void> {
  const fit = CapabilityFitBaseline.parse(JSON.parse(fs.readFileSync(args.baselineFit, 'utf8')));
  const catalog = CatalogSnapshot.parse(JSON.parse(fs.readFileSync(args.baselineCatalog, 'utf8')));

  const { sequelize } = await import('../config/database');
  try {
    const { lookupGovContractsContainer } = await import('./lib/factoryDemoContainer');
    const container = await lookupGovContractsContainer();
    if (!container) throw new RegressionRunError('gov contracts container not resolvable (tenant slug "refactored")');
    const tenantId = container.tenant.id;
    if (catalog.tenantId !== tenantId) throw new RegressionRunError('the baseline catalog was taken for a different tenant');

    const { listServiceOfferings } = await import('../services/factory/serviceCatalog');
    // any: serviceCatalog DTOs are untyped; only id + status are read.
    const statusNow = new Map((await listServiceOfferings({ tenantId, status: 'all' })).map((s: any) => [String(s.id), String(s.status)])); // eslint-disable-line @typescript-eslint/no-explicit-any

    const { default: GovQualification } = await import('../models/GovQualification');
    const { assessCapabilityFitWithProof } = await import('../services/factory/govCapabilityFitWithProof');
    const { __clearGovCapabilityFitCache } = await import('../services/factory/govCapabilityFit');
    const { applyFitProofRules } = await import('../services/factory/govFitProofRules');

    const pursuits: PursuitRegression[] = [];
    for (const before of fit.pursuits) {
      // any: requirements_json is a free-form JSONB dossier; only .established and .provenance are read, defensively.
      const rows: any[] = await GovQualification.findAll({ // eslint-disable-line @typescript-eslint/no-explicit-any
        where: { tenant_id: tenantId, status: 'active', canonical_opportunity_id: before.canonicalOpportunityId } as never,
        attributes: ['canonical_opportunity_id', 'version', 'requirements_json'],
      });
      const q = rows.map((r) => (r.get ? r.get() : r)).sort((a, b) => b.version - a.version)[0];
      const requirements = mapEstablished(q?.requirements_json?.established);
      if (!q || !requirements.length) {
        pursuits.push(diffPursuit(before, [], catalog, statusNow, q ? 'no_established_requirements' : 'pursuit_not_found'));
        continue;
      }
      const runs: FitRun[] = [];
      for (let i = 0; i < args.runs; i++) {
        __clearGovCapabilityFitCache();
        const out = await assessCapabilityFitWithProof({
          tenantId, requirements, title: q.requirements_json?.provenance?.title ?? null, buyer: q.requirements_json?.provenance?.agency ?? null, requireProof: false,
        });
        if (out.fit.error) { runs.push({ error: out.fit.error, flagOff: [], flagOn: [] }); continue; }
        runs.push({
          error: null,
          flagOff: lite(applyFitProofRules(out.rawCapabilities, out.proof, { requireProof: false }) as never),
          flagOn: lite(applyFitProofRules(out.rawCapabilities, out.proof, { requireProof: true }) as never),
        });
      }
      pursuits.push(diffPursuit(before, runs, catalog, statusNow));
      log('svc_regression_pursuit_done', 'success', { pursuit: before.canonicalOpportunityId, runs: runs.length, failed: runs.filter((r) => r.error).length });
    }
    if (pursuits.length && pursuits.every((p) => !p.after)) throw new RegressionRunError(`no successful fit run for any pursuit: ${pursuits[0].error}`);

    const report = buildRegressionReport({ generatedAt: new Date().toISOString(), baselineTakenOn: fit.takenOn, runsPerPursuit: args.runs, pursuits });
    fs.mkdirSync(args.outDir, { recursive: true });
    const json = path.join(args.outDir, `capability_fit_regression_${args.reportDate}.json`);
    const txt = path.join(args.outDir, `capability_fit_regression_${args.reportDate}.summary.txt`);
    fs.writeFileSync(json, JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(txt, summarizeRegression(report));
    log('svc_regression_written', 'success', { files: [json, txt], pursuits: pursuits.length });
    process.stdout.write(summarizeRegression(report));
  } finally {
    const { flushThenClose } = await import('./lib/flushThenClose');
    await flushThenClose(() => sequelize.close());
  }
}

async function main(): Promise<void> {
  const args = parseRegressionArgs(process.argv.slice(2), process.env, process.cwd(), new Date().toISOString().slice(0, 10));
  if (args.help) { console.log(REGRESSION_USAGE); return; }
  await run(args);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(JSON.stringify({ event: 'svc_regression_failed', outcome: 'failure', error_class: e?.constructor?.name ?? 'Error', message: e instanceof Error ? e.message : String(e) }));
    process.exitCode = 1;
  });
}
