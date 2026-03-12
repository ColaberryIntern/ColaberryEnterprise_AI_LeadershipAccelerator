import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { Department, Initiative, DepartmentEvent, AiAgent, Ticket } from '../models';
import { createTicket } from './ticketService';
import type { DeptStrategyConfig } from './agents/strategy/departmentStrategyConfigs';

// ── Types ────────────────────────────────────────────────────────────────

export interface HealthAssessment {
  department_id: string;
  department_slug: string;
  health_score: number;
  innovation_score: number;
  active_initiatives: number;
  completed_initiatives: number;
  stale_initiatives: number;
  recent_events: number;
  agent_count: number;
  agent_errors: number;
  overall_grade: 'excellent' | 'good' | 'needs_attention' | 'critical';
}

export interface StrategicOpportunity {
  type: 'health_gap' | 'innovation_gap' | 'stale_initiative' | 'no_active_work' | 'cross_dept';
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  supporting_departments?: string[];
}

export interface CreateInitiativeInput {
  department_id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
  supporting_departments?: string[];
  created_by_agent: string;
  parent_strategy_id?: string;
  tags?: string[];
}

// ── Health Evaluation ────────────────────────────────────────────────────

export async function evaluateDepartmentHealth(
  departmentId: string,
): Promise<HealthAssessment> {
  const dept = await Department.findByPk(departmentId);
  if (!dept) throw new Error(`Department ${departmentId} not found`);

  const now = new Date();
  const last24h = new Date(now.getTime() - 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  const [activeInitiatives, completedInitiatives, staleInitiatives, recentEvents] =
    await Promise.all([
      Initiative.count({ where: { department_id: departmentId, status: 'active' } }),
      Initiative.count({
        where: {
          department_id: departmentId,
          status: 'completed',
          completed_date: { [Op.gte]: thirtyDaysAgo },
        },
      }),
      Initiative.count({
        where: {
          department_id: departmentId,
          status: 'active',
          updated_at: { [Op.lt]: thirtyDaysAgo },
        },
      }),
      DepartmentEvent.count({
        where: { department_id: departmentId, created_at: { [Op.gte]: last24h } },
      }),
    ]);

  // Agent fleet health for this department
  const slug = (dept as any).slug;
  const agents = await AiAgent.findAll({
    where: { enabled: true },
    attributes: ['status', 'error_count', 'category'],
  });
  const deptAgents = agents.filter((a: any) => {
    const cat = a.category || '';
    return cat === slug || cat === `dept_${slug}` || cat === 'dept_strategy';
  });
  const agentErrors = deptAgents.filter((a: any) => a.status === 'error').length;

  const healthScore = Number((dept as any).health_score) || 50;
  const innovationScore = Number((dept as any).innovation_score) || 50;

  let grade: HealthAssessment['overall_grade'] = 'good';
  if (healthScore >= 80 && innovationScore >= 60 && staleInitiatives === 0) grade = 'excellent';
  else if (healthScore < 50 || staleInitiatives > 3 || agentErrors > 2) grade = 'critical';
  else if (healthScore < 70 || staleInitiatives > 1 || agentErrors > 0) grade = 'needs_attention';

  return {
    department_id: departmentId,
    department_slug: slug,
    health_score: healthScore,
    innovation_score: innovationScore,
    active_initiatives: activeInitiatives,
    completed_initiatives: completedInitiatives,
    stale_initiatives: staleInitiatives,
    recent_events: recentEvents,
    agent_count: deptAgents.length,
    agent_errors: agentErrors,
    overall_grade: grade,
  };
}

// ── Opportunity Identification ───────────────────────────────────────────

export async function identifyOpportunities(
  departmentId: string,
  config: DeptStrategyConfig,
): Promise<StrategicOpportunity[]> {
  const health = await evaluateDepartmentHealth(departmentId);
  const opportunities: StrategicOpportunity[] = [];

  // Health gap
  if (health.health_score < config.kpi_thresholds.health_min) {
    opportunities.push({
      type: 'health_gap',
      title: `Improve ${config.label} Department Health`,
      description: `Health score ${health.health_score} is below threshold ${config.kpi_thresholds.health_min}. Focus on ${config.focus_areas.slice(0, 2).join(' and ')}.`,
      priority: health.health_score < 50 ? 'critical' : 'high',
    });
  }

  // Innovation gap
  if (health.innovation_score < config.kpi_thresholds.innovation_min) {
    opportunities.push({
      type: 'innovation_gap',
      title: `Drive Innovation in ${config.label}`,
      description: `Innovation score ${health.innovation_score} below threshold ${config.kpi_thresholds.innovation_min}. Explore new approaches in ${config.focus_areas[0]}.`,
      priority: 'medium',
    });
  }

  // Stale initiatives
  if (health.stale_initiatives > 0) {
    opportunities.push({
      type: 'stale_initiative',
      title: `Revitalize Stale Initiatives in ${config.label}`,
      description: `${health.stale_initiatives} initiative(s) have not been updated in 30+ days. Review and either accelerate or cancel.`,
      priority: health.stale_initiatives > 2 ? 'high' : 'medium',
    });
  }

  // No active work
  if (health.active_initiatives === 0) {
    opportunities.push({
      type: 'no_active_work',
      title: `Launch Strategic Initiative for ${config.label}`,
      description: `No active initiatives. The department should begin work on ${config.focus_areas[0]} to drive progress.`,
      priority: 'high',
    });
  }

  // Cross-department opportunity detection
  const allDepts = await Department.findAll({ attributes: ['id', 'slug', 'name', 'mission'] });
  for (const otherDept of allDepts) {
    const otherSlug = (otherDept as any).slug;
    if (otherSlug === config.slug) continue;
    const otherMission = ((otherDept as any).mission || '').toLowerCase();
    const matches = config.cross_dept_keywords.filter((kw) => otherMission.includes(kw));
    if (matches.length >= 2) {
      opportunities.push({
        type: 'cross_dept',
        title: `Cross-Department Collaboration: ${config.label} + ${(otherDept as any).name}`,
        description: `Shared focus areas: ${matches.join(', ')}. Joint initiative could accelerate progress.`,
        priority: 'medium',
        supporting_departments: [(otherDept as any).id],
      });
    }
  }

  return opportunities.slice(0, config.max_initiatives_per_cycle);
}

// ── Initiative Creation ──────────────────────────────────────────────────

export async function createStrategicInitiative(
  data: CreateInitiativeInput,
): Promise<any> {
  // Dedup: check for existing active initiative with same title
  const existing = await Initiative.findOne({
    where: {
      department_id: data.department_id,
      title: data.title,
      status: { [Op.in]: ['planned', 'active'] },
    },
  });
  if (existing) return existing;

  const initiative = await Initiative.create({
    department_id: data.department_id,
    title: data.title,
    description: data.description,
    status: 'planned',
    priority: data.priority,
    risk_level: data.risk_level || 'low',
    supporting_departments: data.supporting_departments || [],
    created_by_agent: data.created_by_agent,
    parent_strategy_id: data.parent_strategy_id,
    tags: data.tags || [],
    start_date: new Date(),
    progress: 0,
  } as any);

  // Log creation event
  await DepartmentEvent.create({
    department_id: data.department_id,
    initiative_id: initiative.id,
    event_type: 'initiative_created' as any,
    title: `Initiative Created: ${data.title}`,
    description: `Created by ${data.created_by_agent}. Priority: ${data.priority}.${data.supporting_departments?.length ? ` Collaborating departments: ${data.supporting_departments.length}` : ''}`,
    severity: data.priority === 'critical' ? 'high' : 'normal',
    metadata: {
      created_by_agent: data.created_by_agent,
      supporting_departments: data.supporting_departments,
      parent_strategy_id: data.parent_strategy_id,
    },
  });

  return initiative;
}

// ── Ticket Generation ────────────────────────────────────────────────────

export async function generateInitiativeTickets(
  initiativeId: string,
  agentName: string,
): Promise<any[]> {
  const initiative = await Initiative.findByPk(initiativeId);
  if (!initiative) return [];

  const dept = await Department.findByPk(initiative.department_id);
  const deptName = dept ? (dept as any).name : 'Unknown';

  // Create a strategic ticket for this initiative
  const ticket = await createTicket({
    title: `[${deptName}] ${initiative.title}`,
    description: initiative.description || `Strategic initiative for ${deptName}: ${initiative.title}`,
    type: 'strategic',
    priority: initiative.priority as any,
    source: 'strategy_architect',
    created_by_type: 'agent',
    created_by_id: agentName,
    entity_type: 'initiative',
    entity_id: initiativeId,
    metadata: {
      department_id: initiative.department_id,
      department_name: deptName,
      supporting_departments: initiative.supporting_departments || [],
      initiative_priority: initiative.priority,
    },
  });

  // Log ticket generation event
  await DepartmentEvent.create({
    department_id: initiative.department_id,
    initiative_id: initiativeId,
    event_type: 'ticket_generated' as any,
    title: `Ticket Generated: ${initiative.title}`,
    description: `Execution ticket created by ${agentName} for initiative "${initiative.title}"`,
    severity: 'normal',
    metadata: { ticket_id: ticket.id, agent: agentName },
  });

  return [ticket];
}

// ── Cross-Department Queries ─────────────────────────────────────────────

export async function getCrossDepartmentInitiatives(): Promise<any[]> {
  const initiatives = await Initiative.findAll({
    where: sequelize.literal("supporting_departments IS NOT NULL AND supporting_departments != '[]'::jsonb"),
    order: [['created_at', 'DESC']],
    limit: 50,
  });

  // Enrich with department names
  const deptIds = new Set<string>();
  for (const init of initiatives) {
    deptIds.add(init.department_id);
    for (const sid of (init.supporting_departments || [])) {
      deptIds.add(sid);
    }
  }

  const departments = await Department.findAll({
    where: { id: { [Op.in]: Array.from(deptIds) } },
    attributes: ['id', 'name', 'slug', 'color'],
  });
  const deptMap = new Map(departments.map((d: any) => [d.id, { name: d.name, slug: d.slug, color: d.color }]));

  return initiatives.map((init: any) => ({
    ...init.toJSON(),
    department: deptMap.get(init.department_id) || null,
    supporting_department_details: (init.supporting_departments || []).map((sid: string) => deptMap.get(sid)).filter(Boolean),
  }));
}

// ── Strategy Summary ─────────────────────────────────────────────────────

export async function getStrategySummary(): Promise<any> {
  const departments = await Department.findAll({
    attributes: ['id', 'name', 'slug', 'color', 'health_score', 'innovation_score'],
    order: [['name', 'ASC']],
  });

  const initiatives = await Initiative.findAll({
    attributes: ['id', 'department_id', 'status', 'priority', 'supporting_departments', 'created_by_agent', 'created_at'],
  });

  const strategyAgents = await AiAgent.findAll({
    where: { category: 'dept_strategy' },
    attributes: ['id', 'agent_name', 'status', 'enabled', 'last_run_at', 'run_count', 'error_count', 'avg_duration_ms', 'config'],
  });

  const recentEvents = await DepartmentEvent.findAll({
    where: {
      event_type: { [Op.in]: ['strategy_analysis', 'initiative_created', 'ticket_generated', 'health_assessment', 'opportunity_identified'] },
    },
    order: [['created_at', 'DESC']],
    limit: 30,
  });

  const deptSummaries = departments.map((dept: any) => {
    const deptInits = initiatives.filter((i: any) => i.department_id === dept.id);
    const agent = strategyAgents.find((a: any) => {
      const slug = a.config?.department_slug;
      return slug === dept.slug;
    });
    return {
      id: dept.id,
      name: dept.name,
      slug: dept.slug,
      color: dept.color,
      health_score: dept.health_score,
      innovation_score: dept.innovation_score,
      active_initiatives: deptInits.filter((i: any) => i.status === 'active').length,
      planned_initiatives: deptInits.filter((i: any) => i.status === 'planned').length,
      completed_initiatives: deptInits.filter((i: any) => i.status === 'completed').length,
      total_initiatives: deptInits.length,
      last_strategy_run: agent?.last_run_at || null,
      strategy_agent: agent ? {
        id: agent.id,
        name: agent.agent_name,
        status: agent.status,
        enabled: agent.enabled,
        last_run_at: agent.last_run_at,
        run_count: agent.run_count,
        error_count: agent.error_count,
      } : null,
    };
  });

  const crossDeptCount = initiatives.filter(
    (i: any) => i.supporting_departments && i.supporting_departments.length > 0,
  ).length;

  const totalHealth = departments.reduce((s: number, d: any) => s + (d.health_score || 0), 0);
  const totalInnovation = departments.reduce((s: number, d: any) => s + (d.innovation_score || 0), 0);
  const deptCount = departments.length || 1;

  return {
    departments: deptSummaries,
    total_departments: departments.length,
    total_initiatives: initiatives.length,
    active_initiatives: initiatives.filter((i: any) => i.status === 'active').length,
    completed_initiatives: initiatives.filter((i: any) => i.status === 'completed').length,
    cross_dept_initiatives: crossDeptCount,
    cross_dept_count: crossDeptCount,
    avg_health_score: Math.round(totalHealth / deptCount),
    avg_innovation_score: Math.round(totalInnovation / deptCount),
    strategy_agents: strategyAgents.map((a: any) => ({
      id: a.id,
      name: a.agent_name,
      status: a.status,
      enabled: a.enabled,
      last_run_at: a.last_run_at,
      run_count: a.run_count,
      error_count: a.error_count,
      avg_duration_ms: a.avg_duration_ms,
      department_slug: a.config?.department_slug,
    })),
    recent_events: recentEvents.map((e: any) => e.toJSON()),
  };
}
