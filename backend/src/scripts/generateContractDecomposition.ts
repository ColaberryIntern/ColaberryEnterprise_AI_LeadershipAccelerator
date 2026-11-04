/**
 * Run the factory decomposition for ONE delivery project, from inside the container.
 *
 * ## Why this script exists
 *
 * `generateDecomposition` has exactly one caller: `POST /api/admin/factory/contract/:id/generate`,
 * behind `requireSection('program')`. Reaching that over HTTP needs an admin session, and minting
 * one is not a thing to do from here. Running committed code inside the container is the
 * sanctioned route — see `readAgentFactoryLadder.ts` for the same reasoning.
 *
 *   docker exec -w /app -e DELIVERY_PROJECT_ID=<uuid> \
 *     accelerator-backend node dist/scripts/generateContractDecomposition.js
 *
 * ## It is PREFLIGHT by default and will not write without being told twice
 *
 * This is a production write against a real client bid, and it calls a model. So the default run
 * only REPORTS whether generation would be permitted and what it would act on. `EXECUTE=1` is
 * required to actually run it.
 *
 * ## The guard the underlying service does not have
 *
 * `generateDecomposition` **upserts over `solution_build` version 1** keyed on a deterministic id.
 * If a decomposition already exists it is overwritten in place, with no diff and no backup. That
 * is reasonable inside a reviewed admin action and dangerous from a shell, so this refuses when a
 * document already exists unless `OVERWRITE=1` is also set. Losing a decomposition means losing
 * the human/AI allocation somebody authored.
 *
 * A rejected run persists NOTHING — the service surfaces gate issues instead, which is the useful
 * output and is printed in full here.
 *
 * ## Env
 *
 *   DELIVERY_PROJECT_ID  required, the delivery_projects uuid.
 *   EXECUTE=1            actually generate. Without it, preflight only.
 *   OVERWRITE=1          permit replacing an existing solution_build v1 document.
 */
import { sequelize } from '../config/database';

const TRACK = 'solution_build';

interface Preflight {
  readonly projectName: string | null;
  readonly requirements: number;
  readonly tracks: number;
  readonly existingDocs: number;
  readonly flagOn: boolean;
  readonly authorization: {
    readonly approver: string;
    readonly scope: string;
    readonly resourceLimit: string;
    readonly revoked: boolean;
  } | null;
}

async function preflight(deliveryProjectId: string): Promise<Preflight> {
  const one = async (sql: string): Promise<any> => {
    const [rows] = await sequelize.query(sql, { replacements: { id: deliveryProjectId } });
    return (rows as any[])[0] ?? {};
  };

  const proj = await one('select name from delivery_projects where id = :id');
  const reqs = await one('select count(*)::int as n from contract_requirements where delivery_project_id = :id');
  const trks = await one('select count(*)::int as n from contract_tracks where delivery_project_id = :id');
  const docs = await one(
    `select count(*)::int as n from contract_process_documents
     where delivery_project_id = :id and track_type = '${TRACK}'`,
  );
  const auth = await one(
    `select approver_identity_id, scope, resource_limit, revoked_at
     from build_authorizations where delivery_project_id = :id
     order by created_at desc limit 1`,
  );

  const { FLAGS } = await import('../config/featureFlags');
  return {
    projectName: proj.name ?? null,
    requirements: reqs.n ?? 0,
    tracks: trks.n ?? 0,
    existingDocs: docs.n ?? 0,
    flagOn: Boolean((FLAGS as any).factoryGeneration),
    authorization: auth.approver_identity_id
      ? {
        approver: String(auth.approver_identity_id),
        scope: String(auth.scope),
        resourceLimit: String(auth.resource_limit),
        revoked: auth.revoked_at !== null && auth.revoked_at !== undefined,
      }
      : null,
  };
}

/** Every reason this run must not proceed, all of them, never just the first. */
export function blockers(p: Preflight, overwrite: boolean): string[] {
  const out: string[] = [];
  if (p.projectName === null) out.push('no such delivery project');
  if (p.requirements === 0) out.push('the project has no requirements to decompose');
  if (!p.flagOn) out.push('ENABLE_FACTORY_GENERATION is off; the engine would refuse without a model call');
  if (!p.authorization) {
    out.push('NO build_authorizations row: a named approver must authorize this build first');
  } else {
    if (p.authorization.revoked) out.push('the build authorization is REVOKED');
    if (p.authorization.scope !== TRACK) {
      out.push(`the authorization scope is "${p.authorization.scope}", not "${TRACK}"`);
    }
  }
  if (p.existingDocs > 0 && !overwrite) {
    out.push(
      `a ${TRACK} document already exists and generation UPSERTS OVER VERSION 1. `
      + 'Re-run with OVERWRITE=1 only if losing the existing allocation is intended.',
    );
  }
  return out;
}

export function renderPreflight(id: string, p: Preflight, blocked: readonly string[]): string {
  const a = p.authorization;
  return [
    `delivery project : ${id}`,
    `name             : ${p.projectName ?? '(not found)'}`,
    `requirements     : ${p.requirements}`,
    `tracks           : ${p.tracks}`,
    `existing ${TRACK} docs : ${p.existingDocs}`,
    `ENABLE_FACTORY_GENERATION : ${p.flagOn}`,
    a
      ? `build authorization : ${a.approver} scope=${a.scope} limit=${a.resourceLimit} `
        + `${a.revoked ? 'REVOKED' : 'live'}`
      : 'build authorization : NONE',
    '',
    blocked.length === 0
      ? 'PREFLIGHT CLEAN. Re-run with EXECUTE=1 to generate.'
      : `BLOCKED (${blocked.length}):\n` + blocked.map((b) => `  - ${b}`).join('\n'),
  ].join('\n');
}

export async function main(): Promise<void> {
  const id = process.env.DELIVERY_PROJECT_ID;
  if (!id) throw new Error('set DELIVERY_PROJECT_ID=<delivery_projects uuid>');
  const overwrite = process.env.OVERWRITE === '1';

  const p = await preflight(id);
  const blocked = blockers(p, overwrite);
  console.log(renderPreflight(id, p, blocked));

  if (blocked.length > 0) { process.exitCode = 1; return; }
  if (process.env.EXECUTE !== '1') return;

  console.log('\nEXECUTE=1 — generating. A rejected run writes nothing.');
  const { generateDecomposition } = await import('../services/factory/factoryDecomposeRun');
  const out = await generateDecomposition(id);

  if (out.status === 'generated') {
    console.log('GENERATED. A solution_build v1 draft now exists.');
    return;
  }
  if (out.status === 'disabled') {
    console.log('DISABLED: the engine refused without a model call.');
    process.exitCode = 1;
    return;
  }
  // The gate issues ARE the output worth having: they say what the model produced that the
  // contract would not accept.
  console.log(`REJECTED with ${out.errorCount} issue(s); nothing was written.`);
  for (const i of out.issues) console.log(`  [${i.severity}] ${i.code}: ${i.message}`);
  process.exitCode = 1;
}

/* istanbul ignore next -- entry point only; the tests drive blockers/renderPreflight. */
if (require.main === module) {
  main()
    .then(async () => { await sequelize.close(); })
    .catch(async (err) => {
      console.error(`generateContractDecomposition failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
      try { await sequelize.close(); } catch { /* closing is best-effort on the error path */ }
    });
}
