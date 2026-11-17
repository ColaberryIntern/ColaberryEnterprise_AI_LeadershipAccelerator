import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * OH1: what this person has been doing on the platform, in one or two plain
 * sentences, for the countdown prompt (Ali, 2026-11-17: "relate to what they are
 * doing"). Facts only, from the same tables Explorer Growth reads. Empty when there
 * is nothing recorded, and the prompt then says nothing about activity at all.
 */
export interface PlatformActivityFacts {
  assignments_completed: number;
  last_assignment_title: string | null;
  tour_furthest: number | null;
  tour_total: number | null;
  tour_finished: boolean;
}

export function activitySentence(f: PlatformActivityFacts | null): string {
  if (!f) return '';
  const parts: string[] = [];
  if (f.assignments_completed > 0) {
    parts.push(`has completed ${f.assignments_completed} assignment${f.assignments_completed === 1 ? '' : 's'} on the platform`
      + (f.last_assignment_title ? `, most recently "${f.last_assignment_title}"` : ''));
  }
  if (f.tour_finished) parts.push('has finished the campus tour');
  else if (f.tour_furthest && f.tour_total) parts.push(`has started the campus tour (stop ${f.tour_furthest} of ${f.tour_total})`);
  if (parts.length === 0) return 'Has an account but has not completed anything on the platform yet.';
  return `This person ${parts.join(' and ')}.`;
}

export async function describePlatformActivity(email: string): Promise<string> {
  const e = (email || '').trim().toLowerCase();
  if (!e) return '';
  const rows = await sequelize.query<{
    assignments_completed: string; last_assignment_title: string | null;
    tour_furthest: number | null; tour_total: number | null; tour_finished: boolean | null;
  }>(
    `WITH en AS (SELECT id FROM enrollments WHERE LOWER(email) = :email ORDER BY created_at DESC LIMIT 1)
     SELECT
       (SELECT COUNT(*) FROM timeline_card_progress p WHERE p.enrollment_id = (SELECT id FROM en) AND p.status = 'completed')::text AS assignments_completed,
       (SELECT c.title FROM timeline_card_progress p JOIN timeline_cards c ON c.id = p.card_id
          WHERE p.enrollment_id = (SELECT id FROM en) AND p.status = 'completed'
          ORDER BY p.completed_at DESC NULLS LAST LIMIT 1) AS last_assignment_title,
       (SELECT MAX(t.furthest_stop) FROM campus_tour_progress t WHERE t.enrollment_id = (SELECT id FROM en)) AS tour_furthest,
       (SELECT MAX(t.total_stops) FROM campus_tour_progress t WHERE t.enrollment_id = (SELECT id FROM en)) AS tour_total,
       (SELECT BOOL_OR(t.finished_at IS NOT NULL) FROM campus_tour_progress t WHERE t.enrollment_id = (SELECT id FROM en)) AS tour_finished`,
    { replacements: { email: e }, type: QueryTypes.SELECT },
  );
  const r = rows[0];
  if (!r) return '';
  return activitySentence({
    assignments_completed: Number(r.assignments_completed || 0),
    last_assignment_title: r.last_assignment_title,
    tour_furthest: r.tour_furthest,
    tour_total: r.tour_total,
    tour_finished: Boolean(r.tour_finished),
  });
}
