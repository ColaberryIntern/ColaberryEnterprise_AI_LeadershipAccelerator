/**
 * Idempotent seed: ensure every Skilljar-mapped week (1,2,3,5,6,7,8) has exactly
 * one `anthropic_skills_jar` curriculum card carrying the real Anthropic Skilljar
 * course — its title, deep link, and posted duration (from data/weekBlueprints).
 *
 * Idempotent by (program_id, week, type): an existing card is UPDATED in place
 * (so re-runs never duplicate), a missing one is CREATED. Weeks with no Skilljar
 * course (0,4,9,10,11,12) are skipped. Uses the timeline admin create/update path
 * so the card gets its lane order, course metadata, AND the estimated_hours rollup
 * for its week (blueprintRollup) for free.
 *
 * Run (in-container after deploy):
 *   docker exec accelerator-backend node dist/seeds/seedSkilljarCards.js
 * Or locally: cd backend && npx ts-node src/seeds/seedSkilljarCards.ts
 */
import { connectDatabase, sequelize } from '../config/database';
import '../models';
import TimelineCard from '../models/TimelineCard';
import { createCard, updateCard } from '../services/timeline/timelineAdminService';
import { WEEK_BLUEPRINTS, CANONICAL_PROGRAM_ID } from '../data/weekBlueprints';

export interface SkilljarSeedResult {
  created: number;
  updated: number;
  weeks: Array<{ week: number; action: 'created' | 'updated'; title: string; minutes: number | null }>;
}

export async function seedSkilljarCards(opts?: { programId?: string }): Promise<SkilljarSeedResult> {
  const programId = opts?.programId || process.env.SKILLJAR_CARDS_PROGRAM_ID || CANONICAL_PROGRAM_ID;
  const skilljarWeeks = WEEK_BLUEPRINTS.filter((w) => w.anthropic.kind === 'skilljar' && w.anthropic.url);

  console.log(`[skilljar-cards] program_id=${programId} — ensuring ${skilljarWeeks.length} Skilljar course cards`);

  const result: SkilljarSeedResult = { created: 0, updated: 0, weeks: [] };

  for (const w of skilljarWeeks) {
    const title = w.anthropic.title as string;
    const url = w.anthropic.url as string;
    const minutes = w.anthropic_course_minutes ?? null;

    const existing = await TimelineCard.findOne({
      where: { program_id: programId, week: w.week, type: 'anthropic_skills_jar' },
      order: [['updated_at', 'DESC']],
    });

    if (existing) {
      await updateCard(existing.id, {
        title,
        difficulty: 'core',
        visibility: 'published',
        ...(minutes != null ? { estimated_time: minutes } : {}),
        course: { name: title, url },
      });
      result.updated += 1;
      result.weeks.push({ week: w.week, action: 'updated', title, minutes });
      console.log(`  wk${w.week}: updated -> "${title}" (${minutes ?? 'type-default'}m) ${url}`);
    } else {
      await createCard({
        type: 'anthropic_skills_jar',
        week: w.week,
        program_id: programId,
        title,
        difficulty: 'core',
        visibility: 'published',
        ...(minutes != null ? { estimated_time: minutes } : {}),
        course: { name: title, url },
      } as any);
      result.created += 1;
      result.weeks.push({ week: w.week, action: 'created', title, minutes });
      console.log(`  wk${w.week}: created -> "${title}" (${minutes ?? 'type-default'}m) ${url}`);
    }
  }

  console.log(`[skilljar-cards] done — ${result.created} created, ${result.updated} updated (${skilljarWeeks.length} Skilljar weeks; re-runs are idempotent).`);
  return result;
}

if (require.main === module) {
  connectDatabase()
    .then(() => seedSkilljarCards())
    .then((r) => {
      console.log(`[skilljar-cards] complete: created=${r.created}, updated=${r.updated}`);
      return sequelize.close();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[skilljar-cards] FATAL:', err.message || err);
      process.exit(1);
    });
}
