/**
 * voice:reconcile (VS4.5). Dry run by default.
 *
 *   npm run voice:reconcile                                  report only
 *   npm run voice:reconcile -- --apply                       settle what the carrier can answer for
 *   npm run voice:reconcile -- --history manifest.json imported.json
 *
 * Rules: services/voice/rollout/reconcile.ts. It never dials. Exit: 0 nothing unreconciled, 1 something is
 * (or an audience breach, or a history difference), 2 refused.
 */
import fs from 'fs';
import { compareHistory, type HistoryRow, type ReconcileReport } from '../../services/voice/rollout/reconcile';

export type ReconcileArgs = { ok: true; mode: 'calls'; apply: boolean } | { ok: true; mode: 'history'; manifest: string; imported: string } | { ok: false; reason: string };

export function parseReconcileArgs(argv: string[]): ReconcileArgs {
  if (argv[0] === '--history') return argv.length === 3 ? { ok: true, mode: 'history', manifest: argv[1], imported: argv[2] } : { ok: false, reason: 'usage: --history <manifest.json> <imported.json>' };
  if (argv.some((a) => a !== '--apply' && a !== '--dry-run')) return { ok: false, reason: `unknown argument ${argv.find((a) => a !== '--apply' && a !== '--dry-run')}` };
  if (argv.includes('--apply') && argv.includes('--dry-run')) return { ok: false, reason: '--apply and --dry-run cannot be combined' };
  return { ok: true, mode: 'calls', apply: argv.includes('--apply') };
}

export const exitFor = (r: Pick<ReconcileReport, 'unreconciled' | 'ambiguousReservations' | 'strandedClaims' | 'canaryOutsideAudience' | 'failed'>): number =>
  (r.unreconciled || r.ambiguousReservations || r.strandedClaims || r.canaryOutsideAudience.length || r.failed.length ? 1 : 0);

async function main(): Promise<number> {
  const a = parseReconcileArgs(process.argv.slice(2));
  if (!a.ok) { console.error(a.reason); return 2; }
  if (a.mode === 'history') {
    const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8')) as HistoryRow[];
    const r = compareHistory(read(a.manifest), read(a.imported));
    console.log(JSON.stringify({ event: 'voice_reconcile_history', outcome: r.ok ? 'success' : 'failure', ...r }));
    return r.ok ? 0 : 1;
  }
  const { sequelize } = await import('../../config/database');
  const { runReconcile } = await import('../../services/voice/rollout/reconcile');
  const store = await import('../../services/voice/twilio/voiceCallStore');
  const { carrierStatus } = await import('../../services/voice/gateway/directEngineProvider');
  try {
    const r = await runReconcile(sequelize, { carrierStatus, append: store.appendCallEvents, recompute: store.recomputeCall }, { apply: a.apply });
    console.log(JSON.stringify({ event: 'voice_reconcile', outcome: exitFor(r) ? 'partial' : 'success', dry_run: !a.apply, ...r, unresolved: r.unresolved.map(({ provider_call_id: sid, ...c }) => ({ ...c, has_call_sid: Boolean(sid) })) }));
    return exitFor(r);
  } finally { await sequelize.close(); }
}

if (require.main === module) {
  main().then((c) => process.exit(c), (e: Error) => { console.error(JSON.stringify({ level: 'error', event: 'voice_reconcile_failed', error_class: e.name || 'Error' })); process.exit(1); });
}
