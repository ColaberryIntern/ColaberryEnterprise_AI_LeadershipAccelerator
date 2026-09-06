import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { WAR_ROOM_PAGE_EVENT_TYPES, toSqlInList } from '../../constants/caseStudyEventTypes';

/**
 * The cross-system activity feed.
 *
 * Lifted VERBATIM out of the /api/admin/war-room/feed route handler so the
 * Command Center can show the same feed without a second copy of a 4,000
 * character union query drifting away from the first. The route now calls this;
 * its behaviour is unchanged.
 *
 * The extraction also removes an inline `require()` from inside the handler,
 * which defeated the module graph and hid this query from every dependency and
 * type check that walks imports.
 */

export interface FeedEvent {
  created_at: string;
  event_type: string;
  detail: string;
  source: string;
  lead_id: number | null;
  lead_name: string | null;
  lead_email: string | null;
  lead_score: number | null;
  lead_source_type: string | null;
  lead_pipeline_stage: string | null;
  campaign_name: string | null;
  campaign_type: string | null;
}

/**
 * Reads the feed. Throws on failure rather than returning [].
 *
 * An empty array would be indistinguishable from a genuinely quiet system, and
 * every caller here is built to report a failed read as failed. Swallowing the
 * error would put the caller back in the position this whole surface exists to
 * get out of.
 */
export async function getActivityFeed(): Promise<FeedEvent[]> {
  return sequelize.query<FeedEvent>(
    `
      (
        SELECT a.created_at, a.type::text AS event_type, a.subject AS detail, 'activity' AS source,
               a.lead_id,
               l.name AS lead_name, l.email AS lead_email, l.lead_score,
               l.lead_source_type, l.pipeline_stage AS lead_pipeline_stage,
               NULL AS campaign_name, NULL AS campaign_type
        FROM activities a
        LEFT JOIN leads l ON a.lead_id = l.id
        ORDER BY a.created_at DESC LIMIT 20
      )
      UNION ALL
      (
        SELECT cl.created_at, cl.channel || '_' || cl.status AS event_type,
               COALESCE(cl.subject, cl.to_address, '') AS detail, 'communication' AS source,
               cl.lead_id,
               l.name AS lead_name, l.email AS lead_email, l.lead_score,
               l.lead_source_type, l.pipeline_stage AS lead_pipeline_stage,
               c.name AS campaign_name, c.type AS campaign_type
        FROM communication_logs cl
        LEFT JOIN leads l ON cl.lead_id = l.id
        LEFT JOIN campaigns c ON cl.campaign_id = c.id
        WHERE cl.status IN ('sent', 'delivered', 'failed', 'bounced')
        ORDER BY cl.created_at DESC LIMIT 20
      )
      UNION ALL
      (
        SELECT se.sent_at AS created_at, se.channel || '_sent' AS event_type,
               COALESCE(se.subject, '') AS detail, 'campaign_email' AS source,
               se.lead_id,
               l.name AS lead_name, l.email AS lead_email, l.lead_score,
               l.lead_source_type, l.pipeline_stage AS lead_pipeline_stage,
               c.name AS campaign_name, c.type AS campaign_type
        FROM scheduled_emails se
        LEFT JOIN leads l ON se.lead_id = l.id
        LEFT JOIN campaigns c ON se.campaign_id = c.id
        WHERE se.status = 'sent' AND se.sent_at IS NOT NULL
        ORDER BY se.sent_at DESC LIMIT 20
      )
      UNION ALL
      (
        SELECT e.created_at, 'enrollment_' || e.payment_status AS event_type,
               e.full_name || ' (' || e.email || ')' AS detail, 'enrollment' AS source,
               NULL AS lead_id,
               e.full_name AS lead_name, e.email AS lead_email, NULL AS lead_score,
               NULL AS lead_source_type, NULL AS lead_pipeline_stage,
               NULL AS campaign_name, NULL AS campaign_type
        FROM enrollments e
        ORDER BY e.created_at DESC LIMIT 10
      )
      UNION ALL
      (
        SELECT io.created_at, io.outcome AS event_type,
               COALESCE(io.metadata->>'subject', io.metadata->>'url', '') AS detail, 'interaction' AS source,
               io.lead_id,
               l.name AS lead_name, l.email AS lead_email, l.lead_score,
               l.lead_source_type, l.pipeline_stage AS lead_pipeline_stage,
               NULL AS campaign_name, NULL AS campaign_type
        FROM interaction_outcomes io
        LEFT JOIN leads l ON io.lead_id = l.id
        WHERE io.outcome IN ('opened', 'clicked', 'replied')
        ORDER BY io.created_at DESC LIMIT 20
      )
      UNION ALL
      (
        SELECT pe.created_at, pe.event_type AS event_type,
               CASE
                 WHEN pe.event_type = 'demo_start' THEN 'Started AI demo on ' || pe.page_url
                 WHEN pe.event_type = 'demo_complete' THEN 'Completed AI demo on ' || pe.page_url
                 WHEN pe.event_type = 'form_start' THEN 'Started form on ' || pe.page_url
                 WHEN pe.event_type = 'cta_click' THEN COALESCE(pe.event_data->>'element_text', 'CTA click') || ' on ' || pe.page_path
                 WHEN pe.event_type = 'pageview' THEN 'Visited ' || pe.page_url
                 ELSE pe.event_type || ' on ' || pe.page_path
               END AS detail,
               'visitor' AS source,
               v.lead_id,
               l.name AS lead_name, l.email AS lead_email, l.lead_score,
               l.lead_source_type, l.pipeline_stage AS lead_pipeline_stage,
               NULL AS campaign_name, NULL AS campaign_type
        FROM page_events pe
        JOIN visitors v ON v.id = pe.visitor_id
        LEFT JOIN leads l ON v.lead_id = l.id
        WHERE pe.event_type IN (${toSqlInList(WAR_ROOM_PAGE_EVENT_TYPES)})
          AND pe.event_type != 'heartbeat'
        ORDER BY pe.created_at DESC LIMIT 20
      )
      ORDER BY created_at DESC
      LIMIT 50
    `,
    { type: QueryTypes.SELECT },
  );
}
