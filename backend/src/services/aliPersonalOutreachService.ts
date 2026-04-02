// ─── Ali Personal Outreach Service ──────────────────────────────────────────
// Detects high-intent leads and enrolls them in the "Ali Personal Outreach"
// campaign (type: executive_outreach). The campaign runs independently —
// leads stay in their existing campaigns.
// Emails are sent FROM ali@colaberry.com. Ali handles all replies personally.

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { Campaign } from '../models';
import { enrollLeadsInCampaign } from './campaignService';

const MAX_ENROLL_PER_DAY = 50;
const CAMPAIGN_NAME = 'Ali Personal Outreach';

/** Ali's signature — plain text style like Gmail, not a styled corporate block */
export const ALI_SIGNATURE = `
<br><br>
--<br>
Ali Muwwakkil<br>
Managing Director<br>
Data Scientist | AI Systems Architect<br>
200 Chisholm Place, Suite 200 Plano, TX 75075`;

/**
 * Find high-intent leads who haven't been enrolled in Ali Personal Outreach yet.
 * Criteria (any): 2+ clicks, clicked booking link, Maya conversation >30s, hot/qualified temp
 */
export async function findHighIntentLeads(): Promise<any[]> {
  const leads = await sequelize.query(`
    SELECT DISTINCT sub.lead_id, l.name, l.email, l.company, l.title, l.lead_temperature,
      sub.click_count, sub.has_booking_click, sub.has_maya_convo
    FROM (
      SELECT io.lead_id,
        COUNT(*) FILTER (WHERE io.outcome = 'clicked') as click_count,
        COUNT(*) FILTER (WHERE io.outcome = 'clicked' AND io.metadata->>'url' LIKE '%ai-architect%') > 0 as has_booking_click,
        EXISTS (
          SELECT 1 FROM communication_logs cl
          WHERE cl.lead_id = io.lead_id AND cl.channel = 'voice'
          AND cl.provider_response->>'duration' IS NOT NULL
          AND CAST(cl.provider_response->>'duration' AS int) > 30
        ) as has_maya_convo
      FROM interaction_outcomes io
      GROUP BY io.lead_id
      HAVING COUNT(*) FILTER (WHERE io.outcome = 'clicked') >= 2
        OR COUNT(*) FILTER (WHERE io.outcome = 'clicked' AND io.metadata->>'url' LIKE '%ai-architect%') > 0
    ) sub
    JOIN leads l ON l.id = sub.lead_id
    WHERE (
      sub.click_count >= 2
      OR sub.has_booking_click
      OR sub.has_maya_convo
      OR l.lead_temperature IN ('hot', 'qualified')
    )
    AND NOT EXISTS (
      SELECT 1 FROM campaign_leads cl2
      JOIN campaigns c ON c.id = cl2.campaign_id
      WHERE cl2.lead_id = sub.lead_id
      AND c.type = 'executive_outreach'
    )
    AND NOT EXISTS (
      SELECT 1 FROM communication_logs cl3
      WHERE cl3.lead_id = sub.lead_id
      AND cl3.metadata->>'trigger' = 'ali_personal_outreach'
    )
    AND NOT EXISTS (
      SELECT 1 FROM strategy_calls sc WHERE sc.email = l.email
    )
    AND l.email IS NOT NULL AND l.email != ''
    ORDER BY sub.click_count DESC
  `, { type: QueryTypes.SELECT });

  return leads as any[];
}

/**
 * Run the Ali personal outreach enrollment cycle.
 * Called by scheduler every hour during business hours.
 * Finds high-intent leads and enrolls them in the Ali Personal Outreach campaign.
 */
export async function runAliPersonalOutreach(): Promise<void> {
  // Find the campaign
  const campaign = await Campaign.findOne({ where: { name: CAMPAIGN_NAME, type: 'executive_outreach' } });
  if (!campaign) {
    console.warn('[AliOutreach] Campaign not found — run seed first');
    return;
  }

  if (campaign.status !== 'active') {
    console.log(`[AliOutreach] Campaign is ${campaign.status} — skipping`);
    return;
  }

  // Check daily enrollment cap
  const todayStr = new Date().toISOString().slice(0, 10);
  const [enrolledToday] = await sequelize.query(`
    SELECT COUNT(*) as cnt FROM campaign_leads
    WHERE campaign_id = :campaignId
    AND enrolled_at >= :today::date
  `, { replacements: { campaignId: campaign.id, today: todayStr }, type: QueryTypes.SELECT }) as any[];

  const enrolledCount = parseInt(enrolledToday?.cnt || '0', 10);
  if (enrolledCount >= MAX_ENROLL_PER_DAY) {
    console.log(`[AliOutreach] Daily enrollment cap reached (${enrolledCount}/${MAX_ENROLL_PER_DAY})`);
    return;
  }

  const remaining = MAX_ENROLL_PER_DAY - enrolledCount;
  const leads = await findHighIntentLeads();

  if (leads.length === 0) {
    console.log('[AliOutreach] No new high-intent leads to enroll');
    return;
  }

  console.log(`[AliOutreach] Found ${leads.length} high-intent leads, enrolling up to ${remaining}`);

  const toEnroll = leads.slice(0, remaining);
  const leadIds = toEnroll.map((l: any) => l.lead_id);
  const results = await enrollLeadsInCampaign(campaign.id, leadIds);

  // Stamp original_campaign_type on scheduled_email metadata so the AI prompt
  // knows whether this lead is alumni vs cold_outbound without relying solely
  // on the composite context graph (belt-and-suspenders).
  for (const lead of toEnroll) {
    try {
      const [origCampaign] = await sequelize.query(`
        SELECT c.type FROM campaign_leads cl
        JOIN campaigns c ON c.id = cl.campaign_id
        WHERE cl.lead_id = :leadId AND c.type IN ('alumni', 'cold_outbound')
        LIMIT 1
      `, { replacements: { leadId: lead.lead_id }, type: QueryTypes.SELECT }) as any[];

      const originalCampaignType = origCampaign?.type || 'unknown';

      await sequelize.query(`
        UPDATE scheduled_emails
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('original_campaign_type', :origType)
        WHERE lead_id = :leadId AND campaign_id = :campaignId AND status = 'pending'
      `, {
        replacements: {
          origType: originalCampaignType,
          leadId: lead.lead_id,
          campaignId: campaign.id,
        },
        type: QueryTypes.UPDATE,
      });

      if (originalCampaignType !== 'unknown') {
        console.log(`[AliOutreach] Stamped original_campaign_type=${originalCampaignType} on lead ${lead.lead_id} (${lead.email})`);
      }
    } catch (err: any) {
      console.warn(`[AliOutreach] Failed to stamp campaign type for lead ${lead.lead_id}: ${err.message}`);
    }
  }

  const enrolled = results.filter(r => r.status === 'enrolled' || r.status === 'active_enrolled').length;
  const skipped = results.filter(r => r.status === 'already_enrolled').length;

  if (enrolled > 0) {
    console.log(`[AliOutreach] Enrolled ${enrolled} leads in Ali Personal Outreach (${skipped} already enrolled, ${enrolledCount + enrolled}/${MAX_ENROLL_PER_DAY} today)`);
  }
}
