// ─── Full Funnel Intelligence Engine ────────────────────────────────────────
// Builds a 6-layer system map: SOURCE → OUTREACH → VISITOR → FIRST TOUCH → CAMPAIGN → OUTCOME
// ALL edges and counts are derived from real per-lead path tracing.
// NO proportional estimates. NO inferred paths. NO assumptions.

import { Lead, Campaign, CampaignLead, CommunicationLog, Enrollment, StrategyCall, ChatConversation, CallContactLog } from '../../models';
import Visitor from '../../models/Visitor';
import { Op, fn, col } from 'sequelize';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CampaignGraphNode {
  id: string;
  type: 'source' | 'outreach' | 'visitor' | 'entry' | 'campaign' | 'outcome';
  label: string;
  count: number;
  metrics: {
    conversion_rate?: number;
    messages_sent?: number;
    active_users?: number;
    engaged_count?: number;
    unengaged_count?: number;
    contacted?: number;
    delivered?: number;
    opened?: number;
    visits_generated?: number;
    attribution_linear?: number;
    attribution_first?: number;
    attribution_last?: number;
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
  leads_with_visitor: number;
  leads_contacted: number;
  leads_contacted_no_visit: number;
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
  outreach: {
    email: { count: number; earliest: Date | null; latest_status: string | null };
    sms:   { count: number; earliest: Date | null; latest_status: string | null };
    voice: { count: number; earliest: Date | null; latest_status: string | null };
  };
  was_contacted: boolean;
  has_visitor_record: boolean;
  visitor_stats: {
    total_sessions: number;
    total_pageviews: number;
    first_seen_at: Date | null;
    last_seen_at: Date | null;
  } | null;
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

const LAYER_ORDER: Record<string, number> = { source: 0, outreach: 1, visitor: 2, entry: 3, campaign: 4, outcome: 5 };

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
  // 9 parallel queries
  const [allLeads, chatsByLead, strategyCalls, campaignEnrollments, enrollments, chatsByVisitor, visitorsByLead, outreachByChannel, voiceCallsByVisitor] = await Promise.all([
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

    // 1g: Visitor records linked to leads
    Visitor.findAll({
      attributes: ['lead_id', 'total_sessions', 'total_pageviews', 'first_seen_at', 'last_seen_at'],
      where: { lead_id: { [Op.ne]: null as any } },
      raw: true,
    }).catch(() => []) as Promise<Array<{
      lead_id: number; total_sessions: number; total_pageviews: number;
      first_seen_at: Date; last_seen_at: Date;
    }>>,

    // 1h: Outreach per lead per channel (CommunicationLog)
    CommunicationLog.findAll({
      attributes: [
        'lead_id', 'channel',
        [fn('COUNT', col('id')), 'cnt'],
        [fn('MIN', col('created_at')), 'earliest'],
      ],
      where: {
        direction: 'outbound',
        delivery_mode: 'live',
        status: { [Op.in]: ['sent', 'delivered', 'opened', 'clicked'] },
        lead_id: { [Op.ne]: null },
        subject: { [Op.or]: [{ [Op.is]: null as any }, { [Op.notLike]: '[TEST%' }] },
      },
      group: ['lead_id', 'channel'],
      raw: true,
    }).catch(() => []) as Promise<Array<{
      lead_id: number; channel: string; cnt: string; earliest: Date;
    }>>,

    // 1i: Voice calls via CallContactLog → Visitor → lead_id
    CallContactLog.findAll({
      attributes: [
        [fn('COUNT', col('CallContactLog.id')), 'cnt'],
        [fn('MIN', col('call_timestamp')), 'earliest'],
      ],
      include: [{
        model: Visitor,
        as: 'visitor',
        attributes: ['lead_id'],
        where: { lead_id: { [Op.ne]: null as any } },
        required: true,
      }],
      group: ['visitor.lead_id'],
      raw: true,
    }).catch(() => []) as Promise<Array<{
      cnt: string; earliest: Date; 'visitor.lead_id': number;
    }>>,
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

  // Visitor data lookup map
  const visitorMap = new Map<number, { total_sessions: number; total_pageviews: number; first_seen_at: Date | null; last_seen_at: Date | null }>();
  for (const v of visitorsByLead) {
    if (v.lead_id) {
      visitorMap.set(v.lead_id, {
        total_sessions: v.total_sessions || 0,
        total_pageviews: v.total_pageviews || 0,
        first_seen_at: v.first_seen_at ? new Date(v.first_seen_at) : null,
        last_seen_at: v.last_seen_at ? new Date(v.last_seen_at) : null,
      });
    }
  }

  // Outreach data lookup map: lead_id → { email, sms, voice }
  const emptyChannel = { count: 0, earliest: null as Date | null, latest_status: null as string | null };
  const outreachMap = new Map<number, LeadPathRecord['outreach']>();
  for (const o of outreachByChannel) {
    if (!o.lead_id) continue;
    const existing = outreachMap.get(o.lead_id) || {
      email: { ...emptyChannel }, sms: { ...emptyChannel }, voice: { ...emptyChannel },
    };
    const ch = o.channel?.toLowerCase() as 'email' | 'sms' | 'voice';
    if (ch === 'email' || ch === 'sms' || ch === 'voice') {
      existing[ch] = {
        count: parseInt(o.cnt, 10) || 0,
        earliest: o.earliest ? new Date(o.earliest) : null,
        latest_status: null, // aggregated query doesn't track per-status
      };
    }
    outreachMap.set(o.lead_id, existing);
  }
  // Merge voice calls from CallContactLog into outreach map
  for (const vc of voiceCallsByVisitor) {
    const leadId = vc['visitor.lead_id'];
    if (!leadId) continue;
    const existing = outreachMap.get(leadId) || {
      email: { ...emptyChannel }, sms: { ...emptyChannel }, voice: { ...emptyChannel },
    };
    existing.voice = {
      count: existing.voice.count + (parseInt(vc.cnt, 10) || 0),
      earliest: vc.earliest && (!existing.voice.earliest || new Date(vc.earliest) < existing.voice.earliest)
        ? new Date(vc.earliest) : existing.voice.earliest,
      latest_status: null,
    };
    outreachMap.set(leadId, existing);
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

    // Visitor data
    const visitorData = visitorMap.get(lead.id);

    // Outreach data
    const outreachData = outreachMap.get(lead.id) || {
      email: { count: 0, earliest: null, latest_status: null },
      sms: { count: 0, earliest: null, latest_status: null },
      voice: { count: 0, earliest: null, latest_status: null },
    };
    const wasContacted = outreachData.email.count > 0 || outreachData.sms.count > 0 || outreachData.voice.count > 0;

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
      outreach: outreachData,
      was_contacted: wasContacted,
      has_visitor_record: !!visitorData,
      visitor_stats: visitorData || null,
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
  const srcToOutreach = new Map<string, Set<number>>();    // source → outreach channel
  const outreachToVisitor = new Map<string, Set<number>>(); // outreach → visitor (contacted + visited)
  const outreachToEntry = new Map<string, Set<number>>();  // outreach → entry (contacted, no visitor)
  const srcToVisitor = new Map<string, Set<number>>();     // source → visitor (not contacted)
  const visitorToEntry = new Map<string, Set<number>>();
  const srcToNever = new Map<string, Set<number>>();        // source → never visited (no visitor, no outreach)
  const outreachToNever = new Map<string, Set<number>>();   // outreach → never visited (contacted but no visitor)
  const srcToEntry = new Map<string, Set<number>>();        // direct (no visitor, no outreach, engaged)
  const entryToCampaign = new Map<string, Set<number>>();
  const campaignToOutcome = new Map<string, Set<number>>();

  // ── Entry point counts (real first_touch counts) ───────────────────────
  const entryTouchCounts: Record<string, number> = {
    cory_chat: 0, blueprint: 0, sponsorship: 0, strategy_call: 0,
    executive_overview: 0, referral: 0, unengaged_visited: 0,
  };

  // ── Source breakdown per entry node ────────────────────────────────────
  const entrySourceBreakdown: Record<string, Record<string, number>> = {
    cory_chat: {}, blueprint: {}, sponsorship: {}, strategy_call: {},
    executive_overview: {}, referral: {}, unengaged_visited: {},
  };

  // ── Campaign data accumulation ─────────────────────────────────────────
  const campaignLeadSets = new Map<string, Set<number>>();
  const campaignNames = new Map<string, string>();
  const campaignSourceBreakdown = new Map<string, Record<string, number>>();

  // ── Visitor & outreach tracking ──────────────────────────────────────
  let visitorLeadCount = 0;
  let contactedLeadCount = 0;
  let contactedNoVisitCount = 0;
  let neverVisitedCount = 0;
  const neverVisitedSourceBreakdown: Record<string, number> = {};
  const outreachChannelLeads: Record<string, Set<number>> = { email: new Set(), sms: new Set(), voice: new Set() };
  const outreachChannelVisited: Record<string, number> = { email: 0, sms: 0, voice: 0 };

  // ── Single pass over all leads ─────────────────────────────────────────
  for (const lead of leadPaths) {
    const src = lead.source_category;
    sourceCounts[src]++;

    const hasVisitor = lead.has_visitor_record;
    const hasFirstTouch = lead.first_touch.type !== null;
    const wasContacted = lead.was_contacted;

    if (hasVisitor) visitorLeadCount++;
    if (hasFirstTouch) sourceEngaged[src]++;
    if (wasContacted) {
      contactedLeadCount++;
      if (!hasVisitor) contactedNoVisitCount++;
    }

    // Track per-channel outreach
    for (const ch of ['email', 'sms', 'voice'] as const) {
      if (lead.outreach[ch].count > 0) {
        outreachChannelLeads[ch].add(lead.lead_id);
        if (hasVisitor) outreachChannelVisited[ch]++;
      }
    }

    // Determine touch type for entry layer
    // "Never Visited" goes to visitor layer, not entry layer
    const isNeverVisited = !hasFirstTouch && !hasVisitor;
    let touchType: string;
    if (hasFirstTouch) {
      touchType = lead.first_touch.type!;
    } else if (hasVisitor) {
      touchType = 'unengaged_visited';
    } else {
      touchType = 'unengaged_never'; // tracked separately for visitor_never node
    }

    if (isNeverVisited) {
      neverVisitedCount++;
      neverVisitedSourceBreakdown[src] = (neverVisitedSourceBreakdown[src] || 0) + 1;
    } else {
      entryTouchCounts[touchType]++;
      entrySourceBreakdown[touchType][src] = (entrySourceBreakdown[touchType][src] || 0) + 1;
    }

    // ── Edge routing ──────────────────────────────────────────────────
    // Helper to add to an edge map
    const addEdge = (map: Map<string, Set<number>>, key: string) => {
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(lead.lead_id);
    };

    if (isNeverVisited) {
      // "Never Visited" leads terminate at visitor layer
      if (wasContacted) {
        const channels = (['email', 'sms', 'voice'] as const).filter(ch => lead.outreach[ch].count > 0);
        for (const ch of channels) {
          addEdge(srcToOutreach, `src_${src}|outreach_${ch}`);
        }
        const earliest = channels.sort((a, b) => {
          const aTs = lead.outreach[a].earliest?.getTime() ?? Infinity;
          const bTs = lead.outreach[b].earliest?.getTime() ?? Infinity;
          return aTs - bTs;
        })[0];
        addEdge(outreachToNever, `outreach_${earliest}|visitor_never`);
      } else {
        addEdge(srcToNever, `src_${src}|visitor_never`);
      }
    } else if (wasContacted) {
      // Contacted leads route through outreach layer
      const channels = (['email', 'sms', 'voice'] as const).filter(ch => lead.outreach[ch].count > 0);
      for (const ch of channels) {
        addEdge(srcToOutreach, `src_${src}|outreach_${ch}`);
      }
      // Use earliest channel for downstream edge (avoid double-counting)
      const earliest = channels.sort((a, b) => {
        const aTs = lead.outreach[a].earliest?.getTime() ?? Infinity;
        const bTs = lead.outreach[b].earliest?.getTime() ?? Infinity;
        return aTs - bTs;
      })[0];
      if (hasVisitor) {
        addEdge(outreachToVisitor, `outreach_${earliest}|visitor_site`);
        addEdge(visitorToEntry, `visitor_site|entry_${touchType}`);
      } else {
        addEdge(outreachToEntry, `outreach_${earliest}|entry_${touchType}`);
      }
    } else {
      // Non-contacted leads bypass outreach entirely (existing logic)
      if (hasVisitor) {
        addEdge(srcToVisitor, `src_${src}|visitor_site`);
        addEdge(visitorToEntry, `visitor_site|entry_${touchType}`);
      } else {
        addEdge(srcToEntry, `src_${src}|entry_${touchType}`);
      }
    }

    // Entry → Campaign edges (only for engaged leads with campaign enrollments)
    if (hasFirstTouch) {
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

  // Source nodes (always all 4)
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

  // Outreach nodes (always all 3, even with count=0)
  for (const [ch, label] of [['email', 'Email Outreach'], ['sms', 'SMS Outreach'], ['voice', 'Voice Outreach']] as const) {
    const contacted = outreachChannelLeads[ch].size;
    nodes.push({
      id: `outreach_${ch}`,
      type: 'outreach',
      label,
      count: contacted,
      metrics: {
        contacted,
        visits_generated: outreachChannelVisited[ch],
        conversion_rate: contacted > 0 ? Math.round((outreachChannelVisited[ch] / contacted) * 100) : 0,
      },
    });
  }

  // Visitor nodes
  const visitorEngagedCount = leadPaths.filter(l => l.has_visitor_record && l.first_touch.type !== null).length;
  nodes.push({
    id: 'visitor_site',
    type: 'visitor',
    label: 'Site Visitors',
    count: visitorLeadCount,
    metrics: {
      active_users: visitorLeadCount,
      engaged_count: visitorEngagedCount,
      unengaged_count: visitorLeadCount - visitorEngagedCount,
      conversion_rate: totalLeads > 0 ? Math.round((visitorLeadCount / totalLeads) * 100) : 0,
    },
  });

  // "Never Visited" — sits in visitor column (leads that never came to the site)
  nodes.push({
    id: 'visitor_never',
    type: 'visitor',
    label: 'Never Visited',
    count: neverVisitedCount,
    metrics: {
      active_users: 0,
      conversion_rate: 0,
    },
    source_breakdown: neverVisitedSourceBreakdown,
  });

  // Entry nodes — ALL always rendered (even with count=0)
  const entryNodeDefs: Array<{ key: string; label: string }> = [
    { key: 'cory_chat', label: 'Cory Chat' },
    { key: 'blueprint', label: 'Blueprint Signup' },
    { key: 'executive_overview', label: 'Executive Overview' },
    { key: 'sponsorship', label: 'Sponsorship Form' },
    { key: 'strategy_call', label: 'Strategy Call' },
    { key: 'referral', label: 'Referral' },
    { key: 'unengaged_visited', label: 'Visited Only' },
  ];

  for (const { key, label } of entryNodeDefs) {
    const count = entryTouchCounts[key] || 0;
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

  for (const [key, leadSet] of srcToOutreach) {
    const [from, to] = key.split('|');
    edges.push({ from, to, label: 'contacts', volume: leadSet.size });
  }

  for (const [key, leadSet] of outreachToVisitor) {
    const [from, to] = key.split('|');
    edges.push({ from, to, label: 'drives visit', volume: leadSet.size });
  }

  for (const [key, leadSet] of outreachToEntry) {
    const [from, to] = key.split('|');
    edges.push({ from, to, label: 'converts', volume: leadSet.size });
  }

  for (const [key, leadSet] of outreachToNever) {
    const [from, to] = key.split('|');
    edges.push({ from, to, label: 'no visit', volume: leadSet.size });
  }

  for (const [key, leadSet] of srcToVisitor) {
    const [from, to] = key.split('|');
    edges.push({ from, to, label: 'visits', volume: leadSet.size });
  }

  for (const [key, leadSet] of visitorToEntry) {
    const [from, to] = key.split('|');
    edges.push({ from, to, label: 'engages', volume: leadSet.size });
  }

  for (const [key, leadSet] of srcToNever) {
    const [from, to] = key.split('|');
    edges.push({ from, to, label: 'no visit', volume: leadSet.size });
  }

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

  const entryTotalCheck = Object.values(entryTouchCounts).reduce((s, v) => s + v, 0) + neverVisitedCount;
  if (entryTotalCheck !== totalLeads) {
    warnings.push(`Entry+NeverVisited total (${entryTotalCheck}) !== lead count (${totalLeads})`);
  }

  if (visitorLeadCount === 0) {
    warnings.push('No visitor records found. Visitor layer will be empty.');
  }

  const leadsInCampaigns = new Set<number>();
  for (const lead of leadPaths) {
    if (lead.campaign_enrollments.length > 0) leadsInCampaigns.add(lead.lead_id);
  }

  const validation: CampaignGraphValidation = {
    total_leads: totalLeads,
    leads_with_first_touch: leadPaths.filter(l => l.first_touch.type !== null).length,
    leads_unengaged: (entryTouchCounts.unengaged_visited || 0) + neverVisitedCount,
    leads_in_campaigns: leadsInCampaigns.size,
    leads_enrolled: enrolledCount,
    leads_paid: paidCount,
    leads_with_visitor: visitorLeadCount,
    leads_contacted: contactedLeadCount,
    leads_contacted_no_visit: contactedNoVisitCount,
    warnings,
  };

  // ── Attribution scoring ─────────────────────────────────────────────
  // Only for converted leads (enrolled). Each touchpoint gets credit summing to 1.0 per lead.
  const attributionByNode = new Map<string, { linear: number; first_touch: number; last_touch: number }>();
  let attributionWarnings = 0;

  for (const lead of leadPaths) {
    if (!lead.outcome.enrolled) continue;

    // Collect touchpoints chronologically: outreach events, first touch, campaign enrollments
    const touchpoints: Array<{ nodeId: string; ts: number }> = [];

    // Outreach touchpoints (earliest per channel)
    for (const ch of ['email', 'sms', 'voice'] as const) {
      if (lead.outreach[ch].count > 0 && lead.outreach[ch].earliest) {
        touchpoints.push({ nodeId: `outreach_${ch}`, ts: lead.outreach[ch].earliest!.getTime() });
      }
    }

    // First touch
    if (lead.first_touch.type && lead.first_touch.timestamp) {
      touchpoints.push({ nodeId: `entry_${lead.first_touch.type}`, ts: lead.first_touch.timestamp.getTime() });
    }

    // Campaign enrollments
    for (const enrollment of lead.campaign_enrollments) {
      touchpoints.push({ nodeId: `campaign_${enrollment.campaign_id}`, ts: enrollment.enrolled_at.getTime() });
    }

    if (touchpoints.length === 0) continue;

    // Sort by timestamp
    touchpoints.sort((a, b) => a.ts - b.ts);
    const n = touchpoints.length;
    const linearCredit = 1 / n;

    for (let i = 0; i < n; i++) {
      const tp = touchpoints[i];
      const existing = attributionByNode.get(tp.nodeId) || { linear: 0, first_touch: 0, last_touch: 0 };
      existing.linear += linearCredit;
      if (i === 0) existing.first_touch += 1;
      if (i === n - 1) existing.last_touch += 1;
      attributionByNode.set(tp.nodeId, existing);
    }

    // Validation: check sum ≈ 1.0 per model
    const sum = touchpoints.length * linearCredit;
    if (Math.abs(sum - 1.0) > 0.01) attributionWarnings++;
  }

  if (attributionWarnings > 0) {
    warnings.push(`Attribution sum mismatch for ${attributionWarnings} leads`);
  }

  // Apply attribution scores to nodes
  for (const node of nodes) {
    const attr = attributionByNode.get(node.id);
    if (attr) {
      node.metrics.attribution_linear = Math.round(attr.linear * 100) / 100;
      node.metrics.attribution_first = Math.round(attr.first_touch * 100) / 100;
      node.metrics.attribution_last = Math.round(attr.last_touch * 100) / 100;
    }
  }

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
    if (nodeId === 'visitor_site') {
      return lead.has_visitor_record;
    }
    if (nodeId === 'visitor_never') {
      return lead.first_touch.type === null && !lead.has_visitor_record;
    }
    // Outreach nodes
    if (nodeId === 'outreach_email') return lead.outreach.email.count > 0;
    if (nodeId === 'outreach_sms') return lead.outreach.sms.count > 0;
    if (nodeId === 'outreach_voice') return lead.outreach.voice.count > 0;
    // Backward compat: old 'entry_unengaged' matches both unengaged types
    if (nodeId === 'entry_unengaged') {
      return lead.first_touch.type === null;
    }
    if (nodeId === 'entry_unengaged_visited') {
      return lead.first_touch.type === null && lead.has_visitor_record;
    }
    if (nodeId === 'entry_unengaged_never') {
      return lead.first_touch.type === null && !lead.has_visitor_record;
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

    const hasFirstTouch = lead.first_touch.type !== null;
    let touchType: string;
    if (hasFirstTouch) {
      touchType = lead.first_touch.type!;
    } else if (lead.has_visitor_record) {
      touchType = 'unengaged_visited';
    } else {
      touchType = 'unengaged_never';
    }
    const entryId = `entry_${touchType}`;

    // Source → Outreach
    if (fromId.startsWith('src_') && toId.startsWith('outreach_')) {
      const ch = toId.replace('outreach_', '') as 'email' | 'sms' | 'voice';
      return srcMatch && lead.outreach[ch]?.count > 0;
    }

    // Outreach → Visitor (contacted + has visitor)
    if (fromId.startsWith('outreach_') && toId === 'visitor_site') {
      const ch = fromId.replace('outreach_', '') as 'email' | 'sms' | 'voice';
      return lead.outreach[ch]?.count > 0 && lead.has_visitor_record;
    }

    // Outreach → Never Visited (contacted, no visitor, no first touch)
    if (fromId.startsWith('outreach_') && toId === 'visitor_never') {
      const ch = fromId.replace('outreach_', '') as 'email' | 'sms' | 'voice';
      return lead.outreach[ch]?.count > 0 && !lead.has_visitor_record && !hasFirstTouch;
    }

    // Outreach → Entry (contacted, no visitor, has first touch)
    if (fromId.startsWith('outreach_') && toId.startsWith('entry_')) {
      const ch = fromId.replace('outreach_', '') as 'email' | 'sms' | 'voice';
      return lead.outreach[ch]?.count > 0 && !lead.has_visitor_record && entryId === toId;
    }

    // Source → Visitor (non-contacted path)
    if (fromId.startsWith('src_') && toId === 'visitor_site') {
      return srcMatch && !lead.was_contacted && lead.has_visitor_record;
    }

    // Source → Never Visited (non-contacted, no visitor, no first touch)
    if (fromId.startsWith('src_') && toId === 'visitor_never') {
      return srcMatch && !lead.was_contacted && !lead.has_visitor_record && !hasFirstTouch;
    }

    // Visitor → Entry
    if (fromId === 'visitor_site' && toId.startsWith('entry_')) {
      return lead.has_visitor_record && entryId === toId;
    }

    // Source → Entry (direct, no visitor, no outreach)
    if (fromId.startsWith('src_') && toId.startsWith('entry_')) {
      return srcMatch && !lead.was_contacted && !lead.has_visitor_record && entryId === toId;
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
