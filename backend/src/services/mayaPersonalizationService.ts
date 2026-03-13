// ─── Maya Personalization Service ─────────────────────────────────────────────
// Aggregates visitor/lead data into a context block for Maya's system prompt.

import { Lead, Visitor } from '../models';
import AdmissionsActionLog from '../models/AdmissionsActionLog';
import { CampaignLead, Campaign } from '../models';

/**
 * Build a personalized context block for Maya's system prompt.
 * Includes lead data, campaign enrollment, and recent Maya actions.
 */
export async function buildPersonalizedContext(
  visitorId: string,
  leadId?: number | null,
): Promise<string | null> {
  const parts: string[] = [];

  try {
    // Visitor data
    const visitor = await Visitor.findByPk(visitorId);
    if (visitor) {
      const sessions = (visitor as any).total_sessions || 1;
      const firstSeen = (visitor as any).first_seen_at || (visitor as any).created_at;
      const utmSource = (visitor as any).utm_source;

      if (sessions > 1 || utmSource) {
        const visitorParts: string[] = [];
        if (sessions > 1) visitorParts.push(`${sessions} total sessions`);
        if (utmSource) visitorParts.push(`arrived via ${utmSource}`);
        if (firstSeen) {
          const daysAgo = Math.floor((Date.now() - new Date(firstSeen).getTime()) / (1000 * 60 * 60 * 24));
          if (daysAgo > 0) visitorParts.push(`first visited ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`);
        }
        parts.push(`VISITOR PROFILE: ${visitorParts.join(', ')}`);
      }
    }

    // Lead data
    const resolvedLeadId = leadId || visitor?.lead_id;
    if (resolvedLeadId) {
      const lead = await Lead.findByPk(resolvedLeadId);
      if (lead) {
        const leadParts: string[] = [];
        const name = lead.getDataValue('name');
        if (name) leadParts.push(`Name: ${name}`);
        if (lead.company) leadParts.push(`Company: ${lead.company}`);
        if ((lead as any).title) leadParts.push(`Title: ${(lead as any).title}`);
        if ((lead as any).lead_score) leadParts.push(`Lead score: ${(lead as any).lead_score}`);
        if ((lead as any).pipeline_stage) leadParts.push(`Stage: ${(lead as any).pipeline_stage}`);
        if ((lead as any).interest_area) leadParts.push(`Interest: ${(lead as any).interest_area}`);

        if (leadParts.length > 0) {
          parts.push(`LEAD DATA: ${leadParts.join(' | ')}`);
        }

        // Campaign enrollment
        try {
          const enrollments = await CampaignLead.findAll({
            where: { lead_id: resolvedLeadId },
            include: [{ model: Campaign, as: 'campaign', attributes: ['name', 'status'] }],
            limit: 5,
            order: [['enrolled_at', 'DESC']],
          });

          if (enrollments.length > 0) {
            const campaignList = enrollments
              .map((e: any) => {
                const cName = e.campaign?.name || 'Unknown';
                return `${cName} (${e.status})`;
              })
              .join(', ');
            parts.push(`CAMPAIGNS: ${campaignList}`);
          }
        } catch {
          // Campaign data is non-critical
        }
      }
    }

    // Recent Maya actions
    try {
      const recentActions = await AdmissionsActionLog.findAll({
        where: { visitor_id: visitorId, agent_name: 'Maya' },
        order: [['created_at', 'DESC']],
        limit: 10,
      });

      if (recentActions.length > 0) {
        const actionSummary = recentActions
          .map((a: any) => `${a.action_type}: ${a.status}`)
          .join(', ');
        parts.push(`RECENT MAYA ACTIONS: ${actionSummary}`);
      }
    } catch {
      // Action log is non-critical
    }
  } catch {
    // Personalization is entirely non-critical
    return null;
  }

  return parts.length > 0 ? parts.join('\n') : null;
}
