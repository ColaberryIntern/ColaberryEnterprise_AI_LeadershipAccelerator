import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { syncTimelineCards, retireMissingCards } from '../services/explorerGrowth/content/syncTimelineCards';
import { resolveContentAssets } from '../services/explorerGrowth/content/resolveContentAssets';
import { PURPOSE_SPECS } from '../services/explorerGrowth/content/assetPurposeMap';
import { EXPLORER_ASSET_PURPOSES } from '../types/explorerGrowth';
import type { ExplorerAssetPurpose, ExplorerPrimaryState } from '../types/explorerGrowth';

/**
 * Explorer Growth OS — operator-invoked content registry sync. EPIC 5 T007.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE CRON: the cron is flag-gated and stays
 * dark, but the registry has to be populated BEFORE anything is enabled so the
 * shadow review can show which decisions would carry real content. A person
 * running this deliberately is its own authorisation — the same pattern as
 * EPIC 4's `runExplorerGovernor`. It therefore calls `syncTimelineCards`
 * directly rather than `runContentSync`, which carries the flag gate.
 *
 * IT PROJECTS AND REPORTS ONLY. Nothing is enqueued and nothing is sent.
 *
 * Usage:
 *   node dist/scripts/runExplorerContentSync.js --dry-run
 *   node dist/scripts/runExplorerContentSync.js --confirm-production
 *   node dist/scripts/runExplorerContentSync.js --report        (read-only gap report)
 */

interface Args {
  dryRun: boolean;
  confirmProduction: boolean;
  reportOnly: boolean;
}

export function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false, confirmProduction: false, reportOnly: false };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--confirm-production') out.confirmProduction = true;
    else if (a === '--report') out.reportOnly = true;
    else if (a.startsWith('--')) throw new Error(`unknown flag: ${a}`);
  }
  return out;
}

/**
 * No production writes without an explicit flag (CLAUDE.md).
 *
 * Copied deliberately from `runExplorerGovernor.ts:59` rather than shared: the
 * two scripts must not be able to drift into one having the guard and the other
 * inheriting a weakened version of it.
 */
export function assertSafeTarget(args: Args): void {
  if (args.dryRun || args.reportOnly) return;
  const url = process.env.DATABASE_URL ?? '';
  const looksProd = /accelerator_prod|prod/i.test(url) && !/dev|local|test/i.test(url);
  if (looksProd && !args.confirmProduction) {
    throw new Error(
      'Refusing to write to what looks like production without --confirm-production. ' +
        'Re-run with --dry-run to preview, or pass --confirm-production deliberately.',
    );
  }
}

/** What the gap report answers, per purpose. */
interface PurposeReport {
  purpose: ExplorerAssetPurpose;
  supported: boolean;
  reason?: string;
  /** Learners in states that would ask for this purpose, and whether it resolves. */
  byState: { state: ExplorerPrimaryState; learners: number; resolved: boolean; detail: string }[];
}

/**
 * The content gap report the contract asks for.
 *
 * Reports against the REAL state distribution rather than every theoretical
 * combination: a purpose that resolves for a state nobody is in is not a fact
 * worth reporting, and a purpose that fails for 134 learners is.
 */
export async function buildGapReport(asOf: Date): Promise<PurposeReport[]> {
  const states = await sequelize.query<{ primary_state: ExplorerPrimaryState; n: string }>(
    `SELECT primary_state, count(*) AS n FROM explorer_journey_profiles GROUP BY 1 ORDER BY 2 DESC`,
    { type: QueryTypes.SELECT },
  );

  const out: PurposeReport[] = [];
  for (const purpose of EXPLORER_ASSET_PURPOSES) {
    const spec = PURPOSE_SPECS[purpose];
    if (!spec.supported) {
      out.push({ purpose, supported: false, reason: spec.reason, byState: [] });
      continue;
    }
    const byState: PurposeReport['byState'] = [];
    for (const row of states) {
      // Reported for the FREE-PREVIEW tier, because that is what 152 of 153
      // learners are. A report against full access would look far healthier
      // than the system actually is for almost everyone using it.
      const result = await resolveContentAssets(
        { asset_type: purpose, affinity_tags: [], state: row.primary_state },
        asOf,
        'free_preview',
      );
      byState.push({
        state: row.primary_state,
        learners: Number(row.n),
        resolved: result.resolved,
        detail: result.resolved
          ? `${result.assets.length} asset(s): ${result.assets[0].title.slice(0, 48)}`
          : result.reason,
      });
    }
    out.push({ purpose, supported: true, byState });
  }
  return out;
}

function printReport(report: PurposeReport[]): void {
  console.log('\n=== EPIC 5 content gap report ===\n');
  for (const r of report) {
    if (!r.supported) {
      console.log(`  ${r.purpose}  DECLARED GAP`);
      console.log(`      ${r.reason}\n`);
      continue;
    }
    console.log(`  ${r.purpose}`);
    for (const s of r.byState) {
      const mark = s.resolved ? 'OK  ' : 'GAP ';
      console.log(`      ${mark} ${s.state} (${s.learners} learners) — ${s.detail}`);
    }
    console.log('');
  }
  const gaps = report.filter((r) => !r.supported).length;
  const unresolved = report
    .filter((r) => r.supported)
    .flatMap((r) => r.byState.filter((s) => !s.resolved).map((s) => `${r.purpose}/${s.state}`));
  console.log(`  ${gaps} purpose(s) declared unsupported.`);
  console.log(
    unresolved.length
      ? `  ${unresolved.length} supported purpose/state pair(s) resolve to NOTHING: ${unresolved.join(', ')}`
      : '  Every supported purpose resolves for every state present.',
  );
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  assertSafeTarget(args);

  if (!args.reportOnly) {
    if (args.dryRun) {
      console.log('[dry-run] would project published timeline cards into explorer_content_assets');
    } else {
      const result = await syncTimelineCards();
      const seen = await sequelize.query<{ id: string }>(
        `SELECT tc.id FROM timeline_cards tc
           JOIN curriculum_type_definitions ctd ON ctd.slug = tc.type
          WHERE tc.visibility = 'published' AND tc.status = 'active'
            AND ctd.is_active = true AND ctd.today_eligible = true`,
        { type: QueryTypes.SELECT },
      );
      const retired = seen.length ? await retireMissingCards(seen.map((r) => r.id)) : 0;
      console.log(
        `synced: scanned=${result.scanned} written=${result.written} ` +
          `skipped=${result.skipped.length} retired=${retired}`,
      );
      if (result.skipped.length) console.log('skipped:', JSON.stringify(result.skipped));
    }
  }

  printReport(await buildGapReport(new Date()));
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('runExplorerContentSync failed:', err);
      process.exit(1);
    });
}
