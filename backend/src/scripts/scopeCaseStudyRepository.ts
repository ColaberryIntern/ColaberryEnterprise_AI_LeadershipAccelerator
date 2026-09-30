import { listRepositories, setRepositoryPathScope } from '../services/caseStudy/caseStudyRepoCollection';
import type { CaseStudyRepositoryRecord } from '../services/caseStudy/caseStudyRepoRecord';

/**
 * Case Study OS — scope an attached repository to the part of it a story is about.
 *
 * WHY THIS EXISTS. The Case Study OS modelled one repository as one project, so a
 * case study about ONE feature inside a monorepo inherited the whole monorepo's
 * age, test count and stack. Path scoping fixes that, and this is the operator
 * surface for setting a scope on a record that already exists — the admin UI
 * carries the same capability, but the first correction has to be made before
 * anyone trusts the UI enough to use it.
 *
 * IDEMPOTENT BY CONSTRUCTION. The scope is state, not an event: running this
 * twice with the same prefixes leaves exactly the same row, and the second run
 * reports `unchanged` rather than pretending it did work. Clearing is a first
 * class operation (`--clear`), because a wrong scope must be undoable.
 *
 * IT DOES NOT RE-SYNC. Setting a scope changes what the NEXT sync will read; it
 * does not itself re-derive any fact, and it deliberately does not trigger a sync
 * — a sync spends GitHub rate limit and rewrites a snapshot, and bundling that
 * into a settings change would make a cheap correction expensive and hard to
 * undo. Re-sync from the admin surface, or with the sync script, once the scope
 * reads correctly here.
 *
 * FAILURE-FIRST (root CLAUDE.md):
 *  1. On failure: nothing partial. The scope is one array on one row, written in
 *     a single statement; a rejected argument fails before any write.
 *  2. Retry: none internally. Re-running is safe and is the retry.
 *  3. Recovery: `--clear` returns the repository to describing all of itself.
 *  4. Handled: unknown case study, unknown/ambiguous repo reference, a scope that
 *     is refused by the service's bounds. NOT handled: the database being
 *     unavailable, which propagates.
 *
 * Usage:
 *   node dist/scripts/scopeCaseStudyRepository.js --case-study <uuid> --list
 *   node dist/scripts/scopeCaseStudyRepository.js --case-study <uuid> \
 *     --repo owner/name --scope backend/src/services/agents/corybrain --dry-run
 *   node dist/scripts/scopeCaseStudyRepository.js --case-study <uuid> \
 *     --repo owner/name --scope a/b --scope c/d --confirm-production
 *   node dist/scripts/scopeCaseStudyRepository.js --case-study <uuid> \
 *     --repo owner/name --clear --confirm-production
 */

interface Args {
  caseStudyId?: string;
  repo?: string;
  scope: string[];
  clear: boolean;
  list: boolean;
  dryRun: boolean;
  confirmProduction: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { scope: [], clear: false, list: false, dryRun: false, confirmProduction: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--confirm-production') out.confirmProduction = true;
    else if (a === '--clear') out.clear = true;
    else if (a === '--list') out.list = true;
    else if (a === '--case-study') { out.caseStudyId = argv[i + 1]; i += 1; }
    else if (a === '--repo') { out.repo = argv[i + 1]; i += 1; }
    else if (a === '--scope') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error('--scope requires a path prefix');
      out.scope.push(value);
      i += 1;
    }
  }
  if (!out.caseStudyId) throw new Error('--case-study <uuid> is required');
  if (out.list) return out;
  if (!out.repo) throw new Error('--repo <owner/name> is required (or pass --list)');
  // `--clear` and `--scope` together is not a typo the script should guess at:
  // one of them is what the operator meant and the other is left over.
  if (out.clear && out.scope.length > 0) {
    throw new Error('--clear and --scope are mutually exclusive; pass one');
  }
  if (!out.clear && out.scope.length === 0) {
    throw new Error('pass at least one --scope <prefix>, or --clear to remove the scope');
  }
  return out;
}

/**
 * Refuses to touch production without an explicit flag (CLAUDE.md: no production
 * writes without an explicit environment check). Reading is always allowed.
 */
function assertSafeTarget(args: Args): void {
  if (args.dryRun || args.list) return;
  const url = process.env.DATABASE_URL ?? '';
  const looksProd = /accelerator_prod|prod/i.test(url) && !/dev|local|test/i.test(url);
  if (looksProd && !args.confirmProduction) {
    throw new Error(
      'Refusing to write to what looks like production without --confirm-production. ' +
        'Re-run with --dry-run to preview, or pass --confirm-production deliberately.',
    );
  }
}

/** `owner/name`, case-insensitively — the same identity rule the collection uses. */
function findRepo(records: readonly CaseStudyRepositoryRecord[], ref: string): CaseStudyRepositoryRecord {
  const want = ref.trim().toLowerCase();
  const matches = records.filter(
    (r) => `${r.repoOwner}/${r.repoName}`.toLowerCase() === want || r.repoName.toLowerCase() === want,
  );
  if (matches.length === 1) return matches[0];
  const attached = records.map((r) => `${r.repoOwner}/${r.repoName}`).join(', ') || '(none)';
  if (matches.length === 0) {
    throw new Error(`no attached repository matches "${ref}". Attached: ${attached}`);
  }
  // A bare name matching two owners must not be resolved by picking the first.
  throw new Error(`"${ref}" matches ${matches.length} attached repositories; use owner/name. Attached: ${attached}`);
}

const describe = (r: CaseStudyRepositoryRecord): Record<string, unknown> => ({
  repository_id: r.id,
  repo: `${r.repoOwner}/${r.repoName}`,
  role: r.role,
  path_scope: r.pathScope ?? [],
});

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  assertSafeTarget(args);
  const started = Date.now();
  const caseStudyId = args.caseStudyId as string;

  const records = await listRepositories({ caseStudyId });

  if (args.list) {
    console.log(JSON.stringify({
      event: 'case_study.repos_listed', service: 'case-study-os', level: 'info',
      outcome: 'success', case_study_id: caseStudyId, duration_ms: Date.now() - started,
      repositories: records.map(describe),
    }, null, 2));
    return;
  }

  const target = findRepo(records, args.repo as string);
  const before = target.pathScope ?? [];
  const after = args.clear ? [] : args.scope;

  // Compared as a set of ordered prefixes AFTER the service's own normalisation
  // would run, so "already scoped" is not reported for a scope that differs only
  // in how it was typed. The service normalises on write; this only decides
  // whether to make the call at all.
  const normalise = (s: readonly string[]): string =>
    JSON.stringify(s.map((p) => p.trim().replace(/^\/+|\/+$/g, '').toLowerCase()).filter(Boolean));
  const unchanged = normalise(before) === normalise(after);

  if (args.dryRun || unchanged) {
    console.log(JSON.stringify({
      event: 'case_study.repo_scope_set', service: 'case-study-os', level: 'info',
      outcome: unchanged ? 'unchanged' : 'success', dry_run: args.dryRun,
      case_study_id: caseStudyId, duration_ms: Date.now() - started,
      before: { ...describe(target) }, would_set: after,
      note: unchanged
        ? 'the stored scope already equals the requested scope; nothing written'
        : 'dry run: nothing written',
    }, null, 2));
    return;
  }

  const updated = await setRepositoryPathScope({
    caseStudyId, repositoryId: target.id, pathScope: after,
  });

  console.log(JSON.stringify({
    event: 'case_study.repo_scope_set', service: 'case-study-os', level: 'info',
    outcome: 'success', case_study_id: caseStudyId, duration_ms: Date.now() - started,
    before: before, after: updated.pathScope ?? [], repository: describe(updated),
    // Said plainly because it is the step an operator forgets: the scope changes
    // what the NEXT sync reads, and nothing in the record has moved yet.
    next: 'no facts have changed yet — re-sync this Case Study for the scope to take effect',
  }, null, 2));
}

/**
 * Close the connection pool so the process can exit. Sequelize keeps pooled
 * sockets open, which keeps Node's event loop alive indefinitely; without this
 * the script completes its work, prints its summary, and then hangs forever.
 */
async function shutdown(): Promise<void> {
  try {
    const { sequelize } = await import('../config/database');
    await sequelize.close();
  } catch {
    // The work is already done and reported; a failed close must not turn a
    // successful run into a failed one.
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(`[scopeCaseStudyRepository] ${err?.message ?? err}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await shutdown();
      process.exit(process.exitCode ?? 0);
    });
}
