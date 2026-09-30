/**
 * certPrepDevProof — the first real execution of the Cert Prep schema and seed.
 *
 * Everything in the Cert Prep build so far has been unit-tested with
 * `sequelize.query` mocked, which is this repo's convention and the right choice
 * for unit tests — but it means the DDL has never met a real Postgres. This
 * script is what turns "the tests pass" into "the SQL runs".
 *
 * SAFETY. It refuses to run against anything whose database name is not on the
 * allow-list below. The local Docker server hosts a database literally named
 * `accelerator_prod` holding real enrollments, and the "dev" backend is pointed
 * at it — so a guard that trusts NODE_ENV or a hostname would not protect
 * anything. The check is on the database NAME, read from the live connection
 * rather than from the env var we think we passed.
 *
 * Run:
 *   DATABASE_URL=postgres://accelerator:PASS@localhost:5432/accelerator_cert_dev \
 *     npx ts-node src/scripts/certPrepDevProof.ts
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { ensureCertPrepSchema } from '../db/ensureCertPrepSchema';
import { seedBlueprint, getCurrentBlueprint } from '../services/certPrep/certBlueprintService';
import { CCAR_FOUNDATIONS_BLUEPRINT } from '../data/certBlueprints/ccarFoundations';

/** Only these database names may be touched. Anything else aborts. */
const ALLOWED_DATABASES = ['accelerator_cert_dev', 'accelerator_test', 'accelerator_scratch'];

async function assertSafeDatabase(): Promise<string> {
  const rows = await sequelize.query<{ db: string }>(
    'SELECT current_database() AS db', { type: QueryTypes.SELECT },
  );
  const db = String(rows[0]?.db ?? '');
  if (!ALLOWED_DATABASES.includes(db)) {
    throw new Error(
      `REFUSING TO RUN against database "${db}". This script only touches ${ALLOWED_DATABASES.join(', ')}. ` +
      'The local server hosts a database named accelerator_prod with real enrollments — the guard is on the ' +
      'database name read from the live connection, not on an env var or a hostname.',
    );
  }
  return db;
}

async function main(): Promise<void> {
  const db = await assertSafeDatabase();
  console.log(`\n[proof] connected to "${db}" — on the allow-list, proceeding\n`);

  // ── 1. the schema, for the first time ever ────────────────────────────────
  console.log('[proof] 1. running ensureCertPrepSchema…');
  await ensureCertPrepSchema();

  // QueryTypes.SELECT returns rows directly; destructuring the [results,
  // metadata] tuple for a SELECT silently yields metadata instead — which is
  // how the first run of this script reported "1 table: undefined".
  const tableRows = await sequelize.query<{ table_name: string }>(
    `SELECT table_name::text AS table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'cert\\_%'
      ORDER BY table_name`,
    { type: QueryTypes.SELECT },
  );
  const tables = tableRows.map((r) => r.table_name);
  console.log(`[proof]    tables created: ${tables.length}`);
  tables.forEach((t) => console.log(`[proof]      - ${t}`));

  const expected = [
    'cert_domains', 'cert_evidence_mappings', 'cert_question_revisions',
    'cert_questions', 'cert_readiness_snapshots', 'cert_responses',
    'cert_sessions', 'cert_tracks',
  ];
  const missing = expected.filter((t) => !tables.includes(t));
  if (missing.length > 0) throw new Error(`missing tables: ${missing.join(', ')}`);

  // Indexes are where a silent DDL failure would hide: the try/catch in
  // ensureCertPrepSchema swallows a bad statement, so counting them is the only
  // way to know every one actually landed.
  const idxRows = await sequelize.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'idx_cert%' ORDER BY indexname`,
    { type: QueryTypes.SELECT },
  );
  console.log(`[proof]    cert indexes: ${idxRows.length}`);

  // ── 2. idempotency: a second run must be a no-op ──────────────────────────
  console.log('\n[proof] 2. re-running the schema (must be a clean no-op)…');
  await ensureCertPrepSchema();
  const tableRows2 = await sequelize.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema='public' AND table_name LIKE 'cert\\_%'`,
    { type: QueryTypes.SELECT },
  );
  const n2 = Number(tableRows2[0].n);
  if (n2 !== tables.length) throw new Error(`re-run changed table count: ${tables.length} -> ${n2}`);
  console.log(`[proof]    still ${n2} tables — idempotent`);

  // ── 3. seed the official blueprint ────────────────────────────────────────
  console.log('\n[proof] 3. seeding the official CCAR-F blueprint…');
  const seeded = await seedBlueprint(CCAR_FOUNDATIONS_BLUEPRINT);
  console.log(`[proof]    ${JSON.stringify(seeded)}`);

  console.log('[proof] 3b. re-seeding (must update, not duplicate)…');
  const reseeded = await seedBlueprint(CCAR_FOUNDATIONS_BLUEPRINT);
  if (reseeded.track_created || reseeded.domains_created > 0) {
    throw new Error(`re-seed was not idempotent: ${JSON.stringify(reseeded)}`);
  }
  console.log(`[proof]    ${JSON.stringify(reseeded)} — idempotent`);

  // ── 4. read it back through the real service ──────────────────────────────
  console.log('\n[proof] 4. reading the blueprint back…');
  const blueprint = await getCurrentBlueprint();
  if (!blueprint) throw new Error('getCurrentBlueprint returned null after seeding');

  console.log(`[proof]    track: ${blueprint.track.display_name}`);
  console.log(`[proof]    source: ${blueprint.track.blueprint_source} (must be "official")`);
  console.log(`[proof]    exam: ${blueprint.track.exam_item_count} items / ${blueprint.track.exam_duration_minutes} min / pass ${blueprint.track.passing_scaled_score}`);
  console.log(`[proof]    availability_start_week: ${blueprint.track.availability_start_week}`);
  console.log('[proof]    domains:');
  let weightTotal = 0;
  for (const d of blueprint.domains) {
    const w = Number(d.weight_pct);
    weightTotal += w;
    console.log(`[proof]      ${d.domain_id}  ${String(w).padStart(2)}%  ${d.label}  (${d.objectives.length} objectives)`);
  }
  console.log(`[proof]    weight total: ${weightTotal}% (must be 100)`);
  if (weightTotal !== 100) throw new Error(`weights total ${weightTotal}, expected 100`);

  const objectiveTotal = blueprint.domains.reduce((s, d) => s + d.objectives.length, 0);
  console.log(`[proof]    objectives: ${objectiveTotal} (must be 30)`);
  if (objectiveTotal !== 30) throw new Error(`expected 30 objectives, got ${objectiveTotal}`);

  // The numbering trap, verified against the DATABASE rather than the constant.
  const d2 = blueprint.domains.find((d) => d.domain_id === 'D2')!;
  const d3 = blueprint.domains.find((d) => d.domain_id === 'D3')!;
  if (d2.label !== 'Tool Design & MCP Integration' || Number(d2.weight_pct) !== 18) {
    throw new Error(`D2 is wrong in the database: ${d2.label} ${d2.weight_pct}`);
  }
  if (Number(d2.weight_pct) >= Number(d3.weight_pct)) {
    throw new Error('D2 should carry LESS weight than D3 — the community numbering trap');
  }
  console.log('[proof]    D2 (18%) < D3 (20%) — official numbering intact in the DB');

  console.log('\n[proof] ALL CHECKS PASSED\n');
}

main()
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(`\n[proof] FAILED: ${err.message}\n`);
    await sequelize.close().catch(() => undefined);
    process.exit(1);
  });
