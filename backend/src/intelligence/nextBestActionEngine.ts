/**
 * Next Best Action Engine
 * Generates dynamic, project-specific execution plans based on real system state.
 * Actions are regenerated after every sync — completed steps disappear, new ones emerge.
 */

export interface ExecutionAction {
  step: number;
  key: string;
  label: string;
  impact: string;
  depends_on: string;
  fixes: string[];
  enables: string[];
  blocked: boolean;
  block_reason?: string;
  requirements_covered: string[];
  prompt_target: string; // maps to promptGenerator target
}

interface SystemState {
  hasBackend: boolean;
  hasFrontend: boolean;
  hasAgents: boolean;
  hasModels: boolean;
  backendCount: number;
  frontendCount: number;
  agentCount: number;
  modelCount: number;
  reqCoverage: number;
  readiness: number;
  qualityScore: number;
  maturityLevel: number;
  gapTypes: string[]; // 'system' | 'quality' | 'requirement'
  unverifiedCount: number;
  verifiedCount: number;
  totalRequirements: number;
}

// All possible actions with conditions
const ACTION_TEMPLATES = [
  {
    key: 'build_backend',
    label: 'Build Backend Services',
    impact: '+50% readiness',
    depends_on: 'None — Foundation',
    fixes: ['Backend Missing', 'API Routes Missing'],
    enables: ['API endpoints', 'Frontend integration', 'Agent automation'],
    prompt_target: 'backend_improvement',
    condition: (s: SystemState) => !s.hasBackend,
    priority: 100,
  },
  {
    key: 'add_database',
    label: 'Add Database Models',
    impact: '+20% reliability',
    depends_on: 'Backend services',
    fixes: ['Data Layer Missing', 'Low reliability'],
    enables: ['Persistent storage', 'Data integrity'],
    prompt_target: 'backend_improvement',
    condition: (s: SystemState) => !s.hasModels && s.hasBackend,
    blockedIf: (s: SystemState) => !s.hasBackend,
    priority: 90,
  },
  {
    key: 'add_frontend',
    label: 'Create Frontend UI',
    impact: '+30% readiness',
    depends_on: 'Backend API',
    fixes: ['Frontend Missing', 'No user interface'],
    enables: ['User interaction', 'UX exposure'],
    prompt_target: 'frontend_exposure',
    condition: (s: SystemState) => !s.hasFrontend,
    blockedIf: (s: SystemState) => !s.hasBackend,
    priority: 80,
  },
  {
    key: 'add_agents',
    label: 'Add AI Agent Automation',
    impact: '+20% automation',
    depends_on: 'Backend services',
    fixes: ['Automation Gap', 'Manual processes'],
    enables: ['Autonomous operation', 'Scheduled tasks'],
    prompt_target: 'agent_enhancement',
    condition: (s: SystemState) => !s.hasAgents,
    blockedIf: (s: SystemState) => !s.hasBackend,
    priority: 70,
  },
  {
    key: 'add_monitoring',
    label: 'Add Monitoring & Logging',
    impact: '+15% quality',
    depends_on: 'Backend services',
    fixes: ['No observability', 'No error tracking'],
    enables: ['Error detection', 'Performance tracking', 'Production readiness'],
    prompt_target: 'monitoring_gap',
    condition: (s: SystemState) => s.hasBackend && s.qualityScore < 50 && s.gapTypes.includes('quality'),
    blockedIf: (s: SystemState) => !s.hasBackend,
    priority: 60,
  },
  {
    key: 'improve_reliability',
    label: 'Improve Reliability & Error Handling',
    impact: '+15% quality',
    depends_on: 'Backend + Database',
    fixes: ['Low reliability', 'Missing error handling'],
    enables: ['Production stability', 'Retry logic'],
    prompt_target: 'backend_improvement',
    condition: (s: SystemState) => s.hasBackend && s.qualityScore < 60,
    priority: 55,
  },
  {
    key: 'enhance_agents',
    label: 'Enhance Agent Intelligence',
    impact: '+10% automation, +10% quality',
    depends_on: 'Existing agents',
    fixes: ['Agent capabilities limited'],
    enables: ['Smarter automation', 'Self-healing'],
    prompt_target: 'agent_enhancement',
    condition: (s: SystemState) => s.hasAgents && s.agentCount > 0 && s.qualityScore < 80,
    priority: 40,
  },
  {
    key: 'optimize_performance',
    label: 'Optimize System Performance',
    impact: '+10% quality',
    depends_on: 'All layers built',
    fixes: ['Performance gaps'],
    enables: ['Scale readiness', 'Production deployment'],
    prompt_target: 'backend_improvement',
    condition: (s: SystemState) => s.hasBackend && s.hasFrontend && s.readiness >= 80 && s.qualityScore < 90,
    priority: 30,
  },
  {
    key: 'verify_requirements',
    label: 'Verify Unverified Requirements',
    impact: '+verified confidence',
    depends_on: 'Implementation exists',
    fixes: ['Unverified auto-matches'],
    enables: ['Accurate completion tracking', 'Trust in metrics'],
    prompt_target: 'backend_improvement',
    condition: (s: SystemState) => s.unverifiedCount > 0 && s.hasBackend,
    priority: 50,
  },
];

export function generateExecutionPlan(state: SystemState): ExecutionAction[] {
  const actions: ExecutionAction[] = [];
  let step = 1;

  // Filter to applicable actions, sort by priority
  const applicable = ACTION_TEMPLATES
    .filter(t => t.condition(state))
    .sort((a, b) => b.priority - a.priority);

  for (const template of applicable) {
    const blocked = template.blockedIf ? template.blockedIf(state) : false;
    actions.push({
      step: step++,
      key: template.key,
      label: template.label,
      impact: template.impact,
      depends_on: template.depends_on,
      fixes: template.fixes,
      enables: template.enables,
      blocked,
      block_reason: blocked ? `Requires: ${template.depends_on}` : undefined,
      requirements_covered: [], // filled by caller if needed
      prompt_target: template.prompt_target,
    });
  }

  // If no actions needed, system is complete
  if (actions.length === 0 && state.readiness >= 100 && state.qualityScore >= 90) {
    // No actions — system is mature
  }

  return actions;
}
