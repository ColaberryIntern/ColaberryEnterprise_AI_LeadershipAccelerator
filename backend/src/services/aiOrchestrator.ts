import crypto from 'crypto';
import AiAgent from '../models/AiAgent';
import { scanAllCampaigns } from './campaignHealthScanner';
import { runCampaignRepairAgent } from './agents/campaignRepairAgent';
import { runContentOptimizationAgent } from './agents/contentOptimizationAgent';
import { runConversationOptimizationAgent } from './agents/conversationOptimizationAgent';
import { runOrchestrationHealthAgent } from './agents/orchestrationHealthAgent';
import { runStudentProgressMonitor } from './agents/studentProgressMonitor';
import { runPromptMonitorAgent } from './agents/promptMonitorAgent';
import { runOrchestrationAutoRepairAgent } from './agents/orchestrationAutoRepairAgent';
import { runCampaignQAAgent } from './agents/campaignQAAgent';
import { runCampaignSelfHealingAgent } from './agents/campaignSelfHealingAgent';
import { runApolloLeadIntelligenceAgent } from './agents/apolloLeadIntelligenceAgent';
import { runWebsiteUIVisibilityAgent } from './agents/websiteUIVisibilityAgent';
import { runWebsiteBrokenLinkAgent } from './agents/websiteBrokenLinkAgent';
import { runWebsiteConversionFlowAgent } from './agents/websiteConversionFlowAgent';
import { runWebsiteUXHeuristicAgent } from './agents/websiteUXHeuristicAgent';
import { runWebsiteBehaviorAgent } from './agents/websiteBehaviorAgent';
import { runWebsiteAutoRepairAgent } from './agents/websiteAutoRepairAgent';
import { runWebsiteImprovementStrategist } from './agents/websiteImprovementStrategist';
import { runAdmissionsVisitorIdentityAgent } from './agents/admissions/admissionsVisitorIdentityAgent';
import { runAdmissionsVisitorActivityAgent } from './agents/admissions/admissionsVisitorActivityAgent';
import { runAdmissionsConversationMemoryAgent } from './agents/admissions/admissionsConversationMemoryAgent';
import { runAdmissionsIntentDetectionAgent } from './agents/admissions/admissionsIntentDetectionAgent';
import { runAdmissionsConversationPlanningAgent } from './agents/admissions/admissionsConversationPlanningAgent';
import { runAdmissionsKnowledgeAgent } from './agents/admissions/admissionsKnowledgeAgent';
import { runAdmissionsProactiveOutreachAgent } from './agents/admissions/admissionsProactiveOutreachAgent';
import { runAdmissionsPageContextAgent } from './agents/admissions/admissionsPageContextAgent';
import { runAdmissionsConversationContinuityAgent } from './agents/admissions/admissionsConversationContinuityAgent';
import { runAdmissionsHighIntentLeadAgent } from './agents/admissions/admissionsHighIntentLeadAgent';
import { runAdmissionsCEORecognitionAgent } from './agents/admissions/admissionsCEORecognitionAgent';
import { runAdmissionsInsightsAgent } from './agents/admissions/admissionsInsightsAgent';
import { runAdmissionsExecutiveUpdateAgent } from './agents/admissions/admissionsExecutiveUpdateAgent';
import { runAdmissionsDocumentDeliveryAgent } from './agents/admissions/admissionsDocumentDeliveryAgent';
import { runAdmissionsEmailAgent } from './agents/admissions/admissionsEmailAgent';
import { runAdmissionsSMSAgent } from './agents/admissions/admissionsSMSAgent';
import { runAdmissionsAppointmentAgent } from './agents/admissions/admissionsAppointmentAgent';
import { runAdmissionsSynthflowCallAgent } from './agents/admissions/admissionsSynthflowCallAgent';
import { runAdmissionsCallGovernanceAgent } from './agents/admissions/admissionsCallGovernanceAgent';
import { runAdmissionsCallComplianceAgent } from './agents/admissions/admissionsCallComplianceAgent';
import { runAdmissionsCallbackAgent } from './agents/admissions/admissionsCallbackAgent';
import { runAdmissionsConversationTaskMonitor } from './agents/admissions/admissionsConversationTaskMonitor';
import { runAdmissionsAssistantAgent } from './agents/admissions/admissionsAssistantAgent';
import { runOpenclawSupervisorAgent } from './agents/openclaw/openclawSupervisorAgent';
import { runOpenclawMarketSignalAgent } from './agents/openclaw/openclawMarketSignalAgent';
import { runOpenclawConversationDetectionAgent } from './agents/openclaw/openclawConversationDetectionAgent';
import { runOpenclawContentResponseAgent } from './agents/openclaw/openclawContentResponseAgent';
import { runOpenclawBrowserWorkerAgent } from './agents/openclaw/openclawBrowserWorkerAgent';
import { runOpenclawLearningOptimizationAgent } from './agents/openclaw/openclawLearningOptimizationAgent';
import { runOpenclawInfraMonitorAgent } from './agents/openclaw/openclawInfraMonitorAgent';
import { runOpenclawTechResearchAgent } from './agents/openclaw/openclawTechResearchAgent';
import { runConversionDetectionAgent } from './agents/openclaw/openclawConversionDetectionAgent';
import { runConversationSyncAgent } from './agents/openclaw/openclawConversationSyncAgent';
import { runStrategyArchitectAgent } from './agents/strategy/strategyArchitectAgent';
import { runSecurityDirectorAgent } from './agents/security/securityDirectorAgent';
import { runSecretDetectionAgent } from './agents/security/secretDetectionAgent';
import { runCodeSecurityAuditAgent } from './agents/security/codeSecurityAuditAgent';
import { runDependencySecurityAgent } from './agents/security/dependencySecurityAgent';
import { runRuntimeThreatMonitorAgent } from './agents/security/runtimeThreatMonitorAgent';
import { runAccessControlGuardianAgent } from './agents/security/accessControlGuardianAgent';
import { runAiSafetyMonitorAgent } from './agents/security/aiSafetyMonitorAgent';
import { runAgentBehaviorMonitorAgent } from './agents/security/agentBehaviorMonitorAgent';
import { runAdmissionsKnowledgeSyncAgent } from './agents/admissions/admissionsKnowledgeSyncAgent';
import { logAiEvent, logAgentActivity } from './aiEventService';
import { seedAgentRegistry } from './agentRegistrySeed';
import type { AgentExecutionResult } from './agents/types';
// Super agent executors
import { executeCampaignOpsSuperAgent } from './agents/departments/superAgents/campaignOpsSuperAgent';
import { executeLeadIntelligenceSuperAgent } from './agents/departments/superAgents/leadIntelligenceSuperAgent';
import { executeContentEngineSuperAgent } from './agents/departments/superAgents/contentEngineSuperAgent';
import { executeAnalyticsEngineSuperAgent } from './agents/departments/superAgents/analyticsEngineSuperAgent';
import { executeSystemResilienceSuperAgent } from './agents/departments/superAgents/systemResilienceSuperAgent';
import { executeAdmissionsSuperAgent } from './agents/departments/superAgents/admissionsSuperAgent';
import { executePartnershipSuperAgent } from './agents/departments/superAgents/partnershipSuperAgent';
import { executeFinanceSuperAgent } from './agents/departments/superAgents/financeSuperAgent';

// Re-export seedAgentRegistry for callers
export { seedAgentRegistry as seedAgents };

/**
 * Run health scans for all active campaigns.
 */
export async function runHealthScans(): Promise<void> {
  const agent = await AiAgent.findOne({ where: { agent_name: 'CampaignHealthScanner' } });
  const traceId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    if (agent) {
      if (!agent.enabled) {
        console.log('[AI Ops] CampaignHealthScanner is disabled, skipping');
        return;
      }
      await agent.update({ status: 'running', updated_at: new Date() });
    }

    const results = await scanAllCampaigns();

    if (agent) {
      const durationMs = Date.now() - startTime;
      const newAvg = agent.avg_duration_ms
        ? Math.round((agent.avg_duration_ms * agent.run_count + durationMs) / (agent.run_count + 1))
        : durationMs;

      await agent.update({
        status: 'idle',
        last_run_at: new Date(),
        run_count: agent.run_count + 1,
        avg_duration_ms: newAvg,
        last_result: {
          campaigns_scanned: results.length,
          healthy: results.filter((r) => r.status === 'healthy').length,
          degraded: results.filter((r) => r.status === 'degraded').length,
          critical: results.filter((r) => r.status === 'critical').length,
          duration_ms: durationMs,
          timestamp: new Date().toISOString(),
        },
        updated_at: new Date(),
      });

      await logAgentActivity({
        agent_id: agent.id,
        action: 'health_scan_completed',
        result: 'success',
        trace_id: traceId,
        duration_ms: durationMs,
        execution_context: { trigger: 'cron', schedule: agent.schedule },
        details: { campaigns_scanned: results.length },
      });
    }
  } catch (err: any) {
    console.error('[AI Ops] Health scan failed:', err.message);
    if (agent) {
      await agent.update({
        status: 'error',
        error_count: agent.error_count + 1,
        last_error: err.message,
        last_error_at: new Date(),
        updated_at: new Date(),
      });
    }
    await logAiEvent('orchestrator', 'health_scan_error', undefined, undefined, {
      error: err.message,
      trace_id: traceId,
    });
  }
}

/**
 * Run a specific agent by name, checking its status and enabled state first.
 */
async function runAgent(
  agentName: string,
  executor: (agentId: string, config: Record<string, any>) => Promise<AgentExecutionResult>,
): Promise<AgentExecutionResult | null> {
  const agent = await AiAgent.findOne({ where: { agent_name: agentName } });
  if (!agent) {
    console.error(`[AI Ops] Agent not found: ${agentName}`);
    return null;
  }

  if (!agent.enabled) {
    console.log(`[AI Ops] Agent ${agentName} is disabled, skipping`);
    return null;
  }

  if (agent.status === 'paused') {
    console.log(`[AI Ops] Agent ${agentName} is paused, skipping`);
    return null;
  }

  const traceId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    await agent.update({ status: 'running', updated_at: new Date() });

    const result = await executor(agent.id, agent.config || {});

    const durationMs = Date.now() - startTime;
    const newAvg = agent.avg_duration_ms
      ? Math.round((agent.avg_duration_ms * agent.run_count + durationMs) / (agent.run_count + 1))
      : durationMs;

    await agent.update({
      status: 'idle',
      last_run_at: new Date(),
      run_count: agent.run_count + 1,
      avg_duration_ms: newAvg,
      last_result: {
        campaigns_processed: result.campaigns_processed,
        actions_taken: result.actions_taken.length,
        errors: result.errors.length,
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
      },
      updated_at: new Date(),
    });

    // Log the execution summary with trace — include full action details
    const actionSummary = result.actions_taken.length > 0
      ? `${result.actions_taken.length} action(s): ${[...new Set(result.actions_taken.map(a => a.action))].join(', ')}`
      : 'scan_completed_no_issues';

    await logAgentActivity({
      agent_id: agent.id,
      action: actionSummary,
      result: result.errors.length > 0 ? 'failed' : 'success',
      trace_id: traceId,
      duration_ms: durationMs,
      execution_context: {
        trigger: 'cron',
        schedule: agent.schedule,
        campaigns_processed: result.campaigns_processed,
      },
      details: {
        actions_taken: result.actions_taken.length,
        actions: result.actions_taken.slice(0, 50),
        errors: result.errors,
      },
    });

    if (result.actions_taken.length > 0 || result.errors.length > 0) {
      console.log(
        `[AI Ops] ${agentName}: ${result.campaigns_processed} campaigns, ` +
          `${result.actions_taken.length} actions, ${result.errors.length} errors ` +
          `(${durationMs}ms)`,
      );
    }

    return result;
  } catch (err: any) {
    const durationMs = Date.now() - startTime;

    await agent.update({
      status: 'error',
      error_count: agent.error_count + 1,
      last_error: err.message,
      last_error_at: new Date(),
      updated_at: new Date(),
    });

    await logAgentActivity({
      agent_id: agent.id,
      action: 'agent_execution_failed',
      result: 'failed',
      trace_id: traceId,
      duration_ms: durationMs,
      execution_context: { trigger: 'cron', schedule: agent.schedule },
      stack_trace: err.stack || err.message,
    });

    console.error(`[AI Ops] ${agentName} failed:`, err.message);
    await logAiEvent('orchestrator', 'agent_error', 'agent', agent.id, {
      agent_name: agentName,
      error: err.message,
      trace_id: traceId,
    });
    return null;
  }
}

/**
 * Run the Campaign Repair Agent.
 */
export async function runRepairAgent(): Promise<AgentExecutionResult | null> {
  return runAgent('CampaignRepairAgent', runCampaignRepairAgent);
}

/**
 * Run the Content Optimization Agent.
 */
export async function runContentOptimization(): Promise<AgentExecutionResult | null> {
  return runAgent('ContentOptimizationAgent', runContentOptimizationAgent);
}

/**
 * Run the Conversation Optimization Agent.
 */
export async function runConversationOptimization(): Promise<AgentExecutionResult | null> {
  return runAgent('ConversationOptimizationAgent', runConversationOptimizationAgent);
}

/**
 * Run the Orchestration Health Agent.
 */
export async function runOrchestrationHealth(): Promise<AgentExecutionResult | null> {
  return runAgent('OrchestrationHealthAgent', runOrchestrationHealthAgent);
}

/**
 * Run the Student Progress Monitor.
 */
export async function runStudentProgress(): Promise<AgentExecutionResult | null> {
  return runAgent('StudentProgressMonitor', runStudentProgressMonitor);
}

/**
 * Run the Prompt Monitor Agent.
 */
export async function runPromptMonitor(): Promise<AgentExecutionResult | null> {
  return runAgent('PromptMonitorAgent', runPromptMonitorAgent);
}

/**
 * Run the Orchestration Auto-Repair Agent.
 */
export async function runOrchestrationRepair(): Promise<AgentExecutionResult | null> {
  return runAgent('OrchestrationAutoRepairAgent', runOrchestrationAutoRepairAgent);
}

/**
 * Run the Campaign QA Agent.
 */
export async function runCampaignQA(): Promise<AgentExecutionResult | null> {
  return runAgent('CampaignQAAgent', runCampaignQAAgent);
}

/**
 * Run the Campaign Self-Healing Agent.
 */
export async function runSelfHealing(): Promise<AgentExecutionResult | null> {
  return runAgent('CampaignSelfHealingAgent', runCampaignSelfHealingAgent);
}

/**
 * Run the Apollo Lead Intelligence Agent.
 */
export async function runLeadIntelligence(): Promise<AgentExecutionResult | null> {
  return runAgent('ApolloLeadIntelligenceAgent', runApolloLeadIntelligenceAgent);
}

/* ── Website Intelligence Agents ─────────────────────────────────── */

export async function runWebsiteUIVisibility(): Promise<AgentExecutionResult | null> {
  return runAgent('WebsiteUIVisibilityAgent', runWebsiteUIVisibilityAgent);
}

export async function runWebsiteBrokenLinks(): Promise<AgentExecutionResult | null> {
  return runAgent('WebsiteBrokenLinkAgent', runWebsiteBrokenLinkAgent);
}

export async function runWebsiteConversionFlow(): Promise<AgentExecutionResult | null> {
  return runAgent('WebsiteConversionFlowAgent', runWebsiteConversionFlowAgent);
}

export async function runWebsiteUXHeuristics(): Promise<AgentExecutionResult | null> {
  return runAgent('WebsiteUXHeuristicAgent', runWebsiteUXHeuristicAgent);
}

export async function runWebsiteBehavior(): Promise<AgentExecutionResult | null> {
  return runAgent('WebsiteBehaviorAgent', runWebsiteBehaviorAgent);
}

export async function runWebsiteAutoRepair(): Promise<AgentExecutionResult | null> {
  return runAgent('WebsiteAutoRepairAgent', runWebsiteAutoRepairAgent);
}

export async function runWebsiteStrategist(): Promise<AgentExecutionResult | null> {
  return runAgent('WebsiteImprovementStrategist', runWebsiteImprovementStrategist);
}

/**
 * Run all website intelligence agents in sequence.
 */
export async function runAllWebsiteIntelligence(): Promise<(AgentExecutionResult | null)[]> {
  const results: (AgentExecutionResult | null)[] = [];
  results.push(await runWebsiteUIVisibility());
  results.push(await runWebsiteBrokenLinks());
  results.push(await runWebsiteConversionFlow());
  results.push(await runWebsiteUXHeuristics());
  results.push(await runWebsiteBehavior());
  results.push(await runWebsiteStrategist());
  // Auto-repair runs last — processes issues found by other agents
  results.push(await runWebsiteAutoRepair());
  return results;
}

/* ── Admissions Intelligence Agents ────────────────────────────────── */

export async function runAdmissionsVisitorIdentity(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsVisitorIdentityAgent', runAdmissionsVisitorIdentityAgent);
}

export async function runAdmissionsVisitorActivity(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsVisitorActivityAgent', runAdmissionsVisitorActivityAgent);
}

export async function runAdmissionsConversationMemory(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsConversationMemoryAgent', runAdmissionsConversationMemoryAgent);
}

export async function runAdmissionsIntentDetection(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsIntentDetectionAgent', runAdmissionsIntentDetectionAgent);
}

export async function runAdmissionsConversationPlanning(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsConversationPlanningAgent', runAdmissionsConversationPlanningAgent);
}

export async function runAdmissionsKnowledge(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsKnowledgeAgent', runAdmissionsKnowledgeAgent);
}

export async function runAdmissionsProactiveOutreach(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsProactiveOutreachAgent', runAdmissionsProactiveOutreachAgent);
}

export async function runAdmissionsPageContext(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsPageContextAgent', runAdmissionsPageContextAgent);
}

export async function runAdmissionsConversationContinuity(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsConversationContinuityAgent', runAdmissionsConversationContinuityAgent);
}

export async function runAdmissionsHighIntentLead(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsHighIntentLeadAgent', runAdmissionsHighIntentLeadAgent);
}

export async function runAdmissionsCEORecognition(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsCEORecognitionAgent', runAdmissionsCEORecognitionAgent);
}

export async function runAdmissionsInsights(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsInsightsAgent', runAdmissionsInsightsAgent);
}

export async function runAdmissionsExecutiveUpdate(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsExecutiveUpdateAgent', runAdmissionsExecutiveUpdateAgent);
}

// --- Admissions Operations agent runners ---

export async function runAdmissionsDocumentDelivery(config?: Record<string, any>): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsDocumentDeliveryAgent', (id, cfg) => runAdmissionsDocumentDeliveryAgent(id, { ...cfg, ...config }));
}

export async function runAdmissionsEmail(config?: Record<string, any>): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsEmailAgent', (id, cfg) => runAdmissionsEmailAgent(id, { ...cfg, ...config }));
}

export async function runAdmissionsSMS(config?: Record<string, any>): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsSMSAgent', (id, cfg) => runAdmissionsSMSAgent(id, { ...cfg, ...config }));
}

export async function runAdmissionsAppointment(config?: Record<string, any>): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsAppointmentSchedulingAgent', (id, cfg) => runAdmissionsAppointmentAgent(id, { ...cfg, ...config }));
}

export async function runAdmissionsSynthflowCall(config?: Record<string, any>): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsSynthflowCallAgent', (id, cfg) => runAdmissionsSynthflowCallAgent(id, { ...cfg, ...config }));
}

export async function runAdmissionsCallGovernance(config?: Record<string, any>): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsCallGovernanceAgent', (id, cfg) => runAdmissionsCallGovernanceAgent(id, { ...cfg, ...config }));
}

export async function runAdmissionsCallCompliance(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsCallComplianceMonitor', runAdmissionsCallComplianceAgent);
}

export async function runAdmissionsCallback(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsCallbackManagementAgent', runAdmissionsCallbackAgent);
}

export async function runAdmissionsConversationTaskScan(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsConversationTaskMonitor', runAdmissionsConversationTaskMonitor);
}

export async function runAdmissionsAssistant(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsAssistantAgent', runAdmissionsAssistantAgent);
}

/**
 * Run all admissions intelligence agents in sequence.
 */
export async function runAllAdmissionsIntelligence(): Promise<(AgentExecutionResult | null)[]> {
  const results: (AgentExecutionResult | null)[] = [];
  results.push(await runAdmissionsVisitorIdentity());
  results.push(await runAdmissionsVisitorActivity());
  results.push(await runAdmissionsConversationMemory());
  results.push(await runAdmissionsIntentDetection());
  results.push(await runAdmissionsProactiveOutreach());
  results.push(await runAdmissionsConversationContinuity());
  results.push(await runAdmissionsHighIntentLead());
  results.push(await runAdmissionsCEORecognition());
  results.push(await runAdmissionsInsights());
  results.push(await runAdmissionsExecutiveUpdate());
  return results;
}

/* ── OpenClaw Autonomous Outreach Network Agents ──────────────────── */

export async function runOpenclawSupervisor(): Promise<AgentExecutionResult | null> {
  return runAgent('OpenclawSupervisorAgent', runOpenclawSupervisorAgent);
}

export async function runOpenclawMarketSignal(): Promise<AgentExecutionResult | null> {
  return runAgent('OpenclawMarketSignalAgent', runOpenclawMarketSignalAgent);
}

export async function runOpenclawConversationDetection(): Promise<AgentExecutionResult | null> {
  return runAgent('OpenclawConversationDetectionAgent', runOpenclawConversationDetectionAgent);
}

export async function runOpenclawContentResponse(): Promise<AgentExecutionResult | null> {
  return runAgent('OpenclawContentResponseAgent', runOpenclawContentResponseAgent);
}

export async function runOpenclawBrowserWorker(): Promise<AgentExecutionResult | null> {
  return runAgent('OpenclawBrowserWorkerAgent', runOpenclawBrowserWorkerAgent);
}

export async function runOpenclawLearningOptimization(): Promise<AgentExecutionResult | null> {
  return runAgent('OpenclawLearningOptimizationAgent', runOpenclawLearningOptimizationAgent);
}

export async function runOpenclawInfraMonitor(): Promise<AgentExecutionResult | null> {
  return runAgent('OpenclawInfraMonitorAgent', runOpenclawInfraMonitorAgent);
}

export async function runOpenclawTechResearch(): Promise<AgentExecutionResult | null> {
  return runAgent('OpenclawTechResearchAgent', runOpenclawTechResearchAgent);
}

export async function runOpenclawConversionDetection(): Promise<AgentExecutionResult | null> {
  return runAgent('OpenclawConversionDetectionAgent', runConversionDetectionAgent);
}

export async function runOpenclawConversationSync(): Promise<AgentExecutionResult | null> {
  return runAgent('OpenclawConversationSyncAgent', runConversationSyncAgent);
}

// ─── Strategy Architect Agents (16 departments) ──────────────────────────────

export async function runExecutiveStrategyArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('ExecutiveStrategyArchitect', runStrategyArchitectAgent);
}

export async function runGovernanceStrategyArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('GovernanceStrategyArchitect', runStrategyArchitectAgent);
}

export async function runStrategyFuturesArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('StrategyFuturesArchitect', runStrategyArchitectAgent);
}

export async function runFinanceIntelligenceArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('FinanceIntelligenceArchitect', runStrategyArchitectAgent);
}

export async function runOperationsOptimizationArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('OperationsOptimizationArchitect', runStrategyArchitectAgent);
}

export async function runOrchestrationEcosystemArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('OrchestrationEcosystemArchitect', runStrategyArchitectAgent);
}

export async function runInsightArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('InsightArchitect', runStrategyArchitectAgent);
}

export async function runPartnershipExpansionArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('PartnershipExpansionArchitect', runStrategyArchitectAgent);
}

export async function runGrowthExperimentArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('GrowthExperimentArchitect', runStrategyArchitectAgent);
}

export async function runMarketingAutomationArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('MarketingAutomationArchitect', runStrategyArchitectAgent);
}

export async function runAdmissionsConversionArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsConversionArchitect', runStrategyArchitectAgent);
}

export async function runInfrastructureEvolutionArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('InfrastructureEvolutionArchitect', runStrategyArchitectAgent);
}

export async function runPlatformInnovationArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('PlatformInnovationArchitect', runStrategyArchitectAgent);
}

export async function runLearningInnovationArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('LearningInnovationArchitect', runStrategyArchitectAgent);
}

export async function runStudentSuccessArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('StudentSuccessArchitect', runStrategyArchitectAgent);
}

export async function runAlumniNetworkArchitect(): Promise<AgentExecutionResult | null> {
  return runAgent('AlumniNetworkArchitect', runStrategyArchitectAgent);
}

// ─── Security Operations Agents (8) ──────────────────────────────────────────

export async function runSecurityDirector(): Promise<AgentExecutionResult | null> {
  return runAgent('SecurityDirectorAgent', runSecurityDirectorAgent);
}

export async function runSecretDetection(): Promise<AgentExecutionResult | null> {
  return runAgent('SecretDetectionAgent', runSecretDetectionAgent);
}

export async function runCodeSecurityAudit(): Promise<AgentExecutionResult | null> {
  return runAgent('CodeSecurityAuditAgent', runCodeSecurityAuditAgent);
}

export async function runDependencySecurity(): Promise<AgentExecutionResult | null> {
  return runAgent('DependencySecurityAgent', runDependencySecurityAgent);
}

export async function runRuntimeThreatMonitor(): Promise<AgentExecutionResult | null> {
  return runAgent('RuntimeThreatMonitorAgent', runRuntimeThreatMonitorAgent);
}

export async function runAccessControlGuardian(): Promise<AgentExecutionResult | null> {
  return runAgent('AccessControlGuardianAgent', runAccessControlGuardianAgent);
}

export async function runAiSafetyMonitor(): Promise<AgentExecutionResult | null> {
  return runAgent('AISafetyMonitorAgent', runAiSafetyMonitorAgent);
}

export async function runAgentBehaviorMonitor(): Promise<AgentExecutionResult | null> {
  return runAgent('AgentBehaviorMonitorAgent', runAgentBehaviorMonitorAgent);
}

export async function runAdmissionsKnowledgeSync(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsKnowledgeSyncAgent', runAdmissionsKnowledgeSyncAgent);
}

// ─── Department Super Agents ─────────────────────────────────────────────────

export async function runCampaignOpsSuperAgent(): Promise<AgentExecutionResult | null> {
  return runAgent('CampaignOpsSuperAgent', executeCampaignOpsSuperAgent);
}

export async function runLeadIntelligenceSuperAgent(): Promise<AgentExecutionResult | null> {
  return runAgent('LeadIntelligenceSuperAgent', executeLeadIntelligenceSuperAgent);
}

export async function runContentEngineSuperAgent(): Promise<AgentExecutionResult | null> {
  return runAgent('ContentEngineSuperAgent', executeContentEngineSuperAgent);
}

export async function runAnalyticsEngineSuperAgent(): Promise<AgentExecutionResult | null> {
  return runAgent('AnalyticsEngineSuperAgent', executeAnalyticsEngineSuperAgent);
}

export async function runSystemResilienceSuperAgent(): Promise<AgentExecutionResult | null> {
  return runAgent('SystemResilienceSuperAgent', executeSystemResilienceSuperAgent);
}

export async function runAdmissionsSuperAgent(): Promise<AgentExecutionResult | null> {
  return runAgent('AdmissionsSuperAgent', executeAdmissionsSuperAgent);
}

export async function runPartnershipSuperAgent(): Promise<AgentExecutionResult | null> {
  return runAgent('PartnershipSuperAgent', executePartnershipSuperAgent);
}

export async function runFinanceSuperAgent(): Promise<AgentExecutionResult | null> {
  return runAgent('FinanceSuperAgent', executeFinanceSuperAgent);
}
