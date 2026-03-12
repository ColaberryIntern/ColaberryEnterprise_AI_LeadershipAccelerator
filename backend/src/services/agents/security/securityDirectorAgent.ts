import { Op } from 'sequelize';
import { Department, DepartmentEvent, AiAgent, Ticket } from '../../../models';
import { createTicket } from '../../ticketService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'SecurityDirectorAgent';
const WINDOW_MINUTES = 10;

export async function runSecurityDirectorAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const securityDept = await Department.findOne({ where: { slug: 'security' } });
    if (!securityDept) {
      errors.push('Security department not found');
      return { agent_name: AGENT_NAME, campaigns_processed: 0, actions_taken: actions, errors, duration_ms: Date.now() - start };
    }

    const deptId = (securityDept as any).id;
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

    // 1. Gather recent security events
    const recentEvents = await DepartmentEvent.findAll({
      where: {
        department_id: deptId,
        created_at: { [Op.gte]: since },
      },
      order: [['created_at', 'DESC']],
      raw: true,
    }) as any[];

    const threatEvents = recentEvents.filter((e: any) => e.event_type === 'threat_detected');
    const alertEvents = recentEvents.filter((e: any) => e.event_type === 'security_alert');
    const scanEvents = recentEvents.filter((e: any) => e.event_type === 'security_scan');

    // 2. Check open security tickets
    const openTickets = await Ticket.count({
      where: {
        source: 'security',
        status: { [Op.notIn]: ['done', 'cancelled', 'closed'] },
      },
    });

    const criticalTickets = await Ticket.count({
      where: {
        source: 'security',
        priority: 'critical',
        status: { [Op.notIn]: ['done', 'cancelled', 'closed'] },
      },
    });

    // 3. Check subordinate agent health
    const securityAgents = await AiAgent.findAll({
      where: { category: 'security_ops' },
      raw: true,
    }) as any[];

    const healthyAgents = securityAgents.filter((a: any) => a.status !== 'error' && a.enabled);
    const errorAgents = securityAgents.filter((a: any) => a.status === 'error');
    const disabledAgents = securityAgents.filter((a: any) => !a.enabled);

    // 4. Check for critical events without tickets
    const criticalEventsWithoutTickets: any[] = [];
    for (const event of threatEvents.filter((e: any) => e.severity === 'critical')) {
      // Simple heuristic: if no ticket was created within the event's metadata agent context
      const meta = event.metadata || {};
      if (!meta._ticketed) {
        criticalEventsWithoutTickets.push(event);
      }
    }

    // Create tickets for unticketted critical threats
    for (const event of criticalEventsWithoutTickets.slice(0, 3)) {
      try {
        await createTicket({
          title: `[Security Director] Unaddressed critical threat: ${event.title?.slice(0, 60)}`,
          description: `Critical security event detected but no remediation ticket exists. Event: ${event.description || event.title}`,
          priority: 'critical',
          type: 'bug',
          source: 'security',
          created_by_type: 'agent',
          created_by_id: agentId,
          entity_type: 'system',
          entity_id: deptId,
          metadata: { source_event_id: event.id, event_type: event.event_type },
        });
      } catch (err: any) {
        errors.push(`Ticket creation failed: ${err.message?.slice(0, 100)}`);
      }
    }

    // 5. Build summary
    const summary = {
      window_minutes: WINDOW_MINUTES,
      events: { total: recentEvents.length, threats: threatEvents.length, alerts: alertEvents.length, scans: scanEvents.length },
      tickets: { open: openTickets, critical: criticalTickets },
      fleet: {
        total: securityAgents.length,
        healthy: healthyAgents.length,
        error: errorAgents.length,
        disabled: disabledAgents.length,
        agents: securityAgents.map((a: any) => ({
          name: a.agent_name,
          status: a.status,
          enabled: a.enabled,
          last_run: a.last_run_at,
          run_count: a.run_count,
          error_count: a.error_count,
        })),
      },
      unticketted_critical: criticalEventsWithoutTickets.length,
    };

    const overallSeverity = criticalTickets > 0 || threatEvents.some((e: any) => e.severity === 'critical')
      ? 'critical'
      : threatEvents.length > 0 || alertEvents.length > 0
        ? 'high'
        : 'normal';

    actions.push({
      campaign_id: '',
      action: 'security_director_coordination',
      reason: `Coordinated security: ${recentEvents.length} event(s), ${openTickets} open ticket(s), ${healthyAgents.length}/${securityAgents.length} agents healthy`,
      confidence: 0.9,
      before_state: null,
      after_state: summary,
      result: overallSeverity === 'normal' ? 'success' : 'flagged',
      entity_type: 'system',
      entity_id: agentId,
    });

    await DepartmentEvent.create({
      department_id: deptId,
      event_type: 'security_scan' as any,
      title: `Security Director: ${recentEvents.length} event(s), ${openTickets} open ticket(s)`,
      description: `Fleet: ${healthyAgents.length}/${securityAgents.length} healthy. Threats: ${threatEvents.length}. Critical tickets: ${criticalTickets}. Unticketted critical: ${criticalEventsWithoutTickets.length}.`,
      severity: overallSeverity,
      metadata: { agent: AGENT_NAME, summary },
    });
  } catch (err: any) {
    errors.push(err.message || 'Security director error');
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
  };
}
