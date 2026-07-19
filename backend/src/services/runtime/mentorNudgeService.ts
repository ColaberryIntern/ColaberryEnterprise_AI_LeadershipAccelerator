/**
 * mentorNudgeService — reads the struggle signals for (student, card) and returns
 * a proactive nudge when they look stuck. Read-only + fail-safe: any error yields
 * "no nudge" so it can never break the card-open path. The frontend calls this on
 * card open (and/or a light poll) and surfaces the message as a friendly opener.
 */
import MentorTurn from '../../models/MentorTurn';
import TimelineCardProgress from '../../models/TimelineCardProgress';
import AssessmentAttempt from '../../models/AssessmentAttempt';
import { buildNudge, Nudge } from './mentorNudgeFormat';

const NO_NUDGE: Nudge = { struggling: false, reasons: [], message: null };

export async function getNudge(enrollmentId: string, cardId: string): Promise<Nudge> {
  try {
    const [turns, progress, attempt] = await Promise.all([
      MentorTurn.count({ where: { enrollment_id: enrollmentId, card_id: cardId } }),
      TimelineCardProgress.findOne({ where: { enrollment_id: enrollmentId, card_id: cardId }, attributes: ['attempts'] }),
      AssessmentAttempt.findOne({
        where: { enrollment_id: enrollmentId, card_id: cardId },
        order: [['submitted_at', 'DESC']],
        attributes: ['kind', 'passed', 'score'],
      }),
    ]);
    const a: any = attempt;
    const gradedLock = !!a && a.kind === 'evaluation' && a.passed !== true;
    const failedEval = !!a && a.kind === 'evaluation' && a.passed === false;
    const lowScorePct = a ? Math.round((a.score || 0) * 100) : null;
    return buildNudge({
      turnsOnCard: turns,
      attempts: (progress as any)?.attempts ?? 0,
      gradedLock,
      failedEval,
      lowScorePct,
    });
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'runtime_mentor', event: 'nudge_failed',
      card_id: cardId, error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
    return NO_NUDGE;
  }
}
