/**
 * Record the deliverables already sitting in interns' repositories as artifacts.
 *
 * The operational face of `services/artifacts/repoArtifactIngest`. Until this existed,
 * the only way work could become an artifact was an upload on the platform, so an
 * intern who committed their documents had produced nothing as far as every report
 * was concerned. On 14 Nov 2026 that was true of an intern with two infographics,
 * seven engineering documents and a 50KB project overview, all committed, all synced
 * daily, and `artifacts_real_count: 0`.
 *
 * DRY BY DEFAULT. Writing artifact rows for a cohort is not something that should
 * happen because someone pressed up-arrow, so `--go` is required to write anything.
 *
 *   node dist/scripts/ingestRepoArtifacts.js                     # every intern, dry
 *   node dist/scripts/ingestRepoArtifacts.js --email=a@b.com     # one intern, dry
 *   node dist/scripts/ingestRepoArtifacts.js --email=a@b.com --go
 *   node dist/scripts/ingestRepoArtifacts.js --go --verbose      # everyone, for real
 *
 * Safe to re-run: the ingest is idempotent on `repo_path`, so a second run over an
 * unchanged repository writes nothing and reports `unchanged`.
 */
import { sequelize } from '../config/database';
import { ingestRepoArtifacts, type IngestResult } from '../services/artifacts/repoArtifactIngest';

interface Target {
  enrollment_id: string;
  full_name: string;
  email: string;
  repo_url: string;
  last_sync_at: Date | null;
}

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const GO = process.argv.includes('--go');
const VERBOSE = process.argv.includes('--verbose');

/**
 * Only interns with a connected repository. An intern without one is not a problem to
 * report on every run: it is the normal state of the first three weeks, and a script
 * that prints fourteen warnings every morning trains people to stop reading it.
 */
async function targets(): Promise<Target[]> {
  const email = arg('email');
  const enrollment = arg('enrollment');
  const [rows] = await sequelize.query(
    `SELECT DISTINCT ON (e.id)
            e.id AS enrollment_id, e.full_name, e.email,
            g.repo_url, g.last_sync_at
       FROM enrollments e
       JOIN github_connections g ON g.enrollment_id = e.id
      WHERE g.repo_url IS NOT NULL
        AND e.status = 'active'
        ${email ? 'AND lower(e.email) = lower(:email)' : ''}
        ${enrollment ? 'AND e.id = :enrollment' : ''}
      ORDER BY e.id, g.last_sync_at DESC NULLS LAST`,
    { replacements: { email, enrollment } },
  ) as [Target[], unknown];
  return rows ?? [];
}

function describe(t: Target, r: IngestResult): void {
  const head = `${t.full_name} <${t.email}>`;
  const verdict =
    r.outcome === 'written' ? `${GO ? 'recorded' : 'WOULD record'} ${r.created.length}`
      : r.outcome === 'unchanged' ? `unchanged (${r.alreadyPresent} already recorded)`
        : r.outcome === 'nothing_found' ? 'no deliverables found'
          : r.outcome;
  console.log(`\n${head}\n  ${t.repo_url}\n  ${verdict}${r.reason ? `  (${r.reason})` : ''}`);

  for (const c of r.created) {
    const kb = c.sizeBytes >= 1024 * 1024
      ? `${(c.sizeBytes / 1024 / 1024).toFixed(1)}MB`
      : `${Math.round(c.sizeBytes / 1024)}KB`;
    console.log(`    ${c.wrongFormat ? 'format!' : '   ok  '}  ${kb.padStart(7)}  ${c.repoPath}`);
  }
  const wrong = r.created.filter((c) => c.wrongFormat).length;
  if (wrong > 0) {
    console.log(`    ${wrong} of these are markdown or plain text, which counts as work in the wrong format.`);
  }
  if (VERBOSE && Object.keys(r.skipped).length > 0) {
    const parts = Object.entries(r.skipped).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`);
    console.log(`    passed over: ${parts.join(', ')}`);
  }
}

(async () => {
  const list = await targets();
  console.log(`${GO ? 'WRITING' : 'DRY RUN, nothing will be written'} — ${list.length} intern(s) with a connected repository\n`);
  if (list.length === 0) {
    console.log('Nothing to do. Check the --email or --enrollment filter if you expected someone.');
    await sequelize.close();
    return;
  }

  const results: Array<{ t: Target; r: IngestResult }> = [];
  for (const t of list) {
    const r = await ingestRepoArtifacts(t.enrollment_id, { dryRun: !GO });
    results.push({ t, r });
    describe(t, r);
  }

  const created = results.reduce((n, x) => n + x.r.created.length, 0);
  const wrong = results.reduce((n, x) => n + x.r.created.filter((c) => c.wrongFormat).length, 0);
  const failed = results.filter((x) => x.r.outcome === 'failed');

  console.log('\n────────────────────────────────────────');
  console.log(`${GO ? 'recorded' : 'would record'}: ${created} artifact(s) across ${results.filter((x) => x.r.created.length > 0).length} intern(s)`);
  console.log(`wrong format (markdown or text): ${wrong}`);
  console.log(`already recorded: ${results.reduce((n, x) => n + x.r.alreadyPresent, 0)}`);
  if (failed.length > 0) {
    console.log(`FAILED: ${failed.length}`);
    for (const f of failed) console.log(`  ${f.t.full_name}: ${f.r.reason}`);
  }
  if (!GO && created > 0) console.log('\nRe-run with --go to write these.');

  await sequelize.close();
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FAILED: ' + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
