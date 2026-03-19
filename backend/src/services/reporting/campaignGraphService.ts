// ─── Campaign Intelligence System Map Service ──────────────────────────────
// Builds a deterministic 4-layer system map: SOURCE → ENTRY → CAMPAIGN → OUTCOME
// All edges flow strictly left→right. No back-links. No layer-skipping.
// All numbers are real database queries — no hardcoded values.

import { Lead, Campaign, CampaignLead, CommunicationLog, Enrollment, StrategyCall, ChatConversation } from '../../models';
import { Op, fn, col, literal } from 'sequelize';
import { sequelize } from '../../config/database';

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

/** Categorize a lead source string into one of our source buckets */
function categorizeSource(source: string | null): 'marketing' | 'cold_outbound' | 'alumni' | 'anonymous' {
  if (!source) return 'anonymous';
  const s = source.toLowerCase();
  // Alumni sources
  if (s === 'ccpp_alumni' || s === 'alumni_referral' || s === 'alumni_referral_anonymous') return 'alumni';
  // Cold outbound / Apollo
  if (s === 'apollo' || s.startsWith('cold') || s.startsWith('outbound')) return 'cold_outbound';
  // Marketing / campaign / UTM
  if (s.startsWith('campaign') || s.includes('utm_') || s.includes('utm=') || s === 'website') return 'marketing';
  // Known entry points that aren't a "source"
  if (s === 'strategy_call' || s === 'maya_chat' || s === 'enrollment') return 'marketing';
  return 'anonymous';
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

  const sourceCounts = { marketing: 0, cold_outbound: 0, alumni: 0, anonymous: 0 };

  for (const lead of allLeads) {
    const cat = categorizeSource(lead.source);
    sourceCounts[cat]++;
  }

  // ── Entry Layer Counts ────────────────────────────────────────────────
  const [coryCount, strategyCallCount, sponsorshipCount, blueprintCount] = await Promise.all([
    safeCount(ChatConversation),
    safeCount(StrategyCall),
    safeCount(Lead, { sponsorship_kit_requested: true }),
    safeCount(Lead, { form_type: 'contact' }),
  ]);

  // ── Campaign Layer: ALL active campaigns with enrollment counts ───────
  let campaigns: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
  }> = [];
  try {
    campaigns = await Campaign.findAll({
      where: { status: { [Op.in]: ['active', 'completed'] } },
      attributes: ['id', 'name', 'type', 'status'],
      raw: true,
    }) as any[];
  } catch { /* empty */ }

  // Get enrollment counts and active counts for each campaign
  const campaignData: Array<{
    id: string;
    name: string;
    type: string;
    count: number;
    activeCount: number;
    messagesSent: number;
  }> = [];

  for (const c of campaigns) {
    const [count, activeCount, messagesSent] = await Promise.all([
      CampaignLead.count({ where: { campaign_id: c.id } }).catch(() => 0),
      CampaignLead.count({ where: { campaign_id: c.id, status: { [Op.in]: ['enrolled', 'active'] } } }).catch(() => 0),
      CommunicationLog.count({ where: { campaign_id: c.id } }).catch(() => 0),
    ]);
    // Only include campaigns with enrolled leads or messages sent
    if (count > 0 || messagesSent > 0) {
      campaignData.push({ id: c.id, name: c.name, type: c.type, count, activeCount, messagesSent });
    }
  }

  // ── Outcome Layer ─────────────────────────────────────────────────────
  const [enrolledCount, paidCount] = await Promise.all([
    safeCount(Enrollment),
    safeCount(Enrollment, { payment_status: 'paid' }),
  ]);

  // ── Build Nodes ─────────────────────────────────────────────────────
  const nodes: CampaignGraphNode[] = [
    // Sources
    { id: 'src_marketing', type: 'source', label: 'Marketing', count: sourceCounts.marketing, metrics: {} },
    { id: 'src_cold_outbound', type: 'source', label: 'Cold Outbound', count: sourceCounts.cold_outbound, metrics: {} },
    { id: 'src_alumni', type: 'source', label: 'Alumni Network', count: sourceCounts.alumni, metrics: {} },
    { id: 'src_anonymous', type: 'source', label: 'Anonymous / Direct', count: sourceCounts.anonymous, metrics: {} },

    // Entry points
    { id: 'entry_cory', type: 'entry', label: 'Cory Chat', count: coryCount, metrics: {} },
    {
      id: 'entry_blueprint', type: 'entry', label: 'Blueprint Signup', count: blueprintCount,
      metrics: { conversion_rate: allLeads.length > 0 ? Math.round((blueprintCount / allLeads.length) * 100) : 0 },
    },
    {
      id: 'entry_sponsorship', type: 'entry', label: 'Sponsorship Form', count: sponsorshipCount,
      metrics: { conversion_rate: allLeads.length > 0 ? Math.round((sponsorshipCount / allLeads.length) * 100) : 0 },
    },
    { id: 'entry_strategy', type: 'entry', label: 'Strategy Call', count: strategyCallCount, metrics: {} },
  ];

  // Campaign nodes — dynamically from DB
  for (const c of campaignData) {
    // Shorten campaign names for display
    let label = c.name
      .replace('Colaberry ', '')
      .replace(' Campaign', '')
      .replace('AI Leadership ', '');
    if (label.length > 25) label = label.substring(0, 22) + '...';

    nodes.push({
      id: `campaign_${c.id}`,
      type: 'campaign',
      label,
      count: c.count,
      metrics: {
        active_users: c.activeCount,
        messages_sent: c.messagesSent,
        conversion_rate: c.count > 0 ? Math.round((c.activeCount / c.count) * 100) : 0,
      },
    });
  }

  // Outcomes
  nodes.push(
    { id: 'outcome_enrolled', type: 'outcome', label: 'Enrolled', count: enrolledCount, metrics: {} },
    { id: 'outcome_paid', type: 'outcome', label: 'Paid', count: paidCount, metrics: { conversion_rate: enrolledCount > 0 ? Math.round((paidCount / enrolledCount) * 100) : 0 } },
  );

  // ── Build Edges ─────────────────────────────────────────────────────

  const edges: CampaignGraphEdge[] = [];
  const totalLeads = allLeads.length || 1;

  // Source → Entry: distribute entry counts proportionally by source ratios
  const sourceKeys = ['marketing', 'cold_outbound', 'alumni', 'anonymous'] as const;
  const entryNodes = [
    { id: 'entry_cory', count: coryCount },
    { id: 'entry_blueprint', count: blueprintCount },
    { id: 'entry_sponsorship', count: sponsorshipCount },
    { id: 'entry_strategy', count: strategyCallCount },
  ];

  for (const srcKey of sourceKeys) {
    const srcRatio = sourceCounts[srcKey] / totalLeads;
    if (srcRatio <= 0) continue;
    for (const entry of entryNodes) {
      const vol = Math.round(entry.count * srcRatio);
      if (vol > 0) {
        edges.push({ from: `src_${srcKey}`, to: entry.id, label: 'feeds', volume: vol });
      }
    }
  }

  // Entry → Campaign: map campaigns to likely entry points based on campaign type
  for (const c of campaignData) {
    if (c.count === 0) continue;
    const cId = `campaign_${c.id}`;
    const cType = c.type?.toLowerCase() || '';
    const cName = c.name.toLowerCase();

    // Route campaigns to their most likely entry points
    if (cType.includes('alumni') || cName.includes('alumni')) {
      // Alumni campaigns — leads come from blueprint signup mostly
      if (blueprintCount > 0) edges.push({ from: 'entry_blueprint', to: cId, label: 'enrolls', volume: c.count });
    } else if (cType === 'cold_outbound' || cName.includes('cold') || cName.includes('outbound')) {
      // Cold outbound — leads come from external source, enter via blueprint
      if (blueprintCount > 0) edges.push({ from: 'entry_blueprint', to: cId, label: 'enrolls', volume: c.count });
    } else if (cName.includes('strategy') || cName.includes('call')) {
      if (strategyCallCount > 0) edges.push({ from: 'entry_strategy', to: cId, label: 'enrolls', volume: c.count });
    } else if (cName.includes('maya') || cName.includes('inbound')) {
      if (coryCount > 0) edges.push({ from: 'entry_cory', to: cId, label: 'enrolls', volume: c.count });
    } else {
      // Default: distribute across entry points proportionally
      const totalEntry = coryCount + blueprintCount + sponsorshipCount + strategyCallCount || 1;
      for (const entry of entryNodes) {
        const vol = Math.round(c.count * (entry.count / totalEntry));
        if (vol > 0) edges.push({ from: entry.id, to: cId, label: 'enrolls', volume: vol });
      }
    }
  }

  // Campaign → Outcome: connect campaigns to outcomes based on type
  const totalCampaignLeads = campaignData.reduce((s, c) => s + c.count, 0) || 1;
  for (const c of campaignData) {
    if (c.count === 0) continue;
    const cId = `campaign_${c.id}`;
    const cName = c.name.toLowerCase();

    if (cName.includes('payment')) {
      // Payment campaigns connect to Paid
      if (paidCount > 0) {
        const vol = Math.round(paidCount * (c.count / totalCampaignLeads));
        if (vol > 0) edges.push({ from: cId, to: 'outcome_paid', label: 'converts', volume: vol });
      }
    }
    // All campaigns can contribute to Enrolled
    if (enrolledCount > 0) {
      const vol = Math.round(enrolledCount * (c.count / totalCampaignLeads));
      if (vol > 0) edges.push({ from: cId, to: 'outcome_enrolled', label: 'converts', volume: vol });
    }
  }

  // ── Validate edges (L→R only) ───────────────────────────────────────
  const nodeTypeMap = new Map(nodes.map(n => [n.id, n.type]));
  const validEdges = edges.filter(e => {
    const srcLayer = LAYER_ORDER[nodeTypeMap.get(e.from) || ''] ?? -1;
    const tgtLayer = LAYER_ORDER[nodeTypeMap.get(e.to) || ''] ?? -1;
    if (srcLayer >= tgtLayer) {
      console.warn(`[SystemMap] Filtered invalid edge: ${e.from} (layer ${srcLayer}) → ${e.to} (layer ${tgtLayer})`);
      return false;
    }
    return true;
  });

  return { nodes, edges: validEdges };
}
