// ─── Intelligence Maps Service ────────────────────────────────────────────
// Graph-powered map data generation for all 5 Intelligence Map types.
// Returns node/edge structures compatible with InteractiveBusinessGraph and IntelNetworkGraph.

import { AiAgent, AiAgentActivityLog, KPISnapshot, ReportingInsight } from '../../models';
import { getAllDepartments } from '../../intelligence/agents/agentFactory';
import { getGraph } from './coryKnowledgeGraphService';
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';

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
    const agentCount = await AiAgent.count({ where: { category: { [Op.in]: getDeptCategories(dept) }, enabled: true } });
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
  };
  return map[dept] || [];
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
  const stages = [
    { id: 'landing', label: 'Landing Page', color: '#718096' },
    { id: 'admissions', label: 'Admissions', color: '#dd6b20' },
    { id: 'strategy_call', label: 'Strategy Call', color: '#2b6cb0' },
    { id: 'enrollment', label: 'Enrollment', color: '#38a169' },
    { id: 'course_progress', label: 'Course Progress', color: '#805ad5' },
    { id: 'completion', label: 'Completion', color: '#1a365d' },
  ];

  const nodes: MapNode[] = stages.map(s => ({ ...s, value: 10 }));
  const edges: MapEdge[] = [];

  for (let i = 0; i < stages.length - 1; i++) {
    edges.push({ source: stages[i].id, target: stages[i + 1].id, label: 'progresses_to' });
  }

  return { nodes, edges, title: 'Student Journey Map', map_type: 'student_journey' };
}

// ─── Campaign Journey Map ─────────────────────────────────────────────────

export async function getCampaignJourneyMap(): Promise<MapData> {
  const stages = [
    { id: 'lead_source', label: 'Lead Source', color: '#718096' },
    { id: 'outreach', label: 'Outreach', color: '#e53e3e' },
    { id: 'response', label: 'Response', color: '#dd6b20' },
    { id: 'conversation', label: 'Conversation', color: '#2b6cb0' },
    { id: 'enrollment', label: 'Enrollment', color: '#38a169' },
  ];

  const nodes: MapNode[] = stages.map(s => ({ ...s, value: 10 }));
  const edges: MapEdge[] = [];

  for (let i = 0; i < stages.length - 1; i++) {
    edges.push({ source: stages[i].id, target: stages[i + 1].id, label: 'converts_to' });
  }

  return { nodes, edges, title: 'Campaign Journey Map', map_type: 'campaign_journey' };
}

// ─── Revenue Flow Map ─────────────────────────────────────────────────────

export async function getRevenueFlowMap(): Promise<MapData> {
  const stages = [
    { id: 'campaigns', label: 'Campaigns', color: '#e53e3e' },
    { id: 'leads', label: 'Lead Pipeline', color: '#dd6b20' },
    { id: 'deals', label: 'Deal Value', color: '#2b6cb0' },
    { id: 'enrollments', label: 'Enrollment Revenue', color: '#38a169' },
  ];

  const nodes: MapNode[] = stages.map(s => ({ ...s, value: 10 }));
  const edges: MapEdge[] = [];

  for (let i = 0; i < stages.length - 1; i++) {
    edges.push({ source: stages[i].id, target: stages[i + 1].id, label: 'flows_to' });
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
