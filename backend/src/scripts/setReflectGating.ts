/**
 * setReflectGating — wire the reflect-section unlock chain on the canonical
 * course (per-card unlock_rules on timeline_cards; getFeed applies the lock):
 *
 *   Evaluation (the test)  → locked until the week's LEARN section is complete
 *   Survey (feedback)      → locked until the week's Evaluation is complete
 *   Reflection             → locked until the week's Survey is complete
 *
 * Idempotent: re-running overwrites the same rules. Only gates a card when its
 * prerequisite exists that week (e.g. Week 0's lone survey has no evaluation, so
 * it stays ungated). Weeks default to those the program already has cards for.
 *
 * Run: node dist/scripts/setReflectGating.js [programId] [--weeks=1,2,3]
 */
import { sequelize } from '../config/database';
import TimelineCard from '../models/TimelineCard';
import { updateCard } from '../services/timeline/timelineAdminService';

const CANONICAL_PROGRAM = '92b98a72-8681-4f04-8ba1-16a18334cd0b';

const LEARN_GATE = [{ kind: 'section_complete', bucket: 'learn', scope: 'week', label: 'the Learn section' }];
const EVAL_GATE = [{ kind: 'type_complete', type: 'evaluation', scope: 'week', label: 'the evaluation' }];
const SURVEY_GATE = [{ kind: 'type_complete', type: 'survey', scope: 'week', label: 'the feedback survey' }];

interface GateReport { week: number; type: string; card_id: string; gate: string | null }

async function weeksForProgram(programId: string): Promise<number[]> {
  const rows: any[] = await TimelineCard.findAll({
    where: { cohort_id: null, program_id: programId },
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('week')), 'week']],
    raw: true,
  });
  const weeks = rows.map((r) => r.week).filter((w: any) => typeof w === 'number' && w >= 1).sort((a: number, b: number) => a - b);
  return weeks.length ? weeks : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

export async function setReflectGating(programId = CANONICAL_PROGRAM, onlyWeeks?: number[]): Promise<GateReport[]> {
  const weeks = onlyWeeks && onlyWeeks.length ? onlyWeeks : await weeksForProgram(programId);
  const report: GateReport[] = [];

  for (const week of weeks) {
    const cards = await TimelineCard.findAll({ where: { cohort_id: null, program_id: programId, week, bucket: 'reflect' } });
    const hasEval = cards.some((c) => c.type === 'evaluation');
    const hasSurvey = cards.some((c) => c.type === 'survey');

    for (const c of cards) {
      let rules: any[] | null = null;
      if (c.type === 'evaluation') rules = LEARN_GATE;                                   // ← Learn complete
      else if (c.type === 'survey') rules = hasEval ? EVAL_GATE : LEARN_GATE;            // ← Evaluation (or Learn if no eval, e.g. Week 0)
      else if (c.type === 'reflection') rules = hasSurvey ? SURVEY_GATE : (hasEval ? EVAL_GATE : LEARN_GATE); // ← Survey complete
      if (!rules) { report.push({ week, type: c.type, card_id: c.id, gate: null }); continue; }
      await updateCard(c.id, { unlock_rules: rules });
      report.push({ week, type: c.type, card_id: c.id, gate: (rules[0] as any).label });
    }
  }
  return report;
}

if (require.main === module) {
  const programArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : CANONICAL_PROGRAM;
  const weeksArg = (process.argv.find((a) => a.startsWith('--weeks=')) || '').replace('--weeks=', '');
  const onlyWeeks = weeksArg ? weeksArg.split(',').map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n)) : undefined;
  setReflectGating(programArg, onlyWeeks)
    .then((r) => { console.log('[setReflectGating] ' + JSON.stringify(r, null, 2)); return sequelize.close(); })
    .then(() => process.exit(0))
    .catch((e) => { console.error('[setReflectGating] ERROR ' + (e && e.message ? e.message : e)); process.exit(1); });
}

export default setReflectGating;
