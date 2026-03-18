// ─── Campaign Intelligence Graph Service ──────────────────────────────────
// Builds node/edge graph data for the Campaign Intelligence Graph visualization.
// Queries real data from leads, campaigns, campaign_leads, communication_logs, enrollments.

import { Lead, Campaign, CampaignLead, CommunicationLog, Enrollment, StrategyCall, Visitor, ChatConversation } from '../../models';
import { Op } from 'sequelize';

interface CampaignGraphNode {
  id: string;
  type: 'entry_point' | 'campaign' | 'lead_pool' | 'conversion';
  label: string;
  count: number;
  metrics: {
    conversion_rate?: number;
    messages_sent?: number;
    active_users?: number;
  };
}

interface CampaignGraphEdge {
  from: string;
  to: string;
  label: string;
  volume?: number;
}

interface CampaignGraphData {
  nodes: CampaignGraphNode[];
  edges: CampaignGraphEdge[];
}

/** Safe count — returns 0 if the table or query fails */
async function safeCount(model: any, where?: Record<string, any>): Promise<number> {
  try {
    return await model.count(where ? { where } : {});
  } catch {
    return 0;
  }
}

/** Get campaign_leads count for a campaign matched by name pattern */
async function getCampaignEnrollmentCount(namePattern: string): Promise<{ campaignId: string | null; count: number; activeCount: number }> {
  try {
    const campaign = await Campaign.findOne({
      where: { name: { [Op.iLike]: `%${namePattern}%` } },
      attributes: ['id'],
      raw: true,
    });
    if (!campaign) return { campaignId: null, count: 0, activeCount: 0 };
    const id = (campaign as any).id;
    const count = await CampaignLead.count({ where: { campaign_id: id } });
    const activeCount = await CampaignLead.count({ where: { campaign_id: id, status: { [Op.in]: ['enrolled', 'active'] } } });
    return { campaignId: id, count, activeCount };
  } catch {
    return { campaignId: null, count: 0, activeCount: 0 };
  }
}

/** Get messages sent for a campaign */
async function getMessagesSent(campaignId: string | null): Promise<number> {
  if (!campaignId) return 0;
  try {
    return await CommunicationLog.count({ where: { campaign_id: campaignId } });
  } catch {
    return 0;
  }
}

export async function getCampaignGraphData(): Promise<CampaignGraphData> {
  // ── Entry Point Counts ──────────────────────────────────────────────
  const [
    sponsorshipCount,
    blueprintCount,
    strategyCallCount,
    coryCount,
    emailOutboundCount,
  ] = await Promise.all([
    safeCount(Lead, { sponsorship_kit_requested: true }),
    safeCount(Lead, { form_type: 'contact' }),
    safeCount(StrategyCall),
    safeCount(ChatConversation),
    safeCount(CommunicationLog, { channel: 'email', direction: 'outbound' }),
  ]);

  // ── Pool Counts ─────────────────────────────────────────────────────
  const [leadCount, visitorCount] = await Promise.all([
    safeCount(Lead),
    safeCount(Visitor),
  ]);

  // ── Campaign Counts ─────────────────────────────────────────────────
  const [briefing, payment, strategyCampaign] = await Promise.all([
    getCampaignEnrollmentCount('briefing'),
    getCampaignEnrollmentCount('payment'),
    getCampaignEnrollmentCount('strategy'),
  ]);

  // ── Campaign Messages ───────────────────────────────────────────────
  const [briefingMsgs, paymentMsgs, strategyMsgs] = await Promise.all([
    getMessagesSent(briefing.campaignId),
    getMessagesSent(payment.campaignId),
    getMessagesSent(strategyCampaign.campaignId),
  ]);

  // ── Conversion Counts ───────────────────────────────────────────────
  const [paidCount, enrolledCount] = await Promise.all([
    safeCount(Enrollment, { payment_status: 'paid' }),
    safeCount(Enrollment),
  ]);

  // ── Build Nodes ─────────────────────────────────────────────────────
  const nodes: CampaignGraphNode[] = [
    // Entry points
    { id: 'entry_sponsorship', type: 'entry_point', label: 'Sponsorship Form', count: sponsorshipCount, metrics: { conversion_rate: leadCount > 0 ? Math.round((sponsorshipCount / leadCount) * 100) : 0 } },
    { id: 'entry_blueprint', type: 'entry_point', label: 'Blueprint Signup', count: blueprintCount, metrics: { conversion_rate: leadCount > 0 ? Math.round((blueprintCount / leadCount) * 100) : 0 } },
    { id: 'entry_strategy', type: 'entry_point', label: 'Strategy Call', count: strategyCallCount, metrics: { conversion_rate: leadCount > 0 ? Math.round((strategyCallCount / leadCount) * 100) : 0 } },
    { id: 'entry_cory', type: 'entry_point', label: 'Cory Chat', count: coryCount, metrics: {} },
    { id: 'entry_email', type: 'entry_point', label: 'Email Campaign', count: emailOutboundCount, metrics: { messages_sent: emailOutboundCount } },

    // Pools
    { id: 'pool_leads', type: 'lead_pool', label: 'Leads', count: leadCount, metrics: { active_users: leadCount } },
    { id: 'pool_visitors', type: 'lead_pool', label: 'Visitors', count: visitorCount, metrics: { active_users: visitorCount } },

    // Campaigns
    { id: 'campaign_briefing', type: 'campaign', label: 'Executive Briefing', count: briefing.count, metrics: { active_users: briefing.activeCount, messages_sent: briefingMsgs, conversion_rate: briefing.count > 0 ? Math.round((briefing.activeCount / briefing.count) * 100) : 0 } },
    { id: 'campaign_payment', type: 'campaign', label: 'Payment Readiness', count: payment.count, metrics: { active_users: payment.activeCount, messages_sent: paymentMsgs, conversion_rate: payment.count > 0 ? Math.round((paidCount / Math.max(payment.count, 1)) * 100) : 0 } },
    { id: 'campaign_strategy', type: 'campaign', label: 'Strategy Follow-up', count: strategyCampaign.count, metrics: { active_users: strategyCampaign.activeCount, messages_sent: strategyMsgs, conversion_rate: strategyCampaign.count > 0 ? Math.round((strategyCallCount / Math.max(strategyCampaign.count, 1)) * 100) : 0 } },

    // Conversions
    { id: 'conversion_paid', type: 'conversion', label: 'Paid', count: paidCount, metrics: { conversion_rate: enrolledCount > 0 ? Math.round((paidCount / enrolledCount) * 100) : 0 } },
    { id: 'conversion_enrolled', type: 'conversion', label: 'Enrolled', count: enrolledCount, metrics: {} },
  ];

  // ── Build Edges ─────────────────────────────────────────────────────
  const edges: CampaignGraphEdge[] = [
    // Entry → Leads
    { from: 'entry_sponsorship', to: 'pool_leads', label: 'generates', volume: sponsorshipCount },
    { from: 'entry_blueprint', to: 'pool_leads', label: 'generates', volume: blueprintCount },
    { from: 'entry_strategy', to: 'pool_leads', label: 'generates', volume: strategyCallCount },
    { from: 'entry_cory', to: 'pool_leads', label: 'qualifies', volume: coryCount },
    { from: 'entry_email', to: 'pool_leads', label: 'nurtures', volume: emailOutboundCount },

    // Visitors → Leads
    { from: 'pool_visitors', to: 'pool_leads', label: 'converts', volume: leadCount },

    // Leads → Campaigns
    { from: 'pool_leads', to: 'campaign_briefing', label: 'enrolled', volume: briefing.count },
    { from: 'pool_leads', to: 'campaign_payment', label: 'enrolled', volume: payment.count },
    { from: 'pool_leads', to: 'campaign_strategy', label: 'enrolled', volume: strategyCampaign.count },

    // Campaigns → Conversions
    { from: 'campaign_briefing', to: 'entry_strategy', label: 'triggers', volume: strategyCallCount },
    { from: 'campaign_payment', to: 'conversion_paid', label: 'converts', volume: paidCount },
    { from: 'campaign_strategy', to: 'entry_strategy', label: 'books', volume: strategyCallCount },

    // Paid → Enrolled
    { from: 'conversion_paid', to: 'conversion_enrolled', label: 'completes', volume: enrolledCount },
  ];

  return { nodes, edges };
}
