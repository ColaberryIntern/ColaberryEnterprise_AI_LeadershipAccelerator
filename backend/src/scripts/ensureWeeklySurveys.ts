/**
 * ensureWeeklySurveys — place ONE weekly-feedback Survey card in every week's
 * reflect bucket of a course, and generate its ~10 questions from that week's
 * blueprint. Idempotent: a week that already has a survey card is left alone;
 * questions are generated only when the card's `content.questions` is still empty.
 *
 * Weeks default to the DISTINCT weeks that already have timeline cards for the
 * program (so surveys line up with the real curriculum), falling back to 1–12.
 *
 * Run in the dev/prod backend container:
 *   node dist/scripts/ensureWeeklySurveys.js [programId] [--weeks=1,2,3]
 *
 * Failure design: per-week content generation is wrapped so one week's LLM/
 * blueprint miss never aborts the rest; each week's outcome is reported.
 */
import { sequelize } from '../config/database';
import TimelineCard from '../models/TimelineCard';
import { resolveOrThrow } from '../services/timeline/typeRegistry';
import { composeCardAttributes } from '../services/timeline/timelineAdminService';
import { generateCardContent } from '../services/timeline/cardContentService';
import seedComponentAuthoring from '../seeds/seedComponentAuthoring';

const CANONICAL_PROGRAM = '92b98a72-8681-4f04-8ba1-16a18334cd0b';

interface WeekReport { week: number; card_id?: string; created: boolean; generated: boolean; error?: string }

async function weeksForProgram(programId: string): Promise<number[]> {
  const rows: any[] = await TimelineCard.findAll({
    where: { cohort_id: null, program_id: programId },
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('week')), 'week']],
    raw: true,
  });
  const weeks = rows.map((r) => r.week).filter((w: any) => typeof w === 'number' && w >= 1).sort((a: number, b: number) => a - b);
  return weeks.length ? weeks : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

async function nextReflectOrder(programId: string, week: number): Promise<number> {
  const max = await (TimelineCard as any).max('order', { where: { cohort_id: null, program_id: programId, week, bucket: 'reflect' } });
  return (typeof max === 'number' ? max : -1) + 1;
}

export async function ensureWeeklySurveys(programId = CANONICAL_PROGRAM, onlyWeeks?: number[]): Promise<WeekReport[]> {
  // Guarantee the survey type carries its authored generation_prompt first.
  await seedComponentAuthoring();
  const def = resolveOrThrow('survey');
  const weeks = onlyWeeks && onlyWeeks.length ? onlyWeeks : await weeksForProgram(programId);
  const report: WeekReport[] = [];

  for (const week of weeks) {
    let card: any = await TimelineCard.findOne({ where: { cohort_id: null, program_id: programId, week, type: 'survey' } });
    let created = false;
    if (!card) {
      const order = await nextReflectOrder(programId, week);
      const attrs = composeCardAttributes(def, {
        type: 'survey', program_id: programId, week, bucket: 'reflect',
        title: `Week ${week} Feedback`, visibility: 'published',
        description: 'A quick weekly check-in — your answers shape next week.',
      } as any, order);
      card = await TimelineCard.create(attrs as any);
      created = true;
    }

    const hasQs = Array.isArray(card.metadata?.content?.questions) && card.metadata.content.questions.length > 0;
    let generated = false;
    if (!hasQs) {
      try { await generateCardContent(card.id); generated = true; }
      catch (e: any) { report.push({ week, card_id: card.id, created, generated: false, error: e?.message || String(e) }); continue; }
    }
    report.push({ week, card_id: card.id, created, generated });
  }
  return report;
}

if (require.main === module) {
  const programArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : CANONICAL_PROGRAM;
  const weeksArg = (process.argv.find((a) => a.startsWith('--weeks=')) || '').replace('--weeks=', '');
  const onlyWeeks = weeksArg ? weeksArg.split(',').map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n)) : undefined;
  ensureWeeklySurveys(programArg, onlyWeeks)
    .then((r) => { console.log('[ensureWeeklySurveys] ' + JSON.stringify(r, null, 2)); return sequelize.close(); })
    .then(() => process.exit(0))
    .catch((e) => { console.error('[ensureWeeklySurveys] ERROR ' + (e && e.message ? e.message : e)); process.exit(1); });
}

export default ensureWeeklySurveys;
