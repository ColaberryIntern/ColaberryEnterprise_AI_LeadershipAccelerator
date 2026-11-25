/**
 * voice:rollback:drill (VS4.5): rehearse a route rollback and write docs/voice-studio/ROLLBACK_DRILL.md.
 *
 * Local only: refuses unless DATABASE_URL is on 127.0.0.1 or localhost AND the database is named voice_drill.
 * Nothing dials: providers are counters. The rollback is the REAL operator command, run as its own process.
 * A caller asks for a provider every 50 ms throughout, and one call is live when the rollback runs.
 *
 *   DATABASE_URL=postgres://user@127.0.0.1:5432/voice_drill npm run voice:rollback:drill
 *
 * Exit: 0 every check passed, 1 a check failed, 2 refused.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { subjectRefFrom } from '../../services/identity/identifierPrecedence';

export function drillAllowed(url: string | undefined): boolean {
  try {
    const u = new URL(url ?? '');
    return ['127.0.0.1', 'localhost'].includes(u.hostname) && u.pathname === '/voice_drill';
  } catch {
    return false; // not a URL: refuse
  }
}

export const LIMIT_SECONDS = 60;
const PATH = 'drill-route';

async function main(): Promise<number> {
  if (!drillAllowed(process.env.DATABASE_URL)) { console.error('refused: DATABASE_URL must be a local database named voice_drill'); return 2; }
  const { sequelize } = await import('../../config/database');
  const { ensureVoiceStudioSchema } = await import('../../db/ensureVoiceStudioSchema');
  const { allocateCall } = await import('../../services/voice/rollout/rolloutStore');
  const { LEGACY_TENANT_ID: T } = await import('../../services/voice/gateway/legacyFacade');
  await ensureVoiceStudioSchema();
  await sequelize.query('CREATE TABLE IF NOT EXISTS audit_logs (id UUID PRIMARY KEY, admin_user_id UUID, action VARCHAR(50), entity_type VARCHAR(100), entity_id UUID, old_values JSONB, new_values JSONB, created_at TIMESTAMPTZ)');
  await sequelize.query(`DELETE FROM voice_calls WHERE tenant_id = '${T}'; DELETE FROM voice_allocations WHERE tenant_id = '${T}'; DELETE FROM voice_routes WHERE tenant_id = '${T}'; DELETE FROM voice_agent_versions WHERE tenant_id = '${T}'; DELETE FROM voice_agent_profiles WHERE tenant_id = '${T}'; DELETE FROM audit_logs`);
  const one = async (sql: string) => ((await sequelize.query(sql)) as [Array<{ id: string }>, unknown])[0][0].id;
  const p = await one(`INSERT INTO voice_agent_profiles (tenant_id, brand_slug, agent_key, name, direction, status) VALUES ('${T}', 'colaberry', 'edu-cory-outbound', 'drill', 'outbound', 'active') RETURNING id`);
  const v = await one(`INSERT INTO voice_agent_versions (tenant_id, profile_id, version, content_hash, prompt, disclosure, engine, author, status) VALUES ('${T}', '${p}', 1, 'drill', 'p', 'd', 'conversation_relay', 'drill', 'published') RETURNING id`);
  const r = await one(`INSERT INTO voice_routes (tenant_id, brand_slug, path_key, call_type, profile_id, version_id, engine, mode) VALUES ('${T}', 'colaberry', '${PATH}', 'callback', '${p}', '${v}', 'conversation_relay', 'live') RETURNING id`);
  const live = await one(`INSERT INTO voice_calls (tenant_id, route_id, engine, idempotency_key, recipient_ref, purpose, state) VALUES ('${T}', '${r}', 'conversation_relay', 'drill-live', 'lead:0', 'drill', 'session_active') RETURNING id`);

  const calls: Array<{ at: number; provider: string }> = [];
  let n = 0;
  const quiet = console.log;
  console.log = () => undefined; // the allocator logs each decision; the drill reports totals
  const timer = setInterval(() => {
    const at = Date.now();
    const k = ++n;
    allocateCall(sequelize, { tenantId: T, pathKey: PATH, brandSlug: 'colaberry', recipientRef: subjectRefFrom({ leadId: k }) as string, idempotencyKey: `drill-${k}`, testMode: false }, true)
      .then((a) => { calls.push({ at, provider: a.provider }); }, () => { calls.push({ at, provider: 'error' }); });
  }, 50);
  const wait = (ms: number) => new Promise((res) => { setTimeout(res, ms); });
  await wait(2_000);
  const startedAt = new Date();
  const code = await new Promise<number>((res) => {
    const c = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', path.join(__dirname, 'rollbackRoute.ts'), '--path', PATH, '--actor', 'rollback-drill', '--apply'], { env: process.env, stdio: 'ignore', cwd: path.resolve(__dirname, '../../..') });
    c.on('exit', (x) => res(x ?? 1));
  });
  const commandDone = new Date();
  await wait(2_000);
  clearInterval(timer);
  await wait(500);
  console.log = quiet;

  const firstLegacy = calls.filter((c) => c.provider === 'synthflow_legacy').sort((a, b) => a.at - b.at)[0];
  const after = calls.filter((c) => c.at > commandDone.getTime());
  const [[liveRow]] = (await sequelize.query(`SELECT state, engine FROM voice_calls WHERE id = '${live}'`)) as [Array<{ state: string; engine: string }>, unknown];
  const [[audit]] = (await sequelize.query("SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = 'voice_route_rollback'")) as [Array<{ n: number }>, unknown];
  const seconds = firstLegacy ? (firstLegacy.at - startedAt.getTime()) / 1000 : null;
  const checks: Array<[string, boolean, string]> = [
    ['The operator command succeeded', code === 0, `exit ${code}`],
    [`New calls reach synthflow_legacy within ${LIMIT_SECONDS} s of the command`, seconds !== null && seconds <= LIMIT_SECONDS, `${seconds?.toFixed(2) ?? 'never'} s`],
    ['Every call after the command finished is legacy', after.length > 0 && after.every((c) => c.provider === 'synthflow_legacy'), `${after.filter((c) => c.provider === 'synthflow_legacy').length} of ${after.length}`],
    ['Calls were going to the direct engine before', calls.filter((c) => c.at < startedAt.getTime()).every((c) => c.provider === 'direct') && calls.some((c) => c.provider === 'direct'), `${calls.filter((c) => c.at < startedAt.getTime()).length} calls`],
    ['No call was refused, lost or errored', calls.length === n && calls.every((c) => ['direct', 'synthflow_legacy'].includes(c.provider)), `${calls.length} of ${n}`],
    ['The live call was left alone', liveRow.state === 'session_active' && liveRow.engine === 'conversation_relay', liveRow.state],
    ['The rollback was audited once', audit.n === 1, `${audit.n}`],
  ];
  const passed = checks.every((c) => c[1]);
  const doc = `# Voice AI Studio: Rollback drill

Rehearsed on a local throwaway Postgres with mock providers (no phone, no network, no customer data). The rollback is the operator command run as its own process while a caller asks for a provider every 50 ms and one call is live. The plan named the local docker-compose stack; Docker is not available on the build machine, so a local Postgres 16 was used instead. Not rehearsed on production.

- Started: ${startedAt.toISOString()}
- Command finished: ${commandDone.toISOString()}
- First new call on synthflow_legacy: ${firstLegacy ? new Date(firstLegacy.at).toISOString() : 'never'} (${seconds?.toFixed(2) ?? 'never'} s after the start)
- Result: ${passed ? 'PASS' : 'FAIL'}

| Check | Result | Measured |
|---|---|---|
${checks.map(([a, b, c]) => `| ${a} | ${b ? 'PASS' : 'FAIL'} | ${c} |`).join('\n')}

Command: \`npm run voice:route:rollback -- --path <path key> --actor <admin id> --apply\`. Repeat the drill: \`npm run voice:rollback:drill\`.
`;
  fs.writeFileSync(path.resolve(__dirname, '../../../../docs/voice-studio/ROLLBACK_DRILL.md'), doc);
  console.log(doc);
  await sequelize.close();
  return passed ? 0 : 1;
}

if (require.main === module) {
  main().then((c) => process.exit(c), (e: Error) => { console.error(JSON.stringify({ level: 'error', event: 'voice_rollback_drill_failed', error_class: e.name || 'Error', message: e.message })); process.exit(1); });
}
