/**
 * Project Requirements Context Service
 *
 * Converts a learner's project data and artifacts into a structured
 * narrative suitable for generating a full system requirements document.
 *
 * Read-only — never modifies data.
 */
import Project from '../models/Project';
import { generatePortfolio, PortfolioStructure, PortfolioArtifactEntry } from './portfolioGenerationService';
import { AssignmentSubmission, ArtifactDefinition } from '../models';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectRequirementsContext {
  project_narrative: string;
  system_description: string;
  artifact_narratives: string;
  full_context: string;
}

// ─── Artifact Narrative Expansion ───────────────────────────────────────────

function expandArtifactNarrative(entry: PortfolioArtifactEntry): string {
  const lines: string[] = [];
  lines.push(`### ${entry.artifact_name} (v${entry.version_number})`);

  if (entry.score != null) {
    lines.push(`Quality Score: ${Math.round(entry.score)}%`);
  }

  if (entry.artifact_summary) {
    lines.push('');
    lines.push(entry.artifact_summary);
  }

  if (entry.artifact_description) {
    lines.push('');
    lines.push(entry.artifact_description);
  }

  return lines.join('\n');
}

function buildCategoryNarratives(portfolio: PortfolioStructure): string {
  const sections: string[] = [];

  const categories: { label: string; entries: PortfolioArtifactEntry[] }[] = [
    { label: 'Strategy Artifacts', entries: portfolio.strategy },
    { label: 'Governance Artifacts', entries: portfolio.governance },
    { label: 'Architecture Artifacts', entries: portfolio.architecture },
    { label: 'Implementation Artifacts', entries: portfolio.implementation },
  ];

  for (const cat of categories) {
    if (cat.entries.length === 0) continue;

    sections.push(`## ${cat.label}`);
    sections.push('');
    for (const entry of cat.entries) {
      sections.push(expandArtifactNarrative(entry));
      sections.push('');
    }
  }

  if (sections.length === 0) {
    return 'No artifacts have been produced yet.';
  }

  return sections.join('\n');
}

// ─── Submission Content Expansion ───────────────────────────────────────────

async function loadSubmissionDetails(enrollmentId: string): Promise<string> {
  const submissions = await AssignmentSubmission.findAll({
    where: { enrollment_id: enrollmentId, is_latest: true },
    include: [{ model: ArtifactDefinition, as: 'artifactDefinition' }],
    order: [['created_at', 'DESC']],
  });

  if (submissions.length === 0) return '';

  const details: string[] = ['## Detailed Artifact Content'];

  for (const sub of submissions) {
    const def = (sub as any).artifactDefinition as ArtifactDefinition | null;
    const name = def?.name || sub.title || 'Unnamed Artifact';

    details.push('');
    details.push(`### ${name}`);

    if (sub.content_json && typeof sub.content_json === 'object') {
      const content = sub.content_json;
      for (const [key, value] of Object.entries(content)) {
        if (!value) continue;
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        if (typeof value === 'string' && value.length > 0) {
          details.push(`**${label}:** ${value.substring(0, 500)}`);
        } else if (Array.isArray(value) && value.length > 0) {
          details.push(`**${label}:**`);
          for (const item of value.slice(0, 10)) {
            details.push(`- ${typeof item === 'string' ? item : JSON.stringify(item)}`);
          }
        }
      }
    }
  }

  return details.join('\n');
}

// ─── Project Narrative Builder ──────────────────────────────────────────────

function buildProjectNarrative(project: Project | null): string {
  if (!project) return 'No project data available.';

  const lines: string[] = [];
  lines.push('# Project Context');
  lines.push('');

  if (project.organization_name) lines.push(`**Organization:** ${project.organization_name}`);
  if (project.industry) lines.push(`**Industry:** ${project.industry}`);
  if (project.project_stage) lines.push(`**Project Stage:** ${project.project_stage}`);
  lines.push('');

  if (project.primary_business_problem) {
    lines.push('## Business Problem');
    lines.push(project.primary_business_problem);
    lines.push('');
  }

  if (project.selected_use_case) {
    lines.push('## AI Use Case');
    lines.push(project.selected_use_case);
    lines.push('');
  }

  if (project.automation_goal) {
    lines.push('## Automation Goal');
    lines.push(project.automation_goal);
    lines.push('');
  }

  if (project.data_sources) {
    const ds = Array.isArray(project.data_sources) ? project.data_sources : [project.data_sources];
    if (ds.length > 0) {
      lines.push('## Data Sources');
      for (const source of ds) {
        lines.push(`- ${typeof source === 'string' ? source : JSON.stringify(source)}`);
      }
      lines.push('');
    }
  }

  // Include project variables
  const vars = project.project_variables || {};
  const coveredKeys = new Set(['business_problem', 'ai_use_case', 'automation_goal', 'data_sources']);
  const extraVars = Object.entries(vars).filter(([k, v]) => !coveredKeys.has(k) && v);

  if (extraVars.length > 0) {
    lines.push('## Additional Project Parameters');
    for (const [key, value] of extraVars) {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
      lines.push(`**${label}:** ${displayValue}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── System Description Synthesis ───────────────────────────────────────────

function buildSystemDescription(project: Project | null, portfolio: PortfolioStructure): string {
  const lines: string[] = [];
  lines.push('# System Description');
  lines.push('');

  // System Purpose
  lines.push('## System Purpose');
  if (project?.automation_goal) {
    lines.push(`This AI system is being designed to ${project.automation_goal.toLowerCase().startsWith('to ') ? project.automation_goal.substring(3) : project.automation_goal}.`);
  } else {
    lines.push('The system aims to automate and optimize enterprise business processes using AI technology.');
  }
  lines.push('');

  // Business Problem
  lines.push('## Business Problem');
  lines.push(project?.primary_business_problem || 'The specific business problem will be defined during the discovery phase.');
  lines.push('');

  // AI Solution Overview
  lines.push('## AI Solution Overview');
  if (project?.selected_use_case) {
    lines.push(`The proposed AI solution: ${project.selected_use_case}`);
  }
  if (project?.industry) {
    lines.push(`Target industry: ${project.industry}`);
  }
  lines.push(`Portfolio maturity: ${portfolio.total_artifacts} artifacts across ${countCategories(portfolio)} categories.`);
  if (portfolio.average_score != null) {
    lines.push(`Average artifact quality: ${Math.round(portfolio.average_score)}%`);
  }
  lines.push('');

  // Data Flow
  lines.push('## Data Flow');
  if (project?.data_sources) {
    const ds = Array.isArray(project.data_sources) ? project.data_sources : [project.data_sources];
    lines.push(`Data sources identified: ${ds.join(', ')}`);
    lines.push('The system will ingest data from these sources, process through the AI pipeline, and produce actionable outputs.');
  } else {
    lines.push('Data sources have not yet been identified.');
  }
  lines.push('');

  // Architecture insights from artifacts
  if (portfolio.architecture.length > 0) {
    lines.push('## Architecture Insights');
    lines.push(`${portfolio.architecture.length} architecture artifact(s) have been produced:`);
    for (const a of portfolio.architecture) {
      lines.push(`- ${a.artifact_name}: ${a.artifact_summary || a.artifact_description || 'No summary available'}`);
    }
    lines.push('');
  }

  // Governance controls from artifacts
  if (portfolio.governance.length > 0) {
    lines.push('## Governance Controls');
    lines.push(`${portfolio.governance.length} governance artifact(s) define the control framework:`);
    for (const a of portfolio.governance) {
      lines.push(`- ${a.artifact_name}: ${a.artifact_summary || a.artifact_description || 'No summary available'}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function countCategories(portfolio: PortfolioStructure): number {
  let count = 0;
  if (portfolio.strategy.length > 0) count++;
  if (portfolio.governance.length > 0) count++;
  if (portfolio.architecture.length > 0) count++;
  if (portfolio.implementation.length > 0) count++;
  return count;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Build a complete project context for requirements document generation.
 * Returns structured narratives from project data, artifacts, and portfolio.
 */
export async function buildProjectRequirementsContext(
  enrollmentId: string,
): Promise<ProjectRequirementsContext> {
  const project = await Project.findOne({ where: { enrollment_id: enrollmentId } });

  const portfolioResult = await generatePortfolio(enrollmentId);
  const portfolio = portfolioResult.portfolio_structure;

  const projectNarrative = buildProjectNarrative(project);
  const systemDescription = buildSystemDescription(project, portfolio);
  const artifactNarratives = buildCategoryNarratives(portfolio);
  const submissionDetails = await loadSubmissionDetails(enrollmentId);

  const fullContext = [
    projectNarrative,
    systemDescription,
    artifactNarratives,
    submissionDetails,
  ].filter(Boolean).join('\n\n---\n\n');

  return {
    project_narrative: projectNarrative,
    system_description: systemDescription,
    artifact_narratives: artifactNarratives,
    full_context: fullContext,
  };
}
