import { Op } from 'sequelize';
import VisitorSession from '../../models/VisitorSession';
import PageEvent from '../../models/PageEvent';
import Visitor from '../../models/Visitor';
import { sequelize } from '../../config/database';
import { categorizePagePath } from '../visitorTrackingService';

// ─── Types ───────────────────────────────────────────────────────────────────

export type FlowNodeType = 'source' | 'landing' | 'browse' | 'intent' | 'exit';

export interface FlowGraphNode {
  id: string;
  type: FlowNodeType;
  label: string;
  count: number;
  metrics: {
    avg_duration?: number;
    bounce_rate?: number;
    unique_visitors?: number;
  };
}

export interface FlowGraphEdge {
  from: string;
  to: string;
  volume: number;
}

export interface FlowGraphValidation {
  total_sessions: number;
  total_visitors: number;
  bounce_rate: number;
  avg_pages_per_session: number;
  warnings: string[];
}

export interface FlowGraphData {
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
  validation: FlowGraphValidation;
  time_window?: string;
}

export interface FlowSessionRecord {
  session_id: string;
  visitor_id: string;
  visitor_fingerprint: string;
  lead_name?: string;
  lead_email?: string;
  entry_page: string;
  exit_page: string;
  pageview_count: number;
  duration_seconds: number;
  is_bounce: boolean;
  device_type?: string;
  started_at: string;
  pages: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HIGH_INTENT = new Set([
  'pricing', 'contact', 'strategy_call_prep', 'enroll', 'advisory', 'sponsorship',
]);

// Well-known domain → friendly label
const KNOWN_SOURCES: Record<string, string> = {
  'google': 'Google',
  'bing': 'Bing',
  'yahoo': 'Yahoo',
  'duckduckgo': 'DuckDuckGo',
  'facebook': 'Facebook',
  'instagram': 'Instagram',
  'twitter': 'Twitter / X',
  'linkedin': 'LinkedIn',
  'tiktok': 'TikTok',
  'reddit': 'Reddit',
  'youtube': 'YouTube',
  'gmail': 'Email (Gmail)',
  'outlook': 'Email (Outlook)',
};

const CATEGORY_LABELS: Record<string, string> = {
  homepage: 'Homepage',
  pricing: 'Pricing',
  program: 'Program',
  case_studies: 'Case Studies',
  contact: 'Contact',
  enroll: 'Enroll',
  advisory: 'Advisory',
  sponsorship: 'Sponsorship',
  strategy_call_prep: 'Strategy Call',
  executive_overview: 'Executive Overview',
  roi_calculator: 'ROI Calculator',
  champion: 'AI Champion',
  alumni: 'Alumni',
  ai_architect: 'AI Architect',
  referrals: 'Referrals',
  portal: 'Student Portal',
  admin: 'Admin',
  other: 'Other Pages',
};

const EXIT_LABELS: Record<string, string> = {
  exit_bounced: 'Bounced',
  exit_exited: 'Exited',
  exit_converted: 'Converted',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Classify session source using utm_source, utm_campaign, referrer_domain.
 * Returns a specific source ID like "src_google", "src_linkedin", "src_campaign:spring_push",
 * "src_direct", etc. — much more granular than the old "ref_search" / "ref_social" buckets.
 */
function classifySource(
  referrerDomain: string | null,
  utmSource: string | null,
  utmCampaign: string | null,
  utmMedium: string | null,
): string {
  // Priority 1: UTM source (most explicit signal)
  if (utmSource) {
    const s = utmSource.toLowerCase().trim();
    // Check known sources first
    for (const [key] of Object.entries(KNOWN_SOURCES)) {
      if (s.includes(key)) return `src_${key}`;
    }
    // UTM source is set but not a well-known platform — use it directly
    return `src_${s.replace(/[^a-z0-9_-]/g, '_')}`;
  }

  // Priority 2: UTM campaign without source (e.g. email campaigns)
  if (utmCampaign) {
    const c = utmCampaign.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_');
    return `src_campaign_${c}`;
  }

  // Priority 3: Referrer domain
  if (referrerDomain) {
    const d = referrerDomain.toLowerCase();
    for (const [key] of Object.entries(KNOWN_SOURCES)) {
      if (d.includes(key)) return `src_${key}`;
    }
    // Email medium
    if (utmMedium === 'email' || /mail/.test(d)) return 'src_email';
    // Unknown referrer — use the domain itself
    const clean = d.replace(/^(www\.)?/, '').replace(/\..+$/, '').replace(/[^a-z0-9_-]/g, '_');
    return `src_${clean || 'other'}`;
  }

  // No referrer, no UTM — direct traffic
  return 'src_direct';
}

function getSourceLabel(id: string): string {
  if (id === 'src_direct') return 'Direct';
  if (id === 'src_email') return 'Email';
  // Campaign-based
  if (id.startsWith('src_campaign_')) {
    const name = id.replace('src_campaign_', '').replace(/_/g, ' ');
    // Title case
    return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  // Known source
  const key = id.replace('src_', '');
  for (const [k, label] of Object.entries(KNOWN_SOURCES)) {
    if (k === key) return label;
  }
  // Fallback: title-case the ID
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

function getNodeLabel(id: string, type: FlowNodeType): string {
  if (type === 'source') return getSourceLabel(id);
  if (type === 'exit') return EXIT_LABELS[id] || id;
  const cat = id.replace(/^(land_|browse_|intent_)/, '');
  return CATEGORY_LABELS[cat] || cat;
}

function getTimeWindowCutoff(timeWindow?: string): Date | null {
  if (!timeWindow || timeWindow === 'all') return null;
  const now = new Date();
  if (timeWindow === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (timeWindow === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (timeWindow === '90d') return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return null;
}

// ─── Main Graph Builder ──────────────────────────────────────────────────────

export async function buildVisitorFlowGraph(timeWindow?: string): Promise<FlowGraphData> {
  const cutoff = getTimeWindowCutoff(timeWindow);

  // 1. Fetch sessions with their pageview events
  const whereClause: any = {};
  if (cutoff) whereClause.started_at = { [Op.gte]: cutoff };

  const sessions = await VisitorSession.findAll({
    where: whereClause,
    attributes: [
      'id', 'visitor_id', 'started_at', 'duration_seconds', 'pageview_count',
      'entry_page', 'exit_page', 'is_bounce', 'landing_page_category',
      'referrer_domain', 'utm_source', 'utm_campaign', 'utm_medium', 'device_type',
    ],
    order: [['started_at', 'DESC']],
    limit: 50000,
    raw: true,
  });

  if (sessions.length === 0) {
    return {
      nodes: [], edges: [],
      validation: { total_sessions: 0, total_visitors: 0, bounce_rate: 0, avg_pages_per_session: 0, warnings: ['No sessions found'] },
      time_window: timeWindow || 'all',
    };
  }

  const sessionIds = sessions.map(s => s.id);

  // Fetch pageview events for all sessions (batch)
  const events = await PageEvent.findAll({
    where: {
      session_id: { [Op.in]: sessionIds },
      event_type: { [Op.in]: ['pageview', 'form_submit'] },
    },
    attributes: ['session_id', 'event_type', 'page_category', 'page_path', 'timestamp'],
    order: [['timestamp', 'ASC']],
    raw: true,
  });

  // Group events by session
  const eventsBySession = new Map<string, typeof events>();
  for (const e of events) {
    const arr = eventsBySession.get(e.session_id) || [];
    arr.push(e);
    eventsBySession.set(e.session_id, arr);
  }

  // 2. Build paths and aggregate
  const nodeSessions = new Map<string, Set<string>>();     // nodeId → set of session IDs
  const nodeVisitors = new Map<string, Set<string>>();     // nodeId → set of visitor IDs
  const nodeDurations = new Map<string, number[]>();       // nodeId → duration array
  const edgeVolume = new Map<string, number>();            // "from→to" → count
  const visitorIds = new Set<string>();
  let totalBounce = 0;
  let totalPageviews = 0;

  for (const session of sessions) {
    visitorIds.add(session.visitor_id);
    totalPageviews += session.pageview_count || 0;
    if (session.is_bounce) totalBounce++;

    const sessionEvents = eventsBySession.get(session.id) || [];

    // Build the session path through the 5 layers
    const path: string[] = [];

    // Layer 1: Source (what brought them to the site)
    const srcId = classifySource(session.referrer_domain, session.utm_source, session.utm_campaign, session.utm_medium);
    path.push(srcId);

    // Layer 2: Landing page — re-derive from entry_page if stored as 'other' (backfill)
    let landCat = session.landing_page_category || 'other';
    if (landCat === 'other' && session.entry_page) {
      landCat = categorizePagePath(session.entry_page);
    }
    const landId = `land_${landCat}`;
    path.push(landId);

    // Collect page categories from events (after landing)
    const pageCategories: string[] = [];
    let hasFormSubmit = false;
    for (const ev of sessionEvents) {
      if (ev.event_type === 'form_submit') {
        hasFormSubmit = true;
        continue;
      }
      if (ev.event_type === 'pageview' && ev.page_category) {
        pageCategories.push(ev.page_category);
      }
    }

    // Layer 3: Browse nodes (non-intent, non-landing-duplicate categories)
    const browseAdded = new Set<string>();
    const intentAdded = new Set<string>();

    for (let i = 1; i < pageCategories.length; i++) {
      const cat = pageCategories[i];
      if (HIGH_INTENT.has(cat)) {
        if (!intentAdded.has(cat)) intentAdded.add(cat);
      } else {
        if (!browseAdded.has(cat) && cat !== landCat) browseAdded.add(cat);
      }
    }

    // Also check if landing page itself is high-intent (user arrived directly at pricing, etc.)
    if (HIGH_INTENT.has(landCat) && !intentAdded.has(landCat)) {
      intentAdded.add(landCat);
    }

    // Add browse nodes to path
    for (const cat of browseAdded) {
      path.push(`browse_${cat}`);
    }

    // Layer 4: Intent nodes
    for (const cat of intentAdded) {
      path.push(`intent_${cat}`);
    }

    // Layer 5: Exit
    let exitId: string;
    if (session.is_bounce) {
      exitId = 'exit_bounced';
    } else if (hasFormSubmit) {
      exitId = 'exit_converted';
    } else {
      exitId = 'exit_exited';
    }
    path.push(exitId);

    // Record nodes
    for (const nodeId of path) {
      if (!nodeSessions.has(nodeId)) nodeSessions.set(nodeId, new Set());
      nodeSessions.get(nodeId)!.add(session.id);
      if (!nodeVisitors.has(nodeId)) nodeVisitors.set(nodeId, new Set());
      nodeVisitors.get(nodeId)!.add(session.visitor_id);
      if (!nodeDurations.has(nodeId)) nodeDurations.set(nodeId, []);
      nodeDurations.get(nodeId)!.push(session.duration_seconds || 0);
    }

    // Record edges between consecutive path entries
    for (let i = 0; i < path.length - 1; i++) {
      const key = `${path[i]}→${path[i + 1]}`;
      edgeVolume.set(key, (edgeVolume.get(key) || 0) + 1);
    }
  }

  // 3. Build output nodes
  const nodeTypeMap = (id: string): FlowNodeType => {
    if (id.startsWith('src_')) return 'source';
    if (id.startsWith('land_')) return 'landing';
    if (id.startsWith('browse_')) return 'browse';
    if (id.startsWith('intent_')) return 'intent';
    if (id.startsWith('exit_')) return 'exit';
    return 'browse';
  };

  const nodes: FlowGraphNode[] = [];
  for (const [id, sessionSet] of nodeSessions.entries()) {
    const type = nodeTypeMap(id);
    const durations = nodeDurations.get(id) || [];
    const avgDur = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const uniqueVisitors = nodeVisitors.get(id)?.size || 0;

    // Bounce rate for landing nodes
    let bounceRate: number | undefined;
    if (type === 'landing') {
      const sessIds = Array.from(sessionSet);
      const bouncedInNode = sessIds.filter(sid => {
        const s = sessions.find(ss => ss.id === sid);
        return s?.is_bounce;
      }).length;
      bounceRate = sessionSet.size > 0 ? Math.round((bouncedInNode / sessionSet.size) * 100) : 0;
    }

    nodes.push({
      id,
      type,
      label: getNodeLabel(id, type),
      count: sessionSet.size,
      metrics: {
        avg_duration: avgDur,
        bounce_rate: bounceRate,
        unique_visitors: uniqueVisitors,
      },
    });
  }

  // Sort nodes by type order then by count desc
  const typeOrder: Record<string, number> = { source: 0, landing: 1, browse: 2, intent: 3, exit: 4 };
  nodes.sort((a, b) => (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0) || b.count - a.count);

  // 4. Build output edges
  const edges: FlowGraphEdge[] = [];
  for (const [key, volume] of edgeVolume.entries()) {
    const [from, to] = key.split('→');
    edges.push({ from, to, volume });
  }
  edges.sort((a, b) => b.volume - a.volume);

  // 5. Validation
  const warnings: string[] = [];
  const sessionsWithNoEvents = sessions.filter(s => !eventsBySession.has(s.id)).length;
  if (sessionsWithNoEvents > 0) {
    warnings.push(`${sessionsWithNoEvents} sessions had no recorded page events`);
  }

  const bounceRate = sessions.length > 0 ? Math.round((totalBounce / sessions.length) * 100) : 0;
  const avgPages = sessions.length > 0 ? Math.round((totalPageviews / sessions.length) * 10) / 10 : 0;

  return {
    nodes,
    edges,
    validation: {
      total_sessions: sessions.length,
      total_visitors: visitorIds.size,
      bounce_rate: bounceRate,
      avg_pages_per_session: avgPages,
      warnings,
    },
    time_window: timeWindow || 'all',
  };
}

// ─── Node Drilldown: Sessions for a specific node ────────────────────────────

export async function getFlowNodeSessions(
  nodeId: string, page: number, limit: number, timeWindow?: string
): Promise<{ sessions: FlowSessionRecord[]; total: number }> {
  const cutoff = getTimeWindowCutoff(timeWindow);

  // First, get all sessions and figure out which ones pass through this node
  // For efficiency, we use targeted queries based on node type
  const whereClause: any = {};
  if (cutoff) whereClause.started_at = { [Op.gte]: cutoff };

  const nodeType = nodeId.startsWith('src_') ? 'source'
    : nodeId.startsWith('land_') ? 'landing'
    : nodeId.startsWith('browse_') ? 'browse'
    : nodeId.startsWith('intent_') ? 'intent'
    : 'exit';

  // Add type-specific filters to narrow the query
  if (nodeType === 'source') {
    // We need to classify source — do it in memory
  } else if (nodeType === 'landing') {
    const cat = nodeId.replace('land_', '');
    whereClause.landing_page_category = cat;
  } else if (nodeType === 'exit') {
    if (nodeId === 'exit_bounced') whereClause.is_bounce = true;
    // For exit_converted and exit_exited, we filter in memory after checking events
  }

  const sessions = await VisitorSession.findAll({
    where: whereClause,
    include: [{
      model: Visitor,
      as: 'visitor',
      attributes: ['fingerprint', 'lead_id'],
    }],
    order: [['started_at', 'DESC']],
    limit: 5000,
    raw: true,
    nest: true,
  });

  // Filter sessions by node membership
  let matchingSessions = sessions;

  if (nodeType === 'source') {
    matchingSessions = sessions.filter(s => {
      return classifySource(s.referrer_domain, s.utm_source, s.utm_campaign, s.utm_medium) === nodeId;
    });
  } else if (nodeType === 'browse' || nodeType === 'intent') {
    const cat = nodeId.replace(/^(browse_|intent_)/, '');
    const sessionIds = sessions.map(s => s.id);
    // Find sessions that have a pageview with this category
    const matchingEvents = await PageEvent.findAll({
      where: {
        session_id: { [Op.in]: sessionIds },
        event_type: 'pageview',
        page_category: cat,
      },
      attributes: ['session_id'],
      group: ['session_id'],
      raw: true,
    });
    const matchingSessionIds = new Set(matchingEvents.map(e => e.session_id));
    matchingSessions = sessions.filter(s => matchingSessionIds.has(s.id));
  } else if (nodeId === 'exit_converted') {
    const sessionIds = sessions.filter(s => !s.is_bounce).map(s => s.id);
    const formEvents = await PageEvent.findAll({
      where: {
        session_id: { [Op.in]: sessionIds },
        event_type: 'form_submit',
      },
      attributes: ['session_id'],
      group: ['session_id'],
      raw: true,
    });
    const convertedIds = new Set(formEvents.map(e => e.session_id));
    matchingSessions = sessions.filter(s => convertedIds.has(s.id));
  } else if (nodeId === 'exit_exited') {
    const sessionIds = sessions.filter(s => !s.is_bounce).map(s => s.id);
    const formEvents = await PageEvent.findAll({
      where: {
        session_id: { [Op.in]: sessionIds },
        event_type: 'form_submit',
      },
      attributes: ['session_id'],
      group: ['session_id'],
      raw: true,
    });
    const convertedIds = new Set(formEvents.map(e => e.session_id));
    matchingSessions = sessions.filter(s => !s.is_bounce && !convertedIds.has(s.id));
  }

  const total = matchingSessions.length;
  const offset = (page - 1) * limit;
  const paginated = matchingSessions.slice(offset, offset + limit);

  // Get page paths for paginated sessions
  const paginatedIds = paginated.map(s => s.id);
  const pageEvents = await PageEvent.findAll({
    where: {
      session_id: { [Op.in]: paginatedIds },
      event_type: 'pageview',
    },
    attributes: ['session_id', 'page_path'],
    order: [['timestamp', 'ASC']],
    raw: true,
  });

  const pagesBySession = new Map<string, string[]>();
  for (const ev of pageEvents) {
    const arr = pagesBySession.get(ev.session_id) || [];
    arr.push(ev.page_path);
    pagesBySession.set(ev.session_id, arr);
  }

  // Get lead names for identified visitors
  const leadIds = paginated
    .map(s => (s as any).visitor?.lead_id)
    .filter((id: any) => id != null);

  let leadMap = new Map<number, { name: string; email: string }>();
  if (leadIds.length > 0) {
    const leads = await sequelize.query(
      `SELECT id, name, email FROM leads WHERE id IN (:ids)`,
      { replacements: { ids: leadIds }, type: 'SELECT' as any }
    ) as any[];
    for (const l of leads) {
      leadMap.set(l.id, { name: l.name, email: l.email });
    }
  }

  const result: FlowSessionRecord[] = paginated.map(s => {
    const v = (s as any).visitor || {};
    const lead = v.lead_id ? leadMap.get(v.lead_id) : null;
    return {
      session_id: s.id,
      visitor_id: s.visitor_id,
      visitor_fingerprint: v.fingerprint || s.visitor_id.slice(0, 8),
      lead_name: lead?.name,
      lead_email: lead?.email,
      entry_page: s.entry_page || '/',
      exit_page: s.exit_page || '/',
      pageview_count: s.pageview_count,
      duration_seconds: s.duration_seconds,
      is_bounce: s.is_bounce,
      device_type: s.device_type || undefined,
      started_at: new Date(s.started_at).toISOString(),
      pages: pagesBySession.get(s.id) || [],
    };
  });

  return { sessions: result, total };
}
