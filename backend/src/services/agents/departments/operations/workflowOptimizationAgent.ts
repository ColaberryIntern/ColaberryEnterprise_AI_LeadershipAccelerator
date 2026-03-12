import { Op } from 'sequelize';
import { CampaignLead, ScheduledEmail } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptWorkflowOptimizationAgent';

export async function runDeptWorkflowOptimizationAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Detect leads stuck in pipeline stages
    const stalledLeads = await CampaignLead.count({
      where: {
        status: { [Op.in]: ['active', 'nurturing'] },
        updated_at: { [Op.lt]: sevenDaysAgo },
      } as any,
    }) as unknown as number;

    // Detect stalled email sequences
    const stalledEmails = await ScheduledEmail.count({
      where: {
        status: 'pending',
        scheduled_at: { [Op.lt]: sevenDaysAgo },
      } as any,
    }) as unknown as number;

    // Failed emails needing retry
    const failedEmails = await ScheduledEmail.count({
      where: { status: 'failed' },
    });

    // Total active pipeline
    const activePipeline = await CampaignLead.count({
      where: { status: { [Op.in]: ['active', 'nurturing', 'engaged'] } },
    });

    entitiesProcessed = stalledLeads + stalledEmails + failedEmails;

    const bottlenecks: Array<{ type: string; count: number; severity: string; suggestion: string }> = [];

    if (stalledLeads > 5) {
      bottlenecks.push({
        type: 'Stalled Leads',
        count: stalledLeads,
        severity: stalledLeads > 20 ? 'high' : 'medium',
        suggestion: 'Re-engage stalled leads with targeted follow-up sequence',
      });
    }
    if (stalledEmails > 0) {
      bottlenecks.push({
        type: 'Stalled Emails',
        count: stalledEmails,
        severity: stalledEmails > 10 ? 'high' : 'medium',
        suggestion: 'Process overdue scheduled emails or cancel stale entries',
      });
    }
    if (failedEmails > 0) {
      bottlenecks.push({
        type: 'Failed Emails',
        count: failedEmails,
        severity: failedEmails > 5 ? 'high' : 'low',
        suggestion: 'Retry failed sends or investigate delivery issues',
      });
    }

    actions.push({
      campaign_id: '',
      action: 'workflow_analysis',
      reason: `Detected ${bottlenecks.length} workflow bottlenecks`,
      confidence: 0.87,
      before_state: null,
      after_state: {
        active_pipeline: activePipeline,
        stalled_leads: stalledLeads,
        stalled_emails: stalledEmails,
        failed_emails: failedEmails,
        bottlenecks,
      },
      result: bottlenecks.length > 0 ? 'flagged' : 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'workflow_analysis',
      result: 'success',
      details: { bottlenecks: bottlenecks.length, stalled_leads: stalledLeads },
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
