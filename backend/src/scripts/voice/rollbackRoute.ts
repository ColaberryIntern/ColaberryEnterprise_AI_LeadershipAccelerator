/**
 * voice:route:rollback (VS4.5): send every NEW call on one path back to legacy. Dry run by default.
 *
 *   npm run voice:route:rollback -- --path agent-tool --actor <your admin id>            report
 *   npm run voice:route:rollback -- --path agent-tool --actor <your admin id> --apply
 *
 * Active calls finish where they are. Takes effect on the next call (nothing is cached). Safe to repeat.
 * Exit: 0 ok (changed, already legacy, or dry run), 1 error, 2 refused or no such route.
 */
export type RollbackArgs = { ok: true; path: string; actor: string; apply: boolean } | { ok: false; reason: string };

export function parseRollbackArgs(argv: string[]): RollbackArgs {
  const val = (n: string) => { const i = argv.indexOf(n); return i < 0 ? undefined : argv[i + 1]; };
  const path = val('--path');
  const actor = val('--actor');
  if (!path || !/^[a-z0-9][a-z0-9-]{1,99}$/.test(path)) return { ok: false, reason: '--path <path key> is required' };
  if (!actor || !/^[A-Za-z0-9._:-]{3,100}$/.test(actor)) return { ok: false, reason: '--actor <admin id> is required' };
  return { ok: true, path, actor, apply: argv.includes('--apply') };
}

async function main(): Promise<number> {
  const a = parseRollbackArgs(process.argv.slice(2));
  if (!a.ok) { console.error(a.reason); return 2; }
  const { sequelize } = await import('../../config/database');
  const { rollbackRoute } = await import('../../services/voice/rollout/rolloutStore');
  const { LEGACY_TENANT_ID } = await import('../../services/voice/gateway/legacyFacade');
  try {
    const r = await rollbackRoute(sequelize, LEGACY_TENANT_ID, a.path, a.actor, !a.apply);
    console.log(JSON.stringify({ event: 'voice_route_rollback', outcome: r.from ? 'success' : 'skipped', dry_run: !a.apply, path: a.path, ...r }));
    return r.from ? 0 : 2;
  } finally { await sequelize.close(); }
}

if (require.main === module) {
  main().then((c) => process.exit(c), (e: Error) => { console.error(JSON.stringify({ level: 'error', event: 'voice_route_rollback_failed', error_class: e.name || 'Error' })); process.exit(1); });
}
