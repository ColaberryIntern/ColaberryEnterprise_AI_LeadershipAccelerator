/**
 * Project Mentor Service
 *
 * Analyzes a learner's enterprise AI project and produces structured
 * consulting-style guidance. Read-only — never modifies data, never
 * triggers agents, never sends communications.
 */
import Project from '../models/Project';
import { generatePortfolio, PortfolioStructure, PortfolioArtifactEntry } from './portfolioGenerationService';

// ─── Types ──────────────────────────────────────────────────────────────────

export type MentorStage = 'discovery' | 'strategy' | 'governance' | 'architecture' | 'implementation' | 'portfolio';

export interface MentorRecommendation {
  category: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
}

export interface MentorRisk {
  risk: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface PortfolioSummary {
  artifact_count: number;
  average_score: number | null;
  category_counts: Record<string, number>;
}

export interface MentorGuidance {
  project_stage: MentorStage;
  portfolio_summary: PortfolioSummary;
  recommendations: MentorRecommendation[];
  risks: MentorRisk[];
  next_steps: string[];
}

// ─── Stage Detection ────────────────────────────────────────────────────────

function detectStage(
  project: Project | null,
  portfolio: PortfolioStructure,
): MentorStage {
  if (!project) return 'discovery';

  const vars = project.project_variables || {};
  const hasBusinessProblem = !!(project.primary_business_problem || vars.business_problem);
  const hasUseCase = !!(project.selected_use_case || vars.ai_use_case);
  const hasAutomationGoal = !!(project.automation_goal || vars.automation_goal);

  // Discovery incomplete if core variables missing
  if (!hasBusinessProblem && !hasUseCase && !hasAutomationGoal) {
    return 'discovery';
  }

  const hasStrategy = portfolio.strategy.length > 0;
  const hasGovernance = portfolio.governance.length > 0;
  const hasArchitecture = portfolio.architecture.length > 0;
  const hasImplementation = portfolio.implementation.length > 0;

  if (!hasStrategy) return 'strategy';
  if (!hasGovernance) return 'governance';
  if (!hasArchitecture) return 'architecture';
  if (!hasImplementation) return 'implementation';

  return 'portfolio';
}

// ─── Recommendations ────────────────────────────────────────────────────────

function generateRecommendations(
  stage: MentorStage,
  project: Project | null,
  portfolio: PortfolioStructure,
): MentorRecommendation[] {
  const recs: MentorRecommendation[] = [];

  // Stage-based recommendations
  switch (stage) {
    case 'discovery':
      recs.push({
        category: 'Discovery',
        message: 'Define your business problem and automation goal before creating an AI strategy.',
        priority: 'high',
      });
      if (!project?.industry) {
        recs.push({
          category: 'Discovery',
          message: 'Specify your industry to receive more targeted AI strategy guidance.',
          priority: 'medium',
        });
      }
      break;

    case 'strategy':
      recs.push({
        category: 'Strategy',
        message: 'Your discovery phase is complete. Create AI strategy artifacts — start with an AI Maturity Assessment or Strategy Roadmap.',
        priority: 'high',
      });
      break;

    case 'governance':
      recs.push({
        category: 'Governance',
        message: 'Your strategy is defined but governance policies are missing. Define AI risk controls and compliance frameworks before architecture.',
        priority: 'high',
      });
      break;

    case 'architecture':
      recs.push({
        category: 'Architecture',
        message: 'Your AI strategy and governance are complete. Next step is defining system architecture and data pipelines.',
        priority: 'high',
      });
      break;

    case 'implementation':
      recs.push({
        category: 'Implementation',
        message: 'Architecture is defined. Build a working automation prototype to validate the design.',
        priority: 'high',
      });
      break;

    case 'portfolio':
      recs.push({
        category: 'Portfolio',
        message: 'All artifact categories are covered. Review artifact scores and refine weak areas for a strong portfolio.',
        priority: 'medium',
      });
      break;
  }

  // Artifact quality recommendations
  const allArtifacts = [
    ...portfolio.strategy,
    ...portfolio.governance,
    ...portfolio.architecture,
    ...portfolio.implementation,
  ];

  for (const artifact of allArtifacts) {
    if (artifact.score != null && artifact.score < 70) {
      recs.push({
        category: 'Quality',
        message: `Your ${artifact.artifact_name} scored ${Math.round(artifact.score)}%. Consider revisiting and strengthening this artifact.`,
        priority: 'medium',
      });
    }
  }

  // Category balance recommendations
  if (portfolio.strategy.length > 0 && portfolio.governance.length === 0 && stage !== 'strategy') {
    recs.push({
      category: 'Balance',
      message: 'Your portfolio has strategy artifacts but no governance documentation. Enterprise AI projects require risk and compliance frameworks.',
      priority: 'high',
    });
  }

  if (portfolio.architecture.length > 0 && portfolio.implementation.length === 0 && stage === 'portfolio') {
    recs.push({
      category: 'Balance',
      message: 'Architecture is documented but implementation proof is missing. Add prototype or workflow artifacts.',
      priority: 'medium',
    });
  }

  // Data sources recommendation
  const dataSources = project?.data_sources;
  if (stage !== 'discovery' && (!dataSources || (Array.isArray(dataSources) && dataSources.length === 0))) {
    recs.push({
      category: 'Data',
      message: 'No data sources are defined. Identify the data systems your AI solution will integrate with.',
      priority: 'medium',
    });
  }

  return recs;
}

// ─── Risk Detection ─────────────────────────────────────────────────────────

function detectRisks(
  stage: MentorStage,
  project: Project | null,
  portfolio: PortfolioStructure,
): MentorRisk[] {
  const risks: MentorRisk[] = [];

  // No governance
  if (portfolio.governance.length === 0 && portfolio.strategy.length > 0) {
    risks.push({
      risk: 'No governance artifacts detected. Enterprise AI deployments without governance frameworks face regulatory and operational risk.',
      severity: 'critical',
    });
  }

  // No data sources
  const dataSources = project?.data_sources;
  if (!dataSources || (Array.isArray(dataSources) && dataSources.length === 0)) {
    risks.push({
      risk: 'No data sources defined. AI solutions require clearly identified data inputs for architecture and implementation.',
      severity: 'high',
    });
  }

  // Automation goal unclear
  if (!project?.automation_goal && stage !== 'discovery') {
    risks.push({
      risk: 'Automation goal is not defined. Without a clear goal, implementation scope may drift.',
      severity: 'high',
    });
  }

  // Low average score
  if (portfolio.average_score != null && portfolio.average_score < 70) {
    risks.push({
      risk: `Average artifact score is ${Math.round(portfolio.average_score)}%. Portfolio quality is below the threshold for a strong executive presentation.`,
      severity: 'medium',
    });
  }

  // Missing implementation proof
  if (portfolio.implementation.length === 0 && portfolio.architecture.length > 0) {
    risks.push({
      risk: 'Architecture is defined but no implementation artifacts exist. Portfolio lacks proof of execution.',
      severity: 'medium',
    });
  }

  // Single artifact in a category (thin coverage)
  for (const [cat, artifacts] of Object.entries({
    strategy: portfolio.strategy,
    governance: portfolio.governance,
    architecture: portfolio.architecture,
  })) {
    if (artifacts.length === 1) {
      risks.push({
        risk: `Only one ${cat} artifact exists. Consider adding supporting documentation for a comprehensive portfolio.`,
        severity: 'low',
      });
    }
  }

  return risks;
}

// ─── Next Steps ─────────────────────────────────────────────────────────────

function generateNextSteps(
  stage: MentorStage,
  portfolio: PortfolioStructure,
): string[] {
  const steps: string[] = [];

  switch (stage) {
    case 'discovery':
      steps.push('Complete the Discovery lesson to define your business problem, AI use case, and automation goal.');
      steps.push('Identify your organization\'s data sources and systems.');
      break;

    case 'strategy':
      steps.push('Start the AI Strategy lesson to create your first strategy artifact.');
      steps.push('Complete an AI Maturity Assessment for your organization.');
      break;

    case 'governance':
      steps.push('Create a Risk Register artifact identifying key AI risks.');
      steps.push('Define your organization\'s AI compliance and ethics framework.');
      break;

    case 'architecture':
      steps.push('Design your AI system architecture showing data flow and integrations.');
      steps.push('Document the data pipeline from source systems to AI model input.');
      break;

    case 'implementation':
      steps.push('Build a working prototype or proof-of-concept for your automation.');
      steps.push('Document the implementation workflow with measurable outcomes.');
      break;

    case 'portfolio':
      steps.push('Review all artifact scores and revise any below 85%.');
      steps.push('Generate your executive deliverable for stakeholder presentation.');
      steps.push('Review the portfolio README for completeness.');
      break;
  }

  // Score-based next steps
  const weakArtifacts = [
    ...portfolio.strategy,
    ...portfolio.governance,
    ...portfolio.architecture,
    ...portfolio.implementation,
  ].filter(a => a.score != null && a.score < 70);

  if (weakArtifacts.length > 0 && stage === 'portfolio') {
    steps.push(`Revise ${weakArtifacts.length} artifact(s) scoring below 70% to strengthen your portfolio.`);
  }

  return steps;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Generate consulting-style mentor guidance for a learner's AI project.
 * Read-only analysis — never modifies project data.
 */
export async function generateMentorGuidance(enrollmentId: string): Promise<MentorGuidance> {
  // Load project
  const project = await Project.findOne({ where: { enrollment_id: enrollmentId } });

  // Load portfolio (reuses portfolioGenerationService for artifact data)
  const portfolioResult = await generatePortfolio(enrollmentId);
  const portfolio = portfolioResult.portfolio_structure;

  // Detect stage
  const stage = detectStage(project, portfolio);

  // Build portfolio summary
  const portfolioSummary: PortfolioSummary = {
    artifact_count: portfolio.total_artifacts,
    average_score: portfolio.average_score,
    category_counts: {
      strategy: portfolio.strategy.length,
      governance: portfolio.governance.length,
      architecture: portfolio.architecture.length,
      implementation: portfolio.implementation.length,
    },
  };

  // Generate guidance
  const recommendations = generateRecommendations(stage, project, portfolio);
  const risks = detectRisks(stage, project, portfolio);
  const nextSteps = generateNextSteps(stage, portfolio);

  return {
    project_stage: stage,
    portfolio_summary: portfolioSummary,
    recommendations,
    risks,
    next_steps: nextSteps,
  };
}
