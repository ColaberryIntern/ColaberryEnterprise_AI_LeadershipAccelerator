// ─── Campaign Intelligence System Map Service ──────────────────────────────
// Builds a deterministic 4-layer system map: SOURCE → ENTRY → CAMPAIGN → OUTCOME
// All edges flow strictly left→right. No back-links. No layer-skipping.

import { Lead, Campaign, CampaignLead, CommunicationLog, Enrollment, StrategyCall, ChatConversation } from '../../models';
import { Op } from 'sequelize';

interface CampaignGraphNode {
  id: string;
  type: 'source' | 'entry' | 'campaign' | 'outcome';
  label: string;
  count: number;
  metrics: {
    conversion_rate?: number;
    messages_sent?: number;
    active_users?: number;
  };
  source_breakdown?: Record<string, number>;
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

const LAYER_ORDER: Record<string, number> = { source: 0, entry: 1, campaign: 2, outcome: 3 };

/** Safe count — returns 0 if the table or query fails */
async function safeCount(model: any, where?: Record<string, any>): Promise<number> {
  try {
    return await model.count(where ? { where } : {});
  } catch {
    return 0;
  }
}

/** Categorize a lead source string into one of our 4 source buckets */
function categorizeSource(source: string | null): 'marketing' | 'cold_email' | 'alumni' | 'anonymous' {
  if (!source) return 'anonymous';
  const s = source.toLowerCase();
  if (s.startsWith('campaign:') || s.includes('utm_') || s.includes('utm=')) return 'marketing';
  if (s.startsWith('cold') || s.startsWith('outbound')) return 'cold_email';
  return 'anonymous';
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
  // ── Source Layer: Categorize all leads by source ──────────────────────
  let allLeads: Array<{ email: string; source: string | null }> = [];
  try {
    allLeads = await Lead.findAll({
      attributes: ['email', 'source'],
      raw: true,
    }) as any[];
  } catch { /* empty */ }

  // Get alumni emails (leads who also have enrollments)
  let alumniEmails = new Set<string>();
  try {
    const enrolledEmails = await Enrollment.findAll({
      attributes: ['email'],
      raw: true,
    }) as any[];
    alumniEmails = new Set(enrolledEmails.map((e: any) => (e.email || '').toLowerCase()).filter(Boolean));
  } catch { /* empty */ }

  // Categorize each lead
  const sourceCounts = { marketing: 0, cold_email: 0, alumni: 0, anonymous: 0 };
  const sourceLeadEmails: Record<string, Set<string>> = {
    marketing: new Set(), cold_email: new Set(), alumni: new Set(), anonymous: new Set(),
  };

  for (const lead of allLeads) {
    const email = (lead.email || '').toLowerCase();
    // Alumni check takes priority: if they have an enrollment record, they're alumni
    if (email && alumniEmails.has(email)) {
      sourceCounts.alumni++;
      sourceLeadEmails.alumni.add(email);
    } else {
      const cat = categorizeSource(lead.source);
      sourceCounts[cat]++;
      if (email) sourceLeadEmails[cat].add(email);
    }
  }

  // ── Entry Layer Counts ────────────────────────────────────────────────
  const [coryCount, strategyCallCount, sponsorshipCount, blueprintCount] = await Promise.all([
    safeCount(ChatConversation),
    safeCount(StrategyCall),
    safeCount(Lead, { sponsorship_kit_requested: true }),
    safeCount(Lead, { form_type: 'contact' }),
  ]);

  // Entry layer source breakdown: for each entry point, count leads per source category
  let sponsorLeads: Array<{ email: string; source: string | null }> = [];
  let blueprintLeads: Array<{ email: string; source: string | null }> = [];
  try {
    sponsorLeads = await Lead.findAll({
      where: { sponsorship_kit_requested: true },
      attributes: ['email', 'source'],
      raw: true,
    }) as any[];
  } catch { /* empty */ }
  try {
    blueprintLeads = await Lead.findAll({
      where: { form_type: 'contact' },
      attributes: ['email', 'source'],
      raw: true,
    }) as any[];
  } catch { /* empty */ }

  function buildSourceBreakdown(leads: Array<{ email: string; source: string | null }>): Record<string, number> {
    const bd: Record<string, number> = { marketing: 0, cold_email: 0, alumni: 0, anonymous: 0 };
    for (const l of leads) {
      const email = (l.email || '').toLowerCase();
      if (email && alumniEmails.has(email)) bd.alumni++;
      else bd[categorizeSource(l.source)]++;
    }
    return bd;
  }

  const sponsorBreakdown = buildSourceBreakdown(sponsorLeads);
  const blueprintBreakdown = buildSourceBreakdown(blueprintLeads);

  // ── Campaign Layer ────────────────────────────────────────────────────
  const [readiness, payment] = await Promise.all([
    getCampaignEnrollmentCount('briefing'),
    getCampaignEnrollmentCount('payment'),
  ]);

  const [readinessMsgs, paymentMsgs] = await Promise.all([
    getMessagesSent(readiness.campaignId),
    getMessagesSent(payment.campaignId),
  ]);

  // ── Outcome Layer ─────────────────────────────────────────────────────
  const [enrolledCount, paidCount] = await Promise.all([
    safeCount(Enrollment),
    safeCount(Enrollment, { payment_status: 'paid' }),
  ]);

  // ── Source → Entry edge volumes ───────────────────────────────────────
  // For each source bucket, estimate how many of those leads ended up at each entry point
  // We use the source_breakdown of each entry point for this
  const sourceEntryEdges: CampaignGraphEdge[] = [];
  const sourceKeys = ['marketing', 'cold_email', 'alumni', 'anonymous'] as const;
  const entryBreakdowns: Array<{ entryId: string; breakdown: Record<string, number> }> = [
    { entryId: 'entry_sponsorship', breakdown: sponsorBreakdown },
    { entryId: 'entry_blueprint', breakdown: blueprintBreakdown },
  ];

  for (const srcKey of sourceKeys) {
    for (const { entryId, breakdown } of entryBreakdowns) {
      const vol = breakdown[srcKey] || 0;
      if (vol > 0) {
        sourceEntryEdges.push({
          from: `src_${srcKey}`,
          to: entryId,
          label: 'feeds',
          volume: vol,
        });
      }
    }
    // Cory Chat and Strategy Call: distribute proportionally based on overall source ratios
    const totalLeads = allLeads.length || 1;
    const srcRatio = sourceCounts[srcKey] / totalLeads;

    const coryVol = Math.round(coryCount * srcRatio);
    if (coryVol > 0) {
      sourceEntryEdges.push({ from: `src_${srcKey}`, to: 'entry_cory', label: 'feeds', volume: coryVol });
    }
    const stratVol = Math.round(strategyCallCount * srcRatio);
    if (stratVol > 0) {
      sourceEntryEdges.push({ from: `src_${srcKey}`, to: 'entry_strategy', label: 'feeds', volume: stratVol });
    }
  }

  // ── Entry → Campaign edge volumes ─────────────────────────────────────
  const entryCampaignEdges: CampaignGraphEdge[] = [];
  // Simplified: distribute campaign enrollments across entry points proportionally
  const totalEntry = sponsorshipCount + blueprintCount + coryCount + strategyCallCount || 1;

  if (readiness.count > 0) {
    const coryShare = Math.round(readiness.count * (coryCount / totalEntry));
    const bpShare = Math.round(readiness.count * (blueprintCount / totalEntry));
    if (coryShare > 0) entryCampaignEdges.push({ from: 'entry_cory', to: 'campaign_readiness', label: 'enrolls', volume: coryShare });
    if (bpShare > 0) entryCampaignEdges.push({ from: 'entry_blueprint', to: 'campaign_readiness', label: 'enrolls', volume: bpShare });
  }
  if (payment.count > 0) {
    const stratShare = Math.round(payment.count * (strategyCallCount / totalEntry));
    const sponsorShare = Math.round(payment.count * (sponsorshipCount / totalEntry));
    if (stratShare > 0) entryCampaignEdges.push({ from: 'entry_strategy', to: 'campaign_payment', label: 'enrolls', volume: stratShare });
    if (sponsorShare > 0) entryCampaignEdges.push({ from: 'entry_sponsorship', to: 'campaign_payment', label: 'enrolls', volume: sponsorShare });
  }

  // ── Campaign → Outcome edge volumes ───────────────────────────────────
  const campaignOutcomeEdges: CampaignGraphEdge[] = [];
  if (readiness.count > 0 && enrolledCount > 0) {
    const readinessToEnrolled = Math.round(enrolledCount * (readiness.count / (readiness.count + payment.count || 1)));
    if (readinessToEnrolled > 0) campaignOutcomeEdges.push({ from: 'campaign_readiness', to: 'outcome_enrolled', label: 'converts', volume: readinessToEnrolled });
  }
  if (payment.count > 0 && paidCount > 0) {
    campaignOutcomeEdges.push({ from: 'campaign_payment', to: 'outcome_paid', label: 'converts', volume: paidCount });
  }
  if (readiness.count > 0 && paidCount > 0) {
    const readinessToPaid = Math.round(paidCount * (readiness.count / (readiness.count + payment.count || 1)));
    if (readinessToPaid > 0) campaignOutcomeEdges.push({ from: 'campaign_readiness', to: 'outcome_paid', label: 'converts', volume: readinessToPaid });
  }
  if (payment.count > 0 && enrolledCount > 0) {
    const paymentToEnrolled = Math.round(enrolledCount * (payment.count / (readiness.count + payment.count || 1)));
    if (paymentToEnrolled > 0) campaignOutcomeEdges.push({ from: 'campaign_payment', to: 'outcome_enrolled', label: 'converts', volume: paymentToEnrolled });
  }

  // ── Build Nodes ───────────────────────────────────────────────────────
  const nodes: CampaignGraphNode[] = [
    // Sources
    { id: 'src_marketing', type: 'source', label: 'Marketing', count: sourceCounts.marketing, metrics: {} },
    { id: 'src_cold_email', type: 'source', label: 'Cold Email', count: sourceCounts.cold_email, metrics: {} },
    { id: 'src_alumni', type: 'source', label: 'Alumni Network', count: sourceCounts.alumni, metrics: {} },
    { id: 'src_anonymous', type: 'source', label: 'Anonymous / Direct', count: sourceCounts.anonymous, metrics: {} },

    // Entry points
    { id: 'entry_cory', type: 'entry', label: 'Cory Chat', count: coryCount, metrics: {}, source_breakdown: undefined },
    { id: 'entry_blueprint', type: 'entry', label: 'Blueprint Signup', count: blueprintCount, metrics: { conversion_rate: allLeads.length > 0 ? Math.round((blueprintCount / allLeads.length) * 100) : 0 }, source_breakdown: blueprintBreakdown },
    { id: 'entry_sponsorship', type: 'entry', label: 'Sponsorship Form', count: sponsorshipCount, metrics: { conversion_rate: allLeads.length > 0 ? Math.round((sponsorshipCount / allLeads.length) * 100) : 0 }, source_breakdown: sponsorBreakdown },
    { id: 'entry_strategy', type: 'entry', label: 'Strategy Call', count: strategyCallCount, metrics: {}, source_breakdown: undefined },

    // Campaigns
    { id: 'campaign_readiness', type: 'campaign', label: 'Class Readiness', count: readiness.count, metrics: { active_users: readiness.activeCount, messages_sent: readinessMsgs, conversion_rate: readiness.count > 0 ? Math.round((enrolledCount / Math.max(readiness.count, 1)) * 100) : 0 } },
    { id: 'campaign_payment', type: 'campaign', label: 'Payment Readiness', count: payment.count, metrics: { active_users: payment.activeCount, messages_sent: paymentMsgs, conversion_rate: payment.count > 0 ? Math.round((paidCount / Math.max(payment.count, 1)) * 100) : 0 } },

    // Outcomes
    { id: 'outcome_enrolled', type: 'outcome', label: 'Enrolled', count: enrolledCount, metrics: {} },
    { id: 'outcome_paid', type: 'outcome', label: 'Paid', count: paidCount, metrics: { conversion_rate: enrolledCount > 0 ? Math.round((paidCount / enrolledCount) * 100) : 0 } },
  ];

  // ── Build Edges (all L→R, validated) ──────────────────────────────────
  const allEdges = [...sourceEntryEdges, ...entryCampaignEdges, ...campaignOutcomeEdges];

  // Validate: only keep edges where source layer < target layer
  const nodeTypeMap = new Map(nodes.map(n => [n.id, n.type]));
  const edges = allEdges.filter(e => {
    const srcLayer = LAYER_ORDER[nodeTypeMap.get(e.from) || ''] ?? -1;
    const tgtLayer = LAYER_ORDER[nodeTypeMap.get(e.to) || ''] ?? -1;
    if (srcLayer >= tgtLayer) {
      console.warn(`[SystemMap] Filtered invalid edge: ${e.from} (layer ${srcLayer}) → ${e.to} (layer ${tgtLayer})`);
      return false;
    }
    return true;
  });

  return { nodes, edges };
}
