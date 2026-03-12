import { Op } from 'sequelize';
import { Department, DepartmentEvent, Initiative } from '../../../models';
import { getOpenAIClient } from '../../../intelligence/assistant/openaiHelper';
import {
  evaluateDepartmentHealth,
  identifyOpportunities,
  createStrategicInitiative,
  generateInitiativeTickets,
} from '../../departmentInitiativeEngine';
import { STRATEGY_CONFIGS } from './departmentStrategyConfigs';
import type { AgentExecutionResult, AgentAction } from '../types';

const OPENCLAW_MODEL = 'gpt-4o';

const SYSTEM_PROMPT = `You are a strategic department architect for an AI-powered enterprise education platform.
Your role is to analyze department health, identify improvement opportunities, and propose concrete initiatives.

Rules:
1. Propose 0-3 initiatives per analysis — quality over quantity
2. Each initiative must be specific, measurable, and actionable
3. Identify cross-department collaboration opportunities when relevant
4. Be data-driven — reference actual metrics in your reasoning
5. Prioritize based on impact and urgency
6. Never propose duplicate initiatives — check existing ones

Return valid JSON with this structure:
{
  "health_assessment": { "grade": "excellent|good|needs_attention|critical", "summary": "..." },
  "opportunities": [
    {
      "title": "...",
      "description": "...",
      "priority": "critical|high|medium|low",
      "risk_level": "low|medium|high",
      "supporting_department_slugs": [],
      "tags": []
    }
  ],
  "reasoning": "..."
}`;

/**
 * Strategy Architect Agent — parameterized executor.
 * Runs a strategy cycle for the department specified in config.department_slug.
 */
export async function runStrategyArchitectAgent(
  agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const deptSlug = config.department_slug;

  if (!deptSlug) {
    return {
      agent_name: 'StrategyArchitectAgent',
      campaigns_processed: 0,
      actions_taken: [],
      errors: ['No department_slug in config'],
      duration_ms: Date.now() - start,
    };
  }

  const strategyConfig = STRATEGY_CONFIGS[deptSlug];
  if (!strategyConfig) {
    return {
      agent_name: 'StrategyArchitectAgent',
      campaigns_processed: 0,
      actions_taken: [],
      errors: [`No strategy config for department: ${deptSlug}`],
      duration_ms: Date.now() - start,
    };
  }

  try {
    // 1. Load department
    const dept = await Department.findOne({ where: { slug: deptSlug } });
    if (!dept) {
      errors.push(`Department not found: ${deptSlug}`);
      return { agent_name: 'StrategyArchitectAgent', campaigns_processed: 0, actions_taken: actions, errors, duration_ms: Date.now() - start };
    }
    const deptId = (dept as any).id;
    const agentName = config.agent_name || `StrategyArchitect_${deptSlug}`;

    // 2. Evaluate health
    const health = await evaluateDepartmentHealth(deptId);
    actions.push({
      campaign_id: '',
      action: 'health_assessment',
      reason: `${strategyConfig.label}: health=${health.health_score}, innovation=${health.innovation_score}, grade=${health.overall_grade}, active=${health.active_initiatives}, stale=${health.stale_initiatives}`,
      confidence: 0.9,
      before_state: { health_score: health.health_score, innovation_score: health.innovation_score },
      after_state: { grade: health.overall_grade },
      result: 'success',
      entity_type: 'system',
      entity_id: deptId,
    });

    // 3. Get existing initiatives to avoid duplicates
    const existingInitiatives = await Initiative.findAll({
      where: { department_id: deptId, status: { [Op.in]: ['planned', 'active'] } },
      attributes: ['title', 'status'],
    });
    const existingTitles = existingInitiatives.map((i: any) => i.title.toLowerCase());

    // 4. Get recent events
    const recentEvents = await DepartmentEvent.findAll({
      where: { department_id: deptId },
      order: [['created_at', 'DESC']],
      limit: 10,
    });

    // 5. Identify opportunities (rule-based)
    const ruleOpportunities = await identifyOpportunities(deptId, strategyConfig);

    // 6. Try LLM-enhanced analysis
    let llmOpportunities: any[] = [];
    const client = getOpenAIClient();
    if (client) {
      try {
        const userPrompt = buildAnalysisPrompt(strategyConfig, health, existingInitiatives, recentEvents);
        const response = await client.chat.completions.create({
          model: OPENCLAW_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 1024,
          temperature: 0.4,
          response_format: { type: 'json_object' as const },
        });
        const content = response.choices[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          llmOpportunities = (parsed.opportunities || []).slice(0, strategyConfig.max_initiatives_per_cycle);

          // Log LLM reasoning
          actions.push({
            campaign_id: '',
            action: 'llm_strategy_analysis',
            reason: parsed.reasoning || 'LLM analysis completed',
            confidence: 0.8,
            before_state: null,
            after_state: { opportunities_found: llmOpportunities.length, grade: parsed.health_assessment?.grade },
            result: 'success',
            entity_type: 'system',
            entity_id: deptId,
          });
        }
      } catch (err: any) {
        errors.push(`LLM analysis failed: ${err.message?.slice(0, 100)}`);
      }
    }

    // 7. Merge opportunities (prefer LLM if available, fall back to rule-based)
    const opportunities = llmOpportunities.length > 0 ? llmOpportunities : ruleOpportunities;

    // 8. Create initiatives from opportunities
    let initiativesCreated = 0;
    for (const opp of opportunities) {
      const title = opp.title || '';
      if (existingTitles.includes(title.toLowerCase())) continue;

      // Resolve supporting department IDs from slugs
      let supportingDepts: string[] = [];
      if (opp.supporting_department_slugs && opp.supporting_department_slugs.length > 0) {
        const supportDepts = await Department.findAll({
          where: { slug: { [Op.in]: opp.supporting_department_slugs } },
          attributes: ['id'],
        });
        supportingDepts = supportDepts.map((d: any) => d.id);
      } else if (opp.supporting_departments) {
        supportingDepts = opp.supporting_departments;
      }

      const initiative = await createStrategicInitiative({
        department_id: deptId,
        title,
        description: opp.description || '',
        priority: opp.priority || 'medium',
        risk_level: opp.risk_level || 'low',
        supporting_departments: supportingDepts,
        created_by_agent: agentName,
        tags: opp.tags || strategyConfig.focus_areas.slice(0, 3),
      });

      // Generate tickets for the new initiative
      const tickets = await generateInitiativeTickets(initiative.id, agentName);

      initiativesCreated++;
      actions.push({
        campaign_id: '',
        action: 'create_initiative',
        reason: `Created: "${title}" (${opp.priority}) with ${tickets.length} ticket(s)${supportingDepts.length ? ` + ${supportingDepts.length} collaborating dept(s)` : ''}`,
        confidence: 0.85,
        before_state: null,
        after_state: { initiative_id: initiative.id, ticket_count: tickets.length },
        result: 'success',
        entity_type: 'system',
        entity_id: initiative.id,
      });
    }

    // 9. Update department scores based on analysis
    const newHealth = Math.min(100, health.health_score + (initiativesCreated > 0 ? 2 : 0));
    const newInnovation = Math.min(100, health.innovation_score + (initiativesCreated > 0 ? 3 : 0));
    await (dept as any).update({
      health_score: newHealth,
      innovation_score: newInnovation,
      updated_at: new Date(),
    });

    // 10. Log strategy analysis event
    await DepartmentEvent.create({
      department_id: deptId,
      event_type: 'strategy_analysis' as any,
      title: `Strategy Cycle: ${strategyConfig.label}`,
      description: `Health: ${health.overall_grade} (${health.health_score}). Created ${initiativesCreated} initiative(s). ${opportunities.length} opportunity(s) identified.`,
      severity: health.overall_grade === 'critical' ? 'high' : 'normal',
      metadata: {
        agent: agentName,
        health,
        opportunities_count: opportunities.length,
        initiatives_created: initiativesCreated,
        used_llm: llmOpportunities.length > 0,
      },
    });

    actions.push({
      campaign_id: '',
      action: 'strategy_cycle_complete',
      reason: `${strategyConfig.label}: ${health.overall_grade} health, ${initiativesCreated} initiatives created, ${opportunities.length} opportunities found`,
      confidence: 0.9,
      before_state: null,
      after_state: { initiatives_created: initiativesCreated, grade: health.overall_grade },
      result: 'success',
      entity_type: 'system',
      entity_id: deptId,
    });
  } catch (err: any) {
    errors.push(err.message || 'Strategy architect error');
  }

  return {
    agent_name: config.agent_name || `StrategyArchitect_${deptSlug}`,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.filter((a) => a.action === 'create_initiative').length,
  };
}

function buildAnalysisPrompt(
  config: any,
  health: any,
  initiatives: any[],
  events: any[],
): string {
  const initSummary = initiatives.map((i: any) => `- ${i.title} (${i.status})`).join('\n') || 'None';
  const eventSummary = events.slice(0, 5).map((e: any) => `- [${e.event_type}] ${e.title}`).join('\n') || 'None';

  return `Analyze the ${config.label} department and suggest strategic initiatives.

Department: ${config.label}
Focus Areas: ${config.focus_areas.join(', ')}

Current Metrics:
- Health Score: ${health.health_score}/100
- Innovation Score: ${health.innovation_score}/100
- Active Initiatives: ${health.active_initiatives}
- Stale Initiatives: ${health.stale_initiatives}
- Agent Fleet: ${health.agent_count} agents, ${health.agent_errors} errors
- Overall Grade: ${health.overall_grade}

Existing Initiatives:
${initSummary}

Recent Events:
${eventSummary}

KPI Thresholds:
- Minimum Health: ${config.kpi_thresholds.health_min}
- Minimum Innovation: ${config.kpi_thresholds.innovation_min}

Max new initiatives this cycle: ${config.max_initiatives_per_cycle}

Available departments for collaboration: executive, governance, strategy, finance, operations, orchestration, intelligence, partnerships, growth, marketing, admissions, infrastructure, platform, education, student_success, alumni`;
}

