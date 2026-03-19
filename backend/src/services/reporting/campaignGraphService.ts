// ─── Campaign Intelligence: User Path Truth Engine ──────────────────────────
// Builds a 4-layer system map: SOURCE → ENTRY → CAMPAIGN → OUTCOME
// ALL edges and counts are derived from real per-lead path tracing.
// NO proportional estimates. NO inferred paths. NO assumptions.

import { Lead, Campaign, CampaignLead, CommunicationLog, Enrollment, StrategyCall, ChatConversation } from '../../models';
import { Op, fn, col } from 'sequelize';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CampaignGraphNode {
  id: string;
  type: 'source' | 'entry' | 'campaign' | 'outcome';
  label: string;
  count: number;
  metrics: {
    conversion_rate?: number;
    messages_sent?: number;
    active_users?: number;
    engaged_count?: number;
    unengaged_count?: number;
  };
  source_breakdown?: Record<string, number>;
}

export interface CampaignGraphEdge {
  from: string;
  to: string;
  label: string;
  volume?: number;
}

export interface CampaignGraphValidation {
  total_leads: number;
  leads_with_first_touch: number;
  leads_unengaged: number;
  leads_in_campaigns: number;
  leads_enrolled: number;
  leads_paid: number;
  warnings: string[];
}

export interface CampaignGraphData {
  nodes: CampaignGraphNode[];
  edges: CampaignGraphEdge[];
  validation: CampaignGraphValidation;
}

export interface LeadPathRecord {
  lead_id: number;
  email: string;
  name: string;
  company: string | null;
  source_category: 'marketing' | 'cold_outbound' | 'alumni' | 'anonymous';
  raw_source: string | null;
  pipeline_stage: string | null;
  first_touch: {
    type: 'cory_chat' | 'blueprint' | 'sponsorship' | 'strategy_call' | 'executive_overview' | 'referral' | null;
    timestamp: Date | null;
  };
  campaign_enrollments: Array<{
    campaign_id: string;
    campaign_name: string;
    enrolled_at: Date;
  }>;
  outcome: { enrolled: boolean; paid: boolean };
  created_at: Date;
}

export interface GraphUserRecord {
  id: number;
  name: string;
  email: string;
  company: string | null;
  source: string | null;
  source_category: string;
  first_touch: string | null;
  pipeline_stage: string | null;
  created_at: Date;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const LAYER_ORDER: Record<string, number> = { source: 0, entry: 1, campaign: 2, outcome: 3 };

// ─── Cache ──────────────────────────────────────────────────────────────────

let graphCache: { data: CampaignGraphData; leadPaths: LeadPathRecord[]; ts: number } | null = null;
const CACHE_TTL = 60_000;

export function clearGraphCache(): void {
  graphCache = null;
}

// ─── Source categorization (verified correct against production DB) ──────────

function categorizeSource(source: string | null): 'marketing' | 'cold_outbound' | 'alumni' | 'anonymous' {
  if (!source) return 'anonymous';
  const s = source.toLowerCase();
  if (s === 'ccpp_alumni' || s === 'alumni_referral' || s === 'alumni_referral_anonymous') return 'alumni';
  if (s === 'apollo' || s.startsWith('cold') || s.startsWith('outbound')) return 'cold_outbound';
  if (s.startsWith('campaign') || s.includes('utm_') || s.includes('utm=') || s === 'website') return 'marketing';
  if (s === 'strategy_call' || s === 'maya_chat' || s === 'enrollment') return 'marketing';
  return 'anonymous';
}

// ─── Phase 1: Build per-lead journey records ────────────────────────────────

async function buildLeadPaths(): Promise<LeadPathRecord[]> {
  // 6 parallel queries
  const [allLeads, chatsByLead, strategyCalls, campaignEnrollments, enrollments, chatsByVisitor] = await Promise.all([
    // 1a: All leads
    Lead.findAll({
      attributes: ['id', 'email', 'name', 'company', 'source', 'form_type', 'sponsorship_kit_requested', 'pipeline_stage', 'visitor_id', 'created_at'],
      raw: true,
    }).catch(() => []) as Promise<Array<{
      id: number; email: string; name: string; company: string | null;
      source: string | null; form_type: string | null; sponsorship_kit_requested: boolean;
      pipeline_stage: string | null; visitor_id: string | null; created_at: Date;
    }>>,

    // 1b: Earliest chat per lead (where lead_id is set)
    ChatConversation.findAll({
      attributes: ['lead_id', [fn('MIN', col('started_at')), 'earliest']],
      where: { lead_id: { [Op.ne]: null } },
      group: ['lead_id'],
      raw: true,
    }).catch(() => []) as Promise<Array<{ lead_id: number; earliest: Date }>>,

    // 1c: Earliest strategy call per lead
    StrategyCall.findAll({
      attributes: ['lead_id', [fn('MIN', col('scheduled_at')), 'earliest']],
      where: { lead_id: { [Op.ne]: null } },
      group: ['lead_id'],
      raw: true,
    }).catch(() => []) as Promise<Array<{ lead_id: number; earliest: Date }>>,

    // 1d: All campaign enrollments with campaign name
    CampaignLead.findAll({
      attributes: ['lead_id', 'campaign_id', 'enrolled_at'],
      include: [{
        model: Campaign,
        as: 'campaign',
        attributes: ['name'],
        required: true,
      }],
      order: [['enrolled_at', 'ASC']],
      raw: true,
    }).catch(() => []) as Promise<Array<{
      lead_id: number; campaign_id: string; enrolled_at: Date;
      'campaign.name': string;
    }>>,

    // 1e: All enrollments for email matching
    Enrollment.findAll({
      attributes: ['email', 'payment_status', 'status'],
      raw: true,
    }).catch(() => []) as Promise<Array<{ email: string; payment_status: string; status: string }>>,

    // 1f: Fallback — chats linked via visitor_id (where chat.lead_id is null)
    ChatConversation.findAll({
      attributes: ['visitor_id', [fn('MIN', col('started_at')), 'earliest']],
      where: {
        lead_id: { [Op.is]: null as any },
        visitor_id: { [Op.ne]: null as any },
      },
      group: ['visitor_id'],
      raw: true,
    }).catch(() => []) as Promise<Array<{ visitor_id: string; earliest: Date }>>,
  ]);

  // Build lookup maps
  const chatMap = new Map<number, Date>();
  for (const c of chatsByLead) {
    chatMap.set(c.lead_id, new Date(c.earliest));
  }

  const strategyMap = new Map<number, Date>();
  for (const s of strategyCalls) {
    strategyMap.set(s.lead_id, new Date(s.earliest));
  }

  // Visitor-based chat fallback: need to get lead.visitor_id mapping
  const visitorChatMap = new Map<string, Date>();
  for (const vc of chatsByVisitor) {
    if (vc.visitor_id) visitorChatMap.set(vc.visitor_id, new Date(vc.earliest));
  }

  // Campaign enrollments grouped by lead
  const campaignsByLead = new Map<number, Array<{ campaign_id: string; campaign_name: string; enrolled_at: Date }>>();
  for (const ce of campaignEnrollments) {
    const list = campaignsByLead.get(ce.lead_id) || [];
    list.push({
      campaign_id: ce.campaign_id,
      campaign_name: (ce as any)['campaign.name'] || 'Unknown',
      enrolled_at: new Date(ce.enrolled_at),
    });
    campaignsByLead.set(ce.lead_id, list);
  }

  // Enrollment email sets (case-insensitive)
  const enrolledEmails = new Set<string>();
  const paidEmails = new Set<string>();
  for (const e of enrollments) {
    const email = e.email?.toLowerCase();
    if (email) {
      enrolledEmails.add(email);
      if (e.payment_status === 'paid') paidEmails.add(email);
    }
  }

  // Build LeadPathRecords
  const leadPaths: LeadPathRecord[] = [];

  for (const lead of allLeads) {
    const sourceCategory = categorizeSource(lead.source);
    const emailLower = lead.email?.toLowerCase() || '';

    // Determine first touch — find earliest among REAL touchpoints
    // CRITICAL: Bulk imports (ccpp_alumni, apollo) with form_type='contact' are NOT form fills.
    // Only count as blueprint signup if the lead actually filled out a form.
    const candidates: Array<{ type: LeadPathRecord['first_touch']['type']; ts: Date }> = [];
    const isBulkImport = sourceCategory === 'alumni' || sourceCategory === 'cold_outbound';

    // Chat conversation (direct lead_id match)
    const chatTs = chatMap.get(lead.id);
    if (chatTs) candidates.push({ type: 'cory_chat', ts: chatTs });

    // Strategy call
    const stratTs = strategyMap.get(lead.id);
    if (stratTs) candidates.push({ type: 'strategy_call', ts: stratTs });

    // Form-based first touches — only for NON bulk imports
    if (!isBulkImport) {
      if (lead.form_type === 'contact') {
        candidates.push({ type: 'blueprint', ts: new Date(lead.created_at) });
      }
      if (lead.form_type === 'executive_overview_download') {
        candidates.push({ type: 'executive_overview', ts: new Date(lead.created_at) });
      }
      if (lead.form_type === 'sponsorship_kit_download' || lead.sponsorship_kit_requested) {
        candidates.push({ type: 'sponsorship', ts: new Date(lead.created_at) });
      }
    }

    // Referral first touch (alumni_referral sources — these ARE real interactions)
    const rawSrc = (lead.source || '').toLowerCase();
    if (rawSrc.startsWith('alumni_referral')) {
      candidates.push({ type: 'referral', ts: new Date(lead.created_at) });
    }

    // Visitor-based chat fallback — check if lead has a visitor_id with a chat
    if (!chatTs && lead.visitor_id) {
      const visitorChat = visitorChatMap.get(lead.visitor_id);
      if (visitorChat) candidates.push({ type: 'cory_chat', ts: visitorChat });
    }

    // Sort by timestamp, earliest first
    candidates.sort((a, b) => a.ts.getTime() - b.ts.getTime());
    const firstTouch = candidates.length > 0
      ? { type: candidates[0].type, timestamp: candidates[0].ts }
      : { type: null as any, timestamp: null };

    leadPaths.push({
      lead_id: lead.id,
      email: lead.email,
      name: lead.name || '',
      company: lead.company || null,
      source_category: sourceCategory,
      raw_source: lead.source,
      pipeline_stage: lead.pipeline_stage || null,
      first_touch: firstTouch,
      campaign_enrollments: campaignsByLead.get(lead.id) || [],
      outcome: {
        enrolled: enrolledEmails.has(emailLower),
        paid: paidEmails.has(emailLower),
      },
      created_at: new Date(lead.created_at),
    });
  }

  return leadPaths;
}

// ─── Phase 2 & 3: Aggregate into graph ──────────────────────────────────────

function shortenCampaignName(name: string): string {
  let label = name
    .replace('Colaberry ', '')
    .replace(' Campaign', '')
    .replace('AI Leadership ', '');
  if (label.length > 25) label = label.substring(0, 22) + '...';
  return label;
}

async function buildGraphFromPaths(leadPaths: LeadPathRecord[]): Promise<CampaignGraphData> {
  const totalLeads = leadPaths.length;

  // ── Source counts ──────────────────────────────────────────────────────
  const sourceCounts: Record<string, number> = { marketing: 0, cold_outbound: 0, alumni: 0, anonymous: 0 };
  const sourceEngaged: Record<string, number> = { marketing: 0, cold_outbound: 0, alumni: 0, anonymous: 0 };

  // ── Edge aggregation maps: key → Set<lead_id> ─────────────────────────
  const srcToEntry = new Map<string, Set<number>>();
  const entryToCampaign = new Map<string, Set<number>>();
  const campaignToOutcome = new Map<string, Set<number>>();

  // ── Entry point counts (real first_touch counts) ───────────────────────
  const entryTouchCounts: Record<string, number> = {
    cory_chat: 0, blueprint: 0, sponsorship: 0, strategy_call: 0,
    executive_overview: 0, referral: 0, unengaged: 0,
  };

  // ── Source breakdown per entry node ────────────────────────────────────
  const entrySourceBreakdown: Record<string, Record<string, number>> = {
    cory_chat: {}, blueprint: {}, sponsorship: {}, strategy_call: {},
    executive_overview: {}, referral: {}, unengaged: {},
  };

  // ── Campaign data accumulation ─────────────────────────────────────────
  const campaignLeadSets = new Map<string, Set<number>>();
  const campaignNames = new Map<string, string>();
  const campaignSourceBreakdown = new Map<string, Record<string, number>>();

  // ── Single pass over all leads ─────────────────────────────────────────
  for (const lead of leadPaths) {
    const src = lead.source_category;
    sourceCounts[src]++;

    const touchType = lead.first_touch.type || 'unengaged';
    if (lead.first_touch.type) sourceEngaged[src]++;
    entryTouchCounts[touchType]++;

    // Source breakdown for this entry
    entrySourceBreakdown[touchType][src] = (entrySourceBreakdown[touchType][src] || 0) + 1;

    // Source → Entry edge
    const srcEntryKey = `src_${src}|entry_${touchType}`;
    if (!srcToEntry.has(srcEntryKey)) srcToEntry.set(srcEntryKey, new Set());
    srcToEntry.get(srcEntryKey)!.add(lead.lead_id);

    // Entry → Campaign edges (only for engaged leads with campaign enrollments)
    if (lead.first_touch.type) {
      for (const enrollment of lead.campaign_enrollments) {
        const etcKey = `entry_${touchType}|campaign_${enrollment.campaign_id}`;
        if (!entryToCampaign.has(etcKey)) entryToCampaign.set(etcKey, new Set());
        entryToCampaign.get(etcKey)!.add(lead.lead_id);

        // Track campaign data
        if (!campaignLeadSets.has(enrollment.campaign_id)) campaignLeadSets.set(enrollment.campaign_id, new Set());
        campaignLeadSets.get(enrollment.campaign_id)!.add(lead.lead_id);
        campaignNames.set(enrollment.campaign_id, enrollment.campaign_name);

        // Campaign source breakdown
        if (!campaignSourceBreakdown.has(enrollment.campaign_id)) campaignSourceBreakdown.set(enrollment.campaign_id, {});
        const csb = campaignSourceBreakdown.get(enrollment.campaign_id)!;
        csb[src] = (csb[src] || 0) + 1;
      }
    }

    // Campaign → Outcome edges
    for (const enrollment of lead.campaign_enrollments) {
      if (lead.outcome.enrolled) {
        const ceKey = `campaign_${enrollment.campaign_id}|outcome_enrolled`;
        if (!campaignToOutcome.has(ceKey)) campaignToOutcome.set(ceKey, new Set());
        campaignToOutcome.get(ceKey)!.add(lead.lead_id);
      }
      if (lead.outcome.paid) {
        const cpKey = `campaign_${enrollment.campaign_id}|outcome_paid`;
        if (!campaignToOutcome.has(cpKey)) campaignToOutcome.set(cpKey, new Set());
        campaignToOutcome.get(cpKey)!.add(lead.lead_id);
      }
    }
  }

  // ── Get campaign-level metrics (messages sent, active count) ───────────
  const campaignIds = Array.from(campaignLeadSets.keys());
  const campaignMetrics = new Map<string, { activeCount: number; messagesSent: number }>();

  if (campaignIds.length > 0) {
    const [activeCounts, messageCounts] = await Promise.all([
      CampaignLead.findAll({
        attributes: ['campaign_id', [fn('COUNT', col('id')), 'cnt']],
        where: { campaign_id: { [Op.in]: campaignIds }, status: { [Op.in]: ['enrolled', 'active'] } },
        group: ['campaign_id'],
        raw: true,
      }).catch(() => []) as Promise<Array<{ campaign_id: string; cnt: string }>>,
      CommunicationLog.findAll({
        attributes: ['campaign_id', [fn('COUNT', col('id')), 'cnt']],
        where: { campaign_id: { [Op.in]: campaignIds } },
        group: ['campaign_id'],
        raw: true,
      }).catch(() => []) as Promise<Array<{ campaign_id: string; cnt: string }>>,
    ]);

    for (const ac of activeCounts) {
      const m = campaignMetrics.get(ac.campaign_id) || { activeCount: 0, messagesSent: 0 };
      m.activeCount = parseInt(ac.cnt, 10) || 0;
      campaignMetrics.set(ac.campaign_id, m);
    }
    for (const mc of messageCounts) {
      const m = campaignMetrics.get(mc.campaign_id) || { activeCount: 0, messagesSent: 0 };
      m.messagesSent = parseInt(mc.cnt, 10) || 0;
      campaignMetrics.set(mc.campaign_id, m);
    }
  }

  // ── Outcome counts ─────────────────────────────────────────────────────
  const enrolledLeads = new Set<number>();
  const paidLeads = new Set<number>();
  for (const lead of leadPaths) {
    if (lead.outcome.enrolled) enrolledLeads.add(lead.lead_id);
    if (lead.outcome.paid) paidLeads.add(lead.lead_id);
  }

  // ── Build Nodes ────────────────────────────────────────────────────────
  const nodes: CampaignGraphNode[] = [];

  // Source nodes
  for (const [key, label] of [['marketing', 'Marketing'], ['cold_outbound', 'Cold Outbound'], ['alumni', 'Alumni Network'], ['anonymous', 'Anonymous / Direct']] as const) {
    nodes.push({
      id: `src_${key}`,
      type: 'source',
      label,
      count: sourceCounts[key],
      metrics: {
        engaged_count: sourceEngaged[key],
        unengaged_count: sourceCounts[key] - sourceEngaged[key],
      },
    });
  }

  // Entry nodes (from real first_touch data)
  const entryNodeDefs: Array<{ key: string; label: string }> = [
    { key: 'cory_chat', label: 'Cory Chat' },
    { key: 'blueprint', label: 'Blueprint Signup' },
    { key: 'executive_overview', label: 'Executive Overview' },
    { key: 'sponsorship', label: 'Sponsorship Form' },
    { key: 'strategy_call', label: 'Strategy Call' },
    { key: 'referral', label: 'Referral' },
    { key: 'unengaged', label: 'Unengaged' },
  ];

  for (const { key, label } of entryNodeDefs) {
    const count = entryTouchCounts[key];
    if (count > 0) {
      nodes.push({
        id: `entry_${key}`,
        type: 'entry',
        label,
        count,
        metrics: {
          conversion_rate: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0,
        },
        source_breakdown: entrySourceBreakdown[key],
      });
    }
  }

  // Campaign nodes
  for (const [campaignId, leadSet] of campaignLeadSets) {
    const name = campaignNames.get(campaignId) || 'Unknown';
    const metrics = campaignMetrics.get(campaignId) || { activeCount: 0, messagesSent: 0 };
    const count = leadSet.size;

    nodes.push({
      id: `campaign_${campaignId}`,
      type: 'campaign',
      label: shortenCampaignName(name),
      count,
      metrics: {
        active_users: metrics.activeCount,
        messages_sent: metrics.messagesSent,
        conversion_rate: count > 0 ? Math.round((metrics.activeCount / count) * 100) : 0,
      },
      source_breakdown: campaignSourceBreakdown.get(campaignId),
    });
  }

  // Outcome nodes
  const enrolledCount = enrolledLeads.size;
  const paidCount = paidLeads.size;
  nodes.push(
    { id: 'outcome_enrolled', type: 'outcome', label: 'Enrolled', count: enrolledCount, metrics: {} },
    {
      id: 'outcome_paid', type: 'outcome', label: 'Paid', count: paidCount,
      metrics: { conversion_rate: enrolledCount > 0 ? Math.round((paidCount / enrolledCount) * 100) : 0 },
    },
  );

  // ── Build Edges (only where real users traversed) ──────────────────────
  const edges: CampaignGraphEdge[] = [];

  for (const [key, leadSet] of srcToEntry) {
    const [from, to] = key.split('|');
    edges.push({ from, to, label: 'feeds', volume: leadSet.size });
  }

  for (const [key, leadSet] of entryToCampaign) {
    const [from, to] = key.split('|');
    edges.push({ from, to, label: 'enrolls', volume: leadSet.size });
  }

  for (const [key, leadSet] of campaignToOutcome) {
    const [from, to] = key.split('|');
    edges.push({ from, to, label: 'converts', volume: leadSet.size });
  }

  // ── Validate edges (L→R only) ─────────────────────────────────────────
  const nodeTypeMap = new Map(nodes.map(n => [n.id, n.type]));
  const validEdges = edges.filter(e => {
    const srcLayer = LAYER_ORDER[nodeTypeMap.get(e.from) || ''] ?? -1;
    const tgtLayer = LAYER_ORDER[nodeTypeMap.get(e.to) || ''] ?? -1;
    if (srcLayer >= tgtLayer) {
      console.warn(`[UserPathEngine] Filtered invalid edge: ${e.from} → ${e.to}`);
      return false;
    }
    return true;
  });

  // ── Validation stats ──────────────────────────────────────────────────
  const warnings: string[] = [];
  const sourceTotalCheck = Object.values(sourceCounts).reduce((s, v) => s + v, 0);
  if (sourceTotalCheck !== totalLeads) {
    warnings.push(`Source total (${sourceTotalCheck}) !== lead count (${totalLeads})`);
  }

  const entryTotalCheck = Object.values(entryTouchCounts).reduce((s, v) => s + v, 0);
  if (entryTotalCheck !== totalLeads) {
    warnings.push(`Entry total (${entryTotalCheck}) !== lead count (${totalLeads})`);
  }

  const leadsInCampaigns = new Set<number>();
  for (const lead of leadPaths) {
    if (lead.campaign_enrollments.length > 0) leadsInCampaigns.add(lead.lead_id);
  }

  const validation: CampaignGraphValidation = {
    total_leads: totalLeads,
    leads_with_first_touch: leadPaths.filter(l => l.first_touch.type !== null).length,
    leads_unengaged: entryTouchCounts.unengaged,
    leads_in_campaigns: leadsInCampaigns.size,
    leads_enrolled: enrolledCount,
    leads_paid: paidCount,
    warnings,
  };

  return { nodes, edges: validEdges, validation };
}

// ─── Main entry point ───────────────────────────────────────────────────────

export async function getCampaignGraphData(): Promise<CampaignGraphData> {
  if (graphCache && Date.now() - graphCache.ts < CACHE_TTL) {
    return graphCache.data;
  }

  const leadPaths = await buildLeadPaths();
  const data = await buildGraphFromPaths(leadPaths);

  graphCache = { data, leadPaths, ts: Date.now() };
  return data;
}

// ─── Drilldown: users for a node ────────────────────────────────────────────

export async function getNodeUsers(
  nodeId: string,
  page: number,
  limit: number,
): Promise<{ users: GraphUserRecord[]; total: number; page: number; limit: number }> {
  // Ensure cache is warm
  if (!graphCache || Date.now() - graphCache.ts >= CACHE_TTL) {
    await getCampaignGraphData();
  }
  const leadPaths = graphCache!.leadPaths;

  // Filter leads that belong to this node
  const matching = leadPaths.filter(lead => {
    if (nodeId.startsWith('src_')) {
      return `src_${lead.source_category}` === nodeId;
    }
    if (nodeId === 'entry_unengaged') {
      return lead.first_touch.type === null;
    }
    if (nodeId.startsWith('entry_')) {
      const touchType = nodeId.replace('entry_', '');
      return lead.first_touch.type === touchType;
    }
    if (nodeId.startsWith('campaign_')) {
      const campaignId = nodeId.replace('campaign_', '');
      return lead.campaign_enrollments.some(e => e.campaign_id === campaignId);
    }
    if (nodeId === 'outcome_enrolled') {
      return lead.outcome.enrolled;
    }
    if (nodeId === 'outcome_paid') {
      return lead.outcome.paid;
    }
    return false;
  });

  const total = matching.length;
  const offset = (page - 1) * limit;
  const paged = matching.slice(offset, offset + limit);

  return {
    users: paged.map(l => ({
      id: l.lead_id,
      name: l.name,
      email: l.email,
      company: l.company,
      source: l.raw_source,
      source_category: l.source_category,
      first_touch: l.first_touch.type,
      pipeline_stage: l.pipeline_stage,
      created_at: l.created_at,
    })),
    total,
    page,
    limit,
  };
}

// ─── Drilldown: users for an edge ───────────────────────────────────────────

export async function getEdgeUsers(
  fromId: string,
  toId: string,
  page: number,
  limit: number,
): Promise<{ users: GraphUserRecord[]; total: number; page: number; limit: number }> {
  if (!graphCache || Date.now() - graphCache.ts >= CACHE_TTL) {
    await getCampaignGraphData();
  }
  const leadPaths = graphCache!.leadPaths;

  // Determine which leads traversed this edge
  const matching = leadPaths.filter(lead => {
    const srcMatch = fromId.startsWith('src_') && `src_${lead.source_category}` === fromId;
    const touchType = lead.first_touch.type || 'unengaged';
    const entryId = `entry_${touchType}`;

    // Source → Entry
    if (fromId.startsWith('src_') && toId.startsWith('entry_')) {
      return srcMatch && entryId === toId;
    }

    // Entry → Campaign
    if (fromId.startsWith('entry_') && toId.startsWith('campaign_')) {
      const campaignId = toId.replace('campaign_', '');
      return entryId === fromId && lead.campaign_enrollments.some(e => e.campaign_id === campaignId);
    }

    // Campaign → Outcome
    if (fromId.startsWith('campaign_') && toId.startsWith('outcome_')) {
      const campaignId = fromId.replace('campaign_', '');
      const inCampaign = lead.campaign_enrollments.some(e => e.campaign_id === campaignId);
      if (!inCampaign) return false;
      if (toId === 'outcome_enrolled') return lead.outcome.enrolled;
      if (toId === 'outcome_paid') return lead.outcome.paid;
      return false;
    }

    return false;
  });

  const total = matching.length;
  const offset = (page - 1) * limit;
  const paged = matching.slice(offset, offset + limit);

  return {
    users: paged.map(l => ({
      id: l.lead_id,
      name: l.name,
      email: l.email,
      company: l.company,
      source: l.raw_source,
      source_category: l.source_category,
      first_touch: l.first_touch.type,
      pipeline_stage: l.pipeline_stage,
      created_at: l.created_at,
    })),
    total,
    page,
    limit,
  };
}
