/**
 * Predictive Engine — shows expected impact before executing any action.
 * Cumulative model: scores are 0-100% absolute, maturity levels are thresholds.
 */

interface PredictionInput {
  metrics: { requirements_coverage: number; system_readiness: number; quality_score: number };
  quality: Record<string, number>;
  maturity: { level: number; label: string };
  usability: { backend: string; frontend: string; agent: string };
}

interface QualityDelta { dimension: string; before: number; after: number; }

interface PredictionResult {
  action: string;
  description: string;
  // Absolute projected values (cumulative, not deltas)
  projected_readiness: number;
  projected_quality: number;
  readiness_before: number;
  quality_before: number;
  // Per-dimension quality changes
  quality_dimensions: QualityDelta[];
  // Maturity
  level_before: { level: number; label: string };
  level_after: { level: number; label: string };
  maturity_advances: boolean;
  // Components
  new_components: string[];
  // Risk
  risk_level: 'low' | 'medium' | 'high';
  risk_factors: string[];
  dependencies_met: boolean;
  missing_prerequisites: string[];
}

// Quality impact per action type (what each dimension becomes AFTER)
const QUALITY_IMPACTS: Record<string, Record<string, number>> = {
  backend_improvement: { determinism: 6, reliability: 5, observability: 2, ux_exposure: 0, automation: 0, production_readiness: 4 },
  frontend_exposure: { determinism: 0, reliability: 0, observability: 0, ux_exposure: 7, automation: 0, production_readiness: 3 },
  agent_enhancement: { determinism: 0, reliability: 2, observability: 1, ux_exposure: 0, automation: 7, production_readiness: 2 },
  requirement_implementation: { determinism: 4, reliability: 3, observability: 1, ux_exposure: 2, automation: 1, production_readiness: 3 },
  add_database: { determinism: 3, reliability: 6, observability: 0, ux_exposure: 0, automation: 0, production_readiness: 3 },
  improve_reliability: { determinism: 4, reliability: 7, observability: 2, ux_exposure: 0, automation: 0, production_readiness: 4 },
  verify_requirements: { determinism: 2, reliability: 2, observability: 1, ux_exposure: 1, automation: 0, production_readiness: 2 },
  optimize_performance: { determinism: 5, reliability: 4, observability: 3, ux_exposure: 2, automation: 1, production_readiness: 5 },
};

const ACTION_META: Record<string, { readiness_target: number; description: string; components: string[]; deps: string[]; risks: string[] }> = {
  backend_improvement: {
    readiness_target: 50,
    description: 'Build backend services and API routes — the foundation for all other system layers.',
    components: ['Service files', 'API routes', 'Controllers', 'Validation middleware', 'Error handling'],
    deps: [],
    risks: ['Ensure database schema is compatible', 'API endpoints must follow existing patterns'],
  },
  frontend_exposure: {
    readiness_target: 80,
    description: 'Create frontend UI components and pages so users can interact with this process.',
    components: ['React components', 'Page routes', 'Form handling', 'Data display', 'State management'],
    deps: ['Backend API must exist first'],
    risks: ['Frontend depends on API — build backend first if missing'],
  },
  agent_enhancement: {
    readiness_target: 100,
    description: 'Add AI agent automation to handle this process without manual intervention.',
    components: ['Agent class', 'Agent registration', 'Trigger logic', 'Decision rules', 'Memory/learning'],
    deps: ['Backend services must exist first'],
    risks: ['Agent must be registered in agentRegistry', 'Test agent logic before enabling in production'],
  },
  requirement_implementation: {
    readiness_target: 60,
    description: 'Map and implement unmapped requirements by extending existing backend, frontend, and database layers.',
    components: ['Service extensions', 'Route additions', 'Model updates', 'UI components', 'Validation logic'],
    deps: [],
    risks: ['Extend existing files — do not create duplicates', 'Verify requirement coverage after implementation'],
  },
  add_database: {
    readiness_target: 40,
    description: 'Add database models and data persistence layer for this process.',
    components: ['Sequelize models', 'Migrations', 'Model associations', 'Data validation'],
    deps: ['Backend services must exist first'],
    risks: ['Ensure model is compatible with existing schema'],
  },
  improve_reliability: {
    readiness_target: 70,
    description: 'Add error handling, input validation, retry logic, and transaction support.',
    components: ['Error handlers', 'Input validators', 'Retry logic', 'Transaction wrappers', 'Logging'],
    deps: [],
    risks: ['Do not change API contracts', 'Test error paths thoroughly'],
  },
  verify_requirements: {
    readiness_target: 50,
    description: 'Verify auto-matched requirements are actually implemented and fill any gaps found.',
    components: ['Verification checks', 'Gap implementations', 'Test coverage'],
    deps: [],
    risks: ['Manual review required — automated matching may have false positives'],
  },
  optimize_performance: {
    readiness_target: 90,
    description: 'Optimize query performance, add caching, pagination, and monitoring.',
    components: ['Database indexes', 'Query optimization', 'Caching layer', 'Pagination', 'Performance monitoring'],
    deps: [],
    risks: ['Measure before optimizing', 'Caching can cause stale data issues'],
  },
};

const MATURITY_LEVELS = [
  { level: 0, label: 'Not Started', threshold: 0 },
  { level: 1, label: 'Prototype', threshold: 10 },
  { level: 2, label: 'Functional', threshold: 50 },
  { level: 3, label: 'Production', threshold: 70 },
  { level: 4, label: 'Autonomous', threshold: 85 },
  { level: 5, label: 'Self-Optimizing', threshold: 95 },
];

function getMaturityFromReadiness(readiness: number): { level: number; label: string } {
  let result = MATURITY_LEVELS[0];
  for (const ml of MATURITY_LEVELS) {
    if (readiness >= ml.threshold) result = ml;
  }
  return { level: result.level, label: result.label };
}

export function predictImpact(input: PredictionInput, actionType: string): PredictionResult {
  const meta = ACTION_META[actionType];
  if (!meta) throw new Error(`Unknown action: ${actionType}`);

  const readinessBefore = input.metrics.system_readiness || 0;
  const projReadiness = Math.min(100, meta.readiness_target);

  // Quality: take max of current and projected per dimension
  const qImpact = QUALITY_IMPACTS[actionType] || {};
  const qualityDimensions: QualityDelta[] = Object.keys({ ...input.quality, ...qImpact }).map(dim => ({
    dimension: dim,
    before: input.quality[dim] || 0,
    after: Math.max(input.quality[dim] || 0, qImpact[dim] || 0),
  }));
  const qualityBefore = input.metrics.quality_score || 0;
  const projQuality = Math.round(qualityDimensions.reduce((s, d) => s + d.after, 0) * 100 / 60);

  // Maturity
  const levelBefore = input.maturity;
  const levelAfter = getMaturityFromReadiness(projReadiness);
  const advances = levelAfter.level > levelBefore.level;

  // Dependencies
  const missingPrereqs: string[] = [];
  let depsMet = true;
  for (const dep of meta.deps) {
    if (dep.includes('Backend') && input.usability.backend === 'missing') {
      missingPrereqs.push('Backend services must be built first');
      depsMet = false;
    }
  }

  return {
    action: actionType,
    description: meta.description,
    projected_readiness: projReadiness,
    projected_quality: projQuality,
    readiness_before: readinessBefore,
    quality_before: qualityBefore,
    quality_dimensions: qualityDimensions,
    level_before: levelBefore,
    level_after: levelAfter,
    maturity_advances: advances,
    new_components: meta.components,
    risk_level: missingPrereqs.length > 0 ? 'high' : meta.risks.length > 1 ? 'medium' : 'low',
    risk_factors: [...meta.risks, ...missingPrereqs.map(p => `BLOCKED: ${p}`)],
    dependencies_met: depsMet,
    missing_prerequisites: missingPrereqs,
  };
}

export { MATURITY_LEVELS };
