/**
 * rebuildWeeklyReflect — force-rebuild the reflect-section assessment content
 * from the (freshly updated) week blueprints on the canonical course:
 *
 *   survey     → regenerate the framing + 10 feedback questions (generateCardContent)
 *   evaluation → regenerate the framing (generateCardContent) AND the graded MCQ
 *                set (clear metadata.assessment, then ensureQuestions → 10 questions
 *                per the bumped count in assessmentService)
 *
 * Unconditional overwrite (unlike ensureWeeklySurveys, which skips cards that
 * already have questions). Blueprint-driven: both generators call
 * getBlueprintContext(program, week), so they pick up the latest blueprint.
 * Per-card failures are isolated + reported; the run continues.
 *
 * Run: node dist/scripts/rebuildWeeklyReflect.js [programId] [--weeks=1,2,3]
 */
import { sequelize } from '../config/database';
import TimelineCard from '../models/TimelineCard';
import { generateCardContent } from '../services/timeline/cardContentService';
import { ensureQuestions } from '../services/runtime/assessmentService';

const CANONICAL_PROGRAM = '92b98a72-8681-4f04-8ba1-16a18334cd0b';

interface RebuildReport { week: number; type: string; card_id: string; questions?: number; ok: boolean; error?: string }

async function weeksForProgram(programId: string): Promise<number[]> {
  const rows: any[] = await TimelineCard.findAll({
    where: { cohort_id: null, program_id: programId },
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('week')), 'week']],
    raw: true,
  });
  const weeks = rows.map((r) => r.week).filter((w: any) => typeof w === 'number' && w >= 1).sort((a: number, b: number) => a - b);
  return weeks.length ? weeks : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

export async function rebuildWeeklyReflect(programId = CANONICAL_PROGRAM, onlyWeeks?: number[]): Promise<RebuildReport[]> {
  const weeks = onlyWeeks && onlyWeeks.length ? onlyWeeks : await weeksForProgram(programId);
  const report: RebuildReport[] = [];

  for (const week of weeks) {
    // Surveys — regenerate content (framing + 10 questions) from the new blueprint.
    const surveys = await TimelineCard.findAll({ where: { cohort_id: null, program_id: programId, week, type: 'survey' } });
    for (const sv of surveys) {
      try { await generateCardContent(sv.id); report.push({ week, type: 'survey', card_id: sv.id, ok: true }); }
      catch (e: any) { report.push({ week, type: 'survey', card_id: sv.id, ok: false, error: e?.message || String(e) }); }
    }

    // Evaluations — regenerate framing, then clear + regenerate the graded MCQ set.
    const evals = await TimelineCard.findAll({ where: { cohort_id: null, program_id: programId, week, type: 'evaluation' } });
    for (const ev of evals) {
      try {
        await generateCardContent(ev.id); // framing (title/summary/body_html) — questions stay []
        const fresh: any = await TimelineCard.findByPk(ev.id);
        const meta = { ...(fresh.metadata && typeof fresh.metadata === 'object' ? fresh.metadata : {}) };
        delete meta.assessment; // drop any cached MCQ so it regenerates with the new count + blueprint
        await fresh.update({ metadata: meta });
        const qs = await ensureQuestions(fresh);
        report.push({ week, type: 'evaluation', card_id: ev.id, questions: qs.length, ok: true });
      } catch (e: any) {
        report.push({ week, type: 'evaluation', card_id: ev.id, ok: false, error: e?.message || String(e) });
      }
    }
  }
  return report;
}

if (require.main === module) {
  const programArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : CANONICAL_PROGRAM;
  const weeksArg = (process.argv.find((a) => a.startsWith('--weeks=')) || '').replace('--weeks=', '');
  const onlyWeeks = weeksArg ? weeksArg.split(',').map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n)) : undefined;
  rebuildWeeklyReflect(programArg, onlyWeeks)
    .then((r) => { console.log('[rebuildWeeklyReflect] ' + JSON.stringify(r, null, 2)); return sequelize.close(); })
    .then(() => process.exit(0))
    .catch((e) => { console.error('[rebuildWeeklyReflect] ERROR ' + (e && e.message ? e.message : e)); process.exit(1); });
}

export default rebuildWeeklyReflect;
