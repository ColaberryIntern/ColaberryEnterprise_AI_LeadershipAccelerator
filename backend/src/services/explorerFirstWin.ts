import { Op } from 'sequelize';
import { StudentPointsEvent } from '../models';
import { AMBIENT_LEARNING_EVENT_TYPE } from './progression/dailyCap';

/**
 * C91: has this learner banked a first piece of learning yet? The portal keeps an Explorer's first session on one job, finishing a
 * first lesson, and holds the enroll ask until this is true (ad audit, Oct 2026: 3 of 308 ad signups finished a lesson; the top
 * first-page click was "Enroll to unlock").
 *
 * Source: the points ledger, because every learning completion banks there under one of these types (cardPointsService
 * eventTypeForCard, blogReadGateService and ambientMediaGateService, the daily cap's ambient type, and fieldGuideService's Deep Dive
 * Field Guide upload). Streak claims, RSVPs, profile and community points are deliberately not a first win: none of them is learning.
 * A 0-point card (the welcome announcement) banks nothing, so it is not a first win; the portal never offers one as the first lesson.
 *
 * Failure: a failed read returns null ("unknown"), never false. The portal treats unknown as "already won" and shows the page it
 * showed before C91, so an outage can only fall back to the old first session, never strand someone in the new one.
 */
export const FIRST_WIN_EVENT_TYPES: readonly string[] = [
  'card_complete',
  'knowledge_check',
  'survey_complete',
  'evaluation_passed',
  AMBIENT_LEARNING_EVENT_TYPE,
  'deep_dive_field_guide',
];

export async function hasFirstWin(enrollmentId: string): Promise<boolean | null> {
  try {
    const row = await StudentPointsEvent.findOne({
      where: { enrollment_id: enrollmentId, event_type: { [Op.in]: [...FIRST_WIN_EVENT_TYPES] } },
      attributes: ['id'],
    });
    return !!row;
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'backend', event: 'explorer_first_win_read_failed', outcome: 'failure',
      error_class: e?.name || 'Error', message: String(e?.message || e), context: { enrollment_id: enrollmentId },
    }));
    return null;
  }
}
