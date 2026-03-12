import { Op } from 'sequelize';
import { Visitor, PageEvent, ChatMessage } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptSecurityMonitoringAgent';

export async function runDeptSecurityMonitoringAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // 1. Detect rapid-fire page events (potential scraping)
    const recentEvents = await PageEvent.findAll({
      where: { timestamp: { [Op.gte]: oneHourAgo } },
      attributes: ['visitor_id', 'page_url', 'timestamp'],
      order: [['timestamp', 'DESC']],
      limit: 1000,
    });

    // Group by visitor to detect rapid activity
    const visitorEventCounts: Record<string, number> = {};
    for (const event of recentEvents) {
      const vid = (event as any).visitor_id;
      visitorEventCounts[vid] = (visitorEventCounts[vid] || 0) + 1;
    }

    const suspiciousVisitors = Object.entries(visitorEventCounts)
      .filter(([_, count]) => count > 50) // 50+ events in 1 hour
      .map(([vid, count]) => ({ visitor_id: vid, events: count, reason: 'Rapid-fire page events' }));

    // 2. Check chat messages for injection patterns
    const recentMessages = await ChatMessage.findAll({
      where: {
        timestamp: { [Op.gte]: oneHourAgo },
        role: 'visitor',
      },
      attributes: ['content', 'conversation_id'],
      limit: 200,
    });

    const injectionPatterns = [
      /ignore (previous|all|above) instructions/i,
      /you are now/i,
      /system prompt/i,
      /\bDAN\b/,
      /<script/i,
      /javascript:/i,
      /eval\(/i,
      /\bSQLi\b/i,
      /union select/i,
      /drop table/i,
    ];

    const suspiciousMessages: Array<{ conversation_id: string; pattern: string }> = [];
    for (const msg of recentMessages) {
      const content = (msg as any).content || '';
      for (const pattern of injectionPatterns) {
        if (pattern.test(content)) {
          suspiciousMessages.push({
            conversation_id: (msg as any).conversation_id,
            pattern: pattern.source,
          });
          break;
        }
      }
    }

    entitiesProcessed = recentEvents.length + recentMessages.length;

    const threats: Array<{ type: string; count: number; severity: string; details: any[] }> = [];

    if (suspiciousVisitors.length > 0) {
      threats.push({
        type: 'Potential Scraping',
        count: suspiciousVisitors.length,
        severity: 'medium',
        details: suspiciousVisitors.slice(0, 5),
      });
    }

    if (suspiciousMessages.length > 0) {
      threats.push({
        type: 'Prompt Injection Attempt',
        count: suspiciousMessages.length,
        severity: 'high',
        details: suspiciousMessages.slice(0, 5),
      });
    }

    actions.push({
      campaign_id: '',
      action: 'security_scan',
      reason: `Scanned ${entitiesProcessed} events for security threats`,
      confidence: 0.90,
      before_state: null,
      after_state: {
        events_scanned: recentEvents.length,
        messages_scanned: recentMessages.length,
        threats_detected: threats.length,
        threats,
      },
      result: threats.length > 0 ? 'flagged' : 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'security_scan',
      result: 'success',
      details: { threats: threats.length },
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
