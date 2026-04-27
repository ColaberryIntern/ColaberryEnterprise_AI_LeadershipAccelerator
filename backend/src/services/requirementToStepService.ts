/**
 * Requirement-to-Step Transformation Service
 *
 * Converts mode-filtered requirements + gaps into a prioritized execution plan.
 * Each step is derived from actual requirements, not hardcoded templates.
 *
 * Flow: Mode → Filter Requirements → Categorize → Group → Prioritize → Plan
 */

// ---------------------------------------------------------------------------
// Types (compatible with ExecutionAction in nextBestActionEngine)
// ---------------------------------------------------------------------------

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
  requirements_covered: string[];
  prompt_target: string;
  basedOn: string[];  // requirement texts that drove this step
  category: StepCategory;
  priorityScore: number;
  /** Tag carried to the frontend so it can defensively filter out completed work. */
  status: 'pending';
}

export type StepCategory = 'backend' | 'frontend' | 'agent' | 'data' | 'integration' | 'quality' | 'intelligence';

type Mode = 'mvp' | 'production' | 'enterprise' | 'autonomous';

interface RequirementInput {
  requirement_key: string;
  requirement_text: string;
  status: string;
  modes?: string[];
}

interface GapInput {
  text: string;
  key: string;
  gap_type: string;
}

interface SystemContext {
  hasBackend: boolean;
  hasFrontend: boolean;
  hasAgents: boolean;
  hasModels: boolean;
  reqCoverage: number;
  qualityScore: number;
  // Project-level layer detection — if the PROJECT has these layers, don't recommend building them
  projectHasBackend?: boolean;
  projectHasFrontend?: boolean;
  projectHasAgents?: boolean;
  projectHasModels?: boolean;
  // Full repo file tree for cross-referencing what's already built
  repoFileTree?: string[];
}

// ---------------------------------------------------------------------------
// Repo Cross-Reference: check if a requirement is likely already implemented
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'are', 'and', 'or', 'for', 'to', 'in', 'of', 'on', 'with', 'that', 'this', 'be', 'as', 'by', 'at', 'it', 'must', 'should', 'will', 'can', 'all', 'each', 'from', 'have', 'has', 'not', 'use', 'using', 'need', 'ensure', 'provide', 'support', 'system', 'create', 'manage']);

function isLikelyCoveredByRepo(reqText: string, repoFiles: string[]): boolean {
  if (!repoFiles || repoFiles.length === 0) return false;
  const lower = (reqText || '').toLowerCase();
  // Extract meaningful keywords from requirement (3+ chars, not stopwords)
  const reqKeywords = lower.split(/\W+/).filter(w => w.length > 3 && !STOPWORDS.has(w));
  if (reqKeywords.length === 0) return false;

  // Check if repo filenames contain enough matching keywords
  const fileNames = repoFiles.map(f => (f.split('/').pop() || '').toLowerCase().replace(/\.(ts|tsx|js|jsx)$/, ''));
  const fileTokens = new Set(fileNames.flatMap(n => n.split(/[_\-./]+/).filter(t => t.length > 3)));

  // Count keyword overlaps
  const matchedKeywords = reqKeywords.filter(kw =>
    fileTokens.has(kw) || [...fileTokens].some(ft => (ft.length > 4 && kw.length > 4 && (ft.includes(kw) || kw.includes(ft))))
  );

  // If 40%+ of requirement keywords match file tokens, it's likely covered
  const ratio = matchedKeywords.length / reqKeywords.length;
  return ratio >= 0.4 && matchedKeywords.length >= 2;
}

// ---------------------------------------------------------------------------
// Keyword → Category Classification
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<StepCategory, string[]> = {
  backend: ['api', 'service', 'endpoint', 'server', 'route', 'controller', 'middleware', 'database', 'query', 'schema', 'migration', 'model', 'orm', 'rest', 'graphql', 'webhook', 'cron', 'job'],
  frontend: ['ui', 'form', 'dashboard', 'page', 'component', 'display', 'layout', 'navigation', 'button', 'input', 'table', 'chart', 'view', 'modal', 'responsive'],
  agent: ['agent', 'automation', 'bot', 'autonomous', 'orchestrat', 'scheduler', 'trigger', 'event-driven'],
  data: ['data', 'storage', 'backup', 'replication', 'etl', 'extract', 'transform', 'load', 'warehouse', 'pipeline', 'sync', 'import', 'export'],
  integration: ['integration', 'connect', 'external', 'third-party', '3rd party', 'api key', 'oauth', 'sso', 'webhook', 'sync'],
  quality: ['error', 'retry', 'validation', 'test', 'logging', 'monitoring', 'alert', 'health check', 'uptime', 'reliability', 'fault', 'recovery', 'backup'],
  intelligence: ['optimize', 'predict', 'learn', 'ml', 'machine learning', 'ai', 'recommendation', 'personalization', 'adaptive', 'feedback', 'analytics', 'insight', 'score', 'rank'],
};

function classifyRequirement(text: string): StepCategory {
  const lower = (text || '').toLowerCase();
  let bestCategory: StepCategory = 'backend'; // default
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = keywords.filter(kw => lower.includes(kw)).length;
    if (hits > bestScore) {
      bestScore = hits;
      bestCategory = category as StepCategory;
    }
  }

  return bestCategory;
}

// ---------------------------------------------------------------------------
// Mode Multipliers
// ---------------------------------------------------------------------------

const MODE_MULTIPLIERS: Record<Mode, Record<StepCategory, number>> = {
  mvp: { backend: 3, frontend: 2, agent: 1, data: 1, integration: 1, quality: 0.5, intelligence: 0.5 },
  production: { backend: 2, frontend: 2, agent: 2, data: 2, integration: 2, quality: 2, intelligence: 1 },
  enterprise: { backend: 1.5, frontend: 1.5, agent: 2, data: 3, integration: 2, quality: 3, intelligence: 2 },
  autonomous: { backend: 1, frontend: 1, agent: 3, data: 2, integration: 2, quality: 2, intelligence: 4 },
};

const BASE_PRIORITY: Record<StepCategory, number> = {
  backend: 100,
  data: 85,
  frontend: 75,
  agent: 65,
  integration: 55,
  quality: 45,
  intelligence: 35,
};

// ---------------------------------------------------------------------------
// Step Grouping Labels
// ---------------------------------------------------------------------------

const CATEGORY_STEP_CONFIG: Record<StepCategory, { label: string; impact: string; depends_on: string; enables: string[]; prompt_target: string }> = {
  backend: { label: 'Build Backend Services', impact: '+readiness, +API coverage', depends_on: 'None — Foundation', enables: ['API endpoints', 'Data flow', 'Frontend integration'], prompt_target: 'backend_improvement' },
  frontend: { label: 'Create Frontend UI', impact: '+UX exposure, +readiness', depends_on: 'Backend services', enables: ['User interaction', 'Dashboard visibility'], prompt_target: 'frontend_exposure' },
  agent: { label: 'Add Agent Automation', impact: '+automation, +intelligence', depends_on: 'Backend services', enables: ['Autonomous operations', 'Smart workflows'], prompt_target: 'add_agents' },
  data: { label: 'Build Data Layer', impact: '+data integrity, +storage', depends_on: 'Backend services', enables: ['Analytics', 'Reporting', 'Data-driven features'], prompt_target: 'add_database' },
  integration: { label: 'Add External Integrations', impact: '+connectivity, +ecosystem', depends_on: 'Backend + Data layer', enables: ['Third-party data flow', 'Extended capabilities'], prompt_target: 'backend_improvement' },
  quality: { label: 'Improve Reliability & Quality', impact: '+quality score, +stability', depends_on: 'Core implementation', enables: ['Production confidence', 'Error resilience'], prompt_target: 'improve_reliability' },
  intelligence: { label: 'Add Intelligence & Optimization', impact: '+AI maturity, +automation', depends_on: 'Data + Agent layer', enables: ['Predictive capabilities', 'Self-optimization'], prompt_target: 'optimize_performance' },
};

// ---------------------------------------------------------------------------
// Main: Generate Steps from Requirements
// ---------------------------------------------------------------------------

export function generateStepsFromRequirements(options: {
  requirements: RequirementInput[];
  gaps: GapInput[];
  mode: Mode;
  systemContext: SystemContext;
  completedSteps?: string[];
  maxSteps?: number;
  /** Categories of work already done (from build history / validation reports) */
  builtCategories?: Set<string>;
}): ExecutionStep[] {
  const { requirements, gaps, mode, systemContext, completedSteps = [], maxSteps = 8, builtCategories } = options;
  const completed = new Set(completedSteps);

  // 1. Filter to unfinished requirements only
  const repoFiles = systemContext.repoFileTree || [];
  const unfinished = requirements.filter(r => {
    if (r.status !== 'unmatched' && r.status !== 'not_started' && r.status !== 'partial') return false;
    // Cross-reference with repo: if the requirement text matches existing files, skip it
    if (repoFiles.length > 0 && isLikelyCoveredByRepo(r.requirement_text, repoFiles)) return false;
    // Skip fragment requirements that aren't real (bold labels, env vars, step descriptions)
    const text = (r.requirement_text || '').trim();
    if (text.startsWith('**Step') || text.startsWith('`') || text.length < 20) return false;
    if (/^(NODE_ENV|PORT|DATABASE_URL|JWT_SECRET)/i.test(text)) return false;
    // Skip if project has high coverage and this is a very generic requirement
    const totalReqs = requirements.length;
    const matchedReqs = requirements.filter(rr => rr.status === 'matched' || rr.status === 'verified' || rr.status === 'auto_verified').length;
    const coveragePct = totalReqs > 0 ? (matchedReqs / totalReqs) * 100 : 0;
    if (coveragePct >= 80 && text.split(/\s+/).length < 8) return false; // very short + high coverage = likely covered
    return true;
  });

  // Check for system-level gaps (missing layers) — these ALWAYS generate steps
  const systemGaps = gaps.filter(g => g.gap_type === 'system');
  const qualityGaps = gaps.filter(g => g.gap_type === 'quality');
  console.log(`[StepService] Input: ${requirements.length} reqs, ${unfinished.length} unfinished, ${systemGaps.length} system gaps, ${qualityGaps.length} quality gaps, mode=${mode}`);
  if (unfinished.length === 0 && gaps.length === 0) { console.log('[StepService] Empty: no unfinished reqs or gaps'); return []; }

  // 2. Classify each requirement
  const classified = unfinished.map(r => ({
    ...r,
    category: classifyRequirement(r.requirement_text),
  }));

  // 3. Group by category
  const groups = new Map<StepCategory, typeof classified>();
  for (const r of classified) {
    const group = groups.get(r.category) || [];
    group.push(r);
    groups.set(r.category, group);
  }

  // Also add groups from system gaps
  for (const gap of gaps) {
    if (gap.gap_type === 'system') {
      const cat: StepCategory = gap.key === 'SYS-BE' ? 'backend' : gap.key === 'SYS-FE' ? 'frontend' : 'data';
      if (!groups.has(cat)) groups.set(cat, []);
    }
    if (gap.gap_type === 'quality') {
      if (!groups.has('quality')) groups.set('quality', []);
    }
  }

  // 4. Build steps from groups
  const multipliers = MODE_MULTIPLIERS[mode] || MODE_MULTIPLIERS.production;
  const steps: ExecutionStep[] = [];

  for (const [category, reqs] of groups) {
    const config = CATEGORY_STEP_CONFIG[category];
    const basePriority = BASE_PRIORITY[category];
    const multiplier = multipliers[category] || 1;
    const priorityScore = Math.round(basePriority * multiplier + reqs.length * 2);

    // Map to standard keys for completed_steps compatibility
    const keyMap: Record<StepCategory, string> = {
      backend: 'build_backend', data: 'add_database', frontend: 'add_frontend',
      agent: 'add_agents', integration: 'build_backend', quality: 'improve_reliability',
      intelligence: 'optimize_performance',
    };
    const stepKey = keyMap[category];

    // A completed step is a completed step. System gaps generate their own
    // steps via the systemGaps loop above — they should never resurrect a
    // finished requirement-level step.
    if (completed.has(stepKey)) continue;

    // Skip "Build X" steps if the project already has that layer in the repo
    // This prevents recommending "Build Backend" when backend services already exist
    const alreadyBuilt =
      (category === 'backend' && (systemContext.hasBackend || systemContext.projectHasBackend)) ||
      (category === 'frontend' && (systemContext.hasFrontend || systemContext.projectHasFrontend)) ||
      (category === 'agent' && (systemContext.hasAgents || systemContext.projectHasAgents)) ||
      (category === 'data' && (systemContext.hasModels || systemContext.projectHasModels));

    // If layer already exists at project level and no reqs need it, skip entirely
    if (alreadyBuilt && reqs.length === 0) continue;

    if (alreadyBuilt && reqs.length > 0) {
      // Layer exists — reclassify these reqs as "implement requirements" instead of "build layer"
      // Change the step to focus on implementing the specific requirements, not building the layer
      const implStep: ExecutionStep = {
        step: 0,
        key: 'implement_requirements',
        label: `Implement ${category} requirements (${reqs.length})`,
        impact: '+requirement coverage',
        depends_on: 'Existing ' + category + ' layer',
        fixes: reqs.slice(0, 3).map(r => r.requirement_text.substring(0, 60)),
        enables: [`${reqs.length} requirement${reqs.length > 1 ? 's' : ''} matched to code`],
        blocked: false,
        requirements_covered: reqs.map(r => r.requirement_key),
        prompt_target: 'requirement_implementation',
        basedOn: reqs.slice(0, 5).map(r => r.requirement_text.substring(0, 80)),
        category,
        priorityScore: Math.round(65 * (multipliers[category] || 1) + reqs.length * 3),
        status: 'pending',
      };
      if (!completed.has('implement_requirements')) steps.push(implStep);
      continue;
    }

    // Determine blocking
    const needsBackend = ['frontend', 'agent', 'data', 'integration', 'quality', 'intelligence'].includes(category);
    const blocked = needsBackend && !systemContext.hasBackend && !systemContext.projectHasBackend;

    // Fix labels: if the category is mostly about implementing existing requirements, say so
    const reqCount = reqs.length;
    const label = reqCount > 0
      ? `${config.label} (${reqCount} requirement${reqCount > 1 ? 's' : ''})`
      : config.label;

    steps.push({
      step: 0, // numbered later
      key: stepKey,
      label,
      impact: config.impact,
      depends_on: config.depends_on,
      fixes: reqs.slice(0, 3).map(r => r.requirement_text.substring(0, 60)),
      enables: config.enables,
      blocked,
      block_reason: blocked ? 'Requires: Backend services' : undefined,
      requirements_covered: reqs.map(r => r.requirement_key),
      prompt_target: config.prompt_target,
      basedOn: reqs.slice(0, 5).map(r => r.requirement_text.substring(0, 80)),
      category,
      priorityScore,
      status: 'pending',
    });
  }

  // 4b. Suppress steps for categories already built (from validation report history)
  // If build history shows "tracking" was built, don't recommend "Add user tracking"
  if (builtCategories && builtCategories.size > 0) {
    const categoryMatchMap: Record<StepCategory, string[]> = {
      backend: ['backend'],
      frontend: ['frontend', 'reporting'],
      agent: ['agent', 'intelligence'],
      data: ['data'],
      integration: ['backend'],
      quality: ['monitoring', 'optimization'],
      intelligence: ['intelligence', 'agent'],
    };
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i];
      const targetCats = categoryMatchMap[step.category] || [];
      if (targetCats.some(c => builtCategories.has(c))) {
        // Demote rather than remove — lower priority so other steps rank higher
        steps[i].priorityScore = Math.max(0, steps[i].priorityScore - 100);
      }
    }
  }

  // 5. Sort by priority (highest first), blocked items last
  steps.sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
    return b.priorityScore - a.priorityScore;
  });

  // 6. Number steps and limit
  const limited = steps.slice(0, maxSteps);
  limited.forEach((s, i) => { s.step = i + 1; });

  // Safety net: if there are unfinished reqs but no steps, create "Implement Requirements"
  if (limited.length === 0 && unfinished.length > 0) {
    limited.push({
      step: 1,
      key: 'implement_requirements',
      label: `Implement ${unfinished.length} unmatched requirement${unfinished.length > 1 ? 's' : ''}`,
      impact: '+requirement coverage',
      depends_on: 'Existing codebase',
      fixes: unfinished.slice(0, 3).map(r => r.requirement_text.substring(0, 60)),
      enables: ['Higher completion %', 'Requirements matched to code'],
      blocked: false,
      requirements_covered: unfinished.map(r => r.requirement_key),
      prompt_target: 'requirement_implementation',
      basedOn: unfinished.slice(0, 5).map(r => r.requirement_text.substring(0, 80)),
      category: 'service' as StepCategory,
      priorityScore: 200,
      status: 'pending',
    });
  }

  return limited;
}
