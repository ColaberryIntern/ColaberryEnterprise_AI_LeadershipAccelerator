/**
 * Cory Self-Evolution Engine
 *
 * Analyzes the agent fleet, workflows, and system health to detect:
 * - Redundant agents that could be merged
 * - Workflow inefficiencies
 * - Schedule conflicts
 * - Agent performance issues
 *
 * All proposals are tracked through the ticket system.
 * Cory NEVER deletes agents, modifies schema, or disables safety rules.
 */

import AiAgent from '../../models/AiAgent';
import AgentPerformanceSnapshot from '../../models/AgentPerformanceSnapshot';
import DepartmentReport from '../../models/DepartmentReport';
import AgentTask from '../../models/AgentTask';
import { createStrategicInitiative, type CreateInitiativeInput } from './coryInitiatives';
import { logAiEvent } from '../aiEventService';
import { Op } from 'sequelize';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvolutionFinding {
  type: 'redundancy' | 'performance' | 'workflow' | 'schedule' | 'gap';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  involved_agents: string[];
  involved_departments: string[];
  recommendation: string;
}

// ---------------------------------------------------------------------------
// Detection: Redundant Agents
// ---------------------------------------------------------------------------

export async function detectRedundantAgents(): Promise<EvolutionFinding[]> {
  const findings: EvolutionFinding[] = [];

  // Find agents in the same group with very similar descriptions or low usage
  const agents = await AiAgent.findAll({
    where: { enabled: true },
    attributes: ['agent_name', 'agent_group', 'description', 'run_count', 'category', 'schedule'],
    order: [['agent_group', 'ASC'], ['agent_name', 'ASC']],
  });

  // Group by agent_group
  const groups = new Map<string, typeof agents>();
  for (const agent of agents) {
    const group = (agent as any).agent_group || 'ungrouped';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(agent);
  }

  for (const [group, members] of groups) {
    if (group === 'ungrouped' || members.length < 2) continue;

    // Check for low-execution agents within a group
    const lowExec = members.filter(a => a.run_count < 5);
    if (lowExec.length >= 2) {
      findings.push({
        type: 'redundancy',
        severity: 'medium',
        title: `${lowExec.length} low-activity agents in ${group}`,
        description: `Agents ${lowExec.map(a => a.agent_name).join(', ')} have fewer than 5 executions each. Consider consolidating.`,
        involved_agents: lowExec.map(a => a.agent_name),
        involved_departments: [group],
        recommendation: `Review whether these agents can be merged or if they are not yet active.`,
      });
    }

    // Check for agents with identical schedules (potential conflicts)
    const scheduleMap = new Map<string, string[]>();
    for (const agent of members) {
      const sched = agent.schedule || 'none';
      if (!scheduleMap.has(sched)) scheduleMap.set(sched, []);
      scheduleMap.get(sched)!.push(agent.agent_name);
    }

    for (const [sched, agentNames] of scheduleMap) {
      if (sched === 'none' || agentNames.length < 3) continue;
      findings.push({
        type: 'schedule',
        severity: 'low',
        title: `${agentNames.length} agents share schedule "${sched}" in ${group}`,
        description: `Agents ${agentNames.join(', ')} all run on the same schedule. This may cause resource contention.`,
        involved_agents: agentNames,
        involved_departments: [group],
        recommendation: `Stagger execution times to distribute load.`,
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Detection: Agent Performance Issues
// ---------------------------------------------------------------------------

export async function detectAgentPerformanceIssues(): Promise<EvolutionFinding[]> {
  const findings: EvolutionFinding[] = [];

  // Find agents with high error rates or long durations
  const agents = await AiAgent.findAll({
    where: {
      enabled: true,
      run_count: { [Op.gt]: 10 },
    },
    attributes: ['agent_name', 'agent_group', 'run_count', 'error_count', 'avg_duration_ms', 'status', 'category'],
  });

  for (const agent of agents) {
    const errorRate = agent.run_count > 0 ? agent.error_count / agent.run_count : 0;

    if (errorRate > 0.3) {
      findings.push({
        type: 'performance',
        severity: errorRate > 0.5 ? 'critical' : 'high',
        title: `${agent.agent_name} has ${(errorRate * 100).toFixed(0)}% error rate`,
        description: `${agent.error_count} errors in ${agent.run_count} runs. This agent needs investigation or redesign.`,
        involved_agents: [agent.agent_name],
        involved_departments: [(agent as any).agent_group || agent.category || 'unknown'],
        recommendation: errorRate > 0.5
          ? `Disable and redesign ${agent.agent_name}. Error rate exceeds 50%.`
          : `Investigate root cause of errors in ${agent.agent_name}.`,
      });
    }

    if (agent.avg_duration_ms && agent.avg_duration_ms > 60000) {
      findings.push({
        type: 'performance',
        severity: agent.avg_duration_ms > 120000 ? 'high' : 'medium',
        title: `${agent.agent_name} is slow (${(agent.avg_duration_ms / 1000).toFixed(1)}s avg)`,
        description: `Average execution time exceeds ${agent.avg_duration_ms > 120000 ? '2 minutes' : '1 minute'}.`,
        involved_agents: [agent.agent_name],
        involved_departments: [(agent as any).agent_group || agent.category || 'unknown'],
        recommendation: `Profile and optimize ${agent.agent_name} execution path.`,
      });
    }

    if (agent.status === 'error') {
      findings.push({
        type: 'performance',
        severity: 'high',
        title: `${agent.agent_name} is in error state`,
        description: `Agent is stuck in error state and not executing. Requires manual intervention.`,
        involved_agents: [agent.agent_name],
        involved_departments: [(agent as any).agent_group || agent.category || 'unknown'],
        recommendation: `Reset agent status and investigate last error.`,
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Detection: Workflow Inefficiencies
// ---------------------------------------------------------------------------

export async function detectWorkflowInefficiencies(): Promise<EvolutionFinding[]> {
  const findings: EvolutionFinding[] = [];

  // Check for departments with too many anomalies
  const reports = await DepartmentReport.findAll({
    where: {
      created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      report_type: 'alert',
    },
    order: [['created_at', 'DESC']],
    limit: 50,
  });

  // Count alerts per department
  const alertCounts = new Map<string, number>();
  for (const r of reports) {
    alertCounts.set(r.department, (alertCounts.get(r.department) || 0) + 1);
  }

  for (const [dept, count] of alertCounts) {
    if (count >= 3) {
      findings.push({
        type: 'workflow',
        severity: count >= 5 ? 'high' : 'medium',
        title: `${dept} department triggered ${count} alerts in 24h`,
        description: `Repeated alerts suggest a systemic workflow issue rather than isolated incidents.`,
        involved_agents: [],
        involved_departments: [dept],
        recommendation: `Review department workflow and agent configurations for ${dept}.`,
      });
    }
  }

  // Check for tasks that have been pending too long
  const staleTasks = await AgentTask.findAll({
    where: {
      status: { [Op.in]: ['pending', 'assigned'] },
      created_at: { [Op.lt]: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    limit: 20,
  });

  if (staleTasks.length >= 3) {
    const departments = [...new Set(staleTasks.map(t => t.assigned_department).filter(Boolean))] as string[];
    findings.push({
      type: 'workflow',
      severity: 'medium',
      title: `${staleTasks.length} agent tasks stale for 48+ hours`,
      description: `Tasks are not being picked up or completed. May indicate capacity issues or misconfigured assignments.`,
      involved_agents: [...new Set(staleTasks.map(t => t.assigned_agent).filter(Boolean))] as string[],
      involved_departments: departments,
      recommendation: `Review task assignment pipeline and agent capacity.`,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Detection: Schedule Conflicts
// ---------------------------------------------------------------------------

export async function detectScheduleConflicts(): Promise<EvolutionFinding[]> {
  const findings: EvolutionFinding[] = [];

  const agents = await AiAgent.findAll({
    where: { enabled: true, schedule: { [Op.not]: null as any } },
    attributes: ['agent_name', 'schedule', 'avg_duration_ms', 'agent_group'],
  });

  // Group by exact schedule
  const scheduleGroups = new Map<string, string[]>();
  for (const agent of agents) {
    if (!agent.schedule) continue;
    if (!scheduleGroups.has(agent.schedule)) scheduleGroups.set(agent.schedule, []);
    scheduleGroups.get(agent.schedule)!.push(agent.agent_name);
  }

  for (const [schedule, agentNames] of scheduleGroups) {
    if (agentNames.length >= 5) {
      findings.push({
        type: 'schedule',
        severity: 'medium',
        title: `${agentNames.length} agents share schedule "${schedule}"`,
        description: `Heavy concurrency on this cron schedule may cause resource contention.`,
        involved_agents: agentNames.slice(0, 10),
        involved_departments: [],
        recommendation: `Stagger agent schedules to avoid resource spikes.`,
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Proposal Generation
// ---------------------------------------------------------------------------

export async function proposeAgentMerge(
  agentNames: string[],
  mergedName: string,
  justification: string,
): Promise<void> {
  await createStrategicInitiative({
    title: `Merge agents: ${agentNames.join(' + ')} → ${mergedName}`,
    description: justification,
    initiative_type: 'agent_restructure',
    priority: 'medium',
    involved_agents: agentNames,
    involved_departments: [],
    subtasks: [
      { title: `Analyze overlap between ${agentNames.join(', ')}`, effort: 'medium' },
      { title: `Design merged agent: ${mergedName}`, effort: 'medium' },
      { title: `Implement and test ${mergedName}`, effort: 'large' },
      { title: `Validate merged agent covers all previous functionality`, effort: 'medium' },
      { title: `Deprecate old agents (disable, do not delete)`, effort: 'small' },
    ],
  });
}

export async function proposeAgentCreation(
  agentName: string,
  purpose: string,
  department: string,
): Promise<void> {
  await createStrategicInitiative({
    title: `Create new agent: ${agentName}`,
    description: purpose,
    initiative_type: 'agent_creation',
    priority: 'medium',
    involved_agents: [],
    involved_departments: [department],
    subtasks: [
      { title: `Define agent responsibilities and executor`, effort: 'medium' },
      { title: `Implement ${agentName} executor`, effort: 'large' },
      { title: `Register in agent registry seed`, effort: 'small' },
      { title: `Test agent execution in isolation`, effort: 'medium' },
      { title: `Schedule and monitor initial runs`, effort: 'small' },
    ],
  });
}

export async function proposeArchitectureChange(
  title: string,
  description: string,
  departments: string[],
): Promise<void> {
  await createStrategicInitiative({
    title,
    description,
    initiative_type: 'system_automation',
    priority: 'high',
    involved_agents: [],
    involved_departments: departments,
    subtasks: [
      { title: `Assess current architecture impact`, effort: 'medium' },
      { title: `Design proposed changes`, effort: 'large' },
      { title: `Implement changes with backward compatibility`, effort: 'large' },
      { title: `Validate no existing functionality broken`, effort: 'medium' },
    ],
  });
}

// ---------------------------------------------------------------------------
// Main Evolution Cycle
// ---------------------------------------------------------------------------

/**
 * Run the full self-evolution analysis cycle.
 * Detects issues and generates strategic initiatives + tickets for each finding.
 */
export async function runEvolutionCycle(): Promise<{
  findings: EvolutionFinding[];
  initiatives_created: number;
}> {
  const allFindings: EvolutionFinding[] = [];

  // Run all detectors in parallel
  const [redundancy, performance, workflow, schedule] = await Promise.all([
    detectRedundantAgents().catch(() => [] as EvolutionFinding[]),
    detectAgentPerformanceIssues().catch(() => [] as EvolutionFinding[]),
    detectWorkflowInefficiencies().catch(() => [] as EvolutionFinding[]),
    detectScheduleConflicts().catch(() => [] as EvolutionFinding[]),
  ]);

  allFindings.push(...redundancy, ...performance, ...workflow, ...schedule);

  // Only create initiatives for high/critical findings to avoid ticket noise
  let initiativesCreated = 0;
  const significantFindings = allFindings.filter(f => f.severity === 'high' || f.severity === 'critical');

  for (const finding of significantFindings.slice(0, 5)) {
    try {
      const typeMap: Record<string, CreateInitiativeInput['initiative_type']> = {
        redundancy: 'agent_restructure',
        performance: 'ai_optimization',
        workflow: 'workflow_redesign',
        schedule: 'ai_optimization',
        gap: 'agent_creation',
      };

      await createStrategicInitiative({
        title: finding.title,
        description: `${finding.description}\n\nRecommendation: ${finding.recommendation}`,
        initiative_type: typeMap[finding.type] || 'ai_optimization',
        priority: finding.severity === 'critical' ? 'critical' : 'high',
        involved_agents: finding.involved_agents,
        involved_departments: finding.involved_departments,
        subtasks: [
          { title: `Investigate: ${finding.title}`, effort: 'medium' },
          { title: `Implement fix or optimization`, effort: 'large' },
          { title: `Validate resolution`, effort: 'small' },
        ],
      });
      initiativesCreated++;
    } catch (err) {
      // Non-critical: log and continue
    }
  }

  await logAiEvent('CoryEvolution', 'EVOLUTION_CYCLE', 'strategic_initiatives', undefined, {
    total_findings: allFindings.length,
    by_type: {
      redundancy: redundancy.length,
      performance: performance.length,
      workflow: workflow.length,
      schedule: schedule.length,
    },
    initiatives_created: initiativesCreated,
  }).catch(() => {});

  return { findings: allFindings, initiatives_created: initiativesCreated };
}
