import { Op } from 'sequelize';
import { AiAgent, Ticket } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptTaskAssignmentAgent';

export async function runDeptTaskAssignmentAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    // Check for unassigned or open tickets
    let openTickets = 0;
    let unassignedTickets = 0;
    try {
      openTickets = await Ticket.count({
        where: { status: { [Op.in]: ['open', 'pending', 'new'] } },
      });
      unassignedTickets = await Ticket.count({
        where: {
          status: { [Op.in]: ['open', 'pending', 'new'] },
          assigned_to: { [Op.or]: [{ [Op.eq]: null }, { [Op.eq]: '' }] },
        } as any,
      });
    } catch {
      // Ticket model may not have these fields — graceful fallback
    }

    // Check agents needing attention (errored or idle for too long)
    const erroredAgents = await AiAgent.findAll({
      where: { status: 'error', enabled: true },
      attributes: ['agent_name', 'last_error', 'last_error_at'],
    });

    const idleAgents = await AiAgent.findAll({
      where: {
        status: 'idle',
        enabled: true,
        trigger_type: 'cron',
        last_run_at: { [Op.lt]: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      },
      attributes: ['agent_name', 'last_run_at', 'schedule'],
    });

    entitiesProcessed = openTickets + erroredAgents.length + idleAgents.length;

    const taskQueue: Array<{ priority: string; task: string; assignee_type: string }> = [];

    if (unassignedTickets > 0) {
      taskQueue.push({
        priority: 'high',
        task: `${unassignedTickets} unassigned tickets need routing`,
        assignee_type: 'human',
      });
    }

    for (const agent of erroredAgents) {
      taskQueue.push({
        priority: 'high',
        task: `Fix errored agent: ${(agent as any).agent_name}`,
        assignee_type: 'agent',
      });
    }

    for (const agent of idleAgents) {
      taskQueue.push({
        priority: 'medium',
        task: `Investigate stale agent: ${(agent as any).agent_name} — last ran ${(agent as any).last_run_at}`,
        assignee_type: 'agent',
      });
    }

    actions.push({
      campaign_id: '',
      action: 'task_assignment',
      reason: `Identified ${taskQueue.length} tasks needing assignment`,
      confidence: 0.84,
      before_state: null,
      after_state: {
        open_tickets: openTickets,
        unassigned_tickets: unassignedTickets,
        errored_agents: erroredAgents.length,
        idle_agents: idleAgents.length,
        task_queue: taskQueue,
      },
      result: taskQueue.length > 0 ? 'flagged' : 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'task_assignment',
      result: 'success',
      details: { tasks: taskQueue.length },
    }).catch(() => {});
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: entitiesProcessed,
  };
}
