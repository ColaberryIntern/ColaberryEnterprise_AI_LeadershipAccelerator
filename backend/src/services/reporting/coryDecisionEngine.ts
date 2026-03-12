// ─── Cory Decision Engine ───────────────────────────────────────────────────
// Orchestrates strategic simulations, execution planning, and outcome tracking.

import SimulationAccuracy from '../../models/SimulationAccuracy';
import { Ticket, AiAgent } from '../../models';
import TicketActivity from '../../models/TicketActivity';
import * as simulationEngine from './coryStrategicSimulationEngine';
import * as ticketService from '../ticketService';
import * as coryKnowledgeGraphService from './coryKnowledgeGraphService';
import type { SimulationContext, SimulationResult } from './coryStrategicSimulationEngine';
import { STRATEGY_TASK_TEMPLATES } from './coryStrategicSimulationEngine';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExecutionResult {
  ticket_id: string;
  ticket_number: number;
  tasks: { title: string; agent_name: string; status: string; estimated_duration: string; ticket_id?: string }[];
  predicted_results: { leads: number; conversions: number; enrollments: number; revenue: number };
  eta: string;
  monitoring_url: string;
}

interface TaskPlan {
  title: string;
  agent_name: string;
  estimated_duration: string;
  dependencies: string[];
}

// ─── Simulate ───────────────────────────────────────────────────────────────

export async function handleSimulate(
  context: SimulationContext & { insight_id?: string },
): Promise<{ simulation_id: string } & SimulationResult> {
  const result = await simulationEngine.simulateStrategy(context);
  const simulationId = uuidv4();

  await SimulationAccuracy.create({
    simulation_id: simulationId,
    simulation_type: (context.strategy_type === 'launch_experiment' ? 'experiment' : 'strategy') as any,
    context: {
      entity_type: context.entity_type,
      entity_id: context.entity_id,
      strategy_type: context.strategy_type,
      parameters: context.parameters,
    },
    predicted_outcome: {
      leads: result.predicted_leads,
      conversions: result.predicted_conversions,
      enrollments: result.predicted_enrollments,
      revenue: result.predicted_revenue,
      timeline_days: result.timeline_days,
    },
    confidence: result.confidence,
    risk_score: result.risk_score,
    insight_id: context.insight_id || null,
    status: 'pending',
  });

  return { simulation_id: simulationId, ...result };
}

// ─── Execute ────────────────────────────────────────────────────────────────

export async function handleExecute(simulationId: string): Promise<ExecutionResult> {
  const simulation = await SimulationAccuracy.findOne({
    where: { simulation_id: simulationId },
  });

  if (!simulation) {
    throw new Error(`Simulation ${simulationId} not found`);
  }

  const plan = generateExecutionPlan(simulation);
  const eta = estimateCompletionTime(plan.tasks);

  // Create parent ticket
  const parentTicket = await ticketService.createTicket({
    title: `Strategic Execution: ${simulation.context.strategy_type}`,
    description: `Executing simulation ${simulationId}. Strategy: ${simulation.context.strategy_type}. Predicted revenue: $${simulation.predicted_outcome.revenue || 0}.`,
    type: 'strategic',
    source: 'cory',
    created_by_type: 'cory',
    created_by_id: 'cory-decision-engine',
    priority: simulation.risk_score > 0.5 ? 'high' : 'medium',
    status: 'todo',
    metadata: {
      simulation_id: simulationId,
      predicted_outcome: simulation.predicted_outcome,
      confidence: simulation.confidence,
      risk_score: simulation.risk_score,
    },
  });

  // Create sub-task tickets for each task in the plan
  const taskResults: ExecutionResult['tasks'] = [];

  for (const task of plan.tasks) {
    const agentId = await resolveAgentAssignment(task.agent_name);

    const subTicket = await ticketService.createTicket({
      title: task.title,
      description: `Agent task: ${task.title}. Assigned to ${task.agent_name}. Estimated duration: ${task.estimated_duration}.`,
      type: 'agent_action',
      source: 'cory',
      created_by_type: 'cory',
      created_by_id: 'cory-decision-engine',
      parent_ticket_id: parentTicket.id,
      assigned_to_type: 'agent',
      assigned_to_id: agentId || task.agent_name,
      estimated_effort: task.estimated_duration,
      status: 'backlog',
      metadata: {
        agent_name: task.agent_name,
        dependencies: task.dependencies,
        simulation_id: simulationId,
      },
    });

    taskResults.push({
      title: task.title,
      agent_name: task.agent_name,
      status: 'backlog',
      estimated_duration: task.estimated_duration,
      ticket_id: subTicket.id,
    });
  }

  // Update simulation status to tracking
  await simulation.update({
    status: 'tracking',
    ticket_id: parentTicket.id,
    tracking_start: new Date().toISOString().split('T')[0],
  });

  return {
    ticket_id: parentTicket.id,
    ticket_number: parentTicket.ticket_number,
    tasks: taskResults,
    predicted_results: {
      leads: simulation.predicted_outcome.leads || 0,
      conversions: simulation.predicted_outcome.conversions || 0,
      enrollments: simulation.predicted_outcome.enrollments || 0,
      revenue: simulation.predicted_outcome.revenue || 0,
    },
    eta,
    monitoring_url: `/admin/tickets/${parentTicket.id}`,
  };
}

// ─── Execution Plan ─────────────────────────────────────────────────────────

export function generateExecutionPlan(simulation: any): { tasks: TaskPlan[] } {
  const strategyType = simulation.context?.strategy_type || 'optimize_funnel';
  const templates = STRATEGY_TASK_TEMPLATES[strategyType] || [];

  const tasks: TaskPlan[] = templates.map((t) => ({
    title: t.task,
    agent_name: t.agent,
    estimated_duration: t.duration,
    dependencies: t.deps,
  }));

  return { tasks };
}

// ─── Agent Assignment ───────────────────────────────────────────────────────

export async function resolveAgentAssignment(agentName: string): Promise<string | null> {
  const agent = await AiAgent.findOne({
    where: { agent_name: agentName },
    attributes: ['id'],
  });

  return agent ? agent.id : null;
}

// ─── Completion Time Estimation ─────────────────────────────────────────────

export function estimateCompletionTime(tasks: any[]): string {
  let totalMinutes = 0;

  for (const task of tasks) {
    const duration = task.estimated_duration || task.duration || '0min';
    const match = duration.match(/^(\d+)\s*(min|h|d|day|days|hr|hrs|hour|hours)$/i);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      if (unit === 'min') {
        totalMinutes += value;
      } else if (unit === 'h' || unit === 'hr' || unit === 'hrs' || unit === 'hour' || unit === 'hours') {
        totalMinutes += value * 60;
      } else if (unit === 'd' || unit === 'day' || unit === 'days') {
        totalMinutes += value * 60 * 24;
      }
    }
  }

  if (totalMinutes < 60) {
    return `${totalMinutes} minutes`;
  } else if (totalMinutes < 60 * 24) {
    const hours = Math.round(totalMinutes / 60);
    return hours === 1 ? '1 hour' : `${hours} hours`;
  } else {
    const days = Math.round(totalMinutes / (60 * 24));
    return days === 1 ? '1 day' : `${days} days`;
  }
}

// ─── Outcome Tracking ──────────────────────────────────────────────────────

export async function trackExecutionOutcome(ticketId: string): Promise<void> {
  const simulation = await SimulationAccuracy.findOne({
    where: { ticket_id: ticketId },
  });

  if (!simulation) {
    return; // No simulation linked to this ticket
  }

  // Placeholder: compute accuracy from predicted vs actual
  // In production, actual_outcome would be populated by monitoring agents
  const accuracyScore = 0.75;

  await simulation.update({
    status: 'completed',
    actual_outcome: simulation.predicted_outcome, // placeholder — use real data when available
    accuracy_score: accuracyScore,
    tracking_end: new Date().toISOString().split('T')[0],
  });

  // Update Knowledge Graph with strategy execution record
  try {
    const ctx = simulation.context || {};
    await coryKnowledgeGraphService.recordStrategyExecution(
      ctx.strategy_type || 'unknown',
      ctx.entity_type || 'system',
      ctx.entity_id || 'system',
      simulation.predicted_outcome || {},
    );
  } catch (_err) {
    // Non-critical: graph update failure should not block outcome tracking
  }
}
