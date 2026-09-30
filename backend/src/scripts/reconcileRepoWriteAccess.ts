/**
 * reconcileRepoWriteAccess — ask GitHub what access we actually hold, and record it.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * `platform_can_push` is written at connect time and whenever a write succeeds
 * or is refused. That leaves a third state nothing ever resolves: connections
 * made before the field existed, or that have never been written to since.
 *
 * Measured on production 2026-08-23, across 28 connections carrying a repo:
 *   platform_can_push = false  ->  16
 *   platform_can_push = true   ->   1
 *   never recorded             ->  11
 *
 * Those 11 are the problem this script solves. The Projects badge deliberately
 * shows nothing for them, because "we have never checked" is not the same claim
 * as "we checked and cannot write" — badging an unchecked repo as broken sends a
 * student to fix something that may be perfectly fine. But the consequence is
 * that a genuinely blocked student in that group is invisible to us AND to
 * themselves. Asking GitHub converts every one of them into a real answer.
 *
 * ── READ-ONLY BY DEFAULT ────────────────────────────────────────────────────
 *
 * Prints what it would change and exits. `--apply` is required to write, and the
 * write goes through `recordWriteAccess`, which is idempotent and is the ONLY
 * place either access key is set — deliberately, because the two keys came apart
 * historically when separate writers touched one without the other.
 *
 * Nothing here grants, requests, or accepts anything. It observes and records.
 *
 * Usage:
 *   node dist/scripts/reconcileRepoWriteAccess.js            # dry run
 *   node dist/scripts/reconcileRepoWriteAccess.js --apply
 */
import { fetchRepoFacts } from '../services/sbp/repoConnect/githubRepoClient';
import { recordWriteAccess } from '../services/sbp/repoConnect/repoConnectService';

type Recorded = 'true' | 'false' | 'unrecorded';

interface Row {
  projectId: string;
  owner: string;
  repo: string;
  was: Recorded;
  now: boolean | null;   // null = GitHub could not answer
  note?: string;
}

function recordedOf(connection: any): Recorded {
  const v = connection?.status_json?.connect?.platform_can_push;
  if (v === true) return 'true';
  if (v === false) return 'false';
  return 'unrecorded';
}

export async function reconcile(apply: boolean): Promise<Row[]> {
  const { default: GitHubConnection } = await import('../models/GitHubConnection');
  const connections: any[] = await GitHubConnection.findAll();

  const rows: Row[] = [];
  for (const c of connections) {
    // A connection with no project_id predates the project-keyed model and has
    // nothing to record against; a connection with no repo has nothing to ask
    // about. Both are skipped rather than guessed at.
    if (!c.project_id || !c.repo_owner || !c.repo_name) continue;

    const row: Row = {
      projectId: String(c.project_id),
      owner: c.repo_owner,
      repo: c.repo_name,
      was: recordedOf(c),
      now: null,
    };

    try {
      const facts = await fetchRepoFacts(c.repo_owner, c.repo_name);
      row.now = facts.platform_can_push;
    } catch (err: any) {
      // A repo we cannot read at all is a different problem (renamed, deleted,
      // private without access) and must NOT be recorded as "cannot push" —
      // that would assert a permission fact we did not establish.
      row.note = err?.error_class ?? err?.name ?? 'unreadable';
      rows.push(row);
      continue;
    }

    if (apply && row.now !== null) {
      const changed = await recordWriteAccess(row.projectId, row.now);
      row.note = changed ? 'recorded' : 'already correct';
    }
    rows.push(row);
  }
  return rows;
}

/** PURE. What the operator needs to see, not a dump of every row. */
export function summarise(rows: Row[]): string {
  const unreadable = rows.filter((r) => r.now === null);
  const resolved = rows.filter((r) => r.was === 'unrecorded' && r.now !== null);
  const flipped = rows.filter((r) => r.was !== 'unrecorded' && r.now !== null && String(r.now) !== r.was);
  const canPush = rows.filter((r) => r.now === true);

  const lines = [
    `connections checked: ${rows.length}`,
    `platform CAN push:   ${canPush.length}`,
    `newly resolved:      ${resolved.length}  (were unrecorded)`,
    `  -> can push:       ${resolved.filter((r) => r.now === true).length}`,
    `  -> cannot push:    ${resolved.filter((r) => r.now === false).length}`,
    `changed answer:      ${flipped.length}`,
    `unreadable:          ${unreadable.length}`,
  ];
  for (const r of flipped) lines.push(`  FLIP  ${r.owner}/${r.repo}  ${r.was} -> ${r.now}`);
  for (const r of unreadable) lines.push(`  SKIP  ${r.owner}/${r.repo}  (${r.note})`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const rows = await reconcile(apply);
  console.log(apply ? '=== APPLIED ===' : '=== DRY RUN (pass --apply to write) ===');
  console.log(summarise(rows));
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('reconcileRepoWriteAccess failed:', err?.message ?? err);
    process.exit(1);
  });
}
