// ─── Intelligence Maps Service ────────────────────────────────────────────
// Graph-powered map data generation for all 5 Intelligence Map types.
// Returns node/edge structures compatible with InteractiveBusinessGraph and IntelNetworkGraph.

import { AiAgent, AiAgentActivityLog, KPISnapshot, ReportingInsight, PageEvent, Lead, Campaign, Enrollment } from '../../models';
import { getAllDepartments } from '../../intelligence/agents/agentFactory';
import { getGraph } from './coryKnowledgeGraphService';
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';

/** Safe count helper — returns 0 if the table doesn't exist or query fails */
async function safeCount(model: any, where?: Record<string, any>): Promise<number> {
  try {
    return await model.count(where ? { where } : {});
  } catch {
    return 0;
  }
}

interface MapNode {
  id: string;
  label: string;
  color: string;
  value: number;
  metadata?: Record<string, any>;
}

interface MapEdge {
  source: string;
  target: string;
  label?: string;
  value?: number;
}

interface MapData {
  nodes: MapNode[];
  edges: MapEdge[];
  title: string;
  map_type: string;
}

const DEPT_COLORS: Record<string, string> = {
  Executive: '#1a365d',
  Strategy: '#2b6cb0',
  Marketing: '#e53e3e',
  Admissions: '#dd6b20',
  Alumni: '#38a169',
  Partnerships: '#319795',
  Education: '#805ad5',
  Student_Success: '#d69e2e',
  Platform: '#718096',
  Intelligence: '#3182ce',
  Governance: '#e53e3e',
  Reporting: '#9f7aea',
  Finance: '#2d3748',
  Growth: '#48bb78',
  Infrastructure: '#a0aec0',
  Operations: '#ed8936',
  Orchestration: '#667eea',
  Security: '#c53030',
};

function getHealthColor(score: number): string {
  if (score >= 80) return '#38a169';
  if (score >= 60) return '#d69e2e';
  return '#e53e3e';
}

// ─── Department Map ───────────────────────────────────────────────────────

export async function getDepartmentMap(): Promise<MapData> {
  const departments = getAllDepartments();
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  for (const dept of departments) {
    const categories = getDeptCategories(dept);
    const categoryCount = categories.length > 0
      ? await AiAgent.count({ where: { category: { [Op.in]: categories }, enabled: true } })
      : 0;
    const slugCount = await countDeptSlugAgents(dept);
    const agentCount = categoryCount + slugCount;
    const latestKPI = await KPISnapshot.findOne({
      where: { scope_type: 'department', scope_id: dept },
      order: [['snapshot_date', 'DESC']],
      raw: true,
    });

    const insightCount = await ReportingInsight.count({
      where: { department: dept, status: 'new' },
    });

    const healthScore = (latestKPI as any)?.metrics?.health_score ?? 75;

    nodes.push({
      id: dept,
      label: dept.replace(/_/g, ' '),
      color: getHealthColor(healthScore),
      value: agentCount,
      metadata: {
        agent_count: agentCount,
        health_score: healthScore,
        open_insights: insightCount,
        kpis: (latestKPI as any)?.metrics || {},
      },
    });
  }

  // Cross-department data flow edges
  const deptFlows = [
    ['Marketing', 'Admissions'], ['Admissions', 'Education'], ['Education', 'Student_Success'],
    ['Marketing', 'Alumni'], ['Alumni', 'Partnerships'], ['Intelligence', 'Reporting'],
    ['Reporting', 'Executive'], ['Platform', 'Intelligence'], ['Governance', 'Executive'],
    ['Strategy', 'Marketing'], ['Strategy', 'Education'],
  ];
  for (const [s, t] of deptFlows) {
    edges.push({ source: s, target: t, label: 'data_flow' });
  }

  return { nodes, edges, title: 'Department Intelligence Map', map_type: 'department' };
}

function getDeptCategories(dept: string): string[] {
  const map: Record<string, string[]> = {
    Executive: ['executive'], Strategy: ['strategic'], Marketing: ['outbound', 'openclaw'],
    Admissions: ['admissions', 'admissions_ops'], Alumni: ['alumni'], Partnerships: ['partnerships'],
    Education: ['accelerator', 'curriculum'], Student_Success: ['student_success'],
    Platform: ['maintenance', 'operations', 'website_intelligence', 'orchestration'],
    Intelligence: ['behavioral', 'ai_ops', 'memory', 'meta', 'autonomous'],
    Governance: ['security', 'governance_ops'], Reporting: ['reporting'],
    Finance: [], Growth: [], Infrastructure: [], Operations: [], Orchestration: [],
    Security: ['security_ops'],
  };
  return map[dept] || [];
}

/** Count agents assigned to a department via config.department_slug (e.g. dept_strategy agents) */
async function countDeptSlugAgents(dept: string): Promise<number> {
  try {
    const slug = dept.toLowerCase();
    return await AiAgent.count({
      where: {
        enabled: true,
        config: { department_slug: slug },
      } as any,
    });
  } catch {
    // Fallback: JSONB query syntax may differ — try raw
    try {
      const slug = dept.toLowerCase();
      const [rows] = await sequelize.query(
        `SELECT COUNT(*) AS cnt FROM ai_agents WHERE enabled = true AND config->>'department_slug' = :slug`,
        { replacements: { slug }, type: 'SELECT' as any },
      );
      return Number((rows as any)?.cnt ?? 0);
    } catch {
      return 0;
    }
  }
}

// ─── Agent Activity Map ───────────────────────────────────────────────────

export async function getAgentActivityMap(): Promise<MapData> {
  const agents = await AiAgent.findAll({
    where: { enabled: true },
    attributes: ['id', 'agent_name', 'category', 'status', 'run_count', 'error_count', 'avg_duration_ms'],
    raw: true,
  });

  const nodes: MapNode[] = agents.map((a: any) => ({
    id: a.id,
    label: a.agent_name,
    color: a.status === 'error' ? '#e53e3e' : a.status === 'running' ? '#3182ce' : '#38a169',
    value: Math.max(a.run_count || 1, 1),
    metadata: {
      category: a.category,
      status: a.status,
      run_count: a.run_count,
      error_count: a.error_count,
      avg_duration_ms: a.avg_duration_ms,
    },
  }));

  // Group by category to create edges between related agents
  const edges: MapEdge[] = [];
  const byCategory: Record<string, string[]> = {};
  for (const a of agents) {
    const cat = (a as any).category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push((a as any).id);
  }
  for (const ids of Object.values(byCategory)) {
    for (let i = 0; i < ids.length - 1; i++) {
      edges.push({ source: ids[i], target: ids[i + 1], label: 'same_department' });
    }
  }

  return { nodes, edges, title: 'Agent Activity Map', map_type: 'agent_activity' };
}

// ─── Student Journey Map ──────────────────────────────────────────────────

export async function getStudentJourneyMap(): Promise<MapData> {
  // Query real counts for each funnel stage
  const [landingCount, admissionsCount, strategyCallCount, enrollmentCount, activeCount, completedCount] = await Promise.all([
    safeCount(PageEvent),
    safeCount(Lead),
    safeCount(Lead, { status: { [Op.in]: ['strategy_call', 'strategy_scheduled', 'call_scheduled', 'call_completed'] } }),
    safeCount(Enrollment),
    safeCount(Enrollment, { status: 'active' }),
    safeCount(Enrollment, { status: 'completed' }),
  ]);

  const stages = [
    { id: 'landing', label: 'Landing Page', color: '#718096', value: landingCount },
    { id: 'admissions', label: 'Admissions', color: '#dd6b20', value: admissionsCount },
    { id: 'strategy_call', label: 'Strategy Call', color: '#2b6cb0', value: strategyCallCount },
    { id: 'enrollment', label: 'Enrollment', color: '#38a169', value: enrollmentCount },
    { id: 'course_progress', label: 'Course Progress', color: '#805ad5', value: activeCount },
    { id: 'completion', label: 'Completion', color: '#1a365d', value: completedCount },
  ];

  const nodes: MapNode[] = stages.map(s => ({ id: s.id, label: s.label, color: s.color, value: Math.max(s.value, 1) }));
  const edges: MapEdge[] = [];

  for (let i = 0; i < stages.length - 1; i++) {
    const conversionRate = stages[i + 1].value > 0 && stages[i].value > 0
      ? Math.round((stages[i + 1].value / stages[i].value) * 100)
      : 0;
    edges.push({ source: stages[i].id, target: stages[i + 1].id, label: 'progresses_to', value: conversionRate });
  }

  return { nodes, edges, title: 'Student Journey Map', map_type: 'student_journey' };
}

// ─── Campaign Journey Map ─────────────────────────────────────────────────

export async function getCampaignJourneyMap(): Promise<MapData> {
  const [leadSourceCount, outreachCount, responseCount, conversationCount, enrollmentCount] = await Promise.all([
    safeCount(Lead),
    safeCount(Campaign, { status: 'active' }),
    safeCount(Lead, { status: { [Op.notIn]: ['new'] } }),
    safeCount(Lead, { status: { [Op.in]: ['qualified', 'engaged'] } }),
    safeCount(Enrollment),
  ]);

  const stages = [
    { id: 'lead_source', label: 'Lead Source', color: '#718096', value: leadSourceCount },
    { id: 'outreach', label: 'Outreach', color: '#e53e3e', value: outreachCount },
    { id: 'response', label: 'Response', color: '#dd6b20', value: responseCount },
    { id: 'conversation', label: 'Conversation', color: '#2b6cb0', value: conversationCount },
    { id: 'enrollment', label: 'Enrollment', color: '#38a169', value: enrollmentCount },
  ];

  const nodes: MapNode[] = stages.map(s => ({ id: s.id, label: s.label, color: s.color, value: Math.max(s.value, 1) }));
  const edges: MapEdge[] = [];

  for (let i = 0; i < stages.length - 1; i++) {
    const conversionRate = stages[i + 1].value > 0 && stages[i].value > 0
      ? Math.round((stages[i + 1].value / stages[i].value) * 100)
      : 0;
    edges.push({ source: stages[i].id, target: stages[i + 1].id, label: 'converts_to', value: conversionRate });
  }

  return { nodes, edges, title: 'Campaign Journey Map', map_type: 'campaign_journey' };
}

// ─── Revenue Flow Map ─────────────────────────────────────────────────────

export async function getRevenueFlowMap(): Promise<MapData> {
  const [campaignCount, leadCount, enrollmentCount] = await Promise.all([
    safeCount(Campaign),
    safeCount(Lead),
    safeCount(Enrollment),
  ]);

  // Attempt to get total revenue from enrollments (paid enrollments as a proxy)
  let paidEnrollments = 0;
  try {
    paidEnrollments = await Enrollment.count({ where: { payment_status: 'paid' } });
  } catch { paidEnrollments = 0; }

  const stages = [
    { id: 'campaigns', label: 'Campaigns', color: '#e53e3e', value: campaignCount },
    { id: 'leads', label: 'Lead Pipeline', color: '#dd6b20', value: leadCount },
    { id: 'deals', label: 'Deal Value', color: '#2b6cb0', value: enrollmentCount },
    { id: 'enrollments', label: 'Enrollment Revenue', color: '#38a169', value: paidEnrollments },
  ];

  const nodes: MapNode[] = stages.map(s => ({
    id: s.id,
    label: s.label,
    color: s.color,
    value: Math.max(s.value, 1),
    metadata: { count: s.value },
  }));
  const edges: MapEdge[] = [];

  for (let i = 0; i < stages.length - 1; i++) {
    const conversionRate = stages[i + 1].value > 0 && stages[i].value > 0
      ? Math.round((stages[i + 1].value / stages[i].value) * 100)
      : 0;
    edges.push({ source: stages[i].id, target: stages[i + 1].id, label: 'flows_to', value: conversionRate });
  }

  return { nodes, edges, title: 'Revenue Flow Map', map_type: 'revenue_flow' };
}

// ─── Router ───────────────────────────────────────────────────────────────

export async function getMapData(mapType: string): Promise<MapData> {
  switch (mapType) {
    case 'department': return getDepartmentMap();
    case 'agent_activity': return getAgentActivityMap();
    case 'student_journey': return getStudentJourneyMap();
    case 'campaign_journey': return getCampaignJourneyMap();
    case 'revenue_flow': return getRevenueFlowMap();
    default: throw new Error(`Unknown map type: ${mapType}`);
  }
}
