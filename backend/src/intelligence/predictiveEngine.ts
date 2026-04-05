/**
 * Predictive Engine — shows expected impact before executing any action.
 */

interface PredictionInput {
  metrics: { requirements_coverage: number; system_readiness: number; quality_score: number };
  quality: Record<string, number>;
  maturity: { level: number; label: string };
  usability: { backend: string; frontend: string; agent: string };
}

interface PredictionResult {
  action: string;
  description: string;
  readiness_delta: number;
  quality_delta: number;
  projected_readiness: number;
  projected_quality: number;
  level_before: { level: number; label: string };
  level_after: { level: number; label: string };
  new_components: string[];
  risk_level: 'low' | 'medium' | 'high';
  risk_factors: string[];
  dependencies_met: boolean;
  missing_prerequisites: string[];
}

const ACTION_IMPACTS: Record<string, { readiness: number; quality: number; description: string; components: string[]; deps: string[]; risks: string[] }> = {
  backend_improvement: {
    readiness: 50, quality: 20,
    description: 'Build backend services and API routes for this process.',
    components: ['Service files', 'API routes', 'Controllers', 'Middleware'],
    deps: [],
    risks: ['Ensure database schema is compatible', 'API endpoints must follow existing patterns'],
  },
  frontend_exposure: {
    readiness: 30, quality: 10,
    description: 'Create frontend UI components and pages for user interaction.',
    components: ['React components', 'Page routes', 'UI forms', 'Data display'],
    deps: ['Backend API must exist'],
    risks: ['Frontend depends on API — build backend first if missing'],
  },
  agent_enhancement: {
    readiness: 20, quality: 30,
    description: 'Add AI agent automation for this process.',
    components: ['Agent class', 'Agent registration', 'Trigger logic', 'Decision rules'],
    deps: ['Backend services must exist'],
    risks: ['Agent must be registered in agentRegistry', 'Test agent logic before enabling'],
  },
};

const MATURITY_LEVELS = [
  { level: 0, label: 'Not Started' },
  { level: 1, label: 'Prototype' },
  { level: 2, label: 'Functional' },
  { level: 3, label: 'Production' },
  { level: 4, label: 'Autonomous' },
  { level: 5, label: 'Self-Optimizing' },
];

function projectMaturity(readiness: number, hasBackend: boolean, hasFrontend: boolean, hasAgents: boolean, quality: number): { level: number; label: string } {
  if (hasBackend && hasFrontend && hasAgents && readiness > 95 && quality > 70) return MATURITY_LEVELS[5];
  if (hasBackend && hasFrontend && hasAgents && readiness > 85) return MATURITY_LEVELS[4];
  if (hasBackend && hasFrontend && readiness > 70) return MATURITY_LEVELS[3];
  if (hasBackend && readiness > 50) return MATURITY_LEVELS[2];
  if (readiness > 0) return MATURITY_LEVELS[1];
  return MATURITY_LEVELS[0];
}

export function predictImpact(input: PredictionInput, actionType: string): PredictionResult {
  const impact = ACTION_IMPACTS[actionType];
  if (!impact) throw new Error(`Unknown action: ${actionType}`);

  const projReadiness = Math.min(100, (input.metrics.system_readiness || 0) + impact.readiness);
  const projQuality = Math.min(100, (input.metrics.quality_score || 0) + impact.quality);

  // Check dependencies
  const missingPrereqs: string[] = [];
  let depsMet = true;
  for (const dep of impact.deps) {
    if (dep.includes('Backend') && input.usability.backend === 'missing') {
      missingPrereqs.push('Backend services not yet built');
      depsMet = false;
    }
  }

  // Project new maturity
  const hasBackendAfter = input.usability.backend !== 'missing' || actionType === 'backend_improvement';
  const hasFrontendAfter = input.usability.frontend !== 'missing' || actionType === 'frontend_exposure';
  const hasAgentsAfter = input.usability.agent !== 'missing' || actionType === 'agent_enhancement';
  const levelAfter = projectMaturity(projReadiness, hasBackendAfter, hasFrontendAfter, hasAgentsAfter, projQuality);

  return {
    action: actionType,
    description: impact.description,
    readiness_delta: impact.readiness,
    quality_delta: impact.quality,
    projected_readiness: projReadiness,
    projected_quality: projQuality,
    level_before: input.maturity,
    level_after: levelAfter,
    new_components: impact.components,
    risk_level: missingPrereqs.length > 0 ? 'high' : impact.risks.length > 1 ? 'medium' : 'low',
    risk_factors: [...impact.risks, ...missingPrereqs.map(p => `BLOCKED: ${p}`)],
    dependencies_met: depsMet,
    missing_prerequisites: missingPrereqs,
  };
}
