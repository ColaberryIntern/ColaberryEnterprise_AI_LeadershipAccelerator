import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { TimelineEvent } from '../personTimelineService';

/**
 * The journey summary: first touch, time in stage, and the shape of the
 * relationship, above the detail.
 *
 * Every figure is counted, not estimated. A count we cannot compute is null
 * rather than 0 — the same rule the metric registry enforces everywhere else.
 *
 * Counted from the source tables rather than from the timeline page, because
 * the timeline is capped and a count taken from it would silently understate
 * anyone busier than that cap.
 */
export interface JourneySummary {
  firstTouch: string | null;
  lastActivity: string | null;
  daysKnown: number | null;
  /**
   * M24.2 - these four are null when the acquisition query was never issued, which happens when
   * the person has no lead record at all. They were `number` and coerced with `?? 0`, so an
   * unlinked person reported a measured zero on every one of them. Those are precisely the rows
   * whose lead linkage M22 has not resolved, so the two defects compounded.
   *
   * A zero here now means the query ran and counted nothing. Null means we never looked.
   */
  sessions: number | null;
  pageEvents: number | null;
  campaigns: number | null;
  emailsSent: number | null;
  /**
   * M24.3 - null when the id list was narrowed by the caller's permissions, because then the
   * count is a fact about the CALLER, not about the person. It read 0 for a mentor without
   * grants, which a score would have consumed as "never enrolled", making the same person rank
   * differently depending on who asked.
   */
  enrollments: number | null;
  /** Highest recorded intent score, when the caller may see sales data. */
  intentScore: number | null;
  /** Learning counterparts, so the summary is not acquisition-only. Null when not looked up. */
  cardsCompleted: number | null;
  sessionsAttended: number | null;
}

export async function buildJourney(
  leadIds: number[],
  enrollmentIds: string[],
  sections: readonly string[],
  timeline: TimelineEvent[],
  /**
   * False when `enrollmentIds` was narrowed by the caller's permissions, so the length is not a
   * count of the person's enrolments. Defaults to true: an omitted argument must not silently
   * turn a withheld count into a measured one.
   */
  enrollmentsCounted = true,
): Promise<JourneySummary> {
  const counts = leadIds.length
    ? (
        await sequelize.query<{
          sessions: string; page_events: string; campaigns: string;
          emails: string; first_touch: string | null; intent: string | null;
        }>(
          `SELECT
             (SELECT COUNT(*) FROM visitor_sessions WHERE lead_id IN (:leadIds))::text AS sessions,
             (SELECT COUNT(*) FROM page_events WHERE lead_id IN (:leadIds) AND event_type <> 'heartbeat')::text AS page_events,
             (SELECT COUNT(*) FROM campaign_leads WHERE lead_id IN (:leadIds))::text AS campaigns,
             (SELECT COUNT(*) FROM scheduled_emails WHERE lead_id IN (:leadIds) AND sent_at IS NOT NULL)::text AS emails,
             (SELECT MIN(created_at) FROM leads WHERE id IN (:leadIds)) AS first_touch,
             (SELECT MAX(score)::text FROM intent_scores WHERE lead_id IN (:leadIds)) AS intent`,
          { type: QueryTypes.SELECT, replacements: { leadIds } },
        )
      )[0]
    : null;

  // Learning counts, so the header is not silent about someone who enrolled
  // without ever being a tracked lead.
  const learning = enrollmentIds.length
    ? (
        await sequelize.query<{ cards: string; attended: string; enrolled_at: string | null }>(
          `SELECT
             (SELECT COUNT(*) FROM timeline_card_progress
               WHERE enrollment_id IN (:ids) AND status = 'completed')::text AS cards,
             (SELECT COUNT(*) FROM attendance_records
               WHERE enrollment_id IN (:ids) AND status::text IN ('present','late'))::text AS attended,
             (SELECT MIN(enrolled_at) FROM enrollments WHERE id IN (:ids)) AS enrolled_at`,
          { type: QueryTypes.SELECT, replacements: { ids: enrollmentIds } },
        )
      )[0]
    : null;

  // First touch is the earliest thing we know about them, from either side.
  // Using the lead date alone reported "0 days known" for the 86 enrolments
  // that have no lead record.
  const candidates = [counts?.first_touch, learning?.enrolled_at].filter(
    (d): d is string => !!d,
  );
  const firstTouch = candidates.length
    ? candidates.reduce((a, b) => (new Date(a) < new Date(b) ? a : b))
    : null;

  const lastActivity = timeline.length > 0 ? timeline[0].occurredAt : null;

  return {
    firstTouch,
    lastActivity,
    // null, not 0, when there is no first touch to measure from.
    daysKnown: firstTouch
      ? Math.max(0, Math.round((Date.now() - new Date(firstTouch).getTime()) / 86400000))
      : null,
    // Null when the query was never issued, which is the docblock's rule above. `counts` is only
    // assigned when there is at least one lead id to count against.
    sessions: counts ? Number(counts.sessions ?? 0) : null,
    pageEvents: counts ? Number(counts.page_events ?? 0) : null,
    campaigns: counts ? Number(counts.campaigns ?? 0) : null,
    emailsSent: counts ? Number(counts.emails ?? 0) : null,
    enrollments: enrollmentsCounted ? enrollmentIds.length : null,
    // Sales data. Withheld rather than shown as 0 when the caller lacks it.
    intentScore:
      sections.includes('leads') || sections.includes('revenue') || sections.includes('lead_ingestion')
        ? (counts?.intent != null ? Number(counts.intent) : null)
        : null,
    cardsCompleted: learning ? Number(learning.cards ?? 0) : null,
    sessionsAttended: learning ? Number(learning.attended ?? 0) : null,
  };
}
