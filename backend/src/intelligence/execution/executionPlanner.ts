/**
 * Execution Planner
 * Generates dynamic execution plans from graph analysis + gap detection.
 * Replaces static templates with graph-driven, dependency-aware steps.
 */
import { ContextGraph } from '../graph/graphTypes';
import {
  getUnconnectedAPIs, getOrphanServices, getDataFlowIssues,
  getAgentIntegrationGaps, getFailingPaths, getSlowPaths,
  getUnusedComponents, getProcessFlow,
} from '../graph/graphQueryEngine';

export interface ExecutionStep {
  step: number;
  key: string;
  label: string;
  impact: string;
  depends_on: string;
  fixes: string[];
  enables: string[];
  blocked: boolean;
  block_reason?: string;
  prompt_target: string;
  requirements_covered: string[];
  status: 'pending' | 'verified' | 'partial' | 'failed' | 'needs_refinement';
  follow_up_prompt?: string;
  confidence_score: number;
}

/**
 * Generate a dynamic execution plan from graph analysis.
 */
export function regenerateExecutionPlan(
  graph: ContextGraph, processId: string, verifiedStepKeys?: Set<string>
): ExecutionStep[] {
  const steps: ExecutionStep[] = [];
  let stepNum = 1;
  const verified = verifiedStepKeys || new Set<string>();

  // Analyze current state from graph
  const features = graph.getConnectedNodes(processId, 'contains');
  const allReqs = features.flatMap(f => graph.getConnectedNodes(f.id, 'contains')).filter(n => n.type === 'requirement');
  const allFiles = allReqs.flatMap(r => graph.getConnectedNodes(r.id, 'matched_to'));
  const gaps = graph.getNodesByType('gap');

  const hasBackend = allFiles.some(f => f.type === 'service');
  const hasModels = allFiles.some(f => f.type === 'db_model');
  const hasFrontend = allFiles.some(f => f.metadata?.path?.includes('.tsx'));
  const hasAgents = allFiles.some(f => f.type === 'agent');
  const hasRoutes = allFiles.some(f => f.type === 'api_route');

  // Get relational issues
  const disconnectedAPIs = getUnconnectedAPIs(graph);
  const orphanServices = getOrphanServices(graph);
  const dataFlowIssues = getDataFlowIssues(graph);
  const agentGaps = getAgentIntegrationGaps(graph);
  const failingPaths = getFailingPaths(graph);
  const slowPaths = getSlowPaths(graph);

  // === FOUNDATION LAYER ===
  if (!hasBackend) {
    const key = 'build_backend';
    steps.push({
      step: stepNum++, key, label: 'Build Backend Services',
      impact: '+50% readiness', depends_on: 'None — Foundation',
      fixes: ['Backend Missing', 'API Routes Missing'],
      enables: ['API endpoints', 'Frontend integration', 'Agent automation'],
      blocked: false, prompt_target: 'backend_improvement',
      requirements_covered: allReqs.filter(r => r.status === 'missing').slice(0, 5).map(r => r.metadata?.key || r.id),
      status: verified.has(key) ? 'verified' : 'pending',
      confidence_score: 0.9,
    });
  }

  if (!hasModels) {
    const key = 'add_database';
    steps.push({
      step: stepNum++, key, label: 'Add Database Models',
      impact: '+20% reliability', depends_on: 'Backend services',
      fixes: ['Data Layer Missing'], enables: ['Persistent storage', 'Data integrity'],
      blocked: !hasBackend, block_reason: !hasBackend ? 'Requires: Backend services' : undefined,
      prompt_target: 'backend_improvement', requirements_covered: [],
      status: verified.has(key) ? 'verified' : 'pending',
      confidence_score: 0.85,
    });
  }

  if (!hasFrontend) {
    const key = 'add_frontend';
    steps.push({
      step: stepNum++, key, label: 'Create Frontend UI',
      impact: '+30% readiness', depends_on: 'Backend API',
      fixes: ['Frontend Missing'], enables: ['User interaction', 'UX exposure'],
      blocked: !hasBackend, block_reason: !hasBackend ? 'Requires: Backend API' : undefined,
      prompt_target: 'frontend_exposure', requirements_covered: [],
      status: verified.has(key) ? 'verified' : 'pending',
      confidence_score: 0.85,
    });
  }

  // === CONNECTION LAYER ===
  if (disconnectedAPIs.length > 0 && hasBackend) {
    const key = 'connect_api_service';
    steps.push({
      step: stepNum++, key, label: 'Connect API Routes to Services',
      impact: '+10% reliability', depends_on: 'Backend services',
      fixes: [`${disconnectedAPIs.length} disconnected API routes`],
      enables: ['Data flow', 'API functionality'],
      blocked: false, prompt_target: 'backend_improvement', requirements_covered: [],
      status: verified.has(key) ? 'verified' : 'pending',
      confidence_score: 0.8,
    });
  }

  if (dataFlowIssues.length > 0 && hasBackend) {
    const key = 'connect_service_db';
    steps.push({
      step: stepNum++, key, label: 'Wire Services to Database',
      impact: '+15% reliability', depends_on: 'Backend + Database',
      fixes: [`${dataFlowIssues.length} services without data models`],
      enables: ['Data persistence', 'Query capability'],
      blocked: !hasModels, block_reason: !hasModels ? 'Requires: Database models' : undefined,
      prompt_target: 'backend_improvement', requirements_covered: [],
      status: verified.has(key) ? 'verified' : 'pending',
      confidence_score: 0.75,
    });
  }

  // === AUTOMATION LAYER ===
  if (!hasAgents && hasBackend) {
    const key = 'add_agents';
    steps.push({
      step: stepNum++, key, label: 'Add AI Agent Automation',
      impact: '+20% automation', depends_on: 'Backend services',
      fixes: ['Automation Gap'], enables: ['Autonomous operation', 'Scheduled tasks'],
      blocked: false, prompt_target: 'agent_enhancement', requirements_covered: [],
      status: verified.has(key) ? 'verified' : 'pending',
      confidence_score: 0.7,
    });
  }

  // === QUALITY LAYER ===
  if (failingPaths.length > 0) {
    const key = 'fix_failures';
    steps.push({
      step: stepNum++, key, label: 'Fix Failing Components',
      impact: '+15% reliability', depends_on: 'Implementation exists',
      fixes: failingPaths.map(n => `${n.label}: ${n.metadata?.failure_rate || 0}% failure rate`),
      enables: ['Production stability'],
      blocked: false, prompt_target: 'backend_improvement', requirements_covered: [],
      status: verified.has(key) ? 'verified' : 'pending',
      confidence_score: 0.7,
    });
  }

  if (hasBackend && hasFrontend) {
    const key = 'add_monitoring';
    steps.push({
      step: stepNum++, key, label: 'Add Monitoring & Logging',
      impact: '+15% quality', depends_on: 'Backend services',
      fixes: ['No observability'], enables: ['Error detection', 'Performance tracking'],
      blocked: false, prompt_target: 'monitoring_gap', requirements_covered: [],
      status: verified.has(key) ? 'verified' : 'pending',
      confidence_score: 0.6,
    });
  }

  // === VERIFICATION ===
  const unmatchedReqs = allReqs.filter(r => r.status === 'missing');
  if (unmatchedReqs.length > 0 && hasBackend) {
    steps.push({
      step: stepNum++, key: 'verify_requirements', label: 'Verify Remaining Requirements',
      impact: '+verified confidence', depends_on: 'Implementation exists',
      fixes: ['Unverified requirements'], enables: ['Accurate tracking'],
      blocked: false, prompt_target: 'backend_improvement',
      requirements_covered: unmatchedReqs.slice(0, 5).map(r => r.metadata?.key || r.id),
      status: 'pending', confidence_score: 0.5,
    });
  }

  return steps;
}

/**
 * Generate a follow-up prompt for an incomplete step.
 */
export function generateFollowUpPrompt(step: ExecutionStep, discrepancies: string[]): string {
  return `You are operating in Claude Code PLAN MODE.

# FOLLOW-UP: ${step.label}

The previous execution was incomplete. The following issues were detected:

${discrepancies.map(d => `- ${d}`).join('\n')}

# WHAT NEEDS TO BE FIXED

${step.fixes.map(f => `- ${f}`).join('\n')}

# CONSTRAINTS
- Fix ONLY the issues listed above
- DO NOT break existing functionality
- All changes must be additive

# VALIDATION REPORT (REQUIRED AT END)

After fixing, output:

\`\`\`
VALIDATION REPORT

Files Created:
- path/to/file.ts

Files Modified:
- path/to/file.ts

Routes:
- GET /api/...

Database:
- TableName (if any)

Status: COMPLETE
\`\`\`
`;
}
