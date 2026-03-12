import { Op } from 'sequelize';
import { Department, DepartmentEvent, PageEvent, AiAgentActivityLog } from '../../../models';
import { createTicket } from '../../ticketService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'RuntimeThreatMonitorAgent';
const WINDOW_MINUTES = 5;
const EVENT_THRESHOLD = 30; // flag visitors with >30 events in window

export async function runRuntimeThreatMonitorAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

    // 1. Detect scraping / high-volume visitors
    const recentEvents = await PageEvent.findAll({
      attributes: ['visitor_id', 'session_id'],
      where: { timestamp: { [Op.gte]: since } },
      raw: true,
    });

    // Group by visitor_id
    const visitorCounts: Record<string, { count: number; sessions: Set<string> }> = {};
    for (const ev of recentEvents as any[]) {
      const vid = ev.visitor_id;
      if (!visitorCounts[vid]) visitorCounts[vid] = { count: 0, sessions: new Set() };
      visitorCounts[vid].count++;
      if (ev.session_id) visitorCounts[vid].sessions.add(ev.session_id);
    }

    const suspiciousVisitors = Object.entries(visitorCounts)
      .filter(([, v]) => v.count > EVENT_THRESHOLD)
      .map(([vid, v]) => ({ visitor_id: vid, event_count: v.count, session_count: v.sessions.size }));

    // 2. Detect unusual agent activity volumes
    const recentAgentLogs = await AiAgentActivityLog.findAll({
      attributes: ['agent_id', 'action', 'result'],
      where: { created_at: { [Op.gte]: since } },
      raw: true,
    });

    const agentFailures: Record<string, number> = {};
    for (const log of recentAgentLogs as any[]) {
      if (log.result === 'failed') {
        agentFailures[log.agent_id] = (agentFailures[log.agent_id] || 0) + 1;
      }
    }

    const failingAgents = Object.entries(agentFailures)
      .filter(([, count]) => count >= 3)
      .map(([agentId, count]) => ({ agent_id: agentId, failure_count: count }));

    const totalThreats = suspiciousVisitors.length + failingAgents.length;

    actions.push({
      campaign_id: '',
      action: 'runtime_threat_scan',
      reason: `${WINDOW_MINUTES}-min window: ${recentEvents.length} page events, ${suspiciousVisitors.length} suspicious visitor(s), ${failingAgents.length} failing agent(s)`,
      confidence: 0.85,
      before_state: null,
      after_state: {
        window_minutes: WINDOW_MINUTES,
        total_events: recentEvents.length,
        suspicious_visitors: suspiciousVisitors.length,
        failing_agents: failingAgents.length,
      },
      result: totalThreats > 0 ? 'flagged' : 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    const securityDept = await Department.findOne({ where: { slug: 'security' } });
    if (securityDept) {
      const deptId = (securityDept as any).id;

      if (totalThreats > 0) {
        await DepartmentEvent.create({
          department_id: deptId,
          event_type: 'threat_detected' as any,
          title: `Runtime Threats: ${suspiciousVisitors.length} suspicious visitor(s), ${failingAgents.length} failing agent(s)`,
          description: suspiciousVisitors.length > 0
            ? `High-volume visitors (>${EVENT_THRESHOLD} events/${WINDOW_MINUTES}min): ${suspiciousVisitors.map((v) => `${v.visitor_id.slice(0, 8)}… (${v.event_count})`).join(', ')}`
            : `Agent failure spike: ${failingAgents.map((a) => `${a.agent_id.slice(0, 8)}… (${a.failure_count})`).join(', ')}`,
          severity: suspiciousVisitors.some((v) => v.event_count > 100) ? 'critical' : 'high',
          metadata: { agent: AGENT_NAME, suspicious_visitors: suspiciousVisitors.slice(0, 10), failing_agents: failingAgents.slice(0, 10) },
        });

        // Ticket for extreme scraping
        const extremeVisitors = suspiciousVisitors.filter((v) => v.event_count > 100);
        if (extremeVisitors.length > 0) {
          try {
            await createTicket({
              title: `[Security] Possible scraping: ${extremeVisitors.length} visitor(s) with >100 events in ${WINDOW_MINUTES}min`,
              description: `Detected ${extremeVisitors.length} visitor(s) with extreme page event volume. Top: ${extremeVisitors.slice(0, 3).map((v) => `${v.visitor_id.slice(0, 8)}… (${v.event_count} events)`).join('; ')}`,
              priority: 'high',
              type: 'bug',
              source: 'security',
              created_by_type: 'agent',
              created_by_id: agentId,
              entity_type: 'system',
              entity_id: deptId,
              metadata: { visitors: extremeVisitors.slice(0, 5) },
            });
          } catch (err: any) {
            errors.push(`Ticket failed: ${err.message?.slice(0, 100)}`);
          }
        }
      } else {
        await DepartmentEvent.create({
          department_id: deptId,
          event_type: 'security_scan' as any,
          title: `Runtime Monitor: clean — ${recentEvents.length} events in ${WINDOW_MINUTES}min`,
          description: `No suspicious activity detected across ${Object.keys(visitorCounts).length} visitor(s).`,
          severity: 'normal',
          metadata: { agent: AGENT_NAME, total_events: recentEvents.length, unique_visitors: Object.keys(visitorCounts).length },
        });
      }
    }
  } catch (err: any) {
    errors.push(err.message || 'Runtime threat monitor error');
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: 0,
  };
}
