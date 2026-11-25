/**
 * voice:retention (VS4.2). Dry run by default: lists the calls past their own retention deadline and
 * changes nothing. Deleting needs both --apply and --confirm DELETE-EXPIRED-CALLS.
 *
 *   npm run voice:retention -- [--limit 200]
 *   npm run voice:retention -- --apply --confirm DELETE-EXPIRED-CALLS [--limit 200]
 *
 * What is deleted, kept and refused: services/voice/retention/retention.ts. Safe to run twice.
 * Exit: 0 ok, 1 a call failed or the run errored, 2 refused (bad arguments).
 */
import { DEFAULT_LIMIT, type RetentionReport } from '../../services/voice/retention/retention';

export const CONFIRM = 'DELETE-EXPIRED-CALLS';
const MAX_LIMIT = 1000;

export type RetentionArgs = { ok: true; apply: boolean; limit: number } | { ok: false; reason: string };

export function parseRetentionArgs(argv: string[]): RetentionArgs {
  const known = new Set(['--apply', '--confirm', '--limit']);
  for (let i = 0; i < argv.length; i++) {
    if (!known.has(argv[i])) return { ok: false, reason: `unknown argument ${argv[i]}` };
    if (argv[i] !== '--apply') i++; // skip this flag's value
  }
  const val = (n: string) => { const i = argv.indexOf(n); return i < 0 ? undefined : argv[i + 1]; };
  const limit = argv.includes('--limit') ? Number(val('--limit')) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return { ok: false, reason: `--limit must be 1 to ${MAX_LIMIT}` };
  const apply = argv.includes('--apply');
  if (apply && val('--confirm') !== CONFIRM) return { ok: false, reason: `--apply needs --confirm ${CONFIRM}` };
  return { ok: true, apply, limit };
}

export const exitCodeFor = (r: RetentionReport): number => (r.failed.length ? 1 : 0);

async function main(): Promise<number> {
  const a = parseRetentionArgs(process.argv.slice(2));
  if (!a.ok) { console.error(a.reason); return 2; }
  const { sequelize } = await import('../../config/database');
  const { runRetention } = await import('../../services/voice/retention/retention');
  try {
    const r = await runRetention(sequelize, a);
    console.log(JSON.stringify({ event: 'voice_retention', outcome: r.failed.length ? 'partial' : 'success', dry_run: !a.apply, ...r }));
    return exitCodeFor(r);
  } finally { await sequelize.close(); }
}

if (require.main === module) {
  main().then((c) => process.exit(c), (e: Error) => { console.error(JSON.stringify({ level: 'error', event: 'voice_retention_failed', error_class: e.name || 'Error' })); process.exit(1); });
}
