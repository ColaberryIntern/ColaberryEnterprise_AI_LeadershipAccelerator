// ─── Cory Engine ─────────────────────────────────────────────────────────────
// AI COO "Cory" — executive command interpreter and orchestrator.
// 5-step loop: interpret → plan → launch agents → monitor → report.

import crypto from 'crypto';
import { chatCompletion } from '../assistant/openaiHelper';
import { runAssistantPipeline, type AssistantResponse } from '../assistant/queryEngine';
import { getLatestStrategicReport, type StrategicReport } from './aiCOO';
import { getReasoningTimeline, type TimelineEntry } from './reasoningTimeline';
import { createAgent, retireAgent, getDepartmentSummary, type AgentSpec, type DepartmentSummary } from '../agents/agentFactory';
import { proposeGrowthExperiments } from '../agents/GrowthExperimentAgent';
import { listAllAgents, agentCount } from '../agents/agentRegistry';
import { AiAgent } from '../../models';
import Department from '../../models/Department';
import IntelligenceDecision from '../../models/IntelligenceDecision';
import { getDepartmentDetail } from '../../services/departmentIntelligenceService';
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';

// ─── Types ───────────────────────────────────────────────────────────────────

export type CoryIntent =
  | 'briefing'
  | 'analyze'
  | 'hire_agent'
  | 'retire_agent'
  | 'launch_experiment'
  | 'department_status'
  | 'agent_status'
  | 'optimize'
  | 'general_query';

export interface CoryCommand {
  command: string;
  context?: Record<string, any>;
}

export interface ExecutiveBriefing {
  problem_detected?: string;
  analysis?: string;
  action_taken?: string;
  expected_impact?: string;
  confidence: number;
}

export interface CoryResponse {
  message: string;
  briefings?: ExecutiveBriefing[];
  actions_taken?: string[];
  agents_dispatched?: string[];
  trace_id: string;
  intent: CoryIntent;
  assistant_response?: AssistantResponse;
  suggested_questions?: string[];
}

export interface CoryStatusReport {
  status: 'active' | 'paused' | 'manual';
  agent_fleet: { total: number; healthy: number; errored: number; paused: number };
  decisions_24h: { total: number; executed: number; proposed: number; rejected: number };
  latest_strategic_report: StrategicReport | null;
  departments: DepartmentSummary[];
  experiments_running: number;
  avg_confidence: number;
  system_risk_level: string;
}

// ─── Command Interpretation ──────────────────────────────────────────────────

const KEYWORD_INTENTS: Array<{ keywords: string[]; intent: CoryIntent }> = [
  { keywords: ['status', 'briefing', 'overview', 'report', 'how are we', 'what\'s happening'], intent: 'briefing' },
  { keywords: ['hire', 'create agent', 'new agent', 'add agent', 'build agent'], intent: 'hire_agent' },
  { keywords: ['retire', 'remove agent', 'delete agent', 'fire agent', 'decommission'], intent: 'retire_agent' },
  { keywords: ['experiment', 'a/b test', 'ab test', 'test'], intent: 'launch_experiment' },
  { keywords: ['department', 'team', 'division'], intent: 'department_status' },
  { keywords: ['agent', 'fleet', 'roster'], intent: 'agent_status' },
  { keywords: ['optimize', 'improve', 'fix', 'boost', 'increase'], intent: 'optimize' },
  { keywords: ['analyze', 'analyse', 'look at', 'investigate', 'examine', 'growth', 'opportunity', 'conversion', 'revenue', 'funnel'], intent: 'analyze' },
];

/**
 * Classify a user command into a CoryIntent. Uses fast keyword matching
 * first, falls back to LLM for ambiguous commands.
 */
export async function interpretCommand(
  command: string,
  context?: Record<string, any>,
): Promise<{ intent: CoryIntent; parameters: Record<string, any> }> {
  const lower = command.toLowerCase().replace(/^cory[,:]?\s*/i, '');

  // Department-scoped performance questions → briefing (will be overridden to department_deep_analysis)
  if (context?.entity_type === 'department') {
    const deptKeywords = ['how is', 'performing', 'performance', 'health', 'kpi', 'metrics', 'doing', 'status', 'overview', 'briefing', 'report', 'tell me about', 'what\'s happening'];
    if (deptKeywords.some((kw) => lower.includes(kw))) {
      return { intent: 'briefing', parameters: { raw_command: lower, department: context.entity_name } };
    }
  }

  // Fast-path keyword matching
  for (const { keywords, intent } of KEYWORD_INTENTS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return { intent, parameters: { raw_command: lower } };
    }
  }

  // LLM fallback
  const systemPrompt = `You are a command classifier for an AI COO named Cory.
Classify the user's command into one of these intents:
briefing, analyze, hire_agent, retire_agent, launch_experiment, department_status, agent_status, optimize, general_query.

Return JSON: { "intent": "...", "parameters": { ... } }
Extract relevant parameters like agent_name, department, metric, entity_type.`;

  const result = await chatCompletion(systemPrompt, lower, { json: true, maxTokens: 200, temperature: 0.1 });
  if (result) {
    try {
      const parsed = JSON.parse(result);
      return { intent: parsed.intent || 'general_query', parameters: parsed.parameters || {} };
    } catch { /* fall through */ }
  }

  return { intent: 'general_query', parameters: { raw_command: lower } };
}

// ─── Executive Command Loop ──────────────────────────────────────────────────

const CORY_PERSONA_BASE = `You are Cory, the AI Chief Operating Officer of Colaberry Enterprise.
You speak in direct, executive language. You prioritize by business impact.
You coordinate a fleet of AI agents across departments: Intelligence, Operations, Growth, Marketing, Finance, Infrastructure, Education, Orchestration.
Report findings as structured executive briefings. Be concise but insightful.
When presenting data, lead with the most important finding. Use numbers.`;

/**
 * Format department detail data into a concise text block for LLM context injection.
 */
function formatDepartmentDataForLLM(detail: any): string {
  const o = detail.overview;
  const lines: string[] = [];

  lines.push(`=== ${o.name} DEPARTMENT DATA ===`);
  lines.push(`Mission: ${o.mission}`);
  lines.push(`Team Size: ${o.team_size} members`);
  lines.push(`Health Score: ${Math.round(o.health_score)}/100`);
  lines.push(`Innovation Score: ${Math.round(o.innovation_score)}/100`);

  // KPIs with trends
  if (detail.kpis?.length) {
    lines.push(`\n--- KPIs ---`);
    for (const kpi of detail.kpis) {
      const trend = kpi.delta != null ? ` (WoW: ${kpi.delta > 0 ? '+' : ''}${kpi.delta}${kpi.unit || ''}, prev: ${kpi.prev_value}${kpi.unit || ''})` : '';
      const dir = kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '→';
      lines.push(`  ${kpi.name}: ${kpi.value}${kpi.unit || ''} ${dir}${trend}`);
    }
  }

  // Strategic objectives
  if (detail.strategic_objectives?.length) {
    lines.push(`\n--- Strategic Objectives ---`);
    for (const obj of detail.strategic_objectives) {
      lines.push(`  • ${obj.title || obj.name}: ${obj.progress || 0}% — ${obj.status || 'unknown'}`);
    }
  }

  // Active initiatives (building)
  if (detail.building?.length) {
    lines.push(`\n--- Active Initiatives (${detail.building.length}) ---`);
    for (const init of detail.building) {
      const risk = init.risk_level ? ` [${init.risk_level} risk]` : '';
      const rev = init.revenue_impact ? ` ($${(init.revenue_impact / 1000).toFixed(0)}k revenue impact)` : '';
      lines.push(`  • ${init.title}: ${init.progress}% complete, ${init.priority} priority${risk}${rev}`);
      if (init.description) lines.push(`    ${init.description.slice(0, 120)}`);
    }
  }

  // On-hold / maintenance
  if (detail.maintenance?.length) {
    lines.push(`\n--- On Hold / Maintenance (${detail.maintenance.length}) ---`);
    for (const init of detail.maintenance) {
      lines.push(`  • ${init.title}: ${init.progress}% — ${init.status}`);
    }
  }

  // Achievements
  if (detail.achievements?.length) {
    lines.push(`\n--- Recent Achievements ---`);
    for (const a of detail.achievements.slice(0, 5)) {
      lines.push(`  ✓ ${a.title}`);
    }
  }

  // Risks
  if (detail.risks?.length) {
    lines.push(`\n--- Active Risks (${detail.risks.length}) ---`);
    for (const r of detail.risks) {
      lines.push(`  ⚠ ${r.title} — severity: ${r.severity || 'unknown'}`);
    }
  } else {
    lines.push(`\n--- Risks: None active ---`);
  }

  // Recent events
  if (detail.recent_events?.length) {
    lines.push(`\n--- Recent Events ---`);
    for (const e of detail.recent_events.slice(0, 5)) {
      lines.push(`  [${e.event_type}] ${e.title}`);
    }
  }

  return lines.join('\n');
}

function buildCoryPersona(context?: Record<string, any>): string {
  let persona = CORY_PERSONA_BASE;
  if (context?.entity_type === 'department' && context?.entity_name) {
    persona += `\n\nCURRENT SCOPE: You are focused on the ${context.entity_name} department.
Talk specifically about ${context.entity_name}'s KPIs, initiatives, team, risks, and performance.
Reference specific numbers from the department data provided below.
You can reference how this department relates to other departments and overall company strategy.
When the user asks questions, answer from the perspective of ${context.entity_name} and its sub-elements.

MANDATORY ANALYSIS REQUIREMENTS:
1. TEAM SIZE ANALYSIS: Always analyze whether the current team size is adequate for the department's workload. Consider the ratio of active initiatives to team members, risk exposure, and growth opportunities. Proactively recommend team expansion when initiatives could generate more revenue or improve system security with additional headcount.
2. REVENUE OPPORTUNITIES: Identify which initiatives or new initiatives could generate more revenue. Recommend expanding the team specifically to pursue revenue-generating opportunities.
3. SECURITY & RISK: Evaluate security posture and recommend team expansion to address vulnerabilities, reduce risk exposure, and strengthen system resilience.
4. DATA-DRIVEN: Every claim must reference specific numbers from the department data. Never give generic responses.

If asked about company-wide strategy, note that you're currently scoped to ${context.entity_name} and offer to zoom out.`;

    // Inject actual department data if available
    if (context._department_data) {
      persona += `\n\n${context._department_data}`;
    }
  } else {
    persona += `\n\nCURRENT SCOPE: Global / Company-wide.
You have visibility across all 8 departments and the full organization.
Talk about company strategy, cross-department performance, and organizational health.
When referencing specific departments, compare and contrast their performance.`;
  }
  return persona;
}

/**
 * Execute a command through Cory's 5-step pipeline.
 */
export async function executeCoryCommand(cmd: CoryCommand): Promise<CoryResponse> {
  const traceId = crypto.randomUUID();
  const actionsPerformed: string[] = [];
  const agentsDispatched: string[] = [];
  let briefings: ExecutiveBriefing[] = [];
  let assistantResponse: AssistantResponse | undefined;

  // Step 0: If department scoped, fetch full department data for context injection
  const isDeptScoped = cmd.context?.entity_type === 'department' && cmd.context?.entity_name;
  let deptDetail: any = null;

  if (isDeptScoped) {
    try {
      // Find department by name
      const dept = await Department.findOne({
        where: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('name')),
          cmd.context!.entity_name!.toLowerCase(),
        ),
      });
      if (dept) {
        deptDetail = await getDepartmentDetail(dept.id);
        if (deptDetail) {
          // Inject formatted data into context for persona building
          cmd.context!._department_data = formatDepartmentDataForLLM(deptDetail);
          actionsPerformed.push(`Loaded ${cmd.context!.entity_name} department intelligence (${deptDetail.kpis?.length || 0} KPIs, ${deptDetail.building?.length || 0} active initiatives, ${deptDetail.risks?.length || 0} risks)`);
        }
      }
    } catch (err: any) {
      actionsPerformed.push(`Dept data fetch warning: ${err.message}`);
    }
  }

  // Step 1: Interpret command (pass context for department-aware routing)
  const { intent, parameters } = await interpretCommand(cmd.command, cmd.context);

  // For department-scoped queries, override briefing/department_status to use rich department analysis
  const effectiveIntent = (isDeptScoped && deptDetail && (intent === 'briefing' || intent === 'department_status'))
    ? 'department_deep_analysis' as any
    : intent;

  // Step 2 + 3: Create plan and launch agents based on intent
  try {
    switch (effectiveIntent) {
      // Department deep analysis — rich data-driven response using all department data
      case 'department_deep_analysis': {
        const o = deptDetail.overview;
        const teamSize = o.team_size;
        const activeInits = deptDetail.building?.length || 0;
        const riskCount = deptDetail.risks?.length || 0;
        const kpiSummary = (deptDetail.kpis || [])
          .map((k: any) => `${k.name}: ${k.value}${k.unit || ''}${k.delta != null ? ` (WoW ${k.delta > 0 ? '+' : ''}${k.delta})` : ''}`)
          .join(', ');

        // Build rich briefings from actual department data
        briefings.push({
          analysis: `${o.name} Department: Health ${Math.round(o.health_score)}/100, Innovation ${Math.round(o.innovation_score)}/100. Team of ${teamSize} managing ${activeInits} active initiative(s). KPIs: ${kpiSummary}`,
          confidence: 95,
        });

        // Team capacity analysis
        const initPerMember = teamSize > 0 ? (activeInits / teamSize).toFixed(1) : 'N/A';
        briefings.push({
          analysis: `Team Capacity: ${teamSize} members with ${activeInits} active initiatives (${initPerMember} initiatives/member). ${
            activeInits > teamSize
              ? 'Team is over-leveraged — each member juggles multiple initiatives, increasing execution risk.'
              : teamSize <= 3
                ? 'Small team size limits throughput and creates single-point-of-failure risk.'
                : 'Current capacity appears manageable but expansion would accelerate delivery.'
          }`,
          expected_impact: `Recommend expanding team to ${Math.max(teamSize + 2, Math.ceil(activeInits * 1.5))} to unlock revenue-generating initiatives and reduce risk exposure.`,
          confidence: 88,
        });

        // Risk assessment
        if (riskCount > 0) {
          briefings.push({
            problem_detected: `${riskCount} active risk(s) in ${o.name}: ${deptDetail.risks.slice(0, 3).map((r: any) => r.title).join('; ')}`,
            action_taken: 'Risk monitoring active',
            confidence: 85,
          });
        }

        // Strategic objectives progress
        if (deptDetail.strategic_objectives?.length) {
          const objSummary = deptDetail.strategic_objectives
            .map((obj: any) => `${obj.title || obj.name}: ${obj.progress || 0}%`)
            .join(', ');
          briefings.push({
            analysis: `Strategic Objectives: ${objSummary}`,
            confidence: 90,
          });
        }

        // Revenue impact from initiatives
        const revInits = (deptDetail.building || []).filter((i: any) => i.revenue_impact > 0);
        if (revInits.length) {
          const totalRev = revInits.reduce((s: number, i: any) => s + (i.revenue_impact || 0), 0);
          briefings.push({
            analysis: `Revenue pipeline: $${(totalRev / 1000).toFixed(0)}k across ${revInits.length} initiative(s)`,
            expected_impact: `Adding ${Math.ceil(revInits.length * 0.5)} dedicated team members could accelerate delivery and unlock $${(totalRev * 0.3 / 1000).toFixed(0)}k additional revenue.`,
            confidence: 82,
          });
        }

        agentsDispatched.push('DepartmentIntelligenceAgent', 'TeamCapacityAnalyzer', 'RiskAssessor');
        actionsPerformed.push(`Deep analysis of ${o.name}: ${activeInits} initiatives, ${riskCount} risks, ${deptDetail.kpis?.length || 0} KPIs`);
        break;
      }

      case 'briefing': {
        const report = getLatestStrategicReport();
        const recentDecisions = await IntelligenceDecision.findAll({
          where: { timestamp: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          order: [['timestamp', 'DESC']],
          limit: 5,
        });

        // Build briefings from recent decisions
        briefings = recentDecisions.map((d: any) => ({
          problem_detected: d.problem_detected,
          analysis: d.analysis_summary,
          action_taken: `${d.recommended_action}: ${d.execution_status}`,
          expected_impact: d.impact_estimate?.change_pct
            ? `${d.impact_estimate.metric} ${d.impact_estimate.change_pct > 0 ? '+' : ''}${d.impact_estimate.change_pct}%`
            : undefined,
          confidence: d.confidence_score || 0,
        }));

        agentsDispatched.push('StrategicIntelligenceAgent', 'GovernanceAgent');
        actionsPerformed.push('Retrieved latest strategic report', `Found ${recentDecisions.length} recent decisions`);

        if (report) {
          actionsPerformed.push(`Fleet: ${report.overview.agent_fleet_health.healthy}/${report.overview.agent_fleet_health.total} healthy`);
        }
        break;
      }

      case 'analyze':
      case 'general_query':
      case 'optimize': {
        // Delegate to the existing assistant pipeline
        const entityType = parameters.entity_type || cmd.context?.entity_type;
        assistantResponse = await runAssistantPipeline(cmd.command, entityType);
        agentsDispatched.push('IntentAgent', 'SQLAgent', 'MLAgent', 'NarrativeAgent');
        actionsPerformed.push(`Ran ${assistantResponse.pipelineSteps.length}-step analysis pipeline`);

        // Convert recommendations to briefings
        if (assistantResponse.recommendations.length > 0) {
          briefings = assistantResponse.recommendations.map((r) => ({
            action_taken: r,
            confidence: assistantResponse!.confidence * 100,
          }));
        }

        // If dept scoped and assistant pipeline returned, enrich with dept-specific briefings
        if (isDeptScoped && deptDetail) {
          const o = deptDetail.overview;
          briefings.unshift({
            analysis: `${o.name} context: Health ${Math.round(o.health_score)}/100, Innovation ${Math.round(o.innovation_score)}/100, Team: ${o.team_size}, Active initiatives: ${deptDetail.building?.length || 0}`,
            confidence: 95,
          });
        }
        break;
      }

      case 'hire_agent': {
        const spec: AgentSpec = {
          name: parameters.agent_name || parameters.name || `agent_${Date.now()}`,
          role: parameters.role || 'general',
          department: parameters.department || 'Operations',
          responsibilities: parameters.responsibilities || parameters.raw_command || cmd.command,
        };
        const agent = await createAgent(spec);
        actionsPerformed.push(`Hired agent "${spec.name}" in ${spec.department}`);
        briefings = [{
          action_taken: `New agent "${spec.name}" created in ${spec.department} department`,
          expected_impact: 'Agent will begin operations on next cycle',
          confidence: 90,
        }];
        break;
      }

      case 'retire_agent': {
        const agentName = parameters.agent_name || parameters.name;
        if (agentName) {
          const agent = await AiAgent.findOne({ where: { agent_name: agentName } });
          if (agent) {
            await retireAgent(agent.id);
            actionsPerformed.push(`Retired agent "${agentName}"`);
            briefings = [{
              action_taken: `Agent "${agentName}" has been retired`,
              confidence: 100,
            }];
          } else {
            actionsPerformed.push(`Agent "${agentName}" not found`);
          }
        }
        break;
      }

      case 'launch_experiment': {
        const experiments = await proposeGrowthExperiments();
        agentsDispatched.push('GrowthExperimentAgent');
        actionsPerformed.push(`Proposed ${experiments.length} experiment(s)`);
        briefings = experiments.map((e) => ({
          problem_detected: e.hypothesis,
          action_taken: `A/B test: ${e.control} vs ${e.variant}`,
          expected_impact: `Tracking ${e.metric} over ${e.duration_hours}h`,
          confidence: 60,
        }));
        break;
      }

      case 'department_status': {
        // If we already have deptDetail from Step 0, use it (this case handles non-scoped dept queries)
        if (deptDetail) {
          // Already handled by department_deep_analysis override; fallback here for edge cases
          const o = deptDetail.overview;
          briefings = [{
            analysis: `${o.name}: Health ${Math.round(o.health_score)}/100, Innovation ${Math.round(o.innovation_score)}/100, Team: ${o.team_size}, Active: ${deptDetail.building?.length || 0} initiatives`,
            confidence: 95,
          }];
        } else {
          const departments = await getDepartmentSummary();
          const deptName = parameters.department;
          const filtered = deptName
            ? departments.filter((d) => d.department.toLowerCase() === deptName.toLowerCase())
            : departments;

          briefings = filtered.map((d) => ({
            analysis: `${d.department}: ${d.agent_count} agents, ${d.healthy} healthy, ${d.errored} errored, ${d.paused} paused`,
            confidence: 100,
          }));
        }
        actionsPerformed.push(`Retrieved department status`);
        break;
      }

      case 'agent_status': {
        const agents = await AiAgent.findAll({
          where: { enabled: true },
          order: [['agent_name', 'ASC']],
        });
        const errored = agents.filter((a: any) => a.status === 'error');
        const running = agents.filter((a: any) => a.status === 'running');

        briefings = [{
          analysis: `Fleet: ${agents.length} active agents, ${running.length} running, ${errored.length} errored`,
          confidence: 100,
        }];
        if (errored.length > 0) {
          briefings.push({
            problem_detected: `${errored.length} agents in error state: ${errored.slice(0, 5).map((a: any) => a.agent_name).join(', ')}`,
            confidence: 100,
          });
        }
        actionsPerformed.push(`Scanned ${agents.length} agents`);
        break;
      }
    }
  } catch (err: any) {
    actionsPerformed.push(`Error: ${err.message}`);
  }

  // Step 4: Monitor results (already awaited above)

  // Step 5: Report to user in Cory's voice (scope-aware)
  const message = await formatCoryResponse(intent, actionsPerformed, briefings, assistantResponse, cmd.context);

  // Generate 2 contextual follow-up questions
  const suggested_questions = await generateSuggestedQuestions(cmd.command, intent, actionsPerformed, briefings);

  return {
    message,
    briefings: briefings.length > 0 ? briefings : undefined,
    actions_taken: actionsPerformed,
    agents_dispatched: agentsDispatched.length > 0 ? agentsDispatched : undefined,
    trace_id: traceId,
    intent,
    assistant_response: assistantResponse,
    suggested_questions,
  };
}

/**
 * Format Cory's response. Uses LLM when available, falls back to template.
 */
async function formatCoryResponse(
  intent: CoryIntent,
  actions: string[],
  briefings: ExecutiveBriefing[],
  assistantResponse?: AssistantResponse,
  context?: Record<string, any>,
): Promise<string> {
  // If we have a full assistant response, use its narrative
  if (assistantResponse?.narrative) {
    return assistantResponse.narrative;
  }

  // Build briefing context for LLM
  const briefingContext = [
    `Intent: ${intent}`,
    `Actions performed: ${actions.join('; ')}`,
    briefings.length > 0
      ? `Briefings:\n${briefings.map((b) => {
          const parts = [];
          if (b.problem_detected) parts.push(`Problem: ${b.problem_detected}`);
          if (b.analysis) parts.push(`Analysis: ${b.analysis}`);
          if (b.action_taken) parts.push(`Action: ${b.action_taken}`);
          if (b.expected_impact) parts.push(`Impact: ${b.expected_impact}`);
          parts.push(`Confidence: ${b.confidence}%`);
          return parts.join(' | ');
        }).join('\n')}`
      : 'No specific briefings to report.',
  ].join('\n');

  // For department-scoped queries, give LLM more room to provide rich analysis
  const isDeptScope = context?.entity_type === 'department' && context?._department_data;
  const maxTokens = isDeptScope ? 600 : 300;
  const prompt = isDeptScope
    ? `Using the department data provided in your context, give a comprehensive executive briefing covering: (1) current performance with specific KPIs and trends, (2) team capacity analysis — is the team large enough? recommend expansion with specific headcount tied to revenue opportunities and security needs, (3) key risks and opportunities, (4) strategic recommendations. Be specific with numbers. Do NOT say you have no data — you have full department data.\n\nConversation context:\n${briefingContext}`
    : `Summarize this in 2-4 sentences as a direct executive briefing:\n${briefingContext}`;

  const llmResponse = await chatCompletion(
    buildCoryPersona(context),
    prompt,
    { maxTokens, temperature: 0.3 },
  );

  if (llmResponse) return llmResponse;

  // Template fallback
  if (briefings.length === 0) {
    return `Command processed. ${actions.join('. ')}.`;
  }

  const topBriefing = briefings[0];
  const parts: string[] = [];
  if (topBriefing.problem_detected) parts.push(topBriefing.problem_detected);
  if (topBriefing.analysis) parts.push(topBriefing.analysis);
  if (topBriefing.action_taken) parts.push(topBriefing.action_taken);
  if (topBriefing.expected_impact) parts.push(`Expected impact: ${topBriefing.expected_impact}`);
  return parts.join('. ') + '.';
}

// ─── Suggested Questions ─────────────────────────────────────────────────────

/** Intent-based fallback questions when LLM is unavailable */
const FALLBACK_SUGGESTIONS: Record<string, string[]> = {
  briefing: ['What actions should we prioritize today?', 'Show me department health'],
  analyze: ['What are the biggest risks right now?', 'How can we improve conversion rates?'],
  hire_agent: ['Show me the current agent roster', 'Give me a status briefing'],
  retire_agent: ['Which agents need attention?', 'Show me department health'],
  launch_experiment: ['What experiments are currently running?', 'Give me a status briefing'],
  department_status: ['Which department needs the most attention?', 'What experiments are running?'],
  department_deep_analysis: ['Should we expand this team?', 'What initiatives could generate more revenue?'],
  agent_status: ['Which agents have the highest error rates?', 'Give me a status briefing'],
  optimize: ['What are our biggest growth opportunities?', 'Show me the reasoning timeline'],
  general_query: ['Give me a status briefing', 'What are our biggest growth opportunities?'],
};

/**
 * Generate 2 contextual follow-up questions based on the current conversation.
 */
async function generateSuggestedQuestions(
  userCommand: string,
  intent: CoryIntent,
  actions: string[],
  briefings: ExecutiveBriefing[],
): Promise<string[]> {
  try {
    const context = [
      `User asked: "${userCommand}"`,
      `Intent: ${intent}`,
      `Actions: ${actions.join('; ')}`,
      briefings.length > 0
        ? `Key findings: ${briefings.slice(0, 3).map((b) => b.analysis || b.action_taken || b.problem_detected).filter(Boolean).join('; ')}`
        : '',
    ].filter(Boolean).join('\n');

    const result = await chatCompletion(
      `You are Cory, an AI COO. Based on the conversation context, suggest exactly 2 natural follow-up questions the executive user would likely want to ask next. Questions should be concise (under 10 words each), actionable, and different from what was just asked. Return JSON: { "questions": ["...", "..."] }`,
      context,
      { json: true, maxTokens: 100, temperature: 0.4 },
    );

    if (result) {
      const parsed = JSON.parse(result);
      if (Array.isArray(parsed.questions) && parsed.questions.length >= 2) {
        return parsed.questions.slice(0, 2);
      }
    }
  } catch { /* fall through to fallback */ }

  return FALLBACK_SUGGESTIONS[intent] || FALLBACK_SUGGESTIONS.general_query;
}

// ─── Status + Narrative ──────────────────────────────────────────────────────

/**
 * Get Cory's overall status dashboard data.
 */
export async function getCoryStatus(): Promise<CoryStatusReport> {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Agent fleet health
  const allAgents = await AiAgent.findAll();
  const fleet = {
    total: allAgents.length,
    healthy: allAgents.filter((a: any) => a.enabled && a.status !== 'error').length,
    errored: allAgents.filter((a: any) => a.status === 'error').length,
    paused: allAgents.filter((a: any) => a.status === 'paused' || !a.enabled).length,
  };

  // Decision stats (24h)
  const decisions: any[] = await sequelize.query(
    `SELECT execution_status, COUNT(*) as count
     FROM intelligence_decisions
     WHERE timestamp >= :since
     GROUP BY execution_status`,
    { replacements: { since: last24h }, type: 'SELECT' as any },
  ).catch(() => []);

  const decisionCounts: Record<string, number> = {};
  for (const row of decisions) {
    decisionCounts[row.execution_status] = Number(row.count);
  }

  // Avg confidence
  const avgResult: any[] = await sequelize.query(
    `SELECT AVG(confidence_score) as avg_conf, AVG(risk_score) as avg_risk
     FROM intelligence_decisions
     WHERE timestamp >= :since`,
    { replacements: { since: last24h }, type: 'SELECT' as any },
  ).catch(() => []);

  const avgConf = Math.round(Number(avgResult[0]?.avg_conf) || 0);
  const avgRisk = Math.round(Number(avgResult[0]?.avg_risk) || 0);

  // Risk level
  let riskLevel = 'low';
  if (avgRisk > 60 || fleet.errored > 5) riskLevel = 'high';
  else if (avgRisk > 35 || fleet.errored > 2) riskLevel = 'moderate';

  // Departments
  const departments = await getDepartmentSummary();

  // Experiments running
  const experimentsRunning = await IntelligenceDecision.count({
    where: {
      recommended_action: 'launch_ab_test',
      execution_status: { [Op.in]: ['executing', 'monitoring'] },
    },
  });

  return {
    status: 'active',
    agent_fleet: fleet,
    decisions_24h: {
      total: Object.values(decisionCounts).reduce((a, b) => a + b, 0),
      executed: (decisionCounts.executed || 0) + (decisionCounts.completed || 0) + (decisionCounts.monitoring || 0),
      proposed: decisionCounts.proposed || 0,
      rejected: decisionCounts.rejected || 0,
    },
    latest_strategic_report: getLatestStrategicReport(),
    departments,
    experiments_running: experimentsRunning,
    avg_confidence: avgConf,
    system_risk_level: riskLevel,
  };
}

/**
 * Get recent executive briefings from autonomous decisions.
 */
export async function getCoryNarrative(limit = 10): Promise<ExecutiveBriefing[]> {
  const decisions = await IntelligenceDecision.findAll({
    where: { timestamp: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    order: [['timestamp', 'DESC']],
    limit: Math.min(limit, 50),
  });

  return decisions.map((d: any) => ({
    problem_detected: d.problem_detected || undefined,
    analysis: d.analysis_summary || undefined,
    action_taken: d.recommended_action
      ? `${d.recommended_action} (${d.execution_status})`
      : undefined,
    expected_impact: d.impact_estimate?.change_pct
      ? `${d.impact_estimate.metric || 'metric'} ${d.impact_estimate.change_pct > 0 ? '+' : ''}${d.impact_estimate.change_pct}%`
      : undefined,
    confidence: d.confidence_score || 0,
  }));
}
