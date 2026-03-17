/**
 * Project Workflow Service
 *
 * Generates a structured workflow state for a learner's enterprise AI project.
 * Analyzes project variables, artifacts, and portfolio data to produce:
 *   - Current workflow phase with completion status
 *   - Checklist of tasks per phase
 *   - Overall progress percentage
 *   - Actionable next action
 *
 * Read-only — never modifies data.
 */
import Project from '../models/Project';
import { generatePortfolio, PortfolioStructure } from './portfolioGenerationService';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WorkflowTask {
  key: string;
  label: string;
  completed: boolean;
  detail?: string;
}

export interface WorkflowPhase {
  key: string;
  label: string;
  icon: string;
  status: 'completed' | 'active' | 'locked';
  tasks: WorkflowTask[];
  completion_pct: number;
}

export interface WorkflowState {
  phases: WorkflowPhase[];
  current_phase: string;
  overall_progress: number;
  next_action: string;
  summary: string;
}

// ─── Phase Definitions ──────────────────────────────────────────────────────

const PHASE_DEFINITIONS: Array<{
  key: string;
  label: string;
  icon: string;
  tasks: Array<{
    key: string;
    label: string;
    check: (project: Project | null, portfolio: PortfolioStructure) => { completed: boolean; detail?: string };
  }>;
}> = [
  {
    key: 'discovery',
    label: 'Discovery',
    icon: 'bi-search',
    tasks: [
      {
        key: 'organization',
        label: 'Define organization name',
        check: (p) => ({
          completed: !!p?.organization_name,
          detail: p?.organization_name || undefined,
        }),
      },
      {
        key: 'industry',
        label: 'Specify industry',
        check: (p) => ({
          completed: !!p?.industry,
          detail: p?.industry || undefined,
        }),
      },
      {
        key: 'business_problem',
        label: 'Identify primary business problem',
        check: (p) => {
          const val = p?.primary_business_problem || p?.project_variables?.business_problem;
          return { completed: !!val, detail: val ? String(val).substring(0, 120) : undefined };
        },
      },
      {
        key: 'use_case',
        label: 'Select AI use case',
        check: (p) => {
          const val = p?.selected_use_case || p?.project_variables?.ai_use_case;
          return { completed: !!val, detail: val ? String(val).substring(0, 120) : undefined };
        },
      },
      {
        key: 'automation_goal',
        label: 'Define automation goal',
        check: (p) => {
          const val = p?.automation_goal || p?.project_variables?.automation_goal;
          return { completed: !!val, detail: val ? String(val).substring(0, 120) : undefined };
        },
      },
      {
        key: 'data_sources',
        label: 'Identify data sources',
        check: (p) => {
          const ds = p?.data_sources;
          const has = ds && (Array.isArray(ds) ? ds.length > 0 : true);
          return {
            completed: !!has,
            detail: has && Array.isArray(ds) ? ds.join(', ') : undefined,
          };
        },
      },
    ],
  },
  {
    key: 'strategy',
    label: 'AI Strategy',
    icon: 'bi-compass',
    tasks: [
      {
        key: 'strategy_artifact',
        label: 'Create a strategy artifact',
        check: (_p, port) => ({
          completed: port.strategy.length > 0,
          detail: port.strategy.length > 0 ? `${port.strategy.length} artifact(s)` : undefined,
        }),
      },
      {
        key: 'strategy_quality',
        label: 'Achieve 70%+ score on strategy artifacts',
        check: (_p, port) => {
          const scored = port.strategy.filter(a => a.score != null);
          if (scored.length === 0) return { completed: false };
          const avg = scored.reduce((s, a) => s + (a.score || 0), 0) / scored.length;
          return { completed: avg >= 70, detail: `Avg: ${Math.round(avg)}%` };
        },
      },
    ],
  },
  {
    key: 'governance',
    label: 'AI Governance',
    icon: 'bi-shield-check',
    tasks: [
      {
        key: 'governance_artifact',
        label: 'Create a governance artifact',
        check: (_p, port) => ({
          completed: port.governance.length > 0,
          detail: port.governance.length > 0 ? `${port.governance.length} artifact(s)` : undefined,
        }),
      },
      {
        key: 'governance_quality',
        label: 'Achieve 70%+ score on governance artifacts',
        check: (_p, port) => {
          const scored = port.governance.filter(a => a.score != null);
          if (scored.length === 0) return { completed: false };
          const avg = scored.reduce((s, a) => s + (a.score || 0), 0) / scored.length;
          return { completed: avg >= 70, detail: `Avg: ${Math.round(avg)}%` };
        },
      },
    ],
  },
  {
    key: 'architecture',
    label: 'System Architecture',
    icon: 'bi-diagram-3',
    tasks: [
      {
        key: 'architecture_artifact',
        label: 'Create an architecture artifact',
        check: (_p, port) => ({
          completed: port.architecture.length > 0,
          detail: port.architecture.length > 0 ? `${port.architecture.length} artifact(s)` : undefined,
        }),
      },
      {
        key: 'architecture_quality',
        label: 'Achieve 70%+ score on architecture artifacts',
        check: (_p, port) => {
          const scored = port.architecture.filter(a => a.score != null);
          if (scored.length === 0) return { completed: false };
          const avg = scored.reduce((s, a) => s + (a.score || 0), 0) / scored.length;
          return { completed: avg >= 70, detail: `Avg: ${Math.round(avg)}%` };
        },
      },
    ],
  },
  {
    key: 'implementation',
    label: 'Implementation',
    icon: 'bi-gear',
    tasks: [
      {
        key: 'implementation_artifact',
        label: 'Create an implementation artifact',
        check: (_p, port) => ({
          completed: port.implementation.length > 0,
          detail: port.implementation.length > 0 ? `${port.implementation.length} artifact(s)` : undefined,
        }),
      },
      {
        key: 'implementation_quality',
        label: 'Achieve 70%+ score on implementation artifacts',
        check: (_p, port) => {
          const scored = port.implementation.filter(a => a.score != null);
          if (scored.length === 0) return { completed: false };
          const avg = scored.reduce((s, a) => s + (a.score || 0), 0) / scored.length;
          return { completed: avg >= 70, detail: `Avg: ${Math.round(avg)}%` };
        },
      },
    ],
  },
  {
    key: 'portfolio',
    label: 'Portfolio Review',
    icon: 'bi-briefcase',
    tasks: [
      {
        key: 'all_categories',
        label: 'Artifacts in all 4 categories',
        check: (_p, port) => {
          const cats = [port.strategy, port.governance, port.architecture, port.implementation];
          const filled = cats.filter(c => c.length > 0).length;
          return { completed: filled === 4, detail: `${filled}/4 categories covered` };
        },
      },
      {
        key: 'overall_score',
        label: 'Portfolio average score 80%+',
        check: (_p, port) => ({
          completed: port.average_score != null && port.average_score >= 80,
          detail: port.average_score != null ? `Current: ${Math.round(port.average_score)}%` : undefined,
        }),
      },
      {
        key: 'min_artifacts',
        label: 'At least 6 total artifacts',
        check: (_p, port) => ({
          completed: port.total_artifacts >= 6,
          detail: `${port.total_artifacts} artifact(s)`,
        }),
      },
    ],
  },
];

// ─── Next Action Messages ───────────────────────────────────────────────────

const NEXT_ACTIONS: Record<string, string> = {
  discovery: 'Complete the Discovery lesson to define your business problem and AI use case.',
  strategy: 'Create your first AI strategy artifact through the Strategy lesson.',
  governance: 'Build governance artifacts — start with a Risk Register or Ethics Framework.',
  architecture: 'Design your system architecture showing data flow and AI integrations.',
  implementation: 'Build a working prototype or proof-of-concept for your automation.',
  portfolio: 'Review and strengthen your portfolio for executive presentation.',
};

// ─── Main Entry Point ───────────────────────────────────────────────────────

export async function generateWorkflowState(enrollmentId: string): Promise<WorkflowState> {
  const project = await Project.findOne({ where: { enrollment_id: enrollmentId } });
  const portfolioResult = await generatePortfolio(enrollmentId);
  const portfolio = portfolioResult.portfolio_structure;

  // Evaluate each phase
  const phases: WorkflowPhase[] = [];
  let currentPhaseKey = 'discovery';
  let foundActive = false;

  for (const phaseDef of PHASE_DEFINITIONS) {
    const tasks: WorkflowTask[] = phaseDef.tasks.map(t => {
      const result = t.check(project, portfolio);
      return {
        key: t.key,
        label: t.label,
        completed: result.completed,
        detail: result.detail,
      };
    });

    const completedCount = tasks.filter(t => t.completed).length;
    const completionPct = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
    const isComplete = completionPct === 100;

    let status: 'completed' | 'active' | 'locked';
    if (isComplete) {
      status = 'completed';
    } else if (!foundActive) {
      status = 'active';
      currentPhaseKey = phaseDef.key;
      foundActive = true;
    } else {
      status = 'locked';
    }

    phases.push({
      key: phaseDef.key,
      label: phaseDef.label,
      icon: phaseDef.icon,
      status,
      tasks,
      completion_pct: completionPct,
    });
  }

  // If no active phase found, all are complete
  if (!foundActive) {
    currentPhaseKey = 'portfolio';
  }

  // Overall progress
  const totalTasks = phases.reduce((s, p) => s + p.tasks.length, 0);
  const completedTasks = phases.reduce((s, p) => s + p.tasks.filter(t => t.completed).length, 0);
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Next action
  const activePhase = phases.find(p => p.status === 'active');
  const nextAction = activePhase
    ? NEXT_ACTIONS[activePhase.key] || 'Continue working on your project.'
    : 'Your project workflow is complete! Generate your executive deliverable.';

  // Summary
  const completedPhases = phases.filter(p => p.status === 'completed').length;
  const summary = `${completedPhases}/${phases.length} phases complete · ${completedTasks}/${totalTasks} tasks done`;

  return {
    phases,
    current_phase: currentPhaseKey,
    overall_progress: overallProgress,
    next_action: nextAction,
    summary,
  };
}
