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
import IntelligenceDecision from '../../models/IntelligenceDecision';
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
): Promise<{ intent: CoryIntent; parameters: Record<string, any> }> {
  const lower = command.toLowerCase().replace(/^cory[,:]?\s*/i, '');

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

const CORY_PERSONA = `You are Cory, the AI Chief Operating Officer of Colaberry Enterprise.
You speak in direct, executive language. You prioritize by business impact.
You coordinate a fleet of AI agents across departments: Intelligence, Operations, Growth, Maintenance, Security.
Report findings as structured executive briefings. Be concise but insightful.
When presenting data, lead with the most important finding. Use numbers.`;

/**
 * Execute a command through Cory's 5-step pipeline.
 */
export async function executeCoryCommand(cmd: CoryCommand): Promise<CoryResponse> {
  const traceId = crypto.randomUUID();
  const actionsPerformed: string[] = [];
  const agentsDispatched: string[] = [];
  let briefings: ExecutiveBriefing[] = [];
  let assistantResponse: AssistantResponse | undefined;

  // Step 1: Interpret command
  const { intent, parameters } = await interpretCommand(cmd.command);

  // Step 2 + 3: Create plan and launch agents based on intent
  try {
    switch (intent) {
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
        const departments = await getDepartmentSummary();
        const deptName = parameters.department;
        const filtered = deptName
          ? departments.filter((d) => d.department.toLowerCase() === deptName.toLowerCase())
          : departments;

        briefings = filtered.map((d) => ({
          analysis: `${d.department}: ${d.agent_count} agents, ${d.healthy} healthy, ${d.errored} errored, ${d.paused} paused`,
          confidence: 100,
        }));
        actionsPerformed.push(`Retrieved status for ${filtered.length} department(s)`);
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

  // Step 5: Report to user in Cory's voice
  const message = await formatCoryResponse(intent, actionsPerformed, briefings, assistantResponse);

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
): Promise<string> {
  // If we have a full assistant response, use its narrative
  if (assistantResponse?.narrative) {
    return assistantResponse.narrative;
  }

  // Build context for LLM
  const context = [
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

  const llmResponse = await chatCompletion(
    CORY_PERSONA,
    `Summarize this in 2-4 sentences as a direct executive briefing:\n${context}`,
    { maxTokens: 300, temperature: 0.3 },
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
const FALLBACK_SUGGESTIONS: Record<CoryIntent, string[]> = {
  briefing: ['What actions should we prioritize today?', 'Show me department health'],
  analyze: ['What are the biggest risks right now?', 'How can we improve conversion rates?'],
  hire_agent: ['Show me the current agent roster', 'Give me a status briefing'],
  retire_agent: ['Which agents need attention?', 'Show me department health'],
  launch_experiment: ['What experiments are currently running?', 'Give me a status briefing'],
  department_status: ['Which department needs the most attention?', 'What experiments are running?'],
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
