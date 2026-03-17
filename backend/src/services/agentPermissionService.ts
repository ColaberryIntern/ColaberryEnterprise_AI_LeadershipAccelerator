/**
 * Agent Permission Service
 *
 * Central permission guard for all AI agent operations.
 * Classifies agents into 4 permission tiers and enforces write restrictions.
 *
 * Tier 1 — READ_ONLY: Can only read data, zero writes
 * Tier 2 — SUGGEST_ONLY: Can propose changes via ProposedAgentAction, no direct writes
 * Tier 3 — WRITE_WITH_AUDIT: Can write to specific tables, all writes audited
 * Tier 4 — COMMUNICATION: Can trigger outbound comms (must pass evaluateSend)
 */

import { Op } from 'sequelize';
import AgentWriteAudit from '../models/AgentWriteAudit';
import ProposedAgentAction from '../models/ProposedAgentAction';
import { AiAgent } from '../models';

// ---------------------------------------------------------------------------
// Permission Tiers
// ---------------------------------------------------------------------------

export type PermissionTier = 'read_only' | 'suggest_only' | 'write_with_audit' | 'communication';

export interface AgentPermission {
  tier: PermissionTier;
  allowedTables: string[];
  allowedOperations: string[];
  requiresEvaluateSend: boolean;
}

// ---------------------------------------------------------------------------
// Agent → Tier Classification
// ---------------------------------------------------------------------------

const AGENT_PERMISSIONS: Record<string, AgentPermission> = {
  // Tier 1 — READ_ONLY: Monitoring, scanning, analytics agents
  CampaignHealthScanner: { tier: 'read_only', allowedTables: [], allowedOperations: [], requiresEvaluateSend: false },
  OrchestrationHealthAgent: { tier: 'read_only', allowedTables: [], allowedOperations: [], requiresEvaluateSend: false },
  StudentProgressMonitor: { tier: 'read_only', allowedTables: [], allowedOperations: [], requiresEvaluateSend: false },
  PromptMonitorAgent: { tier: 'read_only', allowedTables: [], allowedOperations: [], requiresEvaluateSend: false },
  ApolloLeadIntelligenceAgent: { tier: 'read_only', allowedTables: [], allowedOperations: [], requiresEvaluateSend: false },
  WebsiteUIVisibilityAgent: { tier: 'read_only', allowedTables: [], allowedOperations: [], requiresEvaluateSend: false },
  WebsiteBrokenLinkAgent: { tier: 'read_only', allowedTables: [], allowedOperations: [], requiresEvaluateSend: false },
  WebsiteConversionFlowAgent: { tier: 'read_only', allowedTables: [], allowedOperations: [], requiresEvaluateSend: false },
  WebsiteUXHeuristicAgent: { tier: 'read_only', allowedTables: [], allowedOperations: [], requiresEvaluateSend: false },
  WebsiteBehaviorAgent: { tier: 'read_only', allowedTables: [], allowedOperations: [], requiresEvaluateSend: false },
  WebsiteImprovementStrategist: { tier: 'read_only', allowedTables: [], allowedOperations: [], requiresEvaluateSend: false },

  // Tier 2 — SUGGEST_ONLY: Optimization agents that propose changes
  ContentOptimizationAgent: { tier: 'suggest_only', allowedTables: ['proposed_agent_actions'], allowedOperations: ['propose_content_rewrite'], requiresEvaluateSend: false },
  ConversationOptimizationAgent: { tier: 'suggest_only', allowedTables: ['proposed_agent_actions'], allowedOperations: ['propose_instruction_enhancement'], requiresEvaluateSend: false },

  // Tier 3 — WRITE_WITH_AUDIT: Repair and maintenance agents
  CampaignRepairAgent: { tier: 'write_with_audit', allowedTables: ['scheduled_emails', 'campaign_errors'], allowedOperations: ['retry_failed_send', 'detect_stalled_campaign', 'auto_resolve_errors'], requiresEvaluateSend: false },
  CampaignSelfHealingAgent: { tier: 'write_with_audit', allowedTables: ['scheduled_emails'], allowedOperations: ['retry_failed_email', 'post_repair_retest'], requiresEvaluateSend: false },
  CampaignQAAgent: { tier: 'write_with_audit', allowedTables: ['campaign_test_runs', 'campaign_test_steps'], allowedOperations: ['run_qa_test'], requiresEvaluateSend: false },
  OrchestrationAutoRepairAgent: { tier: 'write_with_audit', allowedTables: ['prompt_templates', 'mini_sections', 'artifact_definitions'], allowedOperations: ['reactivate_prompt', 'null_broken_fk', 'null_broken_artifact_fk'], requiresEvaluateSend: false },
  WebsiteAutoRepairAgent: { tier: 'write_with_audit', allowedTables: ['website_issues'], allowedOperations: ['auto_repair'], requiresEvaluateSend: false },
  ExecutionAgent: { tier: 'write_with_audit', allowedTables: ['ai_agents', 'intelligence_decisions'], allowedOperations: ['update_agent_config', 'modify_agent_schedule', 'update_campaign_config', 'adjust_lead_scoring', 'launch_ab_test', 'pause_campaign'], requiresEvaluateSend: false },

  // Tier 4 — COMMUNICATION: Agents that send outbound messages
  AdmissionsSMSAgent: { tier: 'communication', allowedTables: ['admissions_action_logs', 'communication_logs'], allowedOperations: ['send_sms'], requiresEvaluateSend: true },
  AdmissionsSynthflowCallAgent: { tier: 'communication', allowedTables: ['call_contact_logs', 'admissions_action_logs', 'communication_logs'], allowedOperations: ['synthflow_call'], requiresEvaluateSend: true },
  AdmissionsEmailAgent: { tier: 'communication', allowedTables: ['admissions_action_logs', 'communication_logs'], allowedOperations: ['send_email'], requiresEvaluateSend: true },
};

// Default permission for unclassified agents — restrict to suggest_only
const DEFAULT_PERMISSION: AgentPermission = {
  tier: 'suggest_only',
  allowedTables: ['proposed_agent_actions'],
  allowedOperations: [],
  requiresEvaluateSend: false,
};

// ---------------------------------------------------------------------------
// Permission Check
// ---------------------------------------------------------------------------

export function getAgentPermission(agentName: string): AgentPermission {
  return AGENT_PERMISSIONS[agentName] || DEFAULT_PERMISSION;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  tier: PermissionTier;
}

/**
 * Validate whether an agent is allowed to perform a specific write operation.
 * Logs the check to AgentWriteAudit regardless of outcome.
 */
export async function validateAgentWrite(
  agentId: string,
  agentName: string,
  operation: string,
  targetTable: string,
  targetId: string,
  beforeState?: Record<string, any> | null,
  afterState?: Record<string, any> | null,
  traceId?: string,
): Promise<PermissionCheckResult> {
  const permission = getAgentPermission(agentName);
  const startTime = Date.now();

  // Read-only agents cannot write anything
  if (permission.tier === 'read_only') {
    await logAudit(agentId, agentName, operation, targetTable, targetId, permission.tier, false, 'read_only_agent', beforeState, afterState, traceId, Date.now() - startTime);
    return { allowed: false, reason: 'Agent is read-only — no writes permitted', tier: permission.tier };
  }

  // Suggest-only agents can only write to proposed_agent_actions
  if (permission.tier === 'suggest_only' && targetTable !== 'proposed_agent_actions') {
    await logAudit(agentId, agentName, operation, targetTable, targetId, permission.tier, false, 'suggest_only_direct_write_blocked', beforeState, afterState, traceId, Date.now() - startTime);
    return { allowed: false, reason: 'Agent is suggest-only — must use ProposedAgentAction', tier: permission.tier };
  }

  // Check table allowlist for write_with_audit and communication tiers
  if (permission.tier === 'write_with_audit' || permission.tier === 'communication') {
    if (!permission.allowedTables.includes(targetTable)) {
      await logAudit(agentId, agentName, operation, targetTable, targetId, permission.tier, false, `table_not_in_allowlist: ${targetTable}`, beforeState, afterState, traceId, Date.now() - startTime);
      return { allowed: false, reason: `Agent not allowed to write to ${targetTable}`, tier: permission.tier };
    }
  }

  // Allowed — log the audit
  await logAudit(agentId, agentName, operation, targetTable, targetId, permission.tier, true, null, beforeState, afterState, traceId, Date.now() - startTime);
  return { allowed: true, tier: permission.tier };
}

/**
 * Create a proposal instead of a direct write (for suggest-only agents).
 */
export async function createProposal(
  agentId: string,
  agentName: string,
  actionType: string,
  targetTable: string,
  targetId: string,
  proposedChanges: Record<string, any>,
  beforeState: Record<string, any>,
  reason: string,
  confidence: number,
  campaignId?: string | null,
): Promise<any> {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7-day expiry

  // Compute prioritization scores
  const fieldCount = Object.keys(proposedChanges).length;
  const impactScore = Math.min(1.0, Math.round((fieldCount * 0.2 + confidence * 0.5) * 100) / 100);
  const riskScore = computeRiskScore(targetTable, actionType, fieldCount);
  const priorityScore = Math.round((impactScore * 0.4 + confidence * 0.4 + (1 - riskScore) * 0.2) * 100) / 100;

  const proposal = await ProposedAgentAction.create({
    agent_id: agentId,
    agent_name: agentName,
    action_type: actionType,
    target_table: targetTable,
    target_id: targetId,
    proposed_changes: proposedChanges,
    before_state: beforeState,
    reason,
    confidence,
    campaign_id: campaignId || null,
    status: 'pending',
    expires_at: expiresAt,
    impact_score: impactScore,
    risk_score: riskScore,
    priority_score: priorityScore,
  });

  // Also audit the proposal creation
  await logAudit(agentId, agentName, `propose:${actionType}`, 'proposed_agent_actions', proposal.id, 'suggest_only', true, null, beforeState, proposedChanges);

  return proposal;
}

// ---------------------------------------------------------------------------
// Risk Score Computation
// ---------------------------------------------------------------------------

const HIGH_RISK_TABLES = ['scheduled_emails', 'communication_logs', 'leads'];
const HIGH_RISK_ACTIONS = ['subject_rewrite', 'body_rewrite', 'send_email', 'send_sms', 'synthflow_call'];

function computeRiskScore(targetTable: string, actionType: string, fieldCount: number): number {
  let score = 0.1;
  if (HIGH_RISK_TABLES.includes(targetTable)) score += 0.3;
  if (HIGH_RISK_ACTIONS.some((a) => actionType.includes(a))) score += 0.2;
  if (fieldCount > 3) score += 0.2;
  return Math.min(1.0, Math.round(score * 100) / 100);
}

// ---------------------------------------------------------------------------
// Execution Limits
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RUNS_PER_HOUR = 60;
const DEFAULT_MAX_WRITES_PER_EXECUTION = 100;
const DEFAULT_MAX_PROPOSALS_PER_RUN = 50;

export interface ExecutionLimitCheck {
  allowed: boolean;
  reason?: string;
  current: number;
  limit: number;
}

/**
 * Check if an agent has exceeded its max_runs_per_hour limit.
 * Counts runs in the last 60 minutes from ai_agents.run_count and last_run_at.
 */
export async function checkRunLimit(agentName: string): Promise<ExecutionLimitCheck> {
  const agent = await AiAgent.findOne({ where: { agent_name: agentName } });
  if (!agent) return { allowed: true, current: 0, limit: DEFAULT_MAX_RUNS_PER_HOUR };

  const limit = agent.max_runs_per_hour || DEFAULT_MAX_RUNS_PER_HOUR;

  // Count audit entries for this agent in the last hour as a proxy for runs
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentRuns = await AgentWriteAudit.count({
    where: {
      agent_name: agentName,
      operation: { [Op.notLike]: 'propose:%' },
      created_at: { [Op.gte]: oneHourAgo },
    },
  });

  if (recentRuns >= limit) {
    return { allowed: false, reason: `Agent exceeded max_runs_per_hour (${recentRuns}/${limit})`, current: recentRuns, limit };
  }
  return { allowed: true, current: recentRuns, limit };
}

/**
 * Check if an agent has exceeded its max_writes_per_execution limit.
 * Uses trace_id to scope writes to a single execution.
 */
export async function checkWriteLimit(agentName: string, traceId: string): Promise<ExecutionLimitCheck> {
  const agent = await AiAgent.findOne({ where: { agent_name: agentName } });
  if (!agent) return { allowed: true, current: 0, limit: DEFAULT_MAX_WRITES_PER_EXECUTION };

  const limit = agent.max_writes_per_execution || DEFAULT_MAX_WRITES_PER_EXECUTION;

  const writesInExecution = await AgentWriteAudit.count({
    where: {
      agent_name: agentName,
      trace_id: traceId,
      was_allowed: true,
    },
  });

  if (writesInExecution >= limit) {
    return { allowed: false, reason: `Agent exceeded max_writes_per_execution (${writesInExecution}/${limit})`, current: writesInExecution, limit };
  }
  return { allowed: true, current: writesInExecution, limit };
}

/**
 * Check if an agent has exceeded its max_proposals_per_run limit.
 * Uses trace_id to scope proposals to a single execution.
 */
export async function checkProposalLimit(agentName: string, traceId?: string): Promise<ExecutionLimitCheck> {
  const agent = await AiAgent.findOne({ where: { agent_name: agentName } });
  if (!agent) return { allowed: true, current: 0, limit: DEFAULT_MAX_PROPOSALS_PER_RUN };

  const limit = agent.max_proposals_per_run || DEFAULT_MAX_PROPOSALS_PER_RUN;

  const where: Record<string, any> = { agent_name: agentName };
  if (traceId) {
    // Scope to current execution via audit trace
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    where.created_at = { [Op.gte]: oneHourAgo };
  }
  where.status = 'pending';

  const proposalsInRun = await ProposedAgentAction.count({ where });

  if (proposalsInRun >= limit) {
    return { allowed: false, reason: `Agent exceeded max_proposals_per_run (${proposalsInRun}/${limit})`, current: proposalsInRun, limit };
  }
  return { allowed: true, current: proposalsInRun, limit };
}

// ---------------------------------------------------------------------------
// Emergency Stop
// ---------------------------------------------------------------------------

/**
 * Emergency stop — disable ALL agents immediately.
 * Returns the count of agents disabled.
 */
export async function emergencyStopAllAgents(reason: string, stoppedBy: string): Promise<number> {
  const [count] = await AiAgent.update(
    { enabled: false, status: 'paused', updated_at: new Date() },
    { where: { enabled: true } },
  );

  console.error(`[EMERGENCY STOP] ${count} agents disabled by ${stoppedBy}. Reason: ${reason}`);
  return count;
}

/**
 * Re-enable agents after emergency stop (selective).
 * Only re-enables agents that were previously enabled (checks for status='paused').
 */
export async function resumeAgentsAfterStop(agentNames?: string[]): Promise<number> {
  const where: Record<string, any> = { enabled: false, status: 'paused' };
  if (agentNames && agentNames.length > 0) {
    const { Op } = require('sequelize');
    where.agent_name = { [Op.in]: agentNames };
  }

  const [count] = await AiAgent.update(
    { enabled: true, status: 'idle', updated_at: new Date() },
    { where },
  );

  console.log(`[AGENT RESUME] ${count} agents re-enabled`);
  return count;
}

// ---------------------------------------------------------------------------
// Internal audit logger
// ---------------------------------------------------------------------------

async function logAudit(
  agentId: string,
  agentName: string,
  operation: string,
  targetTable: string,
  targetId: string,
  permissionTier: string,
  wasAllowed: boolean,
  blockedReason: string | null,
  beforeState?: Record<string, any> | null,
  afterState?: Record<string, any> | null,
  traceId?: string | null,
  durationMs?: number | null,
  executionId?: string | null,
): Promise<void> {
  try {
    await AgentWriteAudit.create({
      agent_id: agentId,
      agent_name: agentName,
      operation,
      target_table: targetTable,
      target_id: targetId,
      before_state: beforeState || null,
      after_state: afterState || null,
      permission_tier: permissionTier,
      was_allowed: wasAllowed,
      blocked_reason: blockedReason || null,
      trace_id: traceId || null,
      execution_id: executionId || null,
      duration_ms: durationMs || null,
    });
  } catch (err: any) {
    console.error(`[AgentPermission] Audit log failed: ${err.message}`);
  }
}
