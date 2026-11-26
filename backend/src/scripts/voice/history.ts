/**
 * voice:history (VS5.3): previous vendor's call history, metadata only. Everything that writes to the
 * database is a dry run unless --apply is given. It never dials and never changes anything at the vendor.
 *
 *   npm run voice:history -- export <file> --from 2025-01-01 --until 2026-11-25 [--only sf-aaaaaaaa,sf-bbbbbbbb]
 *   npm run voice:history -- import <file> [--apply --retention-days N]    N is the owner's decision
 *   npm run voice:history -- verify <file>
 *   npm run voice:history -- rollback <batch id> [--apply]
 *   npm run voice:history -- purge [--apply]                               rows past their own deadline
 *   npm run voice:history -- find <provider call id>
 *
 * The export file is private: created 0600 and refused inside the repository. Exit: 0 clean, 1 an error,
 * conflict or difference, 2 refused.
 */
import fs from 'fs';
import { insideRepo } from './migrationReport';

export type HistoryArgs = { ok: true; cmd: string; target: string; flags: Record<string, string> } | { ok: false; reason: string };
const SPEC = new Map<string, { target: boolean; flags: string[] }>([
  ['export', { target: true, flags: ['--from', '--until', '--only'] }], ['import', { target: true, flags: ['--apply', '--retention-days'] }], ['verify', { target: true, flags: [] }],
  ['rollback', { target: true, flags: ['--apply'] }], ['purge', { target: false, flags: ['--apply'] }], ['find', { target: true, flags: [] }],
]);

export function parseHistoryArgs(argv: string[]): HistoryArgs {
  const [cmd = '', ...rest] = argv;
  const spec = SPEC.get(cmd);
  if (!spec) return { ok: false, reason: 'usage: voice:history -- export|import|verify|rollback|purge|find' };
  const target = spec.target ? rest.shift() : '';
  if (target === undefined || target.startsWith('--')) return { ok: false, reason: `${cmd} needs a target` };
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const f = rest[i];
    if (!spec.flags.includes(f) || f in flags) return { ok: false, reason: `unexpected argument ${f}` };
    const v = f === '--apply' ? 'yes' : rest[++i];
    if (!v || v.startsWith('--')) return { ok: false, reason: `${f} needs a value` };
    flags[f] = v;
  }
  if (cmd === 'export' && (!flags['--from'] || !flags['--until'])) return { ok: false, reason: 'export needs --from and --until' };
  if (cmd === 'export' && insideRepo(target)) return { ok: false, reason: 'the export must be outside the repository (it is public)' };
  if (flags['--retention-days'] && !/^[1-9]\d{0,3}$/.test(flags['--retention-days'])) return { ok: false, reason: '--retention-days is a number of days' };
  if (cmd === 'import' && flags['--apply'] && !flags['--retention-days']) return { ok: false, reason: 'import --apply needs --retention-days' };
  if (cmd === 'rollback' && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(target)) return { ok: false, reason: 'rollback needs a batch id' };
  return { ok: true, cmd, target, flags };
}

const say = (event: string, o: object): void => console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'voice-studio', event, ...o }));

async function main(): Promise<number> {
  const a = parseHistoryArgs(process.argv.slice(2));
  if (!a.ok) { console.error(a.reason); return 2; }
  if (a.cmd === 'export') {
    const key = process.env.SYNTHFLOW_API_KEY;
    if (!key) { console.error('SYNTHFLOW_API_KEY is not set'); return 2; }
    const { exportHistory } = await import('../../services/voice/migration/historyExport');
    const x = await exportHistory(key, { from: a.flags['--from'], until: a.flags['--until'], keys: a.flags['--only']?.split(',') });
    fs.writeFileSync(a.target, JSON.stringify(x), { mode: 0o600 });
    say('voice_history_export', { outcome: x.errors.length ? 'partial' : 'success', calls: x.calls.length, assistants: x.assistants, errors: x.errors.map(({ callId, ...e }) => ({ ...e, has_call_id: Boolean(callId) })), sha256: x.sha256 });
    return x.errors.length ? 1 : 0;
  }
  const M = await import('../../services/voice/migration/historyImport');
  const { sequelize } = await import('../../config/database');
  const { LEGACY_TENANT_ID: tenantId } = await import('../../services/voice/gateway/legacyFacade');
  const apply = Boolean(a.flags['--apply']);
  const file = () => M.parseExport(fs.readFileSync(a.target, 'utf8'));
  try {
    if (a.cmd === 'import') {
      const r = await M.importHistory(sequelize, file(), { tenantId, apply, retentionDays: Number(a.flags['--retention-days']) || undefined });
      say('voice_history_import', { outcome: r.ok ? 'success' : 'partial', ...r });
      return r.ok ? 0 : 1;
    }
    if (a.cmd === 'verify') {
      const r = await M.verifyHistory(sequelize, file(), tenantId);
      say('voice_history_verify', { outcome: r.ok ? 'success' : 'failure', manifest: r.manifest, imported: r.imported, missing: r.missing.length, unexpected: r.unexpected.length, different: r.different.length, duplicates: r.duplicates.length });
      return r.ok ? 0 : 1;
    }
    if (a.cmd === 'find') {
      const h = await M.findHistory(sequelize, tenantId, a.target);
      say('voice_history_find', { outcome: h ? 'success' : 'failure', found: h });
      return h ? 0 : 1;
    }
    const n = a.cmd === 'rollback' ? await M.rollbackBatch(sequelize, tenantId, a.target, apply) : await M.purgeExpired(sequelize, tenantId, apply);
    say(`voice_history_${a.cmd}`, { outcome: 'success', dry_run: !apply, rows: n });
    return 0;
  } finally { await sequelize.close(); }
}

if (require.main === module) {
  main().then((c) => process.exit(c), (e: Error) => {
    const refused = e.name === 'ValidationError';
    console.error(JSON.stringify({ level: 'error', event: 'voice_history_failed', error_class: e.name || 'Error', ...(refused ? { reason: e.message } : {}) }));
    process.exit(refused ? 2 : 1);
  });
}
