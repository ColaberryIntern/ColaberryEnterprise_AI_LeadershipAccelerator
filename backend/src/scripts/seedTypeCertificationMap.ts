/**
 * seedTypeCertificationMap — write the type→objective mapping into
 * `curriculum_type_definitions.certification_mapping`, and widen
 * `portfolio_eligible` where a type genuinely leaves an artifact.
 *
 * DRY RUN BY DEFAULT. This edits rows that decide what counts toward a
 * student's certification readiness, and a mapping applied by accident is the
 * kind of mistake that shows up as everyone's readiness moving at once. Pass
 * `--apply` to write.
 *
 * It validates before it writes, and refuses the whole run on any problem:
 *   - every objective named must exist in the current blueprint
 *   - every type named must exist and be active
 *   - a type may not be both mapped and listed as unmappable
 *
 * Idempotent: re-running writes the same mapping and reports 0 changes.
 *
 * Usage:
 *   node dist/scripts/seedTypeCertificationMap.js            # dry run
 *   node dist/scripts/seedTypeCertificationMap.js --apply
 */
import { QueryTypes } from 'sequelize';
import { canonicalJson } from '../utils/canonicalHash';
import { sequelize } from '../config/database';
import { getCurrentBlueprint } from '../services/certPrep/certBlueprintService';
import {
  TYPE_CERTIFICATION_MAP,
  UNMAPPABLE_AT_TYPE_LEVEL,
  PORTFOLIO_ELIGIBLE_ADDITIONS,
} from '../data/certBlueprints/typeCertificationMap';

const apply = process.argv.includes('--apply');

/**
 * jsonb does not preserve key order, so the stored value comes back with its
 * keys sorted by Postgres and never string-matches the object built here. The
 * first version of this script compared `JSON.stringify` both sides and
 * reported four pending changes on every run FOREVER, including immediately
 * after a successful apply - four needless UPDATEs bumping `updated_at` and a
 * dry run whose diff could never reach zero.
 *
 * `canonicalJson` is imported rather than reimplemented. This script carried
 * its own copy for exactly one day, which is one day longer than the util's own
 * header warns about: two implementations of one invariant disagree eventually,
 * and `seedCertPrepContent` then hit the SAME bug because it could not use a
 * private helper living in this file.
 */

interface TypeRow { slug: string; certification_mapping: unknown; portfolio_eligible: boolean | null }

async function main(): Promise<void> {
  const [{ db }] = await sequelize.query<{ db: string }>('SELECT current_database() AS db', { type: QueryTypes.SELECT });
  console.log(`database : ${db}`);
  console.log(`mode     : ${apply ? 'APPLY — rows will be written' : 'dry run (pass --apply to write)'}`);
  console.log('');

  const blueprint = await getCurrentBlueprint();
  if (!blueprint) throw new Error('no current blueprint — seed the blueprint first');

  const validObjectives = new Set(
    blueprint.domains.flatMap((d) => (d.objectives ?? []).map((o: { objective_id: string }) => o.objective_id)),
  );

  const rows = await sequelize.query<TypeRow>(
    'SELECT slug, certification_mapping, portfolio_eligible FROM curriculum_type_definitions WHERE is_active',
    { type: QueryTypes.SELECT },
  );
  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  // ── validate everything before writing anything ───────────────────────────
  const problems: string[] = [];

  for (const m of TYPE_CERTIFICATION_MAP) {
    if (!bySlug.has(m.type_slug)) problems.push(`mapped type not found or inactive: ${m.type_slug}`);
    if (!m.rationale?.trim()) problems.push(`${m.type_slug}: a mapping without a rationale is not reviewable`);
    for (const o of m.objective_ids) {
      if (!validObjectives.has(o)) problems.push(`${m.type_slug}: objective ${o} is not in blueprint ${blueprint.track.blueprint_version}`);
    }
  }
  const mapped = new Set(TYPE_CERTIFICATION_MAP.map((m) => m.type_slug));
  for (const u of UNMAPPABLE_AT_TYPE_LEVEL) {
    if (mapped.has(u.type_slug)) problems.push(`${u.type_slug} is both mapped and listed as unmappable`);
  }
  for (const p of PORTFOLIO_ELIGIBLE_ADDITIONS) {
    if (!bySlug.has(p.type_slug)) problems.push(`portfolio addition not found or inactive: ${p.type_slug}`);
  }

  if (problems.length > 0) {
    console.error('REFUSING TO RUN — validation failed:');
    problems.forEach((p) => console.error(`  ${p}`));
    throw new Error(`${problems.length} validation problem(s)`);
  }
  console.log(`validated: ${TYPE_CERTIFICATION_MAP.length} mapping(s) against blueprint ${blueprint.track.blueprint_version}`);
  console.log('');

  // ── the mapping ───────────────────────────────────────────────────────────
  let mappingChanges = 0;
  for (const m of TYPE_CERTIFICATION_MAP) {
    const next = { objective_ids: m.objective_ids, rationale: m.rationale, grain: 'type' };
    const current = bySlug.get(m.type_slug)?.certification_mapping ?? null;
    const same = canonicalJson(current) === canonicalJson(next);
    console.log(`${same ? '  =' : '  →'} ${m.type_slug.padEnd(24)} ${m.objective_ids.join(', ')}`);
    if (!same) {
      mappingChanges += 1;
      if (apply) {
        await sequelize.query(
          'UPDATE curriculum_type_definitions SET certification_mapping = :m, updated_at = NOW() WHERE slug = :slug',
          { replacements: { m: JSON.stringify(next), slug: m.type_slug }, type: QueryTypes.UPDATE },
        );
      }
    }
  }

  // ── portfolio eligibility: VERIFIED HERE, OWNED BY THE REGISTRY ───────────
  //
  // This section used to UPDATE the column, and the update did not survive a
  // backend restart. `typeSeeder.ts` re-asserts the registry defaults on every
  // boot over a fixed column list, and `portfolio_eligible` is on that list
  // while `certification_mapping` is not. So a write here was reverted the next
  // time the container came up, and the seeder would have reported the same
  // pending change forever - the same shape of defect as the jsonb key-order
  // bug, from a different cause.
  //
  // The registry is the source of truth for this column, so eligibility is now
  // declared in `services/timeline/typeRegistry.ts` and this only CHECKS it.
  // A drift line means somebody removed the flag from the registry, which is
  // worth knowing and is not something this script should paper over.
  console.log('');
  let portfolioDrift = 0;
  for (const p of PORTFOLIO_ELIGIBLE_ADDITIONS) {
    const ok = bySlug.get(p.type_slug)?.portfolio_eligible === true;
    console.log(`${ok ? '  =' : '  !'} ${p.type_slug.padEnd(24)} portfolio_eligible${ok ? '' : '  DRIFT: not set - declare it in typeRegistry.ts, not here'}`);
    if (!ok) portfolioDrift += 1;
  }

  console.log('');
  console.log(`mappings   : ${mappingChanges} change(s)${apply ? ' written' : ' pending'}`);
  console.log(`portfolio  : ${portfolioDrift === 0 ? 'in sync with the registry' : `${portfolioDrift} DRIFT - fix typeRegistry.ts`}`);
  console.log(`unmapped   : ${UNMAPPABLE_AT_TYPE_LEVEL.length} evidence-producing type(s) left unmapped on purpose —`);
  UNMAPPABLE_AT_TYPE_LEVEL.forEach((u) => console.log(`             ${u.type_slug}: ${u.reason}`));

  const after = await sequelize.query<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM curriculum_type_definitions WHERE is_active AND certification_mapping IS NOT NULL AND certification_mapping::text NOT IN ('null','{}')",
    { type: QueryTypes.SELECT },
  );
  console.log('');
  console.log(`types carrying a mapping now: ${after[0]?.n ?? '?'} of ${rows.length} active`);
}

// Guarded so a test can import this module without running the seeder.
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => { console.error('FAILED:', err?.message ?? err); process.exit(1); })
    .finally(() => { void sequelize.close().catch(() => undefined); });
}
