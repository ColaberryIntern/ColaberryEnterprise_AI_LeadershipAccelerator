import { sequelize } from '../../config/database';
import { getStudentWeekBreakdown, bucketRank } from '../curriculumCompletionService';

/**
 * Reese takes the learners' curriculum questions (Colaberry Campus C88). Ali, 2026-10-29: "Learners losing Dara is
 * intended - they can go through Reese." Before C88 a learner asked Dara "what does this week's assignment ask for?";
 * now Reese answers it, from the learner's OWN week: the cohort's scheduled week, the cards published for it, and which
 * of them this learner has done.
 *
 * SECURITY: bound to the sender. The enrollment id is the one reeseReplyService already holds for the conversation;
 * the model passes nothing. Every query binds that id.
 */
const AROUND = 1; // weeks either side of the scheduled week in the week summary

export interface CurriculumProgressResult {
  status: 'ok' | 'no_cohort' | 'no_data';
  scheduledWeek?: number;
  weeks?: Array<{ week: number; completed: number; published: number; completedPct: number; weekDone: boolean }>;
  thisWeek?: Array<{ title: string; type: string; section: string; status: string }>;
  note?: string;
}

export async function readMyCurriculumProgress(enrollmentId: string): Promise<CurriculumProgressResult> {
  const [own] = await sequelize.query(
    'SELECT cohort_id FROM enrollments WHERE id = $1', { bind: [enrollmentId] },
  ) as [Array<{ cohort_id: string | null }>, unknown];
  const cohortId = own[0]?.cohort_id ?? null;
  if (!cohortId) return { status: 'no_cohort', note: 'This learner is not in a cohort, so there is no scheduled week to compare against.' };

  const breakdown = await getStudentWeekBreakdown(cohortId, enrollmentId);
  if (!breakdown) return { status: 'no_data', note: 'No curriculum progress could be read for this learner.' };
  const week = breakdown.scheduledWeek;

  const [cards] = await sequelize.query(
    `SELECT c.title, c.type, c.bucket, c."order", COALESCE(p.status, 'not_started') AS status
       FROM timeline_cards c
       LEFT JOIN timeline_card_progress p ON p.card_id = c.id AND p.enrollment_id = $1
      WHERE c.week = $2 AND c.status = 'active'`,
    { bind: [enrollmentId, week] },
  ) as [Array<{ title: string; type: string; bucket: string; order: number; status: string }>, unknown];

  return {
    status: 'ok',
    scheduledWeek: week,
    weeks: breakdown.rows
      .filter((r): r is typeof r & { week: number } => r.week !== null && Math.abs(r.week - week) <= AROUND)
      .map((r) => ({ week: r.week, completed: r.completed, published: r.publishedCardCount, completedPct: r.completedPct, weekDone: r.weekDone })),
    thisWeek: cards
      .slice()
      .sort((a, b) => bucketRank(a.bucket) - bucketRank(b.bucket) || a.order - b.order)
      .map((c) => ({ title: c.title, type: c.type, section: c.bucket, status: c.status })),
  };
}
