import { Op } from 'sequelize';
import { Department, DepartmentEvent, AiAgent, AiAgentActivityLog } from '../../../models';
import { createTicket } from '../../ticketService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AgentBehaviorMonitorAgent';
const STUCK_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const ERROR_SPIKE_THRESHOLD = 5;
const DURATION_MULTIPLIER = 3; // flag if >3x avg duration

interface BehaviorAnomaly {
  agent_id: string;
  agent_name: string;
  anomaly_type: 'stuck' | 'error_spike' | 'duration_anomaly';
  severity: 'critical' | 'high' | 'medium';
  details: string;
}

export async function runAgentBehaviorMonitorAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const anomalies: BehaviorAnomaly[] = [];

  try {
    const allAgents = await AiAgent.findAll({ where: { enabled: true }, raw: true }) as any[];
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // 1. Detect stuck agents (status: 'running' for too long)
    for (const agent of allAgents) {
      if (agent.status === 'running' && agent.last_run_at) {
        const runningFor = Date.now() - new Date(agent.last_run_at).getTime();
        if (runningFor > STUCK_THRESHOLD_MS) {
          anomalies.push({
            agent_id: agent.id,
            agent_name: agent.agent_name,
            anomaly_type: 'stuck',
            severity: 'critical',
            details: `Running for ${Math.round(runningFor / 60000)}min (threshold: ${STUCK_THRESHOLD_MS / 60000}min)`,
          });
        }
      }
    }

    // 2. Detect error spikes (many errors in last hour)
    const recentLogs = await AiAgentActivityLog.findAll({
      where: {
        created_at: { [Op.gte]: oneHourAgo },
        result: 'failed',
      },
      attributes: ['agent_id'],
      raw: true,
    });

    const errorCounts: Record<string, number> = {};
    for (const log of recentLogs as any[]) {
      errorCounts[log.agent_id] = (errorCounts[log.agent_id] || 0) + 1;
    }

    for (const [aid, count] of Object.entries(errorCounts)) {
      if (count >= ERROR_SPIKE_THRESHOLD) {
        const agent = allAgents.find((a: any) => a.id === aid);
        anomalies.push({
          agent_id: aid,
          agent_name: agent?.agent_name || 'Unknown',
          anomaly_type: 'error_spike',
          severity: 'high',
          details: `${count} failures in last hour (threshold: ${ERROR_SPIKE_THRESHOLD})`,
        });
      }
    }

    // 3. Detect duration anomalies via agent model stats
    for (const agent of allAgents) {
      if (agent.avg_duration_ms && agent.avg_duration_ms > 0 && agent.last_result?.duration_ms) {
        const lastDuration = agent.last_result.duration_ms;
        if (lastDuration > agent.avg_duration_ms * DURATION_MULTIPLIER && lastDuration > 5000) {
          anomalies.push({
            agent_id: agent.id,
            agent_name: agent.agent_name,
            anomaly_type: 'duration_anomaly',
            severity: 'medium',
            details: `Last run ${lastDuration}ms vs avg ${agent.avg_duration_ms}ms (${(lastDuration / agent.avg_duration_ms).toFixed(1)}x)`,
          });
        }
      }
    }

    actions.push({
      campaign_id: '',
      action: 'agent_behavior_scan',
      reason: `Monitored ${allAgents.length} agent(s): ${anomalies.length} anomaly(ies) (${anomalies.filter((a) => a.anomaly_type === 'stuck').length} stuck, ${anomalies.filter((a) => a.anomaly_type === 'error_spike').length} error spikes, ${anomalies.filter((a) => a.anomaly_type === 'duration_anomaly').length} slow)`,
      confidence: 0.9,
      before_state: null,
      after_state: {
        agents_monitored: allAgents.length,
        anomalies_count: anomalies.length,
        by_type: anomalies.reduce((acc, a) => { acc[a.anomaly_type] = (acc[a.anomaly_type] || 0) + 1; return acc; }, {} as Record<string, number>),
      },
      result: anomalies.length > 0 ? 'flagged' : 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    const securityDept = await Department.findOne({ where: { slug: 'security' } });
    if (securityDept) {
      const deptId = (securityDept as any).id;

      if (anomalies.length > 0) {
        const severity = anomalies.some((a) => a.severity === 'critical') ? 'critical'
          : anomalies.some((a) => a.severity === 'high') ? 'high' : 'normal';

        await DepartmentEvent.create({
          department_id: deptId,
          event_type: 'security_alert' as any,
          title: `Agent Behavior: ${anomalies.length} anomaly(ies) detected`,
          description: anomalies.map((a) => `${a.agent_name}: ${a.anomaly_type} — ${a.details}`).slice(0, 5).join('; '),
          severity,
          metadata: { agent: AGENT_NAME, agents_monitored: allAgents.length, anomalies: anomalies.slice(0, 15) },
        });

        // Ticket for stuck agents
        const stuckAgents = anomalies.filter((a) => a.anomaly_type === 'stuck');
        if (stuckAgents.length > 0) {
          try {
            await createTicket({
              title: `[Security] ${stuckAgents.length} agent(s) stuck in running state`,
              description: `Agents stuck for >15min: ${stuckAgents.map((a) => `${a.agent_name} — ${a.details}`).join('; ')}`,
              priority: 'critical',
              type: 'bug',
              source: 'security',
              created_by_type: 'agent',
              created_by_id: agentId,
              entity_type: 'system',
              entity_id: deptId,
              metadata: { stuck_agents: stuckAgents },
            });
          } catch (err: any) {
            errors.push(`Ticket failed: ${err.message?.slice(0, 100)}`);
          }
        }
      } else {
        await DepartmentEvent.create({
          department_id: deptId,
          event_type: 'security_scan' as any,
          title: `Agent Behavior: healthy — ${allAgents.length} agent(s) monitored`,
          description: `No stuck agents, error spikes, or duration anomalies detected.`,
          severity: 'normal',
          metadata: { agent: AGENT_NAME, agents_monitored: allAgents.length },
        });
      }
    }
  } catch (err: any) {
    errors.push(err.message || 'Agent behavior monitor error');
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: anomalies.length,
  };
}
