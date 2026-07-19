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
import { WEEK_BLUEPRINTS, CANONICAL_PROGRAM_ID, WeekBlueprintContent } from '../data/weekBlueprints';

export interface SkilljarSeedResult {
  created: number;
  updated: number;
  weeks: Array<{ week: number; action: 'created' | 'updated'; title: string; minutes: number | null }>;
}

interface CourseCardSpec {
  title: string;
  url: string;
  minutes: number | null;
  completion: 'certificate' | 'progress';
  sections?: string;
}

/** The course card for a week: an explicit `anthropic_course_card` override (used
 *  for a split course) wins; otherwise derive from a `skilljar`-kind `anthropic`. */
function specForWeek(w: WeekBlueprintContent): CourseCardSpec | null {
  if (w.anthropic_course_card) return { ...w.anthropic_course_card };
  if (w.anthropic.kind === 'skilljar' && w.anthropic.url) {
    return { title: w.anthropic.title as string, url: w.anthropic.url, minutes: w.anthropic_course_minutes ?? null, completion: 'certificate' };
  }
  return null;
}

export async function seedSkilljarCards(opts?: { programId?: string }): Promise<SkilljarSeedResult> {
  const programId = opts?.programId || process.env.SKILLJAR_CARDS_PROGRAM_ID || CANONICAL_PROGRAM_ID;
  const targets = WEEK_BLUEPRINTS.map((w) => ({ w, spec: specForWeek(w) })).filter((x): x is { w: WeekBlueprintContent; spec: CourseCardSpec } => !!x.spec);

  console.log(`[skilljar-cards] program_id=${programId} — ensuring ${targets.length} Skilljar course cards`);

  const result: SkilljarSeedResult = { created: 0, updated: 0, weeks: [] };

  for (const { w, spec } of targets) {
    const course = { name: spec.title, url: spec.url, completion: spec.completion, ...(spec.sections ? { sections: spec.sections } : {}) };

    const existing = await TimelineCard.findOne({
      where: { program_id: programId, week: w.week, type: 'anthropic_skills_jar' },
      order: [['updated_at', 'DESC']],
    });

    if (existing) {
      await updateCard(existing.id, {
        title: spec.title,
        difficulty: 'core',
        visibility: 'published',
        ...(spec.minutes != null ? { estimated_time: spec.minutes } : {}),
        course,
      });
      result.updated += 1;
      result.weeks.push({ week: w.week, action: 'updated', title: spec.title, minutes: spec.minutes });
      console.log(`  wk${w.week}: updated -> "${spec.title}" (${spec.minutes ?? 'type-default'}m · ${spec.completion}) ${spec.url}`);
    } else {
      await createCard({
        type: 'anthropic_skills_jar',
        week: w.week,
        program_id: programId,
        title: spec.title,
        difficulty: 'core',
        visibility: 'published',
        ...(spec.minutes != null ? { estimated_time: spec.minutes } : {}),
        course,
      } as any);
      result.created += 1;
      result.weeks.push({ week: w.week, action: 'created', title: spec.title, minutes: spec.minutes });
      console.log(`  wk${w.week}: created -> "${spec.title}" (${spec.minutes ?? 'type-default'}m · ${spec.completion}) ${spec.url}`);
    }
  }

  console.log(`[skilljar-cards] done — ${result.created} created, ${result.updated} updated (${targets.length} course cards; re-runs are idempotent).`);
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
