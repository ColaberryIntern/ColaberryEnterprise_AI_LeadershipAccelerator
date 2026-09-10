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
  sessions: number;
  pageEvents: number;
  campaigns: number;
  emailsSent: number;
  enrollments: number;
  /** Highest recorded intent score, when the caller may see sales data. */
  intentScore: number | null;
  /** Learning counterparts, so the summary is not acquisition-only. */
  cardsCompleted: number;
  sessionsAttended: number;
}

export async function buildJourney(
  leadIds: number[],
  enrollmentIds: string[],
  sections: readonly string[],
  timeline: TimelineEvent[],
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
    sessions: Number(counts?.sessions ?? 0),
    pageEvents: Number(counts?.page_events ?? 0),
    campaigns: Number(counts?.campaigns ?? 0),
    emailsSent: Number(counts?.emails ?? 0),
    enrollments: enrollmentIds.length,
    // Sales data. Withheld rather than shown as 0 when the caller lacks it.
    intentScore:
      sections.includes('leads') || sections.includes('revenue') || sections.includes('lead_ingestion')
        ? (counts?.intent != null ? Number(counts.intent) : null)
        : null,
    cardsCompleted: Number(learning?.cards ?? 0),
    sessionsAttended: Number(learning?.attended ?? 0),
  };
}
