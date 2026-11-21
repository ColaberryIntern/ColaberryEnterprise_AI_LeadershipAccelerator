import { sequelize } from '../../config/database';
import type { InterviewType } from './readiness';

/**
 * Career Prep v27, CP8.3: the learner's prep row (career_interviews, source 'real') for a BOOKED placement interview.
 * bookingConfirm.ts calls it each time it finishes a booking; this is the learner's in-app notice of the booking (the
 * Interviews sheet, the campus card and the room's anchors read career_interviews).
 *
 * ONE row per placement interview (the partial unique index on placement_interview_id, ensureCareerPrepSchema.ts), so a
 * retry changes nothing and a rebook at a new time moves the same row's starts_at: the card, the anchors and any plan
 * follow the booking. The update applies only to the SAME learner's row; otherwise no row comes back (null) and the
 * caller treats the link as failed. Not known from the email: company 'An employer', role 'Interview', type 'recruiter'
 * (a first round; readiness then uses the recruiter target). Company and role are cut to the column width (120).
 * Kept apart from interviews.ts so the booking work never loads the model client that module needs.
 */
export interface PlacementLink {
  placementInterviewId: string; enrollmentId: string; company: string | null; position: string | null; type: InterviewType | null; startsAt: Date;
}

export async function linkPlacementInterview(l: PlacementLink): Promise<string | null> {
  const [rows] = await sequelize.query(
    `INSERT INTO career_interviews (enrollment_id, source, company, role, type, starts_at, placement_interview_id)
     VALUES (:e, 'real', LEFT(:company, 120), LEFT(:role, 120), :type, :start, :pid)
     ON CONFLICT (placement_interview_id) WHERE placement_interview_id IS NOT NULL
     DO UPDATE SET starts_at = EXCLUDED.starts_at, company = EXCLUDED.company, role = EXCLUDED.role, type = EXCLUDED.type
       WHERE career_interviews.enrollment_id = EXCLUDED.enrollment_id
     RETURNING id`,
    { replacements: { e: l.enrollmentId, company: l.company?.trim() || 'An employer', role: l.position?.trim() || 'Interview',
      type: l.type ?? 'recruiter', start: l.startsAt, pid: l.placementInterviewId } },
  );
  const id = (rows as Array<{ id: string }>)[0]?.id;
  return id ? String(id) : null;
}
