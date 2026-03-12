import { Op } from 'sequelize';
import Department from '../models/Department';
import Initiative from '../models/Initiative';
import DepartmentEvent from '../models/DepartmentEvent';
import { AiAgent } from '../models';
import { getDepartmentForCategory } from '../intelligence/agents/agentFactory';

// Build a map of department slug → actual agent count
async function getAgentCountsByDept(): Promise<Record<string, number>> {
  const agents = await AiAgent.findAll({ attributes: ['category', 'config'] });
  const counts: Record<string, number> = {};
  for (const a of agents) {
    const cfg = (a as any).config;
    const slug = cfg?.department_slug || getDepartmentForCategory((a as any).category || '').toLowerCase().replace(/ /g, '_');
    counts[slug] = (counts[slug] || 0) + 1;
  }
  return counts;
}

export async function getDepartments() {
  const [departments, agentCounts] = await Promise.all([
    Department.findAll({
      include: [
        { model: Initiative, as: 'initiatives', attributes: ['id', 'status', 'progress', 'revenue_impact'] },
      ],
      order: [['name', 'ASC']],
    }),
    getAgentCountsByDept(),
  ]);

  return departments.map((d) => {
    const inits = (d as any).initiatives || [];
    const activeCount = inits.filter((i: any) => i.status === 'active').length;
    const completedCount = inits.filter((i: any) => i.status === 'completed').length;
    const totalRevenue = inits.reduce((sum: number, i: any) => sum + (i.revenue_impact || 0), 0);

    return {
      id: d.id,
      name: d.name,
      slug: d.slug,
      mission: d.mission,
      color: d.color,
      bg_light: d.bg_light,
      team_size: agentCounts[d.slug] || 0,
      health_score: d.health_score,
      innovation_score: d.innovation_score,
      initiative_count: inits.length,
      active_initiatives: activeCount,
      completed_initiatives: completedCount,
      total_revenue_impact: totalRevenue,
      strategic_objectives: d.strategic_objectives,
      kpis: d.kpis,
    };
  });
}

export async function getDepartmentDetail(id: string) {
  const dept = await Department.findByPk(id, {
    include: [
      { model: Initiative, as: 'initiatives', order: [['priority', 'ASC'], ['created_at', 'DESC']] },
      { model: DepartmentEvent, as: 'events', order: [['created_at', 'DESC']], limit: 20 },
    ],
  });

  if (!dept) return null;

  const initiatives = (dept as any).initiatives || [];
  const events = (dept as any).events || [];

  return {
    overview: {
      id: dept.id,
      name: dept.name,
      slug: dept.slug,
      mission: dept.mission,
      color: dept.color,
      bg_light: dept.bg_light,
      team_size: dept.team_size,
      health_score: dept.health_score,
      innovation_score: dept.innovation_score,
    },
    achievements: events
      .filter((e: any) => e.event_type === 'achievement' || e.event_type === 'milestone')
      .slice(0, 10),
    risks: [
      ...events.filter((e: any) => e.event_type === 'risk').slice(0, 5),
      ...initiatives
        .filter((i: any) => i.risk_level === 'high' || i.risk_level === 'critical')
        .map((i: any) => ({
          id: i.id,
          title: `${i.title} — ${i.risk_level} risk`,
          description: i.description,
          severity: i.risk_level,
          event_type: 'initiative_risk',
          created_at: i.updated_at,
        })),
    ],
    building: initiatives.filter((i: any) => i.status === 'active'),
    maintenance: initiatives.filter((i: any) => i.status === 'on_hold'),
    strategic_objectives: dept.strategic_objectives || [],
    kpis: dept.kpis || [],
    recent_events: events.slice(0, 15),
  };
}

export async function getInitiatives(filters: { department_id?: string; status?: string; priority?: string }) {
  const where: any = {};
  if (filters.department_id) where.department_id = filters.department_id;
  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;

  const initiatives = await Initiative.findAll({
    where,
    include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'slug', 'color'] }],
    order: [['priority', 'ASC'], ['progress', 'DESC']],
  });

  return initiatives;
}

export async function getInitiativeDetail(id: string) {
  const initiative = await Initiative.findByPk(id, {
    include: [
      { model: Department, as: 'department', attributes: ['id', 'name', 'slug', 'color', 'bg_light'] },
      { model: DepartmentEvent, as: 'events', order: [['created_at', 'DESC']], limit: 10 },
    ],
  });

  if (!initiative) return null;

  const now = new Date();
  const startDate = initiative.start_date ? new Date(initiative.start_date) : null;
  const targetDate = initiative.target_date ? new Date(initiative.target_date) : null;
  const completedDate = initiative.completed_date ? new Date(initiative.completed_date) : null;

  const daysElapsed = startDate ? Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / 86400000)) : 0;
  const totalPlannedDays = startDate && targetDate ? Math.max(1, Math.floor((targetDate.getTime() - startDate.getTime()) / 86400000)) : 0;
  const actualDuration = startDate && completedDate ? Math.floor((completedDate.getTime() - startDate.getTime()) / 86400000) : null;

  return {
    ...initiative.toJSON(),
    computed: {
      days_elapsed: daysElapsed,
      total_planned_days: totalPlannedDays,
      actual_duration_days: actualDuration,
      days_remaining: targetDate ? Math.max(0, Math.floor((targetDate.getTime() - now.getTime()) / 86400000)) : null,
      on_schedule: totalPlannedDays > 0 ? initiative.progress >= (daysElapsed / totalPlannedDays) * 100 : null,
    },
  };
}

export async function getRoadmap() {
  const initiatives = await Initiative.findAll({
    include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'slug', 'color', 'bg_light'] }],
    order: [['start_date', 'ASC']],
  });

  // Group by department
  const byDept: Record<string, any> = {};
  for (const init of initiatives) {
    const dept = (init as any).department;
    if (!dept) continue;
    if (!byDept[dept.slug]) {
      byDept[dept.slug] = {
        department: { id: dept.id, name: dept.name, slug: dept.slug, color: dept.color, bg_light: dept.bg_light },
        initiatives: [],
      };
    }
    byDept[dept.slug].initiatives.push({
      id: init.id,
      title: init.title,
      status: init.status,
      priority: init.priority,
      progress: init.progress,
      start_date: init.start_date,
      target_date: init.target_date,
      completed_date: init.completed_date,
      revenue_impact: init.revenue_impact,
      risk_level: init.risk_level,
    });
  }

  return Object.values(byDept);
}

export async function getDepartmentTimeline(filters: { department_id?: string; limit?: number }) {
  const where: any = {};
  if (filters.department_id) where.department_id = filters.department_id;

  const events = await DepartmentEvent.findAll({
    where,
    include: [
      { model: Department, as: 'department', attributes: ['id', 'name', 'slug', 'color'] },
      { model: Initiative, as: 'initiative', attributes: ['id', 'title'], required: false },
    ],
    order: [['created_at', 'DESC']],
    limit: filters.limit || 50,
  });

  return events;
}

export async function getInnovationScores() {
  const departments = await Department.findAll({
    include: [
      { model: Initiative, as: 'initiatives', attributes: ['id', 'status', 'progress', 'revenue_impact', 'created_at', 'completed_date'] },
    ],
    order: [['innovation_score', 'DESC']],
  });

  return departments.map((d) => {
    const inits = (d as any).initiatives || [];
    const active = inits.filter((i: any) => i.status === 'active').length;
    const completed = inits.filter((i: any) => i.status === 'completed').length;
    const total = inits.length || 1;

    // Innovation score breakdown
    const initiativeVelocity = Math.min((active / Math.max(d.team_size, 1)) * 50, 100);
    const completionRate = (completed / total) * 100;
    const avgProgress = inits.reduce((s: number, i: any) => s + i.progress, 0) / total;

    return {
      id: d.id,
      name: d.name,
      slug: d.slug,
      color: d.color,
      bg_light: d.bg_light,
      innovation_score: d.innovation_score,
      health_score: d.health_score,
      breakdown: {
        initiative_velocity: Math.round(initiativeVelocity),
        completion_rate: Math.round(completionRate),
        avg_progress: Math.round(avgProgress),
        team_size: d.team_size,
        active_initiatives: active,
        completed_initiatives: completed,
        total_initiatives: inits.length,
      },
    };
  });
}

export async function getRevenueImpact(filters: { department_id?: string }) {
  const where: any = {};
  if (filters.department_id) where.department_id = filters.department_id;

  const initiatives = await Initiative.findAll({
    where: { ...where, revenue_impact: { [Op.gt]: 0 } },
    include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'slug', 'color'] }],
    order: [['revenue_impact', 'DESC']],
  });

  // Aggregate by department
  const byDept: Record<string, { department: any; total: number; initiatives: any[] }> = {};
  let grandTotal = 0;

  for (const init of initiatives) {
    const dept = (init as any).department;
    if (!dept) continue;
    if (!byDept[dept.id]) {
      byDept[dept.id] = { department: { id: dept.id, name: dept.name, slug: dept.slug, color: dept.color }, total: 0, initiatives: [] };
    }
    byDept[dept.id].total += init.revenue_impact || 0;
    byDept[dept.id].initiatives.push({
      id: init.id,
      title: init.title,
      status: init.status,
      revenue_impact: init.revenue_impact,
      progress: init.progress,
    });
    grandTotal += init.revenue_impact || 0;
  }

  return {
    grand_total: grandTotal,
    by_department: Object.values(byDept).sort((a, b) => b.total - a.total),
  };
}
