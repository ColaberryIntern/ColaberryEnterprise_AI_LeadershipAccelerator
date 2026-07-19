/**
 * Idempotent updater: deepen the 13 canonical week Blueprints (weeks 0–12) in
 * `curriculum_blueprints` with the rich, week-specific content authored in
 * data/weekBlueprints.ts.
 *
 * Why: the Blueprint is the source of truth every curriculum generator reads
 * (services/timeline/blueprintContext.ts → the "WEEK CONTEXT" prompt block).
 * The prod rows were authored thin in the Composer UI; this makes them rich so
 * downstream generation is authentic and week-specific. It does NOT regenerate
 * any already-published cards — it only improves the fuel for the next
 * Regenerate / "Design for Course/Week".
 *
 * Safety:
 *  - Targets exactly the row the runtime reads: findOne (program_id, week) ordered
 *    by updated_at DESC — the same selector as getBlueprintContext.
 *  - Updates ONLY the whitelisted content fields (subset of blueprintService
 *    CREATE_FIELDS). Never touches title, status, generated_plan, dna, scores,
 *    published_card_ids, xp, or program/cohort/week keys.
 *  - Backs up the current rows to a timestamped JSON file (and stdout) first.
 *  - Skips (with a warning) any week whose row is missing; aborts if the program
 *    has zero matching rows (guards against pointing at the wrong program_id).
 *  - Never creates or duplicates rows.
 *  - NOT wired into boot — run manually, so it never silently overwrites later
 *    UI edits.
 *
 * Env:
 *   WEEK_BLUEPRINT_PROGRAM_ID   override the target program (default: canonical)
 *   WEEK_BLUEPRINT_DRY_RUN=true report before/after without writing
 *
 * Run:  cd backend && npx ts-node src/seeds/seedWeekBlueprints.ts
 * Dry:  WEEK_BLUEPRINT_DRY_RUN=true npx ts-node src/seeds/seedWeekBlueprints.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { connectDatabase, sequelize } from '../config/database';
import '../models';
import CurriculumBlueprint from '../models/CurriculumBlueprint';
import { WEEK_BLUEPRINTS, CANONICAL_PROGRAM_ID, WeekBlueprintContent } from '../data/weekBlueprints';

// The content fields we write — a subset of blueprintService.CREATE_FIELDS.
// NOTE: estimated_hours is intentionally NOT written here — it is now a live
// rollup of the week's card minutes (services/composer/blueprintRollup.ts).
const WRITE_FIELDS = [
  'purpose', 'difficulty',
  'learning_objectives', 'competencies', 'architect_domains',
  'student_outcomes', 'success_criteria',
  'evidence_produced', 'github_deliverables', 'portfolio_deliverables',
  'bloom', 'risk_areas', 'certification_mapping', 'instructor_notes',
] as const;

/** Build the update patch for a row from the authored content (write-fields only). */
function toPatch(c: WeekBlueprintContent): Record<string, unknown> {
  return {
    purpose: c.purpose,
    difficulty: c.difficulty,
    learning_objectives: c.learning_objectives,
    competencies: c.competencies,
    architect_domains: c.architect_domains,
    student_outcomes: c.student_outcomes,
    success_criteria: c.success_criteria,
    evidence_produced: c.evidence_produced,
    github_deliverables: c.github_deliverables,
    portfolio_deliverables: c.portfolio_deliverables,
    bloom: c.bloom,
    risk_areas: c.risk_areas,
    certification_mapping: c.certification_mapping,
    instructor_notes: c.instructor_notes,
  };
}

const len = (v: any): number => (Array.isArray(v) ? v.length : 0);

/** Compact one-line metric of a row's depth, for the before/after table. */
function depthLine(week: number, title: string, row: any): string {
  const purposeLen = (row?.purpose ?? '').length;
  return (
    `  wk${String(week).padStart(2, ' ')} | ${String(title).slice(0, 34).padEnd(34)} | ` +
    `purpose ${String(purposeLen).padStart(4)}c | obj ${len(row?.learning_objectives)} | ` +
    `comp ${len(row?.competencies)} | dom ${len(row?.architect_domains)} | ` +
    `succ ${len(row?.success_criteria)} | outc ${len(row?.student_outcomes)} | ` +
    `hrs ${row?.estimated_hours ?? '—'}`
  );
}

export interface SeedResult {
  programId: string;
  dryRun: boolean;
  updated: number[];
  missing: number[];
  backupPath: string | null;
}

export async function seedWeekBlueprints(opts?: {
  programId?: string;
  dryRun?: boolean;
}): Promise<SeedResult> {
  const programId = opts?.programId || process.env.WEEK_BLUEPRINT_PROGRAM_ID || CANONICAL_PROGRAM_ID;
  const dryRun = opts?.dryRun ?? process.env.WEEK_BLUEPRINT_DRY_RUN === 'true';

  console.log(`[week-blueprints] program_id=${programId} dryRun=${dryRun}`);

  // Load the current row per week (the exact row the runtime reads).
  const rows = new Map<number, CurriculumBlueprint>();
  const missing: number[] = [];
  for (const c of WEEK_BLUEPRINTS) {
    const row = await CurriculumBlueprint.findOne({
      where: { program_id: programId, week: c.week },
      order: [['updated_at', 'DESC']],
    });
    if (row) rows.set(c.week, row);
    else missing.push(c.week);
  }

  // Guard: zero matches almost certainly means the wrong program_id.
  if (rows.size === 0) {
    throw new Error(
      `[week-blueprints] ABORT — no curriculum_blueprints rows found for program_id=${programId} across weeks 0-12. ` +
        `Wrong program? (canonical is ${CANONICAL_PROGRAM_ID}).`,
    );
  }
  if (missing.length) {
    console.warn(`[week-blueprints] WARNING — no row for weeks [${missing.join(', ')}] under this program; they will be skipped (never created).`);
  }

  // Backup the current rows (full toJSON) before any write.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = Array.from(rows.values()).map((r) => r.toJSON());
  let backupPath: string | null = null;
  try {
    backupPath = path.join(os.tmpdir(), `week_blueprints_backup_${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ programId, stamp, rows: backup }, null, 2), 'utf8');
    console.log(`[week-blueprints] backup written: ${backupPath} (${backup.length} rows)`);
  } catch (e: any) {
    console.warn(`[week-blueprints] could not write backup file (${e.message}); full backup follows on stdout.`);
  }
  console.log('[week-blueprints] ---- BACKUP JSON (copy to restore if needed) ----');
  console.log(JSON.stringify({ programId, stamp, rows: backup }));
  console.log('[week-blueprints] ---- END BACKUP JSON ----');

  // BEFORE table.
  console.log('[week-blueprints] BEFORE:');
  for (const c of WEEK_BLUEPRINTS) {
    const row = rows.get(c.week);
    if (row) console.log(depthLine(c.week, row.get('title') as string, row.toJSON()));
  }

  // Write.
  const updated: number[] = [];
  if (!dryRun) {
    for (const c of WEEK_BLUEPRINTS) {
      const row = rows.get(c.week);
      if (!row) continue;
      await row.update(toPatch(c) as any);
      updated.push(c.week);
    }
  }

  // AFTER table (re-read to reflect the write).
  console.log(`[week-blueprints] AFTER${dryRun ? ' (dry-run — no write)' : ''}:`);
  for (const c of WEEK_BLUEPRINTS) {
    const row = rows.get(c.week);
    if (!row) continue;
    const fresh = dryRun ? { ...row.toJSON(), ...toPatch(c) } : (await row.reload()).toJSON();
    console.log(depthLine(c.week, row.get('title') as string, fresh));
  }

  console.log(
    `[week-blueprints] done — ${dryRun ? 0 : updated.length} rows updated, ${missing.length} missing/skipped. ` +
      `Fields written per row: ${WRITE_FIELDS.join(', ')}.`,
  );

  return { programId, dryRun, updated, missing, backupPath };
}

// Direct execution.
if (require.main === module) {
  connectDatabase()
    .then(() => seedWeekBlueprints())
    .then((r) => {
      console.log(`[week-blueprints] complete: updated=${r.updated.length}, missing=${r.missing.length}`);
      return sequelize.close();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[week-blueprints] FATAL:', err.message || err);
      process.exit(1);
    });
}
