/**
 * Backfill script: award engagement points for curriculum items students have
 * ALREADY completed, so the top-right HUD reflects their real progress after we
 * wired coursework → points. Covers Timeline cards (card:<id>) and legacy
 * curriculum lessons (lesson:<id>).
 *
 * Usage:
 *   npx ts-node src/scripts/backfillCompletionPoints.ts            # apply
 *   npx ts-node src/scripts/backfillCompletionPoints.ts --dry-run  # report only
 *
 * Safe to run multiple times — every award is idempotent per (enrollment,
 * event_key), so re-running only fills gaps and never double-counts.
 */
import '../config/database'; // Initialize sequelize
import '../models'; // Load all models + associations
import TimelineCard from '../models/TimelineCard';
import TimelineCardProgress from '../models/TimelineCardProgress';
import LessonInstance from '../models/LessonInstance';
import { hasAwarded } from '../services/pointsService';
import {
  awardCardCompletionPoints,
  awardLessonCompletionPoints,
  resolveCardEngagementPoints,
} from '../services/progression/cardPointsService';

const DRY = process.argv.includes('--dry-run');

async function backfillCards() {
  const completed = await TimelineCardProgress.findAll({ where: { status: 'completed' }, attributes: ['card_id', 'enrollment_id'] });
  const cardIds = Array.from(new Set(completed.map((p) => p.card_id)));
  const cards = cardIds.length ? await TimelineCard.findAll({ where: { id: cardIds }, attributes: ['id', 'type'] }) : [];
  const typeById = new Map(cards.map((c) => [c.id, c.type]));

  let awarded = 0, points = 0, skipped = 0, errors = 0;
  for (const p of completed) {
    const type = typeById.get(p.card_id);
    if (!type) { skipped++; continue; } // orphaned progress (card deleted)
    try {
      if (DRY) {
        const already = await hasAwarded(p.enrollment_id, `card:${p.card_id}`);
        if (already) { skipped++; continue; }
        points += await resolveCardEngagementPoints({ id: p.card_id, type });
        awarded++;
      } else {
        const got = await awardCardCompletionPoints(p.enrollment_id, { id: p.card_id, type });
        if (got > 0) { awarded++; points += got; } else { skipped++; }
      }
    } catch (err: any) {
      errors++;
      console.error(`  [!] card ${p.card_id} / enr ${p.enrollment_id}: ${err.message}`);
    }
  }
  console.log(`[Backfill] Cards — ${DRY ? 'would award' : 'awarded'}: ${awarded} (+${points} pts), skipped: ${skipped}, errors: ${errors}, completed rows: ${completed.length}`);
}

async function backfillLessons() {
  const completed = await LessonInstance.findAll({ where: { status: 'completed' }, attributes: ['lesson_id', 'enrollment_id'] });
  let awarded = 0, points = 0, skipped = 0, errors = 0;
  for (const inst of completed) {
    try {
      if (DRY) {
        const already = await hasAwarded(inst.enrollment_id, `lesson:${inst.lesson_id}`);
        if (already) { skipped++; continue; }
        points += 10; // lesson_complete registry default
        awarded++;
      } else {
        const got = await awardLessonCompletionPoints(inst.enrollment_id, inst.lesson_id);
        if (got > 0) { awarded++; points += got; } else { skipped++; }
      }
    } catch (err: any) {
      errors++;
      console.error(`  [!] lesson ${inst.lesson_id} / enr ${inst.enrollment_id}: ${err.message}`);
    }
  }
  console.log(`[Backfill] Lessons — ${DRY ? 'would award' : 'awarded'}: ${awarded} (+${points} pts), skipped: ${skipped}, errors: ${errors}, completed rows: ${completed.length}`);
}

async function main() {
  console.log(`[Backfill] Completion-points backfill starting${DRY ? ' (DRY RUN — no writes)' : ''}...`);
  await backfillCards();
  await backfillLessons();
  console.log('[Backfill] Complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Backfill] Fatal error:', err);
  process.exit(1);
});
