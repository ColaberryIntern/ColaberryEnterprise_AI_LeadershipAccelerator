import OpenAI from 'openai';
import Project from '../models/Project';
import ProjectArtifact from '../models/ProjectArtifact';
import { ArtifactDefinition, AssignmentSubmission, Enrollment } from '../models';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PortfolioCategory = 'strategy' | 'governance' | 'architecture' | 'implementation';

export interface PortfolioArtifactEntry {
  artifact_name: string;
  artifact_description: string;
  version_number: number;
  score: number | null;
  file_path: string | null;
  artifact_summary: string;
  artifact_category: PortfolioCategory;
  submitted_at: Date | null;
}

export interface ProjectMetadata {
  organization_name: string | null;
  industry: string | null;
  primary_business_problem: string | null;
  selected_use_case: string | null;
  automation_goal: string | null;
  data_sources: string[] | null;
  project_stage: string;
  project_variables: Record<string, any>;
}

export interface PortfolioStructure {
  project_metadata: ProjectMetadata;
  strategy: PortfolioArtifactEntry[];
  governance: PortfolioArtifactEntry[];
  architecture: PortfolioArtifactEntry[];
  implementation: PortfolioArtifactEntry[];
  total_artifacts: number;
  average_score: number | null;
}

export interface PortfolioResult {
  portfolio_structure: PortfolioStructure;
  readme_content: string;
  executive_summary: string;
  file_hierarchy: string[];
}

// ─── Classification ──────────────────────────────────────────────────────────

const CATEGORY_PATTERNS: { category: PortfolioCategory; patterns: RegExp[] }[] = [
  {
    category: 'strategy',
    patterns: [/strategy/i, /ai\s*maturity/i, /roadmap/i, /vision/i, /trust/i, /readiness/i],
  },
  {
    category: 'governance',
    patterns: [/risk/i, /governance/i, /compliance/i, /policy/i, /ethics/i, /audit/i],
  },
  {
    category: 'architecture',
    patterns: [/architecture/i, /data\s*model/i, /system\s*design/i, /pipeline/i, /integration/i, /schema/i],
  },
];

function classifyArtifact(artifactDef: ArtifactDefinition): PortfolioCategory {
  const searchText = `${artifactDef.name || ''} ${artifactDef.description || ''} ${artifactDef.artifact_type || ''}`;

  for (const rule of CATEGORY_PATTERNS) {
    for (const pattern of rule.patterns) {
      if (pattern.test(searchText)) return rule.category;
    }
  }

  return 'implementation';
}

function summarizeArtifact(submission: AssignmentSubmission, artifactDef: ArtifactDefinition): string {
  // Try to extract a summary from content_json
  if (submission.content_json) {
    const content = submission.content_json;
    if (typeof content === 'object') {
      // Common keys that contain summary-like content
      for (const key of ['summary', 'description', 'overview', 'executive_summary', 'title']) {
        if (content[key] && typeof content[key] === 'string') {
          return content[key].substring(0, 300);
        }
      }
      // If content has a text field, use that
      if (content.text && typeof content.text === 'string') {
        return content.text.substring(0, 300);
      }
    }
    if (typeof content === 'string') {
      return content.substring(0, 300);
    }
  }

  // Fallback to artifact definition description
  return artifactDef.description || `${artifactDef.name} submission`;
}

// ─── Core Generator ──────────────────────────────────────────────────────────

/**
 * Generate a complete enterprise AI portfolio for a learner.
 * Reads Project, ProjectArtifact, ArtifactDefinition, and AssignmentSubmission.
 * Never throws — returns empty portfolio if data is missing.
 */
export async function generatePortfolio(enrollmentId: string): Promise<PortfolioResult> {
  // Step 1: Load project
  const project = await Project.findOne({ where: { enrollment_id: enrollmentId } });

  const metadata: ProjectMetadata = {
    organization_name: project?.organization_name || null,
    industry: project?.industry || null,
    primary_business_problem: project?.primary_business_problem || null,
    selected_use_case: project?.selected_use_case || null,
    automation_goal: project?.automation_goal || null,
    data_sources: project?.data_sources || null,
    project_stage: project?.project_stage || 'discovery',
    project_variables: project?.project_variables || {},
  };

  // Empty portfolio structure
  const portfolio: PortfolioStructure = {
    project_metadata: metadata,
    strategy: [],
    governance: [],
    architecture: [],
    implementation: [],
    total_artifacts: 0,
    average_score: null,
  };

  if (!project) {
    return {
      portfolio_structure: portfolio,
      readme_content: buildReadme(metadata, portfolio),
      executive_summary: '',
      file_hierarchy: buildFileHierarchy(portfolio),
    };
  }

  // Step 2: Load project artifacts with eager loads
  const projectArtifacts = await ProjectArtifact.findAll({
    where: { project_id: project.id },
    include: [
      { model: ArtifactDefinition, as: 'artifactDefinition' },
      {
        model: AssignmentSubmission,
        as: 'submission',
        where: { is_latest: true },
        required: false,
      },
    ],
    order: [['created_at', 'ASC']],
  });

  // Also load direct submissions (artifacts not yet linked via ProjectArtifact)
  const directSubmissions = await AssignmentSubmission.findAll({
    where: {
      enrollment_id: enrollmentId,
      is_latest: true,
    },
    include: [
      { model: ArtifactDefinition, as: 'artifactDefinition', required: true },
    ],
  });

  // Build a set of already-linked submission IDs
  const linkedSubmissionIds = new Set(projectArtifacts.map(pa => pa.submission_id));

  // Step 3: Classify and build entries
  const scores: number[] = [];

  // Process ProjectArtifact-linked entries
  for (const pa of projectArtifacts) {
    const artifactDef = (pa as any).artifactDefinition as ArtifactDefinition | null;
    const submission = (pa as any).submission as AssignmentSubmission | null;
    if (!artifactDef) continue;

    const category = pa.artifact_category as PortfolioCategory || classifyArtifact(artifactDef);
    const entry: PortfolioArtifactEntry = {
      artifact_name: artifactDef.name,
      artifact_description: artifactDef.description || '',
      version_number: pa.version,
      score: submission?.score || null,
      file_path: submission?.file_path || null,
      artifact_summary: submission ? summarizeArtifact(submission, artifactDef) : (artifactDef.description || ''),
      artifact_category: category,
      submitted_at: submission?.submitted_at || null,
    };

    portfolio[category].push(entry);
    if (submission?.score != null) scores.push(submission.score);
  }

  // Process direct submissions not yet in ProjectArtifact
  for (const sub of directSubmissions) {
    if (linkedSubmissionIds.has(sub.id)) continue;
    const artifactDef = (sub as any).artifactDefinition as ArtifactDefinition | null;
    if (!artifactDef) continue;

    const category = classifyArtifact(artifactDef);
    const entry: PortfolioArtifactEntry = {
      artifact_name: artifactDef.name,
      artifact_description: artifactDef.description || '',
      version_number: sub.version_number || 1,
      score: sub.score || null,
      file_path: sub.file_path || null,
      artifact_summary: summarizeArtifact(sub, artifactDef),
      artifact_category: category,
      submitted_at: sub.submitted_at || null,
    };

    portfolio[category].push(entry);
    if (sub.score != null) scores.push(sub.score);
  }

  portfolio.total_artifacts = portfolio.strategy.length + portfolio.governance.length +
    portfolio.architecture.length + portfolio.implementation.length;
  portfolio.average_score = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : null;

  // Step 4: Generate README
  const readmeContent = buildReadme(metadata, portfolio);

  // Step 5: Generate Executive Summary (LLM)
  let executiveSummary = '';
  if (portfolio.total_artifacts > 0) {
    try {
      executiveSummary = await generateExecutiveSummary(metadata, portfolio);
    } catch (err: any) {
      console.error('[Portfolio] Executive summary generation failed:', err.message);
      executiveSummary = buildFallbackExecutiveSummary(metadata, portfolio);
    }
  }

  return {
    portfolio_structure: portfolio,
    readme_content: readmeContent,
    executive_summary: executiveSummary,
    file_hierarchy: buildFileHierarchy(portfolio),
  };
}

// ─── README Builder ──────────────────────────────────────────────────────────

function buildReadme(metadata: ProjectMetadata, portfolio: PortfolioStructure): string {
  const lines: string[] = [];

  lines.push('# Enterprise AI Project Portfolio');
  lines.push('');

  if (metadata.organization_name) lines.push(`**Organization:** ${metadata.organization_name}`);
  if (metadata.industry) lines.push(`**Industry:** ${metadata.industry}`);
  lines.push(`**Project Stage:** ${metadata.project_stage}`);
  if (portfolio.average_score != null) lines.push(`**Average Artifact Score:** ${portfolio.average_score}%`);
  lines.push('');

  if (metadata.primary_business_problem) {
    lines.push('## Business Problem');
    lines.push('');
    lines.push(metadata.primary_business_problem);
    lines.push('');
  }

  if (metadata.selected_use_case) {
    lines.push('## AI Use Case');
    lines.push('');
    lines.push(metadata.selected_use_case);
    lines.push('');
  }

  if (metadata.automation_goal) {
    lines.push('## Automation Goal');
    lines.push('');
    lines.push(metadata.automation_goal);
    lines.push('');
  }

  if (metadata.data_sources && Array.isArray(metadata.data_sources) && metadata.data_sources.length > 0) {
    lines.push('## Data Sources');
    lines.push('');
    for (const ds of metadata.data_sources) {
      lines.push(`- ${ds}`);
    }
    lines.push('');
  }

  // Project variables (success_metrics, etc.)
  const vars = metadata.project_variables || {};
  if (vars.success_metrics) {
    lines.push('## Success Metrics');
    lines.push('');
    const metrics = Array.isArray(vars.success_metrics) ? vars.success_metrics : [vars.success_metrics];
    for (const m of metrics) {
      lines.push(`- ${m}`);
    }
    lines.push('');
  }

  lines.push('## Portfolio Artifacts');
  lines.push('');

  const categories: { key: PortfolioCategory; title: string }[] = [
    { key: 'strategy', title: 'Strategy' },
    { key: 'governance', title: 'Governance' },
    { key: 'architecture', title: 'Architecture' },
    { key: 'implementation', title: 'Implementation' },
  ];

  for (const cat of categories) {
    const artifacts = portfolio[cat.key];
    if (artifacts.length === 0) continue;

    lines.push(`### ${cat.title}`);
    lines.push('');
    lines.push('| Artifact | Version | Score | Summary |');
    lines.push('|----------|---------|-------|---------|');
    for (const a of artifacts) {
      const scoreStr = a.score != null ? `${a.score}%` : '—';
      const summary = a.artifact_summary.substring(0, 80).replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(`| ${a.artifact_name} | v${a.version_number} | ${scoreStr} | ${summary} |`);
    }
    lines.push('');
  }

  if (portfolio.total_artifacts === 0) {
    lines.push('*No artifacts submitted yet.*');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*Generated by Colaberry Enterprise AI Leadership Accelerator*');

  return lines.join('\n');
}

// ─── Executive Summary (LLM) ────────────────────────────────────────────────

async function generateExecutiveSummary(
  metadata: ProjectMetadata,
  portfolio: PortfolioStructure,
): Promise<string> {
  const openai = getOpenAI();

  const artifactSummaries = [
    ...portfolio.strategy.map(a => `[Strategy] ${a.artifact_name} (v${a.version_number}, score: ${a.score ?? 'pending'}): ${a.artifact_summary}`),
    ...portfolio.governance.map(a => `[Governance] ${a.artifact_name} (v${a.version_number}, score: ${a.score ?? 'pending'}): ${a.artifact_summary}`),
    ...portfolio.architecture.map(a => `[Architecture] ${a.artifact_name} (v${a.version_number}, score: ${a.score ?? 'pending'}): ${a.artifact_summary}`),
    ...portfolio.implementation.map(a => `[Implementation] ${a.artifact_name} (v${a.version_number}, score: ${a.score ?? 'pending'}): ${a.artifact_summary}`),
  ].join('\n');

  const prompt = `You are an enterprise AI strategy consultant generating an executive summary for a senior leader's AI project portfolio.

PROJECT CONTEXT:
Organization: ${metadata.organization_name || 'Not specified'}
Industry: ${metadata.industry || 'Not specified'}
Business Problem: ${metadata.primary_business_problem || 'Not specified'}
AI Use Case: ${metadata.selected_use_case || 'Not specified'}
Automation Goal: ${metadata.automation_goal || 'Not specified'}
Data Sources: ${metadata.data_sources ? metadata.data_sources.join(', ') : 'Not specified'}
Project Stage: ${metadata.project_stage}
Total Artifacts: ${portfolio.total_artifacts}
Average Score: ${portfolio.average_score ?? 'N/A'}

ARTIFACT SUMMARIES:
${artifactSummaries || 'No artifacts available.'}

Generate a professional executive summary in markdown with these sections:
# Executive Summary

## Executive Overview
(2-3 sentence high-level summary of the project and its strategic value)

## Business Problem
(Restate the core business problem in executive language)

## AI Solution
(Describe the proposed AI solution and how it addresses the problem)

## Expected ROI
(Project estimated ROI based on the automation goal and artifacts produced — use conservative estimates)

## Implementation Roadmap
(3-4 phase roadmap based on artifacts produced so far)

## Risks and Mitigation
(2-3 key risks with mitigation strategies based on governance artifacts)

Keep the tone executive-level, concise, and data-driven. Reference specific artifacts where relevant.`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'user', content: prompt },
    ],
    temperature: 0.5,
    max_tokens: 2000,
  });

  return response.choices[0]?.message?.content || buildFallbackExecutiveSummary(metadata, portfolio);
}

function buildFallbackExecutiveSummary(
  metadata: ProjectMetadata,
  portfolio: PortfolioStructure,
): string {
  const lines: string[] = [];
  lines.push('# Executive Summary');
  lines.push('');
  lines.push('## Executive Overview');
  lines.push('');
  lines.push(`This portfolio documents the enterprise AI project for ${metadata.organization_name || 'the organization'} in the ${metadata.industry || 'enterprise'} sector. The project contains ${portfolio.total_artifacts} artifacts across ${portfolio.strategy.length > 0 ? 'strategy, ' : ''}${portfolio.governance.length > 0 ? 'governance, ' : ''}${portfolio.architecture.length > 0 ? 'architecture, ' : ''}${portfolio.implementation.length > 0 ? 'implementation' : ''} phases.`);
  lines.push('');

  if (metadata.primary_business_problem) {
    lines.push('## Business Problem');
    lines.push('');
    lines.push(metadata.primary_business_problem);
    lines.push('');
  }

  if (metadata.selected_use_case) {
    lines.push('## AI Solution');
    lines.push('');
    lines.push(metadata.selected_use_case);
    lines.push('');
  }

  if (metadata.automation_goal) {
    lines.push('## Automation Goal');
    lines.push('');
    lines.push(metadata.automation_goal);
    lines.push('');
  }

  if (portfolio.average_score != null) {
    lines.push('## Portfolio Quality');
    lines.push('');
    lines.push(`Average artifact score: ${portfolio.average_score}%`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*Generated by Colaberry Enterprise AI Leadership Accelerator*');

  return lines.join('\n');
}

// ─── File Hierarchy ──────────────────────────────────────────────────────────

function buildFileHierarchy(portfolio: PortfolioStructure): string[] {
  const files: string[] = [
    'portfolio/',
    'portfolio/README.md',
    'portfolio/EXECUTIVE_SUMMARY.md',
  ];

  const categories: { key: PortfolioCategory; folder: string }[] = [
    { key: 'strategy', folder: 'portfolio/strategy/' },
    { key: 'governance', folder: 'portfolio/governance/' },
    { key: 'architecture', folder: 'portfolio/architecture/' },
    { key: 'implementation', folder: 'portfolio/implementation/' },
  ];

  for (const cat of categories) {
    const artifacts = portfolio[cat.key];
    if (artifacts.length === 0) continue;
    files.push(cat.folder);
    for (const a of artifacts) {
      const safeName = a.artifact_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const ext = a.file_path
        ? a.file_path.substring(a.file_path.lastIndexOf('.'))
        : '.md';
      files.push(`${cat.folder}${safeName}-v${a.version_number}${ext}`);
    }
  }

  return files;
}
