/**
 * restoreGovAiHides: undo the morning sweep's AI hides in bulk, for recovery after a bad AI run. One row can be restored
 * from the board's Hidden list; this is for many at once. TypeScript because the production image ships only dist, and tsc
 * doesn't copy .js files into it.
 *
 * Dry run by default: prints counts and changes nothing. Add --execute to write.
 *
 *   node dist/scripts/restoreGovAiHides.js --since=2026-11-05            (dry run)
 *   node dist/scripts/restoreGovAiHides.js --since=2026-11-05 --execute
 *
 * Only touches rows the sweep hid for reason ai_not_a_fit. Idempotent: a restored row no longer matches, so a second run
 * changes nothing, and the sweep never hides a restored row again.
 */
import { QueryTypes } from 'sequelize';

const AI_REASON = 'ai_not_a_fit';
const SWEEP_ACTOR = 'gov-opp-sweep';

/** The WHERE clause and replacements. Exported so the selector is tested without a database. */
export function buildSelector(since: string | null): { where: string; replacements: Record<string, string> } {
  if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('--since=YYYY-MM-DD is required');
  return {
    where: 'reason = :reason AND dismissed_by = :actor AND restored_at IS NULL AND dismissed_at >= :since',
    replacements: { reason: AI_REASON, actor: SWEEP_ACTOR, since },
  };
}

export function parseArgs(argv: readonly string[]): { since: string | null; execute: boolean } {
  const sinceArg = argv.find((a) => a.startsWith('--since='));
  return { since: sinceArg ? sinceArg.slice('--since='.length) : null, execute: argv.includes('--execute') };
}

async function main(): Promise<void> {
  const { since, execute } = parseArgs(process.argv.slice(2));
  const { where, replacements } = buildSelector(since);
  const { sequelize } = await import('../config/database');
  const countMatching = async (): Promise<number> => {
    const rows = await sequelize.query<{ count: number }>(`SELECT count(*)::int AS count FROM gov_opportunity_dismissals WHERE ${where}`, { replacements, type: QueryTypes.SELECT });
    return rows[0].count;
  };
  try {
    const matched = await countMatching();
    console.log(JSON.stringify({ event: 'restore_gov_ai_hides', mode: execute ? 'execute' : 'dry_run', since, matched }));
    if (!execute || matched === 0) return;
    await sequelize.query(`UPDATE gov_opportunity_dismissals SET restored_at = NOW(), updated_at = NOW() WHERE ${where}`, { replacements });
    const left = await countMatching();
    console.log(JSON.stringify({ event: 'restore_gov_ai_hides', outcome: left === 0 ? 'success' : 'partial', restored: matched - left, remaining: left }));
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  main().catch((err: Error) => {
    console.error(JSON.stringify({ event: 'restore_gov_ai_hides', outcome: 'failure', error_class: err?.constructor?.name, message: err?.message }));
    process.exit(1);
  });
}
