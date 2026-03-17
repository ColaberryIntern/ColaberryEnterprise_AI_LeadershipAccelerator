import OpenAI from 'openai';
import { generatePortfolio, PortfolioStructure, ProjectMetadata, PortfolioArtifactEntry } from './portfolioGenerationService';
import Project from '../models/Project';
import { SkillMastery, Enrollment } from '../models';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ROIForecast {
  implementation_cost_estimate: string;
  annual_operational_savings: string;
  projected_roi_percentage: string;
  payback_period: string;
  confidence_level: 'low' | 'medium' | 'high';
  assumptions: string[];
}

export interface ExecutiveDeliverableResult {
  executive_report_markdown: string;
  portfolio_reference: {
    total_artifacts: number;
    average_score: number | null;
    categories: { strategy: number; governance: number; architecture: number; implementation: number };
  };
  project_metadata: ProjectMetadata;
  roi_forecast: ROIForecast;
  generated_at: string;
}

// ─── ROI Estimation ──────────────────────────────────────────────────────────

function estimateROI(
  metadata: ProjectMetadata,
  portfolio: PortfolioStructure,
): ROIForecast {
  const hasGoal = !!metadata.automation_goal;
  const hasArtifacts = portfolio.total_artifacts > 0;
  const avgScore = portfolio.average_score || 0;

  // Confidence based on available data
  let confidence: 'low' | 'medium' | 'high' = 'low';
  if (hasGoal && hasArtifacts && avgScore > 70) confidence = 'high';
  else if (hasGoal && hasArtifacts) confidence = 'medium';

  const assumptions: string[] = [];

  // Implementation cost estimate based on project complexity
  let implCost = '$50,000 - $150,000';
  if (portfolio.architecture.length > 0) {
    implCost = '$75,000 - $200,000';
    assumptions.push('Architecture artifacts indicate moderate system integration complexity');
  }
  if (portfolio.implementation.length >= 3) {
    implCost = '$100,000 - $300,000';
    assumptions.push('Multiple implementation artifacts suggest enterprise-scale deployment');
  }

  // Savings estimate based on automation goal keywords
  let savings = '$100,000 - $500,000 annually';
  const goalText = (metadata.automation_goal || '').toLowerCase();
  if (goalText.includes('hour') || goalText.includes('time')) {
    savings = '$150,000 - $400,000 annually';
    assumptions.push('Time-based automation goal suggests significant labor cost reduction');
  }
  if (goalText.includes('error') || goalText.includes('accuracy')) {
    assumptions.push('Quality improvement goal adds indirect savings via error reduction');
  }

  // ROI percentage
  let roiPct = '150% - 400%';
  if (confidence === 'high') roiPct = '200% - 500%';
  if (confidence === 'low') roiPct = '100% - 300%';

  if (assumptions.length === 0) {
    assumptions.push('Estimates based on industry benchmarks for enterprise AI projects');
    assumptions.push('Actual ROI depends on implementation quality and organizational adoption');
  }

  return {
    implementation_cost_estimate: implCost,
    annual_operational_savings: savings,
    projected_roi_percentage: roiPct,
    payback_period: confidence === 'high' ? '6 - 12 months' : '9 - 18 months',
    confidence_level: confidence,
    assumptions,
  };
}

// ─── Template Builder ────────────────────────────────────────────────────────

function buildExecutiveReportTemplate(
  metadata: ProjectMetadata,
  portfolio: PortfolioStructure,
  roi: ROIForecast,
): string {
  const lines: string[] = [];

  lines.push('# Enterprise AI Strategy — Executive Deliverable');
  lines.push('');
  lines.push(`**Organization:** ${metadata.organization_name || 'Not specified'}`);
  lines.push(`**Industry:** ${metadata.industry || 'Not specified'}`);
  lines.push(`**Date:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  lines.push(`**Project Stage:** ${metadata.project_stage}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Section 1: Executive Overview
  lines.push('## 1. Executive Overview');
  lines.push('');
  lines.push(`This document presents the enterprise AI strategy for ${metadata.organization_name || 'the organization'} in the ${metadata.industry || 'enterprise'} sector. The project encompasses ${portfolio.total_artifacts} deliverables across strategy, governance, architecture, and implementation phases${portfolio.average_score ? `, with an average quality score of ${portfolio.average_score}%` : ''}.`);
  lines.push('');

  // Section 2: Business Problem
  lines.push('## 2. Business Problem');
  lines.push('');
  if (metadata.primary_business_problem) {
    lines.push(metadata.primary_business_problem);
  } else {
    lines.push('*Business problem to be defined during discovery phase.*');
  }
  lines.push('');

  // Section 3: AI Solution Architecture
  lines.push('## 3. AI Solution Architecture');
  lines.push('');
  if (metadata.selected_use_case) {
    lines.push(`**Proposed Solution:** ${metadata.selected_use_case}`);
    lines.push('');
  }
  if (metadata.automation_goal) {
    lines.push(`**Automation Target:** ${metadata.automation_goal}`);
    lines.push('');
  }
  if (metadata.data_sources && Array.isArray(metadata.data_sources) && metadata.data_sources.length > 0) {
    lines.push('**Data Sources:**');
    for (const ds of metadata.data_sources) {
      lines.push(`- ${ds}`);
    }
    lines.push('');
  }
  if (portfolio.architecture.length > 0) {
    lines.push('**Architecture Artifacts:**');
    for (const a of portfolio.architecture) {
      lines.push(`- ${a.artifact_name} (v${a.version_number}${a.score != null ? `, score: ${a.score}%` : ''})`);
    }
    lines.push('');
  }

  // Section 4: Implementation Roadmap
  lines.push('## 4. Implementation Roadmap');
  lines.push('');
  lines.push('| Phase | Focus | Artifacts | Status |');
  lines.push('|-------|-------|-----------|--------|');
  lines.push(`| Discovery | Project scoping & problem definition | — | ${metadata.project_stage === 'discovery' ? '**In Progress**' : 'Complete'} |`);
  lines.push(`| Architecture | System design & data pipeline | ${portfolio.architecture.length} artifact(s) | ${metadata.project_stage === 'architecture' ? '**In Progress**' : metadata.project_stage === 'discovery' ? 'Pending' : 'Complete'} |`);
  lines.push(`| Implementation | Build & validate AI solution | ${portfolio.implementation.length} artifact(s) | ${metadata.project_stage === 'implementation' ? '**In Progress**' : ['discovery', 'architecture'].includes(metadata.project_stage) ? 'Pending' : 'Complete'} |`);
  lines.push(`| Portfolio | Executive deliverables & review | — | ${metadata.project_stage === 'portfolio' ? '**In Progress**' : metadata.project_stage === 'complete' ? 'Complete' : 'Pending'} |`);
  lines.push('');

  // Section 5: ROI Forecast
  lines.push('## 5. ROI Forecast');
  lines.push('');
  lines.push(`| Metric | Estimate |`);
  lines.push(`|--------|----------|`);
  lines.push(`| Implementation Cost | ${roi.implementation_cost_estimate} |`);
  lines.push(`| Annual Operational Savings | ${roi.annual_operational_savings} |`);
  lines.push(`| Projected ROI | ${roi.projected_roi_percentage} |`);
  lines.push(`| Payback Period | ${roi.payback_period} |`);
  lines.push(`| Confidence Level | ${roi.confidence_level.charAt(0).toUpperCase() + roi.confidence_level.slice(1)} |`);
  lines.push('');
  lines.push('**Assumptions:**');
  for (const a of roi.assumptions) {
    lines.push(`- ${a}`);
  }
  lines.push('');

  // Section 6: Risk Analysis
  lines.push('## 6. Risk Analysis');
  lines.push('');
  if (portfolio.governance.length > 0) {
    lines.push('**Governance Artifacts Produced:**');
    for (const a of portfolio.governance) {
      lines.push(`- ${a.artifact_name} (v${a.version_number}${a.score != null ? `, score: ${a.score}%` : ''})`);
    }
    lines.push('');
    lines.push('Key risks have been identified and documented in governance deliverables above.');
  } else {
    lines.push('| Risk | Severity | Mitigation |');
    lines.push('|------|----------|------------|');
    lines.push('| Data quality issues | High | Implement validation layer and data profiling |');
    lines.push('| Organizational adoption | Medium | Phased rollout with executive sponsorship |');
    lines.push('| Regulatory compliance | Medium | Establish AI governance framework |');
  }
  lines.push('');

  // Section 7: Governance Plan
  lines.push('## 7. Governance Plan');
  lines.push('');
  lines.push('**AI Governance Framework:**');
  lines.push('- Human-in-the-loop oversight for all AI-driven decisions');
  lines.push('- Quarterly model performance reviews');
  lines.push('- Data privacy compliance audit schedule');
  lines.push('- Escalation procedures for AI system failures');
  if (portfolio.governance.length > 0) {
    lines.push('');
    lines.push(`*${portfolio.governance.length} governance artifact(s) produced to support this framework.*`);
  }
  lines.push('');

  // Section 8: Success Metrics
  lines.push('## 8. Success Metrics');
  lines.push('');
  const vars = metadata.project_variables || {};
  if (vars.success_metrics) {
    const metrics = Array.isArray(vars.success_metrics) ? vars.success_metrics : [vars.success_metrics];
    lines.push('| Metric | Target |');
    lines.push('|--------|--------|');
    for (const m of metrics) {
      lines.push(`| ${m} | Defined in project scope |`);
    }
  } else {
    lines.push('| Metric | Target |');
    lines.push('|--------|--------|');
    lines.push('| Process automation rate | 80%+ |');
    lines.push('| Error reduction | 50%+ |');
    lines.push('| ROI achievement | Year 1 |');
    lines.push('| User adoption | 90%+ within 6 months |');
  }
  lines.push('');

  // Portfolio Summary
  lines.push('---');
  lines.push('');
  lines.push('## Appendix: Portfolio Summary');
  lines.push('');
  lines.push(`| Category | Artifacts | Avg Score |`);
  lines.push(`|----------|-----------|-----------|`);
  const catData: { name: string; entries: PortfolioArtifactEntry[] }[] = [
    { name: 'Strategy', entries: portfolio.strategy },
    { name: 'Governance', entries: portfolio.governance },
    { name: 'Architecture', entries: portfolio.architecture },
    { name: 'Implementation', entries: portfolio.implementation },
  ];
  for (const cat of catData) {
    const scores = cat.entries.filter(a => a.score != null).map(a => a.score as number);
    const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    lines.push(`| ${cat.name} | ${cat.entries.length} | ${avg != null ? `${avg}%` : '—'} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*Generated by Colaberry Enterprise AI Leadership Accelerator*');

  return lines.join('\n');
}

// ─── LLM Enhancement ─────────────────────────────────────────────────────────

async function enhanceWithLLM(
  templateReport: string,
  metadata: ProjectMetadata,
  portfolio: PortfolioStructure,
): Promise<string> {
  const openai = getOpenAI();

  const prompt = `You are a senior enterprise AI strategy consultant preparing a board-level executive deliverable.

Below is a template executive report. Your task is to enhance it with:
1. More specific, data-driven language based on the project context
2. Concrete recommendations based on the artifacts produced
3. Industry-specific insights for the ${metadata.industry || 'enterprise'} sector
4. Stronger executive framing — this must persuade a C-suite audience

PROJECT CONTEXT:
Organization: ${metadata.organization_name || 'Not specified'}
Industry: ${metadata.industry || 'Not specified'}
Business Problem: ${metadata.primary_business_problem || 'Not specified'}
AI Use Case: ${metadata.selected_use_case || 'Not specified'}
Automation Goal: ${metadata.automation_goal || 'Not specified'}
Total Artifacts: ${portfolio.total_artifacts}
Average Score: ${portfolio.average_score ?? 'N/A'}

TEMPLATE REPORT:
${templateReport}

INSTRUCTIONS:
- Preserve ALL section headings (## 1. through ## 8. and Appendix)
- Preserve ALL tables — do not remove or restructure them
- Enhance prose paragraphs with specificity and executive tone
- Keep the markdown format
- Do not add new sections
- Maximum 3000 words`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    max_tokens: 4000,
  });

  return response.choices[0]?.message?.content || templateReport;
}

// ─── Main Generator ──────────────────────────────────────────────────────────

/**
 * Generate a board-level executive deliverable for a learner's enterprise AI project.
 * Reads portfolio data, estimates ROI, builds structured report, and optionally enhances with LLM.
 * Never throws — returns minimal report if data is missing.
 */
export async function generateExecutiveDeliverable(
  enrollmentId: string,
  options: { useLLMEnhancement?: boolean } = {},
): Promise<ExecutiveDeliverableResult> {
  const { useLLMEnhancement = true } = options;

  // Load portfolio
  let portfolioResult;
  try {
    portfolioResult = await generatePortfolio(enrollmentId);
  } catch (err: any) {
    console.error('[ExecutiveDeliverable] Portfolio generation failed:', err.message);
    // Build minimal metadata from Project directly
    const project = await Project.findOne({ where: { enrollment_id: enrollmentId } });
    const minimalMetadata: ProjectMetadata = {
      organization_name: project?.organization_name || null,
      industry: project?.industry || null,
      primary_business_problem: project?.primary_business_problem || null,
      selected_use_case: project?.selected_use_case || null,
      automation_goal: project?.automation_goal || null,
      data_sources: project?.data_sources || null,
      project_stage: project?.project_stage || 'discovery',
      project_variables: project?.project_variables || {},
    };

    const emptyPortfolio: PortfolioStructure = {
      project_metadata: minimalMetadata,
      strategy: [],
      governance: [],
      architecture: [],
      implementation: [],
      total_artifacts: 0,
      average_score: null,
    };

    const roi = estimateROI(minimalMetadata, emptyPortfolio);
    const report = buildExecutiveReportTemplate(minimalMetadata, emptyPortfolio, roi);

    return {
      executive_report_markdown: report,
      portfolio_reference: {
        total_artifacts: 0,
        average_score: null,
        categories: { strategy: 0, governance: 0, architecture: 0, implementation: 0 },
      },
      project_metadata: minimalMetadata,
      roi_forecast: roi,
      generated_at: new Date().toISOString(),
    };
  }

  const { portfolio_structure: portfolio } = portfolioResult;
  const metadata = portfolio.project_metadata;

  // Estimate ROI
  const roi = estimateROI(metadata, portfolio);

  // Build template report
  let report = buildExecutiveReportTemplate(metadata, portfolio, roi);

  // Optionally enhance with LLM
  if (useLLMEnhancement && portfolio.total_artifacts > 0) {
    try {
      report = await enhanceWithLLM(report, metadata, portfolio);
    } catch (err: any) {
      console.error('[ExecutiveDeliverable] LLM enhancement failed, using template:', err.message);
    }
  }

  // Store executive summary on project
  try {
    const project = await Project.findOne({ where: { enrollment_id: enrollmentId } });
    if (project) {
      await project.update({ executive_summary: report });
    }
  } catch { /* non-critical */ }

  return {
    executive_report_markdown: report,
    portfolio_reference: {
      total_artifacts: portfolio.total_artifacts,
      average_score: portfolio.average_score,
      categories: {
        strategy: portfolio.strategy.length,
        governance: portfolio.governance.length,
        architecture: portfolio.architecture.length,
        implementation: portfolio.implementation.length,
      },
    },
    project_metadata: metadata,
    roi_forecast: roi,
    generated_at: new Date().toISOString(),
  };
}
