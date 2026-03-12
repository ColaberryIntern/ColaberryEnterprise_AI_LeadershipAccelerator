import { Op, fn, col } from 'sequelize';
import { Lead } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptGrowthPartnershipAgent';

export async function runDeptGrowthPartnershipAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    // Cluster leads by email domain to identify companies with multiple leads
    const leads = await Lead.findAll({
      attributes: ['email', 'company', 'title'],
      where: { email: { [Op.ne]: null } } as any,
    });

    entitiesProcessed = leads.length;

    // Group by domain
    const domainMap: Record<string, { count: number; companies: Set<string>; titles: string[] }> = {};
    for (const lead of leads) {
      const email = (lead as any).email;
      if (!email || !email.includes('@')) continue;
      const domain = email.split('@')[1]?.toLowerCase();
      if (!domain || ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'].includes(domain)) continue;

      if (!domainMap[domain]) {
        domainMap[domain] = { count: 0, companies: new Set(), titles: [] };
      }
      domainMap[domain].count++;
      if ((lead as any).company) domainMap[domain].companies.add((lead as any).company);
      if ((lead as any).title) domainMap[domain].titles.push((lead as any).title);
    }

    // Partnership candidates: 3+ leads from same domain
    const partnershipCandidates = Object.entries(domainMap)
      .filter(([_, data]) => data.count >= 3)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([domain, data]) => ({
        domain,
        lead_count: data.count,
        company: Array.from(data.companies).join(', ') || domain,
        sample_titles: data.titles.slice(0, 3),
        estimated_deal_value: data.count >= 5 ? 'High' : 'Medium',
      }));

    const recommendations: string[] = [];
    if (partnershipCandidates.length > 0) {
      recommendations.push(`${partnershipCandidates.length} enterprise partnership candidates identified`);
      recommendations.push(`Top prospect: ${partnershipCandidates[0].company} with ${partnershipCandidates[0].lead_count} leads`);
    }

    actions.push({
      campaign_id: '',
      action: 'partnership_scan',
      reason: `Analyzed ${entitiesProcessed} leads for partnership signals`,
      confidence: 0.82,
      before_state: null,
      after_state: {
        leads_analyzed: entitiesProcessed,
        partnership_candidates: partnershipCandidates.length,
        candidates: partnershipCandidates,
        recommendations,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'partnership_scan',
      result: 'success',
      details: { leads_analyzed: entitiesProcessed, candidates: partnershipCandidates.length },
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
