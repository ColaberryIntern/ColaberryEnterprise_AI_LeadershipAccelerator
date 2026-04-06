/**
 * Reconciliation Engine
 * Orchestrates the full post-execution sync:
 * Parse → Verify → Rebuild Graph → Recalculate Requirements → Regenerate Plan
 */
import { parseValidationReport, ParsedValidation } from './validationParser';
import { verifyAgainstRepo, VerificationResult } from './realityVerifier';
import { recalculateRequirementStates } from './requirementsEngine';
import { regenerateExecutionPlan, ExecutionStep } from './executionPlanner';
import { buildProcessGraph } from '../graph/graphBuilder';
import { ContextGraph } from '../graph/graphTypes';

export interface ReconciliationResult {
  validation: ParsedValidation;
  verification: VerificationResult;
  requirements: { verified: number; auto_matched: number; planned: number; unmapped: number };
  executionPlan: ExecutionStep[];
  systemState: {
    hasBackend: boolean;
    hasFrontend: boolean;
    hasAgents: boolean;
    hasModels: boolean;
  };
  graphSummary: { nodes: number; edges: number };
  discrepancies: string[];
  followUpNeeded: boolean;
  followUpPrompt?: string;
}

/**
 * Full reconciliation after a Claude Code execution.
 * This is the main entry point — called from the sync endpoint.
 */
export async function reconcileAfterExecution(
  enrollmentId: string, projectId: string, capabilityId: string, validationReportText: string
): Promise<ReconciliationResult> {
  // 1. Parse validation report
  const validation = parseValidationReport(validationReportText);

  // 2. Sync GitHub file tree (refresh from repo)
  try {
    const { syncFileTree } = await import('../../services/githubService');
    await syncFileTree(enrollmentId);
  } catch { /* non-critical — continue with existing tree */ }

  // 3. Verify claims against actual repo
  const verification = await verifyAgainstRepo(enrollmentId, validation);

  // 4. Rebuild context graph
  let graph: ContextGraph;
  try {
    graph = await buildProcessGraph(projectId, capabilityId);
  } catch {
    graph = new ContextGraph();
  }

  // 5. Recalculate requirement states
  const allVerifiedFiles = [...validation.filesCreated, ...validation.filesModified];
  const requirements = await recalculateRequirementStates(projectId, graph, allVerifiedFiles);

  // 6. Derive system state from graph
  const fileNodes = [...graph.nodes.values()].filter(n => ['service', 'api_route', 'db_model', 'agent', 'file'].includes(n.type));
  const systemState = {
    hasBackend: fileNodes.some(f => f.type === 'service'),
    hasFrontend: fileNodes.some(f => f.metadata?.path?.includes('.tsx')),
    hasAgents: fileNodes.some(f => f.type === 'agent'),
    hasModels: fileNodes.some(f => f.type === 'db_model'),
  };

  // 7. Regenerate execution plan
  const verifiedSteps = new Set<string>();
  if (systemState.hasBackend) verifiedSteps.add('build_backend');
  if (systemState.hasModels) verifiedSteps.add('add_database');
  if (systemState.hasFrontend) verifiedSteps.add('add_frontend');
  if (systemState.hasAgents) verifiedSteps.add('add_agents');

  const executionPlan = regenerateExecutionPlan(graph, `proc:${capabilityId}`, verifiedSteps);

  // 8. Determine if follow-up is needed
  const followUpNeeded = verification.discrepancies.length > 0 || validation.status !== 'COMPLETE';
  let followUpPrompt: string | undefined;
  if (followUpNeeded && executionPlan.length > 0) {
    const { generateFollowUpPrompt } = await import('./executionPlanner');
    followUpPrompt = generateFollowUpPrompt(executionPlan[0], verification.discrepancies);
  }

  return {
    validation,
    verification,
    requirements,
    executionPlan,
    systemState,
    graphSummary: { nodes: graph.nodes.size, edges: graph.edges.length },
    discrepancies: verification.discrepancies,
    followUpNeeded,
    followUpPrompt,
  };
}
