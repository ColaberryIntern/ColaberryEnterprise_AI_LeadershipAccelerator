/**
 * Task Orchestration Service
 *
 * Provides CRUD operations for the agent task system. CoryBrain and super agents
 * create tasks; department agents and super agents complete them.
 */

import AgentTask, { type TaskStatus, type TaskPriority } from '../models/AgentTask';
import AgentTaskResult from '../models/AgentTaskResult';
import { logAiEvent } from './aiEventService';
import { Op } from 'sequelize';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateTaskInput {
  task_type: string;
  description: string;
  assigned_department?: string;
  assigned_agent?: string;
  priority?: TaskPriority;
  context?: Record<string, any>;
  created_by?: string;
  due_at?: Date;
}

// ---------------------------------------------------------------------------
// Task CRUD
// ---------------------------------------------------------------------------

export async function createTask(params: CreateTaskInput): Promise<AgentTask> {
  const task = await AgentTask.create({
    task_type: params.task_type,
    description: params.description,
    assigned_department: params.assigned_department || null,
    assigned_agent: params.assigned_agent || null,
    priority: params.priority || 'medium',
    context: params.context || null,
    created_by: params.created_by || 'CoryBrain',
    due_at: params.due_at || null,
  });

  await logAiEvent('TaskOrchestrator', 'task_created', 'agent_tasks', task.id, {
    task_type: params.task_type,
    department: params.assigned_department,
    agent: params.assigned_agent,
    priority: params.priority || 'medium',
    created_by: params.created_by || 'CoryBrain',
  }).catch(() => {});

  return task;
}

export async function assignTask(taskId: string, agentName: string): Promise<AgentTask> {
  const task = await AgentTask.findByPk(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  task.assigned_agent = agentName;
  task.status = 'assigned';
  task.updated_at = new Date();
  await task.save();

  await logAiEvent('TaskOrchestrator', 'task_assigned', 'agent_tasks', taskId, {
    agent: agentName,
  }).catch(() => {});

  return task;
}

export async function startTask(taskId: string): Promise<AgentTask> {
  const task = await AgentTask.findByPk(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  task.status = 'in_progress';
  task.updated_at = new Date();
  await task.save();

  return task;
}

export async function completeTask(
  taskId: string,
  result: Record<string, any>,
  success: boolean,
  completedBy?: string,
  notes?: string,
): Promise<AgentTaskResult> {
  const task = await AgentTask.findByPk(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  task.status = success ? 'completed' : 'failed';
  task.updated_at = new Date();
  await task.save();

  const taskResult = await AgentTaskResult.create({
    task_id: taskId,
    result,
    success,
    notes: notes || null,
    completed_by: completedBy || task.assigned_agent || 'unknown',
  });

  await logAiEvent('TaskOrchestrator', 'task_completed', 'agent_tasks', taskId, {
    success,
    completed_by: completedBy || task.assigned_agent,
  }).catch(() => {});

  return taskResult;
}

export async function cancelTask(taskId: string): Promise<AgentTask> {
  const task = await AgentTask.findByPk(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  task.status = 'cancelled';
  task.updated_at = new Date();
  await task.save();

  return task;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getTasksByDepartment(department: string): Promise<AgentTask[]> {
  return AgentTask.findAll({
    where: { assigned_department: department },
    order: [['created_at', 'DESC']],
    limit: 50,
  });
}

export async function getPendingTasks(): Promise<AgentTask[]> {
  return AgentTask.findAll({
    where: { status: { [Op.in]: ['pending', 'assigned'] } },
    order: [
      ['priority', 'ASC'], // critical first (alphabetically: critical < high < low < medium)
      ['created_at', 'ASC'],
    ],
    limit: 100,
  });
}

export async function getTaskStats(): Promise<{
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  failed: number;
}> {
  const all = await AgentTask.findAll({
    attributes: ['status'],
    where: {
      created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  const counts = { total: all.length, pending: 0, in_progress: 0, completed: 0, failed: 0 };
  for (const t of all) {
    if (t.status === 'pending' || t.status === 'assigned') counts.pending++;
    else if (t.status === 'in_progress') counts.in_progress++;
    else if (t.status === 'completed') counts.completed++;
    else if (t.status === 'failed') counts.failed++;
  }
  return counts;
}
