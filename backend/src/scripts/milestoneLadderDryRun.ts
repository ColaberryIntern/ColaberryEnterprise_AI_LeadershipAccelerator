/**
 * milestoneLadderDryRun — Phase 4 of the points-ladder plan
 * (docs/POINTS_LADDER_AUDIT_2026-09-16.md §7, docs/POINTS_LADDER_DECISIONS.md).
 *
 * READ-ONLY BY DEFAULT. Computes, for every student the ladder could move, what
 * the milestone ladder would say about them — curriculum complete or not (and
 * which weeks are short), projects complete (and which), certification, the
 * rank that follows, and the rank they would hold after the D5 latch — and
 * prints the before/after distribution with every person who moves. Nothing is
 * written until `--write` is passed, and that is the step Ali approves after
 * reading the dry-run.
 *
 * `--write` runs the real evaluator (`evaluateMilestonePromotion`) for each
 * student, which latches milestones and re-ranks exactly as the live triggers
 * will. It calls the milestone path DIRECTLY, not through the env flag, so the
 * backfill can run before MILESTONE_LADDER_ENABLED is flipped and the flip then
 * changes nothing for anyone already ranked. Idempotent: a second `--write`
 * changes nothing.
 *
 * Run inside the prod container (this compiles to dist/scripts/):
 *   docker exec accelerator-backend node /app/dist/scripts/milestoneLadderDryRun.js            # dry run
 *   docker exec accelerator-backend node /app/dist/scripts/milestoneLadderDryRun.js --write    # apply
 *   docker exec accelerator-backend node /app/dist/scripts/milestoneLadderDryRun.js --json > /tmp/ladder.json
 *
 * Also prints the curriculum's graded-card count per week: a week with zero
 * graded cards makes "curriculum complete" unreachable for everyone, and that
 * is a content fact to fix, not a ladder bug.
 */
import '../config/database';
import '../models';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { getCurriculumCompletion, getProjectCompletions, getMilestoneState } from '../services/progression/milestoneService';
import { evaluateMilestonePromotion } from '../services/progression/milestonePromotion';
import {
  rankForMilestones, latchRank, legacyRankToMilestoneRank, rungNameForRank, programMilestonesHeld, CURRICULUM_WEEKS,
} from '../services/progression/milestoneLadder';

const WRITE = process.argv.includes('--write');
const JSON_OUT = process.argv.includes('--json');

interface Candidate { enrollment_id: string; name: string; email: string; level_slug: string; rank: number }

interface Row {
  enrollment_id: string;
  name: string;
  email: string;
  current_slug: string;
  current_rank: number;
  held_rank: number;
  curriculum_complete: boolean;
  incomplete_weeks: number[];
  projects: Array<{ name: string; verified: number; total: number; complete: boolean }>;
  projects_complete: number;
  certification_approved: boolean;
  milestones_held: number;
  computed_rank: number;
  target_rank: number;
  target_rung: string;
  moves: boolean;
}

async function candidates(): Promise<Candidate[]> {
  return sequelize.query<Candidate>(
    `WITH ids AS (
       SELECT enrollment_id FROM student_level
       UNION SELECT DISTINCT enrollment_id FROM timeline_card_progress WHERE status = 'completed'
       UNION SELECT DISTINCT p.enrollment_id FROM projects p JOIN build_plans b ON b.project_id = p.id AND b.status = 'published'
     )
     SELECT e.id AS enrollment_id,
            COALESCE(NULLIF(TRIM(e.full_name), ''), e.email) AS name,
            e.email,
            COALESCE(sl.level_slug, 'builder') AS level_slug,
            COALESCE(sl.rank, 0)::int AS rank
       FROM ids
       JOIN enrollments e ON e.id = ids.enrollment_id
       LEFT JOIN student_level sl ON sl.enrollment_id = e.id
      ORDER BY name`,
    { type: QueryTypes.SELECT },
  );
}

async function gradedCardsPerWeek(): Promise<Array<{ week: number; graded: number }>> {
  // Any student id works for the per-week graded counts; use a nil UUID so no
  // progress rows join and only the `graded` side is meaningful.
  const c = await getCurriculumCompletion('00000000-0000-0000-0000-000000000000');
  return c.weeks.map((w) => ({ week: w.week, graded: w.graded }));
}

async function assess(c: Candidate): Promise<Row> {
  const [curriculum, projects, latched] = await Promise.all([
    getCurriculumCompletion(c.enrollment_id),
    getProjectCompletions(c.enrollment_id),
    getMilestoneState(c.enrollment_id),
  ]);
  const projectsComplete = Math.max(latched.projectsComplete, projects.filter((p) => p.complete).length);
  const state = {
    curriculumComplete: latched.curriculumComplete || curriculum.complete,
    projectsComplete,
    certificationApproved: latched.certificationApproved,
  };
  const held = legacyRankToMilestoneRank(c.level_slug, c.rank);
  const computed = rankForMilestones(state);
  const target = latchRank(held, computed);
  return {
    enrollment_id: c.enrollment_id,
    name: c.name,
    email: c.email,
    current_slug: c.level_slug,
    current_rank: c.rank,
    held_rank: held,
    curriculum_complete: state.curriculumComplete,
    incomplete_weeks: curriculum.incompleteWeeks,
    projects: projects.map((p) => ({ name: p.name, verified: p.storiesVerified, total: p.storiesTotal, complete: p.complete })),
    projects_complete: projectsComplete,
    certification_approved: state.certificationApproved,
    milestones_held: programMilestonesHeld(state),
    computed_rank: computed,
    target_rank: target,
    target_rung: rungNameForRank(target) || '(entry)',
    moves: target > held,
  };
}

function distribution(rows: Row[], pick: (r: Row) => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = `${pick(r)} ${rungNameForRank(pick(r)) || 'entry'}`;
    out[k] = (out[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => Number(a.split(' ')[0]) - Number(b.split(' ')[0])));
}

async function main(): Promise<void> {
  const started = Date.now();
  const list = await candidates();
  const weeks = await gradedCardsPerWeek();
  const rows: Row[] = [];
  for (const c of list) rows.push(await assess(c));

  const before = distribution(rows, (r) => r.held_rank);
  const after = distribution(rows, (r) => r.target_rank);
  const movers = rows.filter((r) => r.target_rank > r.held_rank);
  const emptyWeeks = weeks.filter((w) => w.graded === 0).map((w) => w.week);

  if (JSON_OUT) {
    console.log(JSON.stringify({ generated_at: new Date().toISOString(), write: WRITE, weeks, before, after, rows }, null, 2));
  } else {
    console.log(`\n# Milestone ladder ${WRITE ? 'BACKFILL' : 'DRY RUN'} — ${new Date().toISOString()}`);
    console.log(`\nStudents assessed: ${rows.length}`);
    console.log(`\n## Graded cards per curriculum week (${CURRICULUM_WEEKS} weeks)`);
    console.log(weeks.map((w) => `wk${w.week}:${w.graded}`).join('  '));
    if (emptyWeeks.length) console.log(`!! Weeks with NO graded cards: ${emptyWeeks.join(', ')} — "curriculum complete" is unreachable until these are authored.`);
    console.log('\n## Distribution before (legacy rank mapped onto the milestone ladder)');
    for (const [k, v] of Object.entries(before)) console.log(`  ${k.padEnd(36)} ${v}`);
    console.log('\n## Distribution after (latched)');
    for (const [k, v] of Object.entries(after)) console.log(`  ${k.padEnd(36)} ${v}`);
    console.log(`\n## Who moves up (${movers.length})`);
    console.log('| Student | Now | → | Curriculum | Projects | Cert |');
    console.log('|---|---|---|---|---|---|');
    for (const r of movers) {
      const proj = r.projects.map((p) => `${p.name} ${p.verified}/${p.total}${p.complete ? ' ✓' : ''}`).join('; ') || '—';
      console.log(`| ${r.name} | ${rungNameForRank(r.held_rank) || 'entry'} | ${r.target_rung} | ${r.curriculum_complete ? '✓' : `short: wk ${r.incomplete_weeks.slice(0, 6).join(',')}${r.incomplete_weeks.length > 6 ? '…' : ''}`} | ${proj} | ${r.certification_approved ? '✓' : '—'} |`);
    }
    const nearly = rows.filter((r) => !r.moves && r.projects.some((p) => !p.complete && p.verified > 0));
    console.log(`\n## In progress, not yet moving (${nearly.length}) — a partially verified build`);
    for (const r of nearly.slice(0, 40)) {
      console.log(`  ${r.name.padEnd(28)} ${(rungNameForRank(r.held_rank) || 'entry').padEnd(22)} ${r.projects.map((p) => `${p.name} ${p.verified}/${p.total}`).join('; ')}`);
    }
  }

  if (WRITE) {
    let promoted = 0; let failed = 0;
    for (const r of rows) {
      try {
        const out = await evaluateMilestonePromotion(r.enrollment_id);
        if (out.promoted) promoted += 1;
      } catch (err: any) {
        failed += 1;
        console.error(JSON.stringify({ level: 'error', event: 'ladder_backfill_student_failed', enrollment_id: r.enrollment_id, message: err?.message }));
      }
    }
    console.log(JSON.stringify({ level: 'info', event: 'ladder_backfill_completed', outcome: failed ? 'partial' : 'success', evaluated: rows.length, promoted, failed, duration_ms: Date.now() - started }));
  } else if (!JSON_OUT) {
    console.log(`\nNothing written. Re-run with --write to apply (${movers.length} promotions). ${Date.now() - started}ms`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
